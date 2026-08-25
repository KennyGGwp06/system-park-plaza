import { AlertTriangle, ArrowRightLeft, ChefHat, ClipboardList, PackageCheck, RefreshCw, Scale, ShoppingCart, UtensilsCrossed, Wine } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, PageHeader } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";

const money = (value) => Number(value || 0).toLocaleString("es-PE", { style: "currency", currency: "PEN" });

export function FoodBeverageControlPage() {
  const restaurant = useFetch("/restaurante", { initialData: [], pollInterval: 10000 });
  const bar = useFetch("/bartender", { initialData: [], pollInterval: 10000 });
  const sessions = useFetch("/operational-inventory/sessions", { initialData: [], pollInterval: 15000 });
  const inventory = useFetch("/inventory-admin/dashboard", { initialData: { metrics: {}, alerts: {} }, pollInterval: 15000 });

  if (restaurant.loading || bar.loading || sessions.loading || inventory.loading) return <LoadingSpinner label="Cargando control de alimentos y bebidas..." />;

  const restaurantOrders = Array.isArray(restaurant.data) ? restaurant.data : [];
  const barOrders = Array.isArray(bar.data) ? bar.data : [];
  const shiftSessions = Array.isArray(sessions.data) ? sessions.data : [];
  const metrics = inventory.data?.metrics || {};
  const alerts = inventory.data?.alerts || {};
  const liveOrders = [...restaurantOrders, ...barOrders].filter((order) => !["ENTREGADO", "CANCELADO"].includes(order.status));
  const paidPending = liveOrders.filter((order) => order.status === "PENDIENTE" && order.paymentStatus === "PAGADO");
  const ready = liveOrders.filter((order) => order.status === "LISTO");
  const activeSessions = shiftSessions.filter((session) => ["OPEN", "OPERATING", "COUNTING", "REOPENED"].includes(session.status));
  const pendingClosures = shiftSessions.filter((session) => ["SUBMITTED", "OBSERVED"].includes(session.status));
  const critical = Array.isArray(alerts.critical) ? alerts.critical : [];

  const reloadAll = () => Promise.all([restaurant.reload(), bar.reload(), sessions.reload(), inventory.reload()]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrador / alimentos y bebidas"
        title="Control de Restaurante y Bar"
        description="Desde aquí abasteces, defines recetas y precios, supervisas pedidos y apruebas los cierres. El personal solo opera su propia estación."
        actions={<Button icon={RefreshCw} variant="secondary" onClick={reloadAll}>Actualizar</Button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Pedidos pagados por aceptar" value={paidPending.length} tone="amber" href="/admin/restaurante/pedidos" />
        <Metric label="Pedidos listos para entrega" value={ready.length} tone="blue" href="/admin/restaurante/pedidos" />
        <Metric label="Turnos operativos activos" value={activeSessions.length} tone="green" href="/inventario/turnos" />
        <Metric label="Cierres para revisar" value={pendingClosures.length} tone={pendingClosures.length ? "red" : "slate"} href="/inventario/turnos" />
        <Metric label="Costo de alimentos + bebidas" value={money(Number(metrics.food || 0) + Number(metrics.beverage || 0))} tone="slate" href="/inventario/recetas" compact />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ControlCard icon={UtensilsCrossed} title="Carta, precios y recetas" description="Platos, bebidas, tamaños, precios, tiempos y gramajes oficiales. Una receta activa determina disponibilidad y consumo." links={[
          ["Administrar carta e insumos", "/inventario"],
          ["Recetas técnicas", "/inventario/recetas"],
          ["Precios y tarifas", "/admin/comercial"]
        ]} />
        <ControlCard icon={ShoppingCart} title="Comprar y abastecer" description="La compra entra al almacén general solo después de la recepción física; desde allí se transfiere a Cocina o Bar." links={[
          ["Nueva compra o recepción", "/compras"],
          ["Transferir a Restaurante / Bar", "/transferencias"],
          ["Ver stock central", "/admin/inventario"]
        ]} />
        <ControlCard icon={Scale} title="Producción, porciones y lotes" description="Convierte materia prima en productos utilizables, registra rendimiento y prepara porciones con peso, fecha y vencimiento." links={[
          ["Transformar y porcionar", "/inventario/produccion"],
          ["Catálogo y unidades", "/inventario/catalogo"],
          ["Control de botellas", "/bartender/botellas"]
        ]} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-park-green-soft text-park-green"><ClipboardList size={20} /></span><div><h2 className="font-black text-park-dark">Operación en vivo</h2><p className="mt-1 text-sm text-park-muted">Los pedidos solo llegan a la estación cuando están pagados y el consumo se confirma al entregar.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AreaSummary icon={ChefHat} title="Restaurante" orders={restaurantOrders} href="/admin/restaurante/resumen" />
            <AreaSummary icon={Wine} title="Bar" orders={barOrders} href="/admin/bartender/resumen" />
          </div>
        </article>

        <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle size={20} /></span><div><h2 className="font-black text-park-dark">Prioridades de control</h2><p className="mt-1 text-sm text-park-muted">Revisa primero aquello que puede impedir una venta o afectar el cierre.</p></div></div>
          <div className="mt-4 space-y-2">
            <Priority href="/admin/inventario" label="Productos con stock crítico" value={critical.length} />
            <Priority href="/inventario/turnos" label="Cierres pendientes de aprobación" value={pendingClosures.length} />
            <Priority href="/admin/restaurante/pedidos" label="Pedidos pagados sin aceptar" value={paidPending.length} />
          </div>
        </article>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black text-park-dark">Cierre y trazabilidad</h2><p className="mt-1 text-sm text-park-muted">El relevo toma como apertura el conteo físico del turno anterior. Las diferencias, mermas y ajustes quedan auditados.</p></div><Button as={Link} to="/inventario/turnos" icon={ArrowRightLeft}>Revisar cierres</Button></div>
        {!activeSessions.length && !pendingClosures.length ? <div className="mt-4"><EmptyState title="No hay turnos por revisar" description="Cuando Restaurante o Bar abran, envíen o cierren un turno, aparecerá aquí." /></div> : <div className="mt-4 grid gap-2 md:grid-cols-2">{[...activeSessions, ...pendingClosures].slice(0, 6).map((session) => <Link key={session.id} to="/inventario/turnos" className="flex items-center justify-between rounded-lg bg-park-bg p-3 text-sm hover:bg-park-green-soft"><span><strong className="text-park-dark">{session.area === "RESTAURANTE" ? "Restaurante" : "Bar"}</strong><span className="text-park-muted"> · {session.shift}</span></span><span className="font-bold text-park-dark">{session.statusLabel || session.status}</span></Link>)}</div>}
      </section>
    </div>
  );
}

function Metric({ label, value, href, tone, compact = false }) {
  const tones = { amber: "border-amber-200", blue: "border-blue-200", green: "border-emerald-200", red: "border-red-300", slate: "border-park-border" };
  return <Link to={href} className={`rounded-card border bg-white p-4 shadow-card transition hover:border-park-green ${tones[tone] || tones.slate}`}><p className={`${compact ? "text-xl" : "text-2xl"} font-black text-park-dark`}>{value}</p><p className="mt-1 text-sm font-semibold text-park-muted">{label}</p></Link>;
}

function ControlCard({ icon: Icon, title, description, links }) {
  return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><span className="grid h-11 w-11 place-items-center rounded-xl bg-park-bg text-park-green"><Icon size={21} /></span><h2 className="mt-4 font-black text-park-dark">{title}</h2><p className="mt-1 min-h-12 text-sm text-park-muted">{description}</p><div className="mt-4 grid gap-2">{links.map(([label, href]) => <Link key={href} to={href} className="rounded-lg border border-park-border px-3 py-2 text-sm font-semibold text-park-dark hover:border-park-green hover:bg-park-green-soft">{label}</Link>)}</div></article>;
}

function AreaSummary({ icon: Icon, title, orders, href }) {
  const active = orders.filter((order) => !["ENTREGADO", "CANCELADO"].includes(order.status));
  const delivered = orders.filter((order) => order.status === "ENTREGADO").length;
  return <Link to={href} className="rounded-lg border border-park-border p-3 hover:border-park-green hover:bg-park-bg"><div className="flex items-center gap-2"><Icon size={18} className="text-park-green" /><strong className="text-park-dark">{title}</strong></div><p className="mt-3 text-2xl font-black text-park-dark">{active.length}</p><p className="text-xs text-park-muted">pedidos activos · {delivered} entregados</p></Link>;
}

function Priority({ href, label, value }) {
  return <Link to={href} className="flex items-center justify-between rounded-lg bg-park-bg p-3 hover:bg-park-green-soft"><span className="text-sm font-semibold text-park-dark">{label}</span><strong className={value ? "text-park-danger" : "text-park-green"}>{value}</strong></Link>;
}
