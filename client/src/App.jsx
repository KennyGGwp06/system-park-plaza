import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { useAuth } from "./context/AuthContext";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { defaultRouteByRole, menuByRole, permissionForHref } from "./constants/menu";

const lazyPage = (loader, exportName) => lazy(() => loader().then((module) => ({ default: module[exportName] })));
const Login = lazyPage(() => import("./pages/Login"), "Login");
const Forbidden = lazyPage(() => import("./pages/Forbidden"), "Forbidden");
const Dashboard = lazyPage(() => import("./modules/dashboard/Dashboard"), "Dashboard");
const ClientsPage = lazyPage(() => import("./modules/clients/ClientsPage"), "ClientsPage");
const RoomsPage = lazyPage(() => import("./modules/rooms/RoomsPage"), "RoomsPage");
const ReservationsPage = lazyPage(() => import("./modules/reservations/ReservationsPage"), "ReservationsPage");
const ReceptionPage = lazyPage(() => import("./modules/reception/ReceptionPage"), "ReceptionPage");
const CheckInPage = lazyPage(() => import("./modules/reception/CheckInPage"), "CheckInPage");
const CheckOutPage = lazyPage(() => import("./modules/reception/CheckOutPage"), "CheckOutPage");
const RestaurantLegacyFallback = lazyPage(() => import("./modules/employees/RestaurantLegacyFallback"), "RestaurantLegacyFallback");
const RestaurantDashboard = lazyPage(() => import("./modules/employees/RestaurantDashboard"), "RestaurantDashboard");
const RestaurantOrdersPage = lazyPage(() => import("./modules/employees/RestaurantOrdersPage"), "RestaurantOrdersPage");
const RestaurantRecipesPage = lazyPage(() => import("./modules/employees/RestaurantRecipesPage"), "RestaurantRecipesPage");
const RestaurantInventoryPage = lazyPage(() => import("./modules/employees/RestaurantInventoryPage"), "RestaurantInventoryPage");
const BarDashboard = lazyPage(() => import("./modules/employees/BarPages"), "BarDashboard");
const BarOrdersPage = lazyPage(() => import("./modules/employees/BarPages"), "BarOrdersPage");
const BarRecipesPage = lazyPage(() => import("./modules/employees/BarPages"), "BarRecipesPage");
const BarInventoryPage = lazyPage(() => import("./modules/employees/BarPages"), "BarInventoryPage");
const BarLegacyFallback = lazyPage(() => import("./modules/employees/BarLegacyFallback"), "BarLegacyFallback");
const PoolPage = lazyPage(() => import("./modules/employees/PoolPage"), "PoolPage");
const CleaningPage = lazyPage(() => import("./modules/employees/CleaningPage"), "CleaningPage");
const EventsPage = lazyPage(() => import("./modules/events/EventsPage"), "EventsPage");
const InventoryPage = lazyPage(() => import("./modules/inventory/InventoryPage"), "InventoryPage");
const ProductCatalogPage = lazyPage(() => import("./modules/inventory/ProductCatalogPage"), "ProductCatalogPage");
const PurchasesPage = lazyPage(() => import("./modules/inventory/PurchasesPage"), "PurchasesPage");
const TransfersPage = lazyPage(() => import("./modules/inventory/TransfersPage"), "TransfersPage");
const OperationalInventoryPage = lazyPage(() => import("./modules/inventory/OperationalInventoryPage"), "OperationalInventoryPage");
const TechnicalRecipesPage = lazyPage(() => import("./modules/inventory/TechnicalRecipesPage"), "TechnicalRecipesPage");
const TransformationsPage = lazyPage(() => import("./modules/inventory/TransformationsPage"), "TransformationsPage");
const BarBottlePage = lazyPage(() => import("./modules/inventory/BarBottlePage"), "BarBottlePage");
const ReportsPage = lazyPage(() => import("./modules/reports/ReportsPage"), "ReportsPage");
const AdminResourcePage = lazyPage(() => import("./modules/admin/AdminResourcePage"), "AdminResourcePage");
const UsersPage = lazyPage(() => import("./modules/admin/UsersPage"), "UsersPage");
const RolesPage = lazyPage(() => import("./modules/admin/RolesPage"), "RolesPage");
const AdminCleaningPage = lazyPage(() => import("./modules/admin/AdminCleaningPage"), "AdminCleaningPage");
const AdminBartenderPage = lazyPage(() => import("./modules/admin/AdminBartenderPage"), "AdminBartenderPage");
const AdminRestaurantPage = lazyPage(() => import("./modules/admin/AdminRestaurantPage"), "AdminRestaurantPage");
const FoodBeverageControlPage = lazyPage(() => import("./modules/admin/FoodBeverageControlPage"), "FoodBeverageControlPage");
const AdminMaintenancePage = lazyPage(() => import("./modules/admin/AdminMaintenancePage"), "AdminMaintenancePage");
const SuperAdminV6Page = lazyPage(() => import("./modules/admin/SuperAdminV6Page"), "SuperAdminV6Page");
const SuperAdminLegacyFallback = lazyPage(() => import("./modules/admin/SuperAdminLegacyFallback"), "SuperAdminLegacyFallback");
const AdminReceptionV6Page = lazyPage(() => import("./modules/admin/AdminReceptionV6Page"), "AdminReceptionV6Page");
const AdminReceptionLegacyFallback = lazyPage(() => import("./modules/admin/AdminReceptionLegacyFallback"), "AdminReceptionLegacyFallback");
const InventoryAdminDashboardPage = lazyPage(() => import("./modules/admin/InventoryAdminDashboardPage"), "InventoryAdminDashboardPage");
const AdminMasterDashboard = lazyPage(() => import("./modules/admin/AdminCommandCenter"), "AdminCommandCenter");
const CentralCashRegister = lazyPage(() => import("./modules/finance/CentralCashRegister"), "CentralCashRegister");
const AdminMiCajaPage = lazyPage(() => import("./modules/finance/AdminMiCajaPage"), "AdminMiCajaPage");
const AccessControlPage = lazyPage(() => import("./modules/admin/AccessControlPage"), "AccessControlPage");
const AttendanceClockPage = lazyPage(() => import("./modules/employees/AttendanceClockPage"), "AttendanceClockPage");
const WorkforcePage = lazyPage(() => import("./modules/admin/WorkforcePage"), "WorkforcePage");
const DataIntegrityPage = lazyPage(() => import("./modules/admin/DataIntegrityPage"), "DataIntegrityPage");
const CommercialSettingsPage = lazyPage(() => import("./modules/admin/CommercialSettingsPage"), "CommercialSettingsPage");

const preloadersByRole = {
  ADMINISTRADOR: [
    () => import("./modules/admin/AdminCommandCenter"),
    () => import("./modules/admin/InventoryAdminDashboardPage"),
    () => import("./modules/admin/FoodBeverageControlPage"),
    () => import("./modules/admin/DataIntegrityPage")
  ],
  RECEPCION: [() => import("./modules/reception/ReceptionPage"), () => import("./modules/reception/CheckInPage")],
  RESTAURANTE: [
    () => import("./modules/employees/RestaurantDashboard"),
    () => import("./modules/employees/RestaurantOrdersPage"),
    () => import("./modules/employees/RestaurantRecipesPage"),
    () => import("./modules/employees/RestaurantInventoryPage"),
    () => import("./modules/employees/RestaurantLegacyFallback")
  ],
  BARTENDER: [
    () => import("./modules/employees/BarPages"),
    () => import("./modules/employees/BarLegacyFallback")
  ],
  LIMPIEZA: [() => import("./modules/employees/CleaningPage")]
};

const protectedRoutes = [
  ["/dashboard", "DASHBOARD:VER", <Dashboard />],
  ["/superadmin", "ADMINISTRADOR:VER", <SuperAdminV6Page />, ["SUPERADMIN"]],
  ["/superadmin-legacy", "ADMINISTRADOR:VER", <SuperAdminLegacyFallback />, ["SUPERADMIN"]],
  ["/admin-panel", "ADMINISTRADOR:VER", <AdminReceptionV6Page />, ["ADMINISTRADOR"]],
  ["/admin-panel-legacy", "ADMINISTRADOR:VER", <AdminReceptionLegacyFallback />, ["ADMINISTRADOR"]],
  ["/admin-panel/mi-caja", "ADMINISTRADOR:VER", <AdminMiCajaPage />, ["ADMINISTRADOR"]],
  ["/admin-panel/caja-central", "ADMINISTRADOR:VER", <CentralCashRegister />, ["SUPERADMIN"]],
  ["/admin/comercial", "INVENTARIO:VER", <CommercialSettingsPage />, ["SUPERADMIN"]],
  ["/admin/alimentos-bebidas", "INVENTARIO:VER", <FoodBeverageControlPage />, ["SUPERADMIN"]],
  ["/clientes", "CLIENTES:VER", <ClientsPage />],
  ["/habitaciones", "HABITACIONES:VER", <RoomsPage />],
  ["/reservas", "RESERVAS:VER", <ReservationsPage />],
  ["/checkin", "CHECK_IN:VER", <CheckInPage />],
  ["/checkout", "CHECK_OUT:VER", <CheckOutPage />],
  ["/recepcion", "RECEPCION:VER", <ReceptionPage />],
  ["/operaciones", "RECEPCION:CREAR", <AdminResourcePage type="operaciones" />],
  ["/consumos", "PEDIDOS:VER", <AdminResourcePage type="consumos" />],
  ["/restaurante", "RESTAURANTE:VER", <RestaurantDashboard />, ["RESTAURANTE"]],
  ["/restaurante/dashboard", "RESTAURANTE:VER", <RestaurantDashboard />],
  ["/restaurante/pedidos", "RESTAURANTE:VER", <RestaurantOrdersPage />],
  ["/restaurante/inventario/insumos", "RESTAURANTE:VER", <RestaurantInventoryPage />],
  ["/restaurante/inventario/recetas", "RESTAURANTE:VER", <RestaurantRecipesPage />],
  ["/restaurante/inventario/mermas", "RESTAURANTE:VER", <RestaurantInventoryPage />],
  ["/restaurante/inventario/cierre", "RESTAURANTE:VER", <RestaurantInventoryPage />],
  ["/restaurante-legacy", "RESTAURANTE:VER", <RestaurantLegacyFallback />],
  ["/cocina/estacion", "RESTAURANTE:VER", <RestaurantOrdersPage />],
  ["/admin/restaurante/resumen", "RESTAURANTE:VER", <AdminRestaurantPage view="resumen" />],
  ["/admin/restaurante/pedidos", "RESTAURANTE:VER", <AdminRestaurantPage view="pedidos" />],
  ["/admin/restaurante/cocina", "RESTAURANTE:VER", <AdminRestaurantPage view="cocina" />],
  ["/admin/restaurante/preparando", "RESTAURANTE:VER", <AdminRestaurantPage view="preparando" />],
  ["/admin/restaurante/listos", "RESTAURANTE:VER", <AdminRestaurantPage view="listos" />],
  ["/admin/restaurante/entregados", "RESTAURANTE:VER", <AdminRestaurantPage view="entregados" />],
  ["/admin/restaurante/incidencias", "RESTAURANTE:VER", <AdminRestaurantPage view="incidencias" />],
  ["/bartender", "BARTENDER:VER", <BarDashboard />, ["BARTENDER"]],
  ["/bartender/dashboard", "BARTENDER:VER", <BarDashboard />],
  ["/bartender/pedidos", "BARTENDER:VER", <BarOrdersPage />],
  ["/bartender/inventario/insumos", "BARTENDER:VER", <BarInventoryPage />],
  ["/bartender/inventario/recetas", "BARTENDER:VER", <BarRecipesPage />],
  ["/bartender/inventario/mermas", "BARTENDER:VER", <BarInventoryPage />],
  ["/bartender/inventario/cierre", "BARTENDER:VER", <BarInventoryPage />],
  ["/bartender-legacy", "BARTENDER:VER", <BarLegacyFallback />, ["BARTENDER"]],
  ["/bartender/botellas", "BARTENDER:VER", <BarBottlePage />, ["SUPERADMIN"]],
  ["/bar/estacion", "BARTENDER:VER", <BarOrdersPage />],
  ["/admin/bartender/resumen", "BARTENDER:VER", <AdminBartenderPage view="resumen" />],
  ["/admin/bartender/pedidos", "BARTENDER:VER", <AdminBartenderPage view="pedidos" />],
  ["/admin/bartender/historial", "BARTENDER:VER", <AdminBartenderPage view="historial" />],
  ["/admin/bartender/incidencias", "BARTENDER:VER", <AdminBartenderPage view="incidencias" />],
  ["/piscina/ingresos", "RECEPCION:VER", <PoolPage />],
  ["/piscina/validar-qr", "RECEPCION:VER", <PoolPage />],
  ["/piscina/clientes-activos", "RECEPCION:VER", <PoolPage />],
  ["/piscina/reportes", "RECEPCION:VER", <PoolPage />],
  ["/eventos/calendario", "EVENTOS:VER", <EventsPage />],
  ["/eventos/reservas", "EVENTOS:VER", <EventsPage />],
  ["/eventos/terraza", "EVENTOS:VER", <EventsPage />],
  ["/eventos/mirador", "EVENTOS:VER", <EventsPage />],
  ["/eventos/contratos", "EVENTOS:VER", <AdminResourcePage type="contratos" />],
  ["/eventos/pagos", "PAGOS:VER", <AdminResourcePage type="pagosEventos" />],
  ["/cochera", "COCHERA:VER", <AdminResourcePage type="cochera" />],
  ["/limpieza/dashboard", "LIMPIEZA:VER", <CleaningPage view="DASHBOARD" />],
  ["/limpieza/pendientes", "LIMPIEZA:VER", <CleaningPage view="PENDIENTES" />],
  ["/limpieza/finalizadas", "LIMPIEZA:VER", <CleaningPage view="FINALIZADAS" />],
  ["/limpieza/evidencias", "LIMPIEZA:VER", <CleaningPage view="EVIDENCIAS" />],
  ["/limpieza/incidencias", "LIMPIEZA:VER", <CleaningPage view="INCIDENCIAS" />],
  ["/admin/limpieza/resumen", "LIMPIEZA:VER", <AdminCleaningPage view="resumen" />],
  ["/admin/limpieza/pendientes", "LIMPIEZA:VER", <AdminCleaningPage view="pendientes" />],
  ["/admin/limpieza/finalizadas", "LIMPIEZA:VER", <AdminCleaningPage view="finalizadas" />],
  ["/admin/limpieza/evidencias", "LIMPIEZA:VER", <AdminCleaningPage view="evidencias" />],
  ["/admin/limpieza/incidencias", "LIMPIEZA:VER", <AdminCleaningPage view="incidencias" />],
  ["/incidencias", "REPORTES:VER", <AdminMaintenancePage view="resumen" />, ["SUPERADMIN", "ADMINISTRADOR", "RECEPCION"]],
  ["/incidencias/abiertas", "REPORTES:VER", <AdminMaintenancePage view="solicitudes" />, ["SUPERADMIN", "ADMINISTRADOR", "RECEPCION"]],
  ["/incidencias/seguimiento", "REPORTES:VER", <AdminMaintenancePage view="reparacion" />, ["SUPERADMIN", "ADMINISTRADOR", "RECEPCION"]],
  ["/incidencias/cerradas", "REPORTES:VER", <AdminMaintenancePage view="finalizados" />, ["SUPERADMIN", "ADMINISTRADOR", "RECEPCION"]],
  ["/inventario", "INVENTARIO:VER", <InventoryPage />],
  ["/admin/inventario", "INVENTARIO:VER", <InventoryAdminDashboardPage />, ["SUPERADMIN"]],
  ["/admin/integridad", "INVENTARIO:VER", <DataIntegrityPage />, ["SUPERADMIN"]],
  ["/inventario/kardex", "INVENTARIO:VER", <InventoryPage />, ["SUPERADMIN"]],
  ["/inventario/turnos", "INVENTARIO:VER", <OperationalInventoryPage />, ["SUPERADMIN"]],
  ["/inventario/recetas", "INVENTARIO:VER", <TechnicalRecipesPage />, ["SUPERADMIN"]],
  ["/inventario/produccion", "INVENTARIO:VER", <TransformationsPage />, ["SUPERADMIN"]],
  ["/inventario/catalogo", "INVENTARIO:VER", <ProductCatalogPage />, ["SUPERADMIN"]],
  ["/transferencias", "INVENTARIO:VER", <TransfersPage />, ["SUPERADMIN"]],
  ["/compras", "COMPRAS:VER", <PurchasesPage />, ["SUPERADMIN"]],
  ["/proveedores", "PROVEEDORES:VER", <AdminResourcePage type="proveedores" />],
  ["/pagos", "PAGOS:VER", <AdminResourcePage type="pagos" />],
  ["/facturacion", "FACTURACION:VER", <AdminResourcePage type="facturacion" />],
  ["/caja", "CAJA:VER", <AdminResourcePage type="caja" />],
  ["/usuarios", "USUARIOS:VER", <UsersPage />],
  ["/roles", "ROLES:VER", <RolesPage />],
  ["/reportes", "REPORTES:VER", <ReportsPage />, ["SUPERADMIN"]],
  ["/auditoria", "AUDITORIA:VER", <AdminResourcePage type="auditoria" />],
  ["/configuracion", "CONFIGURACION:VER", <AdminResourcePage type="configuracion" />]
  ,["/accesos", "ACCESOS:VER", <AccessControlPage />]
  ,["/empleados", "EMPLEADOS:VER", <WorkforcePage view="empleados" />]
  ,["/turnos", "TURNOS:VER", <WorkforcePage view="turnos" />]
  ,["/planilla", "TURNOS:VER", <WorkforcePage view="planilla" />]
];

export function App() {
  const { loading, user } = useAuth();
  useEffect(() => {
    const modules = preloadersByRole[user?.role] || [];
    if (!modules.length) return undefined;
    const preload = () => modules.forEach((load) => load());
    const idleId = window.requestIdleCallback?.(preload, { timeout: 2000 }) || window.setTimeout(preload, 700);
    return () => window.cancelIdleCallback?.(idleId) || window.clearTimeout(idleId);
  }, [user?.role]);
  if (loading) return <LoadingSpinner />;

  return (
    <Suspense fallback={<main className="p-4 lg:p-6"><LoadingSpinner label="Cargando módulo..." /></main>}>
    <Routes>
      <Route path="/reloj" element={<AttendanceClockPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/403" element={<Forbidden />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />
        {protectedRoutes.map(([path, permission, element, roles]) => (
          <Route key={path} path={path} element={<RequirePermission permission={permission} roles={roles}>{element}</RequirePermission>} />
        ))}
      </Route>
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
    </Suspense>
  );
}

function RoleRedirect() {
  const { user, hasPermission } = useAuth();
  const preferred = defaultRouteByRole[user?.role];
  if (preferred && hasPermission(permissionForHref(preferred))) return <Navigate to={preferred} replace />;
  const fallback = (menuByRole[user?.role] || []).find((item) => hasPermission(permissionForHref(item[1])));
  return <Navigate to={fallback?.[1] || "/403"} replace />;
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RequirePermission({ permission, roles, children }) {
  const { hasPermission, user } = useAuth();
  const roleAllowed = !roles?.length || roles.includes(user?.role);
  return roleAllowed && hasPermission(permission) ? children : <Forbidden />;
}

