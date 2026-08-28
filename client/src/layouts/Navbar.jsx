import { useMemo, useState } from "react";
import { Bell, CalendarDays, LogOut, Menu, Search, SquarePlus, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { menuByRole, routeTitles } from "../constants/menu";
import { useFetch } from "../hooks/useFetch";

export function Navbar({ onMenu }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: dashboard } = useFetch("/dashboard", { initialData: { metrics: {}, lowStockProducts: [] }, cacheTime: 15000, realtime: true, pollInterval: 15000 });
  const title = routeTitles[location.pathname] || "Modulo ERP";
  const today = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date());
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Usuario";
  const userRole = user?.role === "SUPERADMIN" ? "Superadmin" : user?.role === "ADMINISTRADOR" ? "Admin de recepción" : user?.role || "ERP";
  const isExecutiveControl = ["ADMINISTRADOR", "SUPERADMIN"].includes(user?.role);
  const isV6Role = ["SUPERADMIN", "ADMINISTRADOR", "RESTAURANTE", "BARTENDER"].includes(user?.role);
  const isRoleHome = ["/admin-panel", "/superadmin", "/restaurante", "/restaurante/dashboard", "/bartender", "/bartender/dashboard"].includes(location.pathname);
  const displayTitle = isV6Role && isRoleHome ? "Panel operativo" : title;
  const subtitle = user?.role === "RESTAURANTE" ? "Centro de Restaurante" : user?.role === "BARTENDER" ? "Centro de Bar" : "Resumen del estado compartido";
  const alerts = useMemo(() => {
    const metrics = dashboard?.metrics || {};
    const items = [];
    if (Number(metrics.delayedOrders || 0) > 0) items.push({ label: `${metrics.delayedOrders} pedido(s) fuera de tiempo`, href: "/admin/alimentos-bebidas", tone: "amber" });
    if (Number(metrics.pendingPayments || 0) > 0) items.push({ label: `${metrics.pendingPayments} pago(s) pendientes`, href: "/pagos", tone: "blue" });
    if (Number(metrics.incidentsOpen || 0) > 0) items.push({ label: `${metrics.incidentsOpen} incidencia(s) abiertas`, href: "/incidencias", tone: "red" });
    if ((dashboard?.lowStockProducts || []).length > 0) items.push({ label: `${dashboard.lowStockProducts.length} producto(s) con stock crítico`, href: "/admin/inventario", tone: "amber" });
    return items;
  }, [dashboard]);

  return (
    <header className={`sticky top-0 z-30 flex min-h-[72px] items-center gap-3 border-b border-park-border/80 bg-white/95 px-4 shadow-sm backdrop-blur lg:px-8 ${isV6Role ? "reception-v6-navbar" : ""}`}>
      <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100/50 transition-colors lg:hidden text-park-dark" onClick={onMenu} type="button" aria-label="Abrir menú de navegación">
        <Menu size={22} />
      </button>
      <div className="min-w-0">
        <h2 className="font-sans text-lg font-black leading-tight text-park-dark sm:text-2xl drop-shadow-sm">{displayTitle}</h2>
        <p className="hidden truncate text-sm font-semibold text-park-muted sm:block">{isV6Role ? subtitle : "Hotel Park Plaza / Sistema ERP hotelero"}</p>
      </div>
      <div className="ml-auto" />
      {isV6Role ? <div className="relative hidden xl:block">
        <label className="v6-global-search"><Search size={17}/><input aria-label="Buscar en el sistema" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en el hotel" /></label>
        {search.trim() ? <div className="v6-search-results">{(menuByRole[user?.role] || []).filter(([label]) => label.toLowerCase().includes(search.toLowerCase())).slice(0, 6).map(([label, href]) => <Link key={`${label}-${href}`} to={href} onClick={() => setSearch("")}>{label}<span>→</span></Link>)}{!(menuByRole[user?.role] || []).some(([label]) => label.toLowerCase().includes(search.toLowerCase())) ? <p>Sin resultados</p> : null}</div> : null}
      </div> : null}
      {user?.role === "SUPERADMIN" ? <Link className="v6-top-action secondary hidden xl:inline-flex" to="/admin/comercial">Precios reales</Link> : null}
      {isExecutiveControl ? <Link className="v6-top-action hidden lg:inline-flex" to="/reservas"><SquarePlus size={17}/> Nueva reserva</Link> : null}
      <div className="hidden h-11 items-center gap-2 border-l border-park-border/70 px-5 text-sm font-black text-park-dark lg:flex">
        <CalendarDays size={17} className="text-park-green" />
        {today}
      </div>
      <div className="relative border-l border-park-border/70 pl-3">
        <button className="relative grid h-11 w-11 place-items-center rounded-xl text-park-dark transition hover:bg-slate-100" onClick={() => setAlertsOpen((value) => !value)} type="button" aria-label="Ver alertas operativas" aria-expanded={alertsOpen}>
          <Bell size={20} />
          {alerts.length ? <span className="absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{alerts.length}</span> : null}
        </button>
        {alertsOpen ? <aside className="absolute right-0 top-14 z-50 w-80 rounded-card border border-park-border bg-white p-3 shadow-drawer" aria-label="Alertas operativas"><div className="mb-2 flex items-center justify-between"><div><strong className="text-sm text-park-dark">Alertas operativas</strong><p className="text-xs text-park-muted">Actualizadas en tiempo real.</p></div><button className="rounded-lg p-1 text-park-muted hover:bg-slate-100" onClick={() => setAlertsOpen(false)} type="button" aria-label="Cerrar alertas"><X size={16}/></button></div>{alerts.length ? <div className="space-y-2">{alerts.map((alert) => <Link className={`block rounded-xl border p-3 text-sm font-bold hover:brightness-95 ${alert.tone === "red" ? "border-red-200 bg-red-50 text-red-700" : alert.tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-800"}`} key={alert.label} to={alert.href} onClick={() => setAlertsOpen(false)}>{alert.label}</Link>)}</div> : <p className="rounded-xl bg-park-bg p-3 text-center text-sm text-park-muted">No hay alertas pendientes.</p>}</aside> : null}
      </div>
      <div className="hidden h-11 items-center gap-3 border-l border-park-border/70 pl-5 md:flex">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-park-green text-sm font-black text-white shadow-sm">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="leading-tight pr-2">
          <span className="block text-sm font-black text-park-dark">{userName}</span>
          <span className="block text-[10px] font-black uppercase tracking-wider text-park-green">{userRole}</span>
        </span>
      </div>
      <button className="grid h-11 w-11 place-items-center rounded-xl border border-red-100/50 bg-white/60 text-park-danger shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:scale-[1.05]" onClick={logout} type="button" title="Cerrar sesion" aria-label="Cerrar sesión">
        <LogOut size={20} />
      </button>
    </header>
  );
}
