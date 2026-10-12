// Qué pantalla abre cada vista del dueño ("módulo:vista"). Todas reciben { module, view, navigate, approvals, area }
// del armazón (OwnerShell). El Tablero (inicio) lo dibuja el armazón con OwnerBoard.
import { createElement, lazy } from "react";

const page = (loader, name, props = {}) => {
  const Component = lazy(() => loader().then((mod) => ({ default: mod[name] })));
  return (shellProps) => createElement(Component, { ...shellProps, ...props });
};

const clients = () => import("./ClientsHub");
const reservations = () => import("./SuperAdminReservationsPage");
const dueno = (file) => () => import(`../dueno/${file}.jsx`);

export const OWNER_PAGES = {
  "aprobar:bandeja": page(dueno("ApprovalsPage"), "ApprovalsPage"),
  "admision:aforo": page(() => import("./LiveOccupancyPage"), "LiveOccupancyPage"),
  "admision:accesos": page(dueno("AccessLogPage"), "AccessLogPage"),
  "reservas:general": page(reservations, "ReservationsOverviewPage"),
  "reservas:hospedaje": page(() => import("../reservations/ReservationsPage"), "ReservationsPage", { superAdmin: true }),
  "reservas:piscina": page(reservations, "PoolReservationsPage"),
  "reservas:mirador": page(reservations, "MiradorReservationsPage"),
  "reservas:terraza": page(reservations, "TerrazaReservationsPage"),
  "reservas:eventos": page(dueno("EventsOwnerPage"), "EventsOwnerPage"),
  "clientes:directorio": page(clients, "ClientDirectoryPage"),
  "clientes:perfil": page(clients, "ClientProfilePage"),
  "catalogo:servicios": page(dueno("ServicesPricingPage"), "ServicesPricingPage"),
  "catalogo:habitaciones": page(dueno("RoomsCatalogPage"), "RoomsCatalogPage"),
  "catalogo:carta": page(dueno("MenuCatalogPage"), "MenuCatalogPage"),
  "catalogo:contenido": page(dueno("SiteContentPage"), "SiteContentPage"),
  "restaurante:pedidos": page(dueno("OrdersMonitorPage"), "OrdersMonitorPage", { area: "RESTAURANTE" }),
  "restaurante:recetas": page(dueno("RecipesAdminPage"), "RecipesAdminPage", { area: "RESTAURANTE" }),
  "restaurante:preparacion": page(() => import("../cocina/PrepPage"), "PrepPage"),
  "restaurante:cierres": page(dueno("ClosingsReviewPage"), "ClosingsReviewPage", { area: "RESTAURANTE" }),
  "bar:pedidos": page(dueno("OrdersMonitorPage"), "OrdersMonitorPage", { area: "BARTENDER" }),
  "bar:recetas": page(dueno("RecipesAdminPage"), "RecipesAdminPage", { area: "BARTENDER" }),
  "bar:botellas": page(dueno("BottlesReviewPage"), "BottlesReviewPage"),
  "bar:cierres": page(dueno("ClosingsReviewPage"), "ClosingsReviewPage", { area: "BARTENDER" }),
  "inventario:existencias": page(dueno("StockOverviewPage"), "StockOverviewPage"),
  "inventario:movimientos": page(dueno("StockMovementsPage"), "StockMovementsPage"),
  "inventario:mermas": page(dueno("WasteReportPage"), "WasteReportPage"),
  "inventario:foodcost": page(dueno("FoodCostPage"), "FoodCostPage"),
  "compras:necesidades": page(dueno("DailyNeedsPage"), "DailyNeedsPage"),
  "compras:solicitudes": page(dueno("StockRequestsReviewPage"), "StockRequestsReviewPage"),
  "compras:lista": page(dueno("PurchasesPage"), "PurchasesPage"),
  "compras:proveedores": page(dueno("SuppliersPage"), "SuppliersPage"),
  "compras:distribucion": page(dueno("TransfersPage"), "TransfersPage"),
  "operaciones:limpieza": page(dueno("CleaningReviewPage"), "CleaningReviewPage"),
  "operaciones:mantenimiento": page(dueno("MaintenanceReviewPage"), "MaintenanceReviewPage"),
  "equipo:torre": page(dueno("ControlTowerPage"), "ControlTowerPage"),
  "equipo:personal": page(dueno("StaffPage"), "StaffPage"),
  "equipo:turnos": page(dueno("ShiftsAdminPage"), "ShiftsAdminPage"),
  "dinero:pagos": page(dueno("PaymentsLedgerPage"), "PaymentsLedgerPage"),
  "dinero:cajas": page(dueno("CashAdminPage"), "CashAdminPage"),
  "dinero:facturacion": page(dueno("BillingPage"), "BillingPage"),
  "dinero:devoluciones": page(() => import("./RefundsPage"), "RefundsPage"),
  "gastos:gastos": page(dueno("ExpensesPage"), "ExpensesPage"),
  "rentabilidad:rentabilidad": page(() => import("./ProfitabilityPage"), "ProfitabilityPage"),
  "sistema:configuracion": page(dueno("SettingsPage"), "SettingsPage"),
  "sistema:usuarios": page(dueno("UsersPage"), "UsersPage"),
  "sistema:permisos": page(dueno("RolesPage"), "RolesPage"),
  "control:salud": page(dueno("SystemHealthPage"), "SystemHealthPage"),
  "control:auditoria": page(dueno("AuditPage"), "AuditPage"),
  "control:datos": page(dueno("DataIntegrityPage"), "DataIntegrityPage")
};
