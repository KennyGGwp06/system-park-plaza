const n = (value) => Number(value || 0);
const r6 = (value) => Math.round((n(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
const TERMINAL = new Set(["ENTREGADO", "CANCELADO"]);
const LOSS_TYPES = new Set(["WASTE", "INTERNAL_CONSUMPTION", "LOSS"]);

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }

async function warehouseFor(client, area) {
  const row = (await client.query("SELECT * FROM inventory_warehouses WHERE code=$1 AND active", [area])).rows[0];
  if (!row) fail(409, `No existe un almacén operativo para ${area}`);
  return row;
}

function authorize(user, order) {
  if (!user || user.role === "ADMINISTRADOR") return;
  if (user.role !== order.area) fail(403, `El rol ${user.role} no puede operar pedidos de ${order.area}`);
}

async function allocateFefo(client, warehouseId, productId, requested) {
  const rows = (await client.query(`SELECT b.product_id,b.warehouse_id,b.lot_id,b.on_hand,b.reserved,l.lot_code,l.expires_on,COALESCE(NULLIF(l.unit_cost,0),p.average_cost) unit_cost
    FROM inventory_stock_balances b JOIN inventory_lots l ON l.id=b.lot_id JOIN inventory_products p ON p.id=b.product_id
    WHERE b.warehouse_id=$1 AND b.product_id=$2 AND b.on_hand-b.reserved>0 AND l.status='AVAILABLE'
    ORDER BY l.expires_on NULLS LAST,l.created_at,b.id FOR UPDATE OF b`, [warehouseId, productId])).rows;
  let pending = r6(requested); const allocations = [];
  for (const row of rows) {
    const quantity = r6(Math.min(pending, n(row.on_hand) - n(row.reserved)));
    if (quantity > 0) { allocations.push({ ...row, quantity }); pending = r6(pending - quantity); }
    if (pending <= 0.000001) break;
  }
  if (pending > 0.000001) {
    const product = (await client.query("SELECT name FROM inventory_products WHERE id=$1", [productId])).rows[0];
    fail(409, `Stock disponible insuficiente en el área para ${product?.name || "un ingrediente"}. Faltan ${pending}`);
  }
  return allocations;
}

async function recipeSnapshot(client, item) {
  if (!item.menuItemId) fail(409, `El producto ${item.name || item.code || 'desconocido'} no tiene un ID de menú asignado`);
  const version = (await client.query(`SELECT rv.id,rv.version,rv.yield_quantity,rv.yield_unit_id,rv.cost_per_portion,r.area_code,r.legacy_menu_item_id,r.name
    FROM inventory_recipe_versions rv JOIN inventory_recipes r ON r.id=rv.recipe_id
    WHERE ${item.recipeVersionId ? "rv.id=$1" : "r.legacy_menu_item_id=$1 AND rv.status='ACTIVE' AND rv.valid_from<=NOW() AND (rv.valid_to IS NULL OR rv.valid_to>NOW())"}
    ORDER BY rv.version DESC LIMIT 1`, [n(item.recipeVersionId || item.menuItemId)])).rows[0];
  if (!version || n(version.legacy_menu_item_id) !== n(item.menuItemId)) fail(409, `El producto ${item.name || item.code} no tiene una versión de receta válida`);
  const ingredients = (await client.query(`SELECT ri.product_id,ri.base_quantity,ri.technical_waste_percent,p.name,p.legacy_id
    FROM inventory_recipe_ingredients ri JOIN inventory_products p ON p.id=ri.product_id
    WHERE ri.recipe_version_id=$1 ORDER BY ri.id`, [version.id])).rows;
  if (!ingredients.length) fail(409, `La receta vigente de ${item.name} no tiene ingredientes`);
  if (!n(version.yield_quantity) || !n(version.yield_unit_id) || ingredients.some((line) => n(line.base_quantity) <= 0)) fail(409, `La receta vigente de ${item.name} está incompleta y fue bloqueada`);
  return { version, ingredients };
}

async function syncLegacyProjection(client, state, productIds) {
  if (!productIds.size) return;
  const rows = (await client.query(`SELECT p.legacy_id,COALESCE(SUM(b.on_hand),0) stock,COALESCE(SUM(b.reserved),0) reserved
    FROM inventory_products p LEFT JOIN inventory_stock_balances b ON b.product_id=p.id
    WHERE p.id=ANY($1::bigint[]) GROUP BY p.id,p.legacy_id`, [[...productIds]])).rows;
  for (const row of rows) {
    if (!row.legacy_id) continue;
    const product = (state.inventory || []).find((item) => n(item.id) === n(row.legacy_id));
    if (product) { product.stock = r6(row.stock); product.reserved = r6(row.reserved); }
  }
}

async function postMovement(client, input) {
  return n((await client.query(`SELECT post_inventory_movement($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,NULL,NULL,FALSE,$13::jsonb) id`, [
    input.key, input.type, input.productId, input.quantity, input.warehouseId, input.lotId, input.cost,
    input.reason, input.actorId || null, "ORDER", input.orderId, input.orderCode, JSON.stringify(input.metadata || {})
  ])).rows[0].id);
}

async function insertRecipeSale(client, order, item, version) {
  const quantity = n(item.quantity), cost = n(item.recipeUnitCost ?? version.cost_per_portion), price = n(item.price);
  await client.query(`INSERT INTO inventory_recipe_sales(legacy_order_id,legacy_order_code,legacy_menu_item_id,recipe_version_id,quantity,recipe_unit_cost,total_recipe_cost,sale_unit_price,total_sale,margin_amount,cost_percent,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    ON CONFLICT(legacy_order_id,legacy_menu_item_id) DO NOTHING`, [order.id, order.code, item.menuItemId, version.id, quantity, cost, r6(cost * quantity), price, r6(price * quantity), r6((price - cost) * quantity), price > 0 ? r6(cost / price * 100) : 0, JSON.stringify({ recipeVersion: version.version, groupCode: order.groupCode, inventoryIntegrated: true })]);
}

export async function confirmOrdersInventory(client, state, orders, actorId = null) {
  const affected = new Set();
  for (const order of orders || []) {
    if (!order || !["RESTAURANTE", "BARTENDER"].includes(order.area)) continue;
    const eventKey = `order-confirm:${order.id}`;
    if ((await client.query("SELECT 1 FROM inventory_order_events WHERE idempotency_key=$1", [eventKey])).rowCount) continue;
    const warehouse = await warehouseFor(client, order.area);
    const grouped = new Map();
    for (const item of order.items || []) {
      const current = grouped.get(n(item.menuItemId)) || { ...item, quantity: 0 };
      current.quantity += n(item.quantity); grouped.set(n(item.menuItemId), current);
    }
    if (!grouped.size) fail(400, "El pedido no tiene líneas para reservar");
    for (const item of grouped.values()) {
      const { version, ingredients } = await recipeSnapshot(client, item);
      item.recipeVersionId = n(version.id); item.recipeVersion = n(version.version); item.recipeUnitCost = n(item.recipeUnitCost || version.cost_per_portion);
      const line = (await client.query(`INSERT INTO inventory_order_lines(legacy_order_id,legacy_order_code,group_code,area_code,legacy_menu_item_id,item_name,recipe_version_id,recipe_version,quantity,recipe_unit_cost,sale_unit_price,total_recipe_cost,total_sale)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(legacy_order_id,legacy_menu_item_id) DO UPDATE SET legacy_order_code=EXCLUDED.legacy_order_code
        RETURNING id`, [order.id, order.code || `ORD-${order.id}`, order.groupCode || null, order.area, item.menuItemId, item.name, version.id, version.version, item.quantity, n(item.recipeUnitCost ?? version.cost_per_portion), item.price, r6(n(item.recipeUnitCost ?? version.cost_per_portion) * n(item.quantity)), r6(n(item.price) * n(item.quantity))])).rows[0];
      for (const ingredient of ingredients) {
        const required = r6(n(ingredient.base_quantity) * (1 + n(ingredient.technical_waste_percent) / 100) * n(item.quantity) / n(version.yield_quantity));
        if (required <= 0) continue;
        for (const allocation of await allocateFefo(client, warehouse.id, ingredient.product_id, required)) {
          await client.query("UPDATE inventory_stock_balances SET reserved=reserved+$4,version=version+1,updated_at=NOW() WHERE product_id=$1 AND warehouse_id=$2 AND lot_id=$3", [ingredient.product_id, warehouse.id, allocation.lot_id, allocation.quantity]);
          await client.query(`INSERT INTO inventory_order_reservations(order_line_id,product_id,warehouse_id,lot_id,quantity,unit_cost_snapshot,metadata)
            VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(order_line_id,product_id,lot_id) DO NOTHING`, [line.id, ingredient.product_id, warehouse.id, allocation.lot_id, allocation.quantity, allocation.unit_cost, JSON.stringify({ lotCode: allocation.lot_code, recipeVersion: version.version })]);
          affected.add(n(ingredient.product_id));
        }
      }
      await insertRecipeSale(client, order, item, version);
    }
    await client.query(`INSERT INTO inventory_order_events(idempotency_key,legacy_order_id,legacy_order_code,group_code,area_code,from_status,to_status,event_type,actor_legacy_user_id,metadata)
      VALUES($1,$2,$3,$4,$5,NULL,'PENDIENTE','CONFIRM',$6,$7::jsonb)`, [eventKey, order.id, order.code || `ORD-${order.id}`, order.groupCode || null, order.area, actorId, JSON.stringify({ lines: grouped.size })]);
    order.inventoryStatus = "RESERVADO"; order.inventoryConfirmedAt ||= new Date().toISOString();
  }
  await syncLegacyProjection(client, state, affected);
}

async function reservationsForOrder(client, orderId) {
  return (await client.query(`SELECT r.*,l.legacy_order_code,l.group_code,l.area_code,l.legacy_menu_item_id,l.item_name
    FROM inventory_order_reservations r JOIN inventory_order_lines l ON l.id=r.order_line_id
    WHERE l.legacy_order_id=$1 ORDER BY r.id FOR UPDATE OF r`, [orderId])).rows;
}

async function activeOperationalShift(client, area) {
  return (await client.query(`SELECT id,shift_code,status,responsible_legacy_user_id FROM inventory_shift_sessions
    WHERE area_code=$1 AND status IN ('OPEN','OPERATING','REOPENED')
    ORDER BY opened_at DESC NULLS LAST,created_at DESC LIMIT 1`, [area])).rows[0] || null;
}

async function recordEvent(client, order, from, target, type, actorId, metadata = {}) {
  const key = `order-status:${order.id}:${from}:${target}`;
  await client.query(`INSERT INTO inventory_order_events(idempotency_key,legacy_order_id,legacy_order_code,group_code,area_code,from_status,to_status,event_type,actor_legacy_user_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(idempotency_key) DO NOTHING`, [key, order.id, order.code || `ORD-${order.id}`, order.groupCode || null, order.area, from, target, type, actorId || null, JSON.stringify(metadata)]);
}

async function releaseReservation(client, reservation) {
  await client.query(`UPDATE inventory_stock_balances SET reserved=GREATEST(0,reserved-$4),version=version+1,updated_at=NOW()
    WHERE product_id=$1 AND warehouse_id=$2 AND lot_id=$3`, [reservation.product_id, reservation.warehouse_id, reservation.lot_id, reservation.quantity]);
}

async function consumeReservation(client, order, reservation, user, eventName = "READY") {
  if (!["RESERVED", "COMMITTED"].includes(reservation.status)) return reservation.movement_id || null;
  await releaseReservation(client, reservation);
  const movement = await postMovement(client, {
    key: `order-consume:${reservation.id}`,
    type: "THEORETICAL_CONSUMPTION",
    productId: reservation.product_id,
    quantity: reservation.quantity,
    warehouseId: reservation.warehouse_id,
    lotId: reservation.lot_id,
    cost: reservation.unit_cost_snapshot,
    reason: `Consumo teórico al terminar preparación ${order.code}`,
    actorId: user?.id,
    orderId: order.id,
    orderCode: order.code,
    metadata: { orderReservationId: reservation.id, groupCode: order.groupCode, area: order.area, consumedAtEvent: eventName }
  });
  await client.query("UPDATE inventory_order_reservations SET status='CONSUMED',consumed_at=NOW(),movement_id=$2 WHERE id=$1", [reservation.id, movement]);
  return movement;
}

export async function transitionOrderInventory(client, state, orderId, target, user, payload = {}) {
  const order = (state.orders || []).find((item) => n(item.id) === n(orderId));
  if (!order) fail(404, "Pedido no encontrado");
  authorize(user, order);
  target = String(target || "").toUpperCase();
  if (order.status === target) return order;
  if (TERMINAL.has(order.status)) fail(409, `El pedido ya está ${order.status.toLowerCase()}`);
  await confirmOrdersInventory(client, state, [order], user?.id || null);
  const from = order.status;
  const allowed = order.area === "BARTENDER"
    ? { PENDIENTE: ["PREPARANDO", "CANCELADO"], PREPARANDO: ["LISTO", "CANCELADO"], LISTO: ["ENTREGADO", "CANCELADO"] }
    : { PENDIENTE: ["EN_COCINA", "CANCELADO"], EN_COCINA: ["PREPARANDO", "CANCELADO"], PREPARANDO: ["LISTO", "CANCELADO"], LISTO: ["ENTREGADO", "CANCELADO"] };
  if (!(allowed[from] || []).includes(target)) fail(409, `Cambio no permitido: ${from} → ${target}`);
  if (from === "PENDIENTE" && target !== "CANCELADO") {
    const shift = await activeOperationalShift(client, order.area);
    if (!shift) fail(409, `Abre el turno operativo de ${order.area === "BARTENDER" ? "Bar" : "Cocina"} antes de aceptar pedidos`);
    order.operationalShiftId = n(shift.id);
    order.operationalShiftCode = shift.shift_code;
    order.acceptedById = user?.id || null;
    order.acceptedAt = new Date().toISOString();
  }
  const reservations = await reservationsForOrder(client, order.id);
  if (!reservations.length) fail(409, "El pedido no tiene reservas de inventario");
  const affected = new Set(reservations.map((row) => n(row.product_id)));

  if (target === "PREPARANDO") {
    await client.query(`UPDATE inventory_order_reservations r SET status='COMMITTED',committed_at=NOW()
      FROM inventory_order_lines l WHERE l.id=r.order_line_id AND l.legacy_order_id=$1 AND r.status='RESERVED'`, [order.id]);
    await client.query("UPDATE inventory_order_lines SET status='COMMITTED',updated_at=NOW() WHERE legacy_order_id=$1 AND status='RESERVED'", [order.id]);
    await recordEvent(client, order, from, target, "COMMIT", user?.id, { committedReservations: reservations.length });
    order.inventoryStatus = "COMPROMETIDO";
    order.preparedById = user?.id || null; order.preparationStartedAt = new Date().toISOString();
  } else if (target === "LISTO") {
    await recordEvent(client, order, from, target, "READY", user?.id, {});
    order.readyById = user?.id || null; order.readyAt = new Date().toISOString();
  } else if (target === "ENTREGADO") {
    for (const reservation of reservations.filter((row) => ["RESERVED", "COMMITTED"].includes(row.status))) {
      await consumeReservation(client, order, reservation, user, "DELIVER");
    }
    await client.query("UPDATE inventory_order_lines SET status='CONSUMED',updated_at=NOW() WHERE legacy_order_id=$1 AND status IN ('RESERVED','COMMITTED')", [order.id]);
    const totals = (await client.query("SELECT COALESCE(SUM(total_sale),0) sale,COALESCE(SUM(total_recipe_cost),0) cost FROM inventory_order_lines WHERE legacy_order_id=$1", [order.id])).rows[0];
    await client.query(`INSERT INTO inventory_consolidated_sales(legacy_order_id,legacy_order_code,group_code,area_code,gross_total,theoretical_cost,margin_amount,delivered_by_legacy_user_id,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(legacy_order_id) DO NOTHING`, [order.id, order.code, order.groupCode || null, order.area, totals.sale, totals.cost, r6(n(totals.sale) - n(totals.cost)), user?.id || null, JSON.stringify({ roomId: order.roomId, clientId: order.clientId })]);
    await client.query("UPDATE inventory_recipe_sales SET status='CONSUMED',consumed_at=NOW() WHERE legacy_order_id=$1 AND status='RESERVED'", [order.id]);
    await recordEvent(client, order, from, target, "DELIVER", user?.id, { sale: n(totals.sale), theoreticalCost: n(totals.cost) });
    order.inventoryStatus = "CONSUMIDO"; order.saleConsolidated = true;
    order.deliveredById = user?.id || null; order.deliveredAt = new Date().toISOString();
  } else if (target === "CANCELADO") {
    const afterPreparation = ["PREPARANDO", "LISTO"].includes(from);
    if (afterPreparation) {
      const disposition = String(payload.lossType || "").toUpperCase(), reason = String(payload.reason || "").trim();
      if (!LOSS_TYPES.has(disposition)) fail(400, "Indica si lo preparado fue merma, consumo interno o pérdida");
      if (reason.length < 5) fail(400, "Explica el motivo de cancelación después de preparar");
      for (const reservation of reservations.filter((row) => ["RESERVED", "COMMITTED", "CONSUMED"].includes(row.status))) {
        let movement = reservation.movement_id;
        if (["RESERVED", "COMMITTED"].includes(reservation.status)) {
          await releaseReservation(client, reservation);
          movement = await postMovement(client, { key: `order-loss:${reservation.id}`, type: disposition === "INTERNAL_CONSUMPTION" ? "ORDER_INTERNAL_CONSUMPTION" : disposition === "WASTE" ? "ORDER_WASTE" : "ORDER_LOSS", productId: reservation.product_id, quantity: reservation.quantity, warehouseId: reservation.warehouse_id, lotId: reservation.lot_id, cost: reservation.unit_cost_snapshot, reason, actorId: user?.id, orderId: order.id, orderCode: order.code, metadata: { disposition, orderReservationId: reservation.id } });
        }
        await client.query(`INSERT INTO inventory_order_cancellation_losses(legacy_order_id,order_reservation_id,disposition,product_id,lot_id,quantity,unit_cost,reason,movement_id,actor_legacy_user_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(order_reservation_id) DO NOTHING`, [order.id, reservation.id, disposition, reservation.product_id, reservation.lot_id, reservation.quantity, reservation.unit_cost_snapshot, reason, movement, user?.id || null]);
        if (disposition !== "INTERNAL_CONSUMPTION") await client.query(`INSERT INTO inventory_waste_records(product_id,warehouse_id,lot_id,quantity,reason_code,detail,movement_id,responsible_legacy_user_id,metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [reservation.product_id, reservation.warehouse_id, reservation.lot_id, reservation.quantity, disposition === "WASTE" ? "ORDER_CANCELLED_WASTE" : "ORDER_CANCELLED_LOSS", reason, movement, user?.id || null, JSON.stringify({ orderId: order.id, orderCode: order.code })]);
        if (["RESERVED", "COMMITTED"].includes(reservation.status)) await client.query("UPDATE inventory_order_reservations SET status='WASTED',consumed_at=NOW(),movement_id=$2,metadata=metadata||$3::jsonb WHERE id=$1", [reservation.id, movement, JSON.stringify({ disposition, reason })]);
      }
      await client.query("UPDATE inventory_order_lines SET status='WASTED',updated_at=NOW() WHERE legacy_order_id=$1 AND status IN ('RESERVED','COMMITTED')", [order.id]);
      await recordEvent(client, order, from, target, "CANCEL_LOSS", user?.id, { disposition, reason });
      order.inventoryStatus = "MERMA_REGISTRADA"; order.cancellationDisposition = disposition;
    } else {
      for (const reservation of reservations.filter((row) => row.status === "RESERVED")) {
        await releaseReservation(client, reservation);
        await client.query("UPDATE inventory_order_reservations SET status='RELEASED',released_at=NOW() WHERE id=$1", [reservation.id]);
      }
      await client.query("UPDATE inventory_order_lines SET status='RELEASED',updated_at=NOW() WHERE legacy_order_id=$1 AND status='RESERVED'", [order.id]);
      await recordEvent(client, order, from, target, "CANCEL_RELEASE", user?.id);
      order.inventoryStatus = "LIBERADO";
    }
    await client.query("UPDATE inventory_recipe_sales SET status='CANCELLED',cancelled_at=NOW() WHERE legacy_order_id=$1 AND status='RESERVED'", [order.id]);
  } else {
    await recordEvent(client, order, from, target, "NOOP", user?.id);
  }

  order.status = target; order.estimatedMinutes = n(payload.estimatedMinutes || order.estimatedMinutes); order.updatedAt = new Date().toISOString();
  order.inventoryHistory ||= []; order.inventoryHistory.push({ from, to: target, at: order.updatedAt, actorId: user?.id || null });
  await syncLegacyProjection(client, state, affected);
  return order;
}

export async function orderInventoryDetail(client, orderId) {
  const lines = (await client.query(`SELECT l.*,rv.version FROM inventory_order_lines l JOIN inventory_recipe_versions rv ON rv.id=l.recipe_version_id WHERE l.legacy_order_id=$1 ORDER BY l.id`, [n(orderId)])).rows;
  const reservations = (await client.query(`SELECT r.*,p.name product_name,bu.symbol base_unit_symbol,lot.lot_code,lot.expires_on,w.name warehouse_name
    FROM inventory_order_reservations r
    JOIN inventory_order_lines l ON l.id=r.order_line_id
    JOIN inventory_products p ON p.id=r.product_id
    JOIN inventory_units bu ON bu.id=p.base_unit_id
    JOIN inventory_lots lot ON lot.id=r.lot_id
    JOIN inventory_warehouses w ON w.id=r.warehouse_id
    WHERE l.legacy_order_id=$1 ORDER BY l.id,r.id`, [n(orderId)])).rows;
  const preparation = (await client.query(`SELECT l.id order_line_id,l.legacy_menu_item_id,l.item_name,l.quantity ordered_quantity,l.recipe_version,
      rv.yield_quantity,ri.product_id,p.name ingredient_name,ri.quantity recipe_quantity,u.symbol recipe_unit_symbol,
      ri.base_quantity,bu.symbol base_unit_symbol,ri.waste_tolerance_percent,ri.technical_waste_percent,
      ROUND((ri.base_quantity*(1+ri.technical_waste_percent/100)*l.quantity/rv.yield_quantity)::numeric,6) required_base_quantity,
      ri.consumption_mode
    FROM inventory_order_lines l
    JOIN inventory_recipe_versions rv ON rv.id=l.recipe_version_id
    JOIN inventory_recipe_ingredients ri ON ri.recipe_version_id=rv.id
    JOIN inventory_products p ON p.id=ri.product_id
    JOIN inventory_units u ON u.id=ri.unit_id
    JOIN inventory_units bu ON bu.id=p.base_unit_id
    WHERE l.legacy_order_id=$1 ORDER BY l.id,ri.id`, [n(orderId)])).rows;
  const events = (await client.query("SELECT * FROM inventory_order_events WHERE legacy_order_id=$1 ORDER BY created_at,id", [n(orderId)])).rows;
  const sale = (await client.query("SELECT * FROM inventory_consolidated_sales WHERE legacy_order_id=$1", [n(orderId)])).rows[0] || null;
  return { lines, preparation, reservations, events, sale };
}

export async function getOrderInventoryDetail(orderId) { return orderInventoryDetail(db, orderId); }
import { db } from "./db.js";
