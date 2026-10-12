// Insumos › Mermas y pérdidas. Todo lo que salió del inventario sin venderse: mermas registradas por la cocina o el bar
// (con su motivo), consumo interno y los faltantes que dejaron los cierres aprobados. En soles, por motivo, por insumo
// y por área, para saber dónde se pierde dinero. Datos: GET /api/superadmin/stock-movements (kardex).
import { useMemo, useState } from "react";
import { TrendingDown } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Card, ChartBox, Empty, HBars, Kpi, PageHead, Seg, StackedBar, COLORS, Tag, qty, soles, useChartTip, whenText } from "./kit";
import { WASTE_LABEL, movementLabel } from "./StockMovementsPage";

const isLoss = (row) => String(row.type).startsWith("WASTE") || row.type === "INTERNAL_CONSUMPTION" || (row.type === "SHIFT_CLOSING_ADJUSTMENT" && row.from && !row.to);
const kindOf = (row) => (String(row.type).includes("INTERNAL_CONSUMPTION") ? "Consumo interno" : String(row.type).startsWith("WASTE") ? "Merma registrada" : "Faltante de cierre");
const areaOf = (row) => (/bar/i.test(row.from || "") ? "Bar" : /cocina/i.test(row.from || "") ? "Cocina" : "Almacén general");

export function WasteReportPage() {
  const [days, setDays] = useState("30");
  const data = useFetch(`/superadmin/stock-movements?days=${days}`, { initialData: null, realtime: true });
  const byProduct = useChartTip(), byReason = useChartTip(), byArea = useChartTip();
  const rows = (data.data?.rows || []).filter(isLoss);
  const cost = (row) => Number(row.quantity || 0) * Number(row.unitCost || 0);
  const total = rows.reduce((s, r) => s + cost(r), 0);
  const group = (keyFn) => { const map = new Map(); rows.forEach((row) => { const key = keyFn(row); map.set(key, (map.get(key) || 0) + cost(row)); }); return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value); };
  const products = useMemo(() => group((row) => row.product).slice(0, 8), [rows]);
  const reasons = useMemo(() => group((row) => WASTE_LABEL[row.type] || kindOf(row)), [rows]);
  const areas = useMemo(() => group(areaOf), [rows]);
  const kinds = ["Merma registrada", "Consumo interno", "Faltante de cierre"].map((name, index) => ({ name, value: rows.filter((row) => kindOf(row) === name).reduce((s, r) => s + cost(r), 0), color: [COLORS.red, COLORS.gray, COLORS.deep][index] }));
  if (data.loading && !data.data) return <LoadingSpinner label="Calculando mermas…" />;
  return <>
    <PageHead title="Mermas y pérdidas" tools={<Seg value={days} onChange={setDays} options={[["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["365", "Año"]]} />}>Lo que salió del inventario sin venderse, en soles: mermas con su motivo, consumo interno y faltantes de los cierres. Así sabes dónde se pierde dinero.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={TrendingDown} label="Pérdida total" value={soles(total)} detail={`${rows.length} registro(s)`} />
      {kinds.map((kind) => <Kpi key={kind.name} label={kind.name} value={soles(kind.value)} detail={total ? `${Math.round((kind.value / total) * 100)}% del total` : "—"} />)}
    </div>
    <div className="rx-grid rx-g-3" style={{ marginBottom: 14 }}>
      <Card title="Por insumo" subtitle="Soles perdidos"><ChartBox><HBars rows={products} name="S/" tip={byProduct.tip} x0={120} valueLabel={(v) => soles(v)} tooltipLabel="Pérdida" />{byProduct.layer}</ChartBox></Card>
      <Card title="Por motivo" subtitle="Soles perdidos"><ChartBox><HBars rows={reasons} name="S/" tip={byReason.tip} x0={140} valueLabel={(v) => soles(v)} tooltipLabel="Pérdida" />{byReason.layer}</ChartBox></Card>
      <Card title="Por área" subtitle="De dónde salió"><ChartBox><StackedBar label="Pérdida" tip={byArea.tip} format={(v) => soles(v)} legendValue="value" segments={areas.map((row, index) => ({ name: row.name, value: row.value, color: [COLORS.red, COLORS.deep, COLORS.gray][index] || COLORS.gray, tooltip: soles(row.value) }))} />{byArea.layer}</ChartBox></Card>
    </div>
    <Card title="Detalle" flush>
      {rows.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Cuándo</th><th>Tipo</th><th>Insumo</th><th>Área</th><th className="n">Cantidad</th><th className="n">Costo</th><th>Responsable</th><th>Motivo</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td className="mut" style={{ whiteSpace: "nowrap" }}>{whenText(row.at)}</td><td><Tag tone={String(row.type).startsWith("WASTE") ? "crit" : "warn"}>{movementLabel(row.type)}</Tag></td><td><b style={{ fontWeight: 600 }}>{row.product}</b></td><td className="mut">{areaOf(row)}</td><td className="n">{qty(row.quantity, 3)} {row.unit}</td><td className="n">{soles(cost(row))}</td><td className="mut">{row.actor || "—"}</td><td className="mut" style={{ maxWidth: 260 }}>{row.reason || "—"}</td></tr>)}</tbody></table></div> : <Empty icon={TrendingDown} title="Sin mermas ni pérdidas en el periodo">Cuando la cocina o el bar registren una merma, o un cierre deje faltantes, aparecerá aquí.</Empty>}
    </Card>
  </>;
}
