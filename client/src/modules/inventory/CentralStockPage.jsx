import { useMemo, useState } from "react";
import { ArrowRight, Boxes, PackagePlus, RefreshCw, Search, Send, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";

const q = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const warehouseLabels = { GENERAL: "Almacén general", RESTAURANTE: "Restaurante", BARTENDER: "Bar", TRANSIT: "En tránsito" };

export function CentralStockPage() {
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("ALL");
  const [status, setStatus] = useState("AVAILABLE");
  const { data = { warehouses: [], stock: [] }, loading, error, reload } = useFetch("/transfers/references", { initialData: { warehouses: [], stock: [] } });
  const { data: purchasing = { products: [] }, loading: loadingCatalog } = useFetch("/purchasing/references", { initialData: { products: [] } });
  const products = useMemo(() => aggregate(data.stock || [], purchasing.products || []), [data.stock, purchasing.products]);
  const visible = products.filter((product) => {
    const matchesSearch = !search || product.name.toLowerCase().includes(search.toLowerCase());
    const matchesWarehouse = warehouse === "ALL" || product.locations.some((row) => row.warehouseCode === warehouse && Number(row.available) > 0);
    const total = product.locations.reduce((sum, row) => sum + Number(row.available), 0);
    const matchesStatus = status === "ALL" || (status === "AVAILABLE" && total > 0) || (status === "EMPTY" && total <= 0) || (status === "EXPIRING" && product.expiring);
    return matchesSearch && matchesWarehouse && matchesStatus;
  });
  const locationSummary = (data.warehouses || []).filter((row) => ["GENERAL", "RESTAURANTE", "BARTENDER"].includes(row.code)).map((row) => ({ ...row, count: new Set((data.stock || []).filter((stock) => stock.warehouseCode === row.code && Number(stock.available) > 0).map((stock) => stock.productId)).size }));

  if (loading || loadingCatalog) return <LoadingSpinner />;
  if (error) return <EmptyState title="No se pudieron cargar las existencias" description={error.message} />;
  return <div className="space-y-5">
    <PageHeader eyebrow="Inventario · consulta central" title="Ver existencias" description="Busca un insumo y revisa cuánto hay en el almacén general, Restaurante y Bar sin mezclar unidades." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" icon={RefreshCw} onClick={reload}>Actualizar</Button><Button as={Link} to="/compras" icon={PackagePlus}>Registrar compra</Button></div>} />

    <section className="grid gap-3 md:grid-cols-3">
      {locationSummary.map((row) => <button type="button" key={row.id} onClick={() => setWarehouse(row.code)} className={`rounded-card border bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 ${warehouse === row.code ? "border-park-gold ring-2 ring-park-gold/20" : "border-park-border"}`}><span className="grid size-9 place-items-center rounded-xl bg-park-green-soft text-park-green"><Warehouse size={18} /></span><strong className="mt-3 block text-2xl text-park-dark">{row.count}</strong><span className="text-sm font-bold text-park-dark">{warehouseLabels[row.code] || row.name}</span><span className="block text-xs text-park-muted">productos con disponibilidad</span></button>)}
    </section>

    <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <div className="grid gap-3 md:grid-cols-[1fr_240px_240px]">
        <Input label="Buscar producto" placeholder="Escribe pisco, arroz, limón..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select label="Ubicación" value={warehouse} onChange={(event) => setWarehouse(event.target.value)}><option value="ALL">Todas las ubicaciones</option>{locationSummary.map((row) => <option key={row.id} value={row.code}>{warehouseLabels[row.code] || row.name}</option>)}</Select>
        <Select label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="AVAILABLE">Con existencias</option><option value="EXPIRING">Próximos a vencer</option><option value="EMPTY">Sin existencias</option><option value="ALL">Todos</option></Select>
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-park-dark">{visible.length} productos encontrados</h2><p className="text-sm text-park-muted">Las cantidades se muestran en la unidad real de cada producto.</p></div><Button as={Link} to="/transferencias" variant="secondary" icon={Send}>Enviar a un área</Button></div>

    {!visible.length ? <EmptyState icon={Search} title="No encontramos productos" description="Cambia los filtros o registra una compra si el producto aún no existe." /> : <section className="grid gap-3 lg:grid-cols-2">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</section>}
  </div>;
}

function aggregate(stock, catalog) {
  const map = new Map();
  catalog.forEach((row) => map.set(row.id, { id: row.id, name: row.name, unit: row.baseUnitSymbol, locations: [], expiring: false }));
  stock.forEach((row) => {
    if (!map.has(row.productId)) map.set(row.productId, { id: row.productId, name: row.productName, unit: row.unitSymbol, locations: [], expiring: false });
    const product = map.get(row.productId);
    product.locations.push(row);
    if (row.expiresOn) {
      const days = (new Date(row.expiresOn).getTime() - Date.now()) / 86400000;
      if (days >= 0 && days <= 7 && Number(row.available) > 0) product.expiring = true;
    }
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ProductCard({ product }) {
  const total = product.locations.reduce((sum, row) => sum + Number(row.available), 0);
  const byWarehouse = Object.values(product.locations.reduce((acc, row) => {
    const key = row.warehouseCode;
    if (!acc[key]) acc[key] = { code: key, available: 0, committed: 0 };
    acc[key].available += Number(row.available);
    acc[key].committed += Number(row.committed);
    return acc;
  }, {}));
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card transition hover:border-park-gold">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-park-green-soft text-park-green"><Boxes size={19} /></span><div><h3 className="font-black text-park-dark">{product.name}</h3><p className="text-xs text-park-muted">Total disponible en todas las ubicaciones</p></div></div><div className="text-right"><strong className={`block text-xl ${total > 0 ? "text-park-green" : "text-park-danger"}`}>{q(total)} {product.unit}</strong><span className="text-xs text-park-muted">{product.locations.length} lote(s)</span></div></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">{["GENERAL", "RESTAURANTE", "BARTENDER"].map((code) => { const row = byWarehouse.find((item) => item.code === code); return <div key={code} className="rounded-xl bg-park-bg p-3"><span className="block text-xs text-park-muted">{warehouseLabels[code]}</span><strong className="text-sm text-park-dark">{q(row?.available)} {product.unit}</strong>{Number(row?.committed) > 0 ? <span className="block text-[11px] text-amber-700">{q(row.committed)} comprometido</span> : null}</div>; })}</div>
    <details className="mt-3 border-t border-park-border pt-3"><summary className="cursor-pointer text-xs font-black text-park-green">Ver lotes y vencimientos</summary><div className="mt-2 space-y-1">{product.locations.filter((row) => Number(row.available) !== 0).map((row, index) => <div key={`${row.warehouseId}-${row.lotId || index}`} className="flex justify-between gap-3 rounded-lg bg-park-bg px-3 py-2 text-xs"><span>{warehouseLabels[row.warehouseCode] || row.warehouseCode} · {row.lotCode ? `lote ${row.lotCode}` : "sin lote"}</span><strong>{q(row.available)} {product.unit}{row.expiresOn ? ` · vence ${String(row.expiresOn).slice(0, 10)}` : ""}</strong></div>)}</div></details>
    <div className="mt-3 flex justify-end"><Link to="/transferencias" className="inline-flex items-center gap-1 text-xs font-black text-park-green">Distribuir este producto <ArrowRight size={14} /></Link></div>
  </article>;
}
