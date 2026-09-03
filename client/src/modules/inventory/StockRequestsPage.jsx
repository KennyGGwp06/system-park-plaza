import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, PackagePlus, Plus, RefreshCw, Search, Send, Trash2, X } from "lucide-react";
import { Alert, Button, Input, PageHeader } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Toast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const amount = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 4 });
const when = (value) => value ? new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "—";
const labels = { REQUESTED: "Esperando aprobación", APPROVED: "Aprobada", REJECTED: "Rechazada" };
const exceedsAvailable = (quantity, available) => Number(quantity || 0) > Number(available || 0) + 0.000001;

export function StockRequestsPage() {
  const { user } = useAuth();
  const isAdmin = ["SUPERADMIN", "ADMINISTRADOR"].includes(user?.role);
  const { data: requests = [], loading, error, reload } = useFetch("/stock-requests", { initialData: [], realtime: true, pollInterval: 10000 });
  const { data: references = { products: [] } } = useFetch("/stock-requests/references", { initialData: { products: [] } });
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  const pending = requests.filter((item) => item.status === "REQUESTED");
  const history = requests.filter((item) => item.status !== "REQUESTED");
  const operatorAttention = requests.filter((item) => item.status === "REJECTED" || (item.status === "APPROVED" && item.transferStatus === "SENT"));

  if (loading) return <LoadingSpinner label="Revisando solicitudes de insumos..." />;
  if (error) return <Alert tone="danger" title="No se pudieron cargar las solicitudes">{error.message}</Alert>;

  async function reject(request, note) {
    setBusy(true); setFailure("");
    try {
      await api(`/stock-requests/${request.id}/review`, { method: "POST", body: { decision: "REJECT", note } });
      setReviewing(null); setMessage(`${request.code} fue rechazada con un motivo visible para el área.`); await reload();
    } catch (cause) { setFailure(cause.message); } finally { setBusy(false); }
  }

  async function approveAndSend(request, lines, note) {
    setBusy(true); setFailure("");
    try {
      const approved = await api(`/stock-requests/${request.id}/review`, { method: "POST", body: { decision: "APPROVE", note, lines } });
      try {
        await api(`/transfers/${approved.transferId}/send`, { method: "POST", body: {} });
        setMessage(`${request.code} aprobada y enviada. ${request.area === "BARTENDER" ? "Bar" : "Restaurante"} ya puede confirmar la recepción.`);
      } catch (sendError) {
        setMessage(`${request.code} fue aprobada, pero el envío quedó pendiente. Ábrelo en Distribuir insumos.`);
      }
      setReviewing(null); await reload();
    } catch (cause) { setFailure(cause.message); } finally { setBusy(false); }
  }

  return <main className="space-y-6 py-5">
    <Toast message={message} onClose={() => setMessage("")} />
    <PageHeader
      eyebrow={isAdmin ? "Inventario · solicitudes internas" : `Inventario · ${user?.role === "BARTENDER" ? "Bar" : "Restaurante"}`}
      title={isAdmin ? "Solicitudes de insumos" : "Pedir insumos"}
      description={isAdmin ? "Aprueba lo necesario y envíalo desde Almacén general en una sola acción." : "Escribe qué necesitas. Super Admin revisa la solicitud y el envío aparecerá en Recibir insumos."}
      actions={<><Button variant="secondary" icon={RefreshCw} onClick={reload}>Actualizar</Button>{!isAdmin ? <Button icon={Plus} onClick={() => setCreating(true)}>Nueva solicitud</Button> : null}</>}
    />
    <RequestFlow isAdmin={isAdmin} />
    {failure ? <Alert tone="danger" title="No se completó la operación">{failure}</Alert> : null}
    {!isAdmin && operatorAttention.length ? <Alert tone="info" title={`${operatorAttention.length} respuesta(s) requieren que las revises`}>Las solicitudes rechazadas explican el motivo. Los envíos aprobados deben confirmarse desde Recibir insumos.</Alert> : null}
    {isAdmin ? <AdminRequests pending={pending} history={history} onReview={setReviewing} /> : <OperatorRequests pending={pending} history={history} onCreate={() => setCreating(true)} />}
    {creating ? <CreateRequest products={references.products || []} onClose={() => setCreating(false)} onCreated={async (created) => { setCreating(false); setMessage(`${created.code} enviada a Super Admin.`); await reload(); }} /> : null}
    {reviewing ? <ReviewRequest request={reviewing} busy={busy} onClose={() => setReviewing(null)} onApprove={approveAndSend} onReject={reject} /> : null}
  </main>;
}

function RequestFlow({ isAdmin }) {
  const steps = isAdmin
    ? [["1", "Revisa", "Qué área lo necesita"], ["2", "Aprueba y envía", "El lote se elige automáticamente"], ["3", "El área recibe", "Cuenta y confirma físicamente"]]
    : [["1", "Solicita", "Producto y cantidad"], ["2", "Super Admin envía", "Desde Almacén general"], ["3", "Recibe", "Cuenta lo que llegó"]];
  return <section className="overflow-x-auto rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex min-w-[620px] items-center gap-3">{steps.map(([number, title, detail], index) => <div className="flex flex-1 items-center gap-3" key={number}><span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-park-green font-black text-white">{number}</span><span><strong className="block text-sm text-park-dark">{title}</strong><small className="text-park-muted">{detail}</small></span>{index < steps.length - 1 ? <ArrowRight className="ml-auto flex-none text-park-gold" size={18} /> : null}</div>)}</div></section>;
}

function AdminRequests({ pending, history, onReview }) {
  return <div className="space-y-7">
    <section><SectionTitle eyebrow="REQUIEREN TU DECISIÓN" title={`${pending.length} solicitud(es) pendientes`} />{pending.length ? <div className="grid gap-4 xl:grid-cols-2">{pending.map((request) => <RequestCard request={request} key={request.id} action={<Button icon={ClipboardList} onClick={() => onReview(request)}>Revisar solicitud</Button>} />)}</div> : <EmptyState title="No hay solicitudes pendientes" description="Restaurante y Bar verán aquí sus pedidos internos cuando necesiten reposición." />}</section>
    {history.length ? <section><SectionTitle eyebrow="HISTORIAL RECIENTE" title="Solicitudes resueltas" /><div className="grid gap-3 xl:grid-cols-2">{history.slice(0, 12).map((request) => <RequestCard compact request={request} key={request.id} />)}</div></section> : null}
  </div>;
}

function OperatorRequests({ pending, history, onCreate }) {
  return <div className="space-y-7">
    <section><SectionTitle eyebrow="EN PROCESO" title={`${pending.length} solicitud(es) esperando respuesta`} />{pending.length ? <div className="grid gap-4 xl:grid-cols-2">{pending.map((request) => <RequestCard request={request} key={request.id} />)}</div> : <div className="rounded-card border border-dashed border-park-border bg-white p-10 text-center"><PackagePlus className="mx-auto text-park-gold" size={34}/><h2 className="mt-3 font-black text-park-dark">No tienes solicitudes pendientes</h2><p className="mt-1 text-sm text-park-muted">Si falta un producto para el turno, crea una solicitud simple.</p><Button className="mt-4" icon={Plus} onClick={onCreate}>Solicitar insumos</Button></div>}</section>
    {history.length ? <section><SectionTitle eyebrow="RESPUESTAS DE SUPER ADMIN" title="Historial" /><div className="grid gap-3 xl:grid-cols-2">{history.slice(0, 10).map((request) => <RequestCard compact request={request} key={request.id} />)}</div></section> : null}
  </div>;
}

function RequestCard({ request, action, compact = false }) {
  const sent = request.transferStatus === "SENT";
  const received = ["RECEIVED", "RECEIVED_WITH_DIFFERENCE"].includes(request.transferStatus);
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">{request.code}</p><h2 className="mt-1 font-black text-park-dark">{request.area === "BARTENDER" ? "Bar" : "Restaurante"}</h2><p className="text-xs text-park-muted">{when(request.requestedAt)} · {request.requestedByName || "Personal del área"}</p></div><RequestStatus request={request} /></div>
    <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2" : ""}`}>{request.lines.map((line) => <div className="flex items-center justify-between gap-3 rounded-lg bg-park-bg px-3 py-2 text-sm" key={line.id}><span className="font-semibold text-park-dark">{line.productName}</span><span className="text-right"><b>{amount(line.approvedQuantity ?? line.requestedQuantity)} {line.unitSymbol}</b>{line.approvedQuantity != null && Number(line.approvedQuantity) !== Number(line.requestedQuantity) ? <small className="block text-park-muted">Pidió {amount(line.requestedQuantity)}</small> : null}</span></div>)}</div>
    {request.observation ? <p className="mt-3 text-sm text-park-muted"><b>Motivo:</b> {request.observation}</p> : null}
    {request.reviewNote ? <p className="mt-2 rounded-lg bg-park-green-soft p-2.5 text-sm text-park-dark"><b>Respuesta:</b> {request.reviewNote}</p> : null}
    {request.status === "APPROVED" ? <p className="mt-3 text-xs font-semibold text-park-green">{received ? "Recepción confirmada por el área." : sent ? "En camino; falta confirmar la recepción." : "Aprobada; el despacho sigue pendiente."}</p> : null}
    {action ? <div className="mt-4 border-t border-park-border pt-4">{action}</div> : null}
  </article>;
}

function RequestStatus({ request }) {
  const text = request.status === "APPROVED" && request.transferStatus === "SENT" ? "Enviado al área" : request.status === "APPROVED" && ["RECEIVED", "RECEIVED_WITH_DIFFERENCE"].includes(request.transferStatus) ? "Recibido" : labels[request.status] || request.status;
  const tone = request.status === "REJECTED" ? "bg-red-50 text-park-danger" : request.status === "REQUESTED" ? "bg-park-gold-soft text-park-dark" : "bg-park-green-soft text-park-green";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tone}`}>{text}</span>;
}

function CreateRequest({ products, onClose, onCreated }) {
  const [form, setForm] = useState({ observation: "", lines: [{ productName: "", quantity: "" }] });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const names = useMemo(() => [...new Set(products.map((item) => item.name))].sort((a, b) => a.localeCompare(b, "es")), [products]);
  const update = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => row === index ? { ...line, ...patch } : line) }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setFailure("");
    try {
      const seen = new Set();
      const lines = form.lines.map((line) => {
        const product = products.find((item) => item.name.toLowerCase() === line.productName.trim().toLowerCase());
        if (!product) throw new Error(`Elige “${line.productName || "producto"}” desde las sugerencias.`);
        if (seen.has(product.id)) throw new Error(`${product.name} está repetido.`);
        seen.add(product.id);
        return { productId: product.id, quantity: Number(line.quantity) };
      });
      await onCreated(await api("/stock-requests", { method: "POST", body: { observation: form.observation, lines } }));
    } catch (cause) { setFailure(cause.message); } finally { setBusy(false); }
  }
  return <Modal title="Nueva solicitud de insumos" subtitle="No necesitas conocer lotes ni almacenes. Solo indica qué producto falta y cuánto necesitas." onClose={onClose}><form onSubmit={submit}>{failure ? <Alert tone="danger" title="Revisa la solicitud">{failure}</Alert> : null}<div className="mt-4 space-y-3">{form.lines.map((line, index) => { const product = products.find((item) => item.name.toLowerCase() === line.productName.trim().toLowerCase()); const warning = product && exceedsAvailable(line.quantity, product.generalAvailable); return <div className={`rounded-card border p-4 ${warning ? "border-amber-300 bg-amber-50" : "border-park-border bg-park-bg"}`} key={index}><div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"><label><span className="mb-1.5 block text-sm font-semibold">Producto</span><div className="relative"><Search className="absolute left-3 top-3 text-park-muted" size={17}/><input className="w-full rounded-input border border-park-border bg-white py-2.5 pl-10 pr-3" list={`request-products-${index}`} value={line.productName} onChange={(event) => update(index, { productName: event.target.value })} placeholder="Escribe para buscar" required /></div><datalist id={`request-products-${index}`}>{names.map((name) => <option key={name} value={name}/>)}</datalist></label><Input label={`Cantidad ${product ? `(${product.unitSymbol})` : ""}`} type="number" min="0.000001" step="any" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} required /><div className="flex items-end"><Button type="button" variant="ghost" icon={Trash2} disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}>Quitar</Button></div></div>{product ? <p className={`mt-2 text-xs font-bold ${warning ? "text-amber-800" : "text-park-muted"}`}>{warning ? `Atención: solicitas ${amount(line.quantity)} ${product.unitSymbol}, pero el almacén general tiene ${amount(product.generalAvailable)} ${product.unitSymbol} disponibles. Puedes enviarla; Super Admin decidirá si ajusta la cantidad o repone stock.` : `Disponible en almacén general: ${amount(product.generalAvailable)} ${product.unitSymbol}.`}</p> : null}</div>; })}</div><Input className="mt-4" label="¿Para qué lo necesitas? (opcional)" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} placeholder="Ejemplo: reposición para el turno de noche" /><div className="mt-5 flex flex-wrap justify-between gap-3"><Button type="button" variant="secondary" icon={Plus} onClick={() => setForm({ ...form, lines: [...form.lines, { productName: "", quantity: "" }] })}>Agregar producto</Button><Button icon={Send} loading={busy}>Enviar solicitud</Button></div></form></Modal>;
}

function ReviewRequest({ request, busy, onClose, onApprove, onReject }) {
  const [quantities, setQuantities] = useState(Object.fromEntries(request.lines.map((line) => [line.id, String(line.requestedQuantity)])));
  const [note, setNote] = useState("");
  const approvedLines = request.lines.map((line) => ({ lineId: line.id, quantity: Number(quantities[line.id] || 0) }));
  const insufficient = request.lines.filter((line) => exceedsAvailable(quantities[line.id], line.generalAvailable));
  return <Modal title={`Revisar ${request.code}`} subtitle="Puedes ajustar cantidades. Al aprobar, el sistema reserva los lotes y despacha el envío." onClose={onClose}>{insufficient.length ? <Alert tone="warning" title="Ajusta las cantidades antes de enviar">No existe stock general suficiente para {insufficient.map((line) => line.productName).join(", ")}. Puedes reducir la cantidad o rechazar indicando que se requiere una compra.</Alert> : null}<div className="mt-4 space-y-3">{request.lines.map((line) => { const warning = exceedsAvailable(quantities[line.id], line.generalAvailable); return <div className={`grid items-end gap-3 rounded-card border p-4 sm:grid-cols-[1fr_180px] ${warning ? "border-amber-300 bg-amber-50" : "border-park-border bg-park-bg"}`} key={line.id}><div><strong className="text-park-dark">{line.productName}</strong><p className="text-xs text-park-muted">Solicitado: {amount(line.requestedQuantity)} {line.unitSymbol}</p><p className={`mt-1 text-xs font-bold ${warning ? "text-amber-800" : "text-park-green"}`}>Disponible para enviar: {amount(line.generalAvailable)} {line.unitSymbol}</p></div><Input label={`Cantidad aprobada (${line.unitSymbol})`} type="number" min="0" step="any" value={quantities[line.id]} onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })} /></div>; })}</div><Input className="mt-4" label="Respuesta para el área" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ejemplo: cantidad ajustada al stock disponible" /><div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" disabled={busy || !note.trim()} onClick={() => onReject(request, note)}>Rechazar con motivo</Button><Button icon={CheckCircle2} loading={busy} disabled={busy || insufficient.length > 0} onClick={() => onApprove(request, approvedLines, note)}>Aprobar y enviar</Button></div></Modal>;
}

function SectionTitle({ eyebrow, title }) { return <div className="mb-3"><p className="text-xs font-black uppercase tracking-wide text-park-gold">{eyebrow}</p><h2 className="text-xl font-black text-park-dark">{title}</h2></div>; }
function Modal({ title, subtitle, onClose, children }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"><section className="mx-auto my-8 max-w-3xl rounded-card bg-white p-5 shadow-drawer md:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-park-dark">{title}</h2><p className="mt-1 text-sm text-park-muted">{subtitle}</p></div><button className="grid h-9 w-9 flex-none place-items-center rounded-full border border-park-border transition-colors hover:bg-park-bg" onClick={onClose} type="button" aria-label="Cerrar"><X size={18}/></button></div>{children}</section></div>; }
