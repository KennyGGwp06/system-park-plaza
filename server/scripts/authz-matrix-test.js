import assert from "node:assert/strict";

const baseUrl = process.env.API_URL || "http://localhost:3000/api";
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];
const emails = {
  SUPERADMIN: "superadmin@parkplaza.com", RECEPCION: "recepcion@parkplaza.com", RESTAURANTE: "restaurante@parkplaza.com",
  BARTENDER: "bartender@parkplaza.com", LIMPIEZA: "limpieza@parkplaza.com", MANTENIMIENTO: "mantenimiento@parkplaza.com"
};
const tokens = {};
const results = [];
const failures = [];

async function login(role) {
  if (tokens[role]) return tokens[role];
  const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emails[role], password: passwordOf(emails[role]) }) });
  assert.equal(response.status, 200, `No se pudo iniciar sesión como ${role}`);
  tokens[role] = (await response.json()).token;
  return tokens[role];
}

async function call(role, method, path, body) {
  const token = await login(role);
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? (["POST", "PUT", "PATCH", "DELETE"].includes(method) ? "{}" : undefined) : JSON.stringify(body) });
  let json = null; try { json = await response.json(); } catch { /* sin cuerpo */ }
  return { status: response.status, json };
}

async function expectStatus(label, role, method, path, accepted, body) {
  const { status } = await call(role, method, path, body);
  const ok = Array.isArray(accepted) ? accepted.includes(status) : status === accepted;
  (ok ? results : failures).push(`${ok ? "OK  " : "FAIL"} ${label}: ${role} ${method} ${path} -> ${status} (esperado ${accepted})`);
}
const denied = (label, role, method, path, body) => expectStatus(label, role, method, path, 403, body);
const allowed = (label, role, method, path, body) => expectStatus(label, role, method, path, [200, 201], body);

// Personal de campo NO debe alcanzar operaciones de Recepción ni información financiera.
for (const role of ["LIMPIEZA", "MANTENIMIENTO", "RESTAURANTE", "BARTENDER"]) {
  await denied("Ruta de Recepción cerrada", role, "GET", "/reservations");
  await denied("Ruta de Recepción cerrada", role, "POST", "/reservations");
  await denied("Ruta de Recepción cerrada", role, "DELETE", "/reservations/1");
  await denied("Dashboard financiero cerrado", role, "GET", "/dashboard");
  await denied("Registro de accesos cerrado", role, "GET", "/access/logs");
  await denied("Reservas de servicio cerradas", role, "GET", "/service-bookings");
  await denied("Cochera cerrada", role, "POST", "/cochera/entries");
  await denied("Planilla cerrada", role, "GET", "/payroll/weekly");
  await denied("Configuración protegida", role, "PUT", "/configuracion");
  await denied("Usuarios protegidos", role, "POST", "/usuarios");
  await denied("Permisos protegidos", role, "PUT", "/roles/1/permissions");
}
for (const role of ["LIMPIEZA", "MANTENIMIENTO"]) await denied("Limpieza/Mantenimiento no operan pedidos", role, "PATCH", "/orders/1/status", { status: "LISTO" });

// Admin de Recepción: opera lo suyo, no gobierna el sistema.
for (const path of ["/reservations", "/dashboard", "/access/logs", "/service-bookings", "/events/spaces"]) await allowed("Recepción opera lo suyo", "RECEPCION", "GET", path);
await denied("Recepción no ve planilla", "RECEPCION", "GET", "/payroll/weekly");
await denied("Recepción no ve personal", "RECEPCION", "GET", "/employees");
await denied("Recepción no edita configuración", "RECEPCION", "PUT", "/configuracion", { hotelName: "X" });
await denied("Recepción no crea usuarios", "RECEPCION", "POST", "/usuarios");
await denied("Recepción no cambia permisos", "RECEPCION", "PUT", "/roles/1/permissions", { permissionIds: [] });
await denied("Recepción no lee auditoría de seguridad", "RECEPCION", "GET", "/superadmin/audit/verify");
await denied("Recepción no cambia producción de pedidos", "RECEPCION", "PATCH", "/orders/1/status", { status: "LISTO" });

// Vistas de solo lectura para Recepción: deben existir y NO filtrar dinero ni tarifas.
for (const role of ["LIMPIEZA", "MANTENIMIENTO", "RESTAURANTE", "BARTENDER"]) {
  await denied("Aforo de Recepción cerrado al personal de campo", role, "GET", "/reception/occupancy");
  await denied("Personal en turno cerrado al personal de campo", role, "GET", "/reception/on-shift");
  await denied("Tablero del turno cerrado al personal de campo", role, "GET", "/reception/desk");
  await denied("Planificación de habitaciones cerrada al personal de campo", role, "GET", "/reception/planning");
  await denied("Buscador de Recepción cerrado al personal de campo", role, "GET", "/reception/search?q=te");
  await denied("Agenda de reservas de Recepción cerrada al personal de campo", role, "GET", "/reception/reservations");
}
{
  for (const role of ["RECEPCION", "SUPERADMIN"]) {
    await allowed("Tablero del turno", role, "GET", "/reception/desk");
    await allowed("Planificación de habitaciones", role, "GET", "/reception/planning?days=14");
    await allowed("Buscador global de Recepción", role, "GET", "/reception/search?q=te");
    await allowed("Agenda de reservas de los 5 servicios", role, "GET", "/reception/reservations?range=todas&when=proximas");
  }
  // Cocina y Bar no ven costos ni precios (recetas, turno, pedidos y botellas); los pedidos tampoco traen la reserva del cliente.
  for (const [role, path] of [["RESTAURANTE", "/technical-recipes/manual/RESTAURANTE"], ["RESTAURANTE", "/operational-inventory/sessions"], ["RESTAURANTE", "/restaurante"], ["BARTENDER", "/technical-recipes/manual/BARTENDER"], ["BARTENDER", "/operational-inventory/sessions"], ["BARTENDER", "/bartender"], ["BARTENDER", "/bar/bottles"], ["BARTENDER", "/bar/bottles/references"], ["LIMPIEZA", "/cleaning/tasks"], ["MANTENIMIENTO", "/maintenance/reports"]]) {
    const station = await call(role, "GET", path);
    const leaks = /cost|price|"sale|"total"|"booking"/i.test(JSON.stringify(station.json || {}));
    (station.status === 200 && !leaks ? results : failures).push(`${station.status === 200 && !leaks ? "OK  " : "FAIL"} ${{ BARTENDER: "El bar", LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento" }[role] || "La cocina"} no recibe costos ni precios: ${role} GET ${path} -> ${station.status}${leaks ? " (incluye costos, precios o la reserva)" : ""}`);
  }
  const desk = await call("RECEPCION", "GET", "/reception/desk");
  const deskJson = JSON.stringify(desk.json || {});
  (!/cost|expense|gasto|utilidad|margin/i.test(deskJson) ? results : failures).push(`${!/cost|expense|gasto|utilidad|margin/i.test(deskJson) ? "OK  " : "FAIL"} El tablero de Recepción no expone costos ni gastos`);
  const occupancy = await call("RECEPCION", "GET", "/reception/occupancy");
  const occupancyText = JSON.stringify(occupancy.json || {});
  const okOccupancy = occupancy.status === 200 && Array.isArray(occupancy.json?.services) && occupancy.json.services.length === 5 && !/"(sales|expenses|profit|margin|receivable)"/.test(occupancyText);
  (okOccupancy ? results : failures).push(`${okOccupancy ? "OK  " : "FAIL"} Aforo de Recepción: 200, 5 servicios y sin ventas/gastos/utilidad -> ${occupancy.status}`);
  const onShift = await call("RECEPCION", "GET", "/reception/on-shift");
  const onShiftText = JSON.stringify(onShift.json || {});
  const okOnShift = onShift.status === 200 && Array.isArray(onShift.json?.rows) && !/dailyRate|tarifa|salary|pin/i.test(onShiftText);
  (okOnShift ? results : failures).push(`${okOnShift ? "OK  " : "FAIL"} Personal en turno: 200 y sin tarifas ni PIN (${onShift.json?.rows?.length ?? "?"} turnos hoy) -> ${onShift.status}`);
}

// Preparación y porcionado: solo Restaurante y Superadmin, sin costos para la cocina y siempre con turno abierto.
await denied("Bar no accede a preparación y porcionado", "BARTENDER", "GET", "/transformations/references");
await denied("Limpieza no accede a preparación y porcionado", "LIMPIEZA", "GET", "/transformations");
{
  const kitchen = await call("RESTAURANTE", "GET", "/transformations/references");
  const kitchenHistory = await call("RESTAURANTE", "GET", "/transformations");
  const kitchenText = JSON.stringify([kitchen.json, kitchenHistory.json]);
  const noCosts = kitchen.status === 200 && kitchenHistory.status === 200 && !/cost/i.test(kitchenText);
  (noCosts ? results : failures).push(`${noCosts ? "OK  " : "FAIL"} Cocina ve preparación y porcionado sin ningún campo de costo -> ${kitchen.status}/${kitchenHistory.status}`);
  const owner = await call("SUPERADMIN", "GET", "/transformations");
  (owner.status === 200 ? results : failures).push(`${owner.status === 200 ? "OK  " : "FAIL"} Superadmin sigue viendo preparación y porcionado -> ${owner.status}`);
  await expectStatus("Cocina no registra preparación sin turno abierto", "RESTAURANTE", "POST", "/transformations/processing", 409, {});
  await expectStatus("Cocina no registra porcionado sin turno abierto", "RESTAURANTE", "POST", "/transformations/portioning", 409, {});
  await expectStatus("Cocina no registra producción sin turno abierto", "RESTAURANTE", "POST", "/transformations/production", 409, {});
}

// Campana de Restaurante y Bar: solo pedidos atrasados de su área, sin datos financieros.
for (const role of ["RESTAURANTE", "BARTENDER"]) {
  const alerts = await call(role, "GET", "/gastronomy/alerts");
  const okAlerts = alerts.status === 200 && typeof alerts.json?.delayedOrders === "number" && Object.keys(alerts.json).length === 1;
  (okAlerts ? results : failures).push(`${okAlerts ? "OK  " : "FAIL"} Aviso de pedidos atrasados de ${role}: solo el contador -> ${alerts.status}`);
}
await denied("Limpieza no consulta avisos de pedidos", "LIMPIEZA", "GET", "/gastronomy/alerts");
await denied("Recepción no consulta el aviso de cocina", "RECEPCION", "GET", "/gastronomy/alerts");

// Devoluciones: solo Recepción solicita; solo el Superadmin aprueba y devuelve; el personal de campo no entra.
for (const role of ["LIMPIEZA", "MANTENIMIENTO", "RESTAURANTE", "BARTENDER"]) {
  await denied("Devoluciones cerradas al personal de campo", role, "GET", "/refunds");
  await denied("Búsqueda de devoluciones cerrada al personal de campo", role, "GET", "/refunds/candidates");
  await denied("El personal de campo no solicita devoluciones", role, "POST", "/refunds");
  await denied("El personal de campo no aprueba devoluciones", role, "POST", "/refunds/1/decision");
  await denied("El personal de campo no registra devoluciones", role, "POST", "/refunds/1/complete");
}
await denied("Recepción no aprueba devoluciones", "RECEPCION", "POST", "/refunds/1/decision");
await denied("Recepción no registra devoluciones", "RECEPCION", "POST", "/refunds/1/complete");
{
  const list = await call("RECEPCION", "GET", "/refunds");
  const okList = list.status === 200 && Array.isArray(list.json?.rows) && list.json.summary?.returnedAmountThisMonth === null;
  (okList ? results : failures).push(`${okList ? "OK  " : "FAIL"} Recepción ve sus solicitudes y no el total devuelto en dinero -> ${list.status}`);
  // En día cero no hay reservas pagadas: la comprobación necesita una y se informa como omitida (no como falla).
  const paidReservation = (await call("SUPERADMIN", "GET", "/reservations")).json.find((item) => Number(item.advance ?? item.paid ?? 0) > 0 && !["CANCELADA", "COMPLETADA", "NO_SHOW"].includes(item.status));
  if (paidReservation) await expectStatus("Recepción no cancela reservas con pago", "RECEPCION", "DELETE", `/reservations/${paidReservation.id}`, 409);
  else results.push("OK   Recepción no cancela reservas con pago -> omitida (no hay reservas pagadas; la cubre prueba:negocio)");
}

// Mi turno (Limpieza y Mantenimiento): el estado de la jornada incluye el marcaje de hoy y no filtra dinero.
for (const role of ["LIMPIEZA", "MANTENIMIENTO"]) {
  const current = await call(role, "GET", "/attendance/current");
  const okCurrent = current.status === 200 && "todayRecord" in (current.json || {}) && current.json.cash === 0;
  (okCurrent ? results : failures).push(`${okCurrent ? "OK  " : "FAIL"} Mi turno de ${role}: incluye todayRecord y el efectivo del día en 0 -> ${current.status}`);
}

// Restaurante y Bar mantienen su estación.
await allowed("Restaurante ve su producción", "RESTAURANTE", "GET", "/inventory/production-dashboard?area=RESTAURANTE");
await allowed("Bar ve su producción", "BARTENDER", "GET", "/inventory/production-dashboard?area=BARTENDER");

// Superadmin controla todo.
for (const path of ["/reservations", "/dashboard", "/access/logs", "/employees", "/payroll/weekly", "/superadmin/audit/verify", "/configuracion"]) await allowed("Superadmin ve todo", "SUPERADMIN", "GET", path);

// El registro de auditoría no se puede falsificar ni crear roles por la vía genérica.
await expectStatus("No se falsifica auditoría", "SUPERADMIN", "POST", "/auditoria", 405, { module: "X", action: "FALSO", detail: "x" });
await expectStatus("No se crean roles por la vía genérica", "SUPERADMIN", "POST", "/roles", 405, { name: "HACKER" });

// Rol Superadmin intocable y validación de datos.
const roles = (await call("SUPERADMIN", "GET", "/roles")).json || [];
const superRole = roles.find((role) => role.name === "SUPERADMIN");
assert.ok(superRole, "No se encontró el rol SUPERADMIN");
await expectStatus("No se vacían permisos del Superadmin", "SUPERADMIN", "PUT", `/roles/${superRole.id}/permissions`, 403, { permissionIds: [] });
const adminRole = roles.find((role) => role.name === "RESTAURANTE");
await expectStatus("permissionIds inválido devuelve 400 (no 500)", "SUPERADMIN", "PUT", `/roles/${adminRole.id}/permissions`, 400, {});

// Configuración: solo campos permitidos, con IGV validado y auditoría antes → después.
const settingsBefore = (await call("SUPERADMIN", "GET", "/configuracion")).json[0];
await expectStatus("IGV fuera de rango rechazado", "SUPERADMIN", "PUT", "/configuracion", 400, { taxRate: 500 });
const put = await call("SUPERADMIN", "PUT", "/configuracion", { hotelName: settingsBefore.hotelName, roomTypeMedia: "BASURA", experienceMedia: "BASURA" });
(put.status === 200 ? results : failures).push(`${put.status === 200 ? "OK  " : "FAIL"} PUT /configuracion con campos ajenos -> ${put.status}`);
const settingsAfter = (await call("SUPERADMIN", "GET", "/configuracion")).json[0];
(JSON.stringify(settingsAfter.roomTypeMedia) === JSON.stringify(settingsBefore.roomTypeMedia) ? results : failures).push(`${JSON.stringify(settingsAfter.roomTypeMedia) === JSON.stringify(settingsBefore.roomTypeMedia) ? "OK  " : "FAIL"} Campos ajenos (roomTypeMedia) no se sobrescriben por /configuracion`);

// Cambio real de configuración: queda auditado con antes → después y se restaura.
const probeName = `${settingsBefore.hotelName} (prueba)`;
await call("SUPERADMIN", "PUT", "/configuracion", { hotelName: probeName });
await call("SUPERADMIN", "PUT", "/configuracion", { hotelName: settingsBefore.hotelName });
const auditRows = (await call("SUPERADMIN", "GET", "/auditoria")).json || [];
const configEntry = auditRows.find((row) => row.module === "CONFIGURACION" && String(row.detail).includes("(prueba)"));
(configEntry && Array.isArray(configEntry.changes) && configEntry.changes.length ? results : failures).push(`${configEntry && configEntry.changes?.length ? "OK  " : "FAIL"} Cambio de configuración auditado con antes → después: ${configEntry?.detail || "sin registro"}`);

// La cadena de auditoría queda íntegra tras todas las operaciones anteriores.
const chain = (await call("SUPERADMIN", "GET", "/superadmin/audit/verify")).json;
(chain?.intact ? results : failures).push(`${chain?.intact ? "OK  " : "FAIL"} Cadena de auditoría íntegra: ${JSON.stringify({ total: chain?.total, encadenados: chain?.chained, sinFirma: chain?.unchained, rotos: chain?.broken?.length })}`);

console.log(results.join("\n"));
if (failures.length) { console.error(`\n${failures.length} FALLOS:\n${failures.join("\n")}`); process.exitCode = 1; }
else console.log(`\nPASSED: ${results.length} comprobaciones`);
