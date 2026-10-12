// Operación del día › Tablero del turno. Lo primero que ve Recepción: qué pasa hoy en los 5 servicios,
// qué requiere acción y cómo va su caja. Datos: GET /api/reception/desk (lo carga el cascarón).
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, CircleAlert, ClipboardList, ConciergeBell, DoorClosed, DoorOpen, QrCode, Wallet, Wrench } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Empty, PageHead, Tag, dateLong, money, serviceOf, timeOf, useShift } from "./rxkit";

const BOARD = [
  ["OCUPADA", "En casa", "#0B1020"], ["SALE_HOY", "Salen hoy", "#D99A22"], ["SALIDA_VENCIDA", "Salida vencida", "#C83D46"],
  ["LLEGA_HOY", "Llegan hoy", "#1E6FD6"], ["DISPONIBLE", "Disponibles", "#12A07A"], ["LIMPIEZA", "En limpieza", "#7EC6FF"], ["BLOQUEADA", "Bloqueadas", "#8A97AB"]
];
const AGENDA_ICON = { LLEGADA: DoorOpen, SALIDA: DoorClosed };
const AGENDA_TAG = { ATENCION: ["Revisar", "crit"], COBRO: ["Por cobrar", "warn"], LISTO: ["Listo", "info"], HECHO: ["Ingresó", "ok"] };
const sentence = (text) => { const value = String(text || "").replaceAll("_", " ").toLowerCase().replace("dano", "daño").replace("critica", "crítica"); return value.charAt(0).toUpperCase() + value.slice(1); };
const METHOD = { EFECTIVO: "Efectivo", YAPE: "Yape", PLIN: "Plin", TARJETA: "Tarjeta", "CAJA HOTEL": "Caja" };

export function DeskPage() {
  const { desk, deskLoading, deskError, cashSession } = useShift();
  if (deskLoading) return <LoadingSpinner label="Preparando el tablero del turno…" />;
  if (!desk) return <Empty icon={CircleAlert} title="No se pudo cargar el tablero">{deskError?.message || "Revisa la conexión con el servidor."}</Empty>;
  const { kpis, arrivals, lateArrivals, departures, agenda, attention, cash, rooms, roomCounts, verifications, receivables, requests } = desk;
  const nowKey = desk.now || timeOf(new Date());
  const nowIndex = agenda.findIndex((row) => String(row.time) > nowKey);

  return <>
    <section className="rx-day">
      <div>
        <small>Tablero del turno · actualizado {nowKey}</small>
        <h1>{dateLong(desk.date)}</h1>
        <p>Hotel al {kpis.occupancyRate} % ({kpis.occupied} de {kpis.sellable} habitaciones) · {kpis.guestsInHouse} huéspedes en casa · {kpis.peopleExpected} personas esperadas en Piscina, Mirador, Terraza y Eventos</p>
        <div className="rx-day-actions">
          <Link className="rx-btn rx-btn--primary" to="/admin-panel/movimientos?vista=llegadas"><DoorOpen />Registrar llegada</Link>
          <Link className="rx-btn" to="/admin-panel/accesos"><QrCode />Validar pase QR</Link>
          <Link className="rx-btn" to="/admin-panel/movimientos?vista=salidas"><DoorClosed />Registrar salida</Link>
        </div>
      </div>
      <div className="rx-day-stats">
        <div><b>{kpis.arrivalsPending}</b><span>llegadas por recibir</span></div>
        <div><b>{kpis.departuresPending}</b><span>salidas por cerrar</span></div>
        <div><b>{kpis.inHouseRooms}</b><span>habitaciones en casa</span></div>
        <div><b>{money(kpis.receivables).replace(".00", "")}</b><span>saldo por cobrar</span></div>
      </div>
    </section>

    <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Agenda de hoy</h2><p>Llegadas, salidas, turnos de servicios y eventos en orden de hora</p></div><Link to="/admin-panel/reservas">Ver agenda completa <ArrowRight size={14} /></Link></div>
        {agenda.length ? <div className="rx-agenda">
          {agenda.map((row, index) => {
            const Icon = AGENDA_ICON[row.kind] || serviceOf(row.service).icon;
            const [label, tone] = AGENDA_TAG[row.state] || ["—", "off"];
            return <div key={`${row.code}-${row.kind}-${index}`}>
              {index === nowIndex ? <div className="rx-agenda-now"><span>{nowKey}</span><span /></div> : null}
              <div className={`rx-agenda-row ${nowIndex !== -1 && index < nowIndex ? "is-past" : nowIndex === -1 ? "is-past" : ""}`}>
                <time>{row.time}</time><span className="pin"><span /></span>
                <div className="what"><Icon aria-hidden="true" /><div style={{ minWidth: 0 }}><b>{row.title}</b><small>{row.detail} · {row.code}</small></div></div>
                <Tag tone={tone}>{label}</Tag>
              </div>
            </div>;
          })}
          {nowIndex === -1 ? <div className="rx-agenda-now"><span>{nowKey}</span><span /></div> : null}
        </div> : <Empty title="Sin movimientos programados para hoy">Las reservas de cualquier servicio aparecerán aquí por hora.</Empty>}
      </section>

      <div className="rx-stack">
        <section className="rx-card">
          <div className="rx-card-h"><div><h2>Requiere atención</h2><p>Ordenado por urgencia</p></div></div>
          {attention.length ? <div className="rx-attn">{attention.map((item) => <Link key={item.key} className={item.tone} to={item.href}>{item.count != null ? <b>{item.count}</b> : <CircleAlert size={16} />}<span>{item.label}</span><ChevronRight /></Link>)}</div> : <Empty title="Todo al día">No hay pendientes para Recepción.</Empty>}
        </section>

        <section className="rx-card">
          <div className="rx-card-h"><div><h2>Mi caja del turno</h2><p>{cashSession ? `Abierta a las ${timeOf(cashSession.openedAt)}${cashSession.status === "EN_REVISION" ? " · en revisión del dueño" : ""}` : "Aún no abres tu caja"}</p></div><Link to="/admin-panel/mi-caja">{cashSession?.status === "ABIERTA" ? "Cerrar caja" : "Ir a mi caja"} <ArrowRight size={14} /></Link></div>
          <div className="rx-card-b">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span style={{ color: "var(--muted)", fontSize: 12.5 }}>Cobrado por ti hoy</span><b style={{ fontSize: 22, fontWeight: 600 }}>{money(cash.collected)}</b></div>
            <div className="rx-ledger" style={{ marginTop: 10 }}>
              {Object.keys(cash.byMethod).length ? Object.entries(cash.byMethod).map(([method, amount]) => <div key={method}><span>{METHOD[method] || method}</span><b>{money(amount)}</b></div>) : <div><span>Sin cobros registrados en este turno</span><b>—</b></div>}
            </div>
          </div>
        </section>
      </div>
    </div>

    <div className="rx-grid rx-g-3 rx-mt">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Habitaciones</h2><p>{rooms.length} habitaciones · ocupación {kpis.occupancyRate} %</p></div><Link to="/admin-panel/habitaciones">Ver plano <ArrowRight size={14} /></Link></div>
        <div className="rx-card-b">
          <div className="rx-bar" style={{ height: 12, marginTop: 0 }} role="img" aria-label="Distribución de habitaciones por estado">
            {BOARD.map(([key, , color]) => roomCounts[key] ? <span key={key} title={`${roomCounts[key]}`} style={{ width: `${(roomCounts[key] / rooms.length) * 100}%`, background: color }} /> : null)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 14 }}>
            {BOARD.map(([key, label, color]) => <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} /><span style={{ flex: 1, color: "var(--muted)" }}>{label}</span><b style={{ fontWeight: 600 }}>{roomCounts[key] || 0}</b></div>)}
          </div>
        </div>
      </section>

      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Cobros por gestionar</h2><p>{receivables.count} con saldo · {money(receivables.amount)}</p></div><Link to="/admin-panel/cobros">Ir a cobros <ArrowRight size={14} /></Link></div>
        {verifications.length ? <ul className="rx-list">{verifications.slice(0, 4).map((row) => { const Icon = serviceOf(row.service).icon; return <li key={`${row.kind}-${row.id}`}><span className="rx-ico warn"><Icon /></span><div className="grow"><b>{row.client?.name || row.code}</b><small>{row.serviceName} · {row.method} op. {row.reference}</small></div><b className="rx-mono">{money(row.amount)}</b></li>; })}</ul>
          : <Empty icon={Wallet} title="Sin pagos por verificar">Los Yape/Plin que envían los clientes aparecerán aquí.</Empty>}
      </section>

      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Solicitudes abiertas</h2><p>{kpis.openRequests} de huéspedes y áreas · {kpis.activeOrders} pedidos en curso</p></div><Link to="/admin/limpieza/resumen">Coordinar <ArrowRight size={14} /></Link></div>
        {requests.length ? <ul className="rx-list">{requests.slice(0, 5).map((row) => <li key={row.id}><span className={`rx-ico ${row.maintenance ? "crit" : ""}`}>{row.maintenance ? <Wrench /> : <ConciergeBell />}</span><div className="grow"><b>{sentence(row.type) || row.code}</b><small>{row.location || "Sin ubicación"} · {timeOf(row.createdAt)}</small></div><Tag tone={["ALTA", "CRITICA"].includes(row.priority) ? "crit" : "off"}>{sentence(row.priority) || "—"}</Tag></li>)}</ul>
          : <Empty icon={ClipboardList} title="Sin solicitudes abiertas" />}
      </section>
    </div>

    <div className="rx-grid rx-g-2e rx-mt">
      <MovementTable title="Llegadas de hoy" subtitle={`${arrivals.length} por recibir${lateArrivals.length ? ` · ${lateArrivals.length} atrasadas` : ""}`} href="/admin-panel/movimientos?vista=llegadas"
        rows={[...arrivals, ...lateArrivals].slice(0, 6).map((row) => ({ key: row.id, room: row.room?.number, name: row.client?.name, sub: `${row.code} · ${row.nights} noche(s) · ${row.adults + row.children} pers.`, tag: row.lateBy === "NO_SE_PRESENTO" ? ["No se presentó", "crit"] : row.lateBy ? ["Atrasada", "warn"] : row.blockers.length ? [row.blockers[0].label, "warn"] : ["Lista para check-in", "ok"], href: `/admin-panel/movimientos?vista=llegadas&abrir=${row.id}` }))}
        empty="No hay llegadas pendientes para hoy." icon={DoorOpen} />
      <MovementTable title="Salidas de hoy" subtitle={`${departures.length} por cerrar${departures.filter((row) => row.departureState === "VENCIDA").length ? ` · ${departures.filter((row) => row.departureState === "VENCIDA").length} vencidas` : ""}`} href="/admin-panel/movimientos?vista=salidas"
        rows={departures.slice(0, 6).map((row) => ({ key: row.stayId, room: row.room?.number, name: row.client?.name, sub: `${row.code} · saldo ${money(row.account.balance)}`, tag: row.departureState === "VENCIDA" ? ["Salida vencida", "crit"] : row.inspection ? [row.inspection.status === "FINALIZADA" ? "Revisada" : row.inspection.status === "DANOS_REPORTADOS" ? "Con daños" : "En revisión", row.inspection.status === "DANOS_REPORTADOS" ? "crit" : "info"] : ["Sale hoy", "warn"], href: `/admin-panel/movimientos?vista=salidas&abrir=${row.stayId}` }))}
        empty="No hay salidas pendientes para hoy." icon={DoorClosed} />
    </div>
  </>;
}

function MovementTable({ title, subtitle, href, rows, empty, icon }) {
  return <section className="rx-card">
    <div className="rx-card-h"><div><h2>{title}</h2><p>{subtitle}</p></div><Link to={href}>Abrir <ArrowRight size={14} /></Link></div>
    {rows.length ? <ul className="rx-list">{rows.map((row) => <li key={row.key}>
      <span className="rx-roomno" style={{ width: 48, height: 40 }}><b style={{ fontSize: 14 }}>{row.room || "—"}</b></span>
      <div className="grow"><b>{row.name}</b><small>{row.sub}</small></div>
      <Tag tone={row.tag[1]}>{row.tag[0]}</Tag>
      <Link className="rx-btn rx-btn--sm" to={row.href}>Atender</Link>
    </li>)}</ul> : <Empty icon={icon} title={empty} />}
  </section>;
}

