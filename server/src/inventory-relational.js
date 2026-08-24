import { createHash, randomUUID } from "node:crypto";

const decimal = (value) => Number(value || 0);
const slug = (value) => String(value || "ITEM").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const json = (value) => JSON.stringify(value ?? {});

const unitCatalog = {
  kg: { code: "KG", name: "Kilogramo", symbol: "kg", dimension: "MASS", decimalPlaces: 3 },
  g: { code: "G", name: "Gramo", symbol: "g", dimension: "MASS", decimalPlaces: 3 },
  l: { code: "L", name: "Litro", symbol: "l", dimension: "VOLUME", decimalPlaces: 3 },
  ml: { code: "ML", name: "Mililitro", symbol: "ml", dimension: "VOLUME", decimalPlaces: 3 },
  unidad: { code: "UNIT", name: "Unidad", symbol: "un", dimension: "COUNT", decimalPlaces: 0 },
  unidades: { code: "UNIT", name: "Unidad", symbol: "un", dimension: "COUNT", decimalPlaces: 0 },
  un: { code: "UNIT", name: "Unidad", symbol: "un", dimension: "COUNT", decimalPlaces: 0 }
};

function unitDefinition(value) {
  const key = String(value || "unidad").trim().toLowerCase();
  return unitCatalog[key] || { code: slug(key), name: String(value || "Unidad"), symbol: String(value || "un"), dimension: "OTHER", decimalPlaces: 3 };
}

async function one(client, text, params = []) {
  const result = await client.query(text, params);
  return result.rows[0];
}

async function ensureUnit(client, value) {
  const unit = unitDefinition(value);
  return one(client, `
    INSERT INTO inventory_units(code, name, symbol, dimension, decimal_places)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol
    RETURNING id, code, name, dimension
  `, [unit.code, unit.name, unit.symbol, unit.dimension, unit.decimalPlaces]);
}

async function ensureCategory(client, area) {
  const code = area === "BARTENDER" ? "BAR_INPUTS" : area === "RESTAURANTE" ? "KITCHEN_INPUTS" : "GENERAL_INPUTS";
  const name = area === "BARTENDER" ? "Insumos de bar" : area === "RESTAURANTE" ? "Insumos de cocina" : "Insumos generales";
  return one(client, `
    INSERT INTO inventory_categories(code, name) VALUES ($1, $2)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [code, name]);
}

async function ensureWarehouse(client, area) {
  const code = ["RESTAURANTE", "BARTENDER"].includes(area) ? area : "GENERAL";
  const name = code === "RESTAURANTE" ? "Almacén operativo de cocina" : code === "BARTENDER" ? "Almacén operativo de bar" : "Almacén general";
  const type = code === "GENERAL" ? "GENERAL" : "OPERATIONAL";
  return one(client, `
    INSERT INTO inventory_warehouses(code, name, warehouse_type, area_code)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, area_code = EXCLUDED.area_code
    RETURNING id, code
  `, [code, name, type, code === "GENERAL" ? null : code]);
}

async function upsertProduct(client, product) {
  const unit = await ensureUnit(client, product.baseUnit || product.unit);
  const category = await ensureCategory(client, product.area);
  const code = product.code || `LEGACY_PRODUCT_${product.id}`;
  const row = await one(client, `
    INSERT INTO inventory_products(legacy_id, code, name, category_id, base_unit_id, product_type, minimum_stock, average_cost, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    ON CONFLICT (legacy_id) DO UPDATE SET
      name = EXCLUDED.name, category_id = EXCLUDED.category_id, base_unit_id = EXCLUDED.base_unit_id,
      minimum_stock = EXCLUDED.minimum_stock, average_cost = EXCLUDED.average_cost,
      metadata = inventory_products.metadata || EXCLUDED.metadata, updated_at = NOW()
    RETURNING id, base_unit_id
  `, [product.id, code, product.name, category.id, unit.id, product.area === "BARTENDER" ? "BEVERAGE" : "RAW_MATERIAL", decimal(product.minStock), decimal(product.cost), json({ legacyArea: product.area, legacyUnit: product.unit, imageUrl: product.imageUrl })]);
  await client.query(`
    INSERT INTO inventory_presentations(product_id, unit_id, code, name, conversion_factor, is_default)
    VALUES ($1, $2, 'BASE', $3, 1, TRUE)
    ON CONFLICT (product_id, code) DO UPDATE SET unit_id = EXCLUDED.unit_id, name = EXCLUDED.name, conversion_factor = 1
  `, [row.id, unit.id, unit.name]);
  const warehouse = await ensureWarehouse(client, product.area);
  return { ...row, warehouseId: warehouse.id, unitId: unit.id };
}

async function postMovement(client, movement) {
  return one(client, `SELECT post_inventory_movement(
    $1, $2, $3, $4::numeric, $5, $6, $7, $8::numeric, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
  ) AS id`, [
    movement.idempotencyKey, movement.type, movement.productId, movement.quantity,
    movement.fromWarehouseId || null, movement.toWarehouseId || null, movement.lotId || null,
    movement.unitCost || 0, movement.reason, movement.actorId || null, movement.sourceType || null,
    movement.sourceLegacyId || null, movement.sourceCode || null, movement.legacyId || null,
    movement.reversalOfId || null, Boolean(movement.allowNegative), json(movement.metadata)
  ]);
}

async function reconcileProduct(client, product, relational, options = {}) {
  await client.query(`
    INSERT INTO inventory_stock_balances(product_id, warehouse_id, lot_id)
    VALUES ($1, $2, NULL)
    ON CONFLICT (product_id, warehouse_id, lot_id) DO NOTHING
  `, [relational.id, relational.warehouseId]);
  const current = await one(client, `
    SELECT COALESCE(SUM(on_hand), 0)::text AS on_hand
    FROM inventory_stock_balances WHERE product_id = $1 AND warehouse_id = $2
  `, [relational.id, relational.warehouseId]);
  const delta = decimal(product.stock) - decimal(current.on_hand);
  if (Math.abs(delta) > 0.0000004) {
    const movement = options.legacyMovement;
    await postMovement(client, {
      idempotencyKey: movement?.id ? `legacy-movement:${movement.id}` : `${options.idempotencyPrefix || "legacy-reconcile"}:${product.id}`,
      legacyId: movement?.id || null,
      type: movement?.type || options.type || "LEGACY_RECONCILIATION",
      productId: relational.id,
      quantity: Math.abs(delta),
      fromWarehouseId: delta < 0 ? relational.warehouseId : null,
      toWarehouseId: delta > 0 ? relational.warehouseId : null,
      unitCost: product.cost,
      actorId: movement?.createdById || options.actorId,
      sourceType: movement ? "LEGACY_INVENTORY_MOVEMENT" : "LEGACY_APP_STATE",
      sourceLegacyId: movement?.id || product.id,
      sourceCode: movement?.reference || null,
      reason: movement?.reason || options.reason || "Conciliación segura con el estado existente",
      metadata: { beforeQty: movement?.beforeQty, afterQty: movement?.afterQty, mutationId: options.mutationId }
    });
  }
  await client.query(`
    UPDATE inventory_stock_balances SET reserved = LEAST($3::numeric, GREATEST(on_hand, 0)), updated_at = NOW()
    WHERE product_id = $1 AND warehouse_id = $2 AND lot_id IS NULL
  `, [relational.id, relational.warehouseId, Math.max(0, decimal(product.reserved))]);
}

async function importSuppliers(client, state) {
  const map = new Map();
  for (const supplier of state.proveedores || []) {
    const row = await one(client, `
      INSERT INTO inventory_suppliers(legacy_id, tax_id, name, contact_name, phone, email, status, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (legacy_id) DO UPDATE SET name = EXCLUDED.name, contact_name = EXCLUDED.contact_name,
        phone = EXCLUDED.phone, email = EXCLUDED.email, status = EXCLUDED.status
      RETURNING id
    `, [supplier.id, supplier.ruc || null, supplier.name, supplier.contact || null, supplier.phone || null, supplier.email || null, supplier.status === "ACTIVO" ? "ACTIVE" : "INACTIVE", json({ legacy: supplier })]);
    map.set(Number(supplier.id), row.id);
  }
  return map;
}

async function importPurchases(client, state, products, suppliers) {
  for (const purchase of state.compras || []) {
    if (purchase.relationalId) {
      const managed = await client.query("SELECT 1 FROM inventory_purchase_orders WHERE id=$1", [Number(purchase.relationalId)]);
      if (managed.rowCount) continue;
    }
    const status = purchase.status === "RECIBIDA" ? "RECEIVED" : purchase.status === "CANCELADA" ? "CANCELLED" : "APPROVED";
    const order = await one(client, `
      INSERT INTO inventory_purchase_orders(legacy_id, code, supplier_id, status, ordered_at, total, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (legacy_id) DO UPDATE SET supplier_id = EXCLUDED.supplier_id, status = EXCLUDED.status, total = EXCLUDED.total
      RETURNING id
    `, [purchase.id, purchase.code || `COMPRA-${purchase.id}`, suppliers.get(Number(purchase.supplierId)) || null, status, purchase.createdAt || null, decimal(purchase.total), json({ legacy: purchase })]);
    for (const line of purchase.items || []) {
      const product = products.get(Number(line.productId));
      if (!product) continue;
      await client.query(`
        INSERT INTO inventory_purchase_order_lines(purchase_order_id, product_id, ordered_quantity, unit_cost)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (purchase_order_id, product_id, presentation_id) DO NOTHING
      `, [order.id, product.id, decimal(line.quantity), decimal(line.cost)]);
    }
    if (status === "RECEIVED") {
      const warehouse = await ensureWarehouse(client, "GENERAL");
      let receipt = await one(client, `
        INSERT INTO inventory_goods_receipts(legacy_id, code, purchase_order_id, warehouse_id, status, received_at, metadata)
        VALUES ($1, $2, $3, $4, 'POSTED', $5, $6::jsonb)
        ON CONFLICT (legacy_id) DO NOTHING
        RETURNING id
      `, [purchase.id, `LEGACY-RECEIPT-${purchase.id}`, order.id, warehouse.id, purchase.receivedAt || purchase.createdAt || null, json({ migratedWithoutBalanceEffect: true })]);
      receipt ||= await one(client, "SELECT id FROM inventory_goods_receipts WHERE legacy_id=$1", [purchase.id]);
      const existingLines = await client.query("SELECT 1 FROM inventory_goods_receipt_lines WHERE goods_receipt_id = $1 LIMIT 1", [receipt.id]);
      if (!existingLines.rowCount) for (const line of purchase.items || []) {
        const product = products.get(Number(line.productId));
        if (product) await client.query(`
          INSERT INTO inventory_goods_receipt_lines(goods_receipt_id, product_id, received_quantity, accepted_quantity, unit_cost)
          VALUES ($1, $2, $3, $3, $4)
        `, [receipt.id, product.id, decimal(line.quantity), decimal(line.cost)]);
      }
    }
  }
}

async function importRecipes(client, state, products) {
  const yieldUnit = await ensureUnit(client, "unidad");
  for (const menu of state.menuItems || []) {
    const recipe = await one(client, `
      INSERT INTO inventory_recipes(legacy_menu_item_id, code, name, area_code, active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (legacy_menu_item_id) DO UPDATE SET name = EXCLUDED.name, area_code = EXCLUDED.area_code, active = EXCLUDED.active
      RETURNING id
    `, [menu.id, menu.code || `MENU-${menu.id}`, menu.name, menu.area, menu.active !== false]);
    let version = await one(client, `
      INSERT INTO inventory_recipe_versions(recipe_id, version, status, yield_quantity, yield_unit_id, sale_price, metadata)
      VALUES ($1, 1, 'DRAFT', 1, $2, $3, $4::jsonb)
      ON CONFLICT (recipe_id, version) DO NOTHING
      RETURNING id
    `, [recipe.id, yieldUnit.id, decimal(menu.price), json({ migratedFromLegacy: true, price: menu.price })]);
    const created = Boolean(version);
    version ||= await one(client, "SELECT id FROM inventory_recipe_versions WHERE recipe_id=$1 AND version=1", [recipe.id]);
    for (const ingredient of menu.recipe || []) {
      const product = products.get(Number(ingredient.inventoryId));
      if (!product) continue;
      await client.query(`
        INSERT INTO inventory_recipe_ingredients(recipe_version_id, product_id, quantity, unit_id, base_quantity, unit_cost_snapshot, line_cost)
        VALUES ($1, $2, $3, $4, $3, $5, ROUND($3::numeric * $5::numeric, 6))
        ON CONFLICT (recipe_version_id, product_id) DO NOTHING
      `, [version.id, product.id, decimal(ingredient.quantity), product.unitId, decimal(state.inventory.find((row) => Number(row.id) === Number(ingredient.inventoryId))?.cost)]);
    }
    if (created) {
      await client.query(`
        WITH costs AS (SELECT COALESCE(SUM(line_cost), 0) total FROM inventory_recipe_ingredients WHERE recipe_version_id=$1)
        UPDATE inventory_recipe_versions rv SET status='ACTIVE', activated_at=NOW(),
          total_cost=ROUND(costs.total,6), cost_per_portion=ROUND(costs.total/rv.yield_quantity,6),
          margin_amount=ROUND(rv.sale_price-costs.total/rv.yield_quantity,6),
          margin_percent=CASE WHEN rv.sale_price>0 THEN ROUND((rv.sale_price-costs.total/rv.yield_quantity)/rv.sale_price*100,4) ELSE 0 END,
          cost_percent=CASE WHEN rv.sale_price>0 THEN ROUND((costs.total/rv.yield_quantity)/rv.sale_price*100,4) ELSE 0 END
        FROM costs WHERE rv.id=$1
      `, [version.id]);
    }
  }
}

async function importRecipeSales(client, state) {
  const available = await client.query("SELECT to_regclass(current_schema()||'.inventory_recipe_sales') AS table_name");
  if (!available.rows[0].table_name) return;
  for (const order of state.orders || []) for (const item of order.items || []) {
    if (!item.menuItemId) continue;
    let version = item.recipeVersionId ? await one(client, "SELECT id,version,cost_per_portion FROM inventory_recipe_versions WHERE id=$1", [Number(item.recipeVersionId)]) : null;
    version ||= await one(client, `SELECT rv.id,rv.version,rv.cost_per_portion FROM inventory_recipes r JOIN inventory_recipe_versions rv ON rv.recipe_id=r.id WHERE r.legacy_menu_item_id=$1 ORDER BY CASE rv.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,rv.version DESC LIMIT 1`, [Number(item.menuItemId)]);
    if (!version) continue;
    const quantity = Math.max(0.000001, decimal(item.quantity));
    const unitCost = decimal(item.recipeUnitCost ?? version.cost_per_portion);
    const salePrice = decimal(item.price);
    const status = order.status === "ENTREGADO" ? "CONSUMED" : order.status === "CANCELADO" ? "CANCELLED" : "RESERVED";
    await client.query(`INSERT INTO inventory_recipe_sales(legacy_order_id,legacy_order_code,legacy_menu_item_id,recipe_version_id,quantity,recipe_unit_cost,total_recipe_cost,sale_unit_price,total_sale,margin_amount,cost_percent,status,consumed_at,cancelled_at,metadata,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::varchar,CASE WHEN $12::varchar='CONSUMED' THEN COALESCE($13::timestamptz,NOW()) END,CASE WHEN $12::varchar='CANCELLED' THEN COALESCE($13::timestamptz,NOW()) END,$14::jsonb,COALESCE($13::timestamptz,NOW()))
      ON CONFLICT(legacy_order_id,legacy_menu_item_id) DO NOTHING`, [order.id,order.code||null,item.menuItemId,version.id,quantity,unitCost,decimal(unitCost*quantity),salePrice,decimal(salePrice*quantity),decimal((salePrice-unitCost)*quantity),salePrice>0?decimal(unitCost/salePrice*100):0,status,order.createdAt||null,json({legacyBackfill:true,recipeVersion:version.version,costEstimated:item.recipeUnitCost==null})]);
  }
}

async function importLegacyMovementReferences(client, state, products) {
  for (const movement of state.inventoryMovements || []) {
    const product = products.get(Number(movement.productId));
    if (!product) continue;
    await client.query(`
      INSERT INTO inventory_movements(
        legacy_id, idempotency_key, movement_type, product_id, quantity, unit_cost, affects_balance,
        source_type, source_legacy_id, source_code, actor_legacy_user_id, operational_date, reason, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, 'LEGACY_HISTORY', $1, $7, $8,
        COALESCE($9::timestamptz::date, CURRENT_DATE), $10, $11::jsonb, COALESCE($9::timestamptz, NOW()))
      ON CONFLICT (legacy_id) DO NOTHING
    `, [movement.id, `legacy-history:${movement.id}`, movement.type || "LEGACY_REFERENCE", product.id, Math.max(0.000001, Math.abs(decimal(movement.quantity))), decimal(movement.product?.cost || movement.cost), movement.reference || null, movement.createdById || null, movement.createdAt || null, movement.reason || "Movimiento histórico importado", json({ beforeQty: movement.beforeQty, afterQty: movement.afterQty, original: movement })]);
  }
}

async function importProductionWasteAndClosings(client, state, products) {
  for (const production of state.productions || []) {
    const recipe = await one(client, "SELECT rv.id FROM inventory_recipes r JOIN inventory_recipe_versions rv ON rv.recipe_id = r.id AND rv.status = 'ACTIVE' WHERE r.legacy_menu_item_id = $1", [production.menuItemId]);
    const warehouse = await ensureWarehouse(client, production.area);
    await client.query(`
      INSERT INTO inventory_production_batches(legacy_id, code, recipe_version_id, warehouse_id, status, actual_yield, responsible_legacy_user_id, completed_at, metadata)
      VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7, $8::jsonb)
      ON CONFLICT (legacy_id) DO NOTHING
    `, [production.id, production.batch || `LEGACY-PRODUCTION-${production.id}`, recipe?.id || null, warehouse.id, decimal(production.portions), production.responsibleId || null, production.createdAt || null, json({ legacy: production, inputsPreservedInLegacyMovements: true })]);
  }
  for (const waste of state.wasteRecords || []) {
    const product = products.get(Number(waste.productId));
    if (!product) continue;
    await client.query(`
      INSERT INTO inventory_waste_records(legacy_id, product_id, warehouse_id, quantity, reason_code, detail, responsible_legacy_user_id, occurred_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9::jsonb)
      ON CONFLICT (legacy_id) DO NOTHING
    `, [waste.id, product.id, product.warehouseId, decimal(waste.quantity), waste.reason || "LEGACY", waste.detail || null, waste.responsibleId || null, waste.createdAt || null, json({ legacy: waste })]);
  }
  for (const closing of state.inventoryClosings || []) {
    const warehouse = await ensureWarehouse(client, closing.area);
    const shiftV2 = Boolean((await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='inventory_shift_sessions' AND column_name='area_code'")).rowCount);
    const session = shiftV2
      ? await one(client, `
        INSERT INTO inventory_shift_sessions(legacy_id, warehouse_id, area_code, operational_date, shift_code, responsible_legacy_user_id, status, period_started_at, submitted_at, closed_at, opening_source, metadata)
        VALUES ($1, $2, $3, $4, 'LEGACY_DAY', $5, 'CLOSED', COALESCE($6::timestamptz,$4::date), COALESCE($6::timestamptz,$4::date), $6, 'OPENING_COUNT', $7::jsonb)
        ON CONFLICT (legacy_id) DO UPDATE SET status='CLOSED',area_code=EXCLUDED.area_code
        RETURNING id
      `, [closing.id, warehouse.id, closing.area, closing.date, closing.responsibleId || null, closing.createdAt || null, json({ legacy: closing })])
      : await one(client, `
        INSERT INTO inventory_shift_sessions(legacy_id, warehouse_id, operational_date, shift_code, responsible_legacy_user_id, status, closed_at, metadata)
        VALUES ($1, $2, $3, 'LEGACY_DAY', $4, 'CLOSED', $5, $6::jsonb)
        ON CONFLICT (legacy_id) DO UPDATE SET status = 'CLOSED'
        RETURNING id
      `, [closing.id, warehouse.id, closing.date, closing.responsibleId || null, closing.createdAt || null, json({ legacy: closing })]);
    const count = await one(client, `
      INSERT INTO inventory_physical_counts(legacy_id, session_id, count_number, status, counted_by_legacy_user_id, counted_at, notes)
      VALUES ($1, $2, 1, 'ACCEPTED', $3, $4, $5)
      ON CONFLICT (legacy_id) DO UPDATE SET status = 'ACCEPTED'
      RETURNING id
    `, [closing.id, session.id, closing.responsibleId || null, closing.createdAt || null, closing.notes || null]);
    for (const line of closing.counts || []) {
      const product = products.get(Number(line.productId));
      if (product) await client.query(`
        INSERT INTO inventory_physical_count_lines(physical_count_id, product_id, expected_quantity, actual_quantity, unit_cost)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (physical_count_id, product_id, lot_id) DO NOTHING
      `, [count.id, product.id, decimal(line.expected), decimal(line.actual), decimal(line.varianceCost) && decimal(line.variance) ? Math.abs(decimal(line.varianceCost) / decimal(line.variance)) : decimal(state.inventory.find((item) => item.id === line.productId)?.cost)]);
    }
    await client.query(`
      INSERT INTO inventory_closings(legacy_id, session_id, physical_count_id, status, variance_cost, approved_by_legacy_user_id, approved_at, metadata)
      VALUES ($1, $2, $3, 'CLOSED', $4, $5, $6, $7::jsonb)
      ON CONFLICT (legacy_id) DO NOTHING
    `, [closing.id, session.id, count.id, decimal(closing.varianceCost), closing.responsibleId || null, closing.createdAt || null, json({ legacy: closing })]);
  }
}

async function buildRelationalCatalog(client, state) {
  await ensureWarehouse(client, "GENERAL");
  const products = new Map();
  for (const product of state.inventory || []) products.set(Number(product.id), await upsertProduct(client, product));
  const suppliers = await importSuppliers(client, state);
  await importRecipes(client, state, products);
  await importPurchases(client, state, products, suppliers);
  return products;
}

export async function migrateLegacyInventory(client, state) {
  const checksum = createHash("sha256").update(JSON.stringify({ inventory: state.inventory, recipes: state.menuItems, movements: state.inventoryMovements, purchases: state.compras })).digest("hex");
  const run = await one(client, `
    INSERT INTO inventory_migration_runs(source_name, source_checksum, status)
    VALUES ('app_state', $1, 'STARTED')
    ON CONFLICT (source_name, source_checksum) DO UPDATE SET status = inventory_migration_runs.status
    RETURNING id, status
  `, [checksum]);
  const products = await buildRelationalCatalog(client, state);
  for (const product of state.inventory || []) {
    await reconcileProduct(client, product, products.get(Number(product.id)), { idempotencyPrefix: `legacy-opening:${checksum}`, type: "LEGACY_OPENING_BALANCE", reason: "Saldo de apertura migrado desde app_state" });
  }
  await importLegacyMovementReferences(client, state, products);
  await importProductionWasteAndClosings(client, state, products);
  await importRecipeSales(client, state);
  const counts = await one(client, `SELECT
    (SELECT COUNT(*) FROM inventory_products) AS products,
    (SELECT COUNT(*) FROM inventory_recipes) AS recipes,
    (SELECT COUNT(*) FROM inventory_movements) AS movements,
    (SELECT COUNT(*) FROM inventory_stock_balances) AS balances`);
  await client.query("UPDATE inventory_migration_runs SET status = 'COMPLETED', summary = $2::jsonb, completed_at = NOW() WHERE id = $1", [run.id, json(counts)]);
  return counts;
}

export async function synchronizeLegacyInventory(client, beforeState, state, context = {}) {
  const tracked = ["inventory", "menuItems", "inventoryMovements", "proveedores", "compras", "productions", "wasteRecords", "inventoryClosings"];
  if (tracked.every((key) => JSON.stringify(beforeState[key] || []) === JSON.stringify(state[key] || []))) return;
  const products = await buildRelationalCatalog(client, state);
  const previousProducts = new Map((beforeState.inventory || []).map((item) => [Number(item.id), item]));
  const addedMovements = (state.inventoryMovements || []).filter((movement) => !(beforeState.inventoryMovements || []).some((old) => old.id === movement.id));
  for (const product of state.inventory || []) {
    const before = previousProducts.get(Number(product.id));
    const changed = !before || decimal(before.stock) !== decimal(product.stock) || decimal(before.reserved) !== decimal(product.reserved);
    if (!changed) continue;
    const legacyMovement = addedMovements.find((movement) => Number(movement.productId) === Number(product.id));
    await reconcileProduct(client, product, products.get(Number(product.id)), {
      idempotencyPrefix: `legacy-mutation:${context.mutationId || randomUUID()}`,
      mutationId: context.mutationId,
      actorId: context.actorId,
      legacyMovement,
      reason: "Movimiento generado por endpoint compatible"
    });
  }
  await importLegacyMovementReferences(client, state, products);
  await importProductionWasteAndClosings(client, state, products);
}

export async function relationalInventoryStatus(client) {
  return one(client, `SELECT
    (SELECT COUNT(*)::int FROM inventory_products) AS products,
    (SELECT COUNT(*)::int FROM inventory_warehouses) AS warehouses,
    (SELECT COUNT(*)::int FROM inventory_recipes) AS recipes,
    (SELECT COUNT(*)::int FROM inventory_movements) AS movements,
    (SELECT COUNT(*)::int FROM inventory_stock_balances) AS balances,
    COALESCE((SELECT SUM(on_hand * p.average_cost) FROM inventory_stock_balances b JOIN inventory_products p ON p.id = b.product_id), 0)::numeric AS stock_value,
    (SELECT MAX(applied_at) FROM schema_migrations) AS migrated_at`);
}
