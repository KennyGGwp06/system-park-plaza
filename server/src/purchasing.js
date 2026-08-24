import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const n = (value) => Number(value || 0);
const round6 = (value) => Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;

function fail(status, message, fieldErrors = {}) {
  const error = new Error(message);
  error.status = status;
  error.fieldErrors = fieldErrors;
  throw error;
}

async function transaction(work) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function audit(client, eventType, entityType, entityId, actorId, reason, beforeData = null, afterData = null, correlationId = null) {
  await client.query(`INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,before_data,after_data,correlation_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`, [eventType, entityType, entityId, actorId, reason, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, correlationId]);
}

async function lockState(client) {
  const row = await client.query("SELECT data FROM app_state WHERE id=1 FOR UPDATE");
  return row.rows[0].data;
}

async function saveState(client, state) {
  await client.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
}

function nextLegacyId(rows) {
  return Math.max(0, ...(rows || []).map((item) => n(item.id))) + 1;
}

export async function purchasingReferences() {
  const [suppliers, warehouses, products] = await Promise.all([
    db.query("SELECT id,legacy_id AS \"legacyId\",name,tax_id AS \"taxId\" FROM inventory_suppliers WHERE status='ACTIVE' ORDER BY name"),
    db.query("SELECT id,code,name,area_code AS \"areaCode\" FROM inventory_warehouses WHERE active ORDER BY name"),
    db.query(`SELECT p.id,p.legacy_id AS "legacyId",p.code,p.name,p.average_cost AS cost,p.track_lots AS "trackLots",p.track_expiry AS "trackExpiry",p.tolerance_percent AS "tolerancePercent",
      u.id AS "baseUnitId",u.code AS "baseUnitCode",u.name AS "baseUnitName",u.symbol AS "baseUnitSymbol",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'code',pr.code,'name',pr.name,'unitId',pr.unit_id,'unitSymbol',pu.symbol,'factor',pr.conversion_factor,'purchaseCost',pr.purchase_cost) ORDER BY pr.is_purchase_unit DESC,pr.name)
        FROM inventory_presentations pr JOIN inventory_units pu ON pu.id=pr.unit_id WHERE pr.product_id=p.id AND pr.active),'[]'::jsonb) AS presentations
      FROM inventory_products p JOIN inventory_units u ON u.id=p.base_unit_id WHERE p.status='ACTIVE' ORDER BY p.name`)
  ]);
  return { suppliers: suppliers.rows, warehouses: warehouses.rows, products: products.rows };
}

async function readOrders(client, orderId = null) {
  const params = orderId ? [Number(orderId)] : [];
  const orders = (await client.query(`SELECT po.id,po.legacy_id AS "legacyId",po.code,po.status,po.ordered_at AS "orderedAt",po.expected_at AS "expectedAt",po.total,po.currency,po.notes,po.created_at AS "createdAt",po.updated_at AS "updatedAt",
    jsonb_build_object('id',s.id,'name',s.name,'taxId',s.tax_id) AS supplier
    FROM inventory_purchase_orders po LEFT JOIN inventory_suppliers s ON s.id=po.supplier_id
    ${orderId ? "WHERE po.id=$1" : ""} ORDER BY po.created_at DESC`, params)).rows;
  if (!orders.length) return [];
  const ids = orders.map((item) => item.id);
  const lines = (await client.query(`SELECT pol.id,pol.purchase_order_id AS "orderId",pol.product_id AS "productId",pol.presentation_id AS "presentationId",pol.ordered_quantity AS "orderedQuantity",pol.presentation_factor AS "presentationFactor",pol.ordered_base_quantity AS "orderedBaseQuantity",pol.unit_cost AS "unitCost",pol.base_unit_cost AS "baseUnitCost",pol.observation,
      p.name AS "productName",p.track_lots AS "trackLots",p.track_expiry AS "trackExpiry",p.tolerance_percent AS "tolerancePercent",u.symbol AS "baseUnitSymbol",pr.name AS "presentationName",pu.symbol AS "presentationUnitSymbol",
      COALESCE(SUM(CASE WHEN gr.status='POSTED' THEN grl.received_presentation_quantity * CASE WHEN grl.actual_base_quantity>0 THEN grl.accepted_base_quantity/grl.actual_base_quantity ELSE 0 END ELSE 0 END),0) AS "acceptedPresentationQuantity"
    FROM inventory_purchase_order_lines pol JOIN inventory_products p ON p.id=pol.product_id JOIN inventory_units u ON u.id=p.base_unit_id
    LEFT JOIN inventory_presentations pr ON pr.id=pol.presentation_id LEFT JOIN inventory_units pu ON pu.id=pr.unit_id
    LEFT JOIN inventory_goods_receipt_lines grl ON grl.purchase_order_line_id=pol.id LEFT JOIN inventory_goods_receipts gr ON gr.id=grl.goods_receipt_id
    WHERE pol.purchase_order_id=ANY($1::bigint[]) GROUP BY pol.id,p.id,u.id,pr.id,pu.id ORDER BY pol.id`, [ids])).rows;
  const receipts = (await client.query(`SELECT gr.id,gr.purchase_order_id AS "orderId",gr.code,gr.status,gr.warehouse_id AS "warehouseId",w.name AS "warehouseName",gr.received_by_legacy_user_id AS "receivedBy",gr.verified_by_legacy_user_id AS "verifiedBy",gr.posted_by_legacy_user_id AS "postedBy",gr.received_at AS "receivedAt",gr.verified_at AS "verifiedAt",gr.posted_at AS "postedAt",gr.evidence_url AS "evidenceUrl",gr.observation,gr.created_at AS "createdAt"
    FROM inventory_goods_receipts gr JOIN inventory_warehouses w ON w.id=gr.warehouse_id WHERE gr.purchase_order_id=ANY($1::bigint[]) ORDER BY gr.created_at DESC`, [ids])).rows;
  const receiptIds = receipts.map((item) => item.id);
  const receiptLines = receiptIds.length ? (await client.query(`SELECT grl.id,grl.goods_receipt_id AS "receiptId",grl.purchase_order_line_id AS "orderLineId",grl.product_id AS "productId",p.name AS "productName",u.symbol AS "baseUnitSymbol",grl.presentation_id AS "presentationId",pr.name AS "presentationName",grl.received_presentation_quantity AS "receivedPresentationQuantity",grl.theoretical_base_quantity AS "theoreticalBaseQuantity",grl.actual_base_quantity AS "actualBaseQuantity",grl.accepted_base_quantity AS "acceptedBaseQuantity",grl.rejected_base_quantity AS "rejectedBaseQuantity",grl.difference_base_quantity AS "differenceBaseQuantity",grl.presentation_unit_cost AS "presentationUnitCost",grl.unit_cost AS "baseUnitCost",grl.measurement_mode AS "measurementMode",grl.individual_measurements AS "individualMeasurements",grl.decision,grl.lot_code AS "lotCode",grl.expires_on AS "expiresOn",grl.observation,m.id AS "movementId"
    FROM inventory_goods_receipt_lines grl JOIN inventory_products p ON p.id=grl.product_id JOIN inventory_units u ON u.id=p.base_unit_id LEFT JOIN inventory_presentations pr ON pr.id=grl.presentation_id
    LEFT JOIN inventory_movements m ON m.source_type='GOODS_RECEIPT_LINE' AND m.source_legacy_id=grl.id
    WHERE grl.goods_receipt_id=ANY($1::bigint[]) ORDER BY grl.id`, [receiptIds])).rows : [];
  for (const receipt of receipts) receipt.lines = receiptLines.filter((line) => n(line.receiptId) === n(receipt.id));
  for (const order of orders) {
    order.lines = lines.filter((line) => n(line.orderId) === n(order.id)).map((line) => ({ ...line, remainingQuantity: Math.max(0, round6(n(line.orderedQuantity) - n(line.acceptedPresentationQuantity))) }));
    order.receipts = receipts.filter((receipt) => n(receipt.orderId) === n(order.id));
  }
  return orders;
}

export async function listPurchaseOrders() {
  return readOrders(db);
}

export async function getPurchaseOrder(id) {
  const rows = await readOrders(db, id);
  if (!rows.length) fail(404, "Orden de compra no encontrada");
  return rows[0];
}

export async function createPurchaseOrder(payload, actorId) {
  const errors = {};
  if (!payload.supplierId) errors.supplierId = "Selecciona el proveedor.";
  if (!(payload.lines || []).length) errors.lines = "Agrega al menos un producto.";
  if (Object.keys(errors).length) fail(400, "Revisa los datos de la compra", errors);
  const orderId = await transaction(async (client) => {
    const supplier = (await client.query("SELECT * FROM inventory_suppliers WHERE id=$1 AND status='ACTIVE'", [Number(payload.supplierId)])).rows[0];
    if (!supplier) fail(400, "Proveedor no válido", { supplierId: "Selecciona un proveedor activo." });
    const prepared = [];
    for (const [index, input] of payload.lines.entries()) {
      const quantity = n(input.orderedQuantity);
      const unitCost = n(input.unitCost);
      const row = (await client.query(`SELECT p.id AS product_id,p.name,p.status,pr.id AS presentation_id,pr.conversion_factor
        FROM inventory_products p LEFT JOIN inventory_presentations pr ON pr.id=$2 AND pr.product_id=p.id AND pr.active
        WHERE p.id=$1`, [Number(input.productId), input.presentationId ? Number(input.presentationId) : null])).rows[0];
      if (!row || row.status !== "ACTIVE") fail(400, `Producto no válido en la línea ${index + 1}`);
      if (input.presentationId && !row.presentation_id) fail(400, `La presentación de ${row.name} no es válida`);
      if (quantity <= 0 || unitCost < 0) fail(400, `Cantidad o costo no válido en ${row.name}`);
      const factor = n(row.conversion_factor) || 1;
      prepared.push({ input, row, quantity, unitCost, factor, orderedBase: round6(quantity * factor), baseCost: round6(unitCost / factor) });
    }
    const code = `OC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const total = prepared.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const state = await lockState(client);
    const legacyId = nextLegacyId(state.compras);
    const inserted = (await client.query(`INSERT INTO inventory_purchase_orders(legacy_id,code,supplier_id,status,ordered_at,expected_at,total,notes,currency,requested_by_legacy_user_id,metadata)
      VALUES($1,$2,$3,'APPROVED',NOW(),$4,$5,$6,'PEN',$7,$8::jsonb) RETURNING id`, [legacyId, code, supplier.id, payload.expectedAt || null, total, payload.notes || null, actorId, JSON.stringify({ source: "PURCHASING_V2" })])).rows[0];
    const legacyLines = [];
    for (const item of prepared) {
      const line = (await client.query(`INSERT INTO inventory_purchase_order_lines(purchase_order_id,product_id,presentation_id,ordered_quantity,unit_cost,presentation_factor,ordered_base_quantity,base_unit_cost,observation)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [inserted.id, item.row.product_id, item.row.presentation_id, item.quantity, item.unitCost, item.factor, item.orderedBase, item.baseCost, item.input.observation || null])).rows[0];
      legacyLines.push({ id: Number(line.id), productId: Number(item.row.product_id), relationalProductId: Number(item.row.product_id), presentationId: item.row.presentation_id ? Number(item.row.presentation_id) : null, quantity: item.quantity, orderedQuantity: item.quantity, cost: item.unitCost, theoreticalBaseQuantity: item.orderedBase });
    }
    state.compras.push({ id: legacyId, relationalId: Number(inserted.id), code, supplierId: Number(supplier.legacy_id || supplier.id), relationalSupplierId: Number(supplier.id), items: legacyLines, total: round6(total), status: "PENDIENTE_RECEPCION", expectedAt: payload.expectedAt || null, notes: payload.notes || "", createdAt: new Date().toISOString() });
    state.audit.unshift({ id: ++state.counters.audit, module: "COMPRAS", action: "CREAR_ORDEN", detail: code, userId: actorId, createdAt: new Date().toISOString() });
    await saveState(client, state);
    await audit(client, "CREATE", "PURCHASE_ORDER", inserted.id, actorId, "Orden creada y pendiente de recepción", null, { code, total });
    return inserted.id;
  });
  return getPurchaseOrder(orderId);
}

function measurements(input, theoretical) {
  const mode = input.measurementMode || "DIRECT";
  if (!['DIRECT', 'TOTAL', 'INDIVIDUAL'].includes(mode)) fail(400, "Modo de medición no válido");
  if (mode === "INDIVIDUAL") {
    const values = (input.individualMeasurements || []).map(Number);
    if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0)) fail(400, "Registra todos los pesos o volúmenes individuales mayores a cero");
    return { mode, values, actual: round6(values.reduce((sum, value) => sum + value, 0)) };
  }
  if (mode === "TOTAL") {
    const actual = n(input.actualBaseQuantity);
    if (actual <= 0) fail(400, "Ingresa el peso o volumen total real");
    return { mode, values: [], actual };
  }
  return { mode, values: [], actual: theoretical };
}

export async function createGoodsReceipt(orderId, payload, actorId) {
  if (!(payload.lines || []).length) fail(400, "Agrega al menos un producto recibido", { lines: "La recepción está vacía." });
  const receiptId = await transaction(async (client) => {
    const order = (await client.query("SELECT * FROM inventory_purchase_orders WHERE id=$1 FOR UPDATE", [Number(orderId)])).rows[0];
    if (!order) fail(404, "Orden de compra no encontrada");
    if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) fail(409, "La orden no admite nuevas recepciones");
    const warehouse = (await client.query("SELECT * FROM inventory_warehouses WHERE id=$1 AND active", [Number(payload.warehouseId)])).rows[0];
    if (!warehouse) fail(400, "Selecciona un almacén válido", { warehouseId: "Almacén no válido." });
    const code = `REC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const receipt = (await client.query(`INSERT INTO inventory_goods_receipts(code,purchase_order_id,warehouse_id,status,received_by_legacy_user_id,received_at,evidence_url,observation,metadata)
      VALUES($1,$2,$3,'DRAFT',$4,NOW(),$5,$6,$7::jsonb) RETURNING id`, [code, order.id, warehouse.id, actorId, payload.evidenceUrl || null, payload.observation || null, JSON.stringify({ source: "PHYSICAL_RECEIVING_V2" })])).rows[0];
    for (const [index, input] of payload.lines.entries()) {
      const orderLine = (await client.query(`SELECT pol.*,p.name,p.track_lots,p.track_expiry,p.tolerance_percent,p.habitual_supplier_id,u.symbol AS base_symbol
        FROM inventory_purchase_order_lines pol JOIN inventory_products p ON p.id=pol.product_id JOIN inventory_units u ON u.id=p.base_unit_id
        WHERE pol.id=$1 AND pol.purchase_order_id=$2`, [Number(input.orderLineId), order.id])).rows[0];
      if (!orderLine) fail(400, `Línea de compra no válida en la recepción ${index + 1}`);
      const receivedPresentation = n(input.receivedPresentationQuantity);
      if (receivedPresentation <= 0) fail(400, `La cantidad recibida de ${orderLine.name} debe ser mayor a cero`);
      const prior = n((await client.query(`SELECT COALESCE(SUM(grl.received_presentation_quantity * CASE WHEN grl.actual_base_quantity>0 THEN grl.accepted_base_quantity/grl.actual_base_quantity ELSE 0 END),0) AS quantity
        FROM inventory_goods_receipt_lines grl JOIN inventory_goods_receipts gr ON gr.id=grl.goods_receipt_id
        WHERE grl.purchase_order_line_id=$1 AND gr.status IN ('DRAFT','VERIFIED','POSTED')`, [orderLine.id])).rows[0].quantity);
      if (prior + receivedPresentation > n(orderLine.ordered_quantity) + 0.000001) fail(409, `La recepción de ${orderLine.name} supera lo pendiente (${round6(n(orderLine.ordered_quantity) - prior)})`);
      const theoretical = round6(receivedPresentation * n(orderLine.presentation_factor));
      const measured = measurements(input, theoretical);
      if (measured.mode === "INDIVIDUAL" && Number.isInteger(receivedPresentation) && measured.values.length !== receivedPresentation) fail(400, `${orderLine.name}: se esperan ${receivedPresentation} mediciones individuales y se recibieron ${measured.values.length}`);
      const decision = input.decision || "ACCEPTED";
      if (!['ACCEPTED', 'PARTIAL', 'REJECTED'].includes(decision)) fail(400, "Decisión de recepción no válida");
      const accepted = decision === "REJECTED" ? 0 : decision === "PARTIAL" ? n(input.acceptedBaseQuantity) : measured.actual;
      if (accepted < 0 || accepted > measured.actual) fail(400, `${orderLine.name}: cantidad aceptada no válida`);
      const rejected = round6(measured.actual - accepted);
      if (accepted > 0 && orderLine.track_lots && !String(input.lotCode || "").trim()) fail(400, `${orderLine.name} requiere lote`, { lotCode: "Ingresa el lote del producto aceptado." });
      if (accepted > 0 && orderLine.track_expiry && !input.expiresOn) fail(400, `${orderLine.name} requiere vencimiento`, { expiresOn: "Ingresa el vencimiento del lote." });
      let lotId = null;
      if (accepted > 0 && String(input.lotCode || "").trim()) {
        lotId = (await client.query(`INSERT INTO inventory_lots(product_id,supplier_id,lot_code,expires_on,unit_cost,status)
          VALUES($1,$2,$3,$4,$5,'QUARANTINE') ON CONFLICT(product_id,lot_code) DO UPDATE SET expires_on=COALESCE(EXCLUDED.expires_on,inventory_lots.expires_on) RETURNING id`, [orderLine.product_id, order.supplier_id || orderLine.habitual_supplier_id, input.lotCode.trim(), input.expiresOn || null, orderLine.base_unit_cost])).rows[0].id;
      }
      await client.query(`INSERT INTO inventory_goods_receipt_lines(goods_receipt_id,purchase_order_line_id,product_id,presentation_id,lot_id,received_quantity,accepted_quantity,rejected_quantity,unit_cost,received_presentation_quantity,theoretical_base_quantity,actual_base_quantity,accepted_base_quantity,rejected_base_quantity,difference_base_quantity,presentation_unit_cost,measurement_mode,individual_measurements,decision,lot_code,expires_on,observation)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$6,$7,$8,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)`, [receipt.id, orderLine.id, orderLine.product_id, orderLine.presentation_id, lotId, measured.actual, accepted, rejected, orderLine.base_unit_cost, receivedPresentation, theoretical, round6(measured.actual - theoretical), orderLine.unit_cost, measured.mode, JSON.stringify(measured.values), decision, input.lotCode || null, input.expiresOn || null, input.observation || null]);
    }
    await audit(client, "CREATE", "GOODS_RECEIPT", receipt.id, actorId, "Recepción física guardada en borrador", null, { code, orderId: order.id }, code);
    return receipt.id;
  });
  return getGoodsReceipt(receiptId);
}

export async function getGoodsReceipt(id) {
  const result = await db.query("SELECT purchase_order_id FROM inventory_goods_receipts WHERE id=$1", [Number(id)]);
  if (!result.rowCount) fail(404, "Recepción no encontrada");
  const order = await getPurchaseOrder(result.rows[0].purchase_order_id);
  return order.receipts.find((item) => n(item.id) === n(id));
}

export async function verifyGoodsReceipt(id, payload, actorId) {
  await transaction(async (client) => {
    const receipt = (await client.query("SELECT * FROM inventory_goods_receipts WHERE id=$1 FOR UPDATE", [Number(id)])).rows[0];
    if (!receipt) fail(404, "Recepción no encontrada");
    if (receipt.status !== "DRAFT") fail(409, "Solo una recepción en borrador puede verificarse");
    const count = n((await client.query("SELECT COUNT(*) FROM inventory_goods_receipt_lines WHERE goods_receipt_id=$1", [receipt.id])).rows[0].count);
    if (!count) fail(409, "La recepción no tiene líneas para verificar");
    await client.query("UPDATE inventory_goods_receipts SET status='VERIFIED',verified_by_legacy_user_id=$2,verified_at=NOW(),observation=COALESCE($3,observation),updated_at=NOW() WHERE id=$1", [receipt.id, actorId, payload?.observation || null]);
    await audit(client, "VERIFY", "GOODS_RECEIPT", receipt.id, actorId, "Recepción física verificada", { status: receipt.status }, { status: "VERIFIED" }, receipt.code);
  });
  return getGoodsReceipt(id);
}

export async function postGoodsReceipt(id, actorId) {
  const orderId = await transaction(async (client) => {
    const receipt = (await client.query("SELECT * FROM inventory_goods_receipts WHERE id=$1 FOR UPDATE", [Number(id)])).rows[0];
    if (!receipt) fail(404, "Recepción no encontrada");
    if (receipt.status === "POSTED") return receipt.purchase_order_id;
    if (receipt.status !== "VERIFIED") fail(409, "La recepción debe verificarse antes de ingresar al almacén");
    const order = (await client.query("SELECT * FROM inventory_purchase_orders WHERE id=$1 FOR UPDATE", [receipt.purchase_order_id])).rows[0];
    const lines = (await client.query(`SELECT grl.*,p.legacy_id,p.average_cost,p.name FROM inventory_goods_receipt_lines grl JOIN inventory_products p ON p.id=grl.product_id WHERE grl.goods_receipt_id=$1 ORDER BY grl.id`, [receipt.id])).rows;
    const state = await lockState(client);
    for (const line of lines) {
      const quantity = n(line.accepted_base_quantity);
      if (quantity <= 0) continue;
      const currentProduct = (await client.query("SELECT id,average_cost FROM inventory_products WHERE id=$1 FOR UPDATE", [line.product_id])).rows[0];
      await client.query("SELECT id FROM inventory_stock_balances WHERE product_id=$1 FOR UPDATE", [line.product_id]);
      const stock = n((await client.query("SELECT COALESCE(SUM(on_hand),0) AS stock FROM inventory_stock_balances WHERE product_id=$1", [line.product_id])).rows[0].stock);
      const previousCost = n(currentProduct.average_cost);
      const baseCost = n(line.unit_cost);
      const weightedCost = round6((stock * previousCost + quantity * baseCost) / (stock + quantity));
      const legacyProduct = (state.inventory || []).find((item) => n(item.id) === n(line.legacy_id));
      const relationalLegacyNext = n((await client.query("SELECT COALESCE(MAX(legacy_id),0)+1 AS id FROM inventory_movements")).rows[0].id);
      const legacyMovementId = Math.max(nextLegacyId(state.inventoryMovements), n(state.counters.movement) + 1, relationalLegacyNext);
      state.counters.movement = legacyMovementId;
      const movementId = (await client.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) AS id", [
        `goods-receipt-line:${line.id}`, "GOODS_RECEIPT", line.product_id, quantity, null, receipt.warehouse_id, line.lot_id, baseCost,
        `Recepción ${receipt.code}`, actorId, "GOODS_RECEIPT_LINE", line.id, receipt.code, legacyMovementId, null, false,
        JSON.stringify({ purchaseOrderId: Number(order.id), receiptId: Number(receipt.id), theoreticalBaseQuantity: n(line.theoretical_base_quantity), actualBaseQuantity: n(line.actual_base_quantity), differenceBaseQuantity: n(line.difference_base_quantity) })
      ])).rows[0].id;
      await client.query("UPDATE inventory_products SET average_cost=$2,updated_at=NOW() WHERE id=$1", [line.product_id, weightedCost]);
      if (line.lot_id) await client.query("UPDATE inventory_lots SET status='AVAILABLE',unit_cost=$2 WHERE id=$1", [line.lot_id, baseCost]);
      await client.query(`INSERT INTO inventory_product_cost_history(product_id,previous_cost,new_cost,valuation_method,received_quantity,receipt_unit_cost,source_type,source_id,actor_legacy_user_id,reason)
        VALUES($1,$2,$3,'WEIGHTED_AVERAGE',$4,$5,'GOODS_RECEIPT_LINE',$6,$7,$8)`, [line.product_id, previousCost, weightedCost, quantity, baseCost, line.id, actorId, `Recepción ${receipt.code}`]);
      if (legacyProduct) {
        const beforeQty = n(legacyProduct.stock);
        legacyProduct.stock = round6(beforeQty + quantity);
        legacyProduct.cost = weightedCost;
        state.inventoryMovements.unshift({ id: legacyMovementId, relationalMovementId: Number(movementId), productId: legacyProduct.id, product: { ...legacyProduct }, type: "ENTRADA_COMPRA", quantity, beforeQty, afterQty: legacyProduct.stock, cost: baseCost, reason: `Recepción ${receipt.code}`, reference: order.code, createdById: actorId, createdAt: new Date().toISOString() });
      }
    }
    await client.query("UPDATE inventory_goods_receipts SET status='POSTED',posted_by_legacy_user_id=$2,posted_at=NOW(),updated_at=NOW() WHERE id=$1", [receipt.id, actorId]);
    const progress = (await client.query(`SELECT pol.id,pol.ordered_quantity,COALESCE(SUM(CASE WHEN gr.status='POSTED' THEN grl.received_presentation_quantity * CASE WHEN grl.actual_base_quantity>0 THEN grl.accepted_base_quantity/grl.actual_base_quantity ELSE 0 END ELSE 0 END),0) accepted
      FROM inventory_purchase_order_lines pol LEFT JOIN inventory_goods_receipt_lines grl ON grl.purchase_order_line_id=pol.id LEFT JOIN inventory_goods_receipts gr ON gr.id=grl.goods_receipt_id
      WHERE pol.purchase_order_id=$1 GROUP BY pol.id`, [order.id])).rows;
    const hasAccepted = progress.some((item) => n(item.accepted) > 0);
    const completed = progress.every((item) => n(item.accepted) + 0.000001 >= n(item.ordered_quantity));
    const orderStatus = completed ? "RECEIVED" : hasAccepted ? "PARTIALLY_RECEIVED" : "APPROVED";
    await client.query("UPDATE inventory_purchase_orders SET status=$2,updated_at=NOW() WHERE id=$1", [order.id, orderStatus]);
    const legacyOrder = (state.compras || []).find((item) => n(item.id) === n(order.legacy_id));
    if (legacyOrder) {
      legacyOrder.status = orderStatus === "RECEIVED" ? "RECIBIDA" : orderStatus === "PARTIALLY_RECEIVED" ? "RECEPCION_PARCIAL" : "PENDIENTE_RECEPCION";
      legacyOrder.receivedAt = new Date().toISOString();
      legacyOrder.receiptCode = receipt.code;
    }
    state.audit.unshift({ id: ++state.counters.audit, module: "COMPRAS", action: "CONTABILIZAR_RECEPCION", detail: receipt.code, userId: actorId, createdAt: new Date().toISOString() });
    await saveState(client, state);
    await audit(client, "POST", "GOODS_RECEIPT", receipt.id, actorId, "Recepción ingresada a almacén, costo y kardex actualizados", { status: receipt.status }, { status: "POSTED", orderStatus }, receipt.code);
    return order.id;
  });
  return getPurchaseOrder(orderId);
}
