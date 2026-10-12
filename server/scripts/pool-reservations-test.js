// Prueba del cálculo de Reservas > Piscina. No necesita base de datos: node scripts/pool-reservations-test.js
import assert from "node:assert/strict";
import { buildPoolOverview } from "../src/pool-reservations.js";

const NOW = new Date("2026-09-21T21:30:00Z"); // 16:30 en Lima -> franja en curso 16:00

const state = {
  settings: { timezone: "America/Lima" },
  services: [{ id: 1, code: "PISCINA", name: "Piscina", capacity: 20 }],
  clients: [
    { id: 1, firstName: "María", lastName: "Torres", documentNumber: "40000000" },
    { id: 2, firstName: "Pedro", lastName: "Salazar", documentNumber: "40823866" },
    { id: 3, firstName: "Grupo Amayo", lastName: "SAC", documentNumber: "20481239077" }
  ],
  bookings: [
    // hoy, 16:00, sin confirmar y con saldo -> requiere atención, cobrar saldo
    { id: 200, serviceCode: "PISCINA", code: "PIS-200", clientId: 2, date: "2026-09-21", slot: "16:00", people: 6, total: 250, paid: 160, balance: 90, status: "RESERVADA", createdAt: "2026-09-18T10:00:00Z" },
    // hoy, 11:00, confirmada y pagada
    { id: 201, serviceCode: "PISCINA", code: "PIS-201", clientId: 1, date: "2026-09-21", slot: "11:00", people: 4, total: 160, paid: 160, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-19T10:00:00Z" },
    // hoy, 16:00, confirmada y pagada -> comparte franja con PIS-200 (14 personas en la franja 16:00)
    { id: 202, serviceCode: "PISCINA", code: "PIS-202", clientId: 3, date: "2026-09-21", slot: "16:00", people: 8, total: 300, paid: 300, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-17T10:00:00Z" },
    // pasada y completada
    { id: 203, serviceCode: "PISCINA", code: "PIS-203", clientId: 1, date: "2026-09-18", slot: "09:00", people: 2, total: 80, paid: 80, balance: 0, status: "FINALIZADA", createdAt: "2026-09-10T10:00:00Z" },
    // cancelada -> no debe contar en ningún total activo
    { id: 204, serviceCode: "PISCINA", code: "PIS-204", clientId: 2, date: "2026-09-16", slot: "20:00", people: 3, total: 180, paid: 180, balance: 0, status: "CANCELADA", createdAt: "2026-09-08T10:00:00Z" },
    // mañana, confirmada pero sin pagar -> también requiere atención
    { id: 205, serviceCode: "PISCINA", code: "PIS-205", clientId: 3, date: "2026-09-22", slot: "09:00", people: 3, total: 100, paid: 0, balance: 100, status: "CONFIRMADA", createdAt: "2026-09-20T10:00:00Z" },
    // otro servicio: no debe aparecer en ningún cálculo de piscina
    { id: 300, serviceCode: "MIRADOR", code: "MIR-300", clientId: 1, date: "2026-09-21", slot: "18:30", people: 2, total: 140, paid: 140, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-19T10:00:00Z" }
  ],
  entitlements: [
    // usado hace 90 min (dentro de la ventana de 180 min) -> cuenta como "dentro ahora"
    { id: 1, serviceCode: "PISCINA", bookingId: 201, status: "UTILIZADO", people: 4, date: "2026-09-21", usedAt: "2026-09-21T20:00:00Z" },
    // pagada, lista para ingresar, aún no validada -> "por validar ingreso"
    { id: 2, serviceCode: "PISCINA", bookingId: 202, status: "LISTO_INGRESO", people: 8, date: "2026-09-21", usedAt: null },
    // sin pagar del todo -> no cuenta como "por validar"
    { id: 3, serviceCode: "PISCINA", bookingId: 200, status: "PENDIENTE", people: 6, date: "2026-09-21", usedAt: null },
    // otro servicio: no debe sumarse al aforo de piscina
    { id: 4, serviceCode: "MIRADOR", bookingId: 300, status: "UTILIZADO", people: 2, date: "2026-09-21", usedAt: "2026-09-21T20:00:00Z" }
  ],
  poolEntries: [
    { id: 1, status: "ACTIVO", people: 5 },
    { id: 2, status: "FINALIZADO", people: 3 }
  ]
};

const result = buildPoolOverview(state, {}, NOW);
assert.equal(result.today, "2026-09-21");

// KPIs de hoy: 3 reservas activas (200, 201, 202), 18 personas esperadas.
assert.equal(result.kpis.reservasHoy, 3);
assert.equal(result.kpis.personasEsperadasHoy, 18);
assert.equal(result.kpis.porValidar, 1, "solo PIS-202 está LISTO_INGRESO hoy");
assert.equal(result.kpis.saldoPendiente.amount, 190, "PIS-200 (90) + PIS-205 (100), la cancelada no cuenta");
assert.equal(result.kpis.saldoPendiente.count, 2);

// Aforo ahora: entitlement de PIS-201 (4, usado hace 90 min) + ingreso manual activo (5) = 9 de 20.
assert.equal(result.aforo.inside, 9);
assert.equal(result.aforo.capacity, 20);
assert.equal(result.aforo.percent, 45);
assert.equal(result.aforo.slot, "16:00", "16:30 en Lima cae en la franja 16:00");

// Ocupación por franja: 16:00 junta PIS-200 (6) + PIS-202 (8) = 14; 11:00 solo PIS-201 (4).
const bySlot = Object.fromEntries(result.slots.map((row) => [row.slot, row]));
assert.equal(bySlot["16:00"].used, 14);
assert.equal(bySlot["16:00"].isNow, true);
assert.equal(bySlot["11:00"].used, 4);
assert.equal(bySlot["09:00"].used, 0, "PIS-203 es de otro día y PIS-205 es de mañana, no de hoy");

// Estado de pago (todas las reservas activas, no solo las de hoy): pagado 201/202/203, parcial 200, pendiente 205.
const estadoPago = Object.fromEntries(result.estadoPago.map((row) => [row.key, row.count]));
assert.equal(estadoPago.PAGADO, 3);
assert.equal(estadoPago.PARCIAL, 1);
assert.equal(estadoPago.PENDIENTE, 1);

// Próximos 7 días: hoy trae 3, mañana trae 1 (PIS-205).
const proximos = Object.fromEntries(result.proximos7Dias.map((row) => [row.date, row.count]));
assert.equal(proximos["2026-09-21"], 3);
assert.equal(proximos["2026-09-22"], 1);

// Contadores de la agenda: 6 filas de piscina en total, 2 requieren atención, 4 confirmadas/en curso/completadas, 1 cancelada.
assert.equal(result.counts.total, 6);
assert.equal(result.counts.atencion, 2, "PIS-200 (saldo) y PIS-205 (saldo) requieren atención");
assert.equal(result.counts.confirmadas, 4);
assert.equal(result.counts.canceladas, 1);

// Filtros de la tabla.
const attention = buildPoolOverview(state, { filter: "atencion" }, NOW);
assert.equal(attention.list.total, 2);
const cancelled = buildPoolOverview(state, { filter: "canceladas" }, NOW);
assert.equal(cancelled.list.total, 1);
assert.equal(cancelled.list.rows[0].code, "PIS-204");
const search = buildPoolOverview(state, { q: "Amayo" }, NOW);
assert.equal(search.list.total, 2, "Grupo Amayo SAC tiene PIS-202 y PIS-205");

console.log("pool-reservations: todas las pruebas pasaron");
