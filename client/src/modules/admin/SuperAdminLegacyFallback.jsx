import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function SuperAdminLegacyFallback() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const receiveMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "park-plaza-superadmin-v6") return;
      if (event.data?.type === "LOGOUT") {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      const safeRoutes = new Set(["/admin/comercial", "/admin/alimentos-bebidas", "/empleados", "/turnos", "/admin/limpieza/resumen", "/incidencias"]);
      if (event.data?.type === "OPEN_ERP_ROUTE" && safeRoutes.has(event.data.route)) navigate(event.data.route);
    };
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [logout, navigate]);

  return (
    <iframe
      className="block h-screen w-full border-0 bg-white"
      src="/superadmin-v6/index.html"
      title="Centro Superadmin Park Plaza (Fallback)"
    />
  );
}
