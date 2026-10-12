// Caja › Pagos y comprobantes. Une "Pagos registrados" y "Boletas y facturas": el historial de cobros en una
// tabla y, por cada pago, su comprobante (emitir boleta o factura, descargar PDF/XML/CDR o reintentar).
// Datos: GET /api/pagos, /api/facturacion/configuration; emisión POST /api/facturacion (mismas reglas SUNAT).
import { useMemo, useState } from "react";
import { FileText, ReceiptText, RefreshCw } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, Kpi, PageHead, Tag, dateShort, money, timeOf, todayKey, addDays, useToast } from "./rxkit";
import { DOC_STATE, DocumentViewer, IssueForm } from "./ElectronicDocument";

const METHOD = { EFECTIVO: "Efectivo", YAPE: "Yape", PLIN: "Plin", TARJETA: "Tarjeta", "CAJA HOTEL": "Caja" };
const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");
// Un pago necesita comprobante si no tiene o si el que tenía fue rechazado o anulado con nota de crédito.
const needsDocument = (row) => !row.refundCode && (!row.invoice || row.invoice.status === "RECHAZADO" || (row.invoice.status === "ANULADO" && !row.invoice.closedByRefund));
const nameOf = (client) => `${client?.firstName || ""} ${client?.lastName || ""}`.trim() || "Sin cliente";

export function PaymentsPage() {
  const payments = useFetch("/pagos", { initialData: [], realtime: true, pollInterval: 30000 });
  const configuration = useFetch("/facturacion/configuration", { initialData: null, realtime: false });
  const [period, setPeriod] = useState("hoy");
  const [method, setMethod] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState(null);
  const today = todayKey();

  const rows = useMemo(() => {
    const from = period === "hoy" ? today : period === "semana" ? addDays(today, -6) : "";
    const needle = text.trim().toLowerCase();
    return (payments.data || []).filter((row) => {
      if (from && localDay(row.createdAt) < from) return false;
      if (method && String(row.method).toUpperCase() !== method) return false;
      if (onlyPending && !needsDocument(row)) return false;
      if (needle && !`${nameOf(row.client)} ${row.client?.documentNumber || ""} ${row.concept || ""} ${row.reservation?.code || ""} ${row.event?.code || ""} ${row.reference || ""} ${row.invoice?.fullNumber || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [payments.data, period, method, onlyPending, text, today]);

  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const byMethod = rows.reduce((acc, row) => { const key = String(row.method || "").toUpperCase(); acc[key] = (acc[key] || 0) + Number(row.amount || 0); return acc; }, {});
  const pending = rows.filter((row) => row.status === "APROBADO" && row.clientId && needsDocument(row)).length;
  const demo = configuration.data?.simulation === true;

  return <>
    <PageHead title="Pagos y comprobantes" tools={<button className="rx-btn" type="button" onClick={payments.reload}><RefreshCw />Actualizar</button>}>
      Todo lo cobrado, quién lo registró y su boleta o factura. {demo ? "Facturación en modo de prueba: los comprobantes no se envían a SUNAT." : ""}
    </PageHead>

    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ReceiptText} label="Cobrado en el periodo" value={money(total)} detail={`${rows.length} pago(s)`} />
      <Kpi label="Efectivo" value={money(byMethod.EFECTIVO || 0)} detail="Entra a la caja del turno" />
      <Kpi label="Yape, Plin y tarjeta" value={money((byMethod.YAPE || 0) + (byMethod.PLIN || 0) + (byMethod.TARJETA || 0))} detail="Van directo a la cuenta del hotel" />
      <Kpi icon={FileText} label="Sin comprobante" value={pending} detail={pending ? "Emite la boleta o factura" : "Todo emitido"} />
    </div>

    <section className="rx-card">
      <div className="rx-filters">
        <input className="rx-input rx-input--search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Cliente, DNI, reserva, operación o comprobante" aria-label="Buscar pago" />
        <div className="rx-seg">{[["hoy", "Hoy"], ["semana", "7 días"], ["todo", "90 días"]].map(([key, label]) => <button key={key} type="button" className={period === key ? "is-on" : ""} onClick={() => setPeriod(key)}>{label}</button>)}</div>
        <select className="rx-select" value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Método"><option value="">Todos los métodos</option>{Object.entries(METHOD).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}><input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} style={{ accentColor: "#1E6FD6" }} />Solo sin comprobante</label>
      </div>
      {payments.loading && !payments.data?.length ? <LoadingSpinner /> : rows.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Registró</th><th>Método</th><th className="n">Monto</th><th>Comprobante</th><th /></tr></thead>
        <tbody>{rows.map((row) => { const doc = row.invoice; const [label, tone] = DOC_STATE[doc?.status] || [doc?.status, "off"]; return <tr key={row.id} className="is-click" onClick={() => setSelected(row)}>
          <td className="mut" style={{ whiteSpace: "nowrap" }}>{dateShort(localDay(row.createdAt))} · {timeOf(row.createdAt)}</td>
          <td><div className="rx-who"><b>{nameOf(row.client)}</b><small>DNI {row.client?.documentNumber || "—"}</small></div></td>
          <td><div className="rx-who"><b style={{ fontWeight: 500 }}>{row.concept || "Cobro"}</b><small>{[String(row.concept || "").includes(row.reservation?.code || row.event?.code || "@@") ? "" : row.reservation?.code || row.event?.code || "", row.reference ? `op. ${row.reference}` : ""].filter(Boolean).join(" · ") || "—"}</small></div></td>
          <td className="mut">{row.registeredBy?.name || (row.createdById ? "Recepción" : "Cliente (web)")}</td>
          <td>{METHOD[String(row.method).toUpperCase()] || row.method}</td>
          <td className="n"><b>{money(row.amount)}</b></td>
          <td>{doc ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><b className="rx-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{doc.fullNumber || `${doc.series}-${doc.number}`}</b><Tag tone={tone}>{label}</Tag></span> : row.refundCode ? <Tag tone="off">Devuelto · {row.refundCode}</Tag> : <span className="mut">Sin emitir</span>}</td>
          <td className="n"><button className={`rx-btn rx-btn--sm ${needsDocument(row) ? "rx-btn--primary" : ""}`} type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>{needsDocument(row) ? "Emitir" : "Ver"}</button></td>
        </tr>; })}</tbody>
      </table></div> : <Empty icon={ReceiptText} title="Sin pagos en este periodo">Cambia el periodo o los filtros.</Empty>}
    </section>

    <InvoiceDrawer payment={selected} configuration={configuration.data} onClose={() => setSelected(null)} onDone={(close = true) => { if (close) setSelected(null); payments.reload(); }} />
  </>;
}

function InvoiceDrawer({ payment, configuration, onClose, onDone }) {
  const show = useToast();
  const [issued, setIssued] = useState(null);
  if (!payment) return null;
  const documentId = issued?.id || payment.invoice?.id;
  const canReissue = payment.invoice && needsDocument(payment) && !issued;
  const close = () => { setIssued(null); onClose(); };
  return <Drawer open onClose={close} eyebrow={`Pago #${payment.id} · ${METHOD[String(payment.method).toUpperCase()] || payment.method}`} title={money(payment.amount)} subtitle={`${nameOf(payment.client)} · ${payment.concept || "Cobro"} · ${dateShort(localDay(payment.createdAt))} ${timeOf(payment.createdAt)}`}>
    {!payment.clientId ? <Alert tone="warn">Este pago no tiene cliente asociado; no se puede emitir comprobante.</Alert> : null}
    {documentId && !canReissue ? <DocumentViewer documentId={documentId} configuration={configuration} onChanged={onDone} /> : <>
      {canReissue ? <Alert tone="info">El comprobante {payment.invoice.fullNumber} quedó {payment.invoice.status === "ANULADO" ? "anulado con nota de crédito" : "rechazado"}. Emite uno nuevo para este pago.</Alert> : null}
      <IssueForm payment={payment} configuration={configuration} onCancel={close} onIssued={(document) => { show(`${document.fullNumber}: ${(DOC_STATE[document.status] || [document.status])[0]}.`); setIssued(document); onDone(false); }} />
    </>}
  </Drawer>;
}
