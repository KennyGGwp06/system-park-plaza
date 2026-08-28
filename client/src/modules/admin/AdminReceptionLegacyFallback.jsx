import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function AdminReceptionLegacyFallback() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const receiveMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "park-plaza-superadmin-v6") return;
      if (event.data?.type === "LOGOUT") {
        logout();
        navigate("/login", { replace: true });
      }
    };
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [logout, navigate]);

  return (
    <iframe
      className="block h-screen w-full border-0 bg-white"
      src="/superadmin-v6/index.html?mode=reception#/recepcion-dashboard"
      title="Centro Admin de recepción Park Plaza (Legacy)"
    />
  );
}
