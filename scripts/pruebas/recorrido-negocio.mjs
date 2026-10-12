// Recorrido de negocio completo por la API (2026-10-12). No necesita navegador ni datos previos: crea sus propios
// clientes y recorre de principio a fin los cinco servicios, las estaciones, la caja, los comprobantes y una devolución.
//   1. Personal: Rosa (Recepción), Carlos (Cocina), Luis (Bar), Ana (Limpieza) y Jorge (Mantenimiento) marcan entrada;
//      Cocina y Bar abren su inventario del turno; Rosa abre caja.
//   2. Piscina: el cliente se registra, paga con Yape, Recepción valida su QR, pide comida y Cocina la entrega.
//   3. Mirador: pago con código de operación → el dueño lo verifica → acceso validado.
//   4. Terraza: mesa sin costo → acceso → pedido desde la mesa → Bar lo entrega.
//   5. Hospedaje: adelanto con Yape (verificación) → saldo en efectivo en caja → check-in → toallas (Limpieza) →
//      falla (Mantenimiento) → pedido a la habitación → salida (revisión de Limpieza) → limpieza posterior → habitación libre.
//   6. Eventos: cotización y reserva con adelanto → saldo en Recepción → confirmado con su pedido de catering.
//   7. Comprobantes: boleta, factura y nota de crédito; descarga de PDF, XML y CDR; el cliente ve su comprobante.
//   8. Devolución: solicitud → aprobación del dueño → devuelta, con su nota de crédito y la cochera liberada.
//   9. Caja: Rosa rinde su caja, el dueño la aprueba.
// Uso: node scripts/pruebas/recorrido-negocio.mjs   (API=http://localhost:3000/api por defecto). CREA DATOS: después se
// puede volver a día cero con `npm run db:limpiar-operacion`.
const API = process.env.API || "http://localhost:3000/api";
const CREDENTIAL = { "superadmin@parkplaza.com": "superadmin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
// Cada cuenta entra con su usuario y la clave es el mismo usuario (2026-10-12).
const passwordOf = (email) => CREDENTIAL[email] || String(email).split("@")[0];
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "OK " : "ERR"} ${msg}`); if (!cond) failures += 1; return cond; };
const note = (msg) => console.log(`    ${msg}`);
const section = (title) => console.log(`\n— ${title}`);

async function call(path, { token, method = "GET", body, raw = false } = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) { if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`); return response; }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(`${method} ${path}: ${response.status} ${data.message || ""}`); error.status = response.status; error.data = data; throw error; }
  return data;
}
const step = async (label, fn) => { try { const value = await fn(); ok(true, label); return value; } catch (error) { ok(false, `${label} → ${error.message}`); return null; } };
const login = async (email) => (await call("/auth/login", { method: "POST", body: { email, password: passwordOf(email) } })).token;
const randomDni = () => String(40000000 + Math.floor(Math.random() * 9999999));
const phone = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const opCode = () => String(Date.now()).slice(-8);
const pixel = "/demo-evidence.svg";

// Marca entrada. Si la persona ya estaba en turno, el reloj intentaría marcar su salida: Cocina y Bar no pueden
// salir con el inventario abierto (409) y eso significa que ya están trabajando.
async function clockIn(dni, pin) {
  let result;
  try { result = await call("/attendance/clock", { method: "POST", body: { documentNumber: dni, pin } }); }
  catch (error) { if (error.status === 409 && /salida/i.test(error.message)) return { alreadyIn: true }; throw error; }
  if (result.action === "CHECK_OUT") result = await call("/attendance/clock", { method: "POST", body: { documentNumber: dni, pin } });
  return result;
}

async function openOperationalShift(token, sessionId) {
  if (!sessionId) return null;
  const detail = await call(`/operational-inventory/sessions/${sessionId}`, { token });
  const session = detail.session || detail;
  if (["OPEN", "OPERATING", "REOPENED"].includes(session.status)) return session;
  const lines = detail.openingCandidates || detail.balances || detail.expectedLines || detail.lines || [];
  const openingCounts = lines.map((line) => ({ productId: line.productId ?? line.product_id, lotId: line.lotId ?? line.lot_id ?? null, quantity: Number(line.onHand ?? line.on_hand ?? line.expectedQuantity ?? line.quantity ?? 0) }));
  return call(`/operational-inventory/sessions/${sessionId}/open`, { token, method: "POST", body: openingCounts.length ? { openingCounts } : { useSystemBalance: true } });
}

async function newCustomer(label) {
  const documentNumber = randomDni();
  const data = await call("/public/identify", { method: "POST", body: { documentType: "DNI", documentNumber, firstName: label, lastName: "Prueba", phone: phone() } });
  return { ...data, documentNumber };
}

const todayLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const addDays = (date, days) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

(async () => {
  const today = todayLima();
  const sa = await login("superadmin@parkplaza.com");
  const rosa = await login("recepcion@parkplaza.com");

  section("1 · Personal en turno");
  const staff = {};
  for (const [key, dni, pin] of [["rosa", "70000002", "2222"], ["carlos", "70000003", "3333"], ["luis", "70000004", "4444"], ["ana", "70000005", "5555"], ["jorge", "70000007", "6666"]]) {
    staff[key] = await step(`${key} marca entrada en el reloj`, () => clockIn(dni, pin));
  }
  const carlos = staff.carlos?.token || await login("restaurante@parkplaza.com");
  const luis = staff.luis?.token || await login("bartender@parkplaza.com");
  const ana = staff.ana?.token || await login("limpieza@parkplaza.com");
  const jorge = staff.jorge?.token || await login("mantenimiento@parkplaza.com");
  const anaId = staff.ana?.record?.employeeId; const jorgeId = staff.jorge?.record?.employeeId;
  await step("Cocina abre el inventario de su turno", () => openOperationalShift(carlos, staff.carlos?.record?.operationalSessionId || staff.carlos?.operationalSessionId));
  await step("Bar abre el inventario de su turno", () => openOperationalShift(luis, staff.luis?.record?.operationalSessionId || staff.luis?.operationalSessionId));
  let cash = await call("/cash-sessions/current", { token: rosa }).catch(() => null);
  if (!cash || cash.status !== "ABIERTA") cash = await step("Rosa abre caja con S/ 200", () => call("/cash-sessions", { token: rosa, method: "POST", body: { initialFund: 200 } }));
  else note(`Rosa ya tenía la caja #${cash.id} abierta`);

  const catalog = await call("/public/catalog");
  const dishFor = (service, area = "RESTAURANTE") => catalog.menu.find((item) => item.area === area && (service === "TERRAZA" || (item.availableFor || []).includes(service)));
  ok(catalog.menu.length >= 3, `La carta del cliente tiene productos a la venta (${catalog.menu.length})`);

  section("2 · Piscina");
  const ana1 = await step("Cliente nuevo se registra con DNI", () => newCustomer("Piscina"));
  const pool = ana1 && await step("Reserva Piscina hoy y paga con Yape", () => call("/public/bookings", { token: ana1.token, method: "POST", body: { serviceCode: "PISCINA", date: today, slot: "16:00", people: 2, adults: 2, planCode: "ADULTO", paymentMethod: "YAPE", payMode: "FULL", paymentCode: opCode() } }));
  if (pool) {
    ok(pool.booking.paymentStatus === "PAGADO" && pool.booking.accessStatus === "LISTO_INGRESO", `Reserva ${pool.booking.code} pagada (S/ ${pool.booking.total}) y lista para ingresar`);
    await step("Recepción lee el QR (vista previa)", () => call("/access/preview", { token: rosa, method: "POST", body: { code: pool.pass.code } }));
    await step("Recepción valida el ingreso a Piscina", () => call("/access/validate", { token: rosa, method: "POST", body: { code: pool.pass.code, serviceCode: "PISCINA", people: 2 } }));
    const dish = dishFor("PISCINA");
    const order = dish && await step(`Pide ${dish?.name} desde el camastro`, () => call("/public/orders", { token: ana1.token, method: "POST", body: { bookingId: pool.booking.id, serviceCode: "PISCINA", items: [{ menuItemId: dish.id, quantity: 1 }], paymentMethod: "YAPE" } }));
    if (order) {
      for (const status of ["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]) await step(`Cocina: ${order.code} → ${status}`, () => call(`/restaurante/${order.id}/status`, { token: carlos, method: "PATCH", body: { status } }));
      const detail = await call(`/orders/${order.id}/inventory`, { token: sa }).catch(() => null);
      ok(detail && (detail.order?.inventoryStatus === "CONSUMIDO" || JSON.stringify(detail).includes("CONSUM")), "Al entregar, el pedido descontó los insumos de la receta");
    }
  }

  section("3 · Mirador (pago con verificación)");
  const c2 = await step("Cliente nuevo para Mirador", () => newCustomer("Mirador"));
  const code2 = opCode();
  const mirador = c2 && await step("Reserva Mirador mañana con código de Yape", () => call("/public/bookings", { token: c2.token, method: "POST", body: { serviceCode: "MIRADOR", date: addDays(today, 1), slot: "18:00", people: 2, planCode: "ACCESO", paymentMethod: "YAPE", payMode: "FULL", paymentCode: code2 } }));
  if (mirador) {
    ok(mirador.booking.paymentStatus === "PENDIENTE_VERIFICACION", "Queda en verificación hasta que el hotel confirme el Yape");
    const approvals = await call("/superadmin/approvals", { token: sa });
    ok(JSON.stringify(approvals).includes(mirador.booking.code), "El pago aparece en «Por aprobar» del dueño");
    await step("El dueño verifica el pago", () => call(`/service-bookings/${mirador.booking.id}/pay`, { token: sa, method: "POST", body: { method: "YAPE", reference: code2, amount: mirador.booking.paymentRequested } }));
    const mine = await call("/public/my-experience", { token: c2.token });
    const booking = mine.bookings.find((item) => item.id === mirador.booking.id);
    ok(booking?.paymentStatus === "PAGADO" && booking?.status === "CONFIRMADA", `El cliente ve su reserva confirmada (${booking?.status})`);
    await step("Recepción valida el ingreso al Mirador", () => call("/access/validate", { token: rosa, method: "POST", body: { code: mirador.pass.code, serviceCode: "MIRADOR", people: 2 } }));
  }

  section("4 · Terraza (mesa sin costo y pedido desde la mesa)");
  const c3 = await step("Cliente nuevo para Terraza", () => newCustomer("Terraza"));
  const terrace = c3 && await step("Reserva mesa en la Terraza hoy", () => call("/public/bookings", { token: c3.token, method: "POST", body: { serviceCode: "TERRAZA", date: today, slot: "21:30", people: 4, planCode: "MESA", paymentMethod: "YAPE", payMode: "FULL" } }));
  if (terrace) {
    ok(terrace.booking.total === 0 && terrace.booking.status === "CONFIRMADA", "La mesa no tiene costo y queda confirmada");
    await step("Recepción valida la llegada a la Terraza", () => call("/access/validate", { token: rosa, method: "POST", body: { code: terrace.pass.code, serviceCode: "TERRAZA", people: 4 } }));
    const drink = dishFor("TERRAZA", "BARTENDER") || dishFor("TERRAZA");
    const order = drink && await step(`Pide ${drink?.name} desde la mesa`, () => call("/public/orders", { token: c3.token, method: "POST", body: { bookingId: terrace.booking.id, serviceCode: "TERRAZA", items: [{ menuItemId: drink.id, quantity: 2 }], paymentMethod: "PLIN" } }));
    if (order) {
      const area = order.area === "BARTENDER" ? ["bartender", luis, ["PREPARANDO", "LISTO", "ENTREGADO"]] : ["restaurante", carlos, ["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]];
      for (const status of area[2]) await step(`${area[0]}: ${order.code} → ${status}`, () => call(`/${area[0]}/${order.id}/status`, { token: area[1], method: "PATCH", body: { status } }));
    }
  }

  section("5 · Hospedaje de punta a punta");
  const c4 = await step("Huésped nuevo se registra", () => newCustomer("Huesped"));
  const rooms = await call(`/public/rooms?checkIn=${today}&checkOut=${addDays(today, 1)}`);
  const room = rooms.find((item) => item.status === "LIBRE");
  ok(!!room, `Hay habitación libre para hoy (${room?.number})`);
  const code4 = opCode();
  const stayBooking = c4 && room && await step(`Reserva hab. ${room?.number} con 50 % por Yape`, () => call("/public/bookings", { token: c4.token, method: "POST", body: { serviceCode: "HOSPEDAJE", roomId: room.id, checkIn: today, checkOut: addDays(today, 1), people: 2, adults: 2, planCode: "FLEX", paymentMethod: "YAPE", payMode: "HALF", paymentCode: code4, vehicles: [{ type: "AUTO", plate: "ABC-123" }] } }));
  let stay = null;
  if (stayBooking) {
    const b = stayBooking.booking;
    ok(b.paymentStatus === "PENDIENTE_VERIFICACION" && b.parkingSpaces?.length === 1, `Reserva ${b.code}: S/ ${b.total}, adelanto en verificación y cochera ${b.parkingSpaces?.[0]} reservada`);
    await step("Recepción verifica el adelanto", () => call(`/service-bookings/${b.id}/pay`, { token: rosa, method: "POST", body: { method: "YAPE", reference: code4, amount: b.paymentRequested } }));
    const blocked = await call("/checkin", { token: rosa, method: "POST", body: { reservationId: b.id } }).then(() => false).catch((error) => /saldo/i.test(error.message));
    ok(blocked, "Sin pagar el saldo, el check-in se bloquea");
    const detail = (await call("/checkin/search", { token: rosa })).find((item) => item.id === b.id);
    await step(`Recepción cobra el saldo S/ ${detail?.balance} en efectivo`, () => call("/pagos", { token: rosa, method: "POST", body: { reservationId: b.id, amount: detail.balance, method: "EFECTIVO", concept: `Saldo ${b.code}` } }));
    stay = await step("Check-in del huésped", () => call("/checkin", { token: rosa, method: "POST", body: { reservationId: b.id } }));
  }
  if (stay) {
    const towels = await step("El huésped pide toallas desde la app", () => call("/public/requests", { token: c4.token, method: "POST", body: { type: "TOALLAS", description: "Dos toallas adicionales" } }));
    const task = towels && (await call("/reception/tasks", { token: rosa })).find((item) => Number(item.requestId) === Number(towels.id));
    if (ok(!!task, `Recepción ve la tarea ${task?.code}`)) {
      await step("Recepción la asigna a Ana", () => call(`/reception/tasks/${task.id}/assign`, { token: rosa, method: "PATCH", body: { employeeId: anaId } }));
      await step("Ana la inicia", () => call(`/cleaning/tasks/${task.id}/start`, { token: ana, method: "PATCH" }));
      await step("Ana sube la foto del trabajo", () => call(`/cleaning/tasks/${task.id}/evidence`, { token: ana, method: "POST", body: { files: [{ fileUrl: pixel }], description: "Toallas entregadas" } }));
      await step("Ana la finaliza", () => call(`/cleaning/tasks/${task.id}/finish`, { token: ana, method: "PATCH" }));
    }
    const fault = await step("El huésped reporta una falla", () => call("/public/requests", { token: c4.token, method: "POST", body: { type: "MANTENIMIENTO", description: "La ducha no calienta" } }));
    if (fault) {
      await step("Recepción la asigna a Jorge", () => call(`/reception/reports/${fault.id}/assign-maintenance`, { token: rosa, method: "PATCH", body: { employeeId: jorgeId } }));
      await step("Jorge inicia la reparación", () => call(`/maintenance/reports/${fault.id}/start`, { token: jorge, method: "PATCH" }));
      await step("Jorge sube foto ANTES", () => call(`/maintenance/reports/${fault.id}/evidence`, { token: jorge, method: "POST", body: { stage: "ANTES", files: [{ fileUrl: pixel }], description: "Resistencia quemada" } }));
      await step("Jorge sube foto DESPUÉS", () => call(`/maintenance/reports/${fault.id}/evidence`, { token: jorge, method: "POST", body: { stage: "DESPUES", files: [{ fileUrl: pixel }], description: "Resistencia cambiada" } }));
      await step("Jorge la finaliza", () => call(`/maintenance/reports/${fault.id}/finish`, { token: jorge, method: "PATCH", body: { workDescription: "Cambio de resistencia" } }));
    }
    const dish = dishFor("HOSPEDAJE");
    const order = dish && await step(`Pide ${dish?.name} a la habitación`, () => call("/public/orders", { token: c4.token, method: "POST", body: { bookingId: stayBooking.booking.id, serviceCode: "HOSPEDAJE", items: [{ menuItemId: dish.id, quantity: 1 }], paymentMethod: "YAPE" } }));
    if (order) for (const status of ["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]) await step(`Cocina: ${order.code} → ${status}`, () => call(`/restaurante/${order.id}/status`, { token: carlos, method: "PATCH", body: { status } }));
    await step("El huésped avisa que se va", () => call(`/public/bookings/${stayBooking.booking.id}/checkout`, { token: c4.token, method: "POST" }));
    await step("Recepción manda a Ana a revisar la habitación", () => call("/checkout/inspect", { token: rosa, method: "POST", body: { stayId: stay.id, employeeId: anaId } }));
    const inspection = (await call("/cleaning/tasks", { token: ana })).find((item) => item.workflowType === "CHECKOUT_INSPECTION" && Number(item.stayId) === Number(stay.id));
    if (ok(!!inspection, `Ana recibe la revisión ${inspection?.code}`)) {
      await step("Ana inicia la revisión", () => call(`/cleaning/tasks/${inspection.id}/start`, { token: ana, method: "PATCH" }));
      for (const area of ["BAÑO", "CUARTO", "REFRI / DESPENSA"]) await step(`Foto de revisión: ${area}`, () => call(`/cleaning/tasks/${inspection.id}/evidence`, { token: ana, method: "POST", body: { area, files: [{ fileUrl: pixel }] } }));
      await step("Ana confirma: sin daños", () => call(`/cleaning/tasks/${inspection.id}/finish`, { token: ana, method: "PATCH" }));
      const during = (await call("/rooms", { token: rosa })).rooms.find((item) => item.id === stay.roomId);
      ok(during?.status !== "LIBRE", `Mientras el huésped no sale, la habitación no se ofrece como libre (${during?.status})`);
    }
    const out = await step("Recepción cierra la salida (check-out)", () => call("/checkout", { token: rosa, method: "POST", body: { stayId: stay.id, paymentAmount: 0 } }));
    if (out) {
      const after = (await call("/rooms", { token: rosa })).rooms.find((item) => item.id === stay.roomId);
      ok(after?.status === "EN_LIMPIEZA", `Tras la salida la habitación pasa a limpieza (${after?.status})`);
      const cleaning = (await call("/reception/tasks", { token: rosa })).find((item) => Number(item.roomId) === Number(stay.roomId) && item.workflowType === "POST_CHECKOUT" && item.status !== "FINALIZADA");
      if (ok(!!cleaning, `Se creó la limpieza posterior ${cleaning?.code}`)) {
        if (!cleaning.assignedEmployeeId) await step("Recepción la asigna a Ana", () => call(`/reception/tasks/${cleaning.id}/assign`, { token: rosa, method: "PATCH", body: { employeeId: anaId } }));
        await step("Ana inicia la limpieza", () => call(`/cleaning/tasks/${cleaning.id}/start`, { token: ana, method: "PATCH" }));
        for (const stage of ["ENTRADA", "SALIDA"]) for (const area of ["BAÑO", "CUARTO", "REFRI / DESPENSA"]) await step(`Foto ${stage.toLowerCase()} ${area}`, () => call(`/cleaning/tasks/${cleaning.id}/evidence`, { token: ana, method: "POST", body: { area, stage, files: [{ fileUrl: pixel }] } }));
        await step("Ana termina la limpieza", () => call(`/cleaning/tasks/${cleaning.id}/finish`, { token: ana, method: "PATCH" }));
        const free = (await call("/rooms", { token: rosa })).rooms.find((item) => item.id === stay.roomId);
        ok(free?.status === "LIBRE", `La habitación vuelve a estar libre (${free?.status})`);
      }
      const parking = (await call("/cochera", { token: rosa })).filter((space) => (space.entries || []).some((entry) => Number(entry.bookingId) === Number(stayBooking.booking.id)));
      ok(!parking.length, "La cochera del huésped quedó liberada");
    }
  }

  section("6 · Eventos");
  const c5 = await step("Cliente nuevo para un evento", () => newCustomer("Evento"));
  const days = await call(`/public/event-availability?from=${addDays(today, 10)}`);
  const day = days.find((item) => item.available); const space = day?.spaces.find((item) => item.available);
  const event = c5 && space && await step(`Reserva ${space?.name} el ${day?.date} con 50 % por Yape`, () => call("/public/event-bookings", { token: c5.token, method: "POST", body: { name: "Cumpleaños de prueba", spaceId: space.id, guests: 30, startsAt: `${day.date}T19:00`, endsAt: `${day.date}T23:00`, layout: "BANQUETE", equipment: [{ id: "SONIDO" }], catering: [], estimatedTotal: 1, paymentMethod: "YAPE", paymentCode: opCode() } }));
  if (event) {
    ok(Number(event.event.price) >= Number(space.basePrice), `El servidor calcula el precio (S/ ${event.event.price}) y no acepta el total que manda el navegador`);
    await step(`Recepción cobra el saldo S/ ${event.event.balance} con tarjeta`, () => call(`/events/${event.event.id}/payments`, { token: rosa, method: "POST", body: { amount: event.event.balance, method: "TARJETA", reference: "POS-0001" } }));
    const after = (await call("/public/my-experience", { token: c5.token })).events.find((item) => item.id === event.event.id);
    ok(after?.status === "CONFIRMADO" && Number(after?.balance) === 0, `El evento queda confirmado y pagado (${after?.status})`);
  }

  section("7 · Boletas, facturas y notas de crédito");
  const config = await call("/facturacion/configuration", { token: sa });
  ok(!!config.issuer?.ruc, `Emisor configurado: RUC ${config.issuer?.ruc} · ${config.issuer?.legalName}`);
  const payments = await call("/pagos", { token: rosa });
  const pending = payments.filter((item) => item.status === "APROBADO" && !item.invoice && item.clientId);
  ok(pending.length >= 4, `Hay pagos sin comprobante para emitir (${pending.length})`);
  const boleta = pending[0] && await step("Rosa emite una boleta", () => call("/facturacion", { token: rosa, method: "POST", body: { paymentId: pending[0].id, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: pending[0].client.documentNumber, name: `${pending[0].client.firstName} ${pending[0].client.lastName}` } } }));
  if (boleta) {
    ok(/^B\w{3}-\d{8}$/.test(boleta.fullNumber) && boleta.status === "ACEPTADO", `Boleta ${boleta.fullNumber} aceptada (${boleta.sunatDescription})`);
    ok(boleta.hash && boleta.qrText?.split("|").length >= 9, "Lleva código hash y el texto del QR con el formato de SUNAT");
    ok(/SOLES/.test(boleta.amountInWords || ""), `Importe en letras: ${boleta.amountInWords}`);
    for (const kind of ["pdf", "xml", "cdr"]) {
      const response = await call(`/facturacion/${boleta.id}/download/${kind}`, { token: rosa, raw: true }).catch((error) => ({ error }));
      const body = response.error ? "" : kind === "pdf" ? (await response.arrayBuffer()).byteLength : await response.text();
      if (kind === "xml") ok(String(body).includes("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2") && String(body).includes("<ds:DigestValue>"), "El XML es UBL 2.1 con firma (DigestValue)");
      else if (kind === "cdr") ok(String(body).length > 0 && response.headers.get("content-type").includes("zip"), "El CDR se descarga como ZIP (R-…zip)");
      else ok(Number(body) > 2000, `El PDF se descarga (${body} bytes)`);
    }
    const mine = await call("/public/my-experience", { token: [ana1, c2, c3, c4, c5].find((item) => item && item.client.id === pending[0].clientId)?.token || ana1?.token });
    ok(mine.invoices.some((item) => item.id === boleta.id), "El cliente ve su comprobante en la app");
  }
  const factura = pending[1] && await step("Rosa emite una factura a una empresa", () => call("/facturacion", { token: rosa, method: "POST", body: { paymentId: pending[1].id, type: "FACTURA", recipient: { documentType: "RUC", documentNumber: "20100047218", name: "EMPRESA DE PRUEBA S.A.C.", address: "Jr. Ucayali 123, Pucallpa" } } }));
  if (factura) ok(/^F\w{3}-\d{8}$/.test(factura.fullNumber) && factura.status === "ACEPTADO", `Factura ${factura.fullNumber} aceptada`);
  const badRuc = pending[2] && await call("/facturacion", { token: rosa, method: "POST", body: { paymentId: pending[2].id, type: "FACTURA", recipient: { documentType: "RUC", documentNumber: "20123456789", name: "RUC FALSO", address: "x" } } }).then(() => false).catch((error) => /RUC/i.test(error.message));
  ok(badRuc, "Un RUC con dígito verificador inválido se rechaza");
  const retry = pending[2] && await step("Simulación: SUNAT no responde", () => call("/facturacion", { token: sa, method: "POST", body: { paymentId: pending[2].id, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: pending[2].client.documentNumber, name: pending[2].client.firstName }, simulationResult: "PENDIENTE_REINTENTO" } }));
  if (retry) { const again = await step("El dueño reintenta el envío", () => call(`/facturacion/${retry.id}/retry`, { token: sa, method: "POST" })); ok(again?.status === "ACEPTADO", "El reintento queda aceptado sin duplicar el número"); }
  if (factura) {
    const credit = await step("Se anula la factura con nota de crédito", () => call(`/facturacion/${factura.id}/credit-note`, { token: sa, method: "POST", body: { reasonCode: "01", reason: "Anulación de la operación (prueba)" } }));
    if (credit) ok(/^F\w{3}-\d{8}$/.test(credit.fullNumber) && credit.type === "NOTA_CREDITO" && credit.reference?.fullNumber === factura.fullNumber, `Nota de crédito ${credit.fullNumber} referida a ${credit.reference?.fullNumber}`);
    const list = await call("/facturacion", { token: sa });
    ok(list.find((item) => item.id === factura.id)?.status === "ANULADO", "La factura queda ANULADA");
  }

  section("8 · Devolución");
  const c6 = await step("Cliente nuevo que luego se arrepiente", () => newCustomer("Devolucion"));
  const refundBooking = c6 && await step("Reserva Piscina para mañana y paga", () => call("/public/bookings", { token: c6.token, method: "POST", body: { serviceCode: "PISCINA", date: addDays(today, 1), slot: "09:00", people: 1, adults: 1, planCode: "ADULTO", paymentMethod: "PLIN", payMode: "FULL", paymentCode: opCode() } }));
  if (refundBooking) {
    const payment = (await call("/pagos", { token: sa })).find((item) => item.bookingId === refundBooking.booking.id);
    const doc = payment && await step("Se emite su boleta", () => call("/facturacion", { token: rosa, method: "POST", body: { paymentId: payment.id, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: c6.documentNumber, name: "Devolucion Prueba" } } }));
    const request = await step("Recepción registra la devolución", () => call("/refunds", { token: rosa, method: "POST", body: { type: "PISCINA", id: refundBooking.booking.id, reason: "El cliente no podrá asistir" } }));
    if (request) {
      await step("El dueño la aprueba", () => call(`/refunds/${request.id}/decision`, { token: sa, method: "POST", body: { decision: "APROBAR" } }));
      await step("El dueño registra la devolución por Plin", () => call(`/refunds/${request.id}/complete`, { token: sa, method: "POST", body: { method: "PLIN", operationRef: "DEV123" } }));
      const mine = await call("/public/my-experience", { token: c6.token });
      ok(mine.bookings.find((item) => item.id === refundBooking.booking.id)?.status === "CANCELADA", "La reserva queda cancelada");
      if (doc) { const docs = await call("/facturacion", { token: sa }); const credit = docs.find((item) => item.type === "NOTA_CREDITO" && item.reference?.id === doc.id); ok(!!credit, `La boleta ${doc.fullNumber} se anuló con la nota de crédito ${credit?.fullNumber}`); }
    }
  }

  section("9 · Cierre de caja");
  const current = await call("/cash-sessions/current", { token: rosa }).catch(() => null);
  if (current?.status === "ABIERTA") {
    const submitted = await step("Rosa cuenta el efectivo y rinde su caja", async () => { const preview = await call("/cash-sessions", { token: rosa }); const mine = preview.find((item) => item.id === current.id); return call(`/cash-sessions/${current.id}/submit`, { token: rosa, method: "POST", body: { actualCash: Number(mine?.expectedCash || 0) + 0, notes: "Cierre de prueba" } }); });
    if (submitted) {
      ok(Number(submitted.expectedCash) > Number(current.initialFund), `Lo esperado incluye el efectivo cobrado (S/ ${submitted.expectedCash})`);
      await step("El dueño aprueba la rendición", () => call(`/cash-sessions/${current.id}/status`, { token: sa, method: "PATCH", body: { status: "APROBADA" } }));
    }
  }
  await step("Rosa marca salida", () => call("/attendance/clock", { method: "POST", body: { documentNumber: "70000002", pin: "2222" } }));

  section("10 · Lo ve el dueño");
  const home = await call("/superadmin/home", { token: sa });
  ok(home && JSON.stringify(home).length > 500, "El Inicio del dueño responde con datos");
  const health = await call("/data-integrity", { token: sa }).catch((error) => ({ error: error.message }));
  ok(!health.error, `Calidad de los datos responde${health.error ? `: ${health.error}` : ""}`);

  console.log(`\n${failures ? `${failures} FALLO(S)` : "Todo OK"}`);
  process.exitCode = failures ? 1 : 0;
})().catch((error) => { console.error("FALLO GENERAL:", error); process.exit(1); });
