import { Link } from "react-router-dom";
import { BedDouble, Building2, CalendarCheck, ClipboardCheck, DollarSign, LogIn, LogOut, RefreshCw, Users } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../context/AuthContext";

const salesColors = ["#1E7D4B", "#F5A623", "#2F80ED", "#8B5CF6", "#14B8A6"];

export function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch("/dashboard");
  if (loading) return <LoadingSpinner />;
  if (error) return <p className="rounded-card bg-park-danger-soft p-4 font-semibold text-park-danger">{error.message}</p>;

  const dashboardData = data;
  const metrics = dashboardData.metrics || {};
  const income = dashboardData.charts?.income || [];
  const salesByArea = dashboardData.charts?.salesByArea || [];
  const cleaning = dashboardData.modules?.cleaning || [];
  const orders = dashboardData.modules?.orders || [];
  const occupiedRooms = Number(metrics.occupiedRooms || 0);
  const availableRooms = Number(metrics.availableRooms || 0);
  const knownRooms = occupiedRooms + availableRooms;
  const occupancy = knownRooms ? Math.round((occupiedRooms / knownRooms) * 100) : 0;
  const lastUpdate = new Date().toLocaleString("es-PE");
  const alertItems = buildAlerts(dashboardData);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-card border border-park-border bg-white p-6 shadow-card">
        <div className="absolute -right-5 -top-10 text-park-green/10"><Building2 size={190} strokeWidth={1} /></div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="relative flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-park-green text-white shadow-[0_10px_24px_rgba(30,111,214,.25)]"><Building2 size={25} /></span>
            <div><h2 className="font-display text-2xl font-bold text-park-dark">¡Buenas tardes, {user?.firstName || "Administrador"}!</h2>
            <p className="mt-1 text-sm text-park-muted">Resumen general de operaciones del Hotel Park Plaza.</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-park-muted">
            <span>Ultima actualizacion: {lastUpdate}</span>
            <Button icon={RefreshCw} variant="secondary" onClick={reload}>Actualizar</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <AdminMetric label="Ingresos del dia" value={money(metrics.incomeToday)} hint="Pagos registrados" icon={DollarSign} tone="green" />
          <AdminMetric label="Ocupacion" value={`${occupancy}%`} hint={`${occupiedRooms} ocupadas`} icon={BedDouble} tone="blue" />
          <AdminMetric label="Reservas hoy" value={metrics.reservationsToday || 0} hint="Entradas programadas" icon={CalendarCheck} tone="purple" />
          <AdminMetric label="Check-ins hoy" value={metrics.checkInsToday || 0} hint="Llegadas registradas" icon={LogIn} tone="gold" />
          <AdminMetric label="Check-outs hoy" value={metrics.checkOutsToday || 0} hint="Salidas registradas" icon={LogOut} tone="teal" />
          <AdminMetric label="No show" value={metrics.noShow || 0} hint="Reservas sin llegada" icon={Users} tone="red" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr_0.9fr]">
        <Panel title="Ingresos" action={<span className="rounded-button border border-park-border px-3 py-2 text-xs font-black text-park-muted">Hoy</span>}>
          <div className="h-72">
            {income.length ? (
              <SimpleIncomeChart data={income} />
            ) : (
              <EmptyState title="Sin ingresos registrados hoy" description="Los pagos del dia apareceran en este grafico." />
            )}
          </div>
        </Panel>

        <Panel title="Ventas por area">
          {salesByArea.length ? (
            <div className="grid gap-4 md:grid-cols-[150px_1fr] xl:grid-cols-1 2xl:grid-cols-[150px_1fr]">
              <SalesDonut data={salesByArea} />
              <div className="space-y-3">
                {salesByArea.map((item, index) => (
                  <div className="flex items-center justify-between gap-3 text-sm" key={item.area}>
                    <span className="flex items-center gap-2 text-park-muted"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: salesColors[index % salesColors.length] }} />{item.area}</span>
                    <strong className="text-park-dark">{money(item.total)}</strong>
                  </div>
                ))}
                <div className="border-t border-park-border pt-3">
                  <div className="flex justify-between text-sm font-black text-park-dark"><span>Total</span><span>{money(metrics.incomeToday)}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="Sin ventas por area" description="Cuando existan pagos se agruparan aqui." />
          )}
        </Panel>

        <Panel title="Ocupacion general">
          <div className="space-y-4">
            <ProgressRow label="Habitaciones ocupadas" value={occupiedRooms} total={knownRooms} />
            <ProgressRow label="Habitaciones libres" value={availableRooms} total={knownRooms} />
            <ProgressRow label="Huespedes hospedados" value={metrics.hostedGuests || 0} total={Math.max(metrics.hostedGuests || 0, knownRooms)} />
            <div className="border-t border-park-border pt-3">
              <div className="flex justify-between text-sm font-black text-park-dark"><span>Total ocupacion</span><span>{occupancy}%</span></div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.8fr_0.9fr]">
        <Panel title="Atencion requerida" titleClassName="text-park-danger">
          {alertItems.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-park-muted">
                  <tr><th className="py-3">Area</th><th>Problema</th><th>Prioridad</th><th>Accion</th></tr>
                </thead>
                <tbody className="divide-y divide-park-border">
                  {alertItems.map((item) => (
                    <tr key={item.key}>
                      <td className="py-3 font-semibold text-park-dark">{item.area}</td>
                      <td className="py-3 text-park-muted">{item.problem}</td>
                      <td className="py-3"><StatusBadge value={item.priority} /></td>
                      <td className="py-3"><Link className="rounded-button border border-park-border px-3 py-1.5 text-xs font-black text-park-green" to={item.href}>Ver</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Sin atenciones criticas" description="No hay incidencias, pedidos o stock bajo pendiente." />
          )}
        </Panel>

        <Panel title="Resumen operativo">
          <div className="space-y-3">
            <SummaryItem icon={Users} label="Huespedes hospedados" value={metrics.hostedGuests || 0} helper="Actualmente" />
            <SummaryItem icon={BedDouble} label="Habitaciones ocupadas" value={occupiedRooms} helper={`${availableRooms} libres`} />
            <SummaryItem icon={ClipboardCheck} label="Pendientes de limpieza" value={cleaning.length} helper="Habitaciones" />
            <SummaryItem icon={CalendarCheck} label="Eventos proximos" value={dashboardData.upcomingEvents?.length || 0} helper="Programados" />
          </div>
        </Panel>

        <Panel title="Proximos eventos" action={<Link className="text-xs font-black text-park-danger" to="/eventos/calendario">Ver todos</Link>}>
          {dashboardData.upcomingEvents?.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-park-muted">
                  <tr><th className="py-3">Hora</th><th>Cliente</th><th>Espacio</th><th>Estado</th></tr>
                </thead>
                <tbody className="divide-y divide-park-border">
                  {dashboardData.upcomingEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="py-3 font-semibold">{time(event.startsAt)}</td>
                      <td className="py-3">{clientName(event.client)}</td>
                      <td className="py-3">{event.space?.name || "-"}</td>
                      <td className="py-3"><StatusBadge value={event.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Sin eventos proximos" description="Los eventos programados apareceran aqui." />
          )}
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Pedidos operativos">
          {orders.length ? (
            <ul className="divide-y divide-park-border">
              {orders.map((order) => <li className="flex items-center justify-between gap-3 py-3 text-sm" key={order.id}><span className="font-semibold text-park-dark">{order.code} - {order.area}</span><StatusBadge value={order.status} /></li>)}
            </ul>
          ) : (
            <EmptyState title="Sin pedidos pendientes" description="No hay pedidos activos en restaurante o bartender." />
          )}
        </Panel>
        <Panel title="Actividad reciente">
          {dashboardData.recentActivity?.length ? (
            <ul className="divide-y divide-park-border">
              {dashboardData.recentActivity.map((item) => <li className="py-3 text-sm" key={item.id}><strong className="text-park-dark">{item.module}</strong><span className="block text-park-muted">{item.action} - {item.detail || "Sin detalle"}</span></li>)}
            </ul>
          ) : (
            <EmptyState title="Sin actividad reciente" description="La auditoria reciente aparecera aqui." />
          )}
        </Panel>
      </section>
    </div>
  );
}

function buildAlerts(data) {
  const lowStock = (data.lowStock || []).map((product) => ({
    key: `stock-${product.id}`,
    area: product.area || "Inventario",
    problem: `${product.name} con stock ${Number(product.stock)}`,
    priority: Number(product.stock) <= 0 ? "CRITICA" : "ALTA",
    href: "/inventario"
  }));
  const cleaning = (data.modules?.cleaning || []).map((task) => ({
    key: `cleaning-${task.id}`,
    area: `Habitacion ${task.room?.number || "-"}`,
    problem: `Limpieza ${String(task.status).replaceAll("_", " ").toLowerCase()}`,
    priority: task.priority || "MEDIA",
    href: "/limpieza/pendientes"
  }));
  const orders = (data.modules?.orders || []).map((order) => ({
    key: `order-${order.id}`,
    area: order.area,
    problem: `Pedido ${order.code} ${String(order.status).replaceAll("_", " ").toLowerCase()}`,
    priority: order.status === "PENDIENTE" ? "MEDIA" : "BAJA",
    href: order.area === "BARTENDER" ? "/bartender/pendientes" : "/restaurante/pedidos"
  }));
  const incidents = data.metrics?.incidentsOpen ? [{
    key: "incidents-open",
    area: "Incidencias",
    problem: `${data.metrics.incidentsOpen} reportes abiertos`,
    priority: data.metrics.incidentsHighPriority ? "CRITICA" : "ALTA",
    href: "/reportes"
  }] : [];
  return [...incidents, ...lowStock, ...cleaning, ...orders].slice(0, 6);
}

function AdminMetric({ label, value, hint, icon: Icon, tone }) {
  const tones = {
    green: "bg-park-green-soft text-park-green",
    gold: "bg-park-gold-soft text-park-black",
    red: "bg-park-danger-soft text-park-danger",
    blue: "bg-sky-50 text-sky-700",
    purple: "bg-violet-50 text-violet-700",
    teal: "bg-teal-50 text-teal-700"
  };
  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <div className={`mb-3 grid h-11 w-11 place-items-center rounded-full ${tones[tone] || tones.green}`}>
        <Icon size={20} />
      </div>
      <p className="text-xs font-semibold text-park-muted">{label}</p>
      <strong className="mt-2 block font-display text-2xl font-semibold text-park-dark">{value}</strong>
      <span className="mt-2 block text-xs font-semibold text-park-muted">{hint}</span>
    </article>
  );
}

function Panel({ title, children, action, titleClassName = "text-park-dark" }) {
  return (
    <article className="min-w-0 rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={`font-sans text-lg font-black ${titleClassName}`}>{title}</h2>
        {action}
      </div>
      {children}
    </article>
  );
}

function ProgressRow({ label, value, total }) {
  const percent = total ? Math.round((Number(value || 0) / Number(total)) * 100) : 0;
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-sm">
        <span className="font-semibold text-park-dark">{label}</span>
        <span className="text-park-muted">{value} / {total || 0} - {percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-park-bg">
        <div className="h-2 rounded-full bg-park-green" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value, helper }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-card border border-park-border bg-park-bg p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-park-green-soft text-park-green"><Icon size={18} /></span>
        <span className="text-sm font-semibold text-park-dark">{label}</span>
      </div>
      <div className="text-right">
        <strong className="block font-display text-xl font-semibold text-park-dark">{value}</strong>
        <span className="text-xs text-park-muted">{helper}</span>
      </div>
    </div>
  );
}

function SimpleIncomeChart({ data }) {
  const highest = Math.max(...data.map((item) => Number(item.amount || 0)), 1);
  return <div className="flex h-full items-end gap-2 border-b border-park-border pt-8" aria-label="Ingresos del día">
    {data.map((item) => {
      const height = Math.max(5, Math.round((Number(item.amount || 0) / highest) * 100));
      return <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2" key={item.time} title={`${item.time}: ${money(item.amount)}`}>
        <span className="w-full rounded-t bg-park-green transition-[height]" style={{ height: `${height}%` }} />
        <small className="text-[10px] text-park-muted">{item.time}</small>
      </div>;
    })}
  </div>;
}

function SalesDonut({ data }) {
  const total = data.reduce((sum, item) => sum + Number(item.total || 0), 0) || 1;
  let offset = 0;
  const segments = data.map((item, index) => {
    const value = (Number(item.total || 0) / total) * 100;
    const segment = `${salesColors[index % salesColors.length]} ${offset}% ${offset + value}%`;
    offset += value;
    return segment;
  });
  return <div className="grid h-40 place-items-center">
    <div className="grid h-32 w-32 place-items-center rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }}>
      <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center text-xs font-black text-park-dark">{money(total)}</div>
    </div>
  </div>;
}

function money(value) {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function time(value) {
  return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function clientName(client) {
  return client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "-";
}
