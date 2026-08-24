import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChefHat, CircleDollarSign, Package, Pencil, Scale, Search, UtensilsCrossed, Wine } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, Input, PageHeader, Tabs } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const areaNames = { RESTAURANTE: "Cocina / restaurante", BARTENDER: "Bar" };
const quantity = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const money = (value) => Number(value || 0).toLocaleString("es-PE", { style: "currency", currency: "PEN" });

export function InventoryPage() {
  const { user } = useAuth();
  if (user?.role === "ADMINISTRADOR") return <AdminInventory />;
  return <OperationalInventory area={user?.role === "BARTENDER" ? "BARTENDER" : "RESTAURANTE"} />;
}

function OperationalInventory({ area }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("STOCK");
  const [toast, setToast] = useState("");
  const productQuery = `/inventory?area=${area}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data: products = [], loading, reload: reloadProducts } = useFetch(productQuery, { initialData: [] });
  const { data: box, loading: loadingBox, reload: reloadBox } = useFetch(`/daily-inventory?area=${area}`, { initialData: null });
  const { data: dashboard = { recipes: [] } } = useFetch(`/inventory/production-dashboard?area=${area}`, { initialData: { recipes: [] } });
  const visibleLines = (box?.items || []).filter((item) => !search || item.productName.toLowerCase().includes(search.toLowerCase()));
  const available = (box?.items || []).filter((item) => Number(item.expectedQuantity) > 0);
  const low = (box?.items || []).filter((item) => item.lowStock);
  const Icon = area === "BARTENDER" ? Wine : ChefHat;

  if (loading || loadingBox) return <LoadingSpinner />;
  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow={areaNames[area]}
        title={`Caja diaria · ${new Date(`${box?.date}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`}
        description="Este es el inventario asignado a tu área hoy. Los pedidos descuentan sus proporciones y al final solo debes pesar lo que quedó."
        actions={<span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ${box?.status === "CLOSED" ? "bg-slate-100 text-slate-700" : "bg-park-green-soft text-park-green"}`}><Icon size={16} /> {box?.status === "CLOSED" ? "Caja cerrada" : "Caja abierta"}</span>}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Insumos disponibles" value={available.length} icon={Package} />
        <Metric label="Usados en pedidos" value={box?.summary?.usedLines || 0} icon={UtensilsCrossed} />
        <Metric label="Con stock bajo" value={low.length} icon={AlertTriangle} warning={low.length > 0} />
      </section>

      <div className="flex flex-col gap-3 rounded-card border border-park-border bg-white p-4 shadow-card md:flex-row md:items-end md:justify-between">
        <Tabs tabs={[{ value: "STOCK", label: "Inventario de hoy" }, { value: "RECIPES", label: "Recetas y proporciones" }, { value: "CLOSE", label: "Cerrar caja" }]} value={view} onChange={setView} />
        {view === "STOCK" ? <Input className="w-full md:max-w-sm" label="Buscar insumo" placeholder="Ej. pisco, arroz..." value={search} onChange={(event) => setSearch(event.target.value)} /> : null}
      </div>

      {view === "STOCK" ? <DailyStockGrid lines={visibleLines} closed={box?.status === "CLOSED"} /> : null}
      {view === "RECIPES" ? <RecipeGrid recipes={dashboard.recipes || []} products={products} /> : null}
      {view === "CLOSE" ? <DailyClose box={box} area={area} onClosed={async () => { await Promise.all([reloadBox(), reloadProducts()]); setToast("Caja cerrada. El saldo físico será el inventario inicial del siguiente día."); }} /> : null}

      <Alert tone="info" title="La regla diaria">
        Saldo anterior + asignación de Administración − proporciones de pedidos = saldo esperado. Al cerrar, el peso físico confirma el saldo que pasará al día siguiente.
      </Alert>
    </div>
  );
}

function DailyStockGrid({ lines, closed }) {
  if (!lines.length) return <EmptyState title="No hay insumos disponibles" description="Administración debe asignar stock a esta área." />;
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Stock disponible">
      {lines.map((line) => (
          <article className="rounded-card border border-park-border bg-white p-4 shadow-card" key={line.productId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="truncate text-base font-black text-park-dark">{line.productName}</h2><p className="text-sm text-park-muted">Inicio: {quantity(Number(line.openingQuantity) + Number(line.assignedQuantity || 0))} {line.unit}</p></div>
              <StatusBadge value={line.lowStock ? "STOCK_BAJO" : closed ? "CERRADO" : "DISPONIBLE"} />
            </div>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div><p className="text-xs font-semibold text-park-muted">{closed ? "Saldo físico" : "Disponible esperado"}</p><p className="tabular-nums text-3xl font-black text-park-green">{quantity(closed ? line.actualQuantity : line.expectedQuantity)} <span className="text-base">{line.unit}</span></p></div>
              <p className="text-right text-xs text-park-muted"><strong className="block tabular-nums text-park-dark">− {quantity(line.theoreticalUsed)} {line.unit}</strong> usado en pedidos</p>
            </div>
          </article>
      ))}
    </section>
  );
}

function RecipeGrid({ recipes, products }) {
  if (!recipes.length) return <EmptyState title="No hay recetas configuradas" description="Administración debe definir las proporciones de los platos o bebidas." />;
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Recetas y proporciones">
      {recipes.map((recipe) => {
        const portions = portionsAvailable(recipe, products);
        return (
          <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={recipe.id}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-balance text-lg font-black text-park-dark">{recipe.name}</h2><p className="text-sm text-park-muted">Proporción para 1 unidad vendida</p></div>
              <StatusBadge value={recipe.available ? "DISPONIBLE" : "SIN_STOCK"} />
            </div>
            <div className="mt-4 divide-y divide-park-border rounded-card border border-park-border">
              {(recipe.ingredients || []).map((line) => (
                <div className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm" key={line.inventoryId}>
                  <span className="font-semibold text-park-dark">{line.name}</span>
                  <strong className="tabular-nums text-park-green">{quantity(line.quantity)} {line.unit}</strong>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-park-muted">Con el stock disponible puedes preparar <strong className="tabular-nums text-park-dark">{Number.isFinite(portions) ? portions : 0} porciones</strong>.</p>
          </article>
        );
      })}
    </section>
  );
}

function DailyClose({ box, area, onClosed }) {
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  if (box?.status === "CLOSED") return <section className="rounded-card border border-park-border bg-white p-6 shadow-card"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-full bg-park-green-soft text-park-green"><CheckCircle2 size={22} /></span><div><h2 className="text-balance text-xl font-black text-park-dark">Caja cerrada correctamente</h2><p className="mt-1 text-pretty text-sm text-park-muted">El saldo físico quedó guardado y será la base del inventario del siguiente día. Diferencia valorizada: <strong>{money(box.varianceCost)}</strong>.</p></div></div></section>;
  const lines = box?.items || [];
  const completed = lines.length > 0 && lines.every((line) => counts[line.productId] !== undefined && counts[line.productId] !== "");
  async function close(event) {
    event.preventDefault();
    setBusy(true); setFailure("");
    try {
      await api("/daily-inventory/close", { method: "POST", body: { area, notes, counts: lines.map((line) => ({ productId: line.productId, actual: Number(counts[line.productId]) })) } });
      await onClosed();
    } catch (error) { setFailure(error.message); }
    finally { setBusy(false); }
  }
  return <form className="rounded-card border border-park-border bg-white p-5 shadow-card" onSubmit={close}><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-button bg-park-green-soft text-park-green"><Scale size={22} /></span><div><h2 className="text-balance text-xl font-black text-park-dark">Pesa lo que quedó</h2><p className="text-pretty text-sm text-park-muted">Ingresa el peso, volumen o conteo físico. El sistema comparará contra lo que debió quedar después de los pedidos.</p></div></div>{failure ? <div className="mt-4"><Alert tone="danger" title="No se pudo cerrar">{failure}</Alert></div> : null}<div className="mt-5 overflow-x-auto"><table className="min-w-[620px] w-full text-left text-sm"><thead className="bg-park-bg text-xs uppercase text-park-muted"><tr><th className="p-3">Insumo</th><th>Esperado</th><th className="w-48">Peso / conteo físico</th><th className="text-right">Diferencia</th></tr></thead><tbody className="divide-y divide-park-border">{lines.map((line) => { const actual = counts[line.productId]; const difference = actual === undefined || actual === "" ? null : Number(actual) - Number(line.expectedQuantity); return <tr key={line.productId}><td className="p-3 font-bold text-park-dark">{line.productName}</td><td className="tabular-nums">{quantity(line.expectedQuantity)} {line.unit}</td><td className="py-2 pr-3"><Input aria-label={`Cantidad física de ${line.productName}`} type="number" min="0" step="any" value={actual ?? ""} onChange={(event) => setCounts({ ...counts, [line.productId]: event.target.value })} required /></td><td className={`tabular-nums text-right font-black ${difference == null || Math.abs(difference) < 0.000001 ? "text-park-muted" : difference < 0 ? "text-park-danger" : "text-park-green"}`}>{difference == null ? "Pendiente" : `${difference > 0 ? "+" : ""}${quantity(difference)} ${line.unit}`}</td></tr>; })}</tbody></table></div><Input className="mt-4" label="Observación del cierre (opcional)" placeholder="Ej. Se dejó una botella abierta para mañana" value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-park-muted">Después del cierre no podrás cambiar los pesos.</p><Button loading={busy} disabled={!completed} icon={CheckCircle2}>Cerrar caja y guardar saldo</Button></div></form>;
}

function AdminInventory() {
  const [area, setArea] = useState("TODAS");
  const [allocationArea, setAllocationArea] = useState("RESTAURANTE");
  const [allocation, setAllocation] = useState({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", price: "", prepMinutes: "", active: true });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [allocationFailure, setAllocationFailure] = useState("");
  const [toast, setToast] = useState("");
  const query = `/admin/menu-items${area !== "TODAS" ? `?area=${area}` : ""}`;
  const { data: menu = [], loading, reload } = useFetch(query, { initialData: [] });
  const { data: dailyBox, loading: loadingBox, reload: reloadDailyBox } = useFetch(`/daily-inventory?area=${allocationArea}`, { initialData: null });
  const filtered = useMemo(() => menu.filter((item) => !search || `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase())), [menu, search]);

  function edit(item) {
    setEditing(item);
    setFailure("");
    setForm({ name: item.name, price: String(item.price), prepMinutes: String(item.prepMinutes || 0), active: item.active });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setFailure("");
    try {
      await api(`/admin/menu-items/${editing.id}`, { method: "PUT", body: { ...form, price: Number(form.price), prepMinutes: Number(form.prepMinutes) } });
      setToast("Producto y precio actualizados en todo el sistema.");
      setEditing(null); await reload();
    } catch (error) { setFailure(error.message); }
    finally { setSaving(false); }
  }

  async function assign(event) {
    event.preventDefault();
    setSaving(true); setAllocationFailure("");
    try {
      await api("/daily-inventory/assign", { method: "POST", body: { area: allocationArea, items: (dailyBox?.items || []).map((item) => ({ productId: item.productId, quantity: Number(allocation[item.productId] || 0) })) } });
      setAllocation({});
      setToast(`Asignación agregada a la caja diaria de ${areaNames[allocationArea]}.`);
      await reloadDailyBox();
    } catch (error) { setAllocationFailure(error.message); }
    finally { setSaving(false); }
  }

  if (loading || loadingBox) return <LoadingSpinner />;
  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader eyebrow="Administración" title="Productos, recetas y precios" description="Un único lugar para mantener los insumos y los precios que ve todo el hotel." actions={<div className="flex flex-wrap gap-2"><Button as={Link} to="/inventario/catalogo" variant="secondary" icon={Package}>Administrar insumos</Button><Button as={Link} to="/inventario/recetas" icon={ChefHat}>Editar recetas</Button></div>} />

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Productos de venta" value={menu.length} icon={UtensilsCrossed} />
        <Metric label="Restaurante" value={menu.filter((item) => item.area === "RESTAURANTE").length} icon={ChefHat} />
        <Metric label="Bar" value={menu.filter((item) => item.area === "BARTENDER").length} icon={Wine} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase text-park-gold">Asignación diaria</p><h2 className="text-balance text-xl font-black text-park-dark">Completar la caja del día</h2><p className="text-pretty text-sm text-park-muted">Agrega solo lo que entregas hoy al área. El saldo de ayer ya aparece como apertura.</p></div><Tabs tabs={[{ value: "RESTAURANTE", label: "Restaurante" }, { value: "BARTENDER", label: "Bar" }]} value={allocationArea} onChange={(value) => { setAllocationArea(value); setAllocation({}); setAllocationFailure(""); }} /></div>
        {allocationFailure ? <div className="mt-4"><Alert tone="danger" title="No se pudo asignar">{allocationFailure}</Alert></div> : null}
        {dailyBox?.status === "CLOSED" ? <div className="mt-4"><Alert tone="info" title="Caja ya cerrada">La caja de hoy ya fue cerrada. El saldo se usará mañana y no admite nuevas asignaciones.</Alert></div> : <form className="mt-5" onSubmit={assign}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(dailyBox?.items || []).map((item) => <label className="rounded-card border border-park-border bg-park-bg p-3" key={item.productId}><span className="block font-bold text-park-dark">{item.productName}</span><span className="mb-2 block text-xs text-park-muted">Saldo actual: {quantity(item.expectedQuantity)} {item.unit}</span><Input aria-label={`Asignar ${item.productName}`} type="number" min="0" step="any" placeholder={`Agregar ${item.unit}`} value={allocation[item.productId] || ""} onChange={(event) => setAllocation({ ...allocation, [item.productId]: event.target.value })} /></label>)}</div><div className="mt-4 flex justify-end"><Button loading={saving} disabled={!Object.values(allocation).some((value) => Number(value) > 0)} icon={Package}>Agregar a la caja de hoy</Button></div></form>}
      </section>

      <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Input label="Buscar plato o bebida" placeholder="Nombre o código" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Tabs tabs={[{ value: "TODAS", label: "Todos" }, { value: "RESTAURANTE", label: "Restaurante" }, { value: "BARTENDER", label: "Bar" }]} value={area} onChange={setArea} />
        </div>
      </section>

      <section className="overflow-x-auto rounded-card border border-park-border bg-white shadow-card">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-park-bg text-xs uppercase text-park-muted"><tr><th className="p-4">Producto</th><th>Área</th><th>Proporciones</th><th>Precio actual</th><th>Estado</th><th className="pr-4 text-right">Acción</th></tr></thead>
          <tbody className="divide-y divide-park-border">
            {filtered.map((item) => <tr key={item.id}><td className="p-4"><strong className="block text-park-dark">{item.name}</strong><span className="text-xs text-park-muted">{item.code}</span></td><td>{areaNames[item.area]}</td><td>{item.ingredients?.length || 0} insumos</td><td className="tabular-nums font-black text-park-green">{money(item.price)}</td><td><StatusBadge value={item.active ? "ACTIVO" : "INACTIVO"} /></td><td className="pr-4 text-right"><Button size="sm" variant="secondary" icon={Pencil} onClick={() => edit(item)}>Editar</Button></td></tr>)}
          </tbody>
        </table>
        {!filtered.length ? <div className="p-6"><EmptyState icon={Search} title="Sin resultados" description="Prueba con otro nombre o cambia el área." /></div> : null}
      </section>

      {editing ? <section className="rounded-card border border-park-green bg-white p-5 shadow-card"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-park-gold">Edición global</p><h2 className="text-balance text-xl font-black text-park-dark">{editing.name}</h2><p className="text-pretty text-sm text-park-muted">El nuevo precio se aplicará a la carta y a los próximos pedidos.</p></div><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cerrar</Button></div>{failure ? <div className="mt-4"><Alert tone="danger" title="No se pudo guardar">{failure}</Alert></div> : null}<form className="mt-5 grid gap-3 md:grid-cols-4" onSubmit={save}><Input label="Nombre" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Input label="Precio de venta" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /><Input label="Tiempo de preparación (min)" type="number" min="0" value={form.prepMinutes} onChange={(event) => setForm({ ...form, prepMinutes: event.target.value })} /><label className="flex h-10 items-center gap-2 self-end rounded-input border border-park-border px-3 font-semibold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Disponible para la venta</label><div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-bold text-park-green underline" to="/inventario/recetas">Editar sus proporciones en Recetas</Link><Button loading={saving} icon={CircleDollarSign}>Guardar en todo el sistema</Button></div></form></section> : null}
    </div>
  );
}

function Metric({ label, value, icon: Icon, warning = false }) {
  return <article className={`rounded-card border bg-white p-4 shadow-card ${warning ? "border-amber-300" : "border-park-border"}`}><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-button ${warning ? "bg-amber-50 text-amber-700" : "bg-park-green-soft text-park-green"}`}><Icon size={19} /></span><div><strong className="tabular-nums text-2xl text-park-dark">{value}</strong><p className="text-sm text-park-muted">{label}</p></div></div></article>;
}

function portionsAvailable(recipe, products) {
  const values = (recipe.ingredients || []).map((line) => {
    const product = products.find((item) => Number(item.id) === Number(line.inventoryId));
    const available = Math.max(0, Number(product?.stock || 0) - Number(product?.reserved || 0));
    return Number(line.quantity) > 0 ? Math.floor(available / Number(line.quantity)) : Infinity;
  });
  return values.length ? Math.min(...values) : 0;
}
