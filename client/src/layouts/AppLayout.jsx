// Cada rol trabaja en su estación, todas con la misma identidad (recepcion.css): el dueño en su centro de dirección
// (lo monta la ruta /superadmin), Recepción, Cocina y Bar, Limpieza y Mantenimiento. El dueño puede abrir la estación de
// Recepción en /admin-panel para verla como la ve el personal. El diseño antiguo (Sidebar/Navbar) se retiró el 2026-09-27.
import { lazy } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ModuleErrorBoundary } from "../components/ModuleErrorBoundary";
import { useAuth } from "../context/AuthContext";

const KitchenShell = lazy(() => import("../modules/cocina/KitchenShell").then((module) => ({ default: module.KitchenShell })));
const OpsShell = lazy(() => import("../modules/operaciones/OpsShell").then((module) => ({ default: module.OpsShell })));
const ReceptionShell = lazy(() => import("../modules/recepcion/ReceptionShell").then((module) => ({ default: module.ReceptionShell })));

export function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role;
  if (role === "SUPERADMIN" && location.pathname.startsWith("/superadmin")) return <ModuleErrorBoundary resetKey={location.pathname}><Outlet /></ModuleErrorBoundary>;
  if (role === "ADMINISTRADOR" || (role === "SUPERADMIN" && location.pathname.startsWith("/admin-panel"))) return <ReceptionShell />;
  if (role === "RESTAURANTE") return <KitchenShell />;
  if (role === "BARTENDER") return <KitchenShell area="BARTENDER" />;
  if (role === "LIMPIEZA" || role === "MANTENIMIENTO") return <OpsShell area={role} />;
  if (role === "SUPERADMIN") return <Navigate to="/superadmin" replace />;
  return <Navigate to="/403" replace />;
}
