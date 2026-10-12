// Superadmin › Reservas > Terraza: resumen propio del servicio (KPIs, ocupación por franja
// horaria, aforo en vivo, reservas por zona real y pedidos anticipados), construido sobre las
// mismas filas normalizadas de reservations-overview.js. Las acciones de confirmar, reprogramar y
// cancelar reutilizan /api/superadmin/reservations/TERRAZA/:id/... ya implementadas allí.
// A diferencia de Piscina y Mirador, la reserva de Terraza es gratuita (el consumo de
// Restaurante/Bar se cobra aparte, ver TerraceExperience.jsx): no hay estado de pago que mostrar.
// Las franjas (12:00/13:30/15:00/18:00/20:00/21:30) y la capacidad en personas son las mismas que
// ya usa GET /api/public/availability/TERRAZA — antes el panel del Superadmin no las usaba y en su
// lugar comparaba 3 zonas y cupos inventados contra las 4 zonas reales que el cliente elige
// (ver SUPERADMIN_CHANGELOG.md, 2026-09-22).
import { makeClock } from "./owner-home.js";
import { buildRows } from "./reservations-overview.js";

const SERVICE_CODE = "TERRAZA";
// Sin registro de salida: se estima que cada ingreso validado por QR dura 3h, igual que el
// cálculo de "personas dentro" del Inicio (owner-home.js, INSIDE_MINUTES.TERRAZA).
const INSIDE_MINUTES = 180;
// Franjas reales que ya ofrece la reserva pública (server/src/index.js, GET /public/availability/TERRAZA).
const SLOT_WINDOWS = [
  { slot: "12:00", from: 12 * 60, to: 13 * 60 + 30 },
  { slot: "13:30", from: 13 * 60 + 30, to: 15 * 60 },
  { slot: "15:00", from: 15 * 60, to: 18 * 60 },
  { slot: "18:00", from: 18 * 60, to: 20 * 60 },
  { slot: "20:00", from: 20 * 60, to: 21 * 60 + 30 },
  { slot: "21:30", from: 21 * 60 + 30, to: 23 * 60 }
];
// Zonas reales que el cliente elige (customer/src/TerraceExperience.jsx); cualquier otro valor
// (reservas antiguas, datos sueltos) cae en "Otra" en vez de perderse en silencio.
const ZONES = ["Zona fresca", "Cerca al jardín", "Cerca al bar", "Mesa tranquila"];

const n = (value) => Number(value) || 0;
const upper = (value) => String(value || "").toUpperCase();

function minutesOfDay(timezone, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}
function currentSlot(minutes) {
  if (minutes < SLOT_WINDOWS[0].from) return SLOT_WINDOWS[0];
  return SLOT_WINDOWS.find((window) => minutes >= window.from && minutes < window.to) || SLOT_WINDOWS[SLOT_WINDOWS.length - 1];
}

export function buildTerrazaOverview(state, query = {}, at = new Date()) {
  const timezone = state?.settings?.timezone || "America/Lima";
  const clock = makeClock(timezone);
  const today = clock.date(at);
  const capacity = n((state.services || []).find((item) => upper(item.code) === SERVICE_CODE)?.capacity);

  // Las filas normalizadas no traen los pedidos anticipados: se agregan aquí a partir de la
  // reserva cruda, sin tocar reservations-overview.js (lo comparte "Reservas generales").
  const rawById = new Map((state.bookings || []).filter((item) => upper(item.serviceCode) === SERVICE_CODE).map((item) => [Number(item.id), item]));
  const rows = buildRows(state, today).filter((row) => row.type === SERVICE_CODE).map((row) => {
    const raw = rawById.get(Number(row.id));
    const zone = row.place || "";
    return { ...row, zone: ZONES.includes(zone) ? zone : zone ? "Otra" : "", preorderCount: Array.isArray(raw?.preorderItems) ? raw.preorderItems.length : 0 };
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

  // --- ocupación por franja horaria: personas de las reservas de hoy (no ingresos validados) ---
  const now = currentSlot(minutesOfDay(timezone, at));
  const slots = SLOT_WINDOWS.map((window) => ({
    slot: window.slot, capacity,
    used: todayRows.filter((row) => row.slot === window.slot).reduce((sum, row) => sum + row.people, 0),
    isNow: window.slot === now.slot
  }));

  const zonas = [...ZONES, "Otra"].map((zone) => ({ zone, count: active.filter((row) => row.zone === zone).length })).filter((row) => row.count > 0);

  const proximos7Dias = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
    return { date: key, label, count: active.filter((row) => row.date === key).length };
  });

  const porConfirmarRows = active.filter((row) => row.status === "POR_CONFIRMAR" || row.balance > 0);
  const confirmedRows = active.filter((row) => ["CONFIRMADA", "EN_CURSO", "COMPLETADA"].includes(row.status));
  const cancelledRows = rows.filter((row) => row.status === "CANCELADA");

  // --- tabla: filtro rápido (todas/por confirmar/confirmadas/canceladas) + búsqueda + paginación ---
  const filter = upper(query.filter || "");
  const needle = String(query.q || "").trim().toLowerCase();
  let filtered = filter === "POR_CONFIRMAR" ? porConfirmarRows : filter === "CONFIRMADAS" ? confirmedRows : filter === "CANCELADAS" ? cancelledRows : rows;
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
      comensalesEsperadosHoy: todayRows.reduce((sum, row) => sum + row.people, 0),
      pedidosAnticipados: todayRows.filter((row) => row.preorderCount > 0).length,
      porConfirmar: porConfirmarRows.length
    },
    aforo: { inside, capacity, percent: capacity ? Math.min(100, Math.round((inside / capacity) * 100)) : 0, slot: now.slot },
    slots, zonas, proximos7Dias,
    counts: { total: rows.length, porConfirmar: porConfirmarRows.length, confirmadas: confirmedRows.length, canceladas: cancelledRows.length },
    list: { total, page, pageSize, rows: pageRows }
  };
}
