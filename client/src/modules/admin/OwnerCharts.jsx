// Gráficos del Inicio del Superadmin. SVG propio: barras de hasta 24 px con extremo redondeado de 4 px, líneas de 2 px,
// cuadrícula de 1 px, separación de 2 px entre segmentos y tooltip con teclado. Colores validados (ver PALETA_PARK_PLAZA.md).
import { useLayoutEffect, useRef, useState } from "react";

export const COLORS = { ink: "#0B1020", navy: "#0B3B7A", deep: "#0F4C9E", blue: "#1E6FD6", mid: "#5AA0EA", red: "#C83D46", gray: "#A9B7CC", track: "#E6E9EE", grid: "#E8EEF5", axis: "#CBD5E3", muted: "#5B6B82" };
export const fmt = (value) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money = (value, decimals = 0) => `S/ ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const r1 = (value) => Math.round(value * 10) / 10;

/* ---------- ancho real ----------
   Cada gráfico se dibuja al ancho de su tarjeta (1 unidad = 1 píxel): así el texto queda siempre en 12-13 px y
   las barras con su alto fijo, en vez de agrandarse al estirar el dibujo (antes una tarjeta ancha mostraba letras
   de 28 px y barras gigantes). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const update = () => setWidth(Math.round(el.clientWidth));
    update();
    const observer = new ResizeObserver(update); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
export function fitted(Impl, min = 260) {
  return function FittedChart(props) {
    const [ref, width] = useWidth();
    return <div ref={ref} className="oh-fit">{width ? <Impl {...props} w={Math.max(min, width)} /> : null}</div>;
  };
}

/* ---------- tooltip ---------- */
export function useTip() {
  const [tip, setTip] = useState(null);
  const hide = () => setTip(null);
  const bind = (data) => ({
    tabIndex: 0,
    onPointerMove: (event) => setTip({ x: event.clientX, y: event.clientY, data }),
    onPointerLeave: hide,
    onFocus: (event) => { const box = event.currentTarget.getBoundingClientRect(); setTip({ x: box.left + box.width / 2, y: box.top, data }); },
    onBlur: hide
  });
  return { tip, bind, show: (event, data) => setTip({ x: event.clientX, y: event.clientY, data }), hide };
}

export function TipLayer({ tip }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const { offsetWidth: width, offsetHeight: height } = ref.current;
    let left = tip.x + 14, top = tip.y + 14;
    if (left + width > window.innerWidth - 8) left = tip.x - width - 14;
    if (top + height > window.innerHeight - 8) top = tip.y - height - 14;
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [tip]);
  if (!tip) return null;
  return <div className="oh-tip" ref={ref} role="tooltip" style={{ left: position.left, top: position.top }}>
    <div className="oh-tip__t">{tip.data.t}</div>
    {tip.data.rows.map((row, index) => <div className="oh-tip__r" key={index}><i style={{ background: row[0] }}/><b>{row[1]}</b><span>{row[2]}</span></div>)}
  </div>;
}

export function Empty({ title, text }) {
  return <div className="oh-empty"><strong>{title}</strong><p>{text}</p></div>;
}

/* ---------- formas ---------- */
const barH = (x, y, w, h, r = 4) => { w = Math.max(w, 1); r = Math.min(r, w, h / 2); return `M${x} ${y}H${r1(x + w - r)}Q${r1(x + w)} ${y} ${r1(x + w)} ${r1(y + r)}V${r1(y + h - r)}Q${r1(x + w)} ${r1(y + h)} ${r1(x + w - r)} ${r1(y + h)}H${x}Z`; };
const barV = (x, base, w, h, r = 4) => { h = Math.max(h, 1); r = Math.min(r, w / 2, h); const top = r1(base - h); return `M${x} ${base}V${r1(top + r)}Q${x} ${top} ${r1(x + r)} ${top}H${r1(x + w - r)}Q${r1(x + w)} ${top} ${r1(x + w)} ${r1(top + r)}V${base}Z`; };
const niceMax = (value) => { if (value <= 0) return 1; const exp = 10 ** Math.floor(Math.log10(value)); const f = value / exp; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 5 ? 5 : 10) * exp; };

/* ---------- mini tendencia ---------- */
export function Spark({ points, color = COLORS.blue, w = 150, h = 38 }) {
  if (!points || points.length < 2 || points.every((value) => !value)) return <div className="oh-spark-empty" aria-hidden="true"/>;
  const min = Math.min(...points), max = Math.max(...points), pad = 5;
  const xs = points.map((_, i) => r1(pad + (i * (w - 2 * pad)) / (points.length - 1)));
  const ys = points.map((value) => r1(h - pad - ((value - min) / (max - min || 1)) * (h - 2 * pad)));
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  return <svg className="oh-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    <polygon fill={color} fillOpacity=".10" points={`${xs[0]},${h} ${line} ${xs.at(-1)},${h}`}/>
    <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={line}/>
    <circle cx={xs.at(-1)} cy={ys.at(-1)} r="4" fill={color} stroke="#fff" strokeWidth="2"/>
  </svg>;
}

/* ---------- líneas: ventas y gastos ---------- */
export const LineChart = fitted(LineChartImpl, 320);
function LineChartImpl({ series, labels, tip, w = 790 }) {
  const W = w, H = 250, x0 = 58, x1 = W - 90, y0 = 14, y1 = H - 46;
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const values = series.flatMap((s) => s.values);
  if (!values.some(Boolean)) return <Empty title="Sin movimientos en el periodo" text="El gráfico aparece cuando se registre el primer cobro o gasto."/>;
  const max = niceMax(Math.max(...values));
  const count = labels.length;
  const px = (i) => r1(count === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (count - 1));
  const py = (value) => r1(y1 - (value / max) * (y1 - y0));
  const points = (s) => s.values.map((value, i) => `${px(i)},${py(value)}`).join(" ");
  const ticks = [0, 1, 2, 3].map((i) => (max / 3) * i);
  const peak = series[0].values.indexOf(Math.max(...series[0].values));
  const every = Math.max(1, Math.ceil(count / 8));
  const move = (event) => {
    const box = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) * W) / box.width;
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < count; i += 1) { const d = Math.abs(px(i) - x); if (d < bestDistance) { bestDistance = d; best = i; } }
    setHover(best);
    tip.show(event, { t: labels[best], rows: series.map((s) => [s.color, money(s.values[best], 2), s.name]) });
  };
  return <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventas y gastos por día" className="oh-svg">
    {ticks.map((t) => <g key={t}><line x1={x0} x2={x1 + 12} y1={py(t)} y2={py(t)} stroke={COLORS.grid}/><text x={x0 - 10} y={py(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
    {series.map((s) => <polygon key={`a${s.name}`} fill={s.color} fillOpacity=".10" points={`${px(0)},${y1} ${points(s)} ${px(count - 1)},${y1}`}/>)}
    {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points(s)}/>)}
    {labels.map((label, i) => (i % every === 0 || i === count - 1) ? <text key={label + i} x={px(i)} y={y1 + 22} textAnchor="middle" className={i === count - 1 ? "is-strong" : ""}>{label}</text> : null)}
    {series.map((s) => <g key={`e${s.name}`}><circle cx={px(count - 1)} cy={py(s.values.at(-1))} r="4" fill={s.color} stroke="#fff" strokeWidth="2"/><text x={px(count - 1) + 12} y={py(s.values.at(-1)) + 4} className="is-strong">{fmt(s.values.at(-1))}</text></g>)}
    {series[0].values[peak] > 0 && peak !== count - 1 ? <g><circle cx={px(peak)} cy={py(series[0].values[peak])} r="4" fill={series[0].color} stroke="#fff" strokeWidth="2"/><text x={px(peak)} y={py(series[0].values[peak]) - 12} textAnchor="middle" className="is-strong">Máximo {fmt(series[0].values[peak])}</text></g> : null}
    {hover !== null ? <g pointerEvents="none"><line x1={px(hover)} x2={px(hover)} y1={y0} y2={y1} stroke={COLORS.muted} strokeOpacity=".55"/>{series.map((s) => <circle key={s.name} cx={px(hover)} cy={py(s.values[hover])} r="5" fill={s.color} stroke="#fff" strokeWidth="2"/>)}</g> : null}
    <rect x={x0 - 20} y={y0 - 8} width={x1 - x0 + 60} height={y1 - y0 + 16} fill="transparent" onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}/>
  </svg>;
}

/* ---------- barras agrupadas (ventas y gastos por servicio, Restaurante y Bar) ---------- */
export const GroupedBars = fitted(GroupedBarsImpl);
function GroupedBarsImpl({ rows, aName, bName, tip, extra, aColor = COLORS.blue, bColor = COLORS.red, format = fmt, tipFormat = (v) => money(v, 2), w = 360 }) {
  const W = w, rowH = 50, x0 = 96;
  const max = Math.max(...rows.flatMap((row) => [row.a, row.b]), 0);
  if (!max) return <Empty title="Sin datos en el periodo" text="Aparecerán al registrarse movimientos."/>;
  const scale = Math.max(40, W - x0 - 80) / max;
  return <svg viewBox={`0 0 ${W} ${rows.length * rowH + 12}`} role="img" aria-label={`${aName} y ${bName}`} className="oh-svg">
    <line x1={x0} x2={x0} y1="4" y2={rows.length * rowH + 4} stroke={COLORS.grid}/>
    {rows.map((row, i) => { const y = 8 + i * rowH; return <g key={row.name} className="oh-hv" {...tip.bind({ t: row.name, rows: [[aColor, tipFormat(row.a), aName], [bColor, tipFormat(row.b), bName], ...(extra ? extra(row) : [])] })}>
      <rect x="0" y={y - 4} width={W} height={rowH - 4} fill="transparent"/>
      <text x={x0 - 10} y={y + 21} textAnchor="end" className="is-label">{row.name}</text>
      <path d={barH(x0, y + 2, row.a * scale, 14)} fill={aColor}/><text x={r1(x0 + row.a * scale + 8)} y={y + 14} className="is-strong">{format(row.a)}</text>
      <path d={barH(x0, y + 19, row.b * scale, 14)} fill={bColor}/><text x={r1(x0 + row.b * scale + 8)} y={y + 31}>{format(row.b)}</text>
    </g>; })}
  </svg>;
}

/* ---------- columnas: afluencia por hora (énfasis en la hora pico) ---------- */
export const HourColumns = fitted(HourColumnsImpl);
function HourColumnsImpl({ hourly, peak, tip, w = 360 }) {
  const W = w, H = 210, x0 = 34, base = 176;
  const hours = hourly.filter((item) => item.hour >= 6 && item.hour <= 23);
  if (!hours.some((item) => item.count)) return <Empty title="Sin ingresos validados hoy" text="La afluencia aparece cuando el personal registra ingresos."/>;
  const max = niceMax(Math.max(...hours.map((item) => item.count), 1));
  const scale = (base - 30) / max, band = (W - x0 - 8) / hours.length;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Personas que ingresaron por hora" className="oh-svg">
    {[0, max / 2, max].map((t) => <g key={t}><line x1={x0} x2={W - 6} y1={r1(base - t * scale)} y2={r1(base - t * scale)} stroke={COLORS.grid}/><text x={x0 - 8} y={r1(base - t * scale + 4)} textAnchor="end">{fmt(t)}</text></g>)}
    {hours.map((item, i) => { const isPeak = peak && item.hour === peak.hour; const x = r1(x0 + i * band + (band - 14) / 2); return <g key={item.hour} className="oh-hv" {...tip.bind({ t: `${item.hour}:00 – ${item.hour + 1}:00`, rows: [[isPeak ? COLORS.blue : COLORS.gray, `${item.count} personas`, "Ingresos validados"]] })}>
      <rect x={r1(x0 + i * band)} y="20" width={r1(band)} height={base - 20} fill="transparent"/>
      {item.count ? <path d={barV(x, base, 14, item.count * scale)} fill={isPeak ? COLORS.blue : COLORS.gray}/> : null}
    </g>; })}
    {peak ? <text x={r1(x0 + hours.findIndex((item) => item.hour === peak.hour) * band + band / 2)} y={r1(base - peak.count * scale - 8)} textAnchor="middle" className="is-strong">{peak.count}</text> : null}
    {hours.map((item, i) => item.hour % 2 === 0 ? <text key={item.hour} x={r1(x0 + i * band + band / 2)} y={base + 20} textAnchor="middle">{item.hour}h</text> : null)}
    <line x1={x0} x2={W - 6} y1={base} y2={base} stroke={COLORS.axis}/>
  </svg>;
}

/* ---------- barras tipo medidor: personas dentro frente al aforo ---------- */
export const Bullets = fitted(BulletsImpl);
function BulletsImpl({ rows, total, tip, w = 360 }) {
  const W = w, x0 = 90, track = Math.max(80, W - x0 - 96);
  return <svg viewBox={`0 0 ${W} ${rows.length * 44 + 52}`} role="img" aria-label="Personas dentro frente al aforo" className="oh-svg">
    {rows.map((row, i) => { const y = 10 + i * 44; const pct = row.capacity ? Math.min(1, row.inside / row.capacity) : 0; return <g key={row.code} className="oh-hv" {...tip.bind({ t: row.name, rows: [[COLORS.blue, `${row.inside} personas`, row.estimated ? "Dentro ahora (estimado)" : "Dentro ahora"], [COLORS.muted, row.capacity ? `${row.capacity} personas` : "Sin aforo definido", "Aforo"], ...(row.capacity ? [[COLORS.muted, `${Math.round(pct * 100)}%`, "Ocupación"]] : [])] })}>
      <rect x="0" y={y - 6} width={W} height="40" fill="transparent"/>
      <text x={x0 - 10} y={y + 14} textAnchor="end" className="is-label">{row.name}</text>
      <path d={barH(x0, y + 4, track, 14)} fill={COLORS.track}/>{row.inside > 0 ? <path d={barH(x0, y + 4, Math.max(6, track * pct), 14)} fill={COLORS.blue}/> : null}
      <text x={W - 4} y={y + 15} textAnchor="end" className="is-strong">{row.inside}<tspan className="is-muted">{row.capacity ? ` / ${fmt(row.capacity)}` : ""}{row.estimated ? " ≈" : ""}</tspan></text>
    </g>; })}
    <line x1="8" x2={W - 4} y1={rows.length * 44 + 14} y2={rows.length * 44 + 14} stroke={COLORS.grid}/>
    <text x="8" y={rows.length * 44 + 36} className="is-label">Total</text>
    <text x={W - 4} y={rows.length * 44 + 36} textAnchor="end" className="is-strong">{total.value}<tspan className="is-muted">{total.capacity ? ` / ${fmt(total.capacity)} · ${Math.round((total.value / total.capacity) * 100)}%` : ""}</tspan></text>
  </svg>;
}

/* ---------- margen frente a la meta (énfasis en lo que queda bajo la meta) ---------- */
export const MarginBars = fitted(MarginBarsImpl);
function MarginBarsImpl({ rows, target = 60, tip, w = 360 }) {
  const W = w, x0 = 96, scale = Math.max(60, W - x0 - 60) / 100;
  const list = rows.filter((row) => row.margin !== null).sort((a, b) => b.margin - a.margin);
  if (!list.length) return <Empty title="Sin ventas en el periodo" text="El margen se calcula cuando hay ventas registradas."/>;
  const below = list.filter((row) => row.margin < target);
  return <svg viewBox={`0 0 ${W} ${list.length * 44 + 62}`} role="img" aria-label="Margen por servicio frente a la meta" className="oh-svg">
    {list.map((row, i) => { const y = 26 + i * 44; const low = row.margin < target; const width = Math.max(0, Math.min(100, row.margin)) * scale; return <g key={row.code} className="oh-hv" {...tip.bind({ t: row.name, rows: [[low ? COLORS.blue : COLORS.gray, `${row.margin}%`, "Margen"], [COLORS.muted, `${target}%`, "Meta"], [COLORS.muted, money(row.profit, 2), "Utilidad"]] })}>
      <rect x="0" y={y - 8} width={W} height="40" fill="transparent"/>
      <text x={x0 - 10} y={y + 13} textAnchor="end" className={low ? "is-label is-strong" : "is-label"}>{row.name}</text>
      <path d={barH(x0, y + 2, Math.max(width, 2), 16)} fill={low ? COLORS.blue : COLORS.gray}/>
      <text x={r1(x0 + width + 8)} y={y + 15} className="is-strong">{row.margin}%</text>
    </g>; })}
    <line x1={x0 + target * scale} x2={x0 + target * scale} y1="14" y2={list.length * 44 + 10} stroke={COLORS.ink} strokeOpacity=".7"/>
    <text x={x0 + target * scale} y="10" textAnchor="middle" className="is-strong">Meta {target}%</text>
    <text x={x0} y={list.length * 44 + 32}>{below.length ? `${below.map((row) => row.name).join(", ")} ${below.length > 1 ? "quedan" : "queda"} bajo la meta` : "Todos los servicios cumplen la meta"}</text>
  </svg>;
}

/* ---------- mapa de calor: consumo por servicio de origen ---------- */
export function Heatmap({ rows, tip }) {
  const cols = [["servicio", "Servicio"], ["restaurante", "Restaurante"], ["bar", "Bar"]];
  const totals = rows.map((row) => row.servicio + row.restaurante + row.bar);
  const all = totals.reduce((a, b) => a + b, 0);
  if (!all) return <Empty title="Sin consumo en el periodo" text="Aquí verás cuánto consumió cada servicio de origen en Restaurante y Bar."/>;
  const maxCell = Math.max(...rows.flatMap((row) => cols.map(([key]) => row[key])), 1);
  const steps = [maxCell * 0.1, maxCell * 0.35, maxCell * 0.7];
  const bin = (value) => value <= 0 ? { bg: "#EEF3FA", fg: COLORS.muted, border: "1px solid #D8E1EE" } : value < steps[0] ? { bg: COLORS.mid, fg: COLORS.ink } : value < steps[1] ? { bg: COLORS.blue, fg: "#fff" } : value < steps[2] ? { bg: COLORS.deep, fg: "#fff" } : { bg: COLORS.navy, fg: "#fff" };
  const columnTotal = (key) => rows.reduce((total, row) => total + row[key], 0);
  return <>
    <div className="oh-heat">
      <div className="hh"/>{cols.map(([, label]) => <div className="hh" key={label}>{label}</div>)}<div className="hh n">Total</div>
      {rows.map((row, i) => <div key={row.code} style={{ display: "contents" }}>
        <div className="hr">{row.name}</div>
        {cols.map(([key, label]) => { const style = bin(row[key]); return <div key={key} className="hc" style={{ background: style.bg, color: style.fg, border: style.border }} {...tip.bind({ t: `${row.name} → ${label}`, rows: [[style.bg, money(row[key], 2), label], [COLORS.muted, `${totals[i] ? Math.round((row[key] / totals[i]) * 100) : 0}%`, `del consumo de ${row.name}`]] })}>{fmt(row[key])}</div>; })}
        <div className="ht">{fmt(totals[i])}</div>
      </div>)}
      <div className="hr tot">Total</div>{cols.map(([key]) => <div className="ht tot" key={key}>{fmt(columnTotal(key))}</div>)}<div className="ht tot">{fmt(all)}</div>
    </div>
    <div className="oh-heat-legend"><span>Menos</span>
      <i style={{ background: "#EEF3FA", border: "1px solid #D8E1EE" }}/>0<i style={{ background: COLORS.mid }}/>&lt; {fmt(steps[0])}<i style={{ background: COLORS.blue }}/>{fmt(steps[0])} – {fmt(steps[1])}<i style={{ background: COLORS.deep }}/>{fmt(steps[1])} – {fmt(steps[2])}<i style={{ background: COLORS.navy }}/>≥ {fmt(steps[2])}<span>Más · S/</span></div>
  </>;
}

/* ---------- plano de habitaciones ---------- */
const ROOM_STATE = { OCUPADA: ["occ", "Ocupada"], LIBRE: ["free", "Libre"], EN_LIMPIEZA: ["clean", "En limpieza"], MANTENIMIENTO: ["mnt", "Mantenimiento"], BLOQUEADA: ["mnt", "Bloqueada"] };
export function RoomsMap({ rooms, tip }) {
  if (!rooms.length) return <Empty title="Sin habitaciones registradas" text="Las habitaciones aparecerán aquí."/>;
  const floors = [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b);
  const columns = Math.max(...floors.map((floor) => rooms.filter((room) => room.floor === floor).length));
  const counts = { occ: 0, clean: 0, mnt: 0, free: 0 };
  rooms.forEach((room) => { counts[(ROOM_STATE[room.status] || ROOM_STATE.LIBRE)[0]] += 1; });
  return <>
    <div className="oh-rooms" style={{ gridTemplateColumns: `48px repeat(${columns}, minmax(0, 1fr))` }}>
      {floors.map((floor) => <div key={floor} style={{ display: "contents" }}>
        <div className="fl">Piso {floor}</div>
        {rooms.filter((room) => room.floor === floor).map((room) => { const [kind, label] = ROOM_STATE[room.status] || ROOM_STATE.LIBRE; return <div key={room.id} className={`rm ${kind}`} {...tip.bind({ t: `Habitación ${room.number}`, rows: [[kind === "occ" ? COLORS.blue : kind === "clean" ? COLORS.mid : kind === "mnt" ? COLORS.muted : COLORS.gray, label, "Estado"]] })}>{room.number}</div>; })}
      </div>)}
    </div>
    <div className="oh-rooms-legend">
      <span><i className="rm occ"/>Ocupada {counts.occ}</span><span><i className="rm clean"/>En limpieza {counts.clean}</span><span><i className="rm mnt"/>Mantenimiento {counts.mnt}</span><span><i className="rm free"/>Libre {counts.free}</span>
    </div>
  </>;
}

/* ---------- ocupación hotelera ---------- */
export const OccupancyChart = fitted(OccupancyChartImpl);
function OccupancyChartImpl({ data, tip, w = 440 }) {
  const W = w, H = 150, x0 = 48, x1 = W - 20, y0 = 10, y1 = 112;
  if (!data.length || data.every((item) => !item.percent)) return <Empty title="Sin ocupación registrada" text="La ocupación se calcula con las estadías del hotel."/>;
  const px = (i) => r1(x0 + (i * (x1 - x0)) / Math.max(1, data.length - 1));
  const py = (value) => r1(y1 - (value / 100) * (y1 - y0));
  const line = data.map((item, i) => `${px(i)},${py(item.percent)}`).join(" ");
  const last = data.length - 1;
  const peakIndex = data.reduce((best, item, i) => (item.percent > data[best].percent ? i : best), 0);
  const shortDate = (date) => { const [, month, day] = date.split("-"); return `${Number(day)}/${Number(month)}`; };
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ocupación hotelera de los últimos 14 días" className="oh-svg">
    {[0, 50, 100].map((t) => <g key={t}><line x1={x0} x2={W - 6} y1={py(t)} y2={py(t)} stroke={COLORS.grid}/><text x={x0 - 8} y={py(t) + 4} textAnchor="end">{t}%</text></g>)}
    <polygon fill={COLORS.blue} fillOpacity=".10" points={`${px(0)},${y1} ${line} ${px(last)},${y1}`}/>
    <polyline fill="none" stroke={COLORS.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={line}/>
    <circle cx={px(last)} cy={py(data[last].percent)} r="4" fill={COLORS.blue} stroke="#fff" strokeWidth="2"/><text x={px(last)} y={py(data[last].percent) + 24} textAnchor="end" className="is-strong">{data[last].percent}% hoy</text>
    {peakIndex !== last ? <g><circle cx={px(peakIndex)} cy={py(data[peakIndex].percent)} r="4" fill={COLORS.blue} stroke="#fff" strokeWidth="2"/><text x={px(peakIndex)} y={py(data[peakIndex].percent) - 10} textAnchor="middle" className="is-strong">{data[peakIndex].percent}%</text></g> : null}
    <text x={px(0)} y={y1 + 22}>{shortDate(data[0].date)}</text><text x={px(last)} y={y1 + 22} textAnchor="end">Hoy</text>
    {data.map((item, i) => <g key={item.date} className="oh-hv" {...tip.bind({ t: i === last ? "Hoy" : shortDate(item.date), rows: [[COLORS.blue, `${item.percent}%`, "Ocupación"]] })}><rect x={r1(px(i) - 12)} y={y0 - 4} width="24" height={y1 - y0 + 8} fill="transparent"/></g>)}
  </svg>;
}

/* ---------- barra apilada con leyenda ---------- */
export const StackedBar = fitted(StackedBarImpl);
function StackedBarImpl({ segments, label, tip, showLegend = true, legendValue = "percent", format = fmt, w = 360 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) return <Empty title="Sin datos en el periodo" text="Se mostrará cuando haya movimientos."/>;
  const W = w, H = 34, gap = 2, inner = W - gap * (segments.length - 1);
  let x = 0;
  return <>
    <svg viewBox={`0 0 ${W} ${H + 8}`} role="img" aria-label={label} className="oh-svg oh-stack">
      {segments.map((s) => { const width = (s.value / total) * inner; const left = x; x += width + gap; return <g key={s.name} className="oh-hv" {...tip.bind({ t: s.name, rows: [[s.color, s.tooltip || money(s.value, 2), label], [COLORS.muted, `${Math.round((s.value / total) * 100)}%`, "del total"]] })}>
        <rect x={r1(left)} y="4" width={r1(Math.max(width, 0))} height={H} rx="4" fill={s.color}/>
        {width > 44 ? <text x={r1(left + width / 2)} y={4 + H / 2 + 5} textAnchor="middle" style={{ fill: s.text || "#fff" }} className="is-strong">{format(s.value)}</text> : null}
      </g>; })}
    </svg>
    {showLegend ? <div className="oh-legend-rows">{segments.map((s) => <div key={s.name}><i style={{ background: s.color }}/><span>{s.name}</span><b>{legendValue === "percent" ? `${Math.round((s.value / total) * 100)}%` : format(s.value)}</b></div>)}</div> : null}
  </>;
}

/* ---------- columnas verticales genéricas, con énfasis en las que se indiquen ---------- */
export const Columns = fitted(ColumnsImpl);
function ColumnsImpl({ values, labels, highlight = [], name, tip, w = 400, h = 220, valueLabel = fmt, everyLabel = 1 }) {
  if (!values.some(Boolean)) return <Empty title="Sin datos en el periodo" text="El gráfico aparece cuando haya movimientos."/>;
  const x0 = 34, base = h - 34, max = niceMax(Math.max(...values, 1)), scale = (base - 24) / max, band = (w - x0 - 8) / values.length, bw = Math.min(18, band - 6);
  return <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={name} className="oh-svg">
    {[0, max / 2, max].map((t) => <g key={t}><line x1={x0} x2={w - 6} y1={r1(base - t * scale)} y2={r1(base - t * scale)} stroke={COLORS.grid}/><text x={x0 - 8} y={r1(base - t * scale + 4)} textAnchor="end">{fmt(t)}</text></g>)}
    {values.map((v, i) => { const x = r1(x0 + i * band + (band - bw) / 2); const on = highlight.includes(i); return <g key={labels[i] + i} className="oh-hv" {...(tip ? tip.bind({ t: labels[i], rows: [[on ? COLORS.blue : COLORS.gray, valueLabel(v), name]] }) : {})}><rect x={r1(x0 + i * band)} y="14" width={r1(band)} height={base - 14} fill="transparent"/>{v ? <path d={barV(x, base, bw, v * scale)} fill={on ? COLORS.blue : COLORS.gray}/> : null}</g>; })}
    {highlight.map((i) => values[i] ? <text key={`h${i}`} x={r1(x0 + i * band + band / 2)} y={r1(base - values[i] * scale - 8)} textAnchor="middle" className="is-strong">{valueLabel(values[i])}</text> : null)}
    {labels.map((label, i) => i % everyLabel === 0 || i === labels.length - 1 ? <text key={label + i} x={r1(x0 + i * band + band / 2)} y={base + 20} textAnchor="middle">{label}</text> : null)}
    <line x1={x0} x2={w - 6} y1={base} y2={base} stroke={COLORS.axis}/>
  </svg>;
}

/* ---------- barras horizontales de una sola serie (ranking) ---------- */
export const HBars = fitted(HBarsImpl);
function HBarsImpl({ rows, name, tip, x0 = 116, w = 400, valueLabel = fmt, tooltipLabel = "Valor" }) {
  if (!rows.length || !rows.some((row) => row.value)) return <Empty title="Sin datos en el periodo" text="Aparecerá cuando haya movimientos."/>;
  const rowH = 34, max = Math.max(...rows.map((row) => row.value), 1), scale = (w - x0 - 60) / max;
  return <svg viewBox={`0 0 ${w} ${rows.length * rowH + 8}`} role="img" aria-label={name} className="oh-svg">
    <line x1={x0} x2={x0} y1="2" y2={rows.length * rowH} stroke={COLORS.grid}/>
    {rows.map((row, i) => { const y = 6 + i * rowH; return <g key={row.name} className="oh-hv" {...tip.bind({ t: row.name, rows: [[COLORS.blue, valueLabel(row.value), tooltipLabel]] })}>
      <rect x="0" y={y - 4} width={w} height={rowH - 4} fill="transparent"/>
      <text x={x0 - 10} y={y + 15} textAnchor="end" className="is-label">{row.name}</text>
      <path d={barH(x0, y + 2, row.value * scale, 18)} fill={COLORS.blue}/>
      <text x={r1(x0 + row.value * scale + 8)} y={y + 15} className="is-strong">{valueLabel(row.value)}</text>
    </g>; })}
  </svg>;
}

/* ---------- filas apiladas: una barra por fila con varios segmentos (libro de consumo por servicio) ---------- */
export const StackedRows = fitted(StackedRowsImpl);
function StackedRowsImpl({ rows, series, name, tip, w = 560, x0 = 100 }) {
  const totals = rows.map((row) => row.values.reduce((a, b) => a + b, 0));
  if (!totals.some(Boolean)) return <Empty title="Sin consumo registrado" text="Aparecerá cuando el cliente tenga pagos aprobados."/>;
  const max = Math.max(...totals, 1), scale = (w - x0 - 80) / max, rowH = 44;
  return <svg viewBox={`0 0 ${w} ${rows.length * rowH + 8}`} role="img" aria-label={name} className="oh-svg">
    <line x1={x0} x2={x0} y1="2" y2={rows.length * rowH} stroke={COLORS.grid}/>
    {rows.map((row, i) => {
      const y = 8 + i * rowH; let x = x0; const total = totals[i];
      const segments = [];
      row.values.forEach((v, k) => {
        const width = v * scale;
        if (width > 0) segments.push(<rect key={`r${k}`} x={r1(x)} y={y + 2} width={r1(Math.max(width - 2, 1))} height="22" fill={series[k].color} rx={k === row.values.length - 1 ? 4 : 0}/>);
        if (width > 40) segments.push(<text key={`t${k}`} x={r1(x + width / 2 - 1)} y={y + 17} textAnchor="middle" style={{ fill: series[k].text }} className="is-strong">{fmt(v)}</text>);
        x += width;
      });
      return <g key={row.name} className="oh-hv" {...tip.bind({ t: row.name, rows: [...row.values.map((v, k) => [series[k].color, money(v, 2), series[k].name]), [COLORS.muted, money(total, 2), "Total"]] })}>
        <rect x="0" y={y - 6} width={w} height={rowH - 2} fill="transparent"/>
        <text x={x0 - 10} y={y + 17} textAnchor="end" className="is-label">{row.name}</text>
        {segments}
        <text x={r1(x + 8)} y={y + 17} className="is-strong">{money(total, 2)}</text>
      </g>;
    })}
  </svg>;
}
