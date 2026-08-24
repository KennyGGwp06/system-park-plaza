const BASE = process.env.DEMO_API || "http://localhost:3000/api";
const PASSWORD = process.env.DEMO_STAFF_PASSWORD || "ParkPlaza123*";
const runId = String(Date.now()).slice(-8);
const results = [];

function hotelDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pass(name, detail) {
  results.push({ name, status: "OK", detail });
  console.log(`OK  ${name}: ${detail}`);
}

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${data?.message || "Error sin detalle"}`);
  return data;
}

async function login(email) {
  return api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
}

async function ensureAttendance(auth) {
  let current = await api("/attendance/current", { token: auth.token });
  if (!current.active) {
    await api("/attendance/check-in", { method: "POST", token: auth.token, body: { employeeId: auth.user.id } });
    current = await api("/attendance/current", { token: auth.token });
  }
  if (!current.active) throw new Error(`No se pudo abrir la jornada de ${auth.user.role}`);
  return current;
}

async function ensureOperationalInventory(auth, area) {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await api(`/operational-inventory/sessions?area=${area}&date=${today}`, { token: auth.token });
  let session = sessions.find((item) => ["OPEN", "OPERATING", "REOPENED"].includes(item.status));
  if (session) return session;
  session = sessions.find((item) => item.status === "PENDING");
  if (!session) throw new Error(`La asistencia no creó un inventario pendiente para ${area}`);
  const references = await api("/operational-inventory/references", { token: auth.token });
  const openingCounts = references.stock
    .filter((item) => Number(item.warehouseId) === Number(session.warehouseId))
    .map((item) => ({ productId: item.productId, lotId: item.lotId || null, quantity: Number(item.onHand || 0) }));
  return api(`/operational-inventory/sessions/${session.id}/open`, { method: "POST", token: auth.token, body: { openingCounts } });
}

async function closeExpiredDemoSessions(admin) {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await api("/operational-inventory/sessions", { token: admin.token });
  const expired = sessions.filter((item) => item.date < today && item.metadata?.source === "OPERATIONAL_INVENTORY_V1" && ["OPEN", "COUNTING", "SUBMITTED", "OBSERVED"].includes(item.status));
  for (const entry of expired) {
    let session = await api(`/operational-inventory/sessions/${entry.id}`, { token: admin.token });
    if (session.status === "OPEN") session = await api(`/operational-inventory/sessions/${entry.id}/start-count`, { method: "POST", token: admin.token, body: {} });
    if (session.status === "COUNTING") {
      session = await api(`/operational-inventory/sessions/${entry.id}/submit`, {
        method: "POST",
        token: admin.token,
        body: {
          counts: session.lines.map((line) => ({ productId: line.productId, lotId: line.lotId || null, quantity: Number(line.expectedQuantity || 0) })),
          explanations: [],
          notes: "Cierre técnico de turno de demostración vencido"
        }
      });
    }
    if (["SUBMITTED", "OBSERVED"].includes(session.status)) await api(`/operational-inventory/sessions/${entry.id}/close`, { method: "POST", token: admin.token, body: {} });
  }
  return expired.length;
}

async function replenishArea(admin, operator, area) {
  const [recipes, references] = await Promise.all([
    api(`/operational-recipes/${area}`, { token: operator.token }),
    api("/technical-recipes/references", { token: admin.token })
  ]);
  const recipe = recipes.find((item) => item.menuItemId && item.ingredients?.length);
  if (!recipe) throw new Error(`No existe una receta técnica vigente para ${area}`);
  const legacyByProduct = new Map(references.products.map((item) => [Number(item.id), Number(item.legacyId || 0)]));
  const items = recipe.ingredients.map((ingredient) => {
    const target = Number(ingredient.requiredPerPortion || 0) * 3;
    const shortage = Math.max(0, target - Number(ingredient.availableBaseQuantity || 0));
    return { productId: legacyByProduct.get(Number(ingredient.productId)), quantity: Math.ceil((shortage + 0.000001) * 1000) / 1000 };
  }).filter((item) => item.productId && item.quantity > 0);
  if (items.length) await api("/daily-inventory/assign", { method: "POST", token: admin.token, body: { area, items } });
  return { assigned: items.length, menuItemId: Number(recipe.menuItemId), recipeName: recipe.name };
}

async function main() {
  const health = await api("/health");
  if (health.status !== "ok" || health.database !== "connected") throw new Error("Backend o PostgreSQL no están saludables");
  pass("Servicios principales", "API y PostgreSQL conectados");

  const [reception, restaurant, bartender, cleaning, admin] = await Promise.all([
    login("recepcion@parkplaza.com"),
    login("restaurante@parkplaza.com"),
    login("bartender@parkplaza.com"),
    login("limpieza@parkplaza.com"),
    login("admin@parkplaza.com")
  ]);
  pass("Perfiles internos", "Recepción, Restaurante, Bartender y Limpieza autenticados");

  const expiredSessions = await closeExpiredDemoSessions(admin);
  if (expiredSessions) pass("Saneamiento de turnos", `${expiredSessions} turno(s) de demostración vencido(s) cerrados con conteo y auditoría`);

  const [restaurantStock, barStock] = await Promise.all([
    replenishArea(admin, restaurant, "RESTAURANTE"),
    replenishArea(admin, bartender, "BARTENDER")
  ]);
  pass("Inventario de demostración", `${restaurantStock.assigned} insumo(s) de Cocina y ${barStock.assigned} de Bar repuestos según las recetas elegidas`);

  await Promise.all([ensureAttendance(reception), ensureAttendance(restaurant), ensureAttendance(bartender), ensureAttendance(cleaning)]);
  const [restaurantSession, barSession] = await Promise.all([
    ensureOperationalInventory(restaurant, "RESTAURANTE"),
    ensureOperationalInventory(bartender, "BARTENDER")
  ]);
  pass("Turnos operativos", `Cocina ${restaurantSession.shift} y Bar ${barSession.shift} abiertos`);

  const customer = await api("/public/identify", {
    method: "POST",
    body: {
      documentType: "DNI",
      documentNumber: `88${runId}`,
      firstName: "Cliente",
      lastName: `Piloto ${runId.slice(-4)}`,
      phone: `9${runId}`.slice(0, 9),
      email: `piloto-${runId}@parkplaza.test`
    }
  });
  pass("Cliente", `${customer.client.firstName} ${customer.client.lastName} creado sin mezclar datos anteriores`);

  const checkIn = hotelDate();
  const checkOut = hotelDate(2);
  const rooms = await api(`/public/rooms?checkIn=${checkIn}&checkOut=${checkOut}`);
  const room = rooms.find((item) => Number(item.capacity || 0) >= 2) || rooms[0];
  if (!room) throw new Error("No existe una habitación libre para ejecutar la prueba");
  const bookingResult = await api("/public/bookings", {
    method: "POST",
    token: customer.token,
    body: {
      serviceCode: "HOSPEDAJE",
      planCode: "FLEX",
      planName: "Flexible",
      roomId: room.id,
      checkIn,
      checkOut,
      date: checkIn,
      slot: "15:00",
      people: 2,
      adults: 2,
      children: 0,
      guests: [{ firstName: "Acompañante", lastName: "Piloto", documentNumber: `77${runId}` }],
      extras: [],
      total: Number(room.price) * 2,
      payMode: "FULL",
      paymentMethod: "YAPE"
    }
  });
  const booking = bookingResult.booking;
  if (booking.paymentStatus !== "PAGADO" || booking.accessStatus !== "LISTO_INGRESO") throw new Error("La reserva pagada no quedó lista para ingreso");
  pass("Reserva del cliente", `${booking.code}, habitación ${room.number}, pago completo y QR listo`);

  const receptionReservations = await api("/reservations", { token: reception.token });
  const visibleReservation = receptionReservations.find((item) => Number(item.id) === Number(booking.id));
  if (!visibleReservation) throw new Error("Recepción no recibió la reserva del cliente");
  const stay = await api("/checkin", { method: "POST", token: reception.token, body: { reservationId: booking.id } });
  const checkedExperience = await api("/public/my-experience", { token: customer.token });
  const activeAccess = checkedExperience.pass.entitlements.find((item) => Number(item.bookingId) === Number(booking.id));
  if (stay.status !== "ACTIVA" || activeAccess?.status !== "ACTIVO") throw new Error("El check-in no activó la estancia y el pase");
  pass("Recepción", `Reserva visible, check-in realizado y pase ${checkedExperience.pass.code} activo`);

  const catalog = await api("/public/catalog");
  const restaurantItem = catalog.menu.find((item) => Number(item.id) === restaurantStock.menuItemId && item.available);
  const barItem = catalog.menu.find((item) => Number(item.id) === barStock.menuItemId && item.available);
  if (!restaurantItem || !barItem) throw new Error("Falta al menos un producto vendible con receta activa en Cocina o Bar");
  const combined = await api("/public/orders", {
    method: "POST",
    token: customer.token,
    body: {
      bookingId: booking.id,
      paymentMethod: "YAPE",
      notes: "Prueba piloto: entregar en la habitación",
      items: [
        { menuItemId: restaurantItem.id, quantity: 1, notes: "Preparación estándar" },
        { menuItemId: barItem.id, quantity: 1, notes: "Servir frío" }
      ]
    }
  });
  const restaurantOrder = combined.orders.find((item) => item.area === "RESTAURANTE");
  const barOrder = combined.orders.find((item) => item.area === "BARTENDER");
  if (!restaurantOrder || !barOrder) throw new Error("El pedido combinado no se separó por área");
  pass("Pedido del cliente", `${combined.groupCode} dividido entre ${restaurantOrder.code} y ${barOrder.code}`);

  const kitchenQueue = await api("/restaurante", { token: restaurant.token });
  if (!kitchenQueue.some((item) => Number(item.id) === Number(restaurantOrder.id))) throw new Error("Cocina no recibió su pedido");
  for (const status of ["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]) {
    await api(`/restaurante/${restaurantOrder.id}/status`, { method: "PATCH", token: restaurant.token, body: { status } });
  }
  pass("Restaurante", `${restaurantOrder.code} aceptado, preparado, listo y entregado con consumo de receta`);

  const barQueue = await api("/bartender", { token: bartender.token });
  if (!barQueue.some((item) => Number(item.id) === Number(barOrder.id))) throw new Error("Bar no recibió su pedido");
  for (const status of ["PREPARANDO", "LISTO", "ENTREGADO"]) {
    await api(`/bartender/${barOrder.id}/status`, { method: "PATCH", token: bartender.token, body: { status } });
  }
  pass("Bartender", `${barOrder.code} preparado, listo y entregado con consumo de receta`);

  const cleaningRequest = await api("/public/requests", {
    method: "POST",
    token: customer.token,
    body: { type: "LIMPIEZA", description: "Cambio de toallas y limpieza ligera para prueba piloto", priority: "MEDIA" }
  });
  const tasks = await api("/cleaning/tasks", { token: cleaning.token });
  const task = tasks.find((item) => Number(item.id) === Number(cleaningRequest.taskId));
  if (!task) throw new Error("Limpieza no recibió la solicitud del huésped");
  await api(`/cleaning/tasks/${task.id}/start`, { method: "PATCH", token: cleaning.token });
  await api(`/cleaning/tasks/${task.id}/evidence`, {
    method: "POST",
    token: cleaning.token,
    body: { description: "Habitación atendida y verificada", files: [{ fileUrl: "/demo-evidence.svg", name: "evidencia-piloto.svg" }] }
  });
  await api(`/cleaning/tasks/${task.id}/finish`, { method: "PATCH", token: cleaning.token });
  const finalExperience = await api("/public/my-experience", { token: customer.token });
  const finalRequest = finalExperience.requests.find((item) => Number(item.id) === Number(cleaningRequest.id));
  if (finalRequest?.status !== "RESUELTO") throw new Error("La tarea terminó, pero la solicitud del cliente no quedó resuelta");
  if (!finalExperience.orders.filter((item) => item.groupCode === combined.groupCode).every((item) => item.status === "ENTREGADO")) throw new Error("El cliente no ve ambos pedidos como entregados");
  pass("Limpieza", `${task.code} recibida, iniciada, documentada y finalizada`);
  pass("Cierre del recorrido", "El cliente ve pedidos entregados y solicitud resuelta en su experiencia");

  console.log(JSON.stringify({
    status: "PASSED",
    runId,
    client: { id: customer.client.id, name: `${customer.client.firstName} ${customer.client.lastName}`, document: customer.client.documentNumber },
    booking: { id: booking.id, code: booking.code, room: room.number, pass: checkedExperience.pass.code },
    orderGroup: combined.groupCode,
    cleaningTask: task.code,
    tests: results.length,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", runId, error: error.message, completed: results }, null, 2));
  process.exitCode = 1;
});
