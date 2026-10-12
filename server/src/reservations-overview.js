// Superadmin › Reservas generales: junta Hospedaje (reservations), Piscina/Mirador/Terraza
// (bookings) y Eventos en una sola agenda, con un estado y una "siguiente acción" normalizados
// entre los tres modelos (cada uno traía su propio vocabulario de status). Función pura: recibe
// el estado y devuelve todo ya calculado. Fechas en la zona horaria del hotel (America/Lima).
// Ver SUPERADMIN_RESERVAS.md.
import { HOME_SERVICES, addDays, makeClock } from "./owner-home.js";

const SERVICE_NAME = Object.fromEntries(HOME_SERVICES.map((item) => [item.code, item.name]));
const STATUS_LABEL = { POR_CONFIRMAR: "Por confirmar", CONFIRMADA: "Confirmada", EN_CURSO: "En curso", COMPLETADA: "Completada", CANCELADA: "Cancelada" };

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();
const fullName = (client) => [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || "Cliente sin nombre";

/** Una reserva de Hospedaje puede venir del panel (checkInDate/checkOutDate/totalPrice/advance) o de la
 * reserva pública del cliente, que solo copia los campos del booking (checkIn/checkOut/total/paid) — ver
 * `hydrateReservation` en index.js, que usa el mismo respaldo. Sin esto, media base de reservas del
 * cliente queda sin fecha ni monto. */
export function reservationDates(item) {
  const checkInDate = item.checkInDate || item.checkIn || item.date || null;
  const checkOutDate = item.checkOutDate || item.checkOut || checkInDate;
  return { checkInDate, checkOutDate };
}
const reservationTotal = (item) => n(item.totalPrice ?? item.total ?? 0);
const reservationPaid = (item) => n(item.advance ?? item.paid ?? 0);

function normalizeStatus(type, rawStatus) {
  const status = upper(rawStatus);
  if (type === "HOSPEDAJE") {
    if (["CANCELADA", "NO_SHOW"].includes(status)) return "CANCELADA";
    if (status === "COMPLETADA") return "COMPLETADA";
    if (status === "CHECKED_IN") return "EN_CURSO";
    if (status === "CONFIRMADA") return "CONFIRMADA";
    return "POR_CONFIRMAR";
  }
  if (type === "EVENTOS") {
    if (status === "CANCELADO") return "CANCELADA";
    if (status === "CONFIRMADO") return "CONFIRMADA";
    return "POR_CONFIRMAR";
  }
  // PISCINA / MIRADOR / TERRAZA
  if (["CANCELADA", "CANCELADO", "NO_SHOW"].includes(status)) return "CANCELADA";
  if (status === "FINALIZADA") return "COMPLETADA";
  if (status === "CONFIRMADA") return "CONFIRMADA";
  return "POR_CONFIRMAR";
}

function paymentStateOf(balance, paid) {
  if (n(balance) <= 0) return "PAGADO";
  if (n(paid) > 0) return "PARCIAL";
  return "PENDIENTE";
}

function nextActionOf({ status, balance, today, date }) {
  if (status === "CANCELADA" || status === "COMPLETADA") return { action: "VER_DETALLE", label: "Ver detalle" };
  if (n(balance) > 0) return { action: "COBRAR_SALDO", label: "Cobrar saldo" };
  if (status === "POR_CONFIRMAR") return { action: "CONFIRMAR", label: "Confirmar" };
  if (status === "CONFIRMADA" && date === today) return { action: "VALIDAR_INGRESO", label: "Validar ingreso" };
  return { action: "VER_DETALLE", label: "Ver detalle" };
}

/** Cada reserva (de cualquiera de los tres modelos) en su forma normalizada, lista para la agenda. */
function buildRows(state, today) {
  const rows = [];
  const clientOf = (id) => state.clients.find((item) => Number(item.id) === Number(id));

  for (const item of state.reservations || []) {
    const client = clientOf(item.clientId);
    const room = (state.rooms || []).find((row) => Number(row.id) === Number(item.roomId));
    const status = normalizeStatus("HOSPEDAJE", item.status);
    const { checkInDate } = reservationDates(item);
    const date = String(checkInDate || "").slice(0, 10);
    const paid = reservationPaid(item);
    rows.push({
      type: "HOSPEDAJE", id: item.id, code: item.code,
      clientId: item.clientId, clientName: fullName(client), clientDocument: client?.documentNumber || "",
      date, slot: null, place: room ? `Habitación ${room.number}` : "", planName: null,
      people: n(item.adults || item.people || 1) + n(item.children || 0),
      total: reservationTotal(item), paid, balance: n(item.balance),
      status, statusLabel: STATUS_LABEL[status], paymentState: paymentStateOf(item.balance, paid),
      nextAction: nextActionOf({ status, balance: item.balance, today, date }),
      createdAt: item.createdAt
    });
  }

  for (const item of (state.bookings || []).filter((row) => upper(row.serviceCode) !== "HOSPEDAJE")) {
    const client = clientOf(item.clientId);
    const serviceCode = upper(item.serviceCode);
    const status = normalizeStatus(serviceCode, item.status);
    const date = String(item.date || "").slice(0, 10);
    rows.push({
      type: serviceCode, id: item.id, code: item.code,
      clientId: item.clientId, clientName: fullName(client), clientDocument: client?.documentNumber || "",
      date, slot: item.slot || null, place: item.preferences?.tableZone || item.preferences?.zone || "", planName: item.planName || null,
      people: n(item.people || item.adults || 1),
      total: n(item.total), paid: n(item.paid), balance: n(item.balance),
      status, statusLabel: STATUS_LABEL[status], paymentState: paymentStateOf(item.balance, item.paid),
      nextAction: nextActionOf({ status, balance: item.balance, today, date }),
      createdAt: item.createdAt
    });
  }

  for (const item of state.events || []) {
    const client = clientOf(item.clientId);
    const status = normalizeStatus("EVENTOS", item.status);
    const date = String(item.startsAt || "").slice(0, 10);
    rows.push({
      type: "EVENTOS", id: item.id, code: item.code,
      clientId: item.clientId, clientName: fullName(client), clientDocument: client?.documentNumber || "",
      date, slot: item.startsAt ? new Date(item.startsAt).toISOString().slice(11, 16) : null, place: item.space?.name || "", planName: item.name || null,
      people: n(item.guests),
      total: n(item.price), paid: n(item.advance), balance: n(item.balance),
      status, statusLabel: STATUS_LABEL[status], paymentState: paymentStateOf(item.balance, item.advance),
      nextAction: nextActionOf({ status, balance: item.balance, today, date }),
      createdAt: item.createdAt
    });
  }

  return rows;
}

export function buildReservationsOverview(state, query = {}, at = new Date()) {
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);
  const rows = buildRows(state, today);

  // --- rango: reservas CREADAS en los últimos N días (o todas). El resumen y la tabla comparten este recorte. ---
  const daysParam = String(query.range || "30");
  const days = daysParam === "todas" || daysParam === "all" ? null : Math.min(Math.max(Math.trunc(n(daysParam)) || 30, 1), 366);
  const from = days ? addDays(today, -(days - 1)) : null;
  const inRange = (row) => !from || String(row.createdAt || "").slice(0, 10) >= from;
  const ranged = rows.filter(inRange);

  const prevRanged = days ? rows.filter((row) => { const d = String(row.createdAt || "").slice(0, 10); const prevTo = addDays(from, -1); const prevFrom = addDays(prevTo, -(days - 1)); return d >= prevFrom && d <= prevTo; }) : [];

  const active = ranged.filter((row) => row.status !== "CANCELADA");
  const porConfirmar = active.filter((row) => row.status === "POR_CONFIRMAR");
  const cancelaciones = ranged.filter((row) => row.status === "CANCELADA");
  const personasHoy = rows.filter((row) => row.date === today && row.status !== "CANCELADA").reduce((sum, row) => sum + row.people, 0);

  const reservasPorServicio = HOME_SERVICES.map(({ code, name }) => {
    const rowsOf = ranged.filter((row) => row.type === code);
    const confirmadas = rowsOf.filter((row) => ["CONFIRMADA", "EN_CURSO", "COMPLETADA"].includes(row.status));
    return { code, name, total: rowsOf.length, confirmadas: confirmadas.length };
  }).filter((row) => row.total > 0);

  const estadoPago = ["PAGADO", "PARCIAL", "PENDIENTE"].map((key) => ({ key, count: active.filter((row) => row.paymentState === key).length }));

  const upcomingDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const proximos7Dias = upcomingDays.map((date) => ({
    date, label: new Date(`${date}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "").replace(/^\w/, (c) => c.toUpperCase()),
    count: rows.filter((row) => row.date === date && row.status !== "CANCELADA").length
  }));

  // --- tabla: además del rango, filtra por servicio/estado/búsqueda y pagina ---
  const service = upper(query.service || "");
  const status = upper(query.status || "");
  const needle = String(query.q || "").trim().toLowerCase();
  const when = String(query.when || "").toLowerCase();
  let filtered = ranged.filter((row) => {
    if (service && row.type !== service) return false;
    if (status && row.status !== status) return false;
    if (needle) { const text = `${row.code} ${row.clientName} ${row.clientDocument}`.toLowerCase(); if (!text.includes(needle)) return false; }
    // Opcional (Recepción): por fecha del servicio, no de creación.
    if ((when === "hoy" || when === "proximas") && !status && row.status === "CANCELADA") return false;
    if (when === "hoy" && row.date !== today) return false;
    if (when === "proximas" && !(row.date >= today)) return false;
    if (when === "pasadas" && !(row.date < today)) return false;
    return true;
  });
  if (when === "proximas" || when === "hoy") filtered.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.slot || "").localeCompare(String(b.slot || "")));
  else filtered.sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  const pageSize = Math.min(Math.max(Math.trunc(n(query.pageSize)) || 10, 1), 100);
  const page = Math.max(Math.trunc(n(query.page)) || 1, 1);
  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const serviceCounts = HOME_SERVICES.map(({ code, name }) => ({ code, name, count: ranged.filter((row) => row.type === code).length }));

  return {
    today, generatedAt: at.toISOString(), range: { days, from },
    summary: {
      total: ranged.length, totalPrevious: prevRanged.length,
      porConfirmar: porConfirmar.length,
      personasHoy,
      saldoPendiente: { amount: round(active.reduce((sum, row) => sum + row.balance, 0)), count: active.filter((row) => row.balance > 0).length },
      cancelaciones: { count: cancelaciones.length, rate: ranged.length ? Math.round((cancelaciones.length / ranged.length) * 1000) / 10 : 0 },
      atencion: { count: porConfirmar.length + active.filter((row) => row.balance > 0).length, saldo: active.filter((row) => row.balance > 0).length, porConfirmar: porConfirmar.length },
      reservasPorServicio, estadoPago, proximos7Dias
    },
    list: { total, page, pageSize, serviceCounts, rows: pageRows }
  };
}

const TYPE_COLLECTION = { HOSPEDAJE: "reservations", PISCINA: "bookings", MIRADOR: "bookings", TERRAZA: "bookings", EVENTOS: "events" };

function findRawItem(state, type, id) {
  const collection = TYPE_COLLECTION[upper(type)];
  if (!collection) return null;
  return (state[collection] || []).find((row) => Number(row.id) === Number(id) && (collection !== "bookings" || upper(row.serviceCode) === upper(type))) || null;
}

/** Detalle de una reserva para el panel lateral: la fila normalizada + sus pagos + su historial de auditoría. */
export function buildReservationDetail(state, type, id, at = new Date()) {
  const raw = findRawItem(state, upper(type), id);
  if (!raw) return null;
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);
  const row = buildRows(state, today).find((item) => item.type === upper(type) && Number(item.id) === Number(id));
  const payments = (state.payments || []).filter((payment) => {
    if (upper(type) === "EVENTOS") return Number(payment.eventId) === Number(id);
    return Number(payment.bookingId || payment.reservationId) === Number(id);
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((payment) => ({ amount: n(payment.amount), method: payment.method, concept: payment.concept, createdAt: payment.createdAt }));
  const history = (state.audit || []).filter((entry) => entry.detail && String(entry.detail).startsWith(row.code)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((entry) => {
    const user = (state.users || []).find((item) => Number(item.id) === Number(entry.userId));
    return { at: entry.createdAt, action: entry.action, detail: entry.detail, actorName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Sistema" };
  });
  const { checkInDate, checkOutDate } = upper(type) === "HOSPEDAJE" ? reservationDates(raw) : { checkInDate: null, checkOutDate: null };
  // Hospedaje y Mirador piden verificar manualmente el Yape/Plin antes de aprobarlo (ver
  // POST /api/public/bookings/:id/pay-balance). Mientras está pendiente, el detalle expone la
  // operación para que el panel la muestre y la acción de cobro la valide contra esto.
  const verify = raw.paymentStatus === "PENDIENTE_VERIFICACION" ? { method: raw.paymentMethod, reference: raw.paymentReference, amount: n(raw.paymentRequested) } : null;
  // Un evento puede traer la propuesta que pidió el cliente (montaje, platos, equipamiento,
  // cochera): campos libres que solo llena la reserva pública de eventos, no el formulario del
  // panel. Se exponen aditivos aquí; el resto de tipos simplemente no los tiene.
  const eventExtra = upper(type) === "EVENTOS" ? {
    eventType: raw.type || null, guests: n(raw.guests), spaceCapacity: raw.space?.capacity || null,
    layout: raw.layout || null,
    catering: Array.isArray(raw.catering) ? raw.catering : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    parkingCount: n(raw.parkingCount) || (Array.isArray(raw.parkingSpaces) ? raw.parkingSpaces.length : 0),
    notes: raw.notes || ""
  } : {};
  return { ...row, checkInDate, checkOutDate, startsAt: raw.startsAt || null, endsAt: raw.endsAt || null, roomId: raw.roomId || null, payments, history, verify, ...eventExtra };
}

export { normalizeStatus, findRawItem, TYPE_COLLECTION, buildRows };
