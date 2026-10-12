// Prueba del cálculo de Reservas > Eventos. No necesita base de datos: node scripts/events-overview-test.js
import assert from "node:assert/strict";
import { buildEventsOverview } from "../src/events-overview.js";

const NOW = new Date("2026-09-21T22:00:00Z"); // 17:00 en Lima

const state = {
  settings: { timezone: "America/Lima" },
  clients: [
    { id: 1, firstName: "Jorge", lastName: "Injante", documentNumber: "40823866" },
    { id: 2, firstName: "Grupo Amayo", lastName: "SAC", documentNumber: "20481239077" },
    { id: 3, firstName: "Karina", lastName: "Nuñez", documentNumber: "41112223" },
    { id: 4, firstName: "Selva Corp", lastName: "SAC", documentNumber: "20999888777" },
    { id: 5, firstName: "Ana", lastName: "Beltrán", documentNumber: "42233445" }
  ],
  events: [
    // hoy, confirmado, con saldo -> cuenta en "producción/evento" del ciclo
    { id: 1, code: "EVT-001", clientId: 1, name: "Boda Injante", type: "Social", spaceId: 3, space: { name: "Salón Amazónico", capacity: 120 }, startsAt: "2026-09-21T20:00:00-05:00", endsAt: "2026-09-22T02:00:00-05:00", guests: 110, price: 4200, advance: 2100, balance: 2100, status: "CONFIRMADO", createdAt: "2026-09-01T10:00:00Z" },
    // hoy, reservado, con saldo -> cuenta en "reserva" y "anticipo" del ciclo
    { id: 2, code: "EVT-002", clientId: 2, name: "Aniversario Amayo", type: "Corporativo", spaceId: 1, space: { name: "Terraza", capacity: 80 }, startsAt: "2026-09-21T19:00:00-05:00", endsAt: "2026-09-21T23:00:00-05:00", guests: 60, price: 1800, advance: 900, balance: 900, status: "RESERVADO", createdAt: "2026-09-05T10:00:00Z" },
    // en 3 días, cotización, sin adelanto
    { id: 3, code: "EVT-003", clientId: 3, name: "Cumpleaños 15 años", type: "Social", spaceId: 2, space: { name: "Mirador", capacity: 40 }, startsAt: "2026-09-24T18:00:00-05:00", endsAt: "2026-09-24T22:00:00-05:00", guests: 35, price: 950, advance: 0, balance: 950, status: "COTIZACION", createdAt: "2026-09-18T10:00:00Z" },
    // pasado y finalizado
    { id: 4, code: "EVT-004", clientId: 4, name: "Conferencia Selva Corp", type: "Corporativo", spaceId: 3, space: { name: "Salón Amazónico", capacity: 120 }, startsAt: "2026-09-10T09:00:00-05:00", endsAt: "2026-09-10T13:00:00-05:00", guests: 80, price: 2100, advance: 2100, balance: 0, status: "FINALIZADO", createdAt: "2026-08-20T10:00:00Z" },
    // pasado y cancelado -> no debe contar en ningún total activo
    { id: 5, code: "EVT-005", clientId: 5, name: "Despedida de soltera", type: "Social", spaceId: 1, space: { name: "Terraza", capacity: 80 }, startsAt: "2026-09-16T19:00:00-05:00", endsAt: "2026-09-16T23:30:00-05:00", guests: 25, price: 950, advance: 950, balance: 0, status: "CANCELADO", createdAt: "2026-09-08T10:00:00Z" }
  ]
};

const result = buildEventsOverview(state, {}, NOW);
assert.equal(result.today, "2026-09-21");

// KPIs.
assert.equal(result.kpis.eventosHoy, 2, "EVT-001 y EVT-002 son de hoy y no están cancelados");
assert.equal(result.kpis.proximos, 3, "EVT-001, EVT-002 y EVT-003 están hoy o después y no cancelados/finalizados");
assert.equal(result.kpis.cotizaciones, 1, "solo EVT-003");
assert.equal(result.kpis.invitadosProximos7Dias, 205, "110 + 60 + 35");
assert.equal(result.kpis.saldoPendiente.amount, 3950, "2100 + 900 + 950; la cancelada no cuenta");
assert.equal(result.kpis.saldoPendiente.count, 3);

// Ciclo del evento: Reserva y Anticipo comparten RESERVADO; Producción y Evento comparten CONFIRMADO.
assert.deepEqual(result.ciclo, { cotizacion: 1, reserva: 1, anticipo: 1, produccion: 1, evento: 1, cierre: 1 });

// Eventos por espacio (activos, la cancelada no cuenta): Salón Amazónico 2, Terraza 1, Mirador 1.
const espacios = Object.fromEntries(result.espacios.map((row) => [row.space, row.count]));
assert.equal(espacios["Salón Amazónico"], 2);
assert.equal(espacios["Terraza"], 1, "EVT-005 está cancelada y no cuenta");
assert.equal(espacios["Mirador"], 1);
assert.equal(result.espacios[0].space, "Salón Amazónico", "el más solicitado va primero");

// Estado de pago: EVT-001 y EVT-002 parciales, EVT-003 pendiente, EVT-004 pagado.
const estadoPago = Object.fromEntries(result.estadoPago.map((row) => [row.key, row.count]));
assert.equal(estadoPago.PAGADO, 1);
assert.equal(estadoPago.PARCIAL, 2);
assert.equal(estadoPago.PENDIENTE, 1);

// Próximos 7 días: hoy trae 2 (EVT-001, EVT-002); en 3 días trae 1 (EVT-003).
const proximos = Object.fromEntries(result.proximos7Dias.map((row) => [row.date, row.count]));
assert.equal(proximos["2026-09-21"], 2);
assert.equal(proximos["2026-09-24"], 1);

// Contadores por estado real.
assert.equal(result.counts.total, 5);
assert.equal(result.counts.atencion, 3, "EVT-001 (saldo), EVT-002 (reservado+saldo) y EVT-003 (cotización)");
assert.equal(result.counts.COTIZACION, 1);
assert.equal(result.counts.RESERVADO, 1);
assert.equal(result.counts.CONFIRMADO, 1);
assert.equal(result.counts.FINALIZADO, 1);
assert.equal(result.counts.CANCELADO, 1);

// Filtros de la tabla.
const confirmados = buildEventsOverview(state, { status: "confirmado" }, NOW);
assert.equal(confirmados.list.total, 1);
assert.equal(confirmados.list.rows[0].code, "EVT-001");
const terraza = buildEventsOverview(state, { space: "Terraza" }, NOW);
assert.equal(terraza.list.total, 2, "EVT-002 y EVT-005 (el filtro de espacio no excluye canceladas)");
const search = buildEventsOverview(state, { q: "Amayo" }, NOW);
assert.equal(search.list.total, 1);
assert.equal(search.list.rows[0].code, "EVT-002");

console.log("events-overview: todas las pruebas pasaron");
