// Piezas compartidas del espacio de Recepción: formatos, etiquetas de estado, hoja lateral, avisos y el
// contexto del turno (asistencia con DNI + PIN y caja), que el servidor exige para cobrar, validar y registrar.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BedDouble, CheckCircle2, CircleAlert, Mountain, PartyPopper, Sunset, Waves, X } from "lucide-react";

export const SERVICES = {
  HOSPEDAJE: { name: "Hospedaje", icon: BedDouble },
  PISCINA: { name: "Piscina", icon: Waves },
  MIRADOR: { name: "Mirador", icon: Mountain },
  TERRAZA: { name: "Terraza", icon: Sunset },
  EVENTOS: { name: "Eventos", icon: PartyPopper }
};
export const serviceOf = (code) => SERVICES[String(code || "").toUpperCase()] || { name: code || "Servicio", icon: BedDouble };

const TZ = "America/Lima";
export const money = (value) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const money0 = (value) => `S/ ${Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
const asDate = (key) => new Date(`${String(key).slice(0, 10)}T12:00:00Z`);
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export function dateShort(key) {
  if (!key) return "—";
  const [year, month, day] = String(key).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "—";
  return `${day} ${MONTHS[month - 1]}${String(year) !== todayKey().slice(0, 4) ? ` ${year}` : ""}`;
}
export function dateLong(key) {
  if (!key) return "—";
  const text = asDate(key).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function weekday(key) {
  return asDate(key).toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}
export function timeOf(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}
export function todayKey() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function addDays(key, amount) {
  const date = asDate(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export const nightsBetween = (from, to) => Math.max(1, Math.round((asDate(to) - asDate(from)) / 86400000));
export const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function Tag({ tone = "off", icon: Icon, children }) {
  return <span className={`rx-tag ${tone}`}>{Icon ? <Icon aria-hidden="true" /> : null}{children}</span>;
}

const PAYMENT = {
  PAGADO: ["Pagado", "ok"], PARCIAL: ["Pago parcial", "warn"], PENDIENTE: ["Por cobrar", "warn"], PENDIENTE_CAJA: ["Paga en caja", "warn"],
  PENDIENTE_VERIFICACION: ["Verificar pago", "warn"]
};
export function PaymentTag({ status, balance }) {
  const key = String(status || "").toUpperCase();
  const [label, tone] = PAYMENT[key] || (Number(balance) > 0 ? ["Por cobrar", "warn"] : ["Pagado", "ok"]);
  return <Tag tone={tone}>{label}</Tag>;
}

const RESERVATION = { POR_CONFIRMAR: ["Por confirmar", "warn"], CONFIRMADA: ["Confirmada", "info"], EN_CURSO: ["En curso", "ink"], COMPLETADA: ["Completada", "ok"], CANCELADA: ["Cancelada", "crit"] };
export function ReservationTag({ status }) {
  const [label, tone] = RESERVATION[status] || [status || "—", "off"];
  return <Tag tone={tone}>{label}</Tag>;
}

export function PageHead({ eyebrow, title, children, tools }) {
  return <div className="rx-ph">
    <div>{eyebrow ? <span className="rx-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1>{children ? <p>{children}</p> : null}</div>
    {tools ? <div className="rx-ph-tools">{tools}</div> : null}
  </div>;
}

export function Kpi({ icon: Icon, label, value, unit, detail, bar, href, as: As = href ? "a" : "div", ...rest }) {
  return <As className="rx-kpi" href={href} {...rest}>
    <div className="rx-kpi-l">{Icon ? <Icon aria-hidden="true" /> : null}{label}</div>
    <div className="rx-kpi-v">{value}{unit ? <small>{unit}</small> : null}</div>
    {detail ? <div className="rx-kpi-d">{detail}</div> : null}
    {bar ? <div className="rx-bar" aria-hidden="true">{bar.map((part, index) => <span key={index} style={{ width: `${Math.max(0, Math.min(100, part))}%` }} />)}</div> : null}
  </As>;
}

export function Empty({ icon: Icon = CheckCircle2, title, children }) {
  return <div className="rx-empty"><Icon aria-hidden="true" />{title ? <strong>{title}</strong> : null}{children}</div>;
}

export function Drawer({ open, onClose, eyebrow, title, subtitle, children, footer, busy = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return <>
    <div className="rx-drawer-scrim" onClick={() => !busy && onClose()} aria-hidden="true" />
    <aside className="rx-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="rx-drawer-h">
        <div>{eyebrow ? <span className="rx-eyebrow">{eyebrow}</span> : null}<h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        <button className="rx-close" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={16} /></button>
      </header>
      <div className="rx-drawer-b">{children}</div>
      {footer ? <footer className="rx-drawer-f">{footer}</footer> : null}
    </aside>
  </>;
}

export function Alert({ tone = "info", children }) {
  const Icon = tone === "ok" ? CheckCircle2 : CircleAlert;
  return <div className={`rx-alert ${tone}`} role={tone === "crit" ? "alert" : "status"}><Icon aria-hidden="true" /><div>{children}</div></div>;
}

/* ---------- avisos breves ---------- */
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((message, tone = "ok") => {
    window.clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = window.setTimeout(() => setToast(null), tone === "crit" ? 5200 : 3200);
  }, []);
  return <ToastContext.Provider value={show}>
    {children}
    {toast ? <div className={`rx-toast ${toast.tone === "crit" ? "crit" : ""}`} role="status">{toast.tone === "crit" ? <CircleAlert /> : <CheckCircle2 />}{toast.message}</div> : null}
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

/* ---------- turno y caja ---------- */
export const ShiftContext = createContext({ active: true, cash: null, openClock: () => {}, reload: () => {}, desk: null, reloadDesk: () => {} });
export const useShift = () => useContext(ShiftContext);
