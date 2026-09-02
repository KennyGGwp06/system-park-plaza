import { useMemo, useState } from "react";
import { Bell, CalendarDays, Clock3, LogOut, Menu, Search, X } from "lucide-react";
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
  const hasStockRequests = ["SUPERADMIN", "RESTAURANTE", "BARTENDER"].includes(user?.role);
  const { data: stockRequests = [] } = useFetch("/stock-requests", { initialData: [], enabled: hasStockRequests, cacheTime: 10000, realtime: true, pollInterval: 10000 });
  const title = routeTitles[location.pathname] || "Modulo ERP";
  const today = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date());
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Usuario";
  const userRole = user?.role === "SUPERADMIN" ? "Superadmin" : user?.role === "ADMINISTRADOR" ? "Admin de recepción" : user?.role || "ERP";
  const isV6Role = ["SUPERADMIN", "ADMINISTRADOR", "RESTAURANTE", "BARTENDER"].includes(user?.role);
  const isRoleHome = ["/admin-panel", "/superadmin", "/restaurante", "/restaurante/dashboard", "/bartender", "/bartender/dashboard"].includes(location.pathname);
  const roleHomeTitle = user?.role === "SUPERADMIN" ? "Centro Superadmin" : user?.role === "ADMINISTRADOR" ? "Centro de Recepción" : user?.role === "RESTAURANTE" ? "Centro de Restaurante" : user?.role === "BARTENDER" ? "Centro de Bar" : "Panel operativo";
  const displayTitle = isV6Role && isRoleHome ? roleHomeTitle : title;
  const subtitle = user?.role === "RESTAURANTE" ? "Centro de Restaurante" : user?.role === "BARTENDER" ? "Centro de Bar" : "Resumen del estado compartido";
  const searchPlaceholder = user?.role === "ADMINISTRADOR" ? "Buscar reserva, cliente o módulo" : user?.role === "RESTAURANTE" ? "Buscar pedidos, recetas o stock" : user?.role === "BARTENDER" ? "Buscar bebidas, recetas o stock" : "Buscar módulo del sistema";
  const alerts = useMemo(() => {
    const metrics = dashboard?.metrics || {};
    const items = [];
    const isOwner = user?.role === "SUPERADMIN";
    const isManager = isOwner || user?.role === "ADMINISTRADOR";
    const isRestaurant = user?.role === "RESTAURANTE";
    const isBar = user?.role === "BARTENDER";
    if (isManager) {
      if (Number(metrics.delayedOrders || 0) > 0) items.push({ key: "orders", label: `${metrics.delayedOrders} pedido(s) fuera de tiempo`, href: "/admin/alimentos-bebidas", tone: "amber" });
      if (Number(metrics.pendingPayments || 0) > 0) items.push({ key: "payments", label: `${metrics.pendingPayments} pago(s) pendientes`, href: "/pagos", tone: "blue" });
      if (Number(metrics.incidentsOpen || 0) > 0) items.push({ key: "incidents", label: `${metrics.incidentsOpen} incidencia(s) abiertas`, href: "/incidencias", tone: "red" });
      if ((dashboard?.lowStockProducts || []).length > 0) items.push({ key: "low-stock", label: `${dashboard.lowStockProducts.length} producto(s) con stock crítico`, href: "/admin/inventario", tone: "amber" });
      if (isOwner) {
        const pendingRequests = stockRequests.filter((request) => request.status === "REQUESTED");
        if (pendingRequests.length) items.unshift({ key: "stock-requests", label: `${pendingRequests.length} solicitud(es) de insumos por aprobar`, href: "/admin/solicitudes-stock", tone: "blue" });
      }
    }
    if (isRestaurant || isBar) {
      const requestPath = isBar ? "/bartender/inventario/solicitudes" : "/restaurante/inventario/solicitudes";
      const receiptPath = isBar ? "/bartender/inventario/recepciones" : "/restaurante/inventario/recepciones";
      const orderPath = isBar ? "/bartender/pedidos" : "/restaurante/pedidos";
      if (Number(metrics.delayedOrders || 0) > 0) items.push({ key: "orders", label: `${metrics.delayedOrders} pedido(s) necesitan seguimiento`, href: orderPath, tone: "amber" });
      const sent = stockRequests.filter((request) => request.status === "APPROVED" && request.transferStatus === "SENT");
      const preparing = stockRequests.filter((request) => request.status === "APPROVED" && request.transferStatus === "DRAFT");
      const rejected = stockRequests.filter((request) => request.status === "REJECTED" && Date.now() - new Date(request.reviewedAt || request.requestedAt).getTime() < 48 * 60 * 60 * 1000);
      if (sent.length) items.unshift({ key: "stock-sent", label: `${sent.length} envío(s) de insumos esperan tu recepción`, href: receiptPath, tone: "blue" });
      if (preparing.length) items.push({ key: "stock-approved", label: `${preparing.length} solicitud(es) aprobadas; almacén prepara el envío`, href: requestPath, tone: "blue" });
      if (rejected.length) items.push({ key: "stock-rejected", label: `${rejected.length} solicitud(es) rechazadas; revisa el motivo`, href: requestPath, tone: "red" });
    }
    return items;
  }, [dashboard, stockRequests, user?.role]);

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
        <label className="v6-global-search"><Search size={17}/><input aria-label="Buscar un módulo del sistema" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} /></label>
        {search.trim() ? <div className="v6-search-results">{(menuByRole[user?.role] || []).filter(([label]) => label.toLowerCase().includes(search.toLowerCase())).slice(0, 6).map(([label, href]) => <Link key={`${label}-${href}`} to={href} onClick={() => setSearch("")}>{label}<span>→</span></Link>)}{!(menuByRole[user?.role] || []).some(([label]) => label.toLowerCase().includes(search.toLowerCase())) ? <p>Sin resultados</p> : null}</div> : null}
      </div> : null}
      <div className="hidden h-11 items-center gap-2 border-l border-park-border/70 px-5 text-sm font-black text-park-dark lg:flex">
        <CalendarDays size={17} className="text-park-green" />
        {today}
      </div>
      {user?.role !== "SUPERADMIN" ? <a className="hidden h-11 items-center gap-2 rounded-xl border border-park-border px-3 text-xs font-black text-park-dark transition hover:bg-park-green-soft md:flex" href="/reloj" target="_blank" rel="noreferrer" title="Abrir reloj de asistencia"><Clock3 size={17} className="text-park-green"/>Marcar turno</a> : null}
      <div className="relative border-l border-park-border/70 pl-3">
        <button className="relative grid h-11 w-11 place-items-center rounded-xl text-park-dark transition hover:bg-slate-100" onClick={() => setAlertsOpen((value) => !value)} type="button" aria-label="Ver alertas operativas" aria-expanded={alertsOpen}>
          <Bell size={20} />
          {alerts.length ? <span className="absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{alerts.length}</span> : null}
        </button>
        {alertsOpen ? <aside className="absolute right-0 top-14 z-50 w-80 rounded-card border border-park-border bg-white p-3 shadow-drawer" aria-label="Alertas operativas"><div className="mb-2 flex items-center justify-between"><div><strong className="text-sm text-park-dark">Alertas operativas</strong><p className="text-xs text-park-muted">Solo ves acciones que corresponden a tu rol.</p></div><button className="rounded-lg p-1 text-park-muted hover:bg-slate-100" onClick={() => setAlertsOpen(false)} type="button" aria-label="Cerrar alertas"><X size={16}/></button></div>{alerts.length ? <div className="space-y-2">{alerts.map((alert) => <Link className={`block rounded-xl border p-3 text-sm font-bold transition duration-300 ease-out hover:-translate-y-0.5 hover:brightness-95 ${alert.tone === "red" ? "border-red-200 bg-red-50 text-red-700" : alert.tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-800"}`} key={alert.key} to={alert.href} onClick={() => setAlertsOpen(false)}>{alert.label}</Link>)}</div> : <p className="rounded-xl bg-park-bg p-3 text-center text-sm text-park-muted">No hay alertas pendientes.</p>}</aside> : null}
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
