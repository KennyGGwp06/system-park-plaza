import assert from "node:assert/strict";
import { ensureStayAccess, repairIncompleteOrders, stabilizeLegacyState, validateOrderSchema } from "../src/state-stabilization.js";

const state = {
  counters: { pass: 0, entitlement: 0 },
  menuItems: [{ id: 10, code: "CEVICHE", name: "Ceviche regional", area: "RESTAURANTE", price: 42, recipe: [{ inventoryId: 1, quantity: 0.2 }] }],
  orders: [{ id: 2, area: "RESTAURANTE", items: [{ code: "CEVICHE", quantity: 2 }] }],
  passes: [], entitlements: [], bookings: [{ id: 7, clientId: 3, serviceCode: "HOSPEDAJE", people: 2, date: "2026-08-21", slot: "15:00" }],
  reservations: [{ id: 7, clientId: 3, adults: 2, children: 1, checkInDate: "2026-08-21T15:00:00" }],
  stays: [{ id: 4, reservationId: 7, clientId: 3, status: "ACTIVA" }]
};

assert.deepEqual(repairIncompleteOrders(state, "2026-08-21T12:00:00.000Z"), [2]);
assert.equal(state.orders[0].code, "PED-0002");
assert.equal(state.orders[0].items[0].name, "Ceviche regional");
assert.equal(state.orders[0].items[0].menuItemId, 10);
assert.equal(state.orders[0].total, 84);
assert.equal(state.orders[0].integrityStatus, "VALID");
assert.doesNotThrow(() => validateOrderSchema(state, state.orders[0]));
assert.throws(() => validateOrderSchema(state, { id: 9, code: "PED-0009", area: "RESTAURANTE", items: [{ quantity: 0 }] }), /incompleto/);

const access = ensureStayAccess(state, state.reservations[0], state.stays[0], "2026-08-21T12:00:00.000Z");
assert.match(access.pass.code, /^PP-AUTO-/);
assert.equal(access.entitlement.status, "ACTIVO");
assert.equal(access.entitlement.people, 3);
ensureStayAccess(state, state.reservations[0], state.stays[0], "2026-08-21T12:01:00.000Z");
assert.equal(state.passes.length, 1, "La reparación de pase debe ser idempotente");
assert.equal(state.entitlements.length, 1, "La reparación de acceso debe ser idempotente");

const result = stabilizeLegacyState(state, "2026-08-21T12:02:00.000Z");
assert.deepEqual(result.repairedStays, []);
console.log("OK stabilization: pedidos reparados, esquema validado y QR de estancia idempotente");
