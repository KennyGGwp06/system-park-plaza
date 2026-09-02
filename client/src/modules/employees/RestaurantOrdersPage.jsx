import { useState } from "react";
import { AlertCircle, ChefHat, CheckCircle2, Clock3, MapPin, Play, RefreshCw, UtensilsCrossed } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { api } from "../../services/api";

const columns = [
  { status: "PENDIENTE", title: "Nuevos", help: "Acepta o rechaza", next: "EN_COCINA", action: "Aceptar pedido" },
  { status: "EN_COCINA", title: "Aceptados", help: "Listos para iniciar", next: "PREPARANDO", action: "Comenzar preparación" },
  { status: "PREPARANDO", title: "Preparando", help: "Pedidos en cocina", next: "LISTO", action: "Marcar como listo" },
  { status: "LISTO", title: "Listos", help: "Esperan entrega", next: "ENTREGADO", action: "Confirmar entrega" }
];

export function RestaurantOrdersPage() {
  const { data = [], loading, error, reload } = useFetch("/restaurante", { initialData: [], realtime: true, pollInterval: 15000 });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState("");
  const active = data.filter((order) => columns.some((column) => column.status === order.status));

  async function change(order, status) {
    if (status === "CANCELADO" && !window.confirm(`¿Rechazar el pedido ${order.code}? Esta acción no se puede deshacer.`)) return;
    setBusy(order.id);
    setMessage("");
    try {
      await api(`/restaurante/${order.id}/status`, { method: "PATCH", body: { status } });
      await reload();
    } catch (actionError) {
      setMessage(`No se pudo actualizar ${order.code}: ${actionError.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data.length) return <div className="p-10 text-center text-park-muted">Cargando pedidos de cocina...</div>;
  if (error && !data.length) return <Alert tone="danger" title="No se pudo cargar la cola">{error.message || String(error)}</Alert>;

  return <main className="space-y-6 py-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.14em] text-park-gold">Restaurante · flujo de cocina</p>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-black text-park-dark"><ChefHat className="text-park-gold" /> Pedidos de hoy</h1>
        <p className="mt-2 text-park-muted">Avanza cada pedido de izquierda a derecha. El inventario se descuenta al confirmar la entrega.</p>
      </div>
      <Button variant="secondary" icon={RefreshCw} onClick={reload} disabled={Boolean(busy)}>Actualizar</Button>
    </header>

    {message ? <Alert tone="danger" title="No se completó la acción"><span className="flex items-center gap-2"><AlertCircle size={18} />{message}</span></Alert> : null}

    <section className="grid gap-4 xl:grid-cols-4" aria-label="Flujo de pedidos de Restaurante">
      {columns.map((column, index) => {
        const orders = active.filter((order) => order.status === column.status);
        return <div className="min-w-0 rounded-card border border-park-border bg-park-bg/70 p-3" key={column.status}>
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div><p className="font-black text-park-dark">{index + 1}. {column.title}</p><small className="text-park-muted">{column.help}</small></div>
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white px-2 text-sm font-black text-park-green shadow-sm">{orders.length}</span>
          </div>
          <div className="space-y-3">
            {orders.map((order) => <OrderCard key={order.id} order={order} column={column} busy={busy === order.id} onChange={change} />)}
            {!orders.length ? <div className="rounded-xl border border-dashed border-park-border bg-white/70 p-6 text-center text-sm text-park-muted">Sin pedidos en esta etapa</div> : null}
          </div>
        </div>;
      })}
    </section>
  </main>;
}

function OrderCard({ order, column, busy, onChange }) {
  const location = order.roomId ? `Habitación ${order.roomId}` : order.experienceCode ? `Servicio ${order.experienceCode}` : order.eventId ? `Evento ${order.eventId}` : "Entrega en el local";
  const elapsed = elapsedLabel(order.createdAt);
  return <article className="rounded-xl border border-park-border bg-white p-4 shadow-sm transition-shadow hover:shadow-card">
    <div className="flex items-start justify-between gap-2">
      <div><strong className="text-park-dark">{order.code}</strong><p className="mt-1 flex items-center gap-1 text-xs text-park-muted"><Clock3 size={13} /> {elapsed}</p></div>
      <span className="rounded-full bg-park-green-soft px-2.5 py-1 text-[11px] font-black text-park-green">{column.title}</span>
    </div>
    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-park-dark"><MapPin size={14} className="text-park-gold" />{location}</p>
    <div className="my-3 space-y-2">{(order.items || []).map((item, index) => <div className="flex gap-2 border-b border-park-border pb-2 text-sm last:border-0" key={`${item.menuItemId || item.name}-${index}`}><b className="text-park-green">{item.quantity}×</b><span>{item.name}</span>{item.size ? <small className="ml-auto text-park-muted">{item.size}</small> : null}</div>)}</div>
    {order.notes ? <p className="mb-3 rounded-lg bg-park-gold-soft p-2.5 text-xs text-park-dark"><b>Nota:</b> {order.notes}</p> : null}
    <Button className="w-full" icon={column.status === "LISTO" ? CheckCircle2 : column.status === "PREPARANDO" ? UtensilsCrossed : Play} loading={busy} onClick={() => onChange(order, column.next)}>{column.action}</Button>
    {column.status === "LISTO" ? <p className="mt-2 text-center text-[11px] text-park-muted">Esta acción registra el consumo real del inventario.</p> : null}
    {column.status === "PENDIENTE" ? <Button className="mt-2 w-full" variant="ghost" disabled={busy} onClick={() => onChange(order, "CANCELADO")}>Rechazar pedido</Button> : null}
  </article>;
}

function elapsedLabel(createdAt) {
  if (!createdAt) return "recién recibido";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  return minutes < 1 ? "recién recibido" : `hace ${minutes} min`;
}
