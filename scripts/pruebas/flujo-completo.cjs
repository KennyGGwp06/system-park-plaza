// Prueba de que todo está conectado (2026-09-27): cliente → dueño/Recepción → Limpieza, Mantenimiento y Cocina.
//  1. Con clics (celular): portada → Mirador → mañana → turno → DNI → Yape con código → reserva en verificación.
//  2. El pago aparece en "Por aprobar" del dueño y se aprueba con la misma ruta que usa Recepción.
//  3. La app del cliente pasa sola a "Confirmada" con su QR.
//  4. Un huésped en estadía (Marco, hab. 301) pide toallas, reporta una falla y pide comida:
//     la tarea llega a Limpieza, la falla a Recepción → Mantenimiento (Jorge) y el pedido a Cocina.
// Uso: node e2e-conexion.cjs   (deja a Jorge sin turno al terminar)
const puppeteer = require("puppeteer-core");
const path = require("path");
const WEB = process.env.WEB || "http://localhost:4173", API = process.env.API || "http://localhost:3000/api";
const shot = (p, n) => p.screenshot({ path: path.join(__dirname, "capturas", "flujo", `${n}.png`) });
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "ERR"} ${msg}`); if (!cond) process.exitCode = 1; };
async function call(pathname, { token, method = "GET", body } = {}) {
  const r = await fetch(`${API}${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${pathname}: ${r.status} ${j.message || ""}`); return j;
}
const staff = async (email) => (await call("/auth/login", { method: "POST", body: { email, password: ({ "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" })[email] } })).token;
const click = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error(`No encontré ${s}`); el.click(); }, sel);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  require("fs").mkdirSync(path.join(__dirname, "capturas", "flujo"), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", headless: "new", args: ["--no-sandbox", ...(process.env.BROWSER_ARGS ? process.env.BROWSER_ARGS.split(" ") : [])] });
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const jsErrors = []; page.on("pageerror", (e) => jsErrors.push(e.message));
  await page.goto(`${WEB}/`, { waitUntil: "networkidle2" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.goto(`${WEB}/`, { waitUntil: "networkidle2" });

  // 1 · Reserva de Mirador con clics
  await click(page, ".pp-go"); await wait(1200);
  await click(page, '.sv-tab[data-v=MIRADOR]'); await wait(900);
  await click(page, '.sv-p.on [data-a=start-exp][data-t=MIRADOR]'); await wait(1500);
  await click(page, ".dstrip button:nth-child(2):not([disabled])"); await wait(400);
  await click(page, ".slots button:not([disabled])"); await wait(300);
  await shot(page, "01-mirador-elegido");
  await click(page, "[data-a=v-next]"); await wait(600);
  // Documento nuevo en cada corrida: si no existe, la app pide crear la cuenta (como un cliente real la primera vez).
  const dni = String(40000000 + Math.floor(Math.random() * 9999999));
  await page.type('[data-bind="auth.doc"]', dni); await click(page, "[data-a=auth-go]"); await wait(1800);
  if (await page.$('[data-bind="auth.first"]')) {
    await page.type('[data-bind="auth.first"]', "Lucía"); await page.type('[data-bind="auth.last"]', "Prueba");
    await page.type('[data-bind="auth.phone"]', "987654321"); await click(page, "[data-a=auth-register]"); await wait(2000);
  }
  ok(await page.evaluate(() => document.body.dataset.screen === "xpay"), "Identificada con DNI, pasa al pago");
  await click(page, '[data-a=pay-method][data-v=YAPE]'); await wait(300);
  const num = await page.$eval(".paybox .num", (el) => el.textContent.trim()).catch(() => "");
  ok(num === "999 100 001", `El número de Yape sale de la Configuración del dueño (${num || "sin número"})`);
  const code = String(Date.now()).slice(-7);
  await page.type("#paycode", code); await wait(200);
  await shot(page, "02-pago-yape");
  await click(page, "[data-a=v-book]"); await wait(2500);
  const trip = await page.evaluate(() => ({ screen: document.body.dataset.screen, text: document.body.innerText }));
  const bookingCode = (trip.text.match(/RES-\d+/) || [])[0];
  ok(trip.screen === "trip" && /verificando/i.test(trip.text), `Reserva creada y en verificación (${bookingCode})`);
  await shot(page, "03-en-verificacion");

  // 2 · El dueño la ve en "Por aprobar" y la aprueba
  const sa = await staff("superadmin@parkplaza.com");
  const approvals = await call("/superadmin/approvals", { token: sa });
  const payItem = (approvals.groups.find((g) => g.key === "pagos")?.items || []).find((i) => i.ref === bookingCode || String(i.title).includes(bookingCode) || String(i.detail).includes(bookingCode));
  ok(!!payItem, `El pago ${bookingCode} aparece en "Por aprobar" del dueño`);
  const mine = await page.evaluate(async () => { const r = await fetch("/api/public/my-experience", { headers: { authorization: `Bearer ${localStorage.getItem("pp_customer_token")}` } }); return r.json(); });
  const booking = mine.bookings.find((b) => b.code === bookingCode);
  await call(`/service-bookings/${booking.id}/pay`, { token: sa, method: "POST", body: { method: booking.paymentMethod, reference: booking.paymentReference, amount: booking.paymentRequested } });
  console.log(`    aprobado: ${booking.paymentMethod} ${booking.paymentReference} S/ ${booking.paymentRequested}`);

  // 3 · La app del cliente se actualiza sola (cada 8 s)
  await wait(9500);
  const after = await page.evaluate(() => document.body.innerText);
  ok(/confirmada/i.test(after), "La app del cliente pasó sola a «Confirmada»");
  ok(await page.evaluate(() => !!document.querySelector(".qr:not(.locked), .qrw:not(.locked) img")), "Su QR de acceso quedó activo");
  await shot(page, "04-confirmada");

  // 4 · Huésped en estadía → estaciones
  // Se crea su propio huésped: reserva de hoy, el dueño cobra con tarjeta y hace el check-in (no depende de datos previos).
  const guestDni = String(40000000 + Math.floor(Math.random() * 9999999));
  const g = (await call("/public/identify", { method: "POST", body: { documentType: "DNI", documentNumber: guestDni, firstName: "Marco", lastName: "Prueba", phone: "987654322" } })).token;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const room = (await call(`/public/rooms?checkIn=${today}&checkOut=${tomorrow}`))[0];
  const stayBooking = (await call("/public/bookings", { token: g, method: "POST", body: { serviceCode: "HOSPEDAJE", roomId: room.id, checkIn: today, checkOut: tomorrow, people: 1, adults: 1, planCode: "FLEX", paymentMethod: "CAJA HOTEL" } })).booking;
  await call("/pagos", { token: sa, method: "POST", body: { reservationId: stayBooking.id, amount: stayBooking.total, method: "TARJETA", reference: "POS-PRUEBA", concept: `Pago ${stayBooking.code}` } });
  await call("/checkin", { token: sa, method: "POST", body: { reservationId: stayBooking.id } });
  const towels = await call("/public/requests", { token: g, method: "POST", body: { type: "TOALLAS", description: "Toallas adicionales (prueba de conexión)" } });
  const cleanTasks = await call("/cleaning/tasks", { token: await staff("limpieza@parkplaza.com") });
  const task = cleanTasks.find((t) => Number(t.requestId) === Number(towels.id));
  ok(!!task, `Toallas → tarea ${task?.code} en la estación de Limpieza (hab. ${task?.room?.number || "?"})`);
  const recTasks = await call("/reception/tasks", { token: sa });
  ok(recTasks.some((t) => Number(t.requestId) === Number(towels.id)), "…y Recepción la ve para aceptarla o asignarla");

  const fault = await call("/public/requests", { token: g, method: "POST", body: { type: "MANTENIMIENTO", description: "La ducha no calienta (prueba de conexión)" } });
  const reports = await call("/reports", { token: sa });
  const list = Array.isArray(reports) ? reports : reports.reports || reports.rows || [];
  ok(list.some((r) => Number(r.id) === Number(fault.id)), `Falla → incidencia ${fault.code} visible en Recepción`);
  // Jorge marca entrada en el reloj, Recepción le asigna la falla y le aparece en su estación.
  // Si Jorge ya estaba en turno, el reloj marcaría su salida: se vuelve a marcar para dejarlo dentro.
  let jorge = await call("/attendance/clock", { method: "POST", body: { documentNumber: "70000007", pin: "6666" } });
  if (jorge.action === "CHECK_OUT") jorge = await call("/attendance/clock", { method: "POST", body: { documentNumber: "70000007", pin: "6666" } });
  try {
    await call(`/reception/reports/${fault.id}/assign-maintenance`, { token: sa, method: "PATCH", body: { employeeId: jorge.record?.employeeId || jorge.record?.userId || 7 } });
    const jobs = await call("/maintenance/reports", { token: await staff("mantenimiento@parkplaza.com") });
    ok(jobs.some((r) => Number(r.id) === Number(fault.id)), "…Recepción la asigna y aparece en la estación de Mantenimiento de Jorge");
  } finally {
    await call("/attendance/clock", { method: "POST", body: { documentNumber: "70000007", pin: "6666" } }).catch((e) => console.log("    (salida de Jorge):", e.message));
  }

  const cat = await call("/public/catalog");
  const dish = cat.restaurantMenu.find((m) => (m.availableFor || []).includes("HOSPEDAJE"));
  const exp = await call("/public/my-experience", { token: g });
  const stay = exp.bookings.find((b) => b.serviceCode === "HOSPEDAJE" && b.status === "CHECKED_IN");
  if (dish && stay) {
    const order = await call("/public/orders", { token: g, method: "POST", body: { bookingId: stay.id, serviceCode: "HOSPEDAJE", items: [{ menuItemId: dish.id, quantity: 1 }], paymentMethod: "YAPE" } });
    const kitchen = await call("/restaurante", { token: await staff("restaurante@parkplaza.com") }).catch((e) => ({ error: e.message }));
    const rows = Array.isArray(kitchen) ? kitchen : kitchen.orders || [];
    ok(rows.some((o) => o.code === (order.code || order.order?.code)), `Pedido ${order.code || order.order?.code} (${dish.name}) → llega a Cocina${kitchen.error ? ` (${kitchen.error})` : ""}`);
  } else ok(false, `No hay plato habilitado para Hospedaje o Marco no está en estadía (${!!dish}/${!!stay})`);

  ok(!jsErrors.length, `Sin errores de JavaScript en la app del cliente${jsErrors.length ? `: ${jsErrors.join(" | ")}` : ""}`);
  await browser.close();
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
