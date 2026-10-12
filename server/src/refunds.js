// Devoluciones de dinero. Reglas del dueño (2026-09-23):
//  - El cliente que pagó (100 % o 50 %) puede pedir su devolución hasta 24 horas después de su primer pago; pasado ese plazo no hay devolución.
//  - La devolución se procesa en 2 días hábiles y SOLO la aprueba y registra el Superadmin. Recepción únicamente registra la solicitud.
import { buildRows, findRawItem } from "./reservations-overview.js";

export const REFUND_WINDOW_HOURS = 24;
export const REFUND_BUSINESS_DAYS = 2;
export const RETURN_METHODS = ["YAPE", "PLIN", "EFECTIVO", "TRANSFERENCIA"];
const HOUR_MS = 3600000;
const OPEN = ["SOLICITADA", "APROBADA"];
const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();
const fail = (status, message) => { const error = new Error(message); error.status = status; return error; };
const zoneOf = (state) => state?.settings?.timezone || "America/Lima";
const dateIn = (iso, zone) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Suma días hábiles (lunes a viernes) a partir del día de `fromIso` en la zona del hotel y devuelve AAAA-MM-DD. */
export function addBusinessDays(fromIso, days, zone = "America/Lima") {
  let cursor = new Date(`${dateIn(fromIso, zone)}T12:00:00Z`);
  let remaining = days;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * HOUR_MS);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

function paymentsOf(state, type, id) {
  return (state.payments || []).filter((payment) => (upper(type) === "EVENTOS" ? Number(payment.eventId) === Number(id) : Number(payment.bookingId || payment.reservationId) === Number(id)));
}

export function firstPaymentAt(state, type, id, fallback) {
  const times = paymentsOf(state, type, id).map((payment) => payment.createdAt).filter(Boolean).sort();
  return times[0] || fallback || null;
}

export function refundWindow(firstAt, at = new Date()) {
  if (!firstAt) return { firstPaymentAt: null, windowEndsAt: null, hoursLeft: null, open: false };
  const end = new Date(new Date(firstAt).getTime() + REFUND_WINDOW_HOURS * HOUR_MS);
  return { firstPaymentAt: new Date(firstAt).toISOString(), windowEndsAt: end.toISOString(), hoursLeft: Math.round(((end.getTime() - at.getTime()) / HOUR_MS) * 10) / 10, open: end.getTime() >= at.getTime() };
}

const rowOf = (state, type, id, at) => buildRows(state, dateIn(at.toISOString(), zoneOf(state))).find((row) => row.type === upper(type) && Number(row.id) === Number(id));
const openRequestOf = (state, type, id) => (state.refundRequests || []).find((request) => request.type === upper(type) && Number(request.refId) === Number(id) && OPEN.includes(request.status)) || null;
const entitlementsOf = (state, type, id) => (state.entitlements || []).filter((item) => (upper(type) === "EVENTOS" ? Number(item.eventId) === Number(id) : Number(item.bookingId) === Number(id)));

/** Reservas con dinero pagado y su estado frente al plazo de 24 horas. */
export function buildRefundCandidates(state, query = {}, at = new Date()) {
  const needle = String(query.q || "").trim().toLowerCase();
  return buildRows(state, dateIn(at.toISOString(), zoneOf(state)))
    .filter((row) => n(row.paid) > 0 && !["CANCELADA", "COMPLETADA"].includes(row.status))
    .filter((row) => !needle || [row.code, row.clientName, row.clientDocument].some((value) => String(value || "").toLowerCase().includes(needle)))
    .map((row) => {
      const window = refundWindow(firstPaymentAt(state, row.type, row.id, row.createdAt), at);
      const open = openRequestOf(state, row.type, row.id);
      return { type: row.type, id: row.id, code: row.code, clientName: row.clientName, clientDocument: row.clientDocument, date: row.date, total: round(row.total), paid: round(row.paid), status: row.status, statusLabel: row.statusLabel, ...window, openRequest: open ? { id: open.id, code: open.code, status: open.status } : null };
    })
    .sort((a, b) => String(b.firstPaymentAt || "").localeCompare(String(a.firstPaymentAt || "")))
    .slice(0, 50);
}

function holdEntitlements(state, request) {
  for (const item of entitlementsOf(state, request.type, request.refId)) {
    if (["LISTO_INGRESO", "PENDIENTE", "ACTIVO"].includes(item.status)) { item.refundPrevStatus = item.status; item.status = "EN_REVISION"; }
  }
}
function releaseEntitlements(state, request) {
  for (const item of entitlementsOf(state, request.type, request.refId)) {
    if (item.status === "EN_REVISION") { item.status = item.refundPrevStatus || "PENDIENTE"; delete item.refundPrevStatus; }
  }
}

export function createRefundRequest(state, input, actor, at = new Date()) {
  const type = upper(input.type);
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw fail(400, "Escribe el motivo de la devolución (mínimo 5 caracteres)");
  const raw = findRawItem(state, type, input.id);
  if (!raw) throw fail(404, "Reserva no encontrada");
  const row = rowOf(state, type, input.id, at);
  if (!row || n(row.paid) <= 0) throw fail(409, "Esta reserva no tiene pagos registrados para devolver");
  if (["CANCELADA", "COMPLETADA"].includes(row.status)) throw fail(409, "Esta reserva ya no admite devolución");
  if (openRequestOf(state, type, input.id)) throw fail(409, "Ya existe una solicitud de devolución abierta para esta reserva");
  const window = refundWindow(firstPaymentAt(state, type, input.id, row.createdAt), at);
  let exception = false;
  if (!window.open) {
    if (!actor.isOwner) throw fail(409, `Pasaron más de ${REFUND_WINDOW_HOURS} horas desde el pago: ya no hay devolución. Solo el dueño puede autorizar una excepción.`);
    if (!input.exception) throw fail(409, `El plazo de ${REFUND_WINDOW_HOURS} horas ya venció. Confirma que es una excepción del dueño para continuar.`);
    if (reason.length < 10) throw fail(400, "Para una excepción fuera de plazo escribe el motivo completo (mínimo 10 caracteres)");
    exception = true;
  }
  state.refundRequests = state.refundRequests || [];
  const id = Math.max(0, ...state.refundRequests.map((request) => Number(request.id) || 0)) + 1;
  const request = {
    id, code: `DEV-${String(id).padStart(4, "0")}`, type, refId: row.id, reservationCode: row.code,
    clientId: row.clientId, clientName: row.clientName, paid: round(row.paid),
    firstPaymentAt: window.firstPaymentAt, windowEndsAt: window.windowEndsAt, exception, reason,
    status: "SOLICITADA", requestedAt: at.toISOString(), requestedById: actor.id, requestedByName: actor.name,
    dueDate: addBusinessDays(at.toISOString(), REFUND_BUSINESS_DAYS, zoneOf(state)),
    refundAmount: null, decidedAt: null, decidedById: null, decisionNote: null, returnedAt: null, returnMethod: null, operationRef: null
  };
  state.refundRequests.unshift(request);
  raw.refundHold = request.code;
  holdEntitlements(state, request);
  return request;
}

export function decideRefund(state, id, input, actor, at = new Date()) {
  const request = (state.refundRequests || []).find((item) => Number(item.id) === Number(id));
  if (!request) throw fail(404, "Solicitud de devolución no encontrada");
  if (request.status !== "SOLICITADA") throw fail(409, "Esta solicitud ya fue resuelta");
  const decision = upper(input.decision);
  const note = String(input.note || "").trim();
  const raw = findRawItem(state, request.type, request.refId);
  if (decision === "RECHAZAR") {
    if (note.length < 5) throw fail(400, "Escribe el motivo del rechazo (mínimo 5 caracteres)");
    request.status = "RECHAZADA";
    if (raw) raw.refundHold = null;
    releaseEntitlements(state, request);
  } else if (decision === "APROBAR") {
    const amount = input.amount === undefined || input.amount === "" ? request.paid : round(input.amount);
    if (!(amount > 0) || amount > request.paid) throw fail(400, `El monto a devolver debe ser mayor a cero y no superar lo pagado (S/ ${request.paid.toFixed(2)})`);
    if (amount < request.paid && note.length < 5) throw fail(400, "Si devuelves menos de lo pagado, escribe el motivo");
    request.status = "APROBADA";
    request.refundAmount = amount;
  } else throw fail(400, "Indica si apruebas o rechazas la devolución");
  request.decisionNote = note || null;
  request.decidedAt = at.toISOString();
  request.decidedById = actor.id;
  return request;
}

export function completeRefund(state, id, input, actor, at = new Date()) {
  const request = (state.refundRequests || []).find((item) => Number(item.id) === Number(id));
  if (!request) throw fail(404, "Solicitud de devolución no encontrada");
  if (request.status !== "APROBADA") throw fail(409, "Solo se registra la devolución de una solicitud aprobada");
  const method = upper(input.method);
  if (!RETURN_METHODS.includes(method)) throw fail(400, "Elige cómo se devolvió el dinero (Yape, Plin, efectivo o transferencia)");
  const operationRef = String(input.operationRef || "").trim();
  if (method !== "EFECTIVO" && operationRef.length < 3) throw fail(400, "Escribe el número de operación de la devolución");
  const raw = findRawItem(state, request.type, request.refId);
  const before = raw ? upper(raw.status) : null;
  if (raw) {
    raw.status = request.type === "EVENTOS" ? "CANCELADO" : "CANCELADA";
    raw.refundHold = null;
    raw.refundedAmount = request.refundAmount;
    if (request.type === "HOSPEDAJE") { const booking = (state.bookings || []).find((row) => Number(row.id) === Number(raw.id)); if (booking) booking.status = raw.status; }
  }
  const entitlements = entitlementsOf(state, request.type, request.refId);
  for (const item of entitlements) { item.status = "ANULADO"; delete item.refundPrevStatus; }
  for (const pass of state.passes || []) {
    const own = (state.entitlements || []).filter((item) => item.passId === pass.id);
    if (own.length && own.every((item) => item.status === "ANULADO")) pass.status = "ANULADO";
  }
  const movement = { id: Date.now(), type: "EGRESO", serviceCode: request.type, category: "DEVOLUCION", concept: `Devolución ${request.code} · ${request.reservationCode}`, method, amount: request.refundAmount, reference: operationRef || null, refundId: request.id, createdAt: at.toISOString(), sessionId: null, createdById: actor.id };
  state.cashMovements = state.cashMovements || [];
  state.cashMovements.unshift(movement);
  request.status = "DEVUELTA";
  request.returnedAt = at.toISOString();
  request.returnMethod = method;
  request.operationRef = operationRef || null;
  return { request, movement, statusBefore: before, statusAfter: raw ? upper(raw.status) : null };
}

/** Lista para pantalla: Superadmin ve todas; Recepción solo las que ella registró. */
export function listRefunds(state, actor, at = new Date()) {
  const zone = zoneOf(state);
  const today = dateIn(at.toISOString(), zone);
  const monthPrefix = today.slice(0, 7);
  const all = state.refundRequests || [];
  const visible = actor.isOwner ? all : all.filter((request) => Number(request.requestedById) === Number(actor.id));
  const rows = visible.map((request) => ({ ...request, overdue: OPEN.includes(request.status) && today > request.dueDate }));
  const returnedThisMonth = visible.filter((request) => request.status === "DEVUELTA" && String(request.returnedAt || "").length && dateIn(request.returnedAt, zone).startsWith(monthPrefix));
  return {
    windowHours: REFUND_WINDOW_HOURS, businessDays: REFUND_BUSINESS_DAYS, today,
    // El total devuelto en dinero es información del dueño; Recepción solo ve conteos de lo que ella registró.
    summary: {
      toDecide: visible.filter((request) => request.status === "SOLICITADA").length,
      toReturn: visible.filter((request) => request.status === "APROBADA").length,
      overdue: visible.filter((request) => OPEN.includes(request.status) && today > request.dueDate).length,
      returnedThisMonth: returnedThisMonth.length,
      returnedAmountThisMonth: actor.isOwner ? round(returnedThisMonth.reduce((total, request) => total + n(request.refundAmount), 0)) : null
    },
    rows
  };
}
