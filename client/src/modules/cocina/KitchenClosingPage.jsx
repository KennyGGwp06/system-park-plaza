// Insumos › Cierre del día. Cuatro pasos: 1) iniciar el conteo, 2) contar lo que hay (conteo ciego: no se muestra lo
// esperado, así el conteo es honesto; si la diferencia supera la tolerancia se pide el motivo), 3) enviar el cierre al
// dueño y 4) pedir los insumos de mañana con lo que justifican las ventas. Rutas: /operational-inventory/sessions/:id/
// start-count y /submit, /inventory-closing/suggestions y POST /stock-requests (source CIERRE).
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Search, Send } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Empty, PageHead, Tag, dateShort, timeOf, useShift, useToast } from "../recepcion/rxkit";
import { SESSION_LABEL, useKitchen } from "./KitchenShell";
import { qty } from "./KitchenStockPage";

const EXCESS = 1.1;
const keyOf = (line) => `${line.productId}-${line.lotId || ""}`;

export function KitchenClosingPage() {
  const show = useToast();
  const { active: shiftActive } = useShift();
  const { station, activeSession, lastSession, awaitingReview, detail, reloadSession, active, openBottles } = useKitchen();
  const suggestions = useFetch("/inventory-closing/suggestions", { initialData: null, realtime: false });
  const [counts, setCounts] = useState({});
  const [reasons, setReasons] = useState({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const session = (activeSession?.status === "PENDING" && awaitingReview) ? awaitingReview : activeSession || lastSession;
  const status = session?.status;
  const lines = activeSession ? detail?.lines || [] : [];
  const step = !session || status === "PENDING" ? 0 : ["OPEN", "OPERATING", "REOPENED"].includes(status) ? 1 : status === "COUNTING" ? 2 : 3;
  const outOf = (line) => { const value = counts[keyOf(line)]; if (value === undefined || value === "") return false; const expected = Number(line.expectedQuantity); return Math.abs(Number(value) - expected) > (Number(line.tolerancePercent || 0) / 100) * expected + 0.0001; };
  const rows = useMemo(() => lines.filter((line) => !text.trim() || line.productName.toLowerCase().includes(text.trim().toLowerCase())).sort((a, b) => a.productName.localeCompare(b.productName, "es")), [lines, text]);
  const counted = lines.filter((line) => counts[keyOf(line)] !== undefined && counts[keyOf(line)] !== "").length;
  const [label, tone] = SESSION_LABEL[status] || ["Sin inventario", "off"];

  async function startCount() {
    if (active.length && !window.confirm(`Hay ${active.length} pedido(s) en curso. ¿Iniciar el conteo de cierre igual?`)) return;
    setBusy(true); setError("");
    try { await api(`/operational-inventory/sessions/${activeSession.id}/start-count`, { method: "POST" }); show("Conteo de cierre iniciado."); reloadSession(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function submit() {
    if (counted < lines.length) { setError(`Faltan ${lines.length - counted} insumo(s) por contar.`); return; }
    if (Object.values(counts).some((value) => Number(value) < 0)) { setError("No se permiten cantidades negativas."); return; }
    const missingReason = lines.find((line) => outOf(line) && !String(reasons[keyOf(line)] || "").trim());
    if (missingReason) { setError(`Explica la diferencia de ${missingReason.productName}.`); return; }
    if (!window.confirm("¿Enviar el cierre al dueño? Después ya no podrás modificar el conteo.")) return;
    setBusy(true); setError("");
    try {
      await api(`/operational-inventory/sessions/${activeSession.id}/submit`, { method: "POST", body: {
        counts: lines.map((line) => ({ productId: line.productId, lotId: line.lotId || null, quantity: Number(counts[keyOf(line)]) })),
        explanations: lines.filter(outOf).map((line) => ({ productId: line.productId, lotId: line.lotId || null, reason: reasons[keyOf(line)].trim() })),
        notes: `Cierre del día enviado desde la estación de ${station.name}`
      } });
      show("Cierre enviado al dueño. Ahora pide los insumos de mañana."); setCounts({}); setReasons({}); reloadSession(); suggestions.reload();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <>
    <PageHead title="Cierre del día" tools={<Tag tone={tone}>{label}</Tag>}>Al terminar la jornada{suggestions.data?.closing?.closingTime ? ` (cierre a las ${suggestions.data.closing.closingTime})` : ""}: cuenta lo que queda, envía el cierre al dueño y deja pedido lo de mañana.</PageHead>
    <div className="rx-steps" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 14 }}>
      {["Iniciar conteo", "Contar lo que hay", "Enviar al dueño", "Pedir para mañana"].map((name, index) => <div key={name} className={step > index + 1 || (step === 3 && index < 3) ? "done" : step === index + 1 || (step === 3 && index === 3) ? "now" : ""}><b>{index + 1}. {name}</b>{["Congela el stock esperado", "Conteo ciego por insumo", "Con motivo de cada diferencia", "Según ventas y recetas"][index]}</div>)}
    </div>
    {!shiftActive ? <div style={{ marginBottom: 12 }}><Alert tone="warn">Inicia tu turno para hacer el cierre.</Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}

    {step === 0 ? <section className="rx-card"><Empty icon={ClipboardCheck} title={status === "PENDING" ? "El inventario del turno aún no se abre" : `No hay inventario de ${station.stock} asignado`}>{status === "PENDING" ? "Ábrelo desde Mi turno o Mi stock para empezar la jornada." : "Se crea al marcar tu entrada con DNI y PIN."}</Empty></section> : null}

    {step === 1 ? <section className="rx-card" style={{ maxWidth: 680 }}>
      <div className="rx-card-h"><div><h2>1. Iniciar el conteo</h2><p>Turno {activeSession.shift} · abierto {activeSession.openedAt ? `a las ${timeOf(activeSession.openedAt)}` : ""}</p></div></div>
      <div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13 }}>Hazlo cuando termine el servicio: el sistema fija lo que debería haber y tú cuentas lo que realmente queda.</p>
        {openBottles?.length ? <Alert tone="info">Hay {openBottles.length} botella(s) abierta(s). Mídelas en Control de botellas antes de contar para que su diferencia quede registrada.</Alert> : null}
        {active.length ? <Alert tone="warn">Hay {active.length} pedido(s) en curso. Entrégalos o cancélalos antes de contar para que el cierre cuadre.</Alert> : null}
        <button className="rx-btn rx-btn--primary" type="button" onClick={startCount} disabled={busy || !shiftActive} style={{ justifySelf: "start" }}><ClipboardCheck />Iniciar conteo de cierre</button>
      </div>
    </section> : null}

    {step === 2 ? !detail ? <LoadingSpinner label="Preparando el conteo…" /> : <section className="rx-card">
      <div className="rx-card-h"><div><h2>2. Cuenta lo que hay</h2><p>{counted} de {lines.length} insumos contados · pesa o cuenta en la unidad indicada</p></div><div className="rx-bar" style={{ width: 160, marginTop: 0 }}><span style={{ width: `${lines.length ? (counted / lines.length) * 100 : 0}%` }} /></div></div>
      <div className="rx-filters"><div className="rx-search" style={{ margin: 0, width: 300 }}><label style={{ background: "#fff" }}><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Buscar insumo" aria-label="Buscar insumo" /></label></div></div>
      <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Insumo</th><th>Lote</th><th className="n">Cantidad contada</th><th>Diferencia</th></tr></thead>
        <tbody>{rows.map((line) => { const key = keyOf(line); const flagged = outOf(line); return <tr key={key}>
          <td><b style={{ fontWeight: 600 }}>{line.productName}</b></td><td className="mut">{line.lotCode || "—"}</td>
          <td className="n"><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><input className="rx-input kd-count-input rx-mono" type="number" min="0" step="any" value={counts[key] ?? ""} onChange={(event) => setCounts({ ...counts, [key]: event.target.value })} placeholder="0" aria-label={`Contado de ${line.productName}`} /><small style={{ width: 28, textAlign: "left" }}>{line.unitSymbol}</small></span></td>
          <td style={{ minWidth: 260 }}>{flagged ? <input className="rx-input" style={{ width: "100%", borderColor: "#EBC5C9" }} value={reasons[key] || ""} onChange={(event) => setReasons({ ...reasons, [key]: event.target.value })} placeholder="Fuera de tolerancia: explica qué pasó" /> : counts[key] !== undefined && counts[key] !== "" ? <Tag tone="ok">Dentro de tolerancia</Tag> : <span className="mut">Por contar</span>}</td>
        </tr>; })}</tbody>
      </table></div>
      <div className="rx-filters" style={{ borderBottom: 0, borderTop: "1px solid var(--line-2)", justifyContent: "flex-end" }}><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy || !shiftActive}><Send />Enviar cierre al dueño</button></div>
    </section> : null}

    {step === 3 ? <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Cierre enviado</h2><p>{session.shift} · {session.submittedAt ? `${dateShort(session.submittedAt)} ${timeOf(session.submittedAt)}` : ""}{session.submittedByName ? ` · ${session.submittedByName}` : ""}</p></div><CheckCircle2 size={18} color="#12A07A" /></div>
        <div className="rx-card-b"><p style={{ margin: 0, fontSize: 13 }}>{status === "OBSERVED" ? "El dueño observó el cierre. Revisa con él las diferencias." : status === "CLOSED" ? "El dueño aprobó el cierre." : "El dueño revisará el conteo y las diferencias. El siguiente turno parte de este cierre."}</p></div>
      </section>
      <TomorrowRequest data={suggestions.data} />
    </div> : null}
  </>;
}

function TomorrowRequest({ data }) {
  const show = useToast();
  const lines = data?.lines || [];
  const [quantities, setQuantities] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { setQuantities(Object.fromEntries(lines.map((line) => [line.productId, String(line.justifiedQuantity)]))); }, [data]);
  async function send() {
    const chosen = lines.map((line) => ({ productId: line.productId, quantity: Number(quantities[line.productId] || 0) })).filter((line) => line.quantity > 0);
    if (!chosen.length) { setError("Indica al menos una cantidad, o no pidas nada."); return; }
    setBusy(true); setError("");
    try { const created = await api("/stock-requests", { method: "POST", body: { source: "CIERRE", observation: note.trim() || "Pedido para mañana desde el cierre del día", lines: chosen } }); setSent(created); show(`Pedido para mañana ${created.code} enviado.`); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <section className="rx-card">
    <div className="rx-card-h"><div><h2>4. Pedir para mañana</h2><p>Lo que tus ventas y recetas justifican; si pides de más, el dueño lo verá como exceso</p></div></div>
    <div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
      {sent ? <Alert tone="ok"><b>Solicitud {sent.code} enviada.</b> Síguela en Pedir y recibir.</Alert> : !lines.length ? <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Con lo que tienes y lo que vendiste no se justifica pedir nada para mañana. Si algo urgente falta, usa Pedir y recibir.</p> : <>
        <div className="kd-weigh">{lines.map((line) => { const over = Number(quantities[line.productId] || 0) > line.justifiedQuantity * EXCESS + 0.000001; return <div key={line.productId}>
          <span><b style={{ fontWeight: 500 }}>{line.productName}</b><small>Tienes {qty(line.areaStock)} {line.unitSymbol} · se justifica {qty(line.justifiedQuantity)} {line.unitSymbol}{over ? " · exceso" : ""}</small></span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><input className="rx-input kd-count-input rx-mono" type="number" min="0" step="any" value={quantities[line.productId] ?? ""} onChange={(event) => setQuantities({ ...quantities, [line.productId]: event.target.value })} style={over ? { borderColor: "#D99A22" } : undefined} /><small>{line.unitSymbol}</small></span>
        </div>; })}</div>
        <label className="rx-field"><span>Nota para el dueño (opcional)</span><input className="rx-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. viene un grupo grande el sábado" /></label>
        <button className="rx-btn rx-btn--primary" type="button" onClick={send} disabled={busy} style={{ justifySelf: "start" }}><Send />Enviar pedido de mañana</button>
      </>}
      {error ? <Alert tone="crit">{error}</Alert> : null}
    </div>
  </section>;
}
