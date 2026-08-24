const BASE = process.env.DEMO_API || "http://localhost:3000/api";
const PASSWORD = process.env.DEMO_STAFF_PASSWORD || "ParkPlaza123*";
const runId = String(Date.now()).slice(-8);
let adminToken = "";
let testClient = null;

function hotelDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function api(path, { method = "GET", token, body, raw, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status}: ${data?.message || "Error sin detalle"}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function ok(label, detail) { console.log(`OK  ${label}: ${detail}`); }

async function main() {
  const login = await api("/auth/login", { method: "POST", body: { email: "admin@parkplaza.com", password: PASSWORD } });
  adminToken = login.token;
  const today = hotelDate();
  const lateArrival = hotelDate(-2);
  const tomorrow = hotelDate(1);
  const documentNumber = `98${runId}`;
  const phone = `9${runId}`;

  const identity = await api("/public/identify", { method: "POST", body: { documentType: "DNI", documentNumber, firstName: "Prueba", lastName: "Flujo Operativo", phone, email: `flujo-${runId}@example.test` } });
  testClient = identity.client;
  const rooms = await api(`/public/rooms?checkIn=${lateArrival}&checkOut=${tomorrow}`);
  if (!rooms.length) throw new Error("No hay una habitación libre para ejecutar la prueba controlada");
  const room = rooms[0];

  const createBooking = async () => ({ booking: await api("/reservations", {
    method: "POST",
    token: adminToken,
    body: { clientId: testClient.id, roomId: room.id, checkInDate: lateArrival, checkOutDate: tomorrow, adults: 1, children: 0, totalPrice: Number(room.price), advance: Number(room.price), paymentMethod: "YAPE", status: "CONFIRMADA" }
  }) });

  const first = await createBooking();
  if (first.booking.paymentStatus !== "PAGADO" || Number(first.booking.balance) !== 0) throw new Error("La reserva de prueba no quedó pagada");
  const receptionRows = await api(`/checkin/search?search=${first.booking.code}`, { token: adminToken });
  if (!receptionRows.some((item) => Number(item.id) === Number(first.booking.id) && !item.stay)) throw new Error("Recepción no encontró la llegada pagada y atrasada");
  const stay = await api("/checkin", { method: "POST", token: adminToken, body: { reservationId: first.booking.id } });
  ok("Check-in pagado y atrasado", `${first.booking.code} ingresó en habitación ${room.number}`);

  await api("/checkout", { method: "POST", token: adminToken, body: { stayId: stay.id, paymentAmount: 0, paymentMethod: "YAPE" } });
  const tasks = await api("/cleaning/tasks", { token: adminToken });
  const task = tasks.find((item) => Number(item.clientId) === Number(testClient.id) && Number(item.roomId) === Number(room.id) && item.status === "PENDIENTE");
  if (!task || task.room?.status !== "EN_LIMPIEZA") throw new Error("El check-out no creó la tarea de limpieza conectada");
  await api(`/cleaning/tasks/${task.id}/start`, { method: "PATCH", token: adminToken, body: {} });

  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=", "base64");
  const upload = await api("/cleaning/evidence/upload", { method: "POST", token: adminToken, raw: pixel, headers: { "Content-Type": "image/png", "X-File-Name": "evidencia-prueba.png" } });
  const stored = upload.files?.[0];
  if (!stored?.fileUrl?.startsWith("/uploads/cleaning/") || Number(stored.size) !== pixel.length) throw new Error("La fotografía no se almacenó como archivo real");
  const evidenceResponse = await fetch(`${new URL(BASE).origin}${stored.fileUrl}`);
  const evidenceBytes = Buffer.from(await evidenceResponse.arrayBuffer());
  if (!evidenceResponse.ok || evidenceResponse.headers.get("content-type") !== "image/png" || !evidenceBytes.equals(pixel)) throw new Error("La fotografía almacenada no se puede recuperar intacta");
  await api(`/cleaning/tasks/${task.id}/evidence`, { method: "POST", token: adminToken, body: { description: "ENTRADA: prueba automática", files: [stored] } });
  await api(`/cleaning/tasks/${task.id}/evidence`, { method: "POST", token: adminToken, body: { description: "SALIDA: prueba automática", files: [stored] } });
  await api(`/cleaning/tasks/${task.id}/finish`, { method: "PATCH", token: adminToken, body: {} });
  const roomPayload = await api("/rooms", { token: adminToken });
  const roomRows = Array.isArray(roomPayload) ? roomPayload : (roomPayload.rooms || []);
  const cleaned = roomRows.find((item) => Number(item.id) === Number(room.id));
  if (cleaned?.status !== "LIBRE") throw new Error(`Limpieza dejó la habitación en ${cleaned?.status || "estado desconocido"}`);
  ok("Limpieza conectada", `entrada y salida reales liberaron habitación ${room.number}`);

  const second = await createBooking();
  let duplicateBlocked = false;
  try { await createBooking(); } catch (error) { duplicateBlocked = error.status === 409; }
  if (!duplicateBlocked) throw new Error("La API permitió una reserva duplicada para la misma habitación y fechas");
  await api("/checkin", { method: "POST", token: adminToken, body: { reservationId: second.booking.id } });
  ok("Reutilización segura", "la habitación limpia aceptó un nuevo check-in y bloqueó la doble reserva");
}

try {
  await main();
  console.log("\nFlujo operativo de check-in y limpieza: APROBADO");
} finally {
  if (testClient && adminToken) {
    await api(`/clients/${testClient.id}`, { method: "DELETE", token: adminToken, body: { confirmDocument: testClient.documentNumber } }).catch((error) => console.error(`No se pudo limpiar el cliente de prueba: ${error.message}`));
  }
}
