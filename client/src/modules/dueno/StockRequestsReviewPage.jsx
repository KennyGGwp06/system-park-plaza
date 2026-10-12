// Insumos › Solicitudes de las áreas. Cocina y Bar piden insumos (el pedido de mañana desde su cierre o una emergencia);
// el dueño ajusta cantidades, aprueba y el sistema reserva lotes y despacha el envío, o rechaza con una nota.
// Rutas: GET /api/stock-requests, POST /api/stock-requests/:id/review, POST /api/transfers/:id/send.
import { useState } from "react";
import { CheckCircle2, PackagePlus, Send, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, Seg, Tag, qty, useBusy, useOpenId, useToast, whenText } from "./kit";

const AREA = { RESTAURANTE: "Cocina", BARTENDER: "Bar" };
const stateOf = (row) => row.status === "REJECTED" ? ["Rechazada", "crit"] : row.status === "REQUESTED" ? ["Por aprobar", "warn"] : ["RECEIVED", "RECEIVED_WITH_DIFFERENCE"].includes(row.transferStatus) ? ["Recibida", "ok"] : row.transferStatus === "SENT" ? ["En camino", "info"] : ["Aprobada sin despachar", "warn"];

export function StockRequestsReviewPage() {
  const requests = useFetch("/stock-requests", { initialData: [], realtime: true, pollInterval: 20000 });
  const [openId, open] = useOpenId();
  const [filter, setFilter] = useState("revisar");
  const rows = (Array.isArray(requests.data) ? requests.data : []).slice().sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  const pending = rows.filter((row) => row.status === "REQUESTED");
  const shown = filter === "revisar" ? pending : rows;
  const excess = pending.filter((row) => (row.lines || []).some((line) => line.excess));
  const selected = rows.find((row) => String(row.id) === openId) || null;
  if (requests.loading && !rows.length) return <LoadingSpinner label="Cargando solicitudes…" />;
  return <>
    <PageHead title="Solicitudes de las áreas" tools={<Seg value={filter} onChange={setFilter} options={[["revisar", "Por aprobar", pending.length], ["todas", "Todas", rows.length]]} />}>Lo que piden la cocina y el bar. Si piden más de lo que justifican sus ventas, se marca como exceso. Al aprobar, el almacén despacha el envío y el área lo cuenta al recibir.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={PackagePlus} label="Por aprobar" value={pending.length} detail={pending[0] ? `La más antigua: ${whenText(pending[pending.length - 1].requestedAt)}` : "Al día"} />
      <Kpi label="Con exceso" value={excess.length} detail="Piden más de lo justificado" />
      <Kpi label="En camino" value={rows.filter((row) => row.transferStatus === "SENT").length} detail="Falta que el área confirme" />
      <Kpi label="Rechazadas" value={rows.filter((row) => row.status === "REJECTED").length} detail="Historial" />
    </div>
    <Card title={filter === "revisar" ? "Esperan tu aprobación" : "Todas las solicitudes"} flush>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Solicitud</th><th>Área</th><th>Origen</th><th>Insumos</th><th>Pedida</th><th>Estado</th><th /></tr></thead>
        <tbody>{shown.map((row) => { const [label, tone] = stateOf(row); return <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{AREA[row.area] || row.area}</td><td className="mut">{row.source === "CIERRE" ? "Pedido para mañana" : "Emergencia"}</td>
          <td className="mut" style={{ maxWidth: 340 }}>{(row.lines || []).map((line) => `${line.productName} ${qty(line.approvedQuantity ?? line.requestedQuantity)} ${line.unitSymbol}`).join(", ")}{(row.lines || []).some((line) => line.excess) ? <> <Tag tone="crit">Exceso</Tag></> : null}</td>
          <td className="mut">{whenText(row.requestedAt)}</td><td><Tag tone={tone}>{label}</Tag></td>
          <td className="n">{row.status === "REQUESTED" ? <button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={(event) => { event.stopPropagation(); open(row.id); }}>Revisar</button> : null}</td>
        </tr>; })}</tbody></table></div> : <Empty icon={CheckCircle2} title="Nada por aprobar">Cuando la cocina o el bar pidan insumos, aparecerá aquí.</Empty>}
    </Card>
    {selected ? <ReviewDrawer request={selected} onClose={() => open(null)} onDone={() => { open(null); requests.reload(); }} /> : null}
  </>;
}

function ReviewDrawer({ request, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [quantities, setQuantities] = useState(Object.fromEntries((request.lines || []).map((line) => [line.id, String(Number(line.approvedQuantity ?? line.requestedQuantity))])));
  const [note, setNote] = useState("");
  const pending = request.status === "REQUESTED";
  const short = (request.lines || []).filter((line) => Number(quantities[line.id] || 0) > Number(line.generalAvailable || 0) + 0.000001);
  const approve = () => run(async () => {
    const approved = await api(`/stock-requests/${request.id}/review`, { method: "POST", body: { decision: "APPROVE", note: note.trim(), lines: request.lines.map((line) => ({ lineId: line.id, quantity: Number(quantities[line.id] || 0) })) } });
    if (approved.transferId) { try { await api(`/transfers/${approved.transferId}/send`, { method: "POST", body: {} }); show(`${request.code} aprobada y enviada al área.`); } catch (cause) { show(`${request.code} aprobada; el envío quedó pendiente: ${cause.message}`); } } else show(`${request.code} aprobada.`);
    onDone();
  });
  const reject = () => run(async () => { await api(`/stock-requests/${request.id}/review`, { method: "POST", body: { decision: "REJECT", note: note.trim() } }); show(`${request.code} rechazada.`); onDone(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${request.code} · ${AREA[request.area] || request.area}`} title={request.source === "CIERRE" ? "Pedido para mañana" : "Pedido de emergencia"} subtitle={`Pedida ${whenText(request.requestedAt)}${request.observation ? ` · “${request.observation}”` : ""}`}
    footer={pending ? <><button className="rx-btn rx-btn--danger" type="button" disabled={busy || note.trim().length < 5} onClick={reject}><X />Rechazar</button><button className="rx-btn rx-btn--primary" type="button" disabled={busy || short.length > 0} onClick={approve}><Send />Aprobar y enviar</button></> : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Insumo</th><th className="n">Se justifica</th><th className="n">Pidió</th><th className="n">En almacén</th><th className="n">{pending ? "Aprobar" : "Aprobado"}</th></tr></thead>
      <tbody>{(request.lines || []).map((line) => { const over = Number(quantities[line.id] || 0) > Number(line.generalAvailable || 0) + 0.000001; return <tr key={line.id}>
        <td><b style={{ fontWeight: 600 }}>{line.productName}</b>{line.excess ? <> <Tag tone="crit">Exceso</Tag></> : null}</td>
        <td className="n mut">{line.justifiedQuantity != null ? `${qty(line.justifiedQuantity)} ${line.unitSymbol}` : "—"}</td><td className="n">{qty(line.requestedQuantity)} {line.unitSymbol}</td>
        <td className="n" style={{ color: over ? "var(--crit)" : undefined }}>{qty(line.generalAvailable)}</td>
        <td className="n">{pending ? <input className="rx-input rx-mono" type="number" min="0" step="any" value={quantities[line.id]} onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })} style={{ width: 110, textAlign: "right", borderColor: over ? "#EBC5C9" : undefined }} /> : `${qty(line.approvedQuantity)} ${line.unitSymbol}`}</td>
      </tr>; })}</tbody></table></div>
    {short.length ? <Alert tone="warn">El almacén general no tiene suficiente {short.map((line) => line.productName).join(", ")}. Baja la cantidad o compra primero (Necesidades del día).</Alert> : null}
    {pending ? <Field label="Nota para el área (obligatoria si rechazas)"><textarea className="rx-input" style={{ height: 70, paddingTop: 8 }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. aprobado a medias: el resto llega con la compra del jueves" /></Field> : request.reviewNote ? <Alert tone="info"><b>Tu respuesta:</b> {request.reviewNote}</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
