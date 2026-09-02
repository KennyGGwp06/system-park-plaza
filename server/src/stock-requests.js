import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { createTransfer } from "./transfers.js";

const n = (value) => Number(value || 0);
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }

async function readRequests(client, filters = {}) {
  const params = []; const where = [];
  if (filters.area) { params.push(String(filters.area).toUpperCase()); where.push(`r.area_code=$${params.length}`); }
  if (filters.status) { params.push(String(filters.status).toUpperCase()); where.push(`r.status=$${params.length}`); }
  const requests = (await client.query(`SELECT r.id,r.code,r.area_code "area",r.status,r.requested_by_legacy_user_id "requestedBy",r.reviewed_by_legacy_user_id "reviewedBy",r.transfer_id "transferId",r.observation,r.review_note "reviewNote",r.requested_at "requestedAt",r.reviewed_at "reviewedAt",t.code "transferCode",t.status "transferStatus"
    FROM inventory_stock_requests r LEFT JOIN inventory_transfers t ON t.id=r.transfer_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.requested_at DESC`, params)).rows;
  if (!requests.length) return [];
  const lines = (await client.query(`SELECT l.id,l.request_id "requestId",l.product_id "productId",p.name "productName",l.unit_id "unitId",u.symbol "unitSymbol",l.requested_quantity "requestedQuantity",l.approved_quantity "approvedQuantity",l.observation,
      COALESCE((SELECT SUM(b.on_hand-b.reserved) FROM inventory_stock_balances b JOIN inventory_warehouses w ON w.id=b.warehouse_id JOIN inventory_lots lot ON lot.id=b.lot_id WHERE b.product_id=p.id AND w.code='GENERAL' AND w.active AND lot.status='AVAILABLE'),0) "generalAvailable"
    FROM inventory_stock_request_lines l JOIN inventory_products p ON p.id=l.product_id JOIN inventory_units u ON u.id=l.unit_id WHERE l.request_id=ANY($1::bigint[]) ORDER BY l.id`, [requests.map((item) => item.id)])).rows;
  const state = (await client.query("SELECT data FROM app_state WHERE id=1")).rows[0].data;
  const person = (id) => { const user=(state.users||[]).find((item)=>n(item.id)===n(id)); return user ? `${user.firstName} ${user.lastName}`.trim() : null; };
  return requests.map((request) => ({ ...request, requestedByName: person(request.requestedBy), reviewedByName: person(request.reviewedBy), lines: lines.filter((line) => n(line.requestId) === n(request.id)) }));
}

export async function stockRequestReferences() {
  const products = (await db.query(`SELECT p.id,p.name,p.default_area_code "area",p.base_unit_id "unitId",u.symbol "unitSymbol",
      COALESCE(SUM(CASE WHEN w.code='GENERAL' AND w.active AND lot.status='AVAILABLE' THEN b.on_hand-b.reserved ELSE 0 END),0) "generalAvailable"
    FROM inventory_products p JOIN inventory_units u ON u.id=p.base_unit_id
    LEFT JOIN inventory_stock_balances b ON b.product_id=p.id
    LEFT JOIN inventory_warehouses w ON w.id=b.warehouse_id
    LEFT JOIN inventory_lots lot ON lot.id=b.lot_id
    WHERE p.status='ACTIVE' GROUP BY p.id,p.name,p.default_area_code,p.base_unit_id,u.symbol ORDER BY p.name`)).rows;
  return { products, areas: ['RESTAURANTE','BARTENDER'] };
}

export async function listStockRequests(filters, user) {
  const area = ['RESTAURANTE','BARTENDER'].includes(user.role) ? user.role : filters.area;
  return readRequests(db, { ...filters, area });
}

export async function createStockRequest(payload, user) {
  const area = ['RESTAURANTE','BARTENDER'].includes(user.role) ? user.role : String(payload.area || '').toUpperCase();
  if (!['RESTAURANTE','BARTENDER'].includes(area)) fail(400, 'Área de solicitud no válida');
  if (!(payload.lines || []).length) fail(400, 'Agrega al menos un insumo');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const code = `SOL-${area === 'RESTAURANTE' ? 'RES' : 'BAR'}-${randomUUID().slice(0,6).toUpperCase()}`;
    const request = (await client.query(`INSERT INTO inventory_stock_requests(code,area_code,requested_by_legacy_user_id,observation) VALUES($1,$2,$3,$4) RETURNING id`, [code, area, user.id, String(payload.observation || '').trim() || null])).rows[0];
    const seen = new Set();
    for (const line of payload.lines) {
      const productId=n(line.productId), quantity=n(line.quantity); if (!productId || quantity<=0 || seen.has(productId)) fail(400,'Productos o cantidades de solicitud no válidos'); seen.add(productId);
      const product=(await client.query("SELECT id,base_unit_id FROM inventory_products WHERE id=$1 AND status='ACTIVE'",[productId])).rows[0]; if(!product) fail(404,'Uno de los productos no existe');
      await client.query(`INSERT INTO inventory_stock_request_lines(request_id,product_id,unit_id,requested_quantity,observation) VALUES($1,$2,$3,$4,$5)`,[request.id,product.id,product.base_unit_id,quantity,String(line.observation||'').trim()||null]);
    }
    await client.query(`INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,after_data,correlation_id) VALUES('CREATE','STOCK_REQUEST',$1,$2,$3,$4::jsonb,$5)`,[request.id,user.id,'Solicitud de stock creada',JSON.stringify({area,lines:payload.lines.length}),code]);
    await client.query('COMMIT'); return (await readRequests(client,{})).find((item)=>n(item.id)===n(request.id));
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function reviewStockRequest(id, payload, user) {
  const request = (await db.query("SELECT * FROM inventory_stock_requests WHERE id=$1",[n(id)])).rows[0];
  if(!request) fail(404,'Solicitud no encontrada'); if(request.status!=='REQUESTED') fail(409,'La solicitud ya fue revisada');
  const decision=String(payload.decision||'').toUpperCase();
  if(decision==='REJECT') {
    const rejected=await db.query("UPDATE inventory_stock_requests SET status='REJECTED',reviewed_by_legacy_user_id=$2,review_note=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='REQUESTED' AND reviewed_at IS NULL RETURNING id",[request.id,user.id,String(payload.note||'').trim()||'Solicitud rechazada']);
    if(!rejected.rowCount) fail(409,'La solicitud está siendo revisada o ya fue resuelta');
    return (await readRequests(db,{})).find((item)=>n(item.id)===n(request.id));
  }
  if(decision!=='APPROVE') fail(400,'Decisión no válida');
  const current=(await readRequests(db,{})).find((item)=>n(item.id)===n(request.id));
  const general=(await db.query("SELECT id FROM inventory_warehouses WHERE code='GENERAL' AND active")).rows[0];
  const destination=(await db.query("SELECT id FROM inventory_warehouses WHERE code=$1 AND active",[request.area_code])).rows[0];
  const quantities=new Map((payload.lines||[]).map((line)=>[n(line.lineId),n(line.quantity)]));
  const approved=current.lines.map((line)=>({ ...line, approvedQuantity: quantities.has(n(line.id)) ? quantities.get(n(line.id)) : n(line.requestedQuantity) })).filter((line)=>line.approvedQuantity>0);
  if(!approved.length) fail(400,'Aprueba al menos una cantidad');
  const stock=(await db.query(`SELECT b.product_id,b.lot_id,(b.on_hand-b.reserved) available FROM inventory_stock_balances b JOIN inventory_lots l ON l.id=b.lot_id WHERE b.warehouse_id=$1 AND b.on_hand-b.reserved>0 AND l.status='AVAILABLE' ORDER BY l.expires_on NULLS LAST,l.created_at`,[general.id])).rows;
  const transferLines=[];
  for(const line of approved){let pending=line.approvedQuantity;for(const balance of stock.filter((row)=>n(row.product_id)===n(line.productId))){const take=Math.min(pending,n(balance.available));if(take>0){transferLines.push({productId:line.productId,lotId:balance.lot_id,quantity:take,observation:`Solicitud ${request.code}`});pending-=take;}if(pending<=0.000001)break;}if(pending>0.000001)fail(409,`Stock general insuficiente de ${line.productName}. Falta ${pending}`);}
  const claimed=await db.query("UPDATE inventory_stock_requests SET reviewed_by_legacy_user_id=$2,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='REQUESTED' AND reviewed_at IS NULL RETURNING id",[request.id,user.id]);
  if(!claimed.rowCount) fail(409,'La solicitud está siendo revisada o ya fue resuelta');
  let transfer;
  try {
    transfer=await createTransfer({fromWarehouseId:general.id,toWarehouseId:destination.id,lines:transferLines,observation:`Asignación aprobada desde ${request.code}`},user.id);
  } catch(error) {
    await db.query("UPDATE inventory_stock_requests SET reviewed_by_legacy_user_id=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=$1 AND status='REQUESTED' AND transfer_id IS NULL",[request.id]);
    throw error;
  }
  const client=await db.connect();try{await client.query('BEGIN');for(const line of approved)await client.query("UPDATE inventory_stock_request_lines SET approved_quantity=$2 WHERE id=$1",[line.id,line.approvedQuantity]);await client.query("UPDATE inventory_stock_requests SET status='APPROVED',reviewed_by_legacy_user_id=$2,review_note=$3,reviewed_at=NOW(),transfer_id=$4,updated_at=NOW() WHERE id=$1",[request.id,user.id,String(payload.note||'').trim()||null,transfer.id]);await client.query(`INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,after_data,correlation_id) VALUES('APPROVE','STOCK_REQUEST',$1,$2,$3,$4::jsonb,$5)`,[request.id,user.id,'Solicitud aprobada y transferencia creada',JSON.stringify({transferId:transfer.id}),request.code]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  return (await readRequests(db,{})).find((item)=>n(item.id)===n(request.id));
}
