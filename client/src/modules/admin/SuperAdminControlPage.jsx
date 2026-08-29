import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BedDouble, CalendarCheck, ChefHat, CircleDollarSign, ClipboardCheck, DollarSign, ShieldCheck, Sparkles, Waves, Wrench } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";

const ACTIVE_BOOKING_STATUSES = new Set(["PENDIENTE", "CONFIRMADA", "ACTIVA", "LISTO_INGRESO", "EN_USO"]);
const ACTIVE_EVENT_STATUSES = new Set(["COTIZACION", "PENDIENTE", "CONFIRMADO", "ACTIVO"]);

export function SuperAdminControlPage() {
  const dashboard = useFetch("/dashboard", { initialData: { metrics: {}, lowStockProducts: [] }, cacheTime: 15000, realtime: true, pollInterval: 15000 });
  const stateQuery = useFetch("/superadmin/control-state", { initialData: null, cacheTime: 15000, realtime: true, pollInterval: 15000 });

  if (dashboard.loading || stateQuery.loading) return <LoadingSpinner label="Actualizando el control integral..." />;
  if (dashboard.error || stateQuery.error) return <ErrorState error={dashboard.error || stateQuery.error} />;

  const state = stateQuery.data || {};
  const metrics = dashboard.data?.metrics || {};
  const bookings = state.bookings || [];
  const payments = state.payments || [];
  const cashSessions = state.cashSessions || [];
  const today = String(state.settings?.today || "").slice(0, 10);
  const activeBookings = (serviceCode) => bookings.filter((item) => item.serviceCode === serviceCode && ACTIVE_BOOKING_STATUSES.has(String(item.status || "").toUpperCase()));
  const activeEvents = (state.events || []).filter((item) => ACTIVE_EVENT_STATUSES.has(String(item.status || "").toUpperCase()));
  const dailyPayments = payments.filter((item) => String(item.createdAt || item.paidAt || "").slice(0, 10) === today);
  const cashPayments = dailyPayments.filter((item) => String(item.method || "").toUpperCase() === "EFECTIVO");
  const pendingCashReviews = cashSessions.filter((item) => item.status === "EN_REVISION");
  const restaurantOrders = (state.orders || []).filter((item) => item.area === "RESTAURANTE" && !["ENTREGADO", "CANCELADO"].includes(item.status));
  const barOrders = (state.orders || []).filter((item) => item.area === "BARTENDER" && !["ENTREGADO", "CANCELADO"].includes(item.status));

  const services = [
    { code: "HOSPEDAJE", title: "Hotel", description: "Habitaciones, reservas, limpieza y mantenimiento.", icon: BedDouble, tone: "blue", value: activeBookings("HOSPEDAJE").length + (state.reservations || []).filter((item) => ACTIVE_BOOKING_STATUSES.has(String(item.status || "").toUpperCase())).length, detail: `${metrics.availableRooms || 0} habitaciones libres · ${metrics.occupiedRooms || 0} ocupadas`, actions: [["Reservas", "/reservas"], ["Habitaciones", "/habitaciones"], ["Limpieza", "/admin/limpieza/resumen"], ["Mantenimiento", "/incidencias"]] },
    { code: "PISCINA", title: "Piscina", description: "Ingresos, aforo y validación exclusiva de accesos de piscina.", icon: Waves, tone: "cyan", value: activeBookings("PISCINA").length, detail: `${Number((state.services || []).find((item) => item.code === "PISCINA")?.capacity || 0)} personas por horario`, actions: [["Ingresos y aforo", "/piscina/ingresos"], ["Validar QR de piscina", "/piscina/validar-qr"]] },
    { code: "MIRADOR", title: "Mirador", description: "Reservas por horario y control exclusivo de accesos al mirador.", icon: Sparkles, tone: "amber", value: activeBookings("MIRADOR").length, detail: `${Number((state.services || []).find((item) => item.code === "MIRADOR")?.capacity || 0)} personas por horario`, actions: [["Agenda de reservas", "/recepcion"], ["Validar QR de mirador", "/accesos"]] },
    { code: "EVENTOS", title: "Eventos", description: "Ambientes, cotizaciones, reservas, saldos y servicios adicionales.", icon: CalendarCheck, tone: "violet", value: activeEvents.length, detail: `${activeEvents.filter((item) => Number(item.balance || 0) > 0).length} evento(s) con saldo pendiente`, actions: [["Calendario y reservas", "/eventos/reservas"], ["Pagos de eventos", "/pagos"]] }
  ];
  const alerts = [
    { label: "Rendiciones de recepción", value: pendingCashReviews.length, href: "/admin-panel/caja-central", urgent: pendingCashReviews.length > 0, description: "Esperan aprobación o rechazo del Superadmin" },
    { label: "Pagos pendientes", value: metrics.pendingPayments || 0, href: "/pagos", urgent: metrics.pendingPayments > 0, description: "De Hotel, Piscina, Mirador o Eventos" },
    { label: "Incidencias de mantenimiento", value: metrics.incidentsOpen || 0, href: "/incidencias", urgent: metrics.incidentsOpen > 0, description: "Reportadas desde la operación" },
    { label: "Stock crítico", value: (dashboard.data?.lowStockProducts || []).length, href: "/admin/inventario", urgent: (dashboard.data?.lowStockProducts || []).length > 0, description: "Inventario central, Restaurante y Bar" }
  ];

  return <div className="reception-command space-y-6 pb-10">
    <section className="reception-status"><strong>Control integral conectado</strong><span>Todos los servicios se mantienen separados en la operación y unidos solo para el análisis del dueño.</span></section>
    <section className="reception-hero"><div><p>SUPERADMIN · DUEÑO Y CONTROL TOTAL</p><h1>Park Plaza hoy</h1><span>Hotel, Piscina, Mirador, Eventos, Restaurante y Bar: cada servicio con sus propios accesos, pagos y operación.</span></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Cobrado hoy" value={money(dailyPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0))} help="Todos los servicios" tone="green" icon={DollarSign}/>
      <Metric label="Efectivo recibido" value={money(cashPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0))} help="Cobrado por Recepción" tone="amber" icon={CircleDollarSign}/>
      <Metric label="Rendiciones" value={pendingCashReviews.length} help="Pendientes de revisión" tone="violet" icon={ClipboardCheck}/>
      <Metric label="Pedidos activos" value={restaurantOrders.length + barOrders.length} help={`${restaurantOrders.length} Restaurante · ${barOrders.length} Bar`} tone="blue" icon={ChefHat}/>
      <Metric label="Alertas" value={(metrics.incidentsOpen || 0) + (dashboard.data?.lowStockProducts || []).length} help="Mantenimiento e inventario" tone="slate" icon={AlertTriangle}/>
    </section>
    <section><div className="mb-3"><p className="text-xs font-black uppercase tracking-[.16em] text-blue-600">Operación por servicio</p><h2 className="text-xl font-black text-park-dark">¿Qué necesita atención?</h2><p className="text-sm text-park-muted">Cada servicio funciona de forma independiente; no se mezclan sus reservas ni sus QR.</p></div><div className="grid gap-4 xl:grid-cols-2">{services.map((service) => <ServiceCard service={service} key={service.code} />)}</div></section>
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card"><div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-600">Dinero y control</p><h2 className="text-xl font-black text-park-dark">Lo que el dueño debe revisar</h2><p className="text-sm text-park-muted">Recepción cobra y rinde su sesión; solo Superadmin revisa rendiciones y realiza el cierre definitivo.</p></div><DollarSign className="shrink-0 text-amber-600" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{alerts.map((item) => <AlertLink item={item} key={item.label} />)}</div></section>
    <section className="grid gap-4 xl:grid-cols-2">
      <ControlGroup title="Oferta, precios e imágenes" description="El Superadmin cambia lo que se vende y lo que se publica: precios, planes, ambientes, textos e imágenes de cada servicio." icon={CircleDollarSign} tone="amber" items={[["Precios e imágenes de servicios", "/admin/comercial"], ["Carta, precios y recetas", "/admin/alimentos-bebidas"]]} />
      <ControlGroup title="Inventario y abastecimiento" description="Compra central, proveedores y asignación diaria separada para Restaurante y Bar." icon={ChefHat} tone="green" items={[["Inventario central", "/admin/inventario"], ["Compras", "/compras"], ["Transferencias", "/transferencias"], ["Producción y porcionado", "/inventario/produccion"]]} />
      <ControlGroup title="Gobierno del sistema" description="Usuarios, permisos, trazabilidad y configuración global del ERP." icon={ShieldCheck} tone="slate" items={[["Usuarios y permisos", "/usuarios"], ["Auditoría", "/auditoria"], ["Integridad de datos", "/admin/integridad"], ["Configuración", "/configuracion"]]} />
    </section>
  </div>;
}

function ServiceCard({ service }) { const Icon = service.icon; const tones = { blue: "bg-blue-50 text-blue-700", cyan: "bg-cyan-50 text-cyan-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tones[service.tone]}`}><Icon size={22}/></span><div><h3 className="font-black text-park-dark">{service.title}</h3><p className="text-sm text-park-muted">{service.description}</p></div></div><strong className="text-3xl text-park-dark">{service.value}</strong></div><p className="mt-4 rounded-lg bg-park-bg px-3 py-2 text-xs font-bold text-park-muted">{service.detail}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{service.actions.map(([label, to]) => <Link className="flex items-center justify-between rounded-xl border border-park-border px-3 py-2.5 text-sm font-black text-park-dark transition hover:border-blue-300 hover:bg-blue-50" to={to} key={`${service.code}-${label}`}>{label}<ArrowRight size={16}/></Link>)}</div></article>; }
function AlertLink({ item }) { return <Link className={`rounded-xl border p-4 ${item.urgent ? "border-amber-200 bg-amber-50" : "border-park-border bg-park-bg"}`} to={item.href}><strong className="block text-2xl text-park-dark">{item.value}</strong><span className="block text-sm font-black text-park-dark">{item.label}</span><small className="mt-1 block text-park-muted">{item.description}</small></Link>; }
function ControlGroup({ title, description, icon: Icon, tone, items }) { const tones = { amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", slate: "bg-slate-100 text-slate-700" }; return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><div className="flex gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={22}/></span><div><h3 className="font-black text-park-dark">{title}</h3><p className="text-sm text-park-muted">{description}</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map(([label, to]) => <Link className="flex items-center justify-between rounded-xl border border-park-border bg-park-bg px-3 py-2.5 text-sm font-black text-park-dark transition hover:border-blue-300 hover:bg-blue-50" to={to} key={to}>{label}<ArrowRight size={16}/></Link>)}</div></article>; }
function Metric({ label, value, help, tone, icon: Icon }) { const colors = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700", blue: "bg-blue-50 text-blue-700", slate: "bg-slate-100 text-slate-700" }; return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}><Icon size={18}/></span><strong className="mt-3 block text-2xl text-park-dark">{value}</strong><p className="text-sm font-black text-park-dark">{label}</p><small className="mt-1 block text-park-muted">{help}</small></article>; }
function ErrorState({ error }) { return <div className="rounded-card border border-red-200 bg-red-50 p-5 text-red-700">No se pudo actualizar el centro de control: {error?.message || "Error desconocido"}</div>; }
function money(value) { return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
