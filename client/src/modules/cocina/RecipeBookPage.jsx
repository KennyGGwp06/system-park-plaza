// Recetas › Recetario. Fichas técnicas de la cocina (solo lectura): ingredientes con cantidad exacta por porción,
// calculadora para N porciones, emplatado, equipo y alérgenos, y cuántas porciones alcanzan con el stock actual.
// Datos: GET /api/technical-recipes/manual/RESTAURANTE|BARTENDER (el servidor ya no envía costos ni precios a la cocina).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Search } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, Tag } from "../recepcion/rxkit";
import { useKitchen } from "./KitchenShell";

const qty = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const stockTone = (portions) => (portions <= 0 ? ["Sin stock", "crit"] : portions <= 5 ? [`${portions} porciones`, "crit"] : portions <= 20 ? [`${portions} porciones`, "warn"] : [`${portions.toLocaleString("es-PE")} porciones`, "ok"]);

export function RecipeBookPage() {
  const { station, recipes, recipesLoading } = useKitchen();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("todas");
  const selected = recipes.find((row) => String(row.id) === params.get("ver")) || null;
  const rows = useMemo(() => recipes.filter((row) => (!text.trim() || `${row.name} ${row.code} ${(row.ingredients || []).map((item) => item.productName).join(" ")}`.toLowerCase().includes(text.trim().toLowerCase()))
    && (filter === "todas" || (filter === "sin" ? Number(row.availablePortions) <= 0 : Number(row.availablePortions) > 0 && Number(row.availablePortions) <= 20))).sort((a, b) => a.name.localeCompare(b.name, "es")), [recipes, text, filter]);
  const without = recipes.filter((row) => Number(row.availablePortions) <= 0).length;
  const low = recipes.filter((row) => Number(row.availablePortions) > 0 && Number(row.availablePortions) <= 20).length;
  if (recipesLoading) return <LoadingSpinner label="Cargando el recetario…" />;

  return <>
    <PageHead title="Recetario">Fichas técnicas vigentes. Las cantidades son exactas por porción; solo el dueño puede cambiarlas.</PageHead>
    <section className="rx-card">
      <div className="rx-filters">
        <div className="rx-search" style={{ margin: 0, width: 320 }}><label style={{ background: "#fff" }}><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder={`${station.item === "plato" ? "Plato" : "Bebida"} o ingrediente`} aria-label="Buscar receta" /></label></div>
        <div className="rx-seg">
          <button type="button" className={filter === "todas" ? "is-on" : ""} onClick={() => setFilter("todas")}>Todas<i>{recipes.length}</i></button>
          <button type="button" className={filter === "bajo" ? "is-on" : ""} onClick={() => setFilter("bajo")}>Stock bajo<i>{low}</i></button>
          <button type="button" className={filter === "sin" ? "is-on" : ""} onClick={() => setFilter("sin")}>Sin stock<i>{without}</i></button>
        </div>
      </div>
      {rows.length ? <div className="kd-recipes">{rows.map((row) => { const [label, tone] = stockTone(Number(row.availablePortions || 0)); return <button key={row.id} type="button" className="kd-recipe" onClick={() => setParams({ ver: String(row.id) })}>
        <b>{row.name}</b>
        <small>{row.ingredients?.length || 0} ingredientes · rinde {qty(row.yieldQuantity)} {row.yieldUnitSymbol}{row.manual?.prepMinutes ? ` · ${row.manual.prepMinutes} min` : ""}</small>
        <span className="row"><small>v{row.version}</small><Tag tone={tone}>{label}</Tag></span>
      </button>; })}</div> : <Empty icon={BookOpen} title="Ninguna receta coincide" />}
    </section>
    <RecipeDrawer station={station} recipe={selected} onClose={() => setParams({})} />
  </>;
}

function RecipeDrawer({ station, recipe, onClose }) {
  const [portions, setPortions] = useState(1);
  if (!recipe) return null;
  const factor = Math.max(1, Number(portions || 1)) / Math.max(1, Number(recipe.yieldQuantity || 1));
  const [label, tone] = stockTone(Number(recipe.availablePortions || 0));
  const manual = recipe.manual || {};
  return <Drawer open onClose={() => { setPortions(1); onClose(); }} eyebrow={`Receta v${recipe.version} · ${recipe.code}`} title={recipe.name} subtitle={`Rinde ${qty(recipe.yieldQuantity)} ${recipe.yieldUnitSymbol}${manual.prepMinutes ? ` · ${manual.prepMinutes} min de preparación` : ""}`}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Tag tone={tone}>{label} con el stock actual</Tag>{recipe.limitingIngredient?.productName ? <Tag>Limita: {recipe.limitingIngredient.productName}</Tag> : null}</div>
    <section className="rx-sec"><h3>Ingredientes</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ fontSize: 13, color: "var(--muted)" }}>Calcular para</span><input className="rx-input kd-count-input" type="number" min="1" value={portions} onChange={(event) => setPortions(event.target.value)} aria-label="Porciones" /><span style={{ fontSize: 13, color: "var(--muted)" }}>porción(es)</span></div>
      <div className="kd-weigh">{(recipe.ingredients || []).map((item) => <div key={item.productId}>
        <span><b style={{ fontWeight: 500 }}>{item.productName}</b><small>{qty(item.quantity)} {item.unitSymbol} por porción{Number(item.tolerancePercent) ? ` · tolerancia ±${qty(item.tolerancePercent)} %` : ""}{Number(item.technicalWastePercent) ? ` · merma técnica ${qty(item.technicalWastePercent)} %` : ""}{Number(item.availablePortions) <= 0 ? ` · sin stock en ${station.stock}` : ""}</small></span>
        <strong>{qty(Number(item.requiredPerPortion ?? item.baseQuantity) * factor)} {item.baseUnitSymbol}</strong>
      </div>)}</div>
    </section>
    <section className="rx-sec"><h3>Preparación y servicio</h3>
      <dl className="rx-dl">
        <div style={{ gridColumn: "1 / -1" }}><dt>Indicaciones</dt><dd style={{ fontWeight: 400 }}>{manual.description || "Sin indicaciones registradas."}</dd></div>
        <div><dt>{station.area === "BARTENDER" ? "Presentación" : "Emplatado"}</dt><dd>{manual.plating || "—"}</dd></div>
        <div><dt>Equipo</dt><dd>{manual.equipment || "—"}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt>Alérgenos</dt><dd>{manual.allergens || "—"}</dd></div>
      </dl>
    </section>
    <Alert tone="info">Si una cantidad no coincide con lo que se usa en la práctica, avísalo al dueño: él actualiza la receta y el descuento de insumos.</Alert>
  </Drawer>;
}
