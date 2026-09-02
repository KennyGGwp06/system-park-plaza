import { io } from "socket.io-client";

const BASE = process.env.DEMO_API || "http://localhost:3000/api";
const runId = String(Date.now()).slice(-7);
const results = [];

function add(name, ok, detail = "") { results.push({ name, ok: Boolean(ok), detail }); if (!ok) throw new Error(`${name}: ${detail}`); }
async function api(path, { method = "GET", token, body, expected } = {}) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (expected && response.status === expected) return { expectedError: true, status: response.status, data };
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${data?.message || "Error"}`);
  return data;
}
const plusDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const staff = async (email) => (await api("/auth/login", { method: "POST", body: { email, password: "ParkPlaza123*" } })).token;
const identify = (suffix, firstName) => api("/public/identify", { method: "POST", body: { documentType: "DNI", documentNumber: `9${runId}${suffix}`, firstName, lastName: "Prueba Integral", phone: `98${runId}${suffix}`.slice(0, 9), email: `${firstName.toLowerCase()}-${runId}@demo.test` } });

async function main() {
  const health = await api("/health");
  add("Backend y PostgreSQL", health.status === "ok" && health.database === "connected", JSON.stringify(health));
  const catalog = await api("/public/catalog");
  add("Catálogo visual con fotos, ingredientes y disponibilidad", catalog.menu.every((item) => item.image && Array.isArray(item.ingredients) && typeof item.available === "boolean"), `${catalog.menu.length} productos detallados`);
  add("Catálogo de cuatro experiencias", catalog.services?.length === 4, `${catalog.services?.length || 0} servicios`);

  const [receptionToken, restaurantToken, bartenderToken, cleaningToken, adminToken] = await Promise.all([
    staff("recepcion@parkplaza.com"), staff("restaurante@parkplaza.com"), staff("bartender@parkplaza.com"), staff("limpieza@parkplaza.com"), staff("superadmin@parkplaza.com")
  ]);
  add("Acceso de cinco roles ERP", [receptionToken, restaurantToken, bartenderToken, cleaningToken, adminToken].every(Boolean), "Recepción, Restaurante, Bartender, Limpieza y Admin");

  const initialInventory = await api("/inventory", { token: adminToken });
  const replenished = initialInventory.filter((item) => Number(item.stock) - Number(item.reserved || 0) < 20);
  for (const item of replenished) await api("/inventory/entries", { method: "POST", token: adminToken, body: { productId: item.id, quantity: 50, reason: "Reposición automática para simulación integral", reference: `DEMO-${runId}` } });
  add("Inventario preparado para una prueba repetible", true, replenished.length ? `${replenished.length} insumo(s) repuestos` : "Stock suficiente");
  const inventoryBefore = await api("/inventory", { token: adminToken });
  const clients = await Promise.all([identify("1", "Hospedaje"), identify("2", "Piscina"), identify("3", "Mirador"), identify("4", "Eventos")]);
  add("Cuatro clientes independientes creados simultáneamente", new Set(clients.map((item) => item.client.id)).size === 4, clients.map((item) => item.client.documentNumber).join(", "));
  const [hotel, pool, lookout, eventClient] = clients;

  const checkIn = plusDays(8); const checkOut = plusDays(10);
  const rooms = await api(`/public/rooms?checkIn=${checkIn}&checkOut=${checkOut}`);
  const room = rooms.find((item) => item.capacity >= 2);
  add("Disponibilidad real de habitaciones", Boolean(room), room ? `Habitación ${room.number}` : "Sin habitación");
  const hotelTotal = Number(room.price) * 2;
  const hotelBooking = await api("/public/bookings", { method: "POST", token: hotel.token, body: { serviceCode: "HOSPEDAJE", planCode: "FLEX", planName: "Flexible", roomId: room.id, checkIn, checkOut, date: checkIn, slot: "15:00", people: 2, adults: 2, children: 0, extras: [], extrasTotal: 0, preorderItems: [], preferences: { room: "Silenciosa" }, total: hotelTotal, payMode: "FULL", paymentMethod: "YAPE" } });
  add("Hospedaje reservado y pagado", hotelBooking.booking.paymentStatus === "PAGADO" && hotelBooking.booking.clientId === hotel.client.id, hotelBooking.booking.code);

  const poolAvailability = await api(`/public/availability/PISCINA?from=${plusDays(1)}`);
  const poolOption = poolAvailability.flatMap((day) => day.slots.map((slot) => ({ date: day.date, ...slot }))).find((slot) => slot.remaining >= 4);
  if (!poolOption) throw new Error("No existe un turno de piscina con cuatro cupos para la simulacion");
  const poolDate = poolOption.date;
  const poolBooking = await api("/public/bookings", { method: "POST", token: pool.token, body: { serviceCode: "PISCINA", planCode: "FAMILIAR", planName: "Pase familiar", date: poolDate, checkIn: poolDate, checkOut: poolDate, slot: poolOption.time, people: 4, adults: 2, children: 2, extras: [{ id: "CABANA", name: "Cabaña familiar", price: 70 }], extrasTotal: 70, preorderItems: [], parking: { type: "AUTO", plate: `PI${runId.slice(-4)}`, price: 15 }, parkingTotal: 15, total: 235, payMode: "FULL", paymentMethod: "CAJA HOTEL" } });
  add("Piscina reservada para pago en caja", poolBooking.booking.paymentStatus === "PENDIENTE_CAJA" && poolBooking.booking.balance === 235, poolBooking.booking.code);
  await api(`/service-bookings/${poolBooking.booking.id}/pay`, { method: "POST", token: receptionToken, body: { amount: 235, method: "EFECTIVO" } });
  const poolExperience = await api("/public/my-experience", { token: pool.token });
  add("Recepción cobra y activa QR de piscina", poolExperience.bookings[0].paymentStatus === "PAGADO" && poolExperience.pass.entitlements[0].status === "ACTIVO", poolExperience.pass.code);
  const excessive = await api("/access/validate", { method: "POST", token: receptionToken, expected: 409, body: { code: poolExperience.pass.code, serviceCode: "PISCINA", people: 5 } });
  add("QR rechaza personas adicionales", excessive.status === 409, excessive.data?.message);
  const poolAccess = await api("/access/validate", { method: "POST", token: receptionToken, body: { code: poolExperience.pass.code, serviceCode: "PISCINA", people: 4 } });
  const socket = io(BASE.replace(/\/api\/?$/, ""), { transports: ["websocket"] });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Socket.IO no conectó")), 5000); socket.on("connect", () => { clearTimeout(timer); resolve(); }); });
  const liveEvent = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("No llegó state:changed")), 5000); socket.once("state:changed", (event) => { clearTimeout(timer); resolve(event); }); });
  const mixedOrder = await api("/public/orders", { method: "POST", token: pool.token, body: { items: [{ menuItemId: 1, quantity: 1 }, { menuItemId: 4, quantity: 1 }], notes: "Pedido mixto desde piscina" } });
  const emitted = await liveEvent;
  add("Actualización en tiempo real sin recargar", emitted.path === "/api/public/orders", emitted.path);
  add("Carrito mixto dividido por área", mixedOrder.orders?.length === 2 && new Set(mixedOrder.orders.map((item) => item.area)).size === 2, mixedOrder.groupCode);
  for (const order of mixedOrder.orders) {
    const token = order.area === "BARTENDER" ? bartenderToken : restaurantToken;
    const prefix = order.area === "BARTENDER" ? "bartender" : "restaurante";
    for (const status of order.area === "BARTENDER" ? ["PREPARANDO", "LISTO", "ENTREGADO"] : ["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]) await api(`/${prefix}/${order.id}/status`, { method: "PATCH", token, body: { status } });
  }
  socket.close();
  add("QR admite exactamente el grupo reservado", poolAccess.valid && poolAccess.entitlement.people === 4, `${poolAccess.entitlement.people} personas`);

  const lookoutAvailability = await api(`/public/availability/MIRADOR?from=${plusDays(1)}`);
  const lookoutOption = lookoutAvailability.flatMap((day) => day.slots.map((slot) => ({ date: day.date, ...slot }))).find((slot) => slot.remaining >= 2);
  if (!lookoutOption) throw new Error("No existe un turno de mirador con dos cupos para la simulacion");
  const lookoutDate = lookoutOption.date;
  const lookoutBooking = await api("/public/bookings", { method: "POST", token: lookout.token, body: { serviceCode: "MIRADOR", planCode: "CENA", planName: "Mesa con consumo", date: lookoutDate, checkIn: lookoutDate, checkOut: lookoutDate, slot: lookoutOption.time, people: 2, adults: 2, children: 0, extras: [{ id: "VENTANA", name: "Mesa junto a la vista", price: 20 }], extrasTotal: 88, preorderItems: [{ menuItemId: 1, quantity: 2 }], preferences: { zone: "Terraza panorámica" }, total: 258, payMode: "FULL", paymentMethod: "PLIN" } });
  const lookoutExperience = await api("/public/my-experience", { token: lookout.token });
  add("Mirador pagado con preorden", lookoutBooking.booking.paymentStatus === "PAGADO" && lookoutExperience.orders.length === 1, lookoutBooking.booking.code);
  const lookoutAccess = await api("/access/validate", { method: "POST", token: receptionToken, body: { code: lookoutExperience.pass.code, serviceCode: "MIRADOR", people: 2 } });
  add("QR de mirador validado", lookoutAccess.valid, lookoutExperience.pass.code);

  const eventDate = plusDays(30 + Number(runId.slice(-3))); const eventPrice = 900 + 34 * 2 + 350 + 30;
  const event = await api("/public/event-quotes", { method: "POST", token: eventClient.token, body: { name: `Evento Integral ${runId}`, type: "EMPRESARIAL", spaceId: 1, startsAt: `${eventDate}T18:00:00`, endsAt: `${eventDate}T22:00:00`, guests: 24, layout: "BANQUETE", catering: [{ menuItemId: 1, name: "Ceviche amazónico", quantity: 2, price: 34 }], equipment: [{ id: "SONIDO", name: "Sonido y micrófonos", price: 350 }], parkingCount: 2, estimatedTotal: eventPrice, notes: "Prueba integral de sincronización" } });
  add("Cotización independiente de evento", event.status === "COTIZACION" && event.balance === eventPrice, event.code);
  await api(`/events/${event.id}/payments`, { method: "POST", token: receptionToken, body: { amount: event.balance, method: "TARJETA", reference: `EV-${runId}` } });
  const events = await api("/events", { token: receptionToken });
  const confirmedEvent = events.find((item) => item.id === event.id);
  add("Evento confirmado y pagado por Recepción", confirmedEvent?.status === "CONFIRMADO" && confirmedEvent.balance === 0, confirmedEvent?.code);

  const checkin = await api("/checkin", { method: "POST", token: receptionToken, body: { reservationId: hotelBooking.booking.id } });
  add("Check-in de hospedaje", checkin.status === "ACTIVA" && checkin.room.id === room.id, `Estadía ${checkin.id}`);
  const restaurantOrder = await api("/public/orders", { method: "POST", token: hotel.token, body: { items: [{ menuItemId: 2, quantity: 1 }], notes: "Cena a la habitación" } });
  const barOrder = await api("/public/orders", { method: "POST", token: hotel.token, body: { items: [{ menuItemId: 4, quantity: 2 }], notes: "Dos bebidas" } });
  add("Compra en restaurante vinculada a habitación", restaurantOrder.area === "RESTAURANTE" && restaurantOrder.roomId === room.id, restaurantOrder.code);
  add("Compra en restobar vinculada a habitación", barOrder.area === "BARTENDER" && barOrder.roomId === room.id, barOrder.code);

  const cleaningRequest = await api("/public/requests", { method: "POST", token: hotel.token, body: { type: "LIMPIEZA", description: "Limpieza ligera y cambio de toallas", priority: "MEDIA" } });
  const conciergeRequest = await api("/public/requests", { method: "POST", token: hotel.token, body: { type: "CONSERJERIA", description: "Solicito información de transporte" } });
  const maintenanceRequest = await api("/public/requests", { method: "POST", token: hotel.token, body: { type: "MANTENIMIENTO", description: "El control remoto no responde", priority: "ALTA" } });
  add("Solicitud del huésped enviada a Limpieza", Boolean(cleaningRequest.taskId), cleaningRequest.code);
  add("Solicitud del huésped enviada a Recepción", conciergeRequest.area === "RECEPCION", conciergeRequest.code);
  add("Incidencia enviada a soporte externo", maintenanceRequest.requiresMaintenance && maintenanceRequest.status === "ABIERTO", maintenanceRequest.code);

  const restaurantOrders = await api("/restaurante", { token: restaurantToken });
  const restaurantTargets = restaurantOrders.filter((item) => [restaurantOrder.id, ...(lookoutBooking.booking.orderIds || []), ...(confirmedEvent.orderIds || [])].includes(item.id));
  for (const order of restaurantTargets) for (const status of ["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]) await api(`/restaurante/${order.id}/status`, { method: "PATCH", token: restaurantToken, body: { status } });
  add("Restaurante procesa pedidos inmediatos y programados", restaurantTargets.length >= 3, `${restaurantTargets.length} pedidos entregados`);
  for (const status of ["PREPARANDO", "LISTO", "ENTREGADO"]) await api(`/bartender/${barOrder.id}/status`, { method: "PATCH", token: bartenderToken, body: { status } });
  add("Bartender procesa y entrega compra", true, barOrder.code);

  const tasks = await api("/cleaning/tasks", { token: cleaningToken });
  const serviceTask = tasks.find((item) => item.id === cleaningRequest.taskId);
  add("Limpieza recibe la solicitud en su panel", Boolean(serviceTask), serviceTask?.code);
  await api(`/cleaning/tasks/${serviceTask.id}/start`, { method: "PATCH", token: cleaningToken });
  await api(`/cleaning/tasks/${serviceTask.id}/evidence`, { method: "POST", token: cleaningToken, body: { description: "Entrada y salida verificadas", files: [{ fileUrl: "/demo-evidence.svg", imageUrl: "/demo-evidence.svg", name: "evidencia.svg" }] } });
  await api(`/cleaning/tasks/${serviceTask.id}/finish`, { method: "PATCH", token: cleaningToken });
  const cleaningReports = await api("/reports?area=LIMPIEZA", { token: cleaningToken });
  add("Limpieza finaliza tarea y solicitud", cleaningReports.reports.find((item) => item.id === cleaningRequest.id)?.status === "RESUELTO", serviceTask.code);

  await api(`/reports/${conciergeRequest.id}/status`, { method: "PATCH", token: receptionToken, body: { status: "RESUELTO" } });
  await api(`/reports/${maintenanceRequest.id}/status`, { method: "PATCH", token: receptionToken, body: { status: "EN_REVISION", contractorName: "Técnico Demo", contractorPhone: "999888777", visitDate: plusDays(1), estimatedCost: 80 } });
  await api(`/reports/${maintenanceRequest.id}/status`, { method: "PATCH", token: receptionToken, body: { status: "RESUELTO" } });
  add("Recepción atiende conserjería y soporte", true, `${conciergeRequest.code}, ${maintenanceRequest.code}`);

  await api("/attendance/check-in", { method: "POST", token: cleaningToken, body: {} });
  await api("/attendance/check-out", { method: "POST", token: cleaningToken, body: {} });
  const payroll = await api(`/payroll/weekly?from=${new Date().toISOString().slice(0, 10)}`, { token: adminToken });
  const cleanerPayroll = payroll.find((item) => item.employee.toLowerCase().includes("ana"));
  add("Asistencia alimenta planilla semanal", cleanerPayroll?.attendedDays >= 1 && cleanerPayroll?.total > 0, `S/ ${cleanerPayroll?.total || 0}`);

  const checkout = await api("/checkout", { method: "POST", token: receptionToken, body: { stayId: checkin.id, paymentAmount: restaurantOrder.total + barOrder.total, paymentMethod: "EFECTIVO" } });
  add("Check-out cobra consumos de restaurante y bar", checkout.status === "FINALIZADA", `Cobrado S/ ${restaurantOrder.total + barOrder.total}`);
  const tasksAfterCheckout = await api("/cleaning/tasks", { token: cleaningToken });
  const checkoutTask = [...tasksAfterCheckout].reverse().find((item) => !item.requestId && item.roomId === room.id && item.status === "PENDIENTE");
  add("Check-out genera limpieza de habitación", Boolean(checkoutTask), checkoutTask?.code);
  await api(`/cleaning/tasks/${checkoutTask.id}/start`, { method: "PATCH", token: cleaningToken });
  await api(`/cleaning/tasks/${checkoutTask.id}/finish`, { method: "PATCH", token: cleaningToken });
  const roomState = (await api("/rooms", { token: receptionToken })).rooms.find((item) => item.id === room.id);
  add("Limpieza libera habitación", roomState.status === "LIBRE", roomState.status);

  const inventoryAfter = await api("/inventory", { token: adminToken });
  const productionBefore = await api("/inventory/production-dashboard?area=RESTAURANTE", { token: restaurantToken });
  const recipe = productionBefore.recipes.find((item) => item.available);
  const productionRecord = await api("/inventory/productions", { method: "POST", token: restaurantToken, body: { area: "RESTAURANTE", menuItemId: recipe.id, portions: 1 } });
  add("Producción descuenta receta por porción", productionRecord.portions === 1 && productionRecord.menuItemId === recipe.id, productionRecord.batch);
  const wasteProduct = (await api("/inventory?area=RESTAURANTE", { token: restaurantToken })).find((item) => item.stock > 0);
  const waste = await api("/inventory/waste", { method: "POST", token: restaurantToken, body: { area: "RESTAURANTE", productId: wasteProduct.id, quantity: .01, reason: "PRUEBA_CONTROLADA", detail: "Validación automática" } });
  add("Merma registra cantidad, costo y responsable", waste.quantity === .01 && waste.responsibleId, `S/ ${waste.cost}`);
  let productionAfter = await api("/inventory/production-dashboard?area=RESTAURANTE", { token: restaurantToken });
  if (!productionAfter.closing) await api("/inventory/daily-close", { method: "POST", token: restaurantToken, body: { area: "RESTAURANTE", counts: productionAfter.products.map((item) => ({ productId: item.id, actual: item.stock })), notes: "Cierre automático de prueba" } });
  productionAfter = await api("/inventory/production-dashboard?area=RESTAURANTE", { token: restaurantToken });
  add("Cierre diario conserva conteo y variación", Boolean(productionAfter.closing?.counts?.length), `${productionAfter.closing?.counts?.length || 0} insumos contados`);
  const consumed = inventoryBefore.some((before) => Number(inventoryAfter.find((item) => item.id === before.id)?.stock) < Number(before.stock));
  add("Entregas descuentan inventario", consumed, "Stock real actualizado");
  const cash = await api("/caja", { token: adminToken });
  add("Pagos sincronizados con caja", cash.summary.income > 0 && cash.movements.some((item) => item.clientId === hotel.client.id), `Ingresos S/ ${cash.summary.income}`);
  const erpClients = await api("/clients", { token: receptionToken });
  const testedClients = erpClients.filter((item) => clients.some((source) => source.client.id === item.id));
  add("Clientes aislados y visibles en ERP", testedClients.length === 4 && testedClients.every((item) => item.status === "ACTIVO"), `${testedClients.length} clientes activos`);

  const deletedPoolClient = await api(`/clients/${pool.client.id}`, { method: "DELETE", token: receptionToken, body: { confirmDocument: pool.client.documentNumber } });
  add("Recepcion elimina una cuenta de prueba y sus dependencias", deletedPoolClient.deleted && deletedPoolClient.removed.bookings >= 1 && deletedPoolClient.removed.passes >= 1, `${Object.values(deletedPoolClient.removed).reduce((sum, value) => sum + value, 0)} registros vinculados eliminados`);
  const recreatedPool = await api("/public/identify", { method: "POST", body: { documentType: pool.client.documentType, documentNumber: pool.client.documentNumber, firstName: "Piscina", lastName: "Cliente Recreado", phone: pool.client.phone, email: `recreado-${runId}@demo.test` } });
  add("El mismo DNI y celular vuelven a registrarse como cliente nuevo", recreatedPool.client.id !== pool.client.id && recreatedPool.client.status === "ACTIVO", `Cliente anterior ${pool.client.id}; nuevo ${recreatedPool.client.id}`);
  const afterRecreate = await api("/clients", { token: receptionToken });
  const matchingDocument = afterRecreate.filter((item) => item.documentNumber === pool.client.documentNumber);
  add("La recreacion no mezcla reservas ni QR anteriores", matchingDocument.length === 1 && matchingDocument[0].id === recreatedPool.client.id && matchingDocument[0].accessStatus !== "ACTIVO", "Ficha nueva sin accesos heredados");

  const passed = results.filter((item) => item.ok).length;
  console.log(JSON.stringify({ runId, passed, total: results.length, percentage: Math.round(passed / results.length * 100), clients: clients.map((item) => ({ id: item.client.id, document: item.client.documentNumber, name: item.client.firstName })), results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ runId, error: error.message, passed: results.filter((item) => item.ok).length, totalExecuted: results.length, results }, null, 2));
  process.exitCode = 1;
});
