import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarCheck, CheckCircle2, ClipboardCheck, QrCode, Search, TriangleAlert, UserCheck } from "lucide-react";
import { api } from "../../services/api";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Button, Input, PageHeader, Tabs } from "../../components/ui";
import { currentHotelDateKey, formatHotelDate, formatHotelTime, hotelDateKey, isHotelToday } from "../../utils/hotelDate";

export function CheckInPage() {
  const location = useLocation();
  const initialSearch = new URLSearchParams(location.search).get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const [rows, setRows] = useState([]);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("PENDIENTES");

  useEffect(() => {
    load(initialSearch);
  }, []);

  const metrics = useMemo(() => {
    const today = currentHotelDateKey();
    const todayRows = rows.filter((reservation) => isHotelToday(reservation.checkInDate));
    const pendingRows = rows.filter((reservation) => !reservation.stay && ["CONFIRMADA", "PENDIENTE"].includes(reservation.status));
    return {
      today: todayRows.length,
      pending: pendingRows.length,
      overdue: pendingRows.filter((reservation) => hotelDateKey(reservation.checkInDate) < today && (!reservation.checkOutDate || hotelDateKey(reservation.checkOutDate) > today)).length,
      completed: todayRows.filter((reservation) => reservation.stay || reservation.status === "CHECKED_IN").length
    };
  }, [rows]);

  const visibleRows = useMemo(() => rows.filter((reservation) => {
    if (tab === "HOY") return isHotelToday(reservation.checkInDate);
    if (tab === "PENDIENTES") return !reservation.stay && ["CONFIRMADA", "PENDIENTE"].includes(reservation.status);
    if (tab === "ATRASADOS") return !reservation.stay && ["CONFIRMADA", "PENDIENTE"].includes(reservation.status) && hotelDateKey(reservation.checkInDate) < currentHotelDateKey();
    if (tab === "COMPLETADOS") return Boolean(reservation.stay) || reservation.status === "CHECKED_IN";
    return true;
  }), [rows, tab]);

  async function load(term = "") {
    setLoading(true);
    setError("");
    try {
      setRows(await api(`/checkin/search?search=${encodeURIComponent(term)}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch(event) {
    event.preventDefault();
    load(search);
  }

  async function doCheckIn(id) {
    try {
      await api("/checkin", { method: "POST", body: { reservationId: id } });
      setToast("Check-in realizado.");
      await load(search);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow="Recepcion"
        title="Check-in"
        description="Prioriza reservas pendientes y atrasadas. El pago y la habitación se validan automáticamente antes del ingreso."
        actions={<Button variant="secondary" icon={QrCode} type="button" disabled>Escanear QR</Button>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CompactMetric icon={CalendarCheck} label="Llegadas hoy" value={metrics.today} />
        <CompactMetric icon={ClipboardCheck} label="Pendientes de ingreso" value={metrics.pending} tone="gold" />
        <CompactMetric icon={TriangleAlert} label="Llegadas atrasadas" value={metrics.overdue} tone="danger" />
        <CompactMetric icon={UserCheck} label="Completados hoy" value={metrics.completed} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={runSearch}>
          <Input className="flex-1" placeholder="Buscar por DNI, reserva, cliente o habitacion" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button icon={Search} type="submit">Buscar</Button>
        </form>
        {error ? <p className="mt-3 rounded-card bg-park-danger-soft px-3 py-2 text-sm font-semibold text-park-danger">{error}</p> : null}
      </section>

      <Tabs
        tabs={[
          { value: "HOY", label: `Llegadas hoy (${metrics.today})` },
          { value: "PENDIENTES", label: `Pendientes (${metrics.pending})` },
          { value: "ATRASADOS", label: `Atrasados (${metrics.overdue})` },
          { value: "COMPLETADOS", label: `Completados (${metrics.completed})` },
          { value: "TODOS", label: "Todos" }
        ]}
        value={tab}
        onChange={setTab}
      />

      <section className="grid gap-4">
        {visibleRows.map((reservation) => {
          const roomPrepared = reservation.room?.status === "LIBRE";
          const paidInFull = Number(reservation.balance || 0) <= 0 && reservation.paymentStatus === "PAGADO";
          const today = currentHotelDateKey();
          const arrival = hotelDateKey(reservation.checkInDate);
          const departure = hotelDateKey(reservation.checkOutDate);
          const arrivalOpen = !arrival || arrival <= today;
          const stayOpen = !departure || departure > today;
          const overdue = !reservation.stay && Boolean(arrival) && arrival < today && stayOpen;
          const ready = !reservation.stay && ["CONFIRMADA", "PENDIENTE"].includes(reservation.status) && roomPrepared && paidInFull && arrivalOpen && stayOpen;
          const actionLabel = reservation.stay
            ? "Check-in realizado"
            : !paidInFull
              ? `Saldo pendiente · S/ ${Number(reservation.balance || 0).toFixed(2)}`
              : !arrivalOpen
                ? `Disponible el ${formatHotelDate(reservation.checkInDate)}`
                : !stayOpen
                  ? "Actualizar fechas"
                  : !roomPrepared
                    ? roomStateLabel(reservation.room?.status)
                    : "Realizar check-in";
          return (
            <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={reservation.id}>
              <div className="grid gap-4 xl:grid-cols-[96px_1fr_120px_1fr_auto] xl:items-center">
                <div>
                  <p className="font-display text-[28px] font-semibold text-park-dark">{formatHotelTime(reservation.checkInDate)}</p>
                  <Button size="sm" variant="secondary" type="button">Ver detalles</Button>
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-park-black">{reservation.client.firstName} {reservation.client.lastName}</h2>
                  <p className="text-sm text-park-muted">DNI: {reservation.client.documentNumber}</p>
                  <p className="mt-1 text-xs font-semibold text-park-muted">{reservation.code}</p>
                </div>
                <div className="rounded-card border border-park-border bg-park-bg px-4 py-3 text-center">
                  <strong className="block font-display text-2xl font-semibold text-park-dark">{reservation.room.number}</strong>
                  <span className="text-xs text-park-muted">{reservation.room.type?.name}</span>
                </div>
                <div className="grid gap-1 text-sm">
                  <Info label="Entrada" value={formatHotelDate(reservation.checkInDate)} />
                  <Info label="Noches" value={nights(reservation)} />
                  <Info label="Huespedes" value={`${reservation.adults} adultos, ${reservation.children} ninos`} />
                </div>
                <div className="rounded-card bg-park-bg p-3 text-sm">
                  <p className="mb-2 font-semibold text-park-black">Estado de datos</p>
                  <Checklist ok label="Reserva registrada" />
                  <Checklist ok={roomPrepared} label={roomPrepared ? "Habitación limpia y preparada" : roomStateLabel(reservation.room?.status)} />
                  <Checklist ok={paidInFull} label={paidInFull ? "Pago completo" : `Saldo pendiente S/ ${Number(reservation.balance || 0).toFixed(2)}`} />
                  <Checklist ok={arrivalOpen && stayOpen} label={!arrivalOpen ? `Ingreso programado para ${formatHotelDate(reservation.checkInDate)}` : !stayOpen ? "Fechas vencidas: actualiza la reserva" : overdue ? `Llegada pendiente desde ${formatHotelDate(reservation.checkInDate)}` : "Fecha de ingreso habilitada"} />
                  <Checklist ok label="Documento disponible" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-park-border pt-4">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge value={reservation.stay ? "CHECKED_IN" : reservation.status} />{overdue ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Llegada atrasada · atender ahora</span> : null}</div>
                <Button disabled={!ready} onClick={() => doCheckIn(reservation.id)} type="button">
                  {actionLabel}
                </Button>
              </div>
            </article>
          );
        })}
        {!visibleRows.length ? <p className="rounded-card border border-park-border bg-white p-6 text-center text-park-muted shadow-card">No hay reservas para este filtro.</p> : null}
      </section>
    </div>
  );
}

function CompactMetric({ icon: Icon, label, value, tone = "green" }) {
  const toneClass = tone === "danger" ? "bg-red-50 text-red-700" : tone === "gold" ? "bg-park-gold-soft text-park-gold" : "bg-park-green-soft text-park-green";
  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-card ${toneClass}`}><Icon size={20} /></span>
        <div>
          <p className="text-sm font-semibold text-park-muted">{label}</p>
          <strong className="font-display text-2xl font-semibold text-park-dark">{value}</strong>
        </div>
      </div>
    </article>
  );
}

function Info({ label, value }) {
  return <p><span className="inline-block w-20 text-park-muted">{label}</span><strong className="font-semibold text-park-black">{value}</strong></p>;
}

function Checklist({ ok, label }) {
  return <p className={ok ? "text-park-green" : "text-park-gold"}>{ok ? "OK" : "!"} {label}</p>;
}

function roomStateLabel(status) {
  const labels = {
    EN_LIMPIEZA: "Esperando finalización de Limpieza",
    OCUPADA: "Habitación todavía ocupada",
    MANTENIMIENTO: "Bloqueada por mantenimiento",
    FUERA_SERVICIO: "Habitación fuera de servicio"
  };
  return labels[status] || "Habitación no preparada";
}

function nights(reservation) {
  const start = new Date(reservation.checkInDate);
  const end = new Date(reservation.checkOutDate);
  return Math.max(1, Math.round((end - start) / 86400000));
}
