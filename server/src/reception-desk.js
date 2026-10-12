// Admin de recepción: datos del "tablero del turno", de la planificación de habitaciones y del buscador
// global. Funciones puras (reciben el estado y devuelven todo calculado), igual que reservations-overview.js.
// Fechas en la zona horaria del hotel. No expone costos, gastos ni rentabilidad: solo lo que Recepción cobra.
import { HOME_SERVICES, addDays, makeClock } from "./owner-home.js";
import { buildRows, reservationDates } from "./reservations-overview.js";

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();
const day = (value) => String(value || "").slice(0, 10);
const fullName = (client) => [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || "Cliente sin nombre";
const SERVICE_NAME = Object.fromEntries(HOME_SERVICES.map((item) => [item.code, item.name]));
const CLOSED_REQUEST = new Set(["RESUELTO", "SOLUCIONADO", "CERRADO", "CANCELADO"]);
const DEAD_RESERVATION = new Set(["CANCELADA", "COMPLETADA", "NO_SHOW"]);
const DEAD_BOOKING = new Set(["CANCELADA", "CANCELADO", "FINALIZADA", "NO_SHOW"]);

function hourMinute(timezone, value) {
  if (!value) return null;
  // "2026-09-26T19:00:00" (sin zona) ya es hora local del hotel: no se convierte.
  if (typeof value === "string" && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) return value.slice(11, 16);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function clientSummary(client) {
  return client ? { id: client.id, name: fullName(client), document: client.documentNumber || "", phone: client.phone || "" } : null;
}

function roomSummary(room) {
  return room ? { id: room.id, number: room.number, floor: room.floor, type: room.type?.name || "", status: room.status, capacity: n(room.capacity) } : null;
}

/** Cuenta de una estadía: hospedaje + consumos − pagos (mismo cálculo que POST /api/checkout). */
function stayAccount(state, stay, reservation) {
  const consumptions = (state.orders || []).filter((item) => Number(item.clientId) === Number(stay.clientId) && Number(item.roomId) === Number(stay.roomId) && item.status !== "CANCELADO");
  const consumptionTotal = consumptions.reduce((sum, item) => sum + n(item.total), 0);
  const paid = (state.payments || []).filter((item) => Number(item.reservationId) === Number(reservation?.id) || Number(item.bookingId) === Number(reservation?.id) || Number(item.stayId) === Number(stay.id)).reduce((sum, item) => sum + n(item.amount), 0);
  const lodging = n(reservation?.totalPrice ?? reservation?.total);
  return { lodging: round(lodging), consumptions: round(consumptionTotal), consumptionCount: consumptions.length, paid: round(paid), balance: round(Math.max(0, lodging + consumptionTotal - paid)) };
}

function checkoutTaskOf(state, stay) {
  return (state.tasks || []).filter((item) => item.workflowType === "CHECKOUT_INSPECTION" && (Number(item.stayId) === Number(stay.id) || (Number(item.roomId) === Number(stay.roomId) && String(item.createdAt) > String(stay.checkInAt)))).sort((a, b) => n(b.id) - n(a.id))[0] || null;
}

/** Qué le falta a una reserva de Hospedaje para poder hacer el check-in hoy (mismas reglas que POST /api/checkin). */
function arrivalBlockers(reservation, room, today) {
  const blockers = [];
  const { checkInDate, checkOutDate } = reservationDates(reservation);
  if (reservation.refundHold) blockers.push({ code: "DEVOLUCION", label: "Devolución en trámite" });
  if (reservation.paymentStatus === "PENDIENTE_VERIFICACION") blockers.push({ code: "VERIFICAR_PAGO", label: "Verificar Yape/Plin" });
  else if (n(reservation.balance) > 0 || reservation.paymentStatus !== "PAGADO") blockers.push({ code: "SALDO", label: `Saldo S/ ${round(reservation.balance).toFixed(2)}` });
  if (!room) blockers.push({ code: "SIN_HABITACION", label: "Sin habitación asignada" });
  else if (room.status !== "LIBRE") blockers.push({ code: "HABITACION", label: room.status === "OCUPADA" ? "Habitación aún ocupada" : room.status === "EN_LIMPIEZA" ? "Habitación en limpieza" : "Habitación bloqueada" });
  if (day(checkInDate) > today) blockers.push({ code: "FECHA", label: "Aún no es la fecha" });
  if (day(checkOutDate) <= today) blockers.push({ code: "VENCIDA", label: "Fecha de salida vencida" });
  return blockers;
}

export function buildReceptionDesk(state, { userId = null, at = new Date() } = {}) {
  const timezone = state?.settings?.timezone || "America/Lima";
  const clock = makeClock(timezone);
  const today = clock.date(at);
  const clientOf = (id) => (state.clients || []).find((item) => Number(item.id) === Number(id));
  const roomOf = (id) => (state.rooms || []).find((item) => Number(item.id) === Number(id));
  const reservationOf = (id) => (state.reservations || []).find((item) => Number(item.id) === Number(id));

  // --- Hospedaje: llegadas, estadías y salidas ---
  const pendingArrivals = [];
  const lateArrivals = [];
  for (const reservation of state.reservations || []) {
    if (DEAD_RESERVATION.has(upper(reservation.status)) || reservation.stayId || upper(reservation.status) === "CHECKED_IN") continue;
    const { checkInDate, checkOutDate } = reservationDates(reservation);
    const arrival = day(checkInDate);
    const departure = day(checkOutDate);
    const room = roomOf(reservation.roomId);
    const row = {
      id: reservation.id, code: reservation.code, client: clientSummary(clientOf(reservation.clientId)), room: roomSummary(room),
      arrival, departure, nights: Math.max(1, Math.round((new Date(`${departure}T12:00:00Z`) - new Date(`${arrival}T12:00:00Z`)) / 86400000)),
      adults: n(reservation.adults || reservation.people || 1), children: n(reservation.children),
      total: round(reservation.totalPrice ?? reservation.total), paid: round(reservation.advance ?? reservation.paid), balance: round(reservation.balance),
      paymentStatus: reservation.paymentStatus || "PENDIENTE", paymentMethod: reservation.paymentMethod || null, paymentReference: reservation.paymentReference || null,
      planName: reservation.planName || null, blockers: arrivalBlockers(reservation, room, today)
    };
    if (arrival === today) pendingArrivals.push(row);
    else if (arrival < today && departure > today) lateArrivals.push({ ...row, lateBy: "LLEGADA_ATRASADA" });
    else if (arrival < today) lateArrivals.push({ ...row, lateBy: "NO_SE_PRESENTO" });
  }

  const inHouse = [];
  for (const stay of (state.stays || []).filter((item) => item.status === "ACTIVA")) {
    const reservation = reservationOf(stay.reservationId);
    const { checkOutDate } = reservation ? reservationDates(reservation) : { checkOutDate: null };
    const departure = day(checkOutDate);
    const task = checkoutTaskOf(state, stay);
    inHouse.push({
      stayId: stay.id, reservationId: reservation?.id || null, code: reservation?.code || "", client: clientSummary(clientOf(stay.clientId)), room: roomSummary(roomOf(stay.roomId)),
      checkInAt: stay.checkInAt, departure, guests: n(reservation?.adults || reservation?.people || 1) + n(reservation?.children),
      departureState: !departure ? "SIN_FECHA" : departure < today ? "VENCIDA" : departure === today ? "HOY" : "EN_CASA",
      checkoutRequestedAt: stay.checkoutRequestedAt || null, expressCheckout: Boolean(stay.expressCheckout),
      inspection: task ? { id: task.id, status: task.status, assignedTo: task.assignedTo || null } : null,
      account: stayAccount(state, stay, reservation)
    });
  }
  inHouse.sort((a, b) => String(a.departure).localeCompare(String(b.departure)) || String(a.room?.number).localeCompare(String(b.room?.number)));
  const departures = inHouse.filter((row) => ["HOY", "VENCIDA"].includes(row.departureState));
  const arrivedToday = (state.stays || []).filter((stay) => clock.date(stay.checkInAt) === today).length;
  const departedToday = (state.stays || []).filter((stay) => stay.checkOutAt && clock.date(stay.checkOutAt) === today).length;

  // --- Habitaciones ---
  const rooms = (state.rooms || []).map((room) => {
    const stay = inHouse.find((row) => Number(row.room?.id) === Number(room.id));
    const arrival = pendingArrivals.find((row) => Number(row.room?.id) === Number(room.id));
    const openTask = (state.tasks || []).find((task) => Number(task.roomId) === Number(room.id) && !["FINALIZADA", "CANCELADA"].includes(upper(task.status)));
    let board = "DISPONIBLE";
    if (["MANTENIMIENTO", "FUERA_SERVICIO"].includes(upper(room.status))) board = "BLOQUEADA";
    else if (upper(room.status) === "EN_LIMPIEZA") board = "LIMPIEZA";
    else if (stay) board = stay.departureState === "VENCIDA" ? "SALIDA_VENCIDA" : stay.departureState === "HOY" ? "SALE_HOY" : "OCUPADA";
    else if (upper(room.status) === "OCUPADA") board = "OCUPADA";
    else if (arrival) board = "LLEGA_HOY";
    return {
      id: room.id, number: room.number, floor: room.floor, type: room.type?.name || "", capacity: n(room.capacity), price: n(room.price), status: room.status, cleaningStatus: room.cleaningStatus || null,
      statusNote: room.statusNote || "", board,
      guest: stay ? { name: stay.client?.name, departure: stay.departure, code: stay.code, stayId: stay.stayId } : null,
      arrival: arrival ? { name: arrival.client?.name, code: arrival.code, ready: !arrival.blockers.length } : null,
      task: openTask ? { code: openTask.code, status: openTask.status, type: openTask.serviceType || openTask.workflowType || "" } : null
    };
  }).sort((a, b) => n(a.floor) - n(b.floor) || String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  const roomCounts = rooms.reduce((acc, room) => { acc[room.board] = (acc[room.board] || 0) + 1; return acc; }, {});
  const sellable = rooms.filter((room) => room.board !== "BLOQUEADA").length;
  const occupied = rooms.filter((room) => ["OCUPADA", "SALE_HOY", "SALIDA_VENCIDA"].includes(room.board)).length;

  // --- Piscina, Mirador, Terraza y Eventos de hoy ---
  const experiences = (state.bookings || []).filter((item) => upper(item.serviceCode) !== "HOSPEDAJE" && day(item.date) === today && !DEAD_BOOKING.has(upper(item.status)) && upper(item.status) !== "CANCELADA").map((item) => {
    const entitlement = (state.entitlements || []).find((entry) => Number(entry.bookingId) === Number(item.id) && upper(entry.serviceCode) === upper(item.serviceCode));
    return {
      id: item.id, code: item.code, service: upper(item.serviceCode), serviceName: SERVICE_NAME[upper(item.serviceCode)] || item.serviceCode, planName: item.planName || null,
      slot: item.slot || null, people: n(item.people || 1), client: clientSummary(clientOf(item.clientId)),
      total: round(item.total), paid: round(item.paid), balance: round(item.balance), paymentStatus: item.paymentStatus || "PENDIENTE",
      access: entitlement?.usedAt || upper(item.accessStatus) === "INGRESO_VALIDADO" ? "INGRESO" : entitlement?.status === "LISTO_INGRESO" ? "LISTO" : "PENDIENTE",
      usedAt: entitlement?.usedAt || null
    };
  }).sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
  const events = (state.events || []).filter((item) => day(item.startsAt) === today && !["CANCELADO", "COTIZACION"].includes(upper(item.status))).map((item) => ({
    id: item.id, code: item.code, name: item.name || item.type || "Evento", space: item.space?.name || "", guests: n(item.guests),
    startsAt: hourMinute(timezone, item.startsAt) || String(item.startsAt || "").slice(11, 16), endsAt: hourMinute(timezone, item.endsAt) || String(item.endsAt || "").slice(11, 16),
    client: clientSummary(clientOf(item.clientId)), total: round(item.price), balance: round(item.balance), status: item.status
  }));

  // --- Dinero que Recepción debe gestionar ---
  const verifications = [];
  for (const item of state.bookings || []) {
    if (item.paymentStatus !== "PENDIENTE_VERIFICACION" || DEAD_BOOKING.has(upper(item.status))) continue;
    verifications.push({ kind: "BOOKING", id: item.id, code: item.code, service: upper(item.serviceCode), serviceName: SERVICE_NAME[upper(item.serviceCode)] || item.serviceCode, client: clientSummary(clientOf(item.clientId)), method: item.paymentMethod, reference: item.paymentReference, amount: round(item.paymentRequested || item.balance), date: day(item.date || item.checkIn), createdAt: item.updatedAt || item.createdAt });
  }
  const receivableRows = [];
  for (const item of state.bookings || []) {
    if (n(item.balance) <= 0 || DEAD_BOOKING.has(upper(item.status))) continue;
    receivableRows.push({ amount: n(item.balance), date: day(item.date || item.checkIn) });
  }
  for (const item of state.events || []) {
    if (n(item.balance) <= 0 || ["CANCELADO"].includes(upper(item.status))) continue;
    receivableRows.push({ amount: n(item.balance), date: day(item.startsAt) });
  }
  const receivables = {
    count: receivableRows.length, amount: round(receivableRows.reduce((sum, row) => sum + row.amount, 0)),
    dueToday: receivableRows.filter((row) => row.date <= today).length
  };

  const myPayments = (state.payments || []).filter((item) => clock.date(item.createdAt) === today && userId && Number(item.createdById) === Number(userId));
  const byMethod = myPayments.reduce((acc, item) => { const key = upper(item.method) || "OTRO"; acc[key] = round((acc[key] || 0) + n(item.amount)); return acc; }, {});
  const cashSession = (state.cashSessions || []).find((item) => Number(item.userId) === Number(userId) && ["ABIERTA", "EN_REVISION"].includes(item.status)) || null;
  // Caja del turno: mismo cálculo que POST /api/cash-sessions/:id/submit (efectivo de la sesión + movimientos).
  const sessionPayments = cashSession ? (state.payments || []).filter((item) => Number(item.sessionId) === Number(cashSession.id) && upper(item.method) === "EFECTIVO" && upper(item.status || "APROBADO") === "APROBADO") : [];
  const sessionMovements = cashSession ? (state.cashMovements || []).filter((item) => Number(item.sessionId) === Number(cashSession.id)) : [];
  const cashIn = sessionPayments.reduce((sum, item) => sum + n(item.amount), 0) + sessionMovements.filter((item) => item.type !== "EGRESO").reduce((sum, item) => sum + n(item.amount), 0);
  const cashOut = sessionMovements.filter((item) => item.type === "EGRESO").reduce((sum, item) => sum + n(item.amount), 0);
  const describe = (payment) => {
    const booking = (state.bookings || []).find((item) => Number(item.id) === Number(payment.bookingId || payment.reservationId));
    const event = (state.events || []).find((item) => Number(item.id) === Number(payment.eventId));
    return { code: booking?.code || event?.code || null, client: fullName(clientOf(payment.clientId)) };
  };
  const cash = {
    collected: round(myPayments.reduce((sum, item) => sum + n(item.amount), 0)), count: myPayments.length, byMethod,
    session: cashSession ? { id: cashSession.id, status: cashSession.status, openedAt: cashSession.openedAt, submittedAt: cashSession.submittedAt || null, initialFund: n(cashSession.initialFund), cashIn: round(cashIn), cashOut: round(cashOut), expected: round(n(cashSession.initialFund) + cashIn - cashOut), actualCash: cashSession.actualCash ?? null, variance: cashSession.variance ?? null } : null,
    movements: [
      ...myPayments.map((item) => ({ kind: "COBRO", at: item.createdAt, method: upper(item.method), amount: round(item.amount), concept: item.concept || "Cobro", inCash: Boolean(cashSession) && Number(item.sessionId) === Number(cashSession?.id), ...describe(item) })),
      ...sessionMovements.map((item) => ({ kind: item.type, at: item.createdAt, method: "EFECTIVO", amount: round(item.amount), concept: item.concept || item.type, inCash: true, code: null, client: null }))
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)))
  };

  // --- Solicitudes de huéspedes, limpieza y pedidos ---
  const openRequests = (state.requests || []).filter((item) => !CLOSED_REQUEST.has(upper(item.status)));
  const requests = openRequests.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8).map((item) => ({
    id: item.id, code: item.code, type: String(item.type || "").replaceAll("_", " "), area: item.area, status: item.status, priority: item.priority, location: item.location || "",
    description: item.description || "", createdAt: item.createdAt, maintenance: Boolean(item.requiresMaintenance)
  }));
  const openTasks = (state.tasks || []).filter((item) => !["FINALIZADA", "CANCELADA"].includes(upper(item.status)));
  const activeOrders = (state.orders || []).filter((item) => !["ENTREGADO", "CANCELADO"].includes(upper(item.status)));

  // --- Agenda del día (línea de tiempo de los 5 servicios) ---
  const agenda = [
    ...pendingArrivals.map((row) => ({ time: "15:00", kind: "LLEGADA", service: "HOSPEDAJE", title: row.client?.name || row.code, detail: `Llega · Hab. ${row.room?.number || "—"}`, code: row.code, state: row.blockers.length ? "ATENCION" : "LISTO" })),
    ...departures.map((row) => ({ time: "12:00", kind: "SALIDA", service: "HOSPEDAJE", title: row.client?.name || row.code, detail: `${row.departureState === "VENCIDA" ? "Salida vencida" : "Sale"} · Hab. ${row.room?.number || "—"}`, code: row.code, state: row.departureState === "VENCIDA" ? "ATENCION" : row.account.balance > 0 ? "COBRO" : "LISTO" })),
    ...experiences.map((row) => ({ time: row.slot || "—", kind: "SERVICIO", service: row.service, title: row.client?.name || row.code, detail: `${row.serviceName} · ${row.people} pers.${row.planName ? ` · ${row.planName}` : ""}`, code: row.code, state: row.access === "INGRESO" ? "HECHO" : row.balance > 0 ? "COBRO" : "LISTO" })),
    ...events.map((row) => ({ time: row.startsAt || "—", kind: "EVENTO", service: "EVENTOS", title: row.name, detail: `${row.space} · ${row.guests} invitados`, code: row.code, state: row.balance > 0 ? "COBRO" : "LISTO" }))
  ].sort((a, b) => String(a.time).localeCompare(String(b.time)));

  const guestsInHouse = inHouse.reduce((sum, row) => sum + row.guests, 0);
  const attention = [
    verifications.length ? { key: "verify", tone: "warn", count: verifications.length, label: "pagos Yape/Plin por verificar", href: "/admin-panel/cobros" } : null,
    departures.filter((row) => row.departureState === "VENCIDA").length ? { key: "overdue", tone: "crit", count: departures.filter((row) => row.departureState === "VENCIDA").length, label: "estadías con salida vencida", href: "/admin-panel/movimientos?vista=salidas" } : null,
    lateArrivals.length ? { key: "late", tone: "warn", count: lateArrivals.length, label: "llegadas atrasadas o no presentadas", href: "/admin-panel/movimientos?vista=llegadas" } : null,
    pendingArrivals.filter((row) => row.blockers.length).length ? { key: "blocked", tone: "warn", count: pendingArrivals.filter((row) => row.blockers.length).length, label: "llegadas de hoy con pendientes", href: "/admin-panel/movimientos?vista=llegadas" } : null,
    openRequests.length ? { key: "requests", tone: "info", count: openRequests.length, label: "solicitudes abiertas de huéspedes y áreas", href: "/admin/limpieza/resumen" } : null,
    !cash.session ? { key: "cash", tone: "info", count: null, label: "Tu caja está cerrada: ábrela para cobrar en efectivo", href: "/admin-panel/mi-caja" } : null
  ].filter(Boolean);

  return {
    date: today, generatedAt: at.toISOString(), now: hourMinute(timezone, at),
    kpis: {
      arrivalsPending: pendingArrivals.length, arrivedToday, departuresPending: departures.length, departedToday,
      inHouseRooms: inHouse.length, guestsInHouse, occupancyRate: sellable ? Math.round((occupied / sellable) * 100) : 0, occupied, sellable,
      experiencesToday: experiences.length, peopleExpected: experiences.reduce((sum, row) => sum + row.people, 0) + events.reduce((sum, row) => sum + row.guests, 0),
      verifications: verifications.length, receivables: receivables.amount, receivableCount: receivables.count,
      openRequests: openRequests.length, openTasks: openTasks.length, activeOrders: activeOrders.length
    },
    arrivals: pendingArrivals, lateArrivals, inHouse, departures, rooms, roomCounts, experiences, events,
    verifications, receivables, cash, requests, agenda, attention
  };
}

/** Planificación de habitaciones: una fila por habitación y bloques de reserva que tocan el rango. */
export function buildReceptionPlanning(state, { from, days = 14, at = new Date() } = {}) {
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(from || "")) ? from : addDays(today, -1);
  const length = Math.min(Math.max(Math.trunc(n(days)) || 14, 7), 31);
  const end = addDays(start, length);
  const clientOf = (id) => (state.clients || []).find((item) => Number(item.id) === Number(id));
  const blocks = [];
  for (const reservation of state.reservations || []) {
    if (["CANCELADA", "NO_SHOW"].includes(upper(reservation.status)) || !reservation.roomId) continue;
    const { checkInDate, checkOutDate } = reservationDates(reservation);
    let arrival = day(checkInDate);
    let departure = day(checkOutDate);
    if (!arrival) continue;
    if (!departure || departure <= arrival) departure = addDays(arrival, 1);
    const stay = (state.stays || []).find((item) => Number(item.id) === Number(reservation.stayId) || Number(item.reservationId) === Number(reservation.id));
    const inHouse = stay?.status === "ACTIVA";
    const overdue = inHouse && departure < today;
    // Una estadía que no hizo check-out sigue ocupando la habitación hasta hoy.
    const visualEnd = overdue ? addDays(today, 1) : departure;
    if (visualEnd <= start || arrival >= end) continue;
    const status = upper(reservation.status) === "COMPLETADA" || stay?.status === "FINALIZADA" ? "SALIO" : inHouse ? (overdue ? "VENCIDA" : "EN_CASA") : reservation.paymentStatus === "PENDIENTE_VERIFICACION" ? "VERIFICAR" : n(reservation.balance) > 0 ? "POR_COBRAR" : "CONFIRMADA";
    blocks.push({
      id: reservation.id, code: reservation.code, roomId: Number(reservation.roomId), clientName: fullName(clientOf(reservation.clientId)),
      arrival, departure, visualEnd, status, balance: round(reservation.balance), total: round(reservation.totalPrice ?? reservation.total),
      guests: n(reservation.adults || reservation.people || 1) + n(reservation.children)
    });
  }
  const rooms = (state.rooms || []).map((room) => ({ id: room.id, number: room.number, floor: room.floor, type: room.type?.name || "", status: room.status, price: n(room.price) }))
    .sort((a, b) => n(a.floor) - n(b.floor) || String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  const dates = Array.from({ length }, (_, i) => addDays(start, i));
  const occupancy = dates.map((date) => ({ date, rooms: new Set(blocks.filter((block) => block.arrival <= date && block.visualEnd > date && block.status !== "SALIO").map((block) => block.roomId)).size }));
  return { today, from: start, days: length, dates, rooms, blocks, occupancy };
}

/** Buscador global de Recepción: clientes, reservas de cualquier servicio y habitaciones. */
export function buildReceptionSearch(state, query, at = new Date()) {
  const needle = String(query || "").trim().toLowerCase();
  if (needle.length < 2) return { clients: [], reservations: [], rooms: [] };
  const digits = needle.replace(/\D/g, "");
  const clients = (state.clients || []).filter((client) => {
    const text = `${client.firstName || ""} ${client.lastName || ""} ${client.email || ""}`.toLowerCase();
    return text.includes(needle) || (digits.length >= 3 && `${client.documentNumber || ""} ${client.phone || ""}`.includes(digits));
  }).slice(0, 6).map((client) => ({ id: client.id, name: fullName(client), document: client.documentNumber || "", phone: client.phone || "", status: client.status || "ACTIVO" }));
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const reservations = buildRows(state, clock.date(at)).filter((row) => `${row.code} ${row.clientName} ${row.clientDocument}`.toLowerCase().includes(needle))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8)
    .map((row) => ({ type: row.type, serviceName: SERVICE_NAME[row.type] || row.type, id: row.id, code: row.code, clientName: row.clientName, date: row.date, status: row.status, statusLabel: row.statusLabel, balance: row.balance, place: row.place }));
  const rooms = (state.rooms || []).filter((room) => String(room.number).toLowerCase().startsWith(needle)).slice(0, 4).map((room) => ({ id: room.id, number: room.number, type: room.type?.name || "", status: room.status }));
  return { clients, reservations, rooms };
}
