import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const adminPool = new Pool({ connectionString: sourceUrl });
const schema = `product_catalog_test_${process.pid}_${Date.now()}`;
const migrationRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const results = [];
const pass = (name, detail = "") => results.push({ name, detail });
let testDb;

try {
  const sourceState = (await adminPool.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data;
  const setup = await adminPool.connect();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}`);
    for (const migration of ["001_inventory_intelligent.up.sql", "002_product_master_catalog.up.sql", "003_purchasing_receiving.up.sql", "004_warehouses_transfers.up.sql", "005_operational_shift_inventories.up.sql", "006_versioned_technical_recipes.up.sql"]) {
      await setup.query(await readFile(join(migrationRoot, migration), "utf8"));
    }
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await setup.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)", [JSON.stringify(sourceState)]);
    const { migrateLegacyInventory } = await import("../src/inventory-relational.js");
    await setup.query("BEGIN");
    await migrateLegacyInventory(setup, sourceState);
    await setup.query("COMMIT");
  } finally {
    await setup.query("SET search_path TO public");
    setup.release();
  }

  const testUrl = new URL(sourceUrl);
  testUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = testUrl.toString();
  const catalog = await import(`../src/product-catalog.js?test=${Date.now()}`);
  testDb = (await import("../src/db.js")).db;
  const refs = await catalog.catalogReferences();
  const unit = (code) => refs.units.find((item) => item.code === code);
  const category = refs.categories.find((item) => item.code === "RAW_MATERIALS") || refs.categories[0];
  const beverages = refs.categories.find((item) => item.code === "BEVERAGES") || refs.categories[0];
  const supplier = refs.suppliers[0];
  const warehouse = refs.warehouses.find((item) => item.code === "RESTAURANTE");
  const barWarehouse = refs.warehouses.find((item) => item.code === "BARTENDER");

  const common = { habitualSupplierId: supplier?.id || null, minimumStock: 1, maximumStock: 1000, status: "ACTIVE", tolerancePercent: 2, trackLots: false, trackExpiry: false, conversions: [] };
  const weight = await catalog.createCatalogProduct({ ...common, code: "TEST_FLOUR", name: "Harina prueba catálogo", categoryId: category.id, type: "RAW_MATERIAL", baseUnitId: unit("G").id, purchaseUnitId: unit("KG").id, defaultAreaCode: "RESTAURANTE", defaultWarehouseId: warehouse.id, cost: 8,
    presentations: [{ code: "KG", name: "Bolsa de 1 kg", unitId: unit("KG").id, conversionFactor: 1000, isPurchaseUnit: true }, { code: "BAG5", name: "Bolsa de 5 kg", unitId: unit("KG").id, conversionFactor: 5000 }] }, 1);
  assert.equal(Number(weight.presentations.find((item) => item.code === "KG").conversionFactor), 1000);
  assert.equal(weight.presentations.length, 3);
  pass("Producto por peso y varias presentaciones", "1 kg = 1,000 g; bolsa de 5 kg = 5,000 g");

  const liquid = await catalog.createCatalogProduct({ ...common, code: "TEST_PISCO", name: "Pisco prueba catálogo", categoryId: beverages.id, type: "BEVERAGE", baseUnitId: unit("ML").id, purchaseUnitId: unit("BOTTLE").id, defaultAreaCode: "BARTENDER", defaultWarehouseId: barWarehouse.id, cost: 30, trackLots: true, trackExpiry: true,
    presentations: [{ code: "BOTTLE750", name: "Botella de 750 ml", unitId: unit("BOTTLE").id, conversionFactor: 750, isPurchaseUnit: true }] }, 1);
  assert.equal(Number(liquid.presentations.find((item) => item.code === "BOTTLE750").conversionFactor), 750);
  pass("Producto líquido", "1 botella = 750 ml");

  const eggs = await catalog.createCatalogProduct({ ...common, code: "TEST_EGGS", name: "Huevos prueba catálogo", categoryId: category.id, type: "RAW_MATERIAL", baseUnitId: unit("UNIT").id, purchaseUnitId: unit("BOX").id, defaultAreaCode: "RESTAURANTE", defaultWarehouseId: warehouse.id, cost: 0.5,
    presentations: [{ code: "BOX24", name: "Caja de 24 huevos", unitId: unit("BOX").id, conversionFactor: 24, isPurchaseUnit: true }] }, 1);
  assert.equal(Number(eggs.presentations.find((item) => item.code === "BOX24").conversionFactor), 24);
  pass("Producto por unidades", "1 caja = 24 unidades");

  await assert.rejects(catalog.createCatalogProduct({ ...common, code: "TEST_INVALID", name: "Conversión inválida", categoryId: category.id, type: "RAW_MATERIAL", baseUnitId: unit("G").id, purchaseUnitId: unit("ML").id, defaultAreaCode: "RESTAURANTE", defaultWarehouseId: warehouse.id, cost: 1,
    presentations: [{ code: "ML", name: "Mililitro", unitId: unit("ML").id, conversionFactor: 1, isPurchaseUnit: true }] }, 1), /densidad o conversión específica/);
  pass("Conversión incompatible rechazada", "gramos → mililitros sin densidad");

  await catalog.receiveCatalogCost(weight.id, { quantity: 10, unitCost: 10, warehouseId: warehouse.id, reason: "Primera compra de prueba", idempotencyKey: "catalog-weight-1" }, 1);
  const weighted = await catalog.receiveCatalogCost(weight.id, { quantity: 10, unitCost: 14, warehouseId: warehouse.id, reason: "Segunda compra de prueba", idempotencyKey: "catalog-weight-2" }, 1);
  assert.equal(Number(weighted.cost), 12);
  const movementCostsBefore = (await testDb.query("SELECT id,unit_cost FROM inventory_movements WHERE product_id=$1 ORDER BY id", [weight.id])).rows;
  const editable = await catalog.getCatalogProduct(weight.id);
  const updated = await catalog.updateCatalogProduct(weight.id, { ...common, code: editable.code, name: editable.name, categoryId: editable.category.id, type: editable.type, baseUnitId: editable.baseUnit.id, purchaseUnitId: editable.purchaseUnit.id, defaultAreaCode: editable.defaultAreaCode, defaultWarehouseId: warehouse.id, cost: 13, presentations: editable.presentations.filter((item) => item.code !== "BASE").map((item) => ({ ...item, conversionFactor: Number(item.conversionFactor) })) }, 1);
  const movementCostsAfter = (await testDb.query("SELECT id,unit_cost FROM inventory_movements WHERE product_id=$1 ORDER BY id", [weight.id])).rows;
  assert.deepEqual(movementCostsAfter, movementCostsBefore);
  assert.ok(updated.costHistory.some((item) => item.valuationMethod === "WEIGHTED_AVERAGE"));
  assert.ok(updated.costHistory.some((item) => item.valuationMethod === "MANUAL"));
  pass("Promedio ponderado y costo histórico", "promedio 12.00; edición posterior no alteró movimientos");

  await catalog.receiveCatalogCost(liquid.id, { quantity: 5, unitCost: 31, warehouseId: barWarehouse.id, lotCode: "LATE", expiresOn: "2027-12-31", idempotencyKey: "catalog-pisco-late" }, 1);
  await catalog.receiveCatalogCost(liquid.id, { quantity: 4, unitCost: 32, warehouseId: barWarehouse.id, lotCode: "EARLY", expiresOn: "2027-06-30", idempotencyKey: "catalog-pisco-early" }, 1);
  const fefo = await catalog.suggestFefo(liquid.id, 6);
  assert.equal(fefo.lots[0].lotCode, "EARLY");
  assert.equal(fefo.allocatedQuantity, 6);
  pass("Sugerencia FEFO", "primero vence, primero sale");

  const movementsBeforeArchive = Number((await testDb.query("SELECT COUNT(*) FROM inventory_movements")).rows[0].count);
  const archived = await catalog.archiveCatalogProduct(eggs.id, 1, "Producto de prueba finalizado");
  const movementsAfterArchive = Number((await testDb.query("SELECT COUNT(*) FROM inventory_movements")).rows[0].count);
  assert.equal(archived.status, "ARCHIVED");
  assert.equal(movementsAfterArchive, movementsBeforeArchive);
  assert.ok(archived.legacyId);
  pass("Archivado conserva historial", "sin DELETE y sin alterar movimientos");

  await testDb.end();
  testDb = null;
  const rollback = await adminPool.connect();
  try {
    await rollback.query(`SET search_path TO ${schema}`);
    for (const migration of ["006_versioned_technical_recipes.down.sql", "005_operational_shift_inventories.down.sql", "004_warehouses_transfers.down.sql", "003_purchasing_receiving.down.sql", "002_product_master_catalog.down.sql"]) {
      await rollback.query(await readFile(join(migrationRoot, migration), "utf8"));
    }
    const removed = await rollback.query("SELECT to_regclass('inventory_product_cost_history') AS cost_history");
    assert.equal(removed.rows[0].cost_history, null);
    pass("Rollback del catálogo", "002 revertida en esquema aislado");
  } finally {
    await rollback.query("SET search_path TO public");
    rollback.release();
  }

  console.log(JSON.stringify({ status: "PASSED", tests: results.length, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", completed: results, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (testDb) await testDb.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.end();
}
