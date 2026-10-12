// Prueba del cálculo del Inicio del Superadmin. No necesita base de datos: node scripts/owner-home-test.js
import assert from "node:assert/strict";
import { addDays, buildOwnerHome, makeClock, resolveRange } from "../src/owner-home.js";

const NOW = new Date("2026-09-21T21:30:00Z"); // 16:30 en Lima
const iso = (lima) => new Date(`${lima}-05:00`).toISOString(); // hora escrita en Lima -> ISO UTC

const state = {
  settings: { timezone: "America/Lima" },
  services: [{ code: "PISCINA", capacity: 48 }, { code: "MIRADOR", capacity: 20 }, { code: "TERRAZA", capacity: 30 }],
  users: [{ id: 1, firstName: "Super", lastName: "Admin" }],
  rooms: [
    { id: 1, number: "101", floor: 1, status: "OCUPADA", capacity: 2 },
    { id: 2, number: "102", floor: 1, status: "LIBRE", capacity: 2 },
    { id: 3, number: "301", floor: 3, status: "EN_LIMPIEZA", capacity: 3 }
  ],
  reservations: [{ id: 10, serviceCode: "HOSPEDAJE", totalPrice: 300, balance: 100, status: "CONFIRMADA", checkInDate: "2026-09-21", adults: 2, children: 0 }],
  bookings: [
    { id: 10, serviceCode: "HOSPEDAJE", total: 300, balance: 100, status: "CONFIRMADA", date: "2026-09-21" },
    { id: 20, serviceCode: "PISCINA", total: 200, balance: 100, status: "RESERVADA", date: "2026-09-21" },
    { id: 21, serviceCode: "MIRADOR", total: 90, balance: 0, status: "CANCELADA", date: "2026-09-21" },
    { id: 22, serviceCode: "HOSPEDAJE", total: 180, balance: 180, status: "RESERVADA", date: "2026-09-25", paymentStatus: "PENDIENTE_VERIFICACION", paymentRequested: 180 }
  ],
  events: [{ id: 5, status: "CONFIRMADO", price: 1000, balance: 400, guests: 60, startsAt: "2026-09-21T15:00:00-05:00", endsAt: "2026-09-21T23:00:00-05:00", accessStatus: "INGRESO_VALIDADO" }],
  stays: [{ id: 1, reservationId: 10, roomId: 1, status: "ACTIVA", checkInAt: iso("2026-09-21T11:20:00") }],
  entitlements: [
    { serviceCode: "PISCINA", people: 3, usedAt: iso("2026-09-21T16:00:00") },
    { serviceCode: "PISCINA", people: 5, usedAt: iso("2026-09-21T09:00:00") }, // ya salió (más de 3 h)
    { serviceCode: "MIRADOR", people: 2, usedAt: iso("2026-09-21T15:45:00") }
  ],
  poolEntries: [{ id: 1, status: "ACTIVO", people: 2, enteredAt: iso("2026-09-21T15:00:00") }],
  accessLogs: [{ validatedAt: iso("2026-09-21T16:00:00"), people: 3 }],
  orders: [
    { id: 1, groupCode: "GRP-1", bookingId: 10, experienceCode: "HOSPEDAJE", area: "RESTAURANTE", total: 60, status: "ENTREGADO", createdAt: iso("2026-09-21T13:00:00"), items: [{ recipeUnitCost: 12, quantity: 2 }] },
    { id: 2, groupCode: "GRP-1", bookingId: 10, experienceCode: "HOSPEDAJE", area: "BARTENDER", total: 40, status: "LISTO", createdAt: iso("2026-09-21T13:00:00"), items: [{ recipeUnitCost: 5, quantity: 2 }] },
    { id: 3, groupCode: "SCH-20", bookingId: 20, experienceCode: "PISCINA", area: "RESTAURANTE", total: 50, status: "PENDIENTE", createdAt: iso("2026-09-21T10:00:00"), items: [{ recipeUnitCost: 10, quantity: 1 }] }
  ],
  payments: [
    // Pedido del cliente de hospedaje: 100 = 60 restaurante + 40 bar, se imputa a HOSPEDAJE
    { id: 1, bookingId: 10, amount: 100, method: "YAPE", concept: "Pedido GRP-1", area: "CLIENTE", status: "APROBADO", createdAt: iso("2026-09-21T13:05:00") },
    // Cobro de la noche (21:30 Lima = 02:30 UTC del día siguiente): debe contar el día 21
    { id: 2, bookingId: 10, amount: 200, method: "PLIN", status: "APROBADO", createdAt: iso("2026-09-21T21:30:00"), createdById: 2 },
    // Adelanto 50% de piscina con 50 de preorden dentro del total de 200: restaurante = 100 * 50/200 = 25
    { id: 3, bookingId: 20, amount: 100, method: "EFECTIVO", status: "APROBADO", createdAt: iso("2026-09-21T10:00:00"), createdById: 2 },
    { id: 4, eventId: 5, amount: 600, method: "YAPE", status: "APROBADO", createdAt: iso("2026-09-21T12:00:00") },
    // Sin datos de origen: no debe ir a Hospedaje
    { id: 5, amount: 30, method: "EFECTIVO", status: "APROBADO", createdAt: iso("2026-09-21T12:10:00"), createdById: 2 },
    // Ayer
    { id: 6, bookingId: 20, amount: 100, method: "YAPE", status: "APROBADO", createdAt: iso("2026-09-20T12:00:00") },
    // No aprobado: no cuenta
    { id: 7, bookingId: 20, amount: 999, method: "YAPE", status: "RECHAZADO", createdAt: iso("2026-09-21T12:00:00") }
  ],
  cashMovements: [
    { type: "EGRESO", amount: 80, serviceCode: "PISCINA", concept: "Cloro", createdAt: iso("2026-09-21T09:00:00") },
    { type: "EGRESO", amount: 50, concept: "Movilidad", createdAt: iso("2026-09-21T09:30:00") },
    { type: "EGRESO", amount: 70, serviceCode: "PISCINA", createdAt: iso("2026-09-20T09:00:00") }
  ],
  cashSessions: [{ status: "EN_REVISION" }, { status: "ABIERTA" }],
  requests: [{ status: "ABIERTO", requiresMaintenance: true }],
  tasks: [{ status: "PENDIENTE" }, { status: "FINALIZADA" }],
  audit: [{ id: 1, module: "COMERCIAL", action: "PRECIO", detail: "Piscina: S/ 25 → S/ 30", userId: 1, createdAt: "2026-09-21T20:00:00.000Z", changes: [{ label: "Piscina", before: 25, after: 30 }] }]
};

const home = buildOwnerHome(state, { days: 1 }, { eventSpaces: [{ capacity: 80 }, { capacity: 120 }], lowStock: [{ id: 1 }, { id: 2 }] }, NOW);
const by = Object.fromEntries(home.services.map((s) => [s.code, s]));

// zona horaria y periodo
assert.equal(home.today, "2026-09-21");
assert.equal(makeClock().date("2026-09-22T02:30:00Z"), "2026-09-21", "22/09 02:30 UTC es 21/09 21:30 en Lima");
assert.deepEqual(resolveRange({ days: 7 }, "2026-09-21"), { from: "2026-09-15", to: "2026-09-21", days: 7, prevFrom: "2026-09-08", prevTo: "2026-09-14" });
assert.equal(addDays("2026-03-01", -1), "2026-02-28");

// ventas de hoy = 100 + 200 + 100 + 600 + 30 (no cuenta ayer ni el pago rechazado)
assert.equal(home.kpis.sales.value, 1030);
assert.equal(home.kpis.sales.previous, 100);
// atribución: nada cae en Hospedaje por omisión
assert.equal(by.HOSPEDAJE.sales, 300);
assert.equal(by.PISCINA.sales, 100);
assert.equal(by.EVENTOS.sales, 600);
assert.equal(home.unassigned.sales, 30);
assert.equal(home.dataQuality.unclassifiedSales, 30);
// el consumo se suma al servicio de origen pero se ve por área
const oh = home.origin.find((row) => row.code === "HOSPEDAJE");
assert.deepEqual([oh.servicio, oh.restaurante, oh.bar], [200, 60, 40]);
const op = home.origin.find((row) => row.code === "PISCINA");
assert.deepEqual([op.servicio, op.restaurante, op.bar], [75, 25, 0], "preorden proporcional al adelanto");
const total = home.origin.reduce((a, r) => a + r.servicio + r.restaurante + r.bar, 0);
assert.equal(Math.round(total * 100) / 100, home.kpis.sales.value, "el mapa de calor cuadra con las ventas");
// gastos: 80 asignado a Piscina + 50 sin asignar + costo de recetas (24 + 10 hospedaje, 10 piscina)
assert.equal(home.kpis.expenses.value, 80 + 50 + 24 + 10 + 10);
assert.equal(by.PISCINA.expenses, 90);
assert.equal(by.HOSPEDAJE.expenses, 34);
assert.equal(home.unassigned.expenses, 50);
assert.equal(home.kpis.profit.value, 1030 - 174);
// cobros
assert.equal(home.payments.methods.find((m) => m.key === "EFECTIVO").amount, 130);
assert.equal(home.payments.channels.find((c) => c.key === "RECEPCION").amount, 330);
assert.deepEqual(home.payments.toVerify, { count: 1, amount: 180 });
// restaurante y bar
const rest = home.gastronomy.find((g) => g.area === "RESTAURANTE");
assert.equal(rest.sales, 85);
assert.equal(rest.cost, 34); // 12*2 + 10
// por cobrar (la reserva de hospedaje figura una sola vez aunque esté en bookings y reservations)
assert.equal(by.HOSPEDAJE.receivable, 100 + 180);
assert.equal(by.EVENTOS.receivable, 400);
assert.equal(by.MIRADOR.receivable, 0, "una reserva cancelada no se cobra");
// personas dentro: estadía 2, piscina 3 (QR) + 2 (manual), mirador 2, evento 60
assert.equal(by.HOSPEDAJE.inside, 2);
assert.equal(by.PISCINA.inside, 5);
assert.equal(by.MIRADOR.inside, 2);
assert.equal(by.EVENTOS.inside, 60);
assert.equal(by.EVENTOS.capacity, 200);
assert.equal(by.HOSPEDAJE.capacity, 7);
assert.equal(home.kpis.inside.value, 69);
// afluencia, habitaciones, pedidos, pendientes, auditoría
assert.equal(home.hourly.find((h) => h.hour === 16).count, 3 + 0, "16:00 -> 3 personas validadas");
assert.equal(home.hourly.find((h) => h.hour === 15).count, 2);
assert.equal(home.rooms.length, 3);
assert.equal(home.occupancy.at(-1).percent, 33);
assert.deepEqual(home.orderStates.map((s) => s.count), [1, 0, 1, 1]);
const keys = home.pending.map((p) => p.key);
for (const key of ["cash", "verify", "stock", "maintenance", "cleaning", "expenses"]) assert.ok(keys.includes(key), "falta pendiente " + key);
assert.equal(home.recent[0].user, "Super Admin");
assert.equal(home.recent[0].changes[0].after, 30);

// sin datos: no inventa nada
const empty = buildOwnerHome({ settings: {} }, {}, {}, NOW);
assert.equal(empty.kpis.sales.value, 0);
assert.equal(empty.kpis.sales.change, null);
assert.equal(empty.services.length, 5);
assert.equal(empty.pending.length, 0);
assert.equal(empty.peakHour, null);

console.log("owner-home: todas las pruebas pasaron");
