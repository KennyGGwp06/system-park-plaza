// Dinero › Rentabilidad por servicio. Todo el cálculo (ventas, gastos, utilidad, margen) lo hace el servidor en GET /api/superadmin/home;
// aquí solo se dibuja. Los gráficos reutilizan OwnerCharts (paleta ya validada del Inicio), sin colores nuevos.
import { useState } from "react";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { COLORS, Empty, GroupedBars, MarginBars, TipLayer, money, useTip, fitted } from "./OwnerCharts";
import { homeQuery } from "./OwnerHome";
import "./OwnerHome.css";
import "./ControlPages.css";

const PRESETS = [["hoy", "Hoy"], ["7d", "7 días"], ["mes", "Mes"], ["rango", "Rango…"]];
const TIME_ZONE = "America/Lima";
const shortDate = (date) => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
const periodLabel = (range) => range.days === 1 ? "Hoy" : `Del ${shortDate(range.from)} al ${shortDate(range.to)}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const signed = (value, decimals = 0) => `${value < 0 ? "−" : ""}${money(Math.abs(value), decimals)}`;
const pct = (value) => value === null || value === undefined ? "—" : `${value}%`;
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function Card({ title, sub, children }) {
  return <section className="oh-card"><div className="oh-ch"><h2>{title}</h2></div>{sub ? <div className="oh-ch2">{sub}</div> : null}<div className="oh-body">{children}</div></section>;
}

function Delta({ change, upIsGood = true, label }) {
  if (change === null || change === undefined) return <span>sin periodo anterior</span>;
  const good = (change >= 0) === upIsGood;
  return <><b className={good ? "up" : "dn"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</b> {label}</>;
}

/** Ranking de utilidad con eje en cero: azul si gana, rojo si pierde, y el signo va escrito en el número. */
const ProfitBars = fitted(ProfitBarsImpl);
function ProfitBarsImpl({ rows, tip, w = 420 }) {
  const W = w, x0 = 104, rowH = 40, track = Math.max(120, W - x0 - 130);
  if (!rows.some((row) => row.profit !== 0)) return <Empty title="Sin utilidad en el periodo" text="El ranking aparece cuando haya ventas o gastos registrados."/>;
  const posMax = Math.max(...rows.map((row) => Math.max(row.profit, 0)), 0);
  const negMax = Math.max(...rows.map((row) => Math.max(-row.profit, 0)), 0);
  const scale = track / ((posMax + negMax) || 1);
  const zero = x0 + negMax * scale;
  return <svg viewBox={`0 0 ${W} ${rows.length * rowH + 10}`} role="img" aria-label="Utilidad por servicio, de mayor a menor" className="oh-svg">
    <line x1={zero} x2={zero} y1="2" y2={rows.length * rowH + 4} stroke={COLORS.axis}/>
    {rows.map((row, i) => {
      const y = 8 + i * rowH; const loss = row.profit < 0; const width = Math.max(Math.abs(row.profit) * scale, row.profit === 0 ? 0 : 2);
      const color = loss ? COLORS.red : COLORS.blue;
      return <g key={row.code} className="oh-hv" {...tip.bind({ t: row.name, rows: [[color, signed(row.profit, 2), loss ? "Pérdida" : "Utilidad"], [COLORS.muted, money(row.sales, 2), "Ventas"], [COLORS.muted, money(row.expenses, 2), "Gastos"], [COLORS.muted, pct(row.margin), "Margen"]] })}>
        <rect x="0" y={y - 6} width={W} height={rowH - 4} fill="transparent"/>
        <text x={x0 - 10} y={y + 18} textAnchor="end" className="is-label">{row.name}</text>
        {width > 0 ? <rect x={loss ? zero - width : zero} y={y + 4} width={width} height="18" rx="4" fill={color}/> : null}
        <text x={loss ? zero + 8 : zero + width + 8} y={y + 18} className="is-strong">{signed(row.profit)}{loss ? " pérdida" : ""}</text>
      </g>;
    })}
  </svg>;
}

export function ProfitabilityPage({ navigate }) {
  const tip = useTip();
  const [range, setRange] = useState({ preset: "mes" });
  const [custom, setCustom] = useState({ from: "", to: "" });
  const { data, loading, error, reload } = useFetch(`/superadmin/home?${homeQuery(range)}`, { initialData: null, cacheTime: 15000, realtime: true, pollInterval: 30000 });

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Calculando la rentabilidad por servicio..."/></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudo cargar la rentabilidad</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { kpis, services, gastronomy, unassigned, notes } = data;
  const period = periodLabel(data.range);
  const compare = data.range.days === 1 ? "vs. ayer" : "vs. periodo anterior";
  const ranked = [...services].sort((a, b) => b.profit - a.profit || b.sales - a.sales);
  const best = ranked.find((row) => row.sales > 0 && row.profit > 0) || null;
  const marginRank = [...services].filter((row) => row.margin !== null).sort((a, b) => b.margin - a.margin);
  const sumSales = round2(services.reduce((total, row) => total + row.sales, 0));
  const sumExpenses = round2(services.reduce((total, row) => total + row.expenses, 0));
  const restSales = round2(kpis.sales.value - sumSales);
  const restExpenses = round2(kpis.expenses.value - sumExpenses);
  const gap = unassigned.expenses + unassigned.general;
  const costNote = (notes || []).find((note) => /^Gastos/i.test(note));
  const otherNotes = (notes || []).filter((note) => note !== costNote);
  const applyCustom = () => { if (custom.from && custom.to && custom.from <= custom.to) setRange({ preset: "rango", from: custom.from, to: custom.to }); };

  return <main className="oh">
    <TipLayer tip={tip.tip}/>
    <div className="oh-ph">
      <div><h1>Rentabilidad por servicio</h1><p>{period} · Actualizado a las {timeOf(data.generatedAt)}</p></div>
      <div className="oh-tools">
        <div className="oh-seg" role="group" aria-label="Periodo">{PRESETS.map(([key, label]) => <button key={key} type="button" className={range.preset === key ? "on" : ""} onClick={() => key === "rango" ? setRange({ preset: "rango", from: custom.from, to: custom.to }) : setRange({ preset: key })}>{label}</button>)}</div>
        <button type="button" className="oh-btn p" onClick={reload}><RefreshCw size={16}/>Actualizar</button>
      </div>
    </div>
    {range.preset === "rango" ? <div className="oh-range"><label>Desde<input type="date" value={custom.from} max={data.today} onChange={(e) => setCustom({ ...custom, from: e.target.value })}/></label><label>Hasta<input type="date" value={custom.to} max={data.today} onChange={(e) => setCustom({ ...custom, to: e.target.value })}/></label><button type="button" className="oh-btn p" onClick={applyCustom} disabled={!custom.from || !custom.to || custom.from > custom.to}>Aplicar</button></div> : null}

    {costNote ? <div className="oh-note oh-note--top"><strong>Qué incluye el gasto:</strong> {costNote}</div> : null}

    {gap > 0 || unassigned.sales > 0 ? <div className="oh-alert"><AlertTriangle size={18}/><div><strong>Datos por clasificar</strong>
      <span>{unassigned.expenses > 0 ? `${money(unassigned.expenses, 2)} en gastos sin servicio. ` : ""}{unassigned.general > 0 ? `${money(unassigned.general, 2)} en gastos generales (compartidos). ` : ""}{unassigned.sales > 0 ? `${money(unassigned.sales, 2)} en cobros sin servicio de origen. ` : ""}Hasta que se asignen, el resultado por servicio no suma el total.</span></div>
      {navigate ? <button type="button" onClick={() => navigate("dinero", "gastos")}>Ir a gastos <ArrowRight size={14}/></button> : null}</div> : null}

    <section className="oh-card oh-kpis" aria-label="Indicadores de rentabilidad">
      <div className="k"><div className="l">Ventas netas</div><div className="v">{money(kpis.sales.value)}</div><div className="d"><Delta change={kpis.sales.change} label={compare}/></div></div>
      <div className="k"><div className="l">Gastos</div><div className="v">{money(kpis.expenses.value)}</div><div className="d"><Delta change={kpis.expenses.change} upIsGood={false} label={compare}/></div></div>
      <div className="k"><div className="l">Utilidad</div><div className={`v ${kpis.profit.value < 0 ? "dn" : ""}`}>{signed(kpis.profit.value)}</div><div className="d"><Delta change={kpis.profit.change} label={compare}/></div></div>
      <div className="k"><div className="l">Margen general</div><div className="v">{kpis.profit.margin === null ? "—" : `${kpis.profit.margin}%`}</div><div className="d">utilidad sobre ventas</div></div>
      <div className="k"><div className="l">Servicio más rentable</div><div className="v v--text">{best ? best.name : "—"}</div><div className="d">{best ? `${signed(best.profit)} · margen ${pct(best.margin)}` : "Sin utilidad positiva en el periodo"}</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Utilidad por servicio" sub={`${period} · ventas menos gastos · S/`}><ProfitBars rows={ranked} tip={tip}/></Card>
      <Card title="Margen por servicio" sub="Utilidad sobre ventas, frente a la meta"><MarginBars rows={marginRank} tip={tip}/></Card>
    </div>

    <div className="oh-grid g-8-4">
      <section className="oh-card">
        <div className="oh-ch"><h2>Resultado por servicio</h2></div>
        <div className="oh-ch2">Cada fila suma el consumo de Restaurante y Bar del cliente que llegó por ese servicio</div>
        <div className="oh-body oh-body--flush">
          <table className="oh-table">
            <thead><tr><th>Servicio</th><th className="n">Ventas</th><th className="n">Gastos</th><th className="n">Utilidad</th><th className="n">Margen</th></tr></thead>
            <tbody>
              {ranked.map((row) => <tr key={row.code}><td>{row.name}</td><td className="n">{money(row.sales, 2)}</td><td className="n">{money(row.expenses, 2)}</td><td className={`n ${row.profit < 0 ? "dn" : ""}`}><b>{signed(row.profit, 2)}</b></td><td className="n">{pct(row.margin)}</td></tr>)}
              {restSales !== 0 || restExpenses !== 0 ? <tr className="is-muted"><td>Sin asignar y generales</td><td className="n">{money(restSales, 2)}</td><td className="n">{money(restExpenses, 2)}</td><td className={`n ${restSales - restExpenses < 0 ? "dn" : ""}`}>{signed(round2(restSales - restExpenses), 2)}</td><td className="n">—</td></tr> : null}
              <tr className="is-total"><td>Total del negocio</td><td className="n">{money(kpis.sales.value, 2)}</td><td className="n">{money(kpis.expenses.value, 2)}</td><td className={`n ${kpis.profit.value < 0 ? "dn" : ""}`}>{signed(kpis.profit.value, 2)}</td><td className="n">{pct(kpis.profit.margin)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <Card title="Restaurante y Bar" sub="Ya están dentro de las ventas de arriba · ventas y costo de recetas · S/">
        <GroupedBars rows={gastronomy.map((g) => ({ name: g.name, a: g.sales, b: g.cost, margin: g.margin }))} aName="Ventas" bName="Costo de recetas" tip={tip} extra={(row) => [[COLORS.muted, pct(row.margin), "Margen"]]}/>
        <div className="oh-leg oh-leg--below"><span><i className="sq" style={{ background: COLORS.blue }}/>Ventas</span><span><i className="sq" style={{ background: COLORS.red }}/>Costo de recetas</span></div>
      </Card>
    </div>

    {otherNotes.length ? <details className="oh-how"><summary>Cómo se calcula</summary><ul>{otherNotes.map((note) => <li key={note}>{note}</li>)}</ul></details> : null}
  </main>;
}
