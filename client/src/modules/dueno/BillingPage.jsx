// Dinero › Boletas y facturas (2026-10-12). Facturación electrónica con el formato de SUNAT:
//  - Pagos sin comprobante: emitir boleta o factura con el detalle real del pago (IssueForm).
//  - Comprobantes: boletas, facturas y notas de crédito; representación impresa con QR y hash, PDF/XML/CDR,
//    reintento y anulación con nota de crédito (DocumentViewer).
//  - Registro de ventas: base imponible, IGV y total por periodo, exportable a CSV (como el registro de ventas).
// Rutas: GET /api/facturacion (?range=), /pagos, /facturacion/configuration y las de ElectronicDocument.jsx.
import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { DOC_STATE, DOC_TYPE, DocumentViewer, IssueForm } from "../recepcion/ElectronicDocument";
import { Alert, Card, Drawer, Empty, Kpi, PageHead, SearchBox, Seg, Tag, limaDay, soles, useToast, whenText } from "./kit";

const clientName = (row) => `${row?.client?.firstName || ""} ${row?.client?.lastName || ""}`.trim() || "Cliente";
// Necesita comprobante si no tiene, o si el suyo fue rechazado o anulado por un error (no si se anuló por una devolución).
const needsDocument = (payment) => !payment.refundCode && (!payment.invoice || payment.invoice.status === "RECHAZADO" || (payment.invoice.status === "ANULADO" && !payment.invoice.closedByRefund));
const sign = (doc) => (doc.type === "NOTA_CREDITO" ? -1 : 1);
const monthKey = (offset = 0) => { const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })); now.setDate(1); now.setMonth(now.getMonth() + offset); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };

export function BillingPage() {
  const documents = useFetch("/facturacion?range=400", { initialData: [], realtime: true });
  const payments = useFetch("/pagos", { initialData: [], realtime: true });
  const config = useFetch("/facturacion/configuration", { initialData: null, realtime: false });
  const show = useToast();
  const [tab, setTab] = useState("pendientes");
  const [text, setText] = useState("");
  const [issuing, setIssuing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [period, setPeriod] = useState(monthKey());
  const docs = useMemo(() => (Array.isArray(documents.data) ? documents.data : []).slice().sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt))), [documents.data]);
  const pending = (Array.isArray(payments.data) ? payments.data : []).filter((p) => p.status === "APROBADO" && p.clientId && needsDocument(p)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const shownDocs = useMemo(() => docs.filter((d) => !text.trim() || `${d.fullNumber} ${d.recipient?.name} ${d.recipient?.documentNumber}`.toLowerCase().includes(text.trim().toLowerCase())), [docs, text]);
  const month = monthKey();
  const valid = (d) => ["ACEPTADO", "ANULADO"].includes(d.status);
  const ofMonth = docs.filter((d) => valid(d) && limaDay(d.issuedAt).startsWith(month));
  const net = (rows, key) => rows.reduce((sum, d) => sum + sign(d) * Number(d[key] || 0), 0);
  const register = docs.filter((d) => valid(d) && limaDay(d.issuedAt).startsWith(period)).sort((a, b) => String(a.issuedAt).localeCompare(String(b.issuedAt)));
  const reload = () => { documents.reload(); payments.reload(); };
  const exportCsv = () => {
    const head = ["Fecha", "Tipo", "Serie-Número", "Tipo doc. cliente", "N.º doc. cliente", "Cliente", "Base imponible", "IGV", "Total", "Estado", "Doc. modificado"];
    const rows = register.map((d) => [limaDay(d.issuedAt).split("-").reverse().join("/"), d.sunatDocumentType, d.fullNumber, d.recipient?.documentTypeCode || "", d.recipient?.documentNumber || "", d.recipient?.name || "", (sign(d) * d.subtotal).toFixed(2), (sign(d) * d.tax).toFixed(2), (sign(d) * d.total).toFixed(2), d.status, d.reference?.fullNumber || ""]);
    const csv = [head, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `registro-ventas-${period}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  if (documents.loading && !docs.length && payments.loading) return <LoadingSpinner label="Cargando comprobantes…" />;
  const issuer = config.data?.issuer;
  return <>
    <PageHead title="Boletas y facturas" tools={<Seg value={tab} onChange={setTab} options={[["pendientes", "Sin comprobante", pending.length], ["emitidos", "Comprobantes", docs.length], ["registro", "Registro de ventas"]]} />}>Cada pago aprobado lleva su boleta o factura electrónica. Revisa el estado ante SUNAT, descarga el PDF, XML o CDR y anula con nota de crédito.</PageHead>
    {config.data ? <div style={{ marginBottom: 12 }}><Alert tone={config.data.simulation || issuer?.rucIsDemo ? "warn" : "info"}><b>{config.data.label}.</b> Emisor: {issuer?.legalName} · RUC {issuer?.ruc}{issuer?.rucIsDemo ? " (de prueba)" : ""} · Series {config.data.series?.BOLETA} y {config.data.series?.FACTURA} · IGV {config.data.taxRate} %. {config.data.message} <a href="/superadmin/sistema/configuracion" style={{ whiteSpace: "nowrap", fontWeight: 600 }}>Ir a Configuración general →</a></Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={FileText} label="Pagos sin comprobante" value={pending.length} detail={soles(pending.reduce((s, p) => s + Number(p.amount || 0), 0))} />
      <Kpi label="Facturado este mes" value={soles(net(ofMonth, "total"))} detail={`${ofMonth.filter((d) => d.type !== "NOTA_CREDITO").length} comprobantes · neto de notas de crédito`} />
      <Kpi label="IGV del mes" value={soles(net(ofMonth, "tax"))} detail={`Base imponible ${soles(net(ofMonth, "subtotal"))}`} />
      <Kpi label="Por reintentar / rechazados" value={`${docs.filter((d) => d.status === "PENDIENTE_REINTENTO").length} / ${docs.filter((d) => d.status === "RECHAZADO").length}`} detail="Revisa y vuelve a enviar o emitir" />
    </div>
    {tab === "pendientes" ? <Card title="Pagos aprobados sin comprobante" flush>
      {pending.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Documento</th><th>Concepto</th><th>Medio</th><th className="n">Monto</th><th /></tr></thead>
        <tbody>{pending.map((p) => <tr key={p.id} className="is-click" onClick={() => setIssuing(p)}><td className="mut">{whenText(p.createdAt)}</td><td>{clientName(p)}</td><td className="mut rx-mono">{p.client?.documentNumber || "—"}</td><td className="mut">{p.concept}{p.invoice ? <small style={{ display: "block" }}>{p.invoice.fullNumber} {p.invoice.status === "ANULADO" ? "anulado" : "rechazado"}</small> : null}</td><td>{p.method}</td><td className="n">{soles(p.amount)}</td><td className="n"><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={(event) => { event.stopPropagation(); setIssuing(p); }}>Emitir</button></td></tr>)}</tbody></table></div> : <Empty icon={FileText} title="Todos los pagos tienen comprobante" />}
    </Card> : tab === "emitidos" ? <Card title="Comprobantes emitidos" flush tools={<SearchBox value={text} onChange={setText} placeholder="Número, cliente o documento" width={240} />}>
      {shownDocs.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Número</th><th>Tipo</th><th>Cliente</th><th>Emitido</th><th>Estado</th><th className="n">Total</th><th /></tr></thead>
        <tbody>{shownDocs.map((d) => { const [label, tone] = DOC_STATE[d.status] || [d.status, "off"]; return <tr key={d.id} className="is-click" onClick={() => setViewing(d)}><td><b className="rx-mono">{d.fullNumber}</b>{d.reference ? <small className="mut" style={{ display: "block" }}>modifica {d.reference.fullNumber}</small> : null}</td><td>{DOC_TYPE[d.type] || d.type}</td><td>{d.recipient?.name}<small className="mut" style={{ display: "block" }}>{d.recipient?.documentType} {d.recipient?.documentNumber}</small></td><td className="mut">{whenText(d.issuedAt)}</td><td><Tag tone={tone}>{label}</Tag></td><td className="n">{d.type === "NOTA_CREDITO" ? "−" : ""}{soles(d.total)}</td><td className="n"><button className="rx-btn rx-btn--sm" type="button" onClick={(event) => { event.stopPropagation(); setViewing(d); }}>Ver</button></td></tr>; })}</tbody></table></div> : <Empty icon={FileText} title="Sin comprobantes" />}
    </Card> : <Card title="Registro de ventas" tools={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><select className="rx-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Periodo">{[0, -1, -2, -3, -4, -5].map((offset) => { const key = monthKey(offset); const [y, m] = key.split("-"); return <option key={key} value={key}>{new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</option>; })}</select><button className="rx-btn" type="button" disabled={!register.length} onClick={exportCsv}><Download />Exportar CSV</button></div>} flush>
      {register.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Serie-Número</th><th>Cliente</th><th className="n">Base imponible</th><th className="n">IGV</th><th className="n">Total</th></tr></thead>
        <tbody>{register.map((d) => <tr key={d.id} className="is-click" onClick={() => setViewing(d)}><td className="mut">{limaDay(d.issuedAt).split("-").reverse().join("/")}</td><td>{d.sunatDocumentType} · {DOC_TYPE[d.type]}</td><td className="rx-mono">{d.fullNumber}</td><td>{d.recipient?.name}<small className="mut" style={{ display: "block" }}>{d.recipient?.documentType} {d.recipient?.documentNumber}</small></td><td className="n">{soles(sign(d) * d.subtotal)}</td><td className="n">{soles(sign(d) * d.tax)}</td><td className="n"><b>{soles(sign(d) * d.total)}</b></td></tr>)}
          <tr><td colSpan={4}><b>Total del periodo ({register.length} documentos)</b></td><td className="n"><b>{soles(net(register, "subtotal"))}</b></td><td className="n"><b>{soles(net(register, "tax"))}</b></td><td className="n"><b>{soles(net(register, "total"))}</b></td></tr></tbody></table></div> : <Empty icon={FileText} title="Sin comprobantes en este periodo" />}
    </Card>}
    {issuing ? <Drawer open onClose={() => setIssuing(null)} eyebrow={`Pago #${issuing.id} · ${issuing.method}`} title={`Emitir por ${soles(issuing.amount)}`} subtitle={`${clientName(issuing)} · ${issuing.concept} · ${whenText(issuing.createdAt)}`}>
      <IssueForm payment={issuing} configuration={config.data} onCancel={() => setIssuing(null)} onIssued={(doc) => { setIssuing(null); show(`${doc.fullNumber}: ${(DOC_STATE[doc.status] || [doc.status])[0]}.`); reload(); setViewing(doc); }} />
    </Drawer> : null}
    {viewing ? <Drawer open onClose={() => setViewing(null)} eyebrow={DOC_TYPE[viewing.type] || "Comprobante"} title={viewing.fullNumber} subtitle={`${viewing.recipient?.name || ""} · ${soles(viewing.total)}`}>
      <DocumentViewer documentId={viewing.id} configuration={config.data} onChanged={reload} />
    </Drawer> : null}
  </>;
}
