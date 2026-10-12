// Insumos › Compras. Tres caminos: 1) "Compra que ya llegó" (una pantalla: ingresa, verifica, contabiliza y, si se
// quiere, envía a Cocina o Bar); 2) pedido a proveedor (no mueve stock); 3) recepción física de un pedido por lotes, con
// medición real, verificación e ingreso al almacén (recién ahí cambian el costo y el kardex).
// Rutas: /api/purchasing/orders(/:id)(/receipts), /api/purchasing/receipts/:id/verify|post, /api/purchasing/references, /api/transfers.
import { useMemo, useState } from "react";
import { ClipboardCheck, PackageCheck, Plus, Scale, Send, ShoppingCart, Trash2, Warehouse } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Drawer, Empty, Field, HBars, Kpi, PageHead, Seg, Status, dayText, limaDay, qty, soles, todayKey, useBusy, useChartTip, useOpenId, useToast, whenText } from "./kit";

const unitChoices = (symbol) => {
  const key = String(symbol || "").toLowerCase();
  if (["g", "gr", "kg"].includes(key)) return [{ value: "kg", label: "Kilogramo (kg)", factor: key === "kg" ? 1 : 1000 }, { value: "g", label: "Gramo (g)", factor: key === "kg" ? 0.001 : 1 }, { value: "custom", label: "Saco, paquete o caja", factor: null }];
  if (["ml", "l", "lt"].includes(key)) return [{ value: "l", label: "Litro (L)", factor: key === "ml" ? 1000 : 1 }, { value: "ml", label: "Mililitro (ml)", factor: key === "ml" ? 1 : 0.001 }, { value: "custom", label: "Botella, bidón o caja", factor: null }];
  return [{ value: "unit", label: "Unidad", factor: 1 }, { value: "dozen", label: "Docena", factor: 12 }, { value: "custom", label: "Paquete, bandeja o caja", factor: null }];
};
const OPEN = ["APPROVED", "PARTIALLY_RECEIVED"];

export function PurchasesPage() {
  const orders = useFetch("/purchasing/orders", { initialData: [], realtime: true });
  const references = useFetch("/purchasing/references", { initialData: { suppliers: [], warehouses: [], products: [] }, realtime: false });
  const [openId, open] = useOpenId();
  const [mode, setMode] = useState(null);
  const [filter, setFilter] = useState("todas");
  const chart = useChartTip();
  const rows = (Array.isArray(orders.data) ? orders.data : []).slice().sort((a, b) => String(b.orderedAt || b.createdAt).localeCompare(String(a.orderedAt || a.createdAt)));
  const month = todayKey().slice(0, 7);
  const monthRows = rows.filter((row) => limaDay(row.orderedAt || row.createdAt).startsWith(month));
  const pending = rows.filter((row) => OPEN.includes(row.status));
  const receipts = rows.flatMap((row) => (row.receipts || []).map((receipt) => ({ ...receipt, order: row })));
  const toPost = receipts.filter((receipt) => ["DRAFT", "VERIFIED"].includes(receipt.status));
  const bySupplier = useMemo(() => { const map = new Map(); monthRows.forEach((row) => { const key = row.supplier?.name || "Compra directa"; map.set(key, (map.get(key) || 0) + Number(row.total || 0)); }); return [...map.entries()].map(([name, value]) => ({ name: name.length > 20 ? `${name.slice(0, 19)}…` : name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 7); }, [monthRows]);
  const shown = filter === "pendientes" ? pending : filter === "recibir" ? rows.filter((row) => (row.receipts || []).some((r) => ["DRAFT", "VERIFIED"].includes(r.status))) : rows;
  const selected = rows.find((row) => String(row.id) === openId) || null;
  const refresh = () => orders.reload();

  if (orders.loading && !rows.length) return <LoadingSpinner label="Cargando compras…" />;
  return <>
    <PageHead title="Compras" tools={<><button className="rx-btn" type="button" onClick={() => setMode("order")}><ClipboardCheck />Pedido a proveedor</button><button className="rx-btn rx-btn--primary" type="button" onClick={() => setMode("quick")}><Plus />Compra que ya llegó</button></>}>Registra lo que compraste. El inventario solo cambia cuando la mercadería se recibe e ingresa al almacén; el costo de cada insumo se actualiza con la compra.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ShoppingCart} label="Compras del mes" value={soles(monthRows.reduce((s, r) => s + Number(r.total || 0), 0))} detail={`${monthRows.length} orden(es)`} />
      <Kpi label="Pedidos por recibir" value={pending.length} detail={pending.length ? "Esperan la mercadería" : "Nada pendiente"} />
      <Kpi icon={Warehouse} label="Recepciones por ingresar" value={toPost.length} detail="Verificar e ingresar al almacén" />
      <Kpi label="Proveedores" value={references.data?.suppliers?.length || 0} detail="Registrados" />
    </div>
    <div className="ow-split" style={{ marginBottom: 14 }}>
      <Card title="Órdenes de compra" flush tools={<Seg value={filter} onChange={setFilter} options={[["todas", "Todas", rows.length], ["pendientes", "Por recibir", pending.length], ["recibir", "Por ingresar", toPost.length]]} />}>
        {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Orden</th><th>Proveedor</th><th>Insumos</th><th>Fecha</th><th>Estado</th><th className="n">Total</th></tr></thead>
          <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
            <td><b className="rx-mono">{row.code}</b></td><td>{row.supplier?.name || "Compra directa"}</td><td className="mut" style={{ maxWidth: 280 }}>{(row.lines || []).map((line) => line.productName).join(", ")}</td>
            <td className="mut">{dayText(limaDay(row.orderedAt || row.createdAt))}</td><td><Status value={row.status} /></td><td className="n">{soles(row.total)}</td>
          </tr>)}</tbody></table></div> : <Empty icon={ShoppingCart} title="Sin órdenes en esta vista" />}
      </Card>
      <Card title="Compras del mes por proveedor" subtitle="S/"><ChartBox><HBars rows={bySupplier} name="S/" tip={chart.tip} x0={130} valueLabel={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`} tooltipLabel="Comprado" />{chart.layer}</ChartBox></Card>
    </div>
    {selected ? <OrderDrawer order={selected} references={references.data} onClose={() => open(null)} onChanged={refresh} /> : null}
    {mode === "quick" ? <QuickPurchase references={references.data} onClose={() => setMode(null)} onDone={() => { setMode(null); refresh(); }} /> : null}
    {mode === "order" ? <OrderForm references={references.data} onClose={() => setMode(null)} onDone={(order) => { setMode(null); refresh(); open(order.id); }} /> : null}
  </>;
}

function OrderDrawer({ order, references, onClose, onChanged }) {
  const detail = useFetch(`/purchasing/orders/${order.id}`, { initialData: order, realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [receiving, setReceiving] = useState(false);
  const data = detail.data || order;
  const canReceive = OPEN.includes(data.status);
  const act = (receipt, action) => run(async () => { await api(`/purchasing/receipts/${receipt.id}/${action}`, { method: "POST", body: {} }); show(action === "verify" ? "Recepción verificada. Ya puede ingresar al almacén." : "Mercadería ingresada: costo y kardex actualizados."); await detail.reload(); onChanged(); });
  if (receiving) return <ReceiptForm order={data} references={references} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); detail.reload(); onChanged(); }} />;
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${data.code} · ${data.supplier?.name || "Compra directa"}`} title={soles(data.total)} subtitle={`Ordenada ${whenText(data.orderedAt || data.createdAt)} · entrega ${data.expectedAt ? dayText(String(data.expectedAt).slice(0, 10)) : "sin fecha"}`}
    footer={<><button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>{canReceive ? <button className="rx-btn rx-btn--primary" type="button" onClick={() => setReceiving(true)}><PackageCheck />Registrar recepción</button> : null}</>}>
    <div><Status value={data.status} /></div>
    <section className="rx-sec"><h3>Insumos pedidos</h3><div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Insumo</th><th className="n">Pedido</th><th className="n">Aceptado</th><th className="n">Pendiente</th><th className="n">Subtotal</th></tr></thead>
      <tbody>{(data.lines || []).map((line) => <tr key={line.id}><td>{line.productName}<small className="mut" style={{ display: "block" }}>{line.presentationName || line.presentationUnitSymbol || ""}</small></td><td className="n">{qty(line.orderedQuantity)}</td><td className="n">{qty(line.acceptedPresentationQuantity)}</td><td className="n">{qty(line.remainingQuantity)}</td><td className="n">{soles(Number(line.orderedQuantity) * Number(line.unitCost))}</td></tr>)}</tbody></table></div></section>
    <section className="rx-sec"><h3>Recepciones</h3>{(data.receipts || []).length ? <ul className="rx-list">{data.receipts.map((receipt) => <li key={receipt.id}><div className="grow"><b>{receipt.code}</b><small>{receipt.warehouseName} · {whenText(receipt.receivedAt)}</small></div><Status value={receipt.status} />
      {receipt.status === "DRAFT" ? <button className="rx-btn rx-btn--sm" type="button" disabled={busy} onClick={() => act(receipt, "verify")}>Verificar</button> : null}
      {receipt.status === "VERIFIED" ? <button className="rx-btn rx-btn--primary rx-btn--sm" type="button" disabled={busy} onClick={() => act(receipt, "post")}>Ingresar al almacén</button> : null}
    </li>)}</ul> : <p className="mut" style={{ margin: 0 }}>Aún no llega nada de este pedido.</p>}</section>
    {data.notes ? <Alert tone="info">{data.notes}</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function QuickPurchase({ references, onClose, onDone }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const refs = references || { suppliers: [], warehouses: [], products: [] };
  const general = refs.warehouses.find((item) => item.code === "GENERAL");
  const [form, setForm] = useState({ productName: "", quantity: "", purchaseUnit: "", customFactor: "", totalPaid: "", supplierId: "", destination: "GENERAL", lotCode: "", expiresOn: "", notes: "" });
  const selected = refs.products.find((item) => item.name.toLowerCase() === form.productName.trim().toLowerCase());
  const choices = unitChoices(selected?.baseUnitSymbol);
  const choice = choices.find((item) => item.value === form.purchaseUnit) || choices[0];
  const factor = choice?.factor ?? Number(form.customFactor || 0);
  const baseQuantity = Number(form.quantity || 0) * Number(factor || 0);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const submit = () => {
    if (!selected) { setError("Escribe el nombre y elige un insumo de la lista (así no se duplica y las recetas siguen conectadas)."); return; }
    if (!general) { setError("No se encontró el Almacén general."); return; }
    if (!(baseQuantity > 0) || !(Number(form.totalPaid) >= 0)) { setError("Revisa la cantidad, la unidad y el total pagado."); return; }
    if (selected.trackExpiry && !form.expiresOn) { setError("Este insumo controla vencimiento: pon la fecha del empaque."); return; }
    run(async () => {
      const total = Number(form.totalPaid || 0);
      const order = await api("/purchasing/orders", { method: "POST", body: { quick: true, supplierId: form.supplierId ? Number(form.supplierId) : null, notes: form.notes || "Compra recibida directamente", lines: [{ productId: Number(selected.id), presentationId: null, orderedQuantity: baseQuantity, unitCost: baseQuantity ? total / baseQuantity : 0 }] } });
      const receipt = await api(`/purchasing/orders/${order.id}/receipts`, { method: "POST", body: { warehouseId: Number(general.id), observation: form.notes, lines: [{ orderLineId: Number(order.lines[0].id), receivedPresentationQuantity: baseQuantity, measurementMode: "DIRECT", decision: "ACCEPTED", lotCode: selected.trackLots ? (form.lotCode.trim() || `COMPRA-${todayKey()}-${order.id}`) : null, expiresOn: form.expiresOn || null }] } });
      await api(`/purchasing/receipts/${receipt.id}/verify`, { method: "POST", body: { observation: "Verificación automática de compra rápida" } });
      await api(`/purchasing/receipts/${receipt.id}/post`, { method: "POST", body: {} });
      let text = "quedó en el Almacén general.";
      if (form.destination !== "GENERAL") {
        const transferRefs = await api("/transfers/references");
        const destination = transferRefs.warehouses.find((item) => item.code === form.destination);
        const candidates = transferRefs.stock.filter((item) => item.warehouseCode === "GENERAL" && Number(item.productId) === Number(selected.id) && Number(item.available) > 0).sort((a, b) => String(a.expiresOn || "9999").localeCompare(String(b.expiresOn || "9999")));
        let remaining = baseQuantity; const lines = [];
        for (const stock of candidates) { const amount = Math.min(remaining, Number(stock.available)); if (amount > 0) lines.push({ productId: Number(stock.productId), lotId: stock.lotId ? Number(stock.lotId) : null, quantity: amount }); remaining -= amount; if (remaining <= 0.000001) break; }
        if (!destination || remaining > 0.000001) throw new Error("La compra ingresó al Almacén general, pero no se pudo preparar el envío. Envíala desde Distribución a las áreas.");
        const transfer = await api("/transfers", { method: "POST", body: { fromWarehouseId: Number(general.id), toWarehouseId: Number(destination.id), observation: `Distribución de compra ${order.code}`, lines } });
        await api(`/transfers/${transfer.id}/send`, { method: "POST", body: {} });
        text = `se envió a ${destination.name}; el área debe confirmar que la recibió.`;
      }
      show(`${selected.name}: compra registrada y ${text}`); onDone();
    });
  };
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Camino rápido" title="Compra que ya llegó" subtitle="Una sola pantalla: el ingreso, la verificación y el kardex se hacen solos"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}>{form.destination === "GENERAL" ? <PackageCheck /> : <Send />}Confirmar compra</button></>}>
    <div className="ow-form">
      <Field label="¿Qué compraste?" full><input className="rx-input" list="owner-purchase-products" value={form.productName} onChange={(event) => { const product = refs.products.find((item) => item.name.toLowerCase() === event.target.value.trim().toLowerCase()); set({ productName: event.target.value, purchaseUnit: product ? unitChoices(product.baseUnitSymbol)[0].value : "" }); }} placeholder="Escribe: arroz, pisco, limón…" /><datalist id="owner-purchase-products">{refs.products.map((item) => <option key={item.id} value={item.name} />)}</datalist></Field>
      <Field label="Cantidad"><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.quantity} onChange={(event) => set({ quantity: event.target.value })} /></Field>
      <Field label="¿En qué unidad?"><select className="rx-select" value={form.purchaseUnit || choice?.value || ""} disabled={!selected} onChange={(event) => set({ purchaseUnit: event.target.value })}>{choices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
      {choice?.value === "custom" ? <Field label={`Contenido de cada empaque (${selected?.baseUnitSymbol || "base"})`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.customFactor} onChange={(event) => set({ customFactor: event.target.value })} /></Field> : null}
      <Field label="Total pagado (S/)"><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={form.totalPaid} onChange={(event) => set({ totalPaid: event.target.value })} /></Field>
      <Field label="Proveedor"><select className="rx-select" value={form.supplierId} onChange={(event) => set({ supplierId: event.target.value })}><option value="">Mercado / compra directa</option>{refs.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="¿Adónde va?"><select className="rx-select" value={form.destination} onChange={(event) => set({ destination: event.target.value })}><option value="GENERAL">Almacén general</option><option value="RESTAURANTE">Enviar a Cocina</option><option value="BARTENDER">Enviar a Bar</option></select></Field>
      {selected?.trackLots ? <Field label="Lote (se genera si lo dejas vacío)"><input className="rx-input" value={form.lotCode} onChange={(event) => set({ lotCode: event.target.value })} /></Field> : null}
      {selected?.trackExpiry ? <Field label="Vencimiento"><input className="rx-input" type="date" value={form.expiresOn} onChange={(event) => set({ expiresOn: event.target.value })} /></Field> : null}
      <Field label="Nota (opcional)" full><input className="rx-input" value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Ej. boleta 001-2345" /></Field>
    </div>
    {selected && baseQuantity > 0 ? <Alert tone="info">Se registrarán <b>{qty(baseQuantity)} {selected.baseUnitSymbol}</b> a {soles(Number(form.totalPaid || 0) / baseQuantity)} por {selected.baseUnitSymbol}.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

const blankLine = () => ({ productName: "", productId: "", presentationId: "", orderedQuantity: "1", unitCost: "0" });
function OrderForm({ references, onClose, onDone }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const refs = references || { suppliers: [], warehouses: [], products: [] };
  const [form, setForm] = useState({ supplierId: "", expectedAt: "", notes: "", lines: [blankLine()] });
  const total = form.lines.reduce((sum, line) => sum + Number(line.orderedQuantity || 0) * Number(line.unitCost || 0), 0);
  const setLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => (row === index ? { ...line, ...patch } : line)) }));
  const typeProduct = (index, value) => { const product = refs.products.find((item) => item.name.toLowerCase() === value.trim().toLowerCase()); const presentation = product?.presentations?.[0]; setLine(index, product ? { productName: value, productId: product.id, presentationId: presentation?.id || "", unitCost: String(presentation?.purchaseCost ?? product.cost ?? 0) } : { productName: value, productId: "", presentationId: "" }); };
  const submit = () => {
    if (!form.supplierId) { setError("Elige el proveedor."); return; }
    if (form.lines.some((line) => !line.productId || !line.presentationId || !(Number(line.orderedQuantity) > 0))) { setError("Completa cada insumo con su presentación y cantidad."); return; }
    run(async () => { const order = await api("/purchasing/orders", { method: "POST", body: { ...form, supplierId: Number(form.supplierId), lines: form.lines.map((line) => ({ productId: Number(line.productId), presentationId: Number(line.presentationId), orderedQuantity: Number(line.orderedQuantity), unitCost: Number(line.unitCost) })) } }); show(`Orden ${order.code} creada. El stock cambia cuando llegue.`); onDone(order); });
  };
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Pedido a proveedor" title="Nueva orden de compra" subtitle="Registrar lo pedido no mueve el stock"
    footer={<><span className="ow-amount" style={{ marginRight: "auto" }}>Total {soles(total)}</span><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}><ShoppingCart />Crear orden</button></>}>
    <div className="ow-form">
      <Field label="Proveedor"><select className="rx-select" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Elige</option>{refs.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Fecha de entrega esperada"><input className="rx-input" type="date" value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} /></Field>
      <Field label="Observación" full><input className="rx-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Condiciones, número de cotización…" /></Field>
    </div>
    <section className="rx-sec"><h3>Insumos</h3><div style={{ display: "grid", gap: 6 }}>{form.lines.map((line, index) => { const product = refs.products.find((item) => String(item.id) === String(line.productId)); return <div key={index} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.1fr .7fr .8fr 32px", gap: 6, alignItems: "end" }}>
      <Field label={index ? " " : "Insumo"}><input className="rx-input" list={`owner-order-products-${index}`} value={line.productName} onChange={(event) => typeProduct(index, event.target.value)} placeholder="Escribe para buscar" /><datalist id={`owner-order-products-${index}`}>{refs.products.map((item) => <option key={item.id} value={item.name} />)}</datalist></Field>
      <Field label={index ? " " : "Presentación"}><select className="rx-select" value={line.presentationId} onChange={(event) => setLine(index, { presentationId: event.target.value })}><option value="">—</option>{(product?.presentations || []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unitSymbol})</option>)}</select></Field>
      <Field label={index ? " " : "Cantidad"}><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.orderedQuantity} onChange={(event) => setLine(index, { orderedQuantity: event.target.value })} /></Field>
      <Field label={index ? " " : "Costo c/u (S/)"}><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLine(index, { unitCost: event.target.value })} /></Field>
      <button className="rx-close" type="button" aria-label="Quitar" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}><Trash2 size={14} /></button>
    </div>; })}<button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" style={{ justifySelf: "start" }} onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}><Plus />Agregar insumo</button></div></section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function ReceiptForm({ order, references, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const refs = references || { warehouses: [] };
  const available = (order.lines || []).filter((line) => Number(line.remainingQuantity) > 0);
  const newLine = (orderLine) => ({ orderLineId: orderLine?.id || "", receivedPresentationQuantity: orderLine?.remainingQuantity || "", measurementMode: "DIRECT", actualBaseQuantity: "", individualText: "", decision: "ACCEPTED", acceptedBaseQuantity: "", lotCode: "", expiresOn: "", observation: "" });
  const [form, setForm] = useState({ warehouseId: refs.warehouses.find((item) => item.code === "GENERAL")?.id || refs.warehouses[0]?.id || "", observation: "", lines: available.length ? [newLine(available[0])] : [] });
  const setLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => (row === index ? { ...line, ...patch } : line)) }));
  const submit = () => run(async () => {
    const body = { ...form, warehouseId: Number(form.warehouseId), lines: form.lines.map(({ individualText, ...line }) => ({ ...line, orderLineId: Number(line.orderLineId), receivedPresentationQuantity: Number(line.receivedPresentationQuantity), actualBaseQuantity: Number(line.actualBaseQuantity || 0), acceptedBaseQuantity: Number(line.acceptedBaseQuantity || 0), individualMeasurements: individualText.split(/[;,\n]+/).map((value) => Number(value.trim())).filter((value) => value > 0) })) };
    await api(`/purchasing/orders/${order.id}/receipts`, { method: "POST", body }); show("Recepción guardada. Ahora verifícala e ingrésala al almacén."); onDone();
  });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${order.code} · ${order.supplier?.name || ""}`} title="Recepción física" subtitle="Registra solo lo que llegó; puedes dividir un insumo en varios lotes"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Volver</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy || !form.lines.length}><Scale />Guardar recepción</button></>}>
    <div className="ow-form"><Field label="Almacén de ingreso"><select className="rx-select" value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}>{refs.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Observación"><input className="rx-input" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} /></Field></div>
    {form.lines.map((line, index) => { const orderLine = order.lines.find((item) => String(item.id) === String(line.orderLineId)); const theoretical = Number(line.receivedPresentationQuantity || 0) * Number(orderLine?.presentationFactor || 1); const values = line.individualText.split(/[;,\n]+/).map((v) => Number(v.trim())).filter((v) => v > 0); const actual = line.measurementMode === "INDIVIDUAL" ? values.reduce((a, b) => a + b, 0) : line.measurementMode === "TOTAL" ? Number(line.actualBaseQuantity || 0) : theoretical; return <section className="rx-sec" key={index}>
      <h3 style={{ display: "flex", justifyContent: "space-between" }}>Lote {index + 1}<button className="rx-close" type="button" aria-label="Quitar lote" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}><Trash2 size={14} /></button></h3>
      <div className="ow-form">
        <Field label="Insumo del pedido"><select className="rx-select" value={line.orderLineId} onChange={(event) => setLine(index, newLine(order.lines.find((item) => String(item.id) === event.target.value)))}>{available.map((item) => <option key={item.id} value={item.id}>{item.productName} · faltan {qty(item.remainingQuantity)}</option>)}</select></Field>
        <Field label={`Cantidad recibida (${orderLine?.presentationName || "presentación"})`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.receivedPresentationQuantity} onChange={(event) => setLine(index, { receivedPresentationQuantity: event.target.value })} /></Field>
        <Field label="Cómo se midió"><select className="rx-select" value={line.measurementMode} onChange={(event) => setLine(index, { measurementMode: event.target.value })}><option value="DIRECT">Cantidad del empaque</option><option value="TOTAL">Peso o volumen total real</option><option value="INDIVIDUAL">Pesadas una por una</option></select></Field>
        <Field label="Resultado"><select className="rx-select" value={line.decision} onChange={(event) => setLine(index, { decision: event.target.value })}><option value="ACCEPTED">Aceptado</option><option value="PARTIAL">Aceptado en parte</option><option value="REJECTED">Rechazado</option></select></Field>
        {line.measurementMode === "TOTAL" ? <Field label={`Total real (${orderLine?.baseUnitSymbol || ""})`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.actualBaseQuantity} onChange={(event) => setLine(index, { actualBaseQuantity: event.target.value })} /></Field> : null}
        {line.measurementMode === "INDIVIDUAL" ? <Field label={`Pesadas (${orderLine?.baseUnitSymbol || ""}), separadas por coma`} full><input className="rx-input rx-mono" value={line.individualText} onChange={(event) => setLine(index, { individualText: event.target.value })} placeholder="1.85, 2.10, 1.92…" /></Field> : null}
        {line.decision === "PARTIAL" ? <Field label={`Aceptado real (${orderLine?.baseUnitSymbol || ""})`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.acceptedBaseQuantity} onChange={(event) => setLine(index, { acceptedBaseQuantity: event.target.value })} /></Field> : null}
        <Field label={`Lote${orderLine?.trackLots ? " (obligatorio)" : ""}`}><input className="rx-input" value={line.lotCode} onChange={(event) => setLine(index, { lotCode: event.target.value })} /></Field>
        <Field label={`Vencimiento${orderLine?.trackExpiry ? " (obligatorio)" : ""}`}><input className="rx-input" type="date" value={line.expiresOn} onChange={(event) => setLine(index, { expiresOn: event.target.value })} /></Field>
        <Field label="Observación" full><input className="rx-input" value={line.observation} onChange={(event) => setLine(index, { observation: event.target.value })} placeholder={line.decision === "REJECTED" ? "Motivo del rechazo" : "Estado del producto"} /></Field>
      </div>
      <p className="ow-mini">Teórico {qty(theoretical)} {orderLine?.baseUnitSymbol} · real {qty(actual)} {orderLine?.baseUnitSymbol} · diferencia <b style={{ color: Math.abs(actual - theoretical) > 0.000001 ? "var(--crit)" : undefined }}>{qty(actual - theoretical)}</b></p>
    </section>; })}
    <div className="ow-toolbar">{available.map((item) => <button key={item.id} className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={() => setForm({ ...form, lines: [...form.lines, newLine(item)] })}><Plus />Otro lote de {item.productName}</button>)}</div>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
