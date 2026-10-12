import { db } from "./db.js";
import { AREAS as CLOSING_AREAS, areaClosingStatus } from "./daily-needs.js";

// Fase 3: torre de control y personal. Puntualidad medida, día validado (entrada + salida + evidencia) y cobertura por área.
const n = (value) => Number(value || 0);
export const DEFAULT_TOLERANCE_MINUTES = 10;
export const DEFAULT_MIN_EVIDENCE = 1;
export const DEFAULT_ALERT_SLA_MINUTES = 30;
// Regla del dueño: 3 tardanzas sin justificar en la semana = 20 % de descuento del pago semanal.
export const DEFAULT_LATE_THRESHOLD = 3;
export const DEFAULT_LATE_DISCOUNT_PERCENT = 20;
const ALERT_CLOSED = new Set(["RESUELTO", "SOLUCIONADO", "CERRADO", "FINALIZADA", "FINALIZADO", "CANCELADO"]);
const HOTEL_OPEN = 7 * 60;
const HOTEL_CLOSE = 24 * 60;
// Áreas de personal con turnos; Recepción y Piscina también cuentan, cada una con su evidencia.
const AREA_LABELS = { RECEPCION: "Recepción", ADMINISTRADOR: "Recepción", RESTAURANTE: "Restaurante", BARTENDER: "Bar", LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento", PISCINA: "Piscina" };
const areaLabel = (area) => AREA_LABELS[String(area || "").toUpperCase()] || String(area || "Sin área");

const tzOf = (state) => state?.settings?.timezone || "America/Lima";
export const settingsOf = (state) => ({
  toleranceMinutes: Number.isFinite(Number(state?.settings?.punctualityToleranceMinutes)) ? Number(state.settings.punctualityToleranceMinutes) : DEFAULT_TOLERANCE_MINUTES,
  minEvidence: Number.isFinite(Number(state?.settings?.minDayEvidence)) ? Number(state.settings.minDayEvidence) : DEFAULT_MIN_EVIDENCE,
  alertSlaMinutes: Number.isFinite(Number(state?.settings?.alertSlaMinutes)) ? Number(state.settings.alertSlaMinutes) : DEFAULT_ALERT_SLA_MINUTES,
  lateThreshold: Number.isFinite(Number(state?.settings?.lateThreshold)) ? Number(state.settings.lateThreshold) : DEFAULT_LATE_THRESHOLD,
  lateDiscountPercent: Number.isFinite(Number(state?.settings?.lateDiscountPercent)) ? Number(state.settings.lateDiscountPercent) : DEFAULT_LATE_DISCOUNT_PERCENT
});

function parts(value, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value)).map((item) => [item.type, item.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const toMinutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const employeeName = (employee) => employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.email : "—";
const addDays = (date, delta) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };

/** Marcaciones de un empleado en un día (hora de Lima). */
function attendanceOf(state, employeeId, date) {
  const tz = tzOf(state);
  return (state.attendance || []).filter((row) => n(row.employeeId || row.userId) === n(employeeId) && String(row.date || "").slice(0, 10) === date && (row.checkIn || row.clockIn))
    .map((row) => ({ inAt: row.checkIn || row.clockIn, outAt: row.checkOut || row.clockOut || null, inMinutes: parts(row.checkIn || row.clockIn, tz).minutes, outMinutes: (row.checkOut || row.clockOut) ? parts(row.checkOut || row.clockOut, tz).minutes : null }))
    .sort((a, b) => a.inMinutes - b.inMinutes);
}

/** Evidencia de trabajo de un empleado en un día: tareas, trabajos, pedidos, mermas y conteos de inventario ligados a su usuario. */
export async function collectEvidence(state, from, to) {
  const tz = tzOf(state);
  const counts = new Map();
  const add = (employeeId, when, kind) => {
    if (!employeeId || !when) return;
    const date = parts(when, tz).date; if (date < from || date > to) return;
    const key = `${n(employeeId)}|${date}`; const current = counts.get(key) || { total: 0, kinds: {} };
    current.total += 1; current.kinds[kind] = (current.kinds[kind] || 0) + 1; counts.set(key, current);
  };
  for (const task of state.tasks || []) if (/FINALIZ|COMPLET|DANOS/i.test(task.status || "") && (task.evidences?.length || task.evidence?.length || task.finishedAt)) add(task.assignedEmployeeId, task.finishedAt || task.updatedAt, "Tareas de limpieza");
  // "SOLUCIONADO" es el estado con que Mantenimiento termina un trabajo (y resolvedAt su fecha): antes no se contaba y los
  // días de los técnicos nunca se validaban solos.
  for (const request of state.requests || []) if (/FINALIZ|REPAR|RESUEL|SOLUCION|CERR/i.test(request.status || "")) add(request.resolvedById || request.assignedMaintenanceEmployeeId || request.assignedEmployeeId, request.resolvedAt || request.repairedAt || request.finishedAt || request.updatedAt, "Trabajos de mantenimiento");
  for (const order of state.orders || []) {
    add(order.acceptedById, order.acceptedAt || order.updatedAt, "Pedidos atendidos"); add(order.preparedById, order.preparedAt || order.updatedAt, "Pedidos atendidos");
    add(order.readyById, order.readyAt || order.updatedAt, "Pedidos atendidos"); add(order.deliveredById, order.deliveredAt || order.updatedAt, "Pedidos atendidos");
  }
  for (const session of state.cashSessions || []) add(session.openedBy || session.userId || session.employeeId, session.openedAt || session.createdAt, "Caja de recepción");
  for (const entry of state.poolEntries || []) add(entry.registeredById || entry.createdBy || entry.userId, entry.createdAt || entry.checkInAt, "Ingresos registrados");
  for (const log of state.accessLogs || []) add(log.userId || log.validatedById || log.employeeId, log.createdAt || log.at, "Accesos validados");
  const sessions = (await db.query(`SELECT submitted_by_legacy_user_id id,submitted_at at FROM inventory_shift_sessions WHERE submitted_by_legacy_user_id IS NOT NULL AND submitted_at >= $1::date - 1 AND submitted_at < $2::date + 2`, [from, to])).rows;
  for (const row of sessions) add(row.id, row.at, "Cierre de inventario");
  const wastes = (await db.query(`SELECT responsible_legacy_user_id id,occurred_at at FROM inventory_waste_records WHERE responsible_legacy_user_id IS NOT NULL AND occurred_at >= $1::date - 1 AND occurred_at < $2::date + 2`, [from, to])).rows;
  for (const row of wastes) add(row.id, row.at, "Mermas registradas");
  return counts;
}

/** Estado del día de un empleado: VALIDADO / PENDIENTE / NO_VALIDADO, con la decisión manual del dueño si existe. */
export function dayStatus(state, employeeId, date, evidence, minEvidence) {
  const marks = attendanceOf(state, employeeId, date);
  const hasIn = marks.length > 0; const hasOut = marks.some((mark) => mark.outAt);
  const found = evidence.get(`${n(employeeId)}|${date}`) || { total: 0, kinds: {} };
  const manual = (state.dayValidations || []).filter((item) => n(item.employeeId) === n(employeeId) && item.date === date).at(-1) || null;
  let status; let reason;
  if (manual) { status = manual.decision === "APROBADO" ? "VALIDADO" : "NO_VALIDADO"; reason = `${manual.decision === "APROBADO" ? "Aprobado" : "Rechazado"} por el dueño: ${manual.reason}`; }
  else if (!hasIn) { status = "NO_VALIDADO"; reason = "No marcó entrada"; }
  else if (!hasOut) { status = "NO_VALIDADO"; reason = "Sin salida marcada"; }
  else if (found.total >= minEvidence) { status = "VALIDADO"; reason = "Entrada, salida y evidencia de trabajo"; }
  else { status = "PENDIENTE"; reason = "Marcó entrada y salida pero sin evidencia de trabajo"; }
  return { status, reason, hasIn, hasOut, evidence: found.total, evidenceKinds: found.kinds, manual };
}

function lateMinutes(shift, marks, tolerance) {
  const start = toMinutes(shift.start); if (start === null || !marks.length) return 0;
  return Math.max(0, marks[0].inMinutes - start - tolerance);
}

function coverage(shifts) {
  const byArea = new Map();
  for (const shift of shifts) {
    const start = toMinutes(shift.start); const end = shift.end ? toMinutes(shift.end) : HOTEL_CLOSE; if (start === null) continue;
    const list = byArea.get(shift.area) || []; list.push([start, end <= start ? HOTEL_CLOSE : end]); byArea.set(shift.area, list);
  }
  return [...byArea.entries()].map(([area, ranges]) => {
    ranges.sort((a, b) => a[0] - b[0]);
    const gaps = []; let cursor = HOTEL_OPEN;
    for (const [start, end] of ranges) { if (start > cursor) gaps.push([cursor, start]); cursor = Math.max(cursor, end); }
    if (cursor < HOTEL_CLOSE) gaps.push([cursor, HOTEL_CLOSE]);
    return { area, areaLabel: areaLabel(area), gaps: gaps.map(([a, b]) => `${hhmm(a)}–${b === HOTEL_CLOSE ? "24:00" : hhmm(b)}`) };
  }).filter((item) => item.gaps.length);
}

/** Tardanzas (más allá de la tolerancia) de los turnos programados entre dos fechas, con su justificación si el dueño la dio. */
export function lateEvents(state, from, to) {
  const { toleranceMinutes } = settingsOf(state); const events = [];
  for (const shift of state.shifts || []) {
    if (shift.date < from || shift.date > to || shift.source === "ASISTENCIA" || /CANCEL/i.test(shift.status || "")) continue;
    const marks = attendanceOf(state, shift.employeeId, shift.date); const late = lateMinutes(shift, marks, toleranceMinutes);
    if (late <= 0) continue;
    const justification = (state.lateJustifications || []).filter((item) => n(item.employeeId) === n(shift.employeeId) && item.date === shift.date).at(-1) || null;
    events.push({ employeeId: n(shift.employeeId), date: shift.date, lateMinutes: late, shiftStart: shift.start, checkIn: hhmm(marks[0].inMinutes), justified: Boolean(justification), justification });
  }
  return events;
}

/** Descuento semanal: cada bloque de `lateThreshold` tardanzas sin justificar descuenta `lateDiscountPercent` % del pago de la semana (máximo el 100 %). */
export function lateDiscount(state, employeeId, from, to, grossTotal) {
  const { lateThreshold, lateDiscountPercent } = settingsOf(state);
  const mine = lateEvents(state, from, to).filter((event) => event.employeeId === n(employeeId));
  const unjustified = mine.filter((event) => !event.justified).length;
  const blocks = lateThreshold > 0 ? Math.floor(unjustified / lateThreshold) : 0;
  const percent = Math.min(100, blocks * lateDiscountPercent);
  return { lateCount: mine.length, unjustifiedLates: unjustified, discountPercent: percent, discountAmount: Math.round(n(grossTotal) * percent) / 100 };
}

/** Alertas sin atender: pasado el SLA escalan a Recepción y, al doble del SLA, al Superadmin. */
function overdueAlerts(state, now, sla) {
  const rows = [];
  for (const request of state.requests || []) {
    if (ALERT_CLOSED.has(String(request.status || "").toUpperCase()) || !request.createdAt) continue;
    const waiting = Math.floor((now - new Date(request.createdAt).getTime()) / 60000);
    if (waiting < sla) continue;
    rows.push({ kind: "Alerta", code: request.code || `#${request.id}`, area: areaLabel(request.area), detail: String(request.description || request.type || "").slice(0, 90), assigned: Boolean(request.assignedMaintenanceEmployeeId || request.assignedEmployeeId), waitingMinutes: waiting, level: waiting >= sla * 2 ? "SUPERADMIN" : "RECEPCION" });
  }
  for (const task of state.tasks || []) {
    if (ALERT_CLOSED.has(String(task.status || "").toUpperCase()) || /DANOS/.test(task.status || "") || !task.createdAt || String(task.status).toUpperCase() !== "PENDIENTE") continue;
    const waiting = Math.floor((now - new Date(task.createdAt).getTime()) / 60000);
    if (waiting < sla) continue;
    rows.push({ kind: "Tarea de limpieza", code: task.code || `#${task.id}`, area: "Limpieza", detail: String(task.description || "").slice(0, 90), assigned: Boolean(task.assignedEmployeeId), waitingMinutes: waiting, level: waiting >= sla * 2 ? "SUPERADMIN" : "RECEPCION" });
  }
  return rows.sort((a, b) => b.waitingMinutes - a.waitingMinutes);
}

/** Relevo de turno por área: quién entregó, quién recibió y la diferencia de inventario que dejó el cierre de quien entregó. */
async function handovers(board, day) {
  const variance = new Map((await db.query(`SELECT s.submitted_by_legacy_user_id id,COALESCE(SUM(c.variance_cost),0) cost FROM inventory_shift_sessions s
    JOIN LATERAL (SELECT variance_cost FROM inventory_closings WHERE session_id=s.id ORDER BY revision DESC LIMIT 1) c ON TRUE
    WHERE s.submitted_by_legacy_user_id IS NOT NULL AND (s.submitted_at AT TIME ZONE 'America/Lima')::date=$1::date GROUP BY 1`, [day])).rows.map((row) => [n(row.id), Math.round(n(row.cost) * 100) / 100]));
  const byArea = new Map();
  for (const row of board.filter((item) => item.checkIn)) { const list = byArea.get(row.areaLabel) || []; list.push(row); byArea.set(row.areaLabel, list); }
  const result = [];
  for (const [area, rows] of byArea) {
    rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const out = rows[i]; const next = rows[i + 1]; if (!out.checkOut) continue;
      const gap = toMinutes(next.checkIn) - toMinutes(out.checkOut);
      result.push({ area, outgoing: out.name, outAt: out.checkOut, incoming: next.name, inAt: next.checkIn, gapMinutes: gap, inventoryVarianceCost: variance.has(out.employeeId) ? variance.get(out.employeeId) : null });
    }
  }
  return result;
}

export async function controlTower(state, { date, days = 14 } = {}) {
  const tz = tzOf(state); const now = new Date(); const today = parts(now, tz).date; const nowMinutes = parts(now, tz).minutes;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : today;
  const span = Math.min(Math.max(Math.trunc(n(days)) || 14, 1), 60);
  const { toleranceMinutes, minEvidence, alertSlaMinutes, lateThreshold, lateDiscountPercent } = settingsOf(state);
  const from = addDays(day, -(span - 1));
  const evidence = await collectEvidence(state, from, day);
  const employees = new Map((state.employees || []).map((employee) => [n(employee.id), employee]));

  const scheduled = (state.shifts || []).filter((shift) => shift.date === day && shift.source !== "ASISTENCIA" && !/CANCEL/i.test(shift.status || ""));
  const board = scheduled.map((shift) => {
    const marks = attendanceOf(state, shift.employeeId, day); const start = toMinutes(shift.start); const end = shift.end ? toMinutes(shift.end) : null;
    const late = lateMinutes(shift, marks, toleranceMinutes);
    let status;
    if (marks.some((mark) => mark.outAt)) status = "CERRO";
    else if (marks.length) status = late > 0 ? "TARDO" : "EN_TURNO";
    else if (day < today || (day === today && end !== null && nowMinutes >= end)) status = "FALTO";
    else if (day === today && start !== null && nowMinutes > start + toleranceMinutes) status = "SIN_MARCAR";
    else status = "ESPERADO";
    const validation = dayStatus(state, shift.employeeId, day, evidence, minEvidence);
    return { shiftId: shift.id, employeeId: n(shift.employeeId), name: employeeName(employees.get(n(shift.employeeId))), area: shift.area, areaLabel: areaLabel(shift.area), start: shift.start, end: shift.end || null,
      status, lateMinutes: late, checkIn: marks[0] ? hhmm(marks[0].inMinutes) : null, checkOut: marks.find((mark) => mark.outMinutes !== null) ? hhmm(marks.find((mark) => mark.outMinutes !== null).outMinutes) : null, day: validation };
  }).sort((a, b) => a.areaLabel.localeCompare(b.areaLabel) || String(a.start).localeCompare(String(b.start)));

  // Quien marcó entrada sin tener turno programado ese día también se ve en el tablero.
  const scheduledIds = new Set(scheduled.map((shift) => n(shift.employeeId)));
  for (const employee of state.employees || []) {
    if (scheduledIds.has(n(employee.id))) continue;
    const marks = attendanceOf(state, employee.id, day); if (!marks.length) continue;
    const out = marks.find((mark) => mark.outMinutes !== null);
    board.push({ shiftId: null, employeeId: n(employee.id), name: employeeName(employee), area: employee.baseRole || employee.role, areaLabel: areaLabel(employee.baseRole || employee.role), start: null, end: null, status: out ? "CERRO" : "EN_TURNO", unscheduled: true, lateMinutes: 0, checkIn: hhmm(marks[0].inMinutes), checkOut: out ? hhmm(out.outMinutes) : null, day: dayStatus(state, employee.id, day, evidence, minEvidence) });
  }

  // Ranking de puntualidad y cumplimiento de la ventana.
  const ranking = new Map();
  for (let offset = 0; offset < span; offset += 1) {
    const current = addDays(day, -offset);
    for (const shift of (state.shifts || []).filter((item) => item.date === current && item.source !== "ASISTENCIA" && !/CANCEL/i.test(item.status || ""))) {
      const marks = attendanceOf(state, shift.employeeId, current);
      const entry = ranking.get(n(shift.employeeId)) || { employeeId: n(shift.employeeId), name: employeeName(employees.get(n(shift.employeeId))), area: areaLabel(employees.get(n(shift.employeeId))?.baseRole || shift.area), scheduled: 0, attended: 0, lateCount: 0, lateMinutes: 0, absences: 0, validated: 0 };
      const finished = current < today || (current === today && shift.end && nowMinutes >= toMinutes(shift.end));
      entry.scheduled += 1;
      if (marks.length) { entry.attended += 1; const late = lateMinutes(shift, marks, toleranceMinutes); if (late > 0) { entry.lateCount += 1; entry.lateMinutes += late; } }
      else if (finished) entry.absences += 1;
      if (dayStatus(state, shift.employeeId, current, evidence, minEvidence).status === "VALIDADO") entry.validated += 1;
      ranking.set(n(shift.employeeId), entry);
    }
  }

  // Días con entrada y salida pero sin evidencia, esperando la decisión del dueño.
  const pending = [];
  for (let offset = 0; offset < span; offset += 1) {
    const current = addDays(day, -offset);
    for (const employee of state.employees || []) {
      const status = dayStatus(state, employee.id, current, evidence, minEvidence);
      if (status.status === "PENDIENTE") pending.push({ employeeId: n(employee.id), name: employeeName(employee), area: areaLabel(employee.baseRole || employee.role), date: current, reason: status.reason });
    }
  }

  const weekStart = addDays(day, -6);
  const lates = lateEvents(state, weekStart, day).map((event) => ({ ...event, name: employeeName(employees.get(event.employeeId)) })).sort((a, b) => b.date.localeCompare(a.date));
  const alerts = overdueAlerts(state, now.getTime(), alertSlaMinutes);
  const relevos = await handovers(board, day);
  const closings = await Promise.all(CLOSING_AREAS.map(async ([area, name]) => ({ area, name, ...(await areaClosingStatus(state, area)) })));
  const summary = { scheduled: board.filter((row) => !row.unscheduled).length, inShift: board.filter((row) => ["EN_TURNO", "TARDO"].includes(row.status)).length, late: board.filter((row) => row.lateMinutes > 0).length, missing: board.filter((row) => ["FALTO", "SIN_MARCAR"].includes(row.status)).length, closed: board.filter((row) => row.status === "CERRO").length, pendingValidation: pending.length, overdueAlerts: alerts.length };
  return { date: day, today, days: span, settings: { toleranceMinutes, minEvidence, alertSlaMinutes, lateThreshold, lateDiscountPercent }, lates, overdueAlerts: alerts, handovers: relevos, summary, board, coverageGaps: coverage(scheduled), closings, pendingValidation: pending,
    ranking: [...ranking.values()].sort((a, b) => b.lateMinutes - a.lateMinutes || b.absences - a.absences || a.name.localeCompare(b.name)) };
}

/** Días validados por empleado en un rango: alimenta la planilla semanal (solo los validados se pagan). */
export async function validatedDays(state, from, to) {
  const { minEvidence } = settingsOf(state);
  const evidence = await collectEvidence(state, from, to);
  const result = new Map();
  for (const employee of state.employees || []) {
    const entry = { validated: 0, pending: 0, notValidated: 0 };
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const status = dayStatus(state, employee.id, date, evidence, minEvidence).status;
      if (status === "VALIDADO") entry.validated += 1; else if (status === "PENDIENTE") entry.pending += 1;
      else if (attendanceOf(state, employee.id, date).length) entry.notValidated += 1;
    }
    result.set(n(employee.id), entry);
  }
  return result;
}

// Servicio al que se imputa la planilla según el área donde trabaja cada persona.
const PAYROLL_SERVICE = { RECEPCION: "HOSPEDAJE", ADMINISTRADOR: "HOSPEDAJE", LIMPIEZA: "HOSPEDAJE", MANTENIMIENTO: "HOSPEDAJE", PISCINA: "PISCINA", RESTAURANTE: "GENERAL", BARTENDER: "GENERAL" };

/** Filas de gasto de planilla (un día validado = una tarifa diaria) para la rentabilidad por servicio. */
export async function payrollExpenseRows(state, from, to) {
  const { minEvidence } = settingsOf(state); const evidence = await collectEvidence(state, from, to); const rows = [];
  for (const employee of state.employees || []) {
    const rate = n(employee.dailyRate); if (rate <= 0) continue;
    const area = String(employee.baseRole || employee.role || "").toUpperCase();
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (dayStatus(state, employee.id, date, evidence, minEvidence).status === "VALIDADO") rows.push({ date, amount: rate, service: PAYROLL_SERVICE[area] || "GENERAL", area });
    }
  }
  return rows;
}

export { addDays as addDaysToDate };
