import assert from "node:assert/strict";
import { menuByRole, permissionForHref } from "../src/constants/menu.js";

const receptionPermissions = new Set([
  "DASHBOARD:VER", "CAJA:VER", "RESTAURANTE:VER", "BARTENDER:VER",
  "RECEPCION:VER", "RESERVAS:VER", "CHECK_IN:VER", "CLIENTES:VER",
  "PAGOS:VER", "FACTURACION:VER", "ACCESOS:VER", "EVENTOS:VER",
  "COCHERA:VER", "HABITACIONES:VER", "LIMPIEZA:VER", "REPORTES:VER"
]);

const criticalRoutes = {
  "/admin-panel": "DASHBOARD:VER",
  "/admin-panel/mi-caja": "CAJA:VER",
  "/control-gastronomico/restaurante": "RESTAURANTE:VER",
  "/control-gastronomico/bar": "BARTENDER:VER"
};

for (const [route, expectedPermission] of Object.entries(criticalRoutes)) {
  assert.equal(permissionForHref(route), expectedPermission, `${route} debe usar ${expectedPermission}`);
  assert.ok(receptionPermissions.has(expectedPermission), `Recepción debe poder abrir ${route}`);
}

for (const [, href] of menuByRole.ADMINISTRADOR) {
  const permission = permissionForHref(href);
  if (permission) assert.ok(receptionPermissions.has(permission), `El menú de Recepción no debe mostrar una ruta bloqueada: ${href} (${permission})`);
}

console.log("Contrato de accesos críticos de Recepción: OK");
