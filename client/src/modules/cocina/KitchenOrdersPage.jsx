// Cocina / Bar › Pedidos. Tablero por etapas (cocina: Nuevos → Aceptados → En preparación → Listos; bar: sin "Aceptados") con tiempo de cada ticket,
// destino y la guía de pesaje de cada plato (GET /api/orders/:id/inventory, sin costos). Cambios de estado:
// PATCH /api/restaurante|bartender/:id/status. Los insumos de la receta se descuentan al confirmar la entrega.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock3, History, MapPin, Play, RefreshCw, Scale, Send, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, Tag, timeOf, todayKey, useShift, useToast } from "../recepcion/rxkit";
import { useKitchen } from "./KitchenShell";

const STAGE_ICON = { PENDIENTE: CheckCircle2, EN_COCINA: Play, PREPARANDO: Scale, LISTO: Send };
const stagesOf = (station) => station.stages.map(([status, title, help, next, action]) => ({ status, title, help, next, action, icon: STAGE_ICON[status] }));
const qty = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");

export function elapsedText(createdAt) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
}
export function timerTone(order) {
  if (order.isAbandoned || order.operationalBucket === "ABANDONED") return "crit";
  if (order.isLate || order.operationalBucket === "LATE") return "warn";
  return "ok";
}

export function KitchenOrdersPage() {
  const { station, orders, ordersLoading, reloadOrders, inventoryOpen, awaitingReview } = useKitchen();
  const STAGES = stagesOf(station);
  const OrderIcon = station.icon;
  const { active: shiftActive, openClock } = useShift();
  const show = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState("tablero");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setTick((value) => value + 1), 30000); return () => window.clearInterval(timer); }, []);
  const openId = Number(params.get("ver") || 0) || null;
  const open = (id) => setParams({ ver: String(id) });
  const close = () => setParams({});
  const selected = orders.find((row) => Number(row.id) === openId) || null;
  const delivered = useMemo(() => orders.filter((row) => row.status === "ENTREGADO" && localDay(row.updatedAt || row.createdAt) === todayKey()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), [orders]);
  const cancelled = orders.filter((row) => row.status === "CANCELADO" && localDay(row.updatedAt || row.createdAt) === todayKey());

  async function advance(order, status, extra = {}) {
    setBusy(order.id); setError("");
    try {
      await api(`${station.ordersApi}/${order.id}/status`, { method: "PATCH", body: { status, ...extra } });
      show(status === "ENTREGADO" ? `${order.code} entregado. Insumos descontados del stock.` : status === "LISTO" ? `${order.code} listo para entregar.` : status === "CANCELADO" ? `${order.code} cancelado.` : `${order.code} actualizado.`);
      await reloadOrders();
      if (status === "ENTREGADO" || status === "CANCELADO") close();
    } catch (cause) { setError(`${order.code}: ${cause.message}`); } finally { setBusy(null); }
  }

  if (ordersLoading) return <LoadingSpinner label="Cargando pedidos…" />;
  const byStage = (status) => orders.filter((row) => row.status === status).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  return <>
    <PageHead title="Pedidos" tools={<>
      <div className="rx-seg">
        <button type="button" className={view === "tablero" ? "is-on" : ""} onClick={() => setView("tablero")}><OrderIcon size={15} />En curso</button>
        <button type="button" className={view === "hoy" ? "is-on" : ""} onClick={() => setView("hoy")}><History size={15} />Entregados hoy<i>{delivered.length}</i></button>
      </div>
      <button className="rx-btn" type="button" onClick={reloadOrders}><RefreshCw />Actualizar</button>
    </>}>Avanza cada pedido de izquierda a derecha. Abre un ticket para ver cuánto {station.measure} de cada ingrediente. Al confirmar la entrega se descuentan los insumos.</PageHead>
    {!shiftActive ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>Inicia tu turno para mover pedidos.</b> <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert></div> : null}
    {shiftActive && !inventoryOpen ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>El inventario del turno no está abierto.</b> {awaitingReview ? `El cierre ${awaitingReview.shift} espera la revisión del dueño; cuando lo apruebe, abre el inventario de hoy.` : "Ábrelo en Mi stock y mermas para aceptar pedidos: cada entrega descuenta sus insumos."}</Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}

    {view === "tablero" ? <div className={`kd-board kd-board--${STAGES.length}`}>{STAGES.map((stage, index) => {
      const rows = byStage(stage.status);
      return <section className="kd-col" key={stage.status} aria-label={stage.title}>
        <header><div><b>{index + 1}. {stage.title}</b><small>{stage.help}</small></div><i>{rows.length}</i></header>
        <div className="kd-col-body">
          {rows.map((order) => <Ticket key={order.id} order={order} stage={stage} busy={busy === order.id} disabled={!shiftActive || !inventoryOpen} onOpen={() => open(order.id)} onAdvance={() => advance(order, stage.next)} />)}
          {!rows.length ? <div className="kd-col-empty">Sin pedidos</div> : null}
        </div>
      </section>;
    })}</div> : <section className="rx-card">
      <div className="rx-card-h"><div><h2>Entregados hoy</h2><p>{delivered.length} pedido(s){cancelled.length ? ` · ${cancelled.length} cancelado(s)` : ""}</p></div></div>
      {delivered.length || cancelled.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Pedido</th><th>Destino</th><th>{station.Items}</th><th>Recibido</th><th>Estado</th><th>Entregó</th></tr></thead>
        <tbody>{[...delivered, ...cancelled].map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.destination?.label || "—"}</td>
          <td className="mut">{(row.items || []).map((item) => `${item.quantity}× ${item.name}`).join(", ")}</td>
          <td className="mut">{timeOf(row.createdAt)}</td>
          <td><Tag tone={row.status === "ENTREGADO" ? "ok" : "crit"}>{row.status === "ENTREGADO" ? "Entregado" : "Cancelado"}</Tag></td>
          <td className="mut">{row.deliveredBy || "—"}</td>
        </tr>)}</tbody>
      </table></div> : <Empty icon={OrderIcon} title="Aún no hay pedidos entregados hoy" />}
    </section>}

    <OrderDrawer stages={STAGES} station={station} order={selected} busy={busy === selected?.id} disabled={!shiftActive || !inventoryOpen} onClose={close} onAdvance={(status) => advance(selected, status)} onCancel={() => { setCancelling(selected); close(); }} />
    {cancelling ? <CancelDrawer order={cancelling} onClose={() => setCancelling(null)} onConfirm={async (body) => { await advance(cancelling, "CANCELADO", body); setCancelling(null); }} /> : null}
  </>;
}

function Ticket({ order, stage, busy, disabled, onOpen, onAdvance }) {
  const tone = timerTone(order);
  const Icon = stage.icon;
  return <article className={`kd-ticket ${order.status === "LISTO" ? "t-ready" : tone === "crit" ? "t-crit" : tone === "warn" ? "t-late" : ""}`} onClick={onOpen}>
    <div className="kd-ticket-h"><div><b>{order.code}</b><small>{order.client ? `${order.client.firstName} ${order.client.lastName}` : "Cliente"}</small></div><span className={`kd-timer ${tone}`} title={order.operationalBucketLabel || ""}><Clock3 size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} />{elapsedText(order.createdAt)}</span></div>
    <div className="kd-dest"><MapPin />{order.destination?.label || "Por confirmar"}</div>
    <ul className="kd-items">{(order.items || []).map((item, index) => <li key={`${item.menuItemId || item.name}-${index}`}><b>{item.quantity}×</b><span>{item.name}</span>{item.notes ? <small>{item.notes}</small> : null}</li>)}</ul>
    {order.notes ? <div className="kd-note">{order.notes}</div> : null}
    <button className={`rx-btn ${order.status === "LISTO" ? "rx-btn--dark" : "rx-btn--primary"}`} type="button" disabled={busy || disabled} onClick={(event) => { event.stopPropagation(); onAdvance(); }}><Icon />{busy ? "Guardando…" : stage.action}</button>
  </article>;
}

function OrderDrawer({ stages: STAGES, station, order, busy, disabled, onClose, onAdvance, onCancel }) {
  const guide = useFetch(order ? `/orders/${order.id}/inventory` : "/orders/0/inventory", { initialData: { preparation: [], reservations: [], lines: [] }, enabled: Boolean(order), realtime: false });
  if (!order) return null;
  const stage = STAGES.find((row) => row.status === order.status);
  const lotsFor = (lineId, productId) => (guide.data?.reservations || []).filter((row) => Number(row.order_line_id) === Number(lineId) && Number(row.product_id) === Number(productId));
  const itemsWithGuide = (order.items || []).map((item) => ({ item, lines: (guide.data?.preparation || []).filter((line) => Number(line.legacy_menu_item_id) === Number(item.menuItemId)) }));
  const done = ["ENTREGADO", "CANCELADO"].includes(order.status);
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${order.code} · ${stage?.title || (order.status === "ENTREGADO" ? "Entregado" : "Cancelado")}`} title={order.destination?.label || "Pedido"} subtitle={`${order.destination?.detail || ""} · recibido ${timeOf(order.createdAt)} · ${elapsedText(order.createdAt)}`}
    footer={done ? <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button> : <>
      <button className="rx-btn rx-btn--danger" type="button" onClick={onCancel} disabled={busy || disabled}><X />{order.status === "PENDIENTE" ? "Rechazar" : "Cancelar pedido"}</button>
      <button className="rx-btn rx-btn--primary" type="button" onClick={() => onAdvance(stage.next)} disabled={busy || disabled}>{stage.action}</button>
    </>}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Tag tone={timerTone(order)}>{order.operationalBucketLabel || "A tiempo"}</Tag>{order.client ? <Tag>{order.client.firstName} {order.client.lastName}</Tag> : null}{order.acceptedBy ? <Tag>Aceptó: {order.acceptedBy}</Tag> : null}</div>
    {order.notes ? <Alert tone="warn"><b>Indicación del cliente:</b> {order.notes}</Alert> : null}
    <section className="rx-sec"><h3>Qué {station.measure}</h3>
      {guide.loading && !guide.data?.preparation?.length ? <LoadingSpinner label="Cargando la receta…" /> : <div style={{ display: "grid", gap: 10 }}>{itemsWithGuide.map(({ item, lines }, index) => <div className="kd-weigh" key={index}>
        <header><div><b>{item.quantity} × {item.name}</b><br /><small>{lines.length ? `Receta v${lines[0].recipe_version} · cantidades para ${qty(lines[0].ordered_quantity)} porción(es)` : "Sin receta técnica cargada"}</small></div><Scale size={17} color="#0F4C9E" /></header>
        {lines.length ? lines.map((line) => { const lots = lotsFor(line.order_line_id, line.product_id); return <div key={`${line.order_line_id}-${line.product_id}`}>
          <span><b style={{ fontWeight: 500 }}>{line.ingredient_name}</b><small>{qty(line.recipe_quantity)} {line.recipe_unit_symbol} por porción{Number(line.waste_tolerance_percent) ? ` · tolerancia ±${qty(line.waste_tolerance_percent)} %` : ""}{lots.length ? ` · lote ${lots.map((lot) => lot.lot_code).join(", ")}` : ""}</small></span>
          <strong>{qty(line.required_base_quantity)} {line.base_unit_symbol}</strong>
        </div>; }) : <div><span style={{ color: "var(--crit)" }}>Esta receta aún no tiene cantidades. Avísalo al dueño.</span></div>}
      </div>)}</div>}
    </section>
    {order.status === "LISTO" ? <Alert tone="info">Al confirmar la entrega se descuentan del stock los insumos de la receta.</Alert> : null}
  </Drawer>;
}

function CancelDrawer({ order, onClose, onConfirm }) {
  const prepared = ["PREPARANDO", "LISTO"].includes(order.status);
  const [form, setForm] = useState({ lossType: "WASTE", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (prepared && !form.reason.trim()) { setError("Explica qué pasó con lo que ya se preparó."); return; }
    setBusy(true); setError("");
    try { await onConfirm(prepared ? form : {}); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Cancelar pedido" title={order.code} subtitle={(order.items || []).map((item) => `${item.quantity}× ${item.name}`).join(", ")}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Volver</button><button className="rx-btn rx-btn--danger" type="button" onClick={confirm} disabled={busy}>Confirmar cancelación</button></>}>
    {prepared ? <>
      <Alert tone="warn">La preparación ya empezó: indica qué pasó con los insumos usados. Queda registrado para el cierre del día.</Alert>
      <label className="rx-field"><span>Destino de lo preparado</span><select className="rx-select" value={form.lossType} onChange={(event) => setForm({ ...form, lossType: event.target.value })}><option value="WASTE">Merma / desperdicio</option><option value="INTERNAL_CONSUMPTION">Consumo interno</option><option value="LOSS">Pérdida operativa</option></select></label>
      <label className="rx-field"><span>Motivo</span><textarea className="rx-input" style={{ height: 80, paddingTop: 8 }} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
    </> : <Alert tone="info">El pedido aún no se prepara: los insumos reservados vuelven al stock.</Alert>}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
