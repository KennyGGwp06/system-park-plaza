// Catálogo y precios › Carta del cliente. Todos los platos y bebidas: precio, foto, descripción, en qué servicios se
// pueden pedir y si la venta está activa. Un producto solo se vende con su receta vigente y stock; aquí se ve cuántas
// porciones alcanzan y qué insumo lo limita. Rutas: GET/POST /api/admin/menu-items, PUT /:id, PATCH /:id/sales-enabled,
// POST/DELETE /:id/image.
import { useMemo, useState } from "react";
import { ImagePlus, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, SearchBox, Seg, Tag, soles, useBusy, useOpenId, useToast } from "./kit";
import { imageSrc, uploadImage } from "./RoomsCatalogPage";

const SERVICES = [["HOSPEDAJE", "Hospedaje"], ["PISCINA", "Piscina"], ["MIRADOR", "Mirador"], ["TERRAZA", "Terraza"], ["EVENTOS", "Eventos"]];
const stock = (row) => (!row.recipeVersion ? ["Sin receta", "crit"] : Number(row.availablePortions) <= 0 ? ["Sin stock", "crit"] : Number(row.availablePortions) <= 10 ? [`${row.availablePortions} porciones`, "warn"] : [`${row.availablePortions} porciones`, "ok"]);

export function MenuCatalogPage({ navigate }) {
  const menu = useFetch("/admin/menu-items", { initialData: [], realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [area, setArea] = useState("TODOS");
  const [filter, setFilter] = useState("todos");
  const [text, setText] = useState("");
  const rows = (Array.isArray(menu.data) ? menu.data : menu.data?.items || []).filter((row) => row.active !== false || filter === "archivados");
  const inArea = rows.filter((row) => area === "TODOS" || row.area === area);
  const selling = inArea.filter((row) => row.salesEnabled === true);
  const shown = useMemo(() => inArea.filter((row) => (filter === "todos" || (filter === "venta" ? row.salesEnabled === true : filter === "pausa" ? row.salesEnabled !== true && row.active !== false : filter === "sinstock" ? stock(row)[1] === "crit" : row.active === false)) && (!text.trim() || `${row.name} ${row.category}`.toLowerCase().includes(text.trim().toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name, "es")), [inArea, filter, text]);
  const toggle = (row) => run(async () => { await api(`/admin/menu-items/${row.id}/sales-enabled`, { method: "PATCH", body: { salesEnabled: row.salesEnabled !== true } }); show(`${row.name}: venta ${row.salesEnabled === true ? "pausada" : "activa"}.`); menu.reload(); });
  const selected = rows.find((row) => String(row.id) === openId) || null;
  if (menu.loading && !rows.length) return <LoadingSpinner label="Cargando la carta…" />;
  return <>
    <PageHead title="Carta del cliente" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nuevo producto</button>}>Lo que el cliente puede pedir desde su app. La venta se activa aquí; un producto sin receta vigente o sin stock no se puede vender aunque esté activo.</PageHead>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={UtensilsCrossed} label="En venta" value={selling.length} detail={`de ${inArea.length} en la carta`} />
      <Kpi label="Con venta pausada" value={inArea.filter((row) => row.salesEnabled !== true).length} detail="No aparecen para el cliente" />
      <Kpi label="Sin receta o sin stock" value={inArea.filter((row) => stock(row)[1] === "crit").length} detail="No se pueden vender" />
      <Kpi label="Pocas porciones" value={inArea.filter((row) => stock(row)[1] === "warn").length} detail="10 o menos" />
    </div>
    <Card title="Productos" flush tools={<><SearchBox value={text} onChange={setText} placeholder="Nombre o categoría" width={200} /><Seg value={area} onChange={setArea} options={[["TODOS", "Todo"], ["RESTAURANTE", "Cocina"], ["BARTENDER", "Bar"]]} /><Seg value={filter} onChange={setFilter} options={[["todos", "Todos"], ["venta", "En venta"], ["pausa", "Pausados"], ["sinstock", "No vendibles"]]} /></>}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Producto</th><th>Área</th><th>Se pide en</th><th>Receta y stock</th><th className="n">Precio</th><th>Venta</th></tr></thead>
        <tbody>{shown.map((row) => { const [label, tone] = stock(row); return <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><div style={{ display: "flex", gap: 8, alignItems: "center" }}><img className="ow-thumb" src={imageSrc(row.image)} alt="" /><div><b style={{ fontWeight: 600 }}>{row.name}</b><small className="mut" style={{ display: "block" }}>{row.category}</small></div></div></td>
          <td>{row.area === "BARTENDER" ? "Bar" : "Cocina"}</td><td className="mut">{(row.availableFor || []).map((code) => SERVICES.find(([k]) => k === code)?.[1] || code).join(", ") || "—"}</td>
          <td><Tag tone={tone}>{label}</Tag>{row.limitingIngredient?.productName && tone !== "ok" ? <small className="mut" style={{ display: "block" }}>Limita: {row.limitingIngredient.productName}</small> : null}</td>
          <td className="n">{soles(row.price)}</td>
          <td onClick={(event) => event.stopPropagation()}><button type="button" className={`ow-switch ${row.salesEnabled === true ? "is-on" : ""}`} disabled={busy} onClick={() => toggle(row)} aria-label={row.salesEnabled === true ? "Pausar venta" : "Activar venta"} /></td>
        </tr>; })}</tbody></table></div> : <Empty icon={UtensilsCrossed} title="Ningún producto con este filtro" />}
    </Card>
    {creating || selected ? <ProductDrawer product={creating ? null : selected} navigate={navigate} onClose={() => { setCreating(false); open(null); }} onSaved={() => { setCreating(false); menu.reload(); }} /> : null}
  </>;
}

function ProductDrawer({ product, navigate, onClose, onSaved }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState({ name: product?.name || "", code: product?.code || "", area: product?.area || "RESTAURANTE", category: product?.category || "", price: String(product?.price ?? ""), description: product?.description || "", prepMinutes: String(product?.prepMinutes ?? 15), tags: (product?.tags || []).join(", "), availableFor: product?.availableFor || ["HOSPEDAJE", "PISCINA", "MIRADOR", "EVENTOS"], active: product?.active !== false, image: product?.image || "" });
  const set = (patch) => setForm({ ...form, ...patch });
  const toggleService = (code) => set({ availableFor: form.availableFor.includes(code) ? form.availableFor.filter((c) => c !== code) : [...form.availableFor, code] });
  const save = () => { if (!form.name.trim() || !(Number(form.price) >= 0)) { setError("Pon el nombre y el precio."); return; } run(async () => { const body = { ...form, price: Number(form.price), prepMinutes: Number(form.prepMinutes || 0), tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) }; await api(product ? `/admin/menu-items/${product.id}` : "/admin/menu-items", { method: product ? "PUT" : "POST", body }); show(product ? "Producto actualizado." : "Producto creado con la venta pausada: crea su receta y actívalo."); onSaved(); if (!product) onClose(); }); };
  const photo = (file) => run(async () => { await uploadImage(`/admin/menu-items/${product.id}/image`, file); show("Foto guardada."); onSaved(); });
  const removePhoto = () => run(async () => { await api(`/admin/menu-items/${product.id}/image`, { method: "DELETE" }); show("Foto quitada."); onSaved(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={product ? `${product.code} · ${product.area === "BARTENDER" ? "Bar" : "Cocina"}` : "Nuevo producto"} title={product ? product.name : "Producto de la carta"} subtitle={product ? `${product.recipeVersion ? `Receta v${product.recipeVersion}` : "Sin receta vigente"}${product.recipeCost ? ` · costo ${soles(product.recipeCost)}` : ""}` : "Se crea con la venta pausada"}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cerrar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{product ? "Guardar" : "Crear"}</button></>}>
    {product ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}><img className="ow-thumb" style={{ width: 120, height: 80 }} src={imageSrc(product.image)} alt="" /><label className="rx-btn rx-btn--sm" style={{ position: "relative" }}><ImagePlus />Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(event) => photo(event.target.files?.[0])} /></label>{product.image && !product.image.includes("placeholder") ? <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={removePhoto}><Trash2 />Quitar</button> : null}</div> : null}
    <div className="ow-form" style={{ marginTop: 10 }}>
      <Field label="Nombre" full><input className="rx-input" value={form.name} onChange={(event) => set({ name: event.target.value })} /></Field>
      {!product ? <Field label="Área"><select className="rx-select" value={form.area} onChange={(event) => set({ area: event.target.value })}><option value="RESTAURANTE">Cocina</option><option value="BARTENDER">Bar</option></select></Field> : null}
      {!product ? <Field label="Código"><input className="rx-input rx-mono" value={form.code} onChange={(event) => set({ code: event.target.value.toUpperCase() })} placeholder="Se genera si lo dejas vacío" /></Field> : null}
      <Field label="Categoría"><input className="rx-input" value={form.category} onChange={(event) => set({ category: event.target.value })} placeholder="Ej. Platos regionales" /></Field>
      <Field label="Precio (S/)"><input className="rx-input rx-mono" type="number" min="0" step="0.5" value={form.price} onChange={(event) => set({ price: event.target.value })} /></Field>
      <Field label="Minutos de preparación"><input className="rx-input rx-mono" type="number" min="0" value={form.prepMinutes} onChange={(event) => set({ prepMinutes: event.target.value })} /></Field>
      <Field label="Etiquetas (separadas por coma)"><input className="rx-input" value={form.tags} onChange={(event) => set({ tags: event.target.value })} placeholder="Regional, Picante" /></Field>
      <Field label="Descripción que ve el cliente" full><textarea className="rx-input" style={{ height: 70, paddingTop: 8 }} value={form.description} onChange={(event) => set({ description: event.target.value })} /></Field>
    </div>
    <section className="rx-sec"><h3>Se puede pedir en</h3><div className="ow-toolbar">{SERVICES.map(([code, name]) => <label key={code} className="rx-btn rx-btn--sm" style={{ background: form.availableFor.includes(code) ? "var(--blue-soft)" : undefined }}><input type="checkbox" checked={form.availableFor.includes(code)} onChange={() => toggleService(code)} /> {name}</label>)}</div></section>
    {product ? <section className="rx-sec"><h3>Receta y stock</h3><p style={{ margin: 0 }}>{product.recipeVersion ? `Receta vigente v${product.recipeVersion}. Alcanza para ${product.availablePortions ?? 0} porción(es)${product.limitingIngredient?.productName ? `; limita ${product.limitingIngredient.productName}` : ""}.` : "Aún no tiene receta vigente: no se puede vender."}</p><button className="rx-btn rx-btn--sm" type="button" style={{ marginTop: 8 }} onClick={() => navigate(product.area === "BARTENDER" ? "bar" : "restaurante", "recetas")}>Ver recetas</button></section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
