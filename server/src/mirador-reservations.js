// Superadmin › Reservas > Mirador: resumen propio del servicio (KPIs, ocupación por franja
// horaria, aforo en vivo, estado de pago y pagos Yape/Plin pendientes de verificar), construido
// sobre las mismas filas normalizadas de reservations-overview.js. Las acciones de confirmar,
// cobrar saldo, reprogramar y cancelar reutilizan /api/superadmin/reservations/MIRADOR/:id/... ya
// implementadas allí; la verificación de pago usa /api/service-bookings/:id/pay (ya exige que el
// método, la operación y el monto coincidan con lo que el cliente envió — ver index.js).
// Solo Mirador por ahora; Terraza se hace aparte (ver SUPERADMIN_CHANGELOG.md).
import { makeClock } from "./owner-home.js";
import { buildRows } from "./reservations-overview.js";

const SERVICE_CODE = "MIRADOR";
// Sin registro de salida: se estima que cada ingreso validado por QR dura 2h, igual que el
// cálculo de "personas dentro" del Inicio (owner-home.js, INSIDE_MINUTES.MIRADOR).
const INSIDE_MINUTES = 120;
// Franjas reales que ya ofrece el formulario de reserva del mirador (no son configurables hoy).
const SLOT_WINDOWS = [
  { slot: "16:30", from: 16 * 60 + 30, to: 17 * 60 + 30 },
  { slot: "17:30", from: 17 * 60 + 30, to: 18 * 60 + 30 },
  { slot: "18:30", from: 18 * 60 + 30, to: 20 * 60 },
  { slot: "20:00", from: 20 * 60, to: 22 * 60 }
];

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();

function minutesOfDay(timezone, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}
function currentSlot(minutes) {
  if (minutes < SLOT_WINDOWS[0].from) return SLOT_WINDOWS[0];
  return SLOT_WINDOWS.find((window) => minutes >= window.from && minutes < window.to) || SLOT_WINDOWS[SLOT_WINDOWS.length - 1];
}

export function buildMiradorOverview(state, query = {}, at = new Date()) {
  const timezone = state?.settings?.timezone || "America/Lima";
  const clock = makeClock(timezone);
  const today = clock.date(at);
  const capacity = n((state.services || []).find((item) => upper(item.code) === SERVICE_CODE)?.capacity);

  // Las filas normalizadas no traen los campos propios de la verificación Yape/Plin
  // (paymentMethod/paymentReference/paymentRequested): se agregan aquí a partir de la reserva
  // cruda, sin tocar reservations-overview.js (lo comparte "Reservas generales").
  const rawById = new Map((state.bookings || []).filter((item) => upper(item.serviceCode) === SERVICE_CODE).map((item) => [Number(item.id), item]));
  const rows = buildRows(state, today).filter((row) => row.type === SERVICE_CODE).map((row) => {
    const raw = rawById.get(Number(row.id));
    const verifying = raw?.paymentStatus === "PENDIENTE_VERIFICACION";
    return verifying
      ? { ...row, paymentState: "POR_VERIFICAR", nextAction: { action: "VERIFICAR_PAGO", label: "Verificar operación" }, verify: { method: raw.paymentMethod, reference: raw.paymentReference, amount: n(raw.paymentRequested) } }
      : { ...row, verify: null };
  });
  const active = rows.filter((row) => row.status !== "CANCELADA");
  const todayRows = active.filter((row) => row.date === today);

  // --- personas dentro ahora: mismo criterio que el Inicio (entitlements validados por QR) ---
  const nowMs = at.getTime();
  let inside = 0;
  for (const pass of state.entitlements || []) {
    if (upper(pass.serviceCode) !== SERVICE_CODE || !pass.usedAt || pass.eventId) continue;
    if (clock.date(pass.usedAt) !== today) continue;
    if (nowMs - new Date(pass.usedAt).getTime() <= INSIDE_MINUTES * 60000) inside += Math.max(1, n(pass.people));
  }

  const porVerificar = rows.filter((row) => row.verify && row.status !== "CANCELADA").length;

  // --- ocupación por franja horaria: personas de las reservas de hoy (no ingresos validados) ---
  const now = currentSlot(minutesOfDay(timezone, at));
  const slots = SLOT_WINDOWS.map((window) => ({
    slot: window.slot, capacity,
    used: todayRows.filter((row) => row.slot === window.slot).reduce((sum, row) => sum + row.people, 0),
    isNow: window.slot === now.slot
  }));

  const estadoPago = ["PAGADO", "PARCIAL", "POR_VERIFICAR", "PENDIENTE"].map((key) => ({ key, count: active.filter((row) => row.paymentState === key).length }));

  const proximos7Dias = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
    return { date: key, label, count: active.filter((row) => row.date === key).length };
  });

  const attentionRows = active.filter((row) => row.status === "POR_CONFIRMAR" || row.balance > 0);
  const verifyRows = active.filter((row) => row.verify);
  const confirmedRows = active.filter((row) => ["CONFIRMADA", "EN_CURSO", "COMPLETADA"].includes(row.status));
  const cancelledRows = rows.filter((row) => row.status === "CANCELADA");

  // --- tabla: filtro rápido (todas/atención/por verificar/confirmadas/canceladas) + búsqueda + paginación ---
  const filter = upper(query.filter || "");
  const needle = String(query.q || "").trim().toLowerCase();
  let filtered = filter === "ATENCION" ? attentionRows : filter === "VERIFICAR" ? verifyRows : filter === "CONFIRMADAS" ? confirmedRows : filter === "CANCELADAS" ? cancelledRows : rows;
  if (needle) filtered = filtered.filter((row) => `${row.code} ${row.clientName} ${row.clientDocument}`.toLowerCase().includes(needle));
  filtered = [...filtered].sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  const pageSize = Math.min(Math.max(Math.trunc(n(query.pageSize)) || 10, 1), 100);
  const page = Math.max(Math.trunc(n(query.page)) || 1, 1);
  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    today,
    kpis: {
      reservasHoy: todayRows.length,
      personasEsperadasHoy: todayRows.reduce((sum, row) => sum + row.people, 0),
      porVerificar,
      saldoPendiente: { amount: round(active.reduce((sum, row) => sum + row.balance, 0)), count: active.filter((row) => row.balance > 0).length }
    },
    aforo: { inside, capacity, percent: capacity ? Math.min(100, Math.round((inside / capacity) * 100)) : 0, slot: now.slot },
    slots, estadoPago, proximos7Dias,
    counts: { total: rows.length, atencion: attentionRows.length, verificar: verifyRows.length, confirmadas: confirmedRows.length, canceladas: cancelledRows.length },
    list: { total, page, pageSize, rows: pageRows }
  };
}
