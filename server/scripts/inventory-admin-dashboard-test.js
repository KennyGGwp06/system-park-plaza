import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `inventory_admin_test_${process.pid}_${Date.now()}`;
const migrations = [
  "001_inventory_intelligent.up.sql", "002_product_master_catalog.up.sql", "003_purchasing_receiving.up.sql",
  "004_warehouses_transfers.up.sql", "005_operational_shift_inventories.up.sql", "006_versioned_technical_recipes.up.sql",
  "007_processing_production_portioning.up.sql", "008_opening_lots_for_transformations.up.sql",
  "009_orders_inventory_sales.up.sql", "010_waste_counts_reconciliation.up.sql", "011_bar_bottle_control.up.sql",
];
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const results = [];
const pass = (name, detail) => results.push({ name, detail });
let serviceDb;

try {
  const state = structuredClone((await admin.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data);
  const setup = await admin.connect();
  let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}`);
    for (const migration of migrations) await setup.query(await readFile(join(root, migration), "utf8"));
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await setup.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)", [JSON.stringify(state)]);
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG_ADM','Kilogramo','kg','MASS',3)");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('ADM_TEST','Administración')");
    const unit = (await setup.query("SELECT id FROM inventory_units WHERE code='KG_ADM'")).rows[0].id;
    const category = (await setup.query("SELECT id FROM inventory_categories WHERE code='ADM_TEST'")).rows[0].id;
    const kitchen = (await setup.query("SELECT id FROM inventory_warehouses WHERE code='RESTAURANTE'")).rows[0].id;
    const bar = (await setup.query("SELECT id FROM inventory_warehouses WHERE code='BARTENDER'")).rows[0].id;
    const food = (await setup.query("INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code,minimum_stock) VALUES('ADM_FOOD','Insumo cocina',$1,$2,$2,'RAW_MATERIAL',4,'ACTIVE','RESTAURANTE',6) RETURNING id", [category, unit])).rows[0].id;
    const drink = (await setup.query("INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code,minimum_stock) VALUES('ADM_DRINK','Insumo bar',$1,$2,$2,'BEVERAGE',3,'ACTIVE','BARTENDER',1) RETURNING id", [category, unit])).rows[0].id;
    const foodLot = (await setup.query("INSERT INTO inventory_lots(product_id,lot_code,unit_cost,expires_on,status) VALUES($1,'ADM-FOOD',4,CURRENT_DATE+2,'AVAILABLE') RETURNING id", [food])).rows[0].id;
    const drinkLot = (await setup.query("INSERT INTO inventory_lots(product_id,lot_code,unit_cost,status) VALUES($1,'ADM-DRINK',3,'AVAILABLE') RETURNING id", [drink])).rows[0].id;
    await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand,reserved) VALUES($1,$2,$3,5,0),($4,$5,$6,10,0)", [food, kitchen, foodLot, drink, bar, drinkLot]);
    await setup.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,NULL,$6,$7,$8,1,'ADMIN_TEST',1,'ADM-001',NULL,NULL,FALSE,'{}'::jsonb)", ["admin-theoretical-1", "THEORETICAL_CONSUMPTION", food, 2, kitchen, foodLot, 4, "Consumo teórico para prueba"]);
    ids = { food, foodLot, kitchen };
  } finally {
    await setup.query("SET search_path TO public");
    setup.release();
  }

  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = connection.toString();
  const dashboard = await import(`../src/inventory-admin-dashboard.js?test=${Date.now()}`);
  serviceDb = (await import("../src/db.js")).db;
  const total = await dashboard.inventoryAdminDashboard({});
  assert.equal(total.metrics.totalValue, 42);
  assert.equal(total.metrics.theoretical, 8);
  assert.equal(total.alerts.critical.length, 1);
  assert.equal(total.alerts.expiry.length, 1);
  pass("Indicadores desde datos reales", "Valor de stock, consumo teórico, mínimo y vencimiento provienen de balances, movimientos y lotes.");

  const filtered = await dashboard.inventoryAdminDashboard({ area: "RESTAURANTE", warehouse: ids.kitchen, product: ids.food, lot: ids.foodLot });
  assert.equal(filtered.metrics.totalValue, 12);
  assert.equal(filtered.metrics.theoretical, 8);
  assert.equal(filtered.byWarehouse.length, 1);
  pass("Filtros de detalle", "Área, almacén, producto y lote reducen el valor y mantienen el movimiento correspondiente.");

  assert.equal(total.alerts.critical[0].id, ids.food);
  assert.equal(total.alerts.expiry[0].id, ids.foodLot);
  pass("Detalle rastreable", "Las alertas devuelven identificadores para abrir el producto o lote que origina el indicador.");

  await serviceDb.end();
  serviceDb = null;
  console.log(JSON.stringify({ status: "PASSED", tests: results.length, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", completed: results, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (serviceDb) await serviceDb.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
