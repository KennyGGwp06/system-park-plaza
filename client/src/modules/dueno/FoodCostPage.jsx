// Insumos › Food cost real vs teórico (GET /api/superadmin/food-cost). Teórico: lo que las recetas dicen que se gastó con
// lo vendido. Real: lo que salió según el conteo físico del cierre. Diferencia positiva = gasto que no explican las ventas.
// Por plato el real es una estimación (se reparte la diferencia del cierre según el costo teórico de cada plato).
import { useState } from "react";
import { Scale } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, COLORS, Empty, GroupedBars, Kpi, PageHead, Seg, Tag, soles, useChartTip, whenText } from "./kit";

const pct = (value) => (value == null ? "—" : `${value}%`);
const diffTone = (value) => (value > 0.005 ? "crit" : value < -0.005 ? "info" : "off");

export function FoodCostPage() {
  const [days, setDays] = useState("14");
  const data = useFetch(`/superadmin/food-cost?days=${days}`, { initialData: null, realtime: true });
  if (!data.data) return data.error ? <Alert tone="crit">{data.error.message}</Alert> : <LoadingSpinner label="Calculando el food cost…" />;
  const areas = data.data.areas || [];
  const total = areas.reduce((acc, area) => ({ sales: acc.sales + area.totals.sales, theoretical: acc.theoretical + area.totals.theoreticalCost, real: acc.real + area.totals.realCost }), { sales: 0, theoretical: 0, real: 0 });
  return <>
    <PageHead title="Food cost real vs teórico" tools={<Seg value={days} onChange={setDays} options={[["7", "7 días"], ["14", "14 días"], ["30", "30 días"], ["90", "90 días"]]} />}>Teórico: lo que las recetas dicen que se gastó con lo vendido. Real: lo que salió según el conteo de cada cierre. Una diferencia en rojo es gasto que no explican las ventas.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Scale} label="Ventas con receta" value={soles(total.sales)} detail="Cocina y Bar" />
      <Kpi label="Food cost teórico" value={total.sales ? `${Math.round((total.theoretical / total.sales) * 100)}%` : "—"} detail={soles(total.theoretical)} />
      <Kpi label="Food cost real" value={total.sales ? `${Math.round((total.real / total.sales) * 100)}%` : "—"} detail={soles(total.real)} />
      <Kpi label="Diferencia" value={soles(total.real - total.theoretical)} detail={total.real - total.theoretical > 0.005 ? "Gasto sin explicar" : "Sin gasto de más"} />
    </div>
    {areas.map((area) => <AreaBlock key={area.area} area={area} />)}
  </>;
}

function AreaBlock({ area }) {
  const chart = useChartTip();
  const rows = area.shifts.slice(0, 6).map((row) => ({ name: whenText(row.to).slice(0, 5), a: Number(row.theoreticalCost || 0), b: Number(row.realCost || 0) }));
  return <section style={{ marginBottom: 14 }}>
    <h2 style={{ fontSize: 16, fontWeight: 600, margin: "6px 0 10px" }}>{area.name} · <Tag tone={diffTone(area.totals.differenceCost)}>{area.totals.differenceCost > 0 ? "+" : ""}{soles(area.totals.differenceCost)}</Tag></h2>
    <div className="ow-split">
      <Card title="Por cierre" subtitle="Costo teórico frente al real" flush>
        {area.shifts.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Cierre</th><th className="n">Ventas</th><th className="n">Teórico</th><th className="n">Real</th><th className="n">Diferencia</th><th className="n">% real</th><th>Mayores diferencias</th></tr></thead>
          <tbody>{area.shifts.map((row) => <tr key={row.sessionId}><td>{whenText(row.to)}<small className="mut" style={{ display: "block" }}>{row.status === "CLOSED" ? "Aprobado" : "Por aprobar"}</small></td><td className="n">{soles(row.sales)}</td><td className="n">{soles(row.theoreticalCost)}</td><td className="n">{soles(row.realCost)}</td><td className="n"><Tag tone={diffTone(row.differenceCost)}>{row.differenceCost > 0 ? "+" : ""}{soles(row.differenceCost)}</Tag></td><td className="n">{pct(row.realPercent)}</td><td className="mut" style={{ maxWidth: 260 }}>{row.topDifferences.length ? row.topDifferences.map((item) => `${item.productName} ${item.cost > 0 ? "+" : ""}${soles(item.cost)}`).join(" · ") : "Sin diferencias"}</td></tr>)}</tbody></table></div> : <Empty title="Sin cierres en el periodo" />}
      </Card>
      <Card title="Teórico vs real" subtitle="Últimos 6 cierres (S/)"><ChartBox><GroupedBars rows={rows} aName="Teórico" bName="Real" aColor={COLORS.blue} bColor={COLORS.red} tip={chart.tip} />{chart.layer}</ChartBox></Card>
    </div>
    <Card title={area.area === "BARTENDER" ? "Por bebida" : "Por plato"} subtitle="El real por producto es una estimación" flush style={{ marginTop: 14 }}>
      {area.dishes.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Producto</th><th className="n">Vendidos</th><th className="n">Ventas</th><th className="n">Costo teórico</th><th className="n">% teórico</th><th className="n">% real estimado</th></tr></thead>
        <tbody>{area.dishes.map((dish) => <tr key={dish.name}><td><b style={{ fontWeight: 600 }}>{dish.name}</b></td><td className="n">{dish.quantity}</td><td className="n">{soles(dish.sales)}</td><td className="n">{soles(dish.theoreticalCost)}</td><td className="n">{pct(dish.theoreticalPercent)}</td><td className="n">{pct(dish.estimatedRealPercent)}</td></tr>)}</tbody></table></div> : <Empty title="Sin ventas con receta en el periodo" />}
    </Card>
  </section>;
}
