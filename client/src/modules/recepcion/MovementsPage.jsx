// Operación del día › Llegadas y salidas. El mostrador en una sola pantalla: recibir (check-in con lista de
// verificación y cobro del saldo), ver quién está en casa y cerrar salidas (revisión de Limpieza → cuenta →
// cobro). Aplica las mismas reglas del servidor: POST /checkin, /checkout/inspect, /checkout y /pagos.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Clock3, DoorClosed, DoorOpen, Home, LogIn, LogOut, RefreshCw, Search, XCircle } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, PaymentTag, Tag, dateShort, money, timeOf, useShift, useToast } from "./rxkit";
import { PaymentFields, paymentError } from "./PaymentFields";

const VIEWS = [["llegadas", "Llegadas", DoorOpen], ["encasa", "En casa", Home], ["salidas", "Salidas", DoorClosed]];

export function MovementsPage() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([key]) => key === params.get("vista")) ? params.get("vista") : "llegadas";
  const openId = Number(params.get("abrir") || 0) || null;
  const { desk, deskLoading, reloadDesk } = useShift();
  const [query, setQuery] = useState("");

  const setView = (key) => setParams({ vista: key });
  const open = (id) => setParams({ vista: view, abrir: String(id) });
  const close = () => setParams({ vista: view });

  if (deskLoading || !desk) return <LoadingSpinner label="Cargando llegadas y salidas…" />;
  const match = (row) => !query.trim() || `${row.code} ${row.client?.name} ${row.client?.document} ${row.room?.number}`.toLowerCase().includes(query.trim().toLowerCase());
  const arrivals = desk.arrivals.filter(match);
  const late = desk.lateArrivals.filter(match);
  const inHouse = desk.inHouse.filter(match);
  const departures = desk.departures.filter(match);
  const counts = { llegadas: desk.arrivals.length + desk.lateArrivals.length, encasa: desk.inHouse.length, salidas: desk.departures.length };

  const openArrival = view === "llegadas" && openId ? [...desk.arrivals, ...desk.lateArrivals].find((row) => row.id === openId) : null;
  const openStay = view !== "llegadas" && openId ? desk.inHouse.find((row) => row.stayId === openId) : null;

  return <>
    <PageHead title="Llegadas y salidas" tools={<>
      <div className="rx-search" style={{ width: 280, marginLeft: 0 }}><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Huésped, DNI, reserva o habitación" aria-label="Filtrar" /></label></div>
      <button className="rx-btn" type="button" onClick={reloadDesk}><RefreshCw />Actualizar</button>
    </>}>Recibe a los huéspedes, controla quién está en casa y cierra cada salida con su cuenta al día.</PageHead>

    <div style={{ marginBottom: 14 }}>
      <div className="rx-seg" role="tablist">{VIEWS.map(([key, label, Icon]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "is-on" : ""} onClick={() => setView(key)}><Icon size={15} />{label}<i>{counts[key]}</i></button>)}</div>
    </div>

    {view === "llegadas" ? <div className="rx-stack">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Llegan hoy · {dateShort(desk.date)}</h2><p>{arrivals.length} reserva(s) de hospedaje por recibir</p></div></div>
        {arrivals.length ? arrivals.map((row) => <ArrivalRow key={row.id} row={row} onOpen={() => open(row.id)} />) : <Empty icon={DoorOpen} title="No hay llegadas pendientes para hoy">Las reservas con entrada hoy aparecerán aquí.</Empty>}
      </section>
      {late.length ? <section className="rx-card">
        <div className="rx-card-h"><div><h2>Atrasadas y no presentadas</h2><p>Reservas de días anteriores que aún no hacen check-in</p></div></div>
        {late.map((row) => <ArrivalRow key={row.id} row={row} onOpen={() => open(row.id)} />)}
      </section> : null}
    </div> : null}

    {view === "encasa" ? <section className="rx-card">
      <div className="rx-card-h"><div><h2>Huéspedes en casa</h2><p>{desk.kpis.inHouseRooms} habitaciones · {desk.kpis.guestsInHouse} huéspedes</p></div></div>
      {inHouse.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Hab.</th><th>Huésped</th><th>Ingresó</th><th>Salida</th><th className="n">Consumos</th><th className="n">Saldo</th><th /></tr></thead>
        <tbody>{inHouse.map((row) => <tr key={row.stayId} className="is-click" onClick={() => open(row.stayId)}>
          <td><b>{row.room?.number}</b> <span className="mut">{row.room?.type}</span></td>
          <td><div className="rx-who"><b>{row.client?.name}</b><small>{row.code} · DNI {row.client?.document || "—"} · {row.guests} pers.</small></div></td>
          <td className="mut">{dateShort(row.checkInAt)} {timeOf(row.checkInAt)}</td>
          <td><DepartureTag row={row} /></td>
          <td className="n">{row.account.consumptionCount ? money(row.account.consumptions) : "—"}</td>
          <td className="n"><b className={row.account.balance > 0 ? "" : "mut"} style={row.account.balance > 0 ? { color: "var(--warn)" } : undefined}>{money(row.account.balance)}</b></td>
          <td className="n"><button className="rx-btn rx-btn--sm" type="button" onClick={(event) => { event.stopPropagation(); open(row.stayId); }}>Ver cuenta</button></td>
        </tr>)}</tbody>
      </table></div> : <Empty icon={Home} title="No hay huéspedes en casa" />}
    </section> : null}

    {view === "salidas" ? <section className="rx-card">
      <div className="rx-card-h"><div><h2>Salidas por cerrar</h2><p>Salen hoy o ya vencieron su fecha de salida</p></div></div>
      {departures.length ? departures.map((row) => <DepartureRow key={row.stayId} row={row} onOpen={() => open(row.stayId)} />) : <Empty icon={DoorClosed} title="No hay salidas pendientes" >Para adelantar una salida, ábrela desde "En casa".</Empty>}
    </section> : null}

    <CheckInDrawer row={openArrival} today={desk.date} onClose={close} onDone={() => { close(); reloadDesk(); }} onChanged={reloadDesk} />
    <CheckOutDrawer row={openStay} onClose={close} onDone={() => { close(); reloadDesk(); }} onChanged={reloadDesk} />
  </>;
}

function DepartureTag({ row }) {
  if (row.departureState === "VENCIDA") return <Tag tone="crit">Vencida · {dateShort(row.departure)}</Tag>;
  if (row.departureState === "HOY") return <Tag tone="warn">Hoy</Tag>;
  return <span className="mut">{dateShort(row.departure)}</span>;
}

function ArrivalRow({ row, onOpen }) {
  const ready = !row.blockers.length;
  return <div className="rx-mv">
    <div className="rx-roomno"><b>{row.room?.number || "—"}</b><small>{row.room?.type || "Sin hab."}</small></div>
    <div className="rx-who"><b>{row.client?.name}</b><small>{row.code} · DNI {row.client?.document || "—"}{row.client?.phone ? ` · ${row.client.phone}` : ""}</small></div>
    <div className="hide-md"><div className="lbl">Estadía</div><div className="val">{dateShort(row.arrival)} → {dateShort(row.departure)} · {row.nights} n. · {row.adults + row.children} pers.</div></div>
    <div className="hide-md"><div className="lbl">Cuenta</div><div className="val" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><PaymentTag status={row.paymentStatus} balance={row.balance} />{row.balance > 0 ? <span className="rx-mono">{money(row.balance)}</span> : null}</div></div>
    <div className="acts">
      {row.lateBy === "NO_SE_PRESENTO" ? <Tag tone="crit">No se presentó</Tag> : row.lateBy ? <Tag tone="warn">Atrasada</Tag> : null}
      {ready ? <button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={onOpen}><LogIn />Check-in</button> : <button className="rx-btn rx-btn--sm" type="button" onClick={onOpen} title={row.blockers.map((item) => item.label).join(" · ")}><CircleAlert />{row.blockers[0].label}</button>}
    </div>
  </div>;
}

function DepartureRow({ row, onOpen }) {
  const inspection = row.inspection;
  const state = !inspection ? ["Sin revisión", "off"] : inspection.status === "FINALIZADA" ? ["Habitación revisada", "ok"] : inspection.status === "DANOS_REPORTADOS" ? ["Daños reportados", "crit"] : ["Limpieza revisando", "info"];
  return <div className="rx-mv">
    <div className="rx-roomno"><b>{row.room?.number || "—"}</b><small>{row.room?.type}</small></div>
    <div className="rx-who"><b>{row.client?.name}</b><small>{row.code} · {row.guests} pers.{row.checkoutRequestedAt ? " · pidió su salida" : ""}</small></div>
    <div className="hide-md"><div className="lbl">Salida</div><div className="val"><DepartureTag row={row} /></div></div>
    <div className="hide-md"><div className="lbl">Cuenta</div><div className="val">{row.account.balance > 0 ? <b style={{ color: "var(--warn)" }}>{money(row.account.balance)} por cobrar</b> : <span style={{ color: "var(--ok)" }}>Al día</span>}</div></div>
    <div className="acts"><Tag tone={state[1]}>{state[0]}</Tag><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={onOpen}><LogOut />Gestionar salida</button></div>
  </div>;
}

function ShiftGate({ children }) {
  const { active, openClock } = useShift();
  if (active) return children;
  return <Alert tone="warn"><b>Inicia tu turno para operar.</b> El sistema exige tu marca de entrada con DNI y PIN. <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert>;
}

function Check({ ok, wait, title, children }) {
  const Icon = ok ? CheckCircle2 : wait ? Clock3 : XCircle;
  return <div className={ok ? "ok" : wait ? "wait" : "no"}><Icon aria-hidden="true" /><div className="grow"><b style={{ fontWeight: 600 }}>{title}</b>{children ? <small>{children}</small> : null}</div></div>;
}

function CheckInDrawer({ row, today, onClose, onDone, onChanged }) {
  const show = useToast();
  const { active, cashSession } = useShift();
  const [idChecked, setIdChecked] = useState(false);
  const [pay, setPay] = useState({ method: "EFECTIVO", amount: "", reference: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!row) return;
    setIdChecked(false); setError("");
    const verifying = row.paymentStatus === "PENDIENTE_VERIFICACION";
    setPay({ method: verifying ? (row.paymentMethod || "YAPE") : "EFECTIVO", amount: String(row.balance || ""), reference: verifying ? (row.paymentReference || "") : "" });
  }, [row?.id]);
  if (!row) return null;
  const blockers = Object.fromEntries(row.blockers.map((item) => [item.code, item]));
  const paid = !blockers.SALDO && !blockers.VERIFICAR_PAGO;
  const roomOk = !blockers.HABITACION && !blockers.SIN_HABITACION;
  const dateOk = !blockers.FECHA && !blockers.VENCIDA;
  const canCheckIn = active && paid && roomOk && dateOk && !blockers.DEVOLUCION && idChecked;

  async function collect() {
    const problem = paymentError(pay, row.balance);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      await api("/pagos", { method: "POST", body: { reservationId: row.id, amount: Number(pay.amount), method: pay.method, reference: pay.reference || undefined, concept: `${blockers.VERIFICAR_PAGO ? "Verificación" : "Saldo"} ${row.code}` } });
      show(`Cobro de ${money(pay.amount)} registrado en ${row.code}.`);
      onChanged();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function checkIn() {
    setBusy(true); setError("");
    try {
      await api("/checkin", { method: "POST", body: { reservationId: row.id } });
      show(`Check-in registrado: ${row.client?.name} en la habitación ${row.room?.number}. Su llave digital ya está activa.`);
      onDone();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!window.confirm(`¿Cancelar la reserva ${row.code}? No tiene pagos registrados.`)) return;
    setBusy(true); setError("");
    try { await api(`/reservations/${row.id}`, { method: "DELETE" }); show(`Reserva ${row.code} cancelada.`); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Llegada · ${row.code}`} title={row.client?.name || row.code}
    subtitle={`Habitación ${row.room?.number || "—"} ${row.room?.type || ""} · ${dateShort(row.arrival)} → ${dateShort(row.departure)} · ${row.nights} noche(s) · ${row.adults} adulto(s)${row.children ? `, ${row.children} niño(s)` : ""}`}
    footer={<>
      {row.paid <= 0 ? <button className="rx-btn rx-btn--danger" type="button" onClick={cancel} disabled={busy || !active}>Cancelar reserva</button> : null}
      <button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cerrar</button>
      <button className="rx-btn rx-btn--primary" type="button" onClick={checkIn} disabled={!canCheckIn || busy}><LogIn />{busy ? "Registrando…" : "Registrar check-in"}</button>
    </>}>
    <ShiftGate>{null}</ShiftGate>
    {row.lateBy === "NO_SE_PRESENTO" ? <Alert tone="crit"><b>El huésped no se presentó.</b> La fecha de salida ya pasó. Si llega, primero <Link to={`/admin-panel/reservas?editar=${row.id}`} style={{ fontWeight: 600 }}>actualiza las fechas de la reserva</Link>; si no vendrá y pagó, registra una devolución.</Alert> : null}
    <section className="rx-sec"><h3>Lista de verificación</h3>
      <div className="rx-checks">
        <Check ok={paid} wait={Boolean(blockers.VERIFICAR_PAGO)} title={paid ? "Pago completo" : blockers.VERIFICAR_PAGO ? "Pago por verificar" : `Saldo pendiente de ${money(row.balance)}`}>{paid ? `Pagado ${money(row.paid)} de ${money(row.total)}` : blockers.VERIFICAR_PAGO ? `${row.paymentMethod} · operación ${row.paymentReference}. Compruébala en la app y regístrala abajo.` : "El check-in exige la cuenta de hospedaje pagada."}</Check>
        <Check ok={roomOk} title={roomOk ? `Habitación ${row.room?.number} lista` : (blockers.HABITACION || blockers.SIN_HABITACION).label}>{roomOk ? "Libre y preparada" : <>Coordina con <Link to="/admin/limpieza/resumen">Limpieza</Link> o <Link to={`/admin-panel/reservas?editar=${row.id}`}>reasigna la habitación</Link>.</>}</Check>
        <Check ok={dateOk} title={dateOk ? "Fecha de llegada válida" : (blockers.FECHA || blockers.VENCIDA).label}>{`Entrada ${dateShort(row.arrival)} · salida ${dateShort(row.departure)} · hoy ${dateShort(today)}`}</Check>
        <div className={idChecked ? "ok" : "wait"}><input type="checkbox" checked={idChecked} onChange={(event) => setIdChecked(event.target.checked)} id={`dni-${row.id}`} style={{ width: 17, height: 17, accentColor: "#1E6FD6" }} /><label className="grow" htmlFor={`dni-${row.id}`} style={{ cursor: "pointer" }}><b style={{ fontWeight: 600 }}>Identidad verificada</b><small>Compara el DNI {row.client?.document || "—"} con el documento físico del titular.</small></label></div>
        {blockers.DEVOLUCION ? <Check ok={false} title="Devolución en trámite">El dueño debe resolverla antes del check-in.</Check> : null}
      </div>
    </section>

    {!paid && active ? <section className="rx-sec"><h3>{blockers.VERIFICAR_PAGO ? "Verificar y registrar el pago" : "Cobrar el saldo"}</h3>
      <PaymentFields value={pay} onChange={setPay} max={row.balance} cashOpen={cashSession?.status === "ABIERTA"} hint={blockers.VERIFICAR_PAGO ? "Confirma en la app de Yape/Plin que la operación existe y el monto coincide antes de registrarla." : null} />
      <button className="rx-btn rx-btn--dark" type="button" onClick={collect} disabled={busy} style={{ marginTop: 10 }}>Registrar cobro de {money(pay.amount || 0)}</button>
    </section> : null}

    <section className="rx-sec"><h3>Cuenta de hospedaje</h3>
      <div className="rx-ledger">
        <div><span>{row.planName || "Hospedaje"} · {row.nights} noche(s)</span><b>{money(row.total)}</b></div>
        <div><span>Pagado</span><b>{money(row.paid)}</b></div>
        <div className={row.balance > 0 ? "due" : "clear"}><span>{row.balance > 0 ? "Saldo por cobrar" : "Cuenta al día"}</span><b>{money(row.balance)}</b></div>
      </div>
    </section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function CheckOutDrawer({ row, onClose, onDone, onChanged }) {
  const show = useToast();
  const { active, cashSession } = useShift();
  const cleaners = useFetch("/reception/cleaning-employees", { initialData: [], enabled: Boolean(row) && !row?.inspection, realtime: Boolean(row), pollInterval: 8000 });
  const [cleaner, setCleaner] = useState("");
  const [damage, setDamage] = useState("");
  const [pay, setPay] = useState({ method: "EFECTIVO", amount: "", reference: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const damageValue = Number(damage || 0);
  const due = useMemo(() => Math.round(((row?.account.balance || 0) + (damageValue > 0 ? damageValue : 0)) * 100) / 100, [row?.account.balance, damageValue]);
  useEffect(() => { setCleaner(""); setDamage(""); setError(""); }, [row?.stayId]);
  useEffect(() => { setPay((current) => ({ ...current, amount: String(due) })); }, [due]);
  if (!row) return null;
  const inspection = row.inspection;
  const reviewed = inspection && ["FINALIZADA", "DANOS_REPORTADOS"].includes(inspection.status);
  const damaged = inspection?.status === "DANOS_REPORTADOS";
  const step = !inspection ? 1 : !reviewed ? 1 : 2;

  async function sendInspection() {
    if (!cleaner) { setError("Elige a la persona de Limpieza que revisará la habitación."); return; }
    setBusy(true); setError("");
    try { await api("/checkout/inspect", { method: "POST", body: { stayId: row.stayId, employeeId: Number(cleaner) } }); show(`Aviso enviado a Limpieza para revisar la habitación ${row.room?.number}.`); onChanged(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function finish() {
    if (damaged && !(damageValue > 0)) { setError("Registra el monto por daños antes de cerrar la salida."); return; }
    if (due > 0) { const problem = paymentError(pay, null); if (problem) { setError(problem); return; } if (Number(pay.amount) + 0.001 < due) { setError(`Falta cobrar ${money(due - Number(pay.amount))}.`); return; } }
    setBusy(true); setError("");
    try {
      await api("/checkout", { method: "POST", body: { stayId: row.stayId, paymentAmount: due > 0 ? Number(pay.amount) : 0, damageAmount: damageValue > 0 ? damageValue : 0, paymentMethod: pay.method } });
      show(`Salida cerrada: habitación ${row.room?.number} liberada.`);
      onDone();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Salida · ${row.code}`} title={row.client?.name || row.code}
    subtitle={`Habitación ${row.room?.number} ${row.room?.type || ""} · ingresó ${dateShort(row.checkInAt)} · salida ${dateShort(row.departure)}`}
    footer={<>
      <button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cerrar</button>
      {step === 2 ? <button className="rx-btn rx-btn--primary" type="button" onClick={finish} disabled={busy || !active}><LogOut />{due > 0 ? `Cobrar ${money(due)} y cerrar salida` : "Cerrar salida"}</button> : null}
    </>}>
    <ShiftGate>{null}</ShiftGate>
    {row.departureState === "VENCIDA" ? <Alert tone="crit"><b>Salida vencida desde el {dateShort(row.departure)}.</b> Confirma con el huésped si se retiró o si extiende su estadía (en ese caso actualiza las fechas desde la Agenda de reservas).</Alert> : null}
    <div className="rx-steps">
      <div className={step > 1 ? "done" : "now"}><b>1. Revisión</b>Limpieza revisa la habitación</div>
      <div className={step === 2 ? "now" : ""}><b>2. Cuenta</b>Consumos, daños y cobro</div>
      <div><b>3. Cierre</b>Libera la habitación</div>
    </div>

    <section className="rx-sec"><h3>Revisión de la habitación</h3>
      {!inspection ? <div style={{ display: "grid", gap: 8 }}>
        <label className="rx-field"><span>Personal de Limpieza en turno</span>
          <select className="rx-select" value={cleaner} onChange={(event) => setCleaner(event.target.value)}>
            <option value="">{cleaners.data?.length ? "Selecciona a quién avisar" : "No hay personal de Limpieza con asistencia"}</option>
            {(cleaners.data || []).map((person) => <option key={person.id} value={person.id}>{person.name || [person.firstName, person.lastName].filter(Boolean).join(" ")}</option>)}
          </select>
        </label>
        <button className="rx-btn rx-btn--dark" type="button" onClick={sendInspection} disabled={busy || !active || !cleaner}>Enviar aviso de revisión</button>
      </div> : <div className="rx-checks">
        {reviewed ? <Check ok={!damaged} title={damaged ? "Limpieza reportó daños" : "Habitación revisada sin observaciones"}>{inspection.assignedTo ? `Revisó: ${inspection.assignedTo}` : null}</Check>
          : <Check wait title={`Esperando la revisión${inspection.assignedTo ? ` de ${inspection.assignedTo}` : ""}`}>La pantalla se actualiza sola al terminar.</Check>}
      </div>}
    </section>

    <section className="rx-sec"><h3>Cuenta de la estadía</h3>
      <div className="rx-ledger">
        <div><span>Hospedaje</span><b>{money(row.account.lodging)}</b></div>
        <div><span>Consumos de Restaurante y Bar ({row.account.consumptionCount})</span><b>{money(row.account.consumptions)}</b></div>
        <div><span>Pagos recibidos</span><b>− {money(row.account.paid)}</b></div>
        {damageValue > 0 ? <div><span>Cargo por daños</span><b>{money(damageValue)}</b></div> : null}
        <div className={due > 0 ? "due" : "clear"}><span>{due > 0 ? "Total por cobrar" : "Cuenta al día"}</span><b>{money(due)}</b></div>
      </div>
    </section>

    {step === 2 ? <>
      {damaged ? <label className="rx-field"><span>Monto por daños (obligatorio)</span><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={damage} onChange={(event) => setDamage(event.target.value)} /></label> : null}
      {due > 0 ? <section className="rx-sec"><h3>Cobro final</h3><PaymentFields value={pay} onChange={setPay} cashOpen={cashSession?.status === "ABIERTA"} /></section> : null}
    </> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
