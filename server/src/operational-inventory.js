import { db } from "./db.js";
import { totalsByUnit } from "./order-operations.js";

const n = (value) => Number(value || 0);
const r6 = (value) => Math.round((n(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
const ACTIVE = new Set(["OPEN", "OPERATING", "COUNTING", "SUBMITTED", "OBSERVED", "REOPENED"]);
const SHIFTS = { RESTAURANTE: [], BARTENDER: [] };
const LABELS = { PENDING: "PENDIENTE", OPEN: "ABIERTO", OPERATING: "ABIERTO", COUNTING: "EN_CONTEO", SUBMITTED: "ENVIADO", OBSERVED: "OBSERVADO", CLOSED: "CERRADO", REOPENED: "EN_CONTEO" };
export const WASTE_CATEGORIES = [
  ["CLEANING", "Limpieza"], ["TRANSFORMATION", "Transformación"], ["EXPIRY", "Vencimiento"], ["STORAGE", "Almacenamiento"],
  ["PREPARATION_ERROR", "Error de preparación"], ["DAMAGED", "Producto dañado"], ["SPILL", "Derrame"], ["DOSING", "Dosificación"],
  ["INTERNAL_CONSUMPTION", "Consumo interno"], ["OTHER", "Otra"]
];
const WASTE_CATEGORY_CODES = new Set(WASTE_CATEGORIES.map(([code]) => code));

function fail(status, message, fieldErrors = {}) { const error = new Error(message); error.status = status; error.fieldErrors = fieldErrors; throw error; }

async function tx(work) {
  const client = await db.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); if (error.code === "23505") fail(409, "Ya existe un inventario activo para esta área o turno"); throw error; }
  finally { client.release(); }
}

async function actor(client, actorId) {
  const state = (await client.query("SELECT data FROM app_state WHERE id=1")).rows[0].data;
  const user = (state.users || []).find((item) => n(item.id) === n(actorId));
  if (!user) fail(401, "Usuario no encontrado");
  return { user, state };
}

function authorizeArea(user, area) {
  if (user.role === "ADMINISTRADOR") return;
  if (!(["RESTAURANTE", "BARTENDER"].includes(user.role) && user.role === area)) fail(403, "Tu rol no administra el inventario de esta área");
}

function lineKey(productId, lotId) { return `${n(productId)}:${lotId ? n(lotId) : "base"}`; }
function outsideTolerance(line, physical) {
  const expected = Math.abs(n(line.expectedQuantity));
  const percentage = expected ? Math.abs(r6(n(physical) - n(line.expectedQuantity))) / expected * 100 : (Math.abs(n(physical)) ? 100 : 0);
  return percentage > n(line.tolerancePercent) + 0.000001;
}

async function audit(client, eventType, sessionId, actorId, reason, beforeData, afterData) {
  await client.query(`INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,before_data,after_data,correlation_id)
    VALUES($1,'SHIFT_INVENTORY',$2,$3,$4,$5::jsonb,$6::jsonb,$7)`, [eventType, sessionId, actorId, reason, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, `shift:${sessionId}`]);
}

async function sessionRow(client, id, lock = false) {
  const row = (await client.query(`SELECT s.*,w.name warehouse_name,w.code warehouse_code FROM inventory_shift_sessions s JOIN inventory_warehouses w ON w.id=s.warehouse_id WHERE s.id=$1 ${lock ? "FOR UPDATE OF s" : ""}`, [n(id)])).rows[0];
  if (!row) fail(404, "Inventario de turno no encontrado");
  return row;
}

function operationalDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || "");
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function mapSession(row) {
  return { id: n(row.id), area: row.area_code, areaName: row.warehouse_name, warehouseId: n(row.warehouse_id), date: operationalDate(row.operational_date), shift: row.shift_code, status: row.status, statusLabel: LABELS[row.status] || row.status, responsibleId: row.responsible_legacy_user_id ? n(row.responsible_legacy_user_id) : null, submittedBy: row.submitted_by_legacy_user_id ? n(row.submitted_by_legacy_user_id) : null, openingSource: row.opening_source, previousSessionId: row.previous_session_id ? n(row.previous_session_id) : null, periodStartedAt: row.period_started_at, openedAt: row.opened_at, submittedAt: row.submitted_at, closedAt: row.closed_at, reopenCount: n(row.reopen_count), varianceCost: n(row.variance_cost), observation: row.closing_metadata?.observation || null, metadata: row.metadata || {} };
}

async function latestClosing(client, sessionId) {
  return (await client.query("SELECT * FROM inventory_closings WHERE session_id=$1 ORDER BY revision DESC LIMIT 1", [n(sessionId)])).rows[0] || null;
}

async function calculateLines(client, session, cutoff = new Date()) {
  const opening = (await client.query(`SELECT o.product_id,o.lot_id,o.unit_id,o.opening_quantity,o.unit_cost,p.name product_name,p.tolerance_percent,p.metadata->>'imageUrl' image_url,u.symbol unit_symbol,l.lot_code
    FROM inventory_shift_opening_lines o JOIN inventory_products p ON p.id=o.product_id JOIN inventory_units u ON u.id=o.unit_id LEFT JOIN inventory_lots l ON l.id=o.lot_id WHERE o.session_id=$1`, [session.id])).rows;
  const movements = (await client.query(`SELECT m.product_id,m.lot_id,m.movement_type,m.from_warehouse_id,m.to_warehouse_id,m.quantity,m.unit_cost,m.metadata,p.name product_name,p.tolerance_percent,p.metadata->>'imageUrl' image_url,p.base_unit_id unit_id,u.symbol unit_symbol,l.lot_code
    FROM inventory_movements m JOIN inventory_products p ON p.id=m.product_id JOIN inventory_units u ON u.id=p.base_unit_id LEFT JOIN inventory_lots l ON l.id=m.lot_id
    WHERE m.created_at>=$1 AND m.created_at<=$2 AND (m.from_warehouse_id=$3 OR m.to_warehouse_id=$3)
      AND m.movement_type NOT IN ('SHIFT_CLOSING_ADJUSTMENT','SHIFT_REOPEN_REVERSAL') ORDER BY m.id`, [session.period_started_at, cutoff, session.warehouse_id])).rows;
  const keys = new Map();
  const key = (productId, lotId) => `${productId}:${lotId || "base"}`;
  for (const item of opening) keys.set(key(item.product_id, item.lot_id), { productId:n(item.product_id),productName:item.product_name,imageUrl:item.image_url,lotId:item.lot_id?n(item.lot_id):null,lotCode:item.lot_code,unitId:n(item.unit_id),unitSymbol:item.unit_symbol,tolerancePercent:n(item.tolerance_percent),openingQuantity:n(item.opening_quantity),confirmedEntries:0,outboundTransfers:0,productionEntries:0,productionConsumption:0,theoreticalConsumption:0,wasteQuantity:0,authorizedAdjustments:0,unitCost:n(item.unit_cost) });
  for (const item of movements) {
    const current = keys.get(key(item.product_id,item.lot_id)) || { productId:n(item.product_id),productName:item.product_name,imageUrl:item.image_url,lotId:item.lot_id?n(item.lot_id):null,lotCode:item.lot_code,unitId:n(item.unit_id),unitSymbol:item.unit_symbol,tolerancePercent:n(item.tolerance_percent),openingQuantity:0,confirmedEntries:0,outboundTransfers:0,productionEntries:0,productionConsumption:0,theoreticalConsumption:0,wasteQuantity:0,authorizedAdjustments:0,unitCost:n(item.unit_cost) };
    const type = String(item.movement_type || "").toUpperCase(); const qty=n(item.quantity); const incoming=n(item.to_warehouse_id)===n(session.warehouse_id); const outgoing=n(item.from_warehouse_id)===n(session.warehouse_id);
    if (incoming && ["GOODS_RECEIPT","TRANSFER_RECEIPT","TRANSFER_OVERAGE","ENTRADA","ENTRADA_COMPRA"].includes(type)) current.confirmedEntries += qty;
    else if (outgoing && type === "TRANSFER_DISPATCH") current.outboundTransfers += qty;
    else if (incoming && ["PRODUCTION_OUTPUT","PRODUCTION_ENTRY","PRODUCCION_ENTRADA","PROCESSING_OUTPUT","BYPRODUCT_OUTPUT","PORTIONING_OUTPUT","PORTIONING_LEFTOVER"].includes(type)) current.productionEntries += qty;
    else if (outgoing && ["PRODUCTION_CONSUMPTION","PRODUCCION","PROCESSING_CONSUMPTION","PORTIONING_CONSUMPTION"].includes(type)) current.productionConsumption += type==="PROCESSING_CONSUMPTION" ? n(item.metadata?.productiveQuantity) || qty : qty;
    else if (outgoing && ["THEORETICAL_CONSUMPTION","ORDER_INTERNAL_CONSUMPTION","CONSUMO_TEORICO"].includes(type)) current.theoreticalConsumption += qty;
    else if (outgoing && (["WASTE","MERMA","PROCESSING_WASTE","ORDER_WASTE","ORDER_LOSS","INTERNAL_CONSUMPTION"].includes(type) || type.startsWith("WASTE_"))) current.wasteQuantity += qty;
    else if (["AUTHORIZED_ADJUSTMENT","AJUSTE","AJUSTE_AUTORIZADO"].includes(type)) current.authorizedAdjustments += incoming ? qty : outgoing ? -qty : 0;
    current.unitCost = n(item.unit_cost) || current.unitCost; keys.set(key(item.product_id,item.lot_id),current);
  }
  return [...keys.values()].map((item) => { const baseAvailable=r6(item.openingQuantity+item.confirmedEntries-item.outboundTransfers+item.productionEntries-item.productionConsumption+item.authorizedAdjustments); const expected=r6(baseAvailable-item.theoreticalConsumption-item.wasteQuantity); return { ...item, openingQuantity:r6(item.openingQuantity),confirmedEntries:r6(item.confirmedEntries),outboundTransfers:r6(item.outboundTransfers),productionEntries:r6(item.productionEntries),productionConsumption:r6(item.productionConsumption),theoreticalConsumption:r6(item.theoreticalConsumption),wasteQuantity:r6(item.wasteQuantity),authorizedAdjustments:r6(item.authorizedAdjustments),baseAvailableQuantity:baseAvailable,expectedQuantity:expected }; }).sort((a,b)=>a.productName.localeCompare(b.productName));
}

async function snapshotLines(client, closingId) {
  return (await client.query(`SELECT l.product_id "productId",p.name "productName",p.metadata->>'imageUrl' "imageUrl",p.tolerance_percent "tolerancePercent",l.lot_id "lotId",lot.lot_code "lotCode",l.unit_id "unitId",u.symbol "unitSymbol",l.opening_quantity "openingQuantity",l.confirmed_entries "confirmedEntries",l.outbound_transfers "outboundTransfers",l.production_entries "productionEntries",l.production_consumption "productionConsumption",l.theoretical_consumption "theoreticalConsumption",l.waste_quantity "wasteQuantity",l.authorized_adjustments "authorizedAdjustments",l.expected_quantity "expectedQuantity",l.physical_quantity "physicalQuantity",l.variance_quantity "varianceQuantity",l.derived_actual_consumption "derivedActualConsumption",l.unexplained_difference "unexplainedDifference",l.difference_percent "differencePercent",l.unit_cost "unitCost",l.variance_cost "varianceCost",l.difference_cost "differenceCost"
    FROM inventory_shift_summary_lines l JOIN inventory_products p ON p.id=l.product_id JOIN inventory_units u ON u.id=l.unit_id LEFT JOIN inventory_lots lot ON lot.id=l.lot_id WHERE l.closing_id=$1 ORDER BY p.name`, [closingId])).rows;
}

async function readDetail(client, id) {
  const raw=await sessionRow(client,id); const session=mapSession(raw); const closing=await latestClosing(client,id);
  let lines;
  if (closing && ["SUBMITTED","CLOSED"].includes(raw.status)) lines=await snapshotLines(client,closing.id);
  else { const frozen=raw.metadata?.frozenCutoffAt; lines=await calculateLines(client,raw,frozen?new Date(frozen):new Date()); }
  const explanations=closing ? (await client.query(`SELECT e.product_id "productId",e.lot_id "lotId",e.reason,e.evidence,e.related_waste_record_id "relatedWasteRecordId",e.variance_quantity "varianceQuantity",e.tolerance_percent "tolerancePercent" FROM inventory_shift_variance_explanations e WHERE e.closing_id=$1`,[closing.id])).rows : [];
  const totals=lines.reduce((a,line)=>{a.varianceCost+=n(line.varianceCost);a.unexplainedDifferenceCost+=Math.abs(n(line.unexplainedDifference))*n(line.unitCost);return a;},{varianceCost:0,unexplainedDifferenceCost:0});
  return { ...session, lines, explanations, closing: closing ? { id:n(closing.id),revision:n(closing.revision),status:closing.status,varianceCost:n(closing.variance_cost),reason:closing.reopen_reason,observation:closing.metadata?.observation||null } : null, totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,r6(v)])), totalsByUnit:totalsByUnit(lines) };
}

export async function operationalInventoryReferences() {
  const warehouses=(await db.query("SELECT id,code,name,area_code AS area FROM inventory_warehouses WHERE active AND code IN ('RESTAURANTE','BARTENDER') ORDER BY id")).rows;
  const stock=(await db.query(`SELECT b.warehouse_id "warehouseId",b.product_id "productId",p.name "productName",b.lot_id "lotId",l.lot_code "lotCode",u.symbol "unitSymbol",b.on_hand "onHand" FROM inventory_stock_balances b JOIN inventory_products p ON p.id=b.product_id JOIN inventory_units u ON u.id=p.base_unit_id LEFT JOIN inventory_lots l ON l.id=b.lot_id WHERE b.warehouse_id=ANY($1::bigint[]) AND (b.on_hand<>0 OR b.reserved<>0) ORDER BY p.name`,[warehouses.map(item=>item.id)])).rows;
  return { warehouses, stock, shifts:SHIFTS, shiftMode:"ON_DEMAND", wasteCategories:WASTE_CATEGORIES.map(([code,name])=>({code,name})), states:Object.entries(LABELS).filter(([key])=>["PENDING","OPEN","COUNTING","SUBMITTED","OBSERVED","CLOSED"].includes(key)).map(([code,label])=>({code,label})), formula:"Esperado = inicial + entradas - transferencias salientes + producción de entrada - consumo de producción - consumo teórico - mermas ± ajustes autorizados" };
}

export async function listOperationalInventories(filters={}, user) {
  const params=[]; const where=[];
  if (filters.area){params.push(filters.area);where.push(`s.area_code=$${params.length}`);} if(filters.date){params.push(filters.date);where.push(`s.operational_date=$${params.length}`);}
  if (user.role!=="ADMINISTRADOR"){params.push(user.role);where.push(`s.area_code=$${params.length}`);}
  const rows=(await db.query(`SELECT s.*,w.name warehouse_name,w.code warehouse_code,c.variance_cost,c.metadata closing_metadata
    FROM inventory_shift_sessions s JOIN inventory_warehouses w ON w.id=s.warehouse_id
    LEFT JOIN LATERAL (SELECT variance_cost,metadata FROM inventory_closings WHERE session_id=s.id ORDER BY revision DESC LIMIT 1) c ON TRUE
    ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY s.operational_date DESC,s.created_at DESC`,params)).rows;
  const state=(await db.query("SELECT data FROM app_state WHERE id=1")).rows[0].data;
  const person=(id)=>{const actor=(state.users||[]).find((item)=>n(item.id)===n(id));return actor?`${actor.firstName||''} ${actor.lastName||''}`.trim():null;};
  return rows.map((row)=>({...mapSession(row),responsibleName:person(row.responsible_legacy_user_id),submittedByName:person(row.submitted_by_legacy_user_id)}));
}

export async function getOperationalInventory(id, user) { const client=await db.connect(); try { const row=await sessionRow(client,id); authorizeArea(user,row.area_code); return await readDetail(client,id); } finally { client.release(); } }

export async function createOperationalInventory(payload, actorId) {
  return tx(async(client)=>{ const {user}=await actor(client,actorId); const area=String(payload.area||"").toUpperCase(); authorizeArea(user,area); if(!Object.hasOwn(SHIFTS,area)) fail(400,"Área operativa no válida");
    const warehouse=(await client.query("SELECT id FROM inventory_warehouses WHERE code=$1 AND active",[area])).rows[0]; if(!warehouse) fail(404,"Almacén operativo no encontrado");
    // Evita crear un turno pendiente que luego no podrá abrirse. El cierre
    // anterior protege el inventario y debe ser revisado por Administración.
    const blocking=(await client.query(`SELECT operational_date,shift_code,status FROM inventory_shift_sessions
      WHERE warehouse_id=$1 AND status IN ('OPEN','OPERATING','COUNTING','REOPENED')
      ORDER BY operational_date DESC,created_at DESC LIMIT 1 FOR UPDATE`,[warehouse.id])).rows[0];
    if(blocking) fail(409,`No puedes abrir un nuevo turno: el turno ${blocking.shift_code} del ${operationalDate(blocking.operational_date)} sigue ${LABELS[blocking.status] || blocking.status}. Administración debe revisarlo y cerrarlo primero.`);
    const startedAt=new Date(); const date=payload.date||operationalDate(startedAt); const shift=`TURNO-${startedAt.toISOString().replace(/[-:.TZ]/g,"")}`; const row=(await client.query(`INSERT INTO inventory_shift_sessions(warehouse_id,area_code,operational_date,shift_code,responsible_legacy_user_id,status,metadata) VALUES($1,$2,$3,$4,$5,'PENDING',$6::jsonb) RETURNING id`,[warehouse.id,area,date,shift,actorId,JSON.stringify({source:"OPERATIONAL_INVENTORY_V1",onDemand:true})])).rows[0]; await audit(client,"CREATE",row.id,actorId,"Inventario de turno iniciado bajo demanda",null,{area,date,shift,status:"PENDING"}); return readDetail(client,row.id); });
}

export async function openOperationalInventory(id,payload,actorId) {
  return tx(async(client)=>{ const {user}=await actor(client,actorId); const session=await sessionRow(client,id,true); authorizeArea(user,session.area_code); if(session.status!=="PENDING") fail(409,"Solo un inventario pendiente puede abrirse");
    const active=(await client.query("SELECT id,operational_date,shift_code,status FROM inventory_shift_sessions WHERE warehouse_id=$1 AND status IN ('OPEN','OPERATING','COUNTING','REOPENED') AND id<>$2 FOR UPDATE",[session.warehouse_id,session.id])).rows[0]; if(active) fail(409,`No puedes abrir este turno: el turno ${active.shift_code} del ${operationalDate(active.operational_date)} sigue ${LABELS[active.status] || active.status}. El colaborador responsable debe finalizar su conteo antes.`);
    const previous=(await client.query(`SELECT s.id,s.submitted_at FROM inventory_shift_sessions s WHERE s.warehouse_id=$1 AND s.status IN ('CLOSED','SUBMITTED','OBSERVED') AND s.id<>$2 AND (s.operational_date<$3 OR (s.operational_date=$3 AND s.created_at<$4)) ORDER BY s.operational_date DESC,s.created_at DESC LIMIT 1`,[session.warehouse_id,session.id,session.operational_date,session.created_at])).rows[0];
    let source="OPENING_COUNT"; let lines=[]; let periodStart=new Date();
    if(previous){const closing=await latestClosing(client,previous.id); if(closing){lines=(await client.query(`SELECT l.product_id,l.lot_id,l.unit_id,l.physical_quantity opening_quantity,l.unit_cost FROM inventory_shift_summary_lines l WHERE l.closing_id=$1`,[closing.id])).rows;if(!lines.length)lines=(await client.query(`SELECT l.product_id,l.lot_id,p.base_unit_id unit_id,l.actual_quantity opening_quantity,l.unit_cost FROM inventory_physical_count_lines l JOIN inventory_products p ON p.id=l.product_id WHERE l.physical_count_id=$1`,[closing.physical_count_id])).rows;if(lines.length){source="PREVIOUS_CLOSE";periodStart=previous.submitted_at||new Date();}}}
    if(!lines.length&&source==="OPENING_COUNT"){
      const balances=(await client.query(`SELECT b.product_id,b.lot_id,p.base_unit_id unit_id,p.average_cost,b.on_hand FROM inventory_stock_balances b JOIN inventory_products p ON p.id=b.product_id WHERE b.warehouse_id=$1 AND (b.on_hand<>0 OR b.reserved<>0) ORDER BY b.product_id`,[session.warehouse_id])).rows;
      const supplied=new Map((payload.openingCounts||[]).map(line=>[`${n(line.productId)}:${line.lotId?n(line.lotId):"base"}`,n(line.quantity)]));
      if(balances.length&&balances.some(line=>!supplied.has(`${n(line.product_id)}:${line.lot_id?n(line.lot_id):"base"}`))) fail(409,"No existe cierre anterior. Registra el conteo de apertura de todos los productos");
      lines=balances.map(line=>({product_id:line.product_id,lot_id:line.lot_id,unit_id:line.unit_id,unit_cost:line.average_cost,opening_quantity:supplied.get(`${n(line.product_id)}:${line.lot_id?n(line.lot_id):"base"}`)}));
    }
    for(const line of lines) await client.query(`INSERT INTO inventory_shift_opening_lines(session_id,product_id,lot_id,unit_id,opening_quantity,unit_cost,source) VALUES($1,$2,$3,$4,$5,$6,$7)`,[session.id,line.product_id,line.lot_id,line.unit_id,n(line.opening_quantity),n(line.unit_cost),source]);
    await client.query("UPDATE inventory_shift_sessions SET status='OPEN',opening_source=$2,previous_session_id=$3,period_started_at=$4,opened_at=NOW(),opened_by_legacy_user_id=$5,updated_at=NOW() WHERE id=$1",[session.id,source,previous?.id||null,periodStart,actorId]); await audit(client,"OPEN",session.id,actorId,source==="PREVIOUS_CLOSE"?"Apertura desde cierre anterior":"Apertura con conteo físico",{status:"PENDING"},{status:"OPEN",source}); return readDetail(client,session.id);
  });
}

export async function startOperationalCount(id,actorId){return tx(async(client)=>{const {user}=await actor(client,actorId);const session=await sessionRow(client,id,true);authorizeArea(user,session.area_code);if(session.status!=="OPEN")fail(409,"El inventario debe estar abierto para iniciar el conteo");await client.query("UPDATE inventory_shift_sessions SET status='COUNTING',updated_at=NOW() WHERE id=$1",[session.id]);await audit(client,"START_COUNT",session.id,actorId,"Conteo físico iniciado",{status:"OPEN"},{status:"COUNTING"});return readDetail(client,session.id);});}

export async function registerOperationalWaste(id,payload,actorId){return tx(async(client)=>{const {user}=await actor(client,actorId);const session=await sessionRow(client,id,true);authorizeArea(user,session.area_code);if(!["OPEN","COUNTING"].includes(session.status))fail(409,"Solo se registran mermas durante un turno abierto o en conteo");
  const productId=n(payload.productId),lotId=payload.lotId?n(payload.lotId):null,quantity=n(payload.quantity),category=String(payload.category||"").toUpperCase();
  if(!productId||quantity<=0)fail(400,"Producto y cantidad de merma son obligatorios"); if(!WASTE_CATEGORY_CODES.has(category))fail(400,"Categoría de merma no válida");
  const product=(await client.query("SELECT p.id,p.base_unit_id,p.average_cost,u.symbol FROM inventory_products p JOIN inventory_units u ON u.id=p.base_unit_id WHERE p.id=$1",[productId])).rows[0]; if(!product)fail(404,"Producto no encontrado");
  const unitId=payload.unitId?n(payload.unitId):n(product.base_unit_id); if(unitId!==n(product.base_unit_id))fail(400,"La merma debe registrarse en la unidad base del producto; conviértela antes de guardar");
  const balance=(await client.query("SELECT b.on_hand,b.reserved,COALESCE(l.unit_cost,p.average_cost) unit_cost FROM inventory_stock_balances b JOIN inventory_products p ON p.id=b.product_id LEFT JOIN inventory_lots l ON l.id=b.lot_id WHERE b.product_id=$1 AND b.warehouse_id=$2 AND b.lot_id IS NOT DISTINCT FROM $3 FOR UPDATE OF b",[productId,session.warehouse_id,lotId])).rows[0]; if(!balance||quantity>n(balance.on_hand)-n(balance.reserved)+0.000001)fail(409,"Stock disponible insuficiente para registrar la merma");
  const evidence=Array.isArray(payload.evidence)?payload.evidence.filter(item=>typeof item==="string"&&item.trim()).slice(0,5):[]; const observation=String(payload.observation||"").trim(); const cost=n(balance.unit_cost)||n(product.average_cost);
  const waste=(await client.query(`INSERT INTO inventory_waste_records(product_id,warehouse_id,lot_id,shift_session_id,unit_id,quantity,reason_code,detail,responsible_legacy_user_id,occurred_at,evidence,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10::jsonb,$11::jsonb) RETURNING id`,[productId,session.warehouse_id,lotId,session.id,unitId,quantity,category,observation||null,actorId,JSON.stringify(evidence),JSON.stringify({category,cost,source:"OPERATIONAL_SHIFT"})])).rows[0];
  const movementType=category==="INTERNAL_CONSUMPTION"?"INTERNAL_CONSUMPTION":`WASTE_${category}`; const movementId=n((await client.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,NULL,NULL,FALSE,$13::jsonb) id",[`shift-waste:${waste.id}`,movementType,productId,quantity,session.warehouse_id,lotId,cost,`Merma: ${WASTE_CATEGORIES.find(([code])=>code===category)?.[1]}`,actorId,"SHIFT_WASTE",waste.id,`MERMA-${waste.id}`,JSON.stringify({wasteRecordId:n(waste.id),shiftSessionId:n(session.id),category,evidence})])).rows[0].id);
  await client.query("UPDATE inventory_waste_records SET movement_id=$2 WHERE id=$1",[waste.id,movementId]); await audit(client,"WASTE",session.id,actorId,`Merma registrada: ${category}`,null,{wasteId:n(waste.id),productId,lotId,quantity,unitId,category,evidence,cost}); return {...await readDetail(client,session.id), lastWaste:{id:n(waste.id),movementId,category,quantity,unitSymbol:product.symbol,cost:r6(quantity*cost)}};
});}

export async function submitOperationalCount(id,payload,actorId){return tx(async(client)=>{const {user}=await actor(client,actorId);const session=await sessionRow(client,id,true);authorizeArea(user,session.area_code);if(session.status!=="COUNTING")fail(409,"El inventario debe estar EN CONTEO");const cutoff=session.metadata?.frozenCutoffAt?new Date(session.metadata.frozenCutoffAt):new Date();const lines=await calculateLines(client,session,cutoff);const counts=new Map((payload.counts||[]).map(line=>[lineKey(line.productId,line.lotId),n(line.quantity)]));if(lines.some(line=>!counts.has(lineKey(line.productId,line.lotId))))fail(400,"Completa el conteo físico de todos los productos");if([...counts.values()].some(value=>value<0))fail(400,"El conteo físico no puede ser negativo");
  const explanations=new Map((payload.explanations||[]).map(item=>[lineKey(item.productId,item.lotId),item]));for(const line of lines){const physical=counts.get(lineKey(line.productId,line.lotId));if(outsideTolerance(line,physical)&&!String(explanations.get(lineKey(line.productId,line.lotId))?.reason||"").trim())fail(400,`Explica la diferencia fuera de tolerancia de ${line.productName}`);}
  const revision=n((await client.query("SELECT COALESCE(MAX(revision),0)+1 revision FROM inventory_closings WHERE session_id=$1",[session.id])).rows[0].revision);const count=(await client.query("INSERT INTO inventory_physical_counts(session_id,count_number,status,counted_by_legacy_user_id,counted_at,notes) VALUES($1,$2,'DRAFT',$3,NOW(),$4) RETURNING id",[session.id,revision,actorId,payload.notes||null])).rows[0];let varianceCost=0;const countLineIds=new Map();
  for(const line of lines){const physical=counts.get(lineKey(line.productId,line.lotId)),variance=r6(physical-line.expectedQuantity),value=r6(variance*line.unitCost);varianceCost+=value;const row=(await client.query(`INSERT INTO inventory_physical_count_lines(physical_count_id,product_id,lot_id,expected_quantity,actual_quantity,unit_cost) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[count.id,line.productId,line.lotId,line.expectedQuantity,physical,line.unitCost])).rows[0];countLineIds.set(lineKey(line.productId,line.lotId),row.id);}
  await client.query("UPDATE inventory_physical_counts SET status='SUBMITTED' WHERE id=$1",[count.id]);const previous=await latestClosing(client,session.id);const closing=(await client.query(`INSERT INTO inventory_closings(session_id,physical_count_id,revision,status,variance_cost,previous_closing_id,metadata) VALUES($1,$2,$3,'SUBMITTED',$4,$5,$6::jsonb) RETURNING id`,[session.id,count.id,revision,r6(varianceCost),previous?.id||null,JSON.stringify({cutoffAt:cutoff.toISOString()})])).rows[0];
  for(const line of lines){const key=lineKey(line.productId,line.lotId),physical=counts.get(key),variance=r6(physical-line.expectedQuantity),derivedActual=r6(line.baseAvailableQuantity-physical-line.wasteQuantity),unexplained=r6(derivedActual-line.theoreticalConsumption),differencePercent=line.expectedQuantity?r6(unexplained/Math.abs(line.expectedQuantity)*100):(unexplained?100:0),differenceCost=r6(unexplained*line.unitCost);await client.query(`INSERT INTO inventory_shift_summary_lines(closing_id,product_id,lot_id,unit_id,opening_quantity,confirmed_entries,outbound_transfers,production_entries,production_consumption,theoretical_consumption,waste_quantity,authorized_adjustments,expected_quantity,physical_quantity,variance_quantity,derived_actual_consumption,unexplained_difference,difference_percent,unit_cost,variance_cost,difference_cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,[closing.id,line.productId,line.lotId,line.unitId,line.openingQuantity,line.confirmedEntries,line.outboundTransfers,line.productionEntries,line.productionConsumption,line.theoreticalConsumption,line.wasteQuantity,line.authorizedAdjustments,line.expectedQuantity,physical,variance,derivedActual,unexplained,differencePercent,line.unitCost,r6(variance*line.unitCost),differenceCost]);const explanation=explanations.get(key);if(explanation&&String(explanation.reason||"").trim())await client.query(`INSERT INTO inventory_shift_variance_explanations(closing_id,physical_count_line_id,product_id,lot_id,variance_quantity,tolerance_percent,reason,evidence,related_waste_record_id,submitted_by_legacy_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,[closing.id,countLineIds.get(key),line.productId,line.lotId,variance,line.tolerancePercent,String(explanation.reason).trim(),JSON.stringify(Array.isArray(explanation.evidence)?explanation.evidence.filter(Boolean).slice(0,5):[]),explanation.relatedWasteRecordId?n(explanation.relatedWasteRecordId):null,actorId]);}
  await client.query("UPDATE inventory_shift_sessions SET status='SUBMITTED',submitted_at=$2,submitted_by_legacy_user_id=$3,updated_at=NOW(),metadata=metadata-'frozenCutoffAt' WHERE id=$1",[session.id,cutoff,actorId]);await audit(client,"SUBMIT",session.id,actorId,"Conteo enviado; quedó inmutable",{status:"COUNTING"},{status:"SUBMITTED",revision,varianceCost:r6(varianceCost)});return readDetail(client,session.id);
});}

async function postAdjustment(client,{key,type,productId,lotId,quantity,fromId,toId,cost,actorId,closingId,reversalOf}){return n((await client.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,FALSE,$15::jsonb) id",[key,type,productId,quantity,fromId||null,toId||null,lotId||null,cost,"Ajuste compensatorio del cierre de turno",actorId,"SHIFT_CLOSING",closingId,`CIERRE-${closingId}`,reversalOf||null,JSON.stringify({closingId})])).rows[0].id);}

async function syncLegacyProjection(client,warehouseId){const state=(await client.query("SELECT data FROM app_state WHERE id=1 FOR UPDATE")).rows[0].data;const rows=(await client.query(`SELECT p.legacy_id,COALESCE(SUM(b.on_hand),0) stock FROM inventory_products p JOIN inventory_stock_balances b ON b.product_id=p.id WHERE b.warehouse_id=$1 AND p.legacy_id IS NOT NULL GROUP BY p.legacy_id`,[warehouseId])).rows;for(const row of rows){const item=(state.inventory||[]).find(product=>n(product.id)===n(row.legacy_id));if(item)item.stock=n(row.stock);}await client.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1",[JSON.stringify(state)]);}

export async function observeOperationalInventory(id,payload,actorId){return tx(async(client)=>{const {user}=await actor(client,actorId);if(user.role!=="ADMINISTRADOR")fail(403,"Solo Administración puede observar un cierre");const session=await sessionRow(client,id,true);if(session.status!=="SUBMITTED")fail(409,"Solo un inventario enviado puede observarse");const reason=String(payload.reason||"").trim();if(reason.length<8)fail(400,"Indica una observación de al menos 8 caracteres");const closing=await latestClosing(client,session.id);await client.query("UPDATE inventory_closings SET status='OBSERVED',metadata=jsonb_set(metadata,'{observation}',to_jsonb($2::text),true) WHERE id=$1",[closing.id,reason]);await client.query("UPDATE inventory_shift_sessions SET status='OBSERVED',updated_at=NOW() WHERE id=$1",[session.id]);await audit(client,"OBSERVE",session.id,actorId,reason,{status:"SUBMITTED"},{status:"OBSERVED",revision:closing.revision});return readDetail(client,session.id);});}

export async function closeOperationalInventory(id,actorId){return tx(async(client)=>{const {user}=await actor(client,actorId);if(user.role!=="ADMINISTRADOR")fail(403,"Solo Administración puede aprobar y cerrar el turno");const session=await sessionRow(client,id,true);if(!["SUBMITTED","OBSERVED"].includes(session.status))fail(409,"Solo un inventario enviado u observado puede cerrarse");const closing=await latestClosing(client,session.id);const lines=await snapshotLines(client,closing.id);for(const line of lines){const variance=n(line.varianceQuantity);if(Math.abs(variance)<0.000001)continue;await postAdjustment(client,{key:`shift-close:${closing.id}:${line.productId}:${line.lotId||"base"}`,type:"SHIFT_CLOSING_ADJUSTMENT",productId:line.productId,lotId:line.lotId,quantity:Math.abs(variance),fromId:variance<0?session.warehouse_id:null,toId:variance>0?session.warehouse_id:null,cost:n(line.unitCost),actorId,closingId:closing.id});}await client.query("UPDATE inventory_physical_counts SET status='ACCEPTED' WHERE id=$1",[closing.physical_count_id]);await client.query("UPDATE inventory_closings SET status='CLOSED',approved_by_legacy_user_id=$2,approved_at=NOW() WHERE id=$1",[closing.id,actorId]);await client.query("UPDATE inventory_shift_sessions SET status='CLOSED',closed_at=NOW(),closed_by_legacy_user_id=$2,updated_at=NOW() WHERE id=$1",[session.id,actorId]);await syncLegacyProjection(client,session.warehouse_id);await audit(client,"CLOSE",session.id,actorId,"Cierre administrativo aprobado",{status:session.status},{status:"CLOSED",revision:closing.revision});return readDetail(client,session.id);});}

export async function reopenOperationalInventory(id,payload,actorId){return tx(async(client)=>{const {user}=await actor(client,actorId);if(user.role!=="ADMINISTRADOR")fail(403,"Solo Administración puede reabrir un inventario");const session=await sessionRow(client,id,true);if(!["SUBMITTED","OBSERVED","CLOSED"].includes(session.status))fail(409,"Solo puede reabrirse un inventario enviado, observado o cerrado");const reason=String(payload.reason||"").trim();if(reason.length<8)fail(400,"Indica un motivo de reapertura de al menos 8 caracteres");const later=(await client.query("SELECT id FROM inventory_shift_sessions WHERE warehouse_id=$1 AND id<>$2 AND status<>'PENDING' AND (period_started_at>$3 OR created_at>$4) LIMIT 1",[session.warehouse_id,session.id,session.submitted_at||session.created_at,session.created_at])).rows[0];if(later)fail(409,"No se puede reabrir porque ya existe un turno posterior; registra un ajuste compensatorio");const closing=await latestClosing(client,session.id);
    if(session.status==="CLOSED"){const movements=(await client.query("SELECT * FROM inventory_movements WHERE source_type='SHIFT_CLOSING' AND source_legacy_id=$1 AND movement_type='SHIFT_CLOSING_ADJUSTMENT' ORDER BY id",[closing.id])).rows;for(const movement of movements)await postAdjustment(client,{key:`shift-reopen:${closing.id}:${movement.id}`,type:"SHIFT_REOPEN_REVERSAL",productId:movement.product_id,lotId:movement.lot_id,quantity:n(movement.quantity),fromId:movement.to_warehouse_id,toId:movement.from_warehouse_id,cost:n(movement.unit_cost),actorId,closingId:closing.id,reversalOf:movement.id});await syncLegacyProjection(client,session.warehouse_id);}
    await client.query("UPDATE inventory_closings SET status='REOPENED',reopen_reason=$2 WHERE id=$1",[closing.id,reason]);await client.query(`UPDATE inventory_shift_sessions SET status='COUNTING',reopened_by_legacy_user_id=$2,reopened_at=NOW(),reopen_count=reopen_count+1,updated_at=NOW(),metadata=jsonb_set(metadata,'{frozenCutoffAt}',to_jsonb(submitted_at::text),true) WHERE id=$1`,[session.id,actorId]);await audit(client,"REOPEN",session.id,actorId,reason,{status:session.status,revision:closing.revision},{status:"COUNTING",reopenCount:n(session.reopen_count)+1});return readDetail(client,session.id);});}
