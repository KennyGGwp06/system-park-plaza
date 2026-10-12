// Recetas › Preparación y porcionado. Tres operaciones que cambian el stock con trazabilidad de lotes:
// 1) Limpiar o cortar: una entrada real se reparte en aprovechable, subproducto, residuo y merma (deben sumar lo mismo).
// 2) Preparar una base: producción por receta vigente de un producto intermedio (toma ingredientes por FEFO).
// 3) Crear porciones: divide un lote en porciones de peso objetivo, con muestreo opcional y sobrante.
// Más el historial con trazabilidad de cada lote. La cocina no ve costos (el servidor los quita).
// Rutas: GET /api/transformations(/references), POST /transformations/processing|production|portioning, GET /lots/:id/trace.
import { useMemo, useState } from "react";
import { Factory, GitBranch, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, Tag, timeOf, dateShort, useToast } from "../recepcion/rxkit";

const qty = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const empty = { warehouses: [], products: [], units: [], stock: [], recipes: [], outputTypes: [] };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");
const F = ({ label, children, full }) => <label className="rx-field" style={full ? { gridColumn: "1 / -1" } : undefined}><span>{label}</span>{children}</label>;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 };

export function PrepPage() {
  const references = useFetch("/transformations/references", { initialData: empty, realtime: false });
  const history = useFetch("/transformations", { initialData: { processing: [], portioning: [], production: [] }, realtime: false });
  const show = useToast();
  const [tab, setTab] = useState("PROCESSING");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState(null);
  const refs = references.data || empty;
  const submit = async (path, body) => { setBusy(true); setError(""); try { await api(`/transformations/${path}`, { method: "POST", body }); show("Listo: stock, lotes y kardex actualizados."); await Promise.all([references.reload(), history.reload()]); setTab("HISTORY"); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  const openTrace = async (lotId) => { setBusy(true); try { setTrace(await api(`/transformations/lots/${lotId}/trace`)); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  if (references.loading && !refs.warehouses.length) return <LoadingSpinner label="Cargando preparación…" />;
  return <>
    <PageHead title="Preparación y porcionado" tools={<button className="rx-btn" type="button" onClick={() => { references.reload(); history.reload(); }}><RefreshCw />Actualizar</button>}>Registra cuando un insumo se limpia o corta, cuando preparas una base con su receta o cuando lo divides en porciones. El sistema compara lo obtenido con lo esperado y conserva los lotes.</PageHead>
    <div className="rx-seg" style={{ marginBottom: 12 }}>{[["PROCESSING", "Limpiar o cortar"], ["PRODUCTION", "Preparar una base"], ["PORTIONING", "Crear porciones"], ["HISTORY", "Historial"]].map(([key, label]) => <button key={key} type="button" className={tab === key ? "is-on" : ""} onClick={() => { setTab(key); setError(""); }}>{label}</button>)}</div>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    {tab === "PROCESSING" ? <Processing refs={refs} busy={busy} onSubmit={(body) => submit("processing", body)} /> : null}
    {tab === "PRODUCTION" ? <Production refs={refs} busy={busy} onSubmit={(body) => submit("production", body)} /> : null}
    {tab === "PORTIONING" ? <Portioning refs={refs} busy={busy} onSubmit={(body) => submit("portioning", body)} /> : null}
    {tab === "HISTORY" ? <History data={history.data} onTrace={openTrace} busy={busy} /> : null}
    {trace ? <Drawer open onClose={() => setTrace(null)} eyebrow="Trazabilidad" title={trace.lot.productName} subtitle={`Lote ${trace.lot.lotCode}`} footer={<button className="rx-btn" type="button" onClick={() => setTrace(null)}>Cerrar</button>}>
      <section className="rx-sec"><h3>Origen</h3>{trace.ancestors.length ? <ul className="rx-list">{trace.ancestors.map((row, index) => <li key={`${row.lotId}-${index}`}><div className="grow"><b>{row.productName}</b><small>Nivel {row.depth} · lote {row.lotCode} · {String(row.relationType || "").toLowerCase()}</small></div></li>)}</ul> : <p className="mut" style={{ margin: 0 }}>Es un lote de origen.</p>}</section>
      <section className="rx-sec"><h3>Derivados</h3>{trace.descendants.length ? <ul className="rx-list">{trace.descendants.map((row, index) => <li key={`${row.lotId}-${index}`}><div className="grow"><b>{row.productName}</b><small>Nivel {row.depth} · lote {row.lotCode}</small></div></li>)}</ul> : <p className="mut" style={{ margin: 0 }}>Aún no se derivó nada de este lote.</p>}</section>
    </Drawer> : null}
  </>;
}

function Processing({ refs, busy, onSubmit }) {
  const [form, setForm] = useState({ warehouseId: refs.warehouses[0]?.id || "", stockKey: "", inputQuantity: "", expectedUsablePercent: 70, tolerancePercent: 3, observation: "", outputs: [{ type: "USABLE", productId: "", quantity: "", lotCode: "" }, { type: "WASTE", quantity: "" }] });
  const stock = refs.stock.filter((row) => String(row.warehouseId) === String(form.warehouseId));
  const selected = stock.find((row) => `${row.productId}:${row.lotId}` === form.stockKey);
  const total = form.outputs.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const products = refs.products.filter((product) => selected && String(product.baseUnitId) === String(selected.baseUnitId) && String(product.id) !== String(selected.productId));
  const setOut = (index, patch) => setForm({ ...form, outputs: form.outputs.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const balanced = Number(form.inputQuantity) > 0 && Math.abs(total - Number(form.inputQuantity)) < 0.000001;
  const submit = () => onSubmit({ warehouseId: Number(form.warehouseId), inputProductId: Number(selected.productId), inputLotId: Number(selected.lotId), inputQuantity: Number(form.inputQuantity), expectedUsablePercent: Number(form.expectedUsablePercent), tolerancePercent: Number(form.tolerancePercent), observation: form.observation, outputs: form.outputs.map((row) => ({ ...row, productId: row.productId ? Number(row.productId) : undefined, quantity: Number(row.quantity) })) });
  return <div className="rx-stack">
    <section className="rx-card"><div className="rx-card-h"><div><h2>1. Qué vas a limpiar o cortar</h2><p>Solo aparecen lotes con existencia</p></div></div><div className="rx-card-b" style={grid}>
      <F label="Área"><select className="rx-select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, stockKey: "" })}>{refs.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></F>
      <F label="Insumo y lote"><select className="rx-select" value={form.stockKey} onChange={(e) => setForm({ ...form, stockKey: e.target.value })}><option value="">Elige</option>{stock.map((row) => <option key={`${row.productId}:${row.lotId}`} value={`${row.productId}:${row.lotId}`}>{row.productName} · {row.lotCode} · {qty(Number(row.onHand) - Number(row.reserved))} {row.unitSymbol}</option>)}</select></F>
      <F label={`Cantidad${selected ? ` (${selected.unitSymbol})` : ""}`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.inputQuantity} onChange={(e) => setForm({ ...form, inputQuantity: e.target.value })} /></F>
      <F label="Aprovechable esperado (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" value={form.expectedUsablePercent} onChange={(e) => setForm({ ...form, expectedUsablePercent: e.target.value })} /></F>
    </div></section>
    <section className="rx-card"><div className="rx-card-h"><div><h2>2. Qué obtuviste</h2><p>Aprovechable y subproducto crean lotes; residuo y merma quedan registrados</p></div><button className="rx-btn rx-btn--sm" type="button" onClick={() => setForm({ ...form, outputs: [...form.outputs, { type: "BYPRODUCT", productId: "", quantity: "", lotCode: "" }] })}><Plus />Agregar resultado</button></div><div className="rx-card-b" style={{ display: "grid", gap: 8 }}>
      {form.outputs.map((row, index) => { const productive = ["USABLE", "BYPRODUCT"].includes(row.type); return <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr .8fr 1fr 32px", gap: 8, alignItems: "end" }}>
        <F label={index ? " " : "Tipo"}><select className="rx-select" value={row.type} onChange={(e) => setOut(index, { type: e.target.value, productId: "" })}>{refs.outputTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select></F>
        {productive ? <F label={index ? " " : "Producto que sale"}><select className="rx-select" value={row.productId || ""} onChange={(e) => setOut(index, { productId: e.target.value })}><option value="">Elige</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F> : <div style={{ fontSize: 12, color: "var(--muted)", paddingBottom: 10 }}>No genera existencia</div>}
        <F label={index ? " " : `Cantidad${selected ? ` (${selected.unitSymbol})` : ""}`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={row.quantity} onChange={(e) => setOut(index, { quantity: e.target.value })} /></F>
        <F label={index ? " " : productive ? "Lote (opcional)" : "Detalle"}><input className="rx-input" value={productive ? row.lotCode || "" : row.observation || ""} onChange={(e) => setOut(index, productive ? { lotCode: e.target.value } : { observation: e.target.value })} placeholder={productive ? "Automático" : ""} /></F>
        <button className="rx-close" type="button" aria-label="Quitar" disabled={form.outputs.length === 1} onClick={() => setForm({ ...form, outputs: form.outputs.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
      </div>; })}
      <Alert tone={balanced ? "ok" : "warn"}>Resultados {qty(total)} {selected?.unitSymbol || ""} de {qty(form.inputQuantity)} {selected?.unitSymbol || ""}: deben sumar exactamente lo mismo.</Alert>
      <div style={grid}><F label="Tolerancia (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" value={form.tolerancePercent} onChange={(e) => setForm({ ...form, tolerancePercent: e.target.value })} /></F><F label="Observación"><input className="rx-input" value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} /></F></div>
      <button className="rx-btn rx-btn--primary" type="button" style={{ justifySelf: "start" }} disabled={busy || !selected || !balanced} onClick={submit}>Registrar</button>
    </div></section>
  </div>;
}

function Production({ refs, busy, onSubmit }) {
  const [form, setForm] = useState({ warehouseId: refs.warehouses[0]?.id || "", recipeVersionId: "", plannedYield: "", actualYield: "", tolerancePercent: 3, outputLotCode: "", observation: "" });
  const warehouse = refs.warehouses.find((row) => String(row.id) === String(form.warehouseId));
  const recipes = refs.recipes.filter((row) => !warehouse || row.area === warehouse.area);
  const recipe = recipes.find((row) => String(row.versionId) === String(form.recipeVersionId));
  const submit = () => onSubmit({ ...form, warehouseId: Number(form.warehouseId), recipeVersionId: Number(form.recipeVersionId), plannedYield: Number(form.plannedYield), actualYield: Number(form.actualYield), tolerancePercent: Number(form.tolerancePercent) });
  return <section className="rx-card"><div className="rx-card-h"><div><h2>Preparar una base con su receta</h2><p>Toma los ingredientes que vencen primero y crea un lote nuevo del producto intermedio</p></div></div><div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
    <div style={grid}>
      <F label="Área"><select className="rx-select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, recipeVersionId: "" })}>{refs.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></F>
      <F label="Receta vigente"><select className="rx-select" value={form.recipeVersionId} onChange={(e) => { const next = recipes.find((row) => String(row.versionId) === e.target.value); setForm({ ...form, recipeVersionId: e.target.value, plannedYield: next?.yieldQuantity || "" }); }}><option value="">Elige</option>{recipes.map((row) => <option key={row.versionId} value={row.versionId}>{row.name} v{row.version} → {row.outputProductName}</option>)}</select></F>
      <F label={`Rinde según receta${recipe ? ` (${recipe.yieldUnitSymbol})` : ""}`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.plannedYield} onChange={(e) => setForm({ ...form, plannedYield: e.target.value })} /></F>
      <F label={`Rindió de verdad${recipe ? ` (${recipe.yieldUnitSymbol})` : ""}`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.actualYield} onChange={(e) => setForm({ ...form, actualYield: e.target.value })} /></F>
      <F label="Tolerancia (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" value={form.tolerancePercent} onChange={(e) => setForm({ ...form, tolerancePercent: e.target.value })} /></F>
      <F label="Lote de salida (opcional)"><input className="rx-input" value={form.outputLotCode} onChange={(e) => setForm({ ...form, outputLotCode: e.target.value })} placeholder="Automático" /></F>
    </div>
    {!recipes.length ? <Alert tone="warn">No hay receta de producto intermedio vigente para esta área. El dueño la crea en Recetas técnicas.</Alert> : null}
    <button className="rx-btn rx-btn--primary" type="button" style={{ justifySelf: "start" }} disabled={busy || !recipe || !(Number(form.actualYield) > 0)} onClick={submit}>Registrar preparación</button>
  </div></section>;
}

function Portioning({ refs, busy, onSubmit }) {
  const [form, setForm] = useState({ warehouseId: refs.warehouses[0]?.id || "", stockKey: "", outputProductId: "", inputQuantity: "", targetWeight: 180, weightUnitId: "", sampleText: "", tolerancePercent: 3, outputLotCode: "", leftoverLotCode: "" });
  const stock = refs.stock.filter((row) => String(row.warehouseId) === String(form.warehouseId));
  const selected = stock.find((row) => `${row.productId}:${row.lotId}` === form.stockKey);
  const source = refs.products.find((row) => String(row.id) === String(selected?.productId));
  const units = refs.units.filter((unit) => unit.dimension === source?.dimension);
  const outputs = refs.products.filter((product) => product.type === "PORTION" && product.dimension === "COUNT");
  const samples = form.sampleText.split(/[,;\s]+/).map(Number).filter((v) => v > 0);
  const average = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : Number(form.targetWeight || 0);
  const chooseStock = (key) => { const row = stock.find((item) => `${item.productId}:${item.lotId}` === key); const product = refs.products.find((item) => String(item.id) === String(row?.productId)); const unit = refs.units.find((item) => item.code === "G" && item.dimension === product?.dimension) || refs.units.find((item) => String(item.id) === String(product?.baseUnitId)); setForm({ ...form, stockKey: key, weightUnitId: unit?.id || "" }); };
  const submit = () => onSubmit({ warehouseId: Number(form.warehouseId), sourceProductId: Number(selected.productId), sourceLotId: Number(selected.lotId), outputProductId: Number(form.outputProductId), inputQuantity: Number(form.inputQuantity), targetWeight: Number(form.targetWeight), weightUnitId: Number(form.weightUnitId), sampleWeights: samples, tolerancePercent: Number(form.tolerancePercent), outputLotCode: form.outputLotCode, leftoverLotCode: form.leftoverLotCode });
  return <section className="rx-card"><div className="rx-card-h"><div><h2>Crear porciones con peso objetivo</h2><p>No hace falta pesar cada porción: una muestra basta; sin muestras se usa el peso objetivo</p></div></div><div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
    <div style={grid}>
      <F label="Área"><select className="rx-select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, stockKey: "" })}>{refs.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></F>
      <F label="Lote a porcionar"><select className="rx-select" value={form.stockKey} onChange={(e) => chooseStock(e.target.value)}><option value="">Elige</option>{stock.map((row) => <option key={`${row.productId}:${row.lotId}`} value={`${row.productId}:${row.lotId}`}>{row.productName} · {row.lotCode} · {qty(Number(row.onHand) - Number(row.reserved))} {row.unitSymbol}</option>)}</select></F>
      <F label="Porción que sale"><select className="rx-select" value={form.outputProductId} onChange={(e) => setForm({ ...form, outputProductId: e.target.value })}><option value="">Elige</option>{outputs.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></F>
      <F label={`Cantidad a porcionar${selected ? ` (${selected.unitSymbol})` : ""}`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.inputQuantity} onChange={(e) => setForm({ ...form, inputQuantity: e.target.value })} /></F>
      <F label="Peso objetivo"><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.targetWeight} onChange={(e) => setForm({ ...form, targetWeight: e.target.value })} /></F>
      <F label="Unidad del peso"><select className="rx-select" value={form.weightUnitId} onChange={(e) => setForm({ ...form, weightUnitId: e.target.value })}><option value="">Elige</option>{units.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.symbol})</option>)}</select></F>
      <F label="Muestras (separadas por coma)"><input className="rx-input rx-mono" value={form.sampleText} onChange={(e) => setForm({ ...form, sampleText: e.target.value })} placeholder="178, 182, 180" /></F>
      <F label="Tolerancia (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" value={form.tolerancePercent} onChange={(e) => setForm({ ...form, tolerancePercent: e.target.value })} /></F>
      <F label="Lote de porciones (opcional)"><input className="rx-input" value={form.outputLotCode} onChange={(e) => setForm({ ...form, outputLotCode: e.target.value })} /></F>
      <F label="Lote de sobrante (opcional)"><input className="rx-input" value={form.leftoverLotCode} onChange={(e) => setForm({ ...form, leftoverLotCode: e.target.value })} /></F>
    </div>
    <Alert tone="info">{samples.length ? `${samples.length} peso(s) · promedio ${qty(average)}` : "Sin muestras: se usa el peso objetivo"}. El sistema calcula las porciones completas y el sobrante.</Alert>
    <button className="rx-btn rx-btn--primary" type="button" style={{ justifySelf: "start" }} disabled={busy || !selected || !form.outputProductId || !form.weightUnitId || !(Number(form.inputQuantity) > 0)} onClick={submit}>Registrar porcionado</button>
  </div></section>;
}

function History({ data, onTrace, busy }) {
  const rows = useMemo(() => [
    ...(data?.processing || []).map((item) => ({ kind: "Limpieza o corte", date: item.completedAt, title: `${item.inputProductName} · ${item.inputLotCode}`, summary: `Rendimiento ${qty(item.yieldPercent)}% · merma ${qty(item.wastePercent)}%`, warning: item.outOfTolerance, lots: item.outputs.filter((row) => row.outputLotId).map((row) => ({ id: row.outputLotId, label: `${row.productName} · ${row.outputLotCode}` })) })),
    ...(data?.portioning || []).map((item) => ({ kind: "Porcionado", date: item.completedAt, title: `${item.sourceProductName} → ${item.outputProductName}`, summary: `${item.completePortions} porciones · sobrante ${qty(item.leftoverQuantity)} ${item.sourceUnitSymbol}`, warning: item.outOfTolerance, lots: [{ id: item.outputLotId, label: `${item.outputProductName} · ${item.outputLotCode}` }, ...(item.leftoverLotId ? [{ id: item.leftoverLotId, label: `Sobrante · ${item.leftoverLotCode}` }] : [])] })),
    ...(data?.production || []).map((item) => ({ kind: "Base preparada", date: item.completedAt, title: `${item.recipeName} v${item.version}`, summary: `Rindió ${qty(item.actualYield)}`, warning: item.outOfTolerance, lots: item.outputLotId ? [{ id: item.outputLotId, label: `${item.outputProductName} · ${item.outputLotCode}` }] : [] }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)), [data]);
  if (!rows.length) return <section className="rx-card"><Empty icon={Factory} title="Aún no hay preparaciones registradas" /></section>;
  return <section className="rx-card"><ul className="rx-list">{rows.map((row, index) => <li key={`${row.kind}-${row.date}-${index}`}><div className="grow"><b>{row.kind} · {row.title}</b><small>{dateShort(day(row.date))} {timeOf(row.date)} · {row.summary}</small>{row.lots.length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{row.lots.map((lot) => <button key={lot.id} className="rx-btn rx-btn--ghost rx-btn--sm" type="button" disabled={busy} onClick={() => onTrace(lot.id)}><GitBranch />{lot.label}</button>)}</div> : null}</div><Tag tone={row.warning ? "warn" : "ok"}>{row.warning ? "Fuera de tolerancia" : "Conforme"}</Tag></li>)}</ul></section>;
}
