// Módulo Clientes del Superadmin: Directorio (tablero + tabla) y Perfil 360° (libro de consumo, segmento, notas).
// Todos los números vienen calculados de GET /api/superadmin/clients y GET /api/superadmin/clients/:id/profile.
import { useEffect, useState } from "react";
import { AlertTriangle, Ban, BedDouble, CalendarCheck, CircleDollarSign, Compass, Download, Edit3, Plus, QrCode, Search, ShieldCheck, Sun, Users, Waves } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { Columns, COLORS, Empty, fmt, GroupedBars, HBars, money, StackedBar, StackedRows, TipLayer, useTip } from "./OwnerCharts";
import "./OwnerHome.css";
import "./ClientsHub.css";

const SELECTED_KEY = "park_plaza_selected_client_id";
const SEGMENT_META = {
  NUEVO: { label: "Nuevo", tone: "new" }, OCASIONAL: { label: "Ocasional", tone: "new" },
  RECURRENTE: { label: "Recurrente", tone: "rec" }, VIP: { label: "VIP", tone: "vip" }, INACTIVO: { label: "Inactivo", tone: "ina" }
};
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PP";
const shortDate = (value) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "") : "—";
const fullDate = (value) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }) : "—";
const timeAgo = (iso) => {
  if (!iso) return "—";
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDays <= 0) return "hoy"; if (diffDays === 1) return "ayer"; if (diffDays < 30) return `hace ${diffDays} días`;
  if (diffDays < 60) return "hace 1 mes"; if (diffDays < 365) return `hace ${Math.round(diffDays / 30)} meses`;
  return `hace ${Math.round(diffDays / 365)} años`;
};
const SERVICE_LABEL = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos" };
const SERVICE_ICON = { HOSPEDAJE: BedDouble, PISCINA: Waves, MIRADOR: Compass, TERRAZA: Sun, EVENTOS: CalendarCheck };
function ServiceIcon({ code }) { const Icon = SERVICE_ICON[code] || Users; return <Icon size={13}/>; }

function SegmentTag({ segment }) { const meta = SEGMENT_META[segment] || SEGMENT_META.OCASIONAL; return <span className={`ch-seg ch-seg--${meta.tone}`}>{meta.label}</span>; }
function Card({ title, sub, legend, children }) { return <section className="oh-card"><div className="oh-ch"><h2>{title}</h2>{legend ? <div className="oh-leg">{legend}</div> : null}</div>{sub ? <div className="oh-ch2">{sub}</div> : null}<div className="oh-body">{children}</div></section>; }
const Legend = ({ items }) => items.map(([label, color, kind]) => <span key={label}><i className={kind === "sq" ? "sq" : ""} style={{ background: color }}/>{label}</span>);

/* ========================= DIRECTORIO ========================= */
export function ClientDirectoryPage({ navigate }) {
  const tip = useTip();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q.trim()) params.set("q", q.trim());
  if (segment) params.set("segment", segment);
  const { data, loading, error, reload } = useFetch(`/superadmin/clients?${params.toString()}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000 });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const openProfile = (clientId) => { localStorage.setItem(SELECTED_KEY, String(clientId)); navigate("clientes", "perfil"); };
  const exportCsv = () => {
    if (!data) return;
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Cliente", "Documento", "Servicios", "Visitas", "Última visita", "Gasto total", "Saldo", "Segmento"], ...data.list.rows.map((r) => [r.name, r.documentNumber, r.servicesUsed.map((c) => SERVICE_LABEL[c]).join(" / "), r.visits, r.lastVisitDate || "", r.spend, r.balance, SEGMENT_META[r.segment]?.label])]
      .map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "park-plaza-clientes.csv"; link.click(); URL.revokeObjectURL(url);
  };

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Cargando el directorio de clientes..."/></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudo cargar el directorio</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { overview, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const segmentChips = [["", "Todos"], ["DENTRO", "Dentro ahora"], ["HOY", "Con visita hoy"], ["SALDO", "Con saldo"], ["NUEVO", "Nuevos"], ["RECURRENTE", "Recurrentes"], ["VIP", "VIP"], ["INACTIVO", "Inactivos +90 d"], ["BLOQUEADO", "Bloqueados"]];
  const usageRows = overview.serviceUsage.map((s) => ({ name: s.name, a: s.users, b: s.onlyThis }));
  const topRows = overview.topSpenders.map((s) => ({ name: s.name, value: s.spend }));

  return <main className="oh">
    <TipLayer tip={tip.tip}/>
    {toast ? <div className="ch-toast"><ShieldCheck size={16}/>{toast}</div> : null}
    <div className="oh-ph"><div><h1>Directorio de clientes</h1><p>{overview.totalClients} clientes registrados · cada persona una sola vez, con todo su historial</p></div>
      <div className="oh-tools">
        <button type="button" className="oh-btn" onClick={exportCsv}><Download size={16}/>Exportar</button>
        <button type="button" className="oh-btn" onClick={() => navigate("admision", "qr")}><QrCode size={16}/>Escanear QR</button>
        <button type="button" className="oh-btn p" onClick={() => setEditor({})}><Plus size={16}/>Registrar cliente</button>
      </div>
    </div>

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Clientes registrados</div><div className="v">{fmt(overview.totalClients)}</div><div className="d">todo el historial de la base</div></div>
      <div className="k"><div className="l">Activos · 90 días</div><div className="v">{fmt(overview.active90)}</div><div className="d">{overview.totalClients ? Math.round((overview.active90 / overview.totalClients) * 100) : 0}% de la base</div><div className="km"><i style={{ width: `${overview.totalClients ? Math.round((overview.active90 / overview.totalClients) * 100) : 0}%` }}/></div></div>
      <div className="k"><div className="l">Recurrentes y VIP</div><div className="v">{fmt(overview.recurrentVip)}</div><div className="d">2 o más visitas</div></div>
      <div className="k"><div className="l">Dentro ahora</div><div className="v">{fmt(overview.insideNow)}</div><div className="d">clientes con ingreso validado</div></div>
      <div className="k"><div className="l">Con saldo pendiente</div><div className="v">{money(overview.withBalance.amount)}</div><div className="d">{overview.withBalance.count} clientes</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Clientes nuevos por semana" sub="Últimas 12 semanas · se resalta la mejor semana">
        <Columns values={overview.newBySeries.values} labels={overview.newBySeries.labels} highlight={[overview.newBySeries.values.indexOf(Math.max(...overview.newBySeries.values))]} name="Clientes nuevos" tip={tip} w={640}/>
      </Card>
      <Card title="Segmentos de clientes" sub={`Cómo se reparte tu base de ${overview.totalClients} personas`}>
        <StackedBar tip={tip} label="Clientes" segments={overview.segments.filter((s) => s.count > 0).map((s) => ({ name: s.label, value: s.count, color: { NUEVO: COLORS.mid, OCASIONAL: COLORS.blue, RECURRENTE: COLORS.deep, VIP: COLORS.navy, INACTIVO: COLORS.gray }[s.key], text: s.key === "NUEVO" || s.key === "INACTIVO" ? COLORS.ink : "#fff" }))}/>
      </Card>
    </div>

    <div className="oh-grid g-3">
      <Card title="Qué servicio usan" sub="Clientes que lo usan y los que vienen solo a ese" legend={<Legend items={[["Lo usan", COLORS.gray, "sq"], ["Solo ese", COLORS.blue, "sq"]]}/>}>
        <GroupedBars rows={usageRows} aName="Lo usan" bName="Solo ese servicio" tip={tip} aColor={COLORS.gray} bColor={COLORS.blue} format={fmt} tipFormat={fmt}/>
      </Card>
      <Card title="Clientes que más consumen" sub="Gasto acumulado en todos los servicios · S/">
        <HBars rows={topRows} name="Gasto acumulado" tip={tip} valueLabel={money}/>
      </Card>
      <Card title="Cómo llegan y calidad de los datos" sub="Canal de registro y estado de las fichas">
        <StackedBar tip={tip} label="Clientes" legendValue="count" segments={[{ name: "App del cliente", value: overview.channels.app, color: COLORS.blue }, { name: "Recepción", value: overview.channels.recepcion, color: COLORS.deep }]}/>
        <div className="oh-sub2">Calidad de los datos</div>
        <StackedBar tip={tip} label="Fichas" legendValue="count" segments={[{ name: "Ficha completa", value: overview.dataQuality.complete, color: COLORS.navy }, { name: "Sin teléfono", value: overview.dataQuality.noPhone, color: COLORS.mid, text: COLORS.ink }, { name: "Posibles duplicados", value: overview.dataQuality.duplicates, color: COLORS.gray, text: COLORS.ink }]}/>
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Todos los clientes</h2><small>{list.total} resultados</small></div>
      <div className="ch-fbar">
        <div className="ch-sbox"><Search size={16}/><input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por DNI, RUC, nombre, teléfono o correo"/></div>
        <div className="ch-chips">{segmentChips.map(([value, label]) => <button key={value || "todos"} type="button" className={segment === value ? "on" : ""} onClick={() => { setSegment(value); setPage(1); }}>{label}</button>)}</div>
      </div>
      {!list.rows.length ? <Empty title="No encontramos clientes" text="Cambia la búsqueda o el segmento seleccionado."/> : <table className="ch-table"><thead><tr><th>Cliente</th><th>Servicios usados</th><th>Actividad</th><th className="n">Gasto total</th><th className="n">Saldo</th><th>Segmento y estado</th><th></th></tr></thead><tbody>
        {list.rows.map((row) => <tr key={row.id}>
          <td><div className="ch-person"><div className="ch-av">{initials(row.name)}</div><div><b>{row.name}</b><small>{row.documentType === "GOOGLE" ? `Google · ${row.email || "—"}` : `${row.documentType || "DNI"} ${row.documentNumber || "—"}`}</small></div></div></td>
          <td><div className="ch-svc">{row.servicesUsed.length ? row.servicesUsed.map((code) => <span key={code} title={SERVICE_LABEL[code]}><ServiceIcon code={code}/></span>) : <em>Sin servicios</em>}</div></td>
          <td><b className="ch-visits">{row.visits} {row.visits === 1 ? "visita" : "visitas"}</b><small className="mut">Última: {timeAgo(row.lastVisitDate ? `${row.lastVisitDate}T12:00:00` : null)}</small></td>
          <td className="n">{money(row.spend)}</td>
          <td className={`n ${row.balance ? "neg" : "mut"}`}>{row.balance ? money(row.balance) : "—"}</td>
          <td><SegmentTag segment={row.segment}/> {row.blocked ? <span className="ch-seg ch-seg--blk">Bloqueado</span> : row.insideNow ? <span className="tag ok">Dentro ahora</span> : null}</td>
          <td className="n"><a className="more" onClick={() => openProfile(row.id)}>Ver ficha ›</a></td>
        </tr>)}
      </tbody></table>}
      <div className="pager"><span>Mostrando {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {editor ? <ClientEditor initial={editor} onClose={() => setEditor(null)} onSaved={(client) => { setEditor(null); notify("Cliente registrado."); reload(); openProfile(client.id); }}/> : null}
  </main>;
}

/* ========================= PERFIL 360° ========================= */
export function ClientProfilePage({ navigate }) {
  const [selectedId, setSelectedId] = useState(() => Number(localStorage.getItem(SELECTED_KEY) || 0));
  const [tab, setTab] = useState("TODO");
  const [editor, setEditor] = useState(null);
  const [picker, setPicker] = useState(false);
  const [toast, setToast] = useState("");
  const tip = useTip();
  const profile = useFetch(selectedId ? `/superadmin/clients/${selectedId}/profile` : null, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000, enabled: Boolean(selectedId) });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const select = (id) => { localStorage.setItem(SELECTED_KEY, String(id)); setSelectedId(id); setPicker(false); setTab("TODO"); };
  // El buscador global del dueño abre el perfil con ?cliente=ID.
  const [params] = useSearchParams();
  const fromSearch = Number(params.get("cliente") || 0);
  useEffect(() => { if (fromSearch && fromSearch !== selectedId) select(fromSearch); }, [fromSearch]);
  const runAction = async (path, body, message) => { try { await api(path, { method: body ? "PATCH" : "POST", body }); notify(message); profile.reload(); } catch (cause) { notify(cause.message || "No se pudo completar la acción."); } };

  // Sin cliente elegido no hay perfil que mostrar: se ve el directorio para elegir uno (nunca una pantalla vacía).
  if (!selectedId) return <ClientDirectoryPage navigate={navigate} />;
  if (!profile.data && profile.loading) return <main className="oh"><LoadingSpinner label="Cargando la ficha del cliente..."/></main>;
  if (!profile.data) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudo cargar el cliente</strong><p>{profile.error?.message || "Error desconocido"}</p><button type="button" onClick={() => navigate("clientes", "directorio")}>Volver al directorio</button></div></div></main>;

  const d = profile.data;
  const monthValues = d.monthly.map((m) => m.total), monthLabels = d.monthly.map((m) => m.label);
  const originRows = d.originBreakdown.map((row) => ({ name: row.name, values: [row.servicio, row.restaurante, row.bar] }));
  const seriesC = [{ name: "Servicio", color: COLORS.navy, text: "#fff" }, { name: "Restaurante", color: COLORS.blue, text: "#fff" }, { name: "Bar", color: COLORS.mid, text: COLORS.ink }];
  const visitRows = d.visitsByService.map((s) => ({ name: s.name, value: s.count }));
  const dowValues = d.visitsByDow.map((x) => x.count), dowLabels = d.visitsByDow.map((x) => x.label);
  const tabs = [["TODO", "Todo"], ["RESERVAS", "Reservas"], ["CONSUMOS", "Consumos"], ["PAGOS", "Pagos"], ["ACCESOS", "Accesos"], ["INCIDENCIAS", "Incidencias"]];
  const events = tab === "TODO" ? d.timeline.slice(0, 12) : d.timeline.filter((row) => row.category === tab).slice(0, 20);
  const icon = { RESERVAS: <CalendarCheck size={15}/>, PAGOS: <CircleDollarSign size={15}/>, CONSUMOS: <Users size={15}/>, ACCESOS: <ShieldCheck size={15}/>, INCIDENCIAS: <AlertTriangle size={15}/> };

  return <main className="oh">
    <TipLayer tip={tip.tip}/>
    {toast ? <div className="ch-toast"><ShieldCheck size={16}/>{toast}</div> : null}
    <section className="oh-card">
      <div className="ch-hdr">
        <div className="ch-big">{initials(d.name)}</div>
        <div><div className="ch-name-row"><h1>{d.name}</h1><button type="button" className="ch-switch" onClick={() => setPicker(!picker)}><Search size={13}/>Cambiar cliente</button>{picker ? <ClientPicker onPick={select} onClose={() => setPicker(false)}/> : null}</div>
          <div className="ch-tagrow"><SegmentTag segment={d.segment}/>{d.blocked ? <span className="ch-seg ch-seg--blk">Bloqueado</span> : <span className="tag ok">Activo</span>}{d.isGoogle ? <span className="tag">Cuenta con app</span> : null}{d.insideNow ? <span className="tag info">Dentro ahora</span> : null}</div>
          <div className="ch-meta"><span>{d.documentType === "GOOGLE" ? "Google" : d.documentType || "DNI"} <b>{d.documentNumber || "—"}</b></span>{d.phone ? <span>Tel. <b>{d.phone}</b></span> : null}{d.email ? <span><b>{d.email}</b></span> : null}<span>Cliente desde <b>{fullDate(String(d.createdAt || "").slice(0, 10))}</b></span></div>
        </div>
        <div className="ch-acts">
          <button type="button" className="oh-btn p" onClick={() => navigate("reservas", "general")}><Plus size={15}/>Nueva reserva</button>
          {d.kpis.balance > 0 ? <button type="button" className="oh-btn" onClick={() => navigate("dinero", "pagos")}>Cobrar saldo · {money(d.kpis.balance)}</button> : null}
          <button type="button" className="oh-btn" onClick={() => navigate("admision", "qr")}><QrCode size={15}/>Ver pase QR</button>
          <button type="button" className="oh-btn" onClick={() => setEditor(d)}><Edit3 size={15}/>Editar</button>
          {d.blocked ? <button type="button" className="oh-btn" onClick={() => runAction(`/clients/${d.id}/status`, { status: "ACTIVO" }, "Cuenta reactivada.")}>Reactivar</button>
            : <button type="button" className="oh-btn warn" onClick={() => { if (window.confirm(`¿Bloquear a ${d.name}? No podrá acceder a sus servicios hasta que lo reactives.`)) runAction(`/clients/${d.id}/status`, { status: "BLOQUEADO" }, "Cuenta bloqueada."); }}><Ban size={15}/>Bloquear</button>}
          <button type="button" className="oh-btn" onClick={() => { if (window.confirm(`¿Finalizar todos los servicios activos de ${d.name}?`)) runAction(`/clients/${d.id}/end-services`, null, "Servicios finalizados."); }}>Finalizar servicios</button>
        </div>
      </div>
    </section>

    <section className="oh-card oh-kpis k6" style={{ marginTop: 16 }}>
      <div className="k"><div className="l">Gasto acumulado</div><div className="v">{money(d.kpis.spend)}</div><div className="d">todos los servicios</div></div>
      <div className="k"><div className="l">Visitas</div><div className="v">{fmt(d.kpis.visits)}</div><div className="d">ingresos validados</div></div>
      <div className="k"><div className="l">Ticket medio</div><div className="v">{money(d.kpis.avgTicket)}</div><div className="d">gasto por visita</div></div>
      <div className="k"><div className="l">Última visita</div><div className="v">{timeAgo(d.kpis.lastVisitDate ? `${d.kpis.lastVisitDate}T12:00:00` : null)}</div><div className="d">{shortDate(d.kpis.lastVisitDate)}</div></div>
      <div className="k"><div className="l">Saldo pendiente</div><div className="v">{money(d.kpis.balance)}</div><div className="d">{d.kpis.balance > 0 ? "por cobrar" : "sin deuda"}</div></div>
      <div className="k"><div className="l">Servicios usados</div><div className="v">{d.kpis.servicesUsedCount} de {d.kpis.servicesTotal}</div><div className="d">Hospedaje, Piscina, Mirador, Terraza, Eventos</div></div>
    </section>

    <div className="oh-grid g-7-5">
      <Card title="Gasto por servicio de origen" sub="Lo que consumió en cada servicio y dónde: servicio, Restaurante o Bar · S/" legend={<Legend items={seriesC.map((s) => [s.name, s.color, "sq"])}/>}>
        {originRows.length ? <StackedRows rows={originRows} series={seriesC} name="Gasto por servicio" tip={tip} w={620}/> : <Empty title="Sin consumo registrado" text="Aparecerá cuando el cliente tenga pagos aprobados."/>}
      </Card>
      <Card title="Gasto por mes" sub="Últimos 12 meses · S/ · el mes actual resaltado">
        <Columns values={monthValues} labels={monthLabels} highlight={[11]} name="Gasto" tip={tip} w={460}/>
      </Card>
    </div>

    <div className="oh-grid g-3">
      <Card title="Cómo nos visita" sub="Cantidad de visitas por servicio"><HBars rows={visitRows} name="Visitas" tip={tip}/></Card>
      <Card title="Qué días viene" sub="Visitas por día de la semana"><Columns values={dowValues} labels={dowLabels} highlight={[dowValues.indexOf(Math.max(...dowValues))]} name="Visitas" tip={tip}/></Card>
      <Card title="Pases QR y próxima visita" sub="Estado de sus accesos">
        {d.passes.length ? <div className="ch-pass">{d.passes.flatMap((pass) => pass.entitlements.map((e, i) => <div className="ch-pass-row" key={`${pass.code}-${i}`}><b>{SERVICE_LABEL[e.serviceCode] || e.serviceCode}</b><span className={`ch-pass-st ${e.status === "UTILIZADO" ? "used" : e.status === "LISTO_INGRESO" ? "ready" : ""}`}>{e.usedAt ? `Utilizado · ${shortDate(String(e.usedAt).slice(0, 10))}` : e.status === "LISTO_INGRESO" ? "Listo para ingreso" : e.status.toLowerCase()}</span></div>))}</div> : <Empty title="Sin pases activos" text="Aparecerán cuando el cliente pague un servicio."/>}
        {d.upcoming ? <div className="ch-warnbox"><b>Próxima visita:</b> {shortDate(d.upcoming.date)} · {SERVICE_LABEL[d.upcoming.serviceCode] || d.upcoming.serviceCode}</div> : null}
      </Card>
    </div>

    <div className="oh-grid g-7-5">
      <Card title="Libro de consumo" sub={`Últimas ${d.ledger.length} visitas · S/`}>
        {d.ledger.length ? <table className="ch-table"><thead><tr><th>Fecha</th><th>Servicio de origen</th><th className="n">Servicio</th><th className="n">Restaurante</th><th className="n">Bar</th><th className="n">Total</th><th>Estado</th></tr></thead><tbody>
          {d.ledger.map((row) => <tr key={row.id}><td className="mut">{shortDate(row.date)}</td><td>{row.serviceName}{row.code ? ` · ${row.code}` : ""}</td><td className="n">{fmt(row.servicio)}</td><td className="n">{fmt(row.restaurante)}</td><td className="n">{fmt(row.bar)}</td><td className="n"><b>{fmt(row.total)}</b></td><td>{row.status === "PAGADO" ? <span className="tag ok">Pagado</span> : <span className="tag warn">Saldo {money(row.balance)}</span>}</td></tr>)}
        </tbody></table> : <Empty title="Sin visitas registradas" text="El libro de consumo aparece cuando el cliente tiene pagos aprobados."/>}
      </Card>
      <section className="oh-card">
        <div className="oh-ch"><h2>Actividad reciente</h2></div>
        <div className="ch-tabs">{tabs.map(([value, label]) => <b key={value} className={tab === value ? "on" : ""} onClick={() => setTab(value)}>{label}</b>)}</div>
        {events.length ? <div className="ch-tl">{events.map((row, i) => <div key={i}><span className="ch-tl-ic">{icon[row.category]}</span><span><b>{row.title}</b><small>{row.detail}</small></span>{row.amount !== null ? <span className="ch-tl-amt">{money(row.amount)}</span> : null}<time>{timeAgo(row.at)}</time></div>)}</div> : <Empty title="Sin actividad" text="Aparecerá cuando el cliente reserve, pague o consuma."/>}
      </section>
    </div>

    <div className="oh-grid g-1-1">
      <NotesCard client={d} notify={notify} reload={profile.reload}/>
      <DataQualityCard client={d} notify={notify} reload={profile.reload}/>
    </div>

    {editor ? <ClientEditor initial={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); notify("Datos actualizados."); profile.reload(); }}/> : null}
  </main>;
}

function ClientPicker({ onPick, onClose }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQ(qInput), 250); return () => clearTimeout(timer); }, [qInput]);
  const params = new URLSearchParams({ pageSize: "6" }); if (q.trim()) params.set("q", q.trim());
  const { data } = useFetch(`/superadmin/clients?${params.toString()}`, { initialData: null, realtime: false });
  const rows = data?.list.rows || [];
  return <div className="ch-picker-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="ch-picker">
      <div className="ch-sbox"><Search size={16}/><input autoFocus value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Nombre, DNI, teléfono o correo"/></div>
      {rows.length ? rows.map((row) => <button type="button" key={row.id} className="ch-picker-row" onClick={() => onPick(row.id)}><div className="ch-av">{initials(row.name)}</div><div><b>{row.name}</b><small>{row.documentNumber || row.email || "—"}</small></div><SegmentTag segment={row.segment}/></button>) : <p className="ch-picker-empty">Escribe para buscar un cliente.</p>}
    </div>
  </div>;
}

function NotesCard({ client, notify, reload }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { await api(`/superadmin/clients/${client.id}/notes`, { method: "POST", body: { text: text.trim() } }); setText(""); reload(); notify("Nota agregada."); }
    catch (cause) { notify(cause.message || "No se pudo guardar la nota."); }
    finally { setSaving(false); }
  };
  return <Card title="Notas internas" sub="Solo las ve el personal">
    {client.notes.length ? client.notes.map((note) => <div className="ch-note" key={note.id}>{note.text}<small>{note.authorName} · {timeAgo(note.createdAt)}</small></div>) : null}
    <div className="ch-note-form"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Alergias, preferencias, algo que el personal deba saber…" rows={2}/><button type="button" className="oh-btn p" disabled={saving || !text.trim()} onClick={submit}>{saving ? "Guardando…" : "+ Agregar nota"}</button></div>
  </Card>;
}

function DataQualityCard({ client, notify, reload }) {
  const [merging, setMerging] = useState(null);
  const merge = async (duplicateId) => {
    setMerging(duplicateId);
    try { await api("/superadmin/clients/merge", { method: "POST", body: { primaryId: client.id, duplicateId } }); notify("Fichas fusionadas: el historial ya está unido en esta persona."); reload(); }
    catch (cause) { notify(cause.message || "No se pudo fusionar."); }
    finally { setMerging(null); }
  };
  return <Card title="Calidad de los datos" sub="Una persona, una sola ficha">
    <div className="ch-checklist">
      <div className="ch-check"><span>Documento</span><b className={client.documentNumber ? "ok" : "warn"}>{client.documentNumber ? "✓ Correcto" : "Sin documento"}</b></div>
      <div className="ch-check"><span>Teléfono</span><b className={client.phone ? "ok" : "warn"}>{client.phone ? "✓ Registrado" : "Falta"}</b></div>
      <div className="ch-check"><span>Correo</span><b className={client.email ? "ok" : "warn"}>{client.email ? "✓ Registrado" : "Falta"}</b></div>
      <div className="ch-check"><span>Cuenta Google vinculada</span><b className={client.isGoogle ? "ok" : "mut"}>{client.isGoogle ? "✓ Vinculada" : "No aplica"}</b></div>
    </div>
    {client.duplicates.map((dup) => <div className="ch-warnbox ch-warnbox--dup" key={dup.id}><span><b>Posible duplicado:</b> «{dup.name}» · {dup.reason.toLowerCase()}</span><button type="button" className="oh-btn p" disabled={merging === dup.id} onClick={() => { if (window.confirm(`Se moverá todo el historial de «${dup.name}» a esta ficha (${client.name}). Esta acción no se puede deshacer. ¿Continuar?`)) merge(dup.id); }}>{merging === dup.id ? "Fusionando…" : "Revisar y fusionar"}</button></div>)}
  </Card>;
}

function ClientEditor({ initial, onClose, onSaved }) {
  const isEdit = Boolean(initial.id);
  const [form, setForm] = useState({ documentType: initial.documentType && initial.documentType !== "GOOGLE" ? initial.documentType : "DNI", documentNumber: initial.documentNumber || "", firstName: initial.name ? initial.name.split(" ")[0] : "", lastName: initial.name ? initial.name.split(" ").slice(1).join(" ") : "", phone: initial.phone || "", email: initial.email || "", address: initial.address || "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try { const result = await api(isEdit ? `/clients/${initial.id}` : "/clients", { method: isEdit ? "PUT" : "POST", body: form }); onSaved(result); }
    catch (cause) { setError(cause.message || "No se pudo guardar el cliente."); }
    finally { setSaving(false); }
  };
  return <div className="ch-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="ch-modal" onSubmit={submit}>
    <header><h2>{isEdit ? "Editar datos personales" : "Registrar cliente"}</h2><button type="button" onClick={onClose}>✕</button></header>
    {error ? <div className="ch-warnbox">{error}</div> : null}
    <div className="ch-form-grid">
      <label>Tipo de documento<select value={form.documentType} onChange={(e) => update("documentType", e.target.value)}><option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">Carné de extranjería</option><option value="PASAPORTE">Pasaporte</option></select></label>
      <label>Número<input value={form.documentNumber} onChange={(e) => update("documentNumber", e.target.value)} required/></label>
      <label>Nombres<input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required/></label>
      <label>Apellidos<input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required/></label>
      <label>Teléfono<input value={form.phone} onChange={(e) => update("phone", e.target.value)}/></label>
      <label>Correo<input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}/></label>
      <label className="wide">Dirección<input value={form.address} onChange={(e) => update("address", e.target.value)}/></label>
    </div>
    <footer><button type="button" className="oh-btn" onClick={onClose}>Cancelar</button><button type="submit" className="oh-btn p" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer>
  </form></div>;
}
