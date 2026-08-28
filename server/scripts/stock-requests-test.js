import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const adminPool = new Pool({ connectionString: sourceUrl });
const schema = `stock_requests_test_${process.pid}_${Date.now()}`;
const migrationRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let serviceDb;

try {
  const sourceState = structuredClone((await adminPool.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data);
  const setup = await adminPool.connect();
  let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}`);
    for (const migration of ["001_inventory_intelligent.up.sql", "002_product_master_catalog.up.sql", "003_purchasing_receiving.up.sql", "004_warehouses_transfers.up.sql", "016_stock_requisitions.up.sql"]) {
      await setup.query(await readFile(join(migrationRoot, migration), "utf8"));
    }
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await setup.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)", [JSON.stringify(sourceState)]);
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG_REQ','Kilogramo solicitud','kg','MASS',3)");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('REQUEST_TEST','Solicitud')");
    const unit = (await setup.query("SELECT id FROM inventory_units WHERE code='KG_REQ'")).rows[0].id;
    const category = (await setup.query("SELECT id FROM inventory_categories WHERE code='REQUEST_TEST'")).rows[0].id;
    const product = (await setup.query("INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code) VALUES('REQ_RICE','Arroz solicitado',$1,$2,$2,'RAW_MATERIAL',5,'ACTIVE','RESTAURANTE') RETURNING id", [category, unit])).rows[0].id;
    const general = (await setup.query("SELECT id FROM inventory_warehouses WHERE code='GENERAL'")).rows[0].id;
    const lot = (await setup.query("INSERT INTO inventory_lots(product_id,lot_code,unit_cost,status) VALUES($1,'REQ-LOTE',5,'AVAILABLE') RETURNING id", [product])).rows[0].id;
    await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand,reserved) VALUES($1,$2,$3,100,0)", [product, general, lot]);
    ids = { product, general };
  } finally {
    await setup.query("SET search_path TO public");
    setup.release();
  }

  const testUrl = new URL(sourceUrl);
  testUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = testUrl.toString();
  const requests = await import(`../src/stock-requests.js?test=${Date.now()}`);
  serviceDb = (await import("../src/db.js")).db;
  const admin = { id: 1, role: "ADMINISTRADOR" };
  const kitchen = { id: 3, role: "RESTAURANTE" };
  const bar = { id: 4, role: "BARTENDER" };

  let request = await requests.createStockRequest({ area: "BARTENDER", observation: "Turno de prueba", lines: [{ productId: ids.product, quantity: 10 }] }, kitchen);
  assert.equal(request.area, "RESTAURANTE");
  assert.equal(request.status, "REQUESTED");
  request = await requests.reviewStockRequest(request.id, { decision: "APPROVE", note: "Cantidad validada" }, admin);
  assert.equal(request.status, "APPROVED");
  assert.ok(request.transferId);
  assert.equal(Number((await serviceDb.query("SELECT reserved FROM inventory_stock_balances WHERE warehouse_id=$1 AND product_id=$2", [ids.general, ids.product])).rows[0].reserved), 10);
  await assert.rejects(requests.reviewStockRequest(request.id, { decision: "APPROVE" }, admin), /ya fue revisada/i);

  let rejected = await requests.createStockRequest({ lines: [{ productId: ids.product, quantity: 2 }] }, bar);
  rejected = await requests.reviewStockRequest(rejected.id, { decision: "REJECT", note: "No corresponde al turno" }, admin);
  assert.equal(rejected.status, "REJECTED");
  assert.equal((await requests.listStockRequests({}, kitchen)).length, 1);
  assert.equal((await requests.listStockRequests({}, bar)).length, 1);
  console.log(JSON.stringify({ status: "PASSED", tests: 5, detail: "Solicitud, separación por área, aprobación con reserva, rechazo e idempotencia verificados" }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (serviceDb) await serviceDb.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.end();
}
