import {
  Boxes, CalendarCheck, ChefHat, CircleDollarSign, ClipboardCheck, LayoutDashboard, LineChart, Receipt,
  ScanLine, Settings, ShieldCheck, ShoppingCart, Sparkles, UserCog, Users, Wine, Wrench
} from "lucide-react";

const view = (id, label, legacyPath, component, options = {}) => ({
  id, label, legacyPath, component, ...options
});

// Centro de dirección del dueño (v3, 2026-09-28). Misma forma que Recepción, Cocina y Operaciones: un menú PLANO
// (cada entrada es una pantalla, sin submenús desplegables). Cuando un tema tiene varias vistas, se muestran como
// pestañas dentro de la página. Se agrupa por lo que el dueño quiere saber: qué pasa ahora, cómo se vende, cómo
// opera el hotel, cómo va el dinero y cómo está el sistema.
const RAW_MODULES = [
  {
    id: "inicio", label: "Tablero", group: "Ahora", description: "Todo el hotel en vivo: dinero, personas, pendientes y actividad", icon: LayoutDashboard,
    views: [view("resumen", "Tablero", "/superadmin", "OwnerBoard")]
  },
  {
    id: "aprobar", label: "Por aprobar", group: "Ahora", description: "Todo lo que espera tu decisión", icon: ClipboardCheck, badge: "approvals",
    views: [view("bandeja", "Por aprobar", "/superadmin/aprobar/bandeja", "ApprovalsPage")]
  },
  {
    id: "admision", label: "Dentro del hotel", group: "Ahora", description: "Quién está dentro, por dónde entró y el aforo de cada servicio", icon: ScanLine,
    views: [
      view("aforo", "Aforo en vivo", "/piscina/clientes-activos", "LiveOccupancyPage"),
      view("accesos", "Accesos con QR", "/accesos", "AccessLogPage")
    ]
  },
  {
    id: "reservas", label: "Reservas", group: "Ventas", description: "Las reservas de los cinco servicios", icon: CalendarCheck,
    views: [
      view("general", "Todas", "/reservas", "ReservationsOverviewPage"),
      view("hospedaje", "Hospedaje", "/hotel/reservas", "ReservationsPage"),
      view("piscina", "Piscina", "/piscina/ingresos", "PoolReservationsPage"),
      view("mirador", "Mirador", "/eventos/mirador", "MiradorReservationsPage"),
      view("terraza", "Terraza", "/eventos/terraza", "TerrazaReservationsPage"),
      view("eventos", "Eventos", "/eventos/reservas", "EventsReservationsPage")
    ]
  },
  {
    id: "clientes", label: "Clientes", group: "Ventas", description: "Identidad, historial y consumo de cada persona", icon: Users,
    views: [
      view("directorio", "Directorio", "/clientes", "ClientDirectoryPage"),
      // El perfil se abre desde el directorio o el buscador (necesita un cliente elegido): no es una pestaña.
      view("perfil", "Perfil 360°", "/clientes/perfil", "ClientProfilePage", { hidden: true })
    ]
  },
  {
    id: "catalogo", label: "Lo que ve el cliente", group: "Ventas", description: "Servicios, precios, habitaciones, carta, textos e imágenes de la app del cliente", icon: Sparkles,
    views: [
      view("servicios", "Servicios y tarifas", "/admin/comercial", "ServicesPricingPage"),
      view("habitaciones", "Habitaciones", "/habitaciones", "RoomsCatalogPage"),
      view("carta", "Carta", "/admin/alimentos-bebidas", "MenuCatalogPage"),
      view("contenido", "Textos e imágenes", "/admin/contenido", "SiteContentPage")
    ]
  },
  {
    id: "restaurante", label: "Cocina", group: "Operación", description: "Pedidos, recetas, preparación y cierres de cocina", icon: ChefHat,
    views: [
      view("pedidos", "Pedidos en vivo", "/control-gastronomico/restaurante", "OrdersMonitorPage"),
      view("recetas", "Recetas", "/inventario/recetas", "RecipesAdminPage"),
      view("preparacion", "Preparación", "/inventario/produccion", "PrepPage"),
      view("cierres", "Cierres", "/inventario/turnos", "ClosingsReviewPage")
    ]
  },
  {
    id: "bar", label: "Bar", group: "Operación", description: "Pedidos, recetas, botellas y cierres del bar", icon: Wine,
    views: [
      view("pedidos", "Pedidos en vivo", "/control-gastronomico/bar", "OrdersMonitorPage"),
      view("recetas", "Recetas", "/inventario/recetas-bar", "RecipesAdminPage"),
      view("botellas", "Botellas", "/bartender/botellas", "BottlesReviewPage"),
      view("cierres", "Cierres", "/inventario/turnos-bar", "ClosingsReviewPage")
    ]
  },
  {
    id: "inventario", label: "Inventario", group: "Operación", description: "Existencias, movimientos, mermas y food cost", icon: Boxes,
    views: [
      view("existencias", "Existencias", "/admin/inventario", "StockOverviewPage"),
      view("movimientos", "Movimientos", "/inventario/kardex", "StockMovementsPage"),
      view("mermas", "Mermas", "/inventario/mermas", "WasteReportPage"),
      view("foodcost", "Food cost", "/admin/food-cost", "FoodCostPage")
    ]
  },
  {
    id: "compras", label: "Compras", group: "Operación", description: "Necesidades del día, solicitudes, órdenes, proveedores y distribución", icon: ShoppingCart,
    views: [
      view("necesidades", "Necesidades del día", "/admin/necesidades-del-dia", "DailyNeedsPage"),
      view("solicitudes", "Solicitudes de las áreas", "/admin/solicitudes-stock", "StockRequestsReviewPage"),
      view("lista", "Órdenes de compra", "/compras", "PurchasesPage"),
      view("proveedores", "Proveedores", "/proveedores", "SuppliersPage"),
      view("distribucion", "Distribución", "/transferencias", "TransfersPage")
    ]
  },
  {
    id: "operaciones", label: "Limpieza y mantenimiento", group: "Operación", description: "Tareas, reparaciones y evidencias", icon: Wrench,
    views: [
      view("limpieza", "Limpieza", "/admin/limpieza/resumen", "CleaningReviewPage"),
      view("mantenimiento", "Mantenimiento", "/incidencias", "MaintenanceReviewPage")
    ]
  },
  {
    id: "equipo", label: "Equipo", group: "Operación", description: "Quién trabaja, asistencia, días validados y planilla", icon: UserCog,
    views: [
      view("torre", "Torre de control", "/admin/torre-de-control", "ControlTowerPage"),
      view("personal", "Personal", "/empleados", "StaffPage"),
      view("turnos", "Turnos y asistencia", "/turnos", "ShiftsAdminPage")
    ]
  },
  {
    id: "dinero", label: "Cobros y caja", group: "Dinero", description: "Pagos, cajas, comprobantes y devoluciones", icon: CircleDollarSign,
    views: [
      view("pagos", "Ingresos y pagos", "/pagos", "PaymentsLedgerPage"),
      view("cajas", "Cajas y cierre diario", "/admin-panel/caja-central", "CashAdminPage"),
      view("facturacion", "Boletas y facturas", "/facturacion", "BillingPage"),
      view("devoluciones", "Devoluciones", "/devoluciones", "RefundsPage")
    ]
  },
  {
    id: "gastos", label: "Gastos", group: "Dinero", description: "Lo que sale y a qué servicio se imputa", icon: Receipt,
    views: [view("gastos", "Gastos", "/caja", "ExpensesPage")]
  },
  {
    id: "rentabilidad", label: "Rentabilidad", group: "Dinero", description: "Ventas, gastos y margen de cada servicio", icon: LineChart,
    views: [view("rentabilidad", "Rentabilidad por servicio", "/reportes", "ProfitabilityPage")]
  },
  {
    id: "sistema", label: "Configuración", group: "Sistema", description: "Datos del hotel, usuarios y permisos", icon: Settings,
    views: [
      view("configuracion", "General", "/configuracion", "SettingsPage"),
      view("usuarios", "Usuarios", "/usuarios", "UsersPage"),
      view("permisos", "Roles y permisos", "/roles", "RolesPage")
    ]
  },
  {
    id: "control", label: "Seguridad y salud", group: "Sistema", description: "Salud del sistema, auditoría y calidad de los datos", icon: ShieldCheck,
    views: [
      view("salud", "Salud del sistema", "/salud", "SystemHealthPage"),
      view("auditoria", "Auditoría", "/auditoria", "AuditPage"),
      view("datos", "Calidad de los datos", "/admin/integridad", "DataIntegrityPage")
    ]
  }
];

// Enlaces de organizaciones anteriores (enlaces guardados, avisos del servidor como owner-home.js u
// owner-approvals.js con go: ["insumos", "existencias"], botones viejos): siguen llegando a su pantalla vigente.
const LEGACY_VIEW_ALIASES = {
  "restaurante:consumo": ["restaurante", "cierres"],
  "insumos:mermas-turno": ["inventario", "mermas"],
  "admision:llegadas": ["admision", "aforo"],
  "admision:qr": ["admision", "accesos"],
  "experiencias:horarios": ["catalogo", "servicios"],
  "experiencias:promociones": ["catalogo", "servicios"],
  "equipo:roles": ["sistema", "permisos"],
  "operaciones:areas": ["catalogo", "habitaciones"],
  "sistema:notificaciones": ["sistema", "configuracion"],
  "insumos:existencias": ["inventario", "existencias"],
  "insumos:movimientos": ["inventario", "movimientos"],
  "insumos:mermas": ["inventario", "mermas"],
  "insumos:foodcost": ["inventario", "foodcost"],
  "insumos:necesidades": ["compras", "necesidades"],
  "insumos:solicitudes": ["compras", "solicitudes"],
  "insumos:lista": ["compras", "lista"],
  "insumos:proveedores": ["compras", "proveedores"],
  "insumos:distribucion": ["compras", "distribucion"],
  "inventario:necesidades": ["compras", "necesidades"],
  "inventario:solicitudes": ["compras", "solicitudes"],
  "dinero:gastos": ["gastos", "gastos"],
  "dinero:rentabilidad": ["rentabilidad", "rentabilidad"],
  "sistema:auditoria": ["control", "auditoria"],
  "sistema:datos": ["control", "datos"],
  "sistema:salud": ["control", "salud"]
};
const LEGACY_MODULE_ALIASES = { experiencias: "catalogo", insumos: "inventario" };

/** Traduce un par (módulo, vista) antiguo al par vigente. Si ya es vigente lo devuelve igual. */
export function resolveSuperAdminTarget(moduleId, viewId) {
  const viaView = LEGACY_VIEW_ALIASES[`${moduleId}:${viewId}`];
  if (viaView) return viaView;
  return [LEGACY_MODULE_ALIASES[moduleId] || moduleId, viewId];
}

export const SUPERADMIN_MODULES = RAW_MODULES;
export const SUPERADMIN_GROUPS = [...new Set(RAW_MODULES.map((module) => module.group))];

export const superAdminUrl = (moduleId, viewId) => {
  if (moduleId === "inicio") return "/superadmin";
  const module = RAW_MODULES.find((item) => item.id === moduleId);
  return module && module.views.length === 1 ? `/superadmin/${moduleId}` : `/superadmin/${moduleId}/${viewId}`;
};

export function findSuperAdminDestination(pathname) {
  if (pathname === "/superadmin" || pathname === "/superadmin/" || pathname === "/superadmin/mockup") {
    return { module: RAW_MODULES[0], view: RAW_MODULES[0].views[0] };
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "superadmin") return null;
  const [moduleId, viewId] = resolveSuperAdminTarget(parts[1], parts[2]);
  const module = RAW_MODULES.find((item) => item.id === moduleId);
  if (!module) return null;
  // Sin vista, con la antigua "panel" del módulo o con una vista que ya no existe: la primera pestaña.
  const selectedView = module.views.find((item) => item.id === viewId) || (!parts[2] || parts[2] === "panel" || LEGACY_MODULE_ALIASES[parts[1]] ? module.views[0] : null);
  return selectedView ? { module, view: selectedView } : null;
}

export function superAdminPathForLegacy(pathname) {
  if (pathname.startsWith("/superadmin")) return null;
  for (const module of RAW_MODULES) {
    const selectedView = module.views.find((item) => item.legacyPath === pathname);
    if (selectedView) return superAdminUrl(module.id, selectedView.id);
  }
  return null;
}
