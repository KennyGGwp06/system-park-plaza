// Ficha de una reserva de cualquiera de los 5 servicios: datos, cuenta, pagos, historial y las acciones
// que Recepción puede hacer (cobrar el saldo o verificar un Yape/Plin, llevar al check-in o a validar el pase).
// Datos: GET /api/reception/reservations/:type/:id. Cobro según el modelo de cada servicio.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, LogIn, QrCode } from "lucide-react";
import { api } from "../../services/api";
import { Alert, Drawer, PaymentTag, ReservationTag, dateShort, money, serviceOf, timeOf, useShift, useToast } from "./rxkit";
import { PaymentFields, paymentError } from "./PaymentFields";
import { LoadingSpinner } from "../../components/LoadingSpinner";

export async function registerCollection(type, id, { amount, method, reference }, code) {
  const body = { amount: Number(amount), method, reference: reference || undefined };
  if (type === "HOSPEDAJE") return api("/pagos", { method: "POST", body: { ...body, reservationId: id, concept: `Cobro ${code}` } });
  if (type === "EVENTOS") return api(`/events/${id}/payments`, { method: "POST", body });
  return api(`/service-bookings/${id}/pay`, { method: "POST", body });
}

const ACTION = { CREAR: "Creada", EDITAR: "Modificada", CANCELAR: "Cancelada", REGISTRAR: "Registro", EVENTO: "Pago de evento", ESTADO: "Cambio de estado", CONFIRMAR: "Confirmada", REPROGRAMAR: "Reprogramada" };

export function ReservationDrawer({ target, onClose, onChanged, onEditHotel }) {
  const show = useToast();
  const { active, cashSession, openClock } = useShift();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ method: "EFECTIVO", amount: "", reference: "" });
  const [payOpen, setPayOpen] = useState(false);

  async function load() {
    if (!target) return;
    try {
      const data = await api(`/reception/reservations/${target.type}/${target.id}`);
      setDetail(data); setError("");
      setPay(data.verify ? { method: data.verify.method || "YAPE", amount: String(data.verify.amount || data.balance), reference: data.verify.reference || "" } : { method: "EFECTIVO", amount: String(data.balance || ""), reference: "" });
    } catch (cause) { setError(cause.message); }
  }
  useEffect(() => { setDetail(null); setPayOpen(false); load(); }, [target?.type, target?.id]);
  if (!target) return null;

  const service = serviceOf(target.type);
  const Icon = service.icon;
  async function collect() {
    const max = detail.verify ? null : detail.balance;
    const problem = paymentError(pay, max ?? detail.balance);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      await registerCollection(detail.type, detail.id, pay, detail.code);
      show(detail.verify ? `Pago verificado y registrado en ${detail.code}.` : `Cobro de ${money(pay.amount)} registrado en ${detail.code}.`);
      setPayOpen(false); await load(); onChanged?.();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  const title = detail ? detail.clientName : "Cargando…";
  const when = detail ? (detail.type === "HOSPEDAJE" ? `${dateShort(detail.checkInDate)} → ${dateShort(detail.checkOutDate)}` : detail.type === "EVENTOS" ? `${dateShort(detail.date)} · ${detail.slot || ""}` : `${dateShort(detail.date)}${detail.slot ? ` · ${detail.slot}` : ""}`) : "";
  const canCollect = detail && detail.balance > 0 && !["CANCELADA", "COMPLETADA"].includes(detail.status);

  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${service.name} · ${target.code || detail?.code || ""}`} title={title}
    subtitle={detail ? `${when}${detail.place ? ` · ${detail.place}` : ""} · ${detail.people} persona(s)` : ""}
    footer={detail ? <>
      {detail.type === "HOSPEDAJE" && ["CONFIRMADA", "POR_CONFIRMAR"].includes(detail.status) ? <Link className="rx-btn" to={`/admin-panel/movimientos?vista=llegadas&abrir=${detail.id}`}><LogIn />Ir al check-in</Link> : null}
      {detail.type !== "HOSPEDAJE" && !["CANCELADA", "COMPLETADA"].includes(detail.status) ? <Link className="rx-btn" to="/admin-panel/accesos"><QrCode />Validar pase</Link> : null}
      {detail.type === "HOSPEDAJE" && !["CANCELADA", "COMPLETADA"].includes(detail.status) ? (onEditHotel ? <button className="rx-btn" type="button" onClick={() => onEditHotel(detail.id)}>Editar</button> : <Link className="rx-btn" to={`/admin-panel/reservas?editar=${detail.id}`}>Editar</Link>) : detail.type === "EVENTOS" ? <Link className="rx-btn" to="/eventos/reservas">Abrir en Eventos</Link> : null}
      {canCollect && !payOpen ? <button className="rx-btn rx-btn--primary" type="button" onClick={() => (active ? setPayOpen(true) : openClock())}>{detail.verify ? "Verificar pago" : `Cobrar ${money(detail.balance)}`}</button> : null}
      {payOpen ? <button className="rx-btn rx-btn--primary" type="button" onClick={collect} disabled={busy}>{busy ? "Registrando…" : `Registrar ${money(pay.amount || 0)}`}</button> : null}
    </> : null}>
    {!detail && !error ? <LoadingSpinner label="Cargando la reserva…" /> : null}
    {detail ? <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><span className="rx-ico"><Icon /></span><ReservationTag status={detail.status} /><PaymentTag status={detail.verify ? "PENDIENTE_VERIFICACION" : detail.paymentState} balance={detail.balance} /></div>
      {detail.verify ? <Alert tone="warn"><b>El cliente envió un {detail.verify.method}</b> por {money(detail.verify.amount)} con la operación <b className="rx-mono">{detail.verify.reference}</b>. Compruébalo en la app antes de aprobarlo.</Alert> : null}
      <section className="rx-sec"><h3>Datos de la reserva</h3>
        <dl className="rx-dl">
          <div><dt>Titular</dt><dd>{detail.clientName}</dd></div>
          <div><dt>Documento</dt><dd>{detail.clientDocument || "—"}</dd></div>
          <div><dt>{detail.type === "HOSPEDAJE" ? "Entrada y salida" : "Fecha y hora"}</dt><dd>{when}</dd></div>
          <div><dt>{detail.type === "HOSPEDAJE" ? "Habitación" : detail.type === "EVENTOS" ? "Espacio" : "Zona / plan"}</dt><dd>{detail.place || detail.planName || "—"}</dd></div>
          <div><dt>Personas</dt><dd>{detail.people}</dd></div>
          <div><dt>Creada</dt><dd>{dateShort(detail.createdAt)} · {timeOf(detail.createdAt)}</dd></div>
          {detail.type === "EVENTOS" ? <><div><dt>Tipo de evento</dt><dd>{detail.eventType || detail.planName || "—"}</dd></div><div><dt>Montaje</dt><dd>{detail.layout || "—"}</dd></div></> : null}
        </dl>
      </section>
      <section className="rx-sec"><h3>Cuenta</h3>
        <div className="rx-ledger">
          <div><span>Total</span><b>{money(detail.total)}</b></div>
          <div><span>Pagado</span><b>{money(detail.paid)}</b></div>
          <div className={detail.balance > 0 ? "due" : "clear"}><span>{detail.balance > 0 ? "Saldo" : "Cuenta al día"}</span><b>{money(detail.balance)}</b></div>
        </div>
      </section>
      {payOpen ? <section className="rx-sec"><h3>{detail.verify ? "Verificar y registrar" : "Registrar cobro"}</h3>
        <PaymentFields value={pay} onChange={setPay} max={detail.balance} cashOpen={cashSession?.status === "ABIERTA"} lockAmount={Boolean(detail.verify) && detail.type === "MIRADOR"} hint={detail.verify && detail.type === "MIRADOR" ? "En Mirador el método, la operación y el monto deben coincidir exactamente con lo que envió el cliente." : null} />
      </section> : null}
      <section className="rx-sec"><h3>Pagos ({detail.payments.length})</h3>
        {detail.payments.length ? <div className="rx-ledger">{detail.payments.map((payment, index) => <div key={index}><span>{dateShort(payment.createdAt)} {timeOf(payment.createdAt)} · {payment.method}{payment.concept ? ` · ${payment.concept}` : ""}</span><b>{money(payment.amount)}</b></div>)}</div> : <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Sin pagos registrados.</p>}
      </section>
      <section className="rx-sec"><h3><History size={12} style={{ verticalAlign: "-2px" }} /> Historial</h3>
        {detail.history.length ? <ul className="rx-list" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>{detail.history.slice(0, 8).map((entry, index) => <li key={index} style={{ padding: "8px 12px" }}><div className="grow"><b>{ACTION[entry.action] || entry.action}</b><small>{entry.detail}</small></div><small style={{ color: "var(--muted)", fontSize: 12, textAlign: "right" }}>{entry.actorName}<br />{dateShort(entry.at)} {timeOf(entry.at)}</small></li>)}</ul> : <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Sin movimientos registrados.</p>}
      </section>
    </> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
