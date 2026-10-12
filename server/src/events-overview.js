// Superadmin › Reservas > Eventos: resumen propio del servicio (KPIs, ciclo del evento, eventos
// por espacio, estado de pago y próximos 7 días), construido sobre las mismas filas normalizadas
// de reservations-overview.js. Las acciones de su detalle (confirmar, cobrar saldo, reprogramar,
// cancelar) reutilizan /api/superadmin/reservations/EVENTOS/:id/... ya implementadas allí.
// A diferencia de Piscina/Mirador/Terraza, esta pantalla NO reemplaza ningún componente existente:
// EventsPage.jsx sigue sirviendo el calendario y las rutas de Recepción (/eventos/*); esta es una
// pantalla nueva, exclusiva de "Reservas > Eventos" del Superadmin.
import { makeClock } from "./owner-home.js";
import { buildRows } from "./reservations-overview.js";

const SERVICE_CODE = "EVENTOS";
const RAW_STATUSES = ["COTIZACION", "RESERVADO", "CONFIRMADO", "FINALIZADO", "CANCELADO"];

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();

export function buildEventsOverview(state, query = {}, at = new Date()) {
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);

  // Las filas normalizadas colapsan COTIZACION/RESERVADO/FINALIZADO en un solo estado
  // (reservations-overview.js normaliza para los 5 servicios a la vez); el ciclo del evento y los
  // filtros de esta pantalla necesitan el estado real, así que se agrega desde la reserva cruda.
  const rawById = new Map((state.events || []).map((item) => [Number(item.id), item]));
  const rows = buildRows(state, today).filter((row) => row.type === SERVICE_CODE).map((row) => {
    const raw = rawById.get(Number(row.id));
    return { ...row, rawStatus: upper(raw?.status) || "COTIZACION" };
  });
  const active = rows.filter((row) => row.rawStatus !== "CANCELADO");

  const eventosHoy = rows.filter((row) => row.date === today && row.rawStatus !== "CANCELADO").length;
  const proximos = rows.filter((row) => row.date >= today && !["CANCELADO", "FINALIZADO"].includes(row.rawStatus)).length;
  const cotizaciones = rows.filter((row) => row.rawStatus === "COTIZACION").length;

  const upcomingDates = new Set(Array.from({ length: 7 }, (_, i) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i); return date.toISOString().slice(0, 10); }));
  const invitadosProximos7Dias = active.filter((row) => upcomingDates.has(row.date)).reduce((sum, row) => sum + row.people, 0);

  const saldoPendiente = { amount: round(active.reduce((sum, row) => sum + row.balance, 0)), count: active.filter((row) => row.balance > 0).length };
  const attentionRows = active.filter((row) => ["COTIZACION", "RESERVADO"].includes(row.rawStatus) || row.balance > 0);

  // Ciclo del evento: mismo criterio que ya usaba EventsPage.jsx (Reserva/Anticipo comparten
  // RESERVADO y Producción/Evento comparten CONFIRMADO — no hay una subetapa separada todavía).
  const ciclo = {
    cotizacion: rows.filter((row) => row.rawStatus === "COTIZACION").length,
    reserva: rows.filter((row) => row.rawStatus === "RESERVADO").length,
    anticipo: rows.filter((row) => row.rawStatus === "RESERVADO").length,
    produccion: rows.filter((row) => row.rawStatus === "CONFIRMADO").length,
    evento: rows.filter((row) => row.rawStatus === "CONFIRMADO").length,
    cierre: rows.filter((row) => row.rawStatus === "FINALIZADO").length
  };

  const espacios = [...new Set(active.map((row) => row.place).filter(Boolean))]
    .map((place) => ({ space: place, count: active.filter((row) => row.place === place).length }))
    .sort((a, b) => b.count - a.count);

  const estadoPago = ["PAGADO", "PARCIAL", "PENDIENTE"].map((key) => ({ key, count: active.filter((row) => row.paymentState === key).length }));

  const proximos7Dias = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
    return { date: key, label, count: active.filter((row) => row.date === key).length };
  });

  // --- tabla: filtro por estado real / espacio + búsqueda + paginación ---
  const status = upper(query.status || "");
  const space = String(query.space || "").trim();
  const needle = String(query.q || "").trim().toLowerCase();
  let filtered = rows;
  if (status && RAW_STATUSES.includes(status)) filtered = filtered.filter((row) => row.rawStatus === status);
  if (space) filtered = filtered.filter((row) => row.place === space);
  if (needle) filtered = filtered.filter((row) => `${row.code} ${row.clientName} ${row.clientDocument} ${row.planName || ""}`.toLowerCase().includes(needle));
  filtered = [...filtered].sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  const pageSize = Math.min(Math.max(Math.trunc(n(query.pageSize)) || 10, 1), 100);
  const page = Math.max(Math.trunc(n(query.page)) || 1, 1);
  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    today,
    kpis: { eventosHoy, proximos, cotizaciones, invitadosProximos7Dias, saldoPendiente },
    ciclo, espacios, estadoPago, proximos7Dias,
    counts: { total: rows.length, atencion: attentionRows.length, ...Object.fromEntries(RAW_STATUSES.map((key) => [key, rows.filter((row) => row.rawStatus === key).length])) },
    list: { total, page, pageSize, rows: pageRows }
  };
}
