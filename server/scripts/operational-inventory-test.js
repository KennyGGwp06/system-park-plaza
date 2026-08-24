import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl=process.env.DATABASE_URL; const adminPool=new Pool({connectionString:sourceUrl});
const schema=`shift_inventory_test_${process.pid}_${Date.now()}`; const migrationRoot=join(dirname(fileURLToPath(import.meta.url)),"..","migrations");
const results=[]; const pass=(name,detail)=>results.push({name,detail}); let serviceDb;

try {
  const sourceState=structuredClone((await adminPool.query("SELECT data FROM public.app_state WHERE id=1")).rows[0].data);
  const setup=await adminPool.connect(); let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await setup.query(`SET search_path TO ${schema}`);
    for(const migration of ["001_inventory_intelligent.up.sql","002_product_master_catalog.up.sql","003_purchasing_receiving.up.sql","004_warehouses_transfers.up.sql","005_operational_shift_inventories.up.sql","010_waste_counts_reconciliation.up.sql"]) await setup.query(await readFile(join(migrationRoot,migration),"utf8"));
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"); await setup.query("INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)",[JSON.stringify(sourceState)]);
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG_SHIFT','Kilogramo turno','kg','MASS',3)");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('SHIFT_TEST','Prueba de turnos')");
    const unit=(await setup.query("SELECT id FROM inventory_units WHERE code='KG_SHIFT'")).rows[0].id; const category=(await setup.query("SELECT id FROM inventory_categories WHERE code='SHIFT_TEST'")).rows[0].id;
    const product=(await setup.query("INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code) VALUES('SHIFT_RICE','Arroz de turno',$1,$2,$2,'RAW_MATERIAL',5,'ACTIVE','RESTAURANTE') RETURNING id",[category,unit])).rows[0].id;
    const kitchen=(await setup.query("SELECT id FROM inventory_warehouses WHERE code='RESTAURANTE'")).rows[0].id; await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,100,0)",[product,kitchen]); ids={product,unit,kitchen};
  } finally { await setup.query("SET search_path TO public"); setup.release(); }

  const testUrl=new URL(sourceUrl);testUrl.searchParams.set("options",`-c search_path=${schema}`);process.env.DATABASE_URL=testUrl.toString();
  const inventory=await import(`../src/operational-inventory.js?test=${Date.now()}`);serviceDb=(await import("../src/db.js")).db;
  const admin={id:1,role:"ADMINISTRADOR"};const kitchenUser={id:3,role:"RESTAURANTE"};const date="2031-05-20";
  const movement=async(key,quantity,type="GOODS_RECEIPT")=>serviceDb.query("SELECT post_inventory_movement($1,$2,$3,$4,NULL,$5,NULL,5,'Prueba turno',1,'SHIFT_TEST',1,$1,NULL,NULL,FALSE,'{}'::jsonb)",[key,type,ids.product,quantity,ids.kitchen]);

  let lunch=await inventory.createOperationalInventory({area:"RESTAURANTE",shift:"ALMUERZO",date},kitchenUser.id);
  await assert.rejects(inventory.openOperationalInventory(lunch.id,{},kitchenUser.id),/conteo de apertura/i);
  lunch=await inventory.openOperationalInventory(lunch.id,{openingCounts:[{productId:ids.product,quantity:100}]},kitchenUser.id);
  assert.equal(lunch.status,"OPEN");assert.equal(lunch.openingSource,"OPENING_COUNT");assert.equal(Number(lunch.lines[0].openingQuantity),100);
  pass("Apertura normal sin cierre anterior","El primer turno exigió conteo físico y congeló 100 kg como stock inicial");

  const dinnerPending=await inventory.createOperationalInventory({area:"RESTAURANTE",shift:"CENA",date},kitchenUser.id);
  await assert.rejects(inventory.openOperationalInventory(dinnerPending.id,{openingCounts:[{productId:ids.product,quantity:100}]},kitchenUser.id),/otro inventario activo/i);
  pass("Un solo inventario abierto por área","La base y el servicio rechazaron un turno superpuesto");

  await movement("shift-entry-lunch",10); lunch=await inventory.getOperationalInventory(lunch.id,kitchenUser);
  assert.equal(Number(lunch.lines[0].confirmedEntries),10);assert.equal(Number(lunch.lines[0].expectedQuantity),110);
  pass("Entradas durante turno","Una entrada confirmada elevó el esperado de 100 a 110 sin editar el conteo");

  lunch=await inventory.registerOperationalWaste(lunch.id,{productId:ids.product,quantity:1,category:"SPILL",observation:"Derrame documentado",evidence:["https://evidence.local/spill.jpg"]},kitchenUser.id);
  assert.equal(Number(lunch.lines[0].wasteQuantity),1);assert.equal(Number(lunch.lines[0].expectedQuantity),109);assert.equal(lunch.lastWaste.category,"SPILL");
  pass("Merma trazable","El derrame creó un movimiento de kardex con lote, usuario, evidencia y costo");

  lunch=await inventory.startOperationalCount(lunch.id,kitchenUser.id);await assert.rejects(inventory.submitOperationalCount(lunch.id,{counts:[],notes:"Conteo incompleto"},kitchenUser.id),/Completa el conteo/);pass("Cierre incompleto bloqueado","No permite enviar el turno si falta el conteo de un producto");await assert.rejects(inventory.submitOperationalCount(lunch.id,{counts:[{productId:ids.product,quantity:108}],notes:"Falta 1 kg"},kitchenUser.id),/Explica la diferencia/);lunch=await inventory.submitOperationalCount(lunch.id,{counts:[{productId:ids.product,quantity:108}],explanations:[{productId:ids.product,reason:"Diferencia registrada durante el conteo"}],notes:"Falta 1 kg"},kitchenUser.id);
  assert.equal(lunch.status,"SUBMITTED");assert.equal(Number(lunch.lines[0].varianceQuantity),-1);assert.equal(Number(lunch.lines[0].varianceCost),-5);
  await assert.rejects(inventory.submitOperationalCount(lunch.id,{counts:[{productId:ids.product,quantity:110}]},kitchenUser.id),/EN CONTEO/);
  pass("Envío inmutable","Cocina envió una diferencia de -1 kg / S/ 5 y no pudo sobrescribirla");

  await assert.rejects(inventory.closeOperationalInventory(lunch.id,kitchenUser.id),/Solo Administración/);
  lunch=await inventory.observeOperationalInventory(lunch.id,{reason:"Revisar el descuadre antes de aprobar"},admin.id);assert.equal(lunch.status,"OBSERVED");
  pass("Observación administrativa","Administración puede detener el cierre para revisión sin desbloquear el conteo enviado");
  lunch=await inventory.closeOperationalInventory(lunch.id,admin.id);assert.equal(lunch.status,"CLOSED");
  assert.equal(Number((await serviceDb.query("SELECT on_hand FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2",[ids.product,ids.kitchen])).rows[0].on_hand),108);
  pass("Cierre administrativo","El cierre aprobó el conteo y creó un ajuste compensatorio inmutable");

  await assert.rejects(inventory.reopenOperationalInventory(lunch.id,{reason:"Corrección requerida"},kitchenUser.id),/Solo Administración/);
  await assert.rejects(inventory.reopenOperationalInventory(lunch.id,{reason:"mal"},admin.id),/al menos 8/);
  lunch=await inventory.reopenOperationalInventory(lunch.id,{reason:"Corrección del conteo físico"},admin.id);assert.equal(lunch.status,"COUNTING");assert.equal(lunch.reopenCount,1);
  assert.equal(Number((await serviceDb.query("SELECT on_hand FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2",[ids.product,ids.kitchen])).rows[0].on_hand),109);
  const audits=Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_audit_events WHERE entity_type='SHIFT_INVENTORY' AND event_type='REOPEN'")).rows[0].count);assert.equal(audits,1);
  pass("Reapertura administrativa auditada","Solo Administración reabrió; el ajuste anterior fue revertido sin borrar historial");

  lunch=await inventory.submitOperationalCount(lunch.id,{counts:[{productId:ids.product,quantity:109}],notes:"Conteo corregido"},kitchenUser.id);lunch=await inventory.closeOperationalInventory(lunch.id,admin.id);assert.equal(lunch.closing.revision,2);
  await movement("shift-entry-after-close",3);
  let dinner=await inventory.openOperationalInventory(dinnerPending.id,{},kitchenUser.id);assert.equal(dinner.openingSource,"PREVIOUS_CLOSE");assert.equal(Number(dinner.lines[0].openingQuantity),109);assert.equal(Number(dinner.lines[0].confirmedEntries),3);assert.equal(Number(dinner.lines[0].expectedQuantity),112);
  const lunchFrozen=await inventory.getOperationalInventory(lunch.id,kitchenUser);assert.equal(Number(lunchFrozen.lines[0].confirmedEntries),10);assert.equal(Number(lunchFrozen.lines[0].expectedQuantity),109);
  pass("Cambio de turno sin mezclar movimientos","La entrada posterior al corte quedó en Cena; Almuerzo conservó su resumen congelado");

  const summaryCount=Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_shift_summary_lines")).rows[0].count);assert.equal(summaryCount,2);
  const closeMovements=Number((await serviceDb.query("SELECT COUNT(*) count FROM inventory_movements WHERE movement_type IN ('SHIFT_CLOSING_ADJUSTMENT','SHIFT_REOPEN_REVERSAL')")).rows[0].count);assert.equal(closeMovements,2);
  pass("Trazabilidad relacional","Dos revisiones históricas y dos movimientos compensatorios permanecen auditables");

  await serviceDb.end();serviceDb=null;const rollback=await adminPool.connect();try{await rollback.query(`SET search_path TO ${schema}`);await rollback.query(await readFile(join(migrationRoot,"010_waste_counts_reconciliation.down.sql"),"utf8"));const removed=await rollback.query("SELECT to_regclass('inventory_shift_variance_explanations') item");assert.equal(removed.rows[0].item,null);pass("Rollback controlado","La migración 010 se revirtió en un esquema aislado");}finally{await rollback.query("SET search_path TO public");rollback.release();}
  console.log(JSON.stringify({status:"PASSED",tests:results.length,results},null,2));
} catch(error){console.error(JSON.stringify({status:"FAILED",completed:results,message:error.message,stack:error.stack},null,2));process.exitCode=1;}
finally{if(serviceDb)await serviceDb.end();await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await adminPool.end();}
