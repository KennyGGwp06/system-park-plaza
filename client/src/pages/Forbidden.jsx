import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { HOME_BY_ROLE as defaultRouteByRole } from "../constants/roles";

// Acceso denegado: dentro de una estación se muestra en su contenido; en /403 ocupa la pantalla.
export function Forbidden() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const home = defaultRouteByRole[user?.role] || "/login";
  return (
    <div className={`ax ${pathname === "/403" ? "ax-screen" : "ax-inline"}`}>
      <section className="ax-box" role="alert">
        <span className="is-crit"><ShieldAlert /></span>
        <small>Acceso restringido</small>
        <h1>Esta sección no corresponde a tu cuenta</h1>
        <p>Si necesitas entrar, pide al administrador que revise los permisos de tu rol.</p>
        <footer><Link className="ax-btn" to={home}>Volver a mi estación</Link></footer>
      </section>
    </div>
  );
}
