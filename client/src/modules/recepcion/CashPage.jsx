// Caja › Mi caja y cierre. Apertura con fondo inicial, el efectivo que entró en el turno, cuánto debe haber y
// la rendición al dueño (POST /api/cash-sessions y /:id/submit). Yape, Plin y tarjeta se listan aparte porque
// no entran al efectivo contado. Datos del turno: /api/reception/desk (cash).
import { useState } from "react";
import { Banknote, Lock, RefreshCw, Send } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Alert, Empty, Kpi, PageHead, Tag, dateShort, money, timeOf, useShift, useToast } from "./rxkit";

const METHOD = { EFECTIVO: "Efectivo", YAPE: "Yape", PLIN: "Plin", TARJETA: "Tarjeta", INGRESO: "Ingreso de caja", EGRESO: "Egreso de caja" };
const SESSION = { ABIERTA: ["Abierta", "ok"], EN_REVISION: ["En revisión del dueño", "warn"], APROBADA: ["Aprobada", "ok"], CERRADA: ["Cerrada", "off"], OBSERVADA: ["Observada", "crit"], RECHAZADA: ["Observada", "crit"] };

export function CashPage() {
  const show = useToast();
  const { desk, reloadDesk, active, openClock } = useShift();
  const history = useFetch("/cash-sessions", { initialData: [], realtime: false });
  const [fund, setFund] = useState("0");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cash = desk?.cash;
  const session = cash?.session;
  const cashRows = (cash?.movements || []).filter((row) => row.inCash);
  const digitalRows = (cash?.movements || []).filter((row) => !row.inCash);
  const difference = counted === "" ? null : Math.round((Number(counted) - Number(session?.expected || 0)) * 100) / 100;
  const refresh = () => { reloadDesk(); history.reload(); };

  async function openCash() {
    setBusy(true); setError("");
    try { await api("/cash-sessions", { method: "POST", body: { initialFund: Number(fund || 0) } }); show("Caja abierta. Ya puedes recibir efectivo."); refresh(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function submit() {
    if (counted === "" || Number(counted) < 0) { setError("Cuenta el efectivo físico e ingresa el monto."); return; }
    if (difference !== 0 && !notes.trim()) { setError("Hay diferencia con lo esperado: explica el motivo para el dueño."); return; }
    if (!window.confirm(`¿Enviar tu caja al dueño con ${money(counted)} contados?`)) return;
    setBusy(true); setError("");
    try { await api(`/cash-sessions/${session.id}/submit`, { method: "POST", body: { actualCash: Number(counted), notes } }); show("Caja enviada al dueño para revisión. Ya puedes marcar tu salida."); setCounted(""); setNotes(""); refresh(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <>
    <PageHead title="Mi caja y cierre" tools={<button className="rx-btn" type="button" onClick={refresh}><RefreshCw />Actualizar</button>}>Solo cuentas el efectivo. Yape, Plin y tarjeta quedan registrados a tu nombre, pero no entran al conteo.</PageHead>

    {!session ? <section className="rx-card" style={{ maxWidth: 560 }}>
      <div className="rx-card-h"><div><h2>Abrir mi caja</h2><p>Necesaria para recibir pagos en efectivo durante el turno</p></div><Tag>Cerrada</Tag></div>
      <div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
        {!active ? <Alert tone="warn">Primero inicia tu turno. <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert> : null}
        <label className="rx-field" style={{ maxWidth: 220 }}><span>Fondo inicial (sencillo recibido)</span><input className="rx-input rx-mono" type="number" min="0" step="0.10" value={fund} onChange={(event) => setFund(event.target.value)} /></label>
        <button className="rx-btn rx-btn--primary" type="button" onClick={openCash} disabled={busy} style={{ justifySelf: "start" }}><Banknote />Abrir caja</button>
      </div>
    </section> : <>
      <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
        <Kpi label="Estado" value={<span style={{ fontSize: 18 }}>{(SESSION[session.status] || [session.status])[0]}</span>} detail={`Abierta a las ${timeOf(session.openedAt)}`} />
        <Kpi label="Fondo inicial" value={money(session.initialFund)} detail="Sencillo al abrir" />
        <Kpi label="Efectivo recibido" value={money(session.cashIn)} detail={`${cashRows.length} movimiento(s)${session.cashOut ? ` · egresos ${money(session.cashOut)}` : ""}`} />
        <Kpi label="Debe haber en caja" value={money(session.expected)} detail="Fondo + efectivo − egresos" />
      </div>

      <div className="rx-grid rx-g-2">
        <div className="rx-stack">
          <section className="rx-card">
            <div className="rx-card-h"><div><h2>Efectivo del turno</h2><p>Lo que debe estar físicamente en tu caja</p></div><b className="rx-mono" style={{ fontWeight: 600 }}>{money(session.cashIn)}</b></div>
            {cashRows.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Hora</th><th>Concepto</th><th>Cliente</th><th className="n">Monto</th></tr></thead><tbody>{cashRows.map((row, index) => <tr key={index}><td className="mut">{timeOf(row.at)}</td><td>{row.concept}{row.code && !String(row.concept).includes(row.code) ? <span className="rx-code"> · {row.code}</span> : null}</td><td className="mut">{row.client || "—"}</td><td className="n"><b style={{ color: row.kind === "EGRESO" ? "var(--crit)" : undefined }}>{row.kind === "EGRESO" ? "− " : ""}{money(row.amount)}</b></td></tr>)}</tbody></table></div> : <Empty icon={Banknote} title="Aún no recibes efectivo en este turno" />}
          </section>
          <section className="rx-card">
            <div className="rx-card-h"><div><h2>Cobros digitales del turno</h2><p>Yape, Plin y tarjeta: no se cuentan, el dueño los concilia</p></div><b className="rx-mono" style={{ fontWeight: 600 }}>{money(digitalRows.reduce((sum, row) => sum + row.amount, 0))}</b></div>
            {digitalRows.length ? <ul className="rx-list">{digitalRows.map((row, index) => <li key={index}><div className="grow"><b>{row.concept}{row.code && !String(row.concept).includes(row.code) ? ` · ${row.code}` : ""}</b><small>{row.client || "—"} · {timeOf(row.at)}</small></div><Tag tone="info">{METHOD[row.method] || row.method}</Tag><b className="rx-mono" style={{ minWidth: 80, textAlign: "right", fontWeight: 600 }}>{money(row.amount)}</b></li>)}</ul> : <Empty title="Sin cobros digitales hoy" />}
          </section>
        </div>

        <section className="rx-card">
          <div className="rx-card-h"><div><h2>{session.status === "ABIERTA" ? "Cerrar y rendir caja" : "Rendición enviada"}</h2><p>{session.status === "ABIERTA" ? "Cuenta los billetes y monedas antes de marcar tu salida" : "El dueño revisa y aprueba tu cierre"}</p></div><Lock size={16} color="#5B6B82" /></div>
          <div className="rx-card-b" style={{ display: "grid", gap: 12 }}>
            {session.status === "ABIERTA" ? <>
              <label className="rx-field"><span>Efectivo contado</span><input className="rx-input rx-mono" type="number" min="0" step="0.10" value={counted} onChange={(event) => setCounted(event.target.value)} placeholder="0.00" style={{ fontSize: 16, height: 40 }} /></label>
              <div className="rx-ledger">
                <div><span>Debe haber</span><b>{money(session.expected)}</b></div>
                <div><span>Contado</span><b>{counted === "" ? "—" : money(counted)}</b></div>
                <div className={difference === null ? "" : difference === 0 ? "clear" : "due"}><span>Diferencia</span><b>{difference === null ? "—" : `${difference > 0 ? "+" : ""}${money(difference)}`}</b></div>
              </div>
              <label className="rx-field"><span>Observaciones {difference ? "(obligatorio si hay diferencia)" : "(opcional)"}</span><textarea className="rx-input" style={{ height: 72, paddingTop: 8 }} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}><Send />Enviar rendición al dueño</button>
            </> : <>
              <div className="rx-ledger">
                <div><span>Esperado</span><b>{money(session.expected)}</b></div>
                <div><span>Contado</span><b>{session.actualCash != null ? money(session.actualCash) : "—"}</b></div>
                <div className={Number(session.variance || 0) === 0 ? "clear" : "due"}><span>Diferencia</span><b>{money(session.variance || 0)}</b></div>
              </div>
              <Alert tone="info">Enviada {session.submittedAt ? `a las ${timeOf(session.submittedAt)}` : ""}. Mientras el dueño la revisa no podrás abrir otra caja hoy.</Alert>
            </>}
            {error ? <Alert tone="crit">{error}</Alert> : null}
          </div>
        </section>
      </div>
    </>}

    <section className="rx-card rx-mt">
      <div className="rx-card-h"><div><h2>Mis cierres anteriores</h2><p>Rendiciones enviadas y su revisión</p></div></div>
      {(history.data || []).filter((row) => row.status !== "ABIERTA").length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Fecha</th><th>Estado</th><th className="n">Esperado</th><th className="n">Contado</th><th className="n">Diferencia</th><th>Revisó</th></tr></thead>
        <tbody>{(history.data || []).filter((row) => row.status !== "ABIERTA").slice(0, 10).map((row) => { const [label, tone] = SESSION[row.status] || [row.status, "off"]; return <tr key={row.id}><td>{dateShort(row.date)}</td><td><Tag tone={tone}>{label}</Tag></td><td className="n">{money(row.expectedCash)}</td><td className="n">{money(row.actualCash)}</td><td className="n"><b style={{ color: Number(row.variance || 0) ? "var(--crit)" : "var(--ok)", fontWeight: 600 }}>{money(row.variance || 0)}</b></td><td className="mut">{row.reviewerName || "Pendiente"}</td></tr>; })}</tbody>
      </table></div> : <Empty title="Aún no tienes cierres enviados" />}
    </section>
  </>;
}
