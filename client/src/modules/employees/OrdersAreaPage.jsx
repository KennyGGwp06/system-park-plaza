import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChefHat, Clock, MapPin, PackageCheck, Scale, Wine, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, PageHeader, Select, Tabs } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const quantity = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 4 });
const activeStatuses = new Set(["PENDIENTE", "EN_COCINA", "PREPARANDO", "LISTO"]);

export function OrdersAreaPage({ area, embedded = false }) {
  const { can } = useAuth();
  const canEdit = can(area, "EDITAR");
  const [view, setView] = useState("ACTIVOS");
  const [toast, setToast] = useState("");
  const [failure, setFailure] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const isBar = area === "BARTENDER";
  const { data: orders = [], loading, reload } = useFetch(isBar ? "/bartender" : "/restaurante", { initialData: [] });
  const { data: products = [] } = useFetch("/reports/products?area=" + area, { initialData: [] });
  const filtered = useMemo(() => {
    const sorted = [...orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (view === "ACTIVOS") return sorted.filter((order) => activeStatuses.has(order.status));
    if (view === "LISTOS") return sorted.filter((order) => order.status === "LISTO");
    if (view === "ENTREGADOS") return sorted.filter((order) => order.status === "ENTREGADO");
    return sorted;
  }, [orders, view]);

  async function changeStatus(order, target, extra = {}) {
    setBusyId(order.id);
    setFailure("");
    try {
      await api((isBar ? "/bartender/" : "/restaurante/") + order.id + "/status", { method: "PATCH", body: { status: target, ...extra } });
      setToast(target === "ENTREGADO" ? order.code + " entregado. Insumos descontados del inventario." : target === "LISTO" ? order.code + " listo para entregar." : order.code + " actualizado.");
      await reload();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingSpinner />;
  const active = orders.filter((order) => activeStatuses.has(order.status));
  const Icon = isBar ? Wine : ChefHat;
  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      {!embedded ? <PageHeader
        eyebrow={isBar ? "Sistema independiente de Bar" : "Sistema independiente de Restaurante"}
        title={isBar ? "Pedidos y preparación de bebidas" : "Pedidos y preparación de platos"}
        description={isBar ? "Recetas, dosificación, inventario y entregas exclusivas del Bar." : "Recetas pesadas, inventario y entregas exclusivas de Cocina."}
        actions={<Button as={Link} to="/inventario" variant="secondary" icon={PackageCheck}>Inventario y cierre</Button>}
      /> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={Clock} label="Pedidos activos" value={active.length} />
        <Metric icon={Scale} label={isBar ? "Bebidas preparando" : "Platos preparando"} value={orders.filter((order) => ["EN_COCINA", "PREPARANDO"].includes(order.status)).length} />
        <Metric icon={CheckCircle2} label="Listos para entregar" value={orders.filter((order) => order.status === "LISTO").length} />
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-park-border bg-white p-4 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-balance text-lg font-black text-park-dark">Flujo en una sola pantalla</h2>
          <p className="text-pretty text-sm text-park-muted">{isBar ? "Recibir → Preparar → Listo y descontado → Entregar" : "Recibir → Aceptar → Preparar → Listo y descontado → Entregar"}</p>
        </div>
        <Tabs tabs={[{ value: "ACTIVOS", label: "Activos" }, { value: "LISTOS", label: "Listos" }, { value: "ENTREGADOS", label: "Entregados" }, { value: "TODOS", label: "Todos" }]} value={view} onChange={setView} />
      </section>

      {failure ? <Alert tone="danger" title="No se pudo actualizar el pedido">{failure}</Alert> : null}
      {!filtered.length ? <EmptyState icon={Icon} title="Sin pedidos en esta vista" description="Los pedidos nuevos aparecerán aquí automáticamente." /> : (
        <section className="grid gap-4 xl:grid-cols-2">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} area={area} products={products} canEdit={canEdit} busy={busyId === order.id} onAdvance={(target) => changeStatus(order, target)} onCancel={() => setCancelOrder(order)} />
          ))}
        </section>
      )}
      {cancelOrder ? <CancelOrderModal order={cancelOrder} onClose={() => setCancelOrder(null)} onConfirm={async (body) => { await changeStatus(cancelOrder, "CANCELADO", body); setCancelOrder(null); }} /> : null}
    </div>
  );
}

function OrderCard({ order, area, products, canEdit, busy, onAdvance, onCancel }) {
  const target = nextStatus(area, order.status);
  const destination = destinationFor(order);
  const { data: guide = { preparation: [], reservations: [], lines: [] }, loading: guideLoading } = useFetch(`/orders/${order.id}/inventory`, { initialData: { preparation: [], reservations: [], lines: [] } });
  return (
    <article className={"rounded-card border bg-white p-5 shadow-card " + (order.status === "LISTO" ? "border-park-green" : "border-park-border")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-park-dark">{order.code}</h2><StatusBadge value={order.status} /></div>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-park-green"><MapPin size={15} /> {destination.label}</p>
          <p className="mt-1 text-xs text-park-muted">{order.client ? order.client.firstName + " " + order.client.lastName : "Cliente"} · {new Date(order.createdAt).toLocaleString("es-PE")}</p>
        </div>
        <span className="rounded-full bg-park-bg px-3 py-1.5 text-xs font-bold text-park-muted">{order.estimatedMinutes || 15} min</span>
      </div>

      <div className="mt-4 space-y-3">
        {(order.items || []).map((item) => <RecipeTicket key={item.id || item.menuItemId} item={item} products={products} guide={guide} loading={guideLoading} />)}
      </div>
      {order.notes ? <div className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-3 text-sm"><strong className="text-amber-900">Indicación:</strong> <span className="text-amber-800">{order.notes}</span></div> : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-park-border pt-4">
        <div><p className="text-xs text-park-muted">Destino de entrega</p><strong className="text-sm text-park-dark">{destination.detail}</strong></div>
        <div className="flex flex-wrap gap-2">
          {canEdit && !["ENTREGADO", "CANCELADO"].includes(order.status) ? <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button> : null}
          {canEdit && target ? <Button type="button" loading={busy} icon={target === "LISTO" ? Scale : target === "ENTREGADO" ? MapPin : ChefHat} variant={target === "ENTREGADO" ? "gold" : "primary"} onClick={() => onAdvance(target)}>{actionLabel(area, order.status, destination.label)}</Button> : null}
        </div>
      </div>
    </article>
  );
}

function RecipeTicket({ item, products, guide, loading }) {
  const technicalLines = (guide.preparation || []).filter((line) => Number(line.legacy_menu_item_id) === Number(item.menuItemId));
  const orderLineIds = new Set(technicalLines.map((line) => Number(line.order_line_id)));
  const lotsByProduct = (guide.reservations || []).filter((line) => orderLineIds.has(Number(line.order_line_id))).reduce((map, line) => {
    const rows = map.get(Number(line.product_id)) || [];
    rows.push(line);
    map.set(Number(line.product_id), rows);
    return map;
  }, new Map());
  return (
    <section className="overflow-hidden rounded-card border border-park-border">
      <div className="flex items-center justify-between gap-3 bg-park-bg px-4 py-3">
        <div><strong className="text-park-dark">{item.quantity} × {item.name}</strong><p className="text-xs text-park-muted">{technicalLines.length ? `Receta técnica v${technicalLines[0].recipe_version} · pesar cada ingrediente` : "Carta de producción · pesar cada ingrediente"}</p></div>
        <Scale className="text-park-green" size={19} />
      </div>
      {loading ? <div className="p-4 text-sm text-park-muted">Cargando proporciones exactas…</div> : technicalLines.length ? <div className="divide-y divide-park-border">{technicalLines.map((line) => {
        const lots = lotsByProduct.get(Number(line.product_id)) || [];
        return <div className="px-4 py-3 text-sm" key={`${line.order_line_id}:${line.product_id}`}><div className="grid grid-cols-[1fr_auto] items-start gap-4"><div><span className="font-semibold text-park-dark">{line.ingredient_name}</span><p className="text-xs text-park-muted">Receta: {quantity(line.recipe_quantity)} {line.recipe_unit_symbol} · base {quantity(line.base_quantity)} {line.base_unit_symbol} · tolerancia ±{quantity(line.waste_tolerance_percent)}%</p></div><strong className="tabular-nums text-park-green">Pesar {quantity(line.required_base_quantity)} {line.base_unit_symbol}</strong></div>{lots.length ? <p className="mt-1 text-xs text-park-muted">Lote FEFO: {lots.map((lot) => `${lot.lot_code} · ${quantity(lot.quantity)} ${lot.base_unit_symbol}`).join(" + ")}</p> : null}</div>;
      })}</div> : item.recipe?.length ? <div className="divide-y divide-park-border">{item.recipe.map((line) => {
        const product = products.find((entry) => Number(entry.id) === Number(line.inventoryId));
        const total = Number(line.quantity) * Number(item.quantity);
        return <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2.5 text-sm" key={line.inventoryId}><div><span className="font-semibold text-park-dark">{product?.name || "Insumo " + line.inventoryId}</span><p className="text-xs text-park-muted">Por unidad: {quantity(line.quantity)} {product?.unit || "un."}</p></div><strong className="tabular-nums text-park-green">Pesar {quantity(total)} {product?.unit || "un."}</strong></div>;
      })}</div> : <div className="p-4 text-sm font-semibold text-park-danger"><AlertTriangle className="mr-2 inline" size={16} />Receta sin proporciones. Administración debe configurarla.</div>}
    </section>
  );
}

function CancelOrderModal({ order, onClose, onConfirm }) {
  const prepared = ["PREPARANDO", "LISTO"].includes(order.status);
  const [form, setForm] = useState({ lossType: "WASTE", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <form className="w-full max-w-lg rounded-card bg-white p-5 shadow-drawer" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await onConfirm(prepared ? form : {}); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-park-gold">Cancelar pedido</p><h2 className="text-xl font-black text-park-dark">{order.code}</h2></div><button type="button" className="grid size-9 place-items-center rounded-button border border-park-border" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></div>
        {prepared ? <><p className="mt-4 text-sm text-park-muted">La preparación comenzó. Indica qué ocurrió con los insumos pesados.</p><div className="mt-4 grid gap-3"><Select label="Destino de lo preparado" value={form.lossType} onChange={(event) => setForm({ ...form, lossType: event.target.value })}><option value="WASTE">Merma / desperdicio</option><option value="INTERNAL_CONSUMPTION">Consumo interno</option><option value="LOSS">Pérdida operativa</option></Select><label className="text-sm font-semibold text-park-dark">Motivo<textarea className="mt-1 min-h-24 w-full rounded-input border border-park-border p-3 text-sm" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required minLength={5} /></label></div></> : <p className="mt-4 text-sm text-park-muted">Las proporciones reservadas regresarán al disponible.</p>}
        {error ? <p className="mt-3 text-sm font-bold text-park-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Volver</Button><Button variant="danger" loading={busy}>Confirmar cancelación</Button></div>
      </form>
    </div>
  );
}

function nextStatus(area, status) {
  const flow = area === "BARTENDER" ? { PENDIENTE: "PREPARANDO", PREPARANDO: "LISTO", LISTO: "ENTREGADO" } : { PENDIENTE: "EN_COCINA", EN_COCINA: "PREPARANDO", PREPARANDO: "LISTO", LISTO: "ENTREGADO" };
  return flow[status] || null;
}

function actionLabel(area, status, destination) {
  if (status === "PENDIENTE") return area === "BARTENDER" ? "Aceptar y preparar" : "Aceptar pedido";
  if (status === "EN_COCINA") return "Iniciar preparación";
  if (status === "PREPARANDO") return "Terminado · descontar receta";
  if (status === "LISTO") return "Entregar en " + destination;
  return "Avanzar pedido";
}

function destinationFor(order) {
  if (order.destination) return order.destination;
  if (order.eventId || order.experienceCode === "EVENTOS") return { type: "EVENTO", label: "Evento reservado", detail: order.event?.name || "Servicio exclusivo de evento" };
  if (order.experienceCode === "PISCINA") return { type: "PISCINA", label: "Piscina", detail: "Entregar en el punto de piscina" };
  if (order.experienceCode === "MIRADOR") return { type: "MIRADOR", label: "Mirador", detail: "Entregar en el mirador" };
  const room = order.room?.number || order.stay?.room?.number || order.roomId;
  return { type: "HABITACION", label: room ? "Habitación " + room : "Área común", detail: room ? "Llevar a la habitación " + room : "Confirmar el punto con el cliente" };
}

function Metric({ icon: Icon, label, value }) {
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-button bg-park-green-soft text-park-green"><Icon size={19} /></span><div><strong className="tabular-nums text-2xl text-park-dark">{value}</strong><p className="text-sm text-park-muted">{label}</p></div></div></article>;
}
