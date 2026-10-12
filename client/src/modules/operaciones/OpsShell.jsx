// Estación de Limpieza o de Mantenimiento: menú, cabecera (turno DNI + PIN, avisos) y el contenido de cada vista.
// Misma identidad que Recepción, Cocina y Bar (recepcion.css + rxkit). Datos compartidos por las pantallas (OpsContext):
// las tareas de limpieza (GET /api/cleaning/tasks) o los trabajos de mantenimiento (GET /api/maintenance/reports).
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Bell, ChevronRight, LogOut, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { apiBaseUrl, apiOrigin } from "../../config/api";
import { getToken } from "../../services/api";
import { ModuleErrorBoundary } from "../../components/ModuleErrorBoundary";
import { ShiftContext, ToastProvider, timeOf } from "../recepcion/rxkit";
import { ShiftClockModal } from "../recepcion/ReceptionShell";
import { OPS_STATIONS, isDone, isRunning, isUrgent, isWaiting } from "./opsNavigation";
import "../recepcion/recepcion.css";
import "../cocina/cocina.css";
import "./ops.css";

const OpsContext = createContext(null);
export const useOps = () => useContext(OpsContext);

// Fotos de evidencia: se suben tal cual (JPG, PNG o WEBP, 10 MB) y el servidor devuelve la ruta guardada.
export async function uploadPhotos(fileList) {
  const uploaded = [];
  for (const file of Array.from(fileList || [])) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Usa fotos JPG, PNG o WEBP.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Cada foto debe pesar como máximo 10 MB.");
    const response = await fetch(`${apiBaseUrl}/cleaning/evidence/upload`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo subir la foto.");
    uploaded.push(...(data.files || []));
  }
  return uploaded;
}
export const photoSrc = (item) => { const url = item?.imageUrl || item?.fileUrl || ""; return /^https?:/.test(url) ? url : `${apiOrigin}${url}`; };

// Tipo de tarea de limpieza según cómo nació (revisión de salida, pedido del huésped o limpieza de rutina).
export function cleaningKind(task) {
  if (task.workflowType === "CHECKOUT_INSPECTION") return { key: "revision", label: "Revisión antes de la salida", short: "Revisión" };
  if (task.requestId && task.workflowType !== "POST_CHECKOUT") return { key: "solicitud", label: task.serviceType === "TOALLAS" ? "Pedido del huésped: toallas" : "Pedido del huésped: limpieza", short: "Pedido del huésped" };
  return { key: "rutina", label: "Limpieza de habitación", short: "Limpieza" };
}
export const placeOf = (area, row) => (area === "LIMPIEZA" ? `Habitación ${row.room?.number || row.roomId || "—"}` : row.location || row.area || "Área reportada");
export const PRIORITY = { CRITICA: ["Crítica", "crit"], ALTA: ["Alta", "warn"], MEDIA: ["Media", "info"], BAJA: ["Baja", "off"] };

export function OpsShell({ area = "LIMPIEZA" }) {
  return <ToastProvider><OpsInner station={OPS_STATIONS[area] || OPS_STATIONS.LIMPIEZA} /></ToastProvider>;
}

function OpsInner({ station }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const attendance = useFetch("/attendance/current", { initialData: { active: false }, realtime: true, pollInterval: 30000 });
  const work = useFetch(station.api, { initialData: [], realtime: true, pollInterval: 15000 });
  const shiftActive = Boolean(attendance.data?.active);
  const base = station.base;
  useEffect(() => { setNavOpen(false); setBellOpen(false); }, [location.pathname, location.search]);

  const rows = Array.isArray(work.data) ? work.data : [];
  const open = rows.filter((row) => !isDone(station.area, row));
  const running = open.filter((row) => isRunning(station.area, row));
  const waiting = open.filter(isWaiting);
  const urgent = open.filter((row) => isUrgent(row) && !isWaiting(row));
  const ready = open.filter((row) => !isWaiting(row) && !isRunning(station.area, row));
  const attention = [
    !shiftActive ? { key: "shift", tone: "warn", count: null, label: "Marca tu entrada con DNI y PIN para empezar", href: base } : null,
    urgent.length ? { key: "urgent", tone: "crit", count: urgent.length, label: `${station.nouns} urgentes`, href: `${base}/${station.area === "LIMPIEZA" ? "tareas" : "trabajos"}` } : null,
    ready.length ? { key: "ready", tone: "info", count: ready.length, label: `${station.nouns} por empezar`, href: `${base}/${station.area === "LIMPIEZA" ? "tareas" : "trabajos"}` } : null,
    waiting.length ? { key: "waiting", tone: "off", count: waiting.length, label: "esperan que Recepción las acepte", href: `${base}/${station.area === "LIMPIEZA" ? "tareas" : "trabajos"}` } : null
  ].filter(Boolean);

  const current = useMemo(() => {
    for (const group of station.modules) { const item = group.items.find(([, href]) => location.pathname === href); if (item) return { group: group.label, label: item[0] }; }
    return { group: station.name, label: "Park Plaza" };
  }, [location.pathname, station]);
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || station.name;
  const badges = { open: open.length };

  const ops = { station, rows, open, running, waiting, loading: work.loading && !rows.length, reload: work.reload };
  const shift = { active: shiftActive, ownerPreview: false, record: attendance.data?.record || null, today: attendance.data?.todayRecord || attendance.data?.record || null, schedule: attendance.data?.shift || null, openClock: () => setClockOpen(true), reload: attendance.reload, desk: null, reloadDesk: () => {}, cashSession: null };

  return <ShiftContext.Provider value={shift}><OpsContext.Provider value={ops}>
    <div className="rx">
      <aside className={`rx-side ${navOpen ? "is-open" : ""}`} aria-label={`Menú de ${station.name}`}>
        <Link className="rx-brand" to={base}><img src="/brand/park-plaza-mark.svg" alt="" /><span><b>PARK PLAZA</b><small>{station.brand}</small></span></Link>
        <nav className="rx-nav">
          {station.modules.map((group) => <div key={group.label}>
            <div className="rx-nav-group">{group.label}</div>
            {group.items.map(([label, href, Icon, badgeKey]) => { const on = location.pathname === href; const count = badgeKey ? badges[badgeKey] : 0; return <Link key={href} to={href} className={on ? "is-active" : ""} aria-current={on ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span>{count ? <i className={urgent.length ? "is-hot" : ""}>{count}</i> : null}</Link>; })}
          </div>)}
        </nav>
        <div className="rx-side-foot">
          <span>{userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div><strong>{userName}</strong><small>{station.name}</small></div>
          <button type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button>
        </div>
      </aside>
      <button type="button" className={`rx-scrim ${navOpen ? "is-open" : ""}`} onClick={() => setNavOpen(false)} aria-label="Cerrar menú" tabIndex={navOpen ? 0 : -1} />

      <div className="rx-main">
        <header className="rx-top">
          <button className="rx-burger" type="button" onClick={() => setNavOpen(true)} aria-label="Abrir menú"><Menu size={18} /></button>
          <div className="rx-crumb"><small>{current.group}</small><strong>{current.label}</strong></div>
          <div className="rx-top-tools" style={{ marginLeft: "auto" }}>
            <button className="rx-chip" type="button" onClick={() => setClockOpen(true)} title={shiftActive ? "Marcar salida del turno" : "Iniciar turno con DNI y PIN"}>
              <span className={`rx-dot ${shiftActive ? "ok" : "warn"}`} />{shiftActive ? <>En turno<span className="hide-md">&nbsp;desde {timeOf(attendance.data?.record?.checkIn || attendance.data?.record?.clockIn)}</span></> : "Iniciar turno"}
            </button>
            <div style={{ position: "relative" }}>
              <button className="rx-icon-btn" type="button" onClick={() => setBellOpen((value) => !value)} aria-label={`Avisos de ${station.name}`} aria-expanded={bellOpen}><Bell size={17} />{attention.length ? <i>{attention.length}</i> : null}</button>
              {bellOpen ? <div className="rx-bell-pop"><header><strong>Avisos de {station.name}</strong><small>Lo que necesita tu atención ahora</small></header>
                {attention.length ? <div className="rx-attn">{attention.map((item) => <Link key={item.key} className={item.tone} to={item.href}>{item.count != null ? <b>{item.count}</b> : null}<span>{item.label}</span><ChevronRight /></Link>)}</div> : <p className="rx-empty">Sin avisos.</p>}
              </div> : null}
            </div>
          </div>
        </header>
        <main className="rx-page">
          <ModuleErrorBoundary resetKey={location.pathname}><Outlet /></ModuleErrorBoundary>
        </main>
      </div>
      {clockOpen ? <ShiftClockModal active={shiftActive} user={user} areaLabel={station.name} closeHint={`Al marcar tu salida ya no podrás iniciar, fotografiar ni finalizar ${station.nouns}. Tu día se valida con la entrada, la salida y la evidencia de tu trabajo.`} onClose={() => setClockOpen(false)} onDone={() => { attendance.reload(); work.reload(); }} /> : null}
    </div>
  </OpsContext.Provider></ShiftContext.Provider>;
}
