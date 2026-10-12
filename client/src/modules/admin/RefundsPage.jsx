// Devoluciones. Regla del dueño: el cliente tiene 24 horas desde su pago para pedirla; se devuelve en 2 días hábiles y solo
// el Superadmin la aprueba y la registra. Recepción solicita; el dueño decide. El servidor valida todas las reglas.
import { useState } from "react";
import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { fmt } from "./OwnerCharts";
import "./OwnerHome.css";
import "./ControlPages.css";

const TIME_ZONE = "America/Lima";
const money = (value) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short", hour12: false, timeZone: TIME_ZONE }) : "—");
const dayLabel = (day) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : "—");
const SERVICES = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos" };
const STATES = { SOLICITADA: ["Por decidir", "warn"], APROBADA: ["Por devolver", "warn"], DEVUELTA: ["Devuelta", "ok"], RECHAZADA: ["Rechazada", "off"] };
const METHODS = [["YAPE", "Yape"], ["PLIN", "Plin"], ["TRANSFERENCIA", "Transferencia"], ["EFECTIVO", "Efectivo"]];

function Card({ title, sub, children, tools }) {
  return <section className="oh-card" style={{ marginTop: 16 }}><div className="oh-ch"><h2>{title}</h2>{tools}</div>{sub ? <div className="oh-ch2">{sub}</div> : null}<div className="oh-body oh-body--flush">{children}</div></section>;
}

function Modal({ title, onClose, children }) {
  return <div className="rf-backdrop" role="dialog" aria-modal="true" aria-label={title}><div className="rf-modal"><div className="rf-head"><h2>{title}</h2><button type="button" className="oh-btn" onClick={onClose} aria-label="Cerrar"><X size={16}/></button></div>{children}</div></div>;
}

export function RefundsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "SUPERADMIN";
  const { data, loading, error, reload } = useFetch("/refunds", { initialData: { rows: [], summary: null }, cacheTime: 10000, realtime: true, pollInterval: 30000 });
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ reason: "", exception: false, amount: "", note: "", method: "YAPE", operationRef: "" });

  if (loading && !data?.summary) return <main className="oh"><LoadingSpinner label="Cargando devoluciones..."/></main>;
  if (error && !data?.summary) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudieron cargar las devoluciones</strong><p>{error.message}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const summary = data.summary || {};
  const rows = data.rows || [];
  const patch = (values) => setForm((current) => ({ ...current, ...values }));

  async function search(event) {
    event?.preventDefault();
    setSearching(true); setFailure("");
    try { const result = await api(`/refunds/candidates?q=${encodeURIComponent(query)}`); setCandidates(result.rows); }
    catch (err) { setFailure(err.message); } finally { setSearching(false); }
  }
  async function submit(path, body, done) {
    setBusy(true); setFailure("");
    try { await api(path, { method: "POST", body }); setMessage(done); setDialog(null); setCandidates(null); await reload(); }
    catch (err) { setFailure(err.message); } finally { setBusy(false); }
  }
  const open = (kind, target) => { setFailure(""); setForm({ reason: "", exception: false, amount: target?.paid ?? "", note: "", method: "YAPE", operationRef: "" }); setDialog({ kind, target }); };

  return <main className="oh">
    <div className="oh-ph">
      <div><h1>Devoluciones</h1><p>El cliente tiene {data.windowHours || 24} horas desde su pago para pedirla · se devuelve en {data.businessDays || 2} días hábiles · solo el dueño la aprueba y la registra</p></div>
      <div className="oh-tools"><button type="button" className="oh-btn" onClick={reload}><RefreshCw size={16}/>Actualizar</button><button type="button" className="oh-btn p" onClick={() => { setCandidates(null); setQuery(""); setFailure(""); setDialog({ kind: "search" }); search(); }}><Search size={16}/>Nueva solicitud</button></div>
    </div>

    {message ? <div className="oh-note" style={{ background: "#EAF7EF", color: "#17643F" }}><strong>{message}</strong></div> : null}
    {failure && !dialog ? <div className="oh-error" style={{ marginBottom: 12 }}><AlertTriangle/><div><strong>No se completó la acción</strong><p>{failure}</p></div></div> : null}

    <section className="oh-card oh-kpis oh-kpis--4" aria-label="Resumen de devoluciones">
      <div className="k"><div className="l">{isOwner ? "Por decidir" : "Esperan al dueño"}</div><div className="v">{fmt(summary.toDecide || 0)}</div><div className="d">solicitudes sin resolver</div></div>
      <div className="k"><div className="l">Por devolver</div><div className="v">{fmt(summary.toReturn || 0)}</div><div className="d">aprobadas, falta el dinero</div></div>
      <div className="k"><div className="l">Vencidas</div><div className="v" style={summary.overdue ? { color: "#B42318" } : undefined}>{fmt(summary.overdue || 0)}</div><div className="d">pasó la fecha límite</div></div>
      <div className="k"><div className="l">Devueltas este mes</div><div className="v">{isOwner ? money(summary.returnedAmountThisMonth) : fmt(summary.returnedThisMonth || 0)}</div><div className="d">{isOwner ? `${fmt(summary.returnedThisMonth || 0)} devolución(es)` : "solicitudes resueltas"}</div></div>
    </section>

    <Card title="Solicitudes" sub={isOwner ? "Todas las solicitudes registradas" : "Las solicitudes que tú registraste"}>
      {rows.length ? <table className="oh-table">
        <thead><tr><th>Código</th><th>Reserva</th><th>Servicio</th><th className="n">Pagó</th><th className="n">A devolver</th><th>Solicitó</th><th>Fecha límite</th><th>Estado</th>{isOwner ? <th>Acción</th> : null}</tr></thead>
        <tbody>{rows.map((row) => { const [label, tone] = STATES[row.status] || [row.status, "off"]; return <tr key={row.id}>
          <td><b>{row.code}</b>{row.exception ? <div className="mut">Excepción del dueño</div> : null}</td>
          <td>{row.reservationCode}<div className="mut">{row.clientName}</div></td>
          <td>{SERVICES[row.type] || row.type}</td>
          <td className="n">{money(row.paid)}</td>
          <td className="n">{row.refundAmount ? money(row.refundAmount) : "—"}</td>
          <td>{row.requestedByName}<div className="mut">{stamp(row.requestedAt)}</div></td>
          <td>{dayLabel(row.dueDate)}{row.overdue ? <div><span className="oh-state oh-state--full">Vencida</span></div> : null}</td>
          <td><span className={`oh-state oh-state--${tone}`}>{label}</span>{row.status === "DEVUELTA" ? <div className="mut">{stamp(row.returnedAt)}</div> : null}</td>
          {isOwner ? <td>{row.status === "SOLICITADA" ? <div className="rf-actions"><button type="button" className="oh-btn p" onClick={() => open("approve", row)}>Aprobar</button><button type="button" className="oh-btn" onClick={() => open("reject", row)}>Rechazar</button></div> : row.status === "APROBADA" ? <button type="button" className="oh-btn p" onClick={() => open("complete", row)}>Registrar devolución</button> : <span className="mut">{row.decisionNote || "—"}</span>}</td> : null}
        </tr>; })}</tbody>
      </table> : <div className="oh-empty"><strong>Aún no hay solicitudes de devolución</strong><p>Cuando un cliente pida la devolución dentro de sus 24 horas, regístrala con "Nueva solicitud".</p></div>}
    </Card>

    <div className="oh-note oh-note--bottom"><strong>Cómo funciona:</strong> la solicitud retiene el pase y el check-in de la reserva. Al registrar la devolución, la reserva se cancela, el pase QR se anula y el egreso queda ligado al servicio para que la ganancia sea real. Pasadas las {data.windowHours || 24} horas del pago ya no hay devolución{isOwner ? ", salvo una excepción tuya con motivo escrito" : ""}.</div>

    {dialog?.kind === "search" ? <Modal title="Nueva solicitud de devolución" onClose={() => setDialog(null)}>
      <form className="rf-search" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código de reserva, nombre o DNI del cliente" autoFocus/><button type="submit" className="oh-btn p" disabled={searching}><Search size={16}/>Buscar</button></form>
      {failure ? <p className="rf-error">{failure}</p> : null}
      {candidates === null ? <p className="mut">Buscando reservas con pago...</p> : candidates.length ? <table className="oh-table"><thead><tr><th>Reserva</th><th className="n">Pagó</th><th>Pagó el</th><th>Plazo</th><th/></tr></thead><tbody>{candidates.map((row) => <tr key={`${row.type}-${row.id}`}>
        <td><b>{row.code}</b><div className="mut">{row.clientName} · {SERVICES[row.type] || row.type}</div></td>
        <td className="n">{money(row.paid)}</td>
        <td>{stamp(row.firstPaymentAt)}</td>
        <td>{row.openRequest ? <span className="oh-state oh-state--warn">En trámite {row.openRequest.code}</span> : row.open ? <span className="oh-state oh-state--ok">Quedan {Math.max(0, Math.floor(row.hoursLeft))} h</span> : <span className="oh-state oh-state--full">Venció</span>}</td>
        <td>{row.openRequest ? null : row.open ? <button type="button" className="oh-btn p" onClick={() => open("request", row)}>Solicitar</button> : isOwner ? <button type="button" className="oh-btn" onClick={() => open("request", { ...row, exceptionNeeded: true })}>Como excepción</button> : <span className="mut">Sin devolución</span>}</td>
      </tr>)}</tbody></table> : <p className="mut">No hay reservas con pago que coincidan. Solo aparecen reservas pagadas que no estén canceladas.</p>}
    </Modal> : null}

    {dialog?.kind === "request" ? <Modal title={`Solicitar devolución · ${dialog.target.code}`} onClose={() => setDialog(null)}>
      <p className="mut">{dialog.target.clientName} pagó {money(dialog.target.paid)} el {stamp(dialog.target.firstPaymentAt)}. {dialog.target.exceptionNeeded ? "El plazo de 24 horas ya venció: solo tú puedes autorizar una excepción." : `Le quedan ${Math.max(0, Math.floor(dialog.target.hoursLeft))} h para pedirla.`}</p>
      <label className="rf-field">Motivo de la devolución<textarea value={form.reason} onChange={(event) => patch({ reason: event.target.value })} rows={3} placeholder="Ej.: el cliente se equivocó de fecha"/></label>
      {failure ? <p className="rf-error">{failure}</p> : null}
      <div className="rf-foot"><button type="button" className="oh-btn" onClick={() => setDialog(null)}>Cancelar</button><button type="button" className="oh-btn p" disabled={busy} onClick={() => submit("/refunds", { type: dialog.target.type, id: dialog.target.id, reason: form.reason, exception: Boolean(dialog.target.exceptionNeeded) }, `Solicitud registrada para ${dialog.target.code}. El dueño la resolverá en ${data.businessDays || 2} días hábiles.`)}>{dialog.target.exceptionNeeded ? "Registrar excepción" : "Registrar solicitud"}</button></div>
    </Modal> : null}

    {dialog?.kind === "approve" ? <Modal title={`Aprobar ${dialog.target.code}`} onClose={() => setDialog(null)}>
      <p className="mut">{dialog.target.clientName} · {dialog.target.reservationCode}. Pagó {money(dialog.target.paid)}. Motivo: {dialog.target.reason}</p>
      <label className="rf-field">Monto a devolver (S/)<input type="number" min="0" step="0.01" max={dialog.target.paid} value={form.amount} onChange={(event) => patch({ amount: event.target.value })}/></label>
      <label className="rf-field">Nota (obligatoria si devuelves menos de lo pagado)<input value={form.note} onChange={(event) => patch({ note: event.target.value })}/></label>
      {failure ? <p className="rf-error">{failure}</p> : null}
      <div className="rf-foot"><button type="button" className="oh-btn" onClick={() => setDialog(null)}>Cancelar</button><button type="button" className="oh-btn p" disabled={busy} onClick={() => submit(`/refunds/${dialog.target.id}/decision`, { decision: "APROBAR", amount: form.amount, note: form.note }, `${dialog.target.code} aprobada. Ahora devuelve el dinero y regístralo.`)}>Aprobar devolución</button></div>
    </Modal> : null}

    {dialog?.kind === "reject" ? <Modal title={`Rechazar ${dialog.target.code}`} onClose={() => setDialog(null)}>
      <p className="mut">{dialog.target.clientName} · {dialog.target.reservationCode}. Al rechazar, la reserva recupera su pase y su check-in.</p>
      <label className="rf-field">Motivo del rechazo<textarea value={form.note} onChange={(event) => patch({ note: event.target.value })} rows={3}/></label>
      {failure ? <p className="rf-error">{failure}</p> : null}
      <div className="rf-foot"><button type="button" className="oh-btn" onClick={() => setDialog(null)}>Cancelar</button><button type="button" className="oh-btn p" disabled={busy} onClick={() => submit(`/refunds/${dialog.target.id}/decision`, { decision: "RECHAZAR", note: form.note }, `${dialog.target.code} rechazada.`)}>Rechazar solicitud</button></div>
    </Modal> : null}

    {dialog?.kind === "complete" ? <Modal title={`Registrar devolución ${dialog.target.code}`} onClose={() => setDialog(null)}>
      <p className="mut">Devuelve {money(dialog.target.refundAmount)} a {dialog.target.clientName}. Al registrarla, la reserva {dialog.target.reservationCode} se cancela y su pase QR se anula.</p>
      <label className="rf-field">Cómo devolviste el dinero<select value={form.method} onChange={(event) => patch({ method: event.target.value })}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="rf-field">Número de operación{form.method === "EFECTIVO" ? " (opcional)" : ""}<input value={form.operationRef} onChange={(event) => patch({ operationRef: event.target.value })}/></label>
      {failure ? <p className="rf-error">{failure}</p> : null}
      <div className="rf-foot"><button type="button" className="oh-btn" onClick={() => setDialog(null)}>Cancelar</button><button type="button" className="oh-btn p" disabled={busy} onClick={() => submit(`/refunds/${dialog.target.id}/complete`, { method: form.method, operationRef: form.operationRef }, `Devolución ${dialog.target.code} registrada. La reserva quedó cancelada.`)}>Registrar devolución</button></div>
    </Modal> : null}
  </main>;
}
