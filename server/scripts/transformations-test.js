import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const adminPool = new Pool({ connectionString: sourceUrl });
const schema = `transformations_test_${process.pid}_${Date.now()}`;
const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const results = [];
const pass = (name, detail) => results.push({ name, detail });
let serviceDb;

try {
  const state = structuredClone((await adminPool.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data);
  const admin = (state.users || []).find((user) => user.role === "ADMINISTRADOR");
  assert.ok(admin, "Se requiere un administrador en los datos demo");
  const setup = await adminPool.connect();
  let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}`);
    for (const number of ["001", "002", "003", "004", "005", "006", "007"]) {
      const file = (await (await import("node:fs/promises")).readdir(migrations)).find((name) => name.startsWith(`${number}_`) && name.endsWith(".up.sql"));
      await setup.query(await readFile(join(migrations, file), "utf8"));
    }
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await setup.query("INSERT INTO app_state VALUES(1,$1::jsonb,NOW())", [JSON.stringify(state)]);
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG_TF','Kilogramo','kg','MASS',3),('G_TF','Gramo','g','MASS',3),('UND_TF','Unidad','und','COUNT',0)");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('TF_RAW','Materia prima'),('TF_PROCESS','Procesados')");
    const units = (await setup.query("SELECT id,code FROM inventory_units WHERE code LIKE '%_TF'")).rows;
    const uid = (code) => Number(units.find((unit) => unit.code === code).id);
    const category = Number((await setup.query("SELECT id FROM inventory_categories WHERE code='TF_RAW'")).rows[0].id);
    const product = async (code, name, type, unit, cost, tolerance = 0) => Number((await setup.query(`INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code,tolerance_percent) VALUES($1,$2,$3,$4,$4,$5,$6,'ACTIVE','RESTAURANTE',$7) RETURNING id`, [code, name, category, uid(unit), type, cost, tolerance])).rows[0].id);
    ids = {
      kg: uid("KG_TF"), g: uid("G_TF"), unit: uid("UND_TF"),
      chicken: await product("TF_CHICKEN", "Pollo entero", "RAW_MATERIAL", "KG_TF", 10, 2),
      meat: await product("TF_MEAT", "Carne de pollo", "PROCESSED", "KG_TF", 0, 2),
      bones: await product("TF_BONES", "Huesos de pollo", "PROCESSED", "KG_TF", 0, 3),
      portion: await product("TF_PORTION", "Porción de pollo 180 g", "PORTION", "UND_TF", 0, 2),
      broth: await product("TF_BROTH", "Fondo de pollo", "INTERMEDIATE", "KG_TF", 0, 5),
      kitchen: Number((await setup.query("SELECT id FROM inventory_warehouses WHERE code='RESTAURANTE'")).rows[0].id)
    };
    await setup.query("INSERT INTO inventory_product_conversions(product_id,from_unit_id,to_unit_id,factor,reason) VALUES($1,$2,$3,0.001,'Gramos a kilogramos')", [ids.meat, ids.g, ids.kg]);
    ids.sourceLot = Number((await setup.query("INSERT INTO inventory_lots(product_id,lot_code,unit_cost) VALUES($1,'POLLO-ORIGEN-001',10) RETURNING id", [ids.chicken])).rows[0].id);
    await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand) VALUES($1,$2,$3,10)", [ids.chicken, ids.kitchen, ids.sourceLot]);
    await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand) VALUES($1,$2,NULL,2)", [ids.broth, ids.kitchen]);
    await setup.query(await readFile(join(migrations, "008_opening_lots_for_transformations.up.sql"), "utf8"));
    assert.equal(Number((await setup.query("SELECT on_hand FROM inventory_stock_balances b JOIN inventory_lots l ON l.id=b.lot_id WHERE b.product_id=$1 AND l.lot_code='LEGACY-OPENING-'||b.product_id", [ids.broth])).rows[0].on_hand), 2);
    pass("Compatibilidad de existencias heredadas", "El stock sin lote se vinculó a un lote de apertura sin cambiar su cantidad");
  } finally {
    await setup.query("SET search_path TO public");
    setup.release();
  }

  const testUrl = new URL(sourceUrl);
  testUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = testUrl.toString();
  const service = await import(`../src/transformations.js?test=${Date.now()}`);
  serviceDb = (await import("../src/db.js")).db;
  assert.equal(Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_products WHERE id=ANY($1::bigint[]) AND status='ACTIVE'", [[ids.chicken, ids.meat, ids.bones, ids.portion, ids.broth]])).rows[0].count), 5);

  const processing = await service.completeProcessing({
    warehouseId: ids.kitchen, inputProductId: ids.chicken, inputLotId: ids.sourceLot,
    inputQuantity: 10, expectedUsablePercent: 80, tolerancePercent: 2,
    outputs: [
      { type: "USABLE", productId: ids.meat, quantity: 7, lotCode: "CARNE-001" },
      { type: "BYPRODUCT", productId: ids.bones, quantity: 2, lotCode: "HUESOS-001" },
      { type: "WASTE", quantity: 1, observation: "Merma de despiece" }
    ]
  }, admin.id);
  assert.equal(Number(processing.yieldPercent), 90);
  assert.equal(Number(processing.usablePercent), 70);
  assert.equal(Number(processing.byproductPercent), 20);
  assert.equal(Number(processing.wastePercent), 10);
  assert.equal(processing.outOfTolerance, true);
  const usable = processing.outputs.find((output) => output.type === "USABLE");
  const byproduct = processing.outputs.find((output) => output.type === "BYPRODUCT");
  assert.equal(Math.round((Number(usable.allocatedCost) + Number(byproduct.allocatedCost)) * 100) / 100, 100);
  pass("Procesamiento con merma y subproducto", "10 kg generaron 7 kg aprovechables, 2 kg reutilizables y 1 kg de merma; costo transferido S/ 100");

  const sourceBalance = Number((await serviceDb.query("SELECT on_hand FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2 AND lot_id=$3", [ids.chicken, ids.kitchen, ids.sourceLot])).rows[0].on_hand);
  assert.equal(sourceBalance, 0);
  assert.equal(Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_movements WHERE product_id=$1 AND movement_type='PROCESSING_CONSUMPTION'", [ids.chicken])).rows[0].count), 1);
  pass("Sin doble descuento", "El lote original quedó en cero con un único movimiento de consumo; merma y residuo son referencias auditadas");

  const portioning = await service.completePortioning({
    warehouseId: ids.kitchen, sourceProductId: ids.meat, sourceLotId: usable.outputLotId,
    outputProductId: ids.portion, inputQuantity: 7, targetWeight: 180, weightUnitId: ids.g,
    sampleWeights: [178, 182, 180], tolerancePercent: 2, outputLotCode: "PORCIONES-001", leftoverLotCode: "SOBRANTE-001"
  }, admin.id);
  assert.equal(Number(portioning.completePortions), 38);
  assert.equal(Number(portioning.leftoverQuantity), 0.16);
  assert.equal(Number(portioning.sampleAverageBase), 0.18);
  assert.equal(portioning.samples.length, 3);
  pass("Porcionado con muestreo", "7 kg a 180 g generaron 38 porciones, 0.16 kg de sobrante y promedio real obtenido desde tres muestras");

  const outside = await service.completePortioning({
    warehouseId: ids.kitchen, sourceProductId: ids.meat, sourceLotId: portioning.samples.length ? Number((await serviceDb.query("SELECT leftover_lot_id FROM inventory_portioning_batches WHERE id=$1", [portioning.id])).rows[0].leftover_lot_id) : 0,
    outputProductId: ids.portion, inputQuantity: 0.16, targetWeight: 100, weightUnitId: ids.g,
    sampleWeights: [120], tolerancePercent: 5, outputLotCode: "PORCIONES-FUERA-TOL", leftoverLotCode: "SOBRANTE-FUERA-TOL"
  }, admin.id);
  assert.equal(outside.outOfTolerance, true);
  pass("Rendimiento fuera de tolerancia", "Una muestra de 120 g contra objetivo de 100 g y tolerancia 5% quedó marcada automáticamente");

  const trace = await service.traceLot(Number((await serviceDb.query("SELECT output_lot_id FROM inventory_portioning_batches WHERE id=$1", [portioning.id])).rows[0].output_lot_id));
  assert.ok(trace.ancestors.some((row) => Number(row.lotId) === ids.sourceLot && Number(row.depth) === 2));
  assert.ok(trace.ancestors.some((row) => row.lotCode === "CARNE-001"));
  pass("Trazabilidad de extremo a extremo", "La porción identifica su lote de carne y el lote original de pollo en dos niveles");

  const recipe = Number((await serviceDb.query("INSERT INTO inventory_recipes(code,name,area_code,recipe_type,output_product_id) VALUES('TF_BROTH_RECIPE','Fondo de pollo','RESTAURANTE','INTERMEDIATE',$1) RETURNING id", [ids.broth])).rows[0].id);
  const version = Number((await serviceDb.query("INSERT INTO inventory_recipe_versions(recipe_id,version,status,yield_quantity,yield_unit_id) VALUES($1,1,'ACTIVE',1,$2) RETURNING id", [recipe, ids.kg])).rows[0].id);
  await serviceDb.query("INSERT INTO inventory_recipe_ingredients(recipe_version_id,product_id,quantity,unit_id,base_quantity,unit_cost_snapshot,line_cost) VALUES($1,$2,1,$3,1,$4,$4)", [version, ids.bones, ids.kg, Number(byproduct.unitCost)]);
  const production = await service.completeProduction({ warehouseId: ids.kitchen, recipeVersionId: version, plannedYield: 1, actualYield: 0.9, tolerancePercent: 5, outputLotCode: "FONDO-001" }, admin.id);
  assert.equal(production.status, "COMPLETED");
  assert.equal(production.outOfTolerance, true);
  assert.equal(Number(production.yieldDifferencePercent), -10);
  pass("Producción técnica", "La receta consumió un lote FEFO, produjo un nuevo lote y alertó rendimiento -10% fuera de tolerancia");

  await assert.rejects(serviceDb.query("UPDATE inventory_processing_batches SET observation='alterado' WHERE id=$1", [processing.id]), /inmutable/);
  pass("Historial inmutable", "Una transformación completada no pudo ser modificada directamente");

  await serviceDb.end();
  serviceDb = null;
  const rollback = await adminPool.connect();
  try {
    await rollback.query(`SET search_path TO ${schema}`);
    await rollback.query(await readFile(join(migrations, "008_opening_lots_for_transformations.down.sql"), "utf8"));
    await rollback.query(await readFile(join(migrations, "007_processing_production_portioning.down.sql"), "utf8"));
    assert.equal((await rollback.query("SELECT to_regclass('inventory_portioning_batches') item")).rows[0].item, null);
    pass("Rollback controlado", "La migración 007 se revirtió en un esquema aislado sin tocar datos productivos");
  } finally {
    await rollback.query("SET search_path TO public");
    rollback.release();
  }
  console.log(JSON.stringify({ status: "PASSED", tests: results.length, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", completed: results, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (serviceDb) await serviceDb.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.end();
}
