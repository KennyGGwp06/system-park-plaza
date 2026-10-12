// Prueba del cálculo de Reservas > Mirador. No necesita base de datos: node scripts/mirador-reservations-test.js
import assert from "node:assert/strict";
import { buildMiradorOverview } from "../src/mirador-reservations.js";

const NOW = new Date("2026-09-21T23:45:00Z"); // 18:45 en Lima -> franja en curso 18:30

const state = {
  settings: { timezone: "America/Lima" },
  services: [{ id: 3, code: "MIRADOR", name: "Mirador", capacity: 15 }],
  clients: [
    { id: 1, firstName: "María", lastName: "Torres", documentNumber: "40000000" },
    { id: 2, firstName: "Pedro", lastName: "Salazar", documentNumber: "40823866" },
    { id: 3, firstName: "Grupo Amayo", lastName: "SAC", documentNumber: "20481239077" }
  ],
  bookings: [
    // hoy, 18:30, con un Yape pendiente de verificar -> nunca debe ofrecer "cobrar saldo" a secas
    { id: 400, serviceCode: "MIRADOR", code: "MIR-400", clientId: 2, date: "2026-09-21", slot: "18:30", people: 4, total: 200, paid: 0, balance: 200, status: "RESERVADA", paymentMethod: "YAPE", paymentReference: "123456", paymentRequested: 200, paymentStatus: "PENDIENTE_VERIFICACION", createdAt: "2026-09-19T10:00:00Z" },
    // hoy, 17:30, confirmada y pagada
    { id: 401, serviceCode: "MIRADOR", code: "MIR-401", clientId: 1, date: "2026-09-21", slot: "17:30", people: 3, total: 150, paid: 150, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-18T10:00:00Z" },
    // hoy, 18:30, parcial (comparte franja con MIR-400: 6 personas en la franja 18:30)
    { id: 402, serviceCode: "MIRADOR", code: "MIR-402", clientId: 3, date: "2026-09-21", slot: "18:30", people: 2, total: 100, paid: 50, balance: 50, status: "RESERVADA", createdAt: "2026-09-17T10:00:00Z" },
    // pasada y completada
    { id: 403, serviceCode: "MIRADOR", code: "MIR-403", clientId: 1, date: "2026-09-18", slot: "16:30", people: 2, total: 100, paid: 100, balance: 0, status: "FINALIZADA", createdAt: "2026-09-10T10:00:00Z" },
    // cancelada -> no debe contar en ningún total activo
    { id: 404, serviceCode: "MIRADOR", code: "MIR-404", clientId: 2, date: "2026-09-16", slot: "20:00", people: 3, total: 180, paid: 180, balance: 0, status: "CANCELADA", createdAt: "2026-09-08T10:00:00Z" },
    // mañana, confirmada y pagada
    { id: 405, serviceCode: "MIRADOR", code: "MIR-405", clientId: 3, date: "2026-09-22", slot: "20:00", people: 5, total: 200, paid: 200, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-20T10:00:00Z" },
    // otro servicio: no debe aparecer en ningún cálculo de mirador
    { id: 500, serviceCode: "PISCINA", code: "PIS-500", clientId: 1, date: "2026-09-21", slot: "11:00", people: 2, total: 80, paid: 80, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-19T10:00:00Z" }
  ],
  entitlements: [
    // usado hace 45 min (dentro de la ventana de 120 min) -> cuenta como "dentro ahora"
    { id: 1, serviceCode: "MIRADOR", bookingId: 401, status: "UTILIZADO", people: 3, date: "2026-09-21", usedAt: "2026-09-21T23:00:00Z" },
    { id: 2, serviceCode: "PISCINA", bookingId: 500, status: "UTILIZADO", people: 2, date: "2026-09-21", usedAt: "2026-09-21T23:00:00Z" }
  ]
};

const result = buildMiradorOverview(state, {}, NOW);
assert.equal(result.today, "2026-09-21");

// KPIs de hoy: 3 reservas activas (400, 401, 402), 9 personas esperadas.
assert.equal(result.kpis.reservasHoy, 3);
assert.equal(result.kpis.personasEsperadasHoy, 9);
assert.equal(result.kpis.porVerificar, 1, "solo MIR-400 tiene un Yape pendiente de verificar");
assert.equal(result.kpis.saldoPendiente.amount, 250, "MIR-400 (200) + MIR-402 (50), la cancelada no cuenta");
assert.equal(result.kpis.saldoPendiente.count, 2);

// Aforo ahora: entitlement de MIR-401 (3, usado hace 45 min) = 3 de 15 (capacidad real, no un valor fijo).
assert.equal(result.aforo.inside, 3);
assert.equal(result.aforo.capacity, 15);
assert.equal(result.aforo.percent, 20);
assert.equal(result.aforo.slot, "18:30", "18:45 en Lima cae en la franja 18:30-20:00");

// Ocupación por franja: 18:30 junta MIR-400 (4) + MIR-402 (2) = 6; 17:30 solo MIR-401 (3).
const bySlot = Object.fromEntries(result.slots.map((row) => [row.slot, row]));
assert.equal(bySlot["18:30"].used, 6);
assert.equal(bySlot["18:30"].isNow, true);
assert.equal(bySlot["17:30"].used, 3);
assert.equal(bySlot["17:30"].isNow, false);
assert.equal(bySlot["16:30"].used, 0, "MIR-403 es de otro día");

// Estado de pago con el cuarto estado "por verificar" (no existe en Piscina).
const estadoPago = Object.fromEntries(result.estadoPago.map((row) => [row.key, row.count]));
assert.equal(estadoPago.PAGADO, 3, "MIR-401, MIR-403 y MIR-405");
assert.equal(estadoPago.PARCIAL, 1, "MIR-402");
assert.equal(estadoPago.POR_VERIFICAR, 1, "MIR-400");
assert.equal(estadoPago.PENDIENTE, 0);

// La reserva en verificación nunca debe ofrecer "cobrar saldo" a secas.
const verifyingRow = result.list.rows.find((row) => row.code === "MIR-400");
assert.equal(verifyingRow.nextAction.action, "VERIFICAR_PAGO");
assert.deepEqual(verifyingRow.verify, { method: "YAPE", reference: "123456", amount: 200 });
const normalRow = result.list.rows.find((row) => row.code === "MIR-401");
assert.equal(normalRow.verify, null);

// Contadores de la agenda.
assert.equal(result.counts.total, 6);
assert.equal(result.counts.atencion, 2, "MIR-400 y MIR-402 están POR_CONFIRMAR");
assert.equal(result.counts.verificar, 1);
assert.equal(result.counts.confirmadas, 3, "MIR-401, MIR-403 y MIR-405");
assert.equal(result.counts.canceladas, 1);

// Próximos 7 días: hoy trae 3, mañana trae 1 (MIR-405).
const proximos = Object.fromEntries(result.proximos7Dias.map((row) => [row.date, row.count]));
assert.equal(proximos["2026-09-21"], 3);
assert.equal(proximos["2026-09-22"], 1);

// Filtros de la tabla.
const verifying = buildMiradorOverview(state, { filter: "verificar" }, NOW);
assert.equal(verifying.list.total, 1);
assert.equal(verifying.list.rows[0].code, "MIR-400");
const cancelled = buildMiradorOverview(state, { filter: "canceladas" }, NOW);
assert.equal(cancelled.list.total, 1);
assert.equal(cancelled.list.rows[0].code, "MIR-404");

console.log("mirador-reservations: todas las pruebas pasaron");
