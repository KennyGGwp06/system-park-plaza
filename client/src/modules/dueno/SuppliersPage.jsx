// Insumos › Proveedores. Directorio de proveedores con lo que se les compró (monto, órdenes, último pedido, insumos),
// para comparar antes de decidir a quién comprar. Rutas: GET/POST /api/proveedores, PUT /api/proveedores/:id,
// GET /api/purchasing/orders (historial de compras).
import { useMemo, useState } from "react";
import { Plus, Truck } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Drawer, Empty, Field, HBars, Kpi, PageHead, SearchBox, Status, dayText, limaDay, soles, useBusy, useChartTip, useOpenId, useToast } from "./kit";

export function SuppliersPage() {
  const suppliers = useFetch("/proveedores", { initialData: [], realtime: false });
  const orders = useFetch("/purchasing/orders", { initialData: [], realtime: true });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const chart = useChartTip();
  const rows = Array.isArray(suppliers.data) ? suppliers.data : [];
  const history = useMemo(() => { const map = new Map(); (Array.isArray(orders.data) ? orders.data : []).forEach((order) => { const key = String(order.supplier?.legacyId ?? order.supplier?.name ?? ""); const current = map.get(key) || { total: 0, count: 0, last: null, products: new Set() }; current.total += Number(order.total || 0); current.count += 1; const at = order.orderedAt || order.createdAt; if (!current.last || String(at) > String(current.last)) current.last = at; (order.lines || []).forEach((line) => current.products.add(line.productName)); map.set(key, current); }); return map; }, [orders.data]);
  const statOf = (row) => history.get(String(row.id)) || history.get(row.name) || { total: 0, count: 0, last: null, products: new Set() };
  const shown = rows.filter((row) => !text.trim() || `${row.name} ${row.ruc} ${row.contact} ${row.email}`.toLowerCase().includes(text.trim().toLowerCase())).sort((a, b) => statOf(b).total - statOf(a).total);
  const ranking = rows.map((row) => ({ name: row.name.length > 20 ? `${row.name.slice(0, 19)}…` : row.name, value: Math.round(statOf(row).total) })).filter((row) => row.value).sort((a, b) => b.value - a.value).slice(0, 8);
  const selected = rows.find((row) => String(row.id) === openId) || null;
  if (suppliers.loading && !rows.length) return <LoadingSpinner label="Cargando proveedores…" />;
  return <>
    <PageHead title="Proveedores" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nuevo proveedor</button>}>A quién le compras y cuánto. Compara lo comprado y los insumos de cada uno antes de decidir.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Truck} label="Proveedores activos" value={rows.filter((row) => row.status === "ACTIVO").length} detail={`${rows.length} registrados`} />
      <Kpi label="Comprado en total" value={soles(rows.reduce((s, row) => s + statOf(row).total, 0))} detail="Órdenes con proveedor" />
      <Kpi label="Principal proveedor" value={ranking[0]?.name || "—"} detail={ranking[0] ? soles(ranking[0].value) : "Sin compras"} />
      <Kpi label="Órdenes" value={rows.reduce((s, row) => s + statOf(row).count, 0)} detail="Con proveedor identificado" />
    </div>
    <div className="ow-split">
      <Card title="Directorio" flush tools={<SearchBox value={text} onChange={setText} placeholder="Nombre, RUC o contacto" width={240} />}>
        {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Proveedor</th><th>Contacto</th><th className="n">Comprado</th><th className="n">Órdenes</th><th>Último pedido</th><th>Estado</th></tr></thead>
          <tbody>{shown.map((row) => { const stat = statOf(row); return <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
            <td><b style={{ fontWeight: 600 }}>{row.name}</b><small className="mut" style={{ display: "block" }}>RUC {row.ruc || "—"}</small></td><td className="mut">{row.contact || "—"}{row.phone ? ` · ${row.phone}` : ""}</td>
            <td className="n">{soles(stat.total)}</td><td className="n">{stat.count}</td><td className="mut">{stat.last ? dayText(limaDay(stat.last)) : "—"}</td><td><Status value={row.status} /></td>
          </tr>; })}</tbody></table></div> : <Empty icon={Truck} title="Sin proveedores" />}
      </Card>
      <Card title="Compras por proveedor" subtitle="S/ en órdenes"><ChartBox><HBars rows={ranking} name="S/" tip={chart.tip} x0={130} valueLabel={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`} tooltipLabel="Comprado" />{chart.layer}</ChartBox></Card>
    </div>
    {creating || selected ? <SupplierDrawer supplier={creating ? null : selected} products={selected ? [...statOf(selected).products] : []} onClose={() => { setCreating(false); open(null); }} onSaved={() => { setCreating(false); open(null); suppliers.reload(); }} /> : null}
  </>;
}

function SupplierDrawer({ supplier, products, onClose, onSaved }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState({ ruc: supplier?.ruc || "", name: supplier?.name || "", contact: supplier?.contact || "", phone: supplier?.phone || "", email: supplier?.email || "", status: supplier?.status || "ACTIVO" });
  const set = (patch) => setForm({ ...form, ...patch });
  const save = () => { if (!form.name.trim()) { setError("Pon el nombre del proveedor."); return; } if (form.ruc && !/^\d{11}$/.test(form.ruc)) { setError("El RUC tiene 11 dígitos."); return; } run(async () => { await api(supplier ? `/proveedores/${supplier.id}` : "/proveedores", { method: supplier ? "PUT" : "POST", body: form }); show(supplier ? "Proveedor actualizado." : "Proveedor creado: ya puedes usarlo en Compras."); onSaved(); }); };
  return <Drawer open onClose={onClose} busy={busy} eyebrow={supplier ? `RUC ${supplier.ruc || "—"}` : "Nuevo proveedor"} title={supplier ? supplier.name : "Proveedor"} footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{supplier ? "Guardar" : "Crear proveedor"}</button></>}>
    <div className="ow-form">
      <Field label="Razón social o nombre" full><input className="rx-input" value={form.name} onChange={(event) => set({ name: event.target.value })} /></Field>
      <Field label="RUC"><input className="rx-input rx-mono" inputMode="numeric" maxLength={11} value={form.ruc} onChange={(event) => set({ ruc: event.target.value.replace(/\D/g, "") })} /></Field>
      <Field label="Estado"><select className="rx-select" value={form.status} onChange={(event) => set({ status: event.target.value })}><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option></select></Field>
      <Field label="Persona de contacto"><input className="rx-input" value={form.contact} onChange={(event) => set({ contact: event.target.value })} /></Field>
      <Field label="Celular"><input className="rx-input" value={form.phone} onChange={(event) => set({ phone: event.target.value })} /></Field>
      <Field label="Correo" full><input className="rx-input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} /></Field>
    </div>
    {supplier ? <section className="rx-sec"><h3>Insumos que le compraste</h3><p style={{ margin: 0, fontSize: 13.5 }}>{products.length ? products.join(", ") : "Aún no hay compras con este proveedor."}</p></section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
