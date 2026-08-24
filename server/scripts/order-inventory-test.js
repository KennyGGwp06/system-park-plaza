import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const adminPool = new Pool({ connectionString: sourceUrl });
const schema = `order_inventory_test_${process.pid}_${Date.now()}`;
const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const results = [];
const pass = (name, detail) => results.push({ name, detail });
let serviceDb;

try {
  const setup = await adminPool.connect(); let ids;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await setup.query(`SET search_path TO ${schema}`);
    const files = await readdir(migrations);
    for (const number of ["001","002","003","004","005","006","007","008","009"]) {
      const file = files.find((name) => name.startsWith(`${number}_`) && name.endsWith(".up.sql"));
      await setup.query(await readFile(join(migrations, file), "utf8"));
    }
    await setup.query("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())");
    await setup.query("INSERT INTO app_state VALUES(1,'{}'::jsonb,NOW())");
    await setup.query("INSERT INTO inventory_units(code,name,symbol,dimension,decimal_places) VALUES('KG_OI','Kilogramo','kg','MASS',3),('ML_OI','Mililitro','ml','VOLUME',3),('UND_OI','Unidad','und','COUNT',0)");
    await setup.query("INSERT INTO inventory_categories(code,name) VALUES('OI_RAW','Ingredientes')");
    const unitRows=(await setup.query("SELECT id,code FROM inventory_units WHERE code LIKE '%_OI'")).rows;const uid=(code)=>Number(unitRows.find((row)=>row.code===code).id);const category=Number((await setup.query("SELECT id FROM inventory_categories WHERE code='OI_RAW'")).rows[0].id);
    const product=async(legacy,code,name,unit,cost,area)=>Number((await setup.query(`INSERT INTO inventory_products(legacy_id,code,name,category_id,base_unit_id,purchase_unit_id,product_type,average_cost,status,default_area_code) VALUES($1,$2,$3,$4,$5,$5,'RAW_MATERIAL',$6,'ACTIVE',$7) RETURNING id`,[legacy,code,name,category,uid(unit),cost,area])).rows[0].id);
    ids={kg:uid("KG_OI"),ml:uid("ML_OI"),unit:uid("UND_OI"),chicken:await product(101,"OI_CHICKEN","Pollo","KG_OI",10,"RESTAURANTE"),pisco:await product(102,"OI_PISCO","Pisco","ML_OI",0.04,"BARTENDER"),restaurant:Number((await setup.query("SELECT id FROM inventory_warehouses WHERE code='RESTAURANTE'")).rows[0].id),bar:Number((await setup.query("SELECT id FROM inventory_warehouses WHERE code='BARTENDER'")).rows[0].id)};
    ids.chickenLot=Number((await setup.query("INSERT INTO inventory_lots(product_id,lot_code,unit_cost,expires_on) VALUES($1,'POLLO-OI-001',10,CURRENT_DATE+5) RETURNING id",[ids.chicken])).rows[0].id);
    ids.piscoLot=Number((await setup.query("INSERT INTO inventory_lots(product_id,lot_code,unit_cost,expires_on) VALUES($1,'PISCO-OI-001',0.04,CURRENT_DATE+30) RETURNING id",[ids.pisco])).rows[0].id);
    await setup.query("INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand) VALUES($1,$2,$3,100),($4,$5,$6,10000)",[ids.chicken,ids.restaurant,ids.chickenLot,ids.pisco,ids.bar,ids.piscoLot]);
    await setup.query(`INSERT INTO inventory_shift_sessions
      (warehouse_id,area_code,operational_date,shift_code,responsible_legacy_user_id,status,opened_at,period_started_at,opening_source)
      VALUES
      ($1,'RESTAURANTE',CURRENT_DATE,'ALMUERZO',3,'OPEN',NOW(),NOW(),'OPENING_COUNT'),
      ($2,'BARTENDER',CURRENT_DATE,'TARDE',4,'OPEN',NOW(),NOW(),'OPENING_COUNT')`,[ids.restaurant,ids.bar]);
    const recipe=async(code,name,area,menuId,productId,qty,unitId,cost)=>{const rid=Number((await setup.query("INSERT INTO inventory_recipes(code,name,area_code,legacy_menu_item_id,recipe_type) VALUES($1,$2,$3,$4,'MENU') RETURNING id",[code,name,area,menuId])).rows[0].id);const vid=Number((await setup.query("INSERT INTO inventory_recipe_versions(recipe_id,version,status,yield_quantity,yield_unit_id,total_cost,cost_per_portion,sale_price) VALUES($1,1,'ACTIVE',1,$2,$3,$3,20) RETURNING id",[rid,ids.unit,cost])).rows[0].id);await setup.query("INSERT INTO inventory_recipe_ingredients(recipe_version_id,product_id,quantity,unit_id,base_quantity,unit_cost_snapshot,line_cost) VALUES($1,$2,$3,$4,$3,$5,$6)",[vid,productId,qty,unitId,productId===ids.chicken?10:0.04,cost]);return vid;};
    ids.restaurantRecipe=await recipe("OI_DISH","Pollo a la plancha","RESTAURANTE",501,ids.chicken,0.25,ids.kg,2.5);
    ids.barRecipe=await recipe("OI_DRINK","Pisco sour","BARTENDER",502,ids.pisco,60,ids.ml,2.4);
  } finally { await setup.query("SET search_path TO public"); setup.release(); }

  const testUrl=new URL(sourceUrl);testUrl.searchParams.set("options",`-c search_path=${schema}`);process.env.DATABASE_URL=testUrl.toString();
  const service=await import(`../src/order-inventory.js?test=${Date.now()}`);serviceDb=(await import("../src/db.js")).db;const client=await serviceDb.connect();
  const admin={id:1,role:"ADMINISTRADOR"};const restaurantUser={id:3,role:"RESTAURANTE"};const barUser={id:4,role:"BARTENDER"};
  const state={inventory:[{id:101,name:"Pollo",stock:100,reserved:0},{id:102,name:"Pisco",stock:10000,reserved:0}],orders:[]};
  const order=(id,area,menuItemId,recipeVersionId,name,quantity=1,groupCode=null)=>({id,code:`PED-${id}`,groupCode,area,clientId:1,roomId:101,status:"PENDIENTE",items:[{menuItemId,recipeVersionId,recipeVersion:1,recipeUnitCost:area==="RESTAURANTE"?2.5:2.4,name,quantity,price:20,area}],total:20*quantity,estimatedMinutes:10,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const stock=async(product,warehouse)=>{const row=(await client.query("SELECT SUM(on_hand) on_hand,SUM(reserved) reserved FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2",[product,warehouse])).rows[0];return{onHand:Number(row.on_hand),reserved:Number(row.reserved)};};
  try {
    await client.query("BEGIN");
    const restaurant=order(1001,"RESTAURANTE",501,ids.restaurantRecipe,"Pollo a la plancha",2);state.orders.push(restaurant);await service.confirmOrdersInventory(client,state,[restaurant]);assert.deepEqual(await stock(ids.chicken,ids.restaurant),{onHand:100,reserved:0.5});assert.equal(restaurant.inventoryStatus,"RESERVADO");pass("Pedido de restaurante","Dos platos reservaron 0.5 kg del lote FEFO de Cocina");

    const bar=order(1002,"BARTENDER",502,ids.barRecipe,"Pisco sour",2);state.orders.push(bar);await service.confirmOrdersInventory(client,state,[bar]);assert.deepEqual(await stock(ids.pisco,ids.bar),{onHand:10000,reserved:120});pass("Pedido de bar","Dos bebidas reservaron 120 ml exclusivamente en Bar");

    const mixedRestaurant=order(1003,"RESTAURANTE",501,ids.restaurantRecipe,"Pollo a la plancha",1,"MIX-01"),mixedBar=order(1004,"BARTENDER",502,ids.barRecipe,"Pisco sour",1,"MIX-01");state.orders.push(mixedRestaurant,mixedBar);await service.confirmOrdersInventory(client,state,[mixedRestaurant,mixedBar]);const mixedAreas=(await client.query("SELECT DISTINCT area_code FROM inventory_order_lines WHERE group_code='MIX-01' ORDER BY area_code")).rows.map(row=>row.area_code);assert.deepEqual(mixedAreas,["BARTENDER","RESTAURANTE"]);assert.equal(Number((await client.query("SELECT COUNT(*) count FROM inventory_order_events WHERE group_code='MIX-01' AND event_type='CONFIRM'")).rows[0].count),2);pass("Pedido combinado","Una compra creó dos pedidos ligados por grupo y reservas independientes por área");

    const early=order(1005,"RESTAURANTE",501,ids.restaurantRecipe,"Pollo a la plancha");state.orders.push(early);await service.confirmOrdersInventory(client,state,[early]);const beforeEarly=(await stock(ids.chicken,ids.restaurant)).onHand;await service.transitionOrderInventory(client,state,early.id,"CANCELADO",restaurantUser,{});const afterEarly=await stock(ids.chicken,ids.restaurant);assert.equal(afterEarly.onHand,beforeEarly);assert.equal((await client.query("SELECT r.status FROM inventory_order_reservations r JOIN inventory_order_lines l ON l.id=r.order_line_id WHERE l.legacy_order_id=$1",[early.id])).rows[0].status,"RELEASED");pass("Cancelación antes de preparar","La reserva fue liberada y el stock físico no cambió");

    const late=order(1006,"RESTAURANTE",501,ids.restaurantRecipe,"Pollo a la plancha");state.orders.push(late);await service.confirmOrdersInventory(client,state,[late]);await service.transitionOrderInventory(client,state,late.id,"EN_COCINA",restaurantUser,{});await service.transitionOrderInventory(client,state,late.id,"PREPARANDO",restaurantUser,{});const beforeLate=(await stock(ids.chicken,ids.restaurant)).onHand;await service.transitionOrderInventory(client,state,late.id,"CANCELADO",restaurantUser,{lossType:"WASTE",reason:"Cliente canceló con el plato preparado"});const afterLate=(await stock(ids.chicken,ids.restaurant)).onHand;assert.equal(r6Test(beforeLate-afterLate),0.25);assert.equal(Number((await client.query("SELECT COUNT(*) count FROM inventory_order_cancellation_losses WHERE legacy_order_id=$1",[late.id])).rows[0].count),1);pass("Cancelación después de preparar","No devolvió ingredientes: registró 0.25 kg como merma con movimiento y motivo");

    await service.transitionOrderInventory(client,state,restaurant.id,"EN_COCINA",restaurantUser,{});await service.transitionOrderInventory(client,state,restaurant.id,"PREPARANDO",restaurantUser,{});const beforeReady=(await stock(ids.chicken,ids.restaurant)).onHand;await service.transitionOrderInventory(client,state,restaurant.id,"LISTO",restaurantUser,{});const afterReady=(await stock(ids.chicken,ids.restaurant)).onHand;assert.equal(afterReady,beforeReady);assert.equal((await client.query("SELECT r.status FROM inventory_order_reservations r JOIN inventory_order_lines l ON l.id=r.order_line_id WHERE l.legacy_order_id=$1",[restaurant.id])).rows[0].status,"COMMITTED");pass("Plato listo conserva la reserva","El plato quedó listo para entregar sin alterar todavía el inventario físico");const beforeDelivery=afterReady;await service.transitionOrderInventory(client,state,restaurant.id,"ENTREGADO",restaurantUser,{});const deliveredOnce=(await stock(ids.chicken,ids.restaurant)).onHand;assert.equal(r6Test(beforeDelivery-deliveredOnce),0.5);assert.ok((await client.query("SELECT 1 FROM inventory_consolidated_sales WHERE legacy_order_id=$1",[restaurant.id])).rowCount);assert.equal((await client.query("SELECT status FROM inventory_recipe_sales WHERE legacy_order_id=$1",[restaurant.id])).rows[0].status,"CONSUMED");assert.equal((await client.query("SELECT r.status FROM inventory_order_reservations r JOIN inventory_order_lines l ON l.id=r.order_line_id WHERE l.legacy_order_id=$1",[restaurant.id])).rows[0].status,"CONSUMED");pass("Entrega descuenta y consolida","La entrega descontó exactamente 0.5 kg, consumió la reserva y generó la venta una sola vez");

    const movementCount=Number((await client.query("SELECT COUNT(*) count FROM inventory_movements WHERE source_type='ORDER' AND source_legacy_id=$1",[restaurant.id])).rows[0].count);await service.transitionOrderInventory(client,state,restaurant.id,"ENTREGADO",restaurantUser,{});assert.equal(Number((await client.query("SELECT COUNT(*) count FROM inventory_movements WHERE source_type='ORDER' AND source_legacy_id=$1",[restaurant.id])).rows[0].count),movementCount);assert.equal((await stock(ids.chicken,ids.restaurant)).onHand,deliveredOnce);pass("Reintento idempotente","Repetir ENTREGADO devolvió el mismo resultado sin otro movimiento ni descuento");

    const readyCancelled=order(1007,"RESTAURANTE",501,ids.restaurantRecipe,"Pollo a la plancha");state.orders.push(readyCancelled);await service.confirmOrdersInventory(client,state,[readyCancelled]);await service.transitionOrderInventory(client,state,readyCancelled.id,"EN_COCINA",restaurantUser,{});await service.transitionOrderInventory(client,state,readyCancelled.id,"PREPARANDO",restaurantUser,{});await service.transitionOrderInventory(client,state,readyCancelled.id,"LISTO",restaurantUser,{});const beforeReadyCancel=(await stock(ids.chicken,ids.restaurant)).onHand;await service.transitionOrderInventory(client,state,readyCancelled.id,"CANCELADO",restaurantUser,{lossType:"WASTE",reason:"Cliente canceló cuando el plato ya estaba listo"});const afterReadyCancel=(await stock(ids.chicken,ids.restaurant)).onHand;assert.equal(r6Test(beforeReadyCancel-afterReadyCancel),0.25);assert.equal(Number((await client.query("SELECT COUNT(*) count FROM inventory_order_cancellation_losses WHERE legacy_order_id=$1",[readyCancelled.id])).rows[0].count),1);pass("Cancelación de producto listo","Descontó 0.25 kg una sola vez y clasificó como merma el plato que ya no podía devolverse al inventario");

    await assert.rejects(service.transitionOrderInventory(client,state,bar.id,"PREPARANDO",restaurantUser,{}),/no puede operar pedidos de BARTENDER/);await service.transitionOrderInventory(client,state,bar.id,"PREPARANDO",barUser,{});pass("Separación por área","Cocina no pudo operar el pedido de Bar; Bar sí recibió y preparó su propio pedido");

    const detail=await service.orderInventoryDetail(client,restaurant.id);assert.equal(Number(detail.lines[0].recipe_version_id),ids.restaurantRecipe);assert.equal(Number(detail.lines[0].recipe_unit_cost),2.5);assert.equal(Number(detail.preparation[0].required_base_quantity),0.5);assert.equal(detail.preparation[0].ingredient_name,"Pollo");assert.ok(detail.events.some(event=>event.event_type==="DELIVER"));pass("Guía, costo y versión históricos","La guía muestra 0.5 kg exactos; la línea conserva receta v1 y costo S/ 2.50");
    await client.query("COMMIT");
  } catch(error){await client.query("ROLLBACK");throw error;} finally { client.release(); }

  await serviceDb.end();serviceDb=null;const rollback=await adminPool.connect();try{await rollback.query(`SET search_path TO ${schema}`);await rollback.query(await readFile(join(migrations,"009_orders_inventory_sales.down.sql"),"utf8"));assert.equal((await rollback.query("SELECT to_regclass('inventory_order_events') item")).rows[0].item,null);pass("Rollback controlado","La migración 009 se revirtió en el esquema aislado");}finally{await rollback.query("SET search_path TO public");rollback.release();}
  console.log(JSON.stringify({status:"PASSED",tests:results.length,results},null,2));
} catch(error){console.error(JSON.stringify({status:"FAILED",completed:results,message:error.message,stack:error.stack},null,2));process.exitCode=1;}finally{if(serviceDb)await serviceDb.end();await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await adminPool.end();}

function r6Test(value){return Math.round((Number(value)+Number.EPSILON)*1_000_000)/1_000_000;}
