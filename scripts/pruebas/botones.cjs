// Auditoría de botones sin acción (2026-10-12). Entra con cada rol a todas sus pantallas y, sin hacer clic, revisa en
// las propiedades internas de React que cada botón o enlace visible tenga algo que hacer: onClick propio o de un
// contenedor cercano, envío de formulario, o un href real. Lista los que no hacen nada ("botones vacíos").
// Uso: node scripts/pruebas/botones.cjs   (requiere puppeteer-core y Brave; NODE_PATH a su carpeta)
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE || "http://localhost:5173";
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];

const STATIONS = [
  ["recepcion@parkplaza.com", ["/admin-panel", "/admin-panel/movimientos", "/admin-panel/habitaciones", "/admin-panel/reservas", "/admin-panel/cobros", "/admin-panel/accesos", "/admin-panel/aforo", "/admin-panel/cochera", "/admin-panel/pagos", "/admin-panel/mi-caja", "/admin-panel/devoluciones", "/admin-panel/personal-en-turno", "/clientes", "/eventos/reservas", "/admin/limpieza/resumen"]],
  ["restaurante@parkplaza.com", ["/restaurante/dashboard", "/restaurante/pedidos", "/restaurante/inventario/recetas", "/restaurante/produccion", "/restaurante/inventario/insumos", "/restaurante/inventario/solicitudes", "/restaurante/inventario/cierre"]],
  ["bartender@parkplaza.com", ["/bartender/dashboard", "/bartender/pedidos", "/bartender/inventario/recetas", "/bartender/botellas", "/bartender/inventario/insumos", "/bartender/inventario/solicitudes", "/bartender/inventario/cierre"]],
  ["limpieza@parkplaza.com", ["/limpieza", "/limpieza/tareas", "/limpieza/historial"]],
  ["mantenimiento@parkplaza.com", ["/mantenimiento", "/mantenimiento/trabajos", "/mantenimiento/historial"]]
];

(async () => {
  const { SUPERADMIN_MODULES, superAdminUrl } = await import("../../client/src/modules/admin/superAdminNavigation.js");
  const roles = [["superadmin@parkplaza.com", SUPERADMIN_MODULES.flatMap((module) => module.views.map((view) => superAdminUrl(module.id, view.id)))], ...STATIONS];
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: "new", args: ["--no-sandbox"] });
  let total = 0, screens = 0; const empty = [], failed = [];
  for (const [email, routes] of roles) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage(); await page.setViewport({ width: 1440, height: 900 });
    let errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400 && response.url().includes("/api/")) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type("#erp-email", email); await page.type("#erp-password", passwordOf(email));
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), page.keyboard.press("Enter")]);
    if (new URL(page.url()).pathname === "/login") throw new Error(`No inició sesión ${email}`);
    for (const route of routes) {
      errors = [];
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 700));
      if (new URL(page.url()).pathname !== route.split("?")[0]) {
        failed.push(`${email}: ${route} redirige a ${new URL(page.url()).pathname}; pantalla no revisada`);
        continue;
      }
      if (errors.length) failed.push(`${email}: ${route}: ${errors.join(" | ")}`);
      if (await page.evaluate(() => /No pudimos mostrar esta vista|Algo salió mal|Esta vista no existe|Acceso restringido/.test(document.body.innerText))) failed.push(`${email}: ${route}: pantalla de error`);
      const result = await page.evaluate(() => {
        const propsOf = (el) => { const key = Object.keys(el).find((k) => k.startsWith("__reactProps")); return key ? el[key] : null; };
        const acts = (el) => { for (let node = el, depth = 0; node && depth < 5; node = node.parentElement, depth++) { const p = propsOf(node); if (p && (p.onClick || p.onMouseDown || p.onPointerDown || (depth === 0 && p.onChange))) return true; } return false; };
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
        const items = [...document.querySelectorAll("button, a, [role=button]")].filter(visible);
        const bad = items.filter((el) => {
          if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
          if (el.tagName === "A") { const href = el.getAttribute("href"); return (!href || href === "#") && !acts(el); }
          if (el.type === "submit" && el.form && propsOf(el.form)?.onSubmit) return false;
          if (el.closest("label") && el.closest("label").querySelector("input[type=file]")) return false;
          return !acts(el);
        }).map((el) => (el.innerText || el.getAttribute("aria-label") || el.title || el.className).trim().replace(/\s+/g, " ").slice(0, 50));
        return { count: items.length, bad };
      });
      screens++; total += result.count;
      for (const label of result.bad) empty.push(`${email.split("@")[0]} ${route} → "${label}"`);
    }
    await context.close();
  }
  await browser.close();
  console.log(`${screens} pantallas · ${total} botones y enlaces revisados`);
  console.log(empty.length ? `${empty.length} SIN ACCIÓN:\n${[...new Set(empty)].join("\n")}` : "Todos los botones tienen una acción");
  if (failed.length) console.log(`PANTALLAS SIN REVISAR:\n${failed.join("\n")}`);
  process.exitCode = empty.length || failed.length ? 1 : 0;
})().catch((error) => { console.error("FALLO:", error.message); process.exit(1); });
