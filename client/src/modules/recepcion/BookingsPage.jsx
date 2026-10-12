// Reservas y clientes › Agenda de reservas. Una sola agenda para Hospedaje, Piscina, Mirador, Terraza y
// Eventos, por fecha del servicio, con su estado de pago y la ficha de cada reserva (cobro incluido).
// Datos: GET /api/reception/reservations (misma fila normalizada que usa el Superadmin).
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarRange, ChevronLeft, ChevronRight, PartyPopper, Plus, RefreshCw } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Empty, PageHead, PaymentTag, ReservationTag, SERVICES, dateShort, money, serviceOf, weekday } from "./rxkit";
import { ReservationDrawer } from "./ReservationDrawer";
import { HotelReservationDrawer } from "./HotelReservationDrawer";

const WHEN = [["proximas", "Próximas"], ["hoy", "Hoy"], ["pasadas", "Pasadas"], ["", "Todas"]];
const STATUSES = [["", "Todos los estados"], ["POR_CONFIRMAR", "Por confirmar"], ["CONFIRMADA", "Confirmadas"], ["EN_CURSO", "En curso"], ["COMPLETADA", "Completadas"], ["CANCELADA", "Canceladas"]];

export function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const [service, setService] = useState(() => (Object.keys(SERVICES).includes(params.get("servicio")) ? params.get("servicio") : ""));
  const hotelForm = params.get("nueva") === "HOSPEDAJE" ? { editId: null, roomId: params.get("habitacion") } : params.get("editar") ? { editId: Number(params.get("editar")), roomId: null } : null;
  const openHotelForm = (patch) => setParams(patch);
  const [when, setWhen] = useState("proximas");
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const verParam = params.get("ver");
  const [target, setTarget] = useState(null);

  useEffect(() => { const timer = window.setTimeout(() => { setQ(text.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [text]);
  useEffect(() => {
    if (!verParam) return;
    const [type, id] = verParam.split("-");
    if (type && id) setTarget({ type, id: Number(id) });
  }, [verParam]);

  const query = new URLSearchParams({ range: "todas", when, service, status, q, page: String(page), pageSize: "15" }).toString();
  const { data, loading, reload } = useFetch(`/reception/reservations?${query}`, { initialData: null, realtime: true, pollInterval: 30000 });
  const closeDrawer = () => { setTarget(null); if (verParam) setParams(service ? { servicio: service } : {}); };

  const list = data?.list;
  const counts = Object.fromEntries((list?.serviceCounts || []).map((row) => [row.code, row.count]));
  const allCount = (list?.serviceCounts || []).reduce((sum, row) => sum + row.count, 0);
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const week = data?.summary?.proximos7Dias || [];
  const maxWeek = Math.max(1, ...week.map((day) => day.count));

  return <>
    <PageHead title="Agenda de reservas" tools={<>
      <Link className="rx-btn" to="/eventos/reservas"><PartyPopper />Nuevo evento</Link>
      <button className="rx-btn rx-btn--primary" type="button" onClick={() => openHotelForm({ nueva: "HOSPEDAJE" })}><Plus />Nueva reserva de hospedaje</button>
    </>}>Todas las reservas de los cinco servicios en una sola agenda, ordenadas por la fecha en que se usan.</PageHead>

    {data ? <div className="rx-grid rx-g-2" style={{ marginBottom: 14, gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Próximos 7 días</h2><p>Reservas activas por día de uso</p></div></div>
        <div className="rx-card-b" style={{ display: "grid", gridTemplateColumns: `repeat(${week.length || 7}, 1fr)`, gap: 10, alignItems: "end", height: 132 }} role="img" aria-label="Reservas por día en los próximos 7 días">
          {week.map((day, index) => <div key={day.date} style={{ display: "grid", gap: 4, justifyItems: "center", height: "100%", alignContent: "end" }} title={`${day.count} reserva(s)`}>
            <b style={{ fontSize: 12.5, fontWeight: 600 }}>{day.count}</b>
            <span style={{ width: "100%", maxWidth: 38, height: `${Math.max(4, (day.count / maxWeek) * 64)}px`, background: index === 0 ? "var(--blue)" : "#A9C6EE", borderRadius: "3px 3px 0 0" }} />
            <small style={{ color: index === 0 ? "var(--text)" : "var(--muted)", fontSize: 11.5, fontWeight: index === 0 ? 600 : 400 }}>{index === 0 ? "Hoy" : `${weekday(day.date)} ${day.date.slice(8)}`}</small>
          </div>)}
        </div>
      </section>
      <div className="rx-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="rx-kpi"><div className="rx-kpi-l">Por confirmar</div><div className="rx-kpi-v">{data.summary.porConfirmar}</div><div className="rx-kpi-d">Esperan pago o confirmación</div></div>
        <div className="rx-kpi"><div className="rx-kpi-l">Personas hoy</div><div className="rx-kpi-v">{data.summary.personasHoy}</div><div className="rx-kpi-d">En todos los servicios</div></div>
        <div className="rx-kpi" style={{ gridColumn: "1 / -1" }}><div className="rx-kpi-l">Saldo pendiente de cobro</div><div className="rx-kpi-v">{money(data.summary.saldoPendiente.amount)}</div><div className="rx-kpi-d">{data.summary.saldoPendiente.count} reserva(s) con saldo · <Link className="rx-link" to="/admin-panel/cobros">Ir a cobros</Link></div></div>
      </div>
    </div> : null}

    <section className="rx-card">
      <div className="rx-filters" style={{ gap: 10 }}>
        <div className="rx-seg">
          <button type="button" className={!service ? "is-on" : ""} onClick={() => { setService(""); setPage(1); }}>Todos<i>{allCount}</i></button>
          {Object.entries(SERVICES).map(([code, meta]) => { const Icon = meta.icon; return <button key={code} type="button" className={service === code ? "is-on" : ""} onClick={() => { setService(code); setPage(1); }}><Icon size={14} />{meta.name}<i>{counts[code] || 0}</i></button>; })}
        </div>
      </div>
      <div className="rx-filters">
        <input className="rx-input rx-input--search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Código, titular o DNI" aria-label="Buscar reserva" />
        <div className="rx-seg">{WHEN.map(([key, label]) => <button key={key || "all"} type="button" className={when === key ? "is-on" : ""} onClick={() => { setWhen(key); setPage(1); }}>{label}</button>)}</div>
        <select className="rx-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Estado">{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={reload} style={{ marginLeft: "auto" }}><RefreshCw />Actualizar</button>
      </div>
      {loading && !data ? <LoadingSpinner label="Cargando reservas…" /> : list?.rows.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Reserva</th><th>Servicio</th><th>Titular</th><th>Fecha</th><th>Lugar / plan</th><th className="n">Pers.</th><th>Estado</th><th>Pago</th><th className="n">Saldo</th><th /></tr></thead>
        <tbody>{list.rows.map((row) => { const meta = serviceOf(row.type); const Icon = meta.icon; return <tr key={`${row.type}-${row.id}`} className="is-click" onClick={() => setTarget({ type: row.type, id: row.id, code: row.code })}>
          <td><b className="rx-mono">{row.code}</b></td>
          <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon size={15} color="#0F4C9E" />{meta.name}</span></td>
          <td><div className="rx-who"><b>{row.clientName}</b><small>DNI {row.clientDocument || "—"}</small></div></td>
          <td>{row.date ? `${dateShort(row.date)}${row.slot ? ` · ${row.slot}` : ""}` : "—"}</td>
          <td className="mut">{row.place || row.planName || "—"}</td>
          <td className="n">{row.people}</td>
          <td><ReservationTag status={row.status} /></td>
          <td><PaymentTag status={row.paymentState} balance={row.balance} /></td>
          <td className="n"><b style={{ fontWeight: row.balance > 0 ? 600 : 400, color: row.balance > 0 ? "var(--warn)" : "var(--muted)" }}>{money(row.balance)}</b></td>
          <td className="n"><button className="rx-btn rx-btn--sm" type="button" onClick={(event) => { event.stopPropagation(); setTarget({ type: row.type, id: row.id, code: row.code }); }}>Ver</button></td>
        </tr>; })}</tbody>
      </table></div> : <Empty icon={CalendarRange} title="Sin reservas con estos filtros">Cambia el servicio, el periodo o el estado.</Empty>}
      {list && list.total > list.pageSize ? <div className="rx-filters" style={{ borderBottom: 0, borderTop: "1px solid var(--line-2)", justifyContent: "space-between" }}>
        <small style={{ color: "var(--muted)" }}>{(list.page - 1) * list.pageSize + 1}–{Math.min(list.total, list.page * list.pageSize)} de {list.total}</small>
        <div style={{ display: "flex", gap: 6 }}><button className="rx-btn rx-btn--sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft />Anterior</button><button className="rx-btn rx-btn--sm" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente<ChevronRight /></button></div>
      </div> : null}
    </section>
    <ReservationDrawer target={target} onClose={closeDrawer} onChanged={reload} onEditHotel={(id) => { setTarget(null); openHotelForm({ editar: String(id) }); }} />
    <HotelReservationDrawer open={Boolean(hotelForm)} editId={hotelForm?.editId} roomId={hotelForm?.roomId} onClose={() => setParams(service ? { servicio: service } : {})} onSaved={reload} />
  </>;
}

