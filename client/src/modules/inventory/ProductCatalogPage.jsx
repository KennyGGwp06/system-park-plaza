import { useMemo, useState } from "react";
import { Archive, Box, Droplets, Info, PackageCheck, Pencil, Plus, Scale, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const typeLabels = {
  RAW_MATERIAL: "Materia prima", PROCESSED: "Procesado", INTERMEDIATE: "Intermedio", PORTION: "Porcionado",
  BEVERAGE: "Bebida", SUPPLY: "Insumo", FINISHED: "Producto terminado"
};
const statusLabels = { ACTIVE: "Activo", INACTIVE: "Inactivo", ARCHIVED: "Archivado" };
const areaLabels = { GENERAL: "Almacén general", RESTAURANTE: "Cocina / restaurante", BARTENDER: "Bar" };

function blankProduct() {
  return { code: "", name: "", categoryId: "", type: "RAW_MATERIAL", baseUnitId: "", purchaseUnitId: "", habitualSupplierId: "", cost: "0", minimumStock: "0", maximumStock: "", defaultAreaCode: "RESTAURANTE", status: "ACTIVE", trackLots: false, trackExpiry: false, tolerancePercent: "0", densityKgPerL: "", imageUrl: "", presentations: [{ code: "", name: "", unitId: "", conversionFactor: "", isPurchaseUnit: true, barcode: "", purchaseCost: "" }], conversions: [] };
}

export function ProductCatalogPage() {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankProduct());
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveMode, setArchiveMode] = useState(false);
  const [toast, setToast] = useState("");
  const [masterMode, setMasterMode] = useState("");
  const [unitForm, setUnitForm] = useState({ code: "", name: "", symbol: "", dimension: "COUNT", decimalPlaces: "0" });
  const [categoryForm, setCategoryForm] = useState({ code: "", name: "" });
  const { data: references, loading: loadingReferences, reload: reloadReferences } = useFetch("/catalog/references", { initialData: { categories: [], units: [], suppliers: [], warehouses: [], productTypes: [], statuses: [], areas: [] } });
  const query = `/catalog/products?includeArchived=${includeArchived}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data: products, loading, reload } = useFetch(query, { initialData: [] });
  const baseUnit = references.units.find((unit) => String(unit.id) === String(form.baseUnitId));
  const incompatiblePresentations = useMemo(() => (form.presentations || []).filter((item) => {
    const unit = references.units.find((candidate) => String(candidate.id) === String(item.unitId));
    return unit && baseUnit && new Set([unit.dimension, baseUnit.dimension]).has("MASS") && new Set([unit.dimension, baseUnit.dimension]).has("VOLUME");
  }), [form.presentations, form.baseUnitId, references.units, baseUnit]);

  function beginCreate() {
    setEditing(null); setForm(blankProduct()); setErrors({}); setGeneralError(""); setArchiveMode(false); setArchiveReason("");
  }

  async function beginEdit(product) {
    setGeneralError(""); setErrors({}); setArchiveMode(false); setArchiveReason("");
    const detail = await api(`/catalog/products/${product.id}`);
    setEditing(detail);
    setForm({ code: detail.code, name: detail.name, categoryId: String(detail.category.id), type: detail.type, baseUnitId: String(detail.baseUnit.id), purchaseUnitId: String(detail.purchaseUnit?.id || detail.baseUnit.id), habitualSupplierId: String(detail.supplier?.id || ""), cost: String(detail.cost), minimumStock: String(detail.minimumStock), maximumStock: detail.maximumStock == null ? "" : String(detail.maximumStock), defaultAreaCode: detail.defaultAreaCode, status: detail.status, trackLots: detail.trackLots, trackExpiry: detail.trackExpiry, tolerancePercent: String(detail.tolerancePercent), densityKgPerL: detail.densityKgPerL || "", imageUrl: detail.imageUrl || "", presentations: detail.presentations.filter((item) => item.code !== "BASE").map((item) => ({ ...item, unitId: String(item.unitId), conversionFactor: String(item.conversionFactor), purchaseCost: item.purchaseCost ?? "" })), conversions: detail.conversions || [] });
  }

  function updatePresentation(index, field, value) {
    setForm((current) => ({ ...current, presentations: current.presentations.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function addPresentation() {
    setForm((current) => ({ ...current, presentations: [...current.presentations, { code: "", name: "", unitId: current.purchaseUnitId || "", conversionFactor: "", isPurchaseUnit: false, barcode: "", purchaseCost: "" }] }));
  }

  function removePresentation(index) {
    setForm((current) => ({ ...current, presentations: current.presentations.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Ingresa el nombre.";
    if (!form.categoryId) next.categoryId = "Selecciona la categoría.";
    if (!form.baseUnitId) next.baseUnitId = "Selecciona la unidad base.";
    if (!form.purchaseUnitId) next.purchaseUnitId = "Selecciona la unidad de compra.";
    if (Number(form.minimumStock) < 0) next.minimumStock = "No puede ser negativo.";
    if (form.maximumStock !== "" && Number(form.maximumStock) < Number(form.minimumStock)) next.maximumStock = "Debe ser mayor o igual al mínimo.";
    if (!form.presentations.length || form.presentations.some((item) => !item.name.trim() || !item.unitId || Number(item.conversionFactor) <= 0)) next.presentations = "Completa nombre, unidad y factor en cada presentación.";
    if (form.trackExpiry && !form.trackLots) next.trackExpiry = "Activa primero el control por lote.";
    if (incompatiblePresentations.length && !(Number(form.densityKgPerL) > 0)) next.presentations = "Masa y volumen requieren densidad o una conversión específica.";
    setErrors(next);
    return !Object.keys(next).length;
  }

  async function save(event) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true); setGeneralError("");
    try {
      const body = { ...form, imageUrl: form.imageUrl, categoryId: Number(form.categoryId), baseUnitId: Number(form.baseUnitId), purchaseUnitId: Number(form.purchaseUnitId), habitualSupplierId: form.habitualSupplierId ? Number(form.habitualSupplierId) : null, cost: Number(form.cost), minimumStock: Number(form.minimumStock), maximumStock: form.maximumStock === "" ? null : Number(form.maximumStock), tolerancePercent: Number(form.tolerancePercent), densityKgPerL: form.densityKgPerL === "" ? null : Number(form.densityKgPerL), presentations: form.presentations.map((item) => ({ ...item, unitId: Number(item.unitId), conversionFactor: Number(item.conversionFactor), purchaseCost: item.purchaseCost === "" ? null : Number(item.purchaseCost) })) };
      if (editing) await api(`/catalog/products/${editing.id}`, { method: "PUT", body });
      else await api("/catalog/products", { method: "POST", body });
      setToast(editing ? "Producto actualizado sin alterar su historial." : "Producto creado en el catálogo maestro.");
      beginCreate(); reload();
    } catch (error) {
      setErrors(error.fieldErrors || {}); setGeneralError(error.message);
    } finally { setSaving(false); }
  }

  async function archiveProduct() {
    if (!archiveReason.trim()) { setErrors({ reason: "Escribe el motivo del archivado." }); return; }
    setSaving(true); setGeneralError("");
    try {
      await api(`/catalog/products/${editing.id}/archive`, { method: "PATCH", body: { reason: archiveReason } });
      setToast("Producto archivado. Su historial permanece disponible."); beginCreate(); reload();
    } catch (error) { setGeneralError(error.message); setErrors(error.fieldErrors || {}); }
    finally { setSaving(false); }
  }

  async function saveUnit(event) {
    event.preventDefault(); setGeneralError("");
    try {
      await api("/catalog/units", { method: "POST", body: { ...unitForm, decimalPlaces: Number(unitForm.decimalPlaces) } });
      setToast("Unidad agregada al catálogo."); setUnitForm({ code: "", name: "", symbol: "", dimension: "COUNT", decimalPlaces: "0" }); setMasterMode(""); reloadReferences();
    } catch (error) { setGeneralError(error.message); }
  }

  async function saveCategory(event) {
    event.preventDefault(); setGeneralError("");
    try {
      await api("/catalog/categories", { method: "POST", body: categoryForm });
      setToast("Categoría agregada al catálogo."); setCategoryForm({ code: "", name: "" }); setMasterMode(""); reloadReferences();
    } catch (error) { setGeneralError(error.message); }
  }

  if (loadingReferences) return <LoadingSpinner />;
  return <div className="space-y-5">
    <Toast message={toast} onClose={() => setToast("")} />
    <PageHeader eyebrow="Inventario inteligente" title="Catálogo maestro de productos" description="Configura cómo se compra, almacena y convierte cada producto. Los cambios de costo y el archivado conservan todo el historial." actions={<><Button variant="secondary" icon={Plus} onClick={() => setMasterMode("UNIT")}>Nueva unidad</Button><Button variant="secondary" icon={Plus} onClick={() => setMasterMode("CATEGORY")}>Nueva categoría</Button><Button icon={Plus} onClick={beginCreate}>Nuevo producto</Button></>} />

    {masterMode ? <section className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-balance text-lg font-black text-park-dark">{masterMode === "UNIT" ? "Nueva unidad de medida" : "Nueva categoría"}</h2><p className="text-pretty text-sm text-park-muted">{masterMode === "UNIT" ? "La dimensión evita conversiones incompatibles entre masa, volumen y unidades." : "Agrupa productos para búsqueda, compras y reportes."}</p></div><Button variant="ghost" icon={X} onClick={() => setMasterMode("")}>Cerrar</Button></div>{generalError ? <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{generalError}</div> : null}
      {masterMode === "UNIT" ? <form className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5" onSubmit={saveUnit}><Input label="Nombre" placeholder="Botella" value={unitForm.name} required onChange={(event) => setUnitForm({ ...unitForm, name: event.target.value })} /><Input label="Código" placeholder="BOTTLE" value={unitForm.code} onChange={(event) => setUnitForm({ ...unitForm, code: event.target.value })} /><Input label="Símbolo" placeholder="bot" value={unitForm.symbol} required onChange={(event) => setUnitForm({ ...unitForm, symbol: event.target.value })} /><Select label="Dimensión" value={unitForm.dimension} onChange={(event) => setUnitForm({ ...unitForm, dimension: event.target.value })}><option value="MASS">Masa</option><option value="VOLUME">Volumen</option><option value="COUNT">Conteo</option><option value="LENGTH">Longitud</option><option value="OTHER">Otra</option></Select><Input label="Decimales" type="number" min="0" max="6" value={unitForm.decimalPlaces} onChange={(event) => setUnitForm({ ...unitForm, decimalPlaces: event.target.value })} /><div className="lg:col-span-5"><Button type="submit" icon={PackageCheck}>Guardar unidad</Button></div></form> : <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={saveCategory}><Input label="Nombre" placeholder="Frutas y verduras" value={categoryForm.name} required onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /><Input label="Código" placeholder="Se genera si queda vacío" value={categoryForm.code} onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value })} /><div className="md:col-span-2"><Button type="submit" icon={PackageCheck}>Guardar categoría</Button></div></form>}
    </section> : null}

    <section className="grid gap-3 md:grid-cols-3">
      <ExampleCard icon={Scale} title="Productos por peso" text="Base: gramos. Compra: 1 kg = 1,000 g." />
      <ExampleCard icon={Droplets} title="Líquidos y botellas" text="Base: mililitros. 1 botella de pisco = 750 ml." />
      <ExampleCard icon={Box} title="Productos por unidad" text="Base: unidad. 1 caja de huevos = 24 unidades." />
    </section>

    <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <Input label="Buscar producto" placeholder="Nombre o código" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="flex h-10 items-center gap-2 rounded-input border border-park-border px-3 text-sm font-semibold"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Mostrar archivados</label>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(580px,1.1fr)]">
      <section aria-label="Productos del catálogo">
        {loading ? <LoadingSpinner /> : !products.length ? <EmptyState title="No hay productos" description="Crea el primer producto del catálogo maestro." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">{products.map((product) => <ProductCard key={product.id} product={product} onEdit={() => beginEdit(product)} />)}</div>}
      </section>

      <section className="rounded-card border border-park-border bg-white p-4 shadow-card md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase text-park-gold">{editing ? "Edición segura" : "Alta de producto"}</p><h2 className="text-balance text-xl font-black text-park-dark">{editing ? editing.name : "Nuevo producto"}</h2><p className="mt-1 text-pretty text-sm text-park-muted">Los factores siempre indican cuántas unidades base contiene una presentación.</p></div>
          {editing ? <Button variant="ghost" icon={X} onClick={beginCreate}>Cerrar</Button> : null}
        </div>
        {generalError ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{generalError}</div> : null}
        <form className="mt-5 space-y-6" onSubmit={save}>
          <FormSection title="Identidad" description="Datos que verá Administración al buscar y comprar.">
            <div className="grid gap-3 md:grid-cols-2"><Input label="Nombre" value={form.name} error={errors.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Input label="Código interno" placeholder="Se genera si queda vacío" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
              <Select label="Categoría" value={form.categoryId} error={errors.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Seleccionar</option>{references.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
              <Select label="Tipo" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{references.productTypes.map((item) => <option key={item} value={item}>{typeLabels[item]}</option>)}</Select>
              <Select label="Área predeterminada" value={form.defaultAreaCode} onChange={(event) => setForm({ ...form, defaultAreaCode: event.target.value })}>{references.areas.map((item) => <option key={item} value={item}>{areaLabels[item]}</option>)}</Select>
              <Select label="Estado" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{references.statuses.filter((item) => item !== "ARCHIVED").map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</Select>
              <div className="md:col-span-2">
                <Input label="URL de imagen del producto (opcional)" placeholder="https://ejemplo.com/foto-pollo.jpg" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} />
                {form.imageUrl ? <div className="mt-2 flex items-center gap-3"><img src={form.imageUrl} alt="Vista previa" className="h-16 w-16 rounded-lg border border-park-border object-cover" onError={(e) => { e.target.style.display = 'none'; }} /><p className="text-xs text-park-muted">Vista previa · Asegúrate de que la URL sea pública y accesible.</p></div> : null}
              </div>
            </div>
          </FormSection>

          <FormSection title="Unidades y compra" description="La unidad base es la medida interna. La unidad de compra es como llega del proveedor.">
            <div className="grid gap-3 md:grid-cols-2"><Select label="Unidad base" value={form.baseUnitId} error={errors.baseUnitId} onChange={(event) => setForm({ ...form, baseUnitId: event.target.value })}><option value="">Seleccionar</option>{references.units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}</Select>
              <Select label="Unidad de compra" value={form.purchaseUnitId} error={errors.purchaseUnitId} onChange={(event) => setForm({ ...form, purchaseUnitId: event.target.value })}><option value="">Seleccionar</option>{references.units.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}</Select>
              <Select label="Proveedor habitual" value={form.habitualSupplierId} onChange={(event) => setForm({ ...form, habitualSupplierId: event.target.value })}><option value="">Sin proveedor fijo</option>{references.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
              <Input label="Densidad kg/l (solo masa ↔ volumen)" type="number" min="0" step="0.000001" placeholder="Ej. 1.03" value={form.densityKgPerL} onChange={(event) => setForm({ ...form, densityKgPerL: event.target.value })} /></div>
            <div className="mt-3 flex gap-2 rounded-lg bg-park-green-soft p-3 text-sm text-park-green"><Info className="mt-0.5 size-4 shrink-0" /><p className="text-pretty">Gramos y mililitros no se convierten automáticamente. Debes registrar la densidad específica del producto.</p></div>
          </FormSection>

          <FormSection title="Presentaciones comerciales" description="Ejemplo: una botella contiene 750 ml; una caja contiene 24 unidades.">
            <div className="space-y-3">{form.presentations.map((presentation, index) => <div key={`${index}-${presentation.code}`} className="rounded-xl border border-park-border bg-park-bg p-3"><div className="grid gap-3 md:grid-cols-2"><Input label="Presentación" placeholder="Caja de 24" value={presentation.name} onChange={(event) => updatePresentation(index, "name", event.target.value)} /><Input label="Código" placeholder="CAJA24" value={presentation.code} onChange={(event) => updatePresentation(index, "code", event.target.value)} />
                <Select label="Unidad comercial" value={presentation.unitId} onChange={(event) => updatePresentation(index, "unitId", event.target.value)}><option value="">Seleccionar</option>{references.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
                <Input label={`Factor a ${baseUnit?.symbol || "unidad base"}`} type="number" min="0.000001" step="0.000001" placeholder="Ej. 750" value={presentation.conversionFactor} onChange={(event) => updatePresentation(index, "conversionFactor", event.target.value)} />
                <Input label="Código de barras (opcional)" value={presentation.barcode || ""} onChange={(event) => updatePresentation(index, "barcode", event.target.value)} /><Input label="Costo de compra (opcional)" type="number" min="0" step="0.01" value={presentation.purchaseCost ?? ""} onChange={(event) => updatePresentation(index, "purchaseCost", event.target.value)} /></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(presentation.isPurchaseUnit)} onChange={(event) => updatePresentation(index, "isPurchaseUnit", event.target.checked)} /> Presentación habitual de compra</label>{form.presentations.length > 1 ? <Button type="button" size="sm" variant="ghost" icon={X} onClick={() => removePresentation(index)}>Quitar</Button> : null}</div></div>)}</div>
            {errors.presentations ? <p role="alert" className="mt-2 text-sm font-semibold text-park-danger">{errors.presentations}</p> : null}
            <Button type="button" className="mt-3" variant="secondary" icon={Plus} onClick={addPresentation}>Agregar presentación</Button>
          </FormSection>

          <FormSection title="Control y valorización" description="El costo maestro se usa para valorización; cada movimiento conserva su propio costo histórico.">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Input label="Costo promedio" type="number" min="0" step="0.000001" value={form.cost} error={errors.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /><Input label="Stock mínimo" type="number" min="0" step="0.001" value={form.minimumStock} error={errors.minimumStock} onChange={(event) => setForm({ ...form, minimumStock: event.target.value })} /><Input label="Stock máximo" type="number" min="0" step="0.001" value={form.maximumStock} error={errors.maximumStock} onChange={(event) => setForm({ ...form, maximumStock: event.target.value })} /><Input label="Tolerancia permitida (%)" type="number" min="0" max="100" step="0.01" value={form.tolerancePercent} error={errors.tolerancePercent} onChange={(event) => setForm({ ...form, tolerancePercent: event.target.value })} /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><CheckOption checked={form.trackLots} onChange={(checked) => setForm({ ...form, trackLots: checked, trackExpiry: checked ? form.trackExpiry : false })} title="Control por lote" text="Obliga a identificar cada recepción." /><CheckOption checked={form.trackExpiry} onChange={(checked) => setForm({ ...form, trackExpiry: checked, trackLots: checked || form.trackLots })} title="Control de vencimiento" text="Habilita sugerencia de despacho FEFO." error={errors.trackExpiry} /></div>
          </FormSection>

          {editing?.costHistory?.length ? <FormSection title="Historial de costo" description="Estos registros no cambian aunque edites el costo actual."><div className="space-y-2">{editing.costHistory.slice(0, 5).map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-park-bg p-3 text-sm"><span>{new Date(item.effectiveAt).toLocaleString("es-PE")}</span><b className="tabular-nums">S/ {Number(item.previousCost).toFixed(4)} → S/ {Number(item.newCost).toFixed(4)}</b><span>{item.valuationMethod}</span></div>)}</div></FormSection> : null}

          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={beginCreate}>Cancelar</Button><Button type="submit" loading={saving} icon={PackageCheck}>{editing ? "Guardar cambios" : "Crear producto"}</Button></div>
        </form>

        {editing && editing.status !== "ARCHIVED" ? <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="font-black text-red-800">Archivar producto</h3><p className="mt-1 text-pretty text-sm text-red-700">Se oculta de la operación, pero conserva lotes, movimientos, costos y auditoría.</p>{archiveMode ? <div className="mt-3 space-y-3"><Input label="Motivo obligatorio" value={archiveReason} error={errors.reason} onChange={(event) => setArchiveReason(event.target.value)} /><div className="flex gap-2"><Button variant="danger" loading={saving} icon={Archive} onClick={archiveProduct}>Confirmar archivado</Button><Button variant="secondary" onClick={() => setArchiveMode(false)}>Cancelar</Button></div></div> : <Button className="mt-3" variant="danger" icon={Archive} onClick={() => setArchiveMode(true)}>Archivar con motivo</Button>}</section> : null}
      </section>
    </div>
  </div>;
}

function ProductCard({ product, onEdit }) {
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3 min-w-0">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded object-cover border border-park-border" /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-park-bg text-park-muted"><PackageCheck size={20} /></div>}<div><p className="truncate text-xs font-bold text-park-muted">{product.code}</p><h3 className="text-balance font-black text-park-dark">{product.name}</h3><p className="mt-1 text-sm text-park-muted">{typeLabels[product.type]} · {product.category.name}</p></div></div><StatusBadge value={statusLabels[product.status] || product.status} /></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><Data label="Stock" value={`${Number(product.stock)} ${product.baseUnit.symbol}`} /><Data label="Costo" value={`S/ ${Number(product.cost).toFixed(4)}`} /><Data label="Compra" value={product.purchaseUnit?.name || "Sin definir"} /><Data label="Presentaciones" value={product.presentations.filter((item) => item.code !== "BASE").length} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2 text-xs font-semibold text-park-muted">{product.trackLots ? <span>Lotes</span> : null}{product.trackExpiry ? <span>FEFO</span> : null}</div><Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit}>Editar</Button></div></article>;
}

function ExampleCard({ icon: Icon, title, text }) { return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-park-green-soft text-park-green"><Icon size={20} /></div><div><h2 className="text-balance font-black text-park-dark">{title}</h2><p className="mt-1 text-pretty text-sm text-park-muted">{text}</p></div></div></article>; }
function FormSection({ title, description, children }) { return <fieldset className="rounded-xl border border-park-border p-4"><legend className="px-2 font-black text-park-dark">{title}</legend><p className="mb-4 text-pretty text-sm text-park-muted">{description}</p>{children}</fieldset>; }
function CheckOption({ checked, onChange, title, text, error }) { return <label className="rounded-xl border border-park-border p-4"><span className="flex items-center gap-2 font-black"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{title}</span><span className="mt-1 block text-pretty text-sm text-park-muted">{text}</span>{error ? <span className="mt-1 block text-xs font-semibold text-park-danger">{error}</span> : null}</label>; }
function Data({ label, value }) { return <div className="rounded-lg bg-park-bg p-2"><span className="block text-xs font-semibold text-park-muted">{label}</span><b className="tabular-nums text-park-dark">{value}</b></div>; }
