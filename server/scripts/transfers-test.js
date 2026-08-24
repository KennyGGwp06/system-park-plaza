import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const adminPool = new Pool({ connectionString: sourceUrl });
const schema = `transfers_test_${process.pid}_${Date.now()}`;
const migrationRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const results = [];
const pass = (name, detail) => results.push({ name, detail });
let serviceDb;

try {
  const sourceState = structuredClone((await adminPool.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data);
  sourceState.users.push({ id: 7, firstName: "Julia", lastName: "Cocina", email: "cocina2@test.local", role: "RESTAURANTE", status: "ACTIVO", permissions: ["INVENTARIO:VER"] });
  sourceState.employees.push({ id: 7, firstName: "Julia", lastName: "Cocina", role: "RESTAURANTE", baseRole: "RESTAURANTE", status: "ACTIVO" });
  const setup = await adminPool.connect();
  let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await setup.query(`SET search_path TO ${schema}`);
    for (const migration of ["001_inventory_intelligent.up.sql", "002_product_master_catalog.up.sql", "003_purchasing_receiving.up.sql", "004_warehouses_transfers.up.sql"]) await setup.query(await readFile(join(migrationRoot, migration), "utf8"));
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await setup.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)", [JSON.stringify(sourceState)]);
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG','Kilogramo','kg','MASS',3) ON CONFLICT(code) DO NOTHING");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('TRANSFER_TEST','Transferencias') ON CONFLICT(code) DO NOTHING");
    const unit=(await setup.query("SELECT id FROM inventory_units WHERE code='KG'")).rows[0].id;
    const category=(await setup.query("SELECT id FROM inventory_categories WHERE code='TRANSFER_TEST'")).rows[0].id;
    const product=(await setup.query("INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code) VALUES('TRANSFER_RICE','Arroz para transferencias',$1,$2,$2,'RAW_MATERIAL',5,'ACTIVE','RESTAURANTE') RETURNING id",[category,unit])).rows[0].id;
    const warehouses=(await setup.query("SELECT id,code FROM inventory_warehouses")).rows;
    const wid=(code)=>warehouses.find((item)=>item.code===code).id;
    await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,100,0),($1,$3,20,0),($1,$4,10,0)",[product,wid("GENERAL"),wid("RESTAURANTE"),wid("BARTENDER")]);
    ids={product,unit,general:wid("GENERAL"),kitchen:wid("RESTAURANTE"),bar:wid("BARTENDER"),transit:wid("TRANSIT"),discrepancy:wid("DISCREPANCY")};
  } finally { await setup.query("SET search_path TO public"); setup.release(); }

  const testUrl=new URL(sourceUrl); testUrl.searchParams.set("options",`-c search_path=${schema}`); process.env.DATABASE_URL=testUrl.toString();
  const transfers=await import(`../src/transfers.js?test=${Date.now()}`); serviceDb=(await import("../src/db.js")).db;
  const create=(from,to,quantity,actor=1)=>transfers.createTransfer({fromWarehouseId:from,toWarehouseId:to,lines:[{productId:ids.product,quantity}],observation:"Prueba automatizada"},actor);
  const receive=(transfer,quantity,actor)=>transfers.receiveTransfer(transfer.id,{lines:[{lineId:transfer.lines[0].id,receivedQuantity:quantity}],observation:"Conteo físico"},actor);
  const balance=async(warehouse)=>Number((await serviceDb.query("SELECT COALESCE(SUM(on_hand),0) qty FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2",[ids.product,warehouse])).rows[0].qty);
  const reserved=async(warehouse)=>Number((await serviceDb.query("SELECT COALESCE(SUM(reserved),0) qty FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2",[ids.product,warehouse])).rows[0].qty);

  let transfer=await create(ids.general,ids.kitchen,10);
  assert.equal(await reserved(ids.general),10); assert.equal(Number((await transfers.transferStockOverview()).warehouses.find((item)=>Number(item.warehouseId)===Number(ids.general)).available),90);
  transfer=await transfers.sendTransfer(transfer.id,{},1); assert.equal(transfer.status,"SENT"); assert.equal(await balance(ids.general),90); assert.equal(await balance(ids.transit),10);
  transfer=await receive(transfer,10,3); assert.equal(transfer.status,"RECEIVED"); assert.equal(await balance(ids.kitchen),30); assert.equal(await balance(ids.transit),0);
  pass("Transferencia correcta","10 kg salieron de General, pasaron por Tránsito y llegaron a Cocina");

  transfer=await create(ids.general,ids.bar,10); transfer=await transfers.sendTransfer(transfer.id,{},1); transfer=await receive(transfer,8,4);
  assert.equal(transfer.status,"RECEIVED_WITH_DIFFERENCE"); assert.equal(Number(transfer.lines[0].differenceQuantity),-2); assert.equal(transfer.alerts[0].alertType,"SHORTAGE"); assert.equal(await balance(ids.discrepancy),2);
  pass("Recepción con menor cantidad","Faltante de 2 kg movido a Diferencias y alerta creada");

  transfer=await create(ids.general,ids.kitchen,5); transfer=await transfers.sendTransfer(transfer.id,{},1); transfer=await receive(transfer,6,3);
  assert.equal(transfer.status,"RECEIVED_WITH_DIFFERENCE"); assert.equal(Number(transfer.lines[0].differenceQuantity),1); assert.equal(transfer.alerts[0].alertType,"OVERAGE");
  pass("Recepción con mayor cantidad","Sobrante físico de 1 kg registrado con movimiento y alerta");

  const kitchenBeforeReject=await balance(ids.kitchen); transfer=await create(ids.kitchen,ids.bar,4,3); transfer=await transfers.sendTransfer(transfer.id,{},3); assert.equal(await balance(ids.transit),4);
  transfer=await transfers.rejectTransfer(transfer.id,{observation:"Producto dañado"},4); assert.equal(transfer.status,"REJECTED"); assert.equal(await balance(ids.kitchen),kitchenBeforeReject); assert.equal(await balance(ids.transit),0);
  pass("Rechazo","La mercancía volvió desde Tránsito al origen sin duplicarse");

  const generalBeforeCancel=await balance(ids.general); transfer=await create(ids.general,ids.bar,3); assert.equal(await reserved(ids.general),3); transfer=await transfers.cancelTransfer(transfer.id,{observation:"Solicitud anulada"},1);
  assert.equal(transfer.status,"CANCELLED"); assert.equal(await balance(ids.general),generalBeforeCancel); assert.equal(await reserved(ids.general),0);
  pass("Cancelación antes del envío","Reserva liberada; no se creó movimiento de stock");

  transfer=await create(ids.general,ids.bar,2); transfer=await transfers.sendTransfer(transfer.id,{},1); transfer=await receive(transfer,2,4);
  await assert.rejects(receive(transfer,2,4),/ya fue procesada/);
  pass("Intento de recepción doble","La segunda confirmación fue rechazada");

  transfer=await create(ids.general,ids.kitchen,2); transfer=await transfers.sendTransfer(transfer.id,{},1);
  const concurrent=await Promise.allSettled([receive(transfer,2,3),receive(transfer,2,7)]);
  assert.equal(concurrent.filter((item)=>item.status==="fulfilled").length,1); assert.equal(concurrent.filter((item)=>item.status==="rejected").length,1); assert.equal(await balance(ids.transit),0);
  pass("Recepción simultánea","Bloqueo transaccional: un usuario confirmó y el otro recibió conflicto");

  transfer=await create(ids.kitchen,ids.bar,1,3); transfer=await transfers.sendTransfer(transfer.id,{},3);
  await assert.rejects(receive(transfer,1,3),/emisor no puede/); await receive(transfer,1,4);
  pass("Separación emisor/receptor","El mismo usuario no pudo confirmar ambos lados");

  const movementCount=Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_movements WHERE source_type='INVENTORY_TRANSFER'")).rows[0].count);
  assert.equal(movementCount,16); assert.equal(await balance(ids.transit),0);
  pass("Movimientos auditados y tránsito en cero","16 movimientos idempotentes; ninguna existencia quedó duplicada en tránsito");

  await serviceDb.end(); serviceDb=null;
  const rollback=await adminPool.connect();
  try{await rollback.query(`SET search_path TO ${schema}`); await rollback.query(await readFile(join(migrationRoot,"004_warehouses_transfers.down.sql"),"utf8")); const removed=await rollback.query("SELECT to_regclass('inventory_transfer_alerts') alerts"); assert.equal(removed.rows[0].alerts,null); pass("Rollback controlado","La migración 004 fue revertida en esquema aislado");} finally {await rollback.query("SET search_path TO public");rollback.release();}
  console.log(JSON.stringify({status:"PASSED",tests:results.length,results},null,2));
} catch(error){console.error(JSON.stringify({status:"FAILED",completed:results,message:error.message,stack:error.stack},null,2));process.exitCode=1;}
finally{if(serviceDb)await serviceDb.end();await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await adminPool.end();}
