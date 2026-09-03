import { ChefHat, Clock3, RefreshCw, Wine } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, PageHeader } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../context/AuthContext";

const labels = {
  RESTAURANTE: { title: "Monitor de Restaurante", description: "Vista de supervisión. La estación de cocina es la única que prepara y entrega pedidos.", icon: ChefHat },
  BARTENDER: { title: "Monitor de Bar", description: "Vista de supervisión. La estación de Bar es la única que prepara y entrega bebidas.", icon: Wine }
};

export function GastronomyMonitorPage({ area }) {
  const { user } = useAuth();
  const config = labels[area] || labels.RESTAURANTE;
  const Icon = config.icon;
  const { data: orders = [], loading, error, reload } = useFetch(area === "BARTENDER" ? "/bartender" : "/restaurante", { initialData: [], realtime: true, pollInterval: 15000 });
  if (loading) return <LoadingSpinner label={`Cargando ${config.title.toLowerCase()}...`} />;
  if (error) return <div className="rounded-card border border-red-200 bg-red-50 p-5 text-red-700">No se pudo cargar el monitor: {error.message}</div>;
  const active = orders.filter((order) => !["ENTREGADO", "CANCELADO"].includes(order.status));
  const ready = active.filter((order) => order.status === "LISTO").length;
  const delayed = active.filter((order) => Number(order.elapsedMinutes || 0) >= 20).length;
  return <div className="space-y-5">
    <PageHeader eyebrow="Supervisión gastronómica" title={config.title} description={config.description} actions={<Button icon={RefreshCw} variant="secondary" onClick={reload}>Actualizar</Button>} />
    <section className="grid gap-3 sm:grid-cols-3">
      <Metric label="Pedidos activos" value={active.length} icon={Icon} />
      <Metric label="Listos para entrega" value={ready} icon={ChefHat} />
      <Metric label="Revisar tiempo" value={delayed} icon={Clock3} />
    </section>
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-black text-park-dark">Cola en tiempo real</h2><p className="text-sm text-park-muted">Solo lectura: la operación se realiza desde la estación asignada.</p></div><Icon className="text-park-green" /></div>
      {!active.length ? <EmptyState title="No hay pedidos activos" description="Los nuevos pedidos aparecerán aquí cuando estén autorizados." /> : <div className="space-y-2">{active.map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-park-border bg-park-bg p-4"><div><strong className="text-park-dark">{order.code}</strong><p className="mt-1 text-sm text-park-muted">{(order.items || []).map((item) => `${item.quantity}× ${item.name}`).join(" · ") || "Sin detalle"}</p><small className="text-park-muted">{order.destination?.label || order.roomId || "Destino por confirmar"}</small></div><div className="flex items-center gap-3"><span className="text-xs font-bold text-park-muted">{Number(order.elapsedMinutes || 0)} min</span><StatusBadge value={order.status} /></div></article>)}</div>}
    </section>
    <Link to={user?.role === "SUPERADMIN" ? "/admin/alimentos-bebidas" : "/admin-panel"} className="inline-flex rounded-xl border border-park-border bg-white px-4 py-3 text-sm font-black text-park-dark shadow-card transition hover:border-park-green hover:bg-park-green-soft">{user?.role === "SUPERADMIN" ? "Volver al control gastronómico" : "Volver al Centro de Recepción"}</Link>
  </div>;
}

function Metric({ label, value, icon: Icon }) { return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><span className="grid h-9 w-9 place-items-center rounded-lg bg-park-green-soft text-park-green"><Icon size={18} /></span><strong className="mt-3 block text-2xl text-park-dark">{value}</strong><p className="text-sm font-black text-park-muted">{label}</p></article>; }
