import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function BarLegacyFallback() {
  const { logout } = useAuth(); const navigate = useNavigate();
  useEffect(() => { const receive = (event) => { if (event.origin === window.location.origin && event.data?.source === "park-plaza-superadmin-v6" && event.data?.type === "LOGOUT") { logout(); navigate("/login", { replace: true }); } }; window.addEventListener("message", receive); return () => window.removeEventListener("message", receive); }, [logout, navigate]);
  return <iframe className="block h-screen w-full border-0 bg-white" src="/superadmin-v6/index.html?mode=bar" title="Bar Park Plaza · fallback técnico" />;
}
