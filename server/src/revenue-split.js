// Reparte cada cobro entre el servicio de origen (habitación, entrada, alquiler) y lo consumido en
// Restaurante/Bar. Es la regla del dueño: el consumo se imputa al servicio de origen, pero se ve qué se consumió.
// Compartido por `owner-home.js` (Inicio) y `client-directory.js` (Clientes) para no duplicar la lógica.
const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();
const sum = (rows, pick) => round(rows.reduce((total, row) => total + n(pick(row)), 0));

export function createRevenueSplitter(state, serviceCodes) {
  const SERVICE_CODES = new Set(serviceCodes);
  const bookings = state.bookings || [];
  const reservations = state.reservations || [];
  const events = state.events || [];
  const orders = state.orders || [];

  const bookingsById = new Map();
  for (const item of reservations) bookingsById.set(Number(item.id), { ...item, serviceCode: item.serviceCode || "HOSPEDAJE", total: n(item.total ?? item.totalPrice) });
  // Una reserva de hospedaje existe en `reservations` y en `bookings` con el mismo número: se combinan.
  for (const item of bookings) bookingsById.set(Number(item.id), { ...(bookingsById.get(Number(item.id)) || {}), ...item, total: n(item.total ?? item.totalPrice) });
  const eventsById = new Map(events.map((item) => [Number(item.id), item]));
  const ordersByGroup = new Map();
  const ordersByBooking = new Map();
  for (const order of orders) {
    if (order.groupCode) ordersByGroup.set(order.groupCode, [...(ordersByGroup.get(order.groupCode) || []), order]);
    if (order.bookingId !== null && order.bookingId !== undefined) ordersByBooking.set(String(order.bookingId), [...(ordersByBooking.get(String(order.bookingId)) || []), order]);
  }

  function originOfPayment(payment) {
    if (payment.eventId || upper(payment.area) === "EVENTOS") return "EVENTOS";
    const booking = bookingsById.get(Number(payment.bookingId || payment.reservationId));
    if (booking) return SERVICE_CODES.has(upper(booking.serviceCode)) ? upper(booking.serviceCode) : "SIN_CLASIFICAR";
    if (payment.stayId) return "HOSPEDAJE";
    const declared = upper(payment.serviceCode);
    return SERVICE_CODES.has(declared) ? declared : "SIN_CLASIFICAR";
  }

  function splitPayment(payment) {
    const amount = n(payment.amount);
    let restaurante = 0, bar = 0;
    const add = (list, share) => {
      for (const order of list) {
        if (upper(order.status) === "CANCELADO") continue;
        const value = n(order.total) * share;
        if (upper(order.area) === "RESTAURANTE") restaurante += value;
        else if (upper(order.area) === "BARTENDER") bar += value;
      }
    };
    const concept = String(payment.concept || "");
    if (/^Pedido\s/i.test(concept)) {
      const list = ordersByGroup.get(concept.replace(/^Pedido\s+/i, "").trim()) || [];
      const total = sum(list.filter((o) => upper(o.status) !== "CANCELADO"), (o) => o.total);
      add(list, total > 0 ? Math.min(1, amount / total) : 0);
    } else if (["RESTAURANTE", "BARTENDER"].includes(upper(payment.area))) {
      if (upper(payment.area) === "RESTAURANTE") restaurante = amount; else bar = amount;
    } else if (payment.eventId) {
      const event = eventsById.get(Number(payment.eventId));
      const list = (ordersByBooking.get(`event-${payment.eventId}`) || []);
      if (event && n(event.price) > 0) add(list, amount / n(event.price));
    } else if (payment.bookingId || payment.reservationId) {
      const booking = bookingsById.get(Number(payment.bookingId || payment.reservationId));
      const list = (ordersByBooking.get(String(booking?.id)) || []).filter((o) => String(o.groupCode || "").startsWith("SCH-"));
      if (booking && booking.total > 0) add(list, amount / booking.total);
    }
    const food = Math.min(amount, restaurante + bar);
    const scale = restaurante + bar > 0 ? food / (restaurante + bar) : 0;
    restaurante = round(restaurante * scale); bar = round(bar * scale);
    return { servicio: round(amount - restaurante - bar), restaurante, bar };
  }

  return { originOfPayment, splitPayment, bookingsById, eventsById };
}

export function methodKey(value) {
  const method = upper(value);
  if (["EFECTIVO", "CAJA HOTEL"].includes(method)) return "EFECTIVO";
  if (method === "YAPE") return "YAPE";
  if (method === "PLIN") return "PLIN";
  return "OTROS";
}
