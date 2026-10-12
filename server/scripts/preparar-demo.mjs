// Deja el sistema listo para una demostración (2026-10-12). Usa la API con la cuenta del dueño, es decir, hace lo
// mismo que el dueño haría desde su panel; sirve igual en local y en la nube:
//   1. Habilita la venta de cada plato o bebida que tiene receta técnica activa y porciones disponibles
//      (en día cero solo 2 de ~90 estaban habilitados y la carta del cliente se veía vacía).
//   2. Informa lo que queda pendiente y es decisión del dueño: RUC y razón social para los comprobantes,
//      números reales de Yape/Plin y dirección del hotel.
// Uso:  node server/scripts/preparar-demo.mjs        (en el servidor: docker compose ... exec backend node scripts/preparar-demo.mjs)
//       API=https://erp.tudominio.com/api node server/scripts/preparar-demo.mjs   (entra como superadmin/superadmin)
const API = process.env.API || "http://localhost:3000/api";
const PASSWORD = process.env.STAFF_PASSWORD || "superadmin";
const EMAIL = process.env.OWNER_EMAIL || "superadmin@parkplaza.com";

async function call(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.message || ""}`);
  return data;
}

const token = (await call("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } })).token;
let enabled = 0, already = 0, skipped = 0;
for (const area of ["RESTAURANTE", "BARTENDER"]) {
  const manual = await call(`/technical-recipes/manual/${area}`, { token });
  const rows = Array.isArray(manual) ? manual : manual.rows || manual.recipes || [];
  const menu = await call("/admin/menu-items", { token });
  const items = Array.isArray(menu) ? menu : menu.rows || menu.items || [];
  for (const recipe of rows) {
    const item = items.find((row) => Number(row.id) === Number(recipe.menuItemId));
    if (!item || item.active === false) { skipped++; continue; }
    if (Number(recipe.availablePortions || 0) <= 0) { skipped++; continue; }
    if (item.salesEnabled === true) { already++; continue; }
    await call(`/admin/menu-items/${item.id}/sales-enabled`, { token, method: "PATCH", body: { salesEnabled: true } });
    enabled++;
    console.log(`  + ${area === "BARTENDER" ? "Bar" : "Cocina"}: ${item.name} (${recipe.availablePortions} porciones)`);
  }
}
const catalog = await call("/public/catalog");
console.log(`\nVenta habilitada: ${enabled} nuevos, ${already} ya estaban. Sin receta activa o sin insumos: ${skipped}.`);
console.log(`La carta del cliente muestra ${catalog.menu.length} productos.`);

const billing = await call("/facturacion/configuration", { token });
const settings = (await call("/configuracion", { token }))[0] || {};
const pending = [];
if (billing.issuer?.rucIsDemo) pending.push("RUC y razón social del hotel (Configuración general › Datos de la empresa): los comprobantes usan un RUC de prueba.");
if (!settings.address) pending.push("Dirección del hotel (Configuración general).");
if (String(settings.yapeNumber || "").startsWith("9991000")) pending.push("Números reales de Yape y Plin (hoy son de demostración).");
if (pending.length) { console.log("\nPendiente del dueño:"); pending.forEach((item) => console.log(`  - ${item}`)); }
