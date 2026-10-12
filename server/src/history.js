/* Historial (Fase 1 de escalabilidad, ver ESCALABILIDAD_AUDITORIA_2026-09-28.md).
   El estado operativo (app_state, en memoria) guarda solo lo vivo; lo cerrado y antiguo pasa a la tabla
   history_records. Así el estado deja de crecer con los meses: cada escritura y cada pantalla del día a día
   trabaja sobre un tamaño acotado por la capacidad del hotel, no por su historia.

   Reglas (ante la duda, se queda en el estado):
   - Solo se archiva lo CERRADO (reserva terminada o cancelada, pedido entregado, solicitud resuelta…), cuya
     última fecha es anterior a AYER (hora del hotel) y que no tiene saldo por cobrar.
   - Lo que cuelga de algo vivo sigue vivo: los pagos, pases, derechos de acceso y pedidos de una reserva
     activa se quedan con ella.
   - Los reportes que miran el pasado piden el rango que usan (readStateWithHistory); lo vivo más lo
     archivado de ese rango llega con la misma forma de siempre, así los armadores no cambian. */
import { db, readState, mutateState } from "./db.js";

export const KEEP_DAYS = 2; // hoy y ayer siempre quedan en el estado (comparativos "vs. ayer", cierre del día)

const up = (value) => String(value || "").toUpperCase();
const DEBT = (item) => Number(item?.balance || 0) > 0.001;
const CLOSED = {
  bookings: (x) => ["CANCELADA", "CANCELADO", "FINALIZADA", "NO_SHOW"].includes(up(x.status)) && !DEBT(x),
  reservations: (x) => ["CANCELADA", "COMPLETADA", "NO_SHOW", "FINALIZADA"].includes(up(x.status)) && !DEBT(x),
  stays: (x) => up(x.status) === "FINALIZADA",
  events: (x) => ["CANCELADO", "FINALIZADO"].includes(up(x.status)) && !DEBT(x),
  orders: (x) => ["ENTREGADO", "CANCELADO"].includes(up(x.status)),
  requests: (x) => ["RESUELTO", "SOLUCIONADO", "CERRADO", "CANCELADO", "FINALIZADA", "FINALIZADO"].includes(up(x.status)),
  tasks: (x) => ["FINALIZADA", "CANCELADA"].includes(up(x.status)),
  poolEntries: (x) => up(x.status) === "FINALIZADO",
  payments: (x) => !/PENDIENTE|REVISION|VERIFICACION/.test(up(x.status)),
  entitlements: () => true,
  passes: () => true,
  accessLogs: () => true,
  inventoryMovements: () => true, // copia del kardex; el inventario real vive en las tablas inventory_*
  // Comprobantes electrónicos con respuesta final de SUNAT (los pendientes de reenvío se quedan). La numeración
  // vive en state.billingCounters, así que archivarlos no repite números.
  facturacion: (x) => ["ACEPTADO", "ANULADO", "RECHAZADO"].includes(up(x.status))
};
// Colecciones archivables y de qué dependen (clave del ítem → colecciones donde puede estar el "padre").
export const HISTORY_COLLECTIONS = Object.keys(CLOSED);
const PARENTS = {
  bookingId: ["bookings", "reservations"],
  reservationId: ["reservations", "bookings"],
  eventId: ["events"],
  stayId: ["stays"],
  orderId: ["orders"],
  paymentId: ["payments"]
};
// Orden: primero lo que puede ser padre, después lo que depende.
const ORDER = ["reservations", "stays", "bookings", "events", "orders", "requests", "tasks", "poolEntries", "payments", "facturacion", "entitlements", "passes", "accessLogs", "inventoryMovements"];

const DATE_KEY = /(^date$|Date$|At$|^checkIn$|^checkOut$|^startsAt$|^endsAt$|^day$)/;
// Marcas técnicas que el sistema pone con la hora actual (la reparación de pedidos al arrancar, cierres
// automáticos): no son fechas del negocio y harían parecer "de hoy" algo antiguo.
const TECHNICAL_KEY = /^(repairedAt|closedAutomaticallyAt|migratedAt|syncedAt|archivedAt)$/;
const isDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);
/* Primera y última fecha que aparecen en el registro (creación, llegada, salida, pago, cierre…). */
export function lifeSpan(item) {
  let from = null, to = null;
  for (const [key, value] of Object.entries(item || {})) {
    if (!DATE_KEY.test(key) || TECHNICAL_KEY.test(key) || !isDay(value)) continue;
    const day = value.slice(0, 10);
    if (!from || day < from) from = day;
    if (!to || day > to) to = day;
  }
  return { from, to };
}
export function hotelDay(state, offsetDays = 0) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: state?.settings?.timezone || "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + offsetDays * 86400000)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const numericId = (item) => /^\d{1,15}$/.test(String(item?.id ?? ""));

/* Plan de archivo: qué ids de cada colección están cerrados, son antiguos y no cuelgan de nada vivo.
   Los vínculos van en ambos sentidos (una estadía activa mantiene viva su reserva; un derecho de acceso
   vivo mantiene vivo su pase), así que se recalcula hasta que el plan no cambia. */
export function coldPlan(state) {
  const cutoff = hotelDay(state, -(KEEP_DAYS - 1)); // "ayer": se archiva lo que terminó antes de este día
  const forced = {}; // ids que deben quedarse aunque cumplan las reglas
  for (let round = 0; round < 6; round++) {
    const plan = {}, hot = {};
    for (const collection of ORDER) {
      const cold = new Set(), keep = new Set();
      for (const item of state[collection] || []) {
        const id = Number(item.id), span = lifeSpan(item);
        const parentsCold = Object.entries(PARENTS).every(([key, collections]) => item[key] == null || collections.every((c) => !hot[c]?.has(Number(item[key]))));
        const isCold = numericId(item) && !forced[collection]?.has(id) && span.to && span.to < cutoff && CLOSED[collection](item) && parentsCold;
        (isCold ? cold : keep).add(id);
      }
      hot[collection] = keep;
      if (cold.size) plan[collection] = cold;
    }
    let changed = false;
    const force = (collection, id) => { if (id == null || !plan[collection]?.has(Number(id))) return; (forced[collection] ||= new Set()).add(Number(id)); changed = true; };
    for (const stay of state.stays || []) if (hot.stays.has(Number(stay.id))) force("reservations", stay.reservationId);
    for (const entitlement of state.entitlements || []) if (hot.entitlements.has(Number(entitlement.id))) force("passes", entitlement.passId);
    if (!changed) return plan;
  }
  return {}; // no convergió: no se archiva nada (ante la duda, todo se queda)
}
const planSize = (plan) => Object.values(plan).reduce((total, ids) => total + ids.size, 0);

/* El cliente de un registro: el suyo, o el de la reserva/evento del que cuelga (para buscar por cliente). */
function clientOf(state, item) {
  if (item.clientId != null && Number.isFinite(Number(item.clientId))) return Number(item.clientId);
  for (const [key, collections] of Object.entries(PARENTS)) {
    if (item[key] == null) continue;
    for (const collection of collections) {
      const parent = (state[collection] || []).find((row) => Number(row.id) === Number(item[key]));
      if (parent?.clientId != null && Number.isFinite(Number(parent.clientId))) return Number(parent.clientId);
    }
  }
  return null;
}

/* Mueve lo frío del estado a history_records, dentro de la transacción de mutateState. */
async function archiveInto(state, client) {
  const plan = coldPlan(state);
  if (!planSize(plan)) return { archived: 0 };
  const rows = [];
  for (const [collection, ids] of Object.entries(plan)) {
    for (const item of state[collection]) {
      if (!ids.has(Number(item.id))) continue;
      const span = lifeSpan(item);
      rows.push({ collection, id: Number(item.id), date_from: span.from, date_to: span.to, client_id: clientOf(state, item), code: item.code || null, data: item });
    }
  }
  await client.query(`INSERT INTO history_records (collection, id, date_from, date_to, client_id, code, data)
    SELECT r.collection, r.id, r.date_from, r.date_to, r.client_id, r.code, r.data
    FROM jsonb_to_recordset($1::jsonb) AS r(collection TEXT, id BIGINT, date_from DATE, date_to DATE, client_id BIGINT, code TEXT, data JSONB)
    ON CONFLICT (collection, id) DO UPDATE SET date_from = EXCLUDED.date_from, date_to = EXCLUDED.date_to, client_id = EXCLUDED.client_id, code = EXCLUDED.code, data = EXCLUDED.data, archived_at = NOW()`, [JSON.stringify(rows)]);
  for (const [collection, ids] of Object.entries(plan)) state[collection] = state[collection].filter((item) => !ids.has(Number(item.id)));
  return { archived: rows.length, byCollection: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.size])) };
}

/* Lo llama el vigilante de cada minuto (y el arranque): solo escribe si hay algo que archivar. */
export async function archiveColdHistory() {
  if (!planSize(coldPlan(await readState()))) return { archived: 0 };
  return mutateState((state, client) => archiveInto(state, client));
}

/* Devuelve al estado registros archivados que una escritura necesita tocar (p. ej. facturar un pago
   antiguo o registrar un cobro en una reserva cerrada). Se usa dentro del mutador de mutateState. */
export async function restoreFromHistory(state, client, wanted) {
  const pairs = wanted.filter(([collection, id]) => HISTORY_COLLECTIONS.includes(collection) && Number.isFinite(Number(id)) && !(state[collection] || []).some((item) => Number(item.id) === Number(id)));
  if (!pairs.length) return 0;
  const { rows } = await client.query(`DELETE FROM history_records h USING jsonb_to_recordset($1::jsonb) AS w(collection TEXT, id BIGINT)
    WHERE h.collection = w.collection AND h.id = w.id RETURNING h.collection, h.data`, [JSON.stringify(pairs.map(([collection, id]) => ({ collection, id: Number(id) })))]);
  for (const row of rows) (state[row.collection] ||= []).push(row.data);
  return rows.length;
}

/* ---------- Lectura con historia ----------
   scope: { from, to } (días "YYYY-MM-DD"; sin `to` = hasta hoy y lo futuro) · { clientId } · { all: true }
   Devuelve el estado de siempre con las colecciones archivadas completadas con lo que toca ese alcance.
   Se guarda 30 s por versión del estado (los reportes del dueño se piden seguido). */
const cache = new Map();
const deepFreeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.keys(value)) deepFreeze(value[key]); } return value; };
export async function readStateWithHistory(scope = {}) {
  const state = await readState();
  const key = JSON.stringify(scope);
  const hit = cache.get(key);
  if (hit && hit.state === state && Date.now() - hit.at < 30000) return hit.merged;
  let rows;
  if (scope.all) rows = (await db.query("SELECT collection, data FROM history_records ORDER BY collection, id")).rows;
  else if (scope.clientId != null) rows = (await db.query("SELECT collection, data FROM history_records WHERE client_id = $1 ORDER BY collection, id", [Number(scope.clientId)])).rows;
  else {
    const from = isDay(scope.from) ? scope.from.slice(0, 10) : "0001-01-01", to = isDay(scope.to) ? scope.to.slice(0, 10) : "9999-12-31";
    rows = (await db.query("SELECT collection, data FROM history_records WHERE date_to >= $1 AND date_from <= $2 ORDER BY collection, id", [from, to])).rows;
  }
  const merged = mergeHistory(state, rows);
  cache.set(key, { state, at: Date.now(), merged });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return merged;
}
/* Un registro archivado buscado por su id (detalle de una reserva antigua): trae además todo lo de su cliente. */
export async function readStateWithItem(collection, id) {
  const state = await readState();
  if ((state[collection] || []).some((item) => Number(item.id) === Number(id))) return state;
  const { rows } = await db.query("SELECT client_id, data FROM history_records WHERE collection = $1 AND id = $2", [collection, Number(id)]);
  if (!rows.length) return state;
  return rows[0].client_id != null ? readStateWithHistory({ clientId: rows[0].client_id }) : mergeHistory(state, [{ collection, data: rows[0].data }]);
}
function mergeHistory(state, rows) {
  if (!rows.length) return state;
  const extra = {};
  for (const row of rows) (extra[row.collection] ||= []).push(deepFreeze(row.data));
  const merged = { ...state };
  for (const [collection, archived] of Object.entries(extra)) {
    const live = state[collection] || [];
    const liveIds = new Set(live.map((item) => Number(item.id)));
    // Lo archivado es más antiguo: va primero, como estaba en el arreglo original.
    merged[collection] = [...archived.filter((item) => !liveIds.has(Number(item.id))), ...live];
  }
  return Object.freeze(merged);
}
/* Rango de las listas que antes devolvían toda la historia: ?from=&to=, ?range=N (días) o ?range=todas;
   sin nada, los últimos 90 días. */
export function listWindow(query = {}, state) {
  if (["todas", "all"].includes(String(query.range || "").toLowerCase())) return { all: true };
  const days = Math.trunc(Number(query.range));
  const from = isDay(query.from) ? String(query.from).slice(0, 10) : days > 0 ? hotelDay(state, -(Math.min(days, 3660) - 1)) : hotelDay(state, -89);
  const to = isDay(query.to) ? String(query.to).slice(0, 10) : undefined;
  return { from, to };
}

/* Devuelve una reserva/evento archivado junto con lo que cuelga de él (pagos, pases, derechos de acceso),
   para que una acción del panel (cobrar, confirmar, reprogramar, cancelar) trabaje sobre el cuadro completo.
   Si la acción no la reabre, el vigilante la vuelve a archivar después. */
const LINK_KEYS = { bookings: ["bookingId", "reservationId"], reservations: ["reservationId", "bookingId"], events: ["eventId"], orders: ["orderId"], stays: ["stayId"] };
export async function restoreWithDependents(state, client, collection, id) {
  if (!collection || (state[collection] || []).some((item) => Number(item.id) === Number(id))) return 0;
  const head = await client.query("SELECT client_id FROM history_records WHERE collection = $1 AND id = $2", [collection, Number(id)]);
  if (!head.rows.length) return 0;
  const keys = LINK_KEYS[collection] || [];
  const deps = keys.length ? (await client.query(`SELECT collection, id FROM history_records WHERE client_id IS NOT DISTINCT FROM $1 AND collection <> $2 AND (${keys.map((key) => `data->>'${key}' = $3`).join(" OR ")})`, [head.rows[0].client_id, collection, String(Number(id))])).rows : [];
  return restoreFromHistory(state, client, [[collection, id], ...deps.map((row) => [row.collection, row.id])]);
}
