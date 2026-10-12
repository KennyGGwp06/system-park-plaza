// Centro de dirección v3 (2026-09-28): recorre TODAS las vistas del menú del dueño con sesión real (Brave headless),
// captura cada una y mide lo que el dueño reclamó: pantallas caídas, errores HTTP/JS, desborde horizontal, páginas
// demasiado altas y letras de gráficos agrandadas (texto SVG de más de 14 px).
// Uso: node shots.cjs [filtro]   VIEWPORT=390 para celular. Las rutas salen de superAdminNavigation.js.
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = path.join(__dirname, "capturas", process.env.VIEWPORT === "390" ? "dueno-celular" : "dueno");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { SUPERADMIN_MODULES, superAdminUrl } = await import("../../client/src/modules/admin/superAdminNavigation.js");
  const ROUTES = SUPERADMIN_MODULES.flatMap((module) => module.views.map((view) => superAdminUrl(module.id, view.id)));
  const filter = process.argv[2] || "";
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const phone = process.env.VIEWPORT === "390";
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2 } : { width: 1440, height: 900 });
  let problems = [];
  page.on("pageerror", (e) => problems.push(`JS: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) problems.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`); });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#erp-email", "superadmin"); await page.type("#erp-password", "superadmin");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), page.keyboard.press("Enter")]);
  const summary = [];
  for (const route of ROUTES.filter((r) => r.includes(filter))) {
    problems = [];
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" }).catch(() => {});
    await page.waitForFunction(() => !/Cargando|Preparando/.test(document.querySelector(".rx-page")?.innerText || "Cargando"), { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const info = await page.evaluate(() => {
      const texts = [...document.querySelectorAll(".rx-page svg text")].map((t) => parseFloat(getComputedStyle(t).fontSize) * (t.getScreenCTM()?.a || 1));
      return {
        crash: /no pudo cargarse|Algo salió mal|No pudimos mostrar esta vista|Error aislado en esta vista|Acceso restringido|Esta vista no existe|Unknown variable dynamic import/i.test(document.body.innerText),
        h1: document.querySelector(".rx-page h1")?.textContent || document.querySelector(".rx-crumb strong")?.textContent || "",
        wide: document.documentElement.scrollWidth > window.innerWidth + 1,
        height: Math.round(document.querySelector(".rx-page")?.scrollHeight || document.body.scrollHeight),
        bigText: texts.length ? Math.round(Math.max(...texts) * 10) / 10 : 0,
        submenus: document.querySelectorAll(".ow-subnav").length,
        tabs: document.querySelectorAll(".ow-tabs a").length
      };
    });
    const name = route.replace(/^\/superadmin\/?/, "").replace(/\//g, "-") || "inicio";
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !phone });
    const flags = [info.crash && "PANTALLA CAÍDA", info.wide && "DESBORDE", info.bigText > 14 && `LETRA GRÁFICO ${info.bigText}px`, info.height > 3200 && `ALTA ${info.height}px`, info.submenus && "SUBMENÚ"].filter(Boolean);
    summary.push({ route, height: info.height, bigText: info.bigText });
    console.log(`${flags.length || problems.length ? "ERR" : "OK "} ${route} · ${info.h1} · ${info.height}px${info.tabs ? ` · ${info.tabs} pestañas` : ""}${flags.length ? ` · ${flags.join(" · ")}` : ""}${problems.length ? ` · ${problems.slice(0, 3).join(" | ")}` : ""}`);
  }
  console.log(`\n${summary.length} vistas · la más alta ${Math.max(...summary.map((s) => s.height))}px · letra de gráfico más grande ${Math.max(...summary.map((s) => s.bigText))}px`);
  await browser.close();
})();
