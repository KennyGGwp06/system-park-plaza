import assert from "node:assert/strict";

const baseUrl = process.env.API_URL || "http://localhost:3000/api";
const password = process.env.DEMO_STAFF_PASSWORD || "ParkPlaza123*";
const results = [];
const pass = (name, detail) => results.push({ name, detail });

async function login(email) {
  const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, `No se pudo iniciar sesión como ${email}`);
  return (await response.json()).token;
}

async function expectForbidden(name, email, method, path) {
  const token = await login(email);
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? "{}" : undefined });
  assert.equal(response.status, 403, `${name}: se esperaba 403 y se recibió ${response.status}`);
  pass(name, `${email} fue rechazado por backend con HTTP 403.`);
}

async function expectNoErpAccess(name, email) {
  const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 401, `${name}: se esperaba 401 y se recibió ${response.status}`);
  pass(name, `${email} no puede iniciar sesión en el ERP (HTTP 401); sus evidencias las registra el Admin de recepción.`);
}

try {
  await expectForbidden("Recepción no ve costos centrales", "recepcion@parkplaza.com", "GET", "/inventory-admin/dashboard");
  await expectForbidden("Cocina no crea compras", "restaurante@parkplaza.com", "POST", "/purchasing/orders");
  await expectForbidden("Bar no administra recetas", "bartender@parkplaza.com", "GET", "/technical-recipes");
  await expectForbidden("Cocina no opera botellas", "restaurante@parkplaza.com", "GET", "/bar/bottles");
  await expectForbidden("Bar no procesa producción de cocina", "bartender@parkplaza.com", "POST", "/transformations/processing");
  await expectNoErpAccess("Limpieza no tiene ERP independiente", "limpieza@parkplaza.com");
  await expectForbidden("Cocina no reabre cierres", "restaurante@parkplaza.com", "POST", "/operational-inventory/sessions/999/reopen");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const adminToken = await login("admin@parkplaza.com");
  const dashboard = await fetch(`${baseUrl}/inventory-admin/dashboard`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(dashboard.status, 200, "Administración debe consultar su dashboard");
  const audit = (await dashboard.json()).audit || [];
  assert.ok(audit.some((event) => event.eventType === "AUTHORIZATION_REJECTED"), "Los rechazos deben quedar en auditoría relacional");
  pass("Rechazos auditados", "El dashboard administrativo recuperó eventos AUTHORIZATION_REJECTED registrados por el backend.");
  console.log(JSON.stringify({ status: "PASSED", tests: results.length, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "FAILED", completed: results, message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
}
