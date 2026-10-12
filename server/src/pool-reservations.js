// Superadmin › Reservas > Piscina: resumen propio del servicio (KPIs, ocupación por franja
// horaria, aforo en vivo y estado de pago), construido sobre las mismas filas normalizadas de
// reservations-overview.js (mismo estado/pago que ya usa "Reservas generales"). Las acciones
// (confirmar, cobrar saldo, reprogramar, cancelar) reutilizan las rutas
// /api/superadmin/reservations/PISCINA/:id/... ya implementadas allí — no se duplican aquí.
// Solo Piscina por ahora; Mirador y Terraza se harán aparte (ver SUPERADMIN_CHANGELOG.md).
import { makeClock } from "./owner-home.js";
import { buildRows } from "./reservations-overview.js";

const SERVICE_CODE = "PISCINA";
// Sin registro de salida: se estima que cada ingreso validado por QR dura 3h, igual que el
// cálculo de "personas dentro" del Inicio (owner-home.js, INSIDE_MINUTES.PISCINA).
const INSIDE_MINUTES = 180;
// Franjas reales que ya ofrece el formulario de reserva de piscina (no son configurables hoy).
const SLOT_WINDOWS = [
  { slot: "09:00", fromHour: 9, toHour: 11 },
  { slot: "11:00", fromHour: 11, toHour: 14 },
  { slot: "14:00", fromHour: 14, toHour: 16 },
  { slot: "16:00", fromHour: 16, toHour: 18 }
];

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();

function currentSlot(hour) {
  if (hour == null || hour < SLOT_WINDOWS[0].fromHour) return SLOT_WINDOWS[0];
  return SLOT_WINDOWS.find((window) => hour >= window.fromHour && hour < window.toHour) || SLOT_WINDOWS[SLOT_WINDOWS.length - 1];
}

export function buildPoolOverview(state, query = {}, at = new Date()) {
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);
  const capacity = n((state.services || []).find((item) => upper(item.code) === SERVICE_CODE)?.capacity);

  const rows = buildRows(state, today).filter((row) => row.type === SERVICE_CODE);
  const active = rows.filter((row) => row.status !== "CANCELADA");
  const todayRows = active.filter((row) => row.date === today);

  // --- personas dentro ahora: mismo criterio que el Inicio (entitlements validados + ingresos manuales) ---
  const nowMs = at.getTime();
  let inside = 0;
  for (const pass of state.entitlements || []) {
    if (upper(pass.serviceCode) !== SERVICE_CODE || !pass.usedAt || pass.eventId) continue;
    if (clock.date(pass.usedAt) !== today) continue;
    if (nowMs - new Date(pass.usedAt).getTime() <= INSIDE_MINUTES * 60000) inside += Math.max(1, n(pass.people));
  }
  for (const entry of state.poolEntries || []) if (upper(entry.status) === "ACTIVO") inside += Math.max(1, n(entry.people));

  const porValidar = (state.entitlements || []).filter((item) => upper(item.serviceCode) === SERVICE_CODE && item.status === "LISTO_INGRESO" && item.date === today).length;

  // --- ocupación por franja horaria: personas de las reservas de hoy (no ingresos validados) ---
  const now = currentSlot(clock.hour(at));
  const slots = SLOT_WINDOWS.map((window) => ({
    slot: window.slot, capacity,
    used: todayRows.filter((row) => String(row.slot || "").startsWith(window.slot)).reduce((sum, row) => sum + row.people, 0),
    isNow: window.slot === now.slot
  }));

  const estadoPago = ["PAGADO", "PARCIAL", "PENDIENTE"].map((key) => ({ key, count: active.filter((row) => row.paymentState === key).length }));

  const proximos7Dias = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
    return { date: key, label, count: active.filter((row) => row.date === key).length };
  });

  const attentionRows = active.filter((row) => row.status === "POR_CONFIRMAR" || row.balance > 0);
  const confirmedRows = active.filter((row) => ["CONFIRMADA", "EN_CURSO", "COMPLETADA"].includes(row.status));
  const cancelledRows = rows.filter((row) => row.status === "CANCELADA");

  // --- tabla: filtro rápido (todas/atención/confirmadas/canceladas) + búsqueda + paginación ---
  const filter = upper(query.filter || "");
  const needle = String(query.q || "").trim().toLowerCase();
  let filtered = filter === "ATENCION" ? attentionRows : filter === "CONFIRMADAS" ? confirmedRows : filter === "CANCELADAS" ? cancelledRows : rows;
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
      porValidar,
      saldoPendiente: { amount: round(active.reduce((sum, row) => sum + row.balance, 0)), count: active.filter((row) => row.balance > 0).length }
    },
    aforo: { inside, capacity, percent: capacity ? Math.min(100, Math.round((inside / capacity) * 100)) : 0, slot: now.slot },
    slots, estadoPago, proximos7Dias,
    counts: { total: rows.length, atencion: attentionRows.length, confirmadas: confirmedRows.length, canceladas: cancelledRows.length },
    list: { total, page, pageSize, rows: pageRows }
  };
}
