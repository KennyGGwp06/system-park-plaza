import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import QRCode from "qrcode";
import { Server as SocketServer } from "socket.io";
import { initializeDatabase, mutateState, readRelationalInventoryStatus, readState, synchronizeDailyAttendance } from "./db.js";
import { normalizeStaffRole, writeSecurityAudit } from "./security-audit.js";
import { archiveCatalogProduct, catalogReferences, createCatalogCategory, createCatalogProduct, createCatalogUnit, getCatalogProduct, listCatalogProducts, receiveCatalogCost, suggestFefo, updateCatalogProduct } from "./product-catalog.js";
import { createGoodsReceipt, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, postGoodsReceipt, purchasingReferences, verifyGoodsReceipt } from "./purchasing.js";
import { cancelTransfer, createTransfer, getTransfer, listTransfers, receiveTransfer, rejectTransfer, sendTransfer, transferReferences, transferStockOverview } from "./transfers.js";
import { closeOperationalInventory, createOperationalInventory, getOperationalInventory, listOperationalInventories, observeOperationalInventory, openOperationalInventory, operationalInventoryReferences, registerOperationalWaste, reopenOperationalInventory, startOperationalCount, submitOperationalCount } from "./operational-inventory.js";
import { activeRecipeSalesForMenu, activateTechnicalRecipeVersion, archiveTechnicalRecipeVersion, createTechnicalRecipe, createTechnicalRecipeVersion, getTechnicalRecipe, listRecipeSales, listTechnicalRecipes, operationalRecipeManual, technicalRecipeReferences, updateTechnicalRecipeDraft } from "./technical-recipes.js";
import { completePortioning, completeProcessing, completeProduction, listTransformations, traceLot, transformationReferences } from "./transformations.js";
import { confirmOrdersInventory, getOrderInventoryDetail, transitionOrderInventory } from "./order-inventory.js";
import { barBottleReferences, closeBarBottle, listBarBottles, measureBarBottle, openBarBottle, serveBarBottle } from "./bar-bottles.js";
import { inventoryAdminDashboard, inventoryAdminReferences } from "./inventory-admin-dashboard.js";
import { createStockRequest, listStockRequests, reviewStockRequest, stockRequestReferences } from "./stock-requests.js";
import { ensureStayAccess, validateOrderSchema } from "./state-stabilization.js";
import { withOrderTiming } from "./order-operations.js";
import { dataIntegrityReport, sanitizeDataIntegrity } from "./data-integrity.js";
import { electronicBillingAccess, electronicBillingConfiguration, electronicDocumentArtifact, issueElectronicDocument, retryElectronicDocument } from "./electronic-billing.js";

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const isExplicitDemo = process.env.PARK_PLAZA_DEMO === "true";
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? null : "park-plaza-local-demo");
const demoStaffPassword = process.env.DEMO_STAFF_PASSWORD || "ParkPlaza123*";
const uploadRoot = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
const cleaningUploadDir = join(uploadRoot, "cleaning");
const menuUploadDir = join(uploadRoot, "menu");
const experienceUploadDir = join(uploadRoot, "experience");
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CUSTOMER_URL,
  process.env.OPERATIONS_URL,
  ...(isProduction && !isExplicitDemo ? [] : ["http://localhost:5173", "http://localhost:4173", "http://localhost:4174"])
].filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origen no autorizado"));
  },
  credentials: true
};

function hashStaffPassword(value) {
  const password = String(value || "");
  if (password.length < 12) throw httpError(400, "La contraseña temporal debe tener al menos 12 caracteres");
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyStaffPassword(value, encoded) {
  try {
    const [scheme, saltHex, hashHex] = String(encoded || "").split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(String(value || ""), Buffer.from(saltHex, "hex"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashAttendancePin(value) {
  const pin = String(value || "");
  if (!/^\d{4}$/.test(pin)) throw httpError(400, "El PIN de asistencia debe tener exactamente 4 dígitos");
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyAttendancePin(value, employee) {
  const encoded = employee?.pinHash;
  if (encoded) return verifyStaffPassword(value, encoded);
  // Compatibilidad con usuarios demo creados antes de incorporar PIN cifrado.
  return /^\d{4}$/.test(String(employee?.pin || "")) && String(employee.pin) === String(value || "");
}

function safeStaffUser(_state, user) {
  const { passwordHash: _passwordHash, pin: _pin, pinHash: _pinHash, ...safe } = user;
  return { ...safe, pinConfigured: Boolean(user.pinHash || user.pin) };
}

function safeEmployee(employee) {
  const { passwordHash: _passwordHash, pin: _pin, pinHash: _pinHash, ...safe } = employee;
  return { ...safe, pinConfigured: Boolean(employee.pinHash || employee.pin) };
}

if (!jwtSecret) throw new Error("JWT_SECRET es obligatorio en producción");
if (isProduction && !isExplicitDemo && (!process.env.DEMO_STAFF_PASSWORD || demoStaffPassword === "ParkPlaza123*" || demoStaffPassword.length < 12)) {
  throw new Error("DEMO_STAFF_PASSWORD debe reemplazarse por una clave segura de al menos 12 caracteres en producción");
}

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
const io = new SocketServer(httpServer, { cors: corsOptions });
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: "3mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use("/uploads", express.static(uploadRoot, { fallthrough: false, maxAge: "7d", immutable: true }));
app.use(morgan(isProduction ? "combined" : "dev"));
app.use((req, res, next) => {
  res.on("finish", () => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && res.statusCode < 400) {
      io.emit("state:changed", { path: req.path, method: req.method, clientId: req.client?.id || null, at: Date.now() });
    }
  });
  next();
});

io.on("connection", (socket) => {
  socket.emit("realtime:ready", { connected: true, at: Date.now() });
});
io.engine.on("connection_error", (error) => {
  console.error("Realtime connection error", error.code, error.message);
});

const nextId = (state, key) => ++state.counters[key];
const now = () => new Date().toISOString();
const code = (prefix, id) => `${prefix}-${String(id).padStart(4, "0")}`;
// La sesión de huésped es deliberadamente corta. La renovación se realizará con
// una nueva verificación de reserva; nunca con DNI como único factor.
const publicToken = (clientId) => jwt.sign({ sub: clientId, kind: "CLIENT" }, jwtSecret, { expiresIn: "12h" });
const dateKey = (value) => String(value || "").slice(0, 10);
const hotelToday = (state) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: state?.settings?.timezone || "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const roomReady = (room) => room?.status === "LIBRE";

app.get("/api/health", async (_req, res, next) => {
  try { await readState(); res.json({ status: "ok", database: "connected", persistence: "postgresql", mode: isExplicitDemo ? "demo" : isProduction ? "production" : "development", realtimeConnections: io.engine.clientsCount }); } catch (error) { next(error); }
});

// El navegador no lee huellas. El driver de ZKTeco trabaja en Windows y este
// endpoint recibe solo el identificador externo que entrega el puente local.
app.post("/api/biometric/clock", biometricBridgeAuth, async (req, res, next) => {
  try {
    const result = await mutateState(async (state, client) => {
      const externalId = String(req.body.externalId || "").trim();
      if (!externalId) throw httpError(400, "El puente debe enviar el identificador biométrico del empleado");
      const user = state.users.find((item) => item.status === "ACTIVO" && String(item.biometric?.externalId || "") === externalId);
      if (!user) throw httpError(404, "No existe un empleado activo asociado a esta huella");
      const today = hotelToday(state);
      const open = [...state.attendance].reverse().find((row) => Number(row.employeeId || row.userId) === Number(user.id) && attendanceDateOf(row) === today && (row.checkIn || row.clockIn) && !(row.checkOut || row.clockOut));
      const action = open ? "SALIDA" : "INGRESO";
      const record = await recordAttendance(state, client, user.id, action, user.id);
      record.source = "BIOMETRIC_ZK9500";
      record.deviceId = String(req.body.deviceId || state.settings?.biometric?.deviceName || "ZK9500");
      audit(state, "BIOMETRIA", action, `${user.firstName} ${user.lastName} · ${record.deviceId}`, user.id);
      return { success: true, user: `${user.firstName} ${user.lastName}`, action: action === "INGRESO" ? "CHECK_IN" : "CHECK_OUT", record, operationalSessionId: record.operationalSessionId || null };
    });
    res.json(result);
  } catch (error) { next(error); }
});

const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const nowMs = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= nowMs) {
    loginAttempts.set(key, { count: 1, resetAt: nowMs + windowMs });
    return next();
  }
  if (record.count >= 10) return res.status(429).json({ message: "Demasiados intentos. Intenta nuevamente en unos minutos." });
  record.count += 1;
  return next();
}

// El reloj es una terminal compartida. El límite se aplica por DNI e IP para
// evitar bloquear a todo el personal por los errores de una sola persona.
const attendanceAttempts = new Map();
function attendanceAttemptKey(req) { return `${req.ip || "unknown"}:${String(req.body?.documentNumber || req.params?.documentNumber || "").replace(/\D/g, "")}`; }
function attendanceClockRateLimit(req, res, next) {
  const key = attendanceAttemptKey(req);
  const nowMs = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = attendanceAttempts.get(key);
  if (!record || record.resetAt <= nowMs) {
    attendanceAttempts.set(key, { count: 1, resetAt: nowMs + windowMs });
    return next();
  }
  if (record.count >= 5) return res.status(429).json({ message: "Demasiados intentos. Solicita ayuda a Recepción." });
  record.count += 1;
  return next();
}

app.post("/api/public/identify", loginRateLimit, async (req, res, next) => {
  try {
    const documentNumber = normalizeDocument(req.body.documentNumber);
    if (!documentNumber) return res.status(400).json({ message: "Ingresa un documento" });
    const client = await mutateState((state) => {
      const existing = state.clients.find((row) => normalizeDocument(row.documentNumber) === documentNumber);
      if (existing) throw httpError(409, "Este documento ya tiene una cuenta. Usa ‘Recuperar mi reserva’ con tu DNI para continuar.");
      const id = nextId(state, "client");
      const item = { id, documentType: req.body.documentType || "DNI", documentNumber, firstName: req.body.firstName || "Visitante", lastName: req.body.lastName || "Park Plaza", phone: req.body.phone || "", email: req.body.email || "", status: "ACTIVO", createdAt: now() };
      state.clients.push(item);
      audit(state, "CLIENTE", "IDENTIFICAR", `Cliente ${documentNumber}`, null);
      return item;
    });
    res.json({ client, token: publicToken(client.id) });
  } catch (error) { next(error); }
});

app.post("/api/public/recover", loginRateLimit, async (req, res, next) => {
  try {
    const documentNumber = normalizeDocument(req.body.documentNumber);
    const reservationCode = String(req.body.reservationCode || "").trim().toUpperCase();
    if (!documentNumber || !reservationCode) {
      return res.status(400).json({ message: "Ingresa tu documento y el código de tu reserva para verificarla." });
    }
    const state = await readState();
    const client = state.clients.find((item) => normalizeDocument(item.documentNumber) === documentNumber);
    const matchesReservation = [
      ...(state.bookings || []),
      ...(state.reservations || []),
      ...(state.events || [])
    ].some((item) => Number(item.clientId) === Number(client?.id) && String(item.code || "").toUpperCase() === reservationCode);
    if (!client || !matchesReservation) {
      return res.status(404).json({ message: "No encontramos una reserva que coincida con esos datos. Revisa el código o consulta en Recepción." });
    }
    if (["BLOQUEADO", "INACTIVO"].includes(client.status)) return res.status(403).json({ message: "Esta cuenta está deshabilitada. Acércate a Recepción para reactivarla." });
    res.json({ client, token: publicToken(client.id) });
  } catch (error) { next(error); }
});

app.get("/api/public/catalog", async (_req, res, next) => {
  try {
    const state = await readState();
    const operationalRecipes = (await Promise.all([operationalRecipeManual("RESTAURANTE"), operationalRecipeManual("BARTENDER")])).flat();
    const operationalByMenu = new Map(operationalRecipes.filter((item) => item.menuItemId).map((item) => [Number(item.menuItemId), item]));
    const publicMenuItem = (item) => {
      const hydrated = hydrateMenuItem(state, item);
      const operational = operationalByMenu.get(Number(item.id));
      const salesEnabled = item.salesEnabled === true;
      return { ...hydrated, salesEnabled, available: salesEnabled && Number(operational?.availablePortions || 0) > 0, availablePortions: Number(operational?.availablePortions || 0), limitingIngredient: operational?.limitingIngredient || null };
    };
    const roomMedia = roomTypeMedia(state);
    const roomGroups = Object.values(state.rooms.reduce((acc, room) => {
      const key = room.type.name;
      acc[key] ||= { ...room.type, capacity: room.capacity, price: room.price, features: room.features, imageUrl: roomMedia[key]?.imageUrl || "", description: roomMedia[key]?.description || "", available: 0 };
      if (room.status === "LIBRE") acc[key].available++;
      return acc;
    }, {}));
    const parkingSpaces = state.cochera.filter((item) => item.status === "LIBRE").map((item) => ({ id: item.id, code: item.code, type: item.type || "GENERAL" }));
    const occupiedParkingSpaces = state.cochera.filter((item) => item.status !== "LIBRE").map((item) => item.code);
    const experience = experienceCatalog(state);
    experience.restaurantMenu = experience.restaurantMenu.map((item) => publicMenuItem(item));
    const parkingRates = state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 };
    res.json({ services: state.services, roomTypes: roomGroups, menu: state.menuItems.filter((item) => item.active).map(publicMenuItem), eventSpaces: eventSpaces(state), experienceMedia: experienceMedia(state), ...experience, parking: { available: parkingSpaces.length, spaces: parkingSpaces, occupiedSpaces: occupiedParkingSpaces, motorcyclePrice: Number(parkingRates.MOTO || 0), carPrice: Number(parkingRates.AUTO || 0), truckPrice: Number(parkingRates.CAMIONETA || 0), vanPrice: Number(parkingRates.MINIVAN || 0) } });
  } catch (error) { next(error); }
});

app.get("/api/public/availability/:serviceCode", async (req, res, next) => {
  try {
    const state = await readState();
    const service = state.services.find((item) => item.code === req.params.serviceCode);
    if (!service) throw httpError(404, "Experiencia no encontrada");
    const start = new Date(`${req.query.from || state.settings.today}T12:00:00`);
    const days = Array.from({ length: 21 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
      const nextDate = new Date(new Date(`${date}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10);
      const slotNames = service.code === "PISCINA" ? ["09:00", "13:00", "16:00"] : service.code === "MIRADOR" ? ["16:30", "18:00", "19:30"] : ["15:00"];
      const slots = slotNames.map((slot) => { const used = state.bookings.filter((item) => item.serviceCode === service.code && item.date === date && item.slot === slot && !["CANCELADA", "FINALIZADA"].includes(item.status)).reduce((sum, item) => sum + Number(item.people || 1), 0); const capacity = Number(service.capacity || state.rooms.length); return { time: slot, capacity, remaining: Math.max(0, capacity - used), available: used < capacity }; });
      const roomRemaining = state.rooms.filter((room) => room.status === "LIBRE" && !state.bookings.some((item) => item.roomId === room.id && !["CANCELADA", "FINALIZADA"].includes(item.status) && overlaps(date, nextDate, item.checkIn, item.checkOut))).length;
      return { date, available: service.code === "HOSPEDAJE" ? roomRemaining > 0 : slots.some((item) => item.available), remaining: service.code === "HOSPEDAJE" ? roomRemaining : slots.reduce((sum, item) => sum + item.remaining, 0), slots };
    });
    res.json(days);
  } catch (error) { next(error); }
});

app.get("/api/public/rooms", async (req, res, next) => {
  try {
    const state = await readState();
    const bookedIds = state.bookings.filter((booking) => !["CANCELADA", "FINALIZADA"].includes(booking.status) && overlaps(req.query.checkIn, req.query.checkOut, booking.checkIn, booking.checkOut)).map((booking) => booking.roomId);
    const media = roomTypeMedia(state);
    res.json(state.rooms.filter((room) => room.status === "LIBRE" && !bookedIds.includes(room.id) && (!req.query.type || room.type.name === req.query.type)).map((room) => ({ ...room, imageUrl: media[room.type?.name]?.imageUrl || "", description: media[room.type?.name]?.description || "" })));
  } catch (error) { next(error); }
});

app.post("/api/public/bookings", clientAuth, async (req, res, next) => {
  try {
    const result = await mutateState(async (state, client) => {
      const serviceCode = req.body.serviceCode || "HOSPEDAJE";
      const service = state.services.find((item) => item.code === serviceCode);
      if (!service) throw httpError(400, "Servicio no válido");
      const requestedDate = dateKey(req.body.checkIn || req.body.date);
      if (!requestedDate || requestedDate < hotelToday(state)) throw httpError(400, "La fecha de la reserva no puede estar en el pasado");
      if (serviceCode === "HOSPEDAJE" && dayDiff(req.body.checkIn, req.body.checkOut) <= 0) throw httpError(400, "La fecha de salida debe ser posterior a la fecha de entrada");
      const room = serviceCode === "HOSPEDAJE" ? state.rooms.find((item) => item.id === Number(req.body.roomId) && roomReady(item)) : null;
      if (serviceCode === "HOSPEDAJE" && !room) throw httpError(409, "La habitación ya no está disponible");
      if (serviceCode === "HOSPEDAJE" && state.bookings.some((item) => Number(item.roomId) === Number(room.id) && !["CANCELADA", "FINALIZADA"].includes(item.status) && overlaps(req.body.checkIn, req.body.checkOut, item.checkIn, item.checkOut))) {
        throw httpError(409, "La habitación acaba de ser reservada para esas fechas. Elige otra opción disponible");
      }
      const bookingId = nextId(state, "booking");
      const people = Math.max(1, Number(req.body.people || 1));
      if (serviceCode !== "HOSPEDAJE") { const used = state.bookings.filter((item) => item.serviceCode === serviceCode && item.date === req.body.date && item.slot === req.body.slot && !["CANCELADA", "FINALIZADA"].includes(item.status)).reduce((sum, item) => sum + Number(item.people || 1), 0); if (used + people > Number(service.capacity || 999)) throw httpError(409, "Ya no hay cupos suficientes en ese horario"); }
      const nights = serviceCode === "HOSPEDAJE" ? Math.max(1, dayDiff(req.body.checkIn, req.body.checkOut)) : 1;
      const vehicles = (Array.isArray(req.body.vehicles) ? req.body.vehicles.slice(0, 8) : req.body.parking ? [req.body.parking] : []).map((vehicle) => ({ ...vehicle, type: String(vehicle.type || "AUTO").toUpperCase(), plate: String(vehicle.plate || "").trim().toUpperCase(), spaceId: vehicle.spaceId ? Number(vehicle.spaceId) : null }));
      if (vehicles.some((vehicle) => !["MOTO", "AUTO", "CAMIONETA", "MINIVAN"].includes(vehicle.type))) throw httpError(400, "Tipo de vehículo no válido");
      if (vehicles.some((vehicle) => !vehicle.plate)) throw httpError(400, "Registra la placa de cada vehículo o elimina la cochera");
      // El servidor vuelve a calcular el total con las tarifas del dueño.
      // Nunca acepta un total enviado por el navegador como fuente de verdad.
      const { total, extrasTotal, parkingTotal } = calculateBookingPrice(state, { serviceCode, room, nights, people, adults: Number(req.body.adults || people), children: Number(req.body.children || 0), planCode: req.body.planCode, extras: req.body.extras, vehicles, bundleCode: req.body.bundleCode, bundleServices: req.body.bundleServices });
      // Cualquier experiencia se puede reservar con adelanto. Su acceso
      // permanece pendiente hasta que el cliente complete el saldo.
      const requestedMethod = String(req.body.paymentMethod || "YAPE").toUpperCase();
      const cashAtReception = requestedMethod === "CAJA HOTEL";
      if (!cashAtReception && !["YAPE", "PLIN"].includes(requestedMethod)) throw httpError(400, "Elige Yape, Plin o efectivo en Recepción");
      const ratio = cashAtReception ? 0 : req.body.payMode === "HALF" ? 0.5 : 1;
      const paid = round(total * ratio);
      const booking = { id: bookingId, code: code("RES", bookingId), clientId: req.client.id, serviceCode, planCode: req.body.planCode || "STANDARD", planName: req.body.planName || service.name, roomId: room?.id || null, room, checkIn: req.body.checkIn || state.settings.today, checkOut: req.body.checkOut || req.body.date || state.settings.today, date: req.body.date || req.body.checkIn || state.settings.today, slot: req.body.slot || (serviceCode === "HOSPEDAJE" ? "15:00" : "10:00"), people, adults: Number(req.body.adults || people), children: Number(req.body.children || 0), guests: req.body.guests || [], extras: req.body.extras || [], preorderItems: req.body.preorderItems || [], preferences: req.body.preferences || {}, parking: vehicles[0] || null, vehicles, total, paid, balance: round(total - paid), paymentStatus: ratio === 1 ? "PAGADO" : ratio > 0 ? "PARCIAL" : "PENDIENTE_CAJA", status: ratio === 1 ? "CONFIRMADA" : ratio > 0 ? "RESERVADA" : "PENDIENTE_CAJA", accessStatus: ratio === 1 ? "LISTO_INGRESO" : "PENDIENTE_PAGO", createdAt: now() };
      const paidVehicles = vehicles.filter((vehicle) => vehicle.type !== "MOTO");
      const freeSpaces = state.cochera.filter((item) => item.status === "LIBRE");
      if (freeSpaces.length < paidVehicles.length) throw httpError(409, `Solo quedan ${freeSpaces.length} espacios de cochera para vehículos mayores`);
      const selectedIds = paidVehicles.map((vehicle) => vehicle.spaceId).filter(Boolean);
      if (new Set(selectedIds).size !== selectedIds.length) throw httpError(409, "No puedes asignar el mismo espacio a dos vehículos");
      const freeById = new Map(freeSpaces.map((space) => [Number(space.id), space]));
      if (selectedIds.some((id) => !freeById.has(id))) throw httpError(409, "Uno de los espacios elegidos ya no está disponible. Actualiza la reserva.");
      const remaining = freeSpaces.filter((space) => !selectedIds.includes(Number(space.id)));
      const assignedSpaces = paidVehicles.map((vehicle) => vehicle.spaceId ? freeById.get(vehicle.spaceId) : remaining.shift());
      assignedSpaces.forEach((space, index) => { const vehicle = paidVehicles[index]; space.status = "RESERVADO"; space.entries = [{ id: Date.now() + index, clientId: req.client.id, bookingId, plate: vehicle.plate, vehicleType: vehicle.type, status: "RESERVADO", startsAt: booking.date }]; });
      booking.parkingSpaces = assignedSpaces.map((space) => space.code);
      state.bookings.push(booking);
      if (paid > 0) { const paymentId = nextId(state, "payment"); state.payments.push({ id: paymentId, bookingId, clientId: req.client.id, amount: paid, method: requestedMethod, status: "APROBADO", createdAt: now() }); }
      const pass = createAccessPass(state, req.client.id, { serviceCode, bookingId, bundleCode: req.body.bundleCode });
      const entitlementId = nextId(state, "entitlement");
      const paidInFull = ratio === 1;
      state.entitlements.push({ id: entitlementId, passId: pass.id, bookingId, serviceCode, status: paidInFull ? "LISTO_INGRESO" : "PENDIENTE", people, date: booking.date, slot: booking.slot, usedAt: null, createdAt: now() });
      if (req.body.bundleCode === "HOSPEDAJE_PISCINA_MIRADOR" && serviceCode === "HOSPEDAJE") {
        const bundledServices = Array.isArray(req.body.bundleServices) ? req.body.bundleServices : [];
        const required = ["PISCINA", "MIRADOR"];
        if (required.some((code) => !bundledServices.some((item) => item?.serviceCode === code))) throw httpError(400, "La Llave Maestra debe incluir Piscina y Mirador");
        required.forEach((bundleService) => {
          const item = bundledServices.find((entry) => entry.serviceCode === bundleService) || {};
          state.entitlements.push({ id: nextId(state, "entitlement"), passId: pass.id, bookingId, serviceCode: bundleService, status: paidInFull ? "LISTO_INGRESO" : "PENDIENTE", people: Number(item.people || people), date: item.date || booking.date, slot: item.slot || (bundleService === "PISCINA" ? "09:00" : "16:30"), usedAt: null, createdAt: now(), includedByBundle: true });
        });
      }
      if (serviceCode === "HOSPEDAJE") state.reservations.push({ ...booking, client: req.client, room, advance: paid, totalPrice: total });
      if (paidInFull && booking.preorderItems.length) { booking.orderIds = createScheduledOrders(state, booking, req.client.id); await confirmOrdersInventory(client, state, state.orders.filter((order) => booking.orderIds.includes(order.id))); }
      audit(state, "RESERVAS", "CREAR", `${booking.code} ${serviceCode} S/ ${total}`, null);
      return { booking, pass: hydratePass(state, pass) };
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post("/api/public/bookings/:id/pay-balance", clientAuth, async (req, res, next) => {
  try {
    const result = await mutateState(async (state, client) => {
      const booking = state.bookings.find((item) => item.id === Number(req.params.id) && item.clientId === req.client.id);
      if (!booking) throw httpError(404, "Reserva no encontrada");
      if (booking.balance <= 0) throw httpError(409, "La reserva ya está pagada");
      const paymentMethod = assertDigitalCustomerPayment(req.body.paymentMethod);
      const paymentId = nextId(state, "payment");
      state.payments.push({ id: paymentId, bookingId: booking.id, clientId: req.client.id, amount: booking.balance, method: paymentMethod, status: "APROBADO", createdAt: now() });
      booking.paid = booking.total; booking.balance = 0; booking.paymentStatus = "PAGADO"; booking.status = "CONFIRMADA"; booking.accessStatus = "LISTO_INGRESO";
      if (booking.preorderItems?.length && !booking.orderIds?.length) { booking.orderIds = createScheduledOrders(state, booking, req.client.id); await confirmOrdersInventory(client, state, state.orders.filter((order) => booking.orderIds.includes(order.id))); }
      state.entitlements.filter((item) => item.bookingId === booking.id).forEach((item) => { item.status = "LISTO_INGRESO"; });
      const pass = state.passes.find((item) => item.id === state.entitlements.find((item) => item.bookingId === booking.id)?.passId);
      audit(state, "PAGOS", "COMPLETAR", `${booking.code} pagada`, null);
      return { booking, pass: hydratePass(state, pass) };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/public/bookings/:id/checkout", clientAuth, async (req, res, next) => {
  try {
    const result = await mutateState(async (state) => {
      const booking = state.bookings.find((item) => item.id === Number(req.params.id) && item.clientId === req.client.id && item.serviceCode === "HOSPEDAJE");
      if (!booking) throw httpError(404, "Hospedaje no encontrado");
      const stay = state.stays.find((item) => item.roomId === booking.roomId && item.status === "ACTIVA");
      if (!stay) throw httpError(404, "No hay estadia activa para esta reserva");
      
      const paymentMethod = req.body.paymentMethod || "EFECTIVO";
      const paymentCode = req.body.paymentCode || "";

      // ZOMBIE ORDERS CHECK
      const pendingOrders = state.orders.filter(o => o.clientId === req.client.id && o.roomId === stay.roomId && o.status === "PENDIENTE");
      const prepOrders = state.orders.filter(o => o.clientId === req.client.id && o.roomId === stay.roomId && o.status === "EN_PREPARACION");
      
      if (prepOrders.length > 0) {
        throw httpError(409, "Tienes un pedido de comida en preparación. Acércate a recepción o espera tu pedido antes de salir.");
      }
      
      // Cancel PENDIENTE orders automatically
      pendingOrders.forEach(o => { o.status = "CANCELADO"; o.notes = (o.notes || "") + " (Cancelado auto por Salida Express)"; });

      const room = state.rooms.find(r => r.id === stay.roomId);
      if (room) {
        room.status = "EN_LIMPIEZA";
        const taskId = nextId(state, "task");
        state.tasks.push({ id: taskId, code: code("LIM", taskId), clientId: stay.clientId, roomId: room.id, room, serviceType: "LIMPIEZA", description: "Limpieza tras salida express", assignedEmployeeId: null, assignedTo: null, priority: "ALTA", status: "PENDIENTE", evidences: [], operationalReports: [], createdAt: now() });
      }
      
      stay.expressCheckout = true;
      stay.expressCheckoutMethod = paymentMethod;
      stay.expressCheckoutCode = paymentCode;
      
      booking.expressCheckout = true;
      
      audit(state, "CHECKOUT", "EXPRESS", `Habitación ${room?.number || stay.roomId} liberada por cliente`, null);
      return { success: true };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/public/my-experience", clientAuth, async (req, res, next) => {
  try {
    const state = await readState();
    const passes = state.passes.filter((item) => item.clientId === req.client.id && item.status !== "REVOCADO").map((item) => hydratePass(state, item));
    res.json({ client: req.client, passes, pass: passes[0] || null, bookings: state.bookings.filter((item) => item.clientId === req.client.id), events: state.events.filter((item) => item.clientId === req.client.id), orders: state.orders.filter((item) => item.clientId === req.client.id), requests: state.requests.filter((item) => item.clientId === req.client.id) });
  } catch (error) { next(error); }
});

app.post("/api/public/event-quotes", clientAuth, async (req, res, next) => {
  try {
    const result = await mutateState((state) => createEvent(state, {
      ...req.body,
      clientId: req.client.id,
      name: req.body.name || "Evento Park Plaza",
      price: Number(req.body.estimatedTotal || 0),
      advance: 0,
      status: "COTIZACION"
    }, null));
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.get("/api/public/event-availability", async (req, res, next) => {
  try {
    const state = await readState(); const start = new Date(`${req.query.from || state.settings.today}T12:00:00`); const spaces = eventSpaces(state);
    const days = Array.from({ length: 35 }, (_, index) => { const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10); const availableSpaces = spaces.map((space) => ({ ...space, available: !state.events.some((event) => Number(event.spaceId) === Number(space.id) && !["CANCELADO", "COTIZACION", "PENDIENTE_PAGO", "PENDIENTE_CAJA"].includes(event.status) && String(event.startsAt).slice(0, 10) === date) })); return { date, available: availableSpaces.some((space) => space.available), spaces: availableSpaces }; });
    res.json(days);
  } catch (error) { next(error); }
});

app.post("/api/public/event-bookings", clientAuth, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const requestedMethod = String(req.body.paymentMethod || "YAPE").toUpperCase(); const cash = requestedMethod === "CAJA HOTEL";
      if (!cash && !["YAPE", "PLIN"].includes(requestedMethod)) throw httpError(400, "Elige Yape, Plin o efectivo en Recepción");
      const price = Number(req.body.estimatedTotal || 0); const advance = cash ? 0 : round(price * .5);
      const vehicles = (Array.isArray(req.body.vehicles) ? req.body.vehicles.slice(0, 8) : []).map((vehicle) => ({ ...vehicle, type: String(vehicle.type || "AUTO").toUpperCase(), plate: String(vehicle.plate || "").trim().toUpperCase(), spaceId: vehicle.spaceId ? Number(vehicle.spaceId) : null }));
      if (vehicles.some((vehicle) => !["MOTO", "AUTO", "CAMIONETA", "MINIVAN"].includes(vehicle.type))) throw httpError(400, "Tipo de vehículo no válido");
      if (vehicles.some((vehicle) => !vehicle.plate)) throw httpError(400, "Registra la placa de cada vehículo o elimina la cochera");
      const paidVehicles = vehicles.filter((vehicle) => vehicle.type !== "MOTO");
      const freeSpaces = state.cochera.filter((item) => item.status === "LIBRE");
      if (freeSpaces.length < paidVehicles.length) throw httpError(409, `Solo quedan ${freeSpaces.length} espacios de cochera para vehículos mayores`);
      const selectedIds = paidVehicles.map((vehicle) => vehicle.spaceId).filter(Boolean);
      if (new Set(selectedIds).size !== selectedIds.length) throw httpError(409, "No puedes asignar el mismo espacio a dos vehículos");
      const freeById = new Map(freeSpaces.map((space) => [Number(space.id), space]));
      if (selectedIds.some((id) => !freeById.has(id))) throw httpError(409, "Uno de los espacios elegidos ya no está disponible. Actualiza la reserva.");
      const event = createEvent(state, { ...req.body, vehicles, payMode: "HALF", clientId: req.client.id, price, advance, paymentMethod: cash ? "EFECTIVO" : requestedMethod, status: cash ? "PENDIENTE_CAJA" : "RESERVADO", accessStatus: "PENDIENTE_PAGO" }, null);
      const remaining = freeSpaces.filter((space) => !selectedIds.includes(Number(space.id)));
      const assignedSpaces = paidVehicles.map((vehicle) => vehicle.spaceId ? freeById.get(vehicle.spaceId) : remaining.shift());
      assignedSpaces.forEach((space, index) => { const vehicle = paidVehicles[index]; space.status = "RESERVADO"; space.entries = [{ id: Date.now() + index, clientId: req.client.id, eventId: event.id, plate: vehicle.plate, vehicleType: vehicle.type, status: "RESERVADO", startsAt: event.startsAt }]; });
      event.parkingSpaces = assignedSpaces.map((space) => space.code);
      const pass = createAccessPass(state, req.client.id, { serviceCode: "EVENTOS", eventId: event.id, bundleCode: req.body.bundleCode });
      state.entitlements.push({ id: nextId(state, "entitlement"), passId: pass.id, eventId: event.id, serviceCode: "EVENTOS", status: event.balance <= 0 ? "LISTO_INGRESO" : "PENDIENTE", people: event.guests, date: String(event.startsAt).slice(0, 10), slot: String(event.startsAt).slice(11, 16), usedAt: null, createdAt: now() });
      return { event, pass: hydratePass(state, pass) };
    }); res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post("/api/public/events/:id/pay-balance", clientAuth, async (req, res, next) => {
  try { const result = await mutateState((state) => { const event = state.events.find((item) => item.id === Number(req.params.id) && item.clientId === req.client.id); if (!event) throw httpError(404, "Evento no encontrado"); if (Number(event.balance || 0) <= 0) throw httpError(409, "El evento ya está pagado"); const amount=Number(event.balance); state.payments.push({ id:nextId(state,"payment"),eventId:event.id,clientId:req.client.id,amount,method:assertDigitalCustomerPayment(req.body.paymentMethod),concept:`Saldo evento ${event.code}`,area:"EVENTOS",status:"APROBADO",createdAt:now() }); event.advance=event.price;event.balance=0;event.status="CONFIRMADO";event.accessStatus="LISTO_INGRESO";state.entitlements.filter((item)=>Number(item.eventId)===Number(event.id)).forEach((item)=>{item.status="LISTO_INGRESO";});createEventCateringOrder(state,event);audit(state,"PAGOS","COMPLETAR",`${event.code} pagado`,null);return event; }); res.json(result); } catch(error){ next(error); }
});

app.get("/api/public/pass/:code/qr", async (req, res, next) => {
  try {
    const state = await readState();
    const pass = state.passes.find((item) => item.code === req.params.code);
    if (!pass) return res.status(404).json({ message: "Pase no encontrado" });
    const payload = jwt.sign({ pass: pass.code, kind: "PARK_PLAZA_PASS" }, jwtSecret);
    const png = await QRCode.toBuffer(payload, { width: 420, margin: 2, color: { dark: "#0f3d2e", light: "#ffffff" } });
    res.type("png").send(png);
  } catch (error) { next(error); }
});

app.post("/api/public/orders", clientAuth, async (req, res, next) => {
  try {
    const technicalRecipes = await activeRecipeSalesForMenu((req.body.items || []).map((item) => item.menuItemId));
    const order = await mutateState(async (state, client) => {
      const requestedServiceCode = String(req.body.serviceCode || "").toUpperCase();
      const eligibleExperiences = [...state.bookings].reverse().filter((item) => item.clientId === req.client.id && ["HOSPEDAJE", "PISCINA", "MIRADOR"].includes(item.serviceCode) && item.paymentStatus === "PAGADO" && customerConsumptionEnabled(state, item, requestedServiceCode || item.serviceCode));
      const eligibleEvents = [...state.events].reverse().filter((item) => item.clientId === req.client.id && item.status === "CONFIRMADO" && Number(item.balance || 0) <= 0 && item.accessStatus === "INGRESO_VALIDADO");
      const requestedBookingId = Number(req.body.bookingId || 0);
      const requestedEventId = Number(req.body.eventId || 0);
      const paidExperience = requestedBookingId ? eligibleExperiences.find((item) => Number(item.id) === requestedBookingId) : requestedEventId ? null : eligibleExperiences[0];
      const paidEvent = requestedEventId ? eligibleEvents.find((item) => Number(item.id) === requestedEventId) : requestedBookingId ? null : eligibleEvents[0];
      if ((requestedBookingId && !paidExperience) || (requestedEventId && !paidEvent)) throw httpError(403, "El destino elegido no corresponde a una experiencia pagada y vigente");
      if (!paidExperience && !paidEvent) throw httpError(403, "Necesitas una experiencia pagada y vigente para realizar pedidos desde la app");
      const serviceCode = requestedServiceCode || paidExperience?.serviceCode || (paidEvent ? "EVENTOS" : null);
      if (paidExperience && !["HOSPEDAJE", "PISCINA", "MIRADOR"].includes(serviceCode)) throw httpError(400, "El servicio de entrega no es válido");
      const paymentMethod = assertDigitalCustomerPayment(req.body.paymentMethod);
      const items = (req.body.items || []).map((entry) => {
        const menuItem = state.menuItems.find((item) => item.id === Number(entry.menuItemId) && item.active);
        if (!menuItem) throw httpError(400, "Producto no disponible");
        if (menuItem.salesEnabled !== true) throw httpError(409, `${menuItem.name} tiene la venta pausada`);
        const allowedServices = (Array.isArray(menuItem.availableFor) ? menuItem.availableFor : String(menuItem.availableFor || "").split(/[\s,|]+/)).map((value) => String(value).toUpperCase()).filter(Boolean);
        if (allowedServices.length && !allowedServices.includes(serviceCode)) throw httpError(409, `${menuItem.name} no está disponible para ${serviceCode}`);
        const technical = technicalRecipes[menuItem.id];
        if (!technical) throw httpError(409, `${menuItem.name} no puede venderse hasta completar y activar su receta técnica`);
        return { menuItemId: menuItem.id, name: menuItem.name, quantity: Number(entry.quantity ?? 1), price: Number(menuItem.price), recipe: menuItem.recipe || [], area: menuItem.area, notes: entry.notes || "", recipeVersionId: technical.recipeVersionId, recipeVersion: technical.recipeVersion, recipeUnitCost: Number(technical.recipeUnitCost || 0) };
      });
      if (!items.length) throw httpError(400, "Agrega productos al pedido");
      const groupCode = `GRP-${Date.now().toString().slice(-8)}`;
      const orders = ["RESTAURANTE", "BARTENDER"].map((area) => {
        const areaItems = items.filter((item) => item.area === area);
        if (!areaItems.length) return null;
        const id = nextId(state, "order");
        const result = { id, code: code("PED", id), groupCode, bookingId: paidExperience?.id || null, eventId: paidEvent?.id || null, experienceCode: serviceCode, clientId: req.client.id, area, roomId: Number(paidExperience?.roomId) || null, items: areaItems, total: round(areaItems.reduce((sum, item) => sum + item.price * item.quantity, 0)), paymentMethod, paymentStatus: "PAGADO", status: "PENDIENTE", estimatedMinutes: Math.max(...areaItems.map((item) => state.menuItems.find((menu) => menu.id === item.menuItemId)?.prepMinutes || 0)), notes: req.body.notes || "", createdAt: now(), updatedAt: now() };
        validateOrderSchema(state, result);
        state.orders.push(result); audit(state, "PEDIDOS", "CREAR", `${result.code} (${groupCode})`, null); return result;
      }).filter(Boolean);
      await confirmOrdersInventory(client, state, orders);
      const total = round(orders.reduce((sum, item) => sum + item.total, 0));
      state.payments.push({ id: nextId(state, "payment"), bookingId: paidExperience?.id || null, eventId: paidEvent?.id || null, clientId: req.client.id, amount: total, method: paymentMethod, concept: `Pedido ${groupCode}`, area: "CLIENTE", status: "APROBADO", createdAt: now() });
      return { ...orders[0], groupCode, orders, total };
    });
    res.status(201).json(order);
  } catch (error) { next(error); }
});

app.post("/api/public/requests", clientAuth, async (req, res, next) => {
  try {
    const request = await mutateState((state) => {
      const type = req.body.type || "CONSERJERIA";
      const requiresMaintenance = type === "MANTENIMIENTO";
      const cleaningRequest = ["LIMPIEZA", "TOALLAS"].includes(type);
      const cleaningEmployee = cleaningRequest ? availableOperationalEmployee(state, "LIMPIEZA") : null;
      const maintenanceEmployee = requiresMaintenance ? availableOperationalEmployee(state, "MANTENIMIENTO") : null;
      const booking = [...state.bookings].reverse().find((item) => item.clientId === req.client.id && item.serviceCode === "HOSPEDAJE" && item.roomId && !["CANCELADA", "FINALIZADA"].includes(item.status));
      const room = booking ? state.rooms.find((item) => item.id === Number(booking.roomId)) : null;

      if (cleaningRequest && !room) {
        throw httpError(400, "Debes tener una habitación asignada (Check-in) para solicitar limpieza o toallas.");
      }
      
      const id = nextId(state, "request");
      const item = {
        id, code: code("SOL", id), clientId: req.client.id, type,
        area: cleaningRequest ? "LIMPIEZA" : requiresMaintenance ? "MANTENIMIENTO" : "RECEPCION",
        location: req.body.location || (room ? `Habitación ${room.number}` : "Reportado por huésped"),
        description: req.body.description || "", priority: req.body.priority || "MEDIA",
        status: requiresMaintenance ? "ABIERTO" : "PENDIENTE", requiresMaintenance,
        requiresReceptionAcceptance: cleaningRequest || requiresMaintenance,
        receptionAcceptedAt: null,
        assignedMaintenanceEmployeeId: maintenanceEmployee?.id || null,
        assignedMaintenanceTo: maintenanceEmployee ? `${maintenanceEmployee.firstName || ""} ${maintenanceEmployee.lastName || ""}`.trim() : null,
        evidences: [], createdAt: now()
      };
      state.requests.unshift(item);
      if (cleaningRequest && room) {
        const taskId = nextId(state, "task");
        const task = {
          id: taskId, code: code("LIM", taskId), requestId: item.id, clientId: req.client.id,
          roomId: room.id, room, serviceType: type, description: item.description,
          assignedEmployeeId: cleaningEmployee?.id || null,
          assignedTo: cleaningEmployee ? `${cleaningEmployee.firstName || ""} ${cleaningEmployee.lastName || ""}`.trim() : null,
          priority: item.priority, status: "PENDIENTE", requiresReceptionAcceptance: true,
          receptionAcceptedAt: null, evidences: [], operationalReports: [], createdAt: now()
        };
        state.tasks.push(task);
        item.taskId = task.id;
      }
      audit(state, "SERVICIO_CLIENTE", "SOLICITAR", `${item.code} ${type}`, null);
      return item;
    });
    res.status(201).json(request);
  } catch (error) { next(error); }
});

app.post("/api/auth/login", loginRateLimit, async (req, res, next) => {
  try {
    const state = await readState();
    const user = state.users.find((item) => item.email.toLowerCase() === String(req.body.email || "").toLowerCase());
    const passwordAccepted = user?.passwordHash ? verifyStaffPassword(req.body.password, user.passwordHash) : req.body.password === demoStaffPassword;
    if (!user || user.status !== "ACTIVO" || !passwordAccepted) return res.status(401).json({ message: "Credenciales incorrectas o cuenta deshabilitada" });
    loginAttempts.delete(req.ip || "unknown");
    res.json({ token: jwt.sign({ sub: user.id, kind: "STAFF" }, jwtSecret, { expiresIn: "12h" }), user: safeStaffUser(state, user) });
  } catch (error) { next(error); }
});

// El reloj es una terminal compartida. Solo su marcación pública queda fuera
// de la sesión ERP y exige DNI + PIN personal; lo demás mantiene staffAuth.
app.use("/api", (req, res, next) => {
  const publicClock = req.method === "POST" && req.path === "/attendance/clock";
  const publicLookup = req.method === "GET" && /^\/attendance\/lookup\/\d{8}$/.test(req.path);
  return publicClock || publicLookup ? next() : staffAuth(req, res, next);
});
app.get("/api/auth/me", (req, res) => res.json({ user: req.user }));
app.get("/api/superadmin/control-state", async (req, res, next) => {
  try {
    if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Esta vista pertenece únicamente al Superadmin");
    const state = await readState();
    const keys = [
      "services", "rooms", "clients", "bookings", "reservations", "stays", "payments",
      "passes", "entitlements", "accessLogs", "orders", "requests", "tasks", "events",
      "inventory", "menuItems", "employees", "shifts", "attendance", "proveedores",
      "compras", "cochera", "facturacion", "cashMovements", "cashSessions", "cashClosings", "audit", "settings"
    ];
    const response = Object.fromEntries(keys.map((key) => [key, state[key] || (key === "settings" ? {} : [])]));
    response.users = state.users.map((user) => hydrateUser(state, user));
    response.rooms = state.rooms.map((room) => hydrateRoom(state, room));
    response.employees = state.employees.map(safeEmployee);
    res.json(response);
  } catch (error) { next(error); }
});

app.get("/api/biometric/status", requireInventoryAdmin, async (_req, res, next) => {
  try {
    const state = await readState();
    const config = state.settings?.biometric || {};
    const enrolledEmployees = state.users.filter((item) => Boolean(item.biometric?.externalId)).map((item) => ({ id: item.id, name: `${item.firstName} ${item.lastName}`, externalId: item.biometric.externalId, enrolledAt: item.biometric.enrolledAt || null }));
    res.json({ enabled: Boolean(config.enabled), deviceName: config.deviceName || "ZK9500", bridgeName: config.bridgeName || "Puente local de asistencia", bridgeKeyConfigured: Boolean(config.bridgeKey), enrolledEmployees, lastConfiguredAt: config.updatedAt || null });
  } catch (error) { next(error); }
});
app.put("/api/biometric/config", requireInventoryAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const previous = state.settings?.biometric || {};
      const shouldRotate = Boolean(req.body.rotateKey) || !previous.bridgeKey;
      const bridgeKey = shouldRotate ? randomUUID().replaceAll("-", "") : previous.bridgeKey;
      state.settings ||= {};
      state.settings.biometric = { enabled: Boolean(req.body.enabled), deviceName: String(req.body.deviceName || "ZK9500").trim() || "ZK9500", bridgeName: String(req.body.bridgeName || "Puente local de asistencia").trim() || "Puente local de asistencia", bridgeKey, updatedAt: now(), updatedById: req.user.id };
      audit(state, "BIOMETRIA", shouldRotate ? "CONFIGURAR_Y_ROTAR_CLAVE" : "CONFIGURAR", state.settings.biometric.deviceName, req.user.id);
      return { enabled: state.settings.biometric.enabled, deviceName: state.settings.biometric.deviceName, bridgeName: state.settings.biometric.bridgeName, bridgeKey: shouldRotate ? bridgeKey : null };
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.post("/api/biometric/enroll", requireInventoryAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const employeeId = Number(req.body.employeeId);
      const externalId = String(req.body.externalId || "").trim();
      if (!employeeId || !externalId) throw httpError(400, "Selecciona al empleado e ingresa el identificador leído por el ZK9500");
      const user = state.users.find((item) => Number(item.id) === employeeId);
      if (!user) throw httpError(404, "Empleado no encontrado");
      const usedBy = state.users.find((item) => Number(item.id) !== employeeId && String(item.biometric?.externalId || "") === externalId);
      if (usedBy) throw httpError(409, "Este identificador biométrico ya está asignado a otro empleado");
      user.biometric = { externalId, deviceName: String(req.body.deviceName || state.settings?.biometric?.deviceName || "ZK9500"), enrolledAt: now(), enrolledById: req.user.id };
      const employee = state.employees.find((item) => Number(item.id) === employeeId);
      if (employee) employee.biometric = user.biometric;
      audit(state, "BIOMETRIA", "VINCULAR_EMPLEADO", `${user.firstName} ${user.lastName}`, req.user.id);
      return { id: user.id, name: `${user.firstName} ${user.lastName}`, externalId: user.biometric.externalId };
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
app.get("/api/attendance/current", async (req, res, next) => {
  try {
    const state = await readState(); const today = hotelToday(state);
    const record = [...state.attendance].reverse().find((item) => Number(item.employeeId || item.userId) === Number(req.user.id) && String(item.date || item.checkIn || item.clockIn).slice(0, 10) === today && (item.checkIn || item.clockIn) && !(item.checkOut || item.clockOut));
    const shift = record ? state.shifts.find((item) => Number(item.id) === Number(record.shiftId)) : state.shifts.find((item) => Number(item.employeeId || item.userId) === Number(req.user.id) && item.date === today && !["FINALIZADO", "CANCELADO"].includes(item.status));
    const cash = state.payments.filter((item) => String(item.createdAt).slice(0, 10) === today && ["EFECTIVO", "CAJA HOTEL"].includes(item.method)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    res.json({ active: isSuperAdmin(req.user) || Boolean(record), record: record || null, shift: shift || null, cash: round(cash), date: today });
  } catch (error) { next(error); }
});
app.post("/api/realtime/ping", (_req, res) => res.json({ ok: true, at: Date.now() }));

app.get("/api/admin/menu-items", requireInventoryAdmin, async (req, res, next) => {
  try {
    const state = await readState();
    const operationalRecipes = (await Promise.all([operationalRecipeManual("RESTAURANTE"), operationalRecipeManual("BARTENDER")])).flat();
    const operationalByMenu = new Map(operationalRecipes.filter((item) => item.menuItemId).map((item) => [Number(item.menuItemId), item]));
    const rows = state.menuItems
      .filter((item) => item.active !== false && (!req.query.area || item.area === req.query.area))
      .map((item) => {
        const hydrated = hydrateMenuItem(state, item);
        const operational = operationalByMenu.get(Number(item.id));
        const availablePortions = Number(operational?.availablePortions || 0);
        return { ...hydrated, salesEnabled: item.salesEnabled === true, available: item.salesEnabled === true && availablePortions > 0, availablePortions, limitingIngredient: operational?.limitingIngredient || null };
      });
    res.json(rows);
  } catch (error) { next(error); }
});

app.post("/api/admin/menu-items", requireInventoryAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const area = String(req.body.area || "").toUpperCase();
    const price = Number(req.body.price);
    if (!name) throw httpError(400, "El nombre es obligatorio");
    if (!["RESTAURANTE", "BARTENDER"].includes(area)) throw httpError(400, "Selecciona Restaurante o Bar");
    if (!Number.isFinite(price) || price < 0) throw httpError(400, "El precio no es válido");
    const result = await mutateState((state) => {
      const duplicate = state.menuItems.find((item) => item.active !== false && item.area === area && item.name.trim().toLowerCase() === name.toLowerCase());
      if (duplicate) throw httpError(409, "Ya existe un producto de venta con ese nombre en esta área");
      const id = Math.max(0, ...state.menuItems.map((item) => Number(item.id) || 0)) + 1;
      const item = {
        id,
        area,
        code: String(req.body.code || name).trim().toUpperCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `MENU-${id}`,
        name,
        category: String(req.body.category || "Sin categoría").trim(),
        description: String(req.body.description || "").trim(),
        image: String(req.body.image || (area === "BARTENDER" ? "/catalog/bar-menu-placeholder.png" : "/catalog/restaurant-menu-placeholder.png")).trim(),
        tags: Array.isArray(req.body.tags) ? req.body.tags.map(String).filter(Boolean) : [],
        price: round(price),
        prepMinutes: Math.max(0, Number(req.body.prepMinutes || 0)),
        active: req.body.active !== false,
        salesEnabled: req.body.salesEnabled === true,
        recipe: [],
        availableFor: ["HOSPEDAJE", "PISCINA", "MIRADOR", "EVENTOS"],
        createdAt: now(),
        updatedAt: now()
      };
      state.menuItems.push(item);
      audit(state, "CATALOGO", "CREAR_PRODUCTO_VENTA", `${area}: ${item.name} · S/ ${item.price}`, req.user.id);
      return hydrateMenuItem(state, item);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/admin/menu-items/:id", requireInventoryAdmin, async (req, res, next) => {
  try {
    const price = Number(req.body.price);
    const name = String(req.body.name || "").trim();
    if (!name) throw httpError(400, "El nombre es obligatorio");
    if (!Number.isFinite(price) || price < 0) throw httpError(400, "El precio no es válido");
    const currentState = await readState();
    const currentItem = currentState.menuItems.find((row) => Number(row.id) === Number(req.params.id));
    if (!currentItem) throw httpError(404, "Producto de venta no encontrado");
    const technicalRecipe = (await listTechnicalRecipes()).find((recipe) => Number(recipe.legacyMenuItemId) === Number(currentItem.id));
    if (technicalRecipe) {
      const recipeReferences = await technicalRecipeReferences();
      const portionUnit = recipeReferences.units.find((unit) => unit.code === "UNIT") || recipeReferences.units.find((unit) => unit.dimension === "COUNT");
      const versionedRecipe = await createTechnicalRecipeVersion(technicalRecipe.id, { salePrice: price, name, yieldUnitId: technicalRecipe.currentVersion?.yieldUnitId || portionUnit?.id }, req.user.id);
      const draft = versionedRecipe.versions.find((version) => version.status === "DRAFT");
      if (!draft) throw httpError(409, "No se pudo crear la nueva versión de precio");
      await activateTechnicalRecipeVersion(technicalRecipe.id, draft.id, req.user.id);
    }
    const result = await mutateState((state) => {
      const item = state.menuItems.find((row) => Number(row.id) === Number(req.params.id));
      if (!item) throw httpError(404, "Producto de venta no encontrado");
      const before = { name: item.name, price: item.price, prepMinutes: item.prepMinutes, active: item.active };
      const draftIngredients = Array.isArray(req.body.draftIngredients)
        ? req.body.draftIngredients.map((ingredient) => String(ingredient || "").trim()).filter(Boolean).slice(0, 40)
        : (item.draftIngredients || []);
      Object.assign(item, {
        name,
        price: round(price),
        prepMinutes: Math.max(0, Number(req.body.prepMinutes || 0)),
        active: req.body.active !== false,
        category: String(req.body.category ?? item.category ?? "Sin categoría").trim() || "Sin categoría",
        description: String(req.body.description ?? item.description ?? "").trim(),
        image: String(req.body.image ?? item.image ?? "").trim() || "/catalog/restaurant-menu-placeholder.png",
        tags: Array.isArray(req.body.tags) ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12) : (item.tags || []),
        draftIngredients,
        recipeStatus: draftIngredients.length ? "PENDIENTE_GRAMAJES" : (item.recipeStatus || "SIN_RECETA"),
        updatedAt: now()
      });
      audit(state, "CATALOGO", "ACTUALIZAR_PRECIO", `${item.name}: S/ ${before.price} → S/ ${item.price}`, req.user.id);
      return hydrateMenuItem(state, item);
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Publicar un producto y habilitar su venta son decisiones independientes.
// Este cambio no genera una versión nueva de receta ni modifica su stock.
app.patch("/api/admin/menu-items/:id/sales-enabled", requireInventoryAdmin, async (req, res, next) => {
  try {
    if (typeof req.body.salesEnabled !== "boolean") throw httpError(400, "Indica si la venta debe quedar habilitada o pausada");
    const result = await mutateState((state) => {
      const item = state.menuItems.find((row) => Number(row.id) === Number(req.params.id));
      if (!item) throw httpError(404, "Producto de venta no encontrado");
      item.salesEnabled = req.body.salesEnabled;
      item.updatedAt = now();
      audit(state, "CATALOGO", item.salesEnabled ? "HABILITAR_VENTA" : "PAUSAR_VENTA", `${item.area}: ${item.name}`, req.user.id);
      return hydrateMenuItem(state, item);
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Las fotos de carta se guardan en el backend para que no dependan de enlaces
// externos. Reemplazar una foto no modifica la receta ni el historial de ventas.
app.post(
  "/api/admin/menu-items/:id/image",
  requireInventoryAdmin,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "10mb" }),
  async (req, res, next) => {
    try {
      const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
      const mimeType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
      const extension = extensions[mimeType];
      if (!extension) throw httpError(415, "Formato no permitido. Usa JPG, PNG o WEBP");
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, "La imagen está vacía");
      const storedName = `${Date.now()}-${randomUUID()}${extension}`;
      await mkdir(menuUploadDir, { recursive: true });
      await writeFile(join(menuUploadDir, storedName), req.body, { flag: "wx" });
      const image = `/uploads/menu/${storedName}`;
      const result = await mutateState((state) => {
        const item = state.menuItems.find((row) => Number(row.id) === Number(req.params.id));
        if (!item) throw httpError(404, "Producto de venta no encontrado");
        item.image = image;
        item.updatedAt = now();
        audit(state, "CATALOGO", "ACTUALIZAR_IMAGEN", item.name, req.user.id);
        return hydrateMenuItem(state, item);
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  }
);
app.delete("/api/admin/menu-items/:id/image", requireInventoryAdmin, async (req, res, next) => {
  try { const result = await mutateState((state) => { const item = state.menuItems.find((row) => Number(row.id) === Number(req.params.id)); if (!item) throw httpError(404, "Producto de venta no encontrado"); item.image = ""; item.updatedAt = now(); audit(state, "CATALOGO", "QUITAR_IMAGEN", item.name, req.user.id); return hydrateMenuItem(state, item); }); res.json(result); } catch (error) { next(error); }
});

// Imágenes propias de portadas y habitaciones. Se alojan con el sistema, no en enlaces externos.
async function saveExperienceImage(req, res, next, target) {
  try {
    const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
    const mimeType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    const extension = extensions[mimeType];
    if (!extension) throw httpError(415, "Formato no permitido. Usa JPG, PNG o WEBP");
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, "La imagen está vacía");
    const storedName = `${Date.now()}-${randomUUID()}${extension}`;
    await mkdir(experienceUploadDir, { recursive: true });
    await writeFile(join(experienceUploadDir, storedName), req.body, { flag: "wx" });
    const imageUrl = `/uploads/experience/${storedName}`;
    const result = await mutateState((state) => {
      state.settings ||= {};
      if (target.kind === "SERVICE") {
        const current = experienceMedia(state);
        state.settings.experienceMedia = current.map((item) => item.code === target.code ? { ...item, imageUrl } : item);
      } else {
        const roomNames = new Set(state.rooms.map((room) => room.type?.name));
        if (!roomNames.has(target.name)) throw httpError(404, "Tipo de habitación no encontrado");
        state.settings.roomTypeMedia = { ...(state.settings.roomTypeMedia || {}), [target.name]: { ...(state.settings.roomTypeMedia?.[target.name] || {}), imageUrl } };
      }
      audit(state, "COMERCIAL", "ACTUALIZAR_IMAGEN", target.kind === "SERVICE" ? `Portada ${target.code}` : `Habitación ${target.name}`, req.user.id);
      return { imageUrl };
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
}

app.post("/api/admin/experience-media/:code/image", requireInventoryAdmin, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "10mb" }), (req, res, next) => {
  const code = String(req.params.code || "").toUpperCase();
  if (!new Set(["HOSPEDAJE", "BAR", "PISCINA", "EVENTOS", "TERRAZA", "MIRADOR"]).has(code)) return next(httpError(404, "Portada no encontrada"));
  return saveExperienceImage(req, res, next, { kind: "SERVICE", code });
});
app.delete("/api/admin/experience-media/:code/image", requireInventoryAdmin, async (req, res, next) => {
  try { const code = String(req.params.code || "").toUpperCase(); const result = await mutateState((state) => { state.settings ||= {}; state.settings.experienceMedia = experienceMedia(state).map((item) => item.code === code ? { ...item, imageUrl: "" } : item); audit(state, "COMERCIAL", "QUITAR_IMAGEN", `Portada ${code}`, req.user.id); return { ok: true }; }); res.json(result); } catch (error) { next(error); }
});
app.post("/api/admin/room-types/:name/image", requireInventoryAdmin, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "10mb" }), (req, res, next) => saveExperienceImage(req, res, next, { kind: "ROOM", name: String(req.params.name || "") }));
app.delete("/api/admin/room-types/:name/image", requireInventoryAdmin, async (req, res, next) => {
  try { const name = String(req.params.name || ""); const result = await mutateState((state) => { state.settings ||= {}; state.settings.roomTypeMedia = { ...(state.settings.roomTypeMedia || {}), [name]: { ...(state.settings.roomTypeMedia?.[name] || {}), imageUrl: "" } }; audit(state, "COMERCIAL", "QUITAR_IMAGEN", `Habitación ${name}`, req.user.id); return { ok: true }; }); res.json(result); } catch (error) { next(error); }
});

// Centro comercial del dueño. Aquí viven los precios que el cliente ve al reservar.
app.get("/api/admin/commercial-settings", requireInventoryAdmin, async (_req, res, next) => {
  try {
    const state = await readState();
    const roomMedia = roomTypeMedia(state);
    const roomTypes = Object.values(state.rooms.reduce((groups, room) => {
      const key = room.type?.name || "Sin tipo";
      if (!groups[key]) groups[key] = { name: key, capacity: Number(room.capacity || 1), price: Number(room.price || 0), rooms: 0, imageUrl: roomMedia[key]?.imageUrl || "", description: roomMedia[key]?.description || "" };
      groups[key].rooms += 1;
      return groups;
    }, {}));
    res.json({ services: state.services.map(({ id, code, name, description, price, capacity }) => ({ id, code, name, description, price: Number(price || 0), capacity })), roomTypes, parkingRates: state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 }, eventSpaces: eventSpaces(state), experiencePricing: experiencePricing(state), experienceMedia: experienceMedia(state) });
  } catch (error) { next(error); }
});

app.put("/api/admin/commercial-settings", requireInventoryAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const payload = req.body || {};
      const priceOf = (value, label) => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw httpError(400, `El precio de ${label} no es válido`); return round(parsed); };
      (Array.isArray(payload.services) ? payload.services : []).forEach((update) => {
        const service = state.services.find((item) => item.code === update.code); if (!service) return;
        service.name = String(update.name || service.name).trim() || service.name;
        service.description = String(update.description || service.description).trim() || service.description;
        service.price = priceOf(update.price, service.name);
        if (update.capacity !== null && update.capacity !== undefined && update.capacity !== "") service.capacity = Math.max(1, Number(update.capacity));
      });
      (Array.isArray(payload.roomTypes) ? payload.roomTypes : []).forEach((update) => { const name = String(update.name || ""); const price = priceOf(update.price, `habitaciones ${name}`); state.rooms.filter((room) => room.type?.name === name).forEach((room) => { room.price = price; }); if (name) state.settings.roomTypeMedia = { ...(state.settings.roomTypeMedia || {}), [name]: { ...(state.settings.roomTypeMedia?.[name] || {}), description: String(update.description || "").trim().slice(0, 500), imageUrl: String(update.imageUrl ?? state.settings.roomTypeMedia?.[name]?.imageUrl ?? "").trim().slice(0, 500) } }; });
      const currentRates = state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 }; const rates = payload.parkingRates || {};
      state.settings.parkingRates = Object.fromEntries(Object.keys(currentRates).map((key) => [key, priceOf(rates[key] ?? currentRates[key], `cochera ${key.toLowerCase()}`)]));
      if (payload.experiencePricing && typeof payload.experiencePricing === "object") {
        const currentPricing = experiencePricing(state);
        state.settings.experiencePricing = Object.fromEntries(Object.entries(currentPricing).map(([group, items]) => [group, (Array.isArray(payload.experiencePricing[group]) ? payload.experiencePricing[group] : items).map((entry) => {
          const previous = items.find((item) => String(item.code || item.id) === String(entry.code || entry.id));
          const identifier = String(entry.id || entry.code || previous?.id || previous?.code || `CUSTOM_${randomUUID()}`).trim();
          const name = String(entry.name || previous?.name || "").trim();
          if (!name) throw httpError(400, "Cada plan o extra necesita un nombre");
          return { ...previous, id: previous?.id || identifier, code: previous?.code || String(entry.code || identifier).toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 60), name: name.slice(0, 100), description: String(entry.description ?? previous?.description ?? "").trim().slice(0, 500), price: priceOf(entry.price ?? previous?.price, name), active: entry.active !== false, ...(previous?.perPerson !== undefined ? { perPerson: priceOf(entry.price ?? previous?.price, name) } : {}) };
        })]));
      }
      if (Array.isArray(payload.eventSpaces) && payload.eventSpaces.length) state.settings.eventSpaces = eventSpaces(state).map((space) => { const update = payload.eventSpaces.find((item) => Number(item.id) === Number(space.id)); return update ? { ...space, name: String(update.name || space.name).trim() || space.name, capacity: Math.max(1, Number(update.capacity || space.capacity)), basePrice: priceOf(update.basePrice, `evento ${space.name}`) } : space; });
      if (Array.isArray(payload.experienceMedia)) {
        const allowed = new Set(["HOSPEDAJE", "BAR", "PISCINA", "EVENTOS", "TERRAZA", "MIRADOR"]);
        state.settings.experienceMedia = payload.experienceMedia.filter((item) => allowed.has(item.code)).map((item) => ({
          code: item.code,
          place: String(item.place || "").trim().slice(0, 80),
          title: String(item.title || "").trim().slice(0, 80),
          title2: String(item.title2 || "").trim().slice(0, 80),
          description: String(item.description || "").trim().slice(0, 500),
          imageUrl: String(item.imageUrl || "").trim().slice(0, 500),
        }));
      }
      audit(state, "COMERCIAL", "ACTUALIZAR_EXPERIENCIA", "Precios, contenido e imágenes de venta actualizados", req.user.id);
      return { ok: true };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/daily-inventory", async (req, res, next) => {
  try {
    const area = validateDailyArea(req.query.area, req.user);
    const result = await mutateState((state) => hydrateDailyBox(state, ensureDailyBox(state, area)));
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/daily-inventory/assign", requireInventoryAdmin, async (req, res, next) => {
  try {
    const area = validateDailyArea(req.body.area, req.user);
    const result = await mutateState(async (state, client) => {
      const box = ensureDailyBox(state, area);
      if (box.status === "CLOSED") throw httpError(409, "La caja de hoy ya fue cerrada");
      for (const entry of req.body.items || []) {
        const quantity = Number(entry.quantity || 0);
        if (quantity <= 0) continue;
        const product = state.inventory.find((item) => Number(item.id) === Number(entry.productId) && item.area === area && isOperationalProduct(item));
        if (!product) throw httpError(400, "Uno de los productos no pertenece al área");
        const beforeQty = Number(product.stock || 0);
        product.stock = roundQuantity(beforeQty + quantity);
        const line = box.items.find((item) => Number(item.productId) === Number(product.id));
        if (line) line.assignedQuantity = roundQuantity(Number(line.assignedQuantity || 0) + quantity);
        else box.items.push({ productId: product.id, productName: product.name, unit: product.unit, openingQuantity: beforeQty, assignedQuantity: quantity });
        const movementId = nextId(state, "movement");
        state.inventoryMovements.unshift({ id: movementId, productId: product.id, product: { ...product }, type: "ASIGNACION_DIARIA", quantity, beforeQty, afterQty: product.stock, reason: `Asignación a caja diaria ${area}`, createdById: req.user.id, createdAt: now() });
        await postDailyStockChange(client, { key: `daily-assign:${movementId}`, legacyProductId: product.id, area, difference: quantity, cost: product.cost, actorId: req.user.id, sourceId: box.id, reason: `Asignación administrativa a caja diaria ${area}` });
      }
      box.updatedAt = now();
      audit(state, "INVENTARIO", "ASIGNACION_DIARIA", `${area}: ${(req.body.items || []).filter((item) => Number(item.quantity) > 0).length} insumos`, req.user.id);
      return hydrateDailyBox(state, box);
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/daily-inventory/close", async (req, res, next) => {
  try {
    const area = validateDailyArea(req.body.area, req.user);
    const result = await mutateState(async (state, client) => {
      const box = ensureDailyBox(state, area);
      if (box.status === "CLOSED") throw httpError(409, "La caja de hoy ya fue cerrada");
      const pendingOrders = state.orders.filter((item) => item.area === area && !["ENTREGADO", "CANCELADO"].includes(item.status));
      if (pendingOrders.length) throw httpError(409, `Todavía hay ${pendingOrders.length} pedido(s) sin entregar o cancelar`);
      const counts = req.body.counts || [];
      if (!counts.length) throw httpError(400, "Ingresa el peso o conteo físico de los productos");
      const closedItems = [];
      for (const line of box.items) {
        const product = state.inventory.find((item) => Number(item.id) === Number(line.productId));
        const count = counts.find((item) => Number(item.productId) === Number(line.productId));
        if (!count || count.actual === "" || count.actual == null) throw httpError(400, `Falta pesar ${line.productName}`);
        const expectedQuantity = Number(product?.stock || 0);
        const actualQuantity = Number(count.actual);
        if (!Number.isFinite(actualQuantity) || actualQuantity < 0) throw httpError(400, `Cantidad física no válida para ${line.productName}`);
        const variance = round(actualQuantity - expectedQuantity);
        const beforeQty = expectedQuantity;
        if (product) product.stock = roundQuantity(actualQuantity);
        if (product && Math.abs(variance) > 0.000001) {
          const movementId = nextId(state, "movement");
          state.inventoryMovements.unshift({ id: movementId, productId: product.id, product: { ...product }, type: "DIFERENCIA_CIERRE", quantity: Math.abs(variance), beforeQty, afterQty: product.stock, reason: `Cierre físico ${area}: diferencia ${variance} ${product.unit}`, createdById: req.user.id, createdAt: now() });
          await postDailyStockChange(client, { key: `daily-close:${box.id}:${product.id}`, legacyProductId: product.id, area, difference: variance, cost: product.cost, actorId: req.user.id, sourceId: box.id, reason: `Ajuste por pesaje físico de cierre ${area}` });
        }
        closedItems.push({ ...line, expectedQuantity, actualQuantity: round(actualQuantity), variance, varianceCost: round(variance * Number(product?.cost || 0)) });
      }
      box.items = closedItems;
      box.status = "CLOSED";
      box.notes = String(req.body.notes || "");
      box.closedAt = now();
      box.closedById = req.user.id;
      box.varianceCost = round(box.items.reduce((sum, item) => sum + Number(item.varianceCost || 0), 0));
      audit(state, "INVENTARIO", "CIERRE_CAJA_DIARIA", `${area}: diferencia S/ ${box.varianceCost}`, req.user.id);
      return hydrateDailyBox(state, box);
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/service-bookings", async (req, res, next) => {
  try { const state = await readState(); const rows = sortRecent(state.bookings.filter((item) => !req.query.serviceCode || item.serviceCode === req.query.serviceCode), req.query.order).map((item) => ({ ...item, client: state.clients.find((client) => client.id === item.clientId), payments: sortRecent(state.payments.filter((payment) => payment.bookingId === item.id), req.query.order), entitlement: state.entitlements.find((entry) => entry.bookingId === item.id) })); res.json(rows); } catch (error) { next(error); }
});
app.post("/api/service-bookings/:id/pay", requireActiveStaffShift, async (req, res, next) => {
  try { const result = await mutateState(async (state, client) => { const booking = state.bookings.find((item) => item.id === Number(req.params.id)); if (!booking) throw httpError(404, "Reserva de servicio no encontrada"); const amount = Number(req.body.amount || booking.balance); if (amount <= 0 || amount > booking.balance) throw httpError(409, "Monto no válido para el saldo"); const before=new Set(state.orders.map((order)=>order.id));const payment=registerPayment(state, { bookingId: booking.id, clientId: booking.clientId, amount, method: req.body.method || "EFECTIVO", concept: `Pago en caja ${booking.code}`, area: "RECEPCION" }, req.user.id);await confirmOrdersInventory(client,state,state.orders.filter((order)=>!before.has(order.id)),req.user.id);return payment; }); res.status(201).json(result); } catch (error) { next(error); }
});

// La cámara de Recepción primero consulta el pase y muestra sus servicios.
// El ingreso se confirma en una segunda acción para evitar consumir un QR por
// una lectura accidental. Hospedaje conserva su propio proceso de check-in.
app.post("/api/access/preview", requireActiveStaffShift, async (req, res, next) => {
  try {
    const state = await readState();
    const raw = String(req.body.code || "").trim();
    let passCode = raw;
    try { passCode = jwt.verify(raw, jwtSecret).pass || raw; } catch {}
    const pass = state.passes.find((item) => item.code === passCode);
    if (!pass) throw httpError(404, "QR no reconocido");
    const client = state.clients.find((item) => item.id === pass.clientId);
    if (!client || ["BLOQUEADO", "INACTIVO"].includes(client.status) || pass.status === "REVOCADO") throw httpError(403, "El pase fue deshabilitado por Recepción");
    const entitlements = state.entitlements.filter((item) => item.passId === pass.id).map((item) => ({
      ...item,
      booking: item.bookingId ? state.bookings.find((booking) => Number(booking.id) === Number(item.bookingId)) : null,
      event: item.eventId ? state.events.find((event) => Number(event.id) === Number(item.eventId)) : null
    }));
    res.json({
      pass: { code: pass.code, kind: pass.kind, status: pass.status },
      client: { id: client.id, firstName: client.firstName, lastName: client.lastName, documentNumber: client.documentNumber },
      entitlements
    });
  } catch (error) { next(error); }
});

app.post("/api/access/validate", requireActiveStaffShift, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const raw = String(req.body.code || "");
      let passCode = raw;
      try { passCode = jwt.verify(raw, jwtSecret).pass || raw; } catch {}
      const pass = state.passes.find((item) => item.code === passCode);
      if (!pass) throw httpError(404, "QR no reconocido");
      const client = state.clients.find((item) => item.id === pass.clientId);
      if (!client || ["BLOQUEADO", "INACTIVO"].includes(client.status) || pass.status === "REVOCADO") throw httpError(403, "El pase fue deshabilitado por Recepcion");
      if (req.body.serviceCode === "HOSPEDAJE") throw httpError(409, "El ingreso de hospedaje se confirma desde Check-in para asignar la estadía y la habitación");
      const entitlement = state.entitlements.find((item) => item.passId === pass.id && item.serviceCode === req.body.serviceCode && ["LISTO_INGRESO", "ACTIVO", "UTILIZADO"].includes(item.status));
      if (!entitlement) throw httpError(403, "Este QR no tiene el servicio activo");
      if (entitlement.usedAt || entitlement.status === "UTILIZADO") throw httpError(409, `Acceso ya utilizado el ${new Date(entitlement.usedAt).toLocaleString("es-PE")}`);
      if (Number(req.body.people || entitlement.people) > entitlement.people) throw httpError(409, `Acceso válido solo para ${entitlement.people} personas`);
      entitlement.usedAt = now(); entitlement.status = "UTILIZADO";
      const booking = state.bookings.find((item) => item.id === entitlement.bookingId);
      if (booking) { booking.accessStatus = "INGRESO_VALIDADO"; if (booking.serviceCode !== "HOSPEDAJE") booking.status = "EN_SERVICIO"; }
      const event = state.events.find((item) => Number(item.id) === Number(entitlement.eventId));
      if (event) event.accessStatus = "INGRESO_VALIDADO";
      const id = nextId(state, "access");
      const log = { id, passId: pass.id, entitlementId: entitlement.id, serviceCode: entitlement.serviceCode, people: entitlement.people, employeeId: req.user.id, validatedAt: entitlement.usedAt };
      state.accessLogs.push(log); audit(state, "ACCESOS", "VALIDAR", `${pass.code} ${entitlement.serviceCode} ${entitlement.people} personas`, req.user.id);
      return { valid: true, client: { firstName: client.firstName, lastName: client.lastName, documentNumber: client.documentNumber }, entitlement, log };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/access/logs", async (_req, res, next) => { try { const state = await readState(); res.json(state.accessLogs); } catch (error) { next(error); } });

app.patch("/api/orders/:id/status", async (req, res, next) => {
  try {
    if (isReceptionAdmin(req.user)) throw httpError(403, "El Admin de recepción puede supervisar pedidos, pero no cambiar su producción");
    const order = await mutateState(async (state, client) => { const item = await transitionOrderInventory(client, state, req.params.id, req.body.status, req.user, req.body); audit(state, "PEDIDOS", "ESTADO", `${item.code}: ${item.status}`, req.user.id); return item; });
    res.json(order);
  } catch (error) { next(error); }
});
app.get("/api/orders/:id/inventory", async (req, res, next) => { try { const state=await readState();const order=state.orders.find((item)=>Number(item.id)===Number(req.params.id));if(!order)throw httpError(404,"Pedido no encontrado");if(isReceptionAdmin(req.user) || (req.user.role!=="ADMINISTRADOR"&&req.user.role!==order.area))throw httpError(403,"No puedes consultar el detalle de inventario de esta área");res.json(await getOrderInventoryDetail(req.params.id)); } catch (error) { next(error); } });
app.patch("/api/restaurante/:id/status", requireActiveStaffShift, updateOrderStatus);
app.patch("/api/bartender/:id/status", requireActiveStaffShift, updateOrderStatus);

app.get("/api/employees", requireFullAdministration("consultar personal"), async (_req, res, next) => { try { const state = await readState(); const today = hotelToday(state); res.json(state.employees.map((employee) => { const shift = state.shifts.find((item) => item.employeeId === employee.id && item.date === today); return { ...safeEmployee(employee), currentAssignment: shift?.area || employee.currentAssignment || null, currentShift: shift || null }; })); } catch (error) { next(error); } });

app.get("/api/shifts", requireFullAdministration("consultar turnos"), async (req, res, next) => {
  try {
    const state = await readState();
    let rows = state.shifts || [];
    if (req.query.date) rows = rows.filter((item) => item.date === req.query.date);
    if (req.query.order) rows = sortRecent(rows, req.query.order);
    res.json(rows);
  } catch (error) { next(error); }
});

app.post("/api/shifts", requireFullAdministration("crear turnos"), async (req, res, next) => {
  try {
    const shift = await mutateState((state) => {
      // Unified overlap check if start and end are provided
      if (req.body.start && req.body.end) {
        const overlap = state.shifts.some((item) => 
          (item.employeeId === Number(req.body.employeeId) || item.userId === Number(req.body.userId)) 
          && item.date === req.body.date 
          && req.body.start < item.end && req.body.end > item.start
        );
        if (overlap) throw httpError(409, "El empleado ya tiene un turno superpuesto");
      }
      
      const id = nextId(state, "shift");
      const item = { 
        id, 
        employeeId: req.body.employeeId ? Number(req.body.employeeId) : null,
        userId: req.body.userId ? Number(req.body.userId) : null,
        date: req.body.date, 
        start: req.body.start || null, 
        end: req.body.end || null, 
        area: req.body.area || null,
        shiftType: req.body.shiftType || req.body.area || null,
        status: "PROGRAMADO", 
        replacementId: null,
        createdAt: now()
      };
      
      state.shifts.push(item);
      audit(state, "TURNOS", "CREAR", `${item.date} ${item.area || item.shiftType}`, req.user.id);
      return item;
    });
    res.status(201).json(shift);
  } catch (error) { next(error); }
});
app.patch("/api/shifts/:id", requireInventoryAdmin, async (req, res, next) => {
  try {
    const shift = await mutateState((state) => {
      const item = state.shifts.find((entry) => entry.id === Number(req.params.id));
      if (!item) throw httpError(404, "Turno no encontrado");
      if (item.status === "CANCELADO") throw httpError(409, "El turno ya fue cancelado");
      const next = { ...item, ...compact(req.body), employeeId: req.body.employeeId ? Number(req.body.employeeId) : item.employeeId, userId: req.body.userId ? Number(req.body.userId) : item.userId };
      if (next.start && next.end) {
        const overlap = state.shifts.some((entry) => entry.id !== item.id && (entry.employeeId === next.employeeId || entry.userId === next.userId) && entry.date === next.date && entry.start < next.end && entry.end > next.start && entry.status !== "CANCELADO");
        if (overlap) throw httpError(409, "El empleado ya tiene un turno superpuesto");
      }
      Object.assign(item, next, { updatedAt: now() });
      audit(state, "TURNOS", "EDITAR", `${item.date} ${item.area || item.shiftType}`, req.user.id);
      return item;
    });
    res.json(shift);
  } catch (error) { next(error); }
});
app.patch("/api/shifts/:id/cancel", requireInventoryAdmin, async (req, res, next) => {
  try {
    const shift = await mutateState((state) => {
      const item = state.shifts.find((entry) => entry.id === Number(req.params.id));
      if (!item) throw httpError(404, "Turno no encontrado");
      item.status = "CANCELADO";
      item.cancelReason = String(req.body.reason || "Cancelado por Superadmin").trim();
      item.cancelledAt = now();
      audit(state, "TURNOS", "CANCELAR", `${item.date} ${item.cancelReason}`, req.user.id);
      return item;
    });
    res.json(shift);
  } catch (error) { next(error); }
});

app.post("/api/attendance/check-in", async (req, res, next) => { try { const item = await attendanceAction(req, "INGRESO"); res.json(item); } catch (error) { next(error); } });
app.post("/api/attendance/check-out", async (req, res, next) => { try { const item = await attendanceAction(req, "SALIDA"); res.json(item); } catch (error) { next(error); } });
app.post("/api/attendance/self/clock", attendanceClockRateLimit, async (req, res, next) => {
  try {
    const documentNumber = String(req.body.documentNumber || "").replace(/\D/g, "");
    const pin = String(req.body.pin || "");
    if (!/^\d{8}$/.test(documentNumber) || !/^\d{4}$/.test(pin)) throw httpError(400, "Ingresa tu DNI y PIN de 4 dígitos.");
    const result = await mutateState(async (state, client) => {
      const employee = findActiveClockEmployee(state, documentNumber);
      if (!employee || Number(employee.id) !== Number(req.user.id) || !verifyAttendancePin(pin, employee)) throw httpError(401, "DNI o PIN incorrecto para esta cuenta.");
      const today = hotelToday(state);
      const open = [...state.attendance].reverse().find((row) => Number(row.employeeId || row.userId) === Number(employee.id) && attendanceDateOf(row) === today && (row.checkIn || row.clockIn) && !(row.checkOut || row.clockOut));
      const action = open ? "SALIDA" : "INGRESO";
      const record = await recordAttendance(state, client, employee.id, action, employee.id);
      return { success: true, action: action === "INGRESO" ? "CHECK_IN" : "CHECK_OUT", record };
    });
    attendanceAttempts.delete(attendanceAttemptKey(req));
    res.json(result);
  } catch (error) { next(error); }
});
app.get("/api/payroll/weekly", requireFullAdministration("consultar planilla"), async (req, res, next) => {
  try { const state = await readState(); const from = req.query.from || state.settings.today; const start = new Date(`${from}T00:00:00`); const end = new Date(start.getTime() + 7 * 86400000); res.json(state.employees.map((employee) => { const records = state.attendance.filter((item) => item.employeeId === employee.id && new Date(item.date) >= start && new Date(item.date) < end); const payableDays = new Set(records.filter((item) => item.checkIn && item.checkOut).map((item) => item.date)).size; const scheduled = state.shifts.filter((item) => item.employeeId === employee.id && new Date(`${item.date}T00:00:00`) >= start && new Date(`${item.date}T00:00:00`) < end).length; return { employeeId: employee.id, employee: `${employee.firstName} ${employee.lastName}`, dailyRate: employee.dailyRate, scheduledDays: scheduled, attendedDays: payableDays, absences: Math.max(0, scheduled - payableDays), payableDays, total: payableDays * employee.dailyRate }; })); } catch (error) { next(error); }
});

app.get("/api/clients", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); res.json(state.clients.map((item) => hydrateClient(state, item))); } catch (error) { next(error); } });
app.post("/api/clients", requireReceptionAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const documentNumber = normalizeDocument(req.body.documentNumber);
      if (!documentNumber) throw httpError(400, "Ingresa un documento");
      if (state.clients.some((item) => normalizeDocument(item.documentNumber) === documentNumber)) throw httpError(409, "Ya existe un cliente con este documento");
      const item = { id: nextId(state, "client"), ...compact(req.body), documentNumber, status: "ACTIVO", createdAt: now() };
      state.clients.push(item);
      audit(state, "CLIENTES", "CREAR", `Cliente ${documentNumber}`, req.user.id);
      return hydrateClient(state, item);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
app.put("/api/clients/:id", requireReceptionAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const client = state.clients.find((item) => item.id === Number(req.params.id));
      if (!client) throw httpError(404, "Huésped no encontrado");
      const documentNumber = req.body.documentNumber ? normalizeDocument(req.body.documentNumber) : client.documentNumber;
      if (!documentNumber) throw httpError(400, "Ingresa un documento válido");
      if (state.clients.some((item) => item.id !== client.id && normalizeDocument(item.documentNumber) === documentNumber)) throw httpError(409, "Ya existe otro cliente con ese documento");
      Object.assign(client, compact(req.body), { documentNumber, updatedAt: now() });
      audit(state, "CLIENTES", "EDITAR", `Cliente ${documentNumber}`, req.user.id);
      return hydrateClient(state, client);
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.patch("/api/clients/:id/status", requireReceptionAdmin, async (req, res, next) => {
  try { const result = await mutateState((state) => { const client = state.clients.find((item) => item.id === Number(req.params.id)); if (!client) throw httpError(404, "Huesped no encontrado"); const target = req.body.status; if (!["ACTIVO", "BLOQUEADO", "INACTIVO"].includes(target)) throw httpError(400, "Estado no valido"); client.status = target; client.statusReason = req.body.reason || ""; client.updatedAt = now(); if (target !== "ACTIVO") { const passIds = state.passes.filter((pass) => pass.clientId === client.id).map((pass) => pass.id); state.passes.filter((pass) => passIds.includes(pass.id)).forEach((pass) => { pass.status = "REVOCADO"; pass.revokedAt = now(); }); state.entitlements.filter((entitlement) => passIds.includes(entitlement.passId) && !["FINALIZADO", "REVOCADO"].includes(entitlement.status)).forEach((entitlement) => { entitlement.status = "REVOCADO"; entitlement.revokedAt = now(); }); } audit(state, "CLIENTES", target === "ACTIVO" ? "REACTIVAR" : "DESHABILITAR", `${client.documentNumber}: ${req.body.reason || target}`, req.user.id); return hydrateClient(state, client); }); res.json(result); } catch (error) { next(error); }
});
app.post("/api/clients/:id/end-services", requireReceptionAdmin, async (req, res, next) => {
  try { const result = await mutateState((state) => { const client = state.clients.find((item) => item.id === Number(req.params.id)); if (!client) throw httpError(404, "Huesped no encontrado"); const passIds = state.passes.filter((pass) => pass.clientId === client.id).map((pass) => pass.id); state.entitlements.filter((item) => passIds.includes(item.passId) && !["FINALIZADO", "REVOCADO"].includes(item.status)).forEach((item) => { item.status = "FINALIZADO"; item.finishedAt = now(); }); state.bookings.filter((item) => item.clientId === client.id && !["CANCELADA", "FINALIZADA"].includes(item.status)).forEach((item) => { if (item.serviceCode !== "HOSPEDAJE" || !state.stays.some((stay) => stay.reservationId === item.id && stay.status === "ACTIVA")) item.status = "FINALIZADA"; }); audit(state, "ACCESOS", "FINALIZAR_SERVICIOS", `${client.documentNumber}: ${req.body.reason || "Fin de vigencia"}`, req.user.id); return hydrateClient(state, client); }); res.json(result); } catch (error) { next(error); }
});

app.delete("/api/clients/:id", requireFullAdministration("eliminar clientes de prueba"), async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const clientId = Number(req.params.id);
      const client = state.clients.find((item) => item.id === clientId);
      if (!client) throw httpError(404, "Cliente no encontrado");
      if (normalizeDocument(req.body.confirmDocument) !== normalizeDocument(client.documentNumber)) throw httpError(400, "Escribe el documento del cliente para confirmar la eliminacion");

      const bookingIds = state.bookings.filter((item) => item.clientId === clientId).map((item) => item.id);
      const passIds = state.passes.filter((item) => item.clientId === clientId).map((item) => item.id);
      const stayIds = state.stays.filter((item) => item.clientId === clientId).map((item) => item.id);
      const requestIds = state.requests.filter((item) => item.clientId === clientId).map((item) => item.id);
      const activeRoomIds = state.stays.filter((item) => item.clientId === clientId && item.status === "ACTIVA").map((item) => item.roomId);
      state.rooms.filter((room) => activeRoomIds.includes(room.id)).forEach((room) => { room.status = "LIBRE"; });

      state.cochera.forEach((space) => {
        const remaining = (space.entries || []).filter((entry) => entry.clientId !== clientId && !bookingIds.includes(entry.bookingId));
        if (remaining.length !== (space.entries || []).length) { space.entries = remaining; space.status = remaining.length ? space.status : "LIBRE"; }
      });

      const removeClientRows = (key, predicate = (item) => item.clientId === clientId) => { const before = state[key].length; state[key] = state[key].filter((item) => !predicate(item)); return before - state[key].length; };
      const removed = {
        reservations: removeClientRows("reservations"),
        bookings: removeClientRows("bookings"),
        payments: removeClientRows("payments", (item) => item.clientId === clientId || bookingIds.includes(item.bookingId) || bookingIds.includes(item.reservationId) || stayIds.includes(item.stayId)),
        passes: removeClientRows("passes"),
        entitlements: removeClientRows("entitlements", (item) => passIds.includes(item.passId) || bookingIds.includes(item.bookingId)),
        accessLogs: removeClientRows("accessLogs", (item) => item.clientId === clientId || passIds.includes(item.passId)),
        orders: removeClientRows("orders"),
        requests: removeClientRows("requests"),
        tasks: removeClientRows("tasks", (item) => item.clientId === clientId || requestIds.includes(item.requestId)),
        stays: removeClientRows("stays"),
        events: removeClientRows("events"),
        invoices: removeClientRows("facturacion", (item) => item.clientId === clientId || bookingIds.includes(item.bookingId) || bookingIds.includes(item.reservationId)),
        poolEntries: removeClientRows("poolEntries")
      };
      audit(state, "CLIENTES", "ELIMINAR_DEMO", `Documento ${client.documentNumber}; dependencias ${Object.values(removed).reduce((sum, value) => sum + value, 0)}`, req.user.id);
      state.clients = state.clients.filter((item) => item.id !== clientId);
      return { deleted: true, client: { id: client.id, documentNumber: client.documentNumber, name: `${client.firstName} ${client.lastName}` }, removed };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/reservations", async (req, res, next) => {
  try { const state = await readState(); res.json(sortRecent(state.reservations, req.query.order).map((item) => hydrateReservation(state, item))); } catch (error) { next(error); }
});
app.post("/api/reservations", async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const client = state.clients.find((item) => item.id === Number(req.body.clientId));
      const room = state.rooms.find((item) => item.id === Number(req.body.roomId));
      if (dayDiff(req.body.checkInDate, req.body.checkOutDate) <= 0) throw httpError(400, "La fecha de salida debe ser posterior a la fecha de entrada");
      if (!client || !room) throw httpError(400, "Cliente o habitacion no valida");
      if (state.reservations.some((item) => !["CANCELADA", "COMPLETADA"].includes(item.status) && item.roomId === room.id && overlaps(req.body.checkInDate, req.body.checkOutDate, item.checkInDate, item.checkOutDate))) throw httpError(409, "La habitacion ya esta reservada en esas fechas");
      const id = nextId(state, "booking");
      const total = Number(req.body.totalPrice || 0); const advance = Number(req.body.advance || 0);
      const reservation = { id, code: code("RES", id), ...req.body, clientId: client.id, roomId: room.id, totalPrice: total, advance, balance: round(total - advance), paymentStatus: advance >= total ? "PAGADO" : advance > 0 ? "PARCIAL" : "PENDIENTE", status: req.body.status || "CONFIRMADA", createdAt: now() };
      state.reservations.push(reservation);
      state.bookings.push({ id, code: reservation.code, clientId: client.id, serviceCode: "HOSPEDAJE", roomId: room.id, room, checkIn: reservation.checkInDate, checkOut: reservation.checkOutDate, date: reservation.checkInDate, slot: String(reservation.checkInDate).slice(11, 16) || "15:00", people: Number(reservation.adults || 1) + Number(reservation.children || 0), total, paid: advance, balance: reservation.balance, paymentStatus: reservation.paymentStatus, status: reservation.status, createdAt: reservation.createdAt });
      if (advance > 0) state.payments.push(attachCashSession(state, { id: nextId(state, "payment"), bookingId: id, reservationId: id, clientId: client.id, amount: advance, method: req.body.paymentMethod || "EFECTIVO", concept: `Adelanto ${reservation.code}`, area: "RECEPCION", status: "APROBADO", createdAt: now() }, req.user.id));
      audit(state, "RESERVAS", "CREAR", reservation.code, req.user.id);
      return hydrateReservation(state, reservation);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
app.put("/api/reservations/:id", async (req, res, next) => {
  if (dayDiff(req.body.checkInDate, req.body.checkOutDate) <= 0) return next(httpError(400, "La fecha de salida debe ser posterior a la fecha de entrada"));
  try {
    const result = await mutateState((state) => {
      const item = state.reservations.find((row) => row.id === Number(req.params.id));
      if (!item) throw httpError(404, "Reserva no encontrada");
      const clientId = Number(req.body.clientId);
      const roomId = Number(req.body.roomId);
      if (!state.clients.some((row) => Number(row.id) === clientId) || !state.rooms.some((row) => Number(row.id) === roomId)) throw httpError(400, "Cliente o habitación no válida");
      if (state.reservations.some((row) => Number(row.id) !== Number(item.id) && Number(row.roomId) === roomId && !["CANCELADA", "COMPLETADA"].includes(row.status) && overlaps(req.body.checkInDate, req.body.checkOutDate, row.checkInDate || row.checkIn, row.checkOutDate || row.checkOut))) throw httpError(409, "La habitación ya está reservada en esas fechas");
      const totalPrice = Number(req.body.totalPrice);
      const advance = Number(req.body.advance);
      const balance = round(Math.max(0, totalPrice - advance));
      const paymentStatus = balance <= 0 ? "PAGADO" : advance > 0 ? "PARCIAL" : "PENDIENTE";
      Object.assign(item, req.body, { clientId, roomId, totalPrice, advance, balance, paymentStatus, updatedAt: now() });
      const booking = state.bookings.find((row) => row.id === item.id);
      if (booking) Object.assign(booking, { clientId, roomId, checkIn: item.checkInDate, checkOut: item.checkOutDate, date: dateKey(item.checkInDate), total: totalPrice, paid: advance, balance, paymentStatus, status: item.status });
      audit(state, "RESERVAS", "EDITAR", item.code, req.user.id);
      return hydrateReservation(state, item);
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.delete("/api/reservations/:id", async (req, res, next) => {
  try { const result = await mutateState((state) => { const item = state.reservations.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Reserva no encontrada"); item.status = "CANCELADA"; const booking = state.bookings.find((row) => row.id === item.id); if (booking) booking.status = "CANCELADA"; audit(state, "RESERVAS", "CANCELAR", item.code, req.user.id); return hydrateReservation(state, item); }); res.json(result); } catch (error) { next(error); }
});

app.get("/api/checkin/search", async (req, res, next) => {
  try { const state = await readState(); const needle = String(req.query.search || "").toLowerCase(); res.json(sortRecent(state.reservations, req.query.order).map((item) => hydrateReservation(state, item)).filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle))); } catch (error) { next(error); }
});
app.post("/api/checkin", requireActiveStaffShift, async (req, res, next) => {
  try {
    const stay = await mutateState((state) => {
      const reservation = state.reservations.find((item) => item.id === Number(req.body.reservationId));
      if (!reservation) throw httpError(404, "Reserva no encontrada");
      if (reservation.stayId || reservation.status === "CHECKED_IN") throw httpError(409, "El check-in ya fue realizado");
      if (["CANCELADA", "COMPLETADA"].includes(reservation.status)) throw httpError(409, "La reserva no admite check-in");
      if (Number(reservation.balance || 0) > 0 || reservation.paymentStatus !== "PAGADO") throw httpError(409, `Completa el saldo de S/ ${Number(reservation.balance || 0).toFixed(2)} antes del check-in`);

      const today = hotelToday(state);
      const arrival = dateKey(reservation.checkInDate || reservation.checkIn);
      const departure = dateKey(reservation.checkOutDate || reservation.checkOut);
      if (arrival && arrival > today) throw httpError(409, `El check-in estará disponible el ${arrival.split("-").reverse().join("/")}`);
      if (departure && departure <= today) throw httpError(409, "La fecha de salida ya venció. Actualiza la reserva antes de registrar el ingreso");

      const room = state.rooms.find((row) => Number(row.id) === Number(reservation.roomId));
      if (!room) throw httpError(409, "La reserva no tiene una habitación válida asignada");
      if (!roomReady(room)) {
        const messages = {
          EN_LIMPIEZA: "La habitación todavía está en limpieza",
          OCUPADA: "La habitación continúa ocupada",
          MANTENIMIENTO: "La habitación está bloqueada por mantenimiento",
          FUERA_SERVICIO: "La habitación está fuera de servicio"
        };
        throw httpError(409, messages[room.status] || "La habitación todavía no está preparada");
      }

      const id = nextId(state, "stay");
      const item = { id, reservationId: reservation.id, clientId: reservation.clientId, roomId: reservation.roomId, checkInAt: now(), status: "ACTIVA", createdAt: now() };
      state.stays.push(item);
      reservation.stayId = id;
      reservation.status = "CHECKED_IN";
      const booking = state.bookings.find((row) => row.id === reservation.id);
      if (booking) { booking.status = "CHECKED_IN"; booking.accessStatus = "ACTIVO"; }
      room.status = "OCUPADA";
      ensureStayAccess(state, reservation, item, now());
      audit(state, "CHECK_IN", "REGISTRAR", reservation.code, req.user.id);
      return hydrateStay(state, item);
    });
    res.status(201).json(stay);
  } catch (error) { next(error); }
});
app.get("/api/checkout/stays", async (_req, res, next) => {
  try { const state = await readState(); res.json(state.stays.filter((item) => item.status === "ACTIVA").map((item) => hydrateStay(state, item))); } catch (error) { next(error); }
});
app.post("/api/checkout/inspect", requireActiveStaffShift, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const stay = state.stays.find((item) => item.id === Number(req.body.stayId));
      if (!stay || stay.status !== "ACTIVA") throw httpError(404, "Estadia activa no encontrada");
      
      const room = state.rooms.find((item) => item.id === stay.roomId);
      if (room) room.status = "EN_LIMPIEZA";
      
      const taskId = nextId(state, "task");
      state.tasks.push({ id: taskId, code: code("LIM", taskId), clientId: stay.clientId, roomId: room.id, room, serviceType: "LIMPIEZA_POST_CHECKOUT", workflowType: "POST_CHECKOUT", description: "Limpieza completa tras check-out", assignedEmployeeId: null, assignedTo: null, priority: "ALTA", status: "PENDIENTE", evidences: [], operationalReports: [], createdAt: now() });
      
      return hydrateStay(state, stay);
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/checkout", requireActiveStaffShift, async (req, res, next) => {
  try { const result = await mutateState((state) => { const stay = state.stays.find((item) => item.id === Number(req.body.stayId)); if (!stay || stay.status !== "ACTIVA") throw httpError(404, "Estadia activa no encontrada"); const reservation = state.reservations.find((item) => item.id === stay.reservationId); const consumptions = state.orders.filter((item) => item.clientId === stay.clientId && item.roomId === stay.roomId && item.status !== "CANCELADO").reduce((sum, item) => sum + Number(item.total || 0), 0); const payments = state.payments.filter((item) => item.reservationId === reservation.id || item.bookingId === reservation.id || item.stayId === stay.id).reduce((sum, item) => sum + Number(item.amount || 0), 0); const due = Math.max(0, Number(reservation.totalPrice || 0) + consumptions - payments); const paymentAmount = Number(req.body.paymentAmount || 0); if (paymentAmount + 0.001 < due) throw httpError(409, `Falta cobrar S/ ${round(due - paymentAmount)}`); if (paymentAmount > 0) state.payments.push(attachCashSession(state, { id: nextId(state, "payment"), stayId: stay.id, reservationId: reservation.id, bookingId: reservation.id, clientId: stay.clientId, amount: paymentAmount, method: req.body.paymentMethod || "EFECTIVO", concept: `Cierre ${reservation.code}`, area: "RECEPCION", status: "APROBADO", createdAt: now() }, req.user.id)); stay.status = "FINALIZADA"; stay.checkOutAt = now(); reservation.status = "COMPLETADA"; reservation.balance = 0; reservation.paymentStatus = "PAGADO"; const booking = state.bookings.find((item) => item.id === reservation.id); if (booking) { booking.status = "FINALIZADA"; booking.balance = 0; booking.paymentStatus = "PAGADO"; } state.entitlements.filter((item) => Number(item.bookingId) === Number(reservation.id) && item.serviceCode === "HOSPEDAJE").forEach((item) => { item.status = "FINALIZADO"; item.finishedAt = now(); }); audit(state, "CHECK_OUT", "FINALIZAR", reservation.code, req.user.id); return hydrateStay(state, stay); }); res.json(result); } catch (error) { next(error); }
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const state = await readState(); const today = hotelToday(state);
    const todayPayments = state.payments.filter((item) => String(item.createdAt).slice(0, 10) === today);
    const income = todayPayments.reduce((sum, item) => sum + Number(item.amount), 0);
    const activeStays = state.stays.filter((item) => item.status === "ACTIVA");
    const activeOrders = sortRecent(state.orders.filter((item) => !["ENTREGADO", "CANCELADO"].includes(item.status))).map((item) => withOrderTiming(item));
    const pendingPayments = state.bookings.filter((item) => Number(item.balance || 0) > 0).length + state.events.filter((item) => Number(item.balance || 0) > 0).length;
    res.json({
      metrics: {
        incomeToday: round(income), cashToday: round(todayPayments.filter((item) => ["EFECTIVO", "CAJA HOTEL"].includes(item.method)).reduce((sum, item) => sum + Number(item.amount), 0)),
        occupiedRooms: state.rooms.filter((item) => item.status === "OCUPADA").length, availableRooms: state.rooms.filter((item) => item.status === "LIBRE").length,
        reservationsToday: state.reservations.filter((item) => String(item.checkInDate).slice(0, 10) === today).length, checkInsToday: state.stays.filter((item) => String(item.checkInAt).slice(0, 10) === today).length, checkOutsToday: state.stays.filter((item) => String(item.checkOutAt).slice(0, 10) === today).length,
        noShow: state.reservations.filter((item) => item.status === "NO_SHOW").length, hostedGuests: activeStays.reduce((sum, stay) => { const reservation = state.reservations.find((item) => item.id === stay.reservationId); return sum + Number(reservation?.adults || 1) + Number(reservation?.children || 0); }, 0),
        incidentsOpen: state.requests.filter((item) => !["RESUELTO", "SOLUCIONADO", "CERRADO"].includes(item.status)).length, incidentsHighPriority: state.requests.filter((item) => !["RESUELTO", "SOLUCIONADO", "CERRADO"].includes(item.status) && ["ALTA", "CRITICA"].includes(item.priority)).length,
        activeStaff: state.employees.filter((item) => item.attendanceStatus === "EN_TURNO").length, pendingPayments, parkingOccupied: state.cochera.filter((item) => item.status === "OCUPADO").length, delayedOrders: activeOrders.filter((item) => ["LATE", "ABANDONED"].includes(item.operationalBucket)).length
      },
      charts: { income: [{ time: "08:00", amount: 0 }, { time: "Ahora", amount: income }], salesByArea: groupPayments(state) },
      modules: { cleaning: state.tasks.filter((item) => item.status !== "FINALIZADA"), orders: activeOrders },
      upcomingEvents: state.events.filter((item) => !["CANCELADO", "COTIZACION"].includes(item.status)).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, 8),
      lowStockProducts: state.inventory.filter((item) => isOperationalProduct(item) && item.stock <= item.minStock),
      recentActivity: state.audit.slice(0, 8)
    });
  } catch (error) { next(error); }
});
app.get("/api/rooms", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); res.json({ rooms: state.rooms.map((room) => hydrateRoom(state, room)) }); } catch (error) { next(error); } });
app.patch("/api/rooms/:id", requireReceptionAdmin, async (req, res, next) => { try { const room = await mutateState((state) => { const item = state.rooms.find((entry) => entry.id === Number(req.params.id)); if (!item) throw httpError(404, "Habitación no encontrada"); const nextStatus = req.body.status ? normalizeRoomStatus(req.body.status) : item.status; if (!nextStatus) throw httpError(400, "Estado de habitación no válido"); const nextCleaning = req.body.cleaningStatus ? String(req.body.cleaningStatus).toUpperCase() : item.cleaningStatus; Object.assign(item, { status: nextStatus, cleaningStatus: nextCleaning, updatedAt: now(), statusNote: String(req.body.note || item.statusNote || "") }); audit(state, "HABITACIONES", "ESTADO", `${item.number || item.id}: ${nextStatus}`, req.user.id); return item; }); res.json(room); } catch (error) { next(error); } });
app.get("/api/rooms/:id/check-availability", async (req, res, next) => { try { const state = await readState(); const occupied = state.bookings.some((item) => item.roomId === Number(req.params.id) && overlaps(req.query.checkIn, req.query.checkOut, item.checkIn, item.checkOut)); res.json({ available: !occupied, message: occupied ? "Habitación ocupada en esas fechas" : "Habitación disponible" }); } catch (error) { next(error); } });
app.get("/api/clients/search", requireReceptionAdmin, resourceSearch("clients"));
app.get("/api/pool/client-search", requireReceptionAdmin, resourceSearch("clients"));
app.get("/api/roles/permissions", requireFullAdministration("consultar permisos"), async (_req, res, next) => { try { const state = await readState(); const map = new Map(); state.roles.flatMap((item) => item.permissions || []).forEach((permission) => map.set(permission.id, permission)); res.json([...map.values()].sort((a, b) => a.id - b.id)); } catch (error) { next(error); } });
app.get("/api/reports/products", requireFullAdministration("consultar costos e inventario global"), async (req, res, next) => { try { const state = await readState(); res.json(state.inventory.filter((item) => isOperationalProduct(item) && (!req.query.area || item.area === req.query.area))); } catch (error) { next(error); } });
app.get("/api/reports", requireReceptionAdmin, async (req, res, next) => { try { const state = await readState(); const search = String(req.query.search || "").toLowerCase(); const rows = sortRecent(state.requests.filter((item) => (!req.query.area || item.area === req.query.area) && (!req.query.type || item.type === req.query.type) && (!req.query.priority || item.priority === req.query.priority) && (!req.query.status || item.status === req.query.status) && (!req.query.from || String(item.createdAt).slice(0, 10) >= req.query.from) && (!search || JSON.stringify(item).toLowerCase().includes(search))), req.query.order); res.json({ reports: rows, summary: summaryReports(rows) }); } catch (error) { next(error); } });
app.get("/api/inventory/summary", requireFullAdministration("consultar el inventario global"), async (req, res, next) => { try { const state = await readState(); const rows = state.inventory.filter((item) => isOperationalProduct(item) && (!req.query.area || item.area === req.query.area)); res.json({ totalProducts: rows.length, lowStock: rows.filter((item) => item.stock <= item.minStock).length, noStock: rows.filter((item) => item.stock <= 0).length, value: round(rows.reduce((sum, item) => sum + item.stock * item.cost, 0)) }); } catch (error) { next(error); } });
app.get("/api/inventory/categories", requireFullAdministration("consultar categorías de inventario"), (_req, res) => res.json([{ id: 1, name: "Alimentos" }, { id: 2, name: "Bebidas" }]));
app.get("/api/inventory", requireFullAdministration("consultar el inventario global"), async (req, res, next) => { try { const state = await readState(); const search = String(req.query.search || "").toLowerCase(); const rows = state.inventory.filter(isOperationalProduct).map(hydrateProduct).filter((item) => (!req.query.area || item.area === req.query.area) && (!search || item.name.toLowerCase().includes(search)) && (!req.query.categoryId || item.categoryId === Number(req.query.categoryId)) && (!req.query.status || item.stockStatus === req.query.status)); res.json(rows); } catch (error) { next(error); } });
app.get("/api/inventory/relational/status", requireFullAdministration("consultar el inventario relacional"), async (_req, res, next) => { try { res.json(await readRelationalInventoryStatus()); } catch (error) { next(error); } });
app.get("/api/catalog/references", requireInventoryAdmin, async (_req, res, next) => { try { res.json(await catalogReferences()); } catch (error) { next(error); } });
app.get("/api/catalog/products", requireInventoryAdmin, async (req, res, next) => { try { res.json(await listCatalogProducts({ search: req.query.search, area: req.query.area, status: req.query.status, includeArchived: req.query.includeArchived === "true" })); } catch (error) { next(error); } });
app.get("/api/catalog/products/:id", requireInventoryAdmin, async (req, res, next) => { try { res.json(await getCatalogProduct(req.params.id)); } catch (error) { next(error); } });
app.post("/api/catalog/products", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createCatalogProduct(req.body, req.user.id)); } catch (error) { next(error); } });
app.put("/api/catalog/products/:id", requireInventoryAdmin, async (req, res, next) => { try { res.json(await updateCatalogProduct(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.patch("/api/catalog/products/:id/archive", requireInventoryAdmin, async (req, res, next) => { try { res.json(await archiveCatalogProduct(req.params.id, req.user.id, req.body.reason)); } catch (error) { next(error); } });
app.post("/api/catalog/products/:id/cost-receipt", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await receiveCatalogCost(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.get("/api/catalog/products/:id/fefo", requireInventoryAdmin, async (req, res, next) => { try { res.json(await suggestFefo(req.params.id, req.query.quantity)); } catch (error) { next(error); } });
app.post("/api/catalog/units", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createCatalogUnit(req.body)); } catch (error) { next(error); } });
app.post("/api/catalog/categories", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createCatalogCategory(req.body)); } catch (error) { next(error); } });
app.post("/api/products", requireInventoryAdmin, (_req, res) => res.status(410).json({ message: "La creación simple fue reemplazada por el catálogo maestro", catalogEndpoint: "/api/catalog/products" }));
app.get("/api/purchasing/references", requirePurchasingAdmin, async (_req, res, next) => { try { res.json(await purchasingReferences()); } catch (error) { next(error); } });
app.get("/api/purchasing/orders", requirePurchasingAdmin, async (_req, res, next) => { try { res.json(await listPurchaseOrders()); } catch (error) { next(error); } });
app.get("/api/purchasing/orders/:id", requirePurchasingAdmin, async (req, res, next) => { try { res.json(await getPurchaseOrder(req.params.id)); } catch (error) { next(error); } });
app.post("/api/purchasing/orders", requirePurchasingAdmin, async (req, res, next) => { try { res.status(201).json(await createPurchaseOrder(req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/purchasing/orders/:id/receipts", requirePurchasingAdmin, async (req, res, next) => { try { res.status(201).json(await createGoodsReceipt(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/purchasing/receipts/:id/verify", requirePurchasingAdmin, async (req, res, next) => { try { res.json(await verifyGoodsReceipt(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/purchasing/receipts/:id/post", requirePurchasingAdmin, async (req, res, next) => { try { res.json(await postGoodsReceipt(req.params.id, req.user.id)); } catch (error) { next(error); } });
app.get("/api/transfers/references", requireTransferUser, async (req, res, next) => { try { res.json(await transferReferences(req.user)); } catch (error) { next(error); } });
app.get("/api/transfers/stock", requireTransferUser, async (req, res, next) => { try { res.json(await transferStockOverview(req.user)); } catch (error) { next(error); } });
app.get("/api/transfers", requireTransferUser, async (req, res, next) => { try { res.json(await listTransfers(req.user)); } catch (error) { next(error); } });
app.get("/api/transfers/:id", requireTransferUser, async (req, res, next) => { try { res.json(await getTransfer(req.params.id,req.user)); } catch (error) { next(error); } });
app.post("/api/transfers", requireTransferUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(await createTransfer(req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/transfers/:id/send", requireTransferUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await sendTransfer(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/transfers/:id/receive", requireTransferUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await receiveTransfer(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/transfers/:id/reject", requireTransferUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await rejectTransfer(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/transfers/:id/cancel", requireTransferUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await cancelTransfer(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.get("/api/operational-inventory/references", requireOperationalInventoryUser, async (_req, res, next) => { try { res.json(await operationalInventoryReferences()); } catch (error) { next(error); } });
app.get("/api/operational-inventory/sessions", requireOperationalInventoryUser, async (req, res, next) => { try { res.json(await listOperationalInventories(req.query, req.user)); } catch (error) { next(error); } });
app.get("/api/operational-inventory/sessions/:id", requireOperationalInventoryUser, async (req, res, next) => { try { res.json(await getOperationalInventory(req.params.id, req.user)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(await createOperationalInventory(req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/open", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await openOperationalInventory(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/start-count", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await startOperationalCount(req.params.id, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/waste", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(await registerOperationalWaste(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/submit", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await submitOperationalCount(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/observe", requireInventoryAdmin, async (req, res, next) => { try { res.json(await observeOperationalInventory(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/close", requireInventoryAdmin, async (req, res, next) => { try { res.json(await closeOperationalInventory(req.params.id, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/reopen", requireInventoryAdmin, async (req, res, next) => { try { res.json(await reopenOperationalInventory(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.get("/api/bar/bottles/references", requireBarBottleUser, async (req,res,next)=>{try{res.json(await barBottleReferences(req.user));}catch(error){next(error);}});
app.get("/api/bar/bottles", requireBarBottleUser, async (req,res,next)=>{try{res.json(await listBarBottles(req.user));}catch(error){next(error);}});
app.post("/api/bar/bottles", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.status(201).json(await openBarBottle(req.body,req.user.id));}catch(error){next(error);}});
app.post("/api/bar/bottles/:id/serve", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.json(await serveBarBottle(req.params.id,req.body,req.user.id));}catch(error){next(error);}});
app.post("/api/bar/bottles/:id/measure", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.json(await measureBarBottle(req.params.id,req.body,req.user.id));}catch(error){next(error);}});
app.post("/api/bar/bottles/:id/close", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.json(await closeBarBottle(req.params.id,req.body,req.user.id));}catch(error){next(error);}});
app.get("/api/inventory-admin/references", requireInventoryAdmin, async (_req,res,next)=>{try{res.json(await inventoryAdminReferences());}catch(error){next(error);}});
app.get("/api/inventory-admin/dashboard", requireInventoryAdmin, async (req,res,next)=>{try{res.json(await inventoryAdminDashboard(req.query));}catch(error){next(error);}});
app.get("/api/stock-requests/references", requireStockRequestUser, async (_req,res,next)=>{try{res.json(await stockRequestReferences());}catch(error){next(error);}});
app.get("/api/stock-requests", requireStockRequestUser, async (req,res,next)=>{try{res.json(await listStockRequests(req.query,req.user));}catch(error){next(error);}});
app.post("/api/stock-requests", requireStockRequestUser, requireActiveStaffShift, async (req,res,next)=>{try{res.status(201).json(await createStockRequest(req.body,req.user));}catch(error){next(error);}});
app.post("/api/stock-requests/:id/review", requireInventoryAdmin, async (req,res,next)=>{try{res.json(await reviewStockRequest(req.params.id,req.body,req.user));}catch(error){next(error);}});
app.get("/api/data-integrity", requireInventoryAdmin, async (_req,res,next)=>{try{res.json(await dataIntegrityReport());}catch(error){next(error);}});
app.post("/api/data-integrity/sanitize", requireInventoryAdmin, async (req,res,next)=>{try{res.json(await sanitizeDataIntegrity(req.user.id));}catch(error){next(error);}});
app.get("/api/technical-recipes/references", requireInventoryAdmin, async (_req, res, next) => { try { res.json(await technicalRecipeReferences()); } catch (error) { next(error); } });
app.get("/api/technical-recipes", requireInventoryAdmin, async (_req, res, next) => { try { res.json(await listTechnicalRecipes()); } catch (error) { next(error); } });
app.get("/api/technical-recipes/manual/:area", requireOperationalInventoryUser, async (req,res,next)=>{try{const area=String(req.params.area||"").toUpperCase();if(roleName(req.user)!=="ADMINISTRADOR"&&roleName(req.user)!==area)throw httpError(403,"Solo puedes consultar el manual de tu área");res.json(await operationalRecipeManual(area));}catch(error){next(error);}});
app.get("/api/technical-recipes/sales", requireInventoryAdmin, async (req, res, next) => { try { res.json(await listRecipeSales(req.query.recipeId)); } catch (error) { next(error); } });
app.get("/api/operational-recipes/:area", requireFoodOperationsUser, async (req, res, next) => { try { const area=String(req.params.area||"").toUpperCase(); if(roleName(req.user)!=="ADMINISTRADOR"&&roleName(req.user)!==area) throw httpError(403,"Solo puedes consultar el manual de tu área"); res.json(await operationalRecipeManual(area)); } catch (error) { next(error); } });
app.get("/api/technical-recipes/:id", requireInventoryAdmin, async (req, res, next) => { try { res.json(await getTechnicalRecipe(req.params.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createTechnicalRecipe(req.body, req.user.id)); } catch (error) { next(error); } });
app.put("/api/technical-recipes/:id/versions/:versionId", requireInventoryAdmin, async (req, res, next) => { try { res.json(await updateTechnicalRecipeDraft(req.params.id, req.params.versionId, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes/:id/versions", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createTechnicalRecipeVersion(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes/:id/versions/:versionId/activate", requireInventoryAdmin, async (req, res, next) => { try { res.json(await activateTechnicalRecipeVersion(req.params.id, req.params.versionId, req.user.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes/:id/versions/:versionId/archive", requireInventoryAdmin, async (req, res, next) => { try { res.json(await archiveTechnicalRecipeVersion(req.params.id, req.params.versionId, req.user.id)); } catch (error) { next(error); } });
app.get("/api/transformations/references", requireTransformationUser, async (req, res, next) => { try { res.json(await transformationReferences(req.user)); } catch (error) { next(error); } });
app.get("/api/transformations", requireTransformationUser, async (_req, res, next) => { try { res.json(await listTransformations()); } catch (error) { next(error); } });
app.get("/api/transformations/lots/:lotId/trace", requireTransformationUser, async (req, res, next) => { try { res.json(await traceLot(req.params.lotId)); } catch (error) { next(error); } });
app.post("/api/transformations/processing", requireTransformationUser, async (req, res, next) => { try { res.status(201).json(await completeProcessing(req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/transformations/portioning", requireTransformationUser, async (req, res, next) => { try { res.status(201).json(await completePortioning(req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/transformations/production", requireTransformationUser, async (req, res, next) => { try { res.status(201).json(await completeProduction(req.body, req.user.id)); } catch (error) { next(error); } });
app.get("/api/inventory/production-dashboard", async (req, res, next) => {
  try {
    const state = await readState(); const area = req.query.area || "RESTAURANTE"; const date = req.query.date || now().slice(0, 10);
    const products = state.inventory.filter((item) => item.area === area && isOperationalProduct(item)).map(hydrateProduct);
    const recipes = state.menuItems.filter((item) => item.area === area).map((item) => hydrateMenuItem(state, item));
    const productions = state.productions.filter((item) => item.area === area && String(item.createdAt).slice(0, 10) === date);
    const waste = state.wasteRecords.filter((item) => item.area === area && String(item.createdAt).slice(0, 10) === date);
    const closing = state.inventoryClosings.find((item) => item.area === area && item.date === date) || null;
    res.json({ area, date, products, recipes, productions, waste, closing, metrics: { producedPortions: round(productions.reduce((sum, item) => sum + Number(item.portions || 0), 0)), wasteCost: round(waste.reduce((sum, item) => sum + Number(item.cost || 0), 0)), lowStock: products.filter((item) => item.stockStatus !== "OK").length, pendingCount: closing ? 0 : products.length } });
  } catch (error) { next(error); }
});
app.post("/api/inventory/productions", requireFoodOperationsUser, requireActiveStaffShift, async (req, res, next) => {
  try { const result = await mutateState((state) => { const menu = state.menuItems.find((item) => item.id === Number(req.body.menuItemId) && item.area === req.body.area); if (!menu) throw httpError(404, "Receta no encontrada"); const portions = Math.max(1, Number(req.body.portions || 1)); const ingredients = (menu.recipe || []).map((line) => { const product = state.inventory.find((item) => item.id === line.inventoryId && isOperationalProduct(item)); const quantity = round(Number(line.quantity) * portions); if (!product || Number(product.stock) < quantity) throw httpError(409, `Stock insuficiente de ${product?.name || "ingrediente"}`); return { product, quantity }; }); ingredients.forEach(({ product, quantity }) => { const beforeQty = Number(product.stock); product.stock = round(beforeQty - quantity); state.inventoryMovements.unshift({ id: nextId(state, "movement"), productId: product.id, product: { ...product }, type: "PRODUCCION", quantity, beforeQty, afterQty: product.stock, reason: `${portions} porciones de ${menu.name}`, createdById: req.user.id, createdAt: now() }); }); const item = { id: nextId(state, "production"), area: menu.area, menuItemId: menu.id, menuItemName: menu.name, portions, batch: req.body.batch || `LOT-${Date.now().toString().slice(-6)}`, responsibleId: req.user.id, createdAt: now() }; state.productions.unshift(item); audit(state, "INVENTARIO", "PRODUCCION", `${menu.name}: ${portions} porciones`, req.user.id); return item; }); res.status(201).json(result); } catch (error) { next(error); }
});
app.post("/api/inventory/waste", requireFoodOperationsUser, requireActiveStaffShift, async (req, res, next) => {
  try { const result = await mutateState((state) => { const product = state.inventory.find((item) => item.id === Number(req.body.productId) && item.area === req.body.area && isOperationalProduct(item)); if (!product) throw httpError(404, "Insumo no encontrado o archivado"); const quantity = Number(req.body.quantity || 0); if (quantity <= 0 || quantity > Number(product.stock)) throw httpError(409, "Cantidad de merma no válida"); const beforeQty = Number(product.stock); product.stock = round(beforeQty - quantity); const item = { id: nextId(state, "waste"), area: product.area, productId: product.id, productName: product.name, quantity, unit: product.unit, reason: req.body.reason || "DERRAME", detail: req.body.detail || "", cost: round(quantity * Number(product.cost || 0)), responsibleId: req.user.id, createdAt: now() }; state.wasteRecords.unshift(item); state.inventoryMovements.unshift({ id: nextId(state, "movement"), productId: product.id, product: { ...product }, type: "MERMA", quantity, beforeQty, afterQty: product.stock, reason: item.reason, createdById: req.user.id, createdAt: item.createdAt }); audit(state, "INVENTARIO", "MERMA", `${product.name}: ${quantity} ${product.unit}`, req.user.id); return item; }); res.status(201).json(result); } catch (error) { next(error); }
});
app.post("/api/inventory/daily-close", async (req, res, next) => {
  res.status(410).json({ message: "El cierre diario fue reemplazado por inventarios operativos por área y turno", href: "/inventario/turnos" });
});
app.get("/api/events/spaces", async (_req, res, next) => { try { const state = await readState(); res.json(eventSpaces(state)); } catch (error) { next(error); } });
app.get("/api/configuracion", async (_req, res, next) => { try { const state = await readState(); res.json([state.settings]); } catch (error) { next(error); } });
app.get("/api/caja", requireCashAdmin, async (req, res, next) => { try { if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Solo el Superadmin puede acceder al resumen global de caja."); const state = await readState(); const paymentRows = state.payments.map((item) => ({ ...hydratePayment(state, item), type: "INGRESO" })); const movements = [...state.cashMovements, ...paymentRows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); const income = movements.filter((item) => item.type !== "EGRESO").reduce((sum, item) => sum + Number(item.amount), 0); const expenses = movements.filter((item) => item.type === "EGRESO").reduce((sum, item) => sum + Number(item.amount), 0); res.json({ summary: { income, expenses, balance: round(income - expenses) }, movements }); } catch (error) { next(error); } });

app.get("/api/cash-sessions/current", requireCashAdmin, async (req, res, next) => {
  try {
    const state = await readState();
    // La rendición sigue visible al recepcionista hasta que el Superadmin la revise.
    const session = (state.cashSessions || []).find((item) => item.userId === req.user.id && ["ABIERTA", "EN_REVISION"].includes(item.status));
    res.json(session ? hydrateCashSession(state, session) : null);
  } catch (error) { next(error); }
});

app.get("/api/cash-sessions", requireCashAdmin, async (req, res, next) => {
  try {
    const state = await readState();
    let sessions = state.cashSessions || [];
    if (req.user.displayRole !== "SUPERADMIN") {
      sessions = sessions.filter((item) => item.userId === req.user.id);
    }
    res.json(sessions.map((item) => hydrateCashSession(state, item)));
  } catch (error) { next(error); }
});

app.post("/api/cash-sessions", requireCashAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      state.cashSessions ||= [];
      const date = hotelToday(state);
      const existing = state.cashSessions.find((item) => 
        item.userId === req.user.id && 
        item.date === date && 
        (item.status === "ABIERTA" || item.status === "EN_REVISION")
      );
      if (existing) throw httpError(409, "Ya tienes una sesión abierta o en revisión para el día de hoy.");
      const initialFund = Number(req.body.initialFund || 0);
      const item = {
        id: nextId(state, "cashSession"),
        date,
        userId: req.user.id,
        initialFund,
        expectedCash: initialFund,
        status: "ABIERTA",
        openedAt: now(),
        movements: [] // Will track IDs or just rely on global cashMovements linked by sessionId
      };
      state.cashSessions.unshift(item);
      audit(state, "CAJA", "APERTURA_TURNO", `Fondo S/ ${initialFund}`, req.user.id);
      return item;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post("/api/cash-sessions/:id/submit", requireCashAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const session = (state.cashSessions || []).find((item) => item.id === Number(req.params.id));
      if (!session) throw httpError(404, "Sesión de caja no encontrada.");
      if (req.user.displayRole !== "SUPERADMIN" && session.userId !== req.user.id) {
        throw httpError(403, "Solo puedes enviar a revisión tu propia sesión de caja.");
      }
      if (req.user.displayRole === "SUPERADMIN") {
        throw httpError(403, "SUPERADMIN no debe enviar rendiciones en nombre del Admin desde esta ruta.");
      }
      if (session.status !== "ABIERTA") throw httpError(409, "La sesión no está abierta.");
      
      const actualCash = Number(req.body.actualCash);
      if (!Number.isFinite(actualCash) || actualCash < 0) throw httpError(400, "Ingresa el efectivo físico contado.");
      
      // Calculate expected from movements
      const sessionMovements = (state.cashMovements || []).filter(m => m.sessionId === session.id);
      const cashPayments = (state.payments || []).filter((payment) => payment.sessionId === session.id && payment.method === "EFECTIVO" && payment.status === "APROBADO");
      const income = sessionMovements.filter(m => m.type !== "EGRESO").reduce((acc, m) => acc + Number(m.amount), 0) + cashPayments.reduce((acc, payment) => acc + Number(payment.amount), 0);
      const expenses = sessionMovements.filter(m => m.type === "EGRESO").reduce((acc, m) => acc + Number(m.amount), 0);
      
      session.expectedCash = session.initialFund + income - expenses;
      session.actualCash = round(actualCash);
      session.variance = round(actualCash - session.expectedCash);
      session.notes = String(req.body.notes || "").trim();
      session.status = "EN_REVISION";
      session.submittedAt = now();
      
      audit(state, "CAJA", "ENVIO_RENDICION", `ID ${session.id}: esperado S/ ${session.expectedCash}, contado S/ ${session.actualCash}`, req.user.id);
      return session;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/cash-sessions/:id/status", requireCashAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Solo el Superadmin puede aprobar o rechazar cajas.");
      const session = (state.cashSessions || []).find((item) => item.id === Number(req.params.id));
      if (!session) throw httpError(404, "Sesión de caja no encontrada.");
      if (session.status !== "EN_REVISION") throw httpError(409, "La sesión no está pendiente de revisión.");
      if (req.body.status !== "APROBADA" && req.body.status !== "RECHAZADA") {
        throw httpError(400, "El estado solo puede ser APROBADA o RECHAZADA.");
      }
      
      session.status = req.body.status;
      session.reviewedAt = now();
      session.reviewedById = req.user.id;
      session.reviewNotes = String(req.body.reviewNotes || "").trim();
      if (session.status === "RECHAZADA" && session.reviewNotes.length < 5) throw httpError(400, "Indica el motivo del rechazo de la rendición.");
      
      audit(state, "CAJA", "REVISION_RENDICION", `ID ${session.id}: ${session.status}`, req.user.id);
      return session;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/caja/cierre-diario", requireCashAdmin, async (req, res, next) => { try { if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Solo el Superadmin puede acceder al cierre diario definitivo."); const state = await readState(); const date = hotelToday(state); const summary = cashClosingSummary(state, date); const closure = (state.cashClosings || []).find((item) => item.date === date) || null; res.json({ date, ...summary, closure }); } catch (error) { next(error); } });
app.post("/api/caja/cierre-diario", requireCashAdmin, async (req, res, next) => { try { if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Solo el Superadmin puede realizar el cierre diario definitivo."); const result = await mutateState((state) => { const date = hotelToday(state); state.cashClosings ||= []; const existing = state.cashClosings.find((item) => item.date === date); if (existing) throw httpError(409, "La caja de hoy ya fue cerrada. Revisa el cierre registrado antes de realizar otra acción."); const summary = cashClosingSummary(state, date); const actualCash = Number(req.body.actualCash); if (!Number.isFinite(actualCash) || actualCash < 0) throw httpError(400, "Ingresa el efectivo físico contado para cerrar caja."); const item = { id: nextId(state, "cashClosing"), date, expectedCash: summary.expectedCash, actualCash: round(actualCash), variance: round(actualCash - summary.expectedCash), approvedPayments: summary.approvedPayments, digitalPayments: summary.digitalPayments, cashMovements: summary.cashMovements, notes: String(req.body.notes || "").trim(), status: "CERRADA", closedAt: now(), closedById: req.user.id }; state.cashClosings.unshift(item); audit(state, "CAJA", "CIERRE_DIARIO", `${date}: esperado S/ ${item.expectedCash}, contado S/ ${item.actualCash}`, req.user.id); return item; }); res.status(201).json(result); } catch (error) { next(error); } });

app.get("/api/cleaning/tasks", requireCleaningWorker, async (req, res, next) => { try { const state = await readState(); const rows = state.tasks.filter((item) => (item.assignedEmployeeId == null || Number(item.assignedEmployeeId) === Number(req.user.id)) && (!req.query.status || item.status === req.query.status)); res.json(sortRecent(rows, req.query.order).map((item) => hydrateTask(state, item))); } catch (error) { next(error); } });
app.patch("/api/cleaning/tasks/:id/start", requireCleaningWorker, requireActiveStaffShift, taskStatus("EN_LIMPIEZA"));
app.patch("/api/cleaning/tasks/:id/finish", requireCleaningWorker, requireActiveStaffShift, taskStatus("FINALIZADA"));
app.post("/api/cleaning/tasks/:id/evidence", requireCleaningWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const task = requireOwnedCleaningTask(state, req.params.id, req.user); const files = Array.isArray(req.body.files) ? req.body.files.filter((file) => String(file?.fileUrl || "").trim()) : []; if (!files.length) throw httpError(400, "Adjunta al menos una foto real como evidencia"); const area = String(req.body.area || "").trim().toUpperCase(); if (!["BAÑO", "CUARTO", "REFRI / DESPENSA"].includes(area)) throw httpError(400, "Selecciona el área fotografiada."); const stage = String(req.body.stage || "").trim().toUpperCase(); if (!["ENTRADA", "SALIDA"].includes(stage)) throw httpError(400, "Selecciona si la evidencia corresponde a entrada o salida."); task.evidences ||= []; const sameArea = task.evidences.filter((item) => String(item.area || "").trim().toUpperCase() === area); const entryExists = sameArea.some((item) => String(item.stage || "").toUpperCase() === "ENTRADA" || /entrada/i.test(item.description || item.notes || "")); const sameStageExists = sameArea.some((item) => String(item.stage || "").toUpperCase() === stage || (stage === "SALIDA" ? /salida/i.test(item.description || item.notes || "") : /entrada/i.test(item.description || item.notes || ""))); if (stage === "SALIDA" && !entryExists) throw httpError(409, "Registra primero la evidencia de entrada de esta área."); if (sameStageExists) throw httpError(409, `La evidencia de ${stage.toLowerCase()} para ${area.toLowerCase()} ya fue registrada.`); const entries = files.map((file, index) => ({ id: Date.now() + index, ...file, area, stage, description: req.body.description || `${stage}: Evidencia`, createdAt: now(), uploadedById: req.user.id })); task.evidences.push(...entries); audit(state, "LIMPIEZA", "EVIDENCIA", task.code, req.user.id); return hydrateTask(state, task); }); res.status(201).json(result); } catch (error) { next(error); } });
app.post("/api/cleaning/tasks/:id/report", requireCleaningWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const task = requireOwnedCleaningTask(state, req.params.id, req.user); const room = state.rooms.find((item) => Number(item.id) === Number(task.roomId)) || task.room; const requiresMaintenance = ["MANTENIMIENTO", "DANO_INFRAESTRUCTURA", "DANO_EQUIPO"].includes(req.body.type);
  const report = createReport(state, {
    ...req.body,
    area: "LIMPIEZA",
    roomId: task.roomId,
    location: `Habitación ${room?.number || task.roomId}`,
    requiresMaintenance,
    requiresReceptionAcceptance: requiresMaintenance,
    reportedFrom: "LIMPIEZA",
    reportedById: req.user.id,
    reportedByName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
    cleaningTaskId: task.id
  });
  task.operationalReports ||= []; task.operationalReports.unshift(report);
  audit(state, "LIMPIEZA", requiresMaintenance ? "REPORTAR_DANO_MANTENIMIENTO" : "REPORTAR_INCIDENCIA", `${task.code}: ${report.code}`, req.user.id);
  return report;
}); res.status(201).json(result); } catch (error) { next(error); } });

// Estación de Mantenimiento: consume los mismos reportes operativos, sin crear
// una segunda entidad de trabajo ni dar acceso al ERP administrativo.
app.get("/api/maintenance/reports", requireMaintenanceWorker, async (req, res, next) => { try { const state = await readState(); const rows = state.requests.filter((item) => item.requiresMaintenance && Number(item.assignedMaintenanceEmployeeId) === Number(req.user.id) && (!item.requiresReceptionAcceptance || item.receptionAcceptedAt)); res.json(sortRecent(rows, req.query.order)); } catch (error) { next(error); } });
app.patch("/api/maintenance/reports/:id/start", requireMaintenanceWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const report = requireOwnedMaintenanceReport(state, req.params.id, req.user); if (report.requiresReceptionAcceptance && !report.receptionAcceptedAt) throw httpError(409, "Recepción debe aceptar esta solicitud del huésped antes de iniciar el trabajo."); if (!["ABIERTO", "PENDIENTE"].includes(report.status)) throw httpError(409, "Este trabajo ya no está pendiente."); report.status = "EN_REPARACION"; report.startedAt = now(); report.assignedMaintenanceEmployeeId = req.user.id; report.assignedMaintenanceTo = `${req.user.firstName} ${req.user.lastName}`.trim(); report.assignedTo = { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName }; audit(state, "MANTENIMIENTO", "INICIAR", report.code, req.user.id); return report; }); res.json(result); } catch (error) { next(error); } });
app.post("/api/maintenance/reports/:id/evidence", requireMaintenanceWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const report = requireOwnedMaintenanceReport(state, req.params.id, req.user); if (report.status !== "EN_REPARACION") throw httpError(409, "Inicia la reparación antes de registrar evidencias."); const files = Array.isArray(req.body.files) ? req.body.files.filter((file) => String(file?.fileUrl || "").trim()) : []; if (!files.length) throw httpError(400, "Adjunta al menos una foto real como evidencia."); const stage = String(req.body.stage || "").trim().toUpperCase(); if (!["ANTES", "DESPUES"].includes(stage)) throw httpError(400, "Indica si la foto es anterior o posterior a la reparación."); report.evidences ||= []; if (report.evidences.some((item) => String(item.stage || "").toUpperCase() === stage)) throw httpError(409, `La evidencia ${stage === "ANTES" ? "inicial" : "final"} ya fue registrada.`); report.evidences.push(...files.map((file, index) => ({ id: Date.now() + index, ...file, stage, description: String(req.body.description || "").trim(), createdAt: now(), uploadedById: req.user.id, area: "MANTENIMIENTO" }))); audit(state, "MANTENIMIENTO", `EVIDENCIA_${stage}`, report.code, req.user.id); return report; }); res.status(201).json(result); } catch (error) { next(error); } });
app.patch("/api/maintenance/reports/:id/finish", requireMaintenanceWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const report = requireOwnedMaintenanceReport(state, req.params.id, req.user); if (report.status !== "EN_REPARACION") throw httpError(409, "Inicia el trabajo antes de finalizarlo."); const stages = new Set((report.evidences || []).map((item) => String(item.stage || "").toUpperCase())); if (!stages.has("ANTES") || !stages.has("DESPUES")) throw httpError(409, "Registra las fotos antes y después de la reparación antes de finalizar."); const finalEvidence = (report.evidences || []).find((item) => String(item.stage || "").toUpperCase() === "DESPUES"); const workDescription = String(req.body.workDescription || finalEvidence?.description || "Reparación finalizada con evidencia.").trim(); const observations = String(req.body.observations || "").trim(); Object.assign(report, { status: "SOLUCIONADO", workDescription, observations, resolvedAt: now(), resolvedById: req.user.id }); audit(state, "MANTENIMIENTO", "FINALIZAR", report.code, req.user.id); return report; }); res.json(result); } catch (error) { next(error); } });
// Consola de Recepción: el personal operativo no entra al ERP. Las fotos y
// mensajes recibidos por WhatsApp se registran aquí con trazabilidad.
app.get("/api/reception/tasks", requireReceptionAdmin, async (req, res, next) => { try { const state = await readState(); res.json(sortRecent(state.tasks.filter((item) => !req.query.status || item.status === req.query.status), req.query.order).map((item) => hydrateTask(state, item))); } catch (error) { next(error); } });
app.get("/api/reception/cleaning-employees", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); const rows = availableOperationalEmployees(state, "LIMPIEZA").map(toOperationalEmployee); res.json(rows); } catch (error) { next(error); } });
app.get("/api/reception/maintenance-employees", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); const rows = availableOperationalEmployees(state, "MANTENIMIENTO").map(toOperationalEmployee); res.json(rows); } catch (error) { next(error); } });
app.patch("/api/reception/reports/:id/assign-maintenance", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const report = state.requests.find((item) => item.id === Number(req.params.id) && item.requiresMaintenance); if (!report) throw httpError(404, "Incidencia de mantenimiento no encontrada."); if (["RESUELTO", "SOLUCIONADO"].includes(report.status)) throw httpError(409, "No puedes reasignar una incidencia resuelta."); const employeeId = Number(req.body.employeeId); const employee = state.employees.find((item) => Number(item.id) === employeeId); if (!employee || roleName(employee) !== "MANTENIMIENTO" || !isOperationalEmployeeAvailable(state, employee, "MANTENIMIENTO") && Number(report.assignedMaintenanceEmployeeId) !== employeeId) throw httpError(409, "Selecciona un trabajador de Mantenimiento disponible y con asistencia registrada."); const acceptedAt = report.receptionAcceptedAt || now(); Object.assign(report, { assignedMaintenanceEmployeeId: employee.id, assignedMaintenanceTo: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(), assignedAt: now(), assignedById: req.user.id, receptionAcceptedAt: acceptedAt, receptionAcceptedById: req.user.id, updatedAt: now() }); audit(state, "MANTENIMIENTO", report.requiresReceptionAcceptance ? "ACEPTAR_Y_ASIGNAR" : "ASIGNAR", `${report.code}: ${report.assignedMaintenanceTo}`, req.user.id); return report; }); res.json(result); } catch (error) { next(error); } });
app.patch("/api/reception/tasks/:id/assign", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const task = state.tasks.find((item) => item.id === Number(req.params.id)); if (!task) throw httpError(404, "Tarea no encontrada"); if (task.status === "FINALIZADA") throw httpError(409, "No puedes reasignar una tarea finalizada"); const employeeId = Number(req.body.employeeId); const employee = state.employees.find((item) => Number(item.id) === employeeId); if (!employee || roleName(employee) !== "LIMPIEZA" || !isOperationalEmployeeAvailable(state, employee, "LIMPIEZA") && Number(task.assignedEmployeeId) !== employeeId) throw httpError(409, "Selecciona un trabajador de Limpieza disponible y con asistencia registrada."); const acceptedAt = task.receptionAcceptedAt || now(); Object.assign(task, { assignedEmployeeId: employee.id, assignedTo: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(), assignedAt: now(), assignedById: req.user.id, assignedVia: "SISTEMA", receptionAcceptedAt: acceptedAt, receptionAcceptedById: req.user.id, updatedAt: now() }); const sourceRequest = state.requests.find((item) => Number(item.id) === Number(task.requestId)); if (sourceRequest) Object.assign(sourceRequest, { status: "ASIGNADO", receptionAcceptedAt: acceptedAt, receptionAcceptedById: req.user.id, updatedAt: now() }); audit(state, "HABITACIONES", task.requiresReceptionAcceptance ? "ACEPTAR_Y_ASIGNAR_LIMPIEZA" : "ASIGNAR_LIMPIEZA", `${task.code}: ${task.assignedTo}`, req.user.id); return hydrateTask(state, task); }); res.json(result); } catch (error) { next(error); } });
app.patch("/api/reception/tasks/:id/start", requireReceptionAdmin, receptionTaskStatus("EN_LIMPIEZA"));
app.patch("/api/reception/tasks/:id/finish", requireReceptionAdmin, receptionTaskStatus("FINALIZADA"));
app.post("/api/reception/tasks/:id/evidence", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const task = state.tasks.find((item) => item.id === Number(req.params.id)); if (!task) throw httpError(404, "Tarea no encontrada"); const stage = req.body.stage === "SALIDA" ? "SALIDA" : "ENTRADA"; const files = Array.isArray(req.body.files) ? req.body.files : []; if (!files.length) throw httpError(400, "Adjunta la evidencia recibida por WhatsApp"); task.evidences ||= []; task.evidences.push(...files.map((file, index) => ({ id: Date.now() + index, ...file, stage, description: `${stage === "ENTRADA" ? "Evidencia de entrada" : "Evidencia de salida"} · WhatsApp: ${String(req.body.description || "Sin detalle").trim()}`, receivedVia: "WHATSAPP", registeredById: req.user.id, createdAt: now() }))); task.updatedAt = now(); audit(state, "HABITACIONES", `EVIDENCIA_${stage}`, task.code, req.user.id); return hydrateTask(state, task); }); res.status(201).json(result); } catch (error) { next(error); } });
app.post(
  ["/api/cleaning/evidence/upload", "/api/reports/evidence/upload"],
  requireCleaningEvidenceUploader,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "10mb" }),
  async (req, res, next) => {
    try {
      const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
      const mimeType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
      const extension = extensions[mimeType];
      if (!extension) throw httpError(415, "Formato no permitido. Usa JPG, PNG o WEBP");
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, "La evidencia está vacía");
      await mkdir(cleaningUploadDir, { recursive: true });
      const storedName = `${Date.now()}-${randomUUID()}${extension}`;
      await writeFile(join(cleaningUploadDir, storedName), req.body, { flag: "wx" });
      const originalName = decodeURIComponent(String(req.headers["x-file-name"] || `evidencia${extension}`)).slice(0, 160);
      const fileUrl = `/uploads/cleaning/${storedName}`;
      res.status(201).json({ files: [{ fileUrl, imageUrl: fileUrl, fileName: originalName, name: originalName, mimeType, size: req.body.length }] });
    } catch (error) { next(error); }
  }
);
app.get("/demo-evidence.svg", (_req, res) => { res.type("svg").send(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="100%" height="100%" fill="#e7f4ec"/><rect x="80" y="80" width="480" height="260" rx="28" fill="#0f3d2e"/><text x="320" y="195" text-anchor="middle" fill="#f5a623" font-size="34" font-family="Arial" font-weight="700">PARK PLAZA</text><text x="320" y="245" text-anchor="middle" fill="white" font-size="22" font-family="Arial">Evidencia operativa demo</text></svg>`); });

app.post("/api/reports", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => createReport(state, req.body)); res.status(201).json(result); } catch (error) { next(error); } });
app.patch("/api/reports/:id/status", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const report = state.requests.find((item) => item.id === Number(req.params.id)); if (!report) throw httpError(404, "Reporte no encontrado"); Object.assign(report, req.body, { updatedAt: now() }); if (req.body.status === "EN_REVISION") { report.startedAt ||= now(); report.assignedToId = req.user.id; report.assignedTo = { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName }; } if (req.body.status === "RESUELTO") { report.resolvedAt = now(); report.resolvedById = req.user.id; report.resolvedBy = { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName }; } audit(state, "REPORTES", "ESTADO", `${report.code}: ${report.status}`, req.user.id); return report; }); res.json(result); } catch (error) { next(error); } });
app.post("/api/reports/:id/evidence", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const report = state.requests.find((item) => item.id === Number(req.params.id)); if (!report) throw httpError(404, "Reporte no encontrado"); report.evidences ||= []; report.evidences.push(...(req.body.files || [])); return report; }); res.status(201).json(result); } catch (error) { next(error); } });

app.get("/api/inventory/movements", requireFullAdministration("consultar movimientos globales de inventario"), async (req, res, next) => { try { const state = await readState(); res.json(sortRecent(state.inventoryMovements.filter((item) => (!req.query.area || item.product?.area === req.query.area) && (!req.query.productId || item.productId === Number(req.query.productId)) && (!req.query.type || item.type === req.query.type)), req.query.order)); } catch (error) { next(error); } });
app.post(["/api/inventory/entries", "/api/inventory/exits", "/api/inventory/adjustments"], requireFullAdministration("ajustar inventario global"), async (req, res, next) => { try { const movement = await mutateState((state) => { const product = state.inventory.find((item) => item.id === Number(req.body.productId)); if (!product) throw httpError(404, "Producto no encontrado"); const beforeQty = Number(product.stock); const type = req.path.endsWith("entries") ? "ENTRADA" : req.path.endsWith("exits") ? "SALIDA" : "AJUSTE"; const quantity = Number(req.body.quantity); const afterQty = type === "ENTRADA" ? beforeQty + quantity : type === "SALIDA" ? beforeQty - quantity : quantity; if (afterQty < 0) throw httpError(409, "Stock insuficiente"); product.stock = round(afterQty); if (req.body.cost) product.cost = Number(req.body.cost); const item = { id: nextId(state, "movement"), productId: product.id, product: { ...product }, type, quantity, beforeQty, afterQty: product.stock, reason: req.body.reason || "Movimiento manual", reference: req.body.reference || "", createdById: req.user.id, createdAt: now() }; state.inventoryMovements.unshift(item); audit(state, "INVENTARIO", type, product.name, req.user.id); return item; }); res.status(201).json(movement); } catch (error) { next(error); } });

app.post("/api/cochera/entries", async (req, res, next) => { try { const result = await mutateState((state) => { const space = state.cochera.find((item) => item.id === Number(req.body.spaceId)); if (!space || space.status === "OCUPADO") throw httpError(409, "Espacio no disponible"); const entry = { id: Date.now(), ...req.body, spaceId: space.id, clientId: req.body.clientId ? Number(req.body.clientId) : null, startedAt: now(), status: "ACTIVO" }; space.status = "OCUPADO"; space.entries = [hydrateParkingEntry(state, entry)]; audit(state, "COCHERA", "INGRESO", `${space.code} ${entry.plate}`, req.user.id); return space; }); res.status(201).json(result); } catch (error) { next(error); } });
app.patch("/api/cochera/entries/:id/finish", async (req, res, next) => { try { const result = await mutateState((state) => { const space = state.cochera.find((item) => item.entries?.some((entry) => entry.id === Number(req.params.id))); if (!space) throw httpError(404, "Ingreso vehicular no encontrado"); const entry = space.entries.find((item) => item.id === Number(req.params.id)); entry.status = "FINALIZADO"; entry.finishedAt = now(); space.entries = []; space.status = "LIBRE"; audit(state, "COCHERA", "SALIDA", space.code, req.user.id); return space; }); res.json(result); } catch (error) { next(error); } });

app.patch("/api/compras/:id/receive", (_req, res) => res.status(410).json({ message: "La recepción automática fue retirada: registra cantidades físicas en Compras y recepción.", endpoint: "/api/purchasing/orders/:id/receipts" }));
app.post("/api/compras", (_req, res) => res.status(410).json({ message: "Usa el flujo trazable de órdenes de compra.", endpoint: "/api/purchasing/orders" }));

app.post("/api/caja/movements", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const activeSession = (state.cashSessions || []).find(s => s.userId === req.user.id && s.status === "ABIERTA"); const sessionId = activeSession ? activeSession.id : null; const item = { id: Date.now(), ...req.body, amount: Number(req.body.amount), createdAt: now(), sessionId }; state.cashMovements.unshift(item); audit(state, "CAJA", item.type, item.concept, req.user.id); return item; }); res.status(201).json(result); } catch (error) { next(error); } });
app.put("/api/configuracion", requireFullAdministration("editar la configuración global"), async (req, res, next) => { try { const result = await mutateState((state) => { state.settings = { ...state.settings, ...req.body, taxRate: Number(req.body.taxRate ?? state.settings.taxRate), updatedAt: now() }; audit(state, "CONFIGURACION", "EDITAR", "Parametros del hotel", req.user.id); return state.settings; }); res.json(result); } catch (error) { next(error); } });

app.post("/api/events", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => createEvent(state, req.body, req.user.id)); res.status(201).json(result); } catch (error) { next(error); } });
app.put("/api/events/:id", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const item = state.events.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Evento no encontrado"); const space = eventSpaces(state).find((row) => row.id === Number(req.body.spaceId)); const client = state.clients.find((row) => row.id === Number(req.body.clientId)); const conflict = state.events.some((row) => row.id !== item.id && row.spaceId === space.id && row.status !== "CANCELADO" && overlaps(req.body.startsAt, req.body.endsAt, row.startsAt, row.endsAt)); if (conflict) throw httpError(409, "El espacio ya esta reservado en ese horario"); Object.assign(item, req.body, { clientId: client.id, client, spaceId: space.id, space, price: Number(req.body.price), advance: Number(req.body.advance), balance: round(Number(req.body.price) - Number(req.body.advance)), updatedAt: now() }); audit(state, "EVENTOS", "EDITAR", item.code, req.user.id); return item; }); res.json(result); } catch (error) { next(error); } });
app.patch("/api/events/:id/status", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const item = state.events.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Evento no encontrado"); item.status = req.body.status; item.updatedAt = now(); audit(state, "EVENTOS", "ESTADO", `${item.code}: ${item.status}`, req.user.id); return item; }); res.json(result); } catch (error) { next(error); } });
app.post("/api/events/:id/payments", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState(async (state,client) => { const item = state.events.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Evento no encontrado"); const amount = Number(req.body.amount); if (amount <= 0 || amount > item.balance) throw httpError(409, "Monto de pago no valido"); const payment = attachCashSession(state, { id: nextId(state, "payment"), eventId: item.id, clientId: item.clientId, amount, method: req.body.method || "EFECTIVO", reference: req.body.reference || "", concept: `Pago evento ${item.name}`, area: "EVENTOS", status: "APROBADO", createdAt: now() }, req.user.id); state.payments.push(payment); item.advance = round(Number(item.advance) + amount); item.balance = round(Number(item.price) - item.advance); const before=new Set(state.orders.map((order)=>order.id));if (item.balance <= 0) { item.status = "CONFIRMADO"; createEventCateringOrder(state, item); }await confirmOrdersInventory(client,state,state.orders.filter((order)=>!before.has(order.id)),req.user.id);audit(state, "PAGOS", "EVENTO", item.code, req.user.id); return hydratePayment(state, payment); }); res.status(201).json(result); } catch (error) { next(error); } });

app.post("/api/pagos", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState(async (state,client) => {const before=new Set(state.orders.map((order)=>order.id));const payment=registerPayment(state,req.body,req.user.id);await confirmOrdersInventory(client,state,state.orders.filter((order)=>!before.has(order.id)),req.user.id);return payment;}); res.status(201).json(result); } catch (error) { next(error); } });
app.get("/api/facturacion/configuration", requireBillingAccess("canView", "consultar facturación electrónica"), (req, res) => {
  res.json({ ...electronicBillingConfiguration(), access: electronicBillingAccess(req.user) });
});
app.post("/api/facturacion", requireBillingAccess("canIssue", "emitir comprobantes"), async (req, res, next) => {
  try {
    const result = await mutateState(async (state) => {
      const document = await issueElectronicDocument(state, req.body, req.user.id, () => nextId(state, "invoice"));
      audit(state, "FACTURACION", "EMITIR", `${document.fullNumber} · ${document.status} · pago #${document.paymentId}`, req.user.id);
      return hydrateInvoice(state, document);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
app.post("/api/facturacion/:id/retry", requireBillingAccess("canRetry", "reintentar comprobantes"), async (req, res, next) => {
  try {
    const result = await mutateState(async (state) => {
      const document = state.facturacion.find((item) => Number(item.id) === Number(req.params.id));
      if (!document) throw httpError(404, "Comprobante no encontrado");
      await retryElectronicDocument(document);
      audit(state, "FACTURACION", "REINTENTAR", `${document.fullNumber || `${document.series}-${document.number}`} · ${document.status}`, req.user.id);
      return hydrateInvoice(state, document);
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.get("/api/facturacion/:id/download/:kind", requireBillingAccess("canDownload", "descargar archivos de comprobantes"), async (req, res, next) => {
  try {
    const state = await readState();
    const document = state.facturacion.find((item) => Number(item.id) === Number(req.params.id));
    if (!document) throw httpError(404, "Comprobante no encontrado");
    const artifact = electronicDocumentArtifact(document, String(req.params.kind || "").toLowerCase());
    res.set("Content-Type", artifact.contentType);
    res.set("Content-Disposition", `attachment; filename="${artifact.filename}"`);
    res.send(artifact.body);
  } catch (error) { next(error); }
});

app.post("/api/usuarios", requireFullAdministration("crear usuarios"), async (req, res, next) => { try { const result = await mutateState((state) => saveUser(state, null, req.body, req.user.id)); res.status(201).json(result); } catch (error) { next(error); } });
app.put("/api/usuarios/:id", requireFullAdministration("editar usuarios"), async (req, res, next) => { try { const result = await mutateState((state) => saveUser(state, Number(req.params.id), req.body, req.user.id)); res.json(result); } catch (error) { next(error); } });
app.patch("/api/usuarios/:id/status", requireInventoryAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const user = state.users.find((item) => item.id === Number(req.params.id)); if (!user) throw httpError(404, "Trabajador no encontrado"); const status = String(req.body.status || "").toUpperCase(); if (!["ACTIVO", "INACTIVO"].includes(status)) throw httpError(400, "Estado no válido"); if (user.id === req.user.id && status !== "ACTIVO") throw httpError(409, "No puedes desactivar tu propia cuenta"); user.status = status; user.updatedAt = now(); const employee = state.employees.find((item) => item.id === user.id); if (employee) Object.assign(employee, { status, updatedAt: user.updatedAt }); audit(state, "USUARIOS", status === "ACTIVO" ? "REACTIVAR" : "ARCHIVAR", user.email, req.user.id); return hydrateUser(state, user); }); res.json(result); } catch (error) { next(error); } });
app.put("/api/roles/:id/permissions", requireFullAdministration("cambiar permisos"), async (req, res, next) => { try { const result = await mutateState((state) => { const role = state.roles.find((item) => item.id === Number(req.params.id)); if (!role) throw httpError(404, "Rol no encontrado"); const catalog = state.roles.find((item) => item.name === "ADMINISTRADOR")?.permissions || []; role.permissions = catalog.filter((permission) => req.body.permissionIds.map(Number).includes(permission.id)); state.users.filter((user) => user.role === role.name).forEach((user) => { user.permissions = role.permissions.map((permission) => permission.code); }); audit(state, "ROLES", "PERMISOS", role.name, req.user.id); return hydrateRole(role); }); res.json(result); } catch (error) { next(error); } });

app.post("/api/pool", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const client = state.clients.find((item) => item.id === Number(req.body.clientId)); if (!client) throw httpError(404, "Cliente no encontrado"); const id = Date.now(); const entry = { id, qrCode: `MAN-${String(id).slice(-6)}`, clientId: client.id, client, type: req.body.type || "HUESPED", people: Number(req.body.people || 1), status: "ACTIVO", enteredAt: now(), employeeId: req.user.id }; state.poolEntries.unshift(entry); audit(state, "PISCINA", "INGRESO_MANUAL", `${entry.people} personas`, req.user.id); return entry; }); res.status(201).json(result); } catch (error) { next(error); } });
app.patch("/api/pool/:id/finish", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const entry = state.poolEntries.find((item) => item.id === Number(req.params.id)); if (!entry) throw httpError(404, "Ingreso no encontrado"); entry.status = "FINALIZADO"; entry.finishedAt = now(); return entry; }); res.json(result); } catch (error) { next(error); } });
app.get("/api/pool/reports", requireReceptionAdmin, async (req, res, next) => { try { const state = await readState(); res.json(sortRecent(state.poolReports, req.query.order)); } catch (error) { next(error); } });
app.post("/api/pool/reports", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const item = { id: Date.now(), ...req.body, clientId: Number(req.body.clientId || 0) || null, status: "PENDIENTE", createdAt: now() }; state.poolReports.unshift(item); audit(state, "PISCINA", "REPORTE", item.description, req.user.id); return item; }); res.status(201).json(result); } catch (error) { next(error); } });
app.get("/api/attendance", requireFullAdministration("consultar asistencia global"), async (req, res, next) => { try { const state = await readState(); res.json(sortRecent(state.attendance || [], req.query.order)); } catch (error) { next(error); } });
app.get("/api/attendance/lookup/:documentNumber", attendanceClockRateLimit, async (req, res, next) => {
  try {
    const documentNumber = String(req.params.documentNumber || "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(documentNumber)) throw httpError(400, "DNI inválido.");
    const state = await readState();
    const employee = findActiveClockEmployee(state, documentNumber);
    if (!employee) throw httpError(404, "No existe un trabajador activo con este DNI.");
    res.json({
      documentNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position || employee.operationalArea || employee.baseRole || employee.role,
      photoUrl: employee.photoUrl || null
    });
  } catch (error) { next(error); }
});
app.post("/api/attendance/clock", attendanceClockRateLimit, async (req, res, next) => {
  try {
    const documentNumber = String(req.body.documentNumber || "").replace(/\D/g, "");
    const pin = String(req.body.pin || "");
    if (!/^\d{8}$/.test(documentNumber) || !/^\d{4}$/.test(pin)) throw httpError(400, "Ingresa tu DNI y PIN de 4 dígitos.");
    const result = await mutateState(async (state, client) => {
      const employee = findActiveClockEmployee(state, documentNumber);
      if (!employee) throw httpError(404, "No existe un trabajador activo con este DNI.");
      if (!verifyAttendancePin(pin, employee)) throw httpError(401, "DNI o PIN incorrecto.");
      const today = hotelToday(state);
      const open = [...state.attendance].reverse().find((row) => Number(row.employeeId || row.userId) === Number(employee.id) && attendanceDateOf(row) === today && (row.checkIn || row.clockIn) && !(row.checkOut || row.clockOut));
      const action = open ? "SALIDA" : "INGRESO";
      const record = await recordAttendance(state, client, employee.id, action, employee.id);
      return { success: true, user: `${employee.firstName} ${employee.lastName}`.trim(), worker: { firstName: employee.firstName, lastName: employee.lastName, position: employee.position || employee.operationalArea || employee.baseRole || employee.role, photoUrl: employee.photoUrl || null }, action: action === "INGRESO" ? "CHECK_IN" : "CHECK_OUT", record, operationalSessionId: record.operationalSessionId || null };
    });
    attendanceAttempts.delete(attendanceAttemptKey(req));
    res.json(result);
  } catch (error) { next(error); }
});



const resourceMap = { clients: "clients", events: "events", eventos: "events", restaurante: "orders", bartender: "orders", cleaning: "tasks", products: "inventory", proveedores: "proveedores", compras: "compras", orders: "orders", cochera: "cochera", pagos: "payments", facturacion: "facturacion", auditoria: "audit", usuarios: "users", roles: "roles", pool: "poolEntries", requests: "requests" };
const resourceRoles = {
  clients: ["SUPERADMIN", "ADMINISTRADOR"], events: ["SUPERADMIN", "ADMINISTRADOR"], eventos: ["SUPERADMIN", "ADMINISTRADOR"],
  restaurante: ["SUPERADMIN", "ADMINISTRADOR", "RESTAURANTE"], bartender: ["SUPERADMIN", "ADMINISTRADOR", "BARTENDER"],
  cleaning: ["SUPERADMIN", "ADMINISTRADOR"], products: ["SUPERADMIN"], proveedores: ["SUPERADMIN"], compras: ["SUPERADMIN"],
  orders: ["SUPERADMIN", "ADMINISTRADOR"], cochera: ["SUPERADMIN", "ADMINISTRADOR"], pagos: ["SUPERADMIN", "ADMINISTRADOR"],
  facturacion: ["SUPERADMIN", "ADMINISTRADOR"], auditoria: ["SUPERADMIN"], usuarios: ["SUPERADMIN"], roles: ["SUPERADMIN"], pool: ["SUPERADMIN", "ADMINISTRADOR"], requests: ["SUPERADMIN", "ADMINISTRADOR"]
};
function requireResourceRole(req, resource) { if (!resourceRoles[resource]?.includes(staffAccessRole(req.user))) throw httpError(403, "No tienes permisos para este recurso."); }
app.get("/api/:resource", async (req, res, next) => { try { const state = await readState(); const key = resourceMap[req.params.resource]; if (!key) return res.status(404).json({ message: "Recurso no encontrado" }); requireResourceRole(req, req.params.resource); let rows = state[key]; if (["restaurante", "bartender"].includes(req.params.resource)) rows = rows.filter((item) => item.area === req.params.resource.toUpperCase()); if (req.params.resource === "products" && req.query.includeArchived !== "true") rows = rows.filter(isOperationalProduct); if (req.query.status) rows = rows.filter((item) => item.status === req.query.status); if (["clients", "events", "orders", "payments", "requests", "tasks", "facturacion", "cashMovements", "poolEntries", "compras", "audit"].includes(key)) rows = sortRecent(rows, req.query.order); const hydrators = { restaurante: (item) => hydrateOrder(state, item), bartender: (item) => hydrateOrder(state, item), orders: (item) => hydrateOrder(state, item), products: (item) => hydrateProduct(item), pagos: (item) => hydratePayment(state, item), facturacion: (item) => hydrateInvoice(state, item), usuarios: (item) => hydrateUser(state, item), roles: (item) => hydrateRole(item), auditoria: (item) => ({ ...item, user: state.users.find((user) => user.id === item.userId) ? safeStaffUser(state, state.users.find((user) => user.id === item.userId)) : null }), compras: (item) => ({ ...item, supplier: state.proveedores.find((supplier) => supplier.id === Number(item.supplierId)) }), cochera: (item) => ({ ...item, entries: (item.entries || []).map((entry) => hydrateParkingEntry(state, entry)) }) }; res.json(rows.map(hydrators[req.params.resource] || ((item) => item))); } catch (error) { next(error); } });
app.post("/api/:resource", async (req, res, next) => { try { const key = resourceMap[req.params.resource]; if (!key) return res.status(404).json({ message: "Recurso no encontrado" }); requireResourceRole(req, req.params.resource); const item = await mutateState(async (state, client) => { const id = Math.max(0, ...state[key].map((row) => Number(row.id) || 0)) + 1; let value = { id, ...req.body, createdAt: now() }; if (["restaurante", "bartender", "orders"].includes(req.params.resource)) { value.items = (value.items || []).map(entry => { const found = state.menuItems.find(m => Number(m.id) === Number(entry.menuItemId)) || state.menuItems.find(m => m.code === entry.code); return found ? { ...entry, menuItemId: found.id, name: found.name, price: Number(found.price), area: found.area, recipe: found.recipe || [] } : entry; }); value.code = value.code || code("PED", id); value.area ||= req.params.resource === "bartender" ? "BARTENDER" : req.params.resource === "restaurante" ? "RESTAURANTE" : value.area; validateOrderSchema(state, value); } if (req.params.resource === "products") value = { ...value, categoryId: Number(req.body.categoryId || 1), stock: Number(req.body.stock || 0), reserved: 0, minStock: Number(req.body.minStock || 0), cost: Number(req.body.cost || 0), price: Number(req.body.price || 0) }; if (req.params.resource === "compras") value = { ...value, supplierId: Number(req.body.supplierId), items: (req.body.items || []).map((line) => ({ ...line, productId: Number(line.productId), quantity: Number(line.quantity), cost: Number(line.cost) })), total: round((req.body.items || []).reduce((sum, line) => sum + Number(line.quantity) * Number(line.cost), 0)), status: "PENDIENTE" }; state[key].push(value); audit(state, req.params.resource.toUpperCase(), "CREAR", String(value.name || value.code || value.id), req.user.id); if (["restaurante", "bartender", "orders"].includes(req.params.resource)) { await confirmOrdersInventory(client, state, [value], req.user.id); } return value; }); res.status(201).json(item); } catch (error) { next(error); } });
app.all("/api/*", (req, res) => res.status(404).json({ message: `La operacion ${req.method} ${req.path} aun no existe` }));

app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ message: error.status ? error.message : "Error interno del servidor", fieldErrors: error.fieldErrors, details: process.env.NODE_ENV === "production" ? undefined : error.stack }); });

async function clientAuth(req, res, next) { try { const payload = jwt.verify(req.headers.authorization?.replace(/^Bearer\s+/i, "") || "", jwtSecret); if (payload.kind !== "CLIENT") throw new Error(); const state = await readState(); req.client = state.clients.find((item) => item.id === Number(payload.sub)); if (!req.client || ["BLOQUEADO", "INACTIVO"].includes(req.client.status)) throw new Error(); next(); } catch { res.status(401).json({ message: "Identificación del cliente no válida o cuenta deshabilitada" }); } }
async function biometricBridgeAuth(req, res, next) {
  try {
    const state = await readState();
    const configuredKey = String(state.settings?.biometric?.bridgeKey || "");
    const receivedKey = String(req.headers["x-biometric-key"] || "");
    if (!state.settings?.biometric?.enabled || !configuredKey || receivedKey !== configuredKey) throw new Error();
    next();
  } catch { res.status(401).json({ message: "Puente biométrico no autorizado o no configurado" }); }
}
async function staffAuth(req, res, next) { try { const payload = jwt.verify(req.headers.authorization?.replace(/^Bearer\s+/i, "") || "", jwtSecret); if (payload.kind !== "STAFF") throw new Error(); const state = await readState(); const identity = state.users.find((item) => item.id === Number(payload.sub)); if (!identity || identity.status !== "ACTIVO") throw new Error(); const safeIdentity = safeStaffUser(state, identity); req.user = safeIdentity.role === "SUPERADMIN" ? { ...safeIdentity, role: "ADMINISTRADOR", displayRole: "SUPERADMIN" } : safeIdentity; next(); } catch { void writeSecurityAudit({ req, eventType: "AUTH_REJECTED", operation: "STAFF_AUTH", reason: "Token inválido, expirado o cuenta deshabilitada", status: 401 }); res.status(401).json({ message: "Sesión no válida o expirada" }); } }
function roleName(user) { return normalizeStaffRole(typeof user?.role === "string" ? user.role : user?.role?.name); }
function isOperationalEmployeeAvailable(state, employee, role) {
  if (!employee || roleName(employee) !== role || employee.status !== "ACTIVO") return false;
  const today = hotelToday(state);
  const isOnShift = state.attendance.some((item) => Number(item.employeeId || item.userId) === Number(employee.id) && attendanceDateOf(item) === today && (item.checkIn || item.clockIn) && !(item.checkOut || item.clockOut));
  if (!isOnShift) return false;
  if (role === "LIMPIEZA") return !state.tasks.some((task) => Number(task.assignedEmployeeId) === Number(employee.id) && ["EN_LIMPIEZA", "EN_ATENCION"].includes(task.status));
  return !state.requests.some((report) => Number(report.assignedMaintenanceEmployeeId) === Number(employee.id) && ["EN_REVISION", "EN_REPARACION"].includes(report.status));
}
function availableOperationalEmployees(state, role) {
  return state.employees.filter((employee) => isOperationalEmployeeAvailable(state, employee, role)).sort((a, b) => Number(a.id) - Number(b.id));
}
function toOperationalEmployee(employee) { return { id: employee.id, firstName: employee.firstName, lastName: employee.lastName, name: `${employee.firstName || ""} ${employee.lastName || ""}`.trim() }; }
function availableOperationalEmployee(state, role) { return availableOperationalEmployees(state, role)[0] || null; }
function guarded(operation, roles, message) { return async (req, res, next) => { if (!roles.includes(roleName(req.user))) { void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation, reason: `Rol ${roleName(req.user) || "SIN_ROL"} no autorizado`, status: 403 }); return res.status(403).json({ message }); } res.once("finish", () => { if (res.statusCode >= 200 && res.statusCode < 400) void writeSecurityAudit({ req, user: req.user, eventType: "API_OPERATION", operation, reason: "Operación autorizada", status: res.statusCode }); }); next(); }; }
function staffAccessRole(user) { return user?.displayRole || roleName(user); }
function isSuperAdmin(user) { return staffAccessRole(user) === "SUPERADMIN"; }
function isReceptionAdmin(user) { return roleName(user) === "ADMINISTRADOR" && (user?.position === "ADMIN_RECEPCION" || user?.operationalArea === "RECEPCION" || String(user?.email || "").toLowerCase() === "recepcion@parkplaza.com"); }
function requireFullAdministration(operation, message) { return async (req, res, next) => { if (roleName(req.user) !== "ADMINISTRADOR" || isReceptionAdmin(req.user)) { void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation, reason: "El Admin de recepción no posee control central", status: 403 }); return res.status(403).json({ message }); } res.once("finish", () => { if (res.statusCode >= 200 && res.statusCode < 400) void writeSecurityAudit({ req, user: req.user, eventType: "API_OPERATION", operation, reason: "Operación autorizada", status: res.statusCode }); }); next(); }; }
function requireInventoryAdmin(req, res, next) { return requireFullAdministration("ADMIN_INVENTORY", "Solo el Superadmin puede administrar costos, recetas e inventario central")(req, res, next); }
function requireCashAdmin(req, res, next) { return guarded("CASH_CLOSING", ["ADMINISTRADOR"], "Solo Administración puede cerrar la caja diaria")(req, res, next); }
function requireReceptionAdmin(req, res, next) { if (isSuperAdmin(req.user) || isReceptionAdmin(req.user)) return next(); return res.status(403).json({ message: "Solo el Admin de recepción o el Superadmin pueden realizar esta operación." }); }
function requireBillingAccess(capability, operation) {
  return async (req, res, next) => {
    if (!electronicBillingAccess(req.user)[capability]) {
      void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation: `BILLING_${operation}`, reason: "El perfil no posee esta responsabilidad de facturación", status: 403 });
      return res.status(403).json({ message: capability === "canRetry" ? "Solo el Superadmin puede reintentar envíos a SUNAT." : "Solo Recepción o Superadmin pueden gestionar comprobantes." });
    }
    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 400) void writeSecurityAudit({ req, user: req.user, eventType: "API_OPERATION", operation: `BILLING_${operation}`, reason: "Operación de facturación autorizada", status: res.statusCode });
    });
    next();
  };
}
function requireCleaningWorker(req, res, next) { return guarded("CLEANING_WORKER", ["LIMPIEZA"], "Esta estación es exclusiva para el personal de Limpieza.")(req, res, next); }
function requireCleaningEvidenceUploader(req, res, next) {
  if (["LIMPIEZA", "MANTENIMIENTO"].includes(roleName(req.user)) || isReceptionAdmin(req.user) || isSuperAdmin(req.user)) return next();
  return res.status(403).json({ message: "Solo Operaciones, Recepción o Superadmin pueden subir evidencias." });
}
function requireMaintenanceWorker(req, res, next) { return guarded("MAINTENANCE_WORKER", ["MANTENIMIENTO"], "Esta estación es exclusiva para el personal de Mantenimiento.")(req, res, next); }
function requirePurchasingAdmin(req, res, next) { return requireFullAdministration("PURCHASING", "Solo el Superadmin puede gestionar compras y recepciones")(req, res, next); }
function requireTransferUser(req, res, next) { if (isSuperAdmin(req.user)) return next(); return guarded("WAREHOUSE_TRANSFER", ["RESTAURANTE", "BARTENDER"], "Las transferencias solo corresponden a Restaurante, Bar o Superadmin")(req, res, next); }
function requireOperationalInventoryUser(req, res, next) { if (isSuperAdmin(req.user)) return next(); return guarded("OPERATIONAL_INVENTORY", ["RESTAURANTE", "BARTENDER"], "El inventario de turno solo corresponde a Restaurante, Bar o Superadmin")(req, res, next); }
function requireStockRequestUser(req, res, next) {
  if (["RESTAURANTE", "BARTENDER"].includes(roleName(req.user))) return next();
  return requireInventoryAdmin(req, res, next);
}
function requireFoodOperationsUser(req, res, next) { if (isSuperAdmin(req.user)) return next(); return guarded("OPERATIONAL_RECIPE_MANUAL", ["RESTAURANTE", "BARTENDER"], "Los manuales de producción solo corresponden a Restaurante, Bar o Superadmin")(req, res, next); }
function requireBarBottleUser(req, res, next) { if (isSuperAdmin(req.user)) return next(); return guarded("BAR_BOTTLES", ["BARTENDER"], "El control de botellas solo corresponde a Bar o Superadmin")(req, res, next); }
function requireTransformationUser(req, res, next) { if (isSuperAdmin(req.user)) return next(); return guarded("KITCHEN_TRANSFORMATION", ["RESTAURANTE"], "La producción y el porcionado solo corresponden a Restaurante o Superadmin")(req, res, next); }
async function requireActiveStaffShift(req, res, next) {
  try {
    if (isSuperAdmin(req.user)) return next();
    const state = await readState(); const today = hotelToday(state);
    const active = state.attendance.some((item) => Number(item.employeeId || item.userId) === Number(req.user.id) && String(item.date || item.checkIn || item.clockIn).slice(0, 10) === today && (item.checkIn || item.clockIn) && !(item.checkOut || item.clockOut));
    if (!active) return res.status(409).json({ message: "Inicia tu turno antes de cobrar, validar accesos o registrar entradas y salidas" });
    next();
  } catch (error) { next(error); }
}
function hydratePass(state, pass) { return { ...pass, client: state.clients.find((item) => item.id === pass.clientId), entitlements: state.entitlements.filter((item) => item.passId === pass.id).map((item) => ({ ...item, booking: state.bookings.find((booking) => booking.id === item.bookingId), event: state.events.find((event) => event.id === item.eventId) })) }; }
function compact(value) { return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== "")); }
function randomCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function normalizeDocument(value) { return String(value || "").trim().replace(/\s+/g, "").toUpperCase(); }
function findActiveClockEmployee(state, documentNumber) {
  const matchesDocument = (item) => String(item?.documentNumber || "").replace(/\D/g, "") === documentNumber;
  const employee = (state.employees || []).find((item) => item.status === "ACTIVO" && matchesDocument(item));
  if (employee) {
    const user = (state.users || []).find((item) => Number(item.id) === Number(employee.id));
    return user?.status === "ACTIVO" ? { ...employee, ...user, documentNumber } : null;
  }
  const user = (state.users || []).find((item) => item.status === "ACTIVO" && matchesDocument(item));
  const linkedEmployee = user && (state.employees || []).find((item) => Number(item.id) === Number(user.id));
  return user && linkedEmployee?.status === "ACTIVO" ? { ...linkedEmployee, ...user, documentNumber } : null;
}
function normalizeRoomStatus(value) { const status = String(value || "").trim().toUpperCase(); return ({ DISPONIBLE: "LIBRE", LIBRE: "LIBRE", OCUPADA: "OCUPADA", LIMPIEZA: "EN_LIMPIEZA", EN_LIMPIEZA: "EN_LIMPIEZA", MANTENIMIENTO: "MANTENIMIENTO", BLOQUEADA: "BLOQUEADA", FUERA_SERVICIO: "BLOQUEADA" })[status] || null; }
function assertDigitalCustomerPayment(value) { const method = String(value || "").toUpperCase(); if (!["YAPE", "PLIN"].includes(method)) throw httpError(400, "Para pagar desde la web elige Yape o Plin. El efectivo se valida en Recepción."); return method; }
function createAccessPass(state, clientId, { serviceCode, bookingId = null, eventId = null, bundleCode = null }) {
  if (bundleCode) {
    const existing = state.passes.find((item) => item.clientId === clientId && item.kind === "MASTER" && item.bundleCode === bundleCode && item.status !== "REVOCADO");
    if (existing) return existing;
    const pass = { id: nextId(state, "pass"), clientId, code: `PP-${randomCode()}`, kind: "MASTER", bundleCode, status: "ACTIVO", createdAt: now() };
    state.passes.push(pass); return pass;
  }
  const pass = { id: nextId(state, "pass"), clientId, code: `PP-${randomCode()}`, kind: "SERVICIO", serviceCode, bookingId, eventId, status: "ACTIVO", createdAt: now() };
  state.passes.push(pass); return pass;
}
function cashClosingSummary(state, date) {
  const sameDay = (item) => String(item.createdAt || "").slice(0, 10) === date;
  const approvedPayments = state.payments.filter((item) => sameDay(item) && String(item.status || "APROBADO").toUpperCase() === "APROBADO");
  const cashPayments = approvedPayments.filter((item) => String(item.method || "").toUpperCase() === "EFECTIVO").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const digitalPayments = approvedPayments.filter((item) => String(item.method || "").toUpperCase() !== "EFECTIVO").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashMovements = (state.cashMovements || []).filter(sameDay).reduce((sum, item) => sum + (String(item.type || "INGRESO").toUpperCase() === "EGRESO" ? -Number(item.amount || 0) : Number(item.amount || 0)), 0);
  return { expectedCash: round(cashPayments + cashMovements), approvedPayments: round(approvedPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0)), digitalPayments: round(digitalPayments), cashMovements: round(cashMovements) };
}
function sortRecent(rows = [], order = "newest") {
  const direction = String(order || "").toLowerCase() === "oldest" ? 1 : -1;
  const timestampOf = (item) => {
    const value = item?.updatedAt || item?.createdAt || item?.issuedAt || item?.finishedAt || item?.checkInAt || item?.startsAt || item?.date || "";
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number(item?.id || 0);
  };
  return [...(rows || [])].sort((a, b) => {
    const byDate = timestampOf(a) - timestampOf(b);
    if (byDate) return direction * byDate;
    return direction * (Number(a?.id || 0) - Number(b?.id || 0));
  });
}
function round(value) { return Math.round(Number(value) * 100) / 100; }
function roundQuantity(value) { return Math.round(Number(value) * 1000000) / 1000000; }
function dayDiff(from, to) { return Math.ceil((new Date(to) - new Date(from)) / 86400000); }
function overlaps(aStart, aEnd, bStart, bEnd) { if (!aStart || !aEnd || !bStart || !bEnd) return false; return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function audit(state, module, action, detail, userId) { const id = nextId(state, "audit"); state.audit.unshift({ id, module, action, detail, userId, createdAt: now() }); }
function resourceSearch(key) { return async (req, res, next) => { try { const state = await readState(); const query = String(req.query.q || "").toLowerCase(); const rows = state[key].filter((item) => JSON.stringify(item).toLowerCase().includes(query)); res.json(sortRecent(rows, req.query.order)); } catch (error) { next(error); } }; }
async function attendanceAction(req, action) {
  const employeeId = Number(req.body.employeeId || req.user.id);
  if (!isSuperAdmin(req.user)) throw httpError(403, "Marca tu asistencia con DNI y PIN.");
  return mutateState((state, client) => recordAttendance(state, client, employeeId, action, req.user.id));
}

function attendanceDateOf(record) { return String(record?.date || record?.checkIn || record?.clockIn || "").slice(0, 10); }
function onDemandOperationalShift(timestamp = new Date()) {
  return `TURNO-${new Date(timestamp).toISOString().replace(/[-:.TZ]/g, "")}`;
}

async function ensureAttendanceOperationalSession(client, employee, scheduledShift, attendanceId, at, operationalDate) {
  const area = scheduledShift?.area || employee.baseRole || employee.role;
  if (!["RESTAURANTE", "BARTENDER"].includes(area)) return null;
  const date = operationalDate || at.slice(0, 10);
  const shiftCode = onDemandOperationalShift(at);
  const warehouse = (await client.query("SELECT id FROM inventory_warehouses WHERE code=$1 AND active", [area])).rows[0];
  if (!warehouse) throw httpError(409, `No existe almacén operativo para ${area}`);
  const row = (await client.query(`INSERT INTO inventory_shift_sessions(warehouse_id,area_code,operational_date,shift_code,responsible_legacy_user_id,status,metadata)
    VALUES($1,$2,$3,$4,$5,'PENDING',$6::jsonb)
    ON CONFLICT(warehouse_id,operational_date,shift_code) DO UPDATE SET responsible_legacy_user_id=COALESCE(inventory_shift_sessions.responsible_legacy_user_id,EXCLUDED.responsible_legacy_user_id),metadata=inventory_shift_sessions.metadata||EXCLUDED.metadata
    RETURNING id,status`, [warehouse.id, area, date, shiftCode, employee.id, JSON.stringify({ attendanceLinked: true, attendanceId, scheduledShiftId: scheduledShift?.id || null })])).rows[0];
  return { id: Number(row.id), status: row.status, area, shift: shiftCode };
}

async function recordAttendance(state, client, employeeId, action, actorId) {
  const employee = state.employees.find((item) => Number(item.id) === Number(employeeId));
  if (!employee) throw httpError(404, "Empleado no encontrado");
  const at = now(); const date = hotelToday(state);
  let record = [...state.attendance].reverse().find((item) => Number(item.employeeId || item.userId) === Number(employeeId) && attendanceDateOf(item) === date && (item.checkIn || item.clockIn) && !(item.checkOut || item.clockOut));
  if (action === "INGRESO") {
    if (record) throw httpError(409, "El ingreso ya fue registrado");
    let scheduled = state.shifts.find((item) => Number(item.employeeId || item.userId) === Number(employeeId) && item.date === date && !["FINALIZADO", "CANCELADO"].includes(item.status));
    if (!scheduled) { const id = nextId(state, "shift"); scheduled = { id, employeeId, date, start: at.slice(11, 16), end: null, area: employee.baseRole || employee.role, status: "EN_CURSO", source: "ASISTENCIA" }; state.shifts.push(scheduled); }
    else { scheduled.status = "EN_CURSO"; scheduled.actualStart ||= at; }
    const id = nextId(state, "attendance");
    record = { id, employeeId, userId: employeeId, userName: `${employee.firstName} ${employee.lastName}`, role: employee.baseRole || employee.role, date, checkIn: at, clockIn: at, checkOut: null, clockOut: null, status: "EN_TURNO", shiftId: scheduled.id };
    state.attendance.push(record);
    const session = await ensureAttendanceOperationalSession(client, employee, scheduled, id, at, date);
    if (session) { record.operationalSessionId = session.id; record.operationalShift = session.shift; scheduled.operationalSessionId = session.id; }
    employee.attendanceStatus = "EN_TURNO";
  } else {
    if (!record) throw httpError(409, "No existe un turno abierto");
    if ((employee.position === "ADMIN_RECEPCION" || employee.operationalArea === "RECEPCION") && (state.cashSessions || []).some((item) => Number(item.userId) === Number(employeeId) && item.status === "ABIERTA")) {
      throw httpError(409, "Antes de marcar salida debes contar el efectivo y enviar tu caja a revisión");
    }
    if (record.operationalSessionId) {
      const session = (await client.query("SELECT status FROM inventory_shift_sessions WHERE id=$1", [record.operationalSessionId])).rows[0];
      if (["OPEN", "OPERATING", "COUNTING", "REOPENED"].includes(session?.status)) throw httpError(409, "Antes de marcar salida debes enviar o cerrar el inventario del turno operativo");
    }
    record.checkOut = at; record.clockOut = at; record.status = "SALIDA_REGISTRADA";
    const scheduled = state.shifts.find((item) => Number(item.id) === Number(record.shiftId));
    if (scheduled) { scheduled.status = "FINALIZADO"; scheduled.actualEnd = at; }
    employee.attendanceStatus = "FUERA_DE_TURNO";
  }
  audit(state, "ASISTENCIA", action, `${employee.firstName} ${employee.lastName}`, actorId);
  return record;
}
function groupPayments(state) { const groups = state.bookings.reduce((acc, booking) => { acc[booking.serviceCode] = (acc[booking.serviceCode] || 0) + booking.paid; return acc; }, {}); return Object.entries(groups).map(([area, total]) => ({ area, total })); }
function summaryReports(rows) { const closed = (item) => ["RESUELTO", "SOLUCIONADO", "CERRADO"].includes(item.status); return { open: rows.filter((item) => ["PENDIENTE", "ABIERTO"].includes(item.status)).length, review: rows.filter((item) => ["ASIGNADO", "EN_REVISION", "EN_REPARACION"].includes(item.status)).length, resolved: rows.filter(closed).length, high: rows.filter((item) => !closed(item) && ["ALTA", "CRITICA"].includes(item.priority)).length }; }

async function updateOrderStatus(req, res, next) {
  try {
    if (isReceptionAdmin(req.user)) throw httpError(403, "El Admin de recepción puede supervisar pedidos, pero no cambiar su producción");
    const expectedArea = req.path.includes("/bartender/") ? "BARTENDER" : "RESTAURANTE";
    const order = await mutateState(async (state, client) => { const existing = state.orders.find((item) => Number(item.id) === Number(req.params.id)); if (existing?.area !== expectedArea) throw httpError(404, "Pedido no encontrado en esta área"); const item = await transitionOrderInventory(client, state, req.params.id, req.body.status, req.user, req.body); audit(state, "PEDIDOS", "ESTADO", `${item.code}: ${item.status}`, req.user.id); return item; });
    res.json(order);
  } catch (error) { next(error); }
}

function hydrateReservation(state, reservation) {
  const stay = state.stays.find((item) => item.id === reservation.stayId || item.reservationId === reservation.id);
  const checkInDate = reservation.checkInDate || reservation.checkIn || reservation.date || null;
  const checkOutDate = reservation.checkOutDate || reservation.checkOut || checkInDate;
  return { ...reservation, checkInDate, checkOutDate, adults: Number(reservation.adults ?? reservation.people ?? 1), children: Number(reservation.children || 0), totalPrice: Number(reservation.totalPrice ?? reservation.total ?? 0), advance: Number(reservation.advance ?? reservation.paid ?? 0), balance: Number(reservation.balance || 0), client: state.clients.find((item) => item.id === Number(reservation.clientId)), room: state.rooms.find((item) => item.id === Number(reservation.roomId)) || reservation.room, stay: stay ? { ...stay, room: state.rooms.find((item) => item.id === stay.roomId) } : null };
}

function hydrateRoom(state, room) {
  return { ...room, usage: roomUsage(state, room.id) };
}

function roomUsage(state, roomId) {
  const activeStay = state.stays.find((stay) => Number(stay.roomId) === Number(roomId) && stay.status === "ACTIVA");
  if (activeStay) {
    const reservation = state.reservations.find((item) => Number(item.id) === Number(activeStay.reservationId));
    const client = state.clients.find((item) => Number(item.id) === Number(activeStay.clientId));
    return {
      state: "EN_USO",
      label: "En uso",
      reservationCode: reservation?.code || null,
      clientName: client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "Huésped registrado",
      checkIn: activeStay.checkInAt || reservation?.checkInDate || reservation?.checkIn || null,
      checkOut: reservation?.checkOutDate || reservation?.checkOut || null
    };
  }

  const nextReservation = state.reservations
    .filter((reservation) => Number(reservation.roomId) === Number(roomId) && !["CANCELADA", "COMPLETADA", "NO_SHOW"].includes(reservation.status))
    .sort((left, right) => String(left.checkInDate || left.checkIn || "").localeCompare(String(right.checkInDate || right.checkIn || "")))[0];
  if (!nextReservation) return null;

  const client = state.clients.find((item) => Number(item.id) === Number(nextReservation.clientId));
  return {
    state: "RESERVADA",
    label: "Reserva registrada",
    reservationCode: nextReservation.code || null,
    clientName: client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "Huésped registrado",
    checkIn: nextReservation.checkInDate || nextReservation.checkIn || null,
    checkOut: nextReservation.checkOutDate || nextReservation.checkOut || null
  };
}

function hydrateOrder(state, order) {
  const client = state.clients.find((item) => Number(item.id) === Number(order.clientId)) || order.client || null;
  const booking = state.bookings.find((item) => Number(item.id) === Number(order.bookingId)) || null;
  const event = state.events.find((item) => Number(item.id) === Number(order.eventId)) || null;
  const roomId = Number(order.roomId || booking?.roomId || 0) || null;
  const room = state.rooms.find((item) => Number(item.id) === roomId) || order.room || null;
  const experienceCode = order.experienceCode || booking?.serviceCode || (event ? "EVENTOS" : room ? "HOSPEDAJE" : null);
  let destination;
  if (event || experienceCode === "EVENTOS") destination = { type: "EVENTO", label: event?.name ? `Evento · ${event.name}` : "Evento reservado", detail: event?.space?.name ? `Entregar en ${event.space.name}` : "Coordinar entrega con el responsable del evento" };
  else if (experienceCode === "PISCINA") destination = { type: "PISCINA", label: "Piscina", detail: booking?.slot ? `Entregar en piscina · turno ${booking.slot}` : "Entregar en el punto de piscina" };
  else if (experienceCode === "MIRADOR") destination = { type: "MIRADOR", label: "Mirador", detail: booking?.preferences?.zone ? `Entregar en ${booking.preferences.zone}` : "Entregar en el mirador" };
  else if (room) destination = { type: "HABITACION", label: `Habitación ${room.number}`, detail: `Llevar a la habitación ${room.number}` };
  else destination = { type: "AREA_COMUN", label: "Área común", detail: "Confirmar el punto de entrega con el cliente" };
  const staffLabel = (id) => { const member=state.users.find((item)=>Number(item.id)===Number(id)); return member ? `${member.firstName} ${member.lastName}`.trim() : null; };
  return withOrderTiming({ ...order, code: order.code || `PED-${String(order.id || 0).padStart(4, "0")}`, client, booking, event, room, roomId, experienceCode, destination, acceptedBy: staffLabel(order.acceptedById), preparedBy: staffLabel(order.preparedById), readyBy: staffLabel(order.readyById), deliveredBy: staffLabel(order.deliveredById), items: (Array.isArray(order.items) ? order.items : []).map((item, index) => {
      const menu = state.menuItems.find((m) => Number(m.id) === Number(item?.menuItemId)) || state.menuItems.find((m) => item?.code && m.code === item.code);
      return { ...item, id: item?.id || index + 1, menuItemId: item?.menuItemId || menu?.id || null, name: String(item?.name || menu?.name || "Producto no identificado"), quantity: Number(item?.quantity) > 0 ? Number(item.quantity) : 1, price: Number.isFinite(Number(item?.price)) ? Number(item.price) : Number(menu?.price || 0), image: menu?.image, integrityStatus: menu ? (item?.integrityStatus || "VALID") : "REQUIRES_REVIEW" };
    }) });
}

function hydrateClient(state, client) {
  const reservations = state.reservations.filter((item) => item.clientId === client.id).map((item) => hydrateReservation(state, item));
  const serviceBookings = state.bookings.filter((item) => item.clientId === client.id && item.serviceCode !== "HOSPEDAJE");
  const stays = state.stays.filter((item) => item.clientId === client.id).map((item) => ({ ...item, room: state.rooms.find((room) => room.id === item.roomId) }));
  const events = state.events.filter((item) => item.clientId === client.id);
  const passes = state.passes.filter((item) => item.clientId === client.id).map((pass) => hydratePass(state, pass));
  const entitlements = passes.flatMap((pass) => pass.entitlements);
  const activeServices = entitlements.filter((item) => ["LISTO_INGRESO", "ACTIVO", "UTILIZADO", "PENDIENTE"].includes(item.status));
  const accessStatus = entitlements.some((item) => ["ACTIVO", "UTILIZADO"].includes(item.status))
    ? "ACTIVO"
    : entitlements.some((item) => item.status === "LISTO_INGRESO")
      ? "LISTO_INGRESO"
      : entitlements.some((item) => item.status === "PENDIENTE")
        ? "PENDIENTE"
        : "SIN_SERVICIOS";
  return { ...client, reservations, serviceBookings, stays, events, passes, activeServices, accessStatus };
}

function hydrateStay(state, stay, includeReservation = true) {
  const reservation = state.reservations.find((item) => item.id === stay.reservationId);
  const checkoutTask = state.tasks.filter((item) => item.roomId === stay.roomId && item.serviceType === "LIMPIEZA_POST_CHECKOUT" && item.createdAt > stay.checkInAt).sort((a, b) => b.id - a.id)[0] || null;
  return { ...stay, checkoutTask, client: state.clients.find((item) => item.id === stay.clientId), room: state.rooms.find((item) => item.id === stay.roomId), reservation: includeReservation ? hydrateReservation(state, { ...reservation, stayId: null }) : undefined, consumptions: state.orders.filter((item) => item.clientId === stay.clientId && item.roomId === stay.roomId && item.status !== "CANCELADO").map((item) => ({ id: item.id, code: item.code, amount: item.total, area: item.area, status: item.status })), payments: state.payments.filter((item) => item.stayId === stay.id || item.reservationId === stay.reservationId || item.bookingId === stay.reservationId).map((item) => hydratePayment(state, item)) };
}

  function hydratePayment(state, payment) {
    const reservation = state.reservations.find((item) => item.id === Number(payment.reservationId || payment.bookingId));
    const stay = state.stays.find((item) => item.id === Number(payment.stayId));
    const event = state.events.find((item) => item.id === Number(payment.eventId));
    const registeredBy = state.users.find((item) => item.id === Number(payment.createdById));
    return { ...payment, client: state.clients.find((item) => item.id === Number(payment.clientId)), reservation: reservation ? { ...reservation, client: state.clients.find((item) => item.id === reservation.clientId), room: state.rooms.find((item) => item.id === reservation.roomId) } : null, stay: stay ? { ...stay, room: state.rooms.find((item) => item.id === stay.roomId) } : null, event, invoice: state.facturacion.find((item) => item.id === payment.invoiceId) || null, registeredBy: registeredBy ? { id: registeredBy.id, name: `${registeredBy.firstName || ""} ${registeredBy.lastName || ""}`.trim() || registeredBy.email, role: registeredBy.displayRole || registeredBy.role } : null, concept: payment.concept || (reservation ? `Pago ${reservation.code}` : event ? `Pago evento ${event.name}` : "Pago de servicio"), area: payment.area || (event ? "EVENTOS" : "RECEPCION"), method: payment.method || "EFECTIVO" };
}

function hydrateInvoice(state, invoice) {
  const client = state.clients.find((item) => item.id === Number(invoice.clientId));
  const payment = state.payments.find((item) => item.id === Number(invoice.paymentId));
  return {
    ...invoice,
    fullNumber: invoice.fullNumber || `${invoice.series}-${invoice.number}`,
    recipient: invoice.recipient || (client ? {
      documentType: client.documentType || "DNI",
      documentNumber: client.documentNumber,
      name: `${client.firstName || ""} ${client.lastName || ""}`.trim(),
      email: client.email || "",
      address: client.address || ""
    } : null),
    client,
    payment
  };
}
function hydrateUser(state, user) { const role = state.roles.find((item) => item.id === Number(user.roleId) || item.name === user.role); const safe = safeStaffUser(state, user); return { ...safe, role: role ? { id: role.id, name: role.name } : { name: user.role }, attendanceStatus: state.employees.find((item) => item.id === user.id)?.attendanceStatus || "FUERA_DE_TURNO" }; }
function hydrateRole(role) { return { ...role, permissions: (role.permissions || []).map((item) => ({ ...item, permissionId: item.id })) }; }
function hydrateProduct(product) { const categoryId = Number(product.categoryId || (product.area === "BARTENDER" ? 2 : 1)); const stock = Number(product.stock || 0); const minStock = Number(product.minStock || 0); return { ...product, categoryId, category: { id: categoryId, name: categoryId === 2 ? "Bebidas" : "Alimentos" }, stockStatus: stock <= 0 ? "SIN_STOCK" : stock <= minStock ? "STOCK_BAJO" : "OK" }; }
function hydrateMenuItem(state, item) { return { ...item, ingredients: (item.recipe || []).map((line) => { const product = state.inventory.find((row) => row.id === line.inventoryId); return { inventoryId: line.inventoryId, name: product?.name || "Insumo", quantity: line.quantity, unit: product?.unit || "unidad", available: product && isOperationalProduct(product) ? Number(product.stock) - Number(product.reserved || 0) >= Number(line.quantity) : false }; }), available: (item.recipe || []).every((line) => { const product = state.inventory.find((row) => row.id === line.inventoryId); return product && isOperationalProduct(product) && Number(product.stock) - Number(product.reserved || 0) >= Number(line.quantity); }) }; }
function isOperationalProduct(product) { return !product?.status || ["ACTIVE", "ACTIVO"].includes(product.status); }
async function postDailyStockChange(client, input) { const difference = Number(input.difference || 0); if (Math.abs(difference) < 0.000001) return; const relation = (await client.query(`SELECT p.id "productId",p.average_cost "unitCost",w.id "warehouseId" FROM inventory_products p JOIN inventory_warehouses w ON w.code=$2 AND w.active WHERE p.legacy_id=$1 AND p.status='ACTIVE'`, [input.legacyProductId, input.area])).rows[0]; if (!relation) throw httpError(409, "El producto no está sincronizado con el inventario físico del área"); const post = async (key, quantity, lotId, direction) => client.query("SELECT post_inventory_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL,FALSE,$14::jsonb)", [key, direction === "IN" ? "DAILY_BOX_ASSIGNMENT" : "DAILY_BOX_CLOSING_VARIANCE", relation.productId, quantity, direction === "OUT" ? relation.warehouseId : null, direction === "IN" ? relation.warehouseId : null, lotId, Number(input.cost ?? relation.unitCost ?? 0), input.reason, input.actorId, "DAILY_INVENTORY_BOX", input.sourceId, `CAJA-${input.sourceId}`, JSON.stringify({ area: input.area, legacyProductId: input.legacyProductId })]); if (difference > 0) { let lot = (await client.query(`SELECT l.id FROM inventory_lots l LEFT JOIN inventory_stock_balances b ON b.lot_id=l.id AND b.warehouse_id=$2 WHERE l.product_id=$1 AND l.status='AVAILABLE' ORDER BY b.on_hand DESC NULLS LAST,l.expires_on NULLS LAST,l.id LIMIT 1`, [relation.productId, relation.warehouseId])).rows[0]; if (!lot) lot = (await client.query(`INSERT INTO inventory_lots(product_id,lot_code,unit_cost,status) VALUES($1,$2,$3,'AVAILABLE') ON CONFLICT(product_id,lot_code) DO UPDATE SET status='AVAILABLE' RETURNING id`, [relation.productId, `DAILY-${now().slice(0, 10)}-${relation.productId}`, Number(input.cost ?? relation.unitCost ?? 0)])).rows[0]; await post(input.key, difference, lot.id, "IN"); return; } let pending = Math.abs(difference); const lots = (await client.query(`SELECT b.lot_id "lotId",b.on_hand-b.reserved available FROM inventory_stock_balances b JOIN inventory_lots l ON l.id=b.lot_id WHERE b.product_id=$1 AND b.warehouse_id=$2 AND b.on_hand-b.reserved>0 AND l.status='AVAILABLE' ORDER BY l.expires_on NULLS LAST,l.created_at,l.id FOR UPDATE OF b`, [relation.productId, relation.warehouseId])).rows; for (let index = 0; index < lots.length && pending > 0.000001; index += 1) { const amount = round(Math.min(pending, Number(lots[index].available))); await post(`${input.key}:${index + 1}`, amount, lots[index].lotId, "OUT"); pending = round(pending - amount); } if (pending > 0.000001) throw httpError(409, `El cierre intenta descontar más existencia física de la disponible. Faltan ${pending}`); }
function validateDailyArea(value, user) { const area = String(value || "").toUpperCase(); if (!["RESTAURANTE", "BARTENDER"].includes(area)) throw httpError(400, "Área de inventario no válida"); if (!isSuperAdmin(user) && roleName(user) !== area) throw httpError(403, "Solo puedes operar la caja diaria de tu área"); return area; }
function ensureDailyBox(state, area) { state.dailyInventoryBoxes ||= []; const date = now().slice(0, 10); let box = state.dailyInventoryBoxes.find((item) => item.area === area && item.date === date); if (box) return box; const products = state.inventory.filter((item) => item.area === area && isOperationalProduct(item)); box = { id: nextId(state, "dailyBox"), date, area, status: "OPEN", items: products.map((product) => ({ productId: product.id, productName: product.name, unit: product.unit, openingQuantity: Number(product.stock || 0), assignedQuantity: 0 })), openedAt: now(), source: "SALDO_ANTERIOR" }; state.dailyInventoryBoxes.unshift(box); return box; }
function hydrateDailyBox(state, box) { const items = box.items.map((line) => { const product = state.inventory.find((item) => Number(item.id) === Number(line.productId)); const expectedQuantity = box.status === "CLOSED" ? Number(line.expectedQuantity || 0) : Math.max(0, Number(product?.stock || 0) - Number(product?.reserved || 0)); const availableAtStart = Number(line.openingQuantity || 0) + Number(line.assignedQuantity || 0); return { ...line, expectedQuantity, theoreticalUsed: round(Math.max(0, availableAtStart - expectedQuantity)), actualQuantity: line.actualQuantity ?? null, variance: line.variance ?? null, unitCost: Number(product?.cost || 0), lowStock: expectedQuantity <= Number(product?.minStock || 0) }; }); return { ...box, items, summary: { products: items.length, lowStock: items.filter((item) => item.lowStock).length, usedLines: items.filter((item) => item.theoreticalUsed > 0).length, varianceCost: Number(box.varianceCost || 0) } }; }
function hydrateTask(state, task) { return { ...task, room: state.rooms.find((item) => item.id === Number(task.roomId)) || task.room, evidences: task.evidences || [], operationalReports: task.operationalReports || [] }; }
function hasRequiredCleaningEvidence(evidences = []) {
  const areas = ["BAÑO", "CUARTO", "REFRI / DESPENSA"];
  const stageOf = (item) => {
    const stage = String(item?.stage || "").toUpperCase();
    return stage === "SALIDA" ? "SALIDA" : stage === "ENTRADA" ? "ENTRADA" : /salida/i.test(item?.description || item?.notes || "") ? "SALIDA" : "ENTRADA";
  };
  return areas.every((area) => ["ENTRADA", "SALIDA"].every((stage) => evidences.some((item) => String(item?.area || "").trim().toUpperCase() === area && stageOf(item) === stage)));
}
function hydrateParkingEntry(state, entry) { return { ...entry, client: state.clients.find((item) => item.id === Number(entry.clientId)) || entry.client || null }; }

function taskStatus(status) {
  return async (req, res, next) => {
    try { const result = await mutateState((state) => { const task = requireOwnedCleaningTask(state, req.params.id, req.user); const sourceRequest = state.requests.find((item) => item.id === Number(task.requestId)); if (status === "EN_LIMPIEZA" && task.requiresReceptionAcceptance && !task.receptionAcceptedAt) throw httpError(409, "Recepción debe aceptar esta solicitud del huésped antes de iniciar la limpieza."); if (status === "FINALIZADA" && !hasRequiredCleaningEvidence(task.evidences || [])) throw httpError(409, "Registra las fotos de entrada y salida de cuarto, baño y despensa antes de finalizar."); task.status = status; if (status === "EN_LIMPIEZA") { task.startedAt = now(); task.assignedEmployeeId = req.user.id; task.assignedTo = `${req.user.firstName} ${req.user.lastName}`.trim(); if (sourceRequest) sourceRequest.status = "EN_REVISION"; } if (status === "FINALIZADA") { task.finishedAt = now(); if (sourceRequest) { sourceRequest.status = "RESUELTO"; sourceRequest.resolvedAt = now(); } const room = state.rooms.find((item) => item.id === task.roomId); if (room && !task.requestId) room.status = "LIBRE"; } audit(state, "LIMPIEZA", status, task.code, req.user.id); return hydrateTask(state, task); }); res.json(result); } catch (error) { next(error); }
  };
}

function requireOwnedCleaningTask(state, taskId, user) {
  const task = state.tasks.find((item) => item.id === Number(taskId));
  if (!task) throw httpError(404, "Tarea no encontrada");
  if (task.assignedEmployeeId != null && Number(task.assignedEmployeeId) !== Number(user.id)) throw httpError(403, "Esta habitación no está asignada a tu cuenta.");
  return task;
}
function requireOwnedMaintenanceReport(state, reportId, user) {
  const report = state.requests.find((item) => item.id === Number(reportId) && item.requiresMaintenance);
  if (!report) throw httpError(404, "Incidencia de mantenimiento no encontrada.");
  if (Number(report.assignedMaintenanceEmployeeId) !== Number(user.id)) throw httpError(403, "Esta incidencia no está asignada a tu cuenta.");
  return report;
}

function receptionTaskStatus(status) {
  return async (req, res, next) => {
    try {
      const result = await mutateState((state) => {
        const task = state.tasks.find((item) => item.id === Number(req.params.id));
        if (!task) throw httpError(404, "Tarea no encontrada");
        if (status === "FINALIZADA" && !hasRequiredCleaningEvidence(task.evidences || [])) throw httpError(409, "Registra las fotos de entrada y salida de cuarto, baño y despensa antes de liberar la habitación.");
        task.status = status;
        task.updatedAt = now();
        if (status === "EN_LIMPIEZA") task.startedAt ||= now();
        if (status === "FINALIZADA") {
          task.finishedAt = now();
          const sourceRequest = state.requests.find((item) => item.id === Number(task.requestId));
          if (sourceRequest) { sourceRequest.status = "RESUELTO"; sourceRequest.resolvedAt = now(); sourceRequest.resolvedById = req.user.id; }
          const room = state.rooms.find((item) => item.id === Number(task.roomId));
          if (room && !task.requestId) room.status = "LIBRE";
        }
        audit(state, "HABITACIONES", status, task.code, req.user.id);
        return hydrateTask(state, task);
      });
      res.json(result);
    } catch (error) { next(error); }
  };
}

function createReport(state, payload) {
  const id = nextId(state, "request");
  const requiresMaintenance = Boolean(payload.requiresMaintenance || ["MANTENIMIENTO", "DANO_EQUIPO", "DANO_INFRAESTRUCTURA"].includes(payload.type));
  const item = { id, code: code("SOL", id), clientId: payload.clientId ? Number(payload.clientId) : null, roomId: payload.roomId ? Number(payload.roomId) : null, type: payload.type || "INCIDENCIA", area: payload.area || "OPERACIONES", evidenceArea: payload.evidenceArea || null, productId: payload.productId ? Number(payload.productId) : null, location: payload.location || "", description: payload.description || "", priority: payload.priority || "MEDIA", status: requiresMaintenance ? "ABIERTO" : "PENDIENTE", requiresMaintenance, requiresReceptionAcceptance: Boolean(payload.requiresReceptionAcceptance), receptionAcceptedAt: payload.requiresReceptionAcceptance ? null : payload.receptionAcceptedAt || null, reportedFrom: payload.reportedFrom || null, reportedById: payload.reportedById ? Number(payload.reportedById) : null, reportedByName: payload.reportedByName || null, cleaningTaskId: payload.cleaningTaskId ? Number(payload.cleaningTaskId) : null, evidences: payload.files || [], createdAt: now() };
  state.requests.unshift(item); audit(state, "REPORTES", "CREAR", item.code, null); return item;
}

function customerConsumptionEnabled(state, booking, requestedServiceCode = booking?.serviceCode) {
  if (!booking || ["CANCELADA", "FINALIZADA"].includes(booking.status)) return false;
  if (booking.serviceCode === "HOSPEDAJE") {
    const checkedIn = booking.status === "CHECKED_IN" && state.stays.some((stay) => Number(stay.reservationId) === Number(booking.id) && stay.status === "ACTIVA");
    if (!checkedIn) return false;
    if (requestedServiceCode === "HOSPEDAJE") return true;
    return state.entitlements.some((entry) => Number(entry.bookingId) === Number(booking.id) && entry.includedByBundle && entry.serviceCode === requestedServiceCode && ["LISTO_INGRESO", "ACTIVO", "UTILIZADO"].includes(entry.status));
  }
  if (requestedServiceCode && requestedServiceCode !== booking.serviceCode) return false;
  const entitlement = state.entitlements.find((entry) => Number(entry.bookingId) === Number(booking.id));
  return entitlement?.status === "UTILIZADO" || booking.accessStatus === "INGRESO_VALIDADO";
}

function experiencePricing(state) { const defaults = {
  HOSPEDAJE: [{ code: "FLEX", name: "Flexible", description: "Cambios hasta 24 horas antes", multiplier: 1, price: 0 }, { code: "DESAYUNO", name: "Descanso con desayuno", description: "Desayuno incluido para cada huésped", multiplier: 1, perPerson: 24, price: 24 }],
  PISCINA: [{ code: "ADULTO", name: "Pase adulto", price: 55 }, { code: "NINO", name: "Pase niño", price: 30 }, { code: "FAMILIAR", name: "Pase familiar", description: "2 adultos y 2 niños", price: 150 }],
  MIRADOR: [{ code: "ACCESO", name: "Solo acceso", price: 45 }, { code: "ATARDECER", name: "Atardecer y bebida", price: 65 }, { code: "CENA", name: "Mesa con consumo", description: "Incluye crédito de S/ 40 por persona", price: 85 }],
  EXTRAS_HOSPEDAJE: [{ id: "EARLY", name: "Ingreso temprano", price: 45 }, { id: "LATE", name: "Salida tardía", price: 50 }, { id: "TOALLA", name: "Toalla adicional", price: 8 }],
  EXTRAS_PISCINA: [{ id: "TOALLA", name: "Toalla premium", price: 8 }, { id: "CAMASTRO", name: "Camastro reservado", price: 20 }, { id: "CABANA", name: "Cabaña familiar", price: 70 }],
  EXTRAS_MIRADOR: [{ id: "VENTANA", name: "Mesa junto a la vista", price: 20 }, { id: "DECORACION", name: "Detalle de celebración", price: 45 }],
  EQUIPO_EVENTO: [{ id: "SONIDO", name: "Sonido y micrófonos", price: 350 }, { id: "PROYECTOR", name: "Proyector y pantalla", price: 180 }, { id: "DECORACION", name: "Decoración temática", price: 500 }, { id: "DJ", name: "DJ por 4 horas", price: 650 }]
}; return { ...defaults, ...(state?.settings?.experiencePricing || {}) }; }
function roomTypeMedia(state) { return state?.settings?.roomTypeMedia && typeof state.settings.roomTypeMedia === "object" ? state.settings.roomTypeMedia : {}; }
function experienceMedia(state) {
  const defaults = [
    { code: "HOSPEDAJE", place: "Hotel Park Plaza", title: "HOTEL", title2: "PARK PLAZA", description: "Hospedaje pensado para descansar con reservas y accesos conectados.", imageUrl: "/images/experiences/hospedaje.webp" },
    { code: "BAR", place: "Bar Park Plaza", title: "BAR", title2: "NOCTURNO", description: "Cócteles, bebidas y una atmósfera especial.", imageUrl: "/images/landing/park-plaza-bar-v1.png" },
    { code: "PISCINA", place: "Días bajo el sol", title: "PISCINA", title2: "PARK PLAZA", description: "Accesos, acompañantes y pase QR en una sola experiencia.", imageUrl: "/images/experiences/piscina.webp" },
    { code: "EVENTOS", place: "Celebra a tu manera", title: "ZONA DE", title2: "EVENTOS", description: "Ambiente, invitados, comida, bebidas, equipo y cochera.", imageUrl: "/images/experiences/eventos.webp" },
    { code: "TERRAZA", place: "Terraza · Cocina", title: "SABORES", title2: "EN TERRAZA", description: "Platos, atención de cocina y un ambiente para compartir.", imageUrl: "/images/landing/park-plaza-terraza-v1.png" },
    { code: "MIRADOR", place: "La ciudad desde arriba", title: "MIRADOR", title2: "PARK PLAZA", description: "Horarios, disponibilidad y una vista diferente de Pucallpa.", imageUrl: "/images/experiences/mirador.webp" },
  ];
  const saved = Array.isArray(state?.settings?.experienceMedia) ? state.settings.experienceMedia : [];
  return defaults.map((item) => ({ ...item, ...(saved.find((entry) => entry.code === item.code) || {}) }));
}
function experienceCatalog(state) {
  const pricing = experiencePricing(state);
  return {
    plans: { HOSPEDAJE: pricing.HOSPEDAJE.filter((item) => item.active !== false), PISCINA: pricing.PISCINA.filter((item) => item.active !== false), MIRADOR: pricing.MIRADOR.filter((item) => item.active !== false) },
    extrasByService: { HOSPEDAJE: pricing.EXTRAS_HOSPEDAJE.filter((item) => item.active !== false), PISCINA: pricing.EXTRAS_PISCINA.filter((item) => item.active !== false), MIRADOR: pricing.EXTRAS_MIRADOR.filter((item) => item.active !== false) },
    eventLayouts: [{ code: "BANQUETE", name: "Banquete", description: "Mesas redondas y pista central" }, { code: "COCTEL", name: "Cóctel", description: "Mesas altas y circulación libre" }, { code: "AUDITORIO", name: "Auditorio", description: "Sillas orientadas al escenario" }, { code: "IMPERIAL", name: "Mesa imperial", description: "Celebración privada y cercana" }],
    eventEquipment: pricing.EQUIPO_EVENTO.filter((item) => item.active !== false),
    // Eventos necesita una fuente única para poder separar Platillos
    // (Restaurante) y Bebidas (Bartender) en la interfaz pública.
    restaurantMenu: state.menuItems.filter((item) => ["RESTAURANTE", "BARTENDER"].includes(item.area) && item.active).map((item) => hydrateMenuItem(state, item))
  };
}

function calculateBookingPrice(state, input) {
  const catalog = experienceCatalog(state); const plans = catalog.plans[input.serviceCode] || [];
  const plan = plans.find((item) => item.code === input.planCode) || plans[0] || {};
  let base = input.room ? Number(input.room.price || 0) * input.nights : Number(plan.price || 0) * input.people;
  if (input.serviceCode === "HOSPEDAJE") base += Number(plan.perPerson || 0) * input.people;
  if (input.serviceCode === "PISCINA" && input.planCode !== "FAMILIAR") {
    const adult = plans.find((item) => item.code === "ADULTO"); const child = plans.find((item) => item.code === "NINO");
    base = Number(adult?.price || 0) * input.adults + Number(child?.price || 0) * input.children;
  }
  const extras = catalog.extrasByService[input.serviceCode] || [];
  const extrasTotal = (Array.isArray(input.extras) ? input.extras : []).reduce((sum, selected) => sum + Number(extras.find((item) => item.id === selected.id)?.price || 0), 0);
  const rates = state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 };
  const parkingTotal = (input.vehicles || []).reduce((sum, vehicle) => sum + Number(rates[vehicle.type] || 0), 0);
  let bundleTotal = 0;
  if (input.bundleCode === "HOSPEDAJE_PISCINA_MIRADOR") {
    const pool = catalog.plans.PISCINA?.find((item) => item.code === "ADULTO");
    const lookout = catalog.plans.MIRADOR?.find((item) => item.code === "ACCESO");
    bundleTotal = (Number(pool?.price || 0) + Number(lookout?.price || 0)) * input.people * 0.9;
  }
  return { extrasTotal: round(extrasTotal), parkingTotal: round(parkingTotal), total: round(base + extrasTotal + parkingTotal + bundleTotal) };
}

function eventSpaces(state) { const defaults = [{ id: 1, name: "Terraza", capacity: 80, basePrice: 900, description: "Exterior techado, jardín y pista de baile", amenities: ["Bar", "Pista", "Baños cercanos"] }, { id: 2, name: "Mirador", capacity: 40, basePrice: 650, description: "Vista panorámica para reuniones íntimas", amenities: ["Vista", "Bar", "Iluminación cálida"] }, { id: 3, name: "Salón Amazónico", capacity: 120, basePrice: 1400, description: "Salón climatizado para celebraciones grandes", amenities: ["Escenario", "Aire acondicionado", "Acceso de proveedores"] }]; return state?.settings?.eventSpaces?.length ? state.settings.eventSpaces : defaults; }

function createScheduledOrders(state, booking, clientId) {
  const items = (booking.preorderItems || []).map((entry) => { const menu = state.menuItems.find((item) => item.id === Number(entry.menuItemId)); if (!menu) return null; return { menuItemId: menu.id, name: menu.name, quantity: Number(entry.quantity || 1), price: menu.price, recipe: menu.recipe,area:menu.area,recipeVersionId:menu.recipeVersionId||null,recipeVersion:menu.recipeVersion||null,recipeUnitCost:Number(menu.recipeCost||0) }; }).filter(Boolean);
  if (!items.length) return [];
  const groupCode=`SCH-${booking.id||Date.now()}`;const ids=[];for(const area of ["RESTAURANTE","BARTENDER"]){const areaItems=items.filter((item)=>item.area===area);if(!areaItems.length)continue;const id=nextId(state,"order");const order={ id, code: code("PED", id),groupCode, bookingId: booking.id, clientId, area, roomId: booking.roomId || null, items:areaItems, total: round(areaItems.reduce((sum, item) => sum + item.price * item.quantity, 0)), status: "PENDIENTE", estimatedMinutes: Math.max(...areaItems.map((item) => state.menuItems.find((menu) => menu.id === item.menuItemId)?.prepMinutes || 0)), scheduledFor: `${booking.date}T${booking.slot}:00`, notes: `Preorden programada de ${booking.serviceCode}`, createdAt: now(), updatedAt: now() };validateOrderSchema(state,order);state.orders.push(order);ids.push(id);}
  return ids;
}
function createEventCateringOrder(state, event) {
  if (!event.catering?.length || event.orderIds?.length) return event.orderIds || [];
  const startsAt = String(event.startsAt || "");
  const scheduled = { id: `event-${event.id}`, serviceCode: "EVENTOS", date: startsAt.slice(0, 10), slot: startsAt.slice(11, 16) || "18:00", roomId: null, preorderItems: event.catering };
  event.orderIds = createScheduledOrders(state, scheduled, event.clientId);
  return event.orderIds;
}
function createEvent(state, payload, userId) {
  const client = state.clients.find((item) => item.id === Number(payload.clientId));
  const space = eventSpaces(state).find((item) => item.id === Number(payload.spaceId));
  if (!client || !space) throw httpError(400, "Cliente o espacio no valido");
  if (Number(payload.guests) > space.capacity) throw httpError(409, `El aforo maximo es ${space.capacity}`);
  if (state.events.some((item) => item.spaceId === space.id && !["CANCELADO", "COTIZACION", "PENDIENTE_PAGO", "PENDIENTE_CAJA"].includes(item.status) && overlaps(payload.startsAt, payload.endsAt, item.startsAt, item.endsAt))) throw httpError(409, "El espacio ya esta reservado en ese horario");
  const id = nextId(state, "event"); const price = Number(payload.price || 0); const advance = Number(payload.advance || 0);
  const item = { id, code: code("EVT", id), ...payload, clientId: client.id, client, spaceId: space.id, space, guests: Number(payload.guests), price, advance, balance: round(price - advance), status: payload.status || "COTIZACION", createdAt: now() };
  state.events.push(item);
  if (advance > 0) state.payments.push(attachCashSession(state, { id: nextId(state, "payment"), eventId: id, clientId: client.id, amount: advance, method: payload.paymentMethod || "EFECTIVO", concept: `Adelanto evento ${item.name}`, area: "EVENTOS", status: "APROBADO", createdAt: now() }, userId));
  audit(state, "EVENTOS", "CREAR", item.code, userId); return item;
}

function registerPayment(state, payload, userId) {
  const amount = Number(payload.amount || 0); if (amount <= 0) throw httpError(400, "El monto debe ser mayor a cero");
  const method = String(payload.method || "EFECTIVO").toUpperCase();
  if (method === "TRANSFERENCIA") throw httpError(400, "Transferencia ya no es un método de pago disponible");
  const reservation = state.reservations.find((item) => item.id === Number(payload.reservationId));
  const booking = state.bookings.find((item) => item.id === Number(payload.bookingId || payload.reservationId));
  const event = state.events.find((item) => item.id === Number(payload.eventId));
  const stay = state.stays.find((item) => item.id === Number(payload.stayId));
  const clientId = Number(payload.clientId || booking?.clientId || reservation?.clientId || event?.clientId || stay?.clientId);
  const item = attachCashSession(state, { id: nextId(state, "payment"), ...payload, clientId, reservationId: reservation?.id || null, bookingId: booking?.id || null, eventId: event?.id || null, stayId: stay?.id || null, amount, method, status: "APROBADO", createdAt: now() }, userId);
  state.payments.push(item);
  if (reservation) { reservation.advance = round(Number(reservation.advance || 0) + amount); reservation.balance = Math.max(0, round(Number(reservation.totalPrice) - reservation.advance)); reservation.paymentStatus = reservation.balance ? "PARCIAL" : "PAGADO"; const booking = state.bookings.find((row) => row.id === reservation.id); if (booking) { booking.paid = reservation.advance; booking.balance = reservation.balance; booking.paymentStatus = reservation.paymentStatus; booking.status = reservation.balance ? "PENDIENTE_PAGO" : "CONFIRMADA"; booking.accessStatus = reservation.balance ? "PENDIENTE_PAGO" : "LISTO_INGRESO"; if (!reservation.balance) state.entitlements.filter((entry) => entry.bookingId === booking.id).forEach((entry) => { entry.status = "LISTO_INGRESO"; }); } }
  if (booking && !reservation) { booking.paid = Math.min(booking.total, round(Number(booking.paid || 0) + amount)); booking.balance = Math.max(0, round(Number(booking.total) - booking.paid)); booking.paymentStatus = booking.balance ? "PARCIAL" : "PAGADO"; booking.status = booking.balance ? "RESERVADA" : "CONFIRMADA"; booking.accessStatus = booking.balance ? "PENDIENTE_PAGO" : "LISTO_INGRESO"; if (!booking.balance) { state.entitlements.filter((entry) => entry.bookingId === booking.id).forEach((entry) => { entry.status = "LISTO_INGRESO"; }); if (booking.preorderItems?.length && !booking.orderIds?.length) booking.orderIds = createScheduledOrders(state, booking, booking.clientId); } }
  if (event) { event.advance = Math.min(Number(event.price), round(Number(event.advance || 0) + amount)); event.balance = Math.max(0, round(Number(event.price) - event.advance)); if (!event.balance) { event.status = "CONFIRMADO"; event.accessStatus = "LISTO_INGRESO"; state.entitlements.filter((entry) => Number(entry.eventId) === Number(event.id)).forEach((entry) => { entry.status = "LISTO_INGRESO"; }); createEventCateringOrder(state, event); } else if (event.advance >= Number(event.price) * .5) { event.status = "RESERVADO"; event.accessStatus = "PENDIENTE_PAGO"; } }
  audit(state, "PAGOS", "REGISTRAR", `${payload.concept || "Pago"} S/ ${amount}`, userId); return hydratePayment(state, item);
}

  function attachCashSession(state, payment, userId) {
    const method = String(payment.method || "").toUpperCase();
    const tracedPayment = { ...payment, method, createdById: payment.createdById ?? (userId ? Number(userId) : null) };
    if (method !== "EFECTIVO") return tracedPayment;
  const session = (state.cashSessions || []).find((item) => item.userId === userId && item.status === "ABIERTA");
  const actor = (state.users || []).find((item) => item.id === userId);
  if (actor?.role === "ADMINISTRADOR" && !session) {
    throw httpError(409, "Abre tu caja antes de registrar un pago en efectivo.");
  }
    return { ...tracedPayment, sessionId: session?.id || null };
  }

function hydrateCashSession(state, session) {
  const operator = (state.users || []).find((item) => item.id === session.userId);
  const reviewer = (state.users || []).find((item) => item.id === session.reviewedById);
  return { ...session, operatorName: operator ? `${operator.firstName || ""} ${operator.lastName || ""}`.trim() || operator.email : "Usuario no identificado", reviewerName: reviewer ? `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim() || reviewer.email : null };
}

function saveUser(state, id, payload, actorId) {
  const role = state.roles.find((item) => item.id === Number(payload.roleId)); if (!role) throw httpError(400, "Rol no valido");
  if (state.users.some((item) => item.id !== id && item.email.toLowerCase() === String(payload.email).toLowerCase())) throw httpError(409, "El correo ya esta registrado");
  const documentNumber = String(payload.documentNumber || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(documentNumber)) throw httpError(400, "El DNI del trabajador debe tener exactamente 8 dígitos");
  if (state.users.some((item) => item.id !== id && String(item.documentNumber || "").replace(/\D/g, "") === documentNumber)) throw httpError(409, "Ya existe un trabajador con este DNI");
  let user = id ? state.users.find((item) => item.id === id) : null;
  if (id && !user) throw httpError(404, "Usuario no encontrado");
  if (!user) { const nextUserId = Math.max(0, ...state.users.map((item) => item.id)) + 1; user = { id: nextUserId }; state.users.push(user); }
  const { password, passwordHash: _ignoredPasswordHash, pin, pinHash: _ignoredPinHash, ...profile } = payload;
  if (!id && !String(password || "").trim()) throw httpError(400, "Asigna una contraseña temporal al nuevo trabajador");
  if (!id && !/^\d{4}$/.test(String(pin || ""))) throw httpError(400, "Asigna un PIN de asistencia de 4 dígitos al nuevo trabajador");
  if (String(pin || "") && !/^\d{4}$/.test(String(pin))) throw httpError(400, "El PIN de asistencia debe tener exactamente 4 dígitos");
  Object.assign(user, profile, { documentNumber, roleId: role.id, role: role.name, permissions: role.permissions.map((item) => item.code), status: payload.status || user.status || "ACTIVO", username: payload.username || payload.email, updatedAt: now() });
  if (String(password || "").trim()) {
    user.passwordHash = hashStaffPassword(password);
    user.passwordChangedAt = now();
  }
  if (String(pin || "")) {
    user.pinHash = hashAttendancePin(pin);
    delete user.pin;
    user.pinChangedAt = now();
  }
  let employee = state.employees.find((item) => item.id === user.id); if (!employee) { employee = { id: user.id, dailyRate: Number(payload.dailyRate || 60), attendanceStatus: "FUERA_DE_TURNO" }; state.employees.push(employee); }
  const { passwordHash: _employeePasswordHash, ...employeeProfile } = user;
  Object.assign(employee, employeeProfile, { baseRole: role.name, dailyRate: Number(payload.dailyRate || employee.dailyRate || 60) });
  if (user.pinHash) delete employee.pin;
  audit(state, "USUARIOS", id ? "EDITAR" : "CREAR", user.email, actorId); return hydrateUser(state, user);
}

await initializeDatabase();
const attendanceRolloverWatcher = setInterval(() => {
  void synchronizeDailyAttendance().catch((error) => console.error("No se pudo cerrar la jornada diaria", error));
}, 60_000);
attendanceRolloverWatcher.unref?.();
httpServer.listen(port, "0.0.0.0", () => console.log(`Hotel Park Plaza API + tiempo real running on http://0.0.0.0:${port}`));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: cerrando conexiones de Park Plaza de forma segura`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  httpServer.close(async () => {
    try {
      io.close();
      const { db } = await import("./db.js");
      await db.end();
      process.exit(0);
    } catch (error) {
      console.error("No se pudo cerrar el backend limpiamente", error);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
