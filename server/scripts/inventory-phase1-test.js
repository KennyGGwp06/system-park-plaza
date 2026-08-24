import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrateLegacyInventory } from "../src/inventory-relational.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const schema = `inventory_phase1_test_${process.pid}_${Date.now()}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const upSql = await readFile(join(root, "001_inventory_intelligent.up.sql"), "utf8");
const downSql = await readFile(join(root, "001_inventory_intelligent.down.sql"), "utf8");
const results = [];
const ok = (name, detail = "") => results.push({ name, ok: true, detail });

async function setSchema(client) {
  await client.query(`SET search_path TO ${schema}`);
}

let admin;
try {
  admin = await pool.connect();
  const source = await admin.query("SELECT data FROM public.app_state WHERE id = 1");
  assert.equal(source.rowCount, 1, "No existe app_state para migrar");
  const state = source.rows[0].data;
  const stateSnapshot = JSON.stringify(state);

  await admin.query(`CREATE SCHEMA ${schema}`);
  await setSchema(admin);
  await admin.query(upSql);
  ok("Migración UP ejecutable", schema);

  await admin.query("BEGIN");
  await migrateLegacyInventory(admin, state);
  await admin.query("COMMIT");

  const productCount = Number((await admin.query("SELECT COUNT(*) FROM inventory_products")).rows[0].count);
  assert.equal(productCount, state.inventory.length);
  ok("Productos actuales migrados", `${productCount}/${state.inventory.length}`);

  const balances = await admin.query(`
    SELECT p.legacy_id, SUM(b.on_hand)::numeric AS on_hand
    FROM inventory_products p JOIN inventory_stock_balances b ON b.product_id = p.id
    GROUP BY p.legacy_id ORDER BY p.legacy_id
  `);
  for (const row of balances.rows) {
    const legacy = state.inventory.find((item) => Number(item.id) === Number(row.legacy_id));
    assert.ok(legacy);
    assert.equal(Number(row.on_hand), Number(legacy.stock));
  }
  assert.equal(balances.rowCount, state.inventory.length);
  ok("Existencias actuales conciliadas", `${balances.rowCount} saldos exactos`);

  const recipeCount = Number((await admin.query("SELECT COUNT(*) FROM inventory_recipes")).rows[0].count);
  const ingredientCount = Number((await admin.query("SELECT COUNT(*) FROM inventory_recipe_ingredients")).rows[0].count);
  assert.equal(recipeCount, state.menuItems.length);
  assert.equal(ingredientCount, state.menuItems.reduce((sum, item) => sum + (item.recipe || []).length, 0));
  ok("Recetas y versiones migradas", `${recipeCount} recetas, ${ingredientCount} ingredientes`);

  assert.equal(JSON.stringify(state), stateSnapshot);
  assert.ok(Array.isArray(state.orders));
  ok("Pedidos existentes conservados", `${state.orders.length} pedidos sin mutación`);

  const unitMass = (await admin.query("SELECT id FROM inventory_units WHERE code = 'KG'")).rows[0].id;
  const unitVolume = (await admin.query("SELECT id FROM inventory_units WHERE code = 'ML'")).rows[0].id;
  await assert.rejects(
    admin.query("INSERT INTO inventory_product_conversions(from_unit_id, to_unit_id, factor) VALUES ($1, $2, 1000)", [unitMass, unitVolume]),
    /producto específico/
  );
  ok("Conversión masa-volumen protegida");

  const testProduct = (await admin.query(`
    INSERT INTO inventory_products(code, name, base_unit_id, product_type) VALUES ('CONCURRENCY_TEST', 'Producto concurrencia', $1, 'RAW_MATERIAL') RETURNING id
  `, [unitMass])).rows[0];
  const testWarehouse = (await admin.query(`
    INSERT INTO inventory_warehouses(code, name, warehouse_type) VALUES ('CONCURRENCY_TEST', 'Almacén concurrencia', 'OPERATIONAL') RETURNING id
  `)).rows[0];
  await admin.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9)", ["test:opening", "TEST_OPENING", testProduct.id, 10, null, testWarehouse.id, null, 1, "Apertura de prueba"]);

  const c1 = await pool.connect();
  const c2 = await pool.connect();
  try {
    await setSchema(c1);
    await setSchema(c2);
    const attempts = await Promise.allSettled([
      c1.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9)", ["test:exit:1", "TEST_EXIT", testProduct.id, 7, testWarehouse.id, null, null, 1, "Salida concurrente 1"]),
      c2.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9)", ["test:exit:2", "TEST_EXIT", testProduct.id, 7, testWarehouse.id, null, null, 1, "Salida concurrente 2"])
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
  } finally {
    await c1.query("SET search_path TO public");
    await c2.query("SET search_path TO public");
    c1.release();
    c2.release();
  }
  const finalBalance = Number((await admin.query("SELECT on_hand FROM inventory_stock_balances WHERE product_id = $1 AND warehouse_id = $2", [testProduct.id, testWarehouse.id])).rows[0].on_hand);
  assert.equal(finalBalance, 3);
  ok("Concurrencia básica sin stock negativo", `saldo final ${finalBalance}`);

  const movementId = (await admin.query("SELECT id FROM inventory_movements WHERE idempotency_key = 'test:opening'")).rows[0].id;
  await assert.rejects(admin.query("UPDATE inventory_movements SET reason = 'alterado' WHERE id = $1", [movementId]), /inmutables/);
  ok("Movimientos históricos inmutables");

  await admin.query(downSql);
  const removed = await admin.query("SELECT to_regclass('inventory_products') AS table_name");
  assert.equal(removed.rows[0].table_name, null);
  ok("Rollback controlado ejecutable", "esquema aislado revertido");

  await admin.query("SET search_path TO public");
  const sourceAfter = await admin.query("SELECT data FROM public.app_state WHERE id = 1");
  assert.equal(JSON.stringify(sourceAfter.rows[0].data), stateSnapshot);
  ok("Datos productivos no alterados por las pruebas");

  console.log(JSON.stringify({ status: "PASSED", tests: results.length, results }, null, 2));
} catch (error) {
  try { await admin?.query("ROLLBACK"); } catch {}
  console.error(JSON.stringify({ status: "FAILED", testsPassed: results, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  if (admin) {
    try {
      await admin.query("SET search_path TO public");
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } catch {}
    admin.release();
  }
  await pool.end();
}
