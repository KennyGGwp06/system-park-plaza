// Insumos › Existencias. Cuánto vale el inventario y dónde está, qué insumos están bajo el mínimo, sin stock o por vencer,
// y el catálogo completo de insumos (crear, editar, archivar, presentaciones de compra, unidades y categorías).
// Datos: /api/inventory-admin/dashboard, /api/catalog/products(/:id), /api/catalog/references; POST/PUT/PATCH en /api/catalog.
import { useMemo, useState } from "react";
import { Archive, Boxes, Plus, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Drawer, Empty, Field, HBars, Kpi, PageHead, SearchBox, Seg, Tag, dayText, qty, soles, useBusy, useChartTip, useOpenId, useToast } from "./kit";

const TYPES = { RAW_MATERIAL: "Materia prima", PROCESSED: "Procesado", INTERMEDIATE: "Intermedio", PORTION: "Porción", BEVERAGE: "Bebida", SUPPLY: "Suministro", FINISHED: "Producto terminado" };
const AREAS = { GENERAL: "Almacén general", RESTAURANTE: "Cocina", BARTENDER: "Bar" };
const levelOf = (row) => { const stock = Number(row.stock || 0), min = Number(row.minimumStock || 0); if (stock <= 0) return ["Sin stock", "crit"]; if (min > 0 && stock < min) return ["Bajo el mínimo", "warn"]; return ["Bien", "ok"]; };

export function StockOverviewPage() {
  const dashboard = useFetch("/inventory-admin/dashboard", { initialData: null, realtime: true, pollInterval: 60000 });
  const [archived, setArchived] = useState(false);
  const products = useFetch(`/catalog/products${archived ? "?includeArchived=true" : ""}`, { initialData: [], realtime: true });
  const references = useFetch("/catalog/references", { initialData: { categories: [], units: [], suppliers: [], productTypes: [], areas: [] }, realtime: false });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("todos");
  const [area, setArea] = useState("");
  const chart = useChartTip();
  const rows = Array.isArray(products.data) ? products.data : [];
  const live = rows.filter((row) => row.status !== "ARCHIVED");
  const low = live.filter((row) => levelOf(row)[1] === "warn");
  const none = live.filter((row) => levelOf(row)[1] === "crit");
  const shown = useMemo(() => rows.filter((row) => (!text.trim() || `${row.name} ${row.code} ${row.category?.name || ""}`.toLowerCase().includes(text.trim().toLowerCase())) && (!area || row.defaultAreaCode === area)
    && (filter === "todos" || (filter === "bajo" ? levelOf(row)[1] === "warn" : filter === "sin" ? levelOf(row)[1] === "crit" : row.status === "ARCHIVED"))).sort((a, b) => a.name.localeCompare(b.name, "es")), [rows, text, filter, area]);
  const metrics = dashboard.data?.metrics || {};
  const expiry = dashboard.data?.alerts?.expiry || [];
  const warehouses = (dashboard.data?.byWarehouse || []).filter((row) => Number(row.value) > 0).map((row) => ({ name: row.name.replace("Almacén operativo de ", "").replace("Almacén ", "").replace("Mercancía en ", ""), value: Math.round(Number(row.value)) }));
  const selected = rows.find((row) => String(row.id) === openId);

  if (products.loading && !rows.length) return <LoadingSpinner label="Cargando existencias…" />;
  return <>
    <PageHead title="Existencias" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nuevo insumo</button>}>Todo lo que hay en el almacén general, la cocina y el bar. Aquí también creas y editas cada insumo: costo, mínimo, unidad y presentación de compra.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Boxes} label="Valor del inventario" value={soles(metrics.totalValue)} detail={`${live.length} insumos activos`} />
      <Kpi label="Bajo el mínimo" value={low.length} detail={low.length ? "Pídelos en Necesidades del día" : "Todo sobre el mínimo"} />
      <Kpi label="Sin stock" value={none.length} detail={none.length ? "Pueden frenar la carta" : "Ninguno agotado"} />
      <Kpi label="Mermas del mes" value={soles(metrics.wasteMonth)} detail={`Hoy ${soles(metrics.wasteDay)}`} />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
        <Card title="Valor por almacén" subtitle="Al costo de compra"><ChartBox><HBars rows={warehouses} name="Valor" tip={chart.tip} x0={90} valueLabel={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`} tooltipLabel="Valor" />{chart.layer}</ChartBox></Card>
        <Card title="Por vencer" subtitle="Lotes con fecha de vencimiento cercana" flush>{expiry.length ? <ul className="rx-list">{expiry.slice(0, 8).map((row, index) => <li key={index}><div className="grow"><b>{row.productName || row.name}</b><small>{row.lotCode || ""}{row.warehouseName ? ` · ${row.warehouseName}` : ""}</small></div><Tag tone="warn">{dayText(row.expiresAt || row.expiryDate)}</Tag></li>)}</ul> : <Empty title="Ningún lote por vencer" />}</Card>
    </div>
      <Card title="Insumos" flush tools={<><SearchBox value={text} onChange={setText} placeholder="Insumo, código o categoría" width={230} /><select className="rx-select" value={area} onChange={(event) => setArea(event.target.value)} style={{ width: 150 }}><option value="">Todas las áreas</option>{Object.entries(AREAS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><Seg value={filter} onChange={(value) => { setFilter(value); if (value === "archivados") setArchived(true); }} options={[["todos", "Todos"], ["bajo", "Bajo mínimo", low.length], ["sin", "Sin stock", none.length], ["archivados", "Archivados"]]} /></>}>
        {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Insumo</th><th>Área</th><th className="n">Stock</th><th className="n">Mínimo</th><th className="n">Costo</th><th className="n">Valor</th><th>Nivel</th></tr></thead>
          <tbody>{shown.map((row) => { const [label, tone] = row.status === "ARCHIVED" ? ["Archivado", "off"] : levelOf(row); const unit = row.baseUnit?.symbol || ""; return <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
            <td><b style={{ fontWeight: 600 }}>{row.name}</b><small className="mut" style={{ display: "block" }}>{row.category?.name || "—"} · {TYPES[row.type] || row.type}</small></td>
            <td className="mut">{AREAS[row.defaultAreaCode] || row.defaultAreaCode}</td>
            <td className="n">{qty(row.stock)} {unit}</td><td className="n mut">{Number(row.minimumStock) ? `${qty(row.minimumStock)} ${unit}` : "—"}</td>
            <td className="n mut">{soles(row.cost)}/{unit}</td><td className="n">{soles(Number(row.stock || 0) * Number(row.cost || 0))}</td><td><Tag tone={tone}>{label}</Tag></td>
          </tr>; })}</tbody></table></div> : <Empty icon={Boxes} title="Ningún insumo con este filtro" />}
      </Card>
    {creating || selected ? <ProductDrawer product={creating ? null : selected} references={references} onClose={() => { setCreating(false); open(null); }} onSaved={() => { setCreating(false); open(null); products.reload(); dashboard.reload(); }} /> : null}
  </>;
}

const blank = () => ({ code: "", name: "", categoryId: "", type: "RAW_MATERIAL", baseUnitId: "", purchaseUnitId: "", habitualSupplierId: "", cost: "0", minimumStock: "0", maximumStock: "", defaultAreaCode: "RESTAURANTE", status: "ACTIVE", trackLots: false, trackExpiry: false, tolerancePercent: "0", densityKgPerL: "", imageUrl: "", presentations: [{ code: "", name: "", unitId: "", conversionFactor: "", isPurchaseUnit: true, barcode: "", purchaseCost: "" }], conversions: [] });

function ProductDrawer({ product, references, onClose, onSaved }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const detail = useFetch(product ? `/catalog/products/${product.id}` : "/catalog/products/0", { initialData: null, enabled: Boolean(product), realtime: false });
  const [form, setForm] = useState(null);
  const [archiving, setArchiving] = useState("");
  const [master, setMaster] = useState("");
  const [masterForm, setMasterForm] = useState({ code: "", name: "", symbol: "", dimension: "COUNT", decimalPlaces: "0" });
  const refs = references.data || { categories: [], units: [], suppliers: [] };
  const source = product ? detail.data : null;
  const current = form || (product ? (source ? {
    code: source.code, name: source.name, categoryId: String(source.category?.id || ""), type: source.type, baseUnitId: String(source.baseUnit?.id || ""), purchaseUnitId: String(source.purchaseUnit?.id || source.baseUnit?.id || ""), habitualSupplierId: String(source.supplier?.id || ""), cost: String(Number(source.cost)), minimumStock: String(Number(source.minimumStock)), maximumStock: source.maximumStock == null ? "" : String(Number(source.maximumStock)), defaultAreaCode: source.defaultAreaCode, status: source.status, trackLots: Boolean(source.trackLots), trackExpiry: Boolean(source.trackExpiry), tolerancePercent: String(Number(source.tolerancePercent || 0)), densityKgPerL: source.densityKgPerL == null ? "" : String(source.densityKgPerL), imageUrl: source.imageUrl || "",
    presentations: (source.presentations || []).map((item) => ({ code: item.code || "", name: item.name || "", unitId: String(item.unitId || ""), conversionFactor: String(item.conversionFactor ?? ""), isPurchaseUnit: Boolean(item.isPurchaseUnit), barcode: item.barcode || "", purchaseCost: item.purchaseCost == null ? "" : String(item.purchaseCost) })), conversions: source.conversions || []
  } : null) : blank());
  if (!current) return <Drawer open onClose={onClose} title="Insumo"><LoadingSpinner label="Cargando el insumo…" /></Drawer>;
  const set = (patch) => setForm({ ...current, ...patch });
  const setPres = (index, patch) => set({ presentations: current.presentations.map((item, row) => (row === index ? { ...item, ...patch } : item)) });
  const save = () => {
    if (!current.name.trim() || !current.code.trim() || !current.categoryId || !current.baseUnitId) { setError("Completa nombre, código, categoría y unidad base."); return; }
    const body = { ...current, categoryId: Number(current.categoryId), baseUnitId: Number(current.baseUnitId), purchaseUnitId: Number(current.purchaseUnitId || current.baseUnitId), habitualSupplierId: current.habitualSupplierId ? Number(current.habitualSupplierId) : null, cost: Number(current.cost), minimumStock: Number(current.minimumStock), maximumStock: current.maximumStock === "" ? null : Number(current.maximumStock), tolerancePercent: Number(current.tolerancePercent), densityKgPerL: current.densityKgPerL === "" ? null : Number(current.densityKgPerL),
      presentations: current.presentations.filter((item) => item.unitId).map((item) => ({ ...item, code: item.code || item.name.toUpperCase().replace(/\W+/g, "_").slice(0, 20), unitId: Number(item.unitId), conversionFactor: Number(item.conversionFactor || 1), purchaseCost: item.purchaseCost === "" ? null : Number(item.purchaseCost) })) };
    run(async () => { await api(product ? `/catalog/products/${product.id}` : "/catalog/products", { method: product ? "PUT" : "POST", body }); show(product ? "Insumo actualizado." : "Insumo creado."); onSaved(); });
  };
  const archive = () => run(async () => { await api(`/catalog/products/${product.id}/archive`, { method: "PATCH", body: { reason: archiving.trim() } }); show("Insumo archivado. Su historial se conserva."); onSaved(); });
  const createMaster = () => run(async () => { await api(master === "unidad" ? "/catalog/units" : "/catalog/categories", { method: "POST", body: master === "unidad" ? { ...masterForm, decimalPlaces: Number(masterForm.decimalPlaces) } : { code: masterForm.code, name: masterForm.name } }); show(master === "unidad" ? "Unidad creada." : "Categoría creada."); setMaster(""); references.reload(); });
  const unitName = (id) => refs.units.find((item) => String(item.id) === String(id))?.symbol || "";

  return <Drawer open onClose={onClose} busy={busy} eyebrow={product ? `${product.code} · stock ${qty(product.stock)} ${product.baseUnit?.symbol || ""}` : "Nuevo insumo"} title={product ? product.name : "Insumo del catálogo"} subtitle="Costo, mínimo y unidad definen las compras, las recetas y las alertas"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{product ? "Guardar cambios" : "Crear insumo"}</button></>}>
    <div className="ow-form">
      <Field label="Nombre"><input className="rx-input" value={current.name} onChange={(event) => set({ name: event.target.value })} /></Field>
      <Field label="Código"><input className="rx-input rx-mono" value={current.code} onChange={(event) => set({ code: event.target.value.toUpperCase() })} /></Field>
      <Field label={<>Categoría <button type="button" className="rx-link" style={{ border: 0, background: "none", padding: 0, fontSize: 12 }} onClick={() => setMaster("categoria")}>+ nueva</button></>}><select className="rx-select" value={current.categoryId} onChange={(event) => set({ categoryId: event.target.value })}><option value="">Elige</option>{refs.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Tipo"><select className="rx-select" value={current.type} onChange={(event) => set({ type: event.target.value })}>{Object.entries(TYPES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>
      <Field label={<>Unidad base <button type="button" className="rx-link" style={{ border: 0, background: "none", padding: 0, fontSize: 12 }} onClick={() => setMaster("unidad")}>+ nueva</button></>}><select className="rx-select" value={current.baseUnitId} onChange={(event) => set({ baseUnitId: event.target.value, purchaseUnitId: current.purchaseUnitId || event.target.value })}><option value="">Elige</option>{refs.units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}</select></Field>
      <Field label="Área que lo usa"><select className="rx-select" value={current.defaultAreaCode} onChange={(event) => set({ defaultAreaCode: event.target.value })}>{Object.entries(AREAS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>
      <Field label={`Costo por ${unitName(current.baseUnitId) || "unidad base"} (S/)`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={current.cost} onChange={(event) => set({ cost: event.target.value })} /></Field>
      <Field label="Proveedor habitual"><select className="rx-select" value={current.habitualSupplierId} onChange={(event) => set({ habitualSupplierId: event.target.value })}><option value="">Sin proveedor fijo</option>{refs.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Stock mínimo"><input className="rx-input rx-mono" type="number" min="0" step="any" value={current.minimumStock} onChange={(event) => set({ minimumStock: event.target.value })} /></Field>
      <Field label="Stock máximo (opcional)"><input className="rx-input rx-mono" type="number" min="0" step="any" value={current.maximumStock} onChange={(event) => set({ maximumStock: event.target.value })} /></Field>
      <Field label="Tolerancia al contar (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" value={current.tolerancePercent} onChange={(event) => set({ tolerancePercent: event.target.value })} /></Field>
      <Field label="Densidad kg/L (licores, opcional)"><input className="rx-input rx-mono" type="number" min="0" step="0.001" value={current.densityKgPerL} onChange={(event) => set({ densityKgPerL: event.target.value })} /></Field>
      <label className="rx-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={current.trackLots} onChange={(event) => set({ trackLots: event.target.checked })} /> <span>Controlar por lotes</span></label>
      <label className="rx-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={current.trackExpiry} onChange={(event) => set({ trackExpiry: event.target.checked })} /> <span>Controlar vencimiento</span></label>
    </div>
    {master ? <section className="rx-sec"><h3>{master === "unidad" ? "Nueva unidad" : "Nueva categoría"}</h3><div className="ow-form">
      <Field label="Código"><input className="rx-input rx-mono" value={masterForm.code} onChange={(event) => setMasterForm({ ...masterForm, code: event.target.value.toUpperCase() })} /></Field>
      <Field label="Nombre"><input className="rx-input" value={masterForm.name} onChange={(event) => setMasterForm({ ...masterForm, name: event.target.value })} /></Field>
      {master === "unidad" ? <><Field label="Símbolo"><input className="rx-input" value={masterForm.symbol} onChange={(event) => setMasterForm({ ...masterForm, symbol: event.target.value })} /></Field><Field label="Tipo de medida"><select className="rx-select" value={masterForm.dimension} onChange={(event) => setMasterForm({ ...masterForm, dimension: event.target.value })}><option value="COUNT">Unidades</option><option value="MASS">Peso</option><option value="VOLUME">Volumen</option></select></Field></> : null}
      <div className="full ow-toolbar"><button className="rx-btn rx-btn--sm" type="button" onClick={() => setMaster("")}>Cancelar</button><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={createMaster} disabled={busy || !masterForm.code || !masterForm.name}>Crear</button></div>
    </div></section> : null}
    <section className="rx-sec"><h3>Presentaciones de compra</h3>
      <p className="ow-mini" style={{ marginTop: 0 }}>Cómo lo compras (saco, caja, botella) y a cuántas unidades base equivale.</p>
      <div style={{ display: "grid", gap: 6 }}>{current.presentations.map((item, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1.3fr .9fr .9fr .9fr 32px", gap: 6, alignItems: "end" }}>
        <Field label={index ? " " : "Nombre"}><input className="rx-input" value={item.name} onChange={(event) => setPres(index, { name: event.target.value })} placeholder="Ej. Saco de 50 kg" /></Field>
        <Field label={index ? " " : "Unidad"}><select className="rx-select" value={item.unitId} onChange={(event) => setPres(index, { unitId: event.target.value })}><option value="">—</option>{refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}</select></Field>
        <Field label={index ? " " : `Equivale a (${unitName(current.baseUnitId) || "base"})`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={item.conversionFactor} onChange={(event) => setPres(index, { conversionFactor: event.target.value })} /></Field>
        <Field label={index ? " " : "Precio de compra"}><input className="rx-input rx-mono" type="number" min="0" step="any" value={item.purchaseCost} onChange={(event) => setPres(index, { purchaseCost: event.target.value })} /></Field>
        <button className="rx-close" type="button" aria-label="Quitar" onClick={() => set({ presentations: current.presentations.filter((_, row) => row !== index) })}><Trash2 size={14} /></button>
      </div>)}<button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" style={{ justifySelf: "start" }} onClick={() => set({ presentations: [...current.presentations, { code: "", name: "", unitId: "", conversionFactor: "", isPurchaseUnit: false, barcode: "", purchaseCost: "" }] })}><Plus />Agregar presentación</button></div>
    </section>
    {product && product.status !== "ARCHIVED" ? <section className="rx-sec"><h3>Archivar</h3><div style={{ display: "flex", gap: 8 }}><input className="rx-input" value={archiving} onChange={(event) => setArchiving(event.target.value)} placeholder="Motivo (ya no se compra, se reemplazó…)" /><button className="rx-btn rx-btn--danger" type="button" disabled={busy || archiving.trim().length < 5} onClick={archive}><Archive />Archivar</button></div></section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
