// Prueba de punta a punta de una devolución contra el servidor REAL (node scripts/refunds-e2e-test.js).
// Crea una reserva de prueba de Hospedaje con un pago del 50 % (fecha lejana, año 2031), la solicita como Recepción,
// la aprueba y la devuelve como Superadmin, y comprueba el efecto en reserva, dinero y auditoría.
// Deja como rastro: una reserva de prueba CANCELADA, un egreso "Devolución" y los registros de auditoría.
// Requiere que Rosa Recepción NO tenga turno abierto (la prueba marca su entrada y su salida).
import assert from "node:assert/strict";

const baseUrl = process.env.API_URL || "http://localhost:3000/api";
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];
const tokens = {};
const steps = [];
const ok = (text) => { steps.push(`OK  ${text}`); };

async function login(email) {
  if (tokens[email]) return tokens[email];
  const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: passwordOf(email) }) });
  assert.equal(response.status, 200, `login ${email}`);
  tokens[email] = (await response.json()).token;
  return tokens[email];
}
async function call(email, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${await login(email)}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await response.json(); } catch { /* sin cuerpo */ }
  return { status: response.status, json };
}
async function clock(dni, pin) {
  const response = await fetch(`${baseUrl}/attendance/clock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentNumber: dni, pin }) });
  return (await response.json()).action;
}

const OWNER = "superadmin@parkplaza.com";
const RECEPTION = "recepcion@parkplaza.com";
let clockedIn = false;
try {
  // 1) Reserva de prueba con el 50 % pagado (hoy → dentro de las 24 h)
  const clients = (await call(OWNER, "GET", "/clients")).json;
  const rooms = (await call(OWNER, "GET", "/rooms")).json.rooms;
  assert.ok(clients.length && rooms.length, "la base demo necesita clientes y habitaciones");
  let reservation = null;
  for (let attempt = 0; attempt < 12 && !reservation; attempt += 1) {
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0"); const day = 1 + Math.floor(Math.random() * 25);
    const created = await call(OWNER, "POST", "/reservations", { clientId: clients[0].id, roomId: rooms[0].id, checkInDate: `2031-${month}-${String(day).padStart(2, "0")}`, checkOutDate: `2031-${month}-${String(day + 2).padStart(2, "0")}`, adults: 1, totalPrice: 300, advance: 150, paymentMethod: "YAPE" });
    if (created.status === 201) reservation = created.json;
  }
  assert.ok(reservation, "no se pudo crear la reserva de prueba");
  ok(`Reserva de prueba ${reservation.code} creada con S/ 150 pagados de S/ 300 (pago del 50 %)`);

  // 2) Recepción: la reserva aparece con plazo abierto
  assert.equal(await clock("70000002", "2222"), "CHECK_IN"); clockedIn = true;
  const found = (await call(RECEPTION, "GET", `/refunds/candidates?q=${reservation.code}`)).json.rows.find((row) => row.code === reservation.code);
  assert.ok(found, "la reserva debe aparecer entre las que se pueden devolver");
  assert.equal(found.open, true); assert.equal(found.paid, 150); assert.ok(found.hoursLeft > 22 && found.hoursLeft <= 24);
  ok(`Recepción la ve con el plazo abierto (quedan ${Math.floor(found.hoursLeft)} h)`);

  // 3) Una reserva vieja ya no admite devolución: Recepción recibe 409, el dueño necesita excepción
  const old = (await call(RECEPTION, "GET", "/refunds/candidates?q=")).json.rows.find((row) => row.code !== reservation.code && !row.open);
  if (old) {
    const late = await call(RECEPTION, "POST", "/refunds", { type: old.type, id: old.id, reason: "Quiere su dinero de hace días" });
    assert.equal(late.status, 409); assert.match(late.json.message, /24 horas/);
    const lateOwner = await call(OWNER, "POST", "/refunds", { type: old.type, id: old.id, reason: "Quiere su dinero de hace días" });
    assert.equal(lateOwner.status, 409); assert.match(lateOwner.json.message, /excepción/);
    ok(`Fuera de plazo (${old.code}): Recepción y el dueño sin excepción reciben 409`);
  }

  // 4) Recepción registra la solicitud; queda retenida
  const request = await call(RECEPTION, "POST", "/refunds", { type: "HOSPEDAJE", id: reservation.id, reason: "El cliente se equivocó de fecha" });
  assert.equal(request.status, 201, JSON.stringify(request.json));
  assert.equal(request.json.status, "SOLICITADA"); assert.equal(request.json.paid, 150);
  ok(`Recepción registró ${request.json.code}; fecha límite ${request.json.dueDate} (2 días hábiles)`);
  assert.equal((await call(RECEPTION, "POST", "/refunds", { type: "HOSPEDAJE", id: reservation.id, reason: "Duplicada" })).status, 409);
  ok("Una segunda solicitud abierta para la misma reserva se rechaza");
  const blocked = await call(RECEPTION, "POST", "/checkin", { reservationId: reservation.id });
  assert.equal(blocked.status, 409); assert.match(blocked.json.message, /devolución en trámite/);
  ok("Con la solicitud abierta, el check-in queda bloqueado");

  // 5) Recepción NO puede decidir ni devolver dinero
  assert.equal((await call(RECEPTION, "POST", `/refunds/${request.json.id}/decision`, { decision: "APROBAR" })).status, 403);
  assert.equal((await call(RECEPTION, "POST", `/refunds/${request.json.id}/complete`, { method: "YAPE", operationRef: "OP-1" })).status, 403);
  const receptionView = (await call(RECEPTION, "GET", "/refunds")).json;
  assert.equal(receptionView.summary.returnedAmountThisMonth, null, "Recepción no ve el total devuelto en dinero");
  ok("Recepción no puede aprobar ni devolver, y no ve el total devuelto");

  // 6) El dueño aprueba y registra la devolución
  const spendBefore = ((await call(OWNER, "GET", "/caja")).json.summary.expenses) || 0;
  assert.equal((await call(OWNER, "POST", `/refunds/${request.json.id}/decision`, { decision: "APROBAR", amount: 500 })).status, 400);
  const approved = await call(OWNER, "POST", `/refunds/${request.json.id}/decision`, { decision: "APROBAR" });
  assert.equal(approved.json.status, "APROBADA"); assert.equal(approved.json.refundAmount, 150);
  assert.equal((await call(OWNER, "POST", `/refunds/${request.json.id}/complete`, { method: "YAPE" })).status, 400);
  const done = await call(OWNER, "POST", `/refunds/${request.json.id}/complete`, { method: "YAPE", operationRef: "OP-E2E-0001" });
  assert.equal(done.json.status, "DEVUELTA");
  ok("El dueño aprobó S/ 150 (mayor a lo pagado se rechaza) y registró la devolución con su número de operación");

  // 7) Efectos: reserva cancelada, egreso por servicio, auditoría
  const after = (await call(OWNER, "GET", "/reservations")).json.find((item) => item.id === reservation.id);
  assert.equal(after.status, "CANCELADA");
  ok("La reserva quedó CANCELADA");
  const caja = (await call(OWNER, "GET", "/caja")).json;
  assert.equal(Math.round((caja.summary.expenses - spendBefore) * 100) / 100, 150);
  const movement = caja.movements.find((item) => item.refundId === request.json.id);
  assert.equal(movement.serviceCode, "HOSPEDAJE"); assert.equal(movement.category, "DEVOLUCION"); assert.equal(movement.type, "EGRESO");
  ok("Se registró un egreso de S/ 150 ligado a Hospedaje, categoría Devolución");
  const audit = (await call(OWNER, "GET", "/auditoria")).json;
  for (const action of ["SOLICITAR", "APROBAR", "DEVOLVER"]) assert.ok(audit.some((row) => row.module === "DEVOLUCIONES" && row.action === action && String(row.detail).includes(request.json.code)), `auditoría ${action}`);
  ok("La auditoría registró solicitar, aprobar y devolver");
  assert.equal((await call(OWNER, "POST", `/refunds/${request.json.id}/complete`, { method: "YAPE", operationRef: "OP-E2E-0002" })).status, 409);
  ok("No se puede devolver dos veces la misma solicitud");
  const chain = (await call(OWNER, "GET", "/superadmin/audit/verify")).json;
  assert.equal(chain.intact, true);
  ok("La cadena de auditoría sigue íntegra");
} catch (error) {
  console.error(steps.join("\n"));
  console.error(`\nFALLÓ: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (clockedIn) { try { await clock("70000002", "2222"); } catch { /* ya cerrado */ } }
}
if (!process.exitCode) { console.log(steps.join("\n")); console.log(`\nPASSED: ${steps.length} comprobaciones de punta a punta`); }
