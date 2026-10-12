// Restaurante / Bar › Pedidos en vivo. Lo que el dueño necesita de la cocina o la barra: qué se está preparando y si va
// a tiempo, cuánto se vendió y con qué margen, qué platos o bebidas mueven la venta y el detalle de cada pedido.
// Solo supervisa: preparar y entregar lo hace la estación. Datos: GET /api/restaurante | /api/bartender (con precios).
import { useMemo, useState } from "react";
import { ChefHat, Clock3, GlassWater } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Card, ChartBox, Columns, Drawer, Empty, HBars, Kpi, PageHead, Seg, Status, Tag, addDays, limaDay, qty, soles, todayKey, useChartTip, useOpenId, whenText } from "./kit";

const ACTIVE = ["PENDIENTE", "EN_COCINA", "PREPARANDO", "LISTO"];
const minutesBetween = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
const deliveredAt = (row) => (row.status === "ENTREGADO" ? row.deliveredAt || row.updatedAt : null);

export function OrdersMonitorPage({ area = "RESTAURANTE" }) {
  const isBar = area === "BARTENDER";
  const Icon = isBar ? GlassWater : ChefHat;
  const orders = useFetch(isBar ? "/bartender" : "/restaurante", { initialData: [], realtime: true, pollInterval: 15000 });
  const [range, setRange] = useState("hoy");
  const [openId, open] = useOpenId();
  const bar = useChartTip(), hour = useChartTip();
  const rows = Array.isArray(orders.data) ? orders.data : [];
  const today = todayKey();
  const from = range === "hoy" ? today : addDays(today, range === "7d" ? -6 : -29);
  const inRange = rows.filter((row) => limaDay(row.createdAt) >= from);
  const active = rows.filter((row) => ACTIVE.includes(row.status));
  const late = active.filter((row) => row.isLate || row.isAbandoned);
  const delivered = inRange.filter((row) => row.status === "ENTREGADO");
  const cancelled = inRange.filter((row) => row.status === "CANCELADO");
  const sales = delivered.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const cost = delivered.reduce((sum, row) => sum + (row.items || []).reduce((acc, item) => acc + Number(item.recipeUnitCost || 0) * Number(item.quantity || 0), 0), 0);
  const prep = delivered.map((row) => minutesBetween(row.createdAt, deliveredAt(row))).filter((value) => value != null);
  const avgPrep = prep.length ? Math.round(prep.reduce((a, b) => a + b, 0) / prep.length) : null;

  const top = useMemo(() => { const map = new Map(); delivered.forEach((row) => (row.items || []).forEach((item) => { const current = map.get(item.name) || { name: item.name, value: 0, sales: 0 }; current.value += Number(item.quantity || 0); current.sales += Number(item.price || 0) * Number(item.quantity || 0); map.set(item.name, current); })); return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8); }, [delivered]);
  const series = useMemo(() => {
    if (range === "hoy") { const hours = Array.from({ length: 18 }, (_, i) => i + 6); return { labels: hours.map((h) => `${h}h`), values: hours.map((h) => inRange.filter((row) => Number(new Date(row.createdAt).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Lima" })) === h).length), name: "Pedidos por hora" }; }
    const days = Array.from({ length: range === "7d" ? 7 : 30 }, (_, i) => addDays(from, i));
    return { labels: days.map((d) => d.slice(8)), values: days.map((d) => inRange.filter((row) => limaDay(row.createdAt) === d).length), name: "Pedidos por día" };
  }, [inRange, range, from]);
  const selected = rows.find((row) => String(row.id) === openId) || null;

  if (orders.loading && !rows.length) return <LoadingSpinner label="Cargando pedidos…" />;
  return <>
    <PageHead title={isBar ? "Pedidos del Bar" : "Pedidos del Restaurante"} tools={<Seg value={range} onChange={setRange} options={[["hoy", "Hoy"], ["7d", "7 días"], ["30d", "30 días"]]} />}>Supervisión en vivo. Preparar y entregar lo hace la estación de {isBar ? "Bar" : "Cocina"}; aquí ves tiempos, ventas y margen.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Icon} label="En curso ahora" value={active.length} detail={late.length ? `${late.length} fuera de tiempo` : "Todos a tiempo"} />
      <Kpi label="Entregados" value={delivered.length} detail={cancelled.length ? `${cancelled.length} cancelado(s)` : "Sin cancelaciones"} />
      <Kpi label="Ventas" value={soles(sales)} detail={sales ? `Margen ${Math.round(((sales - cost) / sales) * 100)}% sobre costo de receta` : "Sin ventas en el periodo"} />
      <Kpi icon={Clock3} label="Tiempo promedio" value={avgPrep != null ? `${avgPrep} min` : "—"} detail="Del pedido a la entrega" />
    </div>

    <div className="ow-split" style={{ marginBottom: 14 }}>
      <Card title={series.name} subtitle={range === "hoy" ? "Hoy, hora de Lima" : "Pedidos recibidos"}><ChartBox><Columns values={series.values} labels={series.labels} name={series.name} tip={hour.tip} highlight={series.values.map((v, i) => (v === Math.max(...series.values) && v ? i : -1)).filter((i) => i >= 0)} everyLabel={range === "30d" ? 5 : range === "hoy" ? 2 : 1} />{hour.layer}</ChartBox></Card>
      <Card title={isBar ? "Bebidas más pedidas" : "Platos más pedidos"} subtitle="Unidades entregadas"><ChartBox><HBars rows={top} name="Unidades" tip={bar.tip} x0={140} tooltipLabel="Unidades" />{bar.layer}</ChartBox></Card>
    </div>

    <Card title="En curso" subtitle="Del más antiguo al más reciente" flush>
      {active.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Pedido</th><th>Destino</th><th>{isBar ? "Bebidas" : "Platos"}</th><th>Recibido</th><th>Estado</th><th>Atiende</th><th className="n">Total</th></tr></thead>
        <tbody>{active.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.destination?.label || "—"}</td><td className="mut">{(row.items || []).map((item) => `${item.quantity}× ${item.name}`).join(", ")}</td>
          <td className="mut">{whenText(row.createdAt)}</td><td>{row.isLate || row.isAbandoned ? <Tag tone="crit">{row.isAbandoned ? "Abandonado" : "Fuera de tiempo"}</Tag> : <Status value={row.status} />}</td>
          <td className="mut">{row.acceptedBy || "—"}</td><td className="n">{soles(row.total)}</td>
        </tr>)}</tbody></table></div> : <Empty icon={Icon} title="No hay pedidos en curso" />}
    </Card>

    <Card title="Pedidos del periodo" subtitle={`${inRange.length} pedido(s)`} flush style={{ marginTop: 14 }}>
      {inRange.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Pedido</th><th>Destino</th><th>Cliente</th><th>Recibido</th><th className="n">Minutos</th><th>Estado</th><th>Entregó</th><th className="n">Total</th></tr></thead>
        <tbody>{inRange.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.destination?.label || "—"}</td><td className="mut">{row.client ? `${row.client.firstName} ${row.client.lastName}` : "—"}</td>
          <td className="mut">{whenText(row.createdAt)}</td><td className="n">{minutesBetween(row.createdAt, deliveredAt(row)) ?? "—"}</td><td><Status value={row.status} /></td><td className="mut">{row.deliveredBy || "—"}</td><td className="n">{soles(row.total)}</td>
        </tr>)}</tbody></table></div> : <Empty icon={Icon} title="Sin pedidos en el periodo" />}
    </Card>
    <OrderDrawer order={selected} onClose={() => open(null)} />
  </>;
}

function OrderDrawer({ order, onClose }) {
  if (!order) return null;
  const cost = (order.items || []).reduce((acc, item) => acc + Number(item.recipeUnitCost || 0) * Number(item.quantity || 0), 0);
  const steps = [["Recibido", order.createdAt], ["Aceptado", order.acceptedAt], ["Entregado", deliveredAt(order)]];
  return <Drawer open onClose={onClose} eyebrow={`${order.code} · ${order.destination?.label || ""}`} title={order.client ? `${order.client.firstName} ${order.client.lastName}` : "Pedido"} subtitle={`${order.destination?.detail || ""}`} footer={<button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Status value={order.status} />{order.isLate ? <Tag tone="crit">Fuera de tiempo</Tag> : null}{order.paymentMethod ? <Tag>{order.paymentMethod}</Tag> : null}{order.paymentStatus ? <Status value={order.paymentStatus} /> : null}</div>
    <section className="rx-sec"><h3>Detalle</h3><div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Producto</th><th className="n">Cant.</th><th className="n">Precio</th><th className="n">Costo receta</th></tr></thead>
      <tbody>{(order.items || []).map((item, index) => <tr key={index}><td>{item.name}{item.notes ? <small className="mut" style={{ display: "block" }}>{item.notes}</small> : null}</td><td className="n">{qty(item.quantity, 0)}</td><td className="n">{soles(Number(item.price || 0) * Number(item.quantity || 0))}</td><td className="n mut">{soles(Number(item.recipeUnitCost || 0) * Number(item.quantity || 0))}</td></tr>)}
        <tr><td><b>Total</b></td><td /><td className="n"><b>{soles(order.total)}</b></td><td className="n mut">{soles(cost)}</td></tr></tbody></table></div></section>
    <section className="rx-sec"><h3>Tiempos y responsables</h3><dl className="rx-dl">{steps.map(([label, at]) => <div key={label}><dt>{label}</dt><dd>{at ? whenText(at) : "—"}</dd></div>)}<div><dt>Aceptó</dt><dd>{order.acceptedBy || "—"}</dd></div><div><dt>Entregó</dt><dd>{order.deliveredBy || "—"}</dd></div></dl></section>
    {order.notes ? <section className="rx-sec"><h3>Indicación del cliente</h3><p style={{ margin: 0 }}>{order.notes}</p></section> : null}
  </Drawer>;
}
