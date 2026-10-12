// Prueba del módulo Clientes (Directorio, Perfil 360°, fusión de duplicados). Sin base de datos:
// node scripts/client-directory-test.js
import assert from "node:assert/strict";
import { buildClientDirectory, buildClientProfile, mergeClients, resolveAccessClientId } from "../src/client-directory.js";
import { makeClock } from "../src/owner-home.js";

const NOW = new Date("2026-09-21T20:00:00Z"); // 15:00 en Lima
const clock = makeClock("America/Lima");
const iso = (lima) => new Date(`${lima}-05:00`).toISOString();
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();

const state = {
  settings: { timezone: "America/Lima" },
  clients: [
    { id: 1, firstName: "María", lastName: "Torres", documentType: "DNI", documentNumber: "40000000", phone: "987654321", email: "maria@correo.com", status: "ACTIVO", createdAt: daysAgo(200) },
    { id: 2, firstName: "Ana", lastName: "Silva", documentType: "DNI", documentNumber: "40549244", phone: "", email: "ana@correo.com", status: "ACTIVO", createdAt: daysAgo(10) }, // NUEVO
    { id: 3, firstName: "Jorge", lastName: "Tello", documentType: "DNI", documentNumber: "41102233", phone: "911222333", email: "", status: "ACTIVO", createdAt: daysAgo(400) }, // INACTIVO
    { id: 4, firstName: "Rosa", lastName: "Salazar", documentType: "GOOGLE", documentNumber: "GOOGLE-1007", phone: "987654321", email: "", status: "ACTIVO", createdAt: daysAgo(5) }, // duplicado de María (mismo teléfono)
    { id: 5, firstName: "Pedro", lastName: "Sin Visitas", documentType: "DNI", documentNumber: "40823866", phone: "922333444", email: "pedro@correo.com", status: "ACTIVO", createdAt: daysAgo(500) },
    { id: 6, firstName: "Bloqueado", lastName: "Cliente", documentType: "DNI", documentNumber: "40111222", phone: "", email: "", status: "BLOQUEADO", createdAt: daysAgo(60) }
  ],
  services: [{ code: "PISCINA", capacity: 48 }],
  bookings: [
    { id: 10, clientId: 1, serviceCode: "HOSPEDAJE", total: 300, balance: 0, status: "CONFIRMADA", date: "2026-09-19", checkInDate: "2026-09-19", createdAt: daysAgo(2) },
    { id: 20, clientId: 2, serviceCode: "PISCINA", total: 100, balance: 50, status: "RESERVADA", date: "2026-09-21", createdAt: daysAgo(1) },
    { id: 30, clientId: 3, serviceCode: "MIRADOR", total: 90, balance: 0, status: "CONFIRMADA", date: "2026-05-01", createdAt: daysAgo(140) },
    // Rosa (id 4) reservó Mirador ANTES de que la registraran como cliente Google duplicado de María.
    { id: 40, clientId: 4, serviceCode: "MIRADOR", total: 45, balance: 0, status: "CONFIRMADA", date: "2026-09-15", createdAt: daysAgo(6) }
  ],
  reservations: [{ id: 10, clientId: 1, serviceCode: "HOSPEDAJE", totalPrice: 300, balance: 0, status: "CONFIRMADA", checkInDate: "2026-09-19" }],
  events: [],
  stays: [{ id: 1, clientId: 1, reservationId: 10, roomId: 1, status: "ACTIVA", checkInAt: iso("2026-09-19T14:00:00") }],
  rooms: [{ id: 1, capacity: 2 }],
  // Ana (id 2) viene solo a Piscina: 2 accesos por QR + 1 sin `clientId` (registro antiguo) que se resuelve por el pase.
  passes: [{ id: 100, clientId: 2, code: "PP-0002", status: "ACTIVO" }, { id: 998, clientId: 4, code: "PP-0004", status: "ACTIVO" }],
  accessLogs: [
    { id: 1, clientId: 2, passId: 100, serviceCode: "PISCINA", people: 1, validatedAt: daysAgo(1) },
    { id: 2, passId: 100, serviceCode: "PISCINA", people: 2, validatedAt: daysAgo(6) }, // sin clientId (dato antiguo)
    { id: 3, clientId: 3, passId: 999, serviceCode: "MIRADOR", people: 1, validatedAt: daysAgo(140) },
    { id: 4, clientId: 4, passId: 998, serviceCode: "MIRADOR", people: 1, validatedAt: daysAgo(6) }
  ],
  poolEntries: [],
  payments: [
    { id: 1, clientId: 1, bookingId: 10, amount: 300, method: "YAPE", status: "APROBADO", createdAt: daysAgo(2) },
    { id: 2, clientId: 2, bookingId: 20, amount: 50, method: "EFECTIVO", status: "APROBADO", createdAt: daysAgo(1), createdById: 2 },
    { id: 3, clientId: 3, bookingId: 30, amount: 90, method: "YAPE", status: "APROBADO", createdAt: daysAgo(140) },
    { id: 4, clientId: 2, bookingId: 20, amount: 999, method: "YAPE", status: "RECHAZADO", createdAt: daysAgo(1) }, // no debe contar
    { id: 5, clientId: 4, bookingId: 40, amount: 45, method: "YAPE", status: "APROBADO", createdAt: daysAgo(6) }
  ],
  orders: [
    { id: 1, groupCode: "GRP-1", bookingId: 10, clientId: 1, experienceCode: "HOSPEDAJE", area: "RESTAURANTE", total: 60, status: "ENTREGADO", createdAt: daysAgo(2), items: [{ recipeUnitCost: 10, quantity: 1 }] }
  ],
  cashMovements: [], requests: [], tasks: [], cashSessions: [], facturacion: [], cochera: []
};
// El pago de María incluye un pedido (GRP-1) de 60: se reparte dentro de sus 300 (servicio 240 + restaurante 60).
state.payments[0].concept = "Pedido GRP-1";

const dir = buildClientDirectory(state, {}, NOW);

// --- resumen global ---
assert.equal(dir.overview.totalClients, 6);
assert.equal(dir.overview.channels.recepcion + dir.overview.channels.app, 6);
assert.equal(dir.overview.dataQuality.duplicates, 1, "María y Rosa comparten teléfono");

// --- fila de Ana: viene SOLO a piscina, nunca hospedaje ---
const ana = dir.list.rows.find((row) => row.id === 2);
assert.deepEqual(ana.servicesUsed, ["PISCINA"], "Ana solo usó Piscina");
assert.equal(ana.visits, 2, "2 accesos: uno con clientId, uno resuelto por el pase (dato antiguo)");
assert.equal(ana.segment, "NUEVO", "registrada hace 10 días, sin visitas suficientes para recurrente");
assert.equal(ana.balance, 50);

// --- Jorge: última visita hace 140 días -> INACTIVO ---
const jorge = dir.list.rows.find((row) => row.id === 3);
assert.equal(jorge.segment, "INACTIVO");
assert.equal(jorge.lastVisitDate, clock.date(daysAgo(140)));

// --- Pedro: nunca visitó, registrado hace 500 días -> OCASIONAL (no inactivo: nunca tuvo una visita que "vencer") ---
const pedro = dir.list.rows.find((row) => row.id === 5);
assert.equal(pedro.visits, 0);
assert.equal(pedro.segment, "OCASIONAL");

// --- resolución de accessLog sin clientId ---
assert.equal(resolveAccessClientId(state, state.accessLogs[1]), 2, "se resuelve por el pase cuando falta clientId");

// --- Perfil de María: el pedido se reparte dentro del origen Hospedaje ---
const maria = buildClientProfile(state, 1, NOW);
assert.equal(maria.kpis.spend, 300);
assert.equal(maria.kpis.visits, 1);
assert.equal(maria.kpis.avgTicket, 300);
const origin = maria.originBreakdown.find((row) => row.code === "HOSPEDAJE");
assert.equal(origin.servicio, 240);
assert.equal(origin.restaurante, 60);
assert.equal(maria.duplicates.length, 1);
assert.equal(maria.duplicates[0].id, 4);
assert.equal(maria.duplicates[0].reason, "Mismo teléfono");

// --- bloqueado se refleja ---
const bloqueado = dir.list.rows.find((row) => row.id === 6);
assert.equal(bloqueado.blocked, true);

// --- paginación ---
const page1 = buildClientDirectory(state, { pageSize: 2, page: 1 }, NOW);
assert.equal(page1.list.rows.length, 2);
assert.equal(page1.list.total, 6);

// --- filtro por segmento ---
const vips = buildClientDirectory(state, { segment: "INACTIVO" }, NOW);
assert.equal(vips.list.rows.every((row) => row.segment === "INACTIVO"), true);
assert.ok(vips.list.rows.some((row) => row.id === 3));

console.log("client-directory: cálculos base OK — probando fusión de duplicados...");

// --- fusión: Rosa (4) se fusiona dentro de María (1); Rosa traía una reserva de Mirador pagada ---
const merged = JSON.parse(JSON.stringify(state)); // mutar una copia, como haría mutateState
const result = mergeClients(merged, 1, 4, 99);
assert.equal(result.primary.id, 1);
assert.equal(result.duplicate.id, 4);
assert.deepEqual(result.moved, { bookings: 1, payments: 1, accessLogs: 1, passes: 1 }, "solo se mueve lo que Rosa tenía: 1 reserva, 1 pago, 1 acceso, 1 pase");
assert.equal(merged.bookings.find((b) => b.id === 40).clientId, 1, "la reserva de Mirador ahora es de María");
assert.equal(merged.clients.find((c) => c.id === 4).status, "FUSIONADO");
assert.equal(merged.clients.find((c) => c.id === 4).mergedInto, 1);

const dirAfterMerge = buildClientDirectory(merged, {}, NOW);
assert.equal(dirAfterMerge.overview.totalClients, 5, "el fusionado ya no cuenta como cliente activo");
assert.ok(!dirAfterMerge.list.rows.some((row) => row.id === 4), "el duplicado no aparece en la lista");
assert.equal(dirAfterMerge.overview.dataQuality.duplicates, 0, "ya no hay duplicados pendientes de revisar");

// María ahora conserva su propio historial de Hospedaje MÁS el de Mirador que trajo Rosa fusionada.
const mariaAfterMerge = buildClientProfile(merged, 1, NOW);
assert.equal(mariaAfterMerge.kpis.spend, 300 + 45, "el gasto de Rosa se suma al de María");
assert.equal(mariaAfterMerge.kpis.visits, 1 + 1, "el acceso a Mirador de Rosa se suma a las visitas de María");
assert.ok(mariaAfterMerge.originBreakdown.some((row) => row.code === "MIRADOR"), "el consumo de Mirador aparece en el libro de María");
assert.equal(mariaAfterMerge.duplicates.length, 0, "ya no queda un duplicado activo por revisar");

// fusionar dos veces debe fallar
assert.throws(() => mergeClients(merged, 1, 4, 99), /fusionado/i);
// fusionar un cliente consigo mismo debe fallar
assert.throws(() => mergeClients(merged, 1, 1, 99), /consigo mismo/i);
// fusionar un cliente inexistente debe fallar
assert.throws(() => mergeClients(merged, 1, 999, 99), /no encontrado/i);

console.log("client-directory: todas las pruebas pasaron");
