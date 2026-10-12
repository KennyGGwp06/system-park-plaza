import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = await readFile(path.join(root, "client/src/App.jsx"), "utf8");
const routePatterns = [
  ...appSource.matchAll(/\["(\/[^"?]+)"\s*,/g),
  ...appSource.matchAll(/<Route path="(\/[^"?]+)"/g)
].map((match) => match[1]);
const routes = new Set(routePatterns);
// El centro de dirección del dueño resuelve sus vistas con /superadmin/:modulo/:vista (superAdminNavigation.js).
const { findSuperAdminDestination } = await import(pathToFileURL(path.join(root, "client/src/modules/admin/superAdminNavigation.js")).href);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:js|jsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const missing = [];
for (const file of await sourceFiles(path.join(root, "client/src"))) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/(?:href|to)=(?:"|\{")(?<target>\/[^"}]+)(?:"|"\})/g)) {
    const target = match.groups.target.split(/[?#]/)[0];
    if (target.includes("${") || routes.has(target) || findSuperAdminDestination(target)) continue;
    missing.push(`${path.relative(root, file)} -> ${target}`);
  }
  assert.equal(/(?:href|to)=["'](?:#|)["']/.test(source), false, `${path.relative(root, file)} contiene un enlace vacío.`);
}

assert.deepEqual(missing, [], `Enlaces internos sin ruta:\n${missing.join("\n")}`);

// App del cliente (customer/src/app, JS nativo): cada botón tiene su acción, cada pantalla existe y cada
// ruta del servidor que usa la app está publicada. La app anterior (React) se retiró el 2026-09-27.
const appDir = path.join(root, "customer/src/app");
const appFiles = (await readdir(appDir)).filter((name) => name.endsWith(".js"));
const customerSource = (await Promise.all(appFiles.map((name) => readFile(path.join(appDir, name), "utf8")))).join("\n");
const customerEntries = (await readdir(path.join(root, "customer/src"))).sort();
assert.deepEqual(customerEntries, ["app", "main.js"], "customer/src solo debe tener la app actual (app/ y main.js).");
const handlers = new Set([...customerSource.matchAll(/["']([\w-]+)["']\s*:\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g)].map((match) => match[1]));
const actions = new Set([...customerSource.matchAll(/data-a=\\?"([\w-]+)\\?"/g)].map((match) => match[1]));
assert.deepEqual([...actions].filter((name) => !handlers.has(name)).sort(), [], "Hay botones de la app del cliente sin acción.");
const screensDefined = new Set([...customerSource.matchAll(/V\.(\w+)\s*=/g)].map((match) => match[1]));
const screensUsed = new Set([...customerSource.matchAll(/go\(\s*"(\w+)"/g)].map((match) => match[1]));
assert.deepEqual([...screensUsed].filter((name) => !screensDefined.has(name)).sort(), [], "La app del cliente navega a pantallas inexistentes.");
const serverSource = await readFile(path.join(root, "server/src/index.js"), "utf8");
const serverRoutes = [...serverSource.matchAll(/app\.(?:get|post|put|patch|delete)\("\/api(\/public\/[^"]+)"/g)].map((match) => new RegExp(`^${match[1].replace(/:[\w]+/g, "[^/]+")}$`));
const apiUsed = new Set([...customerSource.matchAll(/api\(\s*[`"](\/public\/[^`"?]+)/g)].map((match) => match[1].replace(/\$\{[^}]+\}/g, "x")));
assert.deepEqual([...apiUsed].filter((route) => !serverRoutes.some((pattern) => pattern.test(route))).sort(), [], "La app del cliente llama rutas del servidor que no existen.");
const portada = await readFile(path.join(appDir, "portada.js"), "utf8");
// Portada v7: una sola pantalla que entra a "servicios", donde están los cinco servicios con su botón de reserva.
assert.match(portada, /V\.home = /, "La portada debe existir.");
assert.match(portada, /V\.servicios = /, "La pantalla de servicios debe existir.");
assert.match(portada, /go\("servicios"\)/, "La portada debe entrar a los servicios.");
for (const svc of ["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"]) assert.match(portada, new RegExp(svc), `Servicios debe incluir ${svc}.`);
assert.match(portada, /data-a="start-exp"/, "Cada servicio debe tener su botón para reservar.");
assert.match(portada, /experienceMedia/, "La portada debe usar los textos e imágenes que edita el dueño.");
assert.match(customerSource, /catalog\(\)\.hotel/, "La app debe mostrar los datos y números de cobro que configura el dueño.");
assert.doesNotMatch(customerSource, /999 100 001|Av\. Centenario/, "No debe quedar ningún dato de pago o dirección inventado en la app.");
const screens = screensDefined;

console.log(`OK: ${routes.size} rutas ERP · app del cliente: ${screens.size} pantallas, ${actions.size} acciones y ${apiUsed.size} rutas del servidor conectadas.`);
