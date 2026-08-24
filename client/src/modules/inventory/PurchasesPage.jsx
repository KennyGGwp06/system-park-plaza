import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, PackageCheck, Plus, RefreshCw, Scale, ShoppingCart, Trash2, Warehouse } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Alert, Button, Input, PageHeader, Select } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const money = (value) => `S/ ${Number(value || 0).toFixed(2)}`;
const qty = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 6 });
const date = (value) => value ? new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "—";
const blankOrderLine = () => ({ productId: "", presentationId: "", orderedQuantity: "1", unitCost: "0", observation: "" });

export function PurchasesPage() {
  const { data: orders = [], loading, error, reload } = useFetch("/purchasing/orders", { initialData: [] });
  const { data: references = { suppliers: [], warehouses: [], products: [] } } = useFetch("/purchasing/references", { initialData: { suppliers: [], warehouses: [], products: [] } });
  const [mode, setMode] = useState("LIST");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  const refresh = async () => {
    await reload();
    if (selectedOrder) {
      const updated = await api(`/purchasing/orders/${selectedOrder.id}`);
      setSelectedOrder(updated);
    }
  };

  function startReceipt(order) {
    setSelectedOrder(order);
    setMode("RECEIVE");
    setFailure("");
  }

  async function receiptAction(receipt, action) {
    setSaving(true); setFailure("");
    try {
      await api(`/purchasing/receipts/${receipt.id}/${action}`, { method: "POST", body: {} });
      setMessage(action === "verify" ? "Recepción verificada. Ya puede ingresarse al almacén." : "Mercancía ingresada; costo y kardex actualizados.");
      await refresh();
    } catch (err) { setFailure(err.message); } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <Alert tone="danger" title="No fue posible cargar compras">{error.message}</Alert>;

  const pending = orders.filter((item) => ["APPROVED", "PARTIALLY_RECEIVED"].includes(item.status)).length;
  const posted = orders.flatMap((item) => item.receipts || []).filter((item) => item.status === "POSTED").length;

  return <div>
    <Toast message={message} onClose={() => setMessage("")} />
    <PageHeader eyebrow="Inventario inteligente" title="Compras y recepción física" description="La orden registra lo pedido. Solo una recepción verificada actualiza existencias, costo promedio y kardex." actions={<>
      {mode !== "LIST" ? <Button variant="secondary" icon={ArrowLeft} onClick={() => { setMode("LIST"); setSelectedOrder(null); }}>Volver</Button> : null}
      <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Actualizar</Button>
      {mode === "LIST" ? <Button icon={Plus} onClick={() => setMode("NEW")}>Nueva orden</Button> : null}
    </>} />

    <ProcessGuide />
    {failure ? <div className="mb-4"><Alert tone="danger" title="Revisa la operación">{failure}</Alert></div> : null}

    {mode === "LIST" ? <>
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric icon={ShoppingCart} label="Órdenes" value={orders.length} />
        <Metric icon={Warehouse} label="Pendientes de recepción" value={pending} />
        <Metric icon={PackageCheck} label="Recepciones ingresadas" value={posted} />
      </section>
      <OrderList orders={orders} onReceive={startReceipt} onAction={receiptAction} saving={saving} />
    </> : null}
    {mode === "NEW" ? <OrderForm references={references} saving={saving} setSaving={setSaving} onCreated={async (order) => { setMessage(`Orden ${order.code} creada y pendiente de recepción.`); setMode("LIST"); await reload(); }} onError={setFailure} /> : null}
    {mode === "RECEIVE" && selectedOrder ? <ReceiptForm order={selectedOrder} references={references} saving={saving} setSaving={setSaving} onCreated={async () => { setMessage("Recepción física guardada en borrador."); setMode("LIST"); setSelectedOrder(null); await reload(); }} onError={setFailure} /> : null}
  </div>;
}

function ProcessGuide() {
  const steps = ["Orden", "Pendiente", "Recepción física", "Verificación", "Ingreso", "Costo + kardex"];
  return <section className="mb-5 overflow-x-auto rounded-card border border-park-border bg-white p-4 shadow-card" aria-label="Flujo de compras">
    <div className="flex min-w-[720px] items-center gap-2">{steps.map((step, index) => <div className="flex flex-1 items-center gap-2" key={step}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-park-green text-xs font-black text-white">{index + 1}</span><span className="text-xs font-bold text-park-dark">{step}</span>{index < steps.length - 1 ? <span className="ml-auto text-park-muted">→</span> : null}</div>)}</div>
  </section>;
}

function Metric({ icon: Icon, label, value }) {
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-park-green-soft text-park-green"><Icon size={20} /></span><div><p className="text-2xl font-black text-park-dark">{value}</p><p className="text-xs font-semibold text-park-muted">{label}</p></div></div></article>;
}

function OrderList({ orders, onReceive, onAction, saving }) {
  if (!orders.length) return <EmptyState title="Aún no hay órdenes de compra" description="Crea una orden; el inventario permanecerá sin cambios hasta contabilizar la recepción física." />;
  return <section className="grid gap-4 xl:grid-cols-2">{orders.map((order) => {
    const canReceive = ["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status);
    return <article className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-5" key={order.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">{order.code}</p><h2 className="text-lg font-black text-park-dark">{order.supplier?.name || "Proveedor sin identificar"}</h2><p className="mt-1 text-xs text-park-muted">Ordenada {date(order.orderedAt || order.createdAt)} · Entrega {order.expectedAt ? new Date(order.expectedAt).toLocaleDateString("es-PE") : "sin fecha"}</p></div><StatusBadge value={order.status} /></div>
      <div className="mt-4 space-y-2">{order.lines.map((line) => <div className="rounded-lg bg-park-bg p-3" key={line.id}><div className="flex justify-between gap-3 text-sm"><strong>{line.productName}</strong><span>{money(Number(line.orderedQuantity) * Number(line.unitCost))}</span></div><p className="mt-1 text-xs text-park-muted">Pedido: {qty(line.orderedQuantity)} {line.presentationName || line.presentationUnitSymbol || "presentación"} · Recibido aceptado: {qty(line.acceptedPresentationQuantity)} · Pendiente: <strong>{qty(line.remainingQuantity)}</strong></p></div>)}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-park-border pt-4"><div><span className="text-xs text-park-muted">Total orden</span><p className="font-black text-park-dark">{money(order.total)}</p></div>{canReceive ? <Button icon={PackageCheck} onClick={() => onReceive(order)}>Registrar recepción</Button> : <StatusBadge value="RECEIVED" />}</div>
      {(order.receipts || []).length ? <div className="mt-4 space-y-2"><h3 className="text-xs font-black uppercase tracking-wide text-park-muted">Recepciones</h3>{order.receipts.map((receipt) => <div className="rounded-lg border border-park-border p-3" key={receipt.id}><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm text-park-dark">{receipt.code}</strong><p className="text-xs text-park-muted">{receipt.warehouseName} · {date(receipt.receivedAt)}</p></div><StatusBadge value={receipt.status} /></div><div className="mt-2 flex flex-wrap gap-2">{receipt.status === "DRAFT" ? <Button size="sm" variant="secondary" icon={ClipboardCheck} loading={saving} onClick={() => onAction(receipt, "verify")}>Verificar</Button> : null}{receipt.status === "VERIFIED" ? <Button size="sm" variant="gold" icon={Warehouse} loading={saving} onClick={() => onAction(receipt, "post")}>Ingresar a almacén</Button> : null}{receipt.status === "POSTED" ? <span className="text-xs font-bold text-park-green">Kardex generado · movimientos {receipt.lines.filter((line) => line.movementId).map((line) => `#${line.movementId}`).join(", ") || "sin entrada (rechazo total)"}</span> : null}</div></div>)}</div> : null}
    </article>;
  })}</section>;
}

function OrderForm({ references, saving, setSaving, onCreated, onError }) {
  const [form, setForm] = useState({ supplierId: "", expectedAt: "", notes: "", lines: [blankOrderLine()] });
  const total = useMemo(() => form.lines.reduce((sum, line) => sum + Number(line.orderedQuantity || 0) * Number(line.unitCost || 0), 0), [form.lines]);
  const updateLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => row === index ? { ...line, ...patch } : line) }));
  function selectProduct(index, productId) {
    const product = references.products.find((item) => Number(item.id) === Number(productId));
    const presentation = product?.presentations?.[0];
    updateLine(index, { productId, presentationId: presentation?.id || "", unitCost: presentation?.purchaseCost ?? product?.cost ?? "0" });
  }
  async function submit(event) {
    event.preventDefault(); setSaving(true); onError("");
    try { await onCreated(await api("/purchasing/orders", { method: "POST", body: { ...form, supplierId: Number(form.supplierId), lines: form.lines.map((line) => ({ ...line, productId: Number(line.productId), presentationId: Number(line.presentationId), orderedQuantity: Number(line.orderedQuantity), unitCost: Number(line.unitCost) })) } })); }
    catch (error) { onError(error.message); } finally { setSaving(false); }
  }
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}>
    <div className="mb-5"><h2 className="text-xl font-black text-park-dark">Nueva orden de compra</h2><p className="text-sm text-park-muted">Registrar lo pedido no modifica el stock.</p></div>
    <div className="grid gap-4 md:grid-cols-2"><Select label="Proveedor" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} required><option value="">Seleccionar</option>{references.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Input label="Fecha esperada" type="date" value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} /></div>
    <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold">Observación</span><textarea className="min-h-20 w-full rounded-input border border-park-border p-3 text-sm" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Condiciones, documento del proveedor o indicaciones" /></label>
    <div className="mt-5 space-y-3">{form.lines.map((line, index) => {
      const product = references.products.find((item) => Number(item.id) === Number(line.productId));
      const presentation = product?.presentations?.find((item) => Number(item.id) === Number(line.presentationId));
      return <div className="rounded-card border border-park-border bg-park-bg p-4" key={index}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Select label="Producto" value={line.productId} onChange={(event) => selectProduct(index, event.target.value)} required><option value="">Seleccionar</option>{references.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select label="Presentación" value={line.presentationId} onChange={(event) => updateLine(index, { presentationId: event.target.value })} required><option value="">Seleccionar</option>{(product?.presentations || []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unitSymbol})</option>)}</Select><Input label="Cantidad pedida" type="number" min="0.000001" step="any" value={line.orderedQuantity} onChange={(event) => updateLine(index, { orderedQuantity: event.target.value })} required /><Input label="Costo por presentación" type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} required /><div className="flex items-end"><Button className="w-full" type="button" variant="ghost" icon={Trash2} disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}>Quitar</Button></div></div>{presentation ? <p className="mt-2 text-xs font-semibold text-park-muted">Teórico: {qty(Number(line.orderedQuantity) * Number(presentation.factor))} {product.baseUnitSymbol} · Costo base {money(Number(line.unitCost) / Number(presentation.factor || 1))}/{product.baseUnitSymbol}</p> : null}</div>;
    })}</div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="secondary" icon={Plus} onClick={() => setForm({ ...form, lines: [...form.lines, blankOrderLine()] })}>Agregar producto</Button><div className="text-right"><p className="text-xs text-park-muted">Total estimado</p><p className="text-xl font-black text-park-dark">{money(total)}</p></div></div>
    <div className="mt-5 flex justify-end"><Button loading={saving} icon={ShoppingCart}>Crear y dejar pendiente</Button></div>
  </form>;
}

function ReceiptForm({ order, references, saving, setSaving, onCreated, onError }) {
  const defaultLine = (line) => ({ orderLineId: line.id, receivedPresentationQuantity: line.remainingQuantity || "", measurementMode: "DIRECT", actualBaseQuantity: "", individualText: "", decision: "ACCEPTED", acceptedBaseQuantity: "", lotCode: "", expiresOn: "", observation: "" });
  const available = order.lines.filter((line) => Number(line.remainingQuantity) > 0);
  const [form, setForm] = useState({ warehouseId: references.warehouses[0]?.id || "", evidenceUrl: "", observation: "", lines: available.length ? [defaultLine(available[0])] : [] });
  const updateLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => row === index ? { ...line, ...patch } : line) }));
  const addLot = (orderLine) => setForm((current) => ({ ...current, lines: [...current.lines, defaultLine(orderLine)] }));
  async function submit(event) {
    event.preventDefault(); setSaving(true); onError("");
    try {
      const body = { ...form, warehouseId: Number(form.warehouseId), lines: form.lines.map(({ individualText, ...line }) => ({ ...line, orderLineId: Number(line.orderLineId), receivedPresentationQuantity: Number(line.receivedPresentationQuantity), actualBaseQuantity: Number(line.actualBaseQuantity || 0), acceptedBaseQuantity: Number(line.acceptedBaseQuantity || 0), individualMeasurements: individualText.split(/[;,\n]+/).map((value) => Number(value.trim())).filter((value) => value > 0) })) };
      await api(`/purchasing/orders/${order.id}/receipts`, { method: "POST", body }); await onCreated();
    } catch (error) { onError(error.message); } finally { setSaving(false); }
  }
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}>
    <div className="mb-5"><p className="text-xs font-black uppercase tracking-wide text-park-gold">{order.code}</p><h2 className="text-xl font-black text-park-dark">Recepción física · {order.supplier?.name}</h2><p className="text-sm text-park-muted">Registra únicamente lo que llegó. Puedes dividir un producto en varios lotes.</p></div>
    <Alert tone="warning" title="Control obligatorio">La cantidad comprada nunca se copia automáticamente. Primero guarda, luego verifica y finalmente ingresa a almacén.</Alert>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Select label="Almacén de ingreso" value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })} required><option value="">Seleccionar</option>{references.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Input label="Evidencia (URL opcional)" type="url" value={form.evidenceUrl} onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })} placeholder="https://.../foto-recepcion.jpg" /><Input label="Observación general" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} /></div>
    <div className="mt-5 space-y-4">{form.lines.map((line, index) => {
      const orderLine = order.lines.find((item) => Number(item.id) === Number(line.orderLineId));
      const theoretical = Number(line.receivedPresentationQuantity || 0) * Number(orderLine?.presentationFactor || 1);
      const individualValues = line.individualText.split(/[;,\n]+/).map((value) => Number(value.trim())).filter((value) => value > 0);
      const individualTotal = individualValues.reduce((sum, value) => sum + value, 0);
      const actual = line.measurementMode === "INDIVIDUAL" ? individualTotal : line.measurementMode === "TOTAL" ? Number(line.actualBaseQuantity || 0) : theoretical;
      return <div className="rounded-card border border-park-border p-4" key={index}><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><strong className="text-park-dark">Lote/partida {index + 1}</strong><p className="text-xs text-park-muted">Una fila corresponde a un lote y vencimiento.</p></div><Button type="button" size="sm" variant="ghost" icon={Trash2} disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}>Quitar</Button></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Select label="Producto de la orden" value={line.orderLineId} onChange={(event) => updateLine(index, defaultLine(order.lines.find((item) => Number(item.id) === Number(event.target.value))))} required>{available.map((item) => <option key={item.id} value={item.id}>{item.productName} · pendiente {qty(item.remainingQuantity)}</option>)}</Select><Input label={`Cantidad recibida (${orderLine?.presentationName || "presentación"})`} type="number" min="0.000001" max={orderLine?.remainingQuantity} step="any" value={line.receivedPresentationQuantity} onChange={(event) => updateLine(index, { receivedPresentationQuantity: event.target.value })} required /><Select label="Cómo se midió" value={line.measurementMode} onChange={(event) => updateLine(index, { measurementMode: event.target.value })}><option value="DIRECT">Usar cantidad teórica</option><option value="TOTAL">Peso/volumen total real</option><option value="INDIVIDUAL">Mediciones individuales</option></Select><Select label="Resultado" value={line.decision} onChange={(event) => updateLine(index, { decision: event.target.value })}><option value="ACCEPTED">Aceptado</option><option value="PARTIAL">Aceptado parcialmente</option><option value="REJECTED">Rechazado</option></Select></div>
        {line.measurementMode === "TOTAL" ? <div className="mt-3 max-w-md"><Input label={`Peso/volumen real total (${orderLine?.baseUnitSymbol})`} type="number" min="0.000001" step="any" value={line.actualBaseQuantity} onChange={(event) => updateLine(index, { actualBaseQuantity: event.target.value })} required /></div> : null}
        {line.measurementMode === "INDIVIDUAL" ? <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">Pesos/volúmenes individuales ({orderLine?.baseUnitSymbol})</span><textarea className="min-h-20 w-full rounded-input border border-park-border p-3 text-sm" value={line.individualText} onChange={(event) => updateLine(index, { individualText: event.target.value })} placeholder="Ejemplo para 10 pollos: 1.85, 2.10, 1.92, 2.04..." required /><span className="mt-1 block text-xs font-semibold text-park-muted">{individualValues.length} mediciones · suma real {qty(individualTotal)} {orderLine?.baseUnitSymbol}</span></label> : null}
        {line.decision === "PARTIAL" ? <div className="mt-3 max-w-md"><Input label={`Cantidad real aceptada (${orderLine?.baseUnitSymbol})`} type="number" min="0" max={actual} step="any" value={line.acceptedBaseQuantity} onChange={(event) => updateLine(index, { acceptedBaseQuantity: event.target.value })} required /></div> : null}
        <div className="mt-3 grid gap-3 md:grid-cols-3"><Input label={`Lote${orderLine?.trackLots ? " (obligatorio)" : " (opcional)"}`} value={line.lotCode} onChange={(event) => updateLine(index, { lotCode: event.target.value })} required={orderLine?.trackLots && line.decision !== "REJECTED"} /><Input label={`Vencimiento${orderLine?.trackExpiry ? " (obligatorio)" : " (opcional)"}`} type="date" value={line.expiresOn} onChange={(event) => updateLine(index, { expiresOn: event.target.value })} required={orderLine?.trackExpiry && line.decision !== "REJECTED"} /><Input label="Observación" value={line.observation} onChange={(event) => updateLine(index, { observation: event.target.value })} placeholder={line.decision === "REJECTED" ? "Motivo del rechazo" : "Condición del producto"} /></div>
        <div className="mt-3 grid gap-2 rounded-lg bg-park-bg p-3 text-xs sm:grid-cols-3"><span>Teórico <strong>{qty(theoretical)} {orderLine?.baseUnitSymbol}</strong></span><span>Real <strong>{qty(actual)} {orderLine?.baseUnitSymbol}</strong></span><span>Diferencia <strong className={Math.abs(actual - theoretical) > theoretical * Number(orderLine?.tolerancePercent || 0) / 100 ? "text-park-danger" : "text-park-green"}>{qty(actual - theoretical)} {orderLine?.baseUnitSymbol}</strong></span></div>
      </div>;
    })}</div>
    <div className="mt-4 flex flex-wrap gap-2">{available.map((line) => <Button key={line.id} type="button" size="sm" variant="secondary" icon={Plus} onClick={() => addLot(line)}>Agregar lote de {line.productName}</Button>)}</div>
    <div className="mt-6 flex justify-end"><Button loading={saving} icon={Scale}>Guardar recepción física</Button></div>
  </form>;
}
