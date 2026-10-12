// Recorrido rápido de las estaciones después de retirar el sistema antiguo (2026-09-27): captura /login y /reloj
// (escritorio y celular) y entra con cada rol a todas sus pantallas, listando errores HTTP, de JavaScript,
// pantallas de error y desbordes a lo ancho. Uso: node stations-smoke.cjs
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:5173";
const OUT = path.join(__dirname, "capturas", "estaciones");
fs.mkdirSync(OUT, { recursive: true });
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];
const ROLES = [
  ["recepcion@parkplaza.com", ["/admin-panel", "/admin-panel/movimientos", "/admin-panel/habitaciones", "/admin-panel/reservas", "/admin-panel/cobros", "/admin-panel/accesos", "/admin-panel/aforo", "/admin-panel/cochera", "/admin-panel/pagos", "/admin-panel/mi-caja", "/admin-panel/devoluciones", "/admin-panel/personal-en-turno", "/clientes", "/eventos/reservas", "/admin/limpieza/resumen", "/incidencias"]],
  ["restaurante@parkplaza.com", ["/restaurante/dashboard", "/restaurante/pedidos", "/restaurante/inventario/recetas", "/restaurante/produccion", "/restaurante/inventario/insumos", "/restaurante/inventario/solicitudes", "/restaurante/inventario/cierre"]],
  ["bartender@parkplaza.com", ["/bartender/dashboard", "/bartender/pedidos", "/bartender/inventario/recetas", "/bartender/botellas", "/bartender/inventario/insumos", "/bartender/inventario/solicitudes", "/bartender/inventario/cierre"]],
  ["limpieza@parkplaza.com", ["/limpieza", "/limpieza/tareas", "/limpieza/historial"]],
  ["mantenimiento@parkplaza.com", ["/mantenimiento", "/mantenimiento/trabajos", "/mantenimiento/historial"]],
  ["superadmin@parkplaza.com", ["/admin-panel", "/restaurante/dashboard", "/inventario/kardex"]]
];
const CRASH = /no pudo cargarse|Algo salió mal|No pudimos mostrar esta vista|Error aislado en esta vista|Acceso restringido|Unknown variable dynamic import/i;

(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: "new", args: ["--no-sandbox"] });
  let failures = 0;
  for (const [label, width, height] of [["escritorio", 1440, 900], ["celular", 390, 844]]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (const route of ["/login", "/reloj"]) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 600));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await page.screenshot({ path: path.join(OUT, `${route.slice(1)}-${label}.png`), fullPage: true });
      console.log(`${wide ? "ERR" : "OK "} ${route} ${label}${wide ? " · DESBORDE" : ""}`); if (wide) failures++;
    }
    await page.close();
  }
  for (const [email, routes] of ROLES) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    let problems = [];
    page.on("pageerror", (e) => problems.push(`JS: ${e.message}`));
    page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/") && !r.url().includes("/attendance/lookup")) problems.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`); });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#erp-email", email); await page.type("#erp-password", passwordOf(email));
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), page.keyboard.press("Enter")]);
    console.log(`— ${email} aterriza en ${new URL(page.url()).pathname}`);
    for (const route of routes) {
      problems = [];
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      const info = await page.evaluate((re) => ({ crash: new RegExp(re, "i").test(document.body.innerText), title: document.querySelector("h1")?.textContent || "", path: location.pathname }), CRASH.source);
      const bad = info.crash || problems.length;
      if (bad) failures++;
      console.log(`${bad ? "ERR" : "OK "} ${route}${info.path !== route ? ` → ${info.path}` : ""} · ${info.title}${info.crash ? " · PANTALLA DE ERROR" : ""}${problems.length ? ` · ${problems.join(" | ")}` : ""}`);
    }
    await context.close();
  }
  await browser.close();
  console.log(failures ? `${failures} problema(s)` : "Todo OK");
})();
