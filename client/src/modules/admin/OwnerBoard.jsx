// Tablero del dueño (v3, 2026-09-28). La primera pantalla del centro de dirección, con la misma forma que el tablero
// del turno de Recepción: un bloque oscuro con el estado del hotel y las cifras del periodo, y debajo tarjetas
// compactas con lo que el dueño necesita decidir, cómo va el dinero, quién está dentro, la agenda, las habitaciones,
// Cocina y Bar y la actividad del sistema en vivo. Todo se actualiza solo (tiempo real por Socket.IO).
// Datos: GET /api/superadmin/home, /api/superadmin/approvals (lo carga el armazón) y /api/reception/desk.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, ClipboardCheck, DoorClosed, DoorOpen, ExternalLink, Radio } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Empty, Tag, dateLong, serviceOf } from "../recepcion/rxkit";
import { Bullets, COLORS, GroupedBars, LineChart, OccupancyChart, RoomsMap, StackedBar, TipLayer, money, useTip } from "./OwnerCharts";
import { homeQuery } from "./OwnerHome";

const PERIODS = [["hoy", "Hoy"], ["7d", "7 días"], ["mes", "Mes"]];
const TIME_ZONE = "America/Lima";
const clock = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const dayMonth = (date) => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
const AGENDA_ICON = { LLEGADA: DoorOpen, SALIDA: DoorClosed };
const AGENDA_TAG = { ATENCION: ["Revisar", "crit"], COBRO: ["Por cobrar", "warn"], LISTO: ["Listo", "info"], HECHO: ["Ingresó", "ok"] };
const METHOD = { EFECTIVO: ["Efectivo", COLORS.navy], YAPE: ["Yape", COLORS.blue], PLIN: ["Plin", COLORS.mid], TARJETA: ["Tarjeta", COLORS.gray], "CAJA HOTEL": ["Caja", COLORS.deep] };
const MODULE_TONE = { PAGOS: "ok", RESERVAS: "info", PEDIDOS: "info", MANTENIMIENTO: "warn", ASISTENCIA: "off", SERVICIO_CLIENTE: "warn" };
const sentence = (text) => { const value = String(text || "").replaceAll("_", " ").toLowerCase(); return value.charAt(0).toUpperCase() + value.slice(1); };
const signed = (change) => change === null || change === undefined ? null : `${change > 0 ? "▲" : change < 0 ? "▼" : "="} ${Math.abs(Math.round(change))} %`;

export function OwnerBoard({ approvals, navigate }) {
  const [period, setPeriod] = useState("hoy");
  const home = useFetch(`/superadmin/home?${homeQuery({ preset: period })}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 30000 });
  const desk = useFetch("/reception/desk", { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 30000 });
  const trend = useTip(), results = useTip(), inside = useTip(), rooms = useTip(), pay = useTip(), channel = useTip(), occ = useTip();
  const h = home.data, d = desk.data, a = approvals?.data || { total: 0, groups: [], watch: [] };
  if (!h && home.loading) return <LoadingSpinner label="Preparando el tablero…" />;
  if (!h) return <Empty icon={CircleAlert} title="No se pudo cargar el tablero">{home.error?.message || "Revisa la conexión con el servidor."}</Empty>;

  const k = h.kpis, periodText = period === "hoy" ? "hoy" : period === "7d" ? "en 7 días" : "este mes";
  const occupancy = d?.kpis?.occupancyRate ?? (h.occupancy.at(-1)?.percent || 0);
  const activeOrders = h.orderStates.filter((row) => !/ENTREG|CANCEL/i.test(row.label)).reduce((sum, row) => sum + row.count, 0);
  const decisions = a.groups.filter((group) => group.count > 0);
  const watch = [...(a.watch || []), ...h.pending.filter((row) => !(a.watch || []).some((item) => item.key === row.key))].filter((row) => row.count > 0);
  const agenda = (d?.agenda || []).slice(0, 7);
  const services = h.services.map((row) => ({ code: row.code, name: row.name, inside: row.inside, capacity: row.capacity, estimated: row.estimated }));
  const CHANNEL = { RECEPCION: ["Recepción y caja", COLORS.navy], APP: ["App del cliente", COLORS.blue] };
  const channels = h.payments.channels.filter((row) => row.amount > 0).map((row) => ({ name: (CHANNEL[row.key] || [row.key])[0], value: row.amount, color: (CHANNEL[row.key] || [])[1] || COLORS.mid, tooltip: money(row.amount, 2) }));
  const methods = h.payments.methods.filter((row) => row.amount > 0).map((row) => ({ name: (METHOD[row.key] || [row.key])[0], value: row.amount, color: (METHOD[row.key] || [])[1] || COLORS.gray, tooltip: money(row.amount, 2) }));
  const go = (target) => (event) => { event.preventDefault(); if (Array.isArray(target)) navigate(target[0], target[1]); };

  return <>
    <TipLayer tip={trend.tip} /><TipLayer tip={results.tip} /><TipLayer tip={inside.tip} /><TipLayer tip={rooms.tip} /><TipLayer tip={pay.tip} /><TipLayer tip={channel.tip} /><TipLayer tip={occ.tip} />
    <section className="rx-day ow-day">
      <div>
        <small><Radio size={12} className="ow-live" /> En vivo · actualizado {clock(h.generatedAt)}</small>
        <h1>{dateLong(h.today)}</h1>
        <p>Hotel al {occupancy} % · {k.inside.value} personas dentro · {activeOrders} pedidos en curso · {a.total} asunto{a.total === 1 ? "" : "s"} por decidir</p>
        <div className="rx-day-actions">
          <Link className="rx-btn rx-btn--primary" to="/superadmin/aprobar/bandeja"><ClipboardCheck />Por aprobar · {a.total}</Link>
          {h.links?.customerApp ? <a className="rx-btn" href={h.links.customerApp} target="_blank" rel="noreferrer"><ExternalLink />App del cliente</a> : null}
        </div>
      </div>
      <div className="ow-day-right">
      <div className="rx-seg ow-day-seg" role="group" aria-label="Periodo">{PERIODS.map(([key, label]) => <button key={key} type="button" className={period === key ? "is-on" : ""} onClick={() => setPeriod(key)}>{label}</button>)}</div>
      <div className="rx-day-stats">
        <div><b>{money(k.sales.value)}</b><span>vendido {periodText}{signed(k.sales.change) ? ` · ${signed(k.sales.change)}` : ""}</span></div>
        <div><b>{money(k.profit.value)}</b><span>utilidad{k.profit.margin !== null && k.profit.margin !== undefined ? ` · margen ${k.profit.margin} %` : ""}</span></div>
        <div><b>{k.inside.value}</b><span>personas dentro{k.inside.capacity ? ` de ${k.inside.capacity}` : ""}</span></div>
        <div><b>{money(k.receivable.value)}</b><span>por cobrar · {k.receivable.count} reserva{k.receivable.count === 1 ? "" : "s"}</span></div>
      </div>
      </div>
    </section>

    <div className="rx-stack">
    <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Ventas y gastos</h2><p>{h.series.length} días · {dayMonth(h.series[0]?.date || h.today)} al {dayMonth(h.series.at(-1)?.date || h.today)}</p></div><Link to="/superadmin/rentabilidad" onClick={go(["rentabilidad", "rentabilidad"])}>Rentabilidad <ArrowRight size={14} /></Link></div>
        <div className="rx-card-b oh"><LineChart series={[{ name: "Ventas", color: COLORS.blue, values: h.series.map((row) => row.sales) }, { name: "Gastos", color: COLORS.red, values: h.series.map((row) => row.expenses) }]} labels={h.series.map((row) => row.date === h.today ? "Hoy" : dayMonth(row.date))} tip={trend} /></div>
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Requiere tu decisión</h2><p>{decisions.length ? "Nadie más puede resolverlo" : "Nada espera tu aprobación"}</p></div><Link to="/superadmin/aprobar/bandeja">Bandeja <ArrowRight size={14} /></Link></div>
        <div className="rx-attn">
          {decisions.map((group) => <a key={group.key} href="/superadmin/aprobar/bandeja" className={group.tone || "warn"} onClick={go(group.go)}><b>{group.count}</b><span>{group.label}</span><ArrowRight /></a>)}
          {watch.slice(0, Math.max(2, 6 - decisions.length)).map((row) => <a key={`w-${row.key}`} href="/superadmin" className="info" onClick={go(row.go)}><b>{row.count}</b><span>{row.label}</span><ArrowRight /></a>)}
          {!decisions.length && !watch.length ? <Empty title="Todo en orden">No hay decisiones ni alertas pendientes.</Empty> : null}
        </div>
      </section>
    </div>

    <div className="rx-grid rx-g-3">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Personas dentro ahora</h2><p>Frente al aforo de cada servicio</p></div><Link to="/superadmin/admision/aforo" onClick={go(["admision", "aforo"])}>Aforo <ArrowRight size={14} /></Link></div>
        <div className="rx-card-b oh"><Bullets rows={services} total={{ value: k.inside.value, capacity: k.inside.capacity }} tip={inside} /></div>
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Resultado por servicio</h2><p>Ventas y gastos {periodText}</p></div><Link to="/superadmin/rentabilidad" onClick={go(["rentabilidad", "rentabilidad"])}>Detalle <ArrowRight size={14} /></Link></div>
        <div className="rx-card-b oh"><GroupedBars rows={h.services.map((row) => ({ name: row.name, a: row.sales, b: row.expenses }))} aName="Ventas" bName="Gastos" tip={results} /></div>
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Cobros</h2><p>{money(methods.reduce((sum, row) => sum + row.value, 0))} {periodText}{h.payments.toVerify.count ? ` · ${h.payments.toVerify.count} por verificar` : ""}</p></div><Link to="/superadmin/dinero/pagos" onClick={go(["dinero", "pagos"])}>Pagos <ArrowRight size={14} /></Link></div>
        <div className="rx-card-b oh">{methods.length ? <>
          <p className="ow-sub">Por medio de pago</p><StackedBar segments={methods} label="Cobrado" tip={pay} legendValue="value" format={(v) => money(v)} />
          {channels.length ? <><p className="ow-sub">Por canal</p><StackedBar segments={channels} label="Cobrado" tip={channel} legendValue="percent" format={(v) => money(v)} /></> : null}
        </> : <Empty title="Sin cobros en el periodo">Aparecerán con el primer pago aprobado.</Empty>}</div>
      </section>
    </div>

    <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Agenda de hoy</h2><p>Llegadas, salidas, turnos y eventos de los cinco servicios</p></div><Link to="/superadmin/reservas/general" onClick={go(["reservas", "general"])}>Reservas <ArrowRight size={14} /></Link></div>
        {agenda.length ? <div className="rx-agenda">{agenda.map((row, index) => { const Icon = AGENDA_ICON[row.kind] || serviceOf(row.service).icon; const [label, tone] = AGENDA_TAG[row.state] || ["Programado", "off"]; return <div key={`${row.code}-${row.kind}-${index}`} className="rx-agenda-row">
          <time>{row.time}</time><span className="pin"><span /></span>
          <div className="what"><Icon aria-hidden="true" /><div style={{ minWidth: 0 }}><b>{row.title}</b><small>{row.detail} · {row.code}</small></div></div>
          <Tag tone={tone}>{label}</Tag>
        </div>; })}</div> : <Empty title="Sin movimientos programados hoy">Las reservas de cualquier servicio aparecen aquí por hora.</Empty>}
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Habitaciones</h2><p>{h.rooms.length} habitaciones · ocupación {occupancy} %</p></div><Link to="/superadmin/reservas/hospedaje" onClick={go(["reservas", "hospedaje"])}>Hospedaje <ArrowRight size={14} /></Link></div>
        <div className="rx-card-b oh"><RoomsMap rooms={h.rooms} tip={rooms} /><p className="ow-sub">Ocupación de los últimos 14 días</p><OccupancyChart data={h.occupancy} tip={occ} /></div>
      </section>
    </div>

    <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Actividad en vivo</h2><p>Lo último que pasó en el sistema, quién y cuándo</p></div><Link to="/superadmin/control/auditoria" onClick={go(["control", "auditoria"])}>Auditoría <ArrowRight size={14} /></Link></div>
        {h.recent.length ? <ul className="rx-list">{h.recent.slice(0, 7).map((row) => <li key={row.id}><span className="ow-time">{clock(row.at)}</span><div className="grow"><b>{sentence(row.action)} · {row.detail}</b><small>{row.user || "Sistema"}</small></div><Tag tone={MODULE_TONE[row.module] || "off"}>{sentence(row.module)}</Tag></li>)}</ul> : <Empty title="Sin actividad reciente">Cada cambio del sistema aparecerá aquí al instante.</Empty>}
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Cocina y Bar</h2><p>{activeOrders} pedidos en curso · ventas y costo de recetas {periodText}</p></div><Link to="/superadmin/restaurante/pedidos" onClick={go(["restaurante", "pedidos"])}>Pedidos <ArrowRight size={14} /></Link></div>
        <ul className="rx-list">{h.gastronomy.map((row) => <li key={row.area}><div className="grow"><b>{row.name}</b><small>Costo {money(row.cost)} · margen {row.margin ?? 0} %</small></div><span className="ow-amount">{money(row.sales)}</span></li>)}
          {h.orderStates.filter((row) => row.count).map((row) => <li key={row.label}><div className="grow"><b>{row.label}</b><small>Pedidos {periodText}</small></div><span className="ow-count info">{row.count}</span></li>)}</ul>
      </section>
    </div>
    </div>
  </>;
}
