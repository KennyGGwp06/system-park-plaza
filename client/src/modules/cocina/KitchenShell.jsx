// Estación de Restaurante (cocina) y de Bar: la misma estación según el área (STATIONS en kitchenNavigation.js). Menú, cabecera (turno DNI + PIN, estado del inventario del día, buscador de
// recetas y pedidos, avisos) y el contenido de cada módulo. Misma identidad que el espacio de Recepción (recepcion.css).
// Datos compartidos por las pantallas (KitchenContext): pedidos del área, turno de inventario activo y su detalle.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, BookOpen, ChevronRight, LogOut, Menu, Search } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { ModuleErrorBoundary } from "../../components/ModuleErrorBoundary";
import { ShiftContext, ToastProvider, timeOf } from "../recepcion/rxkit";
import { ShiftClockModal } from "../recepcion/ReceptionShell";
import { STATIONS } from "./kitchenNavigation";
import "../recepcion/recepcion.css";
import "./cocina.css";

const ACTIVE_SESSION = ["PENDING", "OPEN", "OPERATING", "COUNTING", "REOPENED"];
export const SESSION_LABEL = { PENDING: ["Por abrir", "warn"], OPEN: ["Abierto", "ok"], OPERATING: ["Abierto", "ok"], COUNTING: ["En conteo de cierre", "info"], REOPENED: ["Reabierto por el dueño", "warn"], SUBMITTED: ["Cierre enviado", "info"], OBSERVED: ["Observado por el dueño", "crit"], CLOSED: ["Cerrado", "off"] };

const KitchenContext = createContext(null);
export const useKitchen = () => useContext(KitchenContext);

export function KitchenShell({ area = "RESTAURANTE" }) {
  return <ToastProvider><KitchenInner station={STATIONS[area] || STATIONS.RESTAURANTE} /></ToastProvider>;
}

function KitchenInner({ station }) {
  const base = station.base;
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const attendance = useFetch("/attendance/current", { initialData: { active: false }, realtime: true, pollInterval: 30000 });
  const orders = useFetch(station.ordersApi, { initialData: [], realtime: true, pollInterval: 10000 });
  const sessions = useFetch("/operational-inventory/sessions", { initialData: [], realtime: true, pollInterval: 20000 });
  const transfers = useFetch("/transfers", { initialData: [], realtime: true, pollInterval: 30000 });
  const recipes = useFetch(`/technical-recipes/manual/${station.area}`, { initialData: [], realtime: false });
  // Si hay uno abierto manda sobre uno sin abrir (antes cada marcación de entrada creaba otro turno PENDING).
  const isBar = station.area === "BARTENDER";
  const bottles = useFetch("/bar/bottles", { initialData: [], enabled: isBar, realtime: isBar, pollInterval: 30000 });
  const openBottles = isBar ? (bottles.data || []).filter((row) => row.status === "OPEN") : [];
  const activeSession = useMemo(() => { const rows = (sessions.data || []).filter((row) => ACTIVE_SESSION.includes(row.status)); return rows.find((row) => row.status !== "PENDING") || rows[0] || null; }, [sessions.data]);
  const lastSession = useMemo(() => (sessions.data || [])[0] || null, [sessions.data]);
  // Un cierre enviado u observado bloquea abrir otro turno hasta que el dueño lo revise (índice único del servidor).
  const awaitingReview = useMemo(() => (sessions.data || []).find((row) => ["SUBMITTED", "OBSERVED"].includes(row.status)) || null, [sessions.data]);
  const inventoryOpen = ["OPEN", "OPERATING", "REOPENED", "COUNTING"].includes(activeSession?.status);
  const detail = useFetch(activeSession ? `/operational-inventory/sessions/${activeSession.id}` : "/operational-inventory/sessions/0", { initialData: null, enabled: Boolean(activeSession), realtime: true, pollInterval: 20000 });
  const shiftActive = Boolean(attendance.data?.active);

  useEffect(() => { setNavOpen(false); setBellOpen(false); }, [location.pathname, location.search]);

  const active = (orders.data || []).filter((row) => ["PENDIENTE", "EN_COCINA", "PREPARANDO", "LISTO"].includes(row.status));
  const late = active.filter((row) => row.isLate || row.isAbandoned || ["LATE", "ABANDONED"].includes(row.operationalBucket));
  const incoming = (transfers.data || []).filter((row) => row.toWarehouseCode === station.area && row.status === "SENT");
  const lowRecipes = (recipes.data || []).filter((row) => Number(row.availablePortions) <= 5);
  const badges = { orders: active.length, incoming: incoming.length, bottles: openBottles.length };
  const attention = [
    late.length ? { key: "late", tone: "crit", count: late.length, label: "pedidos fuera de tiempo", href: `${base}/pedidos` } : null,
    active.filter((row) => row.status === "PENDIENTE").length ? { key: "new", tone: "warn", count: active.filter((row) => row.status === "PENDIENTE").length, label: "pedidos nuevos por aceptar", href: `${base}/pedidos` } : null,
    incoming.length ? { key: "incoming", tone: "info", count: incoming.length, label: "envíos de insumos por recibir", href: `${base}/inventario/solicitudes?vista=recibir` } : null,
    lowRecipes.length ? { key: "low", tone: "warn", count: lowRecipes.length, label: `${station.items} con 5 porciones o menos`, href: `${base}/inventario/recetas` } : null,
    activeSession?.status === "PENDING" && awaitingReview ? { key: "review", tone: "warn", count: null, label: "El dueño debe revisar el último cierre antes de abrir el inventario de hoy", href: `${base}/inventario/insumos` } : activeSession?.status === "PENDING" ? { key: "session", tone: "warn", count: null, label: "El inventario del turno está por abrir", href: `${base}/inventario/insumos` } : null
  ].filter(Boolean);

  const current = useMemo(() => {
    for (const group of station.modules) { const item = group.items.find(([, href]) => location.pathname === href.split("?")[0]); if (item) return { group: group.label, label: item[0] }; }
    return { group: station.name, label: "Park Plaza" };
  }, [location.pathname, station]);
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || station.name;
  const [sessionLabel, sessionTone] = activeSession?.status === "PENDING" && awaitingReview ? ["Cierre en revisión", "warn"] : SESSION_LABEL[activeSession?.status || lastSession?.status] || ["Sin inventario", "off"];

  const kitchen = {
    station,
    orders: orders.data || [], ordersLoading: orders.loading && !orders.data?.length, reloadOrders: orders.reload,
    sessions: sessions.data || [], activeSession, lastSession, awaitingReview, inventoryOpen, detail: detail.data, reloadSession: () => { sessions.reload(); detail.reload(); },
    transfers: transfers.data || [], incoming, reloadTransfers: transfers.reload,
    bottles: bottles.data || [], openBottles, reloadBottles: bottles.reload,
    recipes: recipes.data || [], recipesLoading: recipes.loading && !recipes.data?.length, late, active
  };
  const shift = { active: shiftActive, ownerPreview: false, record: attendance.data?.record || null, openClock: () => setClockOpen(true), reload: attendance.reload, desk: null, reloadDesk: () => {}, cashSession: null };

  return <ShiftContext.Provider value={shift}><KitchenContext.Provider value={kitchen}>
    <div className="rx">
      <aside className={`rx-side ${navOpen ? "is-open" : ""}`} aria-label={`Menú de ${station.name}`}>
        <Link className="rx-brand" to={`${base}/dashboard`}><img src="/brand/park-plaza-mark.svg" alt="" /><span><b>PARK PLAZA</b><small>{station.brand}</small></span></Link>
        <nav className="rx-nav">
          {station.modules.map((group) => <div key={group.label}>
            <div className="rx-nav-group">{group.label}</div>
            {group.items.map(([label, href, Icon, badgeKey]) => { const on = location.pathname === href; const count = badgeKey ? badges[badgeKey] : 0; return <Link key={href} to={href} className={on ? "is-active" : ""} aria-current={on ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span>{count ? <i className={badgeKey === "orders" && late.length ? "is-hot" : ""}>{count}</i> : null}</Link>; })}
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
          <KitchenSearch recipes={kitchen.recipes} orders={active} onPick={navigate} base={base} icon={station.icon} />
          <div className="rx-top-tools">
            <button className="rx-chip" type="button" onClick={() => setClockOpen(true)} title={shiftActive ? "Marcar salida del turno" : "Iniciar turno con DNI y PIN"}>
              <span className={`rx-dot ${shiftActive ? "ok" : "warn"}`} />{shiftActive ? <>En turno<span className="hide-md">&nbsp;desde {timeOf(attendance.data?.record?.checkIn || attendance.data?.record?.clockIn)}</span></> : "Iniciar turno"}
            </button>
            <Link className="rx-chip" to={`${base}/inventario/insumos`} title="Inventario del turno"><span className={`rx-dot ${sessionTone === "ok" ? "ok" : sessionTone === "crit" ? "crit" : sessionTone === "warn" ? "warn" : ""}`} /><span className="hide-md">Inventario:&nbsp;</span>{sessionLabel}</Link>
            <div style={{ position: "relative" }}>
              <button className="rx-icon-btn" type="button" onClick={() => setBellOpen((value) => !value)} aria-label={station.avisos} aria-expanded={bellOpen}><Bell size={17} />{attention.length ? <i>{attention.length}</i> : null}</button>
              {bellOpen ? <div className="rx-bell-pop"><header><strong>{station.avisos}</strong><small>Lo que necesita tu atención ahora</small></header>
                {attention.length ? <div className="rx-attn">{attention.map((item) => <Link key={item.key} className={item.tone} to={item.href}>{item.count != null ? <b>{item.count}</b> : null}<span>{item.label}</span><ChevronRight /></Link>)}</div> : <p className="rx-empty">Sin avisos.</p>}
              </div> : null}
            </div>
          </div>
        </header>
        <main className="rx-page">
          <ModuleErrorBoundary resetKey={location.pathname}><Outlet /></ModuleErrorBoundary>
        </main>
      </div>
      {clockOpen ? <ShiftClockModal active={shiftActive} user={user} areaLabel={station.name} closeHint="Al marcar tu salida ya no podrás preparar pedidos ni mover insumos. Si el inventario sigue abierto, primero envía el cierre del día." onClose={() => setClockOpen(false)} onDone={() => { attendance.reload(); sessions.reload(); }} /> : null}
    </div>
  </KitchenContext.Provider></ShiftContext.Provider>;
}

function KitchenSearch({ recipes, orders, onPick, base, icon: OrderIcon }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const needle = text.trim().toLowerCase();
  const results = needle.length < 2 ? [] : [
    ...orders.filter((row) => `${row.code} ${row.destination?.label || ""} ${(row.items || []).map((item) => item.name).join(" ")}`.toLowerCase().includes(needle)).slice(0, 4).map((row) => ({ key: `o${row.id}`, icon: OrderIcon, title: `${row.code} · ${row.destination?.label || "Pedido"}`, sub: (row.items || []).map((item) => `${item.quantity}× ${item.name}`).join(", "), to: `${base}/pedidos?ver=${row.id}` })),
    ...recipes.filter((row) => `${row.name} ${row.code}`.toLowerCase().includes(needle)).slice(0, 6).map((row) => ({ key: `r${row.id}`, icon: BookOpen, title: row.name, sub: `Receta v${row.version} · ${row.ingredients?.length || 0} ingredientes`, to: `${base}/inventario/recetas?ver=${row.id}` }))
  ];
  return <div className="rx-search" ref={ref}>
    <label><Search size={16} aria-hidden="true" /><input value={text} onChange={(event) => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Buscar receta o pedido" aria-label="Buscar receta o pedido" /></label>
    {open && needle.length >= 2 ? <div className="rx-search-pop">{results.map(({ key, icon: Icon, title, sub, to }) => <button key={key} type="button" onClick={() => { setOpen(false); setText(""); onPick(to); }}><Icon /><span><b>{title}</b><small>{sub}</small></span></button>)}{!results.length ? <p>Sin coincidencias.</p> : null}</div> : null}
  </div>;
}
