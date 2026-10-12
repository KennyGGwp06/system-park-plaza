import { useEffect, useState } from "react";
import {
  AlertTriangle, BedDouble, CalendarCheck, CheckCircle2, CreditCard, FileText, LayoutGrid, Plus, Receipt,
  Search, Settings, ShieldCheck, SunMedium, Users, Waves, X
} from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { Bullets, Columns, COLORS, Empty as ChartEmpty, fmt, GroupedBars, HBars, StackedBar, TipLayer, useTip } from "./OwnerCharts";
import "./OwnerHome.css";
import "./ReservationsOverview.css";

const SERVICE_META = {
  HOSPEDAJE: { label: "Hospedaje", icon: BedDouble, view: "hospedaje", tone: "lodging" },
  PISCINA: { label: "Piscina", icon: Waves, view: "piscina", tone: "pool" },
  MIRADOR: { label: "Mirador", icon: SunMedium, view: "mirador", tone: "lookout" },
  TERRAZA: { label: "Terraza", icon: LayoutGrid, view: "terraza", tone: "terrace" },
  EVENTOS: { label: "Eventos", icon: CalendarCheck, view: "eventos", tone: "events" }
};

const money = (value) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Estado normalizado entre los tres modelos (antes cada uno traía su propio vocabulario: ver
// SUPERADMIN_RESERVAS.md). Lo calcula el servidor (reservations-overview.js); aquí solo se pinta.
const STATUS_TONE = { POR_CONFIRMAR: "warn", CONFIRMADA: "ok", EN_CURSO: "info", COMPLETADA: "off", CANCELADA: "bad" };
const RANGE_OPTIONS = [["1", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["todas", "Todas"]];
// Pestañas por servicio: cuánto pasado traer (lo cerrado y antiguo vive en el historial del servidor).
const HISTORY_OPTIONS = [["90", "90 días"], ["365", "1 año"], ["todas", "Toda la historia"]];
function HistoryRange({ value, onChange }) { return <div className="oh-seg">{HISTORY_OPTIONS.map(([key, label]) => <button key={key} type="button" className={value === key ? "on" : ""} onClick={() => onChange(key)}>{label}</button>)}</div>; }
const QUICK_CREATE = [
  { code: "HOSPEDAJE", label: "Hospedaje", area: "reservas", page: "hospedaje" },
  { code: "PISCINA", label: "Piscina", area: "reservas", page: "piscina" },
  { code: "MIRADOR", label: "Mirador", area: "reservas", page: "mirador" },
  { code: "TERRAZA", label: "Terraza", area: "reservas", page: "terraza" },
  { code: "EVENTOS", label: "Evento", area: "reservas", page: "eventos" }
];

function StatusPill({ status, label }) { return <span className={`ro-pill ro-pill--${STATUS_TONE[status] || "off"}`}>{label}</span>; }
function shortDate(value) { return value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "") : "Por confirmar"; }
function Card({ title, sub, legend, children }) { return <section className="oh-card"><div className="oh-ch"><h2>{title}</h2>{legend ? <div className="oh-leg">{legend}</div> : null}</div>{sub ? <div className="oh-ch2">{sub}</div> : null}<div className="oh-body">{children}</div></section>; }
const Legend = ({ items }) => items.map(([label, color, kind]) => <span key={label}><i className={kind === "sq" ? "sq" : ""} style={{ background: color }} />{label}</span>);

export function ReservationsOverviewPage({ navigate }) {
  const tip = useTip();
  const [range, setRange] = useState("30");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  const params = new URLSearchParams({ range, page: String(page), pageSize: "10" });
  if (service) params.set("service", service);
  if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const { data, loading, error, reload } = useFetch(`/superadmin/reservations?${params.toString()}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000 });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Cargando la agenda de reservas..." /></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle /><div><strong>No se pudo cargar la agenda</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { summary, list, today } = data;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const serviceRows = summary.reservasPorServicio.map((row) => ({ name: row.name, a: row.total, b: row.confirmadas }));
  const estadoPago = { PAGADO: 0, PARCIAL: 0, PENDIENTE: 0, ...Object.fromEntries(summary.estadoPago.map((row) => [row.key, row.count])) };
  const proximosValues = summary.proximos7Dias.map((row) => row.count);
  const proximosLabels = summary.proximos7Dias.map((row) => row.label);
  const bestDayIndex = proximosValues.indexOf(Math.max(...proximosValues));
  const delta = summary.total - summary.totalPrevious;

  return <main className="oh">
    <TipLayer tip={tip.tip} />
    {toast ? <div className="ro-toast"><ShieldCheck size={16} />{toast}</div> : null}
    <div className="oh-ph"><div><h1>Reservas generales</h1><p>Hospedaje, Piscina, Mirador, Terraza y Eventos en una sola agenda · {fmt(summary.total)} reservas en el rango</p></div>
      <div className="oh-tools"><div className="oh-seg">{RANGE_OPTIONS.map(([value, label]) => <button key={value} type="button" className={range === value ? "on" : ""} onClick={() => { setRange(value); setPage(1); }}>{label}</button>)}</div></div>
    </div>

    <div className="ro-quick"><span>Nueva reserva:</span>{QUICK_CREATE.map((item) => <button key={item.code} type="button" className="oh-btn" onClick={() => navigate(item.area, item.page)}><Plus size={14} />{item.label}</button>)}</div>

    {summary.atencion.count ? <div className="oh-alert"><AlertTriangle /><div><strong>{summary.atencion.count} reservas requieren atención</strong><span> · {summary.atencion.saldo} con saldo pendiente · {summary.atencion.porConfirmar} por confirmar</span></div></div> : null}

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Reservas en el rango</div><div className="v">{fmt(summary.total)}</div><div className="d">{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs. período anterior</div></div>
      <div className="k"><div className="l">Por confirmar</div><div className="v" style={{ color: "#8A5A12" }}>{fmt(summary.porConfirmar)}</div><div className="d">requieren seguimiento</div></div>
      <div className="k"><div className="l">Personas esperadas hoy</div><div className="v">{fmt(summary.personasHoy)}</div><div className="d">todos los servicios</div></div>
      <div className="k"><div className="l">Saldo pendiente</div><div className="v" style={{ color: "var(--red)" }}>{money(summary.saldoPendiente.amount)}</div><div className="d">{summary.saldoPendiente.count} reservas con saldo</div></div>
      <div className="k"><div className="l">Cancelaciones</div><div className="v">{fmt(summary.cancelaciones.count)}</div><div className="d">{summary.cancelaciones.rate}% del rango</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Reservas por servicio" sub="Volumen del rango y cuántas ya están confirmadas" legend={<Legend items={[["Total", COLORS.gray, "sq"], ["Confirmadas", COLORS.blue, "sq"]]} />}>
        <GroupedBars rows={serviceRows} aName="Total" bName="Confirmadas" tip={tip} aColor={COLORS.gray} bColor={COLORS.blue} format={fmt} tipFormat={fmt} />
      </Card>
      <Card title="Estado de pago" sub={`De las ${fmt(summary.total)} reservas del rango`}>
        <StackedBar tip={tip} label="Reservas" legendValue="count" segments={[{ name: "Pagado", value: estadoPago.PAGADO, color: COLORS.blue }, { name: "Parcial", value: estadoPago.PARCIAL, color: COLORS.mid, text: COLORS.ink }, { name: "Pendiente", value: estadoPago.PENDIENTE, color: COLORS.red }]} format={fmt} />
        <div className="oh-sub2">Próximos 7 días · volumen total</div>
        <Columns values={proximosValues} labels={proximosLabels} highlight={bestDayIndex >= 0 && proximosValues[bestDayIndex] ? [bestDayIndex] : []} name="Reservas" tip={tip} w={360} h={140} />
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Agenda de reservas</h2><small>{list.total} resultado(s)</small></div>
      <div className="ro-fbar">
        <div className="ro-sbox"><Search size={15} /><input value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="DNI, cliente o código de reserva" /></div>
        <div className="ro-chips">
          <button type="button" className={!service ? "on" : ""} onClick={() => { setService(""); setPage(1); }}>Todas <b>{list.total}</b></button>
          {list.serviceCounts.filter((row) => row.count > 0).map((row) => { const meta = SERVICE_META[row.code]; const Icon = meta.icon; return <button key={row.code} type="button" className={service === row.code ? "on" : ""} onClick={() => { setService(row.code); setPage(1); }}><Icon size={13} />{meta.label} <b>{row.count}</b></button>; })}
        </div>
        <select className="ro-select" aria-label="Estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="POR_CONFIRMAR">Por confirmar</option>
          <option value="CONFIRMADA">Confirmada</option>
          <option value="EN_CURSO">En curso</option>
          <option value="COMPLETADA">Completada</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
      </div>
      {!list.rows.length ? <ChartEmpty title="No hay reservas con estos filtros" text="Cambia el rango, el servicio, el estado o la búsqueda." /> : <table className="ro-table"><thead><tr><th>Reserva y cliente</th><th>Servicio</th><th>Fecha y horario</th><th>Personas</th><th>Pago</th><th>Estado</th><th>Siguiente acción</th></tr></thead><tbody>
        {list.rows.map((row) => { const meta = SERVICE_META[row.type]; const Icon = meta.icon; return <tr key={`${row.type}-${row.id}`}>
          <td><strong>{row.code}</strong><small className="ro-mut">{row.clientName}</small></td>
          <td><span className="ro-svc"><Icon size={14} />{meta.label}</span></td>
          <td><strong>{shortDate(row.date)}</strong>{row.slot || row.place ? <small className="ro-mut">{[row.slot, row.place].filter(Boolean).join(" · ")}</small> : null}</td>
          <td>{row.people} persona(s)</td>
          <td><strong>{money(row.paid)}</strong>{row.balance > 0 ? <small className="ro-neg">Saldo {money(row.balance)}</small> : <small className="ro-mut">Pagado</small>}</td>
          <td><StatusPill status={row.status} label={row.statusLabel} /></td>
          <td><button type="button" className={`ro-act ${row.nextAction.action === "COBRAR_SALDO" ? "p" : ""}`} onClick={() => setSelected(row)}>{row.nextAction.label}</button></td>
        </tr>; })}
      </tbody></table>}
      <div className="pager"><span>Mostrando {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {selected ? <ReservationDrawer key={`${selected.type}-${selected.id}`} row={selected} today={today} onClose={() => setSelected(null)} onChanged={() => reload()} notify={notify} /> : null}
  </main>;
}

/** Panel de detalle de una reserva: pagos, historial auditado y las tres acciones que antes solo
 * existían por separado en cada módulo de servicio (confirmar, cobrar saldo, reprogramar, cancelar). */
function ReservationDrawer({ row, today, onClose, onChanged, notify }) {
  const { data: detail, loading, reload } = useFetch(`/superadmin/reservations/${row.type}/${row.id}`, { initialData: null, realtime: false });
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null | "cancel" | "reschedule"
  const [reason, setReason] = useState("");
  const [scheduleForm, setScheduleForm] = useState(() => row.type === "HOSPEDAJE"
    ? { checkInDate: row.checkInDate || row.date || "", checkOutDate: row.checkOutDate || "" }
    : row.type === "EVENTOS"
      ? { startsAt: row.startsAt ? row.startsAt.slice(0, 16) : "", endsAt: row.endsAt ? row.endsAt.slice(0, 16) : "" }
      : { date: row.date || "", slot: row.slot || "" });
  const [formError, setFormError] = useState("");

  useEffect(() => { if (detail) setScheduleForm(row.type === "HOSPEDAJE" ? { checkInDate: detail.checkInDate || "", checkOutDate: detail.checkOutDate || "" } : row.type === "EVENTOS" ? { startsAt: detail.startsAt ? detail.startsAt.slice(0, 16) : "", endsAt: detail.endsAt ? detail.endsAt.slice(0, 16) : "" } : { date: detail.date || "", slot: detail.slot || "" }); }, [detail, row.type]);

  const meta = SERVICE_META[row.type];
  const canAct = !["CANCELADA", "COMPLETADA"].includes((detail || row).status);

  async function runAction(action, body) {
    setBusy(true); setFormError("");
    try {
      await api(`/superadmin/reservations/${row.type}/${row.id}/${action}`, { method: "POST", body });
      notify(action === "cancel" ? "Reserva cancelada." : action === "confirm" ? "Reserva confirmada." : action === "pay" ? "Pago registrado." : "Reserva reprogramada.");
      setMode(null); await reload(); onChanged();
    } catch (error) { setFormError(error.message || "No se pudo completar la acción."); }
    finally { setBusy(false); }
  }

  // Hospedaje y Mirador piden verificar el Yape/Plin antes de aprobarlo: a diferencia de
  // "Cobrar saldo" (que registra cualquier monto), esto reenvía el método/operación/monto exactos
  // que el cliente ya envió — /api/service-bookings/:id/pay los vuelve a comprobar antes de aceptar.
  async function runVerify() {
    setBusy(true); setFormError("");
    try {
      await api(`/service-bookings/${row.id}/pay`, { method: "POST", body: { amount: detail.verify.amount, method: detail.verify.method, reference: detail.verify.reference } });
      notify("Pago verificado y aprobado.");
      await reload(); onChanged();
    } catch (error) { setFormError(error.message || "No se pudo verificar el pago."); }
    finally { setBusy(false); }
  }

  function submitCancel(event) {
    event.preventDefault();
    if (!reason.trim()) { setFormError("Escribe el motivo de la cancelación."); return; }
    runAction("cancel", { reason: reason.trim() });
  }
  function submitReschedule(event) {
    event.preventDefault();
    if (row.type === "HOSPEDAJE") runAction("reschedule", scheduleForm);
    else if (row.type === "EVENTOS") runAction("reschedule", { startsAt: new Date(scheduleForm.startsAt).toISOString(), endsAt: new Date(scheduleForm.endsAt).toISOString() });
    else runAction("reschedule", scheduleForm);
  }

  return <>
    <div className="ro-scrim" onClick={onClose} role="presentation" />
    <aside className="ro-drawer" role="dialog" aria-modal="true" aria-label={`Detalle ${row.code}`}>
      <div className="dh"><div><small>{meta.label} · {row.code}</small><h2>{row.clientName}</h2></div><button type="button" aria-label="Cerrar detalle" onClick={onClose}><X size={16} /></button></div>
      <div className="db">
        {loading && !detail ? <p className="ro-mut">Cargando…</p> : null}
        {formError ? <div className="ro-error">{formError}</div> : null}
        <h3>Reserva</h3>
        <div className="ro-dl">
          <div><span>Servicio</span><b>{meta.label}{row.place ? ` · ${row.place}` : ""}</b></div>
          <div><span>Fecha</span><b>{row.type === "HOSPEDAJE" ? `${shortDate((detail || row).checkInDate)} – ${shortDate((detail || row).checkOutDate)}` : `${shortDate(row.date)}${row.slot ? ` · ${row.slot}` : ""}`}</b></div>
          <div><span>Personas</span><b>{row.people}</b></div>
          <div><span>Estado</span><b><StatusPill status={row.status} label={row.statusLabel} /></b></div>
        </div>
        {detail?.verify ? <><h3>Pago por verificar</h3><div className="ro-verify"><AlertTriangle size={18} /><div>Comprueba el abono en <b>{detail.verify.method}</b> antes de aprobarlo.<br />Operación <b>{detail.verify.reference}</b> · Monto <b>{money(detail.verify.amount)}</b></div></div></> : null}
        <h3>Pago</h3>
        <div className="ro-dl">
          <div><span>Total</span><b>{money(row.total)}</b></div>
          <div><span>Pagado</span><b>{money(row.paid)}</b></div>
          <div><span>Saldo</span><b>{money(row.balance)}</b></div>
        </div>
        {detail?.payments?.length ? <div className="ro-dl">{detail.payments.map((payment, index) => <div key={index}><span>{payment.concept || payment.method}</span><b>{money(payment.amount)}</b></div>)}</div> : null}
        {row.type === "EVENTOS" && detail && (detail.layout || detail.catering?.length || detail.equipment?.length || detail.parkingCount || detail.notes) ? <>
          <h3>Propuesta solicitada por el cliente</h3>
          <div className="ro-dl">
            {detail.eventType ? <div><span>Tipo</span><b>{detail.eventType}</b></div> : null}
            {detail.layout ? <div><span>Montaje</span><b>{String(detail.layout).replaceAll("_", " ")}</b></div> : null}
            {detail.parkingCount ? <div><span>Cochera preliminar</span><b>{detail.parkingCount} espacios</b></div> : null}
            {detail.notes ? <div><span>Indicaciones</span><b>{detail.notes}</b></div> : null}
          </div>
          {detail.catering?.length ? <div className="ro-tags">{detail.catering.map((item, index) => <span key={index}>{item.quantity} x {item.name}</span>)}</div> : null}
          {detail.equipment?.length ? <div className="ro-dl"><div><span>Equipamiento</span><b>{detail.equipment.map((item) => item.name).join(" · ")}</b></div></div> : null}
        </> : null}
        {detail?.history?.length ? <><h3>Historial (auditoría)</h3><div className="ro-hist">{detail.history.map((entry, index) => <div key={index}><span><b>{entry.actorName}</b> · {entry.detail || entry.action}<br /><small>{new Date(entry.at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</small></span></div>)}</div></> : null}

        {mode === "cancel" ? <form className="ro-form" onSubmit={submitCancel}>
          <label>Motivo de la cancelación<textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej: el cliente canceló por teléfono" /></label>
          <div className="row"><button type="button" className="ro-dbtn" onClick={() => setMode(null)}>Volver</button><button type="submit" className="ro-dbtn r" disabled={busy}>{busy ? "Cancelando…" : "Confirmar cancelación"}</button></div>
        </form> : null}

        {mode === "reschedule" ? <form className="ro-form" onSubmit={submitReschedule}>
          {row.type === "HOSPEDAJE" ? <div className="row"><label>Entrada<input type="date" value={scheduleForm.checkInDate} onChange={(event) => setScheduleForm({ ...scheduleForm, checkInDate: event.target.value })} required /></label><label>Salida<input type="date" value={scheduleForm.checkOutDate} onChange={(event) => setScheduleForm({ ...scheduleForm, checkOutDate: event.target.value })} required /></label></div>
            : row.type === "EVENTOS" ? <div className="row"><label>Inicio<input type="datetime-local" value={scheduleForm.startsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, startsAt: event.target.value })} required /></label><label>Fin<input type="datetime-local" value={scheduleForm.endsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, endsAt: event.target.value })} required /></label></div>
              : <div className="row"><label>Fecha<input type="date" value={scheduleForm.date} onChange={(event) => setScheduleForm({ ...scheduleForm, date: event.target.value })} required /></label><label>Horario<input type="text" value={scheduleForm.slot} onChange={(event) => setScheduleForm({ ...scheduleForm, slot: event.target.value })} placeholder="14:00" /></label></div>}
          <div className="row"><button type="button" className="ro-dbtn" onClick={() => setMode(null)}>Volver</button><button type="submit" className="ro-dbtn p" disabled={busy}>{busy ? "Guardando…" : "Guardar nueva fecha"}</button></div>
        </form> : null}
      </div>
      {canAct && mode === null ? <div className="da">
        {detail?.verify ? <button type="button" className="ro-dbtn v" disabled={busy} onClick={runVerify}>{busy ? "Verificando…" : `Confirmar pago verificado · ${money(detail.verify.amount)}`}</button>
          : row.balance > 0 ? <button type="button" className="ro-dbtn p" disabled={busy} onClick={() => runAction("pay")}>{busy ? "Registrando…" : `Cobrar saldo · ${money(row.balance)}`}</button> : null}
        {row.status === "POR_CONFIRMAR" && row.balance <= 0 ? <button type="button" className="ro-dbtn p" disabled={busy} onClick={() => runAction("confirm")}>{busy ? "Confirmando…" : "Confirmar reserva"}</button> : null}
        <button type="button" className="ro-dbtn" disabled={busy} onClick={() => setMode("reschedule")}>Reprogramar</button>
        <button type="button" className="ro-dbtn r" disabled={busy} onClick={() => setMode("cancel")}>Cancelar reserva</button>
      </div> : null}
    </aside>
  </>;
}

const POOL_FILTERS = [["", "Todas"], ["ATENCION", "Requieren atención"], ["CONFIRMADAS", "Confirmadas"], ["CANCELADAS", "Canceladas"]];

/** Reservas > Piscina: primer servicio migrado al mismo lenguaje visual de Reservas generales
 * (plano, azul v3, con gráficos) — ver docs/reservas-piscina-propuesta.html.
 * Reutiliza `/api/superadmin/reservations/pool` (pool-reservations.js) para KPIs/gráficos y las
 * mismas acciones (confirmar/cobrar saldo/reprogramar/cancelar) de Reservas generales vía
 * ReservationDrawer, ya que sus filas vienen normalizadas con `buildRows` (reservations-overview.js). */
export function PoolReservationsPage({ navigate }) {
  const tip = useTip();
  const [filter, setFilter] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  const [histRange, setHistRange] = useState("90");
  const params = new URLSearchParams({ page: String(page), pageSize: "10", range: histRange });
  if (filter) params.set("filter", filter);
  if (q.trim()) params.set("q", q.trim());
  const { data, loading, error, reload } = useFetch(`/superadmin/reservations/pool?${params.toString()}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000 });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Cargando la agenda de piscina..." /></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle /><div><strong>No se pudo cargar la agenda</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { today, kpis, aforo, slots, estadoPago, proximos7Dias, counts, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const nowIndex = slots.findIndex((row) => row.isNow);
  const proximosValues = proximos7Dias.map((row) => row.count);
  const proximosLabels = proximos7Dias.map((row) => row.label);
  const bestDayIndex = proximosValues.indexOf(Math.max(...proximosValues));
  const estado = { PAGADO: 0, PARCIAL: 0, PENDIENTE: 0, ...Object.fromEntries(estadoPago.map((row) => [row.key, row.count])) };
  const chipCount = { "": counts.total, ATENCION: counts.atencion, CONFIRMADAS: counts.confirmadas, CANCELADAS: counts.canceladas };

  return <main className="oh">
    <TipLayer tip={tip.tip} />
    {toast ? <div className="ro-toast"><ShieldCheck size={16} />{toast}</div> : null}
    <div className="oh-ph"><div><h1>Reservas de piscina</h1><p>Horarios, cupos, pagos y validación de acceso · {fmt(kpis.reservasHoy)} reservas para hoy</p></div>
      <div className="oh-tools"><HistoryRange value={histRange} onChange={(value) => { setHistRange(value); setPage(1); }} /><button className="oh-btn" type="button" onClick={() => navigate("admision", "qr")}><ShieldCheck size={14} />Ir a control de accesos</button><button className="oh-btn p" type="button" onClick={() => navigate("clientes", "directorio")}><Plus size={14} />Nueva reserva</button></div>
    </div>

    {counts.atencion ? <div className="oh-alert"><AlertTriangle /><div><strong>{counts.atencion} reservas requieren atención</strong><span> · {kpis.saldoPendiente.count} con saldo pendiente · {kpis.porValidar} por validar ingreso</span></div></div> : null}

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Reservas hoy</div><div className="v">{fmt(kpis.reservasHoy)}</div><div className="d">para el día de hoy</div></div>
      <div className="k"><div className="l">Cupos ahora · franja {aforo.slot}</div><div className="v">{fmt(Math.max(0, aforo.capacity - aforo.inside))} <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>de {fmt(aforo.capacity)}</span></div><div className="d">{fmt(aforo.inside)} personas dentro ahora</div></div>
      <div className="k"><div className="l">Personas esperadas hoy</div><div className="v">{fmt(kpis.personasEsperadasHoy)}</div><div className="d">en las franjas de hoy</div></div>
      <div className="k"><div className="l">Por validar ingreso</div><div className="v" style={{ color: "#8A5A12" }}>{fmt(kpis.porValidar)}</div><div className="d">pagadas, sin marcar acceso</div></div>
      <div className="k"><div className="l">Saldo pendiente</div><div className="v" style={{ color: "var(--red)" }}>{money(kpis.saldoPendiente.amount)}</div><div className="d">{kpis.saldoPendiente.count} reservas con saldo</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Ocupación por franja horaria" sub={`Personas registradas hoy frente a la capacidad de ${fmt(aforo.capacity)} por franja`}>
        <Columns values={slots.map((row) => row.used)} labels={slots.map((row) => row.slot)} highlight={nowIndex >= 0 ? [nowIndex] : []} name="Personas" tip={tip} w={420} h={200} />
      </Card>
      <Card title="Aforo ahora" sub={`Franja ${aforo.slot}`}>
        <Bullets rows={[{ code: "PISCINA", name: "Piscina", inside: aforo.inside, capacity: aforo.capacity, estimated: true }]} total={{ value: aforo.inside, capacity: aforo.capacity }} tip={tip} />
      </Card>
    </div>

    <div className="oh-grid g-8-4">
      <Card title="Estado de pago" sub={`De las ${fmt(counts.total)} reservas de piscina en agenda`}>
        <StackedBar tip={tip} label="Reservas" legendValue="count" segments={[{ name: "Pagado", value: estado.PAGADO, color: COLORS.blue }, { name: "Parcial", value: estado.PARCIAL, color: COLORS.mid, text: COLORS.ink }, { name: "Pendiente", value: estado.PENDIENTE, color: COLORS.red }]} format={fmt} />
      </Card>
      <Card title="Reservas — próximos 7 días" sub="Volumen esperado por día, todas las franjas">
        <Columns values={proximosValues} labels={proximosLabels} highlight={bestDayIndex >= 0 && proximosValues[bestDayIndex] ? [bestDayIndex] : []} name="Reservas" tip={tip} w={360} h={140} />
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Agenda de piscina</h2><small>{list.total} resultado(s)</small></div>
      <div className="ro-fbar">
        <div className="ro-sbox"><Search size={15} /><input value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="Cliente, DNI o código de reserva" /></div>
        <div className="ro-chips">{POOL_FILTERS.map(([value, label]) => <button key={value || "todas"} type="button" className={filter === value ? "on" : ""} onClick={() => { setFilter(value); setPage(1); }}>{label} <b>{chipCount[value]}</b></button>)}</div>
      </div>
      {!list.rows.length ? <ChartEmpty title="No hay reservas con estos filtros" text="Cambia el filtro o la búsqueda." /> : <table className="ro-table"><thead><tr><th>Cliente</th><th>Fecha y horario</th><th>Personas</th><th>Pago</th><th>Estado</th><th>Siguiente acción</th></tr></thead><tbody>
        {list.rows.map((row) => <tr key={row.id}>
          <td><strong>{row.clientName}</strong><small className="ro-mut">{row.code}</small></td>
          <td><strong>{shortDate(row.date)}</strong>{row.slot ? <small className="ro-mut">{row.slot}</small> : null}</td>
          <td>{row.people} persona(s)</td>
          <td><strong>{money(row.paid)}</strong>{row.balance > 0 ? <small className="ro-neg">Saldo {money(row.balance)}</small> : <small className="ro-mut">Pagado</small>}</td>
          <td><StatusPill status={row.status} label={row.statusLabel} /></td>
          <td><button type="button" className={`ro-act ${row.nextAction.action === "COBRAR_SALDO" ? "p" : ""}`} onClick={() => setSelected(row)}>{row.nextAction.label}</button></td>
        </tr>)}
      </tbody></table>}
      <div className="pager"><span>Mostrando {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {selected ? <ReservationDrawer key={`${selected.type}-${selected.id}`} row={selected} today={today} onClose={() => setSelected(null)} onChanged={() => reload()} notify={notify} /> : null}
  </main>;
}

const MIRADOR_FILTERS = [["", "Todas"], ["ATENCION", "Requieren atención"], ["VERIFICAR", "Por verificar"], ["CONFIRMADAS", "Confirmadas"], ["CANCELADAS", "Canceladas"]];

/** Reservas > Mirador: segundo servicio migrado (después de Piscina) al mismo lenguaje visual de
 * Reservas generales — ver docs/reservas-mirador-propuesta.html. A diferencia de Piscina, Mirador exige
 * verificar manualmente el Yape/Plin antes de aprobarlo (paymentStatus PENDIENTE_VERIFICACION):
 * esas filas nunca ofrecen "cobrar saldo" a secas (ver `verify` en mirador-reservations.js), y el
 * ReservationDrawer compartido muestra el aviso y la acción de verificar cuando corresponde. */
export function MiradorReservationsPage({ navigate }) {
  const tip = useTip();
  const [filter, setFilter] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  const [histRange, setHistRange] = useState("90");
  const params = new URLSearchParams({ page: String(page), pageSize: "10", range: histRange });
  if (filter) params.set("filter", filter);
  if (q.trim()) params.set("q", q.trim());
  const { data, loading, error, reload } = useFetch(`/superadmin/reservations/mirador?${params.toString()}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000 });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Cargando la agenda del mirador..." /></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle /><div><strong>No se pudo cargar la agenda</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { today, kpis, aforo, slots, estadoPago, proximos7Dias, counts, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const nowIndex = slots.findIndex((row) => row.isNow);
  const proximosValues = proximos7Dias.map((row) => row.count);
  const proximosLabels = proximos7Dias.map((row) => row.label);
  const bestDayIndex = proximosValues.indexOf(Math.max(...proximosValues));
  const estado = { PAGADO: 0, PARCIAL: 0, POR_VERIFICAR: 0, PENDIENTE: 0, ...Object.fromEntries(estadoPago.map((row) => [row.key, row.count])) };
  const chipCount = { "": counts.total, ATENCION: counts.atencion, VERIFICAR: counts.verificar, CONFIRMADAS: counts.confirmadas, CANCELADAS: counts.canceladas };

  return <main className="oh">
    <TipLayer tip={tip.tip} />
    {toast ? <div className="ro-toast"><ShieldCheck size={16} />{toast}</div> : null}
    <div className="oh-ph"><div><h1>Reservas del mirador</h1><p>Horarios, mesas, pagos y verificación de operaciones · {fmt(kpis.reservasHoy)} reservas para hoy</p></div>
      <div className="oh-tools"><HistoryRange value={histRange} onChange={(value) => { setHistRange(value); setPage(1); }} /><button className="oh-btn" type="button" onClick={() => navigate("admision", "qr")}><ShieldCheck size={14} />Ir a control de accesos</button><button className="oh-btn p" type="button" onClick={() => navigate("clientes", "directorio")}><Plus size={14} />Nueva reserva</button></div>
    </div>

    {counts.atencion ? <div className="oh-alert"><AlertTriangle /><div><strong>{counts.atencion} reservas requieren atención</strong><span> · {kpis.saldoPendiente.count} con saldo pendiente · {kpis.porVerificar} {kpis.porVerificar === 1 ? "pago por verificar" : "pagos por verificar"}</span></div></div> : null}

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Mesas hoy</div><div className="v">{fmt(kpis.reservasHoy)}</div><div className="d">para el día de hoy</div></div>
      <div className="k"><div className="l">Cupos ahora · franja {aforo.slot}</div><div className="v">{fmt(Math.max(0, aforo.capacity - aforo.inside))} <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>de {fmt(aforo.capacity)}</span></div><div className="d">{fmt(aforo.inside)} personas dentro ahora</div></div>
      <div className="k"><div className="l">Personas esperadas hoy</div><div className="v">{fmt(kpis.personasEsperadasHoy)}</div><div className="d">en las franjas de hoy</div></div>
      <div className="k"><div className="l">Por verificar pago</div><div className="v" style={{ color: "#8A5A12" }}>{fmt(kpis.porVerificar)}</div><div className="d">Yape/Plin sin comprobar</div></div>
      <div className="k"><div className="l">Saldo pendiente</div><div className="v" style={{ color: "var(--red)" }}>{money(kpis.saldoPendiente.amount)}</div><div className="d">{kpis.saldoPendiente.count} reservas con saldo</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Ocupación por franja horaria" sub={`Personas registradas hoy frente a la capacidad de ${fmt(aforo.capacity)} por franja`}>
        <Columns values={slots.map((row) => row.used)} labels={slots.map((row) => row.slot)} highlight={nowIndex >= 0 ? [nowIndex] : []} name="Personas" tip={tip} w={420} h={200} />
      </Card>
      <Card title="Aforo ahora" sub={`Franja ${aforo.slot}`}>
        <Bullets rows={[{ code: "MIRADOR", name: "Mirador", inside: aforo.inside, capacity: aforo.capacity, estimated: true }]} total={{ value: aforo.inside, capacity: aforo.capacity }} tip={tip} />
      </Card>
    </div>

    <div className="oh-grid g-8-4">
      <Card title="Estado de pago" sub={`De las ${fmt(counts.total)} reservas de mirador en agenda`}>
        <StackedBar tip={tip} label="Reservas" legendValue="count" segments={[{ name: "Pagado", value: estado.PAGADO, color: COLORS.blue }, { name: "Parcial", value: estado.PARCIAL, color: COLORS.mid, text: COLORS.ink }, { name: "Por verificar", value: estado.POR_VERIFICAR, color: "#D9932B" }, { name: "Pendiente", value: estado.PENDIENTE, color: COLORS.red }]} format={fmt} />
      </Card>
      <Card title="Reservas — próximos 7 días" sub="Volumen esperado por día, todas las franjas">
        <Columns values={proximosValues} labels={proximosLabels} highlight={bestDayIndex >= 0 && proximosValues[bestDayIndex] ? [bestDayIndex] : []} name="Reservas" tip={tip} w={360} h={140} />
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Agenda del mirador</h2><small>{list.total} resultado(s)</small></div>
      <div className="ro-fbar">
        <div className="ro-sbox"><Search size={15} /><input value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="Cliente, DNI o código de reserva" /></div>
        <div className="ro-chips">{MIRADOR_FILTERS.map(([value, label]) => <button key={value || "todas"} type="button" className={filter === value ? "on" : ""} onClick={() => { setFilter(value); setPage(1); }}>{value === "VERIFICAR" ? <Receipt size={13} /> : null}{label} <b>{chipCount[value]}</b></button>)}</div>
      </div>
      {!list.rows.length ? <ChartEmpty title="No hay reservas con estos filtros" text="Cambia el filtro o la búsqueda." /> : <table className="ro-table"><thead><tr><th>Cliente</th><th>Fecha y horario</th><th>Personas</th><th>Pago</th><th>Estado</th><th>Siguiente acción</th></tr></thead><tbody>
        {list.rows.map((row) => <tr key={row.id}>
          <td><strong>{row.clientName}</strong><small className="ro-mut">{row.code}</small></td>
          <td><strong>{shortDate(row.date)}</strong>{row.slot ? <small className="ro-mut">{row.slot}</small> : null}</td>
          <td>{row.people} persona(s)</td>
          <td>{row.verify ? <small className="ro-neg">{row.verify.method} · Op. {row.verify.reference} · Verificar {money(row.verify.amount)}</small> : <><strong>{money(row.paid)}</strong>{row.balance > 0 ? <small className="ro-neg">Saldo {money(row.balance)}</small> : <small className="ro-mut">Pagado</small>}</>}</td>
          <td><StatusPill status={row.status} label={row.statusLabel} /></td>
          <td><button type="button" className={`ro-act ${["COBRAR_SALDO", "VERIFICAR_PAGO"].includes(row.nextAction.action) ? "p" : ""}`} onClick={() => setSelected(row)}>{row.nextAction.label}</button></td>
        </tr>)}
      </tbody></table>}
      <div className="pager"><span>Mostrando {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {selected ? <ReservationDrawer key={`${selected.type}-${selected.id}`} row={selected} today={today} onClose={() => setSelected(null)} onChanged={() => reload()} notify={notify} /> : null}
  </main>;
}

const TERRAZA_FILTERS = [["", "Todas"], ["POR_CONFIRMAR", "Por confirmar"], ["CONFIRMADAS", "Confirmadas"], ["CANCELADAS", "Canceladas"]];

/** Reservas > Terraza: tercer servicio migrado (después de Piscina y Mirador) al mismo lenguaje
 * visual de Reservas generales — ver docs/reservas-terraza-propuesta.html. La reserva de Terraza
 * es gratuita (el consumo de Restaurante/Bar se cobra aparte): sin columna ni gráfico de pago, a
 * diferencia de Piscina/Mirador. "Reservas por zona" usa las 4 zonas reales que el cliente elige
 * en TerraceExperience.jsx — el panel anterior comparaba 3 zonas inventadas contra esas, por lo
 * que 2 de 3 tarjetas siempre salían vacías (ver terraza-reservations.js y el changelog). */
export function TerrazaReservationsPage({ navigate }) {
  const tip = useTip();
  const [filter, setFilter] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  const [histRange, setHistRange] = useState("90");
  const params = new URLSearchParams({ page: String(page), pageSize: "10", range: histRange });
  if (filter) params.set("filter", filter);
  if (q.trim()) params.set("q", q.trim());
  const { data, loading, error, reload } = useFetch(`/superadmin/reservations/terraza?${params.toString()}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000 });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Cargando la agenda de terraza..." /></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle /><div><strong>No se pudo cargar la agenda</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { today, kpis, aforo, slots, zonas, proximos7Dias, counts, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const nowIndex = slots.findIndex((row) => row.isNow);
  const proximosValues = proximos7Dias.map((row) => row.count);
  const proximosLabels = proximos7Dias.map((row) => row.label);
  const bestDayIndex = proximosValues.indexOf(Math.max(...proximosValues));
  const chipCount = { "": counts.total, POR_CONFIRMAR: counts.porConfirmar, CONFIRMADAS: counts.confirmadas, CANCELADAS: counts.canceladas };

  return <main className="oh">
    <TipLayer tip={tip.tip} />
    {toast ? <div className="ro-toast"><ShieldCheck size={16} />{toast}</div> : null}
    <div className="oh-ph"><div><h1>Reservas de terraza</h1><p>Horarios, zonas, aforo y pedidos anticipados · {fmt(kpis.reservasHoy)} reservas para hoy</p></div>
      <div className="oh-tools"><HistoryRange value={histRange} onChange={(value) => { setHistRange(value); setPage(1); }} /><button className="oh-btn" type="button" onClick={() => navigate("admision", "qr")}><ShieldCheck size={14} />Ir a control de accesos</button><button className="oh-btn p" type="button" onClick={() => navigate("clientes", "directorio")}><Plus size={14} />Nueva reserva</button></div>
    </div>

    {counts.porConfirmar ? <div className="oh-alert"><AlertTriangle /><div><strong>{counts.porConfirmar} {counts.porConfirmar === 1 ? "reserva" : "reservas"} por confirmar</strong><span> revisa la agenda de hoy y mañana</span></div></div> : null}

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Mesas hoy</div><div className="v">{fmt(kpis.reservasHoy)}</div><div className="d">para el día de hoy</div></div>
      <div className="k"><div className="l">Cupos ahora · franja {aforo.slot}</div><div className="v">{fmt(Math.max(0, aforo.capacity - aforo.inside))} <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>de {fmt(aforo.capacity)}</span></div><div className="d">{fmt(aforo.inside)} personas dentro ahora</div></div>
      <div className="k"><div className="l">Comensales esperados hoy</div><div className="v">{fmt(kpis.comensalesEsperadosHoy)}</div><div className="d">en las franjas de hoy</div></div>
      <div className="k"><div className="l">Pedidos anticipados</div><div className="v">{fmt(kpis.pedidosAnticipados)}</div><div className="d">de las {fmt(kpis.reservasHoy)} reservas de hoy</div></div>
      <div className="k"><div className="l">Por confirmar</div><div className="v" style={{ color: "#8A5A12" }}>{fmt(kpis.porConfirmar)}</div><div className="d">requieren seguimiento</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Ocupación por franja horaria" sub={`Personas registradas hoy frente a la capacidad de ${fmt(aforo.capacity)} por franja`}>
        <Columns values={slots.map((row) => row.used)} labels={slots.map((row) => row.slot)} highlight={nowIndex >= 0 ? [nowIndex] : []} name="Personas" tip={tip} w={480} h={200} />
      </Card>
      <Card title="Aforo ahora" sub={`Franja ${aforo.slot}`}>
        <Bullets rows={[{ code: "TERRAZA", name: "Terraza", inside: aforo.inside, capacity: aforo.capacity, estimated: true }]} total={{ value: aforo.inside, capacity: aforo.capacity }} tip={tip} />
      </Card>
    </div>

    <div className="oh-grid g-8-4">
      <Card title="Reservas por zona" sub="Preferencia real que elige el cliente">
        {zonas.length ? <HBars rows={zonas.map((row) => ({ name: row.zone, value: row.count }))} name="Reservas por zona" tip={tip} tooltipLabel="Reservas" /> : <ChartEmpty title="Sin reservas en el periodo" text="Aparecerán aquí cuando se registre la primera." />}
      </Card>
      <Card title="Reservas — próximos 7 días" sub="Volumen esperado por día, todas las franjas">
        <Columns values={proximosValues} labels={proximosLabels} highlight={bestDayIndex >= 0 && proximosValues[bestDayIndex] ? [bestDayIndex] : []} name="Reservas" tip={tip} w={360} h={140} />
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Agenda de terraza</h2><small>{list.total} resultado(s)</small></div>
      <div className="ro-fbar">
        <div className="ro-sbox"><Search size={15} /><input value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="Cliente, DNI o código de reserva" /></div>
        <div className="ro-chips">{TERRAZA_FILTERS.map(([value, label]) => <button key={value || "todas"} type="button" className={filter === value ? "on" : ""} onClick={() => { setFilter(value); setPage(1); }}>{label} <b>{chipCount[value]}</b></button>)}</div>
      </div>
      {!list.rows.length ? <ChartEmpty title="No hay reservas con estos filtros" text="Cambia el filtro o la búsqueda." /> : <table className="ro-table"><thead><tr><th>Cliente</th><th>Fecha y horario</th><th>Zona</th><th>Personas</th><th>Pedido anticipado</th><th>Estado</th><th>Siguiente acción</th></tr></thead><tbody>
        {list.rows.map((row) => <tr key={row.id}>
          <td><strong>{row.clientName}</strong><small className="ro-mut">{row.code}</small></td>
          <td><strong>{shortDate(row.date)}</strong>{row.slot ? <small className="ro-mut">{row.slot}</small> : null}</td>
          <td>{row.zone || <span className="ro-mut">Sin preferencia</span>}</td>
          <td>{row.people} persona(s)</td>
          <td>{row.preorderCount > 0 ? `${row.preorderCount} pedido(s)` : <span className="ro-mut">Sin pedido</span>}</td>
          <td><StatusPill status={row.status} label={row.statusLabel} /></td>
          <td><button type="button" className={`ro-act ${row.nextAction.action === "CONFIRMAR" ? "p" : ""}`} onClick={() => setSelected(row)}>{row.nextAction.label}</button></td>
        </tr>)}
      </tbody></table>}
      <div className="pager"><span>Mostrando {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {selected ? <ReservationDrawer key={`${selected.type}-${selected.id}`} row={selected} today={today} onClose={() => setSelected(null)} onChanged={() => reload()} notify={notify} /> : null}
  </main>;
}

const EVENT_STATUS_TONE = { COTIZACION: "info", RESERVADO: "warn", CONFIRMADO: "ok", FINALIZADO: "off", CANCELADO: "bad" };
const EVENT_STATUS_LABEL = { COTIZACION: "Cotización", RESERVADO: "Reservado", CONFIRMADO: "Confirmado", FINALIZADO: "Finalizado", CANCELADO: "Cancelado" };
const EVENT_FILTERS = ["", "COTIZACION", "RESERVADO", "CONFIRMADO", "FINALIZADO", "CANCELADO"];
const EVENT_CYCLE = [["cotizacion", "Cotización", FileText], ["reserva", "Reserva", CalendarCheck], ["anticipo", "Anticipo", CreditCard], ["produccion", "Producción", Settings], ["evento", "Evento", Users], ["cierre", "Cierre", CheckCircle2]];

/** Reservas > Eventos: cuarta y última pantalla de Reservas migrada al lenguaje visual plano azul
 * v3 — ver docs/reservas-eventos-propuesta.html. A diferencia de Piscina/Mirador/Terraza, esta NO
 * reemplaza ningún componente existente: `EventsPage.jsx` sigue sirviendo el calendario y las
 * rutas de Recepción (no es exclusiva del Superadmin), así que el formulario de alta/edición y el
 * calendario no se tocan — esta pantalla es nueva, solo para el tablero/agenda/detalle. Reutiliza
 * `ReservationDrawer` (ya soporta EVENTOS desde Reservas generales) con un bloque adicional para la
 * propuesta que pidió el cliente (montaje, platos, equipamiento, cochera). */
export function EventsReservationsPage() {
  const tip = useTip();
  const [status, setStatus] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  const [histRange, setHistRange] = useState("90");
  const params = new URLSearchParams({ page: String(page), pageSize: "10", range: histRange });
  if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const { data, loading, error, reload } = useFetch(`/superadmin/reservations/eventos?${params.toString()}`, { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 20000 });

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Cargando la agenda de eventos..." /></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle /><div><strong>No se pudo cargar la agenda</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { today, kpis, ciclo, espacios, estadoPago, proximos7Dias, counts, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const proximosValues = proximos7Dias.map((row) => row.count);
  const proximosLabels = proximos7Dias.map((row) => row.label);
  const bestDayIndex = proximosValues.indexOf(Math.max(...proximosValues));
  const estado = { PAGADO: 0, PARCIAL: 0, PENDIENTE: 0, ...Object.fromEntries(estadoPago.map((row) => [row.key, row.count])) };

  return <main className="oh">
    <TipLayer tip={tip.tip} />
    {toast ? <div className="ro-toast"><ShieldCheck size={16} />{toast}</div> : null}
    <div className="oh-ph"><div><h1>Reservas de eventos</h1><p>Cotizaciones, ambientes, anticipos, producción y cierre · {fmt(kpis.eventosHoy)} eventos hoy</p></div>
      {/* El alta/edición y el calendario siguen viviendo en EventsPage.jsx (no se tocó, ver nota
          arriba); por ahora se llega a ellos por su URL directa, fuera del shell del Superadmin. */}
      <div className="oh-tools"><HistoryRange value={histRange} onChange={(value) => { setHistRange(value); setPage(1); }} /><a className="oh-btn" href="/superadmin/reservas/eventos?vista=agenda">Ver calendario</a><a className="oh-btn p" href="/superadmin/reservas/eventos?vista=agenda&nuevo=1"><Plus size={14} />Nuevo evento</a></div>
    </div>

    {counts.atencion ? <div className="oh-alert"><AlertTriangle /><div><strong>{counts.atencion} eventos requieren seguimiento</strong><span> · {kpis.cotizaciones} {kpis.cotizaciones === 1 ? "cotización sin resolver" : "cotizaciones sin resolver"} · {kpis.saldoPendiente.count} con saldo pendiente</span></div></div> : null}

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Eventos hoy</div><div className="v">{fmt(kpis.eventosHoy)}</div><div className="d">para el día de hoy</div></div>
      <div className="k"><div className="l">Próximos</div><div className="v">{fmt(kpis.proximos)}</div><div className="d">reservados o confirmados</div></div>
      <div className="k"><div className="l">Cotizaciones</div><div className="v" style={{ color: "#8A5A12" }}>{fmt(kpis.cotizaciones)}</div><div className="d">sin resolver</div></div>
      <div className="k"><div className="l">Invitados · próximos 7 días</div><div className="v">{fmt(kpis.invitadosProximos7Dias)}</div><div className="d">entre los eventos próximos</div></div>
      <div className="k"><div className="l">Saldo pendiente</div><div className="v" style={{ color: "var(--red)" }}>{money(kpis.saldoPendiente.amount)}</div><div className="d">{kpis.saldoPendiente.count} eventos con saldo</div></div>
    </section>

    <Card title="Ciclo del evento" sub="De la cotización hasta el cierre">
      <div style={{ display: "flex", overflowX: "auto" }}>{EVENT_CYCLE.map(([key, label, Icon], index) => <div key={key} style={{ flex: "1 0 auto", display: "flex", alignItems: "center", gap: 10, padding: "4px 14px", borderRight: index < EVENT_CYCLE.length - 1 ? "1px solid var(--line-2)" : "none" }}>
        <span style={{ display: "grid", width: 34, height: 34, flex: "none", placeItems: "center", borderRadius: "50%", background: "var(--soft)", color: "var(--deep)" }}><Icon size={16} /></span>
        <div><strong style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{label}</strong><b style={{ display: "block", marginTop: 2, fontSize: 17, fontWeight: 700 }}>{fmt(ciclo[key])}</b></div>
      </div>)}</div>
    </Card>

    <div className="oh-grid g-6-6">
      <Card title="Eventos por espacio" sub="Volumen del periodo por ambiente">
        {espacios.length ? <HBars rows={espacios.map((row) => ({ name: row.space, value: row.count }))} name="Eventos por espacio" tip={tip} tooltipLabel="Eventos" /> : <ChartEmpty title="Sin eventos en el periodo" text="Aparecerán aquí cuando se registre el primero." />}
      </Card>
      <Card title="Estado de pago" sub={`De los ${fmt(counts.total)} eventos en agenda`}>
        <StackedBar tip={tip} label="Eventos" legendValue="count" segments={[{ name: "Pagado", value: estado.PAGADO, color: COLORS.blue }, { name: "Parcial", value: estado.PARCIAL, color: COLORS.mid, text: COLORS.ink }, { name: "Pendiente", value: estado.PENDIENTE, color: COLORS.red }]} format={fmt} />
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Eventos — próximos 7 días</h2></div><div className="ch2 oh-sub2">Volumen esperado por día</div>
      <div className="body"><Columns values={proximosValues} labels={proximosLabels} highlight={bestDayIndex >= 0 && proximosValues[bestDayIndex] ? [bestDayIndex] : []} name="Eventos" tip={tip} w={760} h={140} /></div>
    </section>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Agenda de eventos</h2><small>{list.total} resultado(s)</small></div>
      <div className="ro-fbar">
        <div className="ro-sbox"><Search size={15} /><input value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="Cliente, DNI, evento o código" /></div>
        <div className="ro-chips">{EVENT_FILTERS.map((value) => <button key={value || "todos"} type="button" className={status === value ? "on" : ""} onClick={() => { setStatus(value); setPage(1); }}>{value ? EVENT_STATUS_LABEL[value] : "Todos"} <b>{value ? counts[value] : counts.total}</b></button>)}</div>
      </div>
      {!list.rows.length ? <ChartEmpty title="No hay eventos con estos filtros" text="Cambia el filtro o la búsqueda." /> : <table className="ro-table"><thead><tr><th>Evento y cliente</th><th>Espacio</th><th>Fecha y horario</th><th>Invitados</th><th>Importes</th><th>Estado</th><th>Siguiente acción</th></tr></thead><tbody>
        {list.rows.map((row) => <tr key={row.id}>
          <td><strong>{row.planName || row.code}</strong><small className="ro-mut">{row.code} · {row.clientName}</small></td>
          <td>{row.place || <span className="ro-mut">Sin espacio</span>}</td>
          <td><strong>{shortDate(row.date)}</strong>{row.slot ? <small className="ro-mut">{row.slot}</small> : null}</td>
          <td>{row.people}</td>
          <td><strong>{money(row.total)}</strong>{row.balance > 0 ? <small className="ro-neg">Saldo {money(row.balance)}</small> : <small className="ro-mut">Pagado</small>}</td>
          <td><span className={`ro-pill ro-pill--${EVENT_STATUS_TONE[row.rawStatus] || "off"}`}>{EVENT_STATUS_LABEL[row.rawStatus] || row.rawStatus}</span></td>
          <td><button type="button" className={`ro-act ${row.nextAction.action === "COBRAR_SALDO" ? "p" : ""}`} onClick={() => setSelected(row)}>{row.nextAction.label}</button></td>
        </tr>)}
      </tbody></table>}
      <div className="pager"><span>Mostrando {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {selected ? <ReservationDrawer key={`${selected.type}-${selected.id}`} row={selected} today={today} onClose={() => setSelected(null)} onChanged={() => reload()} notify={notify} /> : null}
  </main>;
}
