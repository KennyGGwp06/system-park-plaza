import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, PackageCheck, Plus, RefreshCw, Scale, Send, ShoppingCart, Sparkles, Trash2, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
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
const blankOrderLine = () => ({ productId: "", productName: "", presentationId: "", orderedQuantity: "1", unitCost: "0", observation: "" });
const unitChoices = (symbol) => {
  const key = String(symbol || "").toLowerCase();
  if (["g", "gr", "kg"].includes(key)) return [{ value: "kg", label: "Kilogramo (kg)", factor: key === "kg" ? 1 : 1000 }, { value: "g", label: "Gramo (g)", factor: key === "kg" ? .001 : 1 }, { value: "custom", label: "Saco, paquete o caja", factor: null }];
  if (["ml", "l", "lt"].includes(key)) return [{ value: "l", label: "Litro (L)", factor: key === "ml" ? 1000 : 1 }, { value: "ml", label: "Mililitro (ml)", factor: key === "ml" ? 1 : .001 }, { value: "custom", label: "Botella, bidón o caja", factor: null }];
  return [{ value: "unit", label: "Unidad", factor: 1 }, { value: "dozen", label: "Docena", factor: 12 }, { value: "custom", label: "Paquete, bandeja o caja", factor: null }];
};

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
    <PageHeader eyebrow="Inventario · trabajo diario" title="Comprar y recibir" description="Registra lo que compraste con palabras simples. El sistema hará por detrás el ingreso, costo y kardex." actions={<>
      {mode !== "LIST" ? <Button variant="secondary" icon={ArrowLeft} onClick={() => { setMode("LIST"); setSelectedOrder(null); }}>Volver</Button> : null}
      <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Actualizar</Button>
      {mode === "LIST" ? <><Button as={Link} to="/proveedores" variant="secondary">Proveedores</Button><Button variant="secondary" icon={ClipboardCheck} onClick={() => setMode("NEW")}>Pedido a proveedor</Button><Button icon={Plus} onClick={() => setMode("QUICK")}>Registrar compra recibida</Button></> : null}
    </>} />

    {mode === "LIST" ? <DailyGuide /> : null}
    {mode === "NEW" || mode === "RECEIVE" ? <ProcessGuide /> : null}
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
    {mode === "QUICK" ? <QuickPurchaseForm references={references} saving={saving} setSaving={setSaving} onError={setFailure} onCreated={async (text) => { setMessage(text); setMode("LIST"); await reload(); }} /> : null}
    {mode === "RECEIVE" && selectedOrder ? <ReceiptForm order={selectedOrder} references={references} saving={saving} setSaving={setSaving} onCreated={async () => { setMessage("Recepción física guardada en borrador."); setMode("LIST"); setSelectedOrder(null); await reload(); }} onError={setFailure} /> : null}
  </div>;
}

function DailyGuide() {
  return <section className="mb-5 grid gap-3 rounded-card border border-park-border bg-white p-4 shadow-card md:grid-cols-[auto_1fr_auto] md:items-center">
    <span className="grid h-11 w-11 place-items-center rounded-xl bg-park-green-soft text-park-green"><Sparkles size={22} /></span>
    <div><h2 className="font-black text-park-dark">¿Ya tienes los productos contigo?</h2><p className="text-sm text-park-muted">Usa <b>Registrar compra recibida</b>. Escribe el producto, indica cuánto compraste y adónde debe ir.</p></div>
    <div className="flex items-center gap-2 text-xs font-bold text-park-green"><span>Compra</span><span>→</span><span>Almacén</span><span>→</span><span>Restaurante o Bar</span></div>
  </section>;
}

function QuickPurchaseForm({ references, saving, setSaving, onError, onCreated }) {
  const general = references.warehouses.find((item) => item.code === "GENERAL");
  const [form, setForm] = useState({ productName: "", productId: "", quantity: "", purchaseUnit: "", customFactor: "", totalPaid: "", supplierId: "", destination: "GENERAL", lotCode: "", expiresOn: "", notes: "" });
  const selected = references.products.find((item) => Number(item.id) === Number(form.productId)) || references.products.find((item) => item.name.toLowerCase() === form.productName.trim().toLowerCase());
  const choices = unitChoices(selected?.baseUnitSymbol);
  const choice = choices.find((item) => item.value === form.purchaseUnit) || choices[0];
  const factor = choice?.factor ?? Number(form.customFactor || 0);
  const baseQuantity = Number(form.quantity || 0) * Number(factor || 0);
  function chooseProduct(value) {
    const product = references.products.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    const firstUnit = unitChoices(product?.baseUnitSymbol)[0]?.value || "";
    setForm((current) => ({ ...current, productName: value, productId: product?.id || "", purchaseUnit: product ? firstUnit : "" }));
  }
  async function submit(event) {
    event.preventDefault(); onError("");
    if (!selected) return onError("Escribe el nombre y elige un producto existente de las sugerencias. Así evitamos duplicados y el descuento de recetas seguirá conectado.");
    if (!general) return onError("No se encontró el Almacén general.");
    if (!(baseQuantity > 0) || !(Number(form.totalPaid) >= 0)) return onError("Revisa la cantidad, la unidad y el total pagado.");
    if (selected.trackExpiry && !form.expiresOn) return onError("Este producto controla vencimiento. Ingresa la fecha que figura en el empaque.");
    setSaving(true);
    try {
      const total = Number(form.totalPaid || 0);
      const order = await api("/purchasing/orders", { method: "POST", body: { quick: true, supplierId: form.supplierId ? Number(form.supplierId) : null, notes: form.notes || "Compra recibida directamente", lines: [{ productId: Number(selected.id), presentationId: null, orderedQuantity: baseQuantity, unitCost: baseQuantity ? total / baseQuantity : 0 }] } });
      const orderLine = order.lines[0];
      const receipt = await api(`/purchasing/orders/${order.id}/receipts`, { method: "POST", body: { warehouseId: Number(general.id), observation: form.notes, lines: [{ orderLineId: Number(orderLine.id), receivedPresentationQuantity: baseQuantity, measurementMode: "DIRECT", decision: "ACCEPTED", lotCode: selected.trackLots ? (form.lotCode.trim() || `COMPRA-${new Date().toISOString().slice(0, 10)}-${order.id}`) : null, expiresOn: form.expiresOn || null }] } });
      await api(`/purchasing/receipts/${receipt.id}/verify`, { method: "POST", body: { observation: "Verificación automática de compra rápida" } });
      await api(`/purchasing/receipts/${receipt.id}/post`, { method: "POST", body: {} });
      let suffix = "y quedó disponible en el Almacén general.";
      if (form.destination !== "GENERAL") {
        const transferRefs = await api("/transfers/references");
        const destination = transferRefs.warehouses.find((item) => item.code === form.destination);
        const candidates = transferRefs.stock.filter((item) => item.warehouseCode === "GENERAL" && Number(item.productId) === Number(selected.id) && Number(item.available) > 0).sort((a, b) => String(a.expiresOn || "9999").localeCompare(String(b.expiresOn || "9999")));
        let remaining = baseQuantity; const lines = [];
        for (const stock of candidates) { const amount = Math.min(remaining, Number(stock.available)); if (amount > 0) lines.push({ productId: Number(stock.productId), lotId: stock.lotId ? Number(stock.lotId) : null, quantity: amount }); remaining -= amount; if (remaining <= .000001) break; }
        if (!destination || remaining > .000001) throw new Error("La compra ingresó al Almacén general, pero no se pudo preparar el envío automático. Puedes enviarla desde Distribuir insumos.");
        const transfer = await api("/transfers", { method: "POST", body: { fromWarehouseId: Number(general.id), toWarehouseId: Number(destination.id), observation: `Distribución de compra ${order.code}`, lines } });
        await api(`/transfers/${transfer.id}/send`, { method: "POST", body: {} });
        suffix = `y fue enviada a ${destination.name}. El personal debe confirmar que la recibió.`;
      }
      await onCreated(`${selected.name}: compra registrada ${suffix}`);
    } catch (error) { onError(error.message); } finally { setSaving(false); }
  }
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">CAMINO RÁPIDO</p><h2 className="text-xl font-black text-park-dark">Registrar una compra que ya llegó</h2><p className="text-sm text-park-muted">Completa una sola pantalla. La verificación, el ingreso y el kardex se generan automáticamente.</p></div><span className="rounded-full bg-park-green-soft px-3 py-1 text-xs font-black text-park-green">Recomendado para el día a día</span></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="block xl:col-span-2"><span className="mb-1.5 block text-sm font-semibold">¿Qué compraste?</span><input className="w-full rounded-input border border-park-border px-3 py-2.5" list="purchase-products" placeholder="Escribe: arroz, pisco, limón..." value={form.productName} onChange={(event) => chooseProduct(event.target.value)} required/><datalist id="purchase-products">{references.products.map((item) => <option key={item.id} value={item.name} />)}</datalist><small className={`mt-1 block ${selected ? "text-park-green" : "text-park-muted"}`}>{selected ? `Conectado a recetas · se controla en ${selected.baseUnitSymbol}` : "Escribe para buscar; no necesitas recorrer una lista."}</small></label>
      <Input label="Cantidad comprada" type="number" min="0.000001" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
      <Select label="¿Cómo lo compraste?" value={form.purchaseUnit || choice?.value || ""} onChange={(event) => setForm({ ...form, purchaseUnit: event.target.value })} required disabled={!selected}>{choices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
      {choice?.value === "custom" ? <Input label={`Contenido de cada empaque (${selected?.baseUnitSymbol || "base"})`} type="number" min="0.000001" step="any" value={form.customFactor} onChange={(event) => setForm({ ...form, customFactor: event.target.value })} required /> : null}
      <Input label="Total pagado (S/)" type="number" min="0" step="0.01" value={form.totalPaid} onChange={(event) => setForm({ ...form, totalPaid: event.target.value })} required />
      <Select label="Proveedor (opcional)" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Compra directa / mercado</option>{references.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Select label="¿Adónde debe ir?" value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })}><option value="GENERAL">Guardar en Almacén general</option><option value="RESTAURANTE">Enviar a Restaurante</option><option value="BARTENDER">Enviar a Bar</option></Select>
      {selected?.trackLots ? <Input label="Lote (opcional; se genera si falta)" value={form.lotCode} onChange={(event) => setForm({ ...form, lotCode: event.target.value })} /> : null}
      {selected?.trackExpiry ? <Input label="Fecha de vencimiento" type="date" value={form.expiresOn} onChange={(event) => setForm({ ...form, expiresOn: event.target.value })} required /> : null}
    </div>
    {selected && baseQuantity > 0 ? <div className="mt-4 rounded-xl border border-park-green/20 bg-park-green-soft p-3 text-sm text-park-dark"><b>El sistema guardará:</b> {qty(baseQuantity)} {selected.baseUnitSymbol}. {form.destination === "GENERAL" ? "Quedará en Almacén general." : `Saldrá hacia ${form.destination === "RESTAURANTE" ? "Restaurante" : "Bar"} para confirmación.`}</div> : null}
    <div className="mt-5 flex justify-end"><Button loading={saving} icon={form.destination === "GENERAL" ? PackageCheck : Send}>Confirmar compra e ingreso</Button></div>
  </form>;
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
    updateLine(index, { productId, productName: product?.name || "", presentationId: presentation?.id || "", unitCost: presentation?.purchaseCost ?? product?.cost ?? "0" });
  }
  function typeProduct(index, value) { const product = references.products.find((item) => item.name.toLowerCase() === value.trim().toLowerCase()); if (product) selectProduct(index, product.id); else updateLine(index, { productName: value, productId: "", presentationId: "" }); }
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
      return <div className="rounded-card border border-park-border bg-park-bg p-4" key={index}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Producto</span><input className="w-full rounded-input border border-park-border px-3 py-2.5" list={`advanced-products-${index}`} value={line.productName} onChange={(event) => typeProduct(index, event.target.value)} placeholder="Escribe para buscar" required/><datalist id={`advanced-products-${index}`}>{references.products.map((item) => <option key={item.id} value={item.name}/>)}</datalist></label><Select label="Presentación" value={line.presentationId} onChange={(event) => updateLine(index, { presentationId: event.target.value })} required><option value="">Seleccionar</option>{(product?.presentations || []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unitSymbol})</option>)}</Select><Input label="Cantidad pedida" type="number" min="0.000001" step="any" value={line.orderedQuantity} onChange={(event) => updateLine(index, { orderedQuantity: event.target.value })} required /><Input label="Costo por presentación" type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} required /><div className="flex items-end"><Button className="w-full" type="button" variant="ghost" icon={Trash2} disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}>Quitar</Button></div></div>{presentation ? <p className="mt-2 text-xs font-semibold text-park-muted">Teórico: {qty(Number(line.orderedQuantity) * Number(presentation.factor))} {product.baseUnitSymbol} · Costo base {money(Number(line.unitCost) / Number(presentation.factor || 1))}/{product.baseUnitSymbol}</p> : null}</div>;
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
