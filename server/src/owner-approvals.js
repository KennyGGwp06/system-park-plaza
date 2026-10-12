// Bandeja "Por aprobar" del dueño (2026-09-27): todo lo que en cualquier área espera una decisión del Superadmin,
// con el detalle de cada caso y la vista donde se resuelve. También junta lo que conviene vigilar (sin decisión propia).
// No duplica reglas: lee los mismos datos que usan Cocina, Bar, Recepción, Insumos, Dinero y Equipo.
import { db } from "./db.js";
import { listStockRequests } from "./stock-requests.js";
import { listRefunds } from "./refunds.js";
import { controlTower } from "./workforce.js";

const n = (value) => Number(value || 0);
const upper = (value) => String(value || "").toUpperCase();
const round = (value) => Math.round(n(value) * 100) / 100;
const AREA = { RESTAURANTE: "Cocina", BARTENDER: "Bar" };
const person = (state, id) => { const u = (state.users || []).find((row) => n(row.id) === n(id)) || (state.employees || []).find((row) => n(row.id) === n(id)); return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : null; };
const clientName = (state, id) => { const c = (state.clients || []).find((row) => n(row.id) === n(id)); return c ? `${c.firstName || ""} ${c.lastName || ""}`.trim() : "Cliente"; };

export async function buildOwnerApprovals(state) {
  const closings = (await db.query(`SELECT s.id,s.area_code,s.operational_date,s.shift_code,s.status,s.submitted_at,s.submitted_by_legacy_user_id,
      (SELECT COUNT(*) FROM inventory_shift_summary_lines l JOIN inventory_closings c ON c.id=l.closing_id WHERE c.session_id=s.id AND c.revision=(SELECT MAX(revision) FROM inventory_closings WHERE session_id=s.id) AND ABS(l.physical_quantity-l.expected_quantity)>0.000001) differences
    FROM inventory_shift_sessions s WHERE s.status IN ('SUBMITTED','OBSERVED') ORDER BY s.submitted_at`).catch(() => ({ rows: [] }))).rows;
  const requests = (await listStockRequests({ status: "REQUESTED" }, { role: "ADMINISTRADOR" }).catch(() => [])).filter((row) => row.status === "REQUESTED");
  const refunds = listRefunds(state, { isOwner: true }).rows.filter((row) => row.status === "SOLICITADA");
  const tower = await controlTower(state, {}).catch(() => ({ pending: [] }));
  const verifying = [...(state.bookings || [])].filter((row) => upper(row.paymentStatus) === "PENDIENTE_VERIFICACION");
  const cashReview = (state.cashSessions || []).filter((row) => upper(row.status) === "EN_REVISION");

  const groups = [
    { key: "cierres", label: "Cierres de inventario", detail: "Cocina y Bar no pueden abrir el día siguiente hasta que los apruebes", tone: "crit", go: ["restaurante", "consumo"],
      items: closings.map((row) => ({ id: `cierre-${row.id}`, ref: n(row.id), title: `${AREA[row.area_code] || row.area_code} · cierre del ${String(row.operational_date).slice(0, 10)}`, detail: `${row.shift_code}${person(state, row.submitted_by_legacy_user_id) ? ` · enviado por ${person(state, row.submitted_by_legacy_user_id)}` : ""} · ${n(row.differences) ? `${n(row.differences)} insumo(s) con diferencia` : "sin diferencias"}`, at: row.submitted_at, status: row.status === "OBSERVED" ? "Observado" : "Enviado", go: [row.area_code === "BARTENDER" ? "bar" : "restaurante", "cierres"] })) },
    { key: "pagos", label: "Pagos Yape / Plin por verificar", detail: "Confirma la operación antes de dar la reserva por pagada", tone: "crit", go: ["dinero", "pagos"],
      items: verifying.map((row) => ({ id: `pago-${row.id}`, ref: n(row.id), title: `${row.code || `RES-${row.id}`} · ${clientName(state, row.clientId)}`, detail: `${row.serviceCode || "Reserva"} · ${upper(row.paymentMethod || row.lastPaymentMethod) || "Digital"}${row.operationCode ? ` · operación ${row.operationCode}` : ""}`, amount: round(row.paymentRequested || row.balance), at: row.updatedAt || row.createdAt, go: ["reservas", "general"] })) },
    { key: "solicitudes", label: "Solicitudes de insumos", detail: "Cocina y Bar esperan que apruebes lo que piden", tone: "warn", go: ["insumos", "solicitudes"],
      items: requests.map((row) => ({ id: `sol-${row.id}`, ref: n(row.id), title: `${row.code} · ${AREA[row.area] || row.area}`, detail: `${row.source === "CIERRE" ? "Pedido para mañana" : "Emergencia"} · ${(row.lines || []).map((line) => `${line.productName} ${Number(line.requestedQuantity).toLocaleString("es-PE")} ${line.unitSymbol || ""}`.trim()).slice(0, 4).join(", ")}${(row.lines || []).length > 4 ? "…" : ""}`, at: row.requestedAt })) },
    { key: "devoluciones", label: "Devoluciones por decidir", detail: "Recepción pidió devolver dinero a un cliente", tone: "warn", go: ["dinero", "devoluciones"],
      items: refunds.map((row) => ({ id: `dev-${row.id}`, ref: n(row.id), title: `${row.code || `DEV-${row.id}`} · ${row.clientName || clientName(state, row.clientId)}`, detail: `${row.reason || "Sin motivo"}${row.overdue ? " · vencida" : ""}`, amount: round(row.refundAmount || row.requestedAmount), at: row.requestedAt || row.createdAt })) },
    { key: "cajas", label: "Cajas por revisar", detail: "Rendiciones de caja que esperan tu revisión", tone: "warn", go: ["dinero", "cajas"],
      items: cashReview.map((row) => ({ id: `caja-${row.id}`, ref: n(row.id), title: `Caja de ${person(state, row.userId) || "Recepción"}`, detail: `Declarado S/ ${round(row.actualCash).toFixed(2)}${row.variance != null ? ` · diferencia S/ ${round(row.variance).toFixed(2)}` : ""}`, at: row.closedAt || row.updatedAt })) },
    { key: "dias", label: "Días de trabajo por validar", detail: "Entrada, salida y evidencia: define el pago semanal", tone: "info", go: ["equipo", "torre"],
      items: (tower.pendingValidation || []).map((row, index) => ({ id: `dia-${row.employeeId}-${row.date}-${index}`, ref: n(row.employeeId), title: `${row.name} · ${row.area}`, detail: `${row.date} · ${row.reason || "Falta revisar"}`, at: row.date })) }
  ].map((group) => ({ ...group, count: group.items.length }));

  // Para vigilar: no piden una decisión del dueño, pero si se acumulan algo está fallando en la operación.
  const openRequests = (state.requests || []).filter((row) => !["RESUELTO", "SOLUCIONADO", "CERRADO", "CANCELADO"].includes(upper(row.status)));
  const watch = [
    { key: "mantenimiento", label: "Mantenimiento sin técnico", count: openRequests.filter((row) => row.requiresMaintenance && !row.assignedMaintenanceEmployeeId).length, go: ["operaciones", "mantenimiento"] },
    { key: "limpieza", label: "Limpieza sin responsable", count: (state.tasks || []).filter((row) => !["FINALIZADA", "DANOS_REPORTADOS"].includes(upper(row.status)) && !row.assignedEmployeeId).length, go: ["operaciones", "limpieza"] },
    { key: "pedidos", label: "Pedidos sin entregar", count: (state.orders || []).filter((row) => ["PENDIENTE", "EN_COCINA", "PREPARANDO", "LISTO"].includes(upper(row.status))).length, go: ["restaurante", "pedidos"] },
    { key: "carta", label: "Platos y bebidas sin venta habilitada", count: (state.menuItems || []).filter((row) => row.active !== false && row.salesEnabled !== true).length, go: ["catalogo", "carta"] }
  ];
  return { generatedAt: new Date().toISOString(), total: groups.reduce((sum, group) => sum + group.count, 0), groups, watch };
}
