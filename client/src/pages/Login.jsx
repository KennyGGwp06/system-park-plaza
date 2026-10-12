// Ingreso general del sistema interno (dueño, Recepción, Cocina, Bar, Limpieza y Mantenimiento) con la identidad de
// las estaciones. Cada cuenta abre directamente su estación (HOME_BY_ROLE); la asistencia se marca en /reloj.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, BellRing, ChefHat, Clock3, Eye, EyeOff, LayoutDashboard, LockKeyhole, UserRound, Wrench } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { HOME_BY_ROLE as defaultRouteByRole } from "../constants/roles";
import { LimaClock } from "../components/LimaClock";

const STATIONS = [
  { icon: LayoutDashboard, name: "Dirección", detail: "Centro de control del dueño" },
  { icon: BellRing, name: "Recepción", detail: "Reservas, llegadas, caja y clientes" },
  { icon: ChefHat, name: "Restaurante y Bar", detail: "Pedidos, recetas, insumos y cierres" },
  { icon: Wrench, name: "Limpieza y Mantenimiento", detail: "Tareas, reparaciones y evidencias" }
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [visiblePassword, setVisiblePassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await login(form.email.trim(), form.password);
      navigate(defaultRouteByRole[user.role] || "/403", { replace: true });
    } catch (err) {
      setError(err.message || "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ax ax-login">
      <aside className="ax-login-side">
        <div className="ax-brand"><img src="/brand/park-plaza-mark.svg" alt="" /><span><b>PARK PLAZA</b><small>Sistema interno</small></span></div>
        <h1>Ingreso del personal</h1>
        <p>Tu cuenta abre la estación de tu área.</p>
        <ul className="ax-stations">
          {STATIONS.map(({ icon: Icon, name, detail }) => <li key={name}><span><Icon /></span><div><b>{name}</b><small>{detail}</small></div></li>)}
        </ul>
        <div className="ax-login-foot">
          <LimaClock />
          <a href="/reloj"><Clock3 /> Marcar asistencia</a>
        </div>
      </aside>

      <div className="ax-login-main">
        <form className="ax-form" onSubmit={submit}>
          <header>
            <small>Acceso seguro</small>
            <h2>Iniciar sesión</h2>
            <p>Usa el usuario y la contraseña que te entregó la administración.</p>
          </header>
          <div className="ax-form-card">
            <label className="ax-label" htmlFor="erp-email">Usuario
              <span className="ax-input"><UserRound aria-hidden="true" />
                <input id="erp-email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value.toLowerCase() })} type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="Ej.: recepcion" />
              </span>
            </label>
            <label className="ax-label" htmlFor="erp-password">Contraseña
              <span className="ax-input"><LockKeyhole aria-hidden="true" />
                <input id="erp-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type={visiblePassword ? "text" : "password"} autoComplete="current-password" required placeholder="Tu contraseña" />
                <button type="button" onClick={() => setVisiblePassword((value) => !value)} aria-label={visiblePassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{visiblePassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
            {error ? <p className="ax-alert" role="alert"><AlertCircle aria-hidden="true" />{error}</p> : null}
            <button className="ax-btn ax-btn--block" disabled={loading} type="submit">{loading ? "Ingresando…" : "Ingresar"}<ArrowRight aria-hidden="true" /></button>
          </div>
          <p className="ax-form-note">¿Olvidaste tu contraseña? Pídela al administrador del sistema.</p>
        </form>
      </div>
    </div>
  );
}
