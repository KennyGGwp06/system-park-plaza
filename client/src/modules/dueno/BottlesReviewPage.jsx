// Bar › Control de botellas (dueño). Lo que el bartender registró en cada botella: dosis servidas (a la medida, de más o
// de menos), medidas y la diferencia final en ml y en soles. Solo supervisión: abrir, servir, medir y cerrar lo hace
// la estación del Bar. La botella no mueve stock (lo descuenta el pedido entregado). Datos: GET /api/bar/bottles.
import { useMemo, useState } from "react";
import { Wine } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Card, ChartBox, Drawer, Empty, HBars, Kpi, PageHead, Seg, Status, StackedBar, COLORS, Tag, limaDay, qty, soles, todayKey, useChartTip, useOpenId, whenText } from "./kit";

const ml = (value) => `${qty(value, 1)} ml`;
const RESULT = { NORMAL: ["A la medida", "ok"], OVERPOURED: ["De más", "crit"], UNDERPOURED: ["De menos", "warn"] };

export function BottlesReviewPage() {
  const bottles = useFetch("/bar/bottles", { initialData: [], realtime: true, pollInterval: 30000 });
  const [filter, setFilter] = useState("todas");
  const [openId, open] = useOpenId();
  const stack = useChartTip(), bars = useChartTip();
  const rows = Array.isArray(bottles.data) ? bottles.data : [];
  const services = rows.flatMap((row) => (row.services || []).map((service) => ({ ...service, bottle: row })));
  const monthKey = todayKey().slice(0, 7);
  const monthServices = services.filter((service) => limaDay(service.servedAt).startsWith(monthKey));
  const count = (result) => monthServices.filter((service) => service.result === result).length;
  const closed = rows.filter((row) => row.status !== "OPEN");
  const lossMl = closed.reduce((sum, row) => sum + Math.min(0, Number(row.differenceMl || 0)), 0);
  const lossSoles = closed.reduce((sum, row) => sum + Math.min(0, Number(row.differenceCost || 0)), 0);
  const byProduct = useMemo(() => { const map = new Map(); closed.forEach((row) => { const current = map.get(row.productName) || { name: row.productName, value: 0 }; current.value += Math.abs(Math.min(0, Number(row.differenceMl || 0))); map.set(row.productName, current); }); return [...map.values()].filter((row) => row.value).sort((a, b) => b.value - a.value).slice(0, 8); }, [closed]);
  const shown = rows.filter((row) => filter === "todas" || (filter === "abiertas" ? row.status === "OPEN" : row.status !== "OPEN"));
  const selected = rows.find((row) => String(row.id) === openId) || null;

  if (bottles.loading && !rows.length) return <LoadingSpinner label="Cargando botellas…" />;
  return <>
    <PageHead title="Control de botellas" tools={<Seg value={filter} onChange={setFilter} options={[["todas", "Todas", rows.length], ["abiertas", "Abiertas", rows.length - closed.length], ["cerradas", "Cerradas", closed.length]]} />}>Si los tragos salen a la medida, lo medido en la botella coincide con lo esperado. Las diferencias negativas son licor que salió sin venderse.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Wine} label="Botellas abiertas" value={rows.length - closed.length} detail={`${closed.length} cerrada(s) en total`} />
      <Kpi label="Tragos este mes" value={monthServices.length} detail={monthServices.length ? `${Math.round((count("NORMAL") / monthServices.length) * 100)}% a la medida` : "Sin servicios registrados"} />
      <Kpi label="Faltante acumulado" value={ml(Math.abs(lossMl))} detail="Botellas cerradas" />
      <Kpi label="Faltante en soles" value={soles(Math.abs(lossSoles))} detail="Al costo de compra" />
    </div>
    <div className="ow-split" style={{ marginBottom: 14 }}>
      <Card title="Precisión de las dosis" subtitle="Tragos registrados este mes"><ChartBox><StackedBar label="Tragos" tip={stack.tip} legendValue="value" segments={[{ name: "A la medida", value: count("NORMAL"), color: COLORS.blue, tooltip: `${count("NORMAL")} tragos` }, { name: "De menos", value: count("UNDERPOURED"), color: COLORS.gray, tooltip: `${count("UNDERPOURED")} tragos` }, { name: "De más", value: count("OVERPOURED"), color: COLORS.red, tooltip: `${count("OVERPOURED")} tragos` }]} />{stack.layer}</ChartBox></Card>
      <Card title="Faltante por licor" subtitle="ml perdidos en botellas cerradas"><ChartBox><HBars rows={byProduct} name="ml" tip={bars.tip} x0={120} valueLabel={(v) => `${qty(v, 0)} ml`} tooltipLabel="Faltante" />{bars.layer}</ChartBox></Card>
    </div>
    <Card title="Botellas" flush>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Botella</th><th>Producto</th><th>Estado</th><th>Abierta</th><th className="n">Tragos</th><th className="n">Esperado</th><th className="n">Medido</th><th className="n">Diferencia</th></tr></thead>
        <tbody>{shown.map((row) => { const d = Number(row.differenceMl); return <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.productName}<small className="mut" style={{ display: "block" }}>{row.lotCode || "Sin lote"}</small></td><td><Status value={row.status === "OPEN" ? "ABIERTA" : row.status === "EMPTY" ? "FINALIZADA" : "CERRADA"} /></td>
          <td className="mut">{whenText(row.openedAt)}</td><td className="n">{(row.services || []).length}</td><td className="n">{ml(row.expectedMl)}</td><td className="n">{row.physicalMl == null ? "—" : ml(row.physicalMl)}</td>
          <td className="n" style={{ color: d < 0 ? "var(--crit)" : undefined }}>{row.differenceMl == null ? "—" : <>{d > 0 ? "+" : ""}{ml(d)}<small style={{ display: "block" }}>{soles(row.differenceCost)}</small></>}</td>
        </tr>; })}</tbody></table></div> : <Empty icon={Wine} title="Sin botellas en esta vista">El bartender registra cada botella que abre desde su estación.</Empty>}
    </Card>
    {selected ? <Drawer open onClose={() => open(null)} eyebrow={`${selected.code} · ${selected.lotCode || "sin lote"}`} title={selected.productName} subtitle={`Abierta ${whenText(selected.openedAt)}${selected.closedAt ? ` · cerrada ${whenText(selected.closedAt)}` : ""}`} footer={<button className="rx-btn" type="button" onClick={() => open(null)}>Cerrar</button>}>
      <dl className="rx-dl"><div><dt>Inicial</dt><dd>{ml(selected.initialMl)}</dd></div><div><dt>Esperado</dt><dd>{ml(selected.expectedMl)}</dd></div><div><dt>Medido</dt><dd>{selected.physicalMl == null ? "Sin medir" : ml(selected.physicalMl)}</dd></div><div><dt>Diferencia</dt><dd>{selected.differenceMl == null ? "—" : `${ml(selected.differenceMl)} · ${soles(selected.differenceCost)}`}</dd></div><div><dt>Costo por ml</dt><dd>{soles(selected.unitCostPerMl)}</dd></div></dl>
      <section className="rx-sec"><h3>Tragos ({(selected.services || []).length})</h3>{(selected.services || []).length ? <ul className="rx-list">{selected.services.map((service) => { const [label, tone] = RESULT[service.result] || [service.result, "off"]; return <li key={service.id}><div className="grow"><b>Dosis {ml(service.targetMl)} · servido {ml(service.measuredMl)}</b><small>{whenText(service.servedAt)}{service.notes ? ` · ${service.notes}` : ""}</small></div><Tag tone={tone}>{label}</Tag></li>; })}</ul> : <p className="mut" style={{ margin: 0 }}>Sin tragos registrados.</p>}</section>
      <section className="rx-sec"><h3>Medidas</h3>{(selected.measurements || []).length ? <ul className="rx-list">{selected.measurements.map((row, index) => <li key={index}><div className="grow"><b>{row.method === "WEIGHT" ? `Balanza · ${qty(row.grossWeightGrams, 0)} g` : "Por volumen"}</b><small>{whenText(row.measuredAt)}</small></div><b>{ml(row.contentMl)}</b></li>)}</ul> : <p className="mut" style={{ margin: 0 }}>Sin medidas.</p>}</section>
    </Drawer> : null}
  </>;
}
