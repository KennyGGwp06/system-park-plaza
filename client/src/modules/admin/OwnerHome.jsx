// Inicio del Superadmin: resumen ejecutivo. Todos los números vienen calculados de GET /api/superadmin/home.
import { useState } from "react";
import { AlertTriangle, ArrowRight, Download, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Bullets, COLORS, Empty, GroupedBars, Heatmap, HourColumns, LineChart, MarginBars, OccupancyChart, RoomsMap, Spark, StackedBar, TipLayer, fmt, money, useTip } from "./OwnerCharts";
import "./OwnerHome.css";

const PRESETS = [["hoy", "Hoy"], ["7d", "7 días"], ["mes", "Mes"], ["rango", "Rango…"]];
const TIME_ZONE = "America/Lima";

/** Convierte la selección del periodo en los parámetros que entiende la API. */
export function homeQuery(range) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  if (range.preset === "7d") return "days=7";
  if (range.preset === "mes") return `from=${today.slice(0, 8)}01&to=${today}`;
  if (range.preset === "rango" && range.from && range.to) return `from=${range.from}&to=${range.to}`;
  return "days=1";
}

const dayLabel = (date, today) => {
  if (date === today) return `Hoy ${Number(date.slice(8))}`;
  const text = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const shortDate = (date) => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
const periodLabel = (range) => range.days === 1 ? "Hoy" : `Del ${shortDate(range.from)} al ${shortDate(range.to)}`;
const longDate = (date) => { const text = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); return text.charAt(0).toUpperCase() + text.slice(1); };
const timeOf = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const stamp = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE })} · ${timeOf(iso)}`; };
const unitText = (change, value) => value === null || value === undefined ? "—" : change.unit === "S/" ? money(value, 2) : change.unit === "estado" ? (value ? "Visible" : "Oculto") : `${value} ${change.unit}`;

function exportCsv(data) {
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Park Plaza · Resumen ejecutivo"], ["Periodo", `${data.range.from} a ${data.range.to}`], [],
    ["Indicador", "Valor"], ["Ventas netas", data.kpis.sales.value], ["Gastos", data.kpis.expenses.value], ["Utilidad", data.kpis.profit.value], ["Personas dentro", data.kpis.inside.value], ["Por cobrar", data.kpis.receivable.value], [],
    ["Servicio", "Ventas", "Gastos", "Utilidad", "Margen %", "Dentro", "Aforo", "Por cobrar"],
    ...data.services.map((s) => [s.name, s.sales, s.expenses, s.profit, s.margin ?? "", s.inside, s.capacity ?? "", s.receivable]), [],
    ["Origen del consumo", "Servicio", "Restaurante", "Bar"], ...data.origin.map((row) => [row.name, row.servicio, row.restaurante, row.bar])
  ].map((line) => line.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `park-plaza-resumen-${data.range.to}.csv`; link.click();
  URL.revokeObjectURL(url);
}

function Card({ title, sub, legend, action, children, className = "" }) {
  return <section className={`oh-card ${className}`}>
    <div className="oh-ch"><h2>{title}</h2>{legend ? <div className="oh-leg">{legend}</div> : null}{action}</div>
    {sub ? <div className="oh-ch2">{sub}</div> : null}
    <div className="oh-body">{children}</div>
  </section>;
}
const Legend = ({ items }) => items.map(([label, color, kind]) => <span key={label}><i className={kind === "sq" ? "sq" : ""} style={{ background: color }}/>{label}</span>);

function Delta({ change, upIsGood = true, label }) {
  if (change === null || change === undefined) return <span>sin periodo anterior</span>;
  const good = (change >= 0) === upIsGood;
  return <><b className={good ? "up" : "dn"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</b> {label}</>;
}

export function OwnerHome({ data, loading, error, reload, range, setRange, navigate }) {
  const tip = useTip();
  const [custom, setCustom] = useState({ from: range.from || "", to: range.to || "" });
  if (!data && loading) return <main className="oh"><LoadingSpinner label="Actualizando el resumen ejecutivo..."/></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudo cargar el resumen</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { kpis, series, services, hourly, origin, rooms, occupancy, payments, gastronomy, orderStates, pending, recent, unassigned, notes } = data;
  const period = periodLabel(data.range);
  const compare = data.range.days === 1 ? "vs. ayer" : "vs. periodo anterior";
  const labels = series.map((item) => dayLabel(item.date, data.today));
  const sorted = [...services].sort((a, b) => b.sales - a.sales);
  const bySales = sorted.map((s) => ({ name: s.name, a: s.sales, b: s.expenses, margin: s.margin, profit: s.profit }));
  const gap = unassigned.expenses + unassigned.general;
  const areaColor = { Nuevo: COLORS.mid, "En preparación": COLORS.blue, Listo: COLORS.deep, Entregado: COLORS.navy };
  const methodMeta = [["EFECTIVO", "Efectivo", COLORS.navy, "#fff"], ["YAPE", "Yape", COLORS.deep, "#fff"], ["PLIN", "Plin", COLORS.blue, "#fff"], ["OTROS", "Otros", COLORS.mid, COLORS.ink]];
  const methodSegments = methodMeta.map(([key, name, color, text]) => ({ name, color, text, value: payments.methods.find((m) => m.key === key)?.amount || 0 })).filter((s) => s.value > 0);
  const channelSegments = [["RECEPCION", "Recepción y caja", COLORS.deep], ["APP", "App del cliente", COLORS.blue]].map(([key, name, color]) => ({ name, color, value: payments.channels.find((c) => c.key === key)?.amount || 0 })).filter((s) => s.value > 0);
  const floors = new Set(rooms.map((room) => room.floor)).size;
  const inside = [...services].sort((a, b) => (b.capacity ? b.inside / b.capacity : 0) - (a.capacity ? a.inside / a.capacity : 0));

  const applyCustom = () => { if (custom.from && custom.to && custom.from <= custom.to) setRange({ preset: "rango", from: custom.from, to: custom.to }); };

  return <main className="oh">
    <TipLayer tip={tip.tip}/>
    <div className="oh-ph">
      <div><h1>Resumen ejecutivo</h1><p>{longDate(data.today)} · Actualizado a las {timeOf(data.generatedAt)}</p></div>
      <div className="oh-tools">
        <div className="oh-seg" role="group" aria-label="Periodo">{PRESETS.map(([key, label]) => <button key={key} type="button" className={range.preset === key ? "on" : ""} onClick={() => key === "rango" ? setRange({ preset: "rango", from: custom.from, to: custom.to }) : setRange({ preset: key })}>{label}</button>)}</div>
        <div className="oh-sel">Comparar con <b>periodo anterior</b></div>
        <button type="button" className="oh-btn" onClick={() => exportCsv(data)}><Download size={16}/>Exportar</button>
        <button type="button" className="oh-btn p" onClick={reload}><RefreshCw size={16}/>Actualizar</button>
      </div>
    </div>
    {range.preset === "rango" ? <div className="oh-range"><label>Desde<input type="date" value={custom.from} max={data.today} onChange={(e) => setCustom({ ...custom, from: e.target.value })}/></label><label>Hasta<input type="date" value={custom.to} max={data.today} onChange={(e) => setCustom({ ...custom, to: e.target.value })}/></label><button type="button" className="oh-btn p" onClick={applyCustom} disabled={!custom.from || !custom.to || custom.from > custom.to}>Aplicar</button></div> : null}

    {gap > 0 || unassigned.sales > 0 ? <div className="oh-alert"><AlertTriangle size={18}/><div><strong>Datos por clasificar</strong>
      <span>{unassigned.expenses > 0 ? `${money(unassigned.expenses, 2)} en gastos sin servicio asignado. ` : ""}{unassigned.general > 0 ? `${money(unassigned.general, 2)} en gastos generales (compartidos). ` : ""}{unassigned.sales > 0 ? `${money(unassigned.sales, 2)} en cobros sin servicio de origen. ` : ""}Asigna cada movimiento a un servicio para que el resultado por servicio sea exacto.</span></div>
      <button type="button" onClick={() => navigate("dinero", "gastos")}>Ir a gastos <ArrowRight size={14}/></button></div> : null}

    {/* KPIs */}
    <section className="oh-card oh-kpis" aria-label="Indicadores principales">
      <div className="k"><div className="l">Ventas netas</div><div className="v">{money(kpis.sales.value)}</div><div className="d"><Delta change={kpis.sales.change} label={compare}/></div><Spark points={series.map((s) => s.sales)} color={COLORS.blue}/></div>
      <div className="k"><div className="l">Gastos</div><div className="v">{money(kpis.expenses.value)}</div><div className="d"><Delta change={kpis.expenses.change} upIsGood={false} label={compare}/></div><Spark points={series.map((s) => s.expenses)} color={COLORS.red}/></div>
      <div className="k"><div className="l">Utilidad</div><div className="v">{money(kpis.profit.value)}</div><div className="d"><Delta change={kpis.profit.change} label={kpis.profit.margin !== null ? `· margen ${kpis.profit.margin}%` : ""}/></div><Spark points={series.map((s) => s.profit)} color={COLORS.blue}/></div>
      <div className="k"><div className="l">Personas dentro</div><div className="v">{fmt(kpis.inside.value)}</div><div className="d">{kpis.inside.capacity ? `${Math.round((kpis.inside.value / kpis.inside.capacity) * 100)}% del aforo (${fmt(kpis.inside.capacity)})` : "Aforo sin definir"}</div><div className="km"><i style={{ width: `${kpis.inside.capacity ? Math.min(100, (kpis.inside.value / kpis.inside.capacity) * 100) : 0}%` }}/></div></div>
      <div className="k"><div className="l">Por cobrar y anticipos</div><div className="v">{money(kpis.receivable.value)}</div><div className="d">{kpis.receivable.count} {kpis.receivable.count === 1 ? "reserva con saldo" : "reservas con saldo"}</div><div className="oh-mini">{sorted.filter((s) => s.receivable > 0).slice(0, 3).map((s) => <span key={s.code}>{s.name} <b>{money(s.receivable)}</b></span>)}</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Ventas y gastos" sub={`${series.length} días · S/`} legend={<Legend items={[["Ventas", COLORS.blue], ["Gastos", COLORS.red]]}/>}>
        <LineChart series={[{ name: "Ventas", color: COLORS.blue, values: series.map((s) => s.sales) }, { name: "Gastos", color: COLORS.red, values: series.map((s) => s.expenses) }]} labels={labels} tip={tip}/>
        <details className="oh-tv"><summary>Ver datos como tabla</summary><table><thead><tr><th>Día</th><th className="n">Ventas</th><th className="n">Gastos</th><th className="n">Utilidad</th></tr></thead><tbody>{series.map((s, i) => <tr key={s.date}><td>{labels[i]}</td><td className="n">{money(s.sales, 2)}</td><td className="n">{money(s.expenses, 2)}</td><td className="n">{money(s.profit, 2)}</td></tr>)}</tbody></table></details>
      </Card>
      <Card title="Resultado por servicio" sub={`${period} · S/`} legend={<Legend items={[["Ventas", COLORS.blue, "sq"], ["Gastos", COLORS.red, "sq"]]}/>}>
        <GroupedBars rows={bySales} aName="Ventas" bName="Gastos" tip={tip} extra={(row) => [[COLORS.muted, row.margin === null ? "—" : `${row.margin}%`, "Margen"]]}/>
      </Card>
    </div>

    <div className="oh-grid g-3">
      <Card title="Afluencia por hora" sub={data.peakHour ? `Personas que ingresaron hoy · hora pico ${data.peakHour.hour}:00` : "Personas que ingresaron hoy"}><HourColumns hourly={hourly} peak={data.peakHour} tip={tip}/></Card>
      <Card title="Personas dentro ahora" sub="Frente al aforo de cada servicio · ≈ estimado"><Bullets rows={inside.map((s) => ({ code: s.code, name: s.name, inside: s.inside, capacity: s.capacity, estimated: s.estimated }))} total={kpis.inside} tip={tip}/></Card>
      <Card title="Margen por servicio" sub="Utilidad sobre ventas, frente a la meta"><MarginBars rows={services} tip={tip}/></Card>
    </div>

    <div className="oh-grid g-7-5">
      <Card title="Consumo por servicio de origen" sub={`${period} · lo que gasta cada cliente se suma al servicio por el que vino · S/`}><Heatmap rows={origin} tip={tip}/></Card>
      <Card title="Estado de habitaciones" sub={`${rooms.length} habitaciones · ${floors} ${floors === 1 ? "piso" : "pisos"}`}>
        <RoomsMap rooms={rooms} tip={tip}/>
        <div className="oh-sub2">Ocupación hotelera · últimos 14 días</div>
        <OccupancyChart data={occupancy} tip={tip}/>
      </Card>
    </div>

    <div className="oh-grid g-3">
      <Card title="Restaurante y Bar" sub={`${period} · ventas y costo de recetas · S/`} legend={<Legend items={[["Ventas", COLORS.blue, "sq"], ["Costo", COLORS.red, "sq"]]}/>}>
        <GroupedBars rows={gastronomy.map((g) => ({ name: g.name, a: g.sales, b: g.cost, margin: g.margin }))} aName="Ventas" bName="Costo de recetas" tip={tip} extra={(row) => [[COLORS.muted, row.margin === null ? "—" : `${row.margin}%`, "Margen"]]}/>
        <div className="oh-sub2">Pedidos de hoy por estado</div>
        <StackedBar label="Pedidos" tip={tip} format={fmt} legendValue="count" segments={orderStates.map((s) => ({ name: s.label, value: s.count, color: areaColor[s.label], text: s.label === "Nuevo" ? COLORS.ink : "#fff", tooltip: `${s.count} pedidos` })).filter((s) => s.value > 0)}/>
      </Card>
      <Card title="Cobros por método de pago" sub={`${period} · ${money(kpis.sales.value)}`}>
        <StackedBar label="Cobrado" tip={tip} segments={methodSegments}/>
        {payments.toVerify.count ? <div className="oh-note">{payments.toVerify.count} {payments.toVerify.count === 1 ? "pago" : "pagos"} por verificar · {money(payments.toVerify.amount, 2)}</div> : null}
        <div className="oh-sub2">Cobros por canal</div>
        <StackedBar label="Cobrado" tip={tip} segments={channelSegments}/>
      </Card>
      <Card title="Pendientes de tu decisión" sub={pending.length ? `${pending.length} ${pending.length === 1 ? "asunto" : "asuntos"}` : "Todo en orden"}>
        {pending.length ? <div className="oh-pend">{pending.map((item) => <div key={item.key}><b className={`n ${item.tone}`}>{item.count}</b><div>{item.label}<span>{item.detail}</span></div><button type="button" onClick={() => navigate(item.go[0], item.go[1])}>Revisar</button></div>)}</div>
          : <Empty title="No hay decisiones pendientes" text="Cierres de caja, pagos por verificar, stock e incidencias están al día."/>}
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Cambios recientes en el sistema</h2><small>Quién, qué y cuánto cambió</small><button type="button" className="oh-link" onClick={() => navigate("sistema", "auditoria")}>Abrir auditoría</button></div>
      {recent.length ? <table className="oh-table"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Módulo</th><th>Detalle</th></tr></thead><tbody>
        {recent.map((item) => <tr key={item.id}><td className="mut">{stamp(item.at)}</td><td>{item.user}</td><td><span className="oh-tag">{item.module}</span></td>
          <td>{item.changes.length ? <>{item.changes[0].label}: <span className="mut">{unitText(item.changes[0], item.changes[0].before)}</span> → <b>{unitText(item.changes[0], item.changes[0].after)}</b></> : <>{item.action ? <b>{item.action}</b> : null}{item.detail ? ` · ${item.detail}` : ""}</>}</td></tr>)}
      </tbody></table> : <Empty title="Sin actividad registrada" text="Los cambios de precios, caja y usuarios aparecerán aquí."/>}
    </section>

    <details className="oh-how"><summary>Cómo se calculan estos números</summary><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul></details>
  </main>;
}
