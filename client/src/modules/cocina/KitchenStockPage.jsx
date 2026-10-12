// Insumos › Mi stock y mermas. El inventario del turno de cocina: inicial, entradas, consumo teórico de los pedidos
// entregados, mermas y disponible. La merma se registra desde la fila del insumo (antes era otra pantalla).
// Datos: /api/operational-inventory/sessions/:id (sin costos); merma POST /api/operational-inventory/sessions/:id/waste.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boxes, RefreshCw, Search, Trash2, Unlock } from "lucide-react";
import { api } from "../../services/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, Kpi, PageHead, Tag, timeOf, useShift, useToast } from "../recepcion/rxkit";
import { SESSION_LABEL, useKitchen } from "./KitchenShell";

export const WASTE_CATEGORIES = [["PREPARATION_ERROR", "Error de preparación"], ["DAMAGED", "Producto dañado"], ["EXPIRY", "Vencimiento"], ["SPILL", "Derrame"], ["STORAGE", "Mal almacenamiento"], ["CLEANING", "Limpieza del producto"], ["INTERNAL_CONSUMPTION", "Consumo interno"], ["OTHER", "Otra"]];
export const qty = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const WASTE_OPEN = ["OPEN", "OPERATING", "COUNTING", "REOPENED"];

export function KitchenStockPage() {
  const show = useToast();
  const { active: shiftActive } = useShift();
  const { station, activeSession, lastSession, awaitingReview, detail, reloadSession } = useKitchen();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("todos");
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lines = detail?.lines || [];
  const rows = useMemo(() => lines.filter((line) => (!text.trim() || `${line.productName} ${line.lotCode || ""}`.toLowerCase().includes(text.trim().toLowerCase()))
    && (filter === "todos" || (filter === "merma" ? Number(line.wasteQuantity) > 0 : filter === "agotado" ? Number(line.expectedQuantity) <= 0 : Number(line.theoreticalConsumption) > 0)))
    .sort((a, b) => a.productName.localeCompare(b.productName, "es")), [lines, text, filter]);
  const [label, tone] = SESSION_LABEL[activeSession?.status] || ["Sin inventario", "off"];
  const canWaste = WASTE_OPEN.includes(activeSession?.status) && shiftActive;

  async function openInventory() {
    setBusy(true); setError("");
    try { await api(`/operational-inventory/sessions/${activeSession.id}/open`, { method: "POST", body: { useSystemBalance: true } }); show("Inventario del turno abierto."); reloadSession(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  if (!activeSession) return <><PageHead title="Mi stock y mermas" /><section className="rx-card"><Empty icon={Boxes} title={lastSession?.status === "SUBMITTED" ? "Tu último cierre espera la revisión del dueño" : `No hay inventario de ${station.stock} asignado`}>{lastSession?.status === "SUBMITTED" ? `El cierre ${lastSession.shift} fue enviado. Cuando el dueño lo apruebe, el siguiente turno parte de ese conteo.` : "Se crea al marcar tu entrada con DNI y PIN. Cuando exista, aquí verás tu stock del turno."}</Empty></section></>;
  if (activeSession.status === "PENDING") return <><PageHead title="Mi stock y mermas" /><section className="rx-card" style={{ maxWidth: 620 }}>
    <div className="rx-card-h"><div><h2>Inventario por abrir</h2><p>{activeSession.shift} · creado al marcar tu entrada</p></div><Tag tone="warn">Por abrir</Tag></div>
    <div className="rx-card-b" style={{ display: "grid", gap: 10 }}><p style={{ margin: 0, fontSize: 13 }}>Al abrirlo, el stock parte del conteo del último cierre y desde ese momento cada pedido entregado descuenta sus insumos.</p>
      {awaitingReview ? <Alert tone="warn">El cierre {awaitingReview.shift} {awaitingReview.status === "OBSERVED" ? "fue observado" : "espera la revisión"} del dueño. Hasta que lo apruebe no se puede abrir el inventario de hoy ni aceptar pedidos.</Alert> : null}
      <button className="rx-btn rx-btn--primary" type="button" onClick={openInventory} disabled={busy || !shiftActive || Boolean(awaitingReview)} style={{ justifySelf: "start" }}><Unlock />Abrir inventario del turno</button>
      {!shiftActive ? <Alert tone="warn">Inicia tu turno para abrir el inventario.</Alert> : null}{error ? <Alert tone="crit">{error}</Alert> : null}</div>
  </section></>;
  if (!detail) return <LoadingSpinner label="Cargando el stock del turno…" />;

  const withWaste = lines.filter((line) => Number(line.wasteQuantity) > 0).length;
  const empty = lines.filter((line) => Number(line.expectedQuantity) <= 0).length;
  const used = lines.filter((line) => Number(line.theoreticalConsumption) > 0).length;
  const presetWaste = params.get("merma") === "1";

  return <>
    <PageHead title="Mi stock y mermas" tools={<><Tag tone={tone}>{label}</Tag><button className="rx-btn" type="button" onClick={reloadSession}><RefreshCw />Actualizar</button>{canWaste ? <button className="rx-btn rx-btn--primary" type="button" onClick={() => setTarget("elegir")}><Trash2 />Registrar merma</button> : null}</>}>
      Inventario del turno {activeSession.shift}{activeSession.openedAt ? `, abierto a las ${timeOf(activeSession.openedAt)}` : ""}. El consumo de cada {station.item} se descuenta al entregar el pedido.
    </PageHead>
    {presetWaste && canWaste && !target ? <div style={{ marginBottom: 12 }}><Alert tone="info">Para registrar una merma, usa "Registrar merma" o el botón de la fila del insumo.</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Boxes} label={`Insumos en ${station.stock}`} value={lines.length} detail="Con su lote" />
      <Kpi label="Usados hoy" value={used} detail="Descontados por pedidos" />
      <Kpi label="Con merma" value={withWaste} detail="Registradas en el turno" />
      <Kpi label="Agotados" value={empty} detail={empty ? "Pídelos en Pedir y recibir" : "Todo con stock"} />
    </div>
    <section className="rx-card">
      <div className="rx-filters">
        <div className="rx-search" style={{ margin: 0, width: 300 }}><label style={{ background: "#fff" }}><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Insumo o lote" aria-label="Buscar insumo" /></label></div>
        <div className="rx-seg">{[["todos", "Todos"], ["usados", "Usados hoy"], ["merma", "Con merma"], ["agotado", "Agotados"]].map(([key, text2]) => <button key={key} type="button" className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>{text2}</button>)}</div>
      </div>
      {rows.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Insumo</th><th>Lote</th><th className="n">Inicial</th><th className="n">Entradas</th><th className="n">Consumo</th><th className="n">Mermas</th><th className="n">Disponible</th><th /></tr></thead>
        <tbody>{rows.map((line) => { const entries = Number(line.confirmedEntries || 0) + Number(line.productionEntries || 0); const available = Number(line.expectedQuantity); return <tr key={`${line.productId}-${line.lotId || "base"}`}>
          <td><b style={{ fontWeight: 600 }}>{line.productName}</b></td>
          <td className="mut">{line.lotCode || "—"}</td>
          <td className="n">{qty(line.openingQuantity)} {line.unitSymbol}</td>
          <td className="n mut">{entries ? `${qty(entries)} ${line.unitSymbol}` : "—"}</td>
          <td className="n mut">{Number(line.theoreticalConsumption) ? `${qty(line.theoreticalConsumption)} ${line.unitSymbol}` : "—"}</td>
          <td className="n" style={{ color: Number(line.wasteQuantity) ? "var(--crit)" : "var(--muted)" }}>{Number(line.wasteQuantity) ? `${qty(line.wasteQuantity)} ${line.unitSymbol}` : "—"}</td>
          <td className="n"><b style={{ fontWeight: 600, color: available <= 0 ? "var(--crit)" : undefined }}>{qty(available)} {line.unitSymbol}</b></td>
          <td className="n">{canWaste ? <button className="rx-btn rx-btn--sm" type="button" onClick={() => setTarget(line)}>Merma</button> : null}</td>
        </tr>; })}</tbody>
      </table></div> : <Empty icon={Boxes} title={lines.length ? "Ningún insumo con este filtro" : "El turno no tiene insumos asignados"} />}
    </section>
    <WasteDrawer station={station} target={target} lines={lines} sessionId={activeSession.id} onClose={() => { setTarget(null); if (presetWaste) setParams({}); }} onDone={() => { setTarget(null); reloadSession(); }} />
  </>;
}

function WasteDrawer({ station, target, lines, sessionId, onClose, onDone }) {
  const show = useToast();
  const [key, setKey] = useState("");
  const [form, setForm] = useState({ category: "PREPARATION_ERROR", quantity: "", observation: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!target) return null;
  const line = target === "elegir" ? lines.find((row) => `${row.productId}|${row.lotId || ""}` === key) : target;
  const close = () => { setKey(""); setForm({ category: "PREPARATION_ERROR", quantity: "", observation: "" }); setError(""); onClose(); };
  async function save() {
    if (!line) { setError("Elige el insumo."); return; }
    const quantity = Number(form.quantity);
    if (!(quantity > 0)) { setError("Indica la cantidad perdida."); return; }
    if (quantity > Number(line.expectedQuantity) + 0.0001) { setError(`No puede superar lo disponible (${qty(line.expectedQuantity)} ${line.unitSymbol}).`); return; }
    if (!form.observation.trim()) { setError("Explica qué pasó."); return; }
    setBusy(true); setError("");
    try { await api(`/operational-inventory/sessions/${sessionId}/waste`, { method: "POST", body: { productId: Number(line.productId), lotId: line.lotId ? Number(line.lotId) : null, quantity, category: form.category, observation: form.observation.trim() } }); show(`Merma registrada: ${qty(quantity)} ${line.unitSymbol} de ${line.productName}.`); setKey(""); setForm({ category: "PREPARATION_ERROR", quantity: "", observation: "" }); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Drawer open onClose={close} busy={busy} eyebrow="Registrar merma" title={line ? line.productName : "Elige el insumo"} subtitle={line ? `Disponible ${qty(line.expectedQuantity)} ${line.unitSymbol}${line.lotCode ? ` · lote ${line.lotCode}` : ""}` : "Lo que se perdió, se dañó o se consumió sin venderse"}
    footer={<><button className="rx-btn" type="button" onClick={close} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}><Trash2 />Registrar merma</button></>}>
    {target === "elegir" ? <label className="rx-field"><span>Insumo</span><select className="rx-select" value={key} onChange={(event) => setKey(event.target.value)}><option value="">Elige el insumo</option>{lines.filter((row) => Number(row.expectedQuantity) > 0).sort((a, b) => a.productName.localeCompare(b.productName, "es")).map((row) => <option key={`${row.productId}|${row.lotId || ""}`} value={`${row.productId}|${row.lotId || ""}`}>{row.productName}{row.lotCode ? ` · lote ${row.lotCode}` : ""} · disp. {qty(row.expectedQuantity)} {row.unitSymbol}</option>)}</select></label> : null}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <label className="rx-field"><span>Motivo</span><select className="rx-select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{WASTE_CATEGORIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label className="rx-field"><span>Cantidad{line ? ` (${line.unitSymbol})` : ""}</span><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
    </div>
    <label className="rx-field"><span>Qué pasó</span><textarea className="rx-input" style={{ height: 80, paddingTop: 8 }} value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} placeholder={station.area === "BARTENDER" ? "Ej. se rompió una botella de pisco al reponer" : "Ej. se quemó una tanda de arroz"} /></label>
    <Alert tone="info">La merma queda registrada en el cierre del día. Regístrala en la unidad del insumo ({line?.unitSymbol || "unidad base"}).</Alert>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
