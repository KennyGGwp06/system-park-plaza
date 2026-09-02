import assert from "node:assert/strict";

const BASE = process.env.DEMO_API || "http://localhost:3000/api";
const PASSWORD = process.env.DEMO_STAFF_PASSWORD || "ParkPlaza123*";
const ATTENDANCE_PINS = { "recepcion@parkplaza.com": "2222", "limpieza@parkplaza.com": "5555", "mantenimiento@parkplaza.com": "6666" };
const runId = String(Date.now()).slice(-8);
const openedAttendance = [];
let testClient = null;
let superadmin = null;

function hotelDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${data?.message || "Error sin detalle"}`);
  return data;
}

async function login(email) {
  return api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
}

async function ensureAttendance(auth) {
  const current = await api("/attendance/current", { token: auth.token });
  if (current.active) return;
  await api("/attendance/self/clock", { method: "POST", token: auth.token, body: { documentNumber: auth.user.documentNumber, pin: ATTENDANCE_PINS[auth.user.email] } });
  openedAttendance.push(auth);
}

async function closeAttendance(auth) {
  await api("/attendance/self/clock", { method: "POST", token: auth.token, body: { documentNumber: auth.user.documentNumber, pin: ATTENDANCE_PINS[auth.user.email] } });
}

const result = [];
const pass = (name, detail) => result.push({ name, detail });

try {
  const health = await api("/health");
  assert.equal(health.database, "connected");
  const [reception, cleaning, maintenance, owner] = await Promise.all([
    login("recepcion@parkplaza.com"),
    login("limpieza@parkplaza.com"),
    login("mantenimiento@parkplaza.com"),
    login("superadmin@parkplaza.com")
  ]);
  superadmin = owner;
  // Attendance changes share the same operational state. Open them in sequence so
  // each role is guaranteed to keep its own active shift before work is assigned.
  await ensureAttendance(reception);
  await ensureAttendance(cleaning);
  await ensureAttendance(maintenance);
  pass("Accesos internos", "Recepción, Limpieza, Mantenimiento y Superadmin autenticados con permisos separados");

  const identity = await api("/public/identify", { method: "POST", body: {
    documentType: "DNI", documentNumber: `97${runId.slice(-6)}`, firstName: "Conectividad", lastName: "Park Plaza",
    phone: `9${runId}`.slice(0, 9), email: `conectividad-${runId}@parkplaza.test`
  } });
  testClient = identity.client;
  const today = hotelDate();
  const rooms = await api(`/public/rooms?checkIn=${today}&checkOut=${hotelDate(1)}`);
  assert.ok(rooms.length, "No existe una habitación libre para la prueba de conectividad");
  const room = rooms[0];
  const reservationResult = await api("/public/bookings", { method: "POST", token: identity.token, body: {
    serviceCode: "HOSPEDAJE", planCode: "FLEX", planName: "Flexible", roomId: room.id,
    checkIn: today, checkOut: hotelDate(1), date: today, slot: "15:00", people: 1, adults: 1,
    children: 0, extras: [], total: Number(room.price), payMode: "FULL", paymentMethod: "YAPE"
  } });
  const stay = await api("/checkin", { method: "POST", token: reception.token, body: { reservationId: reservationResult.booking.id } });
  assert.equal(stay.status, "ACTIVA");
  pass("Cliente → Recepción", `Reserva ${reservationResult.booking.code} visible y check-in realizado en habitación ${room.number}`);

  const [poolAvailability, lookoutAvailability, catalog] = await Promise.all([
    api(`/public/availability/PISCINA?from=${hotelDate(2)}`),
    api(`/public/availability/MIRADOR?from=${hotelDate(2)}`),
    api("/public/catalog")
  ]);
  const poolSlot = poolAvailability.flatMap((day) => day.slots.map((slot) => ({ date: day.date, ...slot }))).find((slot) => Number(slot.remaining) >= 1);
  const lookoutSlot = lookoutAvailability.flatMap((day) => day.slots.map((slot) => ({ date: day.date, ...slot }))).find((slot) => Number(slot.remaining) >= 1);
  assert.ok(poolSlot, "No existe un horario de Piscina disponible para la prueba");
  assert.ok(lookoutSlot, "No existe un horario de Mirador disponible para la prueba");

  const poolResult = await api("/public/bookings", { method: "POST", token: identity.token, body: {
    serviceCode: "PISCINA", planCode: "ADULTO", planName: "Pase adulto", date: poolSlot.date,
    checkIn: poolSlot.date, checkOut: poolSlot.date, slot: poolSlot.time, people: 1, adults: 1,
    children: 0, extras: [], preorderItems: [], paymentMethod: "YAPE", payMode: "FULL"
  } });
  const poolAccess = await api("/access/validate", { method: "POST", token: reception.token, body: {
    code: poolResult.pass.code, serviceCode: "PISCINA", people: 1
  } });
  assert.equal(poolAccess.valid, true);

  const lookoutResult = await api("/public/bookings", { method: "POST", token: identity.token, body: {
    serviceCode: "MIRADOR", planCode: "ACCESO", planName: "Solo acceso", date: lookoutSlot.date,
    checkIn: lookoutSlot.date, checkOut: lookoutSlot.date, slot: lookoutSlot.time, people: 1, adults: 1,
    children: 0, extras: [], preorderItems: [], paymentMethod: "PLIN", payMode: "FULL"
  } });
  const lookoutAccess = await api("/access/validate", { method: "POST", token: reception.token, body: {
    code: lookoutResult.pass.code, serviceCode: "MIRADOR", people: 1
  } });
  assert.equal(lookoutAccess.valid, true);

  const eventSpace = catalog.eventSpaces?.[0];
  assert.ok(eventSpace, "No existe un ambiente de Eventos configurado");
  const eventDate = hotelDate(60 + Number(runId.slice(-3)));
  const eventResult = await api("/public/event-bookings", { method: "POST", token: identity.token, body: {
    name: `Evento conectividad ${runId}`, type: "EMPRESARIAL", spaceId: eventSpace.id,
    startsAt: `${eventDate}T18:00:00`, endsAt: `${eventDate}T20:00:00`, guests: 2,
    layout: "IMPERIAL", catering: [], equipment: [], vehicles: [], estimatedTotal: Number(eventSpace.basePrice || 900),
    paymentMethod: "YAPE"
  } });
  assert.ok(Number(eventResult.event.balance) > 0, "El evento no generó el saldo restante esperado");
  await api(`/public/events/${eventResult.event.id}/pay-balance`, { method: "POST", token: identity.token, body: { paymentMethod: "PLIN" } });
  const eventAccess = await api("/access/validate", { method: "POST", token: reception.token, body: {
    code: eventResult.pass.code, serviceCode: "EVENTOS", people: 2
  } });
  assert.equal(eventAccess.valid, true);
  pass("Piscina, Mirador y Eventos", "Reservas pagadas, permisos activados y tres QR validados por Recepción");

  const [cleaningRequest, maintenanceRequest, receptionRequest] = await Promise.all([
    api("/public/requests", { method: "POST", token: identity.token, body: { type: "LIMPIEZA", description: "Cambio de toallas de prueba", priority: "MEDIA" } }),
    api("/public/requests", { method: "POST", token: identity.token, body: { type: "MANTENIMIENTO", description: "Revisión de control remoto de prueba", priority: "ALTA" } }),
    api("/public/requests", { method: "POST", token: identity.token, body: { type: "CONSERJERIA", description: "Consulta de transporte de prueba", priority: "BAJA" } })
  ]);
  assert.ok(cleaningRequest.taskId);
  pass("Cliente → áreas internas", "Limpieza creó tarea; Mantenimiento creó incidencia; Conserjería llegó a Recepción");

  const receptionTasks = await api("/reception/tasks", { token: reception.token });
  const cleaningTask = receptionTasks.find((item) => Number(item.id) === Number(cleaningRequest.taskId));
  assert.ok(cleaningTask);
  const preAcceptedCleaningQueue = await api("/cleaning/tasks", { token: cleaning.token });
  assert.ok(preAcceptedCleaningQueue.some((item) => Number(item.id) === Number(cleaningTask.id)), "La tarea autoasignada no llegó a Limpieza");
  let cleaningBlockedBeforeReception = false;
  try { await api(`/cleaning/tasks/${cleaningTask.id}/start`, { method: "PATCH", token: cleaning.token, body: {} }); } catch (error) { cleaningBlockedBeforeReception = error.message.includes("409"); }
  assert.ok(cleaningBlockedBeforeReception, "Limpieza pudo iniciar antes de la aceptación de Recepción");
  const cleaningEmployees = await api("/reception/cleaning-employees", { token: reception.token });
  const cleaner = cleaningEmployees.find((item) => Number(item.id) === Number(cleaning.user.id));
  assert.ok(cleaner);
  await api(`/reception/tasks/${cleaningTask.id}/assign`, { method: "PATCH", token: reception.token, body: { employeeId: cleaner.id } });
  assert.ok((await api("/cleaning/tasks", { token: cleaning.token })).some((item) => Number(item.id) === Number(cleaningTask.id)));
  await api(`/cleaning/tasks/${cleaningTask.id}/start`, { method: "PATCH", token: cleaning.token, body: {} });
  for (const area of ["BAÑO", "CUARTO", "REFRI / DESPENSA"]) {
    for (const stage of ["ENTRADA", "SALIDA"]) {
      await api(`/cleaning/tasks/${cleaningTask.id}/evidence`, { method: "POST", token: cleaning.token, body: { area, stage, description: `${stage}: ${area} verificado`, files: [{ fileUrl: "/demo-evidence.svg", name: `limpieza-${area}-${stage}.svg` }] } });
    }
  }
  await api(`/cleaning/tasks/${cleaningTask.id}/finish`, { method: "PATCH", token: cleaning.token, body: {} });
  pass("Recepción → Limpieza → Cliente", `${cleaningTask.code} fue asignada, atendida con evidencia y finalizada`);

  const reports = await api("/reports", { token: reception.token });
  assert.ok(reports.reports.some((item) => Number(item.id) === Number(maintenanceRequest.id)));
  assert.ok(reports.reports.some((item) => Number(item.id) === Number(receptionRequest.id)));
  assert.ok(!(await api("/maintenance/reports", { token: maintenance.token })).some((item) => Number(item.id) === Number(maintenanceRequest.id)), "Mantenimiento vio una incidencia antes de ser asignada");
  const maintenanceEmployees = await api("/reception/maintenance-employees", { token: reception.token });
  const technician = maintenanceEmployees.find((item) => Number(item.id) === Number(maintenance.user.id));
  assert.ok(technician);
  await api(`/reception/reports/${maintenanceRequest.id}/assign-maintenance`, { method: "PATCH", token: reception.token, body: { employeeId: technician.id } });
  assert.ok((await api("/maintenance/reports", { token: maintenance.token })).some((item) => Number(item.id) === Number(maintenanceRequest.id)));
  await api(`/maintenance/reports/${maintenanceRequest.id}/start`, { method: "PATCH", token: maintenance.token, body: {} });
  await api(`/maintenance/reports/${maintenanceRequest.id}/evidence`, { method: "POST", token: maintenance.token, body: { stage: "ANTES", files: [{ fileUrl: "/demo-evidence.svg", name: "mantenimiento-antes.svg" }] } });
  await api(`/maintenance/reports/${maintenanceRequest.id}/evidence`, { method: "POST", token: maintenance.token, body: { stage: "DESPUES", files: [{ fileUrl: "/demo-evidence.svg", name: "mantenimiento-despues.svg" }] } });
  await api(`/maintenance/reports/${maintenanceRequest.id}/finish`, { method: "PATCH", token: maintenance.token, body: { workDescription: "Control revisado y funcionamiento validado", observations: "Prueba automática" } });
  await api(`/reports/${receptionRequest.id}/status`, { method: "PATCH", token: reception.token, body: { status: "RESUELTO" } });
  pass("Recepción → Mantenimiento → Cliente", `${maintenanceRequest.code} fue asignada, reparada con evidencia y cerrada por el técnico`);

  const experience = await api("/public/my-experience", { token: identity.token });
  const testedIds = new Set([cleaningRequest.id, maintenanceRequest.id, receptionRequest.id].map(Number));
  const customerRequests = experience.requests.filter((item) => testedIds.has(Number(item.id)));
  assert.equal(customerRequests.length, 3);
  assert.ok(customerRequests.every((item) => ["RESUELTO", "SOLUCIONADO"].includes(item.status)));
  const ownerState = await api("/superadmin/control-state", { token: owner.token });
  assert.ok(ownerState.requests.some((item) => Number(item.id) === Number(maintenanceRequest.id)));
  assert.ok(ownerState.tasks.some((item) => Number(item.id) === Number(cleaningTask.id)));
  assert.ok(ownerState.bookings.some((item) => Number(item.id) === Number(poolResult.booking.id)));
  assert.ok(ownerState.bookings.some((item) => Number(item.id) === Number(lookoutResult.booking.id)));
  assert.ok(ownerState.events.some((item) => Number(item.id) === Number(eventResult.event.id)));
  pass("Retorno y supervisión", "El cliente ve tres solicitudes resueltas y Superadmin conserva tareas, responsables y estados");

  console.log(JSON.stringify({ status: "PASSED", tests: result.length, results: result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", completed: result, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
} finally {
  for (const auth of openedAttendance.reverse()) await closeAttendance(auth).catch(() => {});
  if (testClient && superadmin) await api(`/clients/${testClient.id}`, { method: "DELETE", token: superadmin.token, body: { confirmDocument: testClient.documentNumber } }).catch((error) => console.error(`No se pudo limpiar el cliente de prueba: ${error.message}`));
}
