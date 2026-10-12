// Prueba de las devoluciones (24 h para pedirla, 2 días hábiles para devolverla, solo el dueño devuelve).
// No necesita base de datos: node scripts/refunds-test.js
import assert from "node:assert/strict";
import { addBusinessDays, buildRefundCandidates, completeRefund, createRefundRequest, decideRefund, listRefunds, refundWindow } from "../src/refunds.js";

const T0 = new Date("2026-09-23T15:00:00Z"); // miércoles 10:00 en Lima
const hoursAfter = (hours) => new Date(T0.getTime() + hours * 3600000);
const reception = { id: 2, name: "Rosa Recepción", isOwner: false };
const owner = { id: 1, name: "Dueño", isOwner: true };

function freshState() {
  return {
    settings: { timezone: "America/Lima" },
    clients: [{ id: 1, firstName: "María", lastName: "Torres", documentNumber: "40000000" }, { id: 2, firstName: "Pedro", lastName: "Salazar", documentNumber: "40823866" }],
    rooms: [{ id: 1, number: "204" }],
    reservations: [{ id: 100, code: "RES-100", clientId: 1, roomId: 1, checkInDate: "2026-09-30", checkOutDate: "2026-10-02", totalPrice: 480, advance: 240, balance: 240, status: "CONFIRMADA", createdAt: "2026-09-23T14:00:00Z" }],
    bookings: [
      { id: 100, serviceCode: "HOSPEDAJE", code: "RES-100", clientId: 1, date: "2026-09-30", total: 480, paid: 240, balance: 240, status: "CONFIRMADA", createdAt: "2026-09-23T14:00:00Z" },
      { id: 200, serviceCode: "PISCINA", code: "PIS-200", clientId: 2, date: "2026-09-26", slot: "14:00", people: 4, total: 120, paid: 120, balance: 0, status: "CONFIRMADA", createdAt: "2026-09-21T10:00:00Z" },
      { id: 300, serviceCode: "MIRADOR", code: "MIR-300", clientId: 2, date: "2026-09-27", slot: "18:00", people: 2, total: 90, paid: 0, balance: 90, status: "RESERVADA", createdAt: "2026-09-23T10:00:00Z" },
      { id: 400, serviceCode: "TERRAZA", code: "TER-400", clientId: 1, date: "2026-09-20", slot: "20:00", people: 2, total: 180, paid: 180, balance: 0, status: "CANCELADA", createdAt: "2026-09-18T10:00:00Z" }
    ],
    events: [],
    payments: [
      { id: 1, bookingId: 100, reservationId: 100, amount: 240, method: "YAPE", status: "APROBADO", createdAt: "2026-09-23T14:00:00Z" }, // hace 1 h
      { id: 2, bookingId: 200, amount: 120, method: "PLIN", status: "APROBADO", createdAt: "2026-09-21T10:00:00Z" } // hace ~53 h (fuera de plazo)
    ],
    entitlements: [
      { id: 1, passId: 1, bookingId: 100, serviceCode: "HOSPEDAJE", status: "LISTO_INGRESO" },
      { id: 2, passId: 2, bookingId: 200, serviceCode: "PISCINA", status: "LISTO_INGRESO" }
    ],
    passes: [{ id: 1, code: "PP-A", status: "ACTIVO" }, { id: 2, code: "PP-B", status: "ACTIVO" }],
    cashMovements: [], refundRequests: [], audit: []
  };
}

// --- días hábiles (lunes a viernes, en hora de Lima) ---
assert.equal(addBusinessDays("2026-09-23T15:00:00Z", 2), "2026-09-25", "miércoles + 2 = viernes");
assert.equal(addBusinessDays("2026-09-25T15:00:00Z", 2), "2026-09-29", "viernes + 2 = martes");
assert.equal(addBusinessDays("2026-09-26T15:00:00Z", 2), "2026-09-29", "sábado + 2 = martes");
assert.equal(addBusinessDays("2026-09-27T15:00:00Z", 2), "2026-09-29", "domingo + 2 = martes");
assert.equal(addBusinessDays("2026-09-24T02:00:00Z", 2), "2026-09-25", "23 set 21:00 en Lima sigue siendo miércoles: + 2 = viernes");

// --- ventana de 24 horas ---
assert.equal(refundWindow("2026-09-23T14:00:00Z", T0).open, true);
assert.equal(refundWindow("2026-09-23T14:00:00Z", T0).hoursLeft, 23);
assert.equal(refundWindow("2026-09-22T15:00:00Z", T0).open, true, "justo a las 24 h todavía cuenta");
assert.equal(refundWindow("2026-09-22T14:59:00Z", T0).open, false, "a las 24 h y 1 min ya no");

// --- candidatas: solo reservas con dinero pagado y que no estén canceladas ---
const state = freshState();
const codes = buildRefundCandidates(state, {}, T0).map((row) => row.code).sort();
assert.deepEqual(codes, ["PIS-200", "RES-100"], "sin pagos (MIR-300) y canceladas (TER-400) no aparecen");
assert.equal(buildRefundCandidates(state, { q: "torres" }, T0).length, 1);
assert.equal(buildRefundCandidates(state, {}, T0).find((row) => row.code === "PIS-200").open, false);

// --- solicitud dentro del plazo (pago del 50 %) ---
const request = createRefundRequest(state, { type: "HOSPEDAJE", id: 100, reason: "El cliente se equivocó de fecha" }, reception, T0);
assert.equal(request.status, "SOLICITADA");
assert.equal(request.code, "DEV-0001");
assert.equal(request.paid, 240);
assert.equal(request.dueDate, "2026-09-25", "2 días hábiles desde la solicitud");
assert.equal(request.exception, false);
assert.equal(state.reservations[0].refundHold, "DEV-0001");
assert.equal(state.entitlements[0].status, "EN_REVISION", "el pase queda retenido mientras se resuelve");
assert.throws(() => createRefundRequest(state, { type: "HOSPEDAJE", id: 100, reason: "Otra vez la misma" }, reception, T0), /abierta/);
assert.equal(buildRefundCandidates(state, { q: "RES-100" }, T0)[0].openRequest.code, "DEV-0001");

// --- fuera de plazo: Recepción no puede; el dueño solo con excepción y motivo completo ---
assert.throws(() => createRefundRequest(state, { type: "PISCINA", id: 200, reason: "Quiere su dinero" }, reception, T0), (error) => error.status === 409 && /24 horas/.test(error.message));
assert.throws(() => createRefundRequest(state, { type: "PISCINA", id: 200, reason: "Quiere su dinero" }, owner, T0), /excepción del dueño/);
assert.throws(() => createRefundRequest(state, { type: "PISCINA", id: 200, reason: "abc", exception: true }, owner, T0), /mínimo 5/);
assert.throws(() => createRefundRequest(state, { type: "PISCINA", id: 200, reason: "Motivo", exception: true }, owner, T0), /mínimo 10/);
const exceptional = createRefundRequest(state, { type: "PISCINA", id: 200, reason: "Falla nuestra: la piscina estuvo cerrada", exception: true }, owner, T0);
assert.equal(exceptional.exception, true);

// --- otras validaciones ---
assert.throws(() => createRefundRequest(state, { type: "MIRADOR", id: 300, reason: "No pagó nada" }, reception, T0), /no tiene pagos/);
assert.throws(() => createRefundRequest(state, { type: "TERRAZA", id: 400, reason: "Ya cancelada" }, reception, T0), /pagos|admite/);
assert.throws(() => createRefundRequest(state, { type: "PISCINA", id: 999, reason: "No existe" }, reception, T0), /no encontrada/);

// --- decisión: solo se resuelve una vez, monto entre 0 y lo pagado ---
assert.throws(() => decideRefund(state, 1, { decision: "APROBAR", amount: 300 }, owner, T0), /no superar/);
assert.throws(() => decideRefund(state, 1, { decision: "APROBAR", amount: 100 }, owner, T0), /motivo/, "devolver menos exige motivo");
assert.throws(() => decideRefund(state, 1, { decision: "TAL VEZ" }, owner, T0), /apruebas o rechazas/);
assert.throws(() => completeRefund(state, 1, { method: "YAPE", operationRef: "123456" }, owner, T0), /aprobada/, "no se devuelve sin aprobar");

// rechazo: se libera la retención
const secondState = freshState();
const toReject = createRefundRequest(secondState, { type: "HOSPEDAJE", id: 100, reason: "Cambió de opinión" }, reception, T0);
assert.throws(() => decideRefund(secondState, toReject.id, { decision: "RECHAZAR" }, owner, T0), /motivo del rechazo/);
decideRefund(secondState, toReject.id, { decision: "RECHAZAR", note: "Ya usó el servicio" }, owner, T0);
assert.equal(secondState.refundRequests[0].status, "RECHAZADA");
assert.equal(secondState.reservations[0].refundHold, null);
assert.equal(secondState.entitlements[0].status, "LISTO_INGRESO", "el pase vuelve a su estado anterior");
assert.throws(() => decideRefund(secondState, toReject.id, { decision: "APROBAR" }, owner, T0), /ya fue resuelta/);

// aprobación + devolución
const approved = decideRefund(state, 1, { decision: "APROBAR" }, owner, hoursAfter(2));
assert.equal(approved.status, "APROBADA");
assert.equal(approved.refundAmount, 240, "por defecto se devuelve lo pagado");
assert.throws(() => completeRefund(state, 1, { method: "BITCOIN", operationRef: "123" }, owner, hoursAfter(30)), /Elige cómo/);
assert.throws(() => completeRefund(state, 1, { method: "YAPE" }, owner, hoursAfter(30)), /número de operación/);
const done = completeRefund(state, 1, { method: "YAPE", operationRef: "OP-889900" }, owner, hoursAfter(30));
assert.equal(done.request.status, "DEVUELTA");
assert.equal(done.statusBefore, "CONFIRMADA");
assert.equal(done.statusAfter, "CANCELADA");
assert.equal(state.reservations[0].status, "CANCELADA");
assert.equal(state.bookings[0].status, "CANCELADA", "la reserva de hospedaje sincroniza su booking");
assert.equal(state.reservations[0].refundedAmount, 240);
assert.equal(state.entitlements[0].status, "ANULADO");
assert.equal(state.passes[0].status, "ANULADO", "el pase QR queda anulado");
assert.equal(state.passes[1].status, "ACTIVO", "los demás pases no se tocan");
const movement = state.cashMovements[0];
assert.equal(movement.type, "EGRESO");
assert.equal(movement.serviceCode, "HOSPEDAJE", "el egreso se imputa al servicio de origen");
assert.equal(movement.category, "DEVOLUCION");
assert.equal(movement.amount, 240);
assert.equal(movement.reference, "OP-889900");
assert.throws(() => completeRefund(state, 1, { method: "YAPE", operationRef: "OP-1" }, owner, hoursAfter(31)), /aprobada/, "no se devuelve dos veces");

// devolución parcial con motivo
const thirdState = freshState();
const partial = createRefundRequest(thirdState, { type: "HOSPEDAJE", id: 100, reason: "Canceló la estadía" }, reception, T0);
const partialApproved = decideRefund(thirdState, partial.id, { decision: "APROBAR", amount: 200, note: "Se retiene S/ 40 por gestión" }, owner, T0);
assert.equal(partialApproved.refundAmount, 200);
assert.equal(completeRefund(thirdState, partial.id, { method: "EFECTIVO" }, owner, T0).movement.amount, 200, "en efectivo no exige número de operación");

// --- lista: Recepción solo ve lo suyo; vencidas y resumen ---
const listState = freshState();
createRefundRequest(listState, { type: "HOSPEDAJE", id: 100, reason: "Se equivocó de habitación" }, reception, T0);
createRefundRequest(listState, { type: "PISCINA", id: 200, reason: "Falla nuestra: la piscina estuvo cerrada", exception: true }, owner, T0);
const ownerView = listRefunds(listState, owner, T0);
assert.equal(ownerView.rows.length, 2);
assert.equal(ownerView.summary.toDecide, 2);
assert.equal(listRefunds(listState, reception, T0).rows.length, 1, "Recepción solo ve las que ella registró");
assert.equal(ownerView.summary.overdue, 0);
const later = listRefunds(listState, owner, new Date("2026-09-28T15:00:00Z"));
assert.equal(later.summary.overdue, 2, "pasada la fecha límite quedan vencidas");
assert.equal(later.rows.every((row) => row.overdue), true);

console.log("refunds: todas las pruebas pasaron");
