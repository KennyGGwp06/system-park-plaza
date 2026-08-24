import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { defaultRouteByRole } from "../constants/menu";
import logoParkPlaza from "../assets/park-plaza-mark.svg";

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
      navigate(defaultRouteByRole[user.role] || "/dashboard");
    } catch (err) {
      setError(err.message || "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#0B1020] px-4 py-6 sm:p-8 lg:place-items-center">
      <div className="pointer-events-none absolute -left-32 top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-white/5 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-white/5 blur-[120px]" />
      <section className="relative grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_32px_100px_rgba(0,0,0,.38)] lg:grid-cols-[1.05fr_.95fr]">
        <aside className="relative overflow-hidden bg-gradient-to-br from-[#0B1020] via-[#112244] to-[#0B1020] p-7 text-white sm:p-10 lg:p-14">
          <div className="absolute right-[-3rem] top-[-3rem] h-64 w-64 rounded-full border-[28px] border-white/10" />
          <div className="absolute bottom-[-5rem] left-[-3rem] h-52 w-52 rounded-full border-[22px] border-white/10" />
          <div className="relative flex h-full flex-col">
            <img className="h-20 w-20 rounded-full border border-white/55 bg-[#0B1020] p-1 shadow-[0_0_30px_rgba(255,255,255,.16)] sm:h-24 sm:w-24" src={logoParkPlaza} alt="Hotel Park Plaza" />
            <p className="mt-8 text-xs font-black uppercase tracking-[.24em] text-white/65">Sistema operativo hotelero</p>
            <h1 className="mt-3 font-display text-4xl font-semibold uppercase leading-none tracking-tight text-white sm:text-5xl">Park Plaza</h1>
            <p className="mt-3 text-xs font-black uppercase tracking-[.26em] text-white/70">La magia de Pucallpa</p>
            <p className="mt-8 max-w-md text-sm leading-7 text-white/80 sm:text-base">Una operación conectada para atender huéspedes, gestionar pedidos, controlar inventario y tomar decisiones con claridad.</p>
            <div className="mt-auto hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:flex sm:items-center sm:gap-3 lg:mt-16"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#111111]"><ShieldCheck size={20} /></span><p className="text-sm text-white/80"><strong className="block text-white">Acceso por rol</strong> Cada persona ve solo las herramientas de su operación.</p></div>
          </div>
        </aside>

        <form className="flex flex-col justify-center p-7 sm:p-10 lg:p-14" onSubmit={submit}>
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#F0F0F0] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#111111]"><LockKeyhole size={14} /> Acceso seguro</div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-[#0B1020] sm:text-4xl">Ingresa al ERP</h2>
            <p className="mt-3 text-sm leading-6 text-[#50617A]">Usa tu correo institucional y contraseña. Tu sesión se mantiene segura en este dispositivo.</p>

            <label className="mt-8 block text-sm font-black text-[#0B1020]" htmlFor="erp-email">Correo institucional
              <span className="relative mt-2 block"><Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5E5E5E]" size={18} /><input id="erp-email" className="h-12 w-full rounded-xl border border-[#C9C9C9] bg-white pl-10 pr-3 text-base font-semibold text-[#101010] outline-none transition focus:border-[#111111] focus:ring-4 focus:ring-black/10" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" autoComplete="email" required placeholder="nombre@parkplaza.com" /></span>
            </label>
            <label className="mt-5 block text-sm font-black text-[#0B1020]" htmlFor="erp-password">Contraseña
              <span className="relative mt-2 block"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5E5E5E]" size={18} /><input id="erp-password" className="h-12 w-full rounded-xl border border-[#C9C9C9] bg-white pl-10 pr-12 text-base font-semibold text-[#101010] outline-none transition focus:border-[#111111] focus:ring-4 focus:ring-black/10" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type={visiblePassword ? "text" : "password"} autoComplete="current-password" required placeholder="Tu contraseña" /><button className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#5E5E5E] hover:bg-[#F0F0F0] hover:text-[#111111]" type="button" onClick={() => setVisiblePassword((value) => !value)} aria-label={visiblePassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{visiblePassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
            </label>

            {error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
            <button className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#111111] px-4 text-base font-black text-white shadow-[0_10px_24px_rgba(0,0,0,.24)] transition hover:bg-[#292929] focus:outline-none focus:ring-4 focus:ring-black/20 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit"><span>{loading ? "Ingresando..." : "Ingresar al sistema"}</span><ArrowRight size={19} /></button>
            <p className="mt-5 text-center text-xs leading-5 text-[#50617A]">Si olvidaste tus credenciales, solicita apoyo al Administrador del sistema.</p>
          </div>
        </form>
      </section>
    </main>
  );
}
