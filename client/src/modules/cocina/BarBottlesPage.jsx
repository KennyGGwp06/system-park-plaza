// Bar › Control de botellas. Control de medida, no de stock: cada botella se abre desde un lote del bar, se registra
// cada dosis servida ("a la medida", "de más" o "de menos"), se mide por volumen o por peso y se cierra con la
// diferencia entre lo medido y lo esperado. El stock lo descuenta el pedido entregado (no se descuenta dos veces).
// Sin costos: el servidor los quita para el bartender.
// Rutas: GET /api/bar/bottles(/references), POST /api/bar/bottles, /:id/serve, /:id/measure y /:id/close.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Droplets, Gauge, Lock, Plus, RefreshCw, Scale, Wine } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, Kpi, PageHead, Tag, dateShort, timeOf, todayKey, useShift, useToast } from "../recepcion/rxkit";
import { useKitchen } from "./KitchenShell";

const ml = (value) => `${Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 1 })} ml`;
const TYPES = { SPIRIT: "Destilado", WINE: "Vino", OTHER: "Otro" };
const RESULT = { NORMAL: ["A la medida", "ok"], OVERPOURED: ["Servido de más", "crit"], UNDERPOURED: ["Servido de menos", "warn"] };
const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");
const diffTone = (bottle) => bottle.differenceMl == null ? null : Math.abs(bottle.differenceMl) <= Math.max(5, bottle.initialMl * 0.02) ? "ok" : bottle.differenceMl < 0 ? "crit" : "warn";

export function BarBottlesPage() {
  const { bottles, reloadBottles } = useKitchen();
  const { active: shiftActive, openClock } = useShift();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("abiertas");
  const [drawer, setDrawer] = useState(null);
  const openRows = bottles.filter((row) => row.status === "OPEN");
  const closedRows = bottles.filter((row) => row.status !== "OPEN").sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt))).slice(0, 40);
  const today = todayKey();
  const servicesToday = bottles.flatMap((row) => row.services || []).filter((row) => localDay(row.servedAt) === today);
  const offToday = servicesToday.filter((row) => row.result !== "NORMAL").length;
  const withDiff = openRows.filter((row) => ["crit", "warn"].includes(diffTone(row))).length;
  const selected = bottles.find((row) => String(row.id) === params.get("ver")) || null;
  const rows = tab === "abiertas" ? openRows : closedRows;
  const act = (kind, bottle) => setDrawer({ kind, bottle });

  return <>
    <PageHead title="Control de botellas" tools={<>
      <div className="rx-seg">
        <button type="button" className={tab === "abiertas" ? "is-on" : ""} onClick={() => setTab("abiertas")}>Abiertas<i>{openRows.length}</i></button>
        <button type="button" className={tab === "cerradas" ? "is-on" : ""} onClick={() => setTab("cerradas")}>Cerradas</button>
      </div>
      <button className="rx-btn" type="button" onClick={reloadBottles}><RefreshCw />Actualizar</button>
      <button className="rx-btn rx-btn--primary" type="button" onClick={() => setDrawer({ kind: "abrir" })} disabled={!shiftActive}><Plus />Abrir botella</button>
    </>}>Abre cada botella desde su lote, registra cada servicio con lo que realmente serviste y mídela antes de cerrarla. El stock se descuenta al entregar el pedido; aquí controlas que cada trago salga a la medida.</PageHead>
    {!shiftActive ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>Inicia tu turno para operar botellas.</b> <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert></div> : null}

    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Wine} label="Botellas abiertas" value={openRows.length} detail="En la barra ahora" />
      <Kpi label="Servicios hoy" value={servicesToday.length} detail="Dosis registradas" />
      <Kpi label="Fuera de medida hoy" value={offToday} detail={offToday ? "Servidos de más o de menos" : "Todo a la medida"} />
      <Kpi label="Con diferencia" value={withDiff} detail="Medido distinto a lo esperado" />
    </div>

    <section className="rx-card">
      {rows.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Botella</th><th>Producto</th><th>Tipo</th><th className="n">Inicial</th><th className="n">Esperado</th><th className="n">Medido</th><th>Diferencia</th><th>{tab === "abiertas" ? "Abierta" : "Cerrada"}</th>{tab === "abiertas" ? <th /> : null}</tr></thead>
        <tbody>{rows.map((row) => { const tone = diffTone(row); return <tr key={row.id} className="is-click" onClick={() => setParams({ ver: String(row.id) })}>
          <td><b className="rx-mono">{row.code}</b></td>
          <td><b style={{ fontWeight: 600 }}>{row.productName}</b><small className="mut" style={{ display: "block" }}>{row.lotCode ? `Lote ${row.lotCode}` : "Sin lote"}</small></td>
          <td className="mut">{TYPES[row.type] || row.type}</td>
          <td className="n">{ml(row.initialMl)}</td>
          <td className="n"><b style={{ fontWeight: 600 }}>{ml(row.expectedMl)}</b>{row.type === "WINE" ? <small className="mut" style={{ display: "block" }}>{row.expectedCups} copa(s)</small> : null}</td>
          <td className="n">{row.physicalMl == null ? <span className="mut">Sin medir</span> : ml(row.physicalMl)}</td>
          <td>{tone ? <Tag tone={tone}>{row.differenceMl > 0 ? "+" : ""}{ml(row.differenceMl)}</Tag> : <span className="mut">—</span>}</td>
          <td className="mut">{tab === "abiertas" ? `${dateShort(localDay(row.openedAt))} ${timeOf(row.openedAt)}` : `${dateShort(localDay(row.closedAt))} ${timeOf(row.closedAt)}`}</td>
          {tab === "abiertas" ? <td className="n" onClick={(event) => event.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
            <button className="rx-btn rx-btn--sm rx-btn--primary" type="button" disabled={!shiftActive} onClick={() => act("servir", row)}>Servir</button>{" "}
            <button className="rx-btn rx-btn--sm" type="button" disabled={!shiftActive} onClick={() => act("medir", row)}>Medir</button>{" "}
            <button className="rx-btn rx-btn--sm" type="button" disabled={!shiftActive} onClick={() => act("cerrar", row)}>Cerrar</button>
          </td> : null}
        </tr>; })}</tbody>
      </table></div> : <Empty icon={Wine} title={tab === "abiertas" ? "No hay botellas abiertas" : "Aún no se cerró ninguna botella"}>{tab === "abiertas" ? "Abre una botella desde su lote para empezar a servir." : null}</Empty>}
    </section>

    <BottleDetail bottle={selected} onClose={() => setParams({})} onAct={(kind) => { setParams({}); act(kind, selected); }} canAct={shiftActive} />
    {drawer?.kind === "abrir" ? <OpenDrawer onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); reloadBottles(); }} /> : null}
    {drawer?.kind === "servir" ? <ServeDrawer bottle={drawer.bottle} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); reloadBottles(); }} /> : null}
    {drawer?.kind === "medir" ? <MeasureDrawer bottle={drawer.bottle} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); reloadBottles(); }} /> : null}
    {drawer?.kind === "cerrar" ? <CloseDrawer bottle={drawer.bottle} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); reloadBottles(); }} onMeasure={() => setDrawer({ kind: "medir", bottle: drawer.bottle })} /> : null}
  </>;
}

// Formulario común: guarda con POST y muestra el error del servidor tal cual (reglas de stock, medidas, turno).
function useSave(onDone, success) {
  const show = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(path, body) {
    setBusy(true); setError("");
    try { const result = await api(path, { method: "POST", body }); show(typeof success === "function" ? success(result) : success); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return { busy, error, setError, save };
}

function OpenDrawer({ onClose, onDone }) {
  const references = useFetch("/bar/bottles/references", { initialData: { stock: [] }, realtime: false });
  const [form, setForm] = useState({ key: "", type: "SPIRIT", nominalMl: "750", initialMl: "750", tareGrams: "", densityKgPerL: "" });
  const { busy, error, setError, save } = useSave(onDone, (bottle) => `Botella ${bottle.code} abierta: ${bottle.productName}.`);
  const stock = useMemo(() => (references.data?.stock || []).slice().sort((a, b) => a.productName.localeCompare(b.productName, "es")), [references.data]);
  const row = stock.find((item) => `${item.productId}|${item.lotId || ""}` === form.key);
  const set = (patch) => setForm({ ...form, ...patch });
  function submit() {
    if (!row) { setError("Elige el producto y su lote."); return; }
    const nominal = Number(form.nominalMl), initial = Number(form.initialMl || form.nominalMl);
    if (!(nominal > 0) || !(initial > 0) || initial > nominal) { setError("El contenido inicial debe ser mayor que cero y no superar el de la etiqueta."); return; }
    if (initial > Number(row.onHand)) { setError(`El lote solo tiene ${ml(row.onHand)} disponibles.`); return; }
    save("/bar/bottles", { productId: Number(row.productId), lotId: row.lotId ? Number(row.lotId) : null, type: form.type, nominalMl: nominal, initialMl: initial, tareGrams: form.tareGrams ? Number(form.tareGrams) : null, densityKgPerL: form.densityKgPerL ? Number(form.densityKgPerL) : row.densityKgPerL ? Number(row.densityKgPerL) : null });
  }
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Abrir botella" title={row ? row.productName : "Elige la botella"} subtitle={row ? `Lote ${row.lotCode || "sin lote"} · disponible ${ml(row.onHand)}` : "Elige el producto y el lote de la botella que abres"}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}><Wine />Abrir botella</button></>}>
    {references.loading && !stock.length ? <LoadingSpinner label="Cargando el stock del bar…" /> : <>
      <label className="rx-field"><span>Producto y lote</span><select className="rx-select" value={form.key} onChange={(event) => set({ key: event.target.value })}><option value="">Elige el producto</option>{stock.map((item) => <option key={`${item.productId}|${item.lotId || ""}`} value={`${item.productId}|${item.lotId || ""}`}>{item.productName}{item.lotCode ? ` · lote ${item.lotCode}` : ""} · {ml(item.onHand)}</option>)}</select></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label className="rx-field"><span>Tipo</span><select className="rx-select" value={form.type} onChange={(event) => set({ type: event.target.value })}>{Object.entries(TYPES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label className="rx-field"><span>Etiqueta (ml)</span><input className="rx-input rx-mono" type="number" min="1" value={form.nominalMl} onChange={(event) => set({ nominalMl: event.target.value, initialMl: event.target.value })} /></label>
        <label className="rx-field"><span>Contenido real (ml)</span><input className="rx-input rx-mono" type="number" min="1" value={form.initialMl} onChange={(event) => set({ initialMl: event.target.value })} /></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="rx-field"><span>Peso de la botella vacía (g, opcional)</span><input className="rx-input rx-mono" type="number" min="0" value={form.tareGrams} onChange={(event) => set({ tareGrams: event.target.value })} placeholder="Para medir por peso" /></label>
        <label className="rx-field"><span>Densidad (kg/L, opcional)</span><input className="rx-input rx-mono" type="number" min="0" step="0.001" value={form.densityKgPerL} onChange={(event) => set({ densityKgPerL: event.target.value })} placeholder={row?.densityKgPerL ? String(row.densityKgPerL) : "Ej. 0.95"} /></label>
      </div>
      <Alert tone="info">El peso vacío y la densidad permiten medir la botella en balanza. Si no los tienes, mídela por volumen.</Alert>
    </>}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function ServeDrawer({ bottle, onClose, onDone }) {
  const wine = bottle.type === "WINE";
  const [form, setForm] = useState({ type: wine ? "WINE_GLASS" : "DRINK", targetMl: wine ? "150" : "45", measuredMl: wine ? "150" : "45", toleranceMl: "5", notes: "" });
  const { busy, error, setError, save } = useSave(onDone, `Servicio registrado en ${bottle.code}.`);
  const target = Number(form.targetMl), measured = Number(form.measuredMl), tolerance = Number(form.toleranceMl);
  const result = measured > target + tolerance ? "OVERPOURED" : measured < target - tolerance ? "UNDERPOURED" : "NORMAL";
  const set = (patch) => setForm({ ...form, ...patch });
  function submit() {
    if (!(target > 0) || !(measured >= 0)) { setError("Indica la dosis y lo que realmente serviste."); return; }
    if (target > bottle.expectedMl + 0.0001) { setError(`A la botella le quedan ${ml(bottle.expectedMl)} esperados.`); return; }
    save(`/bar/bottles/${bottle.id}/serve`, { type: form.type, targetMl: target, measuredMl: measured, toleranceMl: tolerance, notes: form.notes.trim() || null });
  }
  const [label, tone] = RESULT[result];
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Servir · ${bottle.code}`} title={bottle.productName} subtitle={`Quedan ${ml(bottle.expectedMl)} esperados${wine ? ` · ${bottle.expectedCups} copa(s)` : ""}`}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}><Droplets />Registrar servicio</button></>}>
    <div className="rx-seg" style={{ alignSelf: "start" }}>
      <button type="button" className={form.type === "DRINK" ? "is-on" : ""} onClick={() => set({ type: "DRINK", targetMl: "45", measuredMl: "45" })}>Trago</button>
      <button type="button" className={form.type === "WINE_GLASS" ? "is-on" : ""} onClick={() => set({ type: "WINE_GLASS", targetMl: "150", measuredMl: "150" })}>Copa de vino</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <label className="rx-field"><span>Dosis de la receta (ml)</span><input className="rx-input rx-mono" type="number" min="1" value={form.targetMl} onChange={(event) => set({ targetMl: event.target.value })} /></label>
      <label className="rx-field"><span>Lo que serviste (ml)</span><input className="rx-input rx-mono" type="number" min="0" value={form.measuredMl} onChange={(event) => set({ measuredMl: event.target.value })} /></label>
      <label className="rx-field"><span>Tolerancia (± ml)</span><input className="rx-input rx-mono" type="number" min="0" value={form.toleranceMl} onChange={(event) => set({ toleranceMl: event.target.value })} /></label>
    </div>
    <div><Tag tone={tone}>{label}</Tag></div>
    <label className="rx-field"><span>Nota (opcional)</span><input className="rx-input" value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Ej. PED-0031, pisco sour doble" /></label>
    <Alert tone="info">Esto no descuenta stock (lo hace el pedido al entregarse). Registra lo que realmente serviste: si fue de más o de menos, el dueño lo ve.</Alert>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function MeasureDrawer({ bottle, onClose, onDone }) {
  const canWeigh = Boolean(bottle.tareGrams && bottle.densityKgPerL);
  const [form, setForm] = useState({ method: "VOLUME", contentMl: "", grossWeightGrams: "", tareGrams: bottle.tareGrams ? String(bottle.tareGrams) : "", densityKgPerL: bottle.densityKgPerL ? String(bottle.densityKgPerL) : "" });
  const { busy, error, setError, save } = useSave(onDone, (result) => `${result.code}: medido ${ml(result.physicalMl)}.`);
  const set = (patch) => setForm({ ...form, ...patch });
  const byWeight = form.method === "WEIGHT";
  const computed = byWeight && Number(form.grossWeightGrams) > 0 && Number(form.tareGrams) > 0 && Number(form.densityKgPerL) > 0 ? (Number(form.grossWeightGrams) - Number(form.tareGrams)) / Number(form.densityKgPerL) : null;
  function submit() {
    if (byWeight) {
      if (!(Number(form.grossWeightGrams) > 0) || !(Number(form.tareGrams) > 0) || !(Number(form.densityKgPerL) > 0)) { setError("Para medir por peso necesitas el peso actual, el peso vacío y la densidad."); return; }
      if (Number(form.grossWeightGrams) < Number(form.tareGrams)) { setError("El peso actual no puede ser menor que el de la botella vacía."); return; }
      save(`/bar/bottles/${bottle.id}/measure`, { method: "WEIGHT", grossWeightGrams: Number(form.grossWeightGrams), tareGrams: Number(form.tareGrams), densityKgPerL: Number(form.densityKgPerL) });
    } else {
      if (form.contentMl === "" || Number(form.contentMl) < 0) { setError("Indica cuántos ml quedan."); return; }
      save(`/bar/bottles/${bottle.id}/measure`, { method: "VOLUME", contentMl: Number(form.contentMl) });
    }
  }
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Medir · ${bottle.code}`} title={bottle.productName} subtitle="Mide lo que realmente queda; no se muestra lo esperado para que la medida sea honesta"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}><Gauge />Guardar medida</button></>}>
    <div className="rx-seg" style={{ alignSelf: "start" }}>
      <button type="button" className={!byWeight ? "is-on" : ""} onClick={() => set({ method: "VOLUME" })}><Droplets size={15} />Por volumen</button>
      <button type="button" className={byWeight ? "is-on" : ""} onClick={() => set({ method: "WEIGHT" })}><Scale size={15} />Por peso</button>
    </div>
    {byWeight ? <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label className="rx-field"><span>Peso actual (g)</span><input className="rx-input rx-mono" type="number" min="0" value={form.grossWeightGrams} onChange={(event) => set({ grossWeightGrams: event.target.value })} /></label>
        <label className="rx-field"><span>Botella vacía (g)</span><input className="rx-input rx-mono" type="number" min="0" value={form.tareGrams} onChange={(event) => set({ tareGrams: event.target.value })} /></label>
        <label className="rx-field"><span>Densidad (kg/L)</span><input className="rx-input rx-mono" type="number" min="0" step="0.001" value={form.densityKgPerL} onChange={(event) => set({ densityKgPerL: event.target.value })} /></label>
      </div>
      {computed != null ? <Alert tone="info">Equivale a <b>{ml(computed)}</b>.</Alert> : !canWeigh ? <Alert tone="warn">Esta botella se abrió sin peso vacío o densidad: complétalos o mide por volumen.</Alert> : null}
    </> : <label className="rx-field"><span>Contenido que queda (ml)</span><input className="rx-input rx-mono" type="number" min="0" value={form.contentMl} onChange={(event) => set({ contentMl: event.target.value })} style={{ maxWidth: 200 }} /></label>}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function CloseDrawer({ bottle, onClose, onDone, onMeasure }) {
  const { busy, error, save } = useSave(onDone, (result) => `${result.code} ${result.status === "EMPTY" ? "vacía" : "cerrada"}.`);
  const measured = bottle.physicalMl != null;
  const tone = diffTone(bottle);
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Cerrar · ${bottle.code}`} title={bottle.productName} subtitle="La diferencia entre lo medido y lo esperado queda registrada para el dueño"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button>{measured ? <button className="rx-btn rx-btn--primary" type="button" onClick={() => save(`/bar/bottles/${bottle.id}/close`, {})} disabled={busy}><Lock />Cerrar botella</button> : <button className="rx-btn rx-btn--primary" type="button" onClick={onMeasure}><Gauge />Medir primero</button>}</>}>
    {measured ? <>
      <dl className="rx-dl">
        <div><dt>Esperado</dt><dd>{ml(bottle.expectedMl)}</dd></div>
        <div><dt>Medido</dt><dd>{ml(bottle.physicalMl)}</dd></div>
        <div><dt>Diferencia</dt><dd><Tag tone={tone}>{bottle.differenceMl > 0 ? "+" : ""}{ml(bottle.differenceMl)}</Tag></dd></div>
        <div><dt>Servicios</dt><dd>{(bottle.services || []).length}</dd></div>
      </dl>
      {tone === "crit" ? <Alert tone="warn">Falta más de lo tolerado. Si sabes qué pasó (derrame, botella rota, cortesía), regístralo como merma en Mi stock y mermas: así cuadra el cierre del día.</Alert> : null}
    </> : <Alert tone="warn">Registra una medida antes de cerrar: por volumen o en la balanza.</Alert>}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function BottleDetail({ bottle, onClose, onAct, canAct }) {
  if (!bottle) return null;
  const open = bottle.status === "OPEN";
  return <Drawer open onClose={onClose} eyebrow={`${bottle.code} · ${open ? "Abierta" : bottle.status === "EMPTY" ? "Vacía" : "Cerrada"}`} title={bottle.productName} subtitle={`${TYPES[bottle.type] || bottle.type} · lote ${bottle.lotCode || "sin lote"} · abierta ${dateShort(localDay(bottle.openedAt))} ${timeOf(bottle.openedAt)}`}
    footer={open ? <><button className="rx-btn" type="button" onClick={() => onAct("cerrar")} disabled={!canAct}>Cerrar</button><button className="rx-btn" type="button" onClick={() => onAct("medir")} disabled={!canAct}>Medir</button><button className="rx-btn rx-btn--primary" type="button" onClick={() => onAct("servir")} disabled={!canAct}>Servir</button></> : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <dl className="rx-dl">
      <div><dt>Etiqueta</dt><dd>{ml(bottle.nominalMl)}</dd></div>
      <div><dt>Inicial</dt><dd>{ml(bottle.initialMl)}</dd></div>
      <div><dt>Esperado</dt><dd>{ml(bottle.expectedMl)}</dd></div>
      <div><dt>Medido</dt><dd>{bottle.physicalMl == null ? "Sin medir" : ml(bottle.physicalMl)}</dd></div>
    </dl>
    <section className="rx-sec"><h3>Servicios ({(bottle.services || []).length})</h3>
      {(bottle.services || []).length ? <div className="kd-weigh">{bottle.services.map((row) => { const [label, tone] = RESULT[row.result] || [row.result, "off"]; return <div key={row.id}>
        <span><b style={{ fontWeight: 500 }}>{row.type === "WINE_GLASS" ? "Copa" : "Trago"} · dosis {ml(row.targetMl)}, servido {ml(row.measuredMl)}</b><small>{dateShort(localDay(row.servedAt))} {timeOf(row.servedAt)}{row.notes ? ` · ${row.notes}` : ""}</small></span>
        <Tag tone={tone}>{label}</Tag>
      </div>; })}</div> : <p className="mut" style={{ margin: 0, fontSize: 13 }}>Aún no se sirvió de esta botella.</p>}
    </section>
    <section className="rx-sec"><h3>Medidas ({(bottle.measurements || []).length})</h3>
      {(bottle.measurements || []).length ? <div className="kd-weigh">{bottle.measurements.map((row, index) => <div key={index}>
        <span><b style={{ fontWeight: 500 }}>{row.method === "WEIGHT" ? `Balanza: ${Number(row.grossWeightGrams).toLocaleString("es-PE")} g` : "Por volumen"}</b><small>{dateShort(localDay(row.measuredAt))} {timeOf(row.measuredAt)}</small></span>
        <strong>{ml(row.contentMl)}</strong>
      </div>)}</div> : <p className="mut" style={{ margin: 0, fontSize: 13 }}>Sin medidas registradas.</p>}
    </section>
  </Drawer>;
}
