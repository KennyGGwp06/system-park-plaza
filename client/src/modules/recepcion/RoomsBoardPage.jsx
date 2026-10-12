// Operación del día › Habitaciones. Dos vistas del mismo inventario:
//  · Plano por piso: el estado de cada habitación hoy (en casa, sale hoy, llega hoy, disponible, limpieza, bloqueada).
//  · Planificación: calendario de 14 días con las reservas por habitación (como el "rack" de un sistema hotelero).
// Datos: /api/reception/desk (plano) y /api/reception/planning (calendario). Bloquear/habilitar: PATCH /api/rooms/:id.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, LayoutGrid, CalendarRange, Lock, Unlock, BedDouble, LogIn, LogOut, RefreshCw } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, Tag, addDays, dateShort, money, todayKey, useShift, useToast, weekday } from "./rxkit";
import { ReservationDrawer } from "./ReservationDrawer";

const BOARD = {
  OCUPADA: ["En casa", "ink"], SALE_HOY: ["Sale hoy", "warn"], SALIDA_VENCIDA: ["Salida vencida", "crit"], LLEGA_HOY: ["Llega hoy", "info"],
  DISPONIBLE: ["Disponible", "ok"], LIMPIEZA: ["En limpieza", "info"], BLOQUEADA: ["Bloqueada", "off"]
};
const LEGEND = [["DISPONIBLE", "#12A07A"], ["LLEGA_HOY", "#1E6FD6"], ["OCUPADA", "#0B1020"], ["SALE_HOY", "#D99A22"], ["SALIDA_VENCIDA", "#C83D46"], ["LIMPIEZA", "#7EC6FF"], ["BLOQUEADA", "#8A97AB"]];
const PLAN_LEGEND = [["EN_CASA", "En casa", "#0B1020"], ["CONFIRMADA", "Confirmada", "#1E6FD6"], ["POR_COBRAR", "Con saldo", "#D99A22"], ["VERIFICAR", "Pago por verificar", "#FFF4DC"], ["VENCIDA", "Salida vencida", "#C83D46"], ["SALIO", "Ya salió", "#E6E9EE"]];
const CELL = 64;

export function RoomsBoardPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("vista") === "plan" ? "plan" : "plano";
  const { desk, deskLoading, reloadDesk } = useShift();
  const [roomId, setRoomId] = useState(Number(params.get("hab") || 0) || null);
  const [floor, setFloor] = useState("TODOS");
  const [filter, setFilter] = useState("TODOS");

  if (deskLoading || !desk) return <LoadingSpinner label="Cargando habitaciones…" />;
  const rooms = desk.rooms;
  const floors = [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b);
  const visible = rooms.filter((room) => (floor === "TODOS" || String(room.floor) === String(floor)) && (filter === "TODOS" || room.board === filter));
  const selected = rooms.find((room) => room.id === roomId) || null;

  return <>
    <PageHead title="Habitaciones" tools={<>
      <div className="rx-seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "plano"} className={tab === "plano" ? "is-on" : ""} onClick={() => setParams({})}><LayoutGrid size={15} />Plano por piso</button>
        <button type="button" role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "is-on" : ""} onClick={() => setParams({ vista: "plan" })}><CalendarRange size={15} />Planificación</button>
      </div>
      <button className="rx-btn" type="button" onClick={reloadDesk}><RefreshCw />Actualizar</button>
    </>}>Estado de cada habitación en tiempo real y su ocupación de los próximos días.</PageHead>

    {tab === "plano" ? <>
      <div className="rx-grid rx-g-kpi" style={{ marginBottom: 14 }}>
        {LEGEND.slice(0, 6).map(([key, color]) => <button key={key} type="button" className="rx-kpi" style={{ textAlign: "left", cursor: "pointer", borderColor: filter === key ? "var(--blue)" : undefined, boxShadow: filter === key ? "inset 0 0 0 1px var(--blue)" : undefined, font: "inherit", color: "inherit" }} onClick={() => setFilter(filter === key ? "TODOS" : key)} aria-pressed={filter === key}>
          <div className="rx-kpi-l"><i style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />{BOARD[key][0]}</div>
          <div className="rx-kpi-v">{desk.roomCounts[key] || 0}</div>
        </button>)}
      </div>
      <section className="rx-card">
        <div className="rx-filters">
          <span style={{ color: "var(--muted)", fontSize: 12.5 }}>Piso</span>
          <div className="rx-seg">{["TODOS", ...floors].map((value) => <button key={value} type="button" className={String(floor) === String(value) ? "is-on" : ""} onClick={() => setFloor(value)}>{value === "TODOS" ? "Todos" : `Piso ${value}`}</button>)}</div>
          {filter !== "TODOS" ? <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={() => setFilter("TODOS")}>Quitar filtro: {BOARD[filter][0]}</button> : null}
          <div className="rx-legend" style={{ marginLeft: "auto" }}>{LEGEND.map(([key, color]) => <span key={key}><i style={{ background: color }} />{BOARD[key][0]}</span>)}</div>
        </div>
        {floors.filter((value) => floor === "TODOS" || String(value) === String(floor)).map((value) => {
          const list = visible.filter((room) => room.floor === value);
          if (!list.length) return null;
          return <div className="rx-floor" key={value}>
            <header><b>Piso {value}</b><small>{list.length} hab.</small></header>
            <div className="rx-rooms">{list.map((room) => <button key={room.id} type="button" className={`rx-room b-${room.board}`} onClick={() => setRoomId(room.id)}>
              <span className="num"><b>{room.number}</b><small>{room.type}</small></span>
              <span className="who">{room.guest?.name || room.arrival?.name || (room.board === "BLOQUEADA" ? room.statusNote || "Fuera de venta" : "")}</span>
              <span className="st">{BOARD[room.board][0]}{room.guest ? ` · sale ${dateShort(room.guest.departure)}` : ""}{room.task ? " · limpieza" : ""}</span>
            </button>)}</div>
          </div>;
        })}
        {!visible.length ? <Empty icon={BedDouble} title="Ninguna habitación con este filtro" /> : null}
      </section>
    </> : <PlanningView />}

    <RoomDrawer room={selected} onClose={() => { setRoomId(null); if (params.get("hab")) setParams(tab === "plan" ? { vista: "plan" } : {}); }} onChanged={reloadDesk} />
  </>;
}

function RoomDrawer({ room, onClose, onChanged }) {
  const show = useToast();
  const { active } = useShift();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!room) return null;
  const [label, tone] = BOARD[room.board];
  async function setStatus(status) {
    if (status === "MANTENIMIENTO" && !note.trim()) { setError("Escribe el motivo del bloqueo para que el resto del equipo lo sepa."); return; }
    setBusy(true); setError("");
    try {
      await api(`/rooms/${room.id}`, { method: "PATCH", body: { status, note: status === "LIBRE" ? "" : note.trim() } });
      show(status === "LIBRE" ? `Habitación ${room.number} habilitada para la venta.` : `Habitación ${room.number} bloqueada: ${note.trim()}.`);
      setNote(""); onChanged(); onClose();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Drawer open onClose={() => { setError(""); onClose(); }} busy={busy} eyebrow={`Piso ${room.floor} · ${room.type}`} title={`Habitación ${room.number}`} subtitle={`Capacidad ${room.capacity} · tarifa ${money(room.price)} por noche`}
    footer={<>
      {room.board === "DISPONIBLE" ? <Link className="rx-btn rx-btn--primary" to={`/admin-panel/reservas?nueva=HOSPEDAJE&habitacion=${room.id}`}>Crear reserva</Link> : null}
      {room.guest ? <Link className="rx-btn rx-btn--primary" to={`/admin-panel/movimientos?vista=${["SALE_HOY", "SALIDA_VENCIDA"].includes(room.board) ? "salidas" : "encasa"}&abrir=${room.guest.stayId}`}><LogOut />Cuenta y salida</Link> : null}
      {room.arrival ? <Link className="rx-btn rx-btn--primary" to={`/admin-panel/movimientos?vista=llegadas`}><LogIn />Ir al check-in</Link> : null}
    </>}>
    <div><Tag tone={tone}>{label}</Tag> <Tag tone={room.cleaningStatus === "LIMPIA" ? "ok" : "warn"}>{room.cleaningStatus === "LIMPIA" ? "Limpia" : room.cleaningStatus || "Sin dato de limpieza"}</Tag></div>
    {room.guest ? <section className="rx-sec"><h3>Huésped en casa</h3><dl className="rx-dl"><div><dt>Titular</dt><dd>{room.guest.name}</dd></div><div><dt>Reserva</dt><dd>{room.guest.code}</dd></div><div><dt>Salida prevista</dt><dd>{dateShort(room.guest.departure)}</dd></div></dl></section> : null}
    {room.arrival ? <section className="rx-sec"><h3>Llega hoy</h3><dl className="rx-dl"><div><dt>Titular</dt><dd>{room.arrival.name}</dd></div><div><dt>Reserva</dt><dd>{room.arrival.code}</dd></div><div><dt>Check-in</dt><dd>{room.arrival.ready ? "Lista" : "Con pendientes"}</dd></div></dl></section> : null}
    {room.task ? <Alert tone="info">Tarea de Limpieza {room.task.code} en estado {String(room.task.status).replaceAll("_", " ").toLowerCase()}. <Link to="/admin/limpieza/resumen" style={{ fontWeight: 600 }}>Ver en Limpieza</Link></Alert> : null}
    {!room.guest && room.board !== "BLOQUEADA" ? <section className="rx-sec"><h3>Bloquear por mantenimiento</h3>
      <div style={{ display: "grid", gap: 8 }}>
        <input className="rx-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Motivo: aire acondicionado, gasfitería, pintura…" />
        <button className="rx-btn rx-btn--danger" type="button" onClick={() => setStatus("MANTENIMIENTO")} disabled={busy || !active}><Lock />Sacar de la venta</button>
        <small style={{ color: "var(--muted)" }}>Para enviar un técnico, registra la incidencia en Mantenimiento.</small>
      </div>
    </section> : null}
    {room.board === "BLOQUEADA" ? <section className="rx-sec"><h3>Habitación fuera de venta</h3>
      <p style={{ margin: "0 0 8px", fontSize: 13 }}>{room.statusNote || "Sin motivo registrado."}</p>
      <button className="rx-btn rx-btn--dark" type="button" onClick={() => setStatus("LIBRE")} disabled={busy || !active}><Unlock />Habilitar para la venta</button>
    </section> : null}
    {!active ? <Alert tone="warn">Inicia tu turno para cambiar el estado de una habitación.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function PlanningView() {
  const today = todayKey();
  const [from, setFrom] = useState(addDays(today, -1));
  const [target, setTarget] = useState(null);
  const { data, loading, reload } = useFetch(`/reception/planning?from=${from}&days=14`, { initialData: null, realtime: true, pollInterval: 30000 });
  const grouped = useMemo(() => {
    if (!data) return [];
    const byFloor = new Map();
    data.rooms.forEach((room) => { if (!byFloor.has(room.floor)) byFloor.set(room.floor, []); byFloor.get(room.floor).push(room); });
    return [...byFloor.entries()];
  }, [data]);
  if (loading && !data) return <LoadingSpinner label="Cargando planificación…" />;
  if (!data) return <Empty title="No se pudo cargar la planificación" />;
  const index = (date) => data.dates.indexOf(date);
  const width = data.dates.length * CELL;
  const blockGeometry = (block) => {
    const startIndex = block.arrival < data.from ? -1 : index(block.arrival);
    const left = startIndex < 0 ? 0 : startIndex * CELL + CELL / 2;
    const endIndex = index(block.visualEnd);
    const right = endIndex < 0 ? width : endIndex * CELL + CELL / 2;
    return { left: left + 2, width: Math.max(18, right - left - 4) };
  };
  return <section className="rx-card">
    <div className="rx-filters">
      <div style={{ display: "flex", gap: 6 }}>
        <button className="rx-btn rx-btn--sm" type="button" onClick={() => setFrom(addDays(from, -7))} aria-label="Semana anterior"><ChevronLeft /></button>
        <button className="rx-btn rx-btn--sm" type="button" onClick={() => setFrom(addDays(today, -1))}>Hoy</button>
        <button className="rx-btn rx-btn--sm" type="button" onClick={() => setFrom(addDays(from, 7))} aria-label="Semana siguiente"><ChevronRight /></button>
      </div>
      <b style={{ fontSize: 13, fontWeight: 600 }}>{dateShort(data.dates[0])} – {dateShort(data.dates[data.dates.length - 1])}</b>
      <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={reload}><RefreshCw />Actualizar</button>
      <div className="rx-legend" style={{ marginLeft: "auto" }}>{PLAN_LEGEND.map(([key, label, color]) => <span key={key}><i style={{ background: color, border: key === "VERIFICAR" || key === "POR_COBRAR" ? "1px dashed #D99A22" : undefined }} />{label}</span>)}</div>
    </div>
    <div className="rx-plan">
      <table>
        <thead><tr><th className="rc">Habitación</th>{data.dates.map((date) => { const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); return <th key={date} className={`dh ${date === data.today ? "is-today" : ""} ${dow === 0 || dow === 6 ? "is-weekend" : ""}`}><span>{weekday(date)}</span><b>{date.slice(8)}</b></th>; })}</tr></thead>
        <tbody>{grouped.map(([floorNumber, list]) => [
          <tr key={`f-${floorNumber}`} className="floor-row"><td className="rc" style={{ background: "#FBFCFE" }}>Piso {floorNumber}</td><td colSpan={data.dates.length} /></tr>,
          ...list.map((room) => {
            const blocks = withLanes(data.blocks.filter((block) => block.roomId === room.id));
            const clash = blocks.some((block) => block.lane != null);
            return <tr key={room.id}>
              <th className="rc" scope="row" title={clash ? "Dos reservas activas se cruzan en esta habitación: ábrela en la Agenda y reasigna la habitación" : undefined}><b>{room.number}</b><small className={clash ? "clash" : ""}>{clash ? "Cruce de reservas" : room.type}{["MANTENIMIENTO", "FUERA_SERVICIO"].includes(room.status) ? " · bloqueada" : ""}</small></th>
              {data.dates.map((date, cellIndex) => <td key={date} className={`cell ${date === data.today ? "is-today" : ""}`}>
                {cellIndex === 0 ? blocks.map((block) => { const geo = blockGeometry(block); return <button key={block.id} type="button" className={`rx-block s-${block.status}${block.lane != null ? ` lane-${block.lane}` : ""}`} style={{ left: geo.left, width: geo.width }} title={`${block.code} · ${block.clientName} · ${dateShort(block.arrival)} → ${dateShort(block.departure)}${block.balance > 0 ? ` · saldo ${money(block.balance)}` : ""}`} onClick={() => setTarget({ type: "HOSPEDAJE", id: block.id, code: block.code })}>{block.clientName}<small>{block.code}</small></button>; }) : null}
              </td>)}
            </tr>;
          })
        ])}</tbody>
        <tfoot><tr><td className="rc">Ocupadas</td>{data.occupancy.map((day) => <td key={day.date} title={`${day.rooms} de ${data.rooms.length}`}>{Math.round((day.rooms / Math.max(1, data.rooms.length)) * 100)}%</td>)}</tr></tfoot>
      </table>
    </div>
    <ReservationDrawer target={target} onClose={() => setTarget(null)} onChanged={reload} />
  </section>;
}

// Dos reservas activas que se cruzan en la misma habitación se dibujan en dos carriles para que ninguna quede oculta.
function withLanes(blocks) {
  const active = blocks.filter((block) => block.status !== "SALIO");
  return blocks.map((block) => {
    if (block.status === "SALIO") return block;
    const others = active.filter((other) => other !== block && other.arrival < block.visualEnd && block.arrival < other.visualEnd);
    if (!others.length) return block;
    const first = [block, ...others].sort((a, b) => String(a.arrival).localeCompare(String(b.arrival)) || a.id - b.id)[0];
    return { ...block, lane: first === block ? 0 : 1 };
  });
}
