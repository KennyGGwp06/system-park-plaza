// Espacio de trabajo del Admin de recepción: menú, cabecera (turno, caja, buscador global, avisos) y el
// contenido de cada módulo. Reemplaza al Sidebar/Navbar genéricos solo para este rol (y para la vista
// previa del dueño en /admin-panel). Las pantallas anteriores se muestran dentro con la misma identidad.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, BedDouble, ChevronDown, ContactRound, LogOut, Menu, Plus, Search, PartyPopper, Waves, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { ModuleErrorBoundary } from "../../components/ModuleErrorBoundary";
import { ADMIN_RECEPTION_MODULES } from "../admin/adminReceptionNavigation";
import { ShiftContext, ToastProvider, timeOf, useToast, serviceOf, dateShort } from "./rxkit";
import "../admin/ClientAccessExperience.css";
import "./recepcion.css";


function isActive(pathname, search, href) {
  const [path, query] = href.split("?");
  if (query) return pathname === path && search === `?${query}`;
  return pathname === path;
}

export function ReceptionShell() {
  return <ToastProvider><ShellInner /></ToastProvider>;
}

function ShellInner() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const isOwnerPreview = user?.role === "SUPERADMIN";

  const desk = useFetch("/reception/desk", { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 30000 });
  const attendance = useFetch("/attendance/current", { initialData: { active: isOwnerPreview }, realtime: true, pollInterval: 60000, enabled: !isOwnerPreview });
  const shiftActive = isOwnerPreview || Boolean(attendance.data?.active);
  const cashSession = desk.data?.cash?.session || null;

  const current = useMemo(() => {
    for (const group of ADMIN_RECEPTION_MODULES) {
      const item = group.items.find(([, href]) => isActive(location.pathname, location.search, href)) || group.items.find(([, href]) => location.pathname === href.split("?")[0]);
      if (item) return { group: group.label, label: item[0] };
    }
    return { group: "Recepción", label: "Park Plaza" };
  }, [location.pathname, location.search]);

  useEffect(() => { setNavOpen(false); setBellOpen(false); setNewOpen(false); }, [location.pathname, location.search]);

  const badges = {
    movements: (desk.data?.kpis?.arrivalsPending || 0) + (desk.data?.kpis?.departuresPending || 0),
    verifications: desk.data?.kpis?.verifications || 0
  };
  const attention = desk.data?.attention || [];
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Recepción";
  const shiftContext = {
    active: shiftActive, ownerPreview: isOwnerPreview, record: attendance.data?.record || null,
    openClock: () => setClockOpen(true), reload: attendance.reload,
    desk: desk.data, deskLoading: desk.loading && !desk.data, deskError: desk.error, reloadDesk: desk.reload,
    cashSession
  };

  return <ShiftContext.Provider value={shiftContext}>
    <div className="rx">
      <aside className={`rx-side ${navOpen ? "is-open" : ""}`} aria-label="Menú de Recepción">
        <Link className="rx-brand" to="/admin-panel">
          <img src="/brand/park-plaza-mark.svg" alt="" />
          <span><b>PARK PLAZA</b><small>Recepción · Pucallpa</small></span>
        </Link>
        <nav className="rx-nav">
          {ADMIN_RECEPTION_MODULES.map((group) => <div key={group.label}>
            <div className="rx-nav-group">{group.label}</div>
            {group.items.map(([label, href, Icon, badgeKey]) => {
              const count = badgeKey ? badges[badgeKey] : 0;
              return <Link key={href} to={href} className={isActive(location.pathname, location.search, href) ? "is-active" : ""} aria-current={isActive(location.pathname, location.search, href) ? "page" : undefined}>
                <Icon aria-hidden="true" /><span>{label}</span>{count ? <i className={badgeKey === "verifications" ? "is-hot" : ""}>{count}</i> : null}
              </Link>;
            })}
          </div>)}
        </nav>
        <div className="rx-side-foot">
          <span>{userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div><strong>{userName}</strong><small>{isOwnerPreview ? "Dueño · vista de Recepción" : "Admin de recepción"}</small></div>
          <button type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button>
        </div>
      </aside>
      <button type="button" className={`rx-scrim ${navOpen ? "is-open" : ""}`} onClick={() => setNavOpen(false)} aria-label="Cerrar menú" tabIndex={navOpen ? 0 : -1} />

      <div className="rx-main">
        <header className="rx-top">
          <button className="rx-burger" type="button" onClick={() => setNavOpen(true)} aria-label="Abrir menú"><Menu size={18} /></button>
          <div className="rx-crumb"><small>{current.group}</small><strong>{current.label}</strong></div>
          <GlobalSearch onPick={(target) => navigate(target)} />
          <div className="rx-top-tools">
            {isOwnerPreview ? <span className="rx-chip" title="El dueño no necesita abrir turno"><span className="rx-dot ok" />Vista del dueño</span> : <button className="rx-chip" type="button" onClick={() => setClockOpen(true)} title={shiftActive ? "Marcar salida del turno" : "Iniciar turno con DNI y PIN"}>
              <span className={`rx-dot ${shiftActive ? "ok" : "warn"}`} />{shiftActive ? <>En turno<span className="hide-md">&nbsp;desde {timeOf(attendance.data?.record?.checkIn || attendance.data?.record?.clockIn)}</span></> : "Iniciar turno"}
            </button>}
            <Link className="rx-chip" to="/admin-panel/mi-caja" title="Mi caja y cierre"><span className={`rx-dot ${cashSession?.status === "ABIERTA" ? "ok" : cashSession ? "warn" : ""}`} />{cashSession?.status === "ABIERTA" ? "Caja abierta" : cashSession ? "Caja en revisión" : "Caja cerrada"}</Link>
            <div style={{ position: "relative" }}>
              <button className="rx-btn rx-btn--primary" type="button" onClick={() => setNewOpen((value) => !value)} aria-expanded={newOpen} aria-label="Nueva"><Plus /><span className="hide-sm">Nueva</span><ChevronDown className="hide-sm" /></button>
              {newOpen ? <div className="rx-bell-pop" style={{ width: 260 }}>
                <div className="rx-search-pop" style={{ position: "static", boxShadow: "none", border: 0, padding: 0 }}>
                  <button type="button" onClick={() => navigate("/admin-panel/reservas?nueva=HOSPEDAJE")}><BedDouble /><span><b>Reserva de hospedaje</b><small>Habitación, fechas y adelanto</small></span></button>
                  <button type="button" onClick={() => navigate("/eventos/reservas")}><PartyPopper /><span><b>Evento</b><small>Espacio, invitados y anticipo</small></span></button>
                  <button type="button" onClick={() => navigate("/admin-panel/accesos?vista=piscina")}><Waves /><span><b>Ingreso a piscina</b><small>Visitante sin reserva</small></span></button>
                  <button type="button" onClick={() => navigate("/clientes")}><ContactRound /><span><b>Cliente</b><small>Registrar a una persona</small></span></button>
                </div>
              </div> : null}
            </div>
            <div style={{ position: "relative" }}>
              <button className="rx-icon-btn" type="button" onClick={() => setBellOpen((value) => !value)} aria-label="Pendientes del turno" aria-expanded={bellOpen}><Bell size={17} />{attention.length ? <i>{attention.length}</i> : null}</button>
              {bellOpen ? <div className="rx-bell-pop">
                <header><strong>Pendientes del turno</strong><small>Lo que Recepción debe resolver ahora</small></header>
                {attention.length ? <div className="rx-attn">{attention.map((item) => <Link key={item.key} className={item.tone} to={item.href}>{item.count != null ? <b>{item.count}</b> : null}<span>{item.label}</span><ChevronRight /></Link>)}</div> : <p className="rx-empty">Sin pendientes.</p>}
              </div> : null}
            </div>
          </div>
        </header>

        <main className="rx-page">

          <ModuleErrorBoundary resetKey={location.pathname}><Outlet /></ModuleErrorBoundary>
        </main>
      </div>

      {clockOpen ? <ShiftClockModal active={shiftActive} cashOpen={cashSession?.status === "ABIERTA"} user={user} onClose={() => setClockOpen(false)} onDone={() => { attendance.reload(); desk.reload(); }} /> : null}
    </div>
  </ShiftContext.Provider>;
}

export function ShiftBanner({ onOpen }) {
  return <div className="rx-alert warn" style={{ marginBottom: 14, alignItems: "center" }}>
    <span style={{ flex: 1 }}><b>Tu turno no está abierto.</b> Puedes consultar todo, pero para cobrar, validar pases o registrar llegadas y salidas debes marcar tu entrada con DNI y PIN.</span>
    <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={onOpen}>Iniciar turno</button>
  </div>;
}

export function ShiftClockModal({ active, cashOpen, user, onClose, onDone, areaLabel = "Recepción", closeHint }) {
  const show = useToast();
  const [documentNumber, setDocumentNumber] = useState(String(user?.documentNumber || "").replace(/\D/g, "").slice(0, 8));
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (!/^\d{8}$/.test(documentNumber) || !/^\d{4}$/.test(pin)) { setError("Ingresa tu DNI de 8 dígitos y tu PIN de 4 dígitos."); return; }
    setBusy(true); setError("");
    try {
      const result = await api("/attendance/self/clock", { method: "POST", body: { documentNumber, pin } });
      show(result.action === "CHECK_IN" ? `Turno iniciado. Ya puedes operar ${areaLabel}.` : areaLabel === "Recepción" ? "Salida registrada. Recuerda rendir tu caja." : "Salida registrada. Buen descanso.");
      onDone(); onClose();
    } catch (cause) { setError(cause.message || "No se pudo registrar la asistencia."); }
    finally { setBusy(false); }
  }
  return <div className="rx-modal-scrim" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="rx-modal" role="dialog" aria-modal="true" aria-label={active ? "Cerrar turno" : "Iniciar turno"}>
      <div className="rx-modal-top"><img src="/brand/park-plaza-mark.svg" alt="" /><div><small>Control de asistencia</small><h2>{active ? "Marcar salida del turno" : `Iniciar turno de ${areaLabel}`}</h2></div></div>
      <form onSubmit={submit}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{active ? (closeHint || "Al marcar tu salida ya no podrás cobrar ni registrar llegadas hasta abrir otro turno.") : "Tu marca de entrada queda registrada para la planilla. Usa tu DNI y el PIN de asistencia."}</p>
        {active && cashOpen ? <div className="rx-alert warn"><span>Tu caja sigue abierta. Antes de marcar la salida cuenta el efectivo y envíala a revisión en <Link to="/admin-panel/mi-caja" onClick={onClose} style={{ fontWeight: 600 }}>Mi caja y cierre</Link>.</span></div> : null}
        <label className="rx-field"><span>DNI</span><input className="rx-input" inputMode="numeric" maxLength={8} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.replace(/\D/g, ""))} autoFocus={!documentNumber} /></label>
        <label className="rx-field"><span>PIN de asistencia</span><input className="rx-input rx-pin" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} autoFocus={Boolean(documentNumber)} /></label>
        {error ? <div className="rx-alert crit">{error}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="rx-btn rx-btn--dark" type="submit" disabled={busy}>{busy ? "Registrando…" : active ? "Marcar salida" : "Marcar entrada"}</button>
        </div>
      </form>
    </div>
  </div>;
}

function GlobalSearch({ onPick }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState({ clients: [], reservations: [], rooms: [] });
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); inputRef.current?.focus(); setOpen(true); } };
    const onClick = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("keydown", onKey); document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) { setResult({ clients: [], reservations: [], rooms: [] }); return undefined; }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try { setResult(await api(`/reception/search?q=${encodeURIComponent(query)}`)); setFocus(0); } catch { setResult({ clients: [], reservations: [], rooms: [] }); }
      finally { setLoading(false); }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [text]);

  const options = [
    ...result.reservations.map((row) => ({ key: `r-${row.type}-${row.id}`, group: "Reservas", icon: serviceOf(row.type).icon, title: `${row.code} · ${row.clientName}`, sub: `${row.serviceName} · ${dateShort(row.date)}${row.place ? ` · ${row.place}` : ""} · ${row.statusLabel}${row.balance > 0 ? " · con saldo" : ""}`, target: `/admin-panel/reservas?ver=${row.type}-${row.id}` })),
    ...result.clients.map((row) => ({ key: `c-${row.id}`, group: "Clientes", icon: ContactRound, title: row.name, sub: `DNI ${row.document || "—"}${row.phone ? ` · ${row.phone}` : ""}`, target: `/clientes?q=${encodeURIComponent(row.document || row.name)}` })),
    ...result.rooms.map((row) => ({ key: `h-${row.id}`, group: "Habitaciones", icon: BedDouble, title: `Habitación ${row.number}`, sub: `${row.type} · ${row.status}`, target: `/admin-panel/habitaciones?hab=${row.id}` }))
  ];
  const pick = (option) => { setOpen(false); setText(""); onPick(option.target); };
  const onKeyDown = (event) => {
    if (!options.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setFocus((value) => (value + 1) % options.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setFocus((value) => (value - 1 + options.length) % options.length); }
    if (event.key === "Enter") { event.preventDefault(); pick(options[focus]); }
    if (event.key === "Escape") setOpen(false);
  };
  let lastGroup = null;
  return <div className="rx-search" ref={wrapRef}>
    <label><Search size={16} aria-hidden="true" /><input ref={inputRef} value={text} onChange={(event) => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} placeholder="Buscar huésped, DNI, reserva o habitación" aria-label="Buscar huésped, DNI, reserva o habitación" /><kbd>Ctrl K</kbd></label>
    {open && text.trim().length >= 2 ? <div className="rx-search-pop" role="listbox">
      {options.map((option, index) => {
        const header = option.group !== lastGroup ? <h6 key={`${option.group}-h`}>{option.group}</h6> : null;
        lastGroup = option.group;
        const Icon = option.icon;
        return <div key={option.key}>{header}<button type="button" className={index === focus ? "is-focus" : ""} onMouseEnter={() => setFocus(index)} onClick={() => pick(option)} role="option" aria-selected={index === focus}><Icon /><span><b>{option.title}</b><small>{option.sub}</small></span></button></div>;
      })}
      {!options.length ? <p>{loading ? "Buscando…" : "Sin coincidencias. Prueba con el DNI, el código (RES-0145) o el número de habitación."}</p> : null}
    </div> : null}
  </div>;
}

