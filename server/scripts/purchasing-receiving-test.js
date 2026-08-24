import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const adminPool = new Pool({ connectionString: sourceUrl });
const schema = `purchasing_test_${process.pid}_${Date.now()}`;
const migrationRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const results = [];
const pass = (name, detail) => results.push({ name, detail });
let serviceDb;

try {
  const sourceState = (await adminPool.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data;
  const setup = await adminPool.connect();
  let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}`);
    for (const migration of ["001_inventory_intelligent.up.sql", "002_product_master_catalog.up.sql", "003_purchasing_receiving.up.sql"]) await setup.query(await readFile(join(migrationRoot, migration), "utf8"));
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await setup.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)", [JSON.stringify(sourceState)]);
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG','Kilogramo','kg','MASS',3),('UNIT','Unidad','un','COUNT',0) ON CONFLICT(code) DO NOTHING");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('TEST_RAW','Materia prima de prueba') ON CONFLICT(code) DO NOTHING");
    await setup.query("INSERT INTO inventory_warehouses(code,name,warehouse_type,area_code) VALUES('GENERAL','Almacén general','GENERAL','GENERAL') ON CONFLICT(code) DO NOTHING");
    const kg = (await setup.query("SELECT id FROM inventory_units WHERE code='KG'")).rows[0].id;
    const unit = (await setup.query("SELECT id FROM inventory_units WHERE code='UNIT'")).rows[0].id;
    const category = (await setup.query("SELECT id FROM inventory_categories ORDER BY id LIMIT 1")).rows[0].id;
    const supplier = (await setup.query("INSERT INTO inventory_suppliers(tax_id,name) VALUES('20111111111','Avícola de prueba') RETURNING id")).rows[0].id;
    const warehouse = (await setup.query("SELECT id FROM inventory_warehouses WHERE code='GENERAL'")).rows[0].id;
    const product = (await setup.query(`INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,habitual_supplier_id,product_type,average_cost,status,track_lots,track_expiry,tolerance_percent,default_area_code)
      VALUES('TEST_CHICKEN','Pollo entero prueba',$1,$2,$3,$4,'RAW_MATERIAL',8,'ACTIVE',TRUE,TRUE,3,'GENERAL') RETURNING id`, [category, kg, unit, supplier])).rows[0].id;
    const presentation = (await setup.query("INSERT INTO inventory_presentations(product_id,unit_id,code,name,conversion_factor,is_purchase_unit) VALUES($1,$2,'CHICKEN','Pollo entero (promedio 2 kg)',2,TRUE) RETURNING id", [product, unit])).rows[0].id;
    await setup.query("INSERT INTO inventory_product_cost_history(product_id,previous_cost,new_cost,valuation_method,reason) VALUES($1,8,8,'INITIAL','Prueba')", [product]);
    ids = { supplier, warehouse, product, presentation };
  } finally {
    await setup.query("SET search_path TO public");
    setup.release();
  }

  const testUrl = new URL(sourceUrl);
  testUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = testUrl.toString();
  const purchasing = await import(`../src/purchasing.js?test=${Date.now()}`);
  serviceDb = (await import("../src/db.js")).db;

  const complete = await purchasing.createPurchaseOrder({ supplierId: ids.supplier, lines: [{ productId: ids.product, presentationId: ids.presentation, orderedQuantity: 10, unitCost: 20 }] }, 1);
  assert.equal(complete.status, "APPROVED");
  assert.equal(Number(complete.lines[0].orderedBaseQuantity), 20);

  const weightsA = [1.8, 2.1, 1.9, 2.05, 2.15];
  const weightsB = [1.75, 2.2, 1.95, 2.05, 2.1];
  const realTotal = [...weightsA, ...weightsB].reduce((sum, value) => sum + value, 0);
  const receipt = await purchasing.createGoodsReceipt(complete.id, { warehouseId: ids.warehouse, evidenceUrl: "https://example.test/evidence.jpg", lines: [
    { orderLineId: complete.lines[0].id, receivedPresentationQuantity: 5, measurementMode: "INDIVIDUAL", individualMeasurements: weightsA, decision: "ACCEPTED", lotCode: "POLLO-A", expiresOn: "2026-09-01" },
    { orderLineId: complete.lines[0].id, receivedPresentationQuantity: 5, measurementMode: "INDIVIDUAL", individualMeasurements: weightsB, decision: "ACCEPTED", lotCode: "POLLO-B", expiresOn: "2026-09-02" }
  ] }, 1);
  assert.equal(receipt.status, "DRAFT");
  assert.equal(receipt.lines.length, 2);
  assert.equal(Number(receipt.lines.reduce((sum, line) => sum + Number(line.actualBaseQuantity), 0)).toFixed(6), realTotal.toFixed(6));
  await purchasing.verifyGoodsReceipt(receipt.id, { observation: "Peso y calidad conformes" }, 1);
  const completed = await purchasing.postGoodsReceipt(receipt.id, 1);
  assert.equal(completed.status, "RECEIVED");
  const stockAfterComplete = Number((await serviceDb.query("SELECT SUM(on_hand) stock FROM inventory_stock_balances WHERE product_id=$1", [ids.product])).rows[0].stock);
  assert.equal(stockAfterComplete.toFixed(6), realTotal.toFixed(6));
  pass("Recepción completa con peso individual", `10 pollos suman ${realTotal.toFixed(3)} kg reales y esa cantidad ingresó al stock`);
  assert.equal(Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_lots WHERE product_id=$1", [ids.product])).rows[0].count), 2);
  pass("Dos lotes y vencimientos", "Una misma compra se dividió en POLLO-A y POLLO-B");
  assert.ok(completed.receipts[0].lines.some((line) => Math.abs(Number(line.differenceBaseQuantity)) > 0));
  pass("Diferencia teórica versus real", "Se conservaron 20 kg teóricos, peso real y diferencia por lote");

  const partial = await purchasing.createPurchaseOrder({ supplierId: ids.supplier, lines: [{ productId: ids.product, presentationId: ids.presentation, orderedQuantity: 10, unitCost: 24 }] }, 1);
  const partialReceipt = await purchasing.createGoodsReceipt(partial.id, { warehouseId: ids.warehouse, lines: [{ orderLineId: partial.lines[0].id, receivedPresentationQuantity: 4, measurementMode: "TOTAL", actualBaseQuantity: 8, decision: "ACCEPTED", lotCode: "POLLO-C", expiresOn: "2026-09-03" }] }, 1);
  await purchasing.verifyGoodsReceipt(partialReceipt.id, {}, 1);
  const partialPosted = await purchasing.postGoodsReceipt(partialReceipt.id, 1);
  assert.equal(partialPosted.status, "PARTIALLY_RECEIVED");
  assert.equal(Number(partialPosted.lines[0].remainingQuantity), 6);
  pass("Recepción parcial", "4 de 10 pollos aceptados; quedan 6 pendientes");

  const expectedAverage = (realTotal * 10 + 8 * 12) / (realTotal + 8);
  const average = Number((await serviceDb.query("SELECT average_cost FROM inventory_products WHERE id=$1", [ids.product])).rows[0].average_cost);
  assert.ok(Math.abs(average - expectedAverage) < 0.000001);
  pass("Promedio ponderado", `Costo base actualizado a ${average.toFixed(6)} sin alterar movimientos anteriores`);

  const rejectedOrder = await purchasing.createPurchaseOrder({ supplierId: ids.supplier, lines: [{ productId: ids.product, presentationId: ids.presentation, orderedQuantity: 2, unitCost: 20 }] }, 1);
  const rejectedReceipt = await purchasing.createGoodsReceipt(rejectedOrder.id, { warehouseId: ids.warehouse, lines: [{ orderLineId: rejectedOrder.lines[0].id, receivedPresentationQuantity: 2, measurementMode: "TOTAL", actualBaseQuantity: 3.5, decision: "REJECTED", observation: "Cadena de frío rota" }] }, 1);
  await purchasing.verifyGoodsReceipt(rejectedReceipt.id, {}, 1);
  const movementsBeforeReject = Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_movements WHERE product_id=$1", [ids.product])).rows[0].count);
  const rejectedPosted = await purchasing.postGoodsReceipt(rejectedReceipt.id, 1);
  const movementsAfterReject = Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_movements WHERE product_id=$1", [ids.product])).rows[0].count);
  assert.equal(rejectedPosted.status, "APPROVED");
  assert.equal(movementsAfterReject, movementsBeforeReject);
  pass("Producto rechazado", "La evidencia queda en recepción, pero no genera stock ni costo");

  const kardex = (await serviceDb.query("SELECT quantity,unit_cost,source_type FROM inventory_movements WHERE product_id=$1 ORDER BY id", [ids.product])).rows;
  assert.equal(kardex.length, 3);
  assert.ok(kardex.every((row) => row.source_type === "GOODS_RECEIPT_LINE"));
  pass("Movimiento en kardex", "Tres partidas aceptadas generaron tres movimientos auditados e idempotentes");

  const immutableReceiptId = completed.receipts.find((item) => item.status === "POSTED").id;
  await assert.rejects(serviceDb.query("UPDATE inventory_goods_receipts SET observation='alterado' WHERE id=$1", [immutableReceiptId]), /inmutable/);
  pass("Historial inmutable", "Una recepción contabilizada no puede editarse");

  await serviceDb.end(); serviceDb = null;
  const rollback = await adminPool.connect();
  try {
    await rollback.query(`SET search_path TO ${schema}`);
    await rollback.query(await readFile(join(migrationRoot, "003_purchasing_receiving.down.sql"), "utf8"));
    const column = await rollback.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='inventory_goods_receipt_lines' AND column_name='measurement_mode'");
    assert.equal(column.rowCount, 0);
    pass("Rollback controlado", "La migración 003 se revirtió en el esquema aislado");
  } finally { await rollback.query("SET search_path TO public"); rollback.release(); }

  console.log(JSON.stringify({ status: "PASSED", tests: results.length, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", completed: results, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (serviceDb) await serviceDb.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.end();
}
