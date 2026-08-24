import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, ChefHat, Clock3, Gauge, Search, ShieldAlert, Utensils } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { LoadingSpinner } from "./LoadingSpinner";
import { Input } from "./ui";
import { useFetch } from "../hooks/useFetch";

const qty = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });

export function OperationalRecipeManual({ area }) {
  const { data: recipes = [], loading, error } = useFetch(`/operational-recipes/${area}`, { initialData: [] });
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => recipes.filter((recipe) => !search || `${recipe.name} ${recipe.code}`.toLowerCase().includes(search.toLowerCase())), [recipes, search]);
  if (loading) return <LoadingSpinner />;
  return <div className="space-y-4">
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-park-green-soft text-park-green"><BookOpen size={22}/></span><div><h2 className="font-black text-park-dark">Manual operativo vigente</h2><p className="text-sm text-park-muted">La misma versión que ves aquí reserva y descuenta los insumos al entregar. Las cantidades se calculan por porción y el stock disponible considera lo ya reservado.</p></div></div>
    </section>
    {error ? <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div> : null}
    <div className="max-w-xl"><Input icon={Search} placeholder="Buscar plato o bebida..." value={search} onChange={(event) => setSearch(event.target.value)}/></div>
    {!filtered.length ? <EmptyState title="Sin recetas vigentes" description="Administración debe crear y activar la ficha técnica de los productos de esta área."/> : <div className="grid gap-4 xl:grid-cols-2">{filtered.map((recipe) => <RecipeCard recipe={recipe} key={recipe.id}/>)}</div>}
  </div>;
}

function RecipeCard({ recipe }) {
  const manual = recipe.manual || {};
  const steps = Array.isArray(manual.steps) ? manual.steps : String(manual.steps || "").split("\n").map((value) => value.trim()).filter(Boolean);
  return <article className="overflow-hidden rounded-card border border-park-border bg-white shadow-card">
    <header className="bg-gradient-to-r from-park-dark to-park-green p-5 text-white">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-park-gold">{recipe.code} · versión {recipe.version}</p><h2 className="mt-1 text-xl font-black">{recipe.name}</h2><p className="mt-1 text-xs text-white/70">Rendimiento base: {qty(recipe.yieldQuantity)} {recipe.yieldUnitSymbol}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${recipe.availablePortions > 5 ? "bg-emerald-400/20 text-emerald-100" : "bg-amber-400/20 text-amber-100"}`}>{recipe.availablePortions} porciones</span></div>
    </header>
    <div className="space-y-5 p-5">
      {manual.description ? <p className="text-sm leading-relaxed text-park-muted">{manual.description}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Fact icon={Clock3} label="Tiempo" value={manual.prepMinutes ? `${manual.prepMinutes} min` : "Por definir"}/><Fact icon={Gauge} label="Temperatura" value={manual.temperature || "Por definir"}/><Fact icon={Utensils} label="Presentación" value={manual.plating || "Estándar"}/><Fact icon={ShieldAlert} label="Alérgenos" value={manual.allergens || "Revisar"}/></div>
      <section><h3 className="mb-2 flex items-center gap-2 text-sm font-black text-park-dark"><ChefHat size={16}/> Ingredientes por porción</h3><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead className="bg-park-bg text-left text-park-muted"><tr><th className="p-2">Ingrediente</th><th>Uso exacto</th><th>Disponible</th><th>Rinde</th><th>Tipo</th></tr></thead><tbody>{recipe.ingredients.map((line) => <tr className="border-b border-park-border" key={line.productId}><td className="p-2 font-bold text-park-dark">{line.productName}</td><td>{qty(line.requiredPerPortion)} {line.baseUnitSymbol}</td><td>{qty(line.availableBaseQuantity)} {line.baseUnitSymbol}</td><td className={line.availablePortions <= 5 ? "font-black text-amber-700" : "font-black text-park-green"}>{line.availablePortions}</td><td>{line.consumptionMode === "PREPRODUCED" ? "Preparado previamente" : "Uso directo"}</td></tr>)}</tbody></table></div></section>
      {recipe.limitingIngredient ? <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={15}/><span>El rendimiento actual está limitado por <b>{recipe.limitingIngredient.productName}</b>: alcanza para {recipe.limitingIngredient.availablePortions} porciones.</span></div> : null}
      <section><h3 className="mb-2 text-sm font-black text-park-dark">Preparación paso a paso</h3>{steps.length ? <ol className="space-y-2">{steps.map((step, index) => <li className="flex gap-3 text-sm text-park-muted" key={`${step}-${index}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-park-green text-xs font-black text-white">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol> : <p className="rounded-lg bg-park-bg p-3 text-sm text-park-muted">Administración debe completar los pasos de preparación de esta ficha.</p>}</section>
      {manual.equipment ? <p className="text-xs text-park-muted"><b className="text-park-dark">Equipo:</b> {manual.equipment}</p> : null}
    </div>
  </article>;
}

function Fact({ icon: Icon, label, value }) { return <div className="rounded-lg bg-park-bg p-3"><Icon className="mb-2 text-park-green" size={16}/><span className="block text-[10px] font-black uppercase tracking-wide text-park-muted">{label}</span><strong className="mt-1 block text-xs text-park-dark">{value}</strong></div>; }
