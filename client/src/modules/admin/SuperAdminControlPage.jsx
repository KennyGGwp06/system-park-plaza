import { Link } from "react-router-dom";
import { ArrowRight, Banknote, BedDouble, BellRing, CalendarCheck, ChefHat, CircleDollarSign, ClipboardList, ConciergeBell, CookingPot, PackageSearch, ShieldCheck, Sparkles, SprayCan, UtensilsCrossed, Waves, Wrench } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";

const ACTIVE_BOOKING_STATUSES = new Set(["PENDIENTE", "CONFIRMADA", "ACTIVA", "LISTO_INGRESO", "EN_USO"]);
const ACTIVE_EVENT_STATUSES = new Set(["COTIZACION", "PENDIENTE", "CONFIRMADO", "ACTIVO"]);
const CLOSED_ORDER_STATUSES = new Set(["ENTREGADO", "CANCELADO"]);

export function SuperAdminControlPage() {
  const dashboard = useFetch("/dashboard", { initialData: { metrics: {}, lowStockProducts: [] }, cacheTime: 15000, realtime: true, pollInterval: 15000 });
  const stateQuery = useFetch("/superadmin/control-state", { initialData: null, cacheTime: 15000, realtime: true, pollInterval: 15000 });
  const stockRequestQuery = useFetch("/stock-requests?status=REQUESTED", { initialData: [], cacheTime: 10000, realtime: true, pollInterval: 10000 });

  if (dashboard.loading || stateQuery.loading) return <LoadingSpinner label="Actualizando Park Plaza hoy..." />;
  if (dashboard.error || stateQuery.error) return <ErrorState error={dashboard.error || stateQuery.error} />;

  const state = stateQuery.data || {};
  const metrics = dashboard.data?.metrics || {};
  const bookings = state.bookings || [];
  const payments = state.payments || [];
  const cashSessions = state.cashSessions || [];
  const orders = state.orders || [];
  const requests = state.requests || [];
  const cleaningTasks = state.tasks || [];
  const inventory = state.inventory || [];
  const today = String(state.settings?.today || "").slice(0, 10);
  const activeBookings = (serviceCode) => bookings.filter((item) => item.serviceCode === serviceCode && ACTIVE_BOOKING_STATUSES.has(String(item.status || "").toUpperCase()));
  const activeEvents = (state.events || []).filter((item) => ACTIVE_EVENT_STATUSES.has(String(item.status || "").toUpperCase()));
  const activeOrders = (area) => orders.filter((item) => item.area === area && !CLOSED_ORDER_STATUSES.has(item.status));
  const readyOrders = (area) => activeOrders(area).filter((item) => item.status === "LISTO");
  const stockIssues = (area) => inventory.filter((item) => item.area === area && Number(item.stock || 0) - Number(item.reserved || 0) <= Number(item.minStock || 0));
  const restaurantOrders = activeOrders("RESTAURANTE");
  const barOrders = activeOrders("BARTENDER");
  const openRequests = requests.filter((item) => !["RESUELTO", "CERRADO"].includes(item.status));
  const maintenanceOpen = openRequests.filter((item) => item.requiresMaintenance);
  const receptionOpen = openRequests.filter((item) => item.area === "RECEPCION");
  const cleaningOpen = cleaningTasks.filter((item) => item.status !== "FINALIZADA");
  const standaloneCleaning = cleaningOpen.filter((item) => !item.requestId);
  const unassignedCleaning = cleaningOpen.filter((item) => !item.assignedEmployeeId);
  const unassignedMaintenance = maintenanceOpen.filter((item) => !item.assignedMaintenanceEmployeeId);
  const delayedOrders = [...restaurantOrders, ...barOrders].filter((item) => ["LATE", "ABANDONED"].includes(item.operationalBucket));
  const pendingCashReviews = cashSessions.filter((item) => item.status === "EN_REVISION");
  const dailyPayments = payments.filter((item) => String(item.createdAt || item.paidAt || "").slice(0, 10) === today);
  const lowStock = dashboard.data?.lowStockProducts || [];
  const salesEnabled = (state.menuItems || []).filter((item) => item.salesEnabled === true).length;
  const attentionOpen = openRequests.length + standaloneCleaning.length;
  const pendingStockRequests = stockRequestQuery.data || [];

  const services = [
    { title: "Hospedaje", icon: BedDouble, value: `${metrics.occupiedRooms || 0} alojados`, main: `${metrics.availableRooms || 0} habitaciones libres`, detail: metrics.reservationsToday ? `${metrics.reservationsToday} llegada(s) programada(s) hoy` : "No hay llegadas programadas para hoy", warning: cleaningOpen.length ? `${cleaningOpen.length} habitación(es) en limpieza` : null, href: "/hotel", action: "Ver hospedaje" },
    { title: "Piscina", icon: Waves, value: `${activeBookings("PISCINA").length} reservas`, main: activeBookings("PISCINA").length ? "Ingresos y aforo listos para revisar" : "No hay ingresos programados hoy", detail: `${Number((state.services || []).find((item) => item.code === "PISCINA")?.capacity || 0)} personas por horario`, href: "/piscina/ingresos", action: "Ver piscina" },
    { title: "Mirador", icon: Sparkles, value: `${activeBookings("MIRADOR").length} reservas`, main: activeBookings("MIRADOR").length ? "Hay accesos por validar" : "No hay reservas programadas hoy", detail: `${Number((state.services || []).find((item) => item.code === "MIRADOR")?.capacity || 0)} personas por horario`, href: "/accesos", action: "Ver mirador" },
    { title: "Eventos", icon: CalendarCheck, value: `${activeEvents.length} activos`, main: activeEvents.length ? "Revisa agenda, saldos y coordinación" : "No hay eventos activos", detail: activeEvents.filter((item) => Number(item.balance || 0) > 0).length ? `${activeEvents.filter((item) => Number(item.balance || 0) > 0).length} evento(s) con saldo pendiente` : "Todos los eventos están al día", href: "/eventos/reservas", action: "Ver eventos" },
    { title: "Restaurante", icon: UtensilsCrossed, value: `${restaurantOrders.length} pedidos`, main: restaurantOrders.length ? `${readyOrders("RESTAURANTE").length} listo(s) para entregar` : "No hay pedidos activos", detail: restaurantOrders.length ? "Pedidos recibidos desde la experiencia del cliente" : "La cocina está al día", warning: stockIssues("RESTAURANTE").length ? `${stockIssues("RESTAURANTE").length} insumo(s) bajo mínimo` : null, href: "/control-gastronomico/restaurante", action: "Abrir restaurante" },
    { title: "Bar", icon: CookingPot, value: `${barOrders.length} pedidos`, main: barOrders.length ? `${readyOrders("BARTENDER").length} listo(s) para entregar` : "No hay pedidos activos", detail: barOrders.length ? "Bebidas recibidas desde la experiencia del cliente" : "El bar está al día", warning: stockIssues("BARTENDER").length ? `${stockIssues("BARTENDER").length} insumo(s) bajo mínimo` : null, href: "/control-gastronomico/bar", action: "Abrir bar" }
  ];

  const priorities = [
    { value: pendingCashReviews.length, label: "cierres de caja esperan tu revisión", action: "Revisar caja", href: "/admin-panel/caja-central", icon: Banknote },
    { value: unassignedCleaning.length, label: "solicitudes de limpieza esperan responsable", action: "Asignar personal", href: "/admin/limpieza/resumen", icon: SprayCan },
    { value: unassignedMaintenance.length, label: "mantenimientos esperan técnico", action: "Asignar técnico", href: "/incidencias", icon: Wrench },
    { value: delayedOrders.length, label: "pedidos están fuera de tiempo", action: "Ver operación", href: delayedOrders[0]?.area === "BARTENDER" ? "/control-gastronomico/bar" : "/control-gastronomico/restaurante", icon: BellRing },
    { value: lowStock.length, label: "insumos necesitan reposición", action: "Revisar inventario", href: "/admin/inventario", icon: PackageSearch },
    { value: pendingStockRequests.length, label: "solicitudes de insumos esperan aprobación", action: "Aprobar y enviar", href: "/admin/solicitudes-stock", icon: PackageSearch }
  ].filter((item) => item.value > 0);

  return <main className="superadmin-home space-y-7 pb-10">
    <header className="superadmin-home__hero"><div><p className="superadmin-home__eyebrow">PARK PLAZA · CENTRO DE CONTROL</p><h1>Park Plaza hoy</h1><p className="superadmin-home__subtitle">Revisa tus servicios, atiende lo pendiente y mantén toda la operación bajo control.</p></div><div className="superadmin-home__live"><span></span><div><strong>Información en vivo</strong><small>Actualizado {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</small></div></div></header>
    <section className="superadmin-home__snapshot" aria-label="Resumen del día"><Snapshot label="Cobrado hoy" value={money(dailyPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0))} detail="Todos los servicios" icon={CircleDollarSign}/><Snapshot label="Habitaciones ocupadas" value={metrics.occupiedRooms || 0} detail={`${metrics.availableRooms || 0} disponibles`} icon={BedDouble}/><Snapshot label="Pedidos por atender" value={restaurantOrders.length + barOrders.length} detail={`${restaurantOrders.length} Restaurante · ${barOrders.length} Bar`} icon={ChefHat}/><Snapshot label="Solicitudes abiertas" value={attentionOpen} detail="Limpieza, mantenimiento y conserjería" icon={ClipboardList}/></section>
    <section aria-labelledby="services-title"><div className="superadmin-home__section-heading"><p>OPERACIÓN DIARIA</p><h2 id="services-title">Tus servicios hoy</h2><span>Cada tarjeta explica qué ocurre y te lleva directamente al área correspondiente.</span></div><div className="superadmin-home__services">{services.map((service) => <ServiceCard key={service.title} service={service} />)}</div></section>
    <section className="superadmin-home__priority" aria-labelledby="priority-title"><div className="superadmin-home__priority-title"><div><p>ATENCIÓN DEL SUPERADMIN</p><h2 id="priority-title">Lo que necesita una decisión</h2><span>No son solo números: cada aviso indica qué ocurre y abre la acción correcta.</span></div><ShieldCheck aria-hidden="true" /></div>{priorities.length ? <div className="superadmin-home__priority-list">{priorities.map((item) => <PriorityCard key={item.label} item={item}/>)}</div> : <div className="superadmin-home__all-clear"><ShieldCheck/><div><strong>Todo está en orden</strong><span>No hay decisiones urgentes pendientes en este momento.</span></div></div>}</section>
    <section className="superadmin-home__lower-grid"><article className="superadmin-home__panel"><div className="superadmin-home__panel-icon"><ConciergeBell/></div><div><p>SOLICITUDES DE HUÉSPEDES</p><h2>Atención y coordinación</h2><span>El cliente solicita; Recepción asigna; Limpieza o Mantenimiento resuelve.</span></div><div className="superadmin-home__request-grid"><RequestItem label="Limpieza" value={cleaningOpen.length} detail={unassignedCleaning.length ? `${unassignedCleaning.length} sin responsable` : "Todo asignado"} href="/admin/limpieza/resumen" icon={SprayCan}/><RequestItem label="Mantenimiento" value={maintenanceOpen.length} detail={unassignedMaintenance.length ? `${unassignedMaintenance.length} sin técnico` : "Todo asignado"} href="/incidencias" icon={Wrench}/><RequestItem label="Conserjería" value={receptionOpen.length} detail={receptionOpen.length ? "Solicitudes por responder" : "Sin pendientes"} href="/reportes" icon={ConciergeBell}/></div><Link className="superadmin-home__text-link" to="/reportes">Coordinar solicitudes <ArrowRight size={16}/></Link></article><article className="superadmin-home__panel superadmin-home__panel--business"><div className="superadmin-home__panel-icon"><CircleDollarSign/></div><div><p>CONTROL DEL NEGOCIO</p><h2>Dinero e inventario</h2><span>Lo esencial para mantener los servicios disponibles y vender sin interrupciones.</span></div><div className="superadmin-home__business-grid"><BusinessItem label="Pagos pendientes" value={metrics.pendingPayments || 0}/><BusinessItem label="Productos en venta" value={`${salesEnabled} de ${(state.menuItems || []).length}`}/><BusinessItem label="Insumos bajo mínimo" value={lowStock.length}/><BusinessItem label="Rendiciones por revisar" value={pendingCashReviews.length}/></div><div className="superadmin-home__panel-actions"><Link to="/pagos">Ver pagos <ArrowRight size={15}/></Link><Link to="/admin/inventario">Ver inventario <ArrowRight size={15}/></Link></div></article></section>
    <section className="superadmin-home__utilities" aria-labelledby="utilities-title"><div><p>ADMINISTRACIÓN</p><h2 id="utilities-title">Configuración y control del sistema</h2><span>Accesos de uso menos frecuente para mantener Park Plaza organizado y seguro.</span></div><div>{[["Precios y publicación", "/admin/comercial"], ["Carta y recetas", "/admin/alimentos-bebidas"], ["Compras y transferencias", "/compras"], ["Usuarios y permisos", "/usuarios"], ["Auditoría", "/auditoria"], ["Configuración", "/configuracion"]].map(([label, href]) => <Link key={href} to={href}>{label}<ArrowRight size={15}/></Link>)}</div></section>
  </main>;
}

function Snapshot({ label, value, detail, icon: Icon }) { return <article><span><Icon size={18}/></span><strong>{value}</strong><p>{label}</p><small>{detail}</small></article>; }
function ServiceCard({ service }) { const Icon = service.icon; return <article className={`superadmin-home__service ${service.warning ? "is-attention" : ""}`}><div className="superadmin-home__service-top"><span><Icon size={21}/></span><strong>{service.title}</strong></div><b>{service.value}</b><h3>{service.main}</h3><p>{service.detail}</p>{service.warning ? <div className="superadmin-home__service-warning"><BellRing size={14}/>{service.warning}</div> : null}<Link to={service.href}>{service.action}<ArrowRight size={16}/></Link></article>; }
function PriorityCard({ item }) { const Icon = item.icon; return <Link to={item.href}><span className="superadmin-home__priority-icon"><Icon size={20}/></span><strong>{item.value}</strong><p>{item.label}</p><small>{item.action}<ArrowRight size={14}/></small></Link>; }
function RequestItem({ label, value, detail, href, icon: Icon }) { return <Link to={href}><span><Icon size={17}/></span><strong>{value}</strong><p>{label}</p><small>{detail}</small></Link>; }
function BusinessItem({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function ErrorState({ error }) { return <div className="rounded-card border border-red-200 bg-red-50 p-5 text-red-700">No se pudo actualizar el centro de control: {error?.message || "Error desconocido"}</div>; }
function money(value) { return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
