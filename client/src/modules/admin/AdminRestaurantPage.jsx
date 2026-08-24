import { AlertTriangle, CheckCircle2, ChefHat, Clock, Eye, Flame, PackageCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, PageHeader, Tabs } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";

export function AdminRestaurantPage({ view = "resumen" }) {
  const { data: ordersData, loading } = useFetch("/restaurante", { initialData: [] });
  const { data: reportsData } = useFetch("/reports?area=RESTAURANTE", { initialData: { reports: [], summary: {} } });
  const { data: auditData } = useFetch("/auditoria", { initialData: [] });
  const [status, setStatus] = useState(statusByView(view) || "TODOS");
  const [selected, setSelected] = useState(null);
  const orders = Array.isArray(ordersData) ? ordersData : [];
  const reports = reportsData?.reports || [];
  const audits = Array.isArray(auditData) ? auditData.filter((item) => item.module === "PEDIDOS" || item.module === "RESTAURANTE") : [];
  const filteredOrders = useMemo(() => filterOrders(view, orders, status), [orders, status, view]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Administrador / Restaurante" title={pageTitle(view)} description="Supervision de pedidos, cocina, preparacion, entregas e incidencias." />
      {view === "resumen" ? <RestaurantSummary audits={audits} orders={orders} reports={reports} onSelect={setSelected} /> : null}
      {["pedidos", "cocina", "preparando", "listos", "entregados"].includes(view) ? (
        <>
          {view === "pedidos" ? <Tabs tabs={["TODOS", "PENDIENTE", "EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"].map((item) => ({ value: item, label: item === "TODOS" ? "Todos" : item.replaceAll("_", " ") }))} value={status} onChange={setStatus} /> : null}
          <OrdersTable orders={filteredOrders} onSelect={setSelected} />
        </>
      ) : null}
      {view === "incidencias" ? <IncidentsTable reports={reports} /> : null}
      {selected ? <OrderDetail order={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function RestaurantSummary({ orders, reports, audits, onSelect }) {
  const counts = countBy(orders, "status");
  const deliveredToday = orders.filter((item) => item.status === "ENTREGADO" && isToday(item.updatedAt)).length;
  const recent = orders.slice(0, 8);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric icon={Clock} label="Pendientes" tone="gold" value={counts.PENDIENTE || 0} />
        <Metric icon={ChefHat} label="En cocina" tone="orange" value={counts.EN_COCINA || 0} />
        <Metric icon={Flame} label="Preparando" tone="blue" value={counts.PREPARANDO || 0} />
        <Metric icon={CheckCircle2} label="Listos" tone="purple" value={counts.LISTO || 0} />
        <Metric icon={PackageCheck} label="Entregados hoy" tone="green" value={deliveredToday} />
        <Metric icon={AlertTriangle} label="Incidencias" tone="red" value={reports.length} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Actividad / pedidos recientes">
          <OrdersTable compact orders={recent} onSelect={onSelect} />
        </Panel>
        <Panel title="Incidencias recientes">
          {reports.length ? reports.slice(0, 4).map((report) => (
            <div className="mb-3 rounded-card border border-park-border bg-park-bg p-3" key={report.id}>
              <div className="flex justify-between gap-3"><p className="font-black text-park-black">{report.code}</p><StatusBadge value={report.priority} /></div>
              <p className="mt-1 text-sm text-park-muted">{report.description}</p>
            </div>
          )) : <EmptyState title="Sin incidencias" description="No hay problemas reportados desde restaurante." />}
        </Panel>
      </section>
      <Panel title="Auditoria reciente">
        {audits.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-park-muted"><tr><th className="py-2">Actividad</th><th>Usuario</th><th>Fecha</th></tr></thead>
              <tbody className="divide-y divide-park-border">
                {audits.slice(0, 6).map((item) => (
                  <tr key={item.id}><td className="py-3 font-semibold text-park-black">{item.detail || item.action}</td><td>{item.user ? `${item.user.firstName} ${item.user.lastName}` : "Sistema"}</td><td>{formatDateTime(item.createdAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Sin auditoria" description="La actividad del restaurante aparecera aqui." />}
      </Panel>
    </>
  );
}

function OrdersTable({ orders, onSelect, compact = false }) {
  if (!orders.length) return <EmptyState title="Sin pedidos" description="No hay pedidos para esta vista." />;
  return (
    <section className={compact ? "" : "rounded-card border border-park-border bg-white p-5 shadow-card"}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-park-muted"><tr><th className="py-3">Codigo</th><th>Habitacion</th><th>Producto</th><th>Cantidad</th><th>Total</th><th>Estado</th><th>Responsable</th><th>Hora</th><th>Ver</th></tr></thead>
          <tbody className="divide-y divide-park-border">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="py-3 font-black text-park-black">{order.code}</td>
                <td>{order.stay?.room?.number || order.roomId || "Piscina"}</td>
                <td>{itemsLabel(order)}</td>
                <td>{quantityLabel(order)}</td>
                <td>S/ {Number(order.total).toFixed(2)}</td>
                <td><StatusBadge value={order.status} /></td>
                <td>{order.createdBy?.firstName || order.createdBy || "No registrado"}</td>
                <td>{formatDateTime(order.updatedAt || order.createdAt)}</td>
                <td><Button className="h-8 w-8 px-0" icon={Eye} onClick={() => onSelect(order)} size="sm" type="button" variant="secondary" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IncidentsTable({ reports }) {
  if (!reports.length) return <EmptyState title="Sin incidencias" description="No hay reportes operativos del restaurante." />;
  return (
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-park-muted"><tr><th className="py-3">Codigo</th><th>Tipo</th><th>Descripcion</th><th>Prioridad</th><th>Responsable</th><th>Fecha</th><th>Estado</th></tr></thead>
          <tbody className="divide-y divide-park-border">
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="py-3 font-black text-park-black">{report.code}</td>
                <td>{report.type?.replaceAll("_", " ")}</td>
                <td>{report.description}</td>
                <td><StatusBadge value={report.priority} /></td>
                <td>{report.reportedBy ? `${report.reportedBy.firstName} ${report.reportedBy.lastName}` : "No registrado"}</td>
                <td>{formatDateTime(report.createdAt)}</td>
                <td><StatusBadge value={report.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderDetail({ order, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 p-4">
      <aside className="ml-auto h-full max-w-md overflow-auto rounded-card bg-white p-5 shadow-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-park-gold">Detalle del pedido</p>
            <h3 className="font-sans text-xl font-black text-park-black">{order.code}</h3>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-button border border-park-border text-park-muted hover:text-park-black" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="mt-3"><StatusBadge value={order.status} /></div>
        <Panel title="Informacion general">
          <DetailRow label="Habitacion" value={order.stay?.room?.number || order.roomId || "Piscina"} />
          <DetailRow label="Producto" value={itemsLabel(order)} />
          <DetailRow label="Cantidad" value={quantityLabel(order)} />
          <DetailRow label="Total" value={`S/ ${Number(order.total).toFixed(2)}`} />
          <DetailRow label="Responsable" value={order.createdBy?.firstName || "No registrado"} />
          <DetailRow label="Pedido" value={formatDateTime(order.createdAt)} />
          <DetailRow label="Actualizado" value={formatDateTime(order.updatedAt)} />
          <DetailRow label="Observaciones" value={order.notes} />
        </Panel>
        <Panel title="Tiempos del pedido">
          {historyFor(order).map((item) => (
            <div className="flex gap-3 pb-3 last:pb-0" key={item}>
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-park-green" />
              <p className="text-sm font-semibold text-park-black">{item}</p>
            </div>
          ))}
        </Panel>
      </aside>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  const tones = {
    gold: "bg-park-gold-soft text-park-gold",
    orange: "bg-orange-50 text-orange-700",
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    green: "bg-park-green-soft text-park-green",
    red: "bg-red-50 text-park-danger"
  };
  return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><span className={`grid h-11 w-11 place-items-center rounded-button ${tones[tone]}`}><Icon size={20} /></span><p className="mt-4 text-sm font-semibold text-park-muted">{label}</p><strong className="font-display text-[28px] font-semibold text-park-dark">{value}</strong></article>;
}

function Panel({ title, children }) {
  return <section className="mt-5 rounded-card border border-park-border bg-white p-5 shadow-card"><h2 className="mb-4 font-sans text-lg font-black text-park-black">{title}</h2>{children}</section>;
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return <div className="mb-3 grid grid-cols-[110px_1fr] gap-3 text-sm last:mb-0"><span className="font-semibold text-park-muted">{label}</span><strong className="text-park-black">{value}</strong></div>;
}

function filterOrders(view, orders, status) {
  const fixed = statusByView(view);
  if (fixed) return orders.filter((order) => order.status === fixed);
  if (status !== "TODOS") return orders.filter((order) => order.status === status);
  return orders;
}

function statusByView(view) {
  return { cocina: "EN_COCINA", preparando: "PREPARANDO", listos: "LISTO", entregados: "ENTREGADO" }[view];
}

function historyFor(order) {
  const steps = ["Pedido recibido"];
  if (["EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"].includes(order.status)) steps.push("En cocina");
  if (["PREPARANDO", "LISTO", "ENTREGADO"].includes(order.status)) steps.push("Inicio preparacion");
  if (["LISTO", "ENTREGADO"].includes(order.status)) steps.push("Listo");
  if (order.status === "ENTREGADO") steps.push("Entregado");
  return steps;
}

function itemsLabel(order) {
  return order.items?.map((item) => item.name).join(", ") || "Sin productos";
}

function quantityLabel(order) {
  return order.items?.map((item) => item.quantity).reduce((sum, value) => sum + Number(value || 0), 0) || 0;
}

function countBy(items, key) {
  return items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] || 0) + 1 }), {});
}

function pageTitle(view) {
  const titles = {
    resumen: "Restaurante - Resumen",
    pedidos: "Restaurante - Pedidos",
    cocina: "Restaurante - En cocina",
    preparando: "Restaurante - Preparando",
    listos: "Restaurante - Listos",
    entregados: "Restaurante - Entregados",
    incidencias: "Restaurante - Incidencias"
  };
  return titles[view] || titles.resumen;
}

function formatDateTime(value) {
  if (!value) return "No registrado";
  return new Date(value).toLocaleString("es-PE");
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}
