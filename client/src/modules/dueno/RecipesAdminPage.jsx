// Restaurante / Bar › Recetas técnicas. El dueño define cada receta: ingredientes con cantidad exacta, tolerancia y
// merma técnica, rendimiento, precio y el manual que ve la estación. Las recetas son versionadas: se edita un borrador,
// se pone vigente y la anterior queda en el historial (cada venta guarda la versión y el costo con que se hizo).
// Rutas: /api/technical-recipes(/references), POST /technical-recipes, /:id/versions, PUT /:id/versions/:v, /activate, /archive.
import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, CheckCircle2, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Drawer, Empty, Field, HBars, Kpi, PageHead, SearchBox, Seg, Status, Tag, dayText, qty, soles, useBusy, useChartTip, useOpenId, useToast } from "./kit";

const TARGET = 60;
const activeOf = (recipe) => (recipe.versions || []).find((v) => v.status === "ACTIVE") || null;
const draftOf = (recipe) => (recipe.versions || []).find((v) => v.status === "DRAFT") || null;
const emptyLine = () => ({ productId: "", quantity: "", unitId: "", tolerancePercent: "0", technicalWastePercent: "0" });
const emptyManual = () => ({ description: "", steps: "", equipment: "", plating: "", allergens: "", prepMinutes: "", temperature: "" });

export function RecipesAdminPage({ area = "RESTAURANTE" }) {
  const isBar = area === "BARTENDER";
  const recipes = useFetch("/technical-recipes", { initialData: [], realtime: false });
  const references = useFetch("/technical-recipes/references", { initialData: { products: [], units: [], menuItems: [], areas: [] }, realtime: false });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("todas");
  const chart = useChartTip();
  const rows = (Array.isArray(recipes.data) ? recipes.data : []).filter((row) => row.area === area || (row.type === "INTERMEDIATE" && !isBar && row.area !== "BARTENDER"));
  const withMargin = rows.map((row) => ({ row, active: activeOf(row), draft: draftOf(row) }));
  const low = withMargin.filter(({ active }) => active && Number(active.marginPercent) < TARGET);
  const drafts = withMargin.filter(({ draft }) => draft);
  const noActive = withMargin.filter(({ active }) => !active);
  const shown = withMargin.filter(({ row, active, draft }) => (!text.trim() || `${row.name} ${row.code}`.toLowerCase().includes(text.trim().toLowerCase()))
    && (filter === "todas" || (filter === "bajo" ? active && Number(active.marginPercent) < TARGET : filter === "borrador" ? draft : !active))).sort((a, b) => a.row.name.localeCompare(b.row.name, "es"));
  const avgMargin = withMargin.filter(({ active }) => active).reduce((sum, { active }, _, list) => sum + Number(active.marginPercent) / list.length, 0);
  const lowest = withMargin.filter(({ active }) => active && Number(active.salePrice) > 0).sort((a, b) => Number(a.active.marginPercent) - Number(b.active.marginPercent)).slice(0, 8).map(({ row, active }) => ({ name: row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name, value: Math.max(0, Math.round(Number(active.marginPercent))) }));

  if (recipes.loading && !rows.length) return <LoadingSpinner label="Cargando recetas…" />;
  return <>
    <PageHead title={`Recetas de ${isBar ? "Bar" : "Cocina"}`} tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nueva receta</button>}>Cada {isBar ? "bebida" : "plato"} descuenta del stock exactamente lo que dice su receta vigente. Cambia una receta creando una versión nueva: la anterior queda en el historial.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={BookOpen} label="Recetas" value={rows.length} detail={`${rows.length - noActive.length} con versión vigente`} />
      <Kpi label="Margen promedio" value={`${Math.round(avgMargin)}%`} detail={`Sobre el costo de receta · meta ${TARGET}%`} />
      <Kpi label="Bajo la meta" value={low.length} detail={low.length ? "Revisa precio o porciones" : "Todas sobre la meta"} />
      <Kpi label="Borradores" value={drafts.length} detail={drafts.length ? "Esperan ponerse vigentes" : "Sin cambios pendientes"} />
    </div>
    <div className="ow-split" style={{ marginBottom: 14 }}>
      <Card title="Lista de recetas" flush tools={<><SearchBox value={text} onChange={setText} placeholder={isBar ? "Bebida o código" : "Plato o código"} width={220} /><Seg value={filter} onChange={setFilter} options={[["todas", "Todas", rows.length], ["bajo", "Margen bajo", low.length], ["borrador", "Borrador", drafts.length], ["sin", "Sin vigente", noActive.length]]} /></>}>
        {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Receta</th><th>Versión</th><th className="n">Costo / porción</th><th className="n">Precio</th><th className="n">Margen</th></tr></thead>
          <tbody>{shown.map(({ row, active, draft }) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
            <td><b style={{ fontWeight: 600 }}>{row.name}</b><small className="mut" style={{ display: "block" }}>{row.code}{row.type === "INTERMEDIATE" ? " · intermedio" : ""}</small></td>
            <td>{active ? <Tag tone="ok">v{active.version} vigente</Tag> : <Tag tone="crit">Sin vigente</Tag>}{draft ? <> <Tag tone="warn">v{draft.version} borrador</Tag></> : null}</td>
            <td className="n">{active ? soles(active.costPerPortion) : "—"}</td><td className="n">{active ? soles(active.salePrice) : "—"}</td>
            <td className="n" style={{ color: active && Number(active.marginPercent) < TARGET ? "var(--crit)" : undefined }}>{active && Number(active.salePrice) > 0 ? `${Math.round(Number(active.marginPercent))}%` : "—"}</td>
          </tr>)}</tbody></table></div> : <Empty icon={BookOpen} title="Ninguna receta con este filtro" />}
      </Card>
      <Card title="Menor margen" subtitle="Recetas vigentes con precio"><ChartBox><HBars rows={lowest} name="Margen %" tip={chart.tip} x0={130} valueLabel={(v) => `${v}%`} tooltipLabel="Margen" />{chart.layer}</ChartBox></Card>
    </div>
    {openId ? <RecipeDrawer id={openId} references={references.data} onClose={() => open(null)} onChanged={recipes.reload} /> : null}
    {creating ? <RecipeEditor area={area} references={references.data} onClose={() => setCreating(false)} onSaved={(saved) => { setCreating(false); recipes.reload(); open(saved.id); }} /> : null}
  </>;
}

function RecipeDrawer({ id, references, onClose, onChanged }) {
  const recipe = useFetch(`/technical-recipes/${id}`, { initialData: null, realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [editing, setEditing] = useState(null);
  const data = recipe.data;
  const act = (path, message) => run(async () => { await api(path, { method: "POST", body: {} }); show(message); await recipe.reload(); onChanged(); });
  const newVersion = () => run(async () => { const result = await api(`/technical-recipes/${id}/versions`, { method: "POST", body: {} }); await recipe.reload(); onChanged(); const draft = result.versions.find((v) => v.status === "DRAFT"); show(`Versión ${draft.version} creada como borrador.`); setEditing(draft); });
  if (!data) return <Drawer open onClose={onClose} title="Receta"><LoadingSpinner label="Cargando la receta…" /></Drawer>;
  if (editing) return <RecipeEditor recipe={data} version={editing} references={references} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); recipe.reload(); onChanged(); }} />;
  const hasDraft = data.versions.some((v) => v.status === "DRAFT");
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${data.code} · ${data.type === "INTERMEDIATE" ? "producto intermedio" : data.area === "BARTENDER" ? "Bar" : "Cocina"}`} title={data.name} subtitle={data.outputProductName ? `Produce ${data.outputProductName}` : data.legacyMenuItemId ? "Conectada a la carta del cliente" : "Receta independiente"}
    footer={<><button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>{!hasDraft ? <button className="rx-btn rx-btn--primary" type="button" onClick={newVersion} disabled={busy}><CopyPlus />Crear nueva versión</button> : null}</>}>
    {data.versions.map((version) => <section key={version.id} className="rx-sec">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Versión {version.version} · <Status value={version.status} /> <span className="mut" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>desde {dayText(version.validFrom)}</span></h3>
        <div className="ow-toolbar">{version.status === "DRAFT" ? <><button className="rx-btn rx-btn--sm" type="button" onClick={() => setEditing(version)}><Pencil />Editar</button><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" disabled={busy} onClick={() => act(`/technical-recipes/${id}/versions/${version.id}/activate`, `Versión ${version.version} vigente.`)}><CheckCircle2 />Poner vigente</button></> : null}{version.status !== "ARCHIVED" ? <button className="rx-btn rx-btn--sm" type="button" disabled={busy} onClick={() => act(`/technical-recipes/${id}/versions/${version.id}/archive`, `Versión ${version.version} archivada.`)}><Archive />Archivar</button> : null}</div>
      </div>
      <dl className="rx-dl" style={{ marginTop: 8 }}>
        <div><dt>Rinde</dt><dd>{qty(version.yieldQuantity)} {version.yieldUnitSymbol}</dd></div>
        <div><dt>Costo por porción</dt><dd>{soles(version.costPerPortion)}</dd></div>
        <div><dt>Precio</dt><dd>{soles(version.salePrice)}</dd></div>
        <div><dt>Margen</dt><dd style={{ color: Number(version.marginPercent) < TARGET ? "var(--crit)" : undefined }}>{soles(version.marginAmount)} · {Math.round(Number(version.marginPercent))}%</dd></div>
      </dl>
      <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Ingrediente</th><th className="n">Cantidad</th><th className="n">Tolerancia</th><th className="n">Merma téc.</th><th className="n">Costo</th></tr></thead>
        <tbody>{(version.ingredients || []).map((line) => <tr key={line.id}><td>{line.productName}{line.consumptionMode === "PREPRODUCED" ? <small className="mut" style={{ display: "block" }}>Intermedio ya producido</small> : null}</td><td className="n">{qty(line.quantity, 4)} {line.unitSymbol}</td><td className="n mut">±{qty(line.tolerancePercent)}%</td><td className="n mut">{qty(line.technicalWastePercent)}%</td><td className="n">{soles(line.lineCost)}</td></tr>)}</tbody></table></div>
      {version.manual && (version.manual.description || version.manual.steps?.length) ? <p className="ow-mini" style={{ marginTop: 8 }}>{version.manual.description}{Array.isArray(version.manual.steps) && version.manual.steps.length ? ` · ${version.manual.steps.length} paso(s)` : ""}{version.manual.prepMinutes ? ` · ${version.manual.prepMinutes} min` : ""}</p> : null}
    </section>)}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function RecipeEditor({ area, recipe, version, references, onClose, onSaved }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const editing = Boolean(version);
  const [form, setForm] = useState(() => editing ? {
    code: recipe.code, name: recipe.name, type: recipe.type, legacyMenuItemId: recipe.legacyMenuItemId || "", outputProductId: recipe.outputProductId || "", area: recipe.area,
    yieldQuantity: String(Number(version.yieldQuantity)), yieldUnitId: String(version.yieldUnitId || ""), salePrice: String(Number(version.salePrice)), validFrom: String(version.validFrom || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    manual: { ...emptyManual(), ...(version.manual || {}), steps: Array.isArray(version.manual?.steps) ? version.manual.steps.join("\n") : version.manual?.steps || "" },
    ingredients: (version.ingredients || []).map((line) => ({ productId: String(line.productId), quantity: String(Number(line.quantity)), unitId: String(line.unitId), tolerancePercent: String(Number(line.tolerancePercent)), technicalWastePercent: String(Number(line.technicalWastePercent)) }))
  } : { code: "", name: "", type: "MENU", legacyMenuItemId: "", outputProductId: "", area, yieldQuantity: "1", yieldUnitId: "", salePrice: "0", validFrom: new Date().toISOString().slice(0, 10), manual: emptyManual(), ingredients: [emptyLine()] });
  const refs = references || { products: [], units: [], menuItems: [], areas: [] };
  const menu = refs.menuItems.find((item) => String(item.id) === String(form.legacyMenuItemId));
  useEffect(() => { if (menu && !editing) setForm((current) => ({ ...current, name: menu.name, code: menu.code, area: menu.area, salePrice: String(menu.price) })); }, [form.legacyMenuItemId]);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const setManual = (patch) => setForm((current) => ({ ...current, manual: { ...current.manual, ...patch } }));
  const setLine = (index, patch) => setForm((current) => ({ ...current, ingredients: current.ingredients.map((line, row) => (row === index ? { ...line, ...patch } : line)) }));
  const products = useMemo(() => refs.products.slice().sort((a, b) => a.name.localeCompare(b.name, "es")), [refs.products]);
  const estimated = form.ingredients.reduce((sum, line) => { const product = refs.products.find((item) => String(item.id) === String(line.productId)); return sum + (product ? Number(product.cost || 0) * Number(line.quantity || 0) * (1 + Number(line.technicalWastePercent || 0) / 100) : 0); }, 0) / Math.max(1, Number(form.yieldQuantity || 1));
  function save() {
    if (!form.name.trim() || !form.code.trim()) { setError("Pon el nombre y el código."); return; }
    if (!form.yieldUnitId) { setError("Elige la unidad de rendimiento."); return; }
    if (form.ingredients.some((line) => !line.productId || !(Number(line.quantity) > 0) || !line.unitId)) { setError("Completa cada ingrediente con su cantidad y unidad."); return; }
    const payload = { ...form, legacyMenuItemId: form.legacyMenuItemId ? Number(form.legacyMenuItemId) : null, outputProductId: form.outputProductId ? Number(form.outputProductId) : null, yieldQuantity: Number(form.yieldQuantity), yieldUnitId: Number(form.yieldUnitId), salePrice: Number(form.salePrice), validFrom: `${form.validFrom}T00:00:00-05:00`,
      manual: { ...form.manual, prepMinutes: Number(form.manual.prepMinutes || 0), steps: String(form.manual.steps || "").split("\n").map((value) => value.replace(/^\s*\d+[.)-]?\s*/, "").trim()).filter(Boolean) },
      ingredients: form.ingredients.map((line) => ({ productId: Number(line.productId), quantity: Number(line.quantity), unitId: Number(line.unitId), tolerancePercent: Number(line.tolerancePercent), technicalWastePercent: Number(line.technicalWastePercent) })) };
    run(async () => { const result = editing ? await api(`/technical-recipes/${recipe.id}/versions/${version.id}`, { method: "PUT", body: payload }) : await api("/technical-recipes", { method: "POST", body: payload }); show(editing ? "Borrador guardado y recalculado con los costos actuales." : "Receta creada en borrador. Revísala y ponla vigente."); onSaved(result); });
  }
  return <Drawer open onClose={onClose} busy={busy} eyebrow={editing ? `${recipe.code} · versión ${version.version} (borrador)` : "Nueva receta"} title={editing ? recipe.name : "Receta técnica"} subtitle="La merma técnica sube el costo planificado; la tolerancia es el margen que la estación puede desviarse al pesar"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{editing ? "Guardar borrador" : "Crear borrador"}</button></>}>
    <div className="ow-form">
      {!editing ? <Field label="Tipo"><select className="rx-select" value={form.type} onChange={(event) => set({ type: event.target.value, legacyMenuItemId: "", outputProductId: "" })}><option value="MENU">Producto de venta</option><option value="INTERMEDIATE">Producto intermedio</option></select></Field> : null}
      {!editing && form.type === "MENU" ? <Field label="Producto de la carta"><select className="rx-select" value={form.legacyMenuItemId} onChange={(event) => set({ legacyMenuItemId: event.target.value })}><option value="">Receta independiente</option>{refs.menuItems.filter((item) => item.area === form.area).map((item) => <option key={item.id} value={item.id}>{item.name} · {soles(item.price)}</option>)}</select></Field> : null}
      {!editing && form.type === "INTERMEDIATE" ? <Field label="Producto intermedio que produce"><select className="rx-select" value={form.outputProductId} onChange={(event) => set({ outputProductId: event.target.value })}><option value="">Elige</option>{refs.products.filter((item) => item.type === "INTERMEDIATE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
      <Field label="Nombre"><input className="rx-input" value={form.name} onChange={(event) => set({ name: event.target.value })} /></Field>
      <Field label="Código"><input className="rx-input rx-mono" value={form.code} disabled={editing} onChange={(event) => set({ code: event.target.value })} /></Field>
      <Field label="Rinde"><input className="rx-input rx-mono" type="number" min="0" step="any" value={form.yieldQuantity} onChange={(event) => set({ yieldQuantity: event.target.value })} /></Field>
      <Field label="Unidad de rendimiento"><select className="rx-select" value={form.yieldUnitId} onChange={(event) => set({ yieldUnitId: event.target.value })}><option value="">Elige</option>{refs.units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}</select></Field>
      <Field label="Precio de venta (S/)"><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={form.salePrice} onChange={(event) => set({ salePrice: event.target.value })} /></Field>
      <Field label="Vigente desde"><input className="rx-input" type="date" value={form.validFrom} onChange={(event) => set({ validFrom: event.target.value })} /></Field>
    </div>
    <section className="rx-sec"><h3>Ingredientes · costo estimado {soles(estimated)} por porción{Number(form.salePrice) > 0 ? ` · margen ${Math.round((1 - estimated / Number(form.salePrice)) * 100)}%` : ""}</h3>
      <div style={{ display: "grid", gap: 8 }}>{form.ingredients.map((line, index) => { const product = refs.products.find((item) => String(item.id) === String(line.productId)); return <div key={index} style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr .8fr .6fr .6fr 32px", gap: 6, alignItems: "end" }}>
        <Field label={index ? " " : "Ingrediente"}><select className="rx-select" value={line.productId} onChange={(event) => { const item = refs.products.find((p) => String(p.id) === event.target.value); setLine(index, { productId: event.target.value, unitId: item ? String(item.baseUnitId) : "" }); }}><option value="">Elige</option>{products.filter((item) => String(item.id) !== String(form.outputProductId)).map((item) => <option key={item.id} value={item.id}>{item.name}{item.type === "INTERMEDIATE" ? " · intermedio" : ""}</option>)}</select></Field>
        <Field label={index ? " " : "Cantidad"}><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} placeholder={product?.baseUnitSymbol || ""} /></Field>
        <Field label={index ? " " : "Unidad"}><select className="rx-select" value={line.unitId} onChange={(event) => setLine(index, { unitId: event.target.value })}><option value="">—</option>{refs.units.map((item) => <option key={item.id} value={item.id}>{item.symbol}</option>)}</select></Field>
        <Field label={index ? " " : "Toler. %"}><input className="rx-input rx-mono" type="number" min="0" max="100" value={line.tolerancePercent} onChange={(event) => setLine(index, { tolerancePercent: event.target.value })} /></Field>
        <Field label={index ? " " : "Merma %"}><input className="rx-input rx-mono" type="number" min="0" max="100" value={line.technicalWastePercent} onChange={(event) => setLine(index, { technicalWastePercent: event.target.value })} /></Field>
        <button className="rx-close" type="button" aria-label="Quitar ingrediente" disabled={form.ingredients.length === 1} onClick={() => setForm((current) => ({ ...current, ingredients: current.ingredients.filter((_, row) => row !== index) }))}><Trash2 size={14} /></button>
      </div>; })}
        <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" style={{ justifySelf: "start" }} onClick={() => setForm((current) => ({ ...current, ingredients: [...current.ingredients, emptyLine()] }))}><Plus />Agregar ingrediente</button></div>
    </section>
    <section className="rx-sec"><h3>Manual para la estación</h3>
      <div className="ow-form">
        <Field label="Cómo debe quedar" full><textarea className="rx-input" style={{ height: 60, paddingTop: 8 }} value={form.manual.description} onChange={(event) => setManual({ description: event.target.value })} /></Field>
        <Field label="Pasos (uno por línea)" full><textarea className="rx-input" style={{ height: 110, paddingTop: 8 }} value={form.manual.steps} onChange={(event) => setManual({ steps: event.target.value })} /></Field>
        <Field label="Equipo y utensilios"><input className="rx-input" value={form.manual.equipment} onChange={(event) => setManual({ equipment: event.target.value })} /></Field>
        <Field label="Presentación"><input className="rx-input" value={form.manual.plating} onChange={(event) => setManual({ plating: event.target.value })} /></Field>
        <Field label="Alérgenos"><input className="rx-input" value={form.manual.allergens} onChange={(event) => setManual({ allergens: event.target.value })} /></Field>
        <Field label="Minutos de preparación"><input className="rx-input rx-mono" type="number" min="0" value={form.manual.prepMinutes} onChange={(event) => setManual({ prepMinutes: event.target.value })} /></Field>
      </div>
    </section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
