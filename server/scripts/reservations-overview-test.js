// Prueba del cálculo de Reservas generales del Superadmin. No necesita base de datos: node scripts/reservations-overview-test.js
import assert from "node:assert/strict";
import { buildReservationsOverview, buildReservationDetail } from "../src/reservations-overview.js";

const NOW = new Date("2026-09-21T21:30:00Z"); // 16:30 en Lima

const state = {
  settings: { timezone: "America/Lima" },
  clients: [
    { id: 1, firstName: "María", lastName: "Torres", documentNumber: "40000000" },
    { id: 2, firstName: "Pedro", lastName: "Salazar", documentNumber: "40823866" },
    { id: 3, firstName: "Grupo Amayo", lastName: "SAC", documentNumber: "20481239077" }
  ],
  rooms: [{ id: 1, number: "204" }],
  users: [{ id: 9, firstName: "Ana", lastName: "Recepción" }],
  reservations: [
    // confirmada, dentro del rango de 30 días, sin saldo -> siguiente acción "ver detalle"
    { id: 100, code: "RES-100", clientId: 1, roomId: 1, checkInDate: "2026-09-21", checkOutDate: "2026-09-24", totalPrice: 480, advance: 480, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-15T10:00:00Z" },
    // pendiente de pago en caja: debe normalizar a POR_CONFIRMAR (antes el filtro viejo no la detectaba)
    { id: 101, code: "RES-101", clientId: 2, roomId: 1, checkInDate: "2026-09-25", checkOutDate: "2026-09-26", totalPrice: 200, advance: 0, balance: 200, status: "PENDIENTE_CAJA", createdAt: "2026-09-20T10:00:00Z" },
    // creada hace 40 días: fuera del rango de 30 días
    { id: 102, code: "RES-102", clientId: 1, roomId: 1, checkInDate: "2026-08-01", checkOutDate: "2026-08-02", totalPrice: 100, advance: 100, balance: 0, status: "COMPLETADA", createdAt: "2026-08-10T10:00:00Z" }
  ],
  bookings: [
    { id: 100, serviceCode: "HOSPEDAJE", code: "RES-100", clientId: 1, date: "2026-09-21", total: 480, paid: 480, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-15T10:00:00Z" },
    { id: 101, serviceCode: "HOSPEDAJE", code: "RES-101", clientId: 2, date: "2026-09-25", total: 200, paid: 0, balance: 200, status: "PENDIENTE_CAJA", createdAt: "2026-09-20T10:00:00Z" },
    // piscina con saldo pendiente -> "cobrar saldo"
    { id: 200, serviceCode: "PISCINA", code: "PIS-200", clientId: 2, date: "2026-09-21", slot: "14:00", people: 6, total: 150, paid: 90, balance: 60, status: "RESERVADA", createdAt: "2026-09-18T10:00:00Z" },
    // terraza cancelada
    { id: 300, serviceCode: "TERRAZA", code: "TER-300", clientId: 1, date: "2026-09-16", slot: "20:00", people: 2, total: 180, paid: 180, balance: 0, status: "CANCELADA", createdAt: "2026-09-10T10:00:00Z" }
  ],
  events: [
    // evento confirmado con saldo, dentro de 30 días
    { id: 5, code: "EVT-005", clientId: 3, name: "Aniversario Amayo", spaceId: 1, space: { name: "Salón principal" }, startsAt: "2026-09-28T20:00:00-05:00", endsAt: "2026-09-29T02:00:00-05:00", guests: 45, price: 4200, advance: 2100, balance: 2100, status: "CONFIRMADO", createdAt: "2026-09-05T10:00:00Z" }
  ],
  payments: [
    { id: 1, bookingId: 100, reservationId: 100, amount: 240, method: "YAPE", concept: "Adelanto RES-100", status: "APROBADO", createdAt: "2026-09-15T10:00:00Z" },
    { id: 2, bookingId: 100, reservationId: 100, amount: 240, method: "EFECTIVO", concept: "Pago en Caja RES-100", status: "APROBADO", createdAt: "2026-09-20T18:02:00Z" }
  ],
  audit: [
    { id: 1, module: "RESERVAS", action: "CREAR", detail: "RES-100", userId: 9, createdAt: "2026-09-15T10:00:00Z" },
    { id: 2, module: "PAGOS", action: "CAJA", detail: "RES-100: pago en caja", userId: 9, createdAt: "2026-09-20T18:02:00Z" }
  ]
};

const result = buildReservationsOverview(state, { range: "30" }, NOW);
assert.equal(result.today, "2026-09-21");

// RES-102 (creada hace 40 días) queda fuera del rango de 30 días.
assert.equal(result.summary.total, 5, "el rango de 30 días debe excluir RES-102");

// Normalización de estado: PENDIENTE_CAJA -> POR_CONFIRMAR (el bug original de la vista anterior).
const row101 = result.list.rows.find((row) => row.code === "RES-101");
assert.equal(row101.status, "POR_CONFIRMAR");
assert.equal(row101.nextAction.action, "COBRAR_SALDO", "con saldo pendiente, cobrar saldo tiene prioridad sobre confirmar");

// Piscina con saldo -> cobrar saldo; terraza cancelada -> ver detalle aunque tenga saldo en 0.
const pool = result.list.rows.find((row) => row.code === "PIS-200");
assert.equal(pool.nextAction.action, "COBRAR_SALDO");
const terrace = result.list.rows.find((row) => row.code === "TER-300");
assert.equal(terrace.status, "CANCELADA");
assert.equal(terrace.nextAction.action, "VER_DETALLE");

// Confirmada y sin saldo, hoy -> validar ingreso.
const hosted = result.list.rows.find((row) => row.code === "RES-100");
assert.equal(hosted.status, "CONFIRMADA");
assert.equal(hosted.nextAction.action, "VALIDAR_INGRESO");

// Por confirmar (estado normalizado POR_CONFIRMAR): RES-101 y PIS-200 (esta última también tiene saldo,
// por eso su "siguiente acción" es cobrar saldo y no confirmar — ver aserción de pool.nextAction arriba).
assert.equal(result.summary.porConfirmar, 2);

// Saldo pendiente: RES-101 (200) + PIS-200 (60) + EVT-005 (2100) = 2360. Terraza está cancelada y no cuenta.
assert.equal(result.summary.saldoPendiente.amount, 2360);
assert.equal(result.summary.saldoPendiente.count, 3);

// Cancelaciones del rango: solo TER-300.
assert.equal(result.summary.cancelaciones.count, 1);

// Reservas por servicio: Hospedaje trae 2 filas en rango (RES-100 confirmada, RES-101 por confirmar).
const hospedaje = result.summary.reservasPorServicio.find((row) => row.code === "HOSPEDAJE");
assert.equal(hospedaje.total, 2);
assert.equal(hospedaje.confirmadas, 1);

// Estado de pago: Pagado (RES-100), Parcial (PIS-200, EVT-005), Pendiente (RES-101). Terraza cancelada no cuenta.
const estadoPago = Object.fromEntries(result.summary.estadoPago.map((row) => [row.key, row.count]));
assert.equal(estadoPago.PAGADO, 1);
assert.equal(estadoPago.PARCIAL, 2);
assert.equal(estadoPago.PENDIENTE, 1);

// Personas esperadas hoy (21 sep.): RES-100 (1 por defecto, sin adults/children) + PIS-200 (6) = 7.
assert.equal(result.summary.personasHoy, 7);

// Filtro por servicio y por estado + paginación.
const onlyPiscina = buildReservationsOverview(state, { range: "todas", service: "PISCINA" }, NOW);
assert.equal(onlyPiscina.list.total, 1);
const page1 = buildReservationsOverview(state, { range: "todas", pageSize: 2, page: 1 }, NOW);
assert.equal(page1.list.rows.length, 2);
assert.equal(page1.list.total, 6);

// Detalle: pagos e historial de auditoría ligados al código.
const detail = buildReservationDetail(state, "HOSPEDAJE", 100, NOW);
assert.equal(detail.payments.length, 2);
assert.equal(detail.history.length, 2);
assert.equal(detail.history[0].actorName, "Ana Recepción");

console.log("reservations-overview: todas las pruebas pasaron");
