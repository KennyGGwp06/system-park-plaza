// Tiempo real del Tablero del dueño: abre /superadmin, un cliente pide algo desde su app (otra sesión, por la API)
// y mide cuánto tarda en aparecer en "Actividad en vivo" SIN recargar la página.
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE || "http://localhost:5173";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#erp-email", "superadmin"); await page.type("#erp-password", "superadmin");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), page.keyboard.press("Enter")]);
  await page.waitForFunction(() => /Actividad en vivo/.test(document.body.innerText), { timeout: 20000 });
  await wait(1500);
  const marker = `Prueba tiempo real ${Date.now()}`;
  // Cliente nuevo en cada corrida: la prueba no depende de datos previos (sirve también en día cero y en la nube).
  const dni = String(40000000 + Math.floor(Math.random() * 9999999));
  const { token } = await (await fetch(`${BASE}/api/public/identify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentType: "DNI", documentNumber: dni, firstName: "Tiempo", lastName: "Real", phone: "987654323" }) })).json();
  const started = Date.now();
  const r = await fetch(`${BASE}/api/public/requests`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ type: "OTRO", description: marker }) });
  const created = await r.json();
  const code = created.code || created.request?.code;
  try {
    await page.waitForFunction((c) => document.body.innerText.includes(c), { timeout: 15000 }, code);
    console.log(`OK  La solicitud ${code} apareció en el Tablero en ${Date.now() - started} ms, sin recargar la página.`);
  } catch { console.log(`ERR La solicitud ${code} no apareció en 15 s.`); process.exitCode = 1; }
  await browser.close();
})();
