import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const PRODUCT_TYPES = new Set(["RAW_MATERIAL", "PROCESSED", "INTERMEDIATE", "PORTION", "BEVERAGE", "SUPPLY", "FINISHED"]);
const PRODUCT_STATUSES = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const AREA_CODES = new Set(["GENERAL", "RESTAURANTE", "BARTENDER"]);
const number = (value) => Number(value || 0);
const slug = (value) => String(value || "PRODUCT").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

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
  } finally { client.release(); }
}

async function reference(client, table, id, label) {
  if (!id) return null;
  const result = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [Number(id)]);
  if (!result.rowCount) fail(400, `${label} no válido`);
  return result.rows[0];
}

function validateProductPayload(payload) {
  const errors = {};
  if (!String(payload.name || "").trim()) errors.name = "Ingresa el nombre del producto.";
  if (!payload.categoryId) errors.categoryId = "Selecciona una categoría.";
  if (!PRODUCT_TYPES.has(payload.type)) errors.type = "Selecciona un tipo válido.";
  if (!payload.baseUnitId) errors.baseUnitId = "Selecciona la unidad base.";
  if (!payload.purchaseUnitId) errors.purchaseUnitId = "Selecciona la unidad de compra.";
  if (!AREA_CODES.has(payload.defaultAreaCode)) errors.defaultAreaCode = "Selecciona un área válida.";
  if (!PRODUCT_STATUSES.has(payload.status || "ACTIVE")) errors.status = "Estado no válido.";
  if (number(payload.cost) < 0) errors.cost = "El costo no puede ser negativo.";
  if (number(payload.minimumStock) < 0) errors.minimumStock = "El stock mínimo no puede ser negativo.";
  if (payload.maximumStock !== "" && payload.maximumStock != null && number(payload.maximumStock) < number(payload.minimumStock)) errors.maximumStock = "Debe ser mayor o igual al stock mínimo.";
  if (number(payload.tolerancePercent) < 0 || number(payload.tolerancePercent) > 100) errors.tolerancePercent = "La tolerancia debe estar entre 0 y 100%.";
  if (payload.trackExpiry && !payload.trackLots) errors.trackExpiry = "El vencimiento requiere control por lote.";
  if (!(payload.presentations || []).length) errors.presentations = "Registra al menos una presentación comercial.";
  if ((payload.presentations || []).some((item) => !String(item.name || "").trim() || !item.unitId || number(item.conversionFactor) <= 0)) errors.presentations = "Cada presentación necesita nombre, unidad y factor mayor a cero.";
  if (Object.keys(errors).length) fail(400, "Revisa los datos del producto", errors);
}

async function validateConversions(client, payload, baseUnit) {
  const unitIds = [...new Set((payload.presentations || []).map((item) => Number(item.unitId)))];
  const units = unitIds.length ? (await client.query("SELECT id, code, dimension FROM inventory_units WHERE id = ANY($1::bigint[])", [unitIds])).rows : [];
  if (units.length !== unitIds.length) fail(400, "Una presentación utiliza una unidad inexistente", { presentations: "Selecciona unidades registradas." });
  for (const presentation of payload.presentations || []) {
    const unit = units.find((item) => Number(item.id) === Number(presentation.unitId));
    const massVolume = new Set([baseUnit.dimension, unit.dimension]);
    if (massVolume.has("MASS") && massVolume.has("VOLUME")) {
      const explicit = (payload.conversions || []).some((conversion) =>
        Number(conversion.fromUnitId) === Number(unit.id) && Number(conversion.toUnitId) === Number(baseUnit.id) && number(conversion.factor) > 0
      );
      if (!(number(payload.densityKgPerL) > 0) && !explicit) {
        fail(400, "No se puede convertir masa y volumen sin densidad o conversión específica", { presentations: `${unit.code} no es compatible con ${baseUnit.code} sin densidad.` });
      }
    }
  }
}

async function savePresentations(client, productId, baseUnitId, payload) {
  const suppliedCodes = [];
  await client.query(`
    INSERT INTO inventory_presentations(product_id, unit_id, code, name, conversion_factor, is_default, active)
    VALUES ($1, $2, 'BASE', 'Unidad base', 1, TRUE, TRUE)
    ON CONFLICT (product_id, code) DO UPDATE SET unit_id = EXCLUDED.unit_id, conversion_factor = 1, active = TRUE
  `, [productId, baseUnitId]);
  suppliedCodes.push("BASE");
  for (const [index, presentation] of (payload.presentations || []).entries()) {
    const code = slug(presentation.code || presentation.name || `PRESENTATION_${index + 1}`);
    suppliedCodes.push(code);
    await client.query(`
      INSERT INTO inventory_presentations(product_id, unit_id, code, name, conversion_factor, is_purchase_unit, is_default, barcode, supplier_id, purchase_cost, active)
      VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,$8,$9,TRUE)
      ON CONFLICT (product_id, code) DO UPDATE SET unit_id=EXCLUDED.unit_id, name=EXCLUDED.name,
        conversion_factor=EXCLUDED.conversion_factor, is_purchase_unit=EXCLUDED.is_purchase_unit,
        barcode=EXCLUDED.barcode, supplier_id=EXCLUDED.supplier_id, purchase_cost=EXCLUDED.purchase_cost, active=TRUE
    `, [productId, Number(presentation.unitId), code, presentation.name.trim(), number(presentation.conversionFactor), Boolean(presentation.isPurchaseUnit), presentation.barcode || null, presentation.supplierId || null, presentation.purchaseCost === "" ? null : number(presentation.purchaseCost)]);
  }
  await client.query("UPDATE inventory_presentations SET active = FALSE WHERE product_id = $1 AND NOT (code = ANY($2::varchar[]))", [productId, suppliedCodes]);
}

async function saveConversions(client, productId, payload) {
  for (const conversion of payload.conversions || []) {
    if (number(conversion.factor) <= 0) continue;
    await client.query(`
      INSERT INTO inventory_product_conversions(product_id, from_unit_id, to_unit_id, factor, reason)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (product_id, from_unit_id, to_unit_id) DO UPDATE SET factor=EXCLUDED.factor, reason=EXCLUDED.reason, active=TRUE
    `, [productId, Number(conversion.fromUnitId), Number(conversion.toUnitId), number(conversion.factor), conversion.reason || "Conversión específica del producto"]);
  }
}

async function addLegacyProjection(client, productId, payload, baseUnit, category) {
  const locked = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
  const state = locked.rows[0].data;
  const legacyId = Math.max(0, ...(state.inventory || []).map((item) => Number(item.id) || 0)) + 1;
  const legacy = {
    id: legacyId,
    relationalId: Number(productId),
    code: payload.code,
    name: payload.name.trim(),
    categoryId: Number(category.id),
    categoryName: category.name,
    type: payload.type,
    unit: baseUnit.symbol,
    baseUnit: baseUnit.symbol,
    purchaseUnitId: Number(payload.purchaseUnitId),
    stock: 0,
    reserved: 0,
    minStock: number(payload.minimumStock),
    maxStock: payload.maximumStock === "" || payload.maximumStock == null ? null : number(payload.maximumStock),
    cost: number(payload.cost),
    area: payload.defaultAreaCode,
    status: payload.status || "ACTIVE",
    active: (payload.status || "ACTIVE") === "ACTIVE",
    trackLots: Boolean(payload.trackLots),
    trackExpiry: Boolean(payload.trackExpiry),
    tolerancePercent: number(payload.tolerancePercent),
    createdAt: new Date().toISOString()
  };
  state.inventory.push(legacy);
  state.audit.unshift({ id: ++state.counters.audit, module: "INVENTARIO", action: "CREAR_PRODUCTO_MAESTRO", detail: legacy.name, userId: payload.actorId, createdAt: legacy.createdAt });
  await client.query("UPDATE app_state SET data=$1::jsonb, updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
  await client.query("UPDATE inventory_products SET legacy_id=$2 WHERE id=$1", [productId, legacyId]);
  return legacyId;
}

async function updateLegacyProjection(client, legacyId, payload, baseUnit, category, actorId, action = "EDITAR_PRODUCTO_MAESTRO") {
  if (!legacyId) return;
  const locked = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
  const state = locked.rows[0].data;
  const legacy = state.inventory.find((item) => Number(item.id) === Number(legacyId));
  if (!legacy) return;
  Object.assign(legacy, {
    name: payload.name.trim(), categoryId: Number(category.id), categoryName: category.name, type: payload.type,
    unit: baseUnit.symbol, baseUnit: baseUnit.symbol, purchaseUnitId: Number(payload.purchaseUnitId),
    minStock: number(payload.minimumStock), maxStock: payload.maximumStock === "" || payload.maximumStock == null ? null : number(payload.maximumStock),
    cost: number(payload.cost), area: payload.defaultAreaCode, status: payload.status || "ACTIVE",
    active: (payload.status || "ACTIVE") === "ACTIVE", trackLots: Boolean(payload.trackLots),
    trackExpiry: Boolean(payload.trackExpiry), tolerancePercent: number(payload.tolerancePercent), updatedAt: new Date().toISOString()
  });
  state.audit.unshift({ id: ++state.counters.audit, module: "INVENTARIO", action, detail: legacy.name, userId: actorId, createdAt: legacy.updatedAt });
  await client.query("UPDATE app_state SET data=$1::jsonb, updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
}

export async function catalogReferences() {
  const [categories, units, suppliers, warehouses] = await Promise.all([
    db.query("SELECT id, code, name FROM inventory_categories WHERE active ORDER BY name"),
    db.query("SELECT id, code, name, symbol, dimension, decimal_places AS \"decimalPlaces\" FROM inventory_units ORDER BY dimension, name"),
    db.query("SELECT id, legacy_id AS \"legacyId\", name, tax_id AS \"taxId\" FROM inventory_suppliers WHERE status='ACTIVE' ORDER BY name"),
    db.query("SELECT id, code, name, area_code AS \"areaCode\" FROM inventory_warehouses WHERE active ORDER BY name")
  ]);
  return { categories: categories.rows, units: units.rows, suppliers: suppliers.rows, warehouses: warehouses.rows,
    productTypes: [...PRODUCT_TYPES], statuses: [...PRODUCT_STATUSES], areas: [...AREA_CODES] };
}

export async function listCatalogProducts(filters = {}) {
  const params = [];
  const where = [];
  if (!filters.includeArchived) where.push("p.status <> 'ARCHIVED'");
  if (filters.status) { params.push(filters.status); where.push(`p.status = $${params.length}`); }
  if (filters.area) { params.push(filters.area); where.push(`p.default_area_code = $${params.length}`); }
  if (filters.search) { params.push(`%${filters.search.toLowerCase()}%`); where.push(`LOWER(p.name || ' ' || p.code) LIKE $${params.length}`); }
  const result = await db.query(`
    SELECT p.id, p.legacy_id AS "legacyId", p.code, p.name, p.product_type AS type,
      p.minimum_stock AS "minimumStock", p.maximum_stock AS "maximumStock", p.average_cost AS cost,
      p.default_area_code AS "defaultAreaCode", p.status, p.track_lots AS "trackLots", p.track_expiry AS "trackExpiry",
      p.tolerance_percent AS "tolerancePercent", p.density_kg_per_l AS "densityKgPerL", p.archived_at AS "archivedAt",
      p.metadata->>'imageUrl' AS "imageUrl",
      jsonb_build_object('id', c.id, 'name', c.name) AS category,
      jsonb_build_object('id', bu.id, 'code', bu.code, 'name', bu.name, 'symbol', bu.symbol, 'dimension', bu.dimension) AS "baseUnit",
      jsonb_build_object('id', pu.id, 'code', pu.code, 'name', pu.name, 'symbol', pu.symbol, 'dimension', pu.dimension) AS "purchaseUnit",
      CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.name) END AS supplier,
      COALESCE((SELECT SUM(b.on_hand) FROM inventory_stock_balances b WHERE b.product_id=p.id),0) AS stock,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ip.id,'code',ip.code,'name',ip.name,'unitId',ip.unit_id,'unitCode',u.code,'unitSymbol',u.symbol,'conversionFactor',ip.conversion_factor,'isPurchaseUnit',ip.is_purchase_unit,'barcode',ip.barcode,'purchaseCost',ip.purchase_cost) ORDER BY ip.is_default DESC, ip.name) FROM inventory_presentations ip JOIN inventory_units u ON u.id=ip.unit_id WHERE ip.product_id=p.id AND ip.active),'[]'::jsonb) AS presentations
    FROM inventory_products p
    JOIN inventory_categories c ON c.id=p.category_id
    JOIN inventory_units bu ON bu.id=p.base_unit_id
    LEFT JOIN inventory_units pu ON pu.id=p.purchase_unit_id
    LEFT JOIN inventory_suppliers s ON s.id=p.habitual_supplier_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.status='ARCHIVED', p.name
  `, params);
  return result.rows;
}

export async function getCatalogProduct(id) {
  const rows = await listCatalogProducts({ includeArchived: true });
  const product = rows.find((item) => Number(item.id) === Number(id));
  if (!product) fail(404, "Producto no encontrado");
  const [conversions, costs] = await Promise.all([
    db.query(`SELECT c.id, c.from_unit_id AS "fromUnitId", fu.code AS "fromUnitCode", c.to_unit_id AS "toUnitId", tu.code AS "toUnitCode", c.factor, c.reason FROM inventory_product_conversions c JOIN inventory_units fu ON fu.id=c.from_unit_id JOIN inventory_units tu ON tu.id=c.to_unit_id WHERE c.product_id=$1 AND c.active`, [id]),
    db.query(`SELECT id, previous_cost AS "previousCost", new_cost AS "newCost", valuation_method AS "valuationMethod", received_quantity AS "receivedQuantity", receipt_unit_cost AS "receiptUnitCost", reason, effective_at AS "effectiveAt" FROM inventory_product_cost_history WHERE product_id=$1 ORDER BY effective_at DESC`, [id])
  ]);
  return { ...product, conversions: conversions.rows, costHistory: costs.rows };
}

export async function createCatalogProduct(payload, actorId) {
  validateProductPayload(payload);
  return transaction(async (client) => {
    const category = await reference(client, "inventory_categories", payload.categoryId, "Categoría");
    const baseUnit = await reference(client, "inventory_units", payload.baseUnitId, "Unidad base");
    const purchaseUnit = await reference(client, "inventory_units", payload.purchaseUnitId, "Unidad de compra");
    const supplier = await reference(client, "inventory_suppliers", payload.habitualSupplierId, "Proveedor");
    await validateConversions(client, payload, baseUnit);
    const code = slug(payload.code || payload.name);
    const duplicate = await client.query("SELECT id FROM inventory_products WHERE code=$1 OR LOWER(name)=LOWER($2)", [code, payload.name.trim()]);
    if (duplicate.rowCount) fail(409, "Ya existe un producto con ese código o nombre", { name: "Usa un nombre y código distintos." });
    const product = (await client.query(`
      INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,habitual_supplier_id,product_type,minimum_stock,maximum_stock,average_cost,default_area_code,status,track_lots,track_expiry,tolerance_percent,density_kg_per_l,active,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb) RETURNING id
    `, [code, payload.name.trim(), category.id, baseUnit.id, purchaseUnit.id, supplier?.id || null, payload.type, number(payload.minimumStock), payload.maximumStock === "" || payload.maximumStock == null ? null : number(payload.maximumStock), number(payload.cost), payload.defaultAreaCode, payload.status || "ACTIVE", Boolean(payload.trackLots), Boolean(payload.trackExpiry), number(payload.tolerancePercent), number(payload.densityKgPerL) || null, (payload.status || "ACTIVE") === "ACTIVE", JSON.stringify({ createdFrom: "MASTER_CATALOG", imageUrl: payload.imageUrl || null })])).rows[0];
    await savePresentations(client, product.id, baseUnit.id, payload);
    await saveConversions(client, product.id, payload);
    const warehouse = await reference(client, "inventory_warehouses", payload.defaultWarehouseId, "Almacén") || (await client.query("SELECT * FROM inventory_warehouses WHERE code=$1", [payload.defaultAreaCode])).rows[0];
    await client.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,0,0) ON CONFLICT(product_id,warehouse_id,lot_id) DO NOTHING", [product.id, warehouse.id]);
    await client.query("INSERT INTO inventory_product_cost_history(product_id,previous_cost,new_cost,valuation_method,actor_legacy_user_id,reason) VALUES($1,$2,$2,'INITIAL',$3,'Costo inicial del catálogo')", [product.id, number(payload.cost), actorId]);
    const legacyId = await addLegacyProjection(client, product.id, { ...payload, code, actorId }, baseUnit, category);
    await client.query("INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,after_data) VALUES('CREATE','PRODUCT',$1,$2,'Alta en catálogo maestro',$3::jsonb)", [product.id, actorId, JSON.stringify({ code, legacyId })]);
    return product.id;
  }).then(getCatalogProduct);
}

export async function updateCatalogProduct(id, payload, actorId) {
  validateProductPayload(payload);
  if (payload.status === "ARCHIVED") fail(400, "Usa la acción Archivar para conservar el motivo y la auditoría");
  return transaction(async (client) => {
    const current = (await client.query("SELECT * FROM inventory_products WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!current) fail(404, "Producto no encontrado");
    const category = await reference(client, "inventory_categories", payload.categoryId, "Categoría");
    const baseUnit = await reference(client, "inventory_units", payload.baseUnitId, "Unidad base");
    const purchaseUnit = await reference(client, "inventory_units", payload.purchaseUnitId, "Unidad de compra");
    const supplier = await reference(client, "inventory_suppliers", payload.habitualSupplierId, "Proveedor");
    if (Number(current.base_unit_id) !== Number(baseUnit.id)) {
      const used = await client.query("SELECT 1 FROM inventory_movements WHERE product_id=$1 LIMIT 1", [id]);
      if (used.rowCount) fail(409, "No se puede cambiar la unidad base de un producto con movimientos históricos", { baseUnitId: "Crea un producto nuevo o agrega una presentación." });
    }
    await validateConversions(client, payload, baseUnit);
    const code = slug(payload.code || current.code);
    const duplicate = await client.query("SELECT id FROM inventory_products WHERE id<>$1 AND (code=$2 OR LOWER(name)=LOWER($3))", [id, code, payload.name.trim()]);
    if (duplicate.rowCount) fail(409, "Ya existe otro producto con ese código o nombre");
    await client.query(`UPDATE inventory_products SET code=$2,name=$3,category_id=$4,base_unit_id=$5,purchase_unit_id=$6,habitual_supplier_id=$7,product_type=$8,minimum_stock=$9,maximum_stock=$10,average_cost=$11,default_area_code=$12,status=$13,track_lots=$14,track_expiry=$15,tolerance_percent=$16,density_kg_per_l=$17,active=$18,metadata=COALESCE(metadata,'{}'::jsonb) || $19::jsonb,updated_at=NOW() WHERE id=$1`,
      [id, code, payload.name.trim(), category.id, baseUnit.id, purchaseUnit.id, supplier?.id || null, payload.type, number(payload.minimumStock), payload.maximumStock === "" || payload.maximumStock == null ? null : number(payload.maximumStock), number(payload.cost), payload.defaultAreaCode, payload.status || "ACTIVE", Boolean(payload.trackLots), Boolean(payload.trackExpiry), number(payload.tolerancePercent), number(payload.densityKgPerL) || null, (payload.status || "ACTIVE") === "ACTIVE", JSON.stringify({ imageUrl: payload.imageUrl || null })]);
    if (number(current.average_cost) !== number(payload.cost)) await client.query("INSERT INTO inventory_product_cost_history(product_id,previous_cost,new_cost,valuation_method,actor_legacy_user_id,reason) VALUES($1,$2,$3,'MANUAL',$4,$5)", [id, current.average_cost, number(payload.cost), actorId, payload.costReason || "Actualización manual del catálogo"]);
    await savePresentations(client, id, baseUnit.id, payload);
    await saveConversions(client, id, payload);
    await updateLegacyProjection(client, current.legacy_id, payload, baseUnit, category, actorId);
    await client.query("INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,before_data,after_data) VALUES('UPDATE','PRODUCT',$1,$2,$3,$4::jsonb,$5::jsonb)", [id, actorId, payload.updateReason || "Edición de catálogo", JSON.stringify(current), JSON.stringify({ ...payload, presentations: payload.presentations?.length })]);
    return id;
  }).then(getCatalogProduct);
}

export async function archiveCatalogProduct(id, actorId, reason) {
  if (!String(reason || "").trim()) fail(400, "Indica el motivo del archivado", { reason: "El historial necesita un motivo." });
  await transaction(async (client) => {
    const product = (await client.query("SELECT * FROM inventory_products WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!product) fail(404, "Producto no encontrado");
    await client.query("UPDATE inventory_products SET status='ARCHIVED',active=FALSE,archived_at=NOW(),updated_at=NOW() WHERE id=$1", [id]);
    const unit = (await client.query("SELECT * FROM inventory_units WHERE id=$1", [product.base_unit_id])).rows[0];
    const category = (await client.query("SELECT * FROM inventory_categories WHERE id=$1", [product.category_id])).rows[0];
    await updateLegacyProjection(client, product.legacy_id, { name: product.name, categoryId: category.id, type: product.product_type, purchaseUnitId: product.purchase_unit_id, minimumStock: product.minimum_stock, maximumStock: product.maximum_stock, cost: product.average_cost, defaultAreaCode: product.default_area_code, status: "ARCHIVED", trackLots: product.track_lots, trackExpiry: product.track_expiry, tolerancePercent: product.tolerance_percent }, unit, category, actorId, "ARCHIVAR_PRODUCTO");
    await client.query("INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,before_data,after_data) VALUES('ARCHIVE','PRODUCT',$1,$2,$3,$4::jsonb,$5::jsonb)", [id, actorId, reason, JSON.stringify(product), JSON.stringify({ status: "ARCHIVED" })]);
  });
  return getCatalogProduct(id);
}

export async function receiveCatalogCost(id, payload, actorId) {
  const quantity = number(payload.quantity);
  const unitCost = number(payload.unitCost);
  if (quantity <= 0 || unitCost < 0) fail(400, "Cantidad y costo de recepción no válidos");
  return transaction(async (client) => {
    const product = (await client.query("SELECT * FROM inventory_products WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!product || product.status === "ARCHIVED") fail(409, "El producto no está disponible para recepción");
    const warehouse = payload.warehouseId ? await reference(client, "inventory_warehouses", payload.warehouseId, "Almacén") : (await client.query("SELECT * FROM inventory_warehouses WHERE code=$1", [product.default_area_code])).rows[0];
    if (!warehouse) fail(400, "El producto no tiene un almacén predeterminado válido");
    if (product.track_lots && !String(payload.lotCode || "").trim()) fail(400, "Este producto requiere número de lote", { lotCode: "Ingresa el lote recibido." });
    if (product.track_expiry && !payload.expiresOn) fail(400, "Este producto requiere fecha de vencimiento", { expiresOn: "Ingresa la fecha de vencimiento." });
    const stock = number((await client.query("SELECT COALESCE(SUM(on_hand),0) AS stock FROM inventory_stock_balances WHERE product_id=$1", [id])).rows[0].stock);
    const previousCost = number(product.average_cost);
    const weightedCost = (stock * previousCost + quantity * unitCost) / (stock + quantity);
    let lotId = null;
    if (product.track_lots) lotId = (await client.query(`INSERT INTO inventory_lots(product_id,supplier_id,lot_code,expires_on,unit_cost) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,lot_code) DO UPDATE SET expires_on=EXCLUDED.expires_on RETURNING id`, [id, product.habitual_supplier_id, payload.lotCode.trim(), payload.expiresOn || null, unitCost])).rows[0].id;
    const stateRow = await client.query("SELECT data FROM app_state WHERE id=1 FOR UPDATE");
    const state = stateRow.rows[0].data;
    const legacyProduct = state.inventory.find((item) => Number(item.id) === Number(product.legacy_id));
    const legacyMovementId = Math.max(0, ...(state.inventoryMovements || []).map((item) => Number(item.id) || 0)) + 1;
    const movementId = (await client.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS id", [`catalog-receipt:${payload.idempotencyKey || randomUUID()}`, "GOODS_RECEIPT", id, quantity, null, warehouse.id, lotId, unitCost, payload.reason || "Recepción valorizada", actorId, "CATALOG_COST_RECEIPT", null, payload.reference || null, legacyMovementId])).rows[0].id;
    await client.query("UPDATE inventory_products SET average_cost=$2,updated_at=NOW() WHERE id=$1", [id, weightedCost]);
    await client.query("INSERT INTO inventory_product_cost_history(product_id,previous_cost,new_cost,valuation_method,received_quantity,receipt_unit_cost,source_type,source_id,actor_legacy_user_id,reason) VALUES($1,$2,$3,'WEIGHTED_AVERAGE',$4,$5,'INVENTORY_MOVEMENT',$6,$7,$8)", [id, previousCost, weightedCost, quantity, unitCost, movementId, actorId, payload.reason || "Recepción valorizada"]);
    if (legacyProduct) {
      const beforeQty = number(legacyProduct.stock);
      legacyProduct.stock = beforeQty + quantity;
      legacyProduct.cost = weightedCost;
      state.inventoryMovements.unshift({ id: legacyMovementId, productId: legacyProduct.id, product: { ...legacyProduct }, type: "ENTRADA_COMPRA", quantity, beforeQty, afterQty: legacyProduct.stock, cost: unitCost, reason: payload.reason || "Recepción valorizada", reference: payload.reference || "", createdById: actorId, createdAt: new Date().toISOString() });
      state.counters.movement = Math.max(Number(state.counters.movement || 0), legacyMovementId);
      await client.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
    }
    return id;
  }).then(getCatalogProduct);
}

export async function suggestFefo(id, requestedQuantity) {
  const requested = number(requestedQuantity);
  if (requested <= 0) fail(400, "La cantidad solicitada debe ser mayor a cero");
  const lots = (await db.query("SELECT lot_id AS \"lotId\",lot_code AS \"lotCode\",expires_on AS \"expiresOn\",warehouse_id AS \"warehouseId\",available,unit_cost AS \"unitCost\" FROM inventory_fefo_available_lots WHERE product_id=$1 ORDER BY expires_on ASC NULLS LAST,lot_id", [id])).rows;
  let remaining = requested;
  const suggestion = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, number(lot.available));
    suggestion.push({ ...lot, suggestedQuantity: take });
    remaining -= take;
  }
  return { requestedQuantity: requested, allocatedQuantity: requested - remaining, missingQuantity: Math.max(0, remaining), strategy: "FEFO", lots: suggestion };
}

export async function createCatalogUnit(payload) {
  const code = slug(payload.code || payload.symbol || payload.name);
  if (!payload.name || !payload.symbol || !["MASS", "VOLUME", "COUNT", "LENGTH", "OTHER"].includes(payload.dimension)) fail(400, "Datos de unidad no válidos");
  const result = await db.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES($1,$2,$3,$4,$5) RETURNING *", [code, payload.name.trim(), payload.symbol.trim(), payload.dimension, Math.min(6, Math.max(0, Number(payload.decimalPlaces || 0)))]);
  return result.rows[0];
}

export async function createCatalogCategory(payload) {
  if (!String(payload.name || "").trim()) fail(400, "Ingresa el nombre de la categoría");
  const result = await db.query("INSERT INTO inventory_categories(code,name) VALUES($1,$2) RETURNING *", [slug(payload.code || payload.name), payload.name.trim()]);
  return result.rows[0];
}
