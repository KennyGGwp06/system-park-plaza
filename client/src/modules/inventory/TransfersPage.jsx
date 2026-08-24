import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, CheckCircle2, PackageCheck, Plus, RefreshCw, Send, Trash2, Warehouse } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Alert, Button, Input, PageHeader, Select } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const q = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 6 });
const when = (value) => value ? new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "—";
const routeAllowed = (from, to) => new Set(["GENERAL>RESTAURANTE", "GENERAL>BARTENDER", "RESTAURANTE>BARTENDER", "BARTENDER>RESTAURANTE"]).has(`${from}>${to}`);

export function TransfersPage() {
  const { user } = useAuth();
  const { data: transfers = [], loading, error, reload } = useFetch("/transfers", { initialData: [] });
  const { data: references = { warehouses: [], stock: [] }, reload: reloadReferences } = useFetch("/transfers/references", { initialData: { warehouses: [], stock: [] } });
  const { data: overview = { warehouses: [], definitions: {} }, reload: reloadOverview } = useFetch("/transfers/stock", { initialData: { warehouses: [], definitions: {} } });
  const [mode, setMode] = useState("LIST");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  async function refresh() { await Promise.all([reload(), reloadReferences(), reloadOverview()]); }
  async function action(transfer, name, body = {}) {
    setSaving(true); setFailure("");
    try {
      await api(`/transfers/${transfer.id}/${name}`, { method: "POST", body });
      setMessage(name === "send" ? "Transferencia enviada: el stock ahora está en tránsito." : name === "cancel" ? "Borrador cancelado y stock comprometido liberado." : "Operación completada.");
      setMode("LIST"); setSelected(null); await refresh();
    } catch (err) { setFailure(err.message); } finally { setSaving(false); }
  }
  function canOperate(code) { return user?.role === "ADMINISTRADOR" || (user?.role === "RESTAURANTE" && code === "RESTAURANTE") || (user?.role === "BARTENDER" && code === "BARTENDER"); }

  if (loading) return <LoadingSpinner />;
  if (error) return <Alert tone="danger" title="No se pudieron cargar las transferencias">{error.message}</Alert>;
  const transit = overview.warehouses.find((item) => item.warehouseCode === "TRANSIT");
  const discrepancy = overview.warehouses.find((item) => item.warehouseCode === "DISCREPANCY");
  const committed = overview.warehouses.reduce((sum, item) => sum + Number(item.committed || 0), 0);

  return <div>
    <Toast message={message} onClose={() => setMessage("")} />
    <PageHeader eyebrow="Inventario inteligente" title="Almacenes y transferencias" description="El origen despacha a tránsito. Un usuario distinto confirma la cantidad física que realmente llegó al destino." actions={<>
      {mode !== "LIST" ? <Button variant="secondary" icon={ArrowLeft} onClick={() => { setMode("LIST"); setSelected(null); }}>Volver</Button> : null}
      <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Actualizar</Button>
      {mode === "LIST" ? <Button icon={Plus} onClick={() => setMode("CREATE")}>Nueva transferencia</Button> : null}
    </>} />
    <Flow />
    {failure ? <div className="mb-4"><Alert tone="danger" title="No se completó la operación">{failure}</Alert></div> : null}
    {mode === "LIST" ? <>
      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Transferencias" value={transfers.length} help="Historial total" />
        <Metric label="Comprometido" value={q(committed)} help={overview.definitions?.committed} />
        <Metric label="En tránsito" value={q(transit?.onHand)} help={overview.definitions?.inTransit} tone={Number(transit?.onHand) > 0 ? "gold" : "green"} />
        <Metric label="Diferencias" value={q(discrepancy?.onHand)} help="Faltantes pendientes de investigación" tone={Number(discrepancy?.onHand) > 0 ? "danger" : "green"} />
      </section>
      <WarehouseSummary rows={overview.warehouses.filter((item) => ["GENERAL", "RESTAURANTE", "BARTENDER"].includes(item.warehouseCode))} definition={overview.definitions?.available} />
      <TransferList transfers={transfers} user={user} canOperate={canOperate} saving={saving} onSend={(item) => action(item, "send")} onCancel={(item) => action(item, "cancel", { observation: "Cancelada antes del envío" })} onReceive={(item) => { setSelected(item); setMode("RECEIVE"); setFailure(""); }} />
    </> : null}
    {mode === "CREATE" ? <CreateTransfer references={references} user={user} saving={saving} setSaving={setSaving} onError={setFailure} onCreated={async (item) => { setMessage(`${item.code} creada; el stock quedó comprometido.`); setMode("LIST"); await refresh(); }} /> : null}
    {mode === "RECEIVE" && selected ? <ReceiveTransfer transfer={selected} saving={saving} onError={setFailure} onReceive={(body) => action(selected, "receive", body)} onReject={(body) => action(selected, "reject", body)} /> : null}
  </div>;
}

function Flow() {
  return <section className="mb-5 overflow-x-auto rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex min-w-[650px] items-center justify-between gap-2 text-xs font-black text-park-dark">{["BORRADOR", "ENVIADA", "EN TRÁNSITO", "RECIBIDA", "MOVIMIENTOS AUDITADOS"].map((label, index, rows) => <div className="flex flex-1 items-center gap-2" key={label}><span className="grid h-7 w-7 place-items-center rounded-full bg-park-green text-white">{index + 1}</span><span>{label}</span>{index < rows.length - 1 ? <ArrowRight className="ml-auto text-park-muted" size={16} /> : null}</div>)}</div></section>;
}

function Metric({ label, value, help, tone = "green" }) {
  const colors = tone === "danger" ? "bg-red-50 text-park-danger" : tone === "gold" ? "bg-park-gold-soft text-park-black" : "bg-park-green-soft text-park-green";
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${colors}`}><Warehouse size={18} /></div><p className="text-2xl font-black text-park-dark">{value}</p><p className="text-sm font-bold text-park-dark">{label}</p><p className="mt-1 text-xs text-park-muted">{help}</p></article>;
}

function WarehouseSummary({ rows, definition }) {
  return <section className="mb-5 rounded-card border border-park-border bg-white p-4 shadow-card"><div className="mb-3"><h2 className="font-black text-park-dark">Existencias por ubicación</h2><p className="text-xs text-park-muted">Disponible = {definition}</p></div><div className="grid gap-3 md:grid-cols-3">{rows.map((row) => <article className="rounded-lg bg-park-bg p-3" key={row.warehouseId}><strong className="text-sm text-park-dark">{row.warehouseName}</strong><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><Data label="Físico" value={q(row.onHand)} /><Data label="Comprometido" value={q(row.committed)} /><Data label="Disponible" value={q(row.available)} /></div></article>)}</div></section>;
}

function TransferList({ transfers, user, canOperate, saving, onSend, onCancel, onReceive }) {
  if (!transfers.length) return <EmptyState title="No hay transferencias" description="Crea un borrador para comprometer stock sin retirarlo todavía del origen." />;
  return <section className="grid gap-4 xl:grid-cols-2">{transfers.map((item) => {
    const destinationAction = item.status === "SENT" && Number(item.sentBy) !== Number(user.id) && canOperate(item.toWarehouseCode);
    return <article className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-5" key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">{item.code}</p><h2 className="font-black text-park-dark">{item.fromWarehouseName} <ArrowRight className="inline" size={16} /> {item.toWarehouseName}</h2><p className="mt-1 text-xs text-park-muted">Creada {when(item.createdAt)} por {item.requestedUser?.name || "Sistema"}</p></div><StatusBadge value={item.status} /></div>
      <div className="mt-4 space-y-2">{item.lines.map((line) => <div className="rounded-lg bg-park-bg p-3" key={line.id}><div className="flex justify-between gap-2 text-sm"><strong>{line.productName}</strong><span>{line.lotCode ? `Lote ${line.lotCode}` : "Sin lote"}</span></div><div className="mt-1 grid grid-cols-3 gap-2 text-xs text-park-muted"><span>Solicitado <b>{q(line.requestedQuantity)} {line.unitSymbol}</b></span><span>Enviado <b>{line.sentQuantity == null ? "—" : `${q(line.sentQuantity)} ${line.unitSymbol}`}</b></span><span>Recibido <b>{line.receivedQuantity == null ? "—" : `${q(line.receivedQuantity)} ${line.unitSymbol}`}</b></span></div></div>)}</div>
      {item.alerts.length ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong className="flex items-center gap-2"><AlertTriangle size={16} /> Diferencia detectada</strong>{item.alerts.map((alert) => <p className="mt-1 text-xs" key={alert.id}>{alert.alertType === "SHORTAGE" ? "Faltante" : "Sobrante"}: {q(Math.abs(alert.differenceQuantity))}</p>)}</div> : null}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-park-border pt-4">{item.status === "DRAFT" && canOperate(item.fromWarehouseCode) ? <><Button size="sm" icon={Send} loading={saving} onClick={() => onSend(item)}>Enviar</Button><Button size="sm" variant="danger" icon={Ban} loading={saving} onClick={() => onCancel(item)}>Cancelar</Button></> : null}{destinationAction ? <Button size="sm" variant="gold" icon={PackageCheck} onClick={() => onReceive(item)}>Confirmar recepción</Button> : null}{item.status === "SENT" && Number(item.sentBy) === Number(user.id) ? <span className="text-xs font-bold text-park-muted">Esperando confirmación de otro usuario en {item.toWarehouseName}</span> : null}</div>
      {item.sentUser ? <p className="mt-3 text-xs text-park-muted">Emisor: {item.sentUser.name} · {item.sentShiftCode} · {when(item.sentAt)}</p> : null}{item.receivedUser ? <p className="mt-1 text-xs text-park-muted">Receptor: {item.receivedUser.name} · {item.receivedShiftCode} · {when(item.receivedAt || item.rejectedAt)}</p> : null}
    </article>;
  })}</section>;
}

function CreateTransfer({ references, user, saving, setSaving, onError, onCreated }) {
  const allowedOrigins = references.warehouses.filter((item) => user.role === "ADMINISTRADOR" || (user.role === "RESTAURANTE" && item.code === "RESTAURANTE") || (user.role === "BARTENDER" && item.code === "BARTENDER"));
  const [form, setForm] = useState({ fromWarehouseId: allowedOrigins[0]?.id || "", toWarehouseId: "", observation: "", lines: [{ stockKey: "", quantity: "" }] });
  const origin = references.warehouses.find((item) => Number(item.id) === Number(form.fromWarehouseId));
  const destinations = references.warehouses.filter((item) => routeAllowed(origin?.code, item.code));
  const originStock = references.stock.filter((item) => Number(item.warehouseId) === Number(form.fromWarehouseId) && Number(item.available) > 0);
  const updateLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => row === index ? { ...line, ...patch } : line) }));
  async function submit(event) {
    event.preventDefault(); setSaving(true); onError("");
    try {
      const lines=form.lines.map((line)=>{const stock=originStock.find((item)=>`${item.productId}:${item.lotId || "base"}`===line.stockKey); return {productId:Number(stock?.productId),lotId:stock?.lotId?Number(stock.lotId):null,quantity:Number(line.quantity)};});
      await onCreated(await api("/transfers", { method: "POST", body: { ...form, fromWarehouseId: Number(form.fromWarehouseId), toWarehouseId: Number(form.toWarehouseId), lines } }));
    } catch (error) { onError(error.message); } finally { setSaving(false); }
  }
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}><h2 className="text-xl font-black text-park-dark">Nueva transferencia</h2><p className="mb-5 text-sm text-park-muted">El borrador compromete stock; el envío lo mueve a Tránsito.</p><div className="grid gap-4 md:grid-cols-2"><Select label="Origen" value={form.fromWarehouseId} onChange={(event) => setForm({ ...form, fromWarehouseId: event.target.value, toWarehouseId: "", lines: [{ stockKey: "", quantity: "" }] })} required><option value="">Seleccionar</option>{allowedOrigins.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select label="Destino" value={form.toWarehouseId} onChange={(event) => setForm({ ...form, toWarehouseId: event.target.value })} required><option value="">Seleccionar</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div className="mt-4"><Input label="Observación" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} placeholder="Motivo o responsable del traslado" /></div>
    <div className="mt-5 space-y-3">{form.lines.map((line,index)=>{const selected=originStock.find((item)=>`${item.productId}:${item.lotId || "base"}`===line.stockKey); return <div className="grid gap-3 rounded-card border border-park-border bg-park-bg p-4 md:grid-cols-[1fr_180px_auto]" key={index}><Select label="Producto / lote disponible" value={line.stockKey} onChange={(event)=>updateLine(index,{stockKey:event.target.value})} required><option value="">Seleccionar</option>{originStock.map((item)=><option key={`${item.productId}:${item.lotId || "base"}`} value={`${item.productId}:${item.lotId || "base"}`}>{item.productName}{item.lotCode?` · lote ${item.lotCode}`:""} · disponible {q(item.available)} {item.unitSymbol}</option>)}</Select><Input label={`Cantidad ${selected ? `(${selected.unitSymbol})` : ""}`} type="number" min="0.000001" max={selected?.available} step="any" value={line.quantity} onChange={(event)=>updateLine(index,{quantity:event.target.value})} required/><div className="flex items-end"><Button className="w-full" type="button" variant="ghost" icon={Trash2} disabled={form.lines.length===1} onClick={()=>setForm({...form,lines:form.lines.filter((_,row)=>row!==index)})}>Quitar</Button></div></div>})}</div><div className="mt-4 flex flex-wrap justify-between gap-3"><Button type="button" variant="secondary" icon={Plus} onClick={()=>setForm({...form,lines:[...form.lines,{stockKey:"",quantity:""}]})}>Agregar producto</Button><Button loading={saving}>Guardar borrador</Button></div></form>;
}

function ReceiveTransfer({ transfer, saving, onError, onReceive, onReject }) {
  const [form,setForm]=useState({shiftCode:"",observation:"",lines:transfer.lines.map((line)=>({lineId:line.id,receivedQuantity:String(line.sentQuantity),observation:""}))});
  const [rejectReason,setRejectReason]=useState("");
  const updateLine=(index,patch)=>setForm((current)=>({...current,lines:current.lines.map((line,row)=>row===index?{...line,...patch}:line)}));
  const submit=(event)=>{event.preventDefault();onError("");onReceive({...form,lines:form.lines.map((line)=>({...line,receivedQuantity:Number(line.receivedQuantity)}))});};
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}><p className="text-xs font-black uppercase tracking-wide text-park-gold">{transfer.code}</p><h2 className="text-xl font-black text-park-dark">Confirmar llegada a {transfer.toWarehouseName}</h2><p className="mb-5 text-sm text-park-muted">Cuenta físicamente. No copies la cantidad enviada si llegó algo diferente.</p><Alert tone="warning" title="Separación de responsabilidades">El emisor fue {transfer.sentUser?.name}. La recepción debe confirmarla otra persona del área destino.</Alert><div className="mt-5 space-y-3">{form.lines.map((line,index)=>{const source=transfer.lines[index];const diff=Number(line.receivedQuantity||0)-Number(source.sentQuantity||0);return <div className="rounded-card border border-park-border p-4" key={line.lineId}><div className="grid gap-3 md:grid-cols-2"><div><span className="text-sm font-black text-park-dark">{source.productName}</span><p className="text-xs text-park-muted">Enviado: {q(source.sentQuantity)} {source.unitSymbol}{source.lotCode?` · lote ${source.lotCode}`:""}</p></div><Input label={`Cantidad realmente recibida (${source.unitSymbol})`} type="number" min="0" step="any" value={line.receivedQuantity} onChange={(event)=>updateLine(index,{receivedQuantity:event.target.value})} required/></div><p className={`mt-2 text-xs font-bold ${Math.abs(diff)>0.000001?"text-park-danger":"text-park-green"}`}>{Math.abs(diff)<=0.000001?"Cantidad conforme":`${diff<0?"Faltante":"Sobrante"}: ${q(Math.abs(diff))} ${source.unitSymbol} — se creará una alerta`}</p></div>})}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><Input label="Turno (opcional; se detecta automáticamente)" value={form.shiftCode} onChange={(event)=>setForm({...form,shiftCode:event.target.value})}/><Input label="Observación de recepción" value={form.observation} onChange={(event)=>setForm({...form,observation:event.target.value})}/></div><div className="mt-5 flex flex-col gap-3 border-t border-park-border pt-5 md:flex-row md:items-end md:justify-between"><div className="flex-1"><Input label="Motivo si rechazas toda la transferencia" value={rejectReason} onChange={(event)=>setRejectReason(event.target.value)} placeholder="Daño, lote incorrecto, temperatura..."/></div><div className="flex flex-wrap gap-2"><Button type="button" variant="danger" icon={Ban} loading={saving} disabled={!rejectReason.trim()} onClick={()=>onReject({observation:rejectReason,shiftCode:form.shiftCode})}>Rechazar todo</Button><Button icon={CheckCircle2} loading={saving}>Confirmar cantidades</Button></div></div></form>;
}

function Data({label,value}){return <div><span className="block text-park-muted">{label}</span><strong className="text-park-dark">{value}</strong></div>}
