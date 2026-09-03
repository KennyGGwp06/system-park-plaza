import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Boxes, ChevronDown, ClipboardCheck, Download, PackagePlus, RefreshCw, Send, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";

const money = (value) => Number(value || 0).toLocaleString("es-PE", { style: "currency", currency: "PEN" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export function InventoryAdminDashboardPage() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filters, setFilters] = useState({ date: today(), area: "", warehouse: "", product: "", lot: "", supplier: "", shift: "" });
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""));
  const emptyRefs = { warehouses: [], products: [], lots: [], suppliers: [], areas: [] };
  const emptyDashboard = { metrics: {}, byWarehouse: [], alerts: {}, audit: [] };
  const { data: references = emptyRefs, loading: loadingReferences } = useFetch("/inventory-admin/references", { initialData: emptyRefs });
  const { data = emptyDashboard, loading, reload } = useFetch(`/inventory-admin/dashboard?${query}`, { initialData: emptyDashboard });
  const metrics = data.metrics || {};
  const attention = useMemo(() => [
    { label: "Productos por reponer", value: data.alerts?.critical?.length || 0, help: "Llegaron al mínimo configurado", href: "/inventario", icon: PackagePlus },
    { label: "Lotes por vencer", value: data.alerts?.expiry?.length || 0, help: "Vencen durante los próximos 7 días", href: "/inventario", icon: AlertTriangle },
    { label: "Cierres por revisar", value: metrics.closuresPending || 0, help: "Restaurante o Bar esperan aprobación", href: "/inventario/turnos", icon: ClipboardCheck },
    { label: "Envíos con diferencia", value: metrics.transferDifferences || 0, help: "Faltantes o sobrantes por resolver", href: "/transferencias", icon: Send },
  ], [data.alerts, metrics]);
  const pendingTotal = attention.reduce((sum, item) => sum + Number(item.value || 0), 0);

  function clearFilters() {
    setFilters({ date: today(), area: "", warehouse: "", product: "", lot: "", supplier: "", shift: "" });
  }
  function exportCsv() {
    const rows = [["Indicador", "Valor"], ["Valor del inventario", metrics.totalValue], ["Merma de hoy", metrics.wasteDay], ["Merma del mes", metrics.wasteMonth], ["Diferencias por revisar", metrics.difference], [], ["Almacén", "Valor"], ...(data.byWarehouse || []).map((row) => [row.name, row.value])];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `park-plaza-inventario-${filters.date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  if (loading || loadingReferences) return <LoadingSpinner />;

  return <div className="space-y-5">
    <PageHeader eyebrow="Inventario · vista del dueño" title="Inventario de hoy" description="Aquí ves qué necesita atención y desde aquí comienzas las tareas diarias de Restaurante y Bar." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" icon={RefreshCw} onClick={reload}>Actualizar</Button><Button variant="secondary" icon={Download} onClick={exportCsv}>Exportar</Button></div>} />

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Acciones frecuentes">
      <QuickAction icon={PackagePlus} title="Registrar una compra" description="Compré productos y quiero ingresarlos." href="/compras" action="Comprar y recibir" />
      <QuickAction icon={Send} title="Abastecer un área" description="Enviar insumos a Restaurante o Bar." href="/transferencias" action="Distribuir insumos" />
      <QuickAction icon={Boxes} title="Consultar existencias" description="Saber cuánto hay y dónde está." href="/inventario" action="Ver existencias" />
      <QuickAction icon={Store} title="Administrar proveedores" description="Registrar y consultar a quién compro." href="/proveedores" action="Ver proveedores" />
    </section>

    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-wider text-park-gold">Prioridad diaria</p><h2 className="text-xl font-black text-park-dark">{pendingTotal ? `${pendingTotal} asuntos necesitan revisión` : "Todo está bajo control"}</h2><p className="mt-1 text-sm text-park-muted">Cada tarjeta explica el problema y abre la vista donde se resuelve.</p></div>
        <StatusPill value={pendingTotal} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{attention.map((item) => <AttentionCard key={item.label} {...item} />)}</div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Panel title="Dónde está el inventario" description="El valor se calcula con el stock y su costo registrado.">
        {(data.byWarehouse || []).length ? data.byWarehouse.map((row) => <WarehouseRow key={row.id} row={row} total={metrics.totalValue} />) : <EmptyState title="No hay existencias" description="Registra una compra para comenzar." />}
        <Link className="mt-3 inline-flex items-center gap-2 text-sm font-black text-park-green" to="/inventario">Ver productos y cantidades <ArrowRight size={15} /></Link>
      </Panel>
      <Panel title="Resumen económico" description={`Valores calculados para ${filters.date === today() ? "hoy" : filters.date}.`}>
        <SummaryRow label="Valor actual del inventario" value={money(metrics.totalValue)} strong />
        <SummaryRow label="Merma de hoy" value={money(metrics.wasteDay)} />
        <SummaryRow label="Costo usado en alimentos" value={money(metrics.food)} />
        <SummaryRow label="Costo usado en bebidas" value={money(metrics.beverage)} />
        <SummaryRow label="Costo de diferencias" value={money(metrics.differenceCost)} warning={Number(metrics.differenceCost) > 0} />
      </Panel>
    </section>

    <section className="rounded-card border border-park-border bg-white shadow-card">
      <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}>
        <div><h2 className="font-black text-park-dark">Consulta avanzada</h2><p className="text-sm text-park-muted">Filtra por fecha, área, almacén, producto, lote o proveedor cuando necesites investigar.</p></div>
        <ChevronDown className={`shrink-0 text-park-muted transition-transform ${advancedOpen ? "rotate-180" : ""}`} size={20} />
      </button>
      {advancedOpen ? <div className="border-t border-park-border p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Fecha" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
        <Select label="Área" value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}><option value="">Todas</option>{references.areas.map((value) => <option key={value} value={value}>{value === "BARTENDER" ? "Bar" : "Restaurante"}</option>)}</Select>
        <Select label="Almacén" value={filters.warehouse} onChange={(event) => setFilters({ ...filters, warehouse: event.target.value })}><option value="">Todos</option>{references.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        <Select label="Producto" value={filters.product} onChange={(event) => setFilters({ ...filters, product: event.target.value })}><option value="">Todos</option>{references.products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        <Select label="Lote" value={filters.lot} onChange={(event) => setFilters({ ...filters, lot: event.target.value })}><option value="">Todos</option>{references.lots.map((row) => <option key={row.id} value={row.id}>{row.product} · {row.code}</option>)}</Select>
        <Select label="Proveedor" value={filters.supplier} onChange={(event) => setFilters({ ...filters, supplier: event.target.value })}><option value="">Todos</option>{references.suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        <Select label="Turno" value={filters.shift} onChange={(event) => setFilters({ ...filters, shift: event.target.value })}><option value="">Todos</option><option value="ALMUERZO">Almuerzo</option><option value="CENA">Cena</option><option value="TARDE">Tarde</option><option value="NOCHE">Noche</option></Select>
        <Button className="self-end" variant="secondary" onClick={clearFilters}>Restablecer</Button>
      </div></div> : null}
    </section>

    <RecentActivity rows={data.audit || []} />
  </div>;
}

function QuickAction({ icon: Icon, title, description, href, action }) {
  return <Link to={href} className="group rounded-card border border-park-border bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-park-gold hover:shadow-lg"><span className="grid size-10 place-items-center rounded-xl bg-park-green-soft text-park-green"><Icon size={19} /></span><h2 className="mt-4 font-black text-park-dark">{title}</h2><p className="mt-1 min-h-10 text-sm text-park-muted">{description}</p><span className="mt-3 inline-flex items-center gap-1 text-sm font-black text-park-green">{action} <ArrowRight className="transition-transform group-hover:translate-x-1" size={15} /></span></Link>;
}
function AttentionCard({ icon: Icon, label, value, help, href }) {
  const warning = Number(value) > 0;
  return <Link to={href} className={`rounded-xl border p-4 transition hover:-translate-y-0.5 ${warning ? "border-amber-200 bg-amber-50" : "border-park-border bg-park-bg"}`}><div className="flex items-start justify-between gap-3"><span className={`grid size-9 place-items-center rounded-lg ${warning ? "bg-amber-100 text-amber-800" : "bg-park-green-soft text-park-green"}`}><Icon size={17} /></span><strong className="text-2xl text-park-dark">{value}</strong></div><p className="mt-3 text-sm font-black text-park-dark">{label}</p><p className="mt-1 text-xs text-park-muted">{warning ? help : "Sin pendientes"}</p></Link>;
}
function StatusPill({ value }) { return <span className={`rounded-full px-3 py-2 text-xs font-black ${value ? "bg-amber-100 text-amber-900" : "bg-park-green-soft text-park-green"}`}>{value ? "REQUIERE ATENCIÓN" : "OPERACIÓN NORMAL"}</span>; }
function Panel({ title, description, children }) { return <section className="rounded-card border border-park-border bg-white p-5 shadow-card"><h2 className="text-lg font-black text-park-dark">{title}</h2><p className="mb-4 text-sm text-park-muted">{description}</p><div className="space-y-2">{children}</div></section>; }
function WarehouseRow({ row, total }) { const percentage = Number(total) > 0 ? Math.min(100, Number(row.value) / Number(total) * 100) : 0; return <div className="rounded-xl bg-park-bg p-3"><div className="flex items-center justify-between gap-3 text-sm"><strong className="text-park-dark">{row.name}</strong><span className="font-black text-park-dark">{money(row.value)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-park-green" style={{ width: `${percentage}%` }} /></div></div>; }
function SummaryRow({ label, value, strong, warning }) { return <div className="flex items-center justify-between gap-4 rounded-xl bg-park-bg px-3 py-3 text-sm"><span className="text-park-muted">{label}</span><strong className={`${strong ? "text-base" : ""} ${warning ? "text-park-danger" : "text-park-dark"}`}>{value}</strong></div>; }
function RecentActivity({ rows }) { const visible = rows.filter((row) => !["API_OPERATION", "API_SECURITY"].includes(row.eventType) && !["API_OPERATION", "API_SECURITY"].includes(row.entityType)).slice(0, 6); if (!visible.length) return null; return <details className="rounded-card border border-park-border bg-white shadow-card"><summary className="cursor-pointer list-none p-5 font-black text-park-dark">Actividad reciente <span className="ml-2 text-sm font-normal text-park-muted">Historial para revisión</span></summary><div className="space-y-2 border-t border-park-border p-5">{visible.map((row) => <Link key={row.id} to="/auditoria" className="flex flex-col justify-between gap-1 rounded-xl bg-park-bg p-3 text-sm md:flex-row"><strong className="text-park-dark">{readableEvent(row)}</strong><span className="text-park-muted">{new Date(row.createdAt).toLocaleString("es-PE")}</span></Link>)}</div></details>; }
function readableEvent(row) { const names = { TRANSFER_SENT: "Transferencia enviada", TRANSFER_RECEIVED: "Transferencia recibida", CLOSING_APPROVED: "Cierre aprobado", GOODS_RECEIPT_POSTED: "Compra ingresada al almacén", WASTE_RECORDED: "Merma registrada" }; return names[row.eventType] || row.reason || "Movimiento de inventario"; }
