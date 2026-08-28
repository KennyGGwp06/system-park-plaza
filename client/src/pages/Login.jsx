import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, ChefHat, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Wine } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { defaultRouteByRole } from "../constants/menu";

const accessProfiles = [
  { label: "Superadmin", icon: ShieldCheck },
  { label: "Admin de recepción", icon: Building2 },
  { label: "Restaurante", icon: ChefHat },
  { label: "Bar", icon: Wine }
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
    <main className="relative min-h-dvh overflow-hidden bg-[#071912] px-4 py-5 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#D0AA4D]" />
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full border border-[#D0AA4D]/20" />
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full border border-[#D0AA4D]/10" />
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[1180px] items-center justify-center sm:min-h-[calc(100dvh-4rem)]">
        <section className="grid w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#F5F7F4] shadow-[0_28px_80px_rgba(0,0,0,.28)] lg:grid-cols-[1.08fr_.92fr]">
          <aside className="relative flex min-h-[300px] flex-col justify-between overflow-hidden bg-[#0B261C] p-7 text-white sm:p-10 lg:min-h-[650px] lg:p-14">
            <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full border-[42px] border-[#D0AA4D]/10" />
            <div className="pointer-events-none absolute -bottom-36 -left-28 h-80 w-80 rounded-full border-[42px] border-white/5" />

            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-[#D0AA4D]/70 bg-[#132F24] text-[#E7C976] shadow-[inset_0_0_0_5px_rgba(208,170,77,.08)]">
                  <span className="font-serif text-4xl font-semibold">P</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.3em] text-[#DCC27B]">Hotel</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[.04em] text-white">PARK PLAZA</p>
                  <div className="mt-1 text-[10px] tracking-[.34em] text-[#E1C36D]" aria-label="Hotel cinco estrellas">★★★★★</div>
                </div>
              </div>

              <p className="mt-12 text-xs font-extrabold uppercase tracking-[.22em] text-[#DCC27B]">Sistema interno remasterizado</p>
              <h1 className="mt-4 max-w-xl text-balance font-serif text-4xl font-semibold leading-[1.03] text-white sm:text-5xl lg:text-[3.6rem]">Una operación conectada, clara y elegante.</h1>
              <p className="mt-6 max-w-lg text-pretty text-sm leading-7 text-white/70 sm:text-base">Supervisa el hotel, atiende a los huéspedes y coordina restaurante, bar e inventario desde una sola plataforma.</p>
            </div>

            <div className="relative mt-10">
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.2em] text-white/45">Accesos por responsabilidad</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {accessProfiles.map(({ label, icon: Icon }) => (
                  <div key={label} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2.5 text-sm font-semibold text-white/80">
                    <Icon size={17} className="text-[#DCC27B]" aria-hidden="true" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <form className="flex items-center justify-center bg-[#F5F7F4] p-7 sm:p-10 lg:p-14" onSubmit={submit}>
            <div className="w-full max-w-md">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE5DF] bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#174D38]"><LockKeyhole size={14} aria-hidden="true" /> Acceso seguro</div>
              <p className="mt-7 text-xs font-extrabold uppercase tracking-[.2em] text-[#A47C20]">Gestión integral Park Plaza</p>
              <h2 className="mt-3 text-balance font-serif text-4xl font-semibold leading-tight text-[#0A241A] sm:text-5xl">Bienvenido al ERP</h2>
              <p className="mt-4 text-pretty text-sm leading-6 text-[#60736B]">Ingresa con tus credenciales. El sistema abrirá automáticamente la estación moderna correspondiente a tu rol.</p>

              <label className="mt-8 block text-sm font-bold text-[#163A2D]" htmlFor="erp-email">Correo institucional
                <span className="relative mt-2 block">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#73867E]" size={18} aria-hidden="true" />
                  <input id="erp-email" className="w-full rounded-xl border border-[#CFDAD4] bg-white py-3.5 pl-11 pr-4 text-base font-semibold text-[#102A20] outline-none transition focus:border-[#B68B2E] focus:ring-4 focus:ring-[#D0AA4D]/15" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" autoComplete="email" required placeholder="nombre@parkplaza.com" />
                </span>
              </label>

              <label className="mt-5 block text-sm font-bold text-[#163A2D]" htmlFor="erp-password">Contraseña
                <span className="relative mt-2 block">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#73867E]" size={18} aria-hidden="true" />
                  <input id="erp-password" className="w-full rounded-xl border border-[#CFDAD4] bg-white py-3.5 pl-11 pr-12 text-base font-semibold text-[#102A20] outline-none transition focus:border-[#B68B2E] focus:ring-4 focus:ring-[#D0AA4D]/15" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type={visiblePassword ? "text" : "password"} autoComplete="current-password" required placeholder="Tu contraseña" />
                  <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[#60736B] transition hover:bg-[#EDF2EF] hover:text-[#0A241A] focus:outline-none focus:ring-2 focus:ring-[#B68B2E]" type="button" onClick={() => setVisiblePassword((value) => !value)} aria-label={visiblePassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{visiblePassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </span>
              </label>

              {error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}

              <button className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#B88A2C] px-5 py-3.5 text-base font-extrabold text-white shadow-[0_10px_24px_rgba(125,88,20,.22)] transition hover:bg-[#9E7420] focus:outline-none focus:ring-4 focus:ring-[#D0AA4D]/25 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">
                <span>{loading ? "Ingresando..." : "Ingresar al sistema"}</span><ArrowRight size={19} aria-hidden="true" />
              </button>

              <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#DCE5DF] bg-white px-4 py-3.5">
                <ShieldCheck className="mt-0.5 shrink-0 text-[#1C6B4D]" size={18} aria-hidden="true" />
                <p className="text-xs leading-5 text-[#60736B]">Cada usuario accede únicamente a las funciones autorizadas. Si olvidaste tus credenciales, solicita apoyo al <strong className="text-[#173E30]">Superadmin</strong>.</p>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
