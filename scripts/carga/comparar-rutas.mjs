// Compara las respuestas de TODAS las rutas GET entre dos servidores con los mismos datos (p. ej. antes y
// después de archivar). Sirve para comprobar que el historial no cambia lo que ve nadie.
// Uso: A=http://localhost:3201/api B=http://localhost:3200/api node scripts/carga/comparar-rutas.mjs
import { readFile } from "node:fs/promises";
const A = process.env.A, B = process.env.B;
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];
const src = await readFile(new URL("../../server/src/index.js", import.meta.url), "utf8");
const routes = [...new Set([...src.matchAll(/app\.get\("\/api(\/[^"]+)"/g)].map((m) => m[1]))];
const RESOURCES = ["clients", "events", "eventos", "restaurante", "bartender", "cleaning", "products", "proveedores", "compras", "orders", "cochera", "pagos", "facturacion", "auditoria", "usuarios", "roles", "pool", "requests"];
const TYPES = ["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"];
const expand = (route) => route.includes(":resource") ? RESOURCES.map((r) => route.replace(":resource", r))
  : route.includes(":type") ? TYPES.map((t) => route.replace(":type", t).replace(/:\w+/g, "141"))
  : [route.replace(":serviceCode", "PISCINA").replace(":code", "PP-0001").replace(":documentNumber", "40222333").replace(/:\w+/g, "78")];
const extra = ["/superadmin/reservations?range=todas&pageSize=100", "/superadmin/reservations?range=7", "/superadmin/home?days=7", "/superadmin/home?days=30", "/reception/reservations?range=todas&pageSize=100&when=", "/superadmin/clients/78/profile", "/superadmin/control-tower?days=14"];
const login = async (api, email) => (await (await fetch(`${api}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: passwordOf(email) }) })).json()).token;
const clientToken = async (api) => (await (await fetch(`${api}/public/document-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentNumber: "40222333" }) })).json()).token;
// Lo que cambia solo por el reloj (horas de generación, minutos transcurridos) no cuenta como diferencia.
const VOLATILE = /^(generatedAt|at|now|updatedAt|elapsedMinutes|remainingMinutes|minutesAgo|lastSeen|serverTime|time|clock|hash|token|expiresAt|repairedAt|migrated_at)$/;
const norm = (v) => Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => !VOLATILE.test(k)).map((k) => [k, norm(v[k])])) : v;
const ids = { superadmin: "superadmin@parkplaza.com", recepcion: "recepcion@parkplaza.com", restaurante: "restaurante@parkplaza.com", limpieza: "limpieza@parkplaza.com" };
let same = 0; const diffs = [];
for (const [role, email] of Object.entries({ ...ids, cliente: null })) {
  const [ta, tb] = email ? [await login(A, email), await login(B, email)] : [await clientToken(A), await clientToken(B)];
  for (const route of [...routes.flatMap(expand), ...extra]) {
    if (/qr|pdf|export|download|socket|health|inventory-admin\/dashboard|control-state|^\/dashboard/i.test(route)) continue; // inventory-admin/dashboard lista eventos de seguridad de cada pedido; control-state y /dashboard no los usa ninguna pantalla
    const get = async (api, t) => { const r = await fetch(api + route, { headers: { authorization: `Bearer ${t}` } }); const text = await r.text(); let body; try { body = norm(JSON.parse(text)); } catch { body = text; } return { status: r.status, body: JSON.stringify(body) }; };
    const [ra, rb] = await Promise.all([get(A, ta), get(B, tb)]);
    if (ra.status === rb.status && ra.body === rb.body) { same++; continue; }
    let at = 0; while (at < ra.body.length && ra.body[at] === rb.body[at]) at++;
    diffs.push({ role, route, status: `${ra.status}/${rb.status}`, A: ra.body.slice(Math.max(0, at - 60), at + 80), B: rb.body.slice(Math.max(0, at - 60), at + 80) });
  }
}
console.log(`iguales: ${same} · distintas: ${diffs.length}`);
for (const d of diffs) console.log(JSON.stringify(d));
