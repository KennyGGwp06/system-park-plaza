import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const n = (value) => Number(value || 0);
const round6 = (value) => Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
const ROUTES = new Set(["GENERAL>RESTAURANTE", "GENERAL>BARTENDER", "RESTAURANTE>BARTENDER", "BARTENDER>RESTAURANTE"]);

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

async function lockState(client) {
  return (await client.query("SELECT data FROM app_state WHERE id=1 FOR UPDATE")).rows[0].data;
}

async function saveState(client, state) {
  await client.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
}

function userFrom(state, actorId) {
  const user = (state.users || []).find((item) => n(item.id) === n(actorId));
  if (!user) fail(401, "Usuario no encontrado");
  return user.role === "SUPERADMIN" ? { ...user, role: "ADMINISTRADOR", displayRole: "SUPERADMIN" } : user;
}

function warehouseAllowed(user, code) {
  if (user.role === "ADMINISTRADOR") return true;
  return (user.role === "RESTAURANTE" && code === "RESTAURANTE") || (user.role === "BARTENDER" && code === "BARTENDER");
}

function shiftCode(state, actorId, supplied) {
  if (String(supplied || "").trim()) return String(supplied).trim();
  const today = new Date().toISOString().slice(0, 10);
  const shift = (state.shifts || []).find((item) => n(item.employeeId) === n(actorId) && item.date === today && item.status !== "CANCELADO");
  return shift ? `${shift.date} ${shift.start}-${shift.end} ${shift.area}` : `SIN-TURNO ${today}`;
}

async function audit(client, eventType, entityId, actorId, reason, beforeData, afterData, correlationId) {
  await client.query(`INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,before_data,after_data,correlation_id)
    VALUES($1,'TRANSFER',$2,$3,$4,$5::jsonb,$6::jsonb,$7)`, [eventType, entityId, actorId, reason, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, correlationId]);
}

async function nextLegacyMovementId(client, state) {
  const relational = n((await client.query("SELECT COALESCE(MAX(legacy_id),0)+1 AS id FROM inventory_movements")).rows[0].id);
  const stateNext = Math.max(n(state.counters?.movement) + 1, ...(state.inventoryMovements || []).map((item) => n(item.id) + 1));
  const id = Math.max(relational, stateNext, 1);
  state.counters.movement = id;
  return id;
}

async function postTransferMovement(client, state, movement) {
  const legacyId = await nextLegacyMovementId(client, state);
  const movementId = (await client.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) AS id", [
    movement.idempotencyKey, movement.type, movement.productId, movement.quantity, movement.fromWarehouseId || null, movement.toWarehouseId || null,
    movement.lotId || null, movement.unitCost || 0, movement.reason, movement.actorId, "INVENTORY_TRANSFER", movement.transferId,
    movement.code, legacyId, null, false, JSON.stringify({ transferLineId: movement.lineId, ...movement.metadata })
  ])).rows[0].id;
  const product = (state.inventory || []).find((item) => n(item.relationalId) === n(movement.productId)) || (state.inventory || []).find((item) => n(item.id) === n(movement.legacyProductId));
  state.inventoryMovements.unshift({ id: legacyId, relationalMovementId: Number(movementId), productId: product?.id || null, product: product ? { ...product } : undefined, type: movement.type, quantity: movement.quantity, reason: movement.reason, reference: movement.code, createdById: movement.actorId, createdAt: new Date().toISOString() });
  return Number(movementId);
}

async function syncLegacyProducts(client, state, productIds) {
  for (const productId of [...new Set(productIds.map(Number))]) {
    const product = (await client.query("SELECT id,legacy_id,default_area_code,average_cost FROM inventory_products WHERE id=$1", [productId])).rows[0];
    if (!product?.legacy_id) continue;
    const warehouse = (await client.query("SELECT id FROM inventory_warehouses WHERE code=COALESCE($1,'GENERAL')", [product.default_area_code])).rows[0];
    if (!warehouse) continue;
    const balance = (await client.query("SELECT COALESCE(SUM(on_hand),0) stock,COALESCE(SUM(reserved),0) reserved FROM inventory_stock_balances WHERE product_id=$1 AND warehouse_id=$2", [product.id, warehouse.id])).rows[0];
    const legacy = (state.inventory || []).find((item) => n(item.id) === n(product.legacy_id));
    if (legacy) { legacy.stock = n(balance.stock); legacy.reserved = n(balance.reserved); legacy.cost = n(product.average_cost); }
  }
}

async function readTransfers(client, transferId = null) {
  const params = transferId ? [Number(transferId)] : [];
  const transfers = (await client.query(`SELECT t.id,t.code,t.status,t.from_warehouse_id AS "fromWarehouseId",fw.code AS "fromWarehouseCode",fw.name AS "fromWarehouseName",t.to_warehouse_id AS "toWarehouseId",tw.code AS "toWarehouseCode",tw.name AS "toWarehouseName",t.requested_by_legacy_user_id AS "requestedBy",t.sent_by_legacy_user_id AS "sentBy",t.received_by_legacy_user_id AS "receivedBy",t.sent_shift_code AS "sentShiftCode",t.received_shift_code AS "receivedShiftCode",t.sent_at AS "sentAt",t.received_at AS "receivedAt",t.cancelled_at AS "cancelledAt",t.rejected_at AS "rejectedAt",t.observation,t.created_at AS "createdAt",t.updated_at AS "updatedAt"
    FROM inventory_transfers t JOIN inventory_warehouses fw ON fw.id=t.from_warehouse_id JOIN inventory_warehouses tw ON tw.id=t.to_warehouse_id
    ${transferId ? "WHERE t.id=$1" : ""} ORDER BY t.created_at DESC`, params)).rows;
  if (!transfers.length) return [];
  const ids = transfers.map((item) => item.id);
  const lines = (await client.query(`SELECT tl.id,tl.transfer_id AS "transferId",tl.product_id AS "productId",p.name AS "productName",tl.lot_id AS "lotId",l.lot_code AS "lotCode",tl.unit_id AS "unitId",u.symbol AS "unitSymbol",tl.requested_quantity AS "requestedQuantity",tl.sent_quantity AS "sentQuantity",tl.received_quantity AS "receivedQuantity",tl.difference_quantity AS "differenceQuantity",tl.observation,p.average_cost AS "unitCost"
    FROM inventory_transfer_lines tl JOIN inventory_products p ON p.id=tl.product_id JOIN inventory_units u ON u.id=tl.unit_id LEFT JOIN inventory_lots l ON l.id=tl.lot_id WHERE tl.transfer_id=ANY($1::bigint[]) ORDER BY tl.id`, [ids])).rows;
  const alerts = (await client.query(`SELECT id,transfer_id AS "transferId",transfer_line_id AS "transferLineId",alert_type AS "alertType",severity,sent_quantity AS "sentQuantity",received_quantity AS "receivedQuantity",difference_quantity AS "differenceQuantity",status,created_at AS "createdAt" FROM inventory_transfer_alerts WHERE transfer_id=ANY($1::bigint[]) ORDER BY created_at DESC`, [ids])).rows;
  const state = (await client.query("SELECT data FROM app_state WHERE id=1")).rows[0].data;
  const person = (id) => { const user=(state.users || []).find((item) => n(item.id) === n(id)); return user ? { id:user.id,name:`${user.firstName} ${user.lastName}`,role:user.role } : null; };
  for (const transfer of transfers) {
    transfer.lines = lines.filter((line) => n(line.transferId) === n(transfer.id));
    transfer.alerts = alerts.filter((alert) => n(alert.transferId) === n(transfer.id));
    transfer.requestedUser = person(transfer.requestedBy); transfer.sentUser = person(transfer.sentBy); transfer.receivedUser = person(transfer.receivedBy);
  }
  return transfers;
}

export async function transferReferences(user = null) {
  const [warehouses, stock] = await Promise.all([
    db.query("SELECT id,code,name,warehouse_type AS \"warehouseType\",area_code AS \"areaCode\" FROM inventory_warehouses WHERE active AND code IN ('GENERAL','RESTAURANTE','BARTENDER') ORDER BY CASE code WHEN 'GENERAL' THEN 1 WHEN 'RESTAURANTE' THEN 2 ELSE 3 END"),
    db.query(`SELECT b.warehouse_id AS "warehouseId",w.code AS "warehouseCode",b.product_id AS "productId",p.name AS "productName",p.legacy_id AS "legacyProductId",p.track_lots AS "trackLots",b.lot_id AS "lotId",l.lot_code AS "lotCode",l.expires_on AS "expiresOn",u.id AS "unitId",u.symbol AS "unitSymbol",b.on_hand AS "onHand",b.reserved AS committed,(b.on_hand-b.reserved) AS available
      FROM inventory_stock_balances b JOIN inventory_warehouses w ON w.id=b.warehouse_id JOIN inventory_products p ON p.id=b.product_id JOIN inventory_units u ON u.id=p.base_unit_id LEFT JOIN inventory_lots l ON l.id=b.lot_id
      WHERE w.code IN ('GENERAL','RESTAURANTE','BARTENDER') AND p.status='ACTIVE' ORDER BY w.code,p.name,l.expires_on NULLS LAST`)
  ]);
  if (!user || user.role === "ADMINISTRADOR") return { warehouses: warehouses.rows, stock: stock.rows, routes: [...ROUTES] };
  return { warehouses: warehouses.rows.filter((item) => item.code === user.role), stock: stock.rows.filter((item) => item.warehouseCode === user.role), routes: [] };
}

export async function transferStockOverview(user = null) {
  const rows = (await db.query(`SELECT w.id AS "warehouseId",w.code AS "warehouseCode",w.name AS "warehouseName",w.warehouse_type AS "warehouseType",COALESCE(SUM(b.on_hand),0) AS "onHand",COALESCE(SUM(b.reserved),0) AS committed,COALESCE(SUM(b.on_hand-b.reserved),0) AS available
    FROM inventory_warehouses w LEFT JOIN inventory_stock_balances b ON b.warehouse_id=w.id WHERE w.code IN ('GENERAL','RESTAURANTE','BARTENDER','TRANSIT','DISCREPANCY') GROUP BY w.id ORDER BY w.id`)).rows;
  const visible = !user || user.role === "ADMINISTRADOR" ? rows : rows.filter((item) => item.warehouseCode === user.role);
  return { warehouses: visible, definitions: { available: "Existencia física menos cantidad comprometida", committed: "Reservada por transferencias en borrador", inTransit: "Despachada del origen y todavía no confirmada por el destino" } };
}

function visibleTransfer(item,user){return !user||user.role==="ADMINISTRADOR"||item.fromWarehouseCode===user.role||item.toWarehouseCode===user.role;}
export async function listTransfers(user = null) { return (await readTransfers(db)).filter((item)=>visibleTransfer(item,user)); }
export async function getTransfer(id,user = null) { const rows=await readTransfers(db,id); if(!rows.length||!visibleTransfer(rows[0],user)) fail(404,"Transferencia no encontrada"); return rows[0]; }

export async function createTransfer(payload, actorId) {
  if (!payload.fromWarehouseId || !payload.toWarehouseId || !(payload.lines || []).length) fail(400, "Completa origen, destino y productos");
  const id = await transaction(async (client) => {
    const state = await lockState(client); const actor = userFrom(state,actorId);
    const warehouses = (await client.query("SELECT * FROM inventory_warehouses WHERE id=ANY($1::bigint[]) FOR UPDATE", [[Number(payload.fromWarehouseId),Number(payload.toWarehouseId)]])).rows;
    const origin=warehouses.find((item)=>n(item.id)===n(payload.fromWarehouseId)); const destination=warehouses.find((item)=>n(item.id)===n(payload.toWarehouseId));
    if(!origin||!destination||!ROUTES.has(`${origin.code}>${destination.code}`)) fail(400,"Ruta de transferencia no permitida");
    if(!warehouseAllowed(actor,origin.code)) fail(403,"Tu rol no puede emitir desde este almacén");
    const code=`TR-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomUUID().slice(0,6).toUpperCase()}`;
    const transfer=(await client.query(`INSERT INTO inventory_transfers(code,from_warehouse_id,to_warehouse_id,status,requested_by_legacy_user_id,observation,metadata) VALUES($1,$2,$3,'DRAFT',$4,$5,$6::jsonb) RETURNING id`,[code,origin.id,destination.id,actorId,payload.observation||null,JSON.stringify({source:"TRANSFERS_V2"})])).rows[0];
    const products=[];
    for(const [index,input] of payload.lines.entries()){
      const quantity=n(input.quantity); if(quantity<=0) fail(400,`Cantidad no válida en la línea ${index+1}`);
      const balance=(await client.query(`SELECT b.*,p.name,p.base_unit_id,p.legacy_id FROM inventory_stock_balances b JOIN inventory_products p ON p.id=b.product_id WHERE b.product_id=$1 AND b.warehouse_id=$2 AND b.lot_id IS NOT DISTINCT FROM $3 FOR UPDATE`,[Number(input.productId),origin.id,input.lotId?Number(input.lotId):null])).rows[0];
      if(!balance) fail(404,"Existencia de origen no encontrada");
      if(n(balance.on_hand)-n(balance.reserved)+0.000001<quantity) fail(409,`Stock disponible insuficiente de ${balance.name}`);
      const line=(await client.query(`INSERT INTO inventory_transfer_lines(transfer_id,product_id,lot_id,requested_quantity,unit_id,observation) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[transfer.id,balance.product_id,balance.lot_id,quantity,balance.base_unit_id,input.observation||null])).rows[0];
      await client.query("UPDATE inventory_stock_balances SET reserved=reserved+$2,version=version+1,updated_at=NOW() WHERE id=$1",[balance.id,quantity]);
      await client.query(`INSERT INTO inventory_reservations(idempotency_key,product_id,warehouse_id,lot_id,quantity,source_type,source_legacy_id,status) VALUES($1,$2,$3,$4,$5,'TRANSFER',$6,'ACTIVE')`,[`transfer-reservation:${line.id}`,balance.product_id,origin.id,balance.lot_id,quantity,line.id]);
      products.push(Number(balance.product_id));
    }
    await syncLegacyProducts(client,state,products);
    state.audit.unshift({id:++state.counters.audit,module:"INVENTARIO",action:"TRANSFERENCIA_BORRADOR",detail:code,userId:actorId,createdAt:new Date().toISOString()});
    await saveState(client,state); await audit(client,"CREATE",transfer.id,actorId,"Transferencia creada; stock comprometido",null,{code,status:"DRAFT"},code); return transfer.id;
  });
  return getTransfer(id);
}

export async function sendTransfer(id,payload,actorId){
  await transaction(async(client)=>{
    const transfer=(await client.query("SELECT t.*,fw.code from_code FROM inventory_transfers t JOIN inventory_warehouses fw ON fw.id=t.from_warehouse_id WHERE t.id=$1 FOR UPDATE",[Number(id)])).rows[0];
    if(!transfer) fail(404,"Transferencia no encontrada"); if(transfer.status!=="DRAFT") fail(409,"Solo un borrador puede enviarse");
    const state=await lockState(client); const actor=userFrom(state,actorId); if(!warehouseAllowed(actor,transfer.from_code)) fail(403,"Tu rol no puede enviar desde este almacén");
    const transit=(await client.query("SELECT id FROM inventory_warehouses WHERE code='TRANSIT'")).rows[0];
    const lines=(await client.query("SELECT tl.*,p.average_cost,p.legacy_id FROM inventory_transfer_lines tl JOIN inventory_products p ON p.id=tl.product_id WHERE tl.transfer_id=$1 ORDER BY tl.id FOR UPDATE OF tl",[transfer.id])).rows;
    for(const line of lines){
      const reservation=(await client.query("SELECT * FROM inventory_reservations WHERE source_type='TRANSFER' AND source_legacy_id=$1 AND status='ACTIVE' FOR UPDATE",[line.id])).rows[0];
      if(!reservation) fail(409,"La reserva de stock ya no está activa");
      await client.query("UPDATE inventory_stock_balances SET reserved=reserved-$4,version=version+1,updated_at=NOW() WHERE product_id=$1 AND warehouse_id=$2 AND lot_id IS NOT DISTINCT FROM $3",[line.product_id,transfer.from_warehouse_id,line.lot_id,line.requested_quantity]);
      await client.query("UPDATE inventory_reservations SET status='CONSUMED',released_at=NOW() WHERE id=$1",[reservation.id]);
      await client.query("UPDATE inventory_transfer_lines SET sent_quantity=requested_quantity WHERE id=$1",[line.id]);
      await postTransferMovement(client,state,{idempotencyKey:`transfer-send:${line.id}`,type:"TRANSFER_DISPATCH",productId:line.product_id,legacyProductId:line.legacy_id,quantity:n(line.requested_quantity),fromWarehouseId:transfer.from_warehouse_id,toWarehouseId:transit.id,lotId:line.lot_id,unitCost:n(line.average_cost),reason:`Despacho ${transfer.code}`,actorId,transferId:transfer.id,lineId:line.id,code:transfer.code});
    }
    await client.query("UPDATE inventory_transfers SET status='SENT',sent_by_legacy_user_id=$2,sent_shift_code=$3,sent_at=NOW(),observation=COALESCE($4,observation),updated_at=NOW() WHERE id=$1",[transfer.id,actorId,shiftCode(state,actorId,payload?.shiftCode),payload?.observation||null]);
    await syncLegacyProducts(client,state,lines.map((line)=>line.product_id)); state.audit.unshift({id:++state.counters.audit,module:"INVENTARIO",action:"TRANSFERENCIA_ENVIADA",detail:transfer.code,userId:actorId,createdAt:new Date().toISOString()}); await saveState(client,state);
    await audit(client,"SEND",transfer.id,actorId,"Stock retirado del origen e ingresado a tránsito",{status:"DRAFT"},{status:"SENT"},transfer.code);
  }); return getTransfer(id);
}

export async function receiveTransfer(id,payload,actorId){
  await transaction(async(client)=>{
    const transfer=(await client.query("SELECT t.*,tw.code to_code FROM inventory_transfers t JOIN inventory_warehouses tw ON tw.id=t.to_warehouse_id WHERE t.id=$1 FOR UPDATE",[Number(id)])).rows[0];
    if(!transfer) fail(404,"Transferencia no encontrada"); if(transfer.status!=="SENT") fail(409,"La transferencia ya fue procesada o todavía no fue enviada");
    if(n(transfer.sent_by_legacy_user_id)===n(actorId)) fail(403,"El emisor no puede confirmar la recepción");
    const state=await lockState(client); const actor=userFrom(state,actorId); if(!warehouseAllowed(actor,transfer.to_code)) fail(403,"Tu rol no puede recibir en este almacén");
    const lines=(await client.query("SELECT tl.*,p.average_cost,p.legacy_id FROM inventory_transfer_lines tl JOIN inventory_products p ON p.id=tl.product_id WHERE tl.transfer_id=$1 ORDER BY tl.id FOR UPDATE OF tl",[transfer.id])).rows;
    const entries=payload?.lines||[]; if(entries.length!==lines.length) fail(400,"Debes confirmar la cantidad real de cada producto");
    const transit=(await client.query("SELECT id FROM inventory_warehouses WHERE code='TRANSIT'")).rows[0]; const discrepancy=(await client.query("SELECT id FROM inventory_warehouses WHERE code='DISCREPANCY'")).rows[0];
    let hasDifference=false;
    for(const line of lines){
      const input=entries.find((item)=>n(item.lineId)===n(line.id)); if(!input) fail(400,"Falta una cantidad recibida"); const actual=n(input.receivedQuantity); if(actual<0) fail(400,"La cantidad recibida no puede ser negativa");
      const sent=n(line.sent_quantity); const difference=round6(actual-sent); hasDifference ||= Math.abs(difference)>0.000001;
      await client.query("UPDATE inventory_transfer_lines SET received_quantity=$2,difference_quantity=$3,observation=COALESCE($4,observation) WHERE id=$1",[line.id,actual,difference,input.observation||null]);
      const regular=Math.min(actual,sent);
      if(regular>0) await postTransferMovement(client,state,{idempotencyKey:`transfer-receive:${line.id}`,type:"TRANSFER_RECEIPT",productId:line.product_id,legacyProductId:line.legacy_id,quantity:regular,fromWarehouseId:transit.id,toWarehouseId:transfer.to_warehouse_id,lotId:line.lot_id,unitCost:n(line.average_cost),reason:`Recepción ${transfer.code}`,actorId,transferId:transfer.id,lineId:line.id,code:transfer.code});
      if(actual<sent){const shortage=round6(sent-actual); await postTransferMovement(client,state,{idempotencyKey:`transfer-shortage:${line.id}`,type:"TRANSFER_SHORTAGE",productId:line.product_id,legacyProductId:line.legacy_id,quantity:shortage,fromWarehouseId:transit.id,toWarehouseId:discrepancy.id,lotId:line.lot_id,unitCost:n(line.average_cost),reason:`Faltante en ${transfer.code}`,actorId,transferId:transfer.id,lineId:line.id,code:transfer.code});}
      if(actual>sent){const overage=round6(actual-sent); await postTransferMovement(client,state,{idempotencyKey:`transfer-overage:${line.id}`,type:"TRANSFER_OVERAGE",productId:line.product_id,legacyProductId:line.legacy_id,quantity:overage,fromWarehouseId:null,toWarehouseId:transfer.to_warehouse_id,lotId:line.lot_id,unitCost:n(line.average_cost),reason:`Sobrante físico en ${transfer.code}`,actorId,transferId:transfer.id,lineId:line.id,code:transfer.code});}
      if(Math.abs(difference)>0.000001) await client.query(`INSERT INTO inventory_transfer_alerts(transfer_id,transfer_line_id,alert_type,severity,sent_quantity,received_quantity,difference_quantity,created_by_legacy_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[transfer.id,line.id,difference<0?"SHORTAGE":"OVERAGE",Math.abs(difference)>=Math.max(1,sent*.1)?"CRITICAL":"WARNING",sent,actual,difference,actorId]);
    }
    const finalStatus=hasDifference?"RECEIVED_WITH_DIFFERENCE":"RECEIVED";
    await client.query("UPDATE inventory_transfers SET status=$2,received_by_legacy_user_id=$3,received_shift_code=$4,received_at=NOW(),observation=COALESCE($5,observation),updated_at=NOW() WHERE id=$1",[transfer.id,finalStatus,actorId,shiftCode(state,actorId,payload?.shiftCode),payload?.observation||null]);
    await syncLegacyProducts(client,state,lines.map((line)=>line.product_id)); state.audit.unshift({id:++state.counters.audit,module:"INVENTARIO",action:finalStatus,detail:transfer.code,userId:actorId,createdAt:new Date().toISOString()}); await saveState(client,state);
    await audit(client,"RECEIVE",transfer.id,actorId,hasDifference?"Recepción confirmada con diferencia y alerta":"Recepción conforme",{status:"SENT"},{status:finalStatus},transfer.code);
  }); return getTransfer(id);
}

export async function rejectTransfer(id,payload,actorId){
  await transaction(async(client)=>{
    const transfer=(await client.query("SELECT t.*,tw.code to_code FROM inventory_transfers t JOIN inventory_warehouses tw ON tw.id=t.to_warehouse_id WHERE t.id=$1 FOR UPDATE",[Number(id)])).rows[0];
    if(!transfer) fail(404,"Transferencia no encontrada"); if(transfer.status!=="SENT") fail(409,"Solo una transferencia enviada puede rechazarse"); if(n(transfer.sent_by_legacy_user_id)===n(actorId)) fail(403,"El emisor no puede rechazar por el receptor");
    if(!String(payload?.observation||"").trim()) fail(400,"Indica el motivo del rechazo");
    const state=await lockState(client); const actor=userFrom(state,actorId); if(!warehouseAllowed(actor,transfer.to_code)) fail(403,"Tu rol no puede rechazar en este destino");
    const transit=(await client.query("SELECT id FROM inventory_warehouses WHERE code='TRANSIT'")).rows[0]; const lines=(await client.query("SELECT tl.*,p.average_cost,p.legacy_id FROM inventory_transfer_lines tl JOIN inventory_products p ON p.id=tl.product_id WHERE tl.transfer_id=$1 ORDER BY tl.id FOR UPDATE OF tl",[transfer.id])).rows;
    for(const line of lines){await client.query("UPDATE inventory_transfer_lines SET received_quantity=0,difference_quantity=-sent_quantity,observation=$2 WHERE id=$1",[line.id,payload.observation]); await postTransferMovement(client,state,{idempotencyKey:`transfer-reject:${line.id}`,type:"TRANSFER_REJECT_RETURN",productId:line.product_id,legacyProductId:line.legacy_id,quantity:n(line.sent_quantity),fromWarehouseId:transit.id,toWarehouseId:transfer.from_warehouse_id,lotId:line.lot_id,unitCost:n(line.average_cost),reason:`Rechazo ${transfer.code}: ${payload.observation}`,actorId,transferId:transfer.id,lineId:line.id,code:transfer.code});}
    await client.query("UPDATE inventory_transfers SET status='REJECTED',rejected_by_legacy_user_id=$2,rejected_at=NOW(),received_by_legacy_user_id=$2,received_shift_code=$3,observation=$4,updated_at=NOW() WHERE id=$1",[transfer.id,actorId,shiftCode(state,actorId,payload.shiftCode),payload.observation]);
    await syncLegacyProducts(client,state,lines.map((line)=>line.product_id)); state.audit.unshift({id:++state.counters.audit,module:"INVENTARIO",action:"TRANSFERENCIA_RECHAZADA",detail:transfer.code,userId:actorId,createdAt:new Date().toISOString()}); await saveState(client,state); await audit(client,"REJECT",transfer.id,actorId,payload.observation,{status:"SENT"},{status:"REJECTED"},transfer.code);
  }); return getTransfer(id);
}

export async function cancelTransfer(id,payload,actorId){
  await transaction(async(client)=>{
    const transfer=(await client.query("SELECT * FROM inventory_transfers WHERE id=$1 FOR UPDATE",[Number(id)])).rows[0]; if(!transfer) fail(404,"Transferencia no encontrada"); if(transfer.status!=="DRAFT") fail(409,"Solo un borrador puede cancelarse");
    const state=await lockState(client); const actor=userFrom(state,actorId); if(n(transfer.requested_by_legacy_user_id)!==n(actorId)&&actor.role!=="ADMINISTRADOR") fail(403,"Solo el solicitante o Administración puede cancelar");
    const lines=(await client.query("SELECT * FROM inventory_transfer_lines WHERE transfer_id=$1 FOR UPDATE",[transfer.id])).rows;
    for(const line of lines){await client.query("UPDATE inventory_stock_balances SET reserved=GREATEST(0,reserved-$4),version=version+1,updated_at=NOW() WHERE product_id=$1 AND warehouse_id=$2 AND lot_id IS NOT DISTINCT FROM $3",[line.product_id,transfer.from_warehouse_id,line.lot_id,line.requested_quantity]); await client.query("UPDATE inventory_reservations SET status='RELEASED',released_at=NOW() WHERE source_type='TRANSFER' AND source_legacy_id=$1 AND status='ACTIVE'",[line.id]);}
    await client.query("UPDATE inventory_transfers SET status='CANCELLED',cancelled_by_legacy_user_id=$2,cancelled_at=NOW(),observation=COALESCE($3,observation),updated_at=NOW() WHERE id=$1",[transfer.id,actorId,payload?.observation||null]);
    await syncLegacyProducts(client,state,lines.map((line)=>line.product_id)); state.audit.unshift({id:++state.counters.audit,module:"INVENTARIO",action:"TRANSFERENCIA_CANCELADA",detail:transfer.code,userId:actorId,createdAt:new Date().toISOString()}); await saveState(client,state); await audit(client,"CANCEL",transfer.id,actorId,payload?.observation||"Borrador cancelado; reserva liberada",{status:"DRAFT"},{status:"CANCELLED"},transfer.code);
  }); return getTransfer(id);
}
