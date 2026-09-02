import { Link } from "react-router-dom";
import { Banknote, BedDouble, CalendarCheck, Clock3, ConciergeBell, Eye, LogIn, LogOut, ScanLine, SunMedium, Users, Waves, X } from "lucide-react";
import { useState } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { Button, ModuleCard, PageHeader } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { formatHotelDate as date, formatHotelTime as time, isHotelToday as isToday } from "../../utils/hotelDate";

export function ReceptionPage() {
  const { user } = useAuth();
  const [experienceFilter, setExperienceFilter] = useState("TODAS");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftMessage, setShiftMessage] = useState("");
  const [shiftClockOpen, setShiftClockOpen] = useState(false);
  const { data: currentShift, setData: setCurrentShift } = useFetch("/attendance/current", { initialData: { active: user?.role === "SUPERADMIN", cash: 0 }, cacheTime: 0, realtime: false });
  const { data, loading, error } = useFetch("/dashboard");
  const { data: reservations } = useFetch("/reservations", { initialData: [] });
  const { data: serviceBookings, reload: reloadServices } = useFetch("/service-bookings", { initialData: [] });
  const { data: serviceRequests, reload: reloadRequests } = useFetch("/reports", { initialData: { reports: [] } });
  const receptionRequests = (serviceRequests?.reports || []).filter((item) => item.status !== "RESUELTO" && ["RECEPCION", "MANTENIMIENTO"].includes(item.area));

  async function collectServiceBalance(item) { await api(`/service-bookings/${item.id}/pay`, { method: "POST", body: { amount: item.balance, method: "EFECTIVO" } }); reloadServices(); }
  async function resolveRequest(item) { await api(`/reports/${item.id}/status`, { method: "PATCH", body: { status: "RESUELTO" } }); reloadRequests(); }
  async function changeShift(credentials) { setShiftBusy(true); setShiftMessage(""); try { const result = await api("/attendance/self/clock", { method: "POST", body: credentials }); const active = result.action === "CHECK_IN"; setCurrentShift((current) => ({ ...(current || {}), active, record: active ? result.record : null, shift: active ? { ...(current?.shift || {}), area: "RECEPCION", status: "EN_CURSO" } : null })); setShiftClockOpen(false); setShiftMessage(active ? "Turno iniciado con DNI y PIN. Ya puedes operar Recepción." : "Turno cerrado con DNI y PIN."); } catch (cause) { throw cause; } finally { setShiftBusy(false); } }

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="rounded-card bg-park-danger-soft p-4 font-semibold text-park-danger">{error.message}</p>;

  const metrics = data?.metrics || { reservationsToday: 0, checkInsToday: 0, checkOutsToday: 0, occupiedRooms: 0, availableRooms: 0, incidentsOpen: 0, incidentsHighPriority: 0 };
  const shiftActive = user?.role === "SUPERADMIN" || currentShift?.active;
  const arrivals = (reservations || [])
    .filter((reservation) => isToday(reservation.checkInDate) && !reservation.stay)
    .slice(0, 5);
  const summary = [
    ["Reservas hoy", metrics.reservationsToday],
    ["Check-ins", metrics.checkInsToday],
    ["Check-outs", metrics.checkOutsToday],
    ["Habitaciones ocupadas", metrics.occupiedRooms],
    ["Habitaciones libres", metrics.availableRooms],
    ["Incidencias abiertas", metrics.incidentsOpen],
    ["Alta prioridad", metrics.incidentsHighPriority],
    ["Eventos proximos", data?.upcomingEvents?.length || 0]
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operacion diaria"
        title="Centro de atención"
        description="Atiende al huésped desde una sola jornada: reserva, pago, llegada, QR, solicitudes y salida."
        actions={<div className="flex flex-wrap gap-2">{user?.role !== "SUPERADMIN" ? <Button icon={Clock3} loading={shiftBusy} variant={shiftActive ? "secondary" : "gold"} onClick={() => setShiftClockOpen(true)}>{shiftActive ? "Cerrar turno" : "Iniciar turno"}</Button> : null}{shiftActive ? <Button as={Link} to="/reservas?nueva=1" variant="gold">Nueva reserva</Button> : null}</div>}
      />

      {shiftClockOpen ? <ReceptionShiftClock active={shiftActive} busy={shiftBusy} user={user} onClose={() => setShiftClockOpen(false)} onConfirm={changeShift} /> : null}

      <section className={`rounded-card border p-4 shadow-card ${shiftActive ? "border-park-green bg-park-green-soft" : "border-amber-300 bg-amber-50"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${shiftActive ? "bg-park-green text-white" : "bg-amber-500 text-white"}`}><Clock3 size={21}/></span><div><p className="text-xs font-black uppercase tracking-wide text-park-muted">Turno de Recepción</p><h2 className="text-lg font-black text-park-dark">{shiftActive ? user?.role === "SUPERADMIN" ? "Supervisión administrativa activa" : "Jornada operativa iniciada" : "Inicia tu turno para atender"}</h2><p className="text-sm text-park-muted">{shiftActive ? `Ingreso ${currentShift?.record?.checkIn ? time(currentShift.record.checkIn) : "administrativo"} · ${currentShift?.shift?.area || "RECEPCIÓN"}` : "Puedes revisar la agenda, pero cobros, QR, check-in y check-out permanecen bloqueados."}</p></div></div><div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3"><Banknote size={18} className="text-park-green"/><div><small className="block text-park-muted">Efectivo registrado hoy</small><strong className="text-park-dark">S/ {Number(currentShift?.cash || 0).toFixed(2)}</strong></div></div></div>
        {shiftMessage ? <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-bold text-park-dark">{shiftMessage}</p> : null}
      </section>

      <div className={!shiftActive ? "pointer-events-none space-y-5 opacity-50" : "space-y-5"} aria-disabled={!shiftActive}>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Acciones rápidas de recepción">
        <ModuleCard title="Validar ingreso" description="Cámara QR, revisión del pase y confirmación de acceso." href="/accesos" icon={ScanLine} meta="Primero atender" />
        <ModuleCard title="Llegadas" description="Check-in guiado: pago, habitación y estadía." href="/checkin" icon={LogIn} meta={`${metrics.reservationsToday} hoy`} />
        <ModuleCard title="Nueva reserva" description="Hospedaje, piscina, mirador o atención en caja." href="/reservas?nueva=1" icon={CalendarCheck} meta="Reservar" />
        <ModuleCard title="Buscar cliente" description="DNI, reserva, historial, QR y servicios activos." href="/clientes" icon={Users} meta="Atender" />
        <ModuleCard title="Salida y caja" description="Check-out, consumos, pago final y envío a limpieza." href="/checkout" icon={LogOut} meta={`${metrics.checkOutsToday} salidas`} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-3 border-b border-park-border pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-park-dark">Agenda de experiencias</h2><p className="text-sm text-park-muted">Piscina y mirador creados por el cliente o atendidos en caja.</p></div><div className="flex flex-wrap gap-2">{["TODAS", "PISCINA", "MIRADOR"].map((item) => <button className={`rounded-lg px-3 py-2 text-xs font-black ${experienceFilter === item ? "bg-park-green text-white" : "bg-park-bg text-park-dark"}`} key={item} onClick={() => setExperienceFilter(item)} type="button">{item === "TODAS" ? "Todas" : item}</button>)}</div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(serviceBookings || []).filter((item) => item.serviceCode !== "HOSPEDAJE" && (experienceFilter === "TODAS" || item.serviceCode === experienceFilter)).slice(0, 6).map((item) => { const Icon = item.serviceCode === "PISCINA" ? Waves : SunMedium; return <article className="rounded-xl border border-park-border bg-park-bg p-4" key={item.id}><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-park-green-soft text-park-green"><Icon size={20}/></span><StatusBadge value={item.balance > 0 ? "PENDIENTE_PAGO" : item.status}/></div><h3 className="mt-3 font-black text-park-dark">{item.serviceCode} · {item.planName}</h3><p className="mt-1 text-sm text-park-muted">{item.client?.firstName} {item.client?.lastName} · {item.people} persona(s)</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-park-muted">Fecha y hora</dt><dd className="font-bold">{date(item.date)} · {item.slot}</dd></div><div><dt className="text-park-muted">Pago</dt><dd className="font-bold">S/ {item.paid} de S/ {item.total}</dd></div>{item.parkingSpace ? <div><dt className="text-park-muted">Cochera</dt><dd className="font-bold">{item.parkingSpace}</dd></div> : null}<div><dt className="text-park-muted">QR</dt><dd className="font-bold">{item.entitlement?.status || "PENDIENTE"}</dd></div></dl>{item.balance > 0 ? <Button className="mt-3 w-full" size="sm" variant="gold" onClick={() => collectServiceBalance(item)}>Cobrar saldo S/ {item.balance}</Button> : null}</article>; })}{!(serviceBookings || []).some((item) => item.serviceCode !== "HOSPEDAJE" && (experienceFilter === "TODAS" || item.serviceCode === experienceFilter)) ? <p className="col-span-full py-5 text-center text-sm text-park-muted">No hay experiencias pendientes con este filtro.</p> : null}</div>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-2 border-b border-park-border pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-park-dark">Solicitudes de huéspedes</h2><p className="text-sm text-park-muted">Conserjería y soporte recibidos desde el portal del cliente.</p></div><span className="rounded-full bg-park-gold-soft px-3 py-1 text-xs font-black text-park-dark">{receptionRequests.length} pendientes</span></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {receptionRequests.slice(0, 6).map((item) => (
            <article className={`rounded-xl border ${item.area === "MANTENIMIENTO" ? "border-park-danger bg-park-danger-soft" : "border-park-border bg-park-bg"} p-4`} key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${item.area === "MANTENIMIENTO" ? "bg-park-danger text-white" : "bg-park-gold-soft text-park-dark"}`}>
                  <ConciergeBell size={20}/>
                </span>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge value={item.status}/>
                  {item.area === "MANTENIMIENTO" && <span className="text-[10px] font-black uppercase text-park-danger bg-white px-2 py-0.5 rounded border border-park-danger">Mantenimiento</span>}
                </div>
              </div>
              <h3 className="mt-3 font-black text-park-dark">{item.type.replaceAll("_", " ")}</h3>
              <p className="mt-1 text-sm text-park-muted">{item.description || "Sin detalle adicional"}</p>
              <p className="mt-2 text-xs font-semibold text-park-muted">{item.location}</p>
              {item.area === "MANTENIMIENTO" ? <Button as={Link} className="mt-3 w-full" size="sm" variant="primary" to="/incidencias/abiertas">Gestionar soporte</Button> : <Button className="mt-3 w-full" size="sm" variant="secondary" onClick={() => resolveRequest(item)}>Marcar atendida</Button>}
            </article>
          ))}
          {receptionRequests.length === 0 ? <p className="col-span-full py-5 text-center text-sm text-park-muted">No hay solicitudes pendientes de conserjería o mantenimiento.</p> : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <article className="rounded-card border border-park-border bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-park-border px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-park-dark">Proximas llegadas</h2>
              <p className="text-sm text-park-muted">Reservas con entrada programada para hoy.</p>
            </div>
            <Button as={Link} to="/checkin" size="sm" variant="secondary">Ver check-in</Button>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {arrivals.length ? arrivals.map((reservation) => <article className="rounded-xl border border-park-border bg-park-bg p-4" key={`mobile-${reservation.id}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-park-black">{reservation.client?.firstName} {reservation.client?.lastName}</p><p className="text-xs text-park-muted">{reservation.code} · DNI {reservation.client?.documentNumber}</p></div><StatusBadge value={reservation.status}/></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-park-muted">Hora</dt><dd className="font-bold">{time(reservation.checkInDate)}</dd></div><div><dt className="text-xs text-park-muted">Habitación</dt><dd className="font-bold">{reservation.room?.number} · {reservation.room?.type?.name}</dd></div></dl><Button as={Link} to={`/checkin?search=${encodeURIComponent(reservation.code)}`} className="mt-3 w-full" size="sm" variant="secondary" icon={Eye}>Abrir check-in</Button></article>) : <p className="py-4 text-center text-sm text-park-muted">No hay llegadas pendientes para hoy.</p>}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-park-bg text-xs uppercase text-park-muted">
                <tr>
                  {["Hora", "Huesped", "Habitacion", "Entrada", "Noches", "Estado", "Accion"].map((column) => (
                    <th className="px-5 py-3 font-bold" key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-park-border">
                {arrivals.length ? arrivals.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="px-5 py-3 font-semibold">{time(reservation.checkInDate)}</td>
                    <td className="px-5 py-3">
                      <span className="block font-semibold text-park-black">{reservation.client?.firstName} {reservation.client?.lastName}</span>
                      <span className="text-xs text-park-muted">DNI {reservation.client?.documentNumber}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="block font-semibold">{reservation.room?.number}</span>
                      <span className="text-xs text-park-muted">{reservation.room?.type?.name}</span>
                    </td>
                    <td className="px-5 py-3">{date(reservation.checkInDate)}</td>
                    <td className="px-5 py-3">{nights(reservation)}</td>
                    <td className="px-5 py-3"><StatusBadge value={reservation.status} /></td>
                    <td className="px-5 py-3">
                      <Button as={Link} to={`/checkin?search=${encodeURIComponent(reservation.code)}`} size="sm" variant="secondary" icon={Eye}>Abrir</Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-5 py-6 text-center text-park-muted" colSpan={7}>No hay llegadas pendientes para hoy.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-semibold text-park-dark">Resumen del dia</h2>
          <dl className="mt-4 divide-y divide-park-border">
            {summary.map(([label, value]) => (
              <div className="flex items-center justify-between py-2 text-sm" key={label}>
                <dt className="text-park-muted">{label}</dt>
                <dd className={`font-semibold ${Number(value) > 0 && ["Incidencias abiertas", "Alta prioridad"].includes(label) ? "text-park-danger" : "text-park-black"}`}>{value || 0}</dd>
              </div>
            ))}
          </dl>
          <Button as={Link} to="/dashboard" className="mt-4 w-full" variant="secondary">Ver reporte completo</Button>
        </article>
      </section>
      </div>
    </div>
  );
}

function ReceptionShiftClock({ active, busy, user, onClose, onConfirm }) {
  const [documentNumber, setDocumentNumber] = useState(String(user?.documentNumber || "").replace(/\D/g, "").slice(0, 8));
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setError("");
    if (!/^\d{8}$/.test(documentNumber) || !/^\d{4}$/.test(pin)) return setError("Ingresa tu DNI de 8 dígitos y tu PIN de 4 dígitos.");
    try { await onConfirm({ documentNumber, pin }); }
    catch (cause) { setError(cause.message || "No se pudo validar la asistencia."); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm"><form className="w-full max-w-md rounded-card bg-white p-6 shadow-drawer" onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">Asistencia personal</p><h2 className="mt-1 text-xl font-black text-park-dark">{active ? "Cerrar turno" : "Iniciar turno"}</h2></div><button className="grid h-9 w-9 place-items-center rounded-button border border-park-border" onClick={onClose} type="button" aria-label="Cerrar"><X size={18}/></button></div><p className="mt-3 text-sm text-park-muted">Confirma tu identidad con el DNI y el PIN asignado por el Superadmin.</p><div className="mt-5 grid gap-4"><label className="text-sm font-black text-park-dark">DNI<input className="mt-2 h-11 w-full rounded-input border border-park-border px-3 outline-none focus:border-park-green" inputMode="numeric" maxLength={8} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.replace(/\D/g, "").slice(0, 8))} required /></label><label className="text-sm font-black text-park-dark">PIN de asistencia<input className="mt-2 h-11 w-full rounded-input border border-park-border px-3 outline-none focus:border-park-green" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} required autoFocus /></label></div>{error ? <p className="mt-4 rounded-card bg-park-danger-soft p-3 text-sm font-semibold text-park-danger">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" variant="gold" loading={busy}>{active ? "Confirmar salida" : "Confirmar ingreso"}</Button></div></form></div>;
}

function nights(reservation) {
  const start = new Date(reservation.checkInDate);
  const end = new Date(reservation.checkOutDate);
  return Math.max(1, Math.round((end - start) / 86400000));
}
