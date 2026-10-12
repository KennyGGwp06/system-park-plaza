// Prueba del cálculo de Reservas > Terraza. No necesita base de datos: node scripts/terraza-reservations-test.js
import assert from "node:assert/strict";
import { buildTerrazaOverview } from "../src/terraza-reservations.js";

const NOW = new Date("2026-09-22T01:30:00Z"); // 20:30 en Lima (21 sep.) -> franja en curso 20:00

const state = {
  settings: { timezone: "America/Lima" },
  services: [{ id: 5, code: "TERRAZA", name: "Terraza", capacity: 48 }],
  clients: [
    { id: 1, firstName: "María", lastName: "Torres", documentNumber: "40000000" },
    { id: 2, firstName: "Pedro", lastName: "Salazar", documentNumber: "40823866" },
    { id: 3, firstName: "Grupo Amayo", lastName: "SAC", documentNumber: "20481239077" }
  ],
  bookings: [
    // hoy, 20:00, por confirmar (única que requiere atención)
    { id: 600, serviceCode: "TERRAZA", code: "TER-600", clientId: 1, date: "2026-09-21", slot: "20:00", people: 4, total: 0, paid: 0, balance: 0, status: "RESERVADA", preferences: { tableZone: "Zona fresca" }, preorderItems: [], createdAt: "2026-09-19T10:00:00Z" },
    // hoy, 18:00, confirmada, con 2 pedidos anticipados
    { id: 601, serviceCode: "TERRAZA", code: "TER-601", clientId: 2, date: "2026-09-21", slot: "18:00", people: 6, total: 0, paid: 0, balance: 0, status: "CONFIRMADA", preferences: { tableZone: "Cerca al bar" }, preorderItems: [{ id: 1 }, { id: 2 }], createdAt: "2026-09-18T10:00:00Z" },
    // hoy, 20:00, confirmada (comparte franja con TER-600: 7 personas en la franja 20:00)
    { id: 602, serviceCode: "TERRAZA", code: "TER-602", clientId: 3, date: "2026-09-21", slot: "20:00", people: 3, total: 0, paid: 0, balance: 0, status: "CONFIRMADA", preferences: { tableZone: "Mesa tranquila" }, preorderItems: [], createdAt: "2026-09-17T10:00:00Z" },
    // pasada y completada
    { id: 603, serviceCode: "TERRAZA", code: "TER-603", clientId: 1, date: "2026-09-18", slot: "12:00", people: 2, total: 0, paid: 0, balance: 0, status: "FINALIZADA", preferences: { tableZone: "Zona fresca" }, preorderItems: [], createdAt: "2026-09-10T10:00:00Z" },
    // cancelada -> no debe contar en ningún total activo
    { id: 604, serviceCode: "TERRAZA", code: "TER-604", clientId: 2, date: "2026-09-16", slot: "15:00", people: 3, total: 0, paid: 0, balance: 0, status: "CANCELADA", preferences: { tableZone: "Cerca al jardín" }, preorderItems: [], createdAt: "2026-09-08T10:00:00Z" },
    // mañana, confirmada
    { id: 605, serviceCode: "TERRAZA", code: "TER-605", clientId: 3, date: "2026-09-22", slot: "21:30", people: 5, total: 0, paid: 0, balance: 0, status: "CONFIRMADA", preferences: { tableZone: "Zona fresca" }, preorderItems: [], createdAt: "2026-09-20T10:00:00Z" },
    // hoy, 18:00, zona con un valor que no está en la lista real -> debe caer en "Otra", no perderse
    { id: 606, serviceCode: "TERRAZA", code: "TER-606", clientId: 1, date: "2026-09-21", slot: "18:00", people: 2, total: 0, paid: 0, balance: 0, status: "CONFIRMADA", preferences: { tableZone: "Piscina secreta" }, preorderItems: [], createdAt: "2026-09-19T10:00:00Z" }
  ],
  entitlements: [
    // usado hace 1h (dentro de la ventana de 180 min) -> cuenta como "dentro ahora"
    { id: 1, serviceCode: "TERRAZA", bookingId: 601, status: "UTILIZADO", people: 6, date: "2026-09-21", usedAt: "2026-09-22T00:30:00Z" }
  ]
};

const result = buildTerrazaOverview(state, {}, NOW);
assert.equal(result.today, "2026-09-21");

// KPIs de hoy: 4 reservas activas (600, 601, 602, 606), 15 comensales.
assert.equal(result.kpis.reservasHoy, 4);
assert.equal(result.kpis.comensalesEsperadosHoy, 15);
assert.equal(result.kpis.pedidosAnticipados, 1, "solo TER-601 tiene pedidos anticipados");
assert.equal(result.kpis.porConfirmar, 1, "solo TER-600 está por confirmar");

// Aforo ahora: entitlement de TER-601 (6, usado hace 1h) = 6 de 48 (capacidad real).
assert.equal(result.aforo.inside, 6);
assert.equal(result.aforo.capacity, 48);
assert.equal(result.aforo.percent, 13);
assert.equal(result.aforo.slot, "20:00", "20:30 en Lima cae en la franja 20:00-21:30");

// Ocupación por franja: 20:00 junta TER-600 (4) + TER-602 (3) = 7; 18:00 junta TER-601 (6) + TER-606 (2) = 8.
const bySlot = Object.fromEntries(result.slots.map((row) => [row.slot, row]));
assert.equal(bySlot["20:00"].used, 7);
assert.equal(bySlot["20:00"].isNow, true);
assert.equal(bySlot["18:00"].used, 8);
assert.equal(bySlot["12:00"].used, 0, "TER-603 es de otro día");

// Reservas por zona: usa los nombres REALES de TerraceExperience.jsx, no los inventados del panel viejo;
// un valor desconocido (TER-606, "Piscina secreta") cae en "Otra" en vez de perderse.
const zonas = Object.fromEntries(result.zonas.map((row) => [row.zone, row.count]));
assert.equal(zonas["Zona fresca"], 3, "TER-600, TER-603 y TER-605 (la cancelada TER-604 no cuenta)");
assert.equal(zonas["Cerca al bar"], 1);
assert.equal(zonas["Mesa tranquila"], 1);
assert.equal(zonas["Otra"], 1, "TER-606 con una zona que no existe en la lista real");
assert.equal(zonas["Cerca al jardín"], undefined, "solo la tenía TER-604, que está cancelada");

// Próximos 7 días: hoy trae 4, mañana trae 1 (TER-605).
const proximos = Object.fromEntries(result.proximos7Dias.map((row) => [row.date, row.count]));
assert.equal(proximos["2026-09-21"], 4);
assert.equal(proximos["2026-09-22"], 1);

// Contadores de la agenda.
assert.equal(result.counts.total, 7);
assert.equal(result.counts.porConfirmar, 1);
assert.equal(result.counts.confirmadas, 5, "601, 602, 603, 605 y 606");
assert.equal(result.counts.canceladas, 1);

// Filtros de la tabla.
const porConfirmar = buildTerrazaOverview(state, { filter: "por_confirmar" }, NOW);
assert.equal(porConfirmar.list.total, 1);
assert.equal(porConfirmar.list.rows[0].code, "TER-600");
const cancelled = buildTerrazaOverview(state, { filter: "canceladas" }, NOW);
assert.equal(cancelled.list.total, 1);
assert.equal(cancelled.list.rows[0].code, "TER-604");

console.log("terraza-reservations: todas las pruebas pasaron");
