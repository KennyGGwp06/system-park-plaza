// Módulo Clientes del Superadmin: Directorio (tablero + tabla) y Perfil 360° (libro de consumo, visitas, segmento).
// Función pura: recibe el estado y devuelve todo ya calculado. Reutiliza el reparto servicio/Restaurante/Bar de revenue-split.js.
// Todas las fechas se calculan en la zona horaria del hotel (America/Lima), nunca en UTC.
import { HOME_SERVICES, addDays, makeClock } from "./owner-home.js";
import { createRevenueSplitter } from "./revenue-split.js";

const SERVICE_CODES = HOME_SERVICES.map((item) => item.code);
const SERVICE_NAME = Object.fromEntries(HOME_SERVICES.map((item) => [item.code, item.name]));
const APPROVED = new Set(["APROBADO", "PAGADO", "CONFIRMADO"]);
const CANCELLED = new Set(["CANCELADA", "CANCELADO"]);
const ACCESS_SERVICE_CODES = new Set(["PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"]);
const INSIDE_MINUTES = { PISCINA: 180, MIRADOR: 120, TERRAZA: 180 };
const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Umbrales de segmento. No hay una regla única de negocio para "VIP" o "inactivo"; estos valores son un punto
// de partida razonable y quedan documentados para que el dueño los ajuste (ver SUPERADMIN_CLIENTES.md, sección 5).
export const SEGMENT_RULES = { vipSpend: 3000, vipVisits: 8, recurrentVisits: 3, inactiveDays: 90, newDays: 30 };

const n = (value) => Number(value) || 0;
const round = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const upper = (value) => String(value || "").toUpperCase();
const sum = (rows, pick) => round(rows.reduce((total, row) => total + n(pick(row)), 0));
const fullName = (client) => [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Cliente sin nombre";
const isGoogle = (client) => upper(client.documentType) === "GOOGLE" || upper(client.documentNumber || "").startsWith("GOOGLE-");
const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const dayOfWeek = (dateKey) => new Date(`${dateKey}T12:00:00Z`).getUTCDay();

/** Resuelve el cliente de un registro de acceso: usa `clientId` si ya se guardó (registros nuevos) o lo
 * busca por el pase (registros antiguos, antes de que `access/validate` empezara a guardar `clientId`). */
export function resolveAccessClientId(state, log) {
  if (log.clientId !== undefined && log.clientId !== null) return Number(log.clientId);
  const pass = (state.passes || []).find((item) => item.id === log.passId);
  return pass ? Number(pass.clientId) : null;
}

/** Cada ingreso real de un cliente: estadías (Hospedaje), QR validados (Piscina/Mirador/Terraza/Eventos)
 * e ingresos manuales de piscina. Es la fuente única de "visitas", corrige el error de la ficha anterior
 * (que solo contaba estadías y dejaba a quien viene solo a Piscina/Mirador/Terraza en 0 visitas). */
function buildAccessEvents(state, clock) {
  const events = [];
  for (const stay of state.stays || []) {
    if (!stay.clientId || !stay.checkInAt) continue;
    events.push({ clientId: Number(stay.clientId), serviceCode: "HOSPEDAJE", at: stay.checkInAt, date: clock.date(stay.checkInAt) });
  }
  for (const log of state.accessLogs || []) {
    const clientId = resolveAccessClientId(state, log);
    const code = upper(log.serviceCode);
    if (!clientId || !ACCESS_SERVICE_CODES.has(code)) continue;
    const at = log.validatedAt || log.createdAt;
    events.push({ clientId, serviceCode: code, at, date: clock.date(at) });
  }
  for (const entry of state.poolEntries || []) {
    if (!entry.clientId || !entry.enteredAt) continue;
    events.push({ clientId: Number(entry.clientId), serviceCode: "PISCINA", at: entry.enteredAt, date: clock.date(entry.enteredAt) });
  }
  return events.filter((item) => item.date);
}

function computeSegment({ spend, visits, lastVisitDate, createdAt, today }, rules = SEGMENT_RULES) {
  const daysSinceLast = lastVisitDate ? Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${lastVisitDate}T12:00:00Z`)) / 86400000) : null;
  if (daysSinceLast !== null && daysSinceLast > rules.inactiveDays) return "INACTIVO";
  if (spend >= rules.vipSpend || visits >= rules.vipVisits) return "VIP";
  if (visits >= rules.recurrentVisits) return "RECURRENTE";
  const daysSinceCreated = createdAt ? Math.round((new Date(`${today}T12:00:00Z`) - new Date(createdAt)) / 86400000) : null;
  if (daysSinceCreated !== null && daysSinceCreated <= rules.newDays) return "NUEVO";
  return "OCASIONAL";
}
export const SEGMENT_LABEL = { NUEVO: "Nuevo", OCASIONAL: "Ocasional", RECURRENTE: "Recurrente", VIP: "VIP", INACTIVO: "Inactivo" };

/** Un item "ligado" del cliente (reserva de hospedaje, de servicio, o evento) con su forma normalizada. */
function clientBookableItems(state, clientId) {
  const items = [];
  const seen = new Set();
  for (const item of [...(state.reservations || []), ...(state.bookings || [])]) {
    if (Number(item.clientId) !== clientId) continue;
    const key = `b${item.id}`; if (seen.has(key)) continue; seen.add(key);
    items.push({ kind: "booking", id: item.id, code: item.code, serviceCode: upper(item.serviceCode || "HOSPEDAJE"), date: String(item.checkInDate || item.date || item.createdAt || "").slice(0, 10), balance: n(item.balance), status: upper(item.status), createdAt: item.createdAt });
  }
  for (const event of state.events || []) {
    if (Number(event.clientId) !== clientId) continue;
    items.push({ kind: "event", id: event.id, code: event.code, serviceCode: "EVENTOS", date: String(event.startsAt || event.createdAt || "").slice(0, 10), balance: n(event.balance), status: upper(event.status), createdAt: event.createdAt });
  }
  return items;
}

function buildLedger(state, clientId, revenue, paymentsByOwner) {
  const items = clientBookableItems(state, clientId);
  const rows = [];
  for (const item of items) {
    const key = item.kind === "event" ? `event-${item.id}` : `booking-${item.id}`;
    const payments = paymentsByOwner.get(key) || [];
    if (!payments.length) continue;
    const splits = payments.map((payment) => revenue.splitPayment(payment));
    const servicio = sum(splits, (s) => s.servicio), restaurante = sum(splits, (s) => s.restaurante), bar = sum(splits, (s) => s.bar);
    rows.push({ id: `${item.kind}-${item.id}`, date: item.date, code: item.code, serviceCode: item.serviceCode, serviceName: SERVICE_NAME[item.serviceCode] || item.serviceCode, servicio, restaurante, bar, total: round(servicio + restaurante + bar), balance: item.balance > 0 && !CANCELLED.has(item.status) ? item.balance : 0, status: item.balance > 0 && !CANCELLED.has(item.status) ? "SALDO" : "PAGADO" });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Índice de pagos aprobados de un cliente, agrupados por la reserva o evento que pagan (para el libro de consumo). */
function ownerKeyOfPayment(payment) {
  if (payment.eventId) return `event-${payment.eventId}`;
  const bookingId = payment.bookingId || payment.reservationId;
  if (bookingId) return `booking-${bookingId}`;
  return null;
}

function clientPayments(state, clientId) {
  return (state.payments || []).filter((item) => Number(item.clientId) === clientId && APPROVED.has(upper(item.status || "APROBADO")));
}

function passesOfClient(state, clientId) {
  return (state.passes || []).filter((pass) => Number(pass.clientId) === clientId).map((pass) => {
    const entitlements = (state.entitlements || []).filter((item) => item.passId === pass.id);
    return { code: pass.code, status: pass.status, entitlements: entitlements.map((item) => ({ serviceCode: upper(item.serviceCode), status: item.status, date: item.date, slot: item.slot, usedAt: item.usedAt })) };
  });
}

function findDuplicates(state, client) {
  const phone = normalizePhone(client.phone);
  const email = normalizeEmail(client.email);
  return (state.clients || []).filter((other) => {
    if (Number(other.id) === Number(client.id) || upper(other.status) === "FUSIONADO") return false;
    if (phone && normalizePhone(other.phone) === phone) return true;
    if (email && normalizeEmail(other.email) === email) return true;
    return false;
  }).map((other) => ({ id: other.id, name: fullName(other), documentNumber: other.documentNumber, reason: phone && normalizePhone(other.phone) === phone ? "Mismo teléfono" : "Mismo correo" }));
}

function buildTimeline(state, clientId, revenue) {
  const rows = [];
  for (const item of clientBookableItems(state, clientId)) {
    rows.push({ category: "RESERVAS", at: item.createdAt || item.date, title: `Reserva de ${SERVICE_NAME[item.serviceCode] || item.serviceCode}`, detail: item.code || "", amount: null });
  }
  for (const payment of clientPayments(state, clientId)) {
    rows.push({ category: "PAGOS", at: payment.createdAt || payment.paidAt, title: "Pago confirmado", detail: upper(payment.method), amount: n(payment.amount) });
  }
  for (const order of state.orders || []) {
    if (Number(order.clientId) !== clientId || upper(order.status) === "CANCELADO") continue;
    rows.push({ category: "CONSUMOS", at: order.createdAt, title: `Consumo en ${order.area === "RESTAURANTE" ? "Restaurante" : "Bar"}`, detail: order.code || "", amount: n(order.total) });
  }
  for (const log of state.accessLogs || []) {
    if (resolveAccessClientId(state, log) !== clientId) continue;
    rows.push({ category: "ACCESOS", at: log.validatedAt || log.createdAt, title: `Acceso validado · ${SERVICE_NAME[upper(log.serviceCode)] || log.serviceCode}`, detail: `${n(log.people)} persona(s)`, amount: null });
  }
  for (const request of state.requests || []) {
    if (Number(request.clientId) !== clientId) continue;
    rows.push({ category: "INCIDENCIAS", at: request.createdAt, title: request.description || "Incidencia reportada", detail: upper(request.status), amount: null });
  }
  return rows.filter((row) => row.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Estadísticas de un cliente, compartidas por la lista y el perfil. */
function computeClientStats(state, client, { clock, today, revenue, accessByClient, paymentsByOwner, insideSet }) {
  const clientId = Number(client.id);
  const access = accessByClient.get(clientId) || [];
  const payments = clientPayments(state, clientId);
  const ledger = buildLedger(state, clientId, revenue, paymentsByOwner);
  const spend = sum(payments, (p) => p.amount);
  const balance = sum(ledger, (row) => row.balance);
  const visits = access.length;
  const lastVisitDate = access.reduce((max, item) => (!max || item.date > max ? item.date : max), null);
  const servicesUsed = [...new Set(access.map((item) => item.serviceCode))];
  const segment = computeSegment({ spend, visits, lastVisitDate, createdAt: client.createdAt, today });
  return { clientId, spend, balance, visits, lastVisitDate, servicesUsed, segment, insideNow: insideSet.has(clientId), avgTicket: visits ? round(spend / visits) : 0, access, ledger };
}

/** Un índice { "booking-<id>" | "event-<id>" -> pagos aprobados } para no recorrer todos los pagos por cada cliente. */
function indexPaymentsByOwner(state) {
  const map = new Map();
  for (const payment of state.payments || []) {
    if (!APPROVED.has(upper(payment.status || "APROBADO"))) continue;
    const key = ownerKeyOfPayment(payment);
    if (!key) continue;
    map.set(key, [...(map.get(key) || []), payment]);
  }
  return map;
}

function computeInsideSet(state, clock, today, at) {
  const inside = new Set();
  for (const stay of state.stays || []) if (upper(stay.status) === "ACTIVA" && stay.clientId) inside.add(Number(stay.clientId));
  for (const entry of state.poolEntries || []) if (upper(entry.status) === "ACTIVO" && entry.clientId) inside.add(Number(entry.clientId));
  const nowMs = at.getTime();
  for (const pass of state.entitlements || []) {
    const code = upper(pass.serviceCode);
    if (!INSIDE_MINUTES[code] || !pass.usedAt) continue;
    if (clock.date(pass.usedAt) !== today) continue;
    if (nowMs - new Date(pass.usedAt).getTime() > INSIDE_MINUTES[code] * 60000) continue;
    const passRow = (state.passes || []).find((item) => item.id === pass.passId);
    if (passRow?.clientId) inside.add(Number(passRow.clientId));
  }
  for (const event of state.events || []) {
    if (!["CONFIRMADO", "ACTIVO", "EN_CURSO"].includes(upper(event.status)) || upper(event.accessStatus) !== "INGRESO_VALIDADO" || !event.clientId) continue;
    const start = new Date(event.startsAt).getTime(), end = new Date(event.endsAt).getTime();
    if (start <= nowMs && nowMs <= end) inside.add(Number(event.clientId));
  }
  return inside;
}

function baseContext(state, at) {
  const clock = makeClock(state?.settings?.timezone || "America/Lima");
  const today = clock.date(at);
  const revenue = createRevenueSplitter(state, SERVICE_CODES);
  const accessEvents = buildAccessEvents(state, clock);
  const accessByClient = new Map();
  for (const item of accessEvents) accessByClient.set(item.clientId, [...(accessByClient.get(item.clientId) || []), item]);
  const paymentsByOwner = indexPaymentsByOwner(state);
  const insideSet = computeInsideSet(state, clock, today, at);
  return { clock, today, revenue, accessEvents, accessByClient, paymentsByOwner, insideSet };
}

const SEGMENT_FILTERS = {
  DENTRO: (row) => row.insideNow,
  HOY: (row, ctx) => row.lastVisitDate === ctx.today,
  SALDO: (row) => row.balance > 0,
  NUEVO: (row) => row.segment === "NUEVO",
  OCASIONAL: (row) => row.segment === "OCASIONAL",
  RECURRENTE: (row) => row.segment === "RECURRENTE",
  VIP: (row) => row.segment === "VIP",
  INACTIVO: (row) => row.segment === "INACTIVO",
  BLOQUEADO: (row) => row.blocked
};

export function buildClientDirectory(state, query = {}, at = new Date()) {
  const ctx = baseContext(state, at);
  const clients = (state.clients || []).filter((item) => upper(item.status) !== "FUSIONADO");
  const rows = clients.map((client) => {
    const stats = computeClientStats(state, client, ctx);
    return { id: client.id, name: fullName(client), documentType: client.documentType, documentNumber: client.documentNumber, phone: client.phone, email: client.email, createdAt: client.createdAt, blocked: upper(client.status) === "BLOQUEADO", channel: isGoogle(client) ? "APP" : client.email ? "APP" : "RECEPCION", ...stats };
  });

  // --- resumen global (siempre sobre toda la base, no sobre el filtro de la tabla) ---
  const active90 = rows.filter((row) => row.lastVisitDate && row.lastVisitDate >= addDays(ctx.today, -90)).length;
  const recurrentVip = rows.filter((row) => ["RECURRENTE", "VIP"].includes(row.segment)).length;
  const insideNow = rows.filter((row) => row.insideNow).length;
  const withBalance = rows.filter((row) => row.balance > 0);
  const weeks = Array.from({ length: 12 }, (_, i) => { const end = addDays(ctx.today, -((11 - i) * 7)); const start = addDays(end, -6); return { start, end, label: i === 11 ? "Actual" : `${Number(start.slice(8))}/${Number(start.slice(5, 7))}` }; });
  const newBySeries = weeks.map((week) => rows.filter((row) => { const created = String(row.createdAt || "").slice(0, 10); return created >= week.start && created <= week.end; }).length);
  const segments = Object.keys(SEGMENT_LABEL).map((key) => ({ key, label: SEGMENT_LABEL[key], count: rows.filter((row) => row.segment === key).length }));
  const serviceUsage = HOME_SERVICES.map(({ code, name }) => { const users = rows.filter((row) => row.servicesUsed.includes(code)); return { code, name, users: users.length, onlyThis: users.filter((row) => row.servicesUsed.length === 1).length }; });
  const topSpenders = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 5).map((row) => ({ id: row.id, name: row.name, spend: row.spend }));
  const channels = { app: rows.filter((row) => row.channel === "APP").length, recepcion: rows.filter((row) => row.channel === "RECEPCION").length };
  const withPhone = rows.filter((row) => row.phone).length;
  const withEmail = rows.filter((row) => row.email).length;
  const duplicatePairs = new Set();
  for (const client of clients) for (const dup of findDuplicates(state, client)) duplicatePairs.add([client.id, dup.id].sort((a, b) => a - b).join("-"));
  const dataQuality = { complete: rows.filter((row) => row.phone && row.email).length, noPhone: rows.length - withPhone, duplicates: duplicatePairs.size };

  // --- tabla filtrada ---
  const needle = String(query.q || "").trim().toLowerCase();
  const segmentFilter = SEGMENT_FILTERS[upper(query.segment)];
  let filtered = rows.filter((row) => {
    if (needle) { const text = `${row.name} ${row.documentNumber || ""} ${row.phone || ""} ${row.email || ""}`.toLowerCase(); if (!text.includes(needle)) return false; }
    if (segmentFilter && !segmentFilter(row, ctx)) return false;
    return true;
  });
  filtered.sort((a, b) => (b.lastVisitDate || "").localeCompare(a.lastVisitDate || "") || b.spend - a.spend);
  const pageSize = Math.min(Math.max(Math.trunc(n(query.pageSize)) || 20, 1), 100);
  const page = Math.max(Math.trunc(n(query.page)) || 1, 1);
  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
    id: row.id, name: row.name, documentType: row.documentType, documentNumber: row.documentNumber, email: row.email, channel: row.channel,
    servicesUsed: row.servicesUsed, visits: row.visits, lastVisitDate: row.lastVisitDate, spend: row.spend, balance: row.balance,
    segment: row.segment, insideNow: row.insideNow, blocked: row.blocked
  }));

  return {
    today: ctx.today, generatedAt: at.toISOString(),
    overview: {
      totalClients: rows.length, active90, recurrentVip, insideNow,
      withBalance: { count: withBalance.length, amount: sum(withBalance, (r) => r.balance) },
      newBySeries: { labels: weeks.map((w) => w.label), values: newBySeries },
      segments, serviceUsage, topSpenders, channels, dataQuality
    },
    list: { total, page, pageSize, rows: pageRows }
  };
}

export function buildClientProfile(state, clientId, at = new Date()) {
  const client = (state.clients || []).find((item) => Number(item.id) === Number(clientId));
  if (!client) return null;
  const ctx = baseContext(state, at);
  const stats = computeClientStats(state, client, ctx);
  const originBreakdown = HOME_SERVICES.map(({ code, name }) => { const rows = stats.ledger.filter((row) => row.serviceCode === code); return { code, name, servicio: sum(rows, (r) => r.servicio), restaurante: sum(rows, (r) => r.restaurante), bar: sum(rows, (r) => r.bar) }; }).filter((row) => row.servicio + row.restaurante + row.bar > 0);
  const monthly = Array.from({ length: 12 }, (_, i) => { const monthEnd = addDays(ctx.today, 0); const date = new Date(`${ctx.today}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - (11 - i)); const key = date.toISOString().slice(0, 7); const label = date.toLocaleDateString("es-PE", { month: "short", timeZone: "UTC" }).replace(".", ""); const total = sum(stats.ledger.filter((row) => row.date.slice(0, 7) === key), (row) => row.total); return { key, label: label.charAt(0).toUpperCase() + label.slice(1), total }; });
  const visitsByService = HOME_SERVICES.map(({ code, name }) => ({ code, name, count: stats.access.filter((item) => item.serviceCode === code).length }));
  const visitsByDow = DOW_LABELS.map((label, index) => ({ label, count: stats.access.filter((item) => dayOfWeek(item.date) === index).length }));
  const upcoming = clientBookableItems(state, client.id).filter((item) => item.date >= ctx.today && !CANCELLED.has(item.status)).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  return {
    id: client.id, name: fullName(client), documentType: client.documentType, documentNumber: client.documentNumber, phone: client.phone, email: client.email, address: client.address, createdAt: client.createdAt,
    isGoogle: isGoogle(client), blocked: upper(client.status) === "BLOQUEADO", status: client.status,
    today: ctx.today, generatedAt: at.toISOString(),
    kpis: { spend: stats.spend, visits: stats.visits, avgTicket: stats.avgTicket, lastVisitDate: stats.lastVisitDate, balance: stats.balance, servicesUsedCount: stats.servicesUsed.length, servicesTotal: HOME_SERVICES.length },
    segment: stats.segment, insideNow: stats.insideNow,
    originBreakdown, monthly, visitsByService, visitsByDow,
    ledger: stats.ledger.slice(0, 30), passes: passesOfClient(state, client.id), upcoming,
    timeline: buildTimeline(state, client.id, ctx.revenue).slice(0, 40),
    notes: (client.notes || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    duplicates: findDuplicates(state, client)
  };
}

// Colecciones cuyas filas apuntan a un cliente por `clientId` (o, para cochera, dentro de `entries[]`).
const CLIENT_ID_COLLECTIONS = ["reservations", "bookings", "events", "payments", "orders", "accessLogs", "passes", "stays", "requests", "tasks", "poolEntries", "facturacion"];

/** Fusiona `duplicateId` dentro de `primaryId`: todo el historial (reservas, pagos, consumos, accesos, pases,
 * incidencias, comprobantes) pasa a pertenecer al cliente principal. El duplicado no se borra —queda con
 * estado FUSIONADO y una referencia a `primaryId`— para no perder trazabilidad ni comprobantes fiscales. */
export function mergeClients(state, primaryId, duplicateId, actorId) {
  primaryId = Number(primaryId); duplicateId = Number(duplicateId);
  if (primaryId === duplicateId) throw Object.assign(new Error("No puedes fusionar un cliente consigo mismo"), { status: 400 });
  const primary = (state.clients || []).find((item) => Number(item.id) === primaryId);
  const duplicate = (state.clients || []).find((item) => Number(item.id) === duplicateId);
  if (!primary || !duplicate) throw Object.assign(new Error("Cliente no encontrado"), { status: 404 });
  if (upper(duplicate.status) === "FUSIONADO") throw Object.assign(new Error("Ese cliente ya fue fusionado antes"), { status: 409 });
  const moved = {};
  for (const key of CLIENT_ID_COLLECTIONS) {
    let count = 0;
    for (const row of state[key] || []) if (Number(row.clientId) === duplicateId) { row.clientId = primaryId; count += 1; }
    if (count) moved[key] = count;
  }
  for (const space of state.cochera || []) for (const entry of space.entries || []) if (Number(entry.clientId) === duplicateId) { entry.clientId = primaryId; moved.cochera = (moved.cochera || 0) + 1; }
  // Notas y datos de contacto del duplicado no se pierden: se anexan al principal si le faltaban.
  primary.notes = [...(primary.notes || []), ...(duplicate.notes || [])];
  if (!primary.phone && duplicate.phone) primary.phone = duplicate.phone;
  if (!primary.email && duplicate.email) primary.email = duplicate.email;
  duplicate.status = "FUSIONADO";
  duplicate.mergedInto = primaryId;
  duplicate.mergedAt = new Date().toISOString();
  return { primary: { id: primary.id, name: fullName(primary) }, duplicate: { id: duplicate.id, name: fullName(duplicate) }, moved };
}

