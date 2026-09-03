import { useMemo, useState } from "react";
import {
  AlertCircle, Check, CheckCircle2, Clock3, Download, FileCheck2, FileText,
  ReceiptText, RefreshCw, RotateCcw, Search, Send, ShieldCheck, UserRoundCheck, X
} from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge, statusLabel } from "../../components/StatusBadge";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { apiBaseUrl } from "../../config/api";
import { useFetch } from "../../hooks/useFetch";
import { api, getToken } from "../../services/api";

const flow = [
  ["Pago", "Pago aprobado", Check],
  ["Elegir", "Emitir comprobante", ReceiptText],
  ["Tipo", "Boleta o factura", FileText],
  ["Cliente", "Confirmar datos", UserRoundCheck],
  ["Enviar", "Enviar a SUNAT", Send],
  ["Estado", "Ver resultado", ShieldCheck],
  ["Archivos", "PDF, XML y CDR", Download]
];

function money(value) {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function personName(client) {
  return `${client?.firstName || ""} ${client?.lastName || ""}`.trim() || "Cliente sin nombre";
}

function initialRecipient(payment) {
  return {
    documentType: payment?.client?.documentType || "DNI",
    documentNumber: payment?.client?.documentNumber || "",
    name: personName(payment?.client),
    email: payment?.client?.email || "",
    address: payment?.client?.address || ""
  };
}

export function ElectronicBillingPage() {
  const { data: documentsData, loading: loadingDocuments, error: documentsError, reload: reloadDocuments } = useFetch("/facturacion", { initialData: [] });
  const { data: paymentsData, loading: loadingPayments, error: paymentsError, reload: reloadPayments } = useFetch("/pagos", { initialData: [] });
  const { data: configuration, loading: loadingConfiguration } = useFetch("/facturacion/configuration", { initialData: null });
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("PENDIENTES");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [notice, setNotice] = useState(null);

  const documents = Array.isArray(documentsData) ? documentsData : [];
  const payments = Array.isArray(paymentsData) ? paymentsData : [];
  const pendingPayments = payments.filter((payment) => payment.status === "APROBADO" && payment.clientId && !payment.invoice);
  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((document) => {
      const recipient = document.recipient?.name || personName(document.client);
      const text = [document.fullNumber, document.type, document.status, recipient, document.recipient?.documentNumber, document.payment?.concept].join(" ").toLowerCase();
      return (!needle || text.includes(needle)) && (statusFilter === "TODOS" || document.status === statusFilter);
    });
  }, [documents, query, statusFilter]);

  if (loadingDocuments || loadingPayments || loadingConfiguration) return <LoadingSpinner />;
  const pageError = documentsError || paymentsError;

  async function refresh() {
    await Promise.all([reloadDocuments(), reloadPayments()]);
  }

  async function emit(payload) {
    setSaving(true);
    setNotice(null);
    try {
      const document = await api("/facturacion", { method: "POST", body: payload });
      await refresh();
      setSelected(null);
      setTab("COMPROBANTES");
      setNotice({ tone: document.status === "ACEPTADO" ? "success" : document.status === "RECHAZADO" ? "danger" : "warning", text: `${document.fullNumber}: ${statusLabel(document.status)}. ${document.sunatDescription || ""}` });
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function retry(document) {
    setRetryingId(document.id);
    setNotice(null);
    try {
      const result = await api(`/facturacion/${document.id}/retry`, { method: "POST" });
      await reloadDocuments();
      setNotice({ tone: result.status === "ACEPTADO" ? "success" : "warning", text: `${result.fullNumber}: ${result.sunatDescription}` });
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <main className="space-y-5 pb-10">
      <PageHeader
        eyebrow="Finanzas · comprobantes electrónicos"
        title="Facturación electrónica"
        description="Parte de un pago aprobado, confirma al cliente y controla el resultado en un solo lugar."
        actions={<Button icon={RefreshCw} onClick={refresh} variant="secondary">Actualizar</Button>}
      />

      <EnvironmentBanner configuration={configuration} />
      <ResponsibilityBanner access={configuration?.access} />
      <BillingFlow />

      {notice ? <Notice notice={notice} onClose={() => setNotice(null)} /> : null}
      {pageError ? <Notice notice={{ tone: "danger", text: pageError.message }} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Clock3} label="Pagos por emitir" value={pendingPayments.length} help="Listos para boleta o factura" />
        <Metric icon={CheckCircle2} label="Aceptados" value={documents.filter((item) => item.status === "ACEPTADO").length} help="Con archivos disponibles" tone="green" />
        <Metric icon={RotateCcw} label="Por reintentar" value={documents.filter((item) => item.status === "PENDIENTE_REINTENTO").length} help="No generan un duplicado" tone="gold" />
        <Metric icon={AlertCircle} label="Rechazados" value={documents.filter((item) => item.status === "RECHAZADO").length} help="Requieren revisar el motivo" tone="danger" />
      </section>

      <div className="flex gap-2 rounded-card border border-park-border bg-white p-2 shadow-card">
        <Tab active={tab === "PENDIENTES"} count={pendingPayments.length} onClick={() => setTab("PENDIENTES")}>Pagos pendientes</Tab>
        <Tab active={tab === "COMPROBANTES"} count={documents.length} onClick={() => setTab("COMPROBANTES")}>Comprobantes emitidos</Tab>
      </div>

      {tab === "PENDIENTES" ? (
        <PendingPayments payments={pendingPayments} onSelect={setSelected} />
      ) : (
        <DocumentsHistory
          documents={filteredDocuments}
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onRetry={retry}
          retryingId={retryingId}
          canRetry={configuration?.access?.canRetry === true}
        />
      )}

      {selected ? <EmissionSheet configuration={configuration} payment={selected} saving={saving} onClose={() => setSelected(null)} onSubmit={emit} /> : null}
    </main>
  );
}

function ResponsibilityBanner({ access }) {
  const supervision = access?.responsibility === "SUPERVISION";
  return (
    <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-park-gold">Responsabilidad del perfil</p>
      <h2 className="mt-1 font-black text-park-dark">{supervision ? "Super Admin: supervisión tributaria" : "Admin Recepción: emisión desde pagos"}</h2>
      <p className="mt-1 text-sm text-park-muted">
        {supervision
          ? "Puedes emitir, descargar comprobantes y reintentar envíos fallidos. La configuración de certificado, series y ambiente SUNAT quedará exclusivamente bajo este perfil."
          : "Puedes emitir boletas o facturas desde pagos aprobados y entregar sus archivos. Los reintentos y la configuración SUNAT los controla el Super Admin."}
      </p>
    </section>
  );
}

function EnvironmentBanner({ configuration }) {
  const simulation = configuration?.simulation;
  return (
    <section className={`flex flex-col gap-3 rounded-card border p-4 shadow-card sm:flex-row sm:items-center sm:justify-between ${simulation ? "border-park-gold/45 bg-park-gold-soft" : "border-park-green/30 bg-park-green-soft"}`}>
      <div className="flex gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${simulation ? "bg-park-gold text-park-black" : "bg-park-green text-white"}`}><ShieldCheck size={20} /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-park-muted">Conexión tributaria</p>
          <h2 className="font-black text-park-dark">{configuration?.label || "Configuración pendiente"}</h2>
          <p className="mt-1 max-w-4xl text-sm text-park-muted">{configuration?.message}</p>
        </div>
      </div>
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${simulation ? "bg-white text-park-black" : "bg-park-green text-white"}`}>{simulation ? "NO ENVÍA A SUNAT" : configuration?.mode}</span>
    </section>
  );
}

function BillingFlow() {
  return (
    <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[0.15em] text-park-gold">Flujo completo</p>
        <h2 className="font-display text-xl font-semibold text-park-dark">De un pago al comprobante, sin cálculos manuales</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {flow.map(([short, label, Icon], index) => (
          <div className="relative rounded-xl border border-park-border bg-park-bg p-3" key={short}>
            <div className="flex items-center justify-between"><span className="grid h-7 w-7 place-items-center rounded-lg bg-park-green-soft text-park-green"><Icon size={15} /></span><b className="text-xs text-park-muted">{index + 1}</b></div>
            <strong className="mt-2 block text-sm text-park-dark">{short}</strong>
            <span className="mt-0.5 block text-xs text-park-muted">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PendingPayments({ payments, onSelect }) {
  return (
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[0.15em] text-park-gold">Paso 1</p>
        <h2 className="font-display text-2xl font-semibold text-park-dark">Pagos pendientes de comprobante</h2>
        <p className="mt-1 text-sm text-park-muted">Aquí aparecen automáticamente los pagos aprobados que todavía no tienen boleta ni factura.</p>
      </div>
      {payments.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {payments.map((payment) => (
            <article className="rounded-card border border-park-border bg-park-bg p-4" key={payment.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <strong className="block truncate text-park-dark">{personName(payment.client)}</strong>
                  <p className="mt-1 text-xs font-semibold text-park-muted">{payment.client?.documentType || "DNI"} {payment.client?.documentNumber || "Sin documento"} · Pago #{payment.id}</p>
                </div>
                <strong className="whitespace-nowrap font-display text-2xl text-park-dark">{money(payment.amount)}</strong>
              </div>
              <div className="mt-4 rounded-xl bg-white p-3 text-sm">
                <p className="font-bold text-park-dark">{payment.concept || "Servicio Park Plaza"}</p>
                <p className="mt-1 text-xs text-park-muted">{payment.area || "Recepción"} · {payment.method || "Método no indicado"} · {formatDate(payment.createdAt)}</p>
              </div>
              <div className="mt-4 flex justify-end"><Button icon={ReceiptText} onClick={() => onSelect(payment)} variant="gold">Emitir comprobante</Button></div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="Todos los pagos tienen comprobante" description="Cuando se registre un nuevo pago aprobado aparecerá aquí automáticamente." />}
    </section>
  );
}

function EmissionSheet({ configuration, payment, saving, onClose, onSubmit }) {
  const [type, setType] = useState("BOLETA");
  const [recipient, setRecipient] = useState(initialRecipient(payment));
  const [simulationResult, setSimulationResult] = useState("ACEPTADO");
  const total = Number(payment.amount || 0);
  const subtotal = total / 1.18;
  const tax = total - subtotal;

  function changeType(value) {
    setType(value);
    setRecipient((current) => ({
      ...current,
      documentType: value === "FACTURA" ? "RUC" : payment.client?.documentType || "DNI",
      documentNumber: value === "FACTURA" && payment.client?.documentType !== "RUC" ? "" : payment.client?.documentNumber || current.documentNumber
    }));
  }

  function update(key, value) {
    setRecipient((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({ paymentId: payment.id, clientId: payment.clientId, type, recipient, simulationResult });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 p-3 sm:p-5" onMouseDown={onClose}>
      <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto rounded-card bg-white shadow-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <form onSubmit={submit}>
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-park-border bg-white p-5">
            <div><p className="text-xs font-black uppercase tracking-[0.15em] text-park-gold">Emitir desde pago #{payment.id}</p><h2 className="font-display text-2xl font-semibold text-park-dark">Confirma el comprobante</h2><p className="mt-1 text-sm text-park-muted">El sistema calcula IGV, serie y correlativo automáticamente.</p></div>
            <button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl border border-park-border text-park-muted hover:bg-park-bg" onClick={onClose} type="button"><X size={18} /></button>
          </header>

          <div className="space-y-5 p-5">
            <section className="rounded-card border border-park-border bg-park-bg p-4">
              <p className="text-xs font-black uppercase text-park-muted">Pago seleccionado</p>
              <div className="mt-2 flex items-start justify-between gap-4"><div><strong className="text-park-dark">{payment.concept}</strong><p className="mt-1 text-xs text-park-muted">{payment.method} · {formatDate(payment.createdAt)}</p></div><strong className="font-display text-2xl text-park-dark">{money(total)}</strong></div>
            </section>

            <section>
              <h3 className="mb-3 font-black text-park-dark">1. Elige el tipo de comprobante</h3>
              <div className="grid grid-cols-2 gap-3">
                {["BOLETA", "FACTURA"].map((value) => <button className={`rounded-card border p-4 text-left transition ${type === value ? "border-park-green bg-park-green-soft ring-2 ring-park-green/10" : "border-park-border hover:border-park-green/50"}`} key={value} onClick={() => changeType(value)} type="button"><span className="flex items-center justify-between"><strong className="text-park-dark">{value === "BOLETA" ? "Boleta electrónica" : "Factura electrónica"}</strong>{type === value ? <CheckCircle2 className="text-park-green" size={18} /> : null}</span><small className="mt-1 block text-park-muted">{value === "BOLETA" ? "Para consumidor final" : "Para cliente con RUC"}</small></button>)}
              </div>
            </section>

            <section>
              <h3 className="mb-3 font-black text-park-dark">2. Confirma los datos del cliente</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Tipo de documento" value={recipient.documentType} onChange={(event) => update("documentType", event.target.value)} disabled={type === "FACTURA"} required>
                  {(type === "FACTURA" ? ["RUC"] : ["DNI", "CE", "PASAPORTE", "RUC"]).map((value) => <option key={value}>{value}</option>)}
                </Select>
                <Input label={type === "FACTURA" ? "RUC" : "Número de documento"} inputMode="numeric" maxLength={type === "FACTURA" ? 11 : 12} value={recipient.documentNumber} onChange={(event) => update("documentNumber", event.target.value.replace(/\D/g, ""))} required />
                <Input className="sm:col-span-2" label={type === "FACTURA" ? "Razón social" : "Nombre del cliente"} value={recipient.name} onChange={(event) => update("name", event.target.value)} required />
                <Input label="Correo para el comprobante" type="email" value={recipient.email} onChange={(event) => update("email", event.target.value)} placeholder="Opcional" />
                <Input label={type === "FACTURA" ? "Dirección fiscal" : "Dirección"} value={recipient.address} onChange={(event) => update("address", event.target.value)} required={type === "FACTURA"} placeholder={type === "FACTURA" ? "Obligatoria para factura" : "Opcional"} />
              </div>
            </section>

            <section className="rounded-card border border-park-border p-4">
              <h3 className="font-black text-park-dark">3. Revisa el importe</h3>
              <p className="mt-1 text-xs text-park-muted">Los importes se toman del pago y no se pueden alterar desde esta pantalla.</p>
              <dl className="mt-4 space-y-2 text-sm"><Amount label="Valor de venta" value={subtotal} /><Amount label="IGV (18 %)" value={tax} /><Amount label="Total pagado" value={total} total /></dl>
            </section>

            {configuration?.simulation ? (
              <section className="rounded-card border border-park-gold/40 bg-park-gold-soft p-4">
                <h3 className="font-black text-park-dark">Resultado para probar la pantalla</h3>
                <p className="mt-1 text-xs text-park-muted">Solo aparece mientras no existen credenciales. Permite revisar los tres casos sin comunicarse con SUNAT.</p>
                <Select className="mt-3" label="Simular resultado" value={simulationResult} onChange={(event) => setSimulationResult(event.target.value)}>
                  <option value="ACEPTADO">Aceptado</option><option value="PENDIENTE_REINTENTO">Pendiente de reintento</option><option value="RECHAZADO">Rechazado</option>
                </Select>
              </section>
            ) : null}
          </div>

          <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-park-border bg-white p-4 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="secondary">Cancelar</Button><Button icon={Send} loading={saving} type="submit" variant="gold">Emitir y enviar a SUNAT</Button></footer>
        </form>
      </aside>
    </div>
  );
}

function DocumentsHistory({ documents, query, setQuery, statusFilter, setStatusFilter, onRetry, retryingId, canRetry }) {
  return (
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.15em] text-park-gold">Seguimiento</p><h2 className="font-display text-2xl font-semibold text-park-dark">Comprobantes emitidos</h2><p className="mt-1 text-sm text-park-muted">Consulta el resultado y descarga sus archivos sin entrar a otra pantalla.</p></div>
        <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_220px]">
          <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={16} /><input className="h-10 w-full rounded-xl border border-park-border pl-9 pr-3 text-sm outline-none focus:border-park-green" onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, documento o número" value={query} /></label>
          <select className="h-10 rounded-xl border border-park-border bg-white px-3 text-sm outline-none focus:border-park-green" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="TODOS">Todos los estados</option><option value="ACEPTADO">Aceptados</option><option value="PENDIENTE_REINTENTO">Por reintentar</option><option value="RECHAZADO">Rechazados</option></select>
        </div>
      </div>
      {documents.length ? <div className="mt-5 space-y-3">{documents.map((document) => <DocumentCard canRetry={canRetry} document={document} key={document.id} onRetry={onRetry} retrying={retryingId === document.id} />)}</div> : <div className="mt-5"><EmptyState title="No encontramos comprobantes" description="Cambia el filtro o emite el primer comprobante desde un pago pendiente." /></div>}
    </section>
  );
}

function DocumentCard({ document, onRetry, retrying, canRetry }) {
  const simulation = document.environment === "DEMO";
  return (
    <article className="rounded-card border border-park-border bg-park-bg p-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_auto] lg:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><strong className="text-lg text-park-dark">{document.fullNumber || `${document.series}-${document.number}`}</strong><StatusBadge value={document.status} />{simulation ? <span className="rounded-full bg-park-gold-soft px-2.5 py-1 text-xs font-black text-park-black">SIMULACIÓN</span> : null}</div><p className="mt-1 text-sm font-semibold text-park-dark">{document.recipient?.name || personName(document.client)}</p><p className="mt-1 text-xs text-park-muted">{document.type} · {document.recipient?.documentType} {document.recipient?.documentNumber} · {formatDate(document.issuedAt)}</p></div>
        <div><strong className="font-display text-2xl text-park-dark">{money(document.total)}</strong><p className="mt-1 text-xs font-semibold text-park-muted">{document.payment?.concept || document.lines?.[0]?.description}</p><p className={`mt-1 text-xs ${document.status === "RECHAZADO" ? "text-park-danger" : "text-park-muted"}`}>{document.sunatDescription || "Sin respuesta registrada"}</p></div>
        <div className="flex flex-wrap gap-2 lg:max-w-[310px] lg:justify-end">{canRetry && document.status === "PENDIENTE_REINTENTO" ? <Button icon={RotateCcw} loading={retrying} onClick={() => onRetry(document)} size="sm" variant="gold">Reintentar</Button> : null}<ArtifactButton document={document} kind="pdf" label="PDF" /><ArtifactButton document={document} kind="xml" label="XML" /><ArtifactButton document={document} kind="cdr" label="CDR" /></div>
      </div>
    </article>
  );
}

function ArtifactButton({ document, kind, label }) {
  async function download() {
    const response = await fetch(`${apiBaseUrl}/facturacion/${document.id}/download/${kind}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `${document.fullNumber}.${kind}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <Button icon={Download} onClick={download} size="sm" variant="secondary">{label}</Button>;
}

function Metric({ icon: Icon, label, value, help, tone = "default" }) {
  const colors = { default: "bg-park-bg text-park-dark", green: "bg-park-green-soft text-park-green", gold: "bg-park-gold-soft text-park-black", danger: "bg-park-danger-soft text-park-danger" };
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><span className={`grid h-9 w-9 place-items-center rounded-xl ${colors[tone]}`}><Icon size={18} /></span><strong className="mt-3 block font-display text-3xl text-park-dark">{value}</strong><p className="text-sm font-black text-park-dark">{label}</p><p className="mt-1 text-xs text-park-muted">{help}</p></article>;
}

function Tab({ active, count, onClick, children }) {
  return <button className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${active ? "bg-park-green text-white shadow-sm" : "text-park-muted hover:bg-park-bg hover:text-park-dark"}`} onClick={onClick} type="button">{children} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20" : "bg-park-bg"}`}>{count}</span></button>;
}

function Amount({ label, value, total }) {
  return <div className={`flex items-center justify-between ${total ? "border-t border-park-border pt-3 text-base" : ""}`}><dt className={total ? "font-black text-park-dark" : "text-park-muted"}>{label}</dt><dd className={total ? "font-display text-xl font-semibold text-park-dark" : "font-bold text-park-dark"}>{money(value)}</dd></div>;
}

function Notice({ notice, onClose }) {
  const colors = { success: "border-park-green/30 bg-park-green-soft text-park-green", warning: "border-park-gold/40 bg-park-gold-soft text-park-black", danger: "border-park-danger/30 bg-park-danger-soft text-park-danger" };
  const Icon = notice.tone === "success" ? CheckCircle2 : AlertCircle;
  return <div className={`flex items-start justify-between gap-3 rounded-card border p-4 text-sm font-semibold ${colors[notice.tone] || colors.warning}`}><span className="flex gap-2"><Icon className="mt-0.5 shrink-0" size={17} />{notice.text}</span>{onClose ? <button aria-label="Cerrar mensaje" onClick={onClose}><X size={16} /></button> : null}</div>;
}
