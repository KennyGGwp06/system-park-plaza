// Resumen ejecutivo del Superadmin (pantalla Inicio).
// Función pura: recibe el estado y devuelve todos los números ya calculados. Así el navegador solo dibuja.
// Todas las fechas se calculan en la zona horaria del hotel (America/Lima), nunca en UTC.
import { orderTiming } from "./order-operations.js";
import { createRevenueSplitter, methodKey } from "./revenue-split.js";

export const HOME_SERVICES = [
  { code: "HOSPEDAJE", name: "Hospedaje" },
  { code: "PISCINA", name: "Piscina" },
  { code: "MIRADOR", name: "Mirador" },
  { code: "TERRAZA", name: "Terraza" },
  { code: "EVENTOS", name: "Eventos" }
];
export const EXPENSE_CATEGORIES = ["INSUMOS", "PLANILLA", "SERVICIOS", "MANTENIMIENTO", "MARKETING", "IMPUESTOS", "OTROS"];

const SERVICE_CODES = new Set(HOME_SERVICES.map((item) => item.code));
const APPROVED = new Set(["APROBADO", "PAGADO", "CONFIRMADO"]);
const OPEN_REQUEST_CLOSED = new Set(["RESUELTO", "SOLUCIONADO", "CERRADO"]);
const CANCELLED = new Set(["CANCELADA", "CANCELADO"]);
// No hay registro de salida en Piscina, Mirador y Terraza: se estima cuánto permanece cada ingreso validado.
const INSIDE_MINUTES = { PISCINA: 180, MIRADOR: 120, TERRAZA: 180 };
const STATUS_BUCKETS = [
  ["Nuevo", ["PENDIENTE"]],
  ["En preparación", ["ACEPTADO", "EN_PREPARACION", "PREPARANDO", "EN_PROCESO"]],
  ["Listo", ["LISTO"]],
  ["Entregado", ["ENTREGADO"]]
];

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();

export function makeClock(timezone = "America/Lima") {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!value || Number.isNaN(date.getTime())) return null;
    const out = {};
    for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
    return out;
  };
  return {
    date(value) { const p = parts(value); return p ? `${p.year}-${p.month}-${p.day}` : null; },
    hour(value) { const p = parts(value); return p ? Number(p.hour) : null; }
  };
}

export function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000) + 1;
const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());

export function resolveRange(query = {}, today) {
  let from = today, to = today;
  if (isDateKey(query.from) && isDateKey(query.to) && query.from <= query.to && daysBetween(query.from, query.to) <= 366) {
    from = query.from; to = query.to > today ? today : query.to;
    if (from > to) from = to;
  } else {
    const days = Math.min(Math.max(Math.trunc(n(query.days)) || 1, 1), 366);
    from = addDays(today, -(days - 1));
  }
  const days = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from, to, days, prevFrom, prevTo };
}

/* Rango de fechas que usa el Inicio (período, período anterior y serie diaria): el servidor pide al historial
   solo ese tramo (ver history.js). */
export function ownerHomeWindow(query = {}, today) {
  const range = resolveRange(query, today);
  const seriesDays = Math.min(Math.max(range.days, 7), 31);
  const seriesFrom = addDays(range.to, -(seriesDays - 1));
  return { from: [range.prevFrom, seriesFrom].sort()[0], to: today };
}

const inRange = (date, from, to) => Boolean(date) && date >= from && date <= to;
const sum = (rows, pick) => round(rows.reduce((total, row) => total + n(pick(row)), 0));

export function buildOwnerHome(state, query = {}, context = {}, at = new Date()) {
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);
  const range = resolveRange(query, today);
  const seriesDays = Math.min(Math.max(range.days, 7), 31);
  const seriesFrom = addDays(range.to, -(seriesDays - 1));
  const earliest = [range.prevFrom, seriesFrom].sort()[0];

  const bookings = state.bookings || [];
  const reservations = state.reservations || [];
  const events = state.events || [];
  const orders = state.orders || [];
  const payments = state.payments || [];
  const stays = state.stays || [];
  const rooms = state.rooms || [];

  // --- índices y reparto servicio / Restaurante / Bar (compartido con client-directory.js) ---
  const { originOfPayment, splitPayment, bookingsById } = createRevenueSplitter(state, HOME_SERVICES.map((item) => item.code));

  // --- ventas (pagos aprobados + ingresos manuales de caja) ---
  const salesRows = [];
  for (const payment of payments) {
    if (!APPROVED.has(upper(payment.status || "APROBADO"))) continue;
    const date = clock.date(payment.createdAt || payment.paidAt);
    if (!inRange(date, earliest, range.to)) continue;
    salesRows.push({ date, amount: n(payment.amount), origin: originOfPayment(payment), split: splitPayment(payment), method: methodKey(payment.method), channel: payment.createdById ? "RECEPCION" : "APP" });
  }
  for (const movement of state.cashMovements || []) {
    if (upper(movement.type) === "EGRESO") continue;
    const date = clock.date(movement.createdAt);
    if (!inRange(date, earliest, range.to)) continue;
    const declared = upper(movement.serviceCode);
    const amount = n(movement.amount);
    salesRows.push({ date, amount, origin: SERVICE_CODES.has(declared) ? declared : "SIN_CLASIFICAR", split: { servicio: amount, restaurante: 0, bar: 0 }, method: methodKey(movement.method), channel: "RECEPCION" });
  }

  // --- gastos: egresos de caja + costo de recetas de los pedidos ---
  const orderOrigin = (order) => {
    const declared = upper(order.experienceCode);
    if (SERVICE_CODES.has(declared)) return declared;
    if (order.eventId || String(order.bookingId || "").startsWith("event-")) return "EVENTOS";
    const booking = bookingsById.get(Number(order.bookingId));
    return booking && SERVICE_CODES.has(upper(booking.serviceCode)) ? upper(booking.serviceCode) : "SIN_ASIGNAR";
  };
  const expenseRows = [];
  for (const movement of state.cashMovements || []) {
    if (upper(movement.type) !== "EGRESO") continue;
    const date = clock.date(movement.createdAt);
    if (!inRange(date, earliest, range.to)) continue;
    const declared = upper(movement.serviceCode);
    expenseRows.push({ date, amount: n(movement.amount), service: SERVICE_CODES.has(declared) ? declared : declared === "GENERAL" ? "GENERAL" : "SIN_ASIGNAR", kind: "CAJA" });
  }
  const costRows = [];
  for (const order of orders) {
    if (upper(order.status) === "CANCELADO") continue;
    const date = clock.date(order.createdAt);
    if (!inRange(date, earliest, range.to)) continue;
    const cost = round((order.items || []).reduce((total, item) => total + n(item.recipeUnitCost) * n(item.quantity ?? 1), 0));
    if (cost <= 0) continue;
    costRows.push({ date, amount: cost, service: orderOrigin(order), area: upper(order.area), kind: "COSTO" });
  }
  // Planilla: días validados × tarifa diaria, calculados por el servidor (workforce.js) y entregados en el contexto.
  const payrollRows = (context.payrollRows || []).filter((row) => inRange(row.date, earliest, range.to)).map((row) => ({ ...row, kind: "PLANILLA" }));
  const allExpenses = [...expenseRows, ...costRows, ...payrollRows];

  const salesIn = (from, to) => salesRows.filter((row) => inRange(row.date, from, to));
  const expIn = (from, to) => allExpenses.filter((row) => inRange(row.date, from, to));
  const cur = { sales: salesIn(range.from, range.to), exp: expIn(range.from, range.to) };
  const prev = { sales: salesIn(range.prevFrom, range.prevTo), exp: expIn(range.prevFrom, range.prevTo) };
  const salesTotal = sum(cur.sales, (r) => r.amount), expTotal = sum(cur.exp, (r) => r.amount);
  const salesPrev = sum(prev.sales, (r) => r.amount), expPrev = sum(prev.exp, (r) => r.amount);
  const change = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null);

  // --- serie diaria ---
  const series = [];
  for (let i = 0; i < seriesDays; i += 1) {
    const date = addDays(seriesFrom, i);
    const sales = sum(salesRows.filter((r) => r.date === date), (r) => r.amount);
    const expenses = sum(allExpenses.filter((r) => r.date === date), (r) => r.amount);
    series.push({ date, sales, expenses, profit: round(sales - expenses) });
  }

  // --- por cobrar ---
  const receivableRows = [];
  const seen = new Set();
  for (const item of [...bookings, ...reservations]) {
    const key = `b${item.id}`; if (seen.has(key)) continue; seen.add(key);
    const balance = n(item.balance);
    if (balance > 0 && !CANCELLED.has(upper(item.status))) receivableRows.push({ service: upper(item.serviceCode || "HOSPEDAJE"), amount: balance });
  }
  for (const event of events) {
    const balance = n(event.balance);
    if (balance > 0 && !CANCELLED.has(upper(event.status))) receivableRows.push({ service: "EVENTOS", amount: balance });
  }
  const receivableBy = (code) => sum(receivableRows.filter((r) => r.service === code), (r) => r.amount);

  // --- personas dentro ahora ---
  const nowMs = at.getTime();
  const guestsOfStay = (stay) => { const r = bookingsById.get(Number(stay.reservationId)) || {}; return Math.max(1, n(r.adults || r.people || 1) + n(r.children)); };
  const inside = Object.fromEntries(HOME_SERVICES.map((s) => [s.code, 0]));
  inside.HOSPEDAJE = stays.filter((s) => upper(s.status) === "ACTIVA").reduce((total, s) => total + guestsOfStay(s), 0);
  for (const pass of state.entitlements || []) {
    const code = upper(pass.serviceCode);
    if (!INSIDE_MINUTES[code] || !pass.usedAt || pass.eventId) continue;
    if (clock.date(pass.usedAt) !== today) continue;
    if (nowMs - new Date(pass.usedAt).getTime() <= INSIDE_MINUTES[code] * 60000) inside[code] += Math.max(1, n(pass.people));
  }
  for (const entry of state.poolEntries || []) if (upper(entry.status) === "ACTIVO") inside.PISCINA += Math.max(1, n(entry.people));
  for (const event of events) {
    if (!["CONFIRMADO", "ACTIVO", "EN_CURSO"].includes(upper(event.status)) || upper(event.accessStatus) !== "INGRESO_VALIDADO") continue;
    const start = new Date(event.startsAt).getTime(), end = new Date(event.endsAt).getTime();
    if (start <= nowMs && nowMs <= end) inside.EVENTOS += Math.max(1, n(event.guests));
  }
  const serviceMeta = (state.services || []).reduce((map, item) => map.set(upper(item.code), item), new Map());
  const capacity = {
    HOSPEDAJE: rooms.reduce((total, room) => total + n(room.capacity || 1), 0) || null,
    PISCINA: n(serviceMeta.get("PISCINA")?.capacity) || null,
    MIRADOR: n(serviceMeta.get("MIRADOR")?.capacity) || null,
    TERRAZA: n(serviceMeta.get("TERRAZA")?.capacity) || null,
    EVENTOS: (context.eventSpaces || []).reduce((total, space) => total + n(space.capacity), 0) || null
  };

  // --- servicios ---
  const roomsReady = rooms.length;
  const services = HOME_SERVICES.map(({ code, name }) => {
    const sales = sum(cur.sales.filter((r) => r.origin === code), (r) => r.amount);
    const expenses = sum(cur.exp.filter((r) => r.service === code), (r) => r.amount);
    const reservationsToday = code === "HOSPEDAJE"
      ? reservations.filter((r) => String(r.checkInDate || r.checkIn).slice(0, 10) === today && !CANCELLED.has(upper(r.status))).length
      : code === "EVENTOS"
        ? events.filter((e) => clock.date(e.startsAt) === today && !CANCELLED.has(upper(e.status))).length
        : bookings.filter((b) => upper(b.serviceCode) === code && String(b.date).slice(0, 10) === today && !CANCELLED.has(upper(b.status))).length;
    return { code, name, sales, expenses, profit: round(sales - expenses), margin: sales > 0 ? Math.round(((sales - expenses) / sales) * 100) : null, inside: inside[code], capacity: capacity[code], estimated: Boolean(INSIDE_MINUTES[code]), reservationsToday, receivable: receivableBy(code) };
  });
  const unassigned = { sales: sum(cur.sales.filter((r) => r.origin === "SIN_CLASIFICAR"), (r) => r.amount), expenses: sum(cur.exp.filter((r) => r.service === "SIN_ASIGNAR"), (r) => r.amount), general: sum(cur.exp.filter((r) => r.service === "GENERAL"), (r) => r.amount) };

  // --- afluencia por hora (hoy) ---
  const hourly = Array.from({ length: 18 }, (_, i) => ({ hour: i + 6, count: 0 }));
  const bump = (iso, people) => { const date = clock.date(iso); const hour = clock.hour(iso); if (date === today && hour >= 6 && hour <= 23) hourly[hour - 6].count += Math.max(1, n(people)); };
  for (const log of state.accessLogs || []) bump(log.validatedAt || log.createdAt, log.people);
  for (const stay of stays) bump(stay.checkInAt, guestsOfStay(stay));
  for (const entry of state.poolEntries || []) bump(entry.enteredAt, entry.people);
  const peak = hourly.reduce((best, item) => (item.count > best.count ? item : best), { hour: null, count: 0 });

  // --- origen del consumo (mapa de calor) ---
  const originRows = [...HOME_SERVICES.map((s) => s.code), "SIN_CLASIFICAR"].map((code) => {
    const rows = cur.sales.filter((r) => r.origin === code);
    return { code, name: code === "SIN_CLASIFICAR" ? "Sin clasificar" : HOME_SERVICES.find((s) => s.code === code).name, servicio: sum(rows, (r) => r.split.servicio), restaurante: sum(rows, (r) => r.split.restaurante), bar: sum(rows, (r) => r.split.bar) };
  }).filter((row) => row.code !== "SIN_CLASIFICAR" || row.servicio + row.restaurante + row.bar > 0);

  // --- habitaciones ---
  const roomList = rooms.map((room) => ({ id: room.id, number: String(room.number), floor: n(room.floor), status: upper(room.status) })).sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number, "es", { numeric: true }));
  const occupied = roomList.filter((r) => r.status === "OCUPADA").length;
  const occupancy = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    let count;
    if (i === 0) count = occupied;
    else {
      const used = new Set();
      for (const stay of stays) {
        const start = clock.date(stay.checkInAt); const end = stay.checkOutAt ? clock.date(stay.checkOutAt) : null;
        if (start && start <= date && (!end || end > date)) used.add(stay.roomId);
      }
      count = used.size;
    }
    occupancy.push({ date, percent: roomsReady ? Math.round((count / roomsReady) * 100) : 0 });
  }

  // --- cobros ---
  const methods = ["EFECTIVO", "YAPE", "PLIN", "OTROS"].map((key) => ({ key, amount: sum(cur.sales.filter((r) => r.method === key), (r) => r.amount) }));
  const channels = [{ key: "RECEPCION", amount: sum(cur.sales.filter((r) => r.channel === "RECEPCION"), (r) => r.amount) }, { key: "APP", amount: sum(cur.sales.filter((r) => r.channel === "APP"), (r) => r.amount) }];
  const verifying = bookings.filter((b) => upper(b.paymentStatus) === "PENDIENTE_VERIFICACION");
  const toVerify = { count: verifying.length, amount: sum(verifying, (b) => b.paymentRequested || b.balance) };

  // --- Restaurante y Bar ---
  const areaSales = { RESTAURANTE: sum(cur.sales, (r) => r.split.restaurante), BARTENDER: sum(cur.sales, (r) => r.split.bar) };
  const areaCost = (area) => sum(cur.exp.filter((r) => r.kind === "COSTO" && r.area === area), (r) => r.amount);
  const gastronomy = ["RESTAURANTE", "BARTENDER"].map((area) => { const sales = areaSales[area]; const cost = areaCost(area); return { area, name: area === "RESTAURANTE" ? "Restaurante" : "Bar", sales, cost, margin: sales > 0 ? Math.round(((sales - cost) / sales) * 100) : null }; });
  const todayOrders = orders.filter((o) => clock.date(o.createdAt) === today && upper(o.status) !== "CANCELADO");
  const orderStates = STATUS_BUCKETS.map(([label, list]) => ({ label, count: todayOrders.filter((o) => list.includes(upper(o.status))).length }));
  const activeOrders = orders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(upper(o.status)));
  const lateOrders = activeOrders.filter((o) => ["LATE", "ABANDONED"].includes(orderTiming({ ...o }, at).operationalBucket)).length;

  // --- pendientes de decisión ---
  const openRequests = (state.requests || []).filter((r) => !OPEN_REQUEST_CLOSED.has(upper(r.status)));
  const pending = [
    { key: "cash", label: "Cierres de caja", detail: "Esperan tu revisión", count: (state.cashSessions || []).filter((s) => upper(s.status) === "EN_REVISION").length, tone: "amber", go: ["dinero", "cajas"] },
    { key: "verify", label: "Pagos por verificar", detail: toVerify.count ? `Yape o Plin · S/ ${toVerify.amount.toFixed(2)}` : "Yape o Plin", count: toVerify.count, tone: "red", go: ["dinero", "pagos"] },
    { key: "orders", label: "Pedidos fuera de tiempo", detail: "Restaurante y Bar", count: lateOrders, tone: "red", go: ["restaurante", "pedidos"] },
    { key: "stock", label: "Stock bajo", detail: "Insumos bajo el mínimo", count: (context.lowStock || []).length, tone: "amber", go: ["insumos", "existencias"] },
    { key: "maintenance", label: "Mantenimiento sin técnico", detail: "Incidencias sin responsable", count: openRequests.filter((r) => r.requiresMaintenance && !r.assignedMaintenanceEmployeeId).length, tone: "blue", go: ["operaciones", "mantenimiento"] },
    { key: "cleaning", label: "Limpieza sin responsable", detail: "Tareas por asignar", count: (state.tasks || []).filter((t) => upper(t.status) !== "FINALIZADA" && !t.assignedEmployeeId).length, tone: "blue", go: ["operaciones", "limpieza"] },
    { key: "expenses", label: "Gastos sin servicio", detail: unassigned.expenses ? `S/ ${unassigned.expenses.toFixed(2)} sin asignar` : "Asigna cada gasto a un servicio", count: cur.exp.filter((r) => r.kind === "CAJA" && r.service === "SIN_ASIGNAR").length, tone: "amber", go: ["dinero", "gastos"] }
  ].filter((item) => item.count > 0);

  // --- cambios recientes (auditoría) ---
  const userName = (id) => { const u = (state.users || []).find((item) => Number(item.id) === Number(id)); return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : id ? `Usuario ${id}` : "Sistema"; };
  const recent = [...(state.audit || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8)
    .map((a) => ({ id: a.id, at: a.createdAt, user: userName(a.userId), module: a.module, action: a.action, detail: a.detail || "", changes: Array.isArray(a.changes) ? a.changes : [] }));

  return {
    generatedAt: at.toISOString(), timezone: state?.settings?.timezone || "America/Lima", today, range,
    kpis: {
      sales: { value: salesTotal, previous: salesPrev, change: change(salesTotal, salesPrev) },
      expenses: { value: expTotal, previous: expPrev, change: change(expTotal, expPrev) },
      profit: { value: round(salesTotal - expTotal), previous: round(salesPrev - expPrev), change: change(salesTotal - expTotal, salesPrev - expPrev), margin: salesTotal > 0 ? Math.round(((salesTotal - expTotal) / salesTotal) * 1000) / 10 : null },
      inside: { value: Object.values(inside).reduce((a, b) => a + b, 0), capacity: Object.values(capacity).reduce((a, b) => a + (b || 0), 0) || null },
      receivable: { value: sum(receivableRows, (r) => r.amount), count: receivableRows.length }
    },
    series, services, unassigned, hourly, peakHour: peak.count ? peak : null, origin: originRows,
    rooms: roomList, occupancy, payments: { methods, channels, toVerify }, gastronomy, orderStates, pending, recent,
    dataQuality: { unclassifiedSales: unassigned.sales, unassignedExpenses: unassigned.expenses },
    notes: [
      "Personas dentro en Piscina, Mirador y Terraza es una estimación: el sistema registra el ingreso, no la salida.",
      "Gastos = egresos de caja + costo de recetas de los pedidos + planilla de los días validados (Recepción, Limpieza y Mantenimiento a Hospedaje; Piscina a Piscina; Restaurante y Bar a gastos generales). Aún no incluye compras a crédito.",
      "El consumo de Restaurante y Bar se suma al servicio por el que llegó el cliente."
    ]
  };
}
