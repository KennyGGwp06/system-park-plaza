// Centro de dirección del dueño (Superadmin), v3 2026-09-28: la misma forma que Recepción, Cocina, Bar y Operaciones
// (recepcion.css + rxkit). Menú PLANO por grupos (sin submenús); cuando un tema tiene varias vistas, se eligen con
// pestañas dentro de la página. Cabecera con buscador global (funciones y clientes), "Por aprobar" y Recepción.
// Las pantallas reciben navigate(módulo, vista) y también escuchan el evento "parkplaza:superadmin-navigate".
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ClipboardCheck, ConciergeBell, LogOut, Menu, RefreshCw, Search, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ModuleErrorBoundary } from "../../components/ModuleErrorBoundary";
import { ToastProvider } from "../recepcion/rxkit";
import { SUPERADMIN_GROUPS, SUPERADMIN_MODULES, findSuperAdminDestination, resolveSuperAdminTarget, superAdminUrl } from "./superAdminNavigation";
import { OWNER_PAGES } from "./ownerPages";
import { OwnerBoard } from "./OwnerBoard";
import "../recepcion/recepcion.css";
import "./owner.css";

export function OwnerShell() {
  return <ToastProvider><OwnerInner /></ToastProvider>;
}

function OwnerInner() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const destination = findSuperAdminDestination(location.pathname) || { module: SUPERADMIN_MODULES[0], view: SUPERADMIN_MODULES[0].views[0] };
  const { module, view } = destination;
  const [navOpen, setNavOpen] = useState(false);
  const approvals = useFetch("/superadmin/approvals", { initialData: { total: 0, groups: [], watch: [] }, realtime: true, pollInterval: 30000 });
  const badges = { approvals: approvals.data?.total || 0 };

  // navigate(módulo, vista, "?ver=ID") abre un caso concreto dentro de la vista.
  const navigate = (rawModule, rawView, query = "") => {
    const [moduleId, viewId] = resolveSuperAdminTarget(rawModule, rawView);
    const target = SUPERADMIN_MODULES.find((item) => item.id === moduleId);
    if (!target) return;
    const targetView = target.views.find((item) => item.id === viewId) || target.views[0];
    routerNavigate(`${superAdminUrl(target.id, targetView.id)}${query}`);
    document.querySelector(".rx-page")?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const handler = (event) => navigate(event.detail?.area || "clientes", event.detail?.page || "directorio");
    window.addEventListener("parkplaza:superadmin-navigate", handler);
    return () => window.removeEventListener("parkplaza:superadmin-navigate", handler);
  });
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const ownerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Dueño";
  const Page = OWNER_PAGES[`${module.id}:${view.id}`] || OWNER_PAGES[view.id];
  const content = module.id === "inicio"
    ? <OwnerBoard approvals={approvals} navigate={navigate} />
    : Page ? <Page module={module} view={view} navigate={navigate} approvals={approvals} area={module.id === "bar" ? "BARTENDER" : "RESTAURANTE"} />
    : <div className="rx-card" style={{ padding: 24 }}>Esta vista no existe.</div>;
  // Pestañas del tema activo (solo si tiene más de una vista): van dentro de la página, no en el menú.
  const visibleViews = module.views.filter((sub) => !sub.hidden);
  const tabs = visibleViews.length > 1 ? <nav className="ow-tabs" aria-label={`Vistas de ${module.label}`}>{visibleViews.map((sub) => <Link key={sub.id} to={superAdminUrl(module.id, sub.id)} className={sub.id === view.id ? "is-on" : ""} aria-current={sub.id === view.id ? "page" : undefined}>{sub.label}</Link>)}</nav> : null;

  return <div className="rx rx--owner">
    <aside className={`rx-side ${navOpen ? "is-open" : ""}`} aria-label="Menú del dueño">
      <Link className="rx-brand" to="/superadmin"><img src="/brand/park-plaza-mark.svg" alt="" /><span><b>PARK PLAZA</b><small>Centro de dirección</small></span></Link>
      <nav className="rx-nav">
        {SUPERADMIN_GROUPS.map((group) => <div key={group}>
          <div className="rx-nav-group">{group}</div>
          {SUPERADMIN_MODULES.filter((item) => item.group === group).map((item) => { const Icon = item.icon; const on = item.id === module.id; const count = item.badge ? badges[item.badge] : 0; return <Link key={item.id} to={superAdminUrl(item.id, item.views[0].id)} className={on ? "is-active" : ""} aria-current={on ? "page" : undefined} title={item.description}><Icon aria-hidden="true" /><span>{item.label}</span>{count ? <i className="is-hot">{count}</i> : null}</Link>; })}
        </div>)}
      </nav>
      <div className="rx-side-foot">
        <span>{ownerName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
        <div><strong>{ownerName}</strong><small>Dueño · acceso completo</small></div>
        <button type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button>
      </div>
    </aside>
    <button type="button" className={`rx-scrim ${navOpen ? "is-open" : ""}`} onClick={() => setNavOpen(false)} aria-label="Cerrar menú" tabIndex={navOpen ? 0 : -1} />

    <div className="rx-main">
      <header className="rx-top">
        <button className="rx-burger" type="button" onClick={() => setNavOpen(true)} aria-label="Abrir menú"><Menu size={18} /></button>
        <div className="rx-crumb"><small>{module.group}</small><strong>{module.views.length > 1 ? `${module.label} · ${view.label}` : module.label}</strong></div>
        <OwnerSearch onNavigate={navigate} onClient={(id) => routerNavigate(`/superadmin/clientes/perfil?cliente=${id}`)} />
        <div className="rx-top-tools">
          <Link className={`rx-chip ${badges.approvals ? "ow-chip-hot" : ""}`} to="/superadmin/aprobar/bandeja" title="Lo que espera tu decisión"><ClipboardCheck size={15} /><span className="hide-md">Por aprobar&nbsp;</span><b>{badges.approvals}</b></Link>
          <Link className="rx-chip" to="/admin-panel" title="Abrir la estación de Recepción como la ve Rosa"><ConciergeBell size={15} /><span className="hide-md">Recepción</span></Link>
          <button className="rx-icon-btn" type="button" onClick={() => { approvals.reload(); window.dispatchEvent(new Event("parkplaza:refresh")); }} aria-label="Actualizar" title="Actualizar"><RefreshCw size={16} /></button>
        </div>
      </header>
      <main className="rx-page ow-page">
        <ModuleErrorBoundary resetKey={location.pathname}>
          {tabs}
          <Suspense fallback={<LoadingSpinner label={`Cargando ${view.label.toLowerCase()}…`} />}>{content}</Suspense>
        </ModuleErrorBoundary>
      </main>
    </div>
  </div>;
}

// Buscador global: funciones del sistema (por nombre de módulo o vista) y clientes (nombre, documento o celular).
function OwnerSearch({ onNavigate, onClient }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const needle = text.trim().toLowerCase();
  const clients = useFetch(`/superadmin/clients?q=${encodeURIComponent(text.trim())}&pageSize=5`, { initialData: null, enabled: needle.length >= 3, realtime: false });
  useEffect(() => { const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const functions = useMemo(() => needle.length < 2 ? [] : SUPERADMIN_MODULES.flatMap((item) => item.views.map((sub) => ({ item, sub }))).filter(({ item, sub }) => `${item.label} ${sub.label} ${item.description}`.toLowerCase().includes(needle)).slice(0, 6), [needle]);
  const people = needle.length >= 3 ? (clients.data?.list?.rows || []).slice(0, 5) : [];
  const pick = (fn) => { setOpen(false); setText(""); fn(); };
  return <div className="rx-search" ref={ref}>
    <label><Search size={16} aria-hidden="true" /><input value={text} onChange={(event) => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Buscar cliente o función" aria-label="Buscar cliente o función" /></label>
    {open && needle.length >= 2 ? <div className="rx-search-pop">
      {people.map((row) => <button key={`c${row.id}`} type="button" onClick={() => pick(() => onClient(row.id))}><User /><span><b>{row.name}</b><small>{[row.documentNumber, row.phone, row.segmentLabel || row.segment].filter(Boolean).join(" · ")}</small></span></button>)}
      {functions.map(({ item, sub }) => { const Icon = item.icon; return <button key={`${item.id}:${sub.id}`} type="button" onClick={() => pick(() => onNavigate(item.id, sub.id))}><Icon /><span><b>{sub.label}</b><small>{item.label}</small></span><ChevronRight size={14} /></button>; })}
      {!people.length && !functions.length ? <p>{needle.length < 3 ? "Sigue escribiendo…" : "Sin coincidencias."}</p> : null}
    </div> : null}
  </div>;
}

export const lazyOwnerPage = (loader, name) => lazy(() => loader().then((mod) => ({ default: mod[name] })));
