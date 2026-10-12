// Comprobante electrónico (boleta, factura y nota de crédito) — compartido por Recepción (Caja › Pagos y comprobantes)
// y el dueño (Dinero › Boletas y facturas).
//  - IssueForm: arma el comprobante de un pago con su detalle real (POST /facturacion/preview) y lo emite.
//  - DocumentViewer: la representación impresa en pantalla (con QR y hash), descargas PDF/XML/CDR, reintento
//    y anulación con nota de crédito (solo el dueño).
// Rutas: /facturacion/preview, /facturacion, /facturacion/:id/view, /facturacion/:id/retry,
// /facturacion/:id/credit-note, /facturacion/:id/download/:kind.
import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileX2, RotateCcw } from "lucide-react";
import { apiBaseUrl } from "../../config/api";
import { api, getToken } from "../../services/api";
import { Alert, Tag, money } from "./rxkit";

export const DOC_STATE = { ACEPTADO: ["Aceptado", "ok"], RECHAZADO: ["Rechazado", "crit"], PENDIENTE_REINTENTO: ["Por reintentar", "warn"], ANULADO: ["Anulado", "off"], ENVIANDO: ["Enviando", "info"] };
export const DOC_TYPE = { BOLETA: "Boleta", FACTURA: "Factura", NOTA_CREDITO: "Nota de crédito" };
const ID_TYPES = [["DNI", "DNI"], ["CE", "Carné de extranjería"], ["PASAPORTE", "Pasaporte"], ["RUC", "RUC"], ["SIN_DOCUMENTO", "Sin documento (menos de S/ 700)"]];

export function isValidRuc(value) {
  const ruc = String(value || "");
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const sum = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + weight * Number(ruc[index]), 0);
  return (11 - (sum % 11)) % 10 === Number(ruc[10]);
}

async function fetchArtifact(id, kind) {
  const response = await fetch(`${apiBaseUrl}/facturacion/${id}/download/${kind}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "El archivo aún no está disponible."); }
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1] || `comprobante-${id}.${kind === "cdr" ? "zip" : kind}`;
  return { blob: await response.blob(), name };
}
export async function downloadDocument(id, kind) {
  const { blob, name } = await fetchArtifact(id, kind);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function openPdf(id) {
  const tab = window.open("", "_blank");
  const { blob } = await fetchArtifact(id, "pdf");
  const url = URL.createObjectURL(blob);
  if (tab) tab.location.href = url; else window.location.href = url;
}

/* Representación impresa en pantalla: misma información que el PDF. */
export function DocumentSheet({ view }) {
  if (!view) return null;
  const { issuer, recipient } = view;
  return <article className="ed-sheet" aria-label={`${view.typeLabel} ${view.fullNumber}`}>
    {view.environment === "DEMO" ? <div className="ed-demo">Demostración · sin valor tributario</div> : null}
    <header className="ed-head">
      <div className="ed-issuer"><b>{issuer.commercialName}</b><span>{issuer.legalName}</span><span>{issuer.address}</span>{issuer.phone || issuer.email ? <span>{[issuer.phone && `Tel. ${issuer.phone}`, issuer.email].filter(Boolean).join(" · ")}</span> : null}</div>
      <div className="ed-box"><span>R.U.C. N° {issuer.ruc}</span><b>{view.typeLabel}</b><strong>{view.fullNumber}</strong></div>
    </header>
    <dl className="ed-party">
      <div className="wide"><dt>Señor(es)</dt><dd>{recipient.name}</dd></div>
      <div><dt>{view.recipientDocumentLabel}</dt><dd className="rx-mono">{recipient.documentNumber}</dd></div>
      <div><dt>Fecha de emisión</dt><dd>{view.issuedDisplay}</dd></div>
      {recipient.address ? <div className="wide"><dt>Dirección</dt><dd>{recipient.address}</dd></div> : null}
      <div><dt>Moneda · pago</dt><dd>Soles · {view.paymentTerms || "Contado"} ({String(view.paymentMethod || "").toLowerCase()})</dd></div>
    </dl>
    {view.type === "NOTA_CREDITO" ? <p className="ed-ref">Modifica: <b>{DOC_TYPE[view.reference?.type]} {view.reference?.fullNumber}</b> · Motivo {view.reasonCode}: {view.reason}</p> : null}
    <table className="ed-lines"><thead><tr><th>Cant.</th><th>Descripción</th><th className="n">P. unit.</th><th className="n">Importe</th></tr></thead>
      <tbody>{(view.lines || []).map((line) => <tr key={line.index}><td>{line.quantity}</td><td>{line.description}</td><td className="n">{line.unitPrice.toFixed(2)}</td><td className="n">{line.total.toFixed(2)}</td></tr>)}</tbody></table>
    <div className="ed-totals"><div><span>Op. gravada</span><b>{money(view.subtotal)}</b></div><div><span>IGV {view.taxRate} %</span><b>{money(view.tax)}</b></div><div className="total"><span>Importe total</span><b>{money(view.total)}</b></div></div>
    <p className="ed-words">SON: {view.amountInWords}</p>
    <footer className="ed-foot">
      {view.qrDataUrl ? <img src={view.qrDataUrl} alt="Código QR del comprobante" width="104" height="104" /> : null}
      <div><b>Representación impresa de la {view.typeLabel?.toLowerCase()}</b><span>Código hash: <code>{view.hash}</code></span><span>SUNAT: {view.sunatDescription || view.status}</span></div>
    </footer>
  </article>;
}

export function DocumentViewer({ documentId, configuration, onChanged }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState({ code: "01", text: "" });
  const load = () => api(`/facturacion/${documentId}/view`).then(setView).catch((cause) => setError(cause.message));
  useEffect(() => { setView(null); setError(""); setVoiding(false); if (documentId) load(); }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn) => { setBusy(true); setError(""); try { await fn(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  if (!view) return error ? <Alert tone="crit">{error}</Alert> : <p className="mut">Cargando comprobante…</p>;
  const [label, tone] = DOC_STATE[view.status] || [view.status, "off"];
  const canVoid = configuration?.access?.canVoid && view.status === "ACEPTADO" && view.type !== "NOTA_CREDITO";
  const reasons = Object.entries(configuration?.creditNoteReasons || { "01": "Anulación de la operación" }).filter(([code]) => ["01", "02", "03", "06", "10"].includes(code));
  return <>
    <div className="ed-status"><Tag tone={tone}>{label}</Tag>{view.creditNotes?.length ? <span className="mut">Notas de crédito: {view.creditNotes.map((note) => note.fullNumber).join(", ")}</span> : null}</div>
    <DocumentSheet view={view} />
    <div className="ed-actions">
      <button className="rx-btn" type="button" disabled={busy} onClick={() => act(() => openPdf(view.id))}><ExternalLink />Abrir PDF</button>
      {["pdf", "xml", "cdr"].map((kind) => <button key={kind} className="rx-btn rx-btn--ghost" type="button" disabled={busy || (kind === "cdr" && view.status === "PENDIENTE_REINTENTO")} onClick={() => act(() => downloadDocument(view.id, kind))}><Download />{kind.toUpperCase()}</button>)}
      {view.status === "PENDIENTE_REINTENTO" && configuration?.access?.canRetry ? <button className="rx-btn rx-btn--primary" type="button" disabled={busy} onClick={() => act(async () => { await api(`/facturacion/${view.id}/retry`, { method: "POST" }); await load(); onChanged?.(); })}><RotateCcw />Reintentar envío</button> : null}
      {canVoid && !voiding ? <button className="rx-btn" type="button" disabled={busy} onClick={() => setVoiding(true)}><FileX2 />Anular con nota de crédito</button> : null}
    </div>
    {view.status === "PENDIENTE_REINTENTO" && !configuration?.access?.canRetry ? <Alert tone="warn">SUNAT no respondió. El dueño puede reintentar el envío; el número se conserva.</Alert> : null}
    {view.status === "ACEPTADO" && view.type !== "NOTA_CREDITO" && !configuration?.access?.canVoid ? <p className="mut" style={{ margin: 0 }}>¿Error en el comprobante? Pide al dueño que lo anule con una nota de crédito y vuelve a emitirlo.</p> : null}
    {voiding ? <section className="rx-sec ed-void"><h3>Nota de crédito sobre {view.fullNumber}</h3>
      <label className="rx-field"><span>Motivo (catálogo 09 de SUNAT)</span><select className="rx-select" value={reason.code} onChange={(event) => setReason({ ...reason, code: event.target.value })}>{reasons.map(([code, text]) => <option key={code} value={code}>{code} · {text}</option>)}</select></label>
      <label className="rx-field"><span>Detalle</span><input className="rx-input" value={reason.text} placeholder="Ej.: el cliente pidió factura en lugar de boleta" onChange={(event) => setReason({ ...reason, text: event.target.value })} /></label>
      <Alert tone="info">Se emite por el total ({money(view.total)}) y el comprobante queda anulado. Después podrás emitir uno nuevo para el mismo pago.</Alert>
      <div className="ed-actions"><button className="rx-btn" type="button" disabled={busy} onClick={() => setVoiding(false)}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" disabled={busy || reason.text.trim().length < 5} onClick={() => act(async () => { await api(`/facturacion/${view.id}/credit-note`, { method: "POST", body: { reasonCode: reason.code, reason: reason.text.trim() } }); setVoiding(false); await load(); onChanged?.(); })}>Emitir nota de crédito</button></div>
    </section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </>;
}

const nameOf = (client) => `${client?.firstName || ""} ${client?.lastName || ""}`.trim();
export function IssueForm({ payment, configuration, onIssued, onCancel }) {
  const [preview, setPreview] = useState(null);
  const [type, setType] = useState("BOLETA");
  const [simulation, setSimulation] = useState("ACEPTADO");
  const clientDoc = { documentType: ["DNI", "CE", "PASAPORTE", "RUC"].includes(String(payment.client?.documentType).toUpperCase()) ? String(payment.client.documentType).toUpperCase() : "DNI", documentNumber: /^GOOGLE/i.test(payment.client?.documentNumber || "") ? "" : payment.client?.documentNumber || "" };
  const [recipient, setRecipient] = useState({ ...clientDoc, name: nameOf(payment.client), email: payment.client?.email || "", address: payment.client?.address || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api("/facturacion/preview", { method: "POST", body: { paymentId: payment.id } }).then(setPreview).catch((cause) => setError(cause.message)); }, [payment.id]);
  const set = (patch) => setRecipient((current) => ({ ...current, ...patch }));
  const changeType = (value) => { setType(value); setError(""); setRecipient((current) => value === "FACTURA" ? { ...current, documentType: "RUC", documentNumber: current.documentType === "RUC" ? current.documentNumber : "", name: current.documentType === "RUC" ? current.name : "" } : { ...current, ...clientDoc, name: nameOf(payment.client) }); };
  const total = Number(preview?.total ?? payment.amount ?? 0);
  const threshold = Number(configuration?.boletaIdThreshold || 700);
  const problem = useMemo(() => {
    if (type === "FACTURA") { if (!/^\d{11}$/.test(recipient.documentNumber)) return "La factura necesita un RUC de 11 dígitos."; if (!isValidRuc(recipient.documentNumber)) return "El RUC no es válido (revisa el dígito verificador)."; if (!recipient.name.trim()) return "Escribe la razón social."; if (!recipient.address.trim()) return "Escribe la dirección fiscal."; return ""; }
    if (recipient.documentType === "SIN_DOCUMENTO") return total >= threshold ? `Desde S/ ${threshold} la boleta debe identificar al cliente.` : "";
    if (recipient.documentType === "DNI" && !/^\d{8}$/.test(recipient.documentNumber)) return "El DNI tiene 8 dígitos.";
    if (recipient.documentType === "RUC" && !isValidRuc(recipient.documentNumber)) return "El RUC no es válido.";
    if (["CE", "PASAPORTE"].includes(recipient.documentType) && !/^[A-Za-z0-9]{6,12}$/.test(recipient.documentNumber)) return "El documento tiene de 6 a 12 letras o números.";
    if (!recipient.name.trim()) return "Escribe el nombre del cliente.";
    return "";
  }, [type, recipient, total, threshold]);
  async function emit() {
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try { const document = await api("/facturacion", { method: "POST", body: { paymentId: payment.id, clientId: payment.clientId, type, recipient, simulationResult: simulation } }); onIssued(document); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <>
    <div className="rx-seg">{[["BOLETA", "Boleta"], ["FACTURA", "Factura"]].map(([key, label]) => <button key={key} type="button" className={type === key ? "is-on" : ""} onClick={() => changeType(key)}>{label}</button>)}</div>
    <section className="rx-sec"><h3>{type === "FACTURA" ? "Empresa (adquiriente)" : "Cliente"}</h3>
      <div className="ed-grid">
        {type === "BOLETA" ? <label className="rx-field"><span>Documento</span><select className="rx-select" value={recipient.documentType} onChange={(event) => set({ documentType: event.target.value, documentNumber: event.target.value === "SIN_DOCUMENTO" ? "" : recipient.documentNumber })}>{ID_TYPES.filter(([key]) => key !== "SIN_DOCUMENTO" || total < threshold).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label> : null}
        {recipient.documentType !== "SIN_DOCUMENTO" ? <label className="rx-field"><span>{type === "FACTURA" ? "RUC" : "Número"}</span><input className="rx-input rx-mono" inputMode={["DNI", "RUC"].includes(recipient.documentType) ? "numeric" : "text"} maxLength={recipient.documentType === "RUC" ? 11 : 12} value={recipient.documentNumber} onChange={(event) => set({ documentNumber: event.target.value.toUpperCase().replace(["DNI", "RUC"].includes(recipient.documentType) ? /\D/g : /[^A-Z0-9]/g, "") })} /></label> : null}
        <label className="rx-field full"><span>{type === "FACTURA" ? "Razón social" : "Nombre"}</span><input className="rx-input" value={recipient.name} placeholder={recipient.documentType === "SIN_DOCUMENTO" ? "CLIENTES VARIOS" : ""} onChange={(event) => set({ name: event.target.value })} /></label>
        <label className="rx-field full"><span>{type === "FACTURA" ? "Dirección fiscal" : "Dirección (opcional)"}</span><input className="rx-input" value={recipient.address} onChange={(event) => set({ address: event.target.value })} /></label>
        <label className="rx-field full"><span>Correo para enviarle el PDF (opcional)</span><input className="rx-input" type="email" value={recipient.email} onChange={(event) => set({ email: event.target.value })} /></label>
      </div>
    </section>
    <section className="rx-sec"><h3>Detalle</h3>
      {preview ? <>
        <table className="ed-lines compact"><tbody>{preview.lines.map((line) => <tr key={line.index}><td>{line.quantity}×</td><td>{line.description}</td><td className="n">{money(line.total)}</td></tr>)}</tbody></table>
        <div className="rx-ledger"><div><span>Op. gravada</span><b>{money(preview.subtotal)}</b></div><div><span>IGV {preview.taxRate} %</span><b>{money(preview.tax)}</b></div><div className="total"><span>Total</span><b>{money(preview.total)}</b></div></div>
        <p className="mut" style={{ margin: "6px 0 0", fontSize: 12 }}>SON: {preview.amountInWords}</p>
      </> : <p className="mut">Preparando el detalle…</p>}
    </section>
    {configuration?.simulation === true ? <label className="rx-field"><span>Respuesta simulada de SUNAT (modo demostración)</span><select className="rx-select" value={simulation} onChange={(event) => setSimulation(event.target.value)}><option value="ACEPTADO">Aceptado</option><option value="PENDIENTE_REINTENTO">Sin respuesta (queda por reintentar)</option><option value="RECHAZADO">Rechazado</option></select></label> : null}
    {configuration?.issuer?.rucIsDemo ? <Alert tone="warn">El hotel aún no registró su RUC: el comprobante sale con un RUC de prueba. Se configura en Configuración general.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
    <div className="ed-actions">{onCancel ? <button className="rx-btn" type="button" onClick={onCancel} disabled={busy}>Cancelar</button> : null}<button className="rx-btn rx-btn--primary" type="button" onClick={emit} disabled={busy || !preview || !payment.clientId}>{busy ? "Emitiendo…" : `Emitir ${type === "FACTURA" ? "factura" : "boleta"} electrónica`}</button></div>
  </>;
}
