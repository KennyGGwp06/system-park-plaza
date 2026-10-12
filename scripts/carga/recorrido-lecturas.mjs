// Recorre TODAS las rutas GET del servidor con cada rol del personal y con un cliente, y reporta las que
// fallan con error 500. Sirve para detectar código que intenta modificar el estado compartido (congelado)
// al leer. Uso: API=http://localhost:3100/api node scripts/carga/recorrido-lecturas.mjs
import { readFile } from "node:fs/promises";
const API = process.env.API || "http://localhost:3000/api";
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];
const src = await readFile(new URL("../../server/src/index.js", import.meta.url), "utf8");
const routes = [...new Set([...src.matchAll(/app\.get\("\/api(\/[^"]+)"/g)].map((m) => m[1]))];
const RESOURCES = ["clients", "events", "eventos", "restaurante", "bartender", "cleaning", "products", "proveedores", "compras", "orders", "cochera", "pagos", "facturacion", "auditoria", "usuarios", "roles", "pool", "requests"];
const TYPES = ["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const expand = (route) => {
  if (route.includes(":resource")) return RESOURCES.map((r) => route.replace(":resource", r));
  if (route.includes(":type")) return TYPES.map((t) => route.replace(":type", t).replace(/:\w+/g, "1"));
  return [route.replace(":serviceCode", "PISCINA").replace(":code", "PP-0001").replace(/:\w+/g, "1")];
};
const login = async (email) => {
  const response = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: passwordOf(email) }) });
  if (email === "admin@parkplaza.com" && [401, 403].includes(response.status)) return null;
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(`No inició sesión ${email}: HTTP ${response.status}`);
  return data.token;
};
const client = async () => {
  if (!process.env.TEST_CLIENT_DNI) return null;
  const response = await fetch(`${API}/public/document-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentNumber: process.env.TEST_CLIENT_DNI }) });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error("TEST_CLIENT_DNI no corresponde a un cliente registrado");
  return data.token;
};
const who = { superadmin: "superadmin@parkplaza.com", admin: "admin@parkplaza.com", recepcion: "recepcion@parkplaza.com", restaurante: "restaurante@parkplaza.com", bartender: "bartender@parkplaza.com", limpieza: "limpieza@parkplaza.com", mantenimiento: "mantenimiento@parkplaza.com" };
const tokens = { publico: null };
const clientToken = await client();
if (clientToken) tokens.cliente = clientToken;
for (const [k, email] of Object.entries(who)) { const token = await login(email); if (token) tokens[k] = token; }
const bad = [], count = { total: 0 };
const query = `?from=${today}&checkIn=${today}&checkOut=${today}&date=${today}`;
for (const [role, token] of Object.entries(tokens)) {
  for (const route of routes.flatMap(expand)) {
    if (/qr|pdf|export|download|socket/i.test(route)) continue;
    const r = await fetch(`${API}${route}${route.includes("?") ? "" : query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    count.total++;
    if (r.status >= 500) { const body = await r.text(); bad.push({ role, route, status: r.status, body: body.slice(0, 160) }); } else await r.arrayBuffer();
  }
}
console.log(`${count.total} lecturas · ${routes.length} rutas · ${Object.keys(tokens).length} identidades · errores 500: ${bad.length}`);
for (const b of bad) console.log(JSON.stringify(b));
process.exitCode = bad.length ? 1 : 0;
