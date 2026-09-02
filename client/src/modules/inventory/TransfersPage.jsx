import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, CheckCircle2, PackageCheck, Plus, RefreshCw, Search, Send, Trash2, Warehouse } from "lucide-react";
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
  const [historyFilter, setHistoryFilter] = useState("PENDING");

  async function refresh() { await Promise.all([reload(), reloadReferences(), reloadOverview()]); }
  async function action(transfer, name, body = {}) {
    setSaving(true); setFailure("");
    try {
      await api(`/transfers/${transfer.id}/${name}`, { method: "POST", body });
      setMessage(name === "send" ? "Transferencia enviada: el stock ahora está en tránsito." : name === "cancel" ? "Borrador cancelado y stock comprometido liberado." : "Operación completada.");
      setMode("LIST"); setSelected(null); await refresh();
    } catch (err) { setFailure(err.message); } finally { setSaving(false); }
  }
  function canOperate(code) { return ["SUPERADMIN", "ADMINISTRADOR"].includes(user?.role) || (user?.role === "RESTAURANTE" && code === "RESTAURANTE") || (user?.role === "BARTENDER" && code === "BARTENDER"); }

  if (loading) return <LoadingSpinner />;
  if (error) return <Alert tone="danger" title="No se pudieron cargar las transferencias">{error.message}</Alert>;
  const drafts = transfers.filter((item) => item.status === "DRAFT").length;
  const inTransit = transfers.filter((item) => item.status === "SENT").length;
  const differences = transfers.filter((item) => item.status === "RECEIVED_WITH_DIFFERENCE" || item.alerts?.some((alert) => alert.status !== "RESOLVED")).length;
  const visibleTransfers = transfers.filter((item) => historyFilter === "PENDING" ? ["DRAFT", "SENT"].includes(item.status) : historyFilter === "DONE" ? !["DRAFT", "SENT"].includes(item.status) : true);

  return <div>
    <Toast message={message} onClose={() => setMessage("")} />
    <PageHeader eyebrow="Inventario · distribución" title="Distribuir insumos" description="Elige qué producto enviar y a qué área. El sistema selecciona primero el lote que vence antes." actions={<>
      {mode !== "LIST" ? <Button variant="secondary" icon={ArrowLeft} onClick={() => { setMode("LIST"); setSelected(null); }}>Volver</Button> : null}
      <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Actualizar</Button>
      {mode === "LIST" ? <Button icon={Plus} onClick={() => setMode("CREATE")}>Enviar insumos</Button> : null}
    </>} />
    <Flow />
    {failure ? <div className="mb-4"><Alert tone="danger" title="No se completó la operación">{failure}</Alert></div> : null}
    {mode === "LIST" ? <>
      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Productos almacenados" value={new Set(references.stock.filter((item) => Number(item.available) > 0).map((item) => item.productId)).size} help="Productos con existencia disponible" />
        <Metric label="Borradores antiguos" value={drafts} help="Envíos aún no despachados" tone={drafts ? "gold" : "green"} />
        <Metric label="Esperando recepción" value={inTransit} help="Restaurante o Bar deben confirmar" tone={inTransit ? "gold" : "green"} />
        <Metric label="Con diferencias" value={differences} help="Envíos con faltantes o sobrantes" tone={differences ? "danger" : "green"} />
      </section>
      <WarehouseSummary warehouses={references.warehouses} stock={references.stock} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-park-dark">Seguimiento de envíos</h2><p className="text-xs text-park-muted">Consulta primero lo que todavía necesita atención.</p></div><div className="flex rounded-xl border border-park-border bg-white p-1">{[["PENDING","Pendientes"],["DONE","Terminadas"],["ALL","Todas"]].map(([value,label]) => <button type="button" key={value} onClick={() => setHistoryFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-black ${historyFilter === value ? "bg-park-green text-white" : "text-park-muted"}`}>{label}</button>)}</div></div>
      <TransferList transfers={visibleTransfers} user={user} canOperate={canOperate} saving={saving} onSend={(item) => action(item, "send")} onCancel={(item) => action(item, "cancel", { observation: "Cancelada antes del envío" })} onReceive={(item) => { setSelected(item); setMode("RECEIVE"); setFailure(""); }} />
    </> : null}
    {mode === "CREATE" ? <CreateTransfer references={references} user={user} saving={saving} setSaving={setSaving} onError={setFailure} onCreated={async (item) => { setMessage(`${item.code} enviado. Ahora ${item.toWarehouseName} debe confirmar la recepción.`); setMode("LIST"); await refresh(); }} /> : null}
    {mode === "RECEIVE" && selected ? <ReceiveTransfer transfer={selected} saving={saving} onError={setFailure} onReceive={(body) => action(selected, "receive", body)} onReject={(body) => action(selected, "reject", body)} /> : null}
  </div>;
}

function Flow() {
  return <section className="mb-5 overflow-x-auto rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex min-w-[520px] items-center justify-between gap-2 text-xs font-black text-park-dark">{["ELIGE PRODUCTO Y DESTINO", "EL SISTEMA LO ENVÍA", "EL ÁREA CONFIRMA"].map((label, index, rows) => <div className="flex flex-1 items-center gap-2" key={label}><span className="grid h-7 w-7 place-items-center rounded-full bg-park-green text-white">{index + 1}</span><span>{label}</span>{index < rows.length - 1 ? <ArrowRight className="ml-auto text-park-muted" size={16} /> : null}</div>)}</div></section>;
}

function Metric({ label, value, help, tone = "green" }) {
  const colors = tone === "danger" ? "bg-red-50 text-park-danger" : tone === "gold" ? "bg-park-gold-soft text-park-black" : "bg-park-green-soft text-park-green";
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${colors}`}><Warehouse size={18} /></div><p className="text-2xl font-black text-park-dark">{value}</p><p className="text-sm font-bold text-park-dark">{label}</p><p className="mt-1 text-xs text-park-muted">{help}</p></article>;
}

function WarehouseSummary({ warehouses, stock }) {
  const rows = warehouses.filter((item) => ["GENERAL", "RESTAURANTE", "BARTENDER"].includes(item.code));
  return <section className="mb-5 rounded-card border border-park-border bg-white p-4 shadow-card"><div className="mb-3"><h2 className="font-black text-park-dark">¿Dónde hay productos?</h2><p className="text-xs text-park-muted">Mostramos cantidades de productos, sin mezclar kilos, litros y unidades.</p></div><div className="grid gap-3 md:grid-cols-3">{rows.map((row) => { const items = stock.filter((item) => item.warehouseCode === row.code && Number(item.available) > 0); return <article className="rounded-xl bg-park-bg p-4" key={row.id}><strong className="text-sm text-park-dark">{row.name}</strong><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><Data label="Productos disponibles" value={new Set(items.map((item) => item.productId)).size} /><Data label="Lotes activos" value={items.length} /></div></article>; })}</div></section>;
}

function TransferList({ transfers, user, canOperate, saving, onSend, onCancel, onReceive }) {
  if (!transfers.length) return <EmptyState title="No hay transferencias" description="Crea un borrador para comprometer stock sin retirarlo todavía del origen." />;
  return <section className="grid gap-4 xl:grid-cols-2">{transfers.map((item) => {
    const isDestinationOperator = (user?.role === "RESTAURANTE" && item.toWarehouseCode === "RESTAURANTE") || (user?.role === "BARTENDER" && item.toWarehouseCode === "BARTENDER");
    const destinationAction = item.status === "SENT" && Number(item.sentBy) !== Number(user.id) && isDestinationOperator;
    return <article className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-5" key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">{item.code}</p><h2 className="font-black text-park-dark">{item.fromWarehouseName} <ArrowRight className="inline" size={16} /> {item.toWarehouseName}</h2><p className="mt-1 text-xs text-park-muted">Creada {when(item.createdAt)} por {item.requestedUser?.name || "Sistema"}</p></div><StatusBadge value={item.status} /></div>
      <div className="mt-4 space-y-2">{item.lines.map((line) => <div className="rounded-lg bg-park-bg p-3" key={line.id}><div className="flex justify-between gap-2 text-sm"><strong>{line.productName}</strong><span>{line.lotCode ? `Lote ${line.lotCode}` : "Sin lote"}</span></div><div className="mt-1 grid grid-cols-3 gap-2 text-xs text-park-muted"><span>Solicitado <b>{q(line.requestedQuantity)} {line.unitSymbol}</b></span><span>Enviado <b>{line.sentQuantity == null ? "—" : `${q(line.sentQuantity)} ${line.unitSymbol}`}</b></span><span>Recibido <b>{line.receivedQuantity == null ? "—" : `${q(line.receivedQuantity)} ${line.unitSymbol}`}</b></span></div></div>)}</div>
      {item.alerts.length ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong className="flex items-center gap-2"><AlertTriangle size={16} /> Diferencia detectada</strong>{item.alerts.map((alert) => <p className="mt-1 text-xs" key={alert.id}>{alert.alertType === "SHORTAGE" ? "Faltante" : "Sobrante"}: {q(Math.abs(alert.differenceQuantity))}</p>)}</div> : null}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-park-border pt-4">{item.status === "DRAFT" && canOperate(item.fromWarehouseCode) ? <><Button size="sm" icon={Send} loading={saving} onClick={() => onSend(item)}>Enviar</Button><Button size="sm" variant="danger" icon={Ban} loading={saving} onClick={() => onCancel(item)}>Cancelar</Button></> : null}{destinationAction ? <Button size="sm" variant="gold" icon={PackageCheck} onClick={() => onReceive(item)}>Confirmar recepción</Button> : null}{item.status === "SENT" && Number(item.sentBy) === Number(user.id) ? <span className="text-xs font-bold text-park-muted">Esperando confirmación de otro usuario en {item.toWarehouseName}</span> : null}</div>
      {item.sentUser ? <p className="mt-3 text-xs text-park-muted">Emisor: {item.sentUser.name} · {item.sentShiftCode} · {when(item.sentAt)}</p> : null}{item.receivedUser ? <p className="mt-1 text-xs text-park-muted">Receptor: {item.receivedUser.name} · {item.receivedShiftCode} · {when(item.receivedAt || item.rejectedAt)}</p> : null}
    </article>;
  })}</section>;
}

function CreateTransfer({ references, user, saving, setSaving, onError, onCreated }) {
  const allowedOrigins = references.warehouses.filter((item) => ["SUPERADMIN", "ADMINISTRADOR"].includes(user?.role) || (user?.role === "RESTAURANTE" && item.code === "RESTAURANTE") || (user?.role === "BARTENDER" && item.code === "BARTENDER"));
  const defaultOrigin = allowedOrigins.find((item) => item.code === "GENERAL") || allowedOrigins[0];
  const [form, setForm] = useState({ fromWarehouseId: defaultOrigin?.id || "", toWarehouseId: "", observation: "", lines: [{ productName: "", quantity: "" }] });
  const origin = references.warehouses.find((item) => Number(item.id) === Number(form.fromWarehouseId));
  const destinations = references.warehouses.filter((item) => routeAllowed(origin?.code, item.code));
  const originStock = references.stock.filter((item) => Number(item.warehouseId) === Number(form.fromWarehouseId) && Number(item.available) > 0);
  const productNames = [...new Set(originStock.map((item) => item.productName))].sort((a,b) => a.localeCompare(b));
  const updateLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => row === index ? { ...line, ...patch } : line) }));
  async function submit(event) {
    event.preventDefault(); setSaving(true); onError("");
    try {
      const lines=[];
      for (const input of form.lines) {
        const candidates=originStock.filter((item)=>item.productName.toLowerCase()===input.productName.trim().toLowerCase()).sort((a,b)=>String(a.expiresOn||"9999").localeCompare(String(b.expiresOn||"9999")));
        if(!candidates.length) throw new Error(`Elige “${input.productName || "producto"}” desde las sugerencias.`);
        let pending=Number(input.quantity);
        for(const stock of candidates){const amount=Math.min(pending,Number(stock.available));if(amount>0)lines.push({productId:Number(stock.productId),lotId:stock.lotId?Number(stock.lotId):null,quantity:amount});pending-=amount;if(pending<=.000001)break;}
        if(pending>.000001) throw new Error(`No hay cantidad suficiente de ${input.productName}.`);
      }
      const created=await api("/transfers", { method: "POST", body: { ...form, fromWarehouseId: Number(form.fromWarehouseId), toWarehouseId: Number(form.toWarehouseId), lines } });
      await onCreated(await api(`/transfers/${created.id}/send`, { method: "POST", body: {} }));
    } catch (error) { onError(error.message); } finally { setSaving(false); }
  }
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}><div className="mb-5"><p className="text-xs font-black uppercase tracking-wide text-park-gold">ENVÍO RÁPIDO</p><h2 className="text-xl font-black text-park-dark">¿Qué quieres llevar a otra área?</h2><p className="text-sm text-park-muted">Escribe el producto. El sistema reparte la cantidad entre los lotes que vencen primero y lo deja esperando confirmación.</p></div><div className="grid gap-4 md:grid-cols-2"><Select label="Sale de" value={form.fromWarehouseId} onChange={(event) => setForm({ ...form, fromWarehouseId: event.target.value, toWarehouseId: "", lines: [{ productName: "", quantity: "" }] })} required><option value="">Seleccionar</option>{allowedOrigins.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select label="Va hacia" value={form.toWarehouseId} onChange={(event) => setForm({ ...form, toWarehouseId: event.target.value })} required><option value="">Seleccionar destino</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div className="mt-4"><Input label="Motivo o responsable (opcional)" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} placeholder="Ejemplo: abastecimiento de apertura" /></div>
    <div className="mt-5 space-y-3">{form.lines.map((line,index)=>{const selected=originStock.find((item)=>item.productName.toLowerCase()===line.productName.trim().toLowerCase()); const total=originStock.filter((item)=>item.productName.toLowerCase()===line.productName.trim().toLowerCase()).reduce((sum,item)=>sum+Number(item.available),0); return <div className="grid gap-3 rounded-card border border-park-border bg-park-bg p-4 md:grid-cols-[1fr_220px_auto]" key={index}><label className="block"><span className="mb-1.5 block text-sm font-semibold">Producto</span><div className="relative"><Search className="absolute left-3 top-3 text-park-muted" size={17}/><input className="w-full rounded-input border border-park-border py-2.5 pl-10 pr-3" list={`transfer-products-${index}`} value={line.productName} onChange={(event)=>updateLine(index,{productName:event.target.value})} placeholder="Escribe para buscar" required/></div><datalist id={`transfer-products-${index}`}>{productNames.map((name)=><option key={name} value={name}/>)}</datalist>{selected?<small className="mt-1 block text-park-green">Disponible total: {q(total)} {selected.unitSymbol} · lote automático</small>:null}</label><Input label={`Cantidad ${selected ? `(${selected.unitSymbol})` : ""}`} type="number" min="0.000001" max={total||undefined} step="any" value={line.quantity} onChange={(event)=>updateLine(index,{quantity:event.target.value})} required/><div className="flex items-end"><Button className="w-full" type="button" variant="ghost" icon={Trash2} disabled={form.lines.length===1} onClick={()=>setForm({...form,lines:form.lines.filter((_,row)=>row!==index)})}>Quitar</Button></div></div>})}</div><div className="mt-4 flex flex-wrap justify-between gap-3"><Button type="button" variant="secondary" icon={Plus} onClick={()=>setForm({...form,lines:[...form.lines,{productName:"",quantity:""}]})}>Agregar otro producto</Button><Button loading={saving} icon={Send}>Enviar al área</Button></div></form>;
}

function ReceiveTransfer({ transfer, saving, onError, onReceive, onReject }) {
  const [form,setForm]=useState({shiftCode:"",observation:"",lines:transfer.lines.map((line)=>({lineId:line.id,receivedQuantity:String(line.sentQuantity),observation:""}))});
  const [rejectReason,setRejectReason]=useState("");
  const updateLine=(index,patch)=>setForm((current)=>({...current,lines:current.lines.map((line,row)=>row===index?{...line,...patch}:line)}));
  const submit=(event)=>{event.preventDefault();onError("");onReceive({...form,lines:form.lines.map((line)=>({...line,receivedQuantity:Number(line.receivedQuantity)}))});};
  return <form className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6" onSubmit={submit}><p className="text-xs font-black uppercase tracking-wide text-park-gold">{transfer.code}</p><h2 className="text-xl font-black text-park-dark">Confirmar llegada a {transfer.toWarehouseName}</h2><p className="mb-5 text-sm text-park-muted">Cuenta físicamente. No copies la cantidad enviada si llegó algo diferente.</p><Alert tone="warning" title="Separación de responsabilidades">El emisor fue {transfer.sentUser?.name}. La recepción debe confirmarla otra persona del área destino.</Alert><div className="mt-5 space-y-3">{form.lines.map((line,index)=>{const source=transfer.lines[index];const diff=Number(line.receivedQuantity||0)-Number(source.sentQuantity||0);return <div className="rounded-card border border-park-border p-4" key={line.lineId}><div className="grid gap-3 md:grid-cols-2"><div><span className="text-sm font-black text-park-dark">{source.productName}</span><p className="text-xs text-park-muted">Enviado: {q(source.sentQuantity)} {source.unitSymbol}{source.lotCode?` · lote ${source.lotCode}`:""}</p></div><Input label={`Cantidad realmente recibida (${source.unitSymbol})`} type="number" min="0" step="any" value={line.receivedQuantity} onChange={(event)=>updateLine(index,{receivedQuantity:event.target.value})} required/></div><p className={`mt-2 text-xs font-bold ${Math.abs(diff)>0.000001?"text-park-danger":"text-park-green"}`}>{Math.abs(diff)<=0.000001?"Cantidad conforme":`${diff<0?"Faltante":"Sobrante"}: ${q(Math.abs(diff))} ${source.unitSymbol} — se creará una alerta`}</p></div>})}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><Input label="Turno (opcional; se detecta automáticamente)" value={form.shiftCode} onChange={(event)=>setForm({...form,shiftCode:event.target.value})}/><Input label="Observación de recepción" value={form.observation} onChange={(event)=>setForm({...form,observation:event.target.value})}/></div><div className="mt-5 flex flex-col gap-3 border-t border-park-border pt-5 md:flex-row md:items-end md:justify-between"><div className="flex-1"><Input label="Motivo si rechazas toda la transferencia" value={rejectReason} onChange={(event)=>setRejectReason(event.target.value)} placeholder="Daño, lote incorrecto, temperatura..."/></div><div className="flex flex-wrap gap-2"><Button type="button" variant="danger" icon={Ban} loading={saving} disabled={!rejectReason.trim()} onClick={()=>onReject({observation:rejectReason,shiftCode:form.shiftCode})}>Rechazar todo</Button><Button icon={CheckCircle2} loading={saving}>Confirmar cantidades</Button></div></div></form>;
}

function Data({label,value}){return <div><span className="block text-park-muted">{label}</span><strong className="text-park-dark">{value}</strong></div>}
