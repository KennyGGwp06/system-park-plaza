import cors from "cors";
import "dotenv/config";
import express from "express";
import { getApps as getFirebaseApps, initializeApp as initializeFirebaseAdmin } from "firebase-admin/app";
import { getAuth as getFirebaseAdminAuth } from "firebase-admin/auth";
import helmet from "helmet";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { sealAudit, verifyAuditChain } from "./audit-chain.js";
import { REFUND_WINDOW_HOURS, buildRefundCandidates, completeRefund, createRefundRequest, decideRefund, listRefunds } from "./refunds.js";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import QRCode from "qrcode";
import { Server as SocketServer } from "socket.io";
import { clearRateLimit, rateLimit, purgeRateLimits } from "./rate-limit.js";
import { asLeader, busStatus, publishChange, startRealtimeBus } from "./realtime-bus.js";
import { clusterSnapshot, metricsMiddleware, purgeOldMetrics, startAlerts, startMetricsFlush } from "./metrics.js";
import { hostname } from "node:os";
import { db, initializeDatabase, mutateState, readRelationalInventoryStatus, readState, synchronizeDailyAttendance } from "./db.js";
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
import { AREAS as CLOSING_AREAS, areaClosingStatus, areaNeeds, dailyNeeds, normalizeClosingTime } from "./daily-needs.js";
import { lateEvents } from "./workforce.js";
import { buildOwnerApprovals } from "./owner-approvals.js";
import { addDaysToDate, controlTower, lateDiscount, payrollExpenseRows, settingsOf as workforceSettings, validatedDays } from "./workforce.js";
import { foodCostReport, purchaseOrderFromNeeds } from "./food-cost.js";
import { createStockRequest, listStockRequests, reviewStockRequest, stockRequestReferences } from "./stock-requests.js";
import { ensureStayAccess, validateOrderSchema } from "./state-stabilization.js";
import { withOrderTiming } from "./order-operations.js";
import { dataIntegrityReport, sanitizeDataIntegrity } from "./data-integrity.js";
import { electronicBillingAccess, electronicBillingConfiguration, electronicDocumentArtifact, electronicDocumentView, isValidRuc, issueCreditNote, issueElectronicDocument, previewElectronicDocument, retryElectronicDocument } from "./electronic-billing.js";
import { buildOwnerHome, EXPENSE_CATEGORIES, HOME_SERVICES, ownerHomeWindow } from "./owner-home.js";
import { archiveColdHistory, hotelDay, listWindow, readStateWithHistory, readStateWithItem, restoreFromHistory, restoreWithDependents } from "./history.js";
import { buildClientDirectory, buildClientProfile, mergeClients } from "./client-directory.js";
import { buildReservationsOverview, buildReservationDetail, reservationDates, TYPE_COLLECTION } from "./reservations-overview.js";
import { buildPoolOverview } from "./pool-reservations.js";
import { buildMiradorOverview } from "./mirador-reservations.js";
import { buildTerrazaOverview } from "./terraza-reservations.js";
import { buildEventsOverview } from "./events-overview.js";
import { buildReceptionDesk, buildReceptionPlanning, buildReceptionSearch } from "./reception-desk.js";

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
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "logincon-936a3";
const firebaseAdminApp = getFirebaseApps()[0] || initializeFirebaseAdmin({ projectId: firebaseProjectId });
const firebaseAdminAuth = getFirebaseAdminAuth(firebaseAdminApp);
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CUSTOMER_URL,
  // Puertos locales usados por Vite cuando el puerto preferido ya está ocupado.
  // Se mantienen explícitos para que no amplíen los orígenes permitidos en nube.
  "http://localhost:5175",
  "http://localhost:4175",
  "http://localhost:4176",
  ...(isProduction && !isExplicitDemo ? [] : ["http://localhost:5173", "http://localhost:4173"])
].filter(Boolean);

function isLocalDevelopmentOrigin(origin) {
  if (isProduction && !isExplicitDemo) return false;
  try {
    const url = new URL(origin);
    const port = Number(url.port);
    const isLocalhost = ["localhost", "127.0.0.1"].includes(url.hostname);
    const isPrivateNetwork = /^10\./.test(url.hostname)
      || /^192\.168\./.test(url.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
    const isViteDevelopmentPort = (port >= 4173 && port <= 4179) || (port >= 5173 && port <= 5179);
    return (isLocalhost || isPrivateNetwork) && ["http:", "https:"].includes(url.protocol) && isViteDevelopmentPort;
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin(origin)) return callback(null, true);
    // 403 con explicación (antes salía "Error interno del servidor"): pasa cuando se abre el sistema por la IP o por un
    // dominio distinto de FRONTEND_URL/CUSTOMER_URL.
    return callback(Object.assign(new Error(`Este sistema solo atiende desde sus dominios configurados (${allowedOrigins.filter((item) => item.startsWith("https")).join(", ") || "FRONTEND_URL y CUSTOMER_URL"}). Entra por el dominio, no por la IP.`), { status: 403 }));
  },
  credentials: true
};

function hashStaffPassword(value) {
  const password = String(value || "");
  // El dueño eligió claves simples para el demo (usuario = clave, p. ej. "bar"). Mínimo 3 caracteres.
  if (password.length < 3) throw httpError(400, "La contraseña debe tener al menos 3 caracteres");
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

// Cuántos proxys hay delante (producción: Caddy y nginx = 2). Sin esto, todos los clientes parecen venir de la
// IP del proxy. "true" se mantiene como 1 por compatibilidad.
const trustProxy = process.env.TRUST_PROXY === "true" ? 1 : Number(process.env.TRUST_PROXY) > 0 ? Number(process.env.TRUST_PROXY) : false;
app.set("trust proxy", trustProxy);
const io = new SocketServer(httpServer, { cors: corsOptions });
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(metricsMiddleware);
app.use(express.json({ limit: "3mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use("/uploads", express.static(uploadRoot, { fallthrough: false, maxAge: "7d", immutable: true }));
app.use(morgan(isProduction ? "combined" : "dev"));
// Aviso de cambios en tiempo real. Los cambios que ocurren dentro de 250 ms se agrupan en un solo aviso:
// con muchas reservas o pedidos a la vez, las pantallas recargan una vez y no una por cada cambio.
// Los POST que solo consultan (ingresar, identificarse, vista previa de un QR) no avisan: no cambiaron nada.
let pendingChange = null;
const READ_ONLY_POSTS = new Set(["/api/auth/login", "/api/public/document-access", "/api/access/preview"]);
app.use((req, res, next) => {
  res.on("finish", () => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || res.statusCode >= 400 || READ_ONLY_POSTS.has(req.path)) return;
    if (!pendingChange) {
      pendingChange = { paths: new Set(), method: req.method };
      setTimeout(() => {
        const change = pendingChange; pendingChange = null;
        const paths = [...change.paths];
        // Por el canal de Postgres: llega a las pantallas conectadas a cualquier copia del servidor.
        void publishChange(io, { path: paths.at(-1), paths, method: change.method, at: Date.now() });
      }, 250).unref?.();
    }
    pendingChange.paths.delete(req.path); pendingChange.paths.add(req.path);
  });
  next();
});

io.on("connection", (socket) => {
  socket.emit("realtime:ready", { connected: true, at: Date.now() });
});
io.engine.on("connection_error", (error) => {
  console.error("Realtime connection error", error.code, error.message);
});

// Contador por tipo de registro. Si una base no tiene todavía el contador (p. ej. cashSession en una instalación nueva),
// se toma el mayor id existente: antes daba NaN y el registro se guardaba con id null (caja imposible de rendir).
const COUNTER_COLLECTION = { cashSession: "cashSessions", cashClosing: "cashClosings", invoice: "facturacion", access: "accessLogs", movement: "inventoryMovements", dailyBox: "dailyInventoryBoxes", waste: "wasteRecords", production: "productions" };
const nextId = (state, key) => {
  state.counters ||= {};
  if (state.counters[key] == null || !Number.isFinite(Number(state.counters[key]))) state.counters[key] = Math.max(0, ...(state[COUNTER_COLLECTION[key] || `${key}s`] || []).map((item) => Number(item.id) || 0).filter((id) => id < 1e12));
  state.counters[key] = Number(state.counters[key]) + 1;
  return state.counters[key];
};
const now = () => new Date().toISOString();
const code = (prefix, id) => `${prefix}-${String(id).padStart(4, "0")}`;
// La sesión de huésped es deliberadamente corta. La renovación se realizará con
// una nueva verificación de reserva; nunca con DNI como único factor.
const publicToken = (clientId) => jwt.sign({ sub: clientId, kind: "CLIENT" }, jwtSecret, { expiresIn: "12h" });
const publicClient = (client) => {
  if (!client) return client;
  const { passwordHash: _passwordHash, ...safe } = client;
  return safe;
};
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
const hotelClock = (state, iso) => new Intl.DateTimeFormat("en-GB", { timeZone: state?.settings?.timezone || "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const roomReady = (room) => room?.status === "LIBRE";

app.get("/api/health", async (_req, res, next) => {
  try { await readState(); res.json({ status: "ok", database: "connected", persistence: "postgresql", mode: isExplicitDemo ? "demo" : isProduction ? "production" : "development", realtimeConnections: io.engine.clientsCount }); } catch (error) { next(error); }
});

/* Límites de intentos (Fase 2): compartidos entre las copias del servidor y por persona, no solo por IP
   (en el wifi del hotel muchos huéspedes comparten IP). Ver rate-limit.js. */
const personKey = (req) => { const doc = String(req.body?.documentNumber || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase(); const email = String(req.body?.email || "").trim().toLowerCase(); return doc || email || null; };
const customerAccessLimit = rateLimit([
  { scope: "cliente", limit: 10, key: (req) => { const person = personKey(req); return person ? `${req.ip}:${person}` : null; } },
  { scope: "cliente-ip", limit: 200, key: (req) => req.ip || "unknown" }
], "Demasiados intentos. Intenta nuevamente en unos minutos.");
const staffLoginLimit = rateLimit([
  { scope: "personal", limit: 10, key: (req) => `${req.ip}:${String(req.body?.username ?? req.body?.email ?? "").trim().toLowerCase()}` },
  { scope: "personal-ip", limit: 100, key: (req) => req.ip || "unknown" }
], "Demasiados intentos. Intenta nuevamente en unos minutos.");
// El reloj es una terminal compartida. El límite se aplica por DNI e IP para
// evitar bloquear a todo el personal por los errores de una sola persona.
function attendanceAttemptKey(req) { return `${req.ip || "unknown"}:${String(req.body?.documentNumber || req.params?.documentNumber || "").replace(/\D/g, "")}`; }
const attendanceClockRateLimit = rateLimit([{ scope: "reloj", limit: 5, key: attendanceAttemptKey }], "Demasiados intentos. Solicita ayuda a Recepción.");

app.post("/api/public/identify", customerAccessLimit, async (req, res, next) => {
  try {
    const documentNumber = normalizeDocument(req.body.documentNumber);
    if (!documentNumber) return res.status(400).json({ message: "Ingresa un documento" });
    const isGoogle = String(req.body.documentType || "").toUpperCase() === "GOOGLE";
    if (isGoogle) return res.status(400).json({ message: "Usa Continuar con Google para verificar tu identidad." });
    const isDni = String(req.body.documentType || "DNI").toUpperCase() === "DNI";
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    const email = String(req.body.email || "").trim().toLowerCase();
    if (isDni && !/^\d{8}$/.test(documentNumber)) return res.status(400).json({ message: "El DNI debe tener exactamente 8 dígitos." });
    if (!isGoogle && !/^\d{9}$/.test(phone)) return res.status(400).json({ message: "El celular debe tener exactamente 9 dígitos." });
    const client = await mutateState((state) => {
      const existing = state.clients.find((row) => normalizeDocument(row.documentNumber) === documentNumber);
      if (existing) throw httpError(409, "Este documento ya tiene una cuenta. Usa ‘Verificar mi reserva’ con tu documento y código de reserva.");
      if (email && state.clients.some((row) => String(row.email || "").trim().toLowerCase() === email)) throw httpError(409, "Este correo ya está registrado. Verifica una reserva existente o solicita ayuda en Recepción.");
      const id = nextId(state, "client");
      const item = { id, documentType: req.body.documentType || "DNI", documentNumber, firstName: req.body.firstName || "Visitante", lastName: req.body.lastName || "Park Plaza", phone, email, status: "ACTIVO", createdAt: now() };
      state.clients.push(item);
      audit(state, "CLIENTE", "IDENTIFICAR", `Cliente ${documentNumber}`, null);
      return item;
    });
    res.json({ client: publicClient(client), token: publicToken(client.id) });
  } catch (error) { next(error); }
});

app.post("/api/public/document-access", customerAccessLimit, async (req, res, next) => {
  try {
    const documentNumber = normalizeDocument(req.body.documentNumber);
    if (!documentNumber) return res.status(400).json({ message: "Ingresa el documento con el que te registraste." });
    const state = await readState();
    const client = state.clients.find((item) => normalizeDocument(item.documentNumber) === documentNumber);
    if (!client) return res.status(404).json({ message: "No encontramos una cuenta registrada con ese documento. Revisa el número o registra una nueva visita." });
    if (["BLOQUEADO", "INACTIVO"].includes(client.status)) return res.status(403).json({ message: "Esta cuenta está deshabilitada. Acércate a Recepción para reactivarla." });
    res.json({ client: publicClient(client), token: publicToken(client.id) });
  } catch (error) { next(error); }
});

app.post("/api/public/google-auth", customerAccessLimit, async (req, res, next) => {
  try {
    const idToken = String(req.body.idToken || "").trim();
    if (!idToken) return res.status(400).json({ message: "Google no devolvió una credencial válida." });
    let identity;
    try {
      identity = await firebaseAdminAuth.verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ message: "La sesión de Google no es válida o venció. Intenta ingresar nuevamente." });
    }
    const email = String(identity.email || "").trim().toLowerCase();
    if (!identity.uid || !email || identity.email_verified !== true || identity.firebase?.sign_in_provider !== "google.com") return res.status(401).json({ message: "Google no pudo verificar el correo de esta cuenta." });
    const displayName = String(identity.name || "").trim();
    const names = displayName.split(/\s+/).filter(Boolean);
    const googleDocument = normalizeDocument(`GOOGLE-${identity.uid}`);
    const client = await mutateState((state) => {
      let item = state.clients.find((row) => row.googleUid === identity.uid || normalizeDocument(row.documentNumber) === googleDocument);
      if (!item) item = state.clients.find((row) => String(row.email || "").trim().toLowerCase() === email);
      if (item) {
        if (["BLOQUEADO", "INACTIVO"].includes(item.status)) throw httpError(403, "Esta cuenta está deshabilitada. Acércate a Recepción para reactivarla.");
        item.googleUid = identity.uid;
        item.authProvider = "GOOGLE";
        item.email = email;
        item.avatarUrl = identity.picture || item.avatarUrl || "";
        item.updatedAt = now();
        audit(state, "CLIENTE", "ACCESO_GOOGLE", `Cliente Google ${email}`, null);
        return item;
      }
      const id = nextId(state, "client");
      item = { id, documentType: "GOOGLE", documentNumber: googleDocument, firstName: names[0] || "Huésped", lastName: names.slice(1).join(" ") || "Google", phone: "", email, googleUid: identity.uid, authProvider: "GOOGLE", avatarUrl: identity.picture || "", status: "ACTIVO", createdAt: now() };
      state.clients.push(item);
      audit(state, "CLIENTE", "REGISTRO_GOOGLE", `Cliente Google ${email}`, null);
      return item;
    });
    res.json({ client: publicClient(client), token: publicToken(client.id) });
  } catch (error) { next(error); }
});

app.post("/api/public/recover", customerAccessLimit, async (req, res, next) => {
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
    res.json({ client: publicClient(client), token: publicToken(client.id) });
  } catch (error) { next(error); }
});

// El catálogo es igual para todos: se arma una vez por versión del estado y se reutiliza hasta 20 s
// (las porciones disponibles vienen del inventario, que puede cambiar sin tocar el estado).
let catalogCache = null;
app.get("/api/public/catalog", async (_req, res, next) => {
  try {
    const state = await readState();
    if (catalogCache && catalogCache.state === state && Date.now() - catalogCache.at < 20000) return res.type("json").send(catalogCache.body);
    const operationalRecipes = (await Promise.all([operationalRecipeManual("RESTAURANTE"), operationalRecipeManual("BARTENDER")])).flat();
    const operationalByMenu = new Map(operationalRecipes.filter((item) => item.menuItemId).map((item) => [Number(item.menuItemId), item]));
    const publicMenuItem = (item) => {
      const hydrated = hydrateMenuItem(state, item);
      const operational = operationalByMenu.get(Number(item.id));
      const salesEnabled = item.salesEnabled === true;
      return { ...hydrated, salesEnabled, available: salesEnabled && Number(operational?.availablePortions || 0) > 0, availablePortions: Number(operational?.availablePortions || 0), limitingIngredient: operational?.limitingIngredient || null };
    };
    // El ERP conserva los 91 productos. La experiencia del cliente recibe
    // únicamente los que Superadmin habilitó y el área puede preparar.
    const publicMenu = state.menuItems
      .filter((item) => item.active !== false)
      .map(publicMenuItem)
      .filter((item) => item.salesEnabled === true && item.available === true);
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
    experience.restaurantMenu = publicMenu.filter((item) => ["RESTAURANTE", "BARTENDER"].includes(item.area));
    const parkingRates = state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 };
    const settings = state.settings || {};
    const hotel = { name: settings.hotelName || "Hotel Park Plaza", address: settings.address || "", phone: settings.phone || "", email: settings.email || "", yapeNumber: settings.yapeNumber || "", plinNumber: settings.plinNumber || "", payHolder: settings.payHolder || settings.legalName || settings.hotelName || "" };
    const body = JSON.stringify({ hotel, services: state.services, roomTypes: roomGroups, menu: publicMenu, eventSpaces: eventSpaces(state), experienceMedia: experienceMedia(state), ...experience, parking: { available: parkingSpaces.length, spaces: parkingSpaces, occupiedSpaces: occupiedParkingSpaces, motorcyclePrice: Number(parkingRates.MOTO || 0), carPrice: Number(parkingRates.AUTO || 0), truckPrice: Number(parkingRates.CAMIONETA || 0), vanPrice: Number(parkingRates.MINIVAN || 0) } });
    catalogCache = { state, at: Date.now(), body };
    res.type("json").send(body);
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
      const slotNames = service.code === "PISCINA" ? ["09:00", "13:00", "16:00"] : service.code === "MIRADOR" ? ["16:30", "18:00", "19:30"] : service.code === "TERRAZA" ? ["12:00", "13:30", "15:00", "18:00", "20:00", "21:30"] : service.code === "BAR" ? ["17:00", "19:00", "21:00", "23:00"] : ["15:00"];
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
      const { total, extrasTotal, parkingTotal } = calculateBookingPrice(state, { serviceCode, room, nights, people, adults: Number(req.body.adults || people), children: Number(req.body.children || 0), planCode: req.body.planCode, extras: req.body.extras, preorderItems: req.body.preorderItems, vehicles, bundleCode: req.body.bundleCode, bundleServices: req.body.bundleServices });
      // Cualquier experiencia se puede reservar con adelanto. Su acceso
      // permanece pendiente hasta que el cliente complete el saldo.
      const requestedMethod = String(req.body.paymentMethod || "YAPE").toUpperCase();
      const cashAtReception = requestedMethod === "CAJA HOTEL";
      if (!cashAtReception && !["YAPE", "PLIN"].includes(requestedMethod)) throw httpError(400, "Elige Yape, Plin o efectivo en Recepción");
      const digitalVerificationPending = ["HOSPEDAJE", "MIRADOR"].includes(serviceCode) && !cashAtReception && total > 0;
      const paymentReference = String(req.body.paymentCode || "").trim();
      if (digitalVerificationPending && !/^\d{4,20}$/.test(paymentReference)) throw httpError(400, "Ingresa el código de operación de Yape o Plin (4 a 20 dígitos)");
      const ratio = cashAtReception || digitalVerificationPending ? 0 : req.body.payMode === "HALF" ? 0.5 : 1;
      const paid = round(total * ratio);
      const booking = { id: bookingId, code: code("RES", bookingId), clientId: req.client.id, serviceCode, planCode: req.body.planCode || "STANDARD", planName: req.body.planName || service.name, roomId: room?.id || null, room, checkIn: req.body.checkIn || state.settings.today, checkOut: req.body.checkOut || req.body.date || state.settings.today, date: req.body.date || req.body.checkIn || state.settings.today, slot: req.body.slot || (serviceCode === "HOSPEDAJE" ? "15:00" : "10:00"), people, adults: Number(req.body.adults || people), children: Number(req.body.children || 0), guests: req.body.guests || [], extras: req.body.extras || [], preorderItems: req.body.preorderItems || [], preferences: req.body.preferences || {}, parking: vehicles[0] || null, vehicles, total, paid, balance: round(total - paid), paymentMethod: requestedMethod, paymentMode: cashAtReception ? "FULL" : (req.body.payMode === "HALF" ? "HALF" : "FULL"), paymentReference: cashAtReception ? "" : paymentReference, paymentRequested: digitalVerificationPending ? round(total * (req.body.payMode === "HALF" ? 0.5 : 1)) : 0, cashDueAtReception: cashAtReception ? total : 0, paymentStatus: digitalVerificationPending ? "PENDIENTE_VERIFICACION" : ratio === 1 ? "PAGADO" : ratio > 0 ? "PARCIAL" : "PENDIENTE_CAJA", status: digitalVerificationPending ? "RESERVADA" : ratio === 1 ? "CONFIRMADA" : ratio > 0 ? "RESERVADA" : "PENDIENTE_CAJA", accessStatus: ratio === 1 ? "LISTO_INGRESO" : "PENDIENTE_PAGO", createdAt: now() };
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
      if (paid > 0) { const paymentId = nextId(state, "payment"); state.payments.push({ id: paymentId, bookingId, clientId: req.client.id, amount: paid, method: requestedMethod, reference: String(req.body.paymentCode || "").trim(), status: "APROBADO", createdAt: now() }); }
      const pass = createAccessPass(state, req.client.id, { serviceCode, bookingId, bundleCode: req.body.bundleCode });
      const entitlementId = nextId(state, "entitlement");
      const paidInFull = ratio === 1;
      state.entitlements.push({ id: entitlementId, passId: pass.id, bookingId, serviceCode, status: paidInFull ? "LISTO_INGRESO" : "PENDIENTE", people, date: booking.date, slot: booking.slot, usedAt: null, createdAt: now() });
      if (["HOSPEDAJE_PISCINA_MIRADOR", "HOSPEDAJE_PREMIUM"].includes(req.body.bundleCode) && serviceCode === "HOSPEDAJE") {
        const bundledServices = Array.isArray(req.body.bundleServices) ? req.body.bundleServices : [];
        const required = req.body.bundleCode === "HOSPEDAJE_PREMIUM" ? ["PISCINA", "MIRADOR", "TERRAZA"] : ["PISCINA", "MIRADOR"];
        if (required.some((code) => !bundledServices.some((item) => item?.serviceCode === code))) throw httpError(400, "El Servicio Premium debe incluir Piscina, Mirador y Terraza");
        required.forEach((bundleService) => {
          const item = bundledServices.find((entry) => entry.serviceCode === bundleService) || {};
          const servicePass = createAccessPass(state, req.client.id, { serviceCode: bundleService, bookingId, bundleCode: req.body.bundleCode });
          state.entitlements.push({ id: nextId(state, "entitlement"), passId: servicePass.id, bookingId, serviceCode: bundleService, status: paidInFull ? "LISTO_INGRESO" : "PENDIENTE", people: Number(item.people || people), date: item.date || booking.date, slot: item.slot || (bundleService === "PISCINA" ? "09:00" : bundleService === "MIRADOR" ? "16:30" : "19:00"), usedAt: null, createdAt: now(), includedByBundle: true });
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
      if (["HOSPEDAJE", "MIRADOR"].includes(booking.serviceCode)) {
        if (booking.paymentStatus === "PENDIENTE_VERIFICACION") throw httpError(409, "Ya hay una operación en verificación. Consulta el estado de tu reserva o comunícate con Recepción.");
        const paymentReference = String(req.body.paymentCode || "").trim();
        if (!/^\d{4,20}$/.test(paymentReference)) throw httpError(400, "Ingresa el código numérico de operación (4 a 20 dígitos).");
        booking.paymentMethod = paymentMethod;
        booking.paymentReference = paymentReference;
        booking.paymentRequested = booking.balance;
        booking.paymentStatus = "PENDIENTE_VERIFICACION";
        booking.accessStatus = "PENDIENTE_PAGO";
        const reservation = state.reservations.find((item) => item.id === booking.id);
        if (reservation) { reservation.paymentMethod = paymentMethod; reservation.paymentReference = paymentReference; reservation.paymentRequested = booking.balance; reservation.paymentStatus = "PENDIENTE_VERIFICACION"; reservation.accessStatus = "PENDIENTE_PAGO"; }
        audit(state, "PAGOS", "VERIFICAR", `${booking.code}: operación enviada para verificar`, null);
        const pass = state.passes.find((item) => item.id === state.entitlements.find((item) => item.bookingId === booking.id)?.passId);
        return { booking, pass: hydratePass(state, pass) };
      }
      const paymentId = nextId(state, "payment");
      state.payments.push({ id: paymentId, bookingId: booking.id, clientId: req.client.id, amount: booking.balance, method: paymentMethod, reference: String(req.body.paymentCode || "").trim(), status: "APROBADO", createdAt: now() });
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
      const stay = state.stays.find((item) => Number(item.reservationId) === Number(booking.id) && item.status === "ACTIVA") || state.stays.find((item) => item.roomId === booking.roomId && item.status === "ACTIVA");
      if (!stay) throw httpError(404, "No hay estadia activa para esta reserva");

      const inProgress = state.orders.filter((order) => Number(order.clientId) === Number(req.client.id) && Number(order.roomId) === Number(stay.roomId) && ["PENDIENTE", "ACEPTADO", "EN_PREPARACION", "LISTO"].includes(order.status));
      if (inProgress.length) throw httpError(409, "Aún tienes un pedido en curso. Espera su entrega o comunícate con Recepción antes de solicitar la salida.");
      if (!stay.checkoutRequestedAt) stay.checkoutRequestedAt = now();
      booking.checkoutRequestedAt = stay.checkoutRequestedAt;
      audit(state, "CHECKOUT", "SOLICITAR", `${booking.code}: huésped listo para salir`, null);
      return { success: true, requestedAt: stay.checkoutRequestedAt };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/public/my-experience", clientAuth, async (req, res, next) => {
  try {
    const state = await readStateWithHistory({ clientId: req.client.id });
    const passes = state.passes.filter((item) => item.clientId === req.client.id && item.status !== "REVOCADO").map((item) => hydratePass(state, item));
    const payments = state.payments.filter((item) => Number(item.clientId) === Number(req.client.id)).map((item) => hydratePayment(state, item));
    const invoices = state.facturacion.filter((item) => Number(item.clientId) === Number(req.client.id) && ["ACEPTADO", "ANULADO"].includes(item.status)).map((item) => { const { payment: _payment, client: _client, signatureValue: _signature, ...row } = hydrateInvoice(state, item); return row; });
    const bookings = state.bookings
      .filter((item) => item.clientId === req.client.id)
      .map((item) => hydrateReservation(state, item));
    res.json({ client: publicClient(req.client), passes, pass: passes[0] || null, bookings, events: state.events.filter((item) => item.clientId === req.client.id), orders: state.orders.filter((item) => item.clientId === req.client.id), requests: state.requests.filter((item) => item.clientId === req.client.id), payments, invoices });
  } catch (error) { next(error); }
});

app.get("/api/public/invoices/:id/pdf", clientAuth, async (req, res, next) => {
  try {
    const state = await readStateWithHistory({ clientId: req.client.id });
    const document = state.facturacion.find((item) => Number(item.id) === Number(req.params.id) && Number(item.clientId) === Number(req.client.id));
    if (!document || !["ACEPTADO", "ANULADO"].includes(document.status)) throw httpError(404, "Comprobante no encontrado");
    const artifact = electronicDocumentArtifact(document, "pdf");
    res.set("Content-Type", artifact.contentType);
    res.set("Content-Disposition", `attachment; filename="${artifact.filename}"`);
    res.send(artifact.body);
  } catch (error) { next(error); }
});

app.post("/api/public/event-quotes", clientAuth, async (req, res, next) => {
  try {
    const result = await mutateState((state) => { const priced = calculateEventPrice(state, req.body); return createEvent(state, {
      ...req.body,
      ...priced.lines,
      clientId: req.client.id,
      name: req.body.name || "Evento Park Plaza",
      price: priced.price,
      advance: 0,
      status: "COTIZACION"
    }, null); });
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
      const priced = calculateEventPrice(state, req.body); const price = priced.price; const advance = cash ? 0 : round(price * .5);
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
      const event = createEvent(state, { ...req.body, ...priced.lines, vehicles, payMode: "HALF", clientId: req.client.id, price, advance, paymentMethod: cash ? "EFECTIVO" : requestedMethod, status: cash ? "PENDIENTE_CAJA" : "RESERVADO", accessStatus: "PENDIENTE_PAGO" }, null);
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
  try { const result = await mutateState((state) => { const event = state.events.find((item) => item.id === Number(req.params.id) && item.clientId === req.client.id); if (!event) throw httpError(404, "Evento no encontrado"); if (Number(event.balance || 0) <= 0) throw httpError(409, "El evento ya está pagado"); const amount=Number(event.balance); state.payments.push({ id:nextId(state,"payment"),eventId:event.id,clientId:req.client.id,amount,method:assertDigitalCustomerPayment(req.body.paymentMethod),reference:String(req.body.paymentCode || "").trim(),concept:`Saldo evento ${event.code}`,area:"EVENTOS",status:"APROBADO",createdAt:now() }); event.advance=event.price;event.balance=0;event.status="CONFIRMADO";event.accessStatus="LISTO_INGRESO";state.entitlements.filter((item)=>Number(item.eventId)===Number(event.id)).forEach((item)=>{item.status="LISTO_INGRESO";});createEventCateringOrder(state,event);audit(state,"PAGOS","COMPLETAR",`${event.code} pagado`,null);return event; }); res.json(result); } catch(error){ next(error); }
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
      const eligibleExperiences = [...state.bookings].reverse().filter((item) => item.clientId === req.client.id && ["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA"].includes(item.serviceCode) && item.paymentStatus === "PAGADO" && customerConsumptionEnabled(state, item, requestedServiceCode || item.serviceCode));
      const eligibleEvents = [...state.events].reverse().filter((item) => item.clientId === req.client.id && item.status === "CONFIRMADO" && Number(item.balance || 0) <= 0 && item.accessStatus === "INGRESO_VALIDADO");
      const requestedBookingId = Number(req.body.bookingId || 0);
      const requestedEventId = Number(req.body.eventId || 0);
      const paidExperience = requestedBookingId ? eligibleExperiences.find((item) => Number(item.id) === requestedBookingId) : requestedEventId ? null : eligibleExperiences[0];
      const paidEvent = requestedEventId ? eligibleEvents.find((item) => Number(item.id) === requestedEventId) : requestedBookingId ? null : eligibleEvents[0];
      if ((requestedBookingId && !paidExperience) || (requestedEventId && !paidEvent)) throw httpError(403, "El destino elegido no corresponde a una experiencia pagada y vigente");
      if (!paidExperience && !paidEvent) throw httpError(403, "Necesitas una experiencia pagada y vigente para realizar pedidos desde la app");
      const serviceCode = requestedServiceCode || paidExperience?.serviceCode || (paidEvent ? "EVENTOS" : null);
      if (paidExperience && !["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA"].includes(serviceCode)) throw httpError(400, "El servicio de entrega no es válido");
      const paymentMethod = assertDigitalCustomerPayment(req.body.paymentMethod);
      const items = (req.body.items || []).map((entry) => {
        const menuItem = state.menuItems.find((item) => item.id === Number(entry.menuItemId) && item.active);
        if (!menuItem) throw httpError(400, "Producto no disponible");
        if (menuItem.salesEnabled !== true) throw httpError(409, `${menuItem.name} tiene la venta pausada`);
        const allowedServices = (Array.isArray(menuItem.availableFor) ? menuItem.availableFor : String(menuItem.availableFor || "").split(/[\s,|]+/)).map((value) => String(value).toUpperCase()).filter(Boolean);
        if (serviceCode !== "TERRAZA" && allowedServices.length && !allowedServices.includes(serviceCode)) throw httpError(409, `${menuItem.name} no está disponible para ${serviceCode}`);
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

app.post("/api/auth/login", staffLoginLimit, async (req, res, next) => {
  try {
    const state = await readState();
    // Se entra con el usuario (superadmin, recepcion, cocina…). El correo sigue aceptándose por compatibilidad.
    const identifier = String(req.body.username ?? req.body.email ?? "").trim().toLowerCase();
    const user = identifier ? state.users.find((item) => String(item.username || "").toLowerCase() === identifier || String(item.email || "").toLowerCase() === identifier) : null;
    const passwordAccepted = user?.passwordHash ? verifyStaffPassword(req.body.password, user.passwordHash) : req.body.password === demoStaffPassword;
    if (!user || user.status !== "ACTIVO" || !passwordAccepted) return res.status(401).json({ message: "Usuario o contraseña incorrectos, o la cuenta está deshabilitada" });
    await clearRateLimit("personal", `${req.ip}:${identifier}`);
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

// Resumen ejecutivo del Inicio: el servidor calcula todo (hora de Lima, imputación al servicio de origen) y el navegador solo dibuja.
app.get("/api/superadmin/home", async (req, res, next) => {
  try {
    if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Esta vista pertenece únicamente al Superadmin");
    const state = await readStateWithHistory(ownerHomeWindow(req.query, hotelDay(await readState())));
    const lowStock = state.inventory.filter((item) => isOperationalProduct(item) && item.stock <= item.minStock);
    const areaClosings = await Promise.all(CLOSING_AREAS.map(async ([area, name]) => ({ area, name, ...(await areaClosingStatus(state, area)) })));
    const todayLima = hotelToday(state); const payrollRows = await payrollExpenseRows(state, addDaysToDate(todayLima, -120), todayLima);
    const home = buildOwnerHome(state, req.query, { eventSpaces: eventSpaces(state), lowStock, payrollRows });
    // Un área que no cerró a la hora configurada queda en rojo en los pendientes del dueño (solo alerta, no bloquea nada).
    const unclosed = areaClosings.filter((item) => item.status === "SIN_CIERRE").map((item) => ({ key: `closing-${item.area}`, label: `${item.name} sin cierre del día`, detail: `Debía cerrar a las ${item.closingTime}`, count: 1, tone: "red", go: ["insumos", "necesidades"] }));
    // La dirección pública de la app del cliente (la misma que autoriza CORS), para el botón "Ver la app del cliente".
    res.json({ ...home, pending: [...unclosed, ...(home.pending || [])], areaClosings, links: { customerApp: process.env.CUSTOMER_URL || null } });
  } catch (error) { next(error); }
});

// Módulo Clientes del Superadmin: tablero + tabla del directorio, y el Perfil 360° con libro de consumo.
function requireSuperAdmin(req, res, next) { if (req.user.displayRole !== "SUPERADMIN") return res.status(403).json({ message: "Esta vista pertenece únicamente al Superadmin" }); next(); }
// Salud del sistema (Fase 2): tiempos de respuesta, errores, memoria, tamaño del estado vivo e historial.
// Cada copia del servidor responde con sus propios números (la página indica cuál contestó).
app.get("/api/superadmin/system-health", requireSuperAdmin, async (_req, res, next) => {
  try {
    const state = await readState();
    const [history, version, audit, database, instances, last5, last60] = await Promise.all([
      db.query("SELECT collection, COUNT(*)::int AS rows FROM history_records GROUP BY collection ORDER BY 2 DESC"),
      db.query("SELECT version, updated_at FROM app_state WHERE id = 1"),
      db.query("SELECT COUNT(*)::int AS rows FROM audit_log"),
      db.query("SELECT pg_database_size(current_database())::bigint AS bytes, (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections"),
      db.query("SELECT host, pid, started_at, last_seen, memory_mb, realtime_connections, shared_channel, last_seen > NOW() - INTERVAL '45 seconds' AS alive FROM server_instances WHERE last_seen > NOW() - INTERVAL '10 minutes' ORDER BY alive DESC, host"),
      clusterSnapshot(5), clusterSnapshot(60)
    ]);
    const memory = process.memoryUsage();
    res.json({
      instance: { host: hostname(), pid: process.pid, uptimeMinutes: Math.round(process.uptime() / 60), node: process.version },
      memoryMb: { rss: Math.round(memory.rss / 1048576), heap: Math.round(memory.heapUsed / 1048576) },
      state: { version: Number(version.rows[0].version), updatedAt: version.rows[0].updated_at, sizeKb: Math.round(JSON.stringify(state).length / 1024) },
      history: { total: history.rows.reduce((sum, row) => sum + row.rows, 0), byCollection: history.rows, audit: audit.rows[0].rows },
      database: { sizeMb: Math.round(Number(database.rows[0].bytes) / 1048576), connections: database.rows[0].connections, pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount } },
      realtime: { connections: io.engine.clientsCount, sharedChannel: busStatus().listening },
      // Todas las copias del servidor juntas (cada una guarda sus números por minuto en server_metrics).
      instances: instances.rows.map((row) => ({ host: row.host, alive: row.alive, memoryMb: row.memory_mb, connections: row.realtime_connections, sharedChannel: row.shared_channel, uptimeMinutes: Math.round((Date.now() - new Date(row.started_at).getTime()) / 60000), lastSeen: row.last_seen })),
      last5, last60
    });
  } catch (error) { next(error); }
});
app.get("/api/superadmin/approvals", requireSuperAdmin, async (_req, res, next) => { try { res.json(await buildOwnerApprovals(await readState())); } catch (error) { next(error); } });
app.get("/api/superadmin/audit/verify", requireSuperAdmin, async (_req, res, next) => {
  // La cadena completa vive en audit_log (el JSON guarda solo los registros más recientes).
  try { const { rows } = await db.query("SELECT entry FROM audit_log ORDER BY id DESC"); res.json(verifyAuditChain(rows.map((row) => row.entry))); } catch (error) { next(error); }
});
app.get("/api/superadmin/clients", requireSuperAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory({ all: true }); res.json(buildClientDirectory(state, req.query)); } catch (error) { next(error); }
});
app.get("/api/superadmin/clients/:id/profile", requireSuperAdmin, async (req, res, next) => {
  try {
    const state = await readStateWithHistory({ clientId: Number(req.params.id) });
    const profile = buildClientProfile(state, req.params.id);
    if (!profile) throw httpError(404, "Cliente no encontrado");
    res.json(profile);
  } catch (error) { next(error); }
});
app.post("/api/superadmin/clients/:id/notes", requireSuperAdmin, async (req, res, next) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) throw httpError(400, "Escribe el contenido de la nota");
    const result = await mutateState((state) => {
      const client = state.clients.find((item) => item.id === Number(req.params.id));
      if (!client) throw httpError(404, "Cliente no encontrado");
      // Las notas no tienen contador propio en `state.counters` (como pool/caja/movements): se identifican con la marca de tiempo.
      const note = { id: Date.now(), text: text.slice(0, 500), authorId: req.user.id, authorName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email, createdAt: now() };
      client.notes = [...(client.notes || []), note];
      audit(state, "CLIENTES", "NOTA", `${client.firstName} ${client.lastName}: ${note.text.slice(0, 80)}`, req.user.id);
      return note;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
app.delete("/api/superadmin/clients/:id/notes/:noteId", requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const client = state.clients.find((item) => item.id === Number(req.params.id));
      if (!client) throw httpError(404, "Cliente no encontrado");
      const before = (client.notes || []).length;
      client.notes = (client.notes || []).filter((note) => String(note.id) !== req.params.noteId);
      if (client.notes.length === before) throw httpError(404, "Nota no encontrada");
      audit(state, "CLIENTES", "ELIMINAR_NOTA", `${client.firstName} ${client.lastName}`, req.user.id);
      return { ok: true };
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.post("/api/superadmin/clients/merge", requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const merge = mergeClients(state, req.body.primaryId, req.body.duplicateId, req.user.id);
      audit(state, "CLIENTES", "FUSIONAR", `${merge.duplicate.name} (#${merge.duplicate.id}) → ${merge.primary.name} (#${merge.primary.id})`, req.user.id);
      return merge;
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Módulo Reservas del Superadmin: agenda unificada de Hospedaje, Piscina, Mirador, Terraza y
// Eventos. `buildReservationsOverview`/`buildReservationDetail` normalizan el estado y el pago
// entre los tres modelos (ver reservations-overview.js). Las acciones (confirmar, cancelar,
// reprogramar) siguen viviendo aquí porque dependen de la validación propia de cada modelo.
const upper = (value) => String(value || "").toUpperCase();
function findReservationRaw(state, type, id) {
  const collection = TYPE_COLLECTION[upper(type)];
  if (!collection) throw httpError(404, "Tipo de reserva no reconocido");
  const item = (state[collection] || []).find((row) => Number(row.id) === Number(id) && (collection !== "bookings" || upper(row.serviceCode) === upper(type)));
  if (!item) throw httpError(404, "Reserva no encontrada");
  return item;
}
app.get("/api/superadmin/reservations", requireSuperAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(await reservationsWindow(req.query)); res.json(buildReservationsOverview(state, req.query)); } catch (error) { next(error); }
});
// Resumen propio de Piscina (KPIs, ocupación por franja, aforo en vivo, estado de pago). Las
// acciones de su tabla/detalle usan las rutas :type/:id de abajo con type=PISCINA.
app.get("/api/superadmin/reservations/pool", requireSuperAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(buildPoolOverview(state, req.query)); } catch (error) { next(error); }
});
// Resumen propio de Mirador (KPIs, ocupación por franja, aforo en vivo, estado de pago y pagos
// Yape/Plin por verificar). Las acciones de su tabla/detalle usan las rutas :type/:id de abajo con
// type=MIRADOR; verificar un pago usa /api/service-bookings/:id/pay (ver ese endpoint).
app.get("/api/superadmin/reservations/mirador", requireSuperAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(buildMiradorOverview(state, req.query)); } catch (error) { next(error); }
});
// Resumen propio de Terraza (KPIs, ocupación por franja, aforo en vivo, reservas por zona real y
// pedidos anticipados). Las acciones de su tabla/detalle usan las rutas :type/:id de abajo con
// type=TERRAZA; no hay estado de pago porque la reserva de Terraza es gratuita.
app.get("/api/superadmin/reservations/terraza", requireSuperAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(buildTerrazaOverview(state, req.query)); } catch (error) { next(error); }
});
// Resumen propio de Eventos (KPIs, ciclo del evento, eventos por espacio, estado de pago). Las
// acciones de su detalle usan las rutas :type/:id de abajo con type=EVENTOS; el calendario y el
// formulario de alta/edición siguen en EventsPage.jsx (no es exclusivo del Superadmin).
app.get("/api/superadmin/reservations/eventos", requireSuperAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(buildEventsOverview(state, req.query)); } catch (error) { next(error); }
});
app.get("/api/superadmin/reservations/:type/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const state = await readStateWithItem(TYPE_COLLECTION[upper(req.params.type)] || "bookings", req.params.id);
    const detail = buildReservationDetail(state, req.params.type, req.params.id);
    if (!detail) throw httpError(404, "Reserva no encontrada");
    res.json(await withArchivedHistory(state, detail));
  } catch (error) { next(error); }
});
app.post("/api/superadmin/reservations/:type/:id/confirm", requireSuperAdmin, async (req, res, next) => {
  try {
    const type = upper(req.params.type);
    const result = await mutateState(async (state, client) => {
      await restoreWithDependents(state, client, TYPE_COLLECTION[type], req.params.id);
      const item = findReservationRaw(state, type, req.params.id);
      const before = upper(item.status);
      if (["CANCELADA", "CANCELADO", "COMPLETADA", "FINALIZADA", "CHECKED_IN", "NO_SHOW"].includes(before)) throw httpError(409, "Esta reserva ya no admite confirmarse");
      const after = type === "EVENTOS" ? "CONFIRMADO" : "CONFIRMADA";
      item.status = after;
      if (type === "HOSPEDAJE") { const booking = state.bookings.find((row) => row.id === item.id); if (booking) booking.status = after; }
      audit(state, "RESERVAS", "CONFIRMAR", item.code, req.user.id, [{ field: "estado", before, after }]);
      return buildReservationDetail(state, type, item.id);
    });
    res.json(result ? await withArchivedHistory(await readState(), result) : result);
  } catch (error) { next(error); }
});
app.post("/api/superadmin/reservations/:type/:id/cancel", requireSuperAdmin, async (req, res, next) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw httpError(400, "Escribe el motivo de la cancelación");
    const type = upper(req.params.type);
    const result = await mutateState(async (state, client) => {
      await restoreWithDependents(state, client, TYPE_COLLECTION[type], req.params.id);
      const item = findReservationRaw(state, type, req.params.id);
      const before = upper(item.status);
      if (["CANCELADA", "CANCELADO", "COMPLETADA", "FINALIZADA"].includes(before)) throw httpError(409, "Esta reserva ya no admite cancelarse");
      const after = type === "EVENTOS" ? "CANCELADO" : "CANCELADA";
      item.status = after;
      if (type === "HOSPEDAJE") { const booking = state.bookings.find((row) => row.id === item.id); if (booking) booking.status = after; }
      audit(state, "RESERVAS", "CANCELAR", `${item.code}: ${reason}`, req.user.id, [{ field: "estado", before, after }]);
      return buildReservationDetail(state, type, item.id);
    });
    res.json(result ? await withArchivedHistory(await readState(), result) : result);
  } catch (error) { next(error); }
});
app.post("/api/superadmin/reservations/:type/:id/reschedule", requireSuperAdmin, async (req, res, next) => {
  try {
    const type = upper(req.params.type);
    const result = await mutateState(async (state, client) => {
      await restoreWithDependents(state, client, TYPE_COLLECTION[type], req.params.id);
      const item = findReservationRaw(state, type, req.params.id);
      const status = upper(item.status);
      if (["CANCELADA", "CANCELADO", "COMPLETADA", "FINALIZADA", "CHECKED_IN", "NO_SHOW"].includes(status)) throw httpError(409, "Esta reserva ya no admite reprogramarse");

      if (type === "HOSPEDAJE") {
        const { checkInDate, checkOutDate } = req.body;
        if (dayDiff(checkInDate, checkOutDate) <= 0) throw httpError(400, "La fecha de salida debe ser posterior a la fecha de entrada");
        if (state.reservations.some((row) => row.id !== item.id && row.roomId === item.roomId && !["CANCELADA", "COMPLETADA", "NO_SHOW"].includes(row.status) && overlaps(checkInDate, checkOutDate, reservationDates(row).checkInDate, reservationDates(row).checkOutDate))) throw httpError(409, "La habitación ya está reservada en esas fechas");
        const before = { checkInDate: item.checkInDate, checkOutDate: item.checkOutDate };
        item.checkInDate = checkInDate; item.checkOutDate = checkOutDate; item.updatedAt = now();
        const booking = state.bookings.find((row) => row.id === item.id);
        if (booking) Object.assign(booking, { checkIn: checkInDate, checkOut: checkOutDate, date: checkInDate, slot: String(checkInDate).slice(11, 16) || booking.slot });
        audit(state, "RESERVAS", "REPROGRAMAR", item.code, req.user.id, [{ field: "fechas", before: `${before.checkInDate} → ${before.checkOutDate}`, after: `${checkInDate} → ${checkOutDate}` }]);
      } else if (type === "EVENTOS") {
        const { startsAt, endsAt } = req.body;
        if (new Date(endsAt) <= new Date(startsAt)) throw httpError(400, "La hora de fin debe ser posterior al inicio");
        if (state.events.some((row) => row.id !== item.id && row.spaceId === item.spaceId && !["CANCELADO"].includes(row.status) && overlaps(startsAt, endsAt, row.startsAt, row.endsAt))) throw httpError(409, "El espacio ya está reservado en ese horario");
        const before = { startsAt: item.startsAt, endsAt: item.endsAt };
        item.startsAt = startsAt; item.endsAt = endsAt; item.updatedAt = now();
        audit(state, "EVENTOS", "REPROGRAMAR", item.code, req.user.id, [{ field: "horario", before: `${before.startsAt} → ${before.endsAt}`, after: `${startsAt} → ${endsAt}` }]);
      } else {
        const { date, slot } = req.body;
        if (!date) throw httpError(400, "Indica la nueva fecha");
        const before = { date: item.date, slot: item.slot };
        item.date = date; if (slot) item.slot = slot; item.updatedAt = now();
        audit(state, "RESERVAS", "REPROGRAMAR", item.code, req.user.id, [{ field: "fecha", before: `${before.date} ${before.slot || ""}`.trim(), after: `${date} ${slot || item.slot || ""}`.trim() }]);
      }
      return buildReservationDetail(state, type, item.id);
    });
    res.json(result ? await withArchivedHistory(await readState(), result) : result);
  } catch (error) { next(error); }
});
app.post("/api/superadmin/reservations/:type/:id/pay", requireSuperAdmin, async (req, res, next) => {
  try {
    const type = upper(req.params.type);
    const result = await mutateState(async (state, client) => {
      await restoreWithDependents(state, client, TYPE_COLLECTION[type], req.params.id);
      const item = findReservationRaw(state, type, req.params.id);
      if (["CANCELADA", "CANCELADO", "COMPLETADA", "FINALIZADA"].includes(upper(item.status))) throw httpError(409, "Esta reserva ya no admite cobros");
      const balance = Number(item.balance || 0);
      const amount = Number(req.body.amount || balance);
      if (amount <= 0 || amount > balance) throw httpError(409, "Monto no válido para el saldo");
      // Hospedaje y Mirador dejan la operación Yape/Plin en verificación (ver
      // /api/service-bookings/:id/pay, que ya exige esta misma coincidencia) — sin este resguardo,
      // "Cobrar saldo" desde Reservas generales podría aprobar un monto distinto al comprobante real.
      if (["HOSPEDAJE", "MIRADOR"].includes(type) && item.paymentStatus === "PENDIENTE_VERIFICACION") {
        const method = String(req.body.method || "").toUpperCase();
        const reference = String(req.body.reference || "").trim();
        if (method !== item.paymentMethod || reference !== item.paymentReference || round(amount) !== round(Number(item.paymentRequested))) throw httpError(409, "Verifica el método, código y monto de la operación antes de aprobar el pago");
      }
      const payload = { amount, method: req.body.method || "EFECTIVO", concept: `Pago en caja ${item.code}` };
      if (type === "HOSPEDAJE") payload.reservationId = item.id;
      else if (type === "EVENTOS") payload.eventId = item.id;
      else payload.bookingId = item.id;
      const before = new Set(state.orders.map((order) => order.id));
      registerPayment(state, payload, req.user.id);
      // registerPayment actualiza el saldo, pero solo la reserva de Hospedaje necesita este empujón manual:
      // su `status` (a diferencia del de Piscina/Mirador/Terraza/Eventos) no forma parte de esa función.
      if (type === "HOSPEDAJE" && item.balance <= 0 && !["CHECKED_IN", "COMPLETADA", "CANCELADA", "NO_SHOW"].includes(upper(item.status))) item.status = "CONFIRMADA";
      await confirmOrdersInventory(client, state, state.orders.filter((order) => !before.has(order.id)), req.user.id);
      return buildReservationDetail(state, type, item.id);
    });
    res.json(result ? await withArchivedHistory(await readState(), result) : result);
  } catch (error) { next(error); }
});

// Devoluciones: el cliente tiene 24 h desde su pago para pedirla; Recepción solo registra la solicitud y solo el Superadmin la aprueba y devuelve (2 días hábiles).
const refundActor = (user) => ({ id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email, isOwner: isSuperAdmin(user) });
app.get("/api/refunds/candidates", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readState(); res.json({ windowHours: REFUND_WINDOW_HOURS, rows: buildRefundCandidates(state, req.query) }); } catch (error) { next(error); }
});
app.get("/api/refunds", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(listRefunds(state, refundActor(req.user))); } catch (error) { next(error); }
});
app.post("/api/refunds", requireReceptionAdmin, requireActiveStaffShift, async (req, res, next) => {
  try {
    const request = await mutateState((state) => {
      const item = createRefundRequest(state, req.body || {}, refundActor(req.user));
      audit(state, "DEVOLUCIONES", "SOLICITAR", `${item.code} · ${item.reservationCode}: S/ ${item.paid.toFixed(2)}${item.exception ? " · EXCEPCIÓN DEL DUEÑO" : ""} · ${item.reason}`, req.user.id, [{ field: "estado", before: null, after: item.status }]);
      return item;
    });
    res.status(201).json(request);
  } catch (error) { next(error); }
});
app.post("/api/refunds/:id/decision", requireSuperAdmin, async (req, res, next) => {
  try {
    const request = await mutateState((state) => {
      const item = decideRefund(state, req.params.id, req.body || {}, refundActor(req.user));
      const approved = item.status === "APROBADA";
      audit(state, "DEVOLUCIONES", approved ? "APROBAR" : "RECHAZAR", `${item.code} · ${item.reservationCode}: ${approved ? `devolver S/ ${item.refundAmount.toFixed(2)} de S/ ${item.paid.toFixed(2)}` : "rechazada"}${item.decisionNote ? ` · ${item.decisionNote}` : ""}`, req.user.id, [{ field: "estado", before: "SOLICITADA", after: item.status }]);
      return item;
    });
    res.json(request);
  } catch (error) { next(error); }
});
app.post("/api/refunds/:id/complete", requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await mutateState(async (state, client) => {
      const done = completeRefund(state, req.params.id, req.body || {}, refundActor(req.user));
      const item = done.request;
      audit(state, "DEVOLUCIONES", "DEVOLVER", `${item.code} · ${item.reservationCode}: S/ ${item.refundAmount.toFixed(2)} por ${item.returnMethod}${item.operationRef ? ` · operación ${item.operationRef}` : ""}`, req.user.id, [{ field: "estado", before: "APROBADA", after: item.status }]);
      audit(state, "RESERVAS", "CANCELAR", `${item.reservationCode}: devolución ${item.code}`, req.user.id, [{ field: "estado", before: done.statusBefore, after: done.statusAfter }]);
      // Cierre completo de la reserva cancelada: la cochera reservada vuelve a estar libre, los pedidos programados
      // que aún no se preparan se cancelan (liberando sus insumos) y cada boleta o factura se anula con su nota de crédito.
      const key = item.type === "EVENTOS" ? "eventId" : "bookingId";
      (state.cochera || []).filter((space) => space.status === "RESERVADO" && (space.entries || []).some((entry) => Number(entry[key]) === Number(item.refId))).forEach((space) => { space.entries = []; space.status = "LIBRE"; });
      for (const order of state.orders.filter((row) => Number(row[key]) === Number(item.refId) && row.status === "PENDIENTE")) {
        await transitionOrderInventory(client, state, order.id, "CANCELADO", req.user, { reason: `Devolución ${item.code}` }).catch((error) => console.error("No se pudo cancelar el pedido programado", order.code, error.message));
      }
      state.payments.filter((row) => Number(row[key]) === Number(item.refId)).forEach((row) => { row.refundCode = item.code; });
      const payments = state.payments.filter((row) => Number(row[key]) === Number(item.refId) && row.invoiceId);
      let pending = Number(item.refundAmount || 0);
      for (const payment of payments) {
        if (pending <= 0.001) break;
        await restoreFromHistory(state, client, [["facturacion", payment.invoiceId]]);
        const document = state.facturacion.find((row) => Number(row.id) === Number(payment.invoiceId));
        if (!document || document.status !== "ACEPTADO") continue;
        const available = round(Number(document.total) - Number(document.creditedAmount || 0));
        const amount = round(Math.min(available, pending));
        const full = amount + 0.001 >= available && !Number(document.creditedAmount || 0);
        const note = await issueCreditNote(state, document, { reasonCode: full ? "06" : "09", reason: `Devolución ${item.code}: ${item.reason || "reserva cancelada"}`, amount, refundId: item.id }, req.user.id, () => nextId(state, "invoice"));
        pending = round(pending - amount);
        item.creditNotes = [...(item.creditNotes || []), note.fullNumber];
        audit(state, "FACTURACION", "NOTA_CREDITO", `${note.fullNumber} sobre ${document.fullNumber} · S/ ${note.total.toFixed(2)} · devolución ${item.code}`, req.user.id);
      }
      return item;
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.get("/api/attendance/current", async (req, res, next) => {
  try {
    const state = await readState(); const today = hotelToday(state);
    const record = [...state.attendance].reverse().find((item) => Number(item.employeeId || item.userId) === Number(req.user.id) && String(item.date || item.checkIn || item.clockIn).slice(0, 10) === today && (item.checkIn || item.clockIn) && !(item.checkOut || item.clockOut));
    const shift = record ? state.shifts.find((item) => Number(item.id) === Number(record.shiftId)) : state.shifts.find((item) => Number(item.employeeId || item.userId) === Number(req.user.id) && item.date === today && !["FINALIZADO", "CANCELADO"].includes(item.status));
    const cash = state.payments.filter((item) => String(item.createdAt).slice(0, 10) === today && ["EFECTIVO", "CAJA HOTEL"].includes(item.method)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const latest = [...state.attendance].reverse().find((item) => Number(item.employeeId || item.userId) === Number(req.user.id) && attendanceDateOf(item) === today);
    const todayRecord = latest ? { checkIn: latest.checkIn || latest.clockIn || null, checkOut: latest.checkOut || latest.clockOut || null, status: latest.status || null } : null;
    res.json({ active: isSuperAdmin(req.user) || Boolean(record), record: record || null, todayRecord, shift: shift || null, cash: isSuperAdmin(req.user) || isReceptionAdmin(req.user) ? round(cash) : 0, date: today });
  } catch (error) { next(error); }
});
app.post("/api/realtime/ping", (_req, res) => res.json({ ok: true, at: Date.now() }));

app.get("/api/admin/menu-items", requireInventoryAdmin, async (req, res, next) => {
  try {
    const state = await readState();
    const operationalRecipes = (await Promise.all([operationalRecipeManual("RESTAURANTE"), operationalRecipeManual("BARTENDER")])).flat();
    const operationalByMenu = new Map(operationalRecipes.filter((item) => item.menuItemId).map((item) => [Number(item.menuItemId), item]));
    const rows = state.menuItems
      .filter((item) => !req.query.area || item.area === req.query.area)
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
        // En qué servicios se puede pedir desde la app (antes no se podía cambiar después de crear el producto).
        availableFor: Array.isArray(req.body.availableFor) ? req.body.availableFor.map((code) => String(code).toUpperCase()).filter((code) => ["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"].includes(code)) : (item.availableFor || []),
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
      const snapshotBefore = priceSnapshot(state);
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
      const priceChanges = diffSnapshots(snapshotBefore, priceSnapshot(state));
      for (const change of priceChanges) audit(state, "PRECIOS", "CAMBIO", describeChange(change), req.user.id, [change]);
      if (!priceChanges.length) audit(state, "COMERCIAL", "ACTUALIZAR_EXPERIENCIA", "Contenido o imágenes de venta actualizados", req.user.id);
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

app.get("/api/service-bookings", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(listWindow(req.query, await readState())); const rows = sortRecent(state.bookings.filter((item) => !req.query.serviceCode || item.serviceCode === req.query.serviceCode), req.query.order).map((item) => ({ ...item, client: state.clients.find((client) => client.id === item.clientId), payments: sortRecent(state.payments.filter((payment) => payment.bookingId === item.id), req.query.order), entitlement: state.entitlements.find((entry) => entry.bookingId === item.id) })); res.json(rows); } catch (error) { next(error); }
});
app.post("/api/service-bookings/:id/pay", requireActiveStaffShift, async (req, res, next) => {
  try { const result = await mutateState(async (state, client) => { const booking = state.bookings.find((item) => item.id === Number(req.params.id)); if (!booking) throw httpError(404, "Reserva de servicio no encontrada"); if (booking.refundHold) throw httpError(409, `Esta reserva tiene una devolución en trámite (${booking.refundHold}); no se cobran saldos hasta resolverla.`); const amount = Number(req.body.amount || booking.balance); if (amount <= 0 || amount > booking.balance) throw httpError(409, "Monto no válido para el saldo"); const method = String(req.body.method || "EFECTIVO").toUpperCase(); const reference = String(req.body.reference || "").trim(); if (booking.serviceCode === "MIRADOR" && booking.paymentStatus === "PENDIENTE_VERIFICACION") { if (method !== booking.paymentMethod || reference !== booking.paymentReference || round(amount) !== round(Number(booking.paymentRequested))) throw httpError(409, "Verifica el método, código y monto de la operación antes de aprobar el pago"); } const before=new Set(state.orders.map((order)=>order.id));const payment=registerPayment(state, { bookingId: booking.id, clientId: booking.clientId, amount, method, reference, concept: `Pago ${booking.code}`, area: "RECEPCION" }, req.user.id);await confirmOrdersInventory(client,state,state.orders.filter((order)=>!before.has(order.id)),req.user.id);return payment; }); res.status(201).json(result); } catch (error) { next(error); }
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
      // clientId se guarda directo (antes solo quedaba el pase): así el Perfil 360° puede contar visitas y
      // accesos de Piscina, Mirador, Terraza y Eventos, no solo las estadías de Hospedaje.
      const log = { id, clientId: client.id, passId: pass.id, entitlementId: entitlement.id, serviceCode: entitlement.serviceCode, people: entitlement.people, employeeId: req.user.id, validatedAt: entitlement.usedAt };
      state.accessLogs.push(log); audit(state, "ACCESOS", "VALIDAR", `${pass.code} ${entitlement.serviceCode} ${entitlement.people} personas`, req.user.id);
      return { valid: true, client: { firstName: client.firstName, lastName: client.lastName, documentNumber: client.documentNumber }, entitlement, log };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.get("/api/access/logs", requireReceptionAdmin, async (req, res, next) => { try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(state.accessLogs); } catch (error) { next(error); } });

app.patch("/api/orders/:id/status", requireOrderOperator, async (req, res, next) => {
  try {
    if (isReceptionAdmin(req.user)) throw httpError(403, "El Admin de recepción puede supervisar pedidos, pero no cambiar su producción");
    const order = await mutateState(async (state, client) => { const item = await transitionOrderInventory(client, state, req.params.id, req.body.status, req.user, req.body); audit(state, "PEDIDOS", "ESTADO", `${item.code}: ${item.status}`, req.user.id); return item; });
    res.json(order);
  } catch (error) { next(error); }
});
app.get("/api/orders/:id/inventory", async (req, res, next) => { try { const state=await readStateWithItem("orders", req.params.id);const order=state.orders.find((item)=>Number(item.id)===Number(req.params.id));if(!order)throw httpError(404,"Pedido no encontrado");if(isReceptionAdmin(req.user) || (!isSuperAdmin(req.user)&&roleName(req.user)!==order.area))throw httpError(403,"No puedes consultar el detalle de inventario de esta área");res.json(withoutMoney(req.user, await getOrderInventoryDetail(req.params.id))); } catch (error) { next(error); } });
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
    await clearRateLimit("reloj", attendanceAttemptKey(req));
    res.json(result);
  } catch (error) { next(error); }
});
// Planilla semanal: solo se paga el día validado (entrada + salida + evidencia, o aprobado por el dueño). Los pendientes se muestran aparte.
app.get("/api/payroll/weekly", requireFullAdministration("consultar planilla"), async (req, res, next) => {
  try {
    const base = await readState(); const from = String(req.query.from || base.settings.today).slice(0, 10); const to = addDaysToDate(from, 6);
    const state = await readStateWithHistory({ from, to });
    const days = await validatedDays(state, from, to);
    res.json(state.employees.map((employee) => {
      const scheduled = state.shifts.filter((item) => item.employeeId === employee.id && item.date >= from && item.date <= to && item.source !== "ASISTENCIA").length;
      const mine = days.get(Number(employee.id)) || { validated: 0, pending: 0, notValidated: 0 };
      return { employeeId: employee.id, employee: `${employee.firstName} ${employee.lastName}`, dailyRate: employee.dailyRate, scheduledDays: scheduled, attendedDays: mine.validated + mine.pending + mine.notValidated, absences: Math.max(0, scheduled - (mine.validated + mine.pending + mine.notValidated)), payableDays: mine.validated, pendingDays: mine.pending, notValidatedDays: mine.notValidated, ...(() => { const gross = mine.validated * employee.dailyRate; const late = lateDiscount(state, employee.id, from, to, gross); return { grossTotal: gross, ...late, total: Math.round((gross - late.discountAmount) * 100) / 100 }; })(), pendingTotal: mine.pending * employee.dailyRate };
    }));
  } catch (error) { next(error); }
});
// Fase 3: torre de control (solo Superadmin).
app.get("/api/superadmin/control-tower", requireSuperAdmin, async (req, res, next) => { try { res.json(await controlTower(await readStateWithHistory(towerWindow(req.query, await readState())), { date: req.query.date, days: req.query.days })); } catch (error) { next(error); } });
app.put("/api/superadmin/workforce-settings", requireSuperAdmin, async (req, res, next) => {
  try {
    const tolerance = Number(req.body?.toleranceMinutes); const minEvidence = Number(req.body?.minEvidence); const sla = Number(req.body?.alertSlaMinutes ?? workforceSettings(await readState()).alertSlaMinutes);
    const current = workforceSettings(await readState()); const lateThreshold = Number(req.body?.lateThreshold ?? current.lateThreshold); const lateDiscountPercent = Number(req.body?.lateDiscountPercent ?? current.lateDiscountPercent);
    if (!Number.isInteger(lateThreshold) || lateThreshold < 1 || lateThreshold > 20) throw httpError(400, "Las tardanzas para descontar deben ser un entero entre 1 y 20");
    if (!Number.isFinite(lateDiscountPercent) || lateDiscountPercent < 0 || lateDiscountPercent > 100) throw httpError(400, "El descuento debe estar entre 0 y 100 %");
    if (!Number.isInteger(sla) || sla < 5 || sla > 1440) throw httpError(400, "El plazo de atención de alertas debe ser entre 5 y 1440 minutos");
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 120) throw httpError(400, "La tolerancia debe ser un número entero de minutos entre 0 y 120");
    if (!Number.isInteger(minEvidence) || minEvidence < 0 || minEvidence > 50) throw httpError(400, "La evidencia mínima debe ser un número entero entre 0 y 50");
    res.json(await mutateState((state) => {
      const before = workforceSettings(state); state.settings ||= {};
      state.settings.punctualityToleranceMinutes = tolerance; state.settings.minDayEvidence = minEvidence; state.settings.alertSlaMinutes = sla; state.settings.lateThreshold = lateThreshold; state.settings.lateDiscountPercent = lateDiscountPercent;
      audit(state, "EQUIPO", "REGLAS_PERSONAL", "Tolerancia de puntualidad y evidencia mínima del día", req.user.id, [{ field: "tolerancia (min)", before: before.toleranceMinutes, after: tolerance }, { field: "evidencia mínima", before: before.minEvidence, after: minEvidence }, { field: "plazo de alertas (min)", before: before.alertSlaMinutes, after: sla }, { field: "tardanzas para descontar", before: before.lateThreshold, after: lateThreshold }, { field: "descuento por tardanzas (%)", before: before.lateDiscountPercent, after: lateDiscountPercent }]);
      return { toleranceMinutes: tolerance, minEvidence, alertSlaMinutes: sla, lateThreshold, lateDiscountPercent };
    }));
  } catch (error) { next(error); }
});
app.post("/api/superadmin/late-justifications", requireSuperAdmin, async (req, res, next) => {
  try {
    const employeeId = Number(req.body?.employeeId); const date = String(req.body?.date || ""); const reason = String(req.body?.reason || "").trim();
    if (reason.length < 8) throw httpError(400, "Escribe el motivo de la justificación (al menos 8 caracteres)");
    res.status(201).json(await mutateState((state) => {
      const employee = state.employees.find((item) => Number(item.id) === employeeId); if (!employee) throw httpError(404, "Empleado no encontrado");
      if (!lateEvents(state, date, date).some((event) => event.employeeId === employeeId)) throw httpError(409, "Ese día no tiene tardanza registrada para esa persona");
      state.lateJustifications ||= []; const item = { id: (state.counters.lateJustification = Number(state.counters.lateJustification || 0) + 1), employeeId, date, reason, decidedBy: req.user.id, decidedAt: now() };
      state.lateJustifications.push(item);
      audit(state, "EQUIPO", "JUSTIFICAR_TARDANZA", `${employee.firstName} ${employee.lastName} · ${date}: ${reason}`, req.user.id, [{ field: "tardanza", before: "sin justificar", after: "justificada" }]);
      return item;
    }));
  } catch (error) { next(error); }
});
app.post("/api/superadmin/day-validations", requireSuperAdmin, async (req, res, next) => {
  try {
    const employeeId = Number(req.body?.employeeId); const date = String(req.body?.date || ""); const decision = String(req.body?.decision || "").toUpperCase(); const reason = String(req.body?.reason || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, "Fecha no válida"); if (!["APROBADO", "RECHAZADO"].includes(decision)) throw httpError(400, "La decisión debe ser APROBADO o RECHAZADO");
    if (reason.length < 8) throw httpError(400, "Escribe el motivo (al menos 8 caracteres): queda en la auditoría");
    res.status(201).json(await mutateState((state) => {
      const employee = state.employees.find((item) => Number(item.id) === employeeId); if (!employee) throw httpError(404, "Empleado no encontrado");
      if (!state.attendance.some((row) => Number(row.employeeId || row.userId) === employeeId && String(row.date || "").slice(0, 10) === date && (row.checkIn || row.clockIn))) throw httpError(409, "Ese día no tiene marcación: no hay nada que validar");
      state.dayValidations ||= []; const item = { id: (state.counters.dayValidation = Number(state.counters.dayValidation || 0) + 1), employeeId, date, decision, reason, decidedBy: req.user.id, decidedAt: now() };
      state.dayValidations.push(item);
      audit(state, "EQUIPO", "VALIDAR_DIA", `${employee.firstName} ${employee.lastName} · ${date}: ${decision}. ${reason}`, req.user.id, [{ field: "día", before: "pendiente", after: decision.toLowerCase() }]);
      return item;
    }));
  } catch (error) { next(error); }
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
      const hasFinancialRecords = state.payments.some((item) => item.clientId === clientId || bookingIds.includes(item.bookingId) || bookingIds.includes(item.reservationId) || stayIds.includes(item.stayId)) || state.facturacion.some((item) => item.clientId === clientId || bookingIds.includes(item.bookingId) || bookingIds.includes(item.reservationId));
      if (hasFinancialRecords) throw httpError(409, "No se puede eliminar: el cliente tiene pagos o comprobantes registrados. Bloquéalo o finaliza sus servicios; los registros contables no se destruyen.");
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

app.get("/api/reservations", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readState(); res.json(sortRecent(state.reservations, req.query.order).map((item) => hydrateReservation(state, item))); } catch (error) { next(error); }
});
app.post("/api/reservations", requireReceptionAdmin, async (req, res, next) => {
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
app.put("/api/reservations/:id", requireReceptionAdmin, async (req, res, next) => {
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
      const linkedBooking = state.bookings.find((row) => row.id === item.id);
      const previousAdvance = Math.max(Number(item.advance || 0), Number(linkedBooking?.paid || 0));
      if (advance < previousAdvance) throw httpError(409, "No puedes reducir un pago ya registrado. Realiza una corrección de Caja con trazabilidad.");
      const balance = round(Math.max(0, totalPrice - advance));
      const paymentStatus = balance <= 0 ? "PAGADO" : advance > 0 ? "PARCIAL" : item.paymentMethod === "CAJA HOTEL" ? "PENDIENTE_CAJA" : "PENDIENTE";
      Object.assign(item, req.body, { clientId, roomId, totalPrice, advance, balance, paymentStatus, updatedAt: now() });
      const booking = state.bookings.find((row) => row.id === item.id);
      if (booking) Object.assign(booking, { clientId, roomId, checkIn: item.checkInDate, checkOut: item.checkOutDate, date: dateKey(item.checkInDate), total: totalPrice, paid: advance, balance, paymentStatus, status: item.status });
      const receivedNow = round(advance - previousAdvance);
      if (receivedNow > 0) state.payments.push(attachCashSession(state, { id: nextId(state, "payment"), bookingId: item.id, reservationId: item.id, clientId, amount: receivedNow, method: req.body.paymentMethod || "EFECTIVO", concept: `Pago en Caja ${item.code}`, area: "RECEPCION", status: "APROBADO", createdAt: now() }, req.user.id));
      audit(state, "RESERVAS", "EDITAR", item.code, req.user.id);
      return hydrateReservation(state, item);
    });
    res.json(result);
  } catch (error) { next(error); }
});
app.delete("/api/reservations/:id", requireReceptionAdmin, async (req, res, next) => {
  try { const result = await mutateState((state) => { const item = state.reservations.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Reserva no encontrada"); if (!isSuperAdmin(req.user) && Number(item.advance ?? item.paid ?? 0) > 0) throw httpError(409, "Esta reserva ya tiene pagos. Registra una solicitud de devolución (Caja de recepción › Devoluciones): solo el dueño la cancela y devuelve el dinero."); item.status = "CANCELADA"; const booking = state.bookings.find((row) => row.id === item.id); if (booking) booking.status = "CANCELADA"; audit(state, "RESERVAS", "CANCELAR", item.code, req.user.id); return hydrateReservation(state, item); }); res.json(result); } catch (error) { next(error); }
});

app.get("/api/checkin/search", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readState(); const needle = String(req.query.search || "").toLowerCase(); res.json(sortRecent(state.reservations, req.query.order).map((item) => hydrateReservation(state, item)).filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle))); } catch (error) { next(error); }
});
app.post("/api/checkin", requireActiveStaffShift, async (req, res, next) => {
  try {
    const stay = await mutateState((state) => {
      const reservation = state.reservations.find((item) => item.id === Number(req.body.reservationId));
      if (!reservation) throw httpError(404, "Reserva no encontrada");
      if (reservation.stayId || reservation.status === "CHECKED_IN") throw httpError(409, "El check-in ya fue realizado");
      if (["CANCELADA", "COMPLETADA"].includes(reservation.status)) throw httpError(409, "La reserva no admite check-in");
      if (reservation.refundHold) throw httpError(409, `Esta reserva tiene una devolución en trámite (${reservation.refundHold}). El dueño debe resolverla antes del check-in.`);
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
app.get("/api/checkout/stays", requireReceptionAdmin, async (_req, res, next) => {
  try { const state = await readState(); res.json(state.stays.filter((item) => item.status === "ACTIVA").map((item) => hydrateStay(state, item))); } catch (error) { next(error); }
});
app.post("/api/checkout/inspect", requireActiveStaffShift, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const stay = state.stays.find((item) => item.id === Number(req.body.stayId));
      if (!stay || stay.status !== "ACTIVA") throw httpError(404, "Estadia activa no encontrada");
      const employeeId = Number(req.body.employeeId);
      const employee = state.employees.find((item) => Number(item.id) === employeeId);
      if (!employee || !isOperationalEmployeeAvailable(state, employee, "LIMPIEZA")) throw httpError(409, "Selecciona un trabajador de Limpieza disponible y con asistencia registrada.");
      createCheckoutInspectionTask(state, stay, employee, req.user.id);
      return hydrateStay(state, stay);
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/checkout", requireActiveStaffShift, async (req, res, next) => {
  try { const result = await mutateState((state) => { const stay = state.stays.find((item) => item.id === Number(req.body.stayId)); if (!stay || stay.status !== "ACTIVA") throw httpError(404, "Estadia activa no encontrada"); const inspection = state.tasks.filter((item) => Number(item.roomId) === Number(stay.roomId) && item.workflowType === "CHECKOUT_INSPECTION").sort((a, b) => Number(b.id) - Number(a.id))[0]; if (!inspection || !["FINALIZADA", "DANOS_REPORTADOS"].includes(inspection.status)) throw httpError(409, "Envía primero la alerta a Limpieza y espera el resultado de la revisión."); const damageAmount = Number(req.body.damageAmount || 0); if (inspection.status === "DANOS_REPORTADOS" && (!Number.isFinite(damageAmount) || damageAmount <= 0)) throw httpError(409, "Registra el monto por daños antes de finalizar el check-out."); const reservation = state.reservations.find((item) => item.id === stay.reservationId); const consumptions = state.orders.filter((item) => item.clientId === stay.clientId && item.roomId === stay.roomId && item.status !== "CANCELADO").reduce((sum, item) => sum + Number(item.total || 0), 0); const payments = state.payments.filter((item) => item.reservationId === reservation.id || item.bookingId === reservation.id || item.stayId === stay.id).reduce((sum, item) => sum + Number(item.amount || 0), 0); const due = Math.max(0, Number(reservation.totalPrice || 0) + consumptions - payments) + damageAmount; const paymentAmount = Number(req.body.paymentAmount || 0); if (paymentAmount + 0.001 < due) throw httpError(409, `Falta cobrar S/ ${round(due - paymentAmount)}`); if (paymentAmount > 0) state.payments.push(attachCashSession(state, { id: nextId(state, "payment"), stayId: stay.id, reservationId: reservation.id, bookingId: reservation.id, clientId: stay.clientId, amount: paymentAmount, method: req.body.paymentMethod || "EFECTIVO", concept: damageAmount > 0 ? `Cierre y daños ${reservation.code}` : `Cierre ${reservation.code}`, area: "RECEPCION", status: "APROBADO", createdAt: now() }, req.user.id)); if (damageAmount > 0) inspection.damageChargeAmount = damageAmount; const room = state.rooms.find((item) => Number(item.id) === Number(stay.roomId)); if (room) { room.status = "EN_LIMPIEZA"; createPostCheckoutCleaningTask(state, room, stay, inspection, req.user.id); } (state.cochera || []).filter((space) => (space.entries || []).some((entry) => Number(entry.bookingId) === Number(reservation.id))).forEach((space) => { space.entries = []; space.status = "LIBRE"; }); stay.status = "FINALIZADA"; stay.checkOutAt = now(); reservation.status = "COMPLETADA"; reservation.balance = 0; reservation.paymentStatus = "PAGADO"; const booking = state.bookings.find((item) => item.id === reservation.id); if (booking) { booking.status = "FINALIZADA"; booking.balance = 0; booking.paymentStatus = "PAGADO"; } state.entitlements.filter((item) => Number(item.bookingId) === Number(reservation.id) && item.serviceCode === "HOSPEDAJE").forEach((item) => { item.status = "FINALIZADO"; item.finishedAt = now(); }); audit(state, "CHECK_OUT", damageAmount > 0 ? "FINALIZAR_CON_DANOS" : "FINALIZAR_SIN_DANOS", reservation.code, req.user.id); return hydrateStay(state, stay); }); res.json(result); } catch (error) { next(error); }
});

// Aviso de la campana para Restaurante y Bar: solo cuántos pedidos de SU área van con retraso (sin ningún dato financiero).
app.get("/api/gastronomy/alerts", requireOrderOperator, async (req, res, next) => {
  try {
    const state = await readState(); const area = isSuperAdmin(req.user) ? null : roleName(req.user);
    const delayedOrders = state.orders.filter((item) => !["ENTREGADO", "CANCELADO"].includes(item.status) && (!area || item.area === area)).map((item) => withOrderTiming(item)).filter((item) => ["LATE", "ABANDONED"].includes(item.operationalBucket)).length;
    res.json({ delayedOrders });
  } catch (error) { next(error); }
});
app.get("/api/dashboard", requireReceptionAdmin, async (_req, res, next) => {
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
app.get("/api/rooms/:id/check-availability", requireReceptionAdmin, async (req, res, next) => { try { const state = await readState(); const excluded = Number(req.query.excludeReservationId || 0); const occupied = state.bookings.some((item) => Number(item.id) !== excluded && item.roomId === Number(req.params.id) && !["CANCELADA", "FINALIZADA", "COMPLETADA"].includes(item.status) && overlaps(req.query.checkIn, req.query.checkOut, item.checkIn, item.checkOut)); res.json({ available: !occupied, message: occupied ? "Habitación ocupada en esas fechas" : excluded ? "Habitación asignada a esta reserva" : "Habitación disponible" }); } catch (error) { next(error); } });
app.get("/api/clients/search", requireReceptionAdmin, resourceSearch("clients"));
app.get("/api/pool/client-search", requireReceptionAdmin, resourceSearch("clients"));
app.get("/api/roles/permissions", requireFullAdministration("consultar permisos"), async (_req, res, next) => { try { const state = await readState(); const map = new Map(); state.roles.flatMap((item) => item.permissions || []).forEach((permission) => map.set(permission.id, permission)); res.json([...map.values()].sort((a, b) => a.id - b.id)); } catch (error) { next(error); } });
app.get("/api/reports/products", requireFullAdministration("consultar costos e inventario global"), async (req, res, next) => { try { const state = await readState(); res.json(state.inventory.filter((item) => isOperationalProduct(item) && (!req.query.area || item.area === req.query.area))); } catch (error) { next(error); } });
app.get("/api/reports", requireReceptionAdmin, async (req, res, next) => { try { const state = await readStateWithHistory(listWindow(req.query, await readState())); const search = String(req.query.search || "").toLowerCase(); const rows = sortRecent(state.requests.filter((item) => (!req.query.area || item.area === req.query.area) && (!req.query.type || item.type === req.query.type) && (!req.query.priority || item.priority === req.query.priority) && (!req.query.status || item.status === req.query.status) && (!req.query.from || String(item.createdAt).slice(0, 10) >= req.query.from) && (!search || JSON.stringify(item).toLowerCase().includes(search))), req.query.order); res.json({ reports: rows, summary: summaryReports(rows) }); } catch (error) { next(error); } });
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
app.get("/api/operational-inventory/sessions", requireOperationalInventoryUser, async (req, res, next) => { try { res.json(withoutMoney(req.user, await listOperationalInventories(req.query, req.user))); } catch (error) { next(error); } });
app.get("/api/operational-inventory/sessions/:id", requireOperationalInventoryUser, async (req, res, next) => { try { res.json(withoutMoney(req.user, await getOperationalInventory(req.params.id, req.user))); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(await createOperationalInventory(req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/open", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await openOperationalInventory(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/start-count", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await startOperationalCount(req.params.id, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/waste", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(await registerOperationalWaste(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/submit", requireOperationalInventoryUser, requireActiveStaffShift, async (req, res, next) => { try { res.json(await submitOperationalCount(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/observe", requireInventoryAdmin, async (req, res, next) => { try { res.json(await observeOperationalInventory(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/close", requireInventoryAdmin, async (req, res, next) => { try { res.json(await closeOperationalInventory(req.params.id, req.user.id)); } catch (error) { next(error); } });
app.post("/api/operational-inventory/sessions/:id/reopen", requireInventoryAdmin, async (req, res, next) => { try { res.json(await reopenOperationalInventory(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.get("/api/bar/bottles/references", requireBarBottleUser, async (req,res,next)=>{try{res.json(withoutMoney(req.user,await barBottleReferences(req.user)));}catch(error){next(error);}});
app.get("/api/bar/bottles", requireBarBottleUser, async (req,res,next)=>{try{res.json(withoutMoney(req.user,await listBarBottles(req.user)));}catch(error){next(error);}});
app.post("/api/bar/bottles", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.status(201).json(withoutMoney(req.user,await openBarBottle(req.body,req.user.id)));}catch(error){next(error);}});
app.post("/api/bar/bottles/:id/serve", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.json(withoutMoney(req.user,await serveBarBottle(req.params.id,req.body,req.user.id)));}catch(error){next(error);}});
app.post("/api/bar/bottles/:id/measure", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.json(withoutMoney(req.user,await measureBarBottle(req.params.id,req.body,req.user.id)));}catch(error){next(error);}});
app.post("/api/bar/bottles/:id/close", requireBarBottleUser, requireActiveStaffShift, async (req,res,next)=>{try{res.json(withoutMoney(req.user,await closeBarBottle(req.params.id,req.body,req.user.id)));}catch(error){next(error);}});
app.get("/api/inventory-admin/references", requireInventoryAdmin, async (_req,res,next)=>{try{res.json(await inventoryAdminReferences());}catch(error){next(error);}});
app.get("/api/inventory-admin/dashboard", requireInventoryAdmin, async (req,res,next)=>{try{res.json(await inventoryAdminDashboard(req.query));}catch(error){next(error);}});
app.get("/api/stock-requests/references", requireStockRequestUser, async (_req,res,next)=>{try{res.json(await stockRequestReferences());}catch(error){next(error);}});
app.get("/api/stock-requests", requireStockRequestUser, async (req,res,next)=>{try{res.json(await listStockRequests(req.query,req.user));}catch(error){next(error);}});
// Fase 2: necesidades del día (Superadmin) y sugerencia del cierre (cada área ve solo la suya, sin costos).
app.get("/api/superadmin/daily-needs", requireInventoryAdmin, async (_req, res, next) => { try { res.json(await dailyNeeds(await readState())); } catch (error) { next(error); } });
app.get("/api/superadmin/food-cost", requireInventoryAdmin, async (req, res, next) => { try { res.json(await foodCostReport({ days: req.query.days })); } catch (error) { next(error); } });
app.post("/api/superadmin/daily-needs/purchase-order", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await purchaseOrderFromNeeds(await readState(), req.body, req.user.id)); } catch (error) { next(error); } });
import { moduleHub } from "./module-hub.js";
// Kardex real (inventory_movements): quién movió qué, de dónde a dónde y por qué.
app.get("/api/superadmin/stock-movements", requireSuperAdmin, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Math.trunc(Number(req.query.days)) || 30, 1), 365); const q = String(req.query.q || "").trim(); const type = String(req.query.type || "").trim();
    const rows = (await db.query(`SELECT m.id,m.created_at "at",m.movement_type "type",p.name "product",u.symbol "unit",m.quantity,m.unit_cost "unitCost",wf.name "from",wt.name "to",m.reason,m.source_code "sourceCode",m.actor_legacy_user_id "actorId",l.lot_code "lot"
      FROM inventory_movements m JOIN inventory_products p ON p.id=m.product_id JOIN inventory_units u ON u.id=p.base_unit_id LEFT JOIN inventory_warehouses wf ON wf.id=m.from_warehouse_id LEFT JOIN inventory_warehouses wt ON wt.id=m.to_warehouse_id LEFT JOIN inventory_lots l ON l.id=m.lot_id
      WHERE m.created_at>=NOW()-($1::int||' days')::interval AND ($2='' OR m.movement_type=$2) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR m.reason ILIKE '%'||$3||'%' OR COALESCE(m.source_code,'') ILIKE '%'||$3||'%')
      ORDER BY m.created_at DESC,m.id DESC LIMIT 400`, [days, type, q])).rows;
    const state = await readState(); const who = (id) => { const x = (state.users || []).find((u) => Number(u.id) === Number(id)); return x ? `${x.firstName || ""} ${x.lastName || ""}`.trim() : id ? `Usuario ${id}` : "Sistema"; };
    const types = (await db.query("SELECT movement_type t,COUNT(*) c FROM inventory_movements WHERE created_at>=NOW()-($1::int||' days')::interval GROUP BY 1 ORDER BY 2 DESC", [days])).rows;
    res.json({ days, types, rows: rows.map((r) => ({ ...r, quantity: Number(r.quantity), unitCost: Number(r.unitCost), actor: who(r.actorId) })) });
  } catch (error) { next(error); }
});
app.get("/api/superadmin/modules-overview", requireSuperAdmin, async (_req, res, next) => { try { res.json(await moduleHub(await readState())); } catch (error) { next(error); } });
app.put("/api/superadmin/closing-time", requireInventoryAdmin, async (req, res, next) => {
  try {
    const value = String(req.body?.closingTime || "");
    if (normalizeClosingTime(value) !== value) throw httpError(400, "Indica la hora de cierre con formato HH:MM (por ejemplo 23:00)");
    res.json(await mutateState((state) => {
      state.settings ||= {}; const before = normalizeClosingTime(state.settings.closingTime);
      state.settings.closingTime = value;
      audit(state, "INVENTARIO", "HORA_CIERRE", "Hora de cierre diario de las áreas", req.user.id, [{ field: "hora de cierre", before, after: value }]);
      return { closingTime: value };
    }));
  } catch (error) { next(error); }
});
app.get("/api/inventory-closing/suggestions", requireOperationalInventoryUser, async (req, res, next) => {
  try {
    const area = isSuperAdmin(req.user) ? String(req.query.area || "").toUpperCase() : roleName(req.user);
    if (!CLOSING_AREAS.some(([code]) => code === area)) throw httpError(400, "Área no válida");
    const state = await readState(); const client = await db.connect();
    try {
      const lines = (await areaNeeds(client, area, { timeZone: state.settings?.timezone || "America/Lima" })).filter((line) => line.justifiedQuantity > 0)
        .map(({ productId, productName, unitSymbol, areaStock, justifiedQuantity, soldUsagePerDay, minimumStock }) => ({ productId, productName, unitSymbol, areaStock, justifiedQuantity, soldUsagePerDay, minimumStock }));
      res.json({ area, closing: await areaClosingStatus(state, area), lines });
    } finally { client.release(); }
  } catch (error) { next(error); }
});
app.post("/api/stock-requests", requireStockRequestUser, requireActiveStaffShift, async (req,res,next)=>{try{res.status(201).json(await createStockRequest(req.body,req.user));}catch(error){next(error);}});
app.post("/api/stock-requests/:id/review", requireInventoryAdmin, async (req,res,next)=>{try{res.json(await reviewStockRequest(req.params.id,req.body,req.user));}catch(error){next(error);}});
app.get("/api/data-integrity", requireInventoryAdmin, async (_req,res,next)=>{try{res.json(await dataIntegrityReport());}catch(error){next(error);}});
app.post("/api/data-integrity/sanitize", requireInventoryAdmin, async (req,res,next)=>{try{res.json(await sanitizeDataIntegrity(req.user.id));}catch(error){next(error);}});
app.get("/api/technical-recipes/references", requireInventoryAdmin, async (_req, res, next) => { try { res.json(await technicalRecipeReferences()); } catch (error) { next(error); } });
app.get("/api/technical-recipes", requireInventoryAdmin, async (_req, res, next) => { try { res.json(await listTechnicalRecipes()); } catch (error) { next(error); } });
app.get("/api/technical-recipes/manual/:area", requireOperationalInventoryUser, async (req,res,next)=>{try{const area=String(req.params.area||"").toUpperCase();if(roleName(req.user)!=="ADMINISTRADOR"&&roleName(req.user)!==area)throw httpError(403,"Solo puedes consultar el manual de tu área");const manual=await operationalRecipeManual(area);res.json(withoutMoney(req.user,manual));}catch(error){next(error);}});
app.get("/api/technical-recipes/sales", requireInventoryAdmin, async (req, res, next) => { try { res.json(await listRecipeSales(req.query.recipeId)); } catch (error) { next(error); } });
app.get("/api/operational-recipes/:area", requireFoodOperationsUser, async (req, res, next) => { try { const area=String(req.params.area||"").toUpperCase(); if(roleName(req.user)!=="ADMINISTRADOR"&&roleName(req.user)!==area) throw httpError(403,"Solo puedes consultar el manual de tu área"); res.json(await operationalRecipeManual(area)); } catch (error) { next(error); } });
app.get("/api/technical-recipes/:id", requireInventoryAdmin, async (req, res, next) => { try { res.json(await getTechnicalRecipe(req.params.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createTechnicalRecipe(req.body, req.user.id)); } catch (error) { next(error); } });
app.put("/api/technical-recipes/:id/versions/:versionId", requireInventoryAdmin, async (req, res, next) => { try { res.json(await updateTechnicalRecipeDraft(req.params.id, req.params.versionId, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes/:id/versions", requireInventoryAdmin, async (req, res, next) => { try { res.status(201).json(await createTechnicalRecipeVersion(req.params.id, req.body, req.user.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes/:id/versions/:versionId/activate", requireInventoryAdmin, async (req, res, next) => { try { res.json(await activateTechnicalRecipeVersion(req.params.id, req.params.versionId, req.user.id)); } catch (error) { next(error); } });
app.post("/api/technical-recipes/:id/versions/:versionId/archive", requireInventoryAdmin, async (req, res, next) => { try { res.json(await archiveTechnicalRecipeVersion(req.params.id, req.params.versionId, req.user.id)); } catch (error) { next(error); } });
app.get("/api/transformations/references", requireTransformationUser, async (req, res, next) => { try { res.json(withoutCosts(req.user, await transformationReferences(req.user))); } catch (error) { next(error); } });
app.get("/api/transformations", requireTransformationUser, async (req, res, next) => { try { res.json(withoutCosts(req.user, await listTransformations())); } catch (error) { next(error); } });
app.get("/api/transformations/lots/:lotId/trace", requireTransformationUser, async (req, res, next) => { try { res.json(withoutCosts(req.user, await traceLot(req.params.lotId))); } catch (error) { next(error); } });
app.post("/api/transformations/processing", requireTransformationUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(withoutCosts(req.user, await completeProcessing(req.body, req.user.id))); } catch (error) { next(error); } });
app.post("/api/transformations/portioning", requireTransformationUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(withoutCosts(req.user, await completePortioning(req.body, req.user.id))); } catch (error) { next(error); } });
app.post("/api/transformations/production", requireTransformationUser, requireActiveStaffShift, async (req, res, next) => { try { res.status(201).json(withoutCosts(req.user, await completeProduction(req.body, req.user.id))); } catch (error) { next(error); } });
app.get("/api/inventory/production-dashboard", requireFoodOperationsUser, async (req, res, next) => {
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
app.get("/api/events/spaces", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); res.json(eventSpaces(state)); } catch (error) { next(error); } });
app.get("/api/configuracion", async (_req, res, next) => { try { const state = await readState(); res.json([state.settings]); } catch (error) { next(error); } });
app.get("/api/caja", requireCashAdmin, async (req, res, next) => { try { if (req.user.displayRole !== "SUPERADMIN") throw httpError(403, "Solo el Superadmin puede acceder al resumen global de caja."); const state = await readStateWithHistory(listWindow(req.query, await readState())); const paymentRows = state.payments.map((item) => ({ ...hydratePayment(state, item), type: "INGRESO" })); const movements = [...state.cashMovements, ...paymentRows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); const income = movements.filter((item) => item.type !== "EGRESO").reduce((sum, item) => sum + Number(item.amount), 0); const expenses = movements.filter((item) => item.type === "EGRESO").reduce((sum, item) => sum + Number(item.amount), 0); res.json({ summary: { income, expenses, balance: round(income - expenses) }, movements }); } catch (error) { next(error); } });

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

app.get("/api/cleaning/tasks", requireCleaningWorker, async (req, res, next) => { try { const state = await readState(); const rows = state.tasks.filter((item) => (item.assignedEmployeeId == null || Number(item.assignedEmployeeId) === Number(req.user.id)) && (!req.query.status || item.status === req.query.status)); res.json(withoutMoney(req.user, sortRecent(rows, req.query.order).map((item) => hydrateTask(state, item)))); } catch (error) { next(error); } });
app.patch("/api/cleaning/tasks/:id/start", requireCleaningWorker, requireActiveStaffShift, taskStatus("EN_LIMPIEZA"));
app.patch("/api/cleaning/tasks/:id/finish", requireCleaningWorker, requireActiveStaffShift, taskStatus("FINALIZADA"));
app.post("/api/cleaning/tasks/:id/evidence", requireCleaningWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const task = requireOwnedCleaningTask(state, req.params.id, req.user); const files = Array.isArray(req.body.files) ? req.body.files.filter((file) => String(file?.fileUrl || "").trim()) : []; if (!files.length) throw httpError(400, "Adjunta al menos una foto real como evidencia"); task.evidences ||= [];
  if (isGuestCleaningTask(task)) {
    if (task.evidences.length) throw httpError(409, "La evidencia del trabajo solicitado ya fue registrada.");
    task.evidences.push(...files.map((file, index) => ({ id: Date.now() + index, ...file, area: "SOLICITUD", stage: "TRABAJO_REALIZADO", description: String(req.body.description || "Trabajo realizado").trim(), createdAt: now(), uploadedById: req.user.id })));
    audit(state, "LIMPIEZA", "EVIDENCIA_SOLICITUD", task.code, req.user.id); return hydrateTask(state, task);
  }
  const area = String(req.body.area || "").trim().toUpperCase(); if (!["BAÑO", "CUARTO", "REFRI / DESPENSA"].includes(area)) throw httpError(400, "Selecciona el área fotografiada.");
  if (isCheckoutInspectionTask(task)) {
    if (task.status !== "EN_LIMPIEZA") throw httpError(409, "Inicia la revisión antes de registrar evidencias.");
    if (task.evidences.some((item) => String(item.area || "").trim().toUpperCase() === area && String(item.stage || "").trim().toUpperCase() === "REVISION")) throw httpError(409, `La evidencia de revisión para ${area.toLowerCase()} ya fue registrada.`);
    task.evidences.push(...files.map((file, index) => ({ id: Date.now() + index, ...file, area, stage: "REVISION", description: String(req.body.description || `REVISIÓN: ${area.toLowerCase()} verificado`).trim(), createdAt: now(), uploadedById: req.user.id })));
    audit(state, "LIMPIEZA", "EVIDENCIA_REVISION_CHECKOUT", `${task.code}: ${area}`, req.user.id); return hydrateTask(state, task);
  }
  const stage = String(req.body.stage || "").trim().toUpperCase(); if (!["ENTRADA", "SALIDA"].includes(stage)) throw httpError(400, "Selecciona si la evidencia corresponde a entrada o salida."); const sameArea = task.evidences.filter((item) => String(item.area || "").trim().toUpperCase() === area); const entryExists = sameArea.some((item) => String(item.stage || "").toUpperCase() === "ENTRADA" || /entrada/i.test(item.description || item.notes || "")); const sameStageExists = sameArea.some((item) => String(item.stage || "").toUpperCase() === stage || (stage === "SALIDA" ? /salida/i.test(item.description || item.notes || "") : /entrada/i.test(item.description || item.notes || ""))); if (stage === "SALIDA" && !entryExists) throw httpError(409, "Registra primero la evidencia de entrada de esta área."); if (sameStageExists) throw httpError(409, `La evidencia de ${stage.toLowerCase()} para ${area.toLowerCase()} ya fue registrada.`); const entries = files.map((file, index) => ({ id: Date.now() + index, ...file, area, stage, description: req.body.description || `${stage}: Evidencia`, createdAt: now(), uploadedById: req.user.id })); task.evidences.push(...entries); audit(state, "LIMPIEZA", "EVIDENCIA", task.code, req.user.id); return hydrateTask(state, task); }); res.status(201).json(result); } catch (error) { next(error); } });
app.post("/api/cleaning/tasks/:id/report", requireCleaningWorker, requireActiveStaffShift, async (req, res, next) => { try { const result = await mutateState((state) => { const task = requireOwnedCleaningTask(state, req.params.id, req.user); const room = state.rooms.find((item) => Number(item.id) === Number(task.roomId)) || task.room; const checkoutInspection = isCheckoutInspectionTask(task); const files = Array.isArray(req.body.files) ? req.body.files.filter((file) => String(file?.fileUrl || file?.imageUrl || "").trim()) : [];
  if (checkoutInspection && (!files.length || !String(req.body.description || "").trim())) throw httpError(400, "Para reportar daños registra al menos una foto y una descripción.");
  const requiresMaintenance = !checkoutInspection && ["MANTENIMIENTO", "DANO_INFRAESTRUCTURA", "DANO_EQUIPO"].includes(req.body.type);
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
    cleaningTaskId: task.id,
    files
  });
  task.operationalReports ||= []; task.operationalReports.unshift(report);
  if (checkoutInspection) { task.status = "DANOS_REPORTADOS"; task.finishedAt = now(); }
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
// Recepción observa el aforo de los 5 servicios: mismo cálculo que el Inicio del Superadmin, pero SIN ventas, gastos ni utilidad.
app.get("/api/reception/occupancy", requireReceptionAdmin, async (_req, res, next) => {
  try {
    const state = await readStateWithHistory(ownerHomeWindow({ days: 1 }, hotelDay(await readState())));
    const home = buildOwnerHome(state, { days: 1 }, { eventSpaces: eventSpaces(state), lowStock: [] });
    res.json({
      generatedAt: home.generatedAt,
      kpis: { inside: home.kpis.inside },
      services: home.services.map(({ code, name, inside, capacity, estimated, reservationsToday }) => ({ code, name, inside, capacity, estimated, reservationsToday })),
      hourly: home.hourly, peakHour: home.peakHour,
      notes: (home.notes || []).filter((note) => /estimaci/i.test(note))
    });
  } catch (error) { next(error); }
});
// Personal en turno hoy (solo lectura): quién trabaja, dónde, de qué hora a qué hora y si ya marcó. Sin tarifas ni planilla.
app.get("/api/reception/on-shift", requireReceptionAdmin, async (_req, res, next) => {
  try {
    const state = await readState(); const today = hotelToday(state);
    const rows = state.shifts.filter((shift) => shift.date === today && shift.status !== "CANCELADO").map((shift) => {
      const employeeId = Number(shift.employeeId || shift.userId);
      const employee = state.employees.find((item) => Number(item.id) === employeeId);
      const record = [...state.attendance].reverse().find((item) => Number(item.employeeId || item.userId) === employeeId && attendanceDateOf(item) === today);
      const status = record?.checkOut ? "TERMINO" : record?.checkIn ? "EN_TURNO" : "POR_ENTRAR";
      return { shiftId: shift.id, employeeId, name: employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : "Sin asignar", area: shift.area || employee?.baseRole || employee?.role || null, start: shift.start || null, end: shift.end || null, status, checkIn: record?.checkIn || null, checkOut: record?.checkOut || null };
    }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.start).localeCompare(String(b.start)));
    res.json({ date: today, generatedAt: now(), rows });
  } catch (error) { next(error); }
});
// Admin de recepción: tablero del turno, planificación de habitaciones, buscador y agenda de reservas de los 5
// servicios (misma fila normalizada que el Superadmin, sin sus indicadores financieros globales). Ver reception-desk.js.
app.get("/api/reception/desk", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readState(); res.json(buildReceptionDesk(state, { userId: req.user.id })); } catch (error) { next(error); }
});
app.get("/api/reception/planning", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readState(); res.json(buildReceptionPlanning(state, { from: req.query.from, days: req.query.days })); } catch (error) { next(error); }
});
app.get("/api/reception/search", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readState(); res.json(buildReceptionSearch(state, req.query.q)); } catch (error) { next(error); }
});
app.get("/api/reception/reservations", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readStateWithHistory(await reservationsWindow(req.query)); const { summary, ...rest } = buildReservationsOverview(state, req.query); res.json({ ...rest, summary: { porConfirmar: summary.porConfirmar, personasHoy: summary.personasHoy, saldoPendiente: summary.saldoPendiente, proximos7Dias: summary.proximos7Dias, estadoPago: summary.estadoPago } }); } catch (error) { next(error); }
});
app.get("/api/reception/reservations/:type/:id", requireReceptionAdmin, async (req, res, next) => {
  try { const state = await readStateWithItem(TYPE_COLLECTION[upper(req.params.type)] || "bookings", req.params.id); const detail = buildReservationDetail(state, req.params.type, req.params.id); if (!detail) throw httpError(404, "Reserva no encontrada"); res.json(await withArchivedHistory(state, detail)); } catch (error) { next(error); }
});
app.get("/api/reception/tasks", requireReceptionAdmin, async (req, res, next) => { try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(sortRecent(state.tasks.filter((item) => !req.query.status || item.status === req.query.status), req.query.order).map((item) => hydrateTask(state, item))); } catch (error) { next(error); } });
app.get("/api/reception/cleaning-employees", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); const rows = availableOperationalEmployees(state, "LIMPIEZA").map(toOperationalEmployee); res.json(rows); } catch (error) { next(error); } });
app.get("/api/reception/maintenance-employees", requireReceptionAdmin, async (_req, res, next) => { try { const state = await readState(); const rows = availableOperationalEmployees(state, "MANTENIMIENTO").map(toOperationalEmployee); res.json(rows); } catch (error) { next(error); } });
app.patch("/api/reception/reports/:id/assign-maintenance", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const report = state.requests.find((item) => item.id === Number(req.params.id) && item.requiresMaintenance); if (!report) throw httpError(404, "Incidencia de mantenimiento no encontrada."); if (["RESUELTO", "SOLUCIONADO"].includes(report.status)) throw httpError(409, "No puedes reasignar una incidencia resuelta."); const employeeId = Number(req.body.employeeId); const employee = state.employees.find((item) => Number(item.id) === employeeId); if (!employee || roleName(employee) !== "MANTENIMIENTO" || !isOperationalEmployeeAvailable(state, employee, "MANTENIMIENTO") && Number(report.assignedMaintenanceEmployeeId) !== employeeId) throw httpError(409, "Selecciona un trabajador de Mantenimiento disponible y con asistencia registrada."); const acceptedAt = report.receptionAcceptedAt || now(); Object.assign(report, { assignedMaintenanceEmployeeId: employee.id, assignedMaintenanceTo: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(), assignedAt: now(), assignedById: req.user.id, receptionAcceptedAt: acceptedAt, receptionAcceptedById: req.user.id, updatedAt: now() }); audit(state, "MANTENIMIENTO", report.requiresReceptionAcceptance ? "ACEPTAR_Y_ASIGNAR" : "ASIGNAR", `${report.code}: ${report.assignedMaintenanceTo}`, req.user.id); return report; }); res.json(result); } catch (error) { next(error); } });
// Limpieza de habitación pedida por Recepción o el dueño (foto de entrada y salida por zona, como la de rutina).
app.post("/api/reception/tasks", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const room = state.rooms.find((item) => Number(item.id) === Number(req.body.roomId)); if (!room) throw httpError(400, "Elige la habitación."); const open = state.tasks.find((item) => Number(item.roomId) === Number(room.id) && !["FINALIZADA", "DANOS_REPORTADOS"].includes(item.status) && item.workflowType !== "CHECKOUT_INSPECTION" && !item.requestId); if (open) throw httpError(409, `La habitación ${room.number} ya tiene la limpieza ${open.code} abierta.`); const employeeId = Number(req.body.employeeId || 0); const employee = employeeId ? state.employees.find((item) => Number(item.id) === employeeId && roleName(item) === "LIMPIEZA") : null; if (employeeId && !employee) throw httpError(400, "Ese trabajador no es de Limpieza."); const id = nextId(state, "task"); const task = { id, code: code("LIM", id), roomId: room.id, room, serviceType: "LIMPIEZA", workflowType: "POST_CHECKOUT", description: String(req.body.description || "Limpieza de habitación").trim(), priority: ["BAJA", "MEDIA", "ALTA", "CRITICA"].includes(req.body.priority) ? req.body.priority : "MEDIA", status: "PENDIENTE", assignedEmployeeId: employee?.id || null, assignedTo: employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : null, assignedById: req.user.id, assignedAt: employee ? now() : null, receptionAcceptedAt: now(), receptionAcceptedById: req.user.id, requiresReceptionAcceptance: false, evidences: [], operationalReports: [], createdAt: now() }; state.tasks.push(task); audit(state, "LIMPIEZA", "CREAR_TAREA", `${task.code}: habitación ${room.number}`, req.user.id); return hydrateTask(state, task); }); res.status(201).json(result); } catch (error) { next(error); } });
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
app.patch("/api/reports/:id/status", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const report = state.requests.find((item) => item.id === Number(req.params.id)); if (!report) throw httpError(404, "Reporte no encontrado"); if (report.requiresMaintenance) throw httpError(409, "Las incidencias de mantenimiento deben cerrarse desde el flujo del técnico con evidencias de antes y después."); const status = String(req.body.status || "").toUpperCase(); if (!["EN_REVISION", "RESUELTO"].includes(status)) throw httpError(400, "Estado de reporte no permitido."); report.status = status; report.updatedAt = now(); if (status === "EN_REVISION") { report.startedAt ||= now(); report.assignedToId = req.user.id; report.assignedTo = { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName }; } if (status === "RESUELTO") { report.resolvedAt = now(); report.resolvedById = req.user.id; report.resolvedBy = { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName }; } audit(state, "REPORTES", "ESTADO", `${report.code}: ${report.status}`, req.user.id); return report; }); res.json(result); } catch (error) { next(error); } });
app.post("/api/reports/:id/evidence", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const report = state.requests.find((item) => item.id === Number(req.params.id)); if (!report) throw httpError(404, "Reporte no encontrado"); report.evidences ||= []; report.evidences.push(...(req.body.files || [])); return report; }); res.status(201).json(result); } catch (error) { next(error); } });

app.get("/api/inventory/movements", requireFullAdministration("consultar movimientos globales de inventario"), async (req, res, next) => { try { const state = await readStateWithHistory(listWindow(req.query, await readState())); res.json(sortRecent(state.inventoryMovements.filter((item) => (!req.query.area || item.product?.area === req.query.area) && (!req.query.productId || item.productId === Number(req.query.productId)) && (!req.query.type || item.type === req.query.type)), req.query.order)); } catch (error) { next(error); } });
app.post(["/api/inventory/entries", "/api/inventory/exits", "/api/inventory/adjustments"], requireFullAdministration("ajustar inventario global"), async (req, res, next) => { try { const movement = await mutateState((state) => { const product = state.inventory.find((item) => item.id === Number(req.body.productId)); if (!product) throw httpError(404, "Producto no encontrado"); const beforeQty = Number(product.stock); const type = req.path.endsWith("entries") ? "ENTRADA" : req.path.endsWith("exits") ? "SALIDA" : "AJUSTE"; const quantity = Number(req.body.quantity); const afterQty = type === "ENTRADA" ? beforeQty + quantity : type === "SALIDA" ? beforeQty - quantity : quantity; if (afterQty < 0) throw httpError(409, "Stock insuficiente"); product.stock = round(afterQty); if (req.body.cost) product.cost = Number(req.body.cost); const item = { id: nextId(state, "movement"), productId: product.id, product: { ...product }, type, quantity, beforeQty, afterQty: product.stock, reason: req.body.reason || "Movimiento manual", reference: req.body.reference || "", createdById: req.user.id, createdAt: now() }; state.inventoryMovements.unshift(item); audit(state, "INVENTARIO", type, product.name, req.user.id); return item; }); res.status(201).json(movement); } catch (error) { next(error); } });

app.post("/api/cochera/entries", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const space = state.cochera.find((item) => item.id === Number(req.body.spaceId)); if (!space || space.status === "OCUPADO") throw httpError(409, "Espacio no disponible"); const entry = { id: Date.now(), ...req.body, spaceId: space.id, clientId: req.body.clientId ? Number(req.body.clientId) : null, startedAt: now(), status: "ACTIVO" }; space.status = "OCUPADO"; space.entries = [hydrateParkingEntry(state, entry)]; audit(state, "COCHERA", "INGRESO", `${space.code} ${entry.plate}`, req.user.id); return space; }); res.status(201).json(result); } catch (error) { next(error); } });
app.patch("/api/cochera/entries/:id/finish", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const space = state.cochera.find((item) => item.entries?.some((entry) => entry.id === Number(req.params.id))); if (!space) throw httpError(404, "Ingreso vehicular no encontrado"); const entry = space.entries.find((item) => item.id === Number(req.params.id)); entry.status = "FINALIZADO"; entry.finishedAt = now(); space.entries = []; space.status = "LIBRE"; audit(state, "COCHERA", "SALIDA", space.code, req.user.id); return space; }); res.json(result); } catch (error) { next(error); } });

app.patch("/api/compras/:id/receive", (_req, res) => res.status(410).json({ message: "La recepción automática fue retirada: registra cantidades físicas en Compras y recepción.", endpoint: "/api/purchasing/orders/:id/receipts" }));
app.post("/api/compras", (_req, res) => res.status(410).json({ message: "Usa el flujo trazable de órdenes de compra.", endpoint: "/api/purchasing/orders" }));

// El dueño corrige a qué servicio (y categoría) pertenece un gasto: así la rentabilidad por servicio queda completa.
app.patch("/api/caja/movements/:id/service", requireSuperAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const item = (state.cashMovements || []).find((row) => String(row.id) === String(req.params.id)); if (!item) throw httpError(404, "Movimiento no encontrado"); const serviceCode = String(req.body.serviceCode || "").toUpperCase(); if (![...HOME_SERVICES.map((row) => row.code), "GENERAL"].includes(serviceCode)) throw httpError(400, "Elige el servicio (o General si es compartido)"); const category = req.body.category ? String(req.body.category).toUpperCase() : item.category; if (item.type === "EGRESO" && category && !EXPENSE_CATEGORIES.includes(category)) throw httpError(400, "La categoría del gasto no es válida"); const before = `${item.serviceCode || "SIN_ASIGNAR"}/${item.category || "—"}`; item.serviceCode = serviceCode; if (item.type === "EGRESO") item.category = category || "OTROS"; item.updatedAt = now(); audit(state, "CAJA", "REASIGNAR_SERVICIO", `${item.concept || "Movimiento"}: ${before} → ${serviceCode}/${item.category || "—"}`, req.user.id); return item; }); res.json(result); } catch (error) { next(error); } });
app.post("/api/caja/movements", requireReceptionAdmin, async (req, res, next) => {
  try {
    const result = await mutateState((state) => {
      const type = String(req.body.type || "").toUpperCase();
      if (!["INGRESO", "EGRESO"].includes(type)) throw httpError(400, "Elige si el movimiento es un ingreso o un egreso");
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, "El monto debe ser mayor a cero");
      const serviceCode = String(req.body.serviceCode || "").toUpperCase();
      if (![...HOME_SERVICES.map((item) => item.code), "GENERAL"].includes(serviceCode)) throw httpError(400, "Indica a qué servicio corresponde el movimiento (o General si es compartido)");
      const category = type === "EGRESO" ? String(req.body.category || "OTROS").toUpperCase() : null;
      if (category && !EXPENSE_CATEGORIES.includes(category)) throw httpError(400, "La categoría del gasto no es válida");
      const activeSession = (state.cashSessions || []).find((session) => session.userId === req.user.id && session.status === "ABIERTA");
      const item = { id: Date.now(), ...req.body, type, serviceCode, category, amount, createdAt: now(), sessionId: activeSession ? activeSession.id : null, createdById: req.user.id };
      state.cashMovements.unshift(item);
      audit(state, "CAJA", type, `${item.concept || "Movimiento"} · ${serviceCode} · S/ ${amount.toFixed(2)}`, req.user.id);
      return item;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
const EDITABLE_SETTINGS = ["hotelName", "currency", "timezone", "taxRate", "address", "phone", "email", "ruc", "legalName", "yapeNumber", "plinNumber", "payHolder", "fiscalAddress", "ubigeo", "district", "province", "department", "receiptSeries", "invoiceSeries"];
app.put("/api/configuracion", requireFullAdministration("editar la configuración global"), async (req, res, next) => { try { const result = await mutateState((state) => { const before = { ...state.settings }; const incoming = Object.fromEntries(EDITABLE_SETTINGS.filter((key) => req.body?.[key] !== undefined).map((key) => [key, req.body[key]])); const taxRate = Number(incoming.taxRate ?? state.settings.taxRate); if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw httpError(400, "El IGV debe estar entre 0 y 100"); for (const key of ["yapeNumber", "plinNumber"]) { if (incoming[key] === undefined) continue; incoming[key] = String(incoming[key] || "").replace(/\D/g, ""); if (incoming[key] && !/^9\d{8}$/.test(incoming[key])) throw httpError(400, "El número de Yape o Plin es un celular de 9 dígitos que empieza con 9"); } if (incoming.payHolder !== undefined) incoming.payHolder = String(incoming.payHolder || "").trim().slice(0, 80); if (incoming.ruc !== undefined) { incoming.ruc = String(incoming.ruc || "").replace(/\D/g, ""); if (incoming.ruc && !isValidRuc(incoming.ruc)) throw httpError(400, "El RUC no es válido: revisa los 11 dígitos (el último es verificador)"); } if (incoming.ubigeo !== undefined) { incoming.ubigeo = String(incoming.ubigeo || "").replace(/\D/g, ""); if (incoming.ubigeo && !/^\d{6}$/.test(incoming.ubigeo)) throw httpError(400, "El ubigeo tiene 6 dígitos (Callería, Coronel Portillo: 250101)"); } for (const [key, letter] of [["receiptSeries", "B"], ["invoiceSeries", "F"]]) { if (incoming[key] === undefined) continue; incoming[key] = String(incoming[key] || "").trim().toUpperCase(); if (incoming[key] && !new RegExp(`^${letter}[A-Z0-9]{3}$`).test(incoming[key])) throw httpError(400, `La serie de ${letter === "B" ? "boletas" : "facturas"} tiene 4 caracteres y empieza con ${letter} (por ejemplo ${letter}001)`); } state.settings = { ...state.settings, ...incoming, taxRate, updatedAt: now() }; const changes = EDITABLE_SETTINGS.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(state.settings[key])).map((key) => ({ label: `Configuración · ${key}`, before: before[key] ?? null, after: state.settings[key] ?? null, unit: "valor" })); if (changes.length) audit(state, "CONFIGURACION", "EDITAR", changes.map((item) => `${item.label}: ${JSON.stringify(item.before)} → ${JSON.stringify(item.after)}`).join("; "), req.user.id, changes); return state.settings; }); res.json(result); } catch (error) { next(error); } });

app.post("/api/events", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => createEvent(state, req.body, req.user.id)); res.status(201).json(result); } catch (error) { next(error); } });
app.put("/api/events/:id", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const item = state.events.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Evento no encontrado"); const space = eventSpaces(state).find((row) => row.id === Number(req.body.spaceId ?? item.spaceId)); const client = state.clients.find((row) => row.id === Number(req.body.clientId ?? item.clientId)); if (!space || !client) throw httpError(400, "Cliente o espacio no válido"); if (["CANCELADO", "FINALIZADO"].includes(item.status)) throw httpError(409, "Un evento cancelado o finalizado ya no se edita"); if (Number(req.body.guests || item.guests) > space.capacity) throw httpError(409, `El aforo máximo es ${space.capacity}`); const conflict = state.events.some((row) => row.id !== item.id && row.spaceId === space.id && row.status !== "CANCELADO" && overlaps(req.body.startsAt, req.body.endsAt, row.startsAt, row.endsAt)); if (conflict) throw httpError(409, "El espacio ya esta reservado en ese horario"); const price = Number(req.body.price ?? item.price); if (!Number.isFinite(price) || price < Number(item.advance || 0)) throw httpError(400, `El precio no puede ser menor a lo ya pagado (S/ ${Number(item.advance || 0).toFixed(2)})`); const { advance: _ignoredAdvance, balance: _ignoredBalance, status: _ignoredStatus, ...changes } = req.body; Object.assign(item, changes, { clientId: client.id, client, spaceId: space.id, space, price, balance: round(price - Number(item.advance || 0)), updatedAt: now() }); audit(state, "EVENTOS", "EDITAR", item.code, req.user.id); return item; }); res.json(result); } catch (error) { next(error); } });
app.patch("/api/events/:id/status", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const item = state.events.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Evento no encontrado"); const nextStatus = String(req.body.status || "").toUpperCase(); if (!["COTIZACION", "RESERVADO", "CONFIRMADO", "FINALIZADO", "CANCELADO"].includes(nextStatus)) throw httpError(400, "Estado de evento no válido"); if (nextStatus === "CANCELADO" && !isSuperAdmin(req.user) && Number(item.advance || 0) > 0) throw httpError(409, "Este evento ya tiene pagos. Registra una solicitud de devolución (Caja de recepción › Devoluciones): solo el dueño lo cancela y devuelve el dinero."); item.status = nextStatus; item.updatedAt = now(); audit(state, "EVENTOS", "ESTADO", `${item.code}: ${item.status}`, req.user.id); return item; }); res.json(result); } catch (error) { next(error); } });
app.post("/api/events/:id/payments", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState(async (state,client) => { const item = state.events.find((row) => row.id === Number(req.params.id)); if (!item) throw httpError(404, "Evento no encontrado"); const amount = Number(req.body.amount); if (amount <= 0 || amount > item.balance) throw httpError(409, "Monto de pago no valido"); const payment = attachCashSession(state, { id: nextId(state, "payment"), eventId: item.id, clientId: item.clientId, amount, method: req.body.method || "EFECTIVO", reference: req.body.reference || "", concept: `Pago evento ${item.name}`, area: "EVENTOS", status: "APROBADO", createdAt: now() }, req.user.id); state.payments.push(payment); item.advance = round(Number(item.advance) + amount); item.balance = round(Number(item.price) - item.advance); const before=new Set(state.orders.map((order)=>order.id));if (item.balance <= 0) { item.status = "CONFIRMADO"; createEventCateringOrder(state, item); }await confirmOrdersInventory(client,state,state.orders.filter((order)=>!before.has(order.id)),req.user.id);audit(state, "PAGOS", "EVENTO", item.code, req.user.id); return hydratePayment(state, payment); }); res.status(201).json(result); } catch (error) { next(error); } });

app.post("/api/pagos", requireReceptionAdmin, async (req, res, next) => { try { const result = await mutateState(async (state,client) => {if (!isSuperAdmin(req.user) && !["reservationId", "bookingId", "eventId", "stayId"].some((key) => Number(req.body[key]) > 0)) throw httpError(400, "Todo cobro de Recepción debe estar ligado a una reserva, estadía o evento."); const before=new Set(state.orders.map((order)=>order.id));const payment=registerPayment(state,req.body,req.user.id);await confirmOrdersInventory(client,state,state.orders.filter((order)=>!before.has(order.id)),req.user.id);return payment;}); res.status(201).json(result); } catch (error) { next(error); } });
app.get("/api/facturacion/configuration", requireBillingAccess("canView", "consultar facturación electrónica"), (req, res, next) => {
  readState().then((state) => res.json({ ...electronicBillingConfiguration(state), access: electronicBillingAccess(req.user) })).catch(next);
});
app.post("/api/facturacion", requireBillingAccess("canIssue", "emitir comprobantes"), async (req, res, next) => {
  try {
    const result = await mutateState(async (state, client) => {
      await restoreFromHistory(state, client, [["payments", req.body.paymentId]]);
      const paid = state.payments.find((item) => Number(item.id) === Number(req.body.paymentId));
      if (paid?.invoiceId) await restoreFromHistory(state, client, [["facturacion", paid.invoiceId]]);
      const document = await issueElectronicDocument(state, req.body, req.user.id, () => nextId(state, "invoice"));
      audit(state, "FACTURACION", "EMITIR", `${document.fullNumber} · ${document.status} · pago #${document.paymentId}`, req.user.id);
      return hydrateInvoice(state, document);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
app.post("/api/facturacion/preview", requireBillingAccess("canIssue", "preparar comprobantes"), async (req, res, next) => {
  try { const state = await readStateWithItem("payments", req.body.paymentId); res.json(previewElectronicDocument(state, req.body.paymentId)); } catch (error) { next(error); }
});
app.get("/api/facturacion/:id/view", requireBillingAccess("canView", "ver comprobantes"), async (req, res, next) => {
  try { const state = await readStateWithItem("facturacion", req.params.id); const document = state.facturacion.find((item) => Number(item.id) === Number(req.params.id)); if (!document) throw httpError(404, "Comprobante no encontrado"); res.json(await electronicDocumentView(hydrateInvoice(state, document))); } catch (error) { next(error); }
});
app.post("/api/facturacion/:id/credit-note", requireBillingAccess("canVoid", "anular comprobantes con nota de crédito"), async (req, res, next) => {
  try {
    const result = await mutateState(async (state, client) => {
      await restoreFromHistory(state, client, [["facturacion", req.params.id]]);
      const original = state.facturacion.find((item) => Number(item.id) === Number(req.params.id));
      if (!original) throw httpError(404, "Comprobante no encontrado");
      const reason = String(req.body.reason || "").trim();
      if (reason.length < 5) throw httpError(400, "Escribe el motivo de la nota de crédito (mínimo 5 caracteres)");
      const note = await issueCreditNote(state, original, req.body, req.user.id, () => nextId(state, "invoice"));
      audit(state, "FACTURACION", "NOTA_CREDITO", `${note.fullNumber} sobre ${original.fullNumber} · S/ ${note.total.toFixed(2)} · ${note.reasonCode} ${reason}`, req.user.id);
      return hydrateInvoice(state, note);
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
    const state = await readStateWithItem("facturacion", req.params.id);
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
app.patch("/api/usuarios/:id/status", requireInventoryAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const user = state.users.find((item) => item.id === Number(req.params.id)); if (!user) throw httpError(404, "Trabajador no encontrado"); const status = String(req.body.status || "").toUpperCase(); if (!["ACTIVO", "INACTIVO"].includes(status)) throw httpError(400, "Estado no válido"); if (user.id === req.user.id && status !== "ACTIVO") throw httpError(409, "No puedes desactivar tu propia cuenta"); if (user.role === "SUPERADMIN" && status !== "ACTIVO" && !state.users.some((item) => item.id !== user.id && item.role === "SUPERADMIN" && item.status === "ACTIVO")) throw httpError(409, "Debe existir al menos un Superadmin activo"); user.status = status; user.updatedAt = now(); const employee = state.employees.find((item) => item.id === user.id); if (employee) Object.assign(employee, { status, updatedAt: user.updatedAt }); audit(state, "USUARIOS", status === "ACTIVO" ? "REACTIVAR" : "ARCHIVAR", user.email, req.user.id); return hydrateUser(state, user); }); res.json(result); } catch (error) { next(error); } });
app.put("/api/roles/:id/permissions", requireFullAdministration("cambiar permisos"), async (req, res, next) => { try { const result = await mutateState((state) => { const role = state.roles.find((item) => item.id === Number(req.params.id)); if (!role) throw httpError(404, "Rol no encontrado"); if (role.name === "SUPERADMIN") throw httpError(403, "El rol Superadmin tiene control total y sus permisos no se pueden modificar"); if (!Array.isArray(req.body?.permissionIds)) throw httpError(400, "Indica la lista de permisos (permissionIds)"); const beforeCodes = (role.permissions || []).map((permission) => permission.code); const catalog = state.roles.find((item) => item.name === "ADMINISTRADOR")?.permissions || []; role.permissions = catalog.filter((permission) => req.body.permissionIds.map(Number).includes(permission.id)); const afterCodes = role.permissions.map((permission) => permission.code); const permissionChanges = [...afterCodes.filter((code) => !beforeCodes.includes(code)).map((code) => ({ label: `${role.name} · permiso ${code}`, before: 0, after: 1, unit: "estado" })), ...beforeCodes.filter((code) => !afterCodes.includes(code)).map((code) => ({ label: `${role.name} · permiso ${code}`, before: 1, after: 0, unit: "estado" }))]; state.users.filter((user) => user.role === role.name).forEach((user) => { user.permissions = role.permissions.map((permission) => permission.code); }); audit(state, "ROLES", "PERMISOS", permissionChanges.length ? permissionChanges.map((item) => `${item.label} ${item.after ? "concedido" : "retirado"}`).join("; ") : `${role.name}: sin cambios`, req.user.id, permissionChanges); return hydrateRole(role); }); res.json(result); } catch (error) { next(error); } });

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
      const sessionUser = safeStaffUser(state, employee);
      const session = action === "INGRESO" ? {
        token: jwt.sign({ sub: employee.id, kind: "STAFF" }, jwtSecret, { expiresIn: "12h" }),
        user: sessionUser
      } : null;
      return { success: true, user: `${employee.firstName} ${employee.lastName}`.trim(), worker: { firstName: employee.firstName, lastName: employee.lastName, position: employee.position || employee.operationalArea || employee.baseRole || employee.role, photoUrl: employee.photoUrl || null }, action: action === "INGRESO" ? "CHECK_IN" : "CHECK_OUT", record, operationalSessionId: record.operationalSessionId || null, session };
    });
    await clearRateLimit("reloj", attendanceAttemptKey(req));
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
// Editar un proveedor (antes solo se podía crear). El cambio pasa al catálogo relacional de compras con la sincronización.
app.put("/api/proveedores/:id", requireSuperAdmin, async (req, res, next) => { try { const result = await mutateState((state) => { const supplier = (state.proveedores || []).find((item) => Number(item.id) === Number(req.params.id)); if (!supplier) throw httpError(404, "Proveedor no encontrado"); const before = { ...supplier }; for (const key of ["ruc", "name", "contact", "phone", "email", "status"]) if (req.body[key] !== undefined) supplier[key] = String(req.body[key] || "").trim(); if (!supplier.name) throw httpError(400, "El proveedor necesita un nombre"); supplier.updatedAt = now(); audit(state, "PROVEEDORES", "EDITAR", `${before.name} → ${supplier.name}`, req.user.id); return supplier; }); res.json(result); } catch (error) { next(error); } });
app.get("/api/auditoria", async (req, res, next) => {
  // La auditoría completa está en audit_log: se devuelven los más recientes (5 000 por defecto, hasta 20 000 con ?limit=).
  try {
    requireResourceRole(req, "auditoria");
    const state = await readState(), limit = Math.min(20000, Math.max(1, Number(req.query.limit) || 5000));
    const oldest = String(req.query.order || "").toLowerCase() === "oldest";
    const { rows } = await db.query(`SELECT entry FROM (SELECT entry, id, created_at FROM audit_log ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $1) recent ORDER BY created_at ${oldest ? "ASC" : "DESC"} NULLS LAST, id ${oldest ? "ASC" : "DESC"}`, [limit]);
    const userOf = (id) => { const user = state.users.find((item) => item.id === id); return user ? safeStaffUser(state, user) : null; };
    res.json(rows.map(({ entry }) => ({ ...entry, user: userOf(entry.userId) })));
  } catch (error) { next(error); }
});
// Listas que antes devolvían toda la historia: lo vivo más lo archivado de los últimos 90 días (o ?from=&to=).
// Las estaciones de cocina y bar (restaurante/bartender) solo necesitan lo vivo.
const HISTORY_LISTS = new Set(["events", "eventos", "orders", "pagos", "requests", "cleaning", "pool", "facturacion"]);
app.get("/api/:resource", async (req, res, next) => { try { const key = resourceMap[req.params.resource]; const state = HISTORY_LISTS.has(req.params.resource) ? await readStateWithHistory(listWindow(req.query, await readState())) : await readState(); if (!key) return res.status(404).json({ message: "Recurso no encontrado" }); requireResourceRole(req, req.params.resource); let rows = state[key]; if (["restaurante", "bartender"].includes(req.params.resource)) rows = rows.filter((item) => item.area === req.params.resource.toUpperCase()); if (req.params.resource === "products" && req.query.includeArchived !== "true") rows = rows.filter(isOperationalProduct); if (req.query.status) rows = rows.filter((item) => item.status === req.query.status); if (["clients", "events", "orders", "payments", "requests", "tasks", "facturacion", "cashMovements", "poolEntries", "compras", "audit"].includes(key)) rows = sortRecent(rows, req.query.order); const hydrators = { restaurante: (item) => hydrateOrder(state, item), bartender: (item) => hydrateOrder(state, item), orders: (item) => hydrateOrder(state, item), products: (item) => hydrateProduct(item), pagos: (item) => hydratePayment(state, item), facturacion: (item) => hydrateInvoice(state, item), usuarios: (item) => hydrateUser(state, item), roles: (item) => hydrateRole(item), auditoria: (item) => ({ ...item, user: state.users.find((user) => user.id === item.userId) ? safeStaffUser(state, state.users.find((user) => user.id === item.userId)) : null }), compras: (item) => ({ ...item, supplier: state.proveedores.find((supplier) => supplier.id === Number(item.supplierId)) }), cochera: (item) => ({ ...item, entries: (item.entries || []).map((entry) => hydrateParkingEntry(state, entry)) }) }; const hydrated = rows.map(hydrators[req.params.resource] || ((item) => item)); res.json(["restaurante", "bartender"].includes(req.params.resource) && ["RESTAURANTE", "BARTENDER"].includes(req.user.role) ? hydrated.map(forStation) : hydrated); } catch (error) { next(error); } });
app.post("/api/:resource", async (req, res, next) => { try { const key = resourceMap[req.params.resource]; if (!key) return res.status(404).json({ message: "Recurso no encontrado" }); if (["auditoria", "roles", "usuarios", "pagos", "facturacion", "compras", "products"].includes(req.params.resource)) return res.status(405).json({ message: "Este recurso solo se modifica desde su operación específica" }); requireResourceRole(req, req.params.resource); const item = await mutateState(async (state, client) => { const id = Math.max(0, ...state[key].map((row) => Number(row.id) || 0)) + 1; let value = { id, ...req.body, createdAt: now() }; if (["restaurante", "bartender", "orders"].includes(req.params.resource)) { value.items = (value.items || []).map(entry => { const found = state.menuItems.find(m => Number(m.id) === Number(entry.menuItemId)) || state.menuItems.find(m => m.code === entry.code); return found ? { ...entry, menuItemId: found.id, name: found.name, price: Number(found.price), area: found.area, recipe: found.recipe || [] } : entry; }); value.code = value.code || code("PED", id); value.area ||= req.params.resource === "bartender" ? "BARTENDER" : req.params.resource === "restaurante" ? "RESTAURANTE" : value.area; validateOrderSchema(state, value); } if (req.params.resource === "products") value = { ...value, categoryId: Number(req.body.categoryId || 1), stock: Number(req.body.stock || 0), reserved: 0, minStock: Number(req.body.minStock || 0), cost: Number(req.body.cost || 0), price: Number(req.body.price || 0) }; if (req.params.resource === "compras") value = { ...value, supplierId: Number(req.body.supplierId), items: (req.body.items || []).map((line) => ({ ...line, productId: Number(line.productId), quantity: Number(line.quantity), cost: Number(line.cost) })), total: round((req.body.items || []).reduce((sum, line) => sum + Number(line.quantity) * Number(line.cost), 0)), status: "PENDIENTE" }; state[key].push(value); audit(state, req.params.resource.toUpperCase(), "CREAR", String(value.name || value.code || value.id), req.user.id); if (["restaurante", "bartender", "orders"].includes(req.params.resource)) { await confirmOrdersInventory(client, state, [value], req.user.id); } return value; }); res.status(201).json(item); } catch (error) { next(error); } });
app.all("/api/*", (req, res) => res.status(404).json({ message: `La operacion ${req.method} ${req.path} aun no existe` }));

app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ message: error.status ? error.message : "Error interno del servidor", fieldErrors: error.fieldErrors, details: process.env.NODE_ENV === "production" ? undefined : error.stack }); });

async function clientAuth(req, res, next) { try { const payload = jwt.verify(req.headers.authorization?.replace(/^Bearer\s+/i, "") || "", jwtSecret); if (payload.kind !== "CLIENT") throw new Error(); const state = await readState(); const storedClient = state.clients.find((item) => item.id === Number(payload.sub)); if (!storedClient || ["BLOQUEADO", "INACTIVO"].includes(storedClient.status)) throw new Error(); req.client = publicClient(storedClient); next(); } catch { res.status(401).json({ message: "Identificación del cliente no válida o cuenta deshabilitada" }); } }
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
function requireFullAdministration(operation, message) { return async (req, res, next) => { if (!isSuperAdmin(req.user)) { void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation, reason: "Solo el Superadmin posee control central", status: 403 }); return res.status(403).json({ message }); } res.once("finish", () => { if (res.statusCode >= 200 && res.statusCode < 400) void writeSecurityAudit({ req, user: req.user, eventType: "API_OPERATION", operation, reason: "Operación autorizada", status: res.statusCode }); }); next(); }; }
function requireInventoryAdmin(req, res, next) { return requireFullAdministration("ADMIN_INVENTORY", "Solo el Superadmin puede administrar costos, recetas e inventario central")(req, res, next); }
function requireCashAdmin(req, res, next) { if (isSuperAdmin(req.user) || isReceptionAdmin(req.user)) return guarded("CASH_CLOSING", ["ADMINISTRADOR"], "Solo Administración puede cerrar la caja diaria")(req, res, next); return res.status(403).json({ message: "Solo Administración puede cerrar la caja diaria" }); }
function requireReceptionAdmin(req, res, next) { if (isSuperAdmin(req.user) || isReceptionAdmin(req.user)) return next(); void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation: "RECEPTION_OPERATION", reason: `Rol ${roleName(req.user) || "SIN_ROL"} no autorizado`, status: 403 }); return res.status(403).json({ message: "Solo el Admin de recepción o el Superadmin pueden realizar esta operación." }); }
function requireOrderOperator(req, res, next) { if (isSuperAdmin(req.user) || ["RESTAURANTE", "BARTENDER"].includes(roleName(req.user))) return next(); void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation: "ORDER_OPERATION", reason: `Rol ${roleName(req.user) || "SIN_ROL"} no autorizado`, status: 403 }); return res.status(403).json({ message: "Solo Restaurante, Bar o Superadmin pueden operar pedidos." }); }
function requireBillingAccess(capability, operation) {
  return async (req, res, next) => {
    if (!electronicBillingAccess(req.user)[capability]) {
      void writeSecurityAudit({ req, user: req.user, eventType: "AUTHORIZATION_REJECTED", operation: `BILLING_${operation}`, reason: "El perfil no posee esta responsabilidad de facturación", status: 403 });
      return res.status(403).json({ message: capability === "canRetry" ? "Solo el Superadmin puede reintentar envíos a SUNAT." : capability === "canVoid" ? "Solo el dueño puede anular comprobantes con nota de crédito." : "Solo Recepción o Superadmin pueden gestionar comprobantes." });
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
// La cocina registra cantidades y rendimientos, no dinero: todo campo con "cost" se quita de la respuesta salvo para el Superadmin.
// Cocina y Bar no ven costos ni precios (regla del dueño): se quitan de lo que consultan en su estación.
function withoutMoney(user, value) { return isSuperAdmin(user) ? value : JSON.parse(JSON.stringify(value), (key, item) => (/cost|price|(^|_)sale/i.test(key) ? undefined : item)); }
// Cocina y Bar solo necesitan qué preparar y para quién: sin precios, costos, totales ni la reserva del cliente.
function forStation(order) { const clean = JSON.parse(JSON.stringify(order), (key, item) => (/cost|price|(^|_)sale|^total$|amount|balance|^paid/i.test(key) || ["booking", "room", "payments"].includes(key) ? undefined : item)); if (clean.client) clean.client = { id: clean.client.id, firstName: clean.client.firstName, lastName: clean.client.lastName }; return clean; }
function withoutCosts(user, value) { return isSuperAdmin(user) ? value : JSON.parse(JSON.stringify(value), (key, item) => (/cost/i.test(key) ? undefined : item)); }
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
  const pass = { id: nextId(state, "pass"), clientId, code: `PP-${randomCode()}`, kind: "SERVICIO", serviceCode, bookingId, eventId, bundleCode: bundleCode || null, status: "ACTIVO", createdAt: now() };
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
/* Historial de una reserva: el JSON guarda solo la auditoría reciente; lo anterior se busca en audit_log por
   su código (los registros empiezan con él, p. ej. "RES-0150 pagado"). */
async function withArchivedHistory(state, detail) {
  if (!detail?.code) return detail;
  const { rows } = await db.query("SELECT entry FROM audit_log WHERE detail LIKE $1 ORDER BY created_at DESC LIMIT 300", [`${String(detail.code).replace(/[\\%_]/g, "\\$&")}%`]);
  const seen = new Set((state.audit || []).map((entry) => Number(entry.id)));
  const older = rows.map((row) => row.entry).filter((entry) => !seen.has(Number(entry.id))).map((entry) => {
    const user = (state.users || []).find((item) => Number(item.id) === Number(entry.userId));
    return { at: entry.createdAt, action: entry.action, detail: entry.detail, actorName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Sistema" };
  });
  if (!older.length) return detail;
  return { ...detail, history: [...(detail.history || []), ...older].sort((a, b) => String(b.at).localeCompare(String(a.at))) };
}
/* Ventanas de historial (Fase 1): el listado de reservas usa su rango (creadas en los últimos N días, más el
   período anterior para comparar) o todas; la torre de control, sus N días (14 por defecto, máximo 60). */
async function reservationsWindow(query = {}) {
  const range = String(query.range || "30");
  if (range === "todas" || range === "all") return { all: true };
  const days = Math.min(Math.max(Math.trunc(Number(range)) || 30, 1), 366);
  return { from: hotelDay(await readState(), -(2 * days - 1)) };
}
function towerWindow(query = {}, state) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || "")) ? String(query.date) : hotelDay(state);
  const span = Math.min(Math.max(Math.trunc(Number(query.days)) || 14, 1), 60);
  return { from: addDaysToDate(day, -(span + 1)), to: day };
}
function audit(state, module, action, detail, userId, changes) { const id = nextId(state, "audit"); sealAudit(state, { id, module, action, detail, userId, createdAt: now(), ...(Array.isArray(changes) && changes.length ? { changes } : {}) }); }
// Foto de todo lo que el Superadmin puede cambiar en Precios y servicios, para auditar "antes -> después".
function priceSnapshot(state) {
  const map = new Map();
  for (const service of state.services || []) {
    map.set(`${service.name} · precio base`, { value: Number(service.price || 0), unit: "S/" });
    if (service.capacity !== null && service.capacity !== undefined) map.set(`${service.name} · personas por horario`, { value: Number(service.capacity), unit: "personas" });
  }
  const seenTypes = new Set();
  for (const room of state.rooms || []) {
    const type = room.type?.name; if (!type || seenTypes.has(type)) continue; seenTypes.add(type);
    map.set(`Habitación ${type} · noche`, { value: Number(room.price || 0), unit: "S/" });
  }
  for (const [type, price] of Object.entries(state.settings?.parkingRates || {})) map.set(`Cochera ${type.toLowerCase()}`, { value: Number(price || 0), unit: "S/" });
  for (const [group, items] of Object.entries(experiencePricing(state))) {
    for (const item of items || []) {
      const label = `${item.name} (${group.replaceAll("_", " ").toLowerCase()})`;
      map.set(label, { value: Number(item.price || 0), unit: "S/" });
      map.set(`${label} · visible`, { value: item.active !== false ? 1 : 0, unit: "estado" });
    }
  }
  for (const space of eventSpaces(state)) {
    map.set(`Ambiente ${space.name} · precio base`, { value: Number(space.basePrice || 0), unit: "S/" });
    map.set(`Ambiente ${space.name} · capacidad`, { value: Number(space.capacity || 0), unit: "personas" });
  }
  return map;
}
function diffSnapshots(before, after) {
  const changes = [];
  for (const [label, next] of after) { const prev = before.get(label); if (!prev && next.unit === "estado" && next.value === 1) continue; if (!prev || prev.value !== next.value) changes.push({ label, before: prev ? prev.value : null, after: next.value, unit: next.unit }); }
  for (const [label, prev] of before) if (!after.has(label)) changes.push({ label, before: prev.value, after: null, unit: prev.unit });
  return changes;
}
function describeChange(change) {
  const show = (value) => value === null ? "—" : change.unit === "S/" ? `S/ ${Number(value).toFixed(2)}` : change.unit === "estado" ? (value ? "Visible" : "Oculto") : `${value} ${change.unit}`;
  return `${change.label}: ${show(change.before)} → ${show(change.after)}`;
}
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
  // Un solo inventario por área: si otro compañero ya tiene el turno abierto (o hay uno sin abrir de hoy), se usa ese.
  // Antes cada marcación creaba un turno PENDING nuevo y la estación mostraba "Por abrir" con el inventario ya abierto.
  const existing = (await client.query(`SELECT id,status,shift_code FROM inventory_shift_sessions WHERE warehouse_id=$1
    AND (status IN ('OPEN','OPERATING','COUNTING','REOPENED') OR (status='PENDING' AND operational_date=$2))
    ORDER BY CASE WHEN status='PENDING' THEN 1 ELSE 0 END, created_at DESC LIMIT 1`, [warehouse.id, date])).rows[0];
  if (existing) return { id: Number(existing.id), status: existing.status, area, shift: existing.shift_code };
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
    if (!scheduled) { const id = nextId(state, "shift"); scheduled = { id, employeeId, date, start: hotelClock(state, at), end: null, area: employee.baseRole || employee.role, status: "EN_CURSO", source: "ASISTENCIA" }; state.shifts.push(scheduled); }
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
  return { ...publicClient(client), reservations, serviceBookings, stays, events, passes, activeServices, accessStatus };
}

function hydrateStay(state, stay, includeReservation = true) {
  const reservation = state.reservations.find((item) => item.id === stay.reservationId);
  const checkoutTask = state.tasks.filter((item) => item.workflowType === "CHECKOUT_INSPECTION" && (Number(item.stayId) === Number(stay.id) || (Number(item.roomId) === Number(stay.roomId) && item.createdAt > stay.checkInAt))).sort((a, b) => b.id - a.id)[0] || null;
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
function createCheckoutInspectionTask(state, stay, employee, actorId) {
  const room = state.rooms.find((item) => Number(item.id) === Number(stay.roomId));
  if (!room) throw httpError(404, "Habitación no encontrada para la estadía.");
  const existing = state.tasks.find((item) => Number(item.stayId) === Number(stay.id) && item.workflowType === "CHECKOUT_INSPECTION" && !["FINALIZADA", "DANOS_REPORTADOS"].includes(item.status));
  if (existing) return existing;
  // La habitación sigue OCUPADA durante la revisión: el huésped aún no sale. Pasa a limpieza en el check-out.
  const taskId = nextId(state, "task");
  const task = { id: taskId, code: code("LIM", taskId), stayId: stay.id, clientId: stay.clientId, roomId: room.id, room, serviceType: "REVISION_CHECKOUT", workflowType: "CHECKOUT_INSPECTION", description: "Revisión rápida de habitación para confirmar check-out", assignedEmployeeId: employee.id, assignedTo: `${employee.firstName || ""} ${employee.lastName || ""}`.trim(), priority: "ALTA", status: "PENDIENTE", evidences: [], operationalReports: [], createdAt: now() };
  state.tasks.push(task);
  audit(state, "CHECK_OUT", "ALERTA_A_LIMPIEZA", `${task.code}: ${task.assignedTo}`, actorId);
  return task;
}
// Check-out cerrado: la habitación queda EN_LIMPIEZA con su tarea de limpieza completa (fotos de entrada y salida por
// zona). Al finalizarla, la habitación vuelve a LIBRE. Se asigna a quien hizo la revisión si sigue en turno.
function createPostCheckoutCleaningTask(state, room, stay, inspection, actorId) {
  const open = state.tasks.find((item) => Number(item.roomId) === Number(room.id) && item.workflowType === "POST_CHECKOUT" && !["FINALIZADA", "DANOS_REPORTADOS"].includes(item.status));
  if (open) return open;
  const inspector = state.employees.find((item) => Number(item.id) === Number(inspection?.assignedEmployeeId));
  const employee = inspector && isOperationalEmployeeAvailable(state, inspector, "LIMPIEZA") ? inspector : null;
  const id = nextId(state, "task");
  const task = { id, code: code("LIM", id), stayId: stay.id, roomId: room.id, room, serviceType: "LIMPIEZA", workflowType: "POST_CHECKOUT", description: `Limpieza después de la salida (${room.number || room.id})`, priority: "ALTA", status: "PENDIENTE", assignedEmployeeId: employee?.id || null, assignedTo: employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : null, assignedById: actorId, assignedAt: employee ? now() : null, receptionAcceptedAt: now(), receptionAcceptedById: actorId, requiresReceptionAcceptance: false, evidences: [], operationalReports: [], createdAt: now() };
  state.tasks.push(task);
  audit(state, "LIMPIEZA", "CREAR_TAREA", `${task.code}: habitación ${room.number || room.id} tras la salida`, actorId);
  return task;
}
function hasRequiredCleaningEvidence(evidences = []) {
  const areas = ["BAÑO", "CUARTO", "REFRI / DESPENSA"];
  const stageOf = (item) => {
    const stage = String(item?.stage || "").toUpperCase();
    return stage === "SALIDA" ? "SALIDA" : stage === "ENTRADA" ? "ENTRADA" : /salida/i.test(item?.description || item?.notes || "") ? "SALIDA" : "ENTRADA";
  };
  return areas.every((area) => ["ENTRADA", "SALIDA"].every((stage) => evidences.some((item) => String(item?.area || "").trim().toUpperCase() === area && stageOf(item) === stage)));
}
function isGuestCleaningTask(task) { return Boolean(task?.requestId) && task?.workflowType !== "POST_CHECKOUT"; }
function isCheckoutInspectionTask(task) { return task?.workflowType === "CHECKOUT_INSPECTION"; }
// La revisión de salida usa una sola foto verificable por zona; no representa una limpieza completa de entrada/salida.
function hasRequiredCheckoutInspectionEvidence(evidences = []) {
  const areas = ["BAÑO", "CUARTO", "REFRI / DESPENSA"];
  return areas.every((area) => evidences.some((item) => String(item?.area || "").trim().toUpperCase() === area && String(item?.stage || "").trim().toUpperCase() === "REVISION"));
}
function hasRequiredTaskEvidence(task) {
  if (isCheckoutInspectionTask(task)) return !(task.operationalReports || []).length && hasRequiredCheckoutInspectionEvidence(task?.evidences || []);
  if (isGuestCleaningTask(task)) return (task.evidences || []).some((item) => String(item?.description || "").trim() && String(item?.fileUrl || item?.imageUrl || "").trim());
  return hasRequiredCleaningEvidence(task?.evidences || []);
}
function hydrateParkingEntry(state, entry) { return { ...entry, client: state.clients.find((item) => item.id === Number(entry.clientId)) || entry.client || null }; }

function taskStatus(status) {
  return async (req, res, next) => {
    try { const result = await mutateState((state) => { const task = requireOwnedCleaningTask(state, req.params.id, req.user); const sourceRequest = state.requests.find((item) => item.id === Number(task.requestId)); if (status === "EN_LIMPIEZA" && task.requiresReceptionAcceptance && !task.receptionAcceptedAt) throw httpError(409, "Recepción debe aceptar esta solicitud del huésped antes de iniciar la limpieza."); if (status === "FINALIZADA" && !hasRequiredTaskEvidence(task)) throw httpError(409, isCheckoutInspectionTask(task) ? "Registra las fotos de revisión de cuarto, baño y despensa antes de confirmar." : isGuestCleaningTask(task) ? "Registra una foto y un comentario del trabajo realizado antes de finalizar." : "Registra las fotos de entrada y salida de cuarto, baño y despensa antes de finalizar."); task.status = status; if (status === "EN_LIMPIEZA") { const acceptedAt = now(); task.startedAt = acceptedAt; task.acceptedAt ||= acceptedAt; task.acceptedById = req.user.id; task.assignedEmployeeId = req.user.id; task.assignedTo = `${req.user.firstName} ${req.user.lastName}`.trim(); if (sourceRequest) sourceRequest.status = "EN_REVISION"; } if (status === "FINALIZADA") { task.finishedAt = now(); if (sourceRequest) { sourceRequest.status = "RESUELTO"; sourceRequest.resolvedAt = now(); } const room = state.rooms.find((item) => item.id === task.roomId); if (room && !task.requestId && !isCheckoutInspectionTask(task) && room.status === "EN_LIMPIEZA" && !state.stays.some((stay) => Number(stay.roomId) === Number(room.id) && stay.status === "ACTIVA")) room.status = "LIBRE"; } audit(state, "LIMPIEZA", status, task.code, req.user.id); return hydrateTask(state, task); }); res.json(result); } catch (error) { next(error); }
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
        if (status === "FINALIZADA" && !hasRequiredTaskEvidence(task)) throw httpError(409, isCheckoutInspectionTask(task) ? "Registra las fotos de revisión de cuarto, baño y despensa antes de confirmar." : isGuestCleaningTask(task) ? "Registra una foto y un comentario del trabajo realizado antes de finalizar." : "Registra las fotos de entrada y salida de cuarto, baño y despensa antes de liberar la habitación.");
        task.status = status;
        task.updatedAt = now();
        if (status === "EN_LIMPIEZA") task.startedAt ||= now();
        if (status === "FINALIZADA") {
          task.finishedAt = now();
          const sourceRequest = state.requests.find((item) => item.id === Number(task.requestId));
          if (sourceRequest) { sourceRequest.status = "RESUELTO"; sourceRequest.resolvedAt = now(); sourceRequest.resolvedById = req.user.id; }
          const room = state.rooms.find((item) => item.id === Number(task.roomId));
          if (room && !task.requestId && !isCheckoutInspectionTask(task) && room.status === "EN_LIMPIEZA" && !state.stays.some((stay) => Number(stay.roomId) === Number(room.id) && stay.status === "ACTIVA")) room.status = "LIBRE";
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
  if (!booking || ["CANCELADA", "FINALIZADA", "NO_SHOW"].includes(booking.status)) return false;
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
  TERRAZA: [{ code: "MESA", name: "Reserva de mesa", description: "La reserva no tiene costo; paga únicamente lo que pidas", price: 0 }],
  BAR: [{ code: "MESA_BAR", name: "Reserva en el bar", description: "La mesa no tiene costo; paga únicamente tus bebidas", price: 0 }],
  EXTRAS_HOSPEDAJE: [{ id: "EARLY", name: "Ingreso temprano", price: 45 }, { id: "LATE", name: "Salida tardía", price: 50 }, { id: "TOALLA", name: "Toalla adicional", price: 8 }],
  EXTRAS_PISCINA: [{ id: "TOALLA", name: "Toalla premium", price: 8 }, { id: "CAMASTRO", name: "Camastro reservado", price: 20 }, { id: "CABANA", name: "Cabaña familiar", price: 70 }],
  EXTRAS_MIRADOR: [{ id: "VENTANA", name: "Mesa junto a la vista", price: 20 }, { id: "DECORACION", name: "Detalle de celebración", price: 45 }],
  EQUIPO_EVENTO: [{ id: "SONIDO", name: "Sonido y micrófonos", price: 350 }, { id: "PROYECTOR", name: "Proyector y pantalla", price: 180 }, { id: "DECORACION", name: "Decoración temática", price: 500 }, { id: "DJ", name: "DJ por 4 horas", price: 650 }]
}; return { ...defaults, ...(state?.settings?.experiencePricing || {}) }; }
function roomTypeMedia(state) { return state?.settings?.roomTypeMedia && typeof state.settings.roomTypeMedia === "object" ? state.settings.roomTypeMedia : {}; }
function experienceMedia(state) {
  // Lugar = línea pequeña; título y segunda línea = el titular de la portada; imagen panorámica.
  const defaults = [
    { code: "HOSPEDAJE", place: "Hospedaje · Pucallpa", title: "Duerme con la selva", title2: "al otro lado de la ventana.", description: "Habitaciones con vista al jardín y todo el hotel a pasos: piscina, mirador y terraza.", imageUrl: "/images/v6/hospedaje-w.webp" },
    { code: "BAR", place: "Bar · de noche", title: "Cócteles con", title2: "la selva de fondo.", description: "Pisco, frutas amazónicas y una barra encendida hasta tarde.", imageUrl: "/images/v6/bar-w.webp" },
    { code: "PISCINA", place: "Piscina · de día", title: "Un día entero", title2: "junto al agua.", description: "Pases por turno con duchas, casilleros y pedidos a tu camastro.", imageUrl: "/images/v6/piscina-w.webp" },
    { code: "EVENTOS", place: "Eventos · a tu medida", title: "Tu celebración,", title2: "con la Amazonía de fondo.", description: "Cotiza en minutos: espacio, catering y equipo, con el total al instante.", imageUrl: "/images/v6/eventos-w.webp" },
    { code: "TERRAZA", place: "Terraza · mesa al aire libre", title: "Tu mesa bajo el cielo,", title2: "sin costo de reserva.", description: "Elige zona y hora; pagas solo lo que pidas.", imageUrl: "/images/v6/terraza-w.webp" },
    { code: "MIRADOR", place: "Mirador · al atardecer", title: "El Ucayali,", title2: "en su hora dorada.", description: "El atardecer sobre el río, con la selva como telón.", imageUrl: "/images/v6/mirador-w.webp" },
  ];
  const saved = Array.isArray(state?.settings?.experienceMedia) ? state.settings.experienceMedia : [];
  return defaults.map((item) => ({ ...item, ...(saved.find((entry) => entry.code === item.code) || {}) }));
}
function experienceCatalog(state) {
  const pricing = experiencePricing(state);
  return {
    plans: { HOSPEDAJE: pricing.HOSPEDAJE.filter((item) => item.active !== false), PISCINA: pricing.PISCINA.filter((item) => item.active !== false), MIRADOR: pricing.MIRADOR.filter((item) => item.active !== false), TERRAZA: pricing.TERRAZA.filter((item) => item.active !== false), BAR: pricing.BAR.filter((item) => item.active !== false) },
    extrasByService: { HOSPEDAJE: pricing.EXTRAS_HOSPEDAJE.filter((item) => item.active !== false), PISCINA: pricing.EXTRAS_PISCINA.filter((item) => item.active !== false), MIRADOR: pricing.EXTRAS_MIRADOR.filter((item) => item.active !== false), TERRAZA: [], BAR: [] },
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
  const preorderTotal = (Array.isArray(input.preorderItems) ? input.preorderItems.slice(0, 50) : []).reduce((sum, selected) => {
    const quantity = Number(selected.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw httpError(400, "La cantidad de un producto no es válida");
    const menu = state.menuItems.find((item) => Number(item.id) === Number(selected.menuItemId));
    if (!menu || menu.active === false || menu.salesEnabled !== true) throw httpError(409, "Uno de los productos elegidos ya no está disponible");
    const enabledFor = (Array.isArray(menu.availableFor) ? menu.availableFor : String(menu.availableFor || "").split(/[\s,|]+/)).map((value) => String(value).toUpperCase());
    const terraceDiningItem = input.serviceCode === "TERRAZA" && ["RESTAURANTE", "BARTENDER"].includes(menu.area);
    const barItem = input.serviceCode === "BAR" && menu.area === "BARTENDER";
    const belongsToService = input.serviceCode === "BAR" ? barItem : input.serviceCode === "TERRAZA" ? terraceDiningItem : enabledFor.includes(String(input.serviceCode || "").toUpperCase());
    if (!belongsToService) throw httpError(409, `${menu.name} no está habilitado para esta experiencia`);
    return sum + Number(menu.price || 0) * quantity;
  }, 0);
  const rates = state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 };
  const parkingTotal = (input.vehicles || []).reduce((sum, vehicle) => sum + Number(rates[vehicle.type] || 0), 0);
  let bundleTotal = 0;
  if (["HOSPEDAJE_PISCINA_MIRADOR", "HOSPEDAJE_PREMIUM"].includes(input.bundleCode)) {
    const pool = catalog.plans.PISCINA?.find((item) => item.code === "ADULTO");
    const lookout = catalog.plans.MIRADOR?.find((item) => item.code === "ACCESO");
    bundleTotal = (Number(pool?.price || 0) + Number(lookout?.price || 0)) * input.people * 0.9;
  }
  return { extrasTotal: round(extrasTotal), preorderTotal: round(preorderTotal), parkingTotal: round(parkingTotal), total: round(base + extrasTotal + preorderTotal + parkingTotal + bundleTotal) };
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
// Precio de un evento pedido desde la app: espacio + catering + equipo + cochera, con las tarifas del dueño.
// El navegador manda su estimado solo para mostrarlo; nunca se usa como precio (antes un evento podía reservarse por S/ 1).
function calculateEventPrice(state, body = {}) {
  const space = eventSpaces(state).find((item) => item.id === Number(body.spaceId));
  if (!space) throw httpError(400, "Elige un espacio válido para el evento");
  const guests = Number(body.guests);
  if (!Number.isInteger(guests) || guests < 1) throw httpError(400, "Indica cuántos invitados tendrá el evento");
  const startsAt = String(body.startsAt || ""), endsAt = String(body.endsAt || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startsAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(endsAt)) throw httpError(400, "Indica la fecha y las horas del evento");
  if (startsAt.slice(0, 10) < hotelToday(state)) throw httpError(400, "La fecha del evento no puede estar en el pasado");
  if (endsAt <= startsAt) throw httpError(400, "La hora de fin debe ser posterior a la de inicio");
  const catalog = experienceCatalog(state);
  const catering = (Array.isArray(body.catering) ? body.catering.slice(0, 60) : []).map((line) => {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw httpError(400, "La cantidad de un plato del catering no es válida");
    const menu = state.menuItems.find((item) => Number(item.id) === Number(line.menuItemId));
    if (!menu || menu.active === false || menu.salesEnabled !== true) throw httpError(409, "Uno de los platos del catering ya no está disponible");
    return { menuItemId: menu.id, name: menu.name, quantity, price: Number(menu.price || 0) };
  });
  const equipment = (Array.isArray(body.equipment) ? body.equipment : []).map((line) => {
    const item = catalog.eventEquipment.find((gear) => gear.id === (line?.id ?? line));
    if (!item) throw httpError(409, "Uno de los equipos elegidos ya no está disponible");
    return { id: item.id, name: item.name, price: Number(item.price || 0) };
  });
  const rates = state.settings?.parkingRates || { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 };
  const parking = (Array.isArray(body.vehicles) ? body.vehicles.slice(0, 8) : []).reduce((sum, vehicle) => sum + Number(rates[String(vehicle?.type || "AUTO").toUpperCase()] || 0), 0);
  const price = round(Number(space.basePrice || 0) + catering.reduce((sum, line) => sum + line.price * line.quantity, 0) + equipment.reduce((sum, line) => sum + line.price, 0) + parking);
  return { price, lines: { catering, equipment } };
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
  if (booking && !reservation) { booking.paid = Math.min(booking.total, round(Number(booking.paid || 0) + amount)); booking.balance = Math.max(0, round(Number(booking.total) - booking.paid)); booking.paymentStatus = booking.balance ? "PARCIAL" : "PAGADO"; booking.status = booking.balance ? "RESERVADA" : "CONFIRMADA"; booking.accessStatus = booking.balance ? "PENDIENTE_PAGO" : "LISTO_INGRESO"; if (!booking.balance) { state.entitlements.filter((entry) => entry.bookingId === booking.id).forEach((entry) => { entry.status = "LISTO_INGRESO"; }); if (booking.preorderItems?.length && !booking.orderIds?.length) booking.orderIds = createScheduledOrders(state, booking, booking.clientId); }
    // Hospedaje vive también en state.reservations (misma id): si no se sincroniza, Recepción ve "sin pagar" y al editar registra un cobro duplicado.
    const mirror = state.reservations.find((row) => row.id === booking.id); if (mirror) { mirror.advance = booking.paid; mirror.balance = booking.balance; mirror.paymentStatus = booking.paymentStatus; } }
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
  // El usuario es con lo que se entra (minúsculas, sin espacios). El correo es opcional.
  const existingUser = id ? state.users.find((item) => item.id === id) : null;
  const username = String(payload.username ?? existingUser?.username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw httpError(400, "El usuario debe tener de 3 a 30 letras o números, sin espacios (por ejemplo: recepcion2)");
  if (state.users.some((item) => item.id !== id && String(item.username || "").toLowerCase() === username)) throw httpError(409, "Ese usuario ya existe: elige otro");
  const email = String(payload.email || "").trim().toLowerCase();
  if (email && state.users.some((item) => item.id !== id && String(item.email || "").toLowerCase() === email)) throw httpError(409, "El correo ya esta registrado");
  payload = { ...payload, username, email };
  const documentNumber = String(payload.documentNumber || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(documentNumber)) throw httpError(400, "El DNI del trabajador debe tener exactamente 8 dígitos");
  if (state.users.some((item) => item.id !== id && String(item.documentNumber || "").replace(/\D/g, "") === documentNumber)) throw httpError(409, "Ya existe un trabajador con este DNI");
  let user = id ? state.users.find((item) => item.id === id) : null;
  if (id && !user) throw httpError(404, "Usuario no encontrado");
  if (user && user.role === "SUPERADMIN" && !state.users.some((item) => item.id !== user.id && item.role === "SUPERADMIN" && item.status === "ACTIVO") && (role.name !== "SUPERADMIN" || (payload.status || user.status || "ACTIVO") !== "ACTIVO")) throw httpError(409, "Debe existir al menos un Superadmin activo");
  if (!user) { const nextUserId = Math.max(0, ...state.users.map((item) => item.id)) + 1; user = { id: nextUserId }; state.users.push(user); }
  const { password, passwordHash: _ignoredPasswordHash, pin, pinHash: _ignoredPinHash, ...profile } = payload;
  if (!id && !String(password || "").trim()) throw httpError(400, "Asigna una contraseña temporal al nuevo trabajador");
  if (!id && !/^\d{4}$/.test(String(pin || ""))) throw httpError(400, "Asigna un PIN de asistencia de 4 dígitos al nuevo trabajador");
  if (String(pin || "") && !/^\d{4}$/.test(String(pin))) throw httpError(400, "El PIN de asistencia debe tener exactamente 4 dígitos");
  const beforeAccess = id ? { role: user.role, status: user.status } : null;
  Object.assign(user, profile, { documentNumber, roleId: role.id, role: role.name, permissions: role.permissions.map((item) => item.code), status: payload.status || user.status || "ACTIVO", username: payload.username, updatedAt: now() });
  if (String(password || "").trim()) {
    user.passwordHash = hashStaffPassword(password);
    user.passwordChangedAt = now();
  }
  if (String(pin || "")) {
    user.pinHash = hashAttendancePin(pin);
    delete user.pin;
    user.pinChangedAt = now();
  }
  if (role.name === "ADMINISTRADOR") { user.position ||= "ADMIN_RECEPCION"; user.operationalArea ||= "RECEPCION"; }
  let employee = state.employees.find((item) => item.id === user.id); if (!employee) { employee = { id: user.id, dailyRate: Number(payload.dailyRate || 60), attendanceStatus: "FUERA_DE_TURNO" }; state.employees.push(employee); }
  const { passwordHash: _employeePasswordHash, ...employeeProfile } = user;
  Object.assign(employee, employeeProfile, { baseRole: role.name, dailyRate: Number(payload.dailyRate || employee.dailyRate || 60) });
  if (user.pinHash) delete employee.pin;
  const accessChanges = beforeAccess ? [["role", "rol"], ["status", "estado"]].filter(([key]) => beforeAccess[key] !== user[key]).map(([key, name]) => ({ label: `${user.username || user.email} · ${name}`, before: beforeAccess[key] ?? null, after: user[key] ?? null, unit: "valor" })) : [];
  audit(state, "USUARIOS", id ? "EDITAR" : "CREAR", accessChanges.length ? `${user.username || user.email}: ${accessChanges.map((item) => `${item.label} ${item.before} → ${item.after}`).join("; ")}` : (user.username || user.email), actorId, accessChanges); return hydrateUser(state, user);
}

await initializeDatabase();
// Credenciales del personal (pedido del dueño, 2026-10-12): se entra con un usuario y la clave es el mismo usuario,
// sin correos. Se aplica UNA sola vez (settings.staffCredentialsVersion); si después el dueño cambia una clave desde
// Usuarios, no se vuelve a pisar.
const STAFF_CREDENTIALS = { "superadmin@parkplaza.com": "superadmin", "admin@parkplaza.com": "admin", "recepcion@parkplaza.com": "recepcion", "restaurante@parkplaza.com": "cocina", "bartender@parkplaza.com": "bar", "limpieza@parkplaza.com": "limpieza", "mantenimiento@parkplaza.com": "mantenimiento" };
if (Number((await readState()).settings?.staffCredentialsVersion || 0) < 2) {
  await mutateState((state) => {
    for (const user of state.users) {
      const username = STAFF_CREDENTIALS[String(user.email || "").toLowerCase()];
      if (!username || state.users.some((other) => other !== user && String(other.username || "").toLowerCase() === username)) continue;
      user.username = username; user.passwordHash = hashStaffPassword(username); user.passwordChangedAt = now();
      const employee = (state.employees || []).find((item) => Number(item.id) === Number(user.id));
      if (employee) employee.username = username;
    }
    state.settings = { ...state.settings, staffCredentialsVersion: 2 };
    audit(state, "USUARIOS", "CREDENCIALES", "Ingreso por usuario: superadmin, recepcion, cocina, bar, limpieza y mantenimiento (clave = usuario)", null);
  });
}
// Cada minuto: cierra la jornada de ayer si hace falta y pasa al historial lo cerrado y antiguo (Fase 1).
const archiveHistory = () => archiveColdHistory().then((result) => { if (result?.archived) console.log("Historial: archivados", result.archived, JSON.stringify(result.byCollection)); }).catch((error) => console.error("No se pudo archivar el historial", error));
// Con varias copias del servidor, lo hace solo una por vez (candado de Postgres); las demás lo saltan.
/* Cierre diario de reservas (2026-10-12): todo lo que empieza termina.
   - Piscina, Mirador, Terraza y Bar de días anteriores: si el cliente entró, la visita queda FINALIZADA (ya no
     puede pedir desde la app); si nunca llegó, queda NO_SHOW y su pase VENCIDO. El saldo sin cobrar de un no-show
     pasa a uncollectedBalance (no es una deuda del cliente).
   - Hospedaje sin check-in cuya fecha de salida ya llegó: NO_SHOW (también su reflejo en reservations).
   - Eventos ya realizados: CONFIRMADO o RESERVADO → FINALIZADO (el saldo, si queda, sigue por cobrar); cotizaciones
     y reservas sin ningún pago → CANCELADO.
   En todos los casos se libera la cochera reservada. Lo que tiene una devolución en trámite no se toca. */
function expiredReservations(state) {
  const today = hotelToday(state);
  const OPEN = (status) => !["CANCELADA", "CANCELADO", "FINALIZADA", "FINALIZADO", "COMPLETADA", "NO_SHOW"].includes(String(status || "").toUpperCase());
  const visits = (state.bookings || []).filter((item) => item.serviceCode !== "HOSPEDAJE" && !item.refundHold && OPEN(item.status) && dateKey(item.date) && dateKey(item.date) < today);
  const stays = (state.bookings || []).filter((item) => item.serviceCode === "HOSPEDAJE" && !item.refundHold && OPEN(item.status) && item.status !== "CHECKED_IN" && dateKey(item.checkOut) && dateKey(item.checkOut) <= today && !(state.stays || []).some((stay) => Number(stay.reservationId) === Number(item.id) && stay.status === "ACTIVA"));
  const events = (state.events || []).filter((item) => !item.refundHold && OPEN(item.status) && dateKey(item.endsAt || item.startsAt) && dateKey(item.endsAt || item.startsAt) < today);
  return { visits, stays, events };
}
async function closeExpiredReservations() {
  const pending = expiredReservations(await readState());
  if (!pending.visits.length && !pending.stays.length && !pending.events.length) return;
  const summary = await mutateState((state) => {
    const { visits, stays, events } = expiredReservations(state);
    const at = now(); const counts = { finalizadas: 0, noShow: 0, eventosFinalizados: 0, eventosCancelados: 0 };
    const releaseParking = (key, id) => (state.cochera || []).filter((space) => space.status === "RESERVADO" && (space.entries || []).some((entry) => Number(entry[key]) === Number(id))).forEach((space) => { space.entries = []; space.status = "LIBRE"; });
    const expireEntitlements = (filter) => (state.entitlements || []).filter((entry) => filter(entry) && ["PENDIENTE", "LISTO_INGRESO"].includes(entry.status)).forEach((entry) => { entry.status = "VENCIDO"; entry.expiredAt = at; });
    const markNoShow = (booking) => { booking.status = "NO_SHOW"; booking.noShowAt = at; if (Number(booking.balance || 0) > 0) { booking.uncollectedBalance = Number(booking.balance); booking.balance = 0; } };
    for (const booking of visits) {
      const used = booking.accessStatus === "INGRESO_VALIDADO" || (state.entitlements || []).some((entry) => Number(entry.bookingId) === Number(booking.id) && entry.status === "UTILIZADO");
      if (used) { booking.status = "FINALIZADA"; booking.finishedAt = at; counts.finalizadas++; } else { markNoShow(booking); counts.noShow++; }
      expireEntitlements((entry) => Number(entry.bookingId) === Number(booking.id));
      releaseParking("bookingId", booking.id);
    }
    for (const booking of stays) {
      markNoShow(booking); counts.noShow++;
      const mirror = (state.reservations || []).find((row) => Number(row.id) === Number(booking.id));
      if (mirror) { mirror.status = "NO_SHOW"; mirror.noShowAt = at; if (Number(mirror.balance || 0) > 0) { mirror.uncollectedBalance = Number(mirror.balance); mirror.balance = 0; } }
      expireEntitlements((entry) => Number(entry.bookingId) === Number(booking.id));
      releaseParking("bookingId", booking.id);
    }
    for (const event of events) {
      if (["CONFIRMADO", "RESERVADO"].includes(String(event.status).toUpperCase()) && Number(event.advance || 0) > 0) { event.status = "FINALIZADO"; event.finishedAt = at; counts.eventosFinalizados++; }
      else { event.cancelReason = String(event.status).toUpperCase() === "COTIZACION" ? "Cotización vencida" : "Fecha pasada sin pago"; event.status = "CANCELADO"; event.cancelledAt = at; counts.eventosCancelados++; }
      expireEntitlements((entry) => Number(entry.eventId) === Number(event.id));
      releaseParking("eventId", event.id);
    }
    audit(state, "RESERVAS", "CIERRE_DIARIO", `Visitas finalizadas ${counts.finalizadas} · no-show ${counts.noShow} · eventos finalizados ${counts.eventosFinalizados} · eventos cancelados ${counts.eventosCancelados}`, null);
    return counts;
  });
  console.log("Cierre diario de reservas:", JSON.stringify(summary));
}
const minuteTasks = () => asLeader(727101, async () => {
  await synchronizeDailyAttendance().catch((error) => console.error("No se pudo cerrar la jornada diaria", error));
  await closeExpiredReservations().catch((error) => console.error("No se pudo cerrar las reservas vencidas", error));
  await archiveHistory();
  await purgeRateLimits().catch(() => {});
  await purgeOldMetrics().catch(() => {});
}).catch((error) => console.error("Tareas de cada minuto", error));
const attendanceRolloverWatcher = setInterval(() => { void minuteTasks(); }, 60_000);
void minuteTasks();
startRealtimeBus(io);
startAlerts();
startMetricsFlush({ host: hostname(), extra: () => ({ memoryMb: Math.round(process.memoryUsage().rss / 1048576), connections: io.engine.clientsCount, shared: busStatus().listening }) });
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
