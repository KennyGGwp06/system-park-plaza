import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, DoorOpen, LogIn, LogOut, Search, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, PageHeader } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { currentHotelDateKey, formatHotelDate, hotelDateKey, isHotelToday } from "../../utils/hotelDate";

const isOpenReservation = (reservation) => !reservation.stay && ["CONFIRMADA", "PENDIENTE"].includes(reservation.status);

export function HotelMovementsPage() {
  const { data: reservations, loading } = useFetch("/reservations", { initialData: [] });
  if (loading) return <LoadingSpinner label="Cargando llegadas y salidas..." />;

  const today = currentHotelDateKey();
  const rows = Array.isArray(reservations) ? reservations : [];
  const arrivals = rows.filter((item) => isOpenReservation(item) && hotelDateKey(item.checkInDate) <= today && hotelDateKey(item.checkOutDate) > today);
  const departures = rows.filter((item) => (item.stay || item.status === "CHECKED_IN") && isHotelToday(item.checkOutDate));
  const overdue = arrivals.filter((item) => hotelDateKey(item.checkInDate) < today);
  const balances = [...arrivals, ...departures].filter((item) => Number(item.balance || 0) > 0);

  return <main className="hotel-modern hotel-movements space-y-5 pb-10">
    <PageHeader
      eyebrow="Hotel · movimiento del día"
      title="Llegadas y salidas"
      description="Una mesa de trabajo para recibir huéspedes, cerrar cuentas y liberar habitaciones sin mezclar estas acciones con reservas o clientes."
      actions={<><Button as={Link} icon={LogIn} to="/checkin">Atender llegada</Button><Button as={Link} icon={LogOut} to="/checkout" variant="secondary">Atender salida</Button></>}
    />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={LogIn} label="Llegadas por recibir" value={arrivals.length} detail={overdue.length ? `${overdue.length} atrasada${overdue.length === 1 ? "" : "s"}` : "Sin atrasos"} tone="gold" />
      <Metric icon={LogOut} label="Salidas de hoy" value={departures.length} detail="Revisar cuenta y consumos" />
      <Metric icon={WalletCards} label="Movimientos con saldo" value={balances.length} detail="Requieren cobro antes de cerrar" tone="gold" />
      <Metric icon={CheckCircle2} label="Ya gestionados" value={rows.filter((item) => isHotelToday(item.checkInDate) && (item.stay || item.status === "CHECKED_IN")).length} detail="Ingresos realizados hoy" />
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <MovementLane title="Llegadas" subtitle="Antes de dar acceso: datos completos, habitación lista y pago validado." icon={LogIn} empty="No hay llegadas pendientes para atender." action="Abrir mesa de llegadas" href="/checkin" rows={arrivals} type="arrival" />
      <MovementLane title="Salidas" subtitle="Antes de liberar: revisar consumos, saldo y condición de la habitación." icon={LogOut} empty="No hay salidas programadas para hoy." action="Abrir mesa de salidas" href="/checkout" rows={departures} type="departure" />
    </section>

    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">Ruta del huésped</p><h2 className="font-display text-xl text-park-dark">Qué ocurre al terminar una salida</h2></div><Button as={Link} icon={Search} size="sm" to="/hotel/habitaciones" variant="secondary">Ver habitaciones</Button></div>
      <div className="mt-5 grid gap-2 md:grid-cols-4">{[[CalendarClock, "Reserva", "Mantiene la habitación separada."], [LogIn, "Ingreso", "La estadía pasa a activa."], [LogOut, "Salida", "La cuenta se cierra."], [ClipboardCheck, "Limpieza", "La habitación vuelve a estar disponible."]].map(([Icon, title, description], index) => <div className="hotel-movements__step" key={title}><span><Icon size={17}/></span><div><strong>{index + 1}. {title}</strong><p>{description}</p></div>{index < 3 ? <ArrowRight className="hotel-movements__arrow" size={17}/> : null}</div>)}</div>
    </section>
  </main>;
}

function Metric({ icon: Icon, label, value, detail, tone = "green" }) {
  return <article className="rounded-card border border-park-border bg-white p-4 shadow-card"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone === "gold" ? "bg-park-gold-soft text-park-gold-deep" : "bg-park-green-soft text-park-green"}`}><Icon size={19}/></span><strong className="mt-3 block font-display text-3xl text-park-dark">{value}</strong><span className="block text-sm font-bold text-park-dark">{label}</span><small className="mt-1 block text-xs text-park-muted">{detail}</small></article>;
}

function MovementLane({ title, subtitle, icon: Icon, rows, empty, action, href, type }) {
  return <article className="overflow-hidden rounded-card border border-park-border bg-white shadow-card"><header className="flex items-start justify-between gap-4 border-b border-park-border p-5"><div className="flex gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${type === "arrival" ? "bg-park-gold-soft text-park-gold-deep" : "bg-park-green-soft text-park-green"}`}><Icon size={19}/></span><div><h2 className="font-display text-xl text-park-dark">{title}</h2><p className="mt-1 max-w-md text-sm text-park-muted">{subtitle}</p></div></div><strong className="font-display text-3xl text-park-dark">{rows.length}</strong></header><div className="divide-y divide-park-border">{rows.length ? rows.slice(0, 7).map((item) => <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center" key={item.id}><div><strong className="block text-park-dark">{item.client?.firstName} {item.client?.lastName}</strong><p className="mt-1 text-xs text-park-muted">{item.code} · Habitación {item.room?.number || "por asignar"} · {type === "arrival" ? `entrada ${formatHotelDate(item.checkInDate)}` : `salida ${formatHotelDate(item.checkOutDate)}`}</p></div><div className="flex items-center gap-2 sm:justify-end"><StatusBadge value={Number(item.balance || 0) > 0 ? "PENDIENTE_PAGO" : item.status}/><span className={Number(item.balance || 0) > 0 ? "text-xs font-black text-park-danger" : "text-xs font-bold text-park-green"}>{Number(item.balance || 0) > 0 ? `Saldo S/ ${Number(item.balance).toFixed(2)}` : "Cuenta al día"}</span></div></div>) : <p className="p-8 text-center text-sm text-park-muted">{empty}</p>}</div><Link className="flex items-center justify-center gap-2 border-t border-park-border p-3 text-sm font-black text-park-green hover:bg-park-green-soft" to={href}>{action}<ArrowRight size={16}/></Link></article>;
}
