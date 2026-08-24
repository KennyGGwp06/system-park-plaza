import { db, mutateState } from "./db.js";
import { stabilizeLegacyState } from "./state-stabilization.js";
import { ensureOrderDeadlines } from "./order-operations.js";

const n = (value) => Number(value || 0);
const item = (id, label, detail) => ({ id, label, detail });

export async function dataIntegrityReport() {
  const state = (await db.query("SELECT data FROM app_state WHERE id=1")).rows[0].data;
  const activeStaysWithoutQr = (state.stays || []).filter((stay) => stay.status === "ACTIVA" && !(state.passes || []).some((pass) => n(pass.clientId) === n(stay.clientId) && pass.status !== "REVOCADO"));
  const incompleteOrders = (state.orders || []).filter((order) => order.integrityStatus === "REQUIRES_REVIEW" || !order.code || !(order.items || []).length);
  const missingDeadlines = (state.orders || []).filter((order) => !["ENTREGADO", "CANCELADO"].includes(order.status) && (!order.dueAt || !order.abandonmentAt));
  const malformedAttendance = (state.attendance || []).filter((row) => !n(row.employeeId || row.userId) || !(row.checkIn || row.clockIn));
  const orphanEntitlements = (state.entitlements || []).filter((entry) => !(state.passes || []).some((pass) => n(pass.id) === n(entry.passId)) || (entry.bookingId && !(state.bookings || []).some((booking) => n(booking.id) === n(entry.bookingId))) || (entry.eventId && !(state.events || []).some((event) => n(event.id) === n(entry.eventId))));
  const orphanPasses = (state.passes || []).filter((pass) => !(state.clients || []).some((client) => n(client.id) === n(pass.clientId)) || !(state.entitlements || []).some((entry) => n(entry.passId) === n(pass.id)));
  const [recipes, stock, expired] = await Promise.all([
    db.query(`SELECT r.id,r.name FROM inventory_recipes r JOIN inventory_recipe_versions rv ON rv.recipe_id=r.id AND rv.status='ACTIVE' LEFT JOIN inventory_recipe_ingredients ri ON ri.recipe_version_id=rv.id GROUP BY r.id,r.name,rv.id HAVING COUNT(ri.id)=0 OR MIN(ri.base_quantity)<=0 OR MAX(rv.yield_unit_id) IS NULL`),
    db.query(`SELECT p.name,b.on_hand,b.reserved FROM inventory_stock_balances b JOIN inventory_products p ON p.id=b.product_id WHERE b.on_hand<0 OR b.reserved<0 OR b.reserved>b.on_hand`),
    db.query(`SELECT p.name,l.lot_code FROM inventory_lots l JOIN inventory_products p ON p.id=l.product_id JOIN inventory_stock_balances b ON b.lot_id=l.id WHERE l.expires_on<CURRENT_DATE AND b.on_hand>0 LIMIT 50`)
  ]);
  const checks = [
    { code: "ORDERS", title: "Pedidos incompletos", severity: incompleteOrders.length ? "CRITICAL" : "OK", autoFixable: true, items: incompleteOrders.map((row) => item(row.id, row.code || `Pedido ${row.id}`, "Código, líneas o integridad incompletos")) },
    { code: "DEADLINES", title: "Pedidos sin SLA", severity: missingDeadlines.length ? "WARNING" : "OK", autoFixable: true, items: missingDeadlines.map((row) => item(row.id, row.code || `Pedido ${row.id}`, "Sin vencimiento o escalamiento")) },
    { code: "RECIPES", title: "Recetas técnicas incompletas", severity: recipes.rowCount ? "CRITICAL" : "OK", autoFixable: false, items: recipes.rows.map((row) => item(row.id, row.name, "Faltan ingredientes, unidad de rendimiento o cantidades base")) },
    { code: "STAYS", title: "Estancias sin QR", severity: activeStaysWithoutQr.length ? "CRITICAL" : "OK", autoFixable: true, items: activeStaysWithoutQr.map((row) => item(row.id, `Estancia ${row.id}`, "Huésped activo sin pase")) },
    { code: "STOCK", title: "Saldos de inventario inválidos", severity: stock.rowCount ? "CRITICAL" : "OK", autoFixable: true, items: stock.rows.map((row) => item(row.name, row.name, `Físico ${row.on_hand}; reservado ${row.reserved}`)) },
    { code: "EXPIRY", title: "Lotes vencidos con saldo", severity: expired.rowCount ? "WARNING" : "OK", autoFixable: false, items: expired.rows.map((row) => item(row.lot_code, row.name, `Lote ${row.lot_code} requiere merma o evaluación`)) },
    { code: "ATTENDANCE", title: "Marcaciones incompletas", severity: malformedAttendance.length ? "WARNING" : "OK", autoFixable: true, items: malformedAttendance.map((row) => item(row.id, `Marcación ${row.id}`, "Sin colaborador o hora de ingreso")) },
    { code: "PASSES", title: "Pases y accesos inconsistentes", severity: orphanEntitlements.length || orphanPasses.length ? "CRITICAL" : "OK", autoFixable: false, items: [...orphanEntitlements.map((row) => item(`entitlement-${row.id}`, `Acceso ${row.id}`, "No tiene pase, reserva o evento válido")), ...orphanPasses.map((row) => item(`pass-${row.id}`, row.code || `Pase ${row.id}`, "No tiene cliente o servicio asociado"))] }
  ];
  return { generatedAt: new Date().toISOString(), summary: { critical: checks.filter((check) => check.severity === "CRITICAL").reduce((sum, check) => sum + check.items.length, 0), warnings: checks.filter((check) => check.severity === "WARNING").reduce((sum, check) => sum + check.items.length, 0), healthy: checks.filter((check) => check.severity === "OK").length }, checks };
}

export async function sanitizeDataIntegrity(actorId) {
  const repaired = await mutateState((state) => {
    const result = stabilizeLegacyState(state);
    for (const order of state.orders || []) ensureOrderDeadlines(order);
    for (const record of state.attendance || []) {
      record.employeeId = n(record.employeeId || record.userId);
      record.userId = record.employeeId;
      record.checkIn ||= record.clockIn || null;
      record.clockIn ||= record.checkIn || null;
      record.checkOut ||= record.clockOut || null;
      record.clockOut ||= record.checkOut || null;
      record.date ||= String(record.checkIn || new Date().toISOString()).slice(0, 10);
    }
    return result;
  });
  const stock = await db.query("UPDATE inventory_stock_balances SET reserved=LEAST(GREATEST(reserved,0),GREATEST(on_hand,0)),updated_at=NOW() WHERE reserved<0 OR reserved>on_hand RETURNING id");
  await db.query(`INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,actor_legacy_user_id,reason,after_data,correlation_id) VALUES('SANITIZE','DATA_INTEGRITY',0,$1,'Saneamiento seguro ejecutado',$2::jsonb,$3)`, [actorId, JSON.stringify({ ...repaired, stockBalancesClamped: stock.rowCount }), `integrity:${Date.now()}`]);
  return { ...repaired, stockBalancesClamped: stock.rowCount, report: await dataIntegrityReport() };
}
