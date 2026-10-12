import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { useAuth } from "./context/AuthContext";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { useFetch } from "./hooks/useFetch";
import { superAdminPathForLegacy } from "./modules/admin/superAdminNavigation";
import { HOME_BY_ROLE } from "./constants/roles";
import { RECEPTION_LEGACY_REDIRECTS } from "./modules/admin/adminReceptionNavigation";
import { BAR_LEGACY_REDIRECTS, KITCHEN_LEGACY_REDIRECTS } from "./modules/cocina/kitchenNavigation";
import { OPS_LEGACY_REDIRECTS } from "./modules/operaciones/opsNavigation";

const lazyPage = (loader, exportName) => lazy(() => loader().then((module) => ({ default: module[exportName] })));
const Login = lazyPage(() => import("./pages/Login"), "Login");
const Forbidden = lazyPage(() => import("./pages/Forbidden"), "Forbidden");
const AttendanceClockPage = lazyPage(() => import("./modules/employees/AttendanceClockPage"), "AttendanceClockPage");
// Dueño
const OwnerShell = lazyPage(() => import("./modules/admin/OwnerShell"), "OwnerShell");
// Recepción
const DeskPage = lazyPage(() => import("./modules/recepcion/DeskPage"), "DeskPage");
const MovementsPage = lazyPage(() => import("./modules/recepcion/MovementsPage"), "MovementsPage");
const RoomsBoardPage = lazyPage(() => import("./modules/recepcion/RoomsBoardPage"), "RoomsBoardPage");
const BookingsPage = lazyPage(() => import("./modules/recepcion/BookingsPage"), "BookingsPage");
const ReceivablesPage = lazyPage(() => import("./modules/recepcion/ReceivablesPage"), "ReceivablesPage");
const AccessPage = lazyPage(() => import("./modules/recepcion/AccessPage"), "AccessPage");
const PaymentsPage = lazyPage(() => import("./modules/recepcion/PaymentsPage"), "PaymentsPage");
const CashPage = lazyPage(() => import("./modules/recepcion/CashPage"), "CashPage");
const ParkingPage = lazyPage(() => import("./modules/recepcion/ParkingPage"), "ParkingPage");
const ClientsDeskPage = lazyPage(() => import("./modules/recepcion/ClientsDeskPage"), "ClientsDeskPage");
const EventsDeskPage = lazyPage(() => import("./modules/recepcion/EventsDeskPage"), "EventsDeskPage");
const RefundsPage = lazyPage(() => import("./modules/admin/RefundsPage"), "RefundsPage");
const LiveOccupancyPage = lazyPage(() => import("./modules/admin/LiveOccupancyPage"), "LiveOccupancyPage");
const ReceptionOnShiftPage = lazyPage(() => import("./modules/admin/ReceptionOnShiftPage"), "ReceptionOnShiftPage");
const CleaningReviewPage = lazyPage(() => import("./modules/dueno/CleaningReviewPage"), "CleaningReviewPage");
const MaintenanceReviewPage = lazyPage(() => import("./modules/dueno/MaintenanceReviewPage"), "MaintenanceReviewPage");
// Cocina y Bar
const KitchenHomePage = lazyPage(() => import("./modules/cocina/KitchenHomePage"), "KitchenHomePage");
const KitchenOrdersPage = lazyPage(() => import("./modules/cocina/KitchenOrdersPage"), "KitchenOrdersPage");
const RecipeBookPage = lazyPage(() => import("./modules/cocina/RecipeBookPage"), "RecipeBookPage");
const KitchenStockPage = lazyPage(() => import("./modules/cocina/KitchenStockPage"), "KitchenStockPage");
const KitchenSupplyPage = lazyPage(() => import("./modules/cocina/KitchenSupplyPage"), "KitchenSupplyPage");
const KitchenClosingPage = lazyPage(() => import("./modules/cocina/KitchenClosingPage"), "KitchenClosingPage");
const PrepPage = lazyPage(() => import("./modules/cocina/PrepPage"), "PrepPage");
const BarBottlesPage = lazyPage(() => import("./modules/cocina/BarBottlesPage"), "BarBottlesPage");
// Limpieza y Mantenimiento
const OpsHomePage = lazyPage(() => import("./modules/operaciones/OpsHomePage"), "OpsHomePage");
const CleaningTasksPage = lazyPage(() => import("./modules/operaciones/CleaningTasksPage"), "CleaningTasksPage");
const MaintenanceJobsPage = lazyPage(() => import("./modules/operaciones/MaintenanceJobsPage"), "MaintenanceJobsPage");
const OpsHistoryPage = lazyPage(() => import("./modules/operaciones/OpsHistoryPage"), "OpsHistoryPage");

const preloadersByRole = {
  SUPERADMIN: [() => import("./modules/admin/OwnerShell"), () => import("./modules/admin/OwnerHome")],
  ADMINISTRADOR: [() => import("./modules/recepcion/ReceptionShell"), () => import("./modules/recepcion/DeskPage"), () => import("./modules/recepcion/MovementsPage")],
  RESTAURANTE: [() => import("./modules/cocina/KitchenShell"), () => import("./modules/cocina/KitchenOrdersPage"), () => import("./modules/cocina/KitchenHomePage")],
  BARTENDER: [() => import("./modules/cocina/KitchenShell"), () => import("./modules/cocina/KitchenOrdersPage"), () => import("./modules/cocina/KitchenHomePage")],
  LIMPIEZA: [() => import("./modules/operaciones/OpsShell"), () => import("./modules/operaciones/OpsHomePage"), () => import("./modules/operaciones/CleaningTasksPage")],
  MANTENIMIENTO: [() => import("./modules/operaciones/OpsShell"), () => import("./modules/operaciones/OpsHomePage"), () => import("./modules/operaciones/MaintenanceJobsPage")]
};

// Solo las pantallas vigentes (2026-09-27). Cualquier dirección vieja pasa por LegacyRedirect: cada rol llega a su estación.
const RECEPTION = ["SUPERADMIN", "ADMINISTRADOR"];
const protectedRoutes = [
  ["/superadmin", "DASHBOARD:VER", <OwnerShell />, ["SUPERADMIN"]],
  ["/superadmin/*", "DASHBOARD:VER", <OwnerShell />, ["SUPERADMIN"]],
  ["/admin-panel", "DASHBOARD:VER", <DeskPage />, RECEPTION],
  ["/admin-panel/movimientos", "DASHBOARD:VER", <MovementsPage />, RECEPTION],
  ["/admin-panel/habitaciones", "DASHBOARD:VER", <RoomsBoardPage />, RECEPTION],
  ["/admin-panel/reservas", "DASHBOARD:VER", <BookingsPage />, RECEPTION],
  ["/admin-panel/cobros", "DASHBOARD:VER", <ReceivablesPage />, RECEPTION],
  ["/admin-panel/accesos", "DASHBOARD:VER", <AccessPage />, RECEPTION],
  ["/admin-panel/aforo", "DASHBOARD:VER", <LiveOccupancyPage endpoint="/reception/occupancy" />, RECEPTION],
  ["/admin-panel/cochera", "DASHBOARD:VER", <ParkingPage />, RECEPTION],
  ["/admin-panel/pagos", "DASHBOARD:VER", <PaymentsPage />, RECEPTION],
  ["/admin-panel/mi-caja", "CAJA:VER", <CashPage />, ["ADMINISTRADOR"]],
  ["/admin-panel/devoluciones", "DASHBOARD:VER", <RefundsPage />, RECEPTION],
  ["/admin-panel/personal-en-turno", "DASHBOARD:VER", <ReceptionOnShiftPage />, RECEPTION],
  ["/clientes", "CLIENTES:VER", <ClientsDeskPage />, RECEPTION],
  ["/eventos/reservas", "EVENTOS:VER", <EventsDeskPage />, RECEPTION],
  ["/admin/limpieza/resumen", "LIMPIEZA:VER", <CleaningReviewPage />, RECEPTION],
  ["/incidencias", "REPORTES:VER", <MaintenanceReviewPage />, RECEPTION],
  ["/restaurante/dashboard", "RESTAURANTE:VER", <KitchenHomePage />, ["RESTAURANTE"]],
  ["/restaurante/pedidos", "RESTAURANTE:VER", <KitchenOrdersPage />, ["RESTAURANTE"]],
  ["/restaurante/inventario/recetas", "RESTAURANTE:VER", <RecipeBookPage />, ["RESTAURANTE"]],
  ["/restaurante/produccion", "RESTAURANTE:VER", <PrepPage />, ["RESTAURANTE"]],
  ["/restaurante/inventario/insumos", "RESTAURANTE:VER", <KitchenStockPage />, ["RESTAURANTE"]],
  ["/restaurante/inventario/solicitudes", "RESTAURANTE:VER", <KitchenSupplyPage />, ["RESTAURANTE"]],
  ["/restaurante/inventario/cierre", "RESTAURANTE:VER", <KitchenClosingPage />, ["RESTAURANTE"]],
  ["/bartender/dashboard", "BARTENDER:VER", <KitchenHomePage />, ["BARTENDER"]],
  ["/bartender/pedidos", "BARTENDER:VER", <KitchenOrdersPage />, ["BARTENDER"]],
  ["/bartender/inventario/recetas", "BARTENDER:VER", <RecipeBookPage />, ["BARTENDER"]],
  ["/bartender/botellas", "BARTENDER:VER", <BarBottlesPage />, ["BARTENDER"]],
  ["/bartender/inventario/insumos", "BARTENDER:VER", <KitchenStockPage />, ["BARTENDER"]],
  ["/bartender/inventario/solicitudes", "BARTENDER:VER", <KitchenSupplyPage />, ["BARTENDER"]],
  ["/bartender/inventario/cierre", "BARTENDER:VER", <KitchenClosingPage />, ["BARTENDER"]],
  ["/limpieza", "LIMPIEZA:VER", <OpsHomePage />, ["LIMPIEZA"]],
  ["/limpieza/tareas", "LIMPIEZA:VER", <CleaningTasksPage />, ["LIMPIEZA"]],
  ["/limpieza/historial", "LIMPIEZA:VER", <OpsHistoryPage />, ["LIMPIEZA"]],
  ["/mantenimiento", "MANTENIMIENTO:VER", <OpsHomePage />, ["MANTENIMIENTO"]],
  ["/mantenimiento/trabajos", "MANTENIMIENTO:VER", <MaintenanceJobsPage />, ["MANTENIMIENTO"]],
  ["/mantenimiento/historial", "MANTENIMIENTO:VER", <OpsHistoryPage />, ["MANTENIMIENTO"]]
];

// Direcciones antiguas de cada rol (enlaces guardados, avisos del servidor, códigos QR impresos).
const EXTRA_RECEPTION_REDIRECTS = { "/eventos/calendario": "/eventos/reservas", "/admin/limpieza/pendientes": "/admin/limpieza/resumen", "/admin/limpieza/finalizadas": "/admin/limpieza/resumen", "/admin/limpieza/evidencias": "/admin/limpieza/resumen", "/admin/limpieza/incidencias": "/admin/limpieza/resumen", "/hotel/limpieza": "/admin/limpieza/resumen", "/hotel/mantenimiento": "/incidencias", "/incidencias/abiertas": "/incidencias", "/incidencias/seguimiento": "/incidencias", "/incidencias/cerradas": "/incidencias", "/devoluciones": "/admin-panel/devoluciones" };
function legacyTarget(role, pathname) {
  if (role === "SUPERADMIN") return superAdminPathForLegacy(pathname) || (pathname.startsWith("/superadmin") ? null : "/superadmin");
  if (role === "ADMINISTRADOR") return RECEPTION_LEGACY_REDIRECTS[pathname] || EXTRA_RECEPTION_REDIRECTS[pathname] || null;
  if (role === "RESTAURANTE") return KITCHEN_LEGACY_REDIRECTS[pathname] || null;
  if (role === "BARTENDER") return BAR_LEGACY_REDIRECTS[pathname] || null;
  if (["LIMPIEZA", "MANTENIMIENTO"].includes(role)) return OPS_LEGACY_REDIRECTS[pathname] || null;
  return null;
}

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
    <Suspense fallback={<LoadingSpinner label="Cargando módulo..." />}>
    <Routes>
      <Route path="/reloj" element={<AttendanceClockPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/403" element={<Forbidden />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />
        {protectedRoutes.map(([path, permission, element, roles]) => (
          <Route key={path} path={path} element={<RequirePermission permission={permission} roles={roles}><RequireGastronomyShift>{element}</RequireGastronomyShift></RequirePermission>} />
        ))}
      </Route>
      <Route path="*" element={<RequireAuth><LegacyRedirect /></RequireAuth>} />
    </Routes>
    </Suspense>
  );
}

function LegacyRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  const target = legacyTarget(user?.role, location.pathname);
  return target ? <Navigate to={`${target}${target.includes("?") ? "" : location.search}`} replace /> : <RoleRedirect />;
}

function RoleRedirect() {
  const { user } = useAuth();
  return <Navigate to={HOME_BY_ROLE[user?.role] || "/403"} replace />;
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RequirePermission({ permission, roles, children }) {
  const { hasPermission, user } = useAuth();
  const location = useLocation();
  const roleAllowed = !roles?.length || roles.includes(user?.role);
  // El dueño trabaja en su centro de dirección; solo entra a /admin-panel para ver la estación de Recepción.
  if (user?.role === "SUPERADMIN" && !location.pathname.startsWith("/superadmin") && !location.pathname.startsWith("/admin-panel")) return <Navigate to={legacyTarget("SUPERADMIN", location.pathname) || "/superadmin"} replace />;
  return roleAllowed && hasPermission(permission) ? children : <Forbidden />;
}

function RequireGastronomyShift({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const requiresShift = ["RESTAURANTE", "BARTENDER"].includes(user?.role);
  const { data: attendance, loading } = useFetch("/attendance/current", {
    initialData: { active: false },
    enabled: requiresShift,
    realtime: requiresShift,
    pollInterval: 5000
  });
  if (!requiresShift) return children;
  if (loading) return <LoadingSpinner label="Validando turno personal..." />;
  const home = user.role === "BARTENDER" ? "/bartender" : "/restaurante";
  const homePaths = [home, `${home}/dashboard`];
  if (!attendance?.active && !homePaths.includes(location.pathname)) return <Navigate to={home} replace />;
  return children;
}

