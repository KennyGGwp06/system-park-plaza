import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLegacyInventory, relationalInventoryStatus, synchronizeLegacyInventory } from "./inventory-relational.js";
import { migrateUp } from "./migrations.js";
import { stabilizeLegacyState } from "./state-stabilization.js";

const { Pool } = pg;
export const db = new Pool({ connectionString: process.env.DATABASE_URL });
const operationalFoodSeed = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "013_food_beverage_operational_recipes.up.sql");
const operationalPhase2Seed = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "015_complete_operational_recipes_manuals.up.sql");
const hotelRoomNumbers = [
  ...Array.from({ length: 11 }, (_, index) => 101 + index),
  ...Array.from({ length: 11 }, (_, index) => 301 + index),
  ...Array.from({ length: 11 }, (_, index) => 401 + index)
];
const roomTypes = [["Simple", 1, 180], ["Matrimonial", 2, 260], ["Doble", 2, 290], ["Triple", 3, 350], ["Suite", 4, 480]];
const roomStatuses = ["LIBRE", "LIBRE", "LIBRE", "OCUPADA", "EN_LIMPIEZA"];

function floorForRoomNumber(number) {
  const roomNumber = Number(number);
  if (roomNumber >= 101 && roomNumber <= 111) return 1;
  if (roomNumber >= 301 && roomNumber <= 311) return 3;
  if (roomNumber >= 401 && roomNumber <= 411) return 4;
  return Math.floor(roomNumber / 100);
}

function makeRoom(number, id, typeIndex) {
  const [name, capacity, price] = roomTypes[typeIndex % roomTypes.length];
  return {
    id,
    number: String(number),
    floor: floorForRoomNumber(number),
    type: { id: (typeIndex % roomTypes.length) + 1, name },
    capacity,
    price,
    status: roomStatuses[typeIndex % roomStatuses.length],
    features: ["Wi-Fi", "Baño privado", typeIndex % roomTypes.length ? "Vista al jardín" : "Cama full"]
  };
}

function synchronizeHotelRoomCatalog(state) {
  state.rooms ||= [];
  const existingNumbers = new Set(state.rooms.map((room) => String(room.number)));
  const configuredNumbers = new Set(hotelRoomNumbers.map(String));
  const referencedRoomIds = new Set(
    ["bookings", "reservations", "stays", "tasks", "requests", "orders"].flatMap((collection) =>
      (state[collection] || []).map((item) => Number(item.roomId)).filter(Number.isFinite)
    )
  );

  // Conserva cualquier cuarto legado que ya tenga un movimiento real asociado.
  // Los demás se retiran para que el catálogo operativo coincida con los tres pisos definidos.
  state.rooms = state.rooms.filter((room) => configuredNumbers.has(String(room.number)) || referencedRoomIds.has(Number(room.id)));
  let nextRoomId = Math.max(0, ...state.rooms.map((room) => Number(room.id) || 0)) + 1;

  hotelRoomNumbers.forEach((number, index) => {
    const room = state.rooms.find((item) => String(item.number) === String(number));
    if (room) {
      room.floor = floorForRoomNumber(number);
      return;
    }
    if (!existingNumbers.has(String(number))) {
      state.rooms.push(makeRoom(number, nextRoomId, index));
      existingNumbers.add(String(number));
      nextRoomId += 1;
    }
  });
}

export async function initializeDatabase() {
  await db.query(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const existing = await db.query("SELECT id FROM app_state WHERE id = 1");
  if (!existing.rowCount) await db.query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)", [JSON.stringify(createDemoState())]);
  await migrateUp(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
    const state = upgradeState(current.rows[0].data);
    await client.query("UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(state)]);
    await migrateLegacyInventory(client, state);
    // Esta semilla depende de los productos y recetas heredados sincronizados arriba.
    // Es idempotente y también cubre instalaciones nuevas, donde la migración 013
    // necesariamente se ejecuta antes de que exista el catálogo de demostración.
    await client.query(await readFile(operationalFoodSeed, "utf8"));
    await client.query(await readFile(operationalPhase2Seed, "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readState() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
    const state = result.rows[0].data;
    if (closePreviousDayAttendance(state)) {
      await client.query("UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(state)]);
    }
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function synchronizeDailyAttendance() {
  await readState();
}

export async function mutateState(mutator) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
    const state = result.rows[0].data;
    closePreviousDayAttendance(state);
    const beforeState = structuredClone(state);
    const mutationId = randomUUID();
    const value = await mutator(state, client, beforeState, mutationId);
    await synchronizeLegacyInventory(client, beforeState, state, { mutationId });
    await client.query("UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(state)]);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function readRelationalInventoryStatus() {
  const client = await db.connect();
  try { return await relationalInventoryStatus(client); }
  finally { client.release(); }
}

function hotelDate(state) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: state?.settings?.timezone || "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function attendanceDate(record) {
  return String(record?.date || record?.checkIn || record?.clockIn || "").slice(0, 10);
}

function closePreviousDayAttendance(state) {
  const today = hotelDate(state);
  let changed = false;
  state.attendance ||= [];
  state.shifts ||= [];
  state.employees ||= [];

  for (const record of state.attendance) {
    const date = attendanceDate(record);
    if (!date || date >= today || !(record.checkIn || record.clockIn) || record.checkOut || record.clockOut) continue;
    const closedAt = `${date}T23:59:59.999Z`;
    record.checkOut = closedAt;
    record.clockOut = closedAt;
    record.status = "CERRADO_AUTOMATICO";
    record.closedAutomaticallyAt = new Date().toISOString();
    const shift = state.shifts.find((item) => Number(item.id) === Number(record.shiftId));
    if (shift && !["FINALIZADO", "CANCELADO"].includes(shift.status)) {
      shift.status = "FINALIZADO";
      shift.actualEnd = closedAt;
      shift.closedAutomatically = true;
    }
    changed = true;
  }

  for (const employee of state.employees) {
    const activeToday = state.attendance.some((record) => Number(record.employeeId || record.userId) === Number(employee.id) && attendanceDate(record) === today && (record.checkIn || record.clockIn) && !(record.checkOut || record.clockOut));
    const status = activeToday ? "EN_TURNO" : "FUERA_DE_TURNO";
    if (employee.attendanceStatus !== status) {
      employee.attendanceStatus = status;
      changed = true;
    }
  }
  return changed;
}

function createDemoState() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const services = [
    { id: 1, code: "HOSPEDAJE", name: "Hospedaje", description: "Habitaciones y atención durante tu estadía", price: 180, capacity: null, icon: "bed" },
    { id: 2, code: "PISCINA", name: "Piscina", description: "Acceso por horario con aforo controlado", price: 55, capacity: 20, icon: "waves" },
    { id: 3, code: "MIRADOR", name: "Mirador", description: "Atardecer, buena mesa y vista panorámica", price: 45, capacity: 15, icon: "sunset" },
    { id: 4, code: "EVENTOS", name: "Eventos", description: "Celebraciones y reuniones a medida", price: 2400, capacity: 100, icon: "sparkles" }
  ];
  const rooms = hotelRoomNumbers.map((number, index) => makeRoom(number, index + 1, index));
  const permissions = ["DASHBOARD:VER", "RECEPCION:VER", "CLIENTES:VER", "HABITACIONES:VER", "RESERVAS:VER", "CHECK_IN:VER", "CHECK_OUT:VER", "PEDIDOS:VER", "RESTAURANTE:VER", "BARTENDER:VER", "EVENTOS:VER", "COCHERA:VER", "LIMPIEZA:VER", "MANTENIMIENTO:VER", "INVENTARIO:VER", "COMPRAS:VER", "PROVEEDORES:VER", "PAGOS:VER", "FACTURACION:VER", "CAJA:VER", "USUARIOS:VER", "ROLES:VER", "REPORTES:VER", "AUDITORIA:VER", "CONFIGURACION:VER", "EMPLEADOS:VER", "TURNOS:VER", "ACCESOS:VER"];
  const roleNames = ["SUPERADMIN", "ADMINISTRADOR", "RESTAURANTE", "BARTENDER", "LIMPIEZA", "MANTENIMIENTO"];
  const roles = roleNames.map((name, index) => ({ id: index + 1, name, description: `Rol ${name.toLowerCase()}`, permissions: permissions.map((code, permissionIndex) => ({ id: permissionIndex + 1, code, module: code.split(":")[0], action: code.split(":")[1] })) }));
  const userRows = [[1, "Superadmin", "Park Plaza", "superadmin@parkplaza.com", "SUPERADMIN", 0, "1111"], [2, "Rosa", "Recepción", "recepcion@parkplaza.com", "ADMINISTRADOR", 65, "2222"], [3, "Carlos", "Cocina", "restaurante@parkplaza.com", "RESTAURANTE", 65, "3333"], [4, "Luis", "Bar", "bartender@parkplaza.com", "BARTENDER", 65, "4444"], [5, "Ana", "Operaciones", "limpieza@parkplaza.com", "LIMPIEZA", 60, "5555"], [6, "Jorge", "Mantenimiento", "mantenimiento@parkplaza.com", "MANTENIMIENTO", 70, "6666"]];
  const users = userRows.map(([id, firstName, lastName, email, role, dailyRate, pin]) => ({ id, firstName, lastName, email, role, status: "ACTIVO", permissions, dailyRate, pin, documentNumber: `7000000${id}`, phone: `99910000${id}` }));
  const receptionUser = users.find((user) => user.email === "recepcion@parkplaza.com");
  if (receptionUser) Object.assign(receptionUser, { position: "ADMIN_RECEPCION", operationalArea: "RECEPCION" });
  const employees = users.map((user) => ({ ...user, baseRole: user.role, attendanceStatus: "FUERA_DE_TURNO", currentAssignment: null }));
  const inventory = [
    { id: 1, name: "Pescado fresco", unit: "kg", stock: 18, reserved: 0, minStock: 8, cost: 24, area: "RESTAURANTE", imageUrl: "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?auto=format&fit=crop&w=300&q=80" },
    { id: 2, name: "Arroz", unit: "kg", stock: 30, reserved: 0, minStock: 10, cost: 5, area: "RESTAURANTE", imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80" },
    { id: 3, name: "Lomo", unit: "kg", stock: 16, reserved: 0, minStock: 6, cost: 30, area: "RESTAURANTE", imageUrl: "https://images.unsplash.com/photo-1603048297172-c92544798d5e?auto=format&fit=crop&w=300&q=80" },
    { id: 4, name: "Pisco", unit: "ml", stock: 12000, reserved: 0, minStock: 3000, cost: 0.04, area: "BARTENDER", imageUrl: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=300&q=80" },
    { id: 5, name: "Limón", unit: "unidad", stock: 80, reserved: 0, minStock: 25, cost: 0.5, area: "BARTENDER", imageUrl: "https://images.unsplash.com/photo-1590502593747-422e118f1bc2?auto=format&fit=crop&w=300&q=80" },
    { id: 6, name: "Ginebra", unit: "ml", stock: 5000, reserved: 0, minStock: 1000, cost: 0.08, area: "BARTENDER", imageUrl: "https://images.unsplash.com/photo-1615887023516-9df910009c5b?auto=format&fit=crop&w=300&q=80" }
  ];
  const menuItems = [
    { id: 1, code: "CEVICHE", name: "Ceviche amazónico", description: "Pescado fresco, cocona y ají charapita", price: 34, area: "RESTAURANTE", prepMinutes: 22, active: true, recipe: [{ inventoryId: 1, quantity: 0.22 }, { inventoryId: 5, quantity: 2 }] },
    { id: 2, code: "LOMO", name: "Lomo saltado", description: "Lomo, papas y arroz", price: 38, area: "RESTAURANTE", prepMinutes: 28, active: true, recipe: [{ inventoryId: 3, quantity: 0.25 }, { inventoryId: 2, quantity: 0.12 }] },
    { id: 3, code: "JUANE", name: "Juane regional", description: "Receta tradicional de la casa", price: 29, area: "RESTAURANTE", prepMinutes: 25, active: true, recipe: [{ inventoryId: 2, quantity: 0.18 }] },
    { id: 4, code: "PISCO", name: "Pisco sour", description: "Clásico peruano", price: 24, area: "BARTENDER", prepMinutes: 8, active: true, recipe: [{ inventoryId: 4, quantity: 90 }, { inventoryId: 5, quantity: 2 }] },
    { id: 5, code: "SELVA", name: "Selva tropical", description: "Cocona, maracuyá y gin", price: 27, area: "BARTENDER", prepMinutes: 10, active: true, recipe: [{ inventoryId: 6, quantity: 75 }, { inventoryId: 5, quantity: 1 }] }
  ];
  const shifts = employees.slice(1).map((employee, index) => ({ id: index + 1, employeeId: employee.id, date: today, start: "08:00", end: "16:00", area: ["RECEPCION", "RESTAURANTE", "BARTENDER", "LIMPIEZA", "MANTENIMIENTO"][index], status: "PROGRAMADO", replacementId: null }));
  return { counters: { client: 1, booking: 0, payment: 0, pass: 0, entitlement: 0, access: 0, order: 0, request: 0, shift: shifts.length, attendance: 0, task: 0, audit: 0 }, services, rooms, roles, users, employees, inventory, menuItems, shifts, clients: [{ id: 1, documentType: "DNI", documentNumber: "70000001", firstName: "Demo", lastName: "Huésped", phone: "999000001", email: "demo@parkplaza.com", status: "ACTIVO" }], bookings: [], payments: [], passes: [], entitlements: [], accessLogs: [], orders: [], requests: [], attendance: [], tasks: [], audit: [], reservations: [], events: [], proveedores: [], compras: [], cochera: [], facturacion: [], cleaning: [], reports: [], pool: [], parking: [], settings: { hotelName: "Hotel Park Plaza", currency: "PEN", timezone: "America/Lima", taxRate: 18, today, tomorrow } };
}

function upgradeState(state) {
  const isoNow = new Date().toISOString();
  const today = isoNow.slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const collections = ["clients", "bookings", "payments", "passes", "entitlements", "accessLogs", "orders", "requests", "attendance", "tasks", "audit", "reservations", "events", "proveedores", "compras", "cochera", "facturacion", "stays", "inventoryMovements", "cashMovements", "poolEntries", "poolReports", "productions", "wasteRecords", "inventoryClosings", "dailyInventoryBoxes", "externalProviders"];
  for (const key of collections) state[key] ||= [];
  synchronizeHotelRoomCatalog(state);
  state.settings = { hotelName: "Hotel Park Plaza", currency: "PEN", timezone: "America/Lima", taxRate: 18, parkingRates: { MOTO: 0, AUTO: 15, CAMIONETA: 20, MINIVAN: 25 }, ...state.settings, today, tomorrow };
  state.counters ||= {};
  const counterCollections = { client: "clients", booking: "bookings", payment: "payments", pass: "passes", entitlement: "entitlements", access: "accessLogs", order: "orders", request: "requests", shift: "shifts", attendance: "attendance", task: "tasks", audit: "audit", stay: "stays", movement: "inventoryMovements", event: "events", invoice: "facturacion", purchase: "compras", supplier: "proveedores", production: "productions", waste: "wasteRecords", closing: "inventoryClosings", dailyBox: "dailyInventoryBoxes" };
  for (const [counter, key] of Object.entries(counterCollections)) state.counters[counter] = Math.max(Number(state.counters[counter] || 0), ...state[key].map((item) => Number(item.id) || 0));

  const menuPresentation = {
    CEVICHE: { category: "Platos regionales", image: "https://images.unsplash.com/photo-1535400255456-984241443b29?auto=format&fit=crop&w=900&q=85", tags: ["Fresco", "Regional"] },
    LOMO: { category: "Fondos", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85", tags: ["Caliente", "Favorito"] },
    JUANE: { category: "Platos regionales", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=85", tags: ["Tradicional"] },
    PISCO: { category: "Cocteles", image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85", tags: ["Con alcohol", "Clásico"] },
    SELVA: { category: "Cocteles de autor", image: "https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=85", tags: ["Tropical", "Con alcohol"] }
  };
  state.menuItems.forEach((item) => Object.assign(item, { category: item.category || menuPresentation[item.code]?.category || "Carta", image: item.image || menuPresentation[item.code]?.image || "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=85", tags: item.tags || menuPresentation[item.code]?.tags || [], availableFor: item.availableFor || ["HOSPEDAJE", "PISCINA", "MIRADOR", "EVENTOS"] }));
  state.inventory.forEach((item) => { item.baseUnit ||= item.unit; item.reserved = Number(item.reserved || 0); item.openedStock ||= 0; });
  if (!state.externalProviders.length) state.externalProviders.push({ id: 1, name: "Soporte Técnico Pucallpa", specialty: "Electricidad, climatización y reparaciones", phone: "961555220", status: "DISPONIBLE", temporaryAccess: false });

  const modules = ["DASHBOARD", "RECEPCION", "CLIENTES", "HABITACIONES", "RESERVAS", "CHECK_IN", "CHECK_OUT", "PEDIDOS", "RESTAURANTE", "BARTENDER", "EVENTOS", "COCHERA", "LIMPIEZA", "MANTENIMIENTO", "INVENTARIO", "COMPRAS", "PROVEEDORES", "PAGOS", "FACTURACION", "CAJA", "USUARIOS", "ROLES", "REPORTES", "AUDITORIA", "CONFIGURACION", "EMPLEADOS", "TURNOS", "ACCESOS"];
  const catalog = modules.flatMap((module, moduleIndex) => ["VER", "CREAR", "EDITAR", "ELIMINAR"].map((action, actionIndex) => ({ id: moduleIndex * 4 + actionIndex + 1, code: `${module}:${action}`, module, action })));
  const allowed = {
    SUPERADMIN: modules,
    // ADMINISTRADOR representa exclusivamente al Admin de recepción. El control
    // global, costos, usuarios, auditoría y configuración pertenecen al dueño.
    ADMINISTRADOR: ["DASHBOARD", "RECEPCION", "CLIENTES", "HABITACIONES", "RESERVAS", "CHECK_IN", "CHECK_OUT", "PEDIDOS", "RESTAURANTE", "BARTENDER", "EVENTOS", "COCHERA", "LIMPIEZA", "MANTENIMIENTO", "PAGOS", "FACTURACION", "CAJA", "REPORTES", "ACCESOS"],
    RESTAURANTE: ["RESTAURANTE", "PEDIDOS", "INVENTARIO", "REPORTES"],
    BARTENDER: ["BARTENDER", "PEDIDOS", "INVENTARIO", "REPORTES"],
    LIMPIEZA: ["LIMPIEZA", "REPORTES"],
    MANTENIMIENTO: ["MANTENIMIENTO", "REPORTES"]
  };
  // RECEPCION era el rol antiguo. Ahora la estación se representa por ADMINISTRADOR
  // con posición ADMIN_RECEPCION, manteniendo intactos los contratos internos.
  state.users.forEach((user) => {
    if ((user.role?.name || user.role) === "RECEPCION" || String(user.email || "").toLowerCase() === "recepcion@parkplaza.com") {
      user.role = "ADMINISTRADOR";
      user.position = "ADMIN_RECEPCION";
      user.operationalArea = "RECEPCION";
    }
  });
  // La antigua cuenta OPERATIVO de limpieza se convierte en una estación real
  // de trabajador. No se reutiliza para otros módulos ni para Administración.
  const cleaningAccount = state.users.find((user) => String(user.email || "").toLowerCase() === "limpieza@parkplaza.com");
  if (cleaningAccount && (cleaningAccount.role === "OPERATIVO" || cleaningAccount.status === "SIN_ACCESO_ERP")) {
    Object.assign(cleaningAccount, { role: "LIMPIEZA", status: "ACTIVO", position: "LIMPIEZA", operationalArea: "LIMPIEZA" });
  }
  state.roles = state.roles.filter((role) => role.name !== "RECEPCION");
  if (!state.roles.some((role) => role.name === "LIMPIEZA")) {
    state.roles.push({ id: Math.max(0, ...state.roles.map((role) => Number(role.id) || 0)) + 1, name: "LIMPIEZA", description: "Estación operativa de limpieza", permissions: [] });
  }
  if (!state.roles.some((role) => role.name === "MANTENIMIENTO")) {
    state.roles.push({ id: Math.max(0, ...state.roles.map((role) => Number(role.id) || 0)) + 1, name: "MANTENIMIENTO", description: "Estación operativa de mantenimiento", permissions: [] });
  }
  if (!state.roles.some((role) => role.name === "SUPERADMIN")) {
    state.roles.push({ id: Math.max(0, ...state.roles.map((role) => Number(role.id) || 0)) + 1, name: "SUPERADMIN", description: "Control integral del sistema", permissions: [] });
  }
  if (!state.users.some((user) => String(user.email || "").toLowerCase() === "mantenimiento@parkplaza.com")) {
    const id = Math.max(0, ...state.users.map((user) => Number(user.id) || 0)) + 1;
    state.users.push({ id, firstName: "Jorge", lastName: "Mantenimiento", email: "mantenimiento@parkplaza.com", role: "MANTENIMIENTO", status: "ACTIVO", dailyRate: 70, pin: "6666", documentNumber: `7000000${id}`, phone: `99910000${id}`, position: "MANTENIMIENTO", operationalArea: "MANTENIMIENTO" });
  }
  state.shifts = state.shifts.filter((shift) => state.employees.some((employee) => employee.id === shift.employeeId));
  state.roles.forEach((role) => { role.permissions = catalog.filter((permission) => (allowed[role.name] || []).includes(permission.module)); });
  // Compatibilidad con bases antiguas: si todavía no existe dueño, la antigua cuenta
  // administrativa se convierte una sola vez en SUPERADMIN.
  if (!state.users.some((user) => (user.role?.name || user.role) === "SUPERADMIN")) {
    const owner = state.users.find((user) => String(user.email || "").toLowerCase() === "admin@parkplaza.com");
    if (owner) {
      owner.role = "SUPERADMIN";
      owner.position = "SUPERADMIN";
      owner.operationalArea = "DIRECCION";
    }
  }
  // La cuenta administrativa heredada no se borra físicamente: conserva sus cierres
  // y auditorías históricas, pero queda sin acceso al ERP.
  const legacyAdmin = state.users.find((user) => String(user.email || "").toLowerCase() === "admin@parkplaza.com");
  if (legacyAdmin && (legacyAdmin.role?.name || legacyAdmin.role) !== "SUPERADMIN") {
    legacyAdmin.status = "INACTIVO";
    legacyAdmin.position = "CUENTA_HISTORICA_DESACTIVADA";
    legacyAdmin.permissions = [];
  }
  state.users.forEach((user) => {
    const role = state.roles.find((item) => item.name === (user.role?.name || user.role));
    user.role = role?.name || user.role;
    user.roleId = role?.id || user.roleId;
    user.permissions = (role?.permissions || []).map((item) => item.code);
    user.username ||= user.email;
    // Los registros antiguos conservan su PIN temporal hasta que el Superadmin
    // lo cambie; los PIN nuevos se almacenan cifrados y nunca se regeneran.
    if (!user.pinHash) user.pin ||= String(user.id).repeat(4);
    user.hireDate ||= today;
    user.position ||= user.role;
  });
  state.users.forEach((user) => {
    if (!state.employees.some((employee) => Number(employee.id) === Number(user.id))) {
      state.employees.push({ ...user, baseRole: user.role, attendanceStatus: "FUERA_DE_TURNO", currentAssignment: null });
    }
  });
  state.employees.forEach((employee) => {
    const user = state.users.find((item) => item.id === employee.id);
    Object.assign(employee, user || {});
    employee.baseRole = employee.role === "SUPERADMIN" ? "SUPERADMIN" : (employee.baseRole || employee.role);
    if (String(employee.email || "").toLowerCase() === "limpieza@parkplaza.com") employee.baseRole = "LIMPIEZA";
    employee.attendanceStatus ||= "FUERA_DE_TURNO";
  });
  state.attendance.forEach((record) => {
    record.employeeId = Number(record.employeeId || record.userId);
    record.userId = record.employeeId;
    record.checkIn ||= record.clockIn || null;
    record.clockIn ||= record.checkIn || null;
    record.checkOut ||= record.clockOut || null;
    record.clockOut ||= record.checkOut || null;
    record.date ||= String(record.checkIn || isoNow).slice(0, 10);
    record.status ||= record.checkOut ? "SALIDA_REGISTRADA" : "EN_TURNO";
  });

  if (!state.proveedores.length) state.proveedores.push(
    { id: 1, ruc: "20123456789", name: "Distribuidora Ucayali", contact: "Maria Saldana", phone: "961000120", email: "ventas@distribuidoraucayali.pe", status: "ACTIVO", createdAt: isoNow },
    { id: 2, ruc: "20987654321", name: "Frescos de la Selva", contact: "Juan Ruiz", phone: "961000121", email: "pedidos@frescosdelaselva.pe", status: "ACTIVO", createdAt: isoNow }
  );
  if (!state.cochera.length) state.cochera = Array.from({ length: 18 }, (_, index) => ({ id: index + 1, code: `P-${String(index + 1).padStart(2, "0")}`, status: "LIBRE", entries: [] }));

  const client = state.clients[0];
  const usableRooms = state.rooms.filter((room) => !["MANTENIMIENTO", "FUERA_SERVICIO"].includes(room.status));
  // Los ejemplos operativos solo se crean antes del primer reinicio a "día cero".
  // Sin esta marca, cada arranque del servidor volvía a inventar reservas, tareas,
  // incidencias, pedidos y eventos después de limpiar la demostración.
  const allowOperationalDemoSeed = !state.settings?.operationalResetAt;
  if (allowOperationalDemoSeed && !state.reservations.length && client && usableRooms.length >= 2) {
    const first = usableRooms[0];
    const second = usableRooms[1];
    const reservation = { id: 1, code: "RES-0001", clientId: client.id, roomId: first.id, client, room: first, checkInDate: `${today}T15:00:00`, checkOutDate: `${tomorrow}T12:00:00`, adults: 2, children: 0, totalPrice: 360, advance: 180, balance: 180, paymentStatus: "PARCIAL", status: "CONFIRMADA", notes: "Reserva demostrativa para check-in", createdAt: isoNow };
    const checkedIn = { id: 2, code: "RES-0002", clientId: client.id, roomId: second.id, client, room: second, checkInDate: `${today}T09:00:00`, checkOutDate: `${today}T20:00:00`, adults: 1, children: 0, totalPrice: 260, advance: 260, balance: 0, paymentStatus: "PAGADO", status: "CHECKED_IN", notes: "Estadia activa de demostracion", createdAt: isoNow };
    state.reservations.push(reservation, checkedIn);
    state.bookings.push(
      { id: 1, code: reservation.code, clientId: client.id, serviceCode: "HOSPEDAJE", roomId: first.id, room: first, checkIn: reservation.checkInDate, checkOut: reservation.checkOutDate, date: today, slot: "15:00", people: 2, total: 360, paid: 180, balance: 180, paymentStatus: "PARCIAL", status: "CONFIRMADA", createdAt: isoNow },
      { id: 2, code: checkedIn.code, clientId: client.id, serviceCode: "HOSPEDAJE", roomId: second.id, room: second, checkIn: checkedIn.checkInDate, checkOut: checkedIn.checkOutDate, date: today, slot: "09:00", people: 1, total: 260, paid: 260, balance: 0, paymentStatus: "PAGADO", status: "CHECKED_IN", createdAt: isoNow }
    );
    second.status = "OCUPADA";
    state.stays.push({ id: 1, reservationId: checkedIn.id, clientId: client.id, roomId: second.id, checkInAt: `${today}T09:05:00`, status: "ACTIVA", createdAt: isoNow });
    checkedIn.stayId = 1;
  }
  if (allowOperationalDemoSeed && !state.tasks.length && state.rooms.length) {
    const room = state.rooms.find((item) => item.status === "EN_LIMPIEZA") || state.rooms[4];
    state.tasks.push({ id: 1, code: "LIM-0001", roomId: room.id, room, assignedEmployeeId: state.employees.find((item) => item.baseRole === "LIMPIEZA")?.id || null, assignedTo: "Ana Operaciones", priority: "ALTA", status: "PENDIENTE", evidences: [], operationalReports: [], createdAt: isoNow });
  }
  if (allowOperationalDemoSeed && !state.requests.length) state.requests.push({ id: 1, code: "SOL-0001", clientId: client?.id, type: "MANTENIMIENTO", area: "MANTENIMIENTO", location: "Habitacion 204", description: "Revisar aire acondicionado con ruido", priority: "ALTA", status: "PENDIENTE", requiresMaintenance: true, evidences: [], createdAt: isoNow });
  if (allowOperationalDemoSeed && !state.orders.length && state.menuItems.length) {
    const menu = state.menuItems[0];
    state.orders.push({ id: 1, code: "PED-0001", clientId: client?.id, area: menu.area, roomId: state.stays[0]?.roomId || null, items: [{ id: 1, menuItemId: menu.id, name: menu.name, quantity: 2, price: menu.price, recipe: menu.recipe }], total: menu.price * 2, status: "PENDIENTE", estimatedMinutes: menu.prepMinutes, notes: "Sin picante", createdAt: isoNow, updatedAt: isoNow });
  }
  if (allowOperationalDemoSeed && !state.events.length && client) state.events.push({ id: 1, code: "EVT-0001", clientId: client.id, client, name: "Aniversario familiar", type: "CELEBRACION", spaceId: 1, space: { id: 1, name: "Terraza", capacity: 80 }, startsAt: `${tomorrow}T18:00:00`, endsAt: `${tomorrow}T23:00:00`, guests: 45, price: 2400, advance: 1200, balance: 1200, status: "RESERVADO", notes: "Menu regional", createdAt: isoNow });
  state.orders.forEach((order) => { if (order.status === "RECIBIDO") order.status = "PENDIENTE"; order.items ||= []; });
  state.tasks.forEach((task) => {
    if (task.requestId && !task.workflowType) task.workflowType = "SOLICITUD_HUESPED";
    if (!task.requestId && !task.workflowType) task.workflowType = "POST_CHECKOUT";
  });
  state.requests.forEach((request) => {
    if (!request.requiresMaintenance) return;
    if (request.status === "ABIERTO") request.status = "PENDIENTE";
    if (request.status === "EN_REVISION") request.status = "EN_REPARACION";
    if (request.status === "RESUELTO") request.status = "SOLUCIONADO";
    request.workflowType ||= request.clientId ? "SOLICITUD_HUESPED" : "REPORTE_OPERATIVO";
  });
  state.rooms.forEach((room) => {
    // LIBRE es el único estado canónico para una habitación limpia y preparada.
    if (["LIMPIA", "DISPONIBLE", "LIBRE"].includes(room.status)) room.status = "LIBRE";
    if (["SUCIA", "LIMPIEZA", "EN_LIMPIEZA"].includes(room.status)) room.status = "EN_LIMPIEZA";
    if (room.status === "FUERA_SERVICIO") room.status = "BLOQUEADA";
  });
  stabilizeLegacyState(state, isoNow);
  state.requests.forEach((request) => { if (request.requiresMaintenance && request.status === "PENDIENTE") request.status = "ABIERTO"; request.evidences ||= []; });
  state.tasks.forEach((task) => { task.room ||= state.rooms.find((room) => room.id === task.roomId); task.evidences ||= []; task.operationalReports ||= []; });
  for (const [counter, key] of Object.entries(counterCollections)) state.counters[counter] = Math.max(Number(state.counters[counter] || 0), ...state[key].map((item) => Number(item.id) || 0));
  return state;
}
  
