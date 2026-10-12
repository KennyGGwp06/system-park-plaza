// Dinero › Cajas y cierre diario. Las cajas de Recepción (apertura, movimientos, lo declarado al rendir) que el dueño
// aprueba o rechaza, y el cierre diario definitivo: efectivo esperado según el sistema frente al contado.
// Rutas: GET /api/cash-sessions, PATCH /api/cash-sessions/:id/status, GET/POST /api/caja/cierre-diario.
import { useState } from "react";
import { Lock, Wallet } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, Status, Tag, dayText, soles, useBusy, useOpenId, useToast, whenText } from "./kit";

export function CashAdminPage() {
  const sessions = useFetch("/cash-sessions", { initialData: [], realtime: true, pollInterval: 30000 });
  const closing = useFetch("/caja/cierre-diario", { initialData: null, realtime: true, pollInterval: 30000 });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [openId, open] = useOpenId();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const rows = (Array.isArray(sessions.data) ? sessions.data : []).slice().sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)));
  const review = rows.filter((row) => row.status === "EN_REVISION");
  const openNow = rows.filter((row) => row.status === "ABIERTA");
  const c = closing.data;
  const diff = counted === "" ? null : Number(counted) - Number(c?.expectedCash || 0);
  const closeDay = () => run(async () => { await api("/caja/cierre-diario", { method: "POST", body: { actualCash: Number(counted), notes } }); show("Caja del día cerrada."); setCounted(""); setNotes(""); closing.reload(); });
  const selected = rows.find((row) => String(row.id) === openId) || null;
  if (sessions.loading && !rows.length && !c) return <LoadingSpinner label="Cargando cajas…" />;
  return <>
    <PageHead title="Cajas y cierre diario">Recepción abre caja, cobra y rinde; tú apruebas cada rendición y haces el cierre definitivo del día con el efectivo contado.</PageHead>
    {review.length ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>{review.length} caja(s) esperan tu revisión.</b></Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Wallet} label="Efectivo esperado hoy" value={soles(c?.expectedCash)} detail="Según pagos y movimientos" />
      <Kpi label="Cobrado hoy" value={soles(c?.approvedPayments)} detail={`${soles(c?.digitalPayments)} digital`} />
      <Kpi label="Cajas abiertas" value={openNow.length} detail={openNow.map((row) => row.operatorName).join(", ") || "Ninguna"} />
      <Kpi label="Por revisar" value={review.length} detail="Rendiciones enviadas" />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title={`Cierre diario · ${dayText(c?.date)}`} subtitle="Cuenta el efectivo físico del día y ciérralo; queda registrado y no se repite">
        {c?.closure ? <><Alert tone="ok">Caja del día cerrada {whenText(c.closure.closedAt)}.</Alert><dl className="rx-dl"><div><dt>Esperado</dt><dd>{soles(c.closure.expectedCash)}</dd></div><div><dt>Contado</dt><dd>{soles(c.closure.actualCash)}</dd></div><div><dt>Diferencia</dt><dd style={{ color: c.closure.variance < 0 ? "var(--crit)" : undefined }}>{soles(c.closure.variance)}</dd></div></dl></> : <>
          <div className="ow-form"><Field label="Efectivo contado (S/)"><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={counted} onChange={(event) => setCounted(event.target.value)} /></Field><Field label="Diferencia"><div className="rx-input" style={{ display: "flex", alignItems: "center", color: diff < 0 ? "var(--crit)" : diff > 0 ? "var(--warn)" : undefined }}>{diff == null ? "—" : soles(diff)}</div></Field><Field label="Nota (opcional)" full><input className="rx-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
          <button className="rx-btn rx-btn--primary" type="button" style={{ marginTop: 10 }} disabled={busy || counted === ""} onClick={closeDay}><Lock />Cerrar caja del día</button>
        </>}
        {error ? <Alert tone="crit">{error}</Alert> : null}
      </Card>
      <Card title="Cajas por revisar" flush>{review.length ? <ul className="rx-list">{review.map((row) => <li key={row.id} className="is-click" style={{ cursor: "pointer" }} onClick={() => open(row.id)}><div className="grow"><b>{row.operatorName}</b><small>{dayText(row.date)} · declaró {soles(row.actualCash)}</small></div><button className="rx-btn rx-btn--primary rx-btn--sm" type="button">Revisar</button></li>)}</ul> : <Empty title="Ninguna caja por revisar" />}</Card>
    </div>
    <Card title="Historial de cajas" flush>
      {rows.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha</th><th>Operador</th><th>Abrió</th><th>Cerró</th><th className="n">Fondo inicial</th><th className="n">Esperado</th><th className="n">Declarado</th><th>Estado</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}><td>{dayText(row.date)}</td><td>{row.operatorName}</td><td className="mut">{whenText(row.openedAt)}</td><td className="mut">{row.closedAt ? whenText(row.closedAt) : "—"}</td><td className="n">{soles(row.initialFund)}</td><td className="n">{soles(row.expectedCash)}</td><td className="n">{row.actualCash != null ? soles(row.actualCash) : "—"}</td><td><Status value={row.status} /></td></tr>)}</tbody></table></div> : <Empty title="Sin cajas registradas" />}
    </Card>
    {selected ? <SessionDrawer session={selected} onClose={() => open(null)} onDone={() => { open(null); sessions.reload(); }} /> : null}
  </>;
}

function SessionDrawer({ session, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [note, setNote] = useState("");
  const decide = (status) => run(async () => { await api(`/cash-sessions/${session.id}/status`, { method: "PATCH", body: { status, reviewNotes: note.trim() } }); show(status === "APROBADA" ? "Caja aprobada." : "Caja rechazada."); onDone(); });
  const declared = session.actualCash;
  const diff = declared != null ? Number(declared) - Number(session.expectedCash || 0) : null;
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Caja #${session.id} · ${dayText(session.date)}`} title={session.operatorName} subtitle={`Abrió ${whenText(session.openedAt)}${session.closedAt ? ` · cerró ${whenText(session.closedAt)}` : ""}`}
    footer={session.status === "EN_REVISION" ? <><button className="rx-btn rx-btn--danger" type="button" disabled={busy || note.trim().length < 5} onClick={() => decide("RECHAZADA")}>Rechazar</button><button className="rx-btn rx-btn--primary" type="button" disabled={busy} onClick={() => decide("APROBADA")}>Aprobar</button></> : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div><Status value={session.status} /></div>
    <dl className="rx-dl"><div><dt>Fondo inicial</dt><dd>{soles(session.initialFund)}</dd></div><div><dt>Esperado</dt><dd>{soles(session.expectedCash)}</dd></div><div><dt>Declarado</dt><dd>{declared != null ? soles(declared) : "—"}</dd></div><div><dt>Diferencia</dt><dd style={{ color: diff < 0 ? "var(--crit)" : undefined }}>{diff != null ? soles(diff) : "—"}</dd></div></dl>
    <section className="rx-sec"><h3>Movimientos ({(session.movements || []).length})</h3>{(session.movements || []).length ? <ul className="rx-list">{session.movements.map((row, index) => <li key={row.id || index}><div className="grow"><b>{row.concept || row.type}</b><small>{whenText(row.createdAt)} · {row.method || ""}</small></div><Tag tone={row.type === "EGRESO" ? "crit" : "ok"}>{row.type === "EGRESO" ? "-" : "+"}{soles(row.amount)}</Tag></li>)}</ul> : <p className="mut" style={{ margin: 0 }}>Sin movimientos en efectivo.</p>}</section>
    {session.reviewNotes ? <Alert tone="info">{session.reviewNotes}</Alert> : null}
    {session.status === "EN_REVISION" ? <Field label="Nota (obligatoria si rechazas)"><input className="rx-input" value={note} onChange={(event) => setNote(event.target.value)} /></Field> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
