// Contrato de accesos de las estaciones (2026-09-27): cada rol aterriza en una ruta que puede abrir, Recepción tiene
// los permisos de todas sus pantallas y los menús de las estaciones solo enlazan rutas que existen.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HOME_BY_ROLE } from "../src/constants/roles.js";

const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
const app = await read("App.jsx");
const RECEPTION = ["SUPERADMIN", "ADMINISTRADOR"];
const routes = [...app.matchAll(/\["(\/[^"]*)",\s*"([A-Z_]+:[A-Z]+)",\s*<[^\]]*?,\s*(RECEPTION|\[[^\]]*\])\]/g)].map(([, path, permission, roles]) => ({
  path, permission, roles: roles === "RECEPTION" ? RECEPTION : JSON.parse(roles)
}));
assert.ok(routes.length > 30, `Se esperaban las rutas de las estaciones y se leyeron ${routes.length}.`);
const byPath = new Map(routes.map((route) => [route.path, route]));

for (const [role, home] of Object.entries(HOME_BY_ROLE)) {
  const route = byPath.get(home);
  assert.ok(route, `${role} aterriza en ${home}, que no es una ruta.`);
  assert.ok(route.roles.includes(role), `${role} no puede abrir su inicio ${home}.`);
}

const receptionPermissions = new Set(["DASHBOARD:VER", "CAJA:VER", "RESTAURANTE:VER", "BARTENDER:VER", "RECEPCION:VER", "RESERVAS:VER", "CHECK_IN:VER", "CLIENTES:VER", "PAGOS:VER", "FACTURACION:VER", "ACCESOS:VER", "EVENTOS:VER", "COCHERA:VER", "HABITACIONES:VER", "LIMPIEZA:VER", "MANTENIMIENTO:VER", "REPORTES:VER"]);
for (const route of routes.filter((item) => item.roles.includes("ADMINISTRADOR"))) {
  assert.ok(receptionPermissions.has(route.permission), `Recepción no tiene ${route.permission} para ${route.path}.`);
}

// Menús de Cocina, Bar y Operaciones, sus redirecciones de rutas antiguas y los enlaces fijos de Recepción.
const { KITCHEN_MODULES, BAR_MODULES, KITCHEN_LEGACY_REDIRECTS, BAR_LEGACY_REDIRECTS } = await import("../src/modules/cocina/kitchenNavigation.js");
const { OPS_STATIONS, OPS_LEGACY_REDIRECTS } = await import("../src/modules/operaciones/opsNavigation.js");
const menuLinks = [KITCHEN_MODULES, BAR_MODULES, ...Object.values(OPS_STATIONS).map((station) => station.modules)].flat().flatMap((module) => module.items.map((item) => item[1]));
const redirectTargets = Object.values({ ...KITCHEN_LEGACY_REDIRECTS, ...BAR_LEGACY_REDIRECTS, ...OPS_LEGACY_REDIRECTS });
const reception = await read("modules/recepcion/ReceptionShell.jsx");
const receptionLinks = [...reception.matchAll(/(?:to=|navigate\()"(\/[^"?#]*)/g)].map((match) => match[1]);
const links = new Set([...menuLinks, ...redirectTargets, ...receptionLinks].map((href) => href.split(/[?#]/)[0]));
const broken = [...links].filter((href) => !byPath.has(href));
assert.deepEqual(broken, [], `Los menús de las estaciones enlazan rutas inexistentes: ${broken.join(", ")}`);

console.log(`Contrato de accesos: OK (${routes.length} rutas, ${Object.keys(HOME_BY_ROLE).length} inicios por rol, ${links.size} enlaces de estación).`);
