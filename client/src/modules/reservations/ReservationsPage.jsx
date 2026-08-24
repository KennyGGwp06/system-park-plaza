import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Eye, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Table } from "../../components/Table";
import { Toast } from "../../components/Toast";
import { Button, PageHeader } from "../../components/ui";
import { useLocation } from "react-router-dom";
import { currentHotelDateKey, formatHotelDate as formatDate, hotelDateKey, isHotelToday as isToday } from "../../utils/hotelDate";

const emptyForm = {
  clientId: "",
  clientLabel: "",
  roomId: "",
  checkInDate: "",
  checkOutDate: "",
  adults: 1,
  children: 0,
  totalPrice: 0,
  advance: 0,
  paymentMethod: "EFECTIVO",
  notes: ""
};

export function ReservationsPage() {
  const location = useLocation();
  const { data: reservations, loading, reload } = useFetch("/reservations", { initialData: [] });
  const { data: roomData, reload: reloadRooms } = useFetch("/rooms", { initialData: { rooms: [] } });
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("TODAS");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("nueva") === "1") {
      setShowForm(true);
      const roomId = params.get("habitacion");
      if (roomId) setForm((current) => ({ ...current, roomId }));
    }
  }, [location.search]);

  const rooms = useMemo(
    () => (roomData?.rooms || []).filter((room) => !["MANTENIMIENTO", "FUERA_SERVICIO"].includes(room.status)),
    [roomData]
  );
  const selectedRoom = rooms.find((room) => String(room.id) === String(form.roomId));
  const nights = getNights(form.checkInDate, form.checkOutDate);
  const balance = Math.max(0, Number(form.totalPrice || 0) - Number(form.advance || 0));
  const filteredReservations = useMemo(() => (reservations || []).filter((reservation) => {
    const text = `${reservation.code} ${reservation.client?.firstName} ${reservation.client?.lastName} ${reservation.client?.documentNumber} ${reservation.room?.number}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesFilter =
      filter === "TODAS" ||
      (filter === "HOY" && isToday(reservation.checkInDate)) ||
      (filter === "PROXIMAS" && hotelDateKey(reservation.checkInDate) > currentHotelDateKey()) ||
      (filter === "PENDIENTES" && reservation.status === "PENDIENTE") ||
      (filter === "CONFIRMADAS" && reservation.status === "CONFIRMADA") ||
      (filter === "HOSPEDADOS" && reservation.status === "CHECKED_IN") ||
      (filter === "FINALIZADAS" && reservation.status === "COMPLETADA") ||
      (filter === "CANCELADAS" && ["CANCELADA", "NO_SHOW"].includes(reservation.status));
    return matchesSearch && matchesFilter;
  }), [reservations, search, filter]);

  const counters = useMemo(() => ({
    today: (reservations || []).filter((reservation) => isToday(reservation.checkInDate)).length,
    upcoming: (reservations || []).filter((reservation) => hotelDateKey(reservation.checkInDate) > currentHotelDateKey()).length,
    pending: (reservations || []).filter((reservation) => reservation.status === "PENDIENTE").length,
    confirmed: (reservations || []).filter((reservation) => reservation.status === "CONFIRMADA").length
  }), [reservations]);

  useEffect(() => {
    if (!clientQuery.trim() || form.clientLabel === clientQuery) {
      setClientOptions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setClientOptions(await api(`/clients/search?q=${encodeURIComponent(clientQuery)}`));
      } catch {
        setClientOptions([]);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [clientQuery, form.clientLabel]);

  useEffect(() => {
    if (!selectedRoom || nights <= 0) return;
    setForm((current) => ({
      ...current,
      totalPrice: Number(selectedRoom.price) * nights,
      advance: Math.min(Number(current.advance || 0), Number(selectedRoom.price) * nights)
    }));
  }, [selectedRoom?.id, selectedRoom?.price, nights]);

  useEffect(() => {
    if (!form.roomId || !form.checkInDate || !form.checkOutDate || nights <= 0) {
      setAvailability(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setAvailability(await api(`/rooms/${form.roomId}/check-availability?checkIn=${form.checkInDate}&checkOut=${form.checkOutDate}`));
      } catch (err) {
        setAvailability({ available: false, message: err.message });
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [form.roomId, form.checkInDate, form.checkOutDate, nights]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.clientId) return setError("Selecciona un cliente de la lista.");
    if (!form.roomId || !form.checkInDate || !form.checkOutDate) return setError("Completa habitación, fecha de entrada y fecha de salida.");
    if (nights <= 0) return setError("La fecha de salida debe ser posterior a la fecha de entrada.");
    if (Number(form.advance) > Number(form.totalPrice)) return setError("El adelanto no puede superar el precio total.");
    if (!editingId && availability?.available === false) return setError(availability.message || "La habitacion no esta disponible en ese rango.");

    const payload = {
      clientId: Number(form.clientId),
      roomId: Number(form.roomId),
      checkInDate: form.checkInDate,
      checkOutDate: form.checkOutDate,
      adults: Number(form.adults),
      children: Number(form.children),
      totalPrice: Number(form.totalPrice),
      advance: Number(form.advance),
      paymentMethod: form.paymentMethod,
      status: "CONFIRMADA",
      notes: form.notes
    };

    try {
      if (editingId) {
        await api(`/reservations/${editingId}`, { method: "PUT", body: payload });
        setToast("Reserva actualizada correctamente.");
      } else {
        await api("/reservations", { method: "POST", body: payload });
        setToast("Reserva creada correctamente.");
      }
      setForm(emptyForm);
      setClientQuery("");
      setEditingId(null);
      setShowForm(false);
      setAvailability(null);
      reload();
      reloadRooms();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelReservation() {
    if (!pendingCancel) return;
    await api(`/reservations/${pendingCancel.id}`, { method: "DELETE" });
    setToast("Reserva cancelada.");
    setPendingCancel(null);
    reload();
    reloadRooms();
  }

  function editReservation(reservation) {
    setEditingId(reservation.id);
    const label = `${reservation.client.firstName} ${reservation.client.lastName} - ${reservation.client.documentNumber}`;
    setClientQuery(label);
    setForm({
      clientId: reservation.clientId,
      clientLabel: label,
      roomId: reservation.roomId,
      checkInDate: toInputDate(reservation.checkInDate),
      checkOutDate: toInputDate(reservation.checkOutDate),
      adults: reservation.adults,
      children: reservation.children,
      totalPrice: Number(reservation.totalPrice),
      advance: Number(reservation.advance),
      paymentMethod: "EFECTIVO",
      notes: reservation.notes || ""
    });
    setShowForm(true);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />

      <PageHeader
        eyebrow="Recepcion"
        title="Reservas de Hotel"
        description="Gestiona reservas de alojamiento separadas de eventos y espacios sociales."
        actions={<Button icon={Plus} onClick={() => { setEditingId(null); setForm(emptyForm); setClientQuery(""); setShowForm(true); }}>Nueva reserva</Button>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <MiniKpi label="Hoy" value={counters.today} />
        <MiniKpi label="Proximas" value={counters.upcoming} />
        <MiniKpi label="Pendientes" value={counters.pending} tone="gold" />
        <MiniKpi label="Confirmadas" value={counters.confirmed} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative block xl:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={17} />
            <input className="h-10 w-full rounded-input border border-park-border bg-white pl-10 pr-3 text-sm outline-none focus:border-park-green focus:ring-2 focus:ring-park-green/15" placeholder="Buscar por DNI, cliente, codigo o habitacion" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ["TODAS", "Todas"],
              ["HOY", "Hoy"],
              ["PROXIMAS", "Proximas"],
              ["PENDIENTES", "Pendientes"],
              ["CONFIRMADAS", "Confirmadas"],
              ["HOSPEDADOS", "Hospedados"],
              ["FINALIZADAS", "Finalizadas"],
              ["CANCELADAS", "Canceladas"]
            ].map(([value, label]) => (
              <button className={`rounded-button px-3 py-2 text-sm font-semibold ${filter === value ? "bg-park-green text-white" : "bg-park-bg text-park-muted hover:text-park-black"}`} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
            ))}
          </div>
        </div>
      </section>

      {showForm ? (
        <div className="fixed inset-0 z-40 bg-slate-950/30 p-4">
          <aside className="ml-auto h-full max-w-5xl overflow-auto rounded-card bg-white p-5 shadow-drawer">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-park-gold">Reserva</p>
                <h2 className="font-display text-xl font-semibold text-park-dark">{editingId ? "Editar reserva" : "Nueva reserva"}</h2>
              </div>
              <Button icon={X} onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setClientQuery(""); }} size="sm" variant="ghost">Cerrar</Button>
            </div>
        <form className="mt-5 space-y-5" onSubmit={submit}>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

          <FormBlock title="Cliente" icon={<Search size={18} />}>
            <div className="relative md:col-span-2">
              <Label text="Cliente" />
              <input
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-park-green focus:outline-none"
                value={clientQuery}
                onChange={(event) => {
                  setClientQuery(event.target.value);
                  setForm({ ...form, clientId: "", clientLabel: "" });
                }}
                placeholder="Buscar por nombre, apellido o DNI"
                required
              />
              {clientOptions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-soft">
                  {clientOptions.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-park-light"
                      onClick={() => {
                        const label = `${client.firstName} ${client.lastName} - ${client.documentNumber}`;
                        setClientQuery(label);
                        setClientOptions([]);
                        setForm({ ...form, clientId: client.id, clientLabel: label });
                      }}
                    >
                      <span className="block font-black text-park-text">{client.firstName} {client.lastName}</span>
                      <span className="text-xs text-park-muted">DNI {client.documentNumber} · {client.phone || "Sin telefono"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FormBlock>

          <FormBlock title="Reserva" icon={<CalendarCheck size={18} />}>
            <Select label="Habitacion" value={form.roomId} onChange={(roomId) => setForm({ ...form, roomId })} required>
              <option value="">Seleccionar habitacion</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.number} - {room.type?.name} · Cap. {room.capacity} · S/ {Number(room.price).toFixed(2)} · {room.status}
                </option>
              ))}
            </Select>
            <Input label="Fecha entrada" type="date" value={form.checkInDate} onChange={(checkInDate) => setForm({ ...form, checkInDate, checkOutDate: form.checkOutDate && form.checkOutDate > checkInDate ? form.checkOutDate : "" })} />
            <Input label="Fecha salida" type="date" min={form.checkInDate ? new Date(new Date(`${form.checkInDate}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : undefined} value={form.checkOutDate} onChange={(checkOutDate) => setForm({ ...form, checkOutDate })} />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="block text-xs font-black uppercase text-park-muted">Disponibilidad</span>
              <span className={`font-black ${availability?.available === false ? "text-red-700" : "text-park-green"}`}>
                {availability ? (availability.available ? "Disponible" : "No disponible") : "Pendiente de fechas"}
              </span>
            </div>
          </FormBlock>

          <FormBlock title="Ocupacion">
            <Input label="Adultos" type="number" min="1" value={form.adults} onChange={(adults) => setForm({ ...form, adults })} />
            <Input label="Ninos" type="number" min="0" value={form.children} onChange={(children) => setForm({ ...form, children })} />
            <Input label="Noches" type="number" value={nights} readOnly />
          </FormBlock>

          <FormBlock title="Pago">
            <Input label="Precio total" type="number" min="0" step="0.01" value={form.totalPrice} onChange={(totalPrice) => setForm({ ...form, totalPrice })} />
            <Input label="Adelanto" type="number" min="0" step="0.01" value={form.advance} onChange={(advance) => setForm({ ...form, advance })} />
            <Input label="Saldo calculado" type="number" value={balance.toFixed(2)} readOnly />
            <Select label="Metodo de pago" value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="YAPE">Yape</option>
              <option value="PLIN">Plin</option>
            </Select>
            <div className="md:col-span-2">
              <Label text="Observaciones" />
              <textarea
                className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-park-green focus:outline-none"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Notas internas de la reserva"
              />
            </div>
          </FormBlock>

          <div className="flex justify-end gap-2">
            {editingId && (
              <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-black" onClick={() => { setEditingId(null); setForm(emptyForm); setClientQuery(""); setShowForm(false); }}>
                Cancelar edicion
              </button>
            )}
            <button className="rounded-lg bg-park-green px-5 py-2 text-sm font-black text-white" type="submit">
              {editingId ? "Actualizar reserva" : "Registrar reserva"}
            </button>
          </div>
        </form>
          </aside>
        </div>
      ) : null}

      <Table columns={["Reserva", "Cliente", "Estadia", "Importes", "Estado", "Acciones"]} rows={filteredReservations} renderRow={(reservation) => (
        <tr key={reservation.id}>
          <td className="px-4 py-3">
            <p className="font-black text-park-black">{reservation.code}</p>
            <p className="text-xs font-semibold text-park-muted">{getNights(toInputDate(reservation.checkInDate), toInputDate(reservation.checkOutDate))} noches</p>
          </td>
          <td className="px-4 py-3">
            <p className="font-semibold text-park-black">{reservation.client.firstName} {reservation.client.lastName}</p>
            <p className="text-xs font-semibold text-park-muted">DNI: {reservation.client.documentNumber}</p>
          </td>
          <td className="px-4 py-3">
            <p className="font-black text-park-black">Hab. {reservation.room.number}</p>
            <p className="text-xs font-semibold text-park-muted">{formatDate(reservation.checkInDate)} - {formatDate(reservation.checkOutDate)}</p>
          </td>
          <td className="px-4 py-3">
            <p className="font-semibold text-park-black">Total S/ {Number(reservation.totalPrice).toFixed(2)}</p>
            <p className="text-xs font-black text-park-green">Saldo S/ {Number(reservation.balance).toFixed(2)}</p>
          </td>
          <td className="px-4 py-3"><StatusBadge value={reservation.status} /></td>
          <td className="px-4 py-3">
            <div className="flex gap-1">
              <Action title="Ver" onClick={() => setSelected(reservation)} icon={<Eye size={15} />} />
              <Action title="Editar" onClick={() => editReservation(reservation)} icon={<Pencil size={15} />} />
              <Action title="Cancelar" disabled={reservation.status === "CANCELADA"} onClick={() => setPendingCancel(reservation)} icon={<Trash2 size={15} />} danger />
            </div>
          </td>
        </tr>
      )} />
      {selected ? <ReservationDetail reservation={selected} onClose={() => setSelected(null)} /> : null}
      {pendingCancel ? (
        <ConfirmDialog
          title="Cancelar reserva"
          description={`Se cancelara la reserva ${pendingCancel.code}. Esta accion actualizara la disponibilidad de la habitacion.`}
          confirmLabel="Cancelar reserva"
          onCancel={() => setPendingCancel(null)}
          onConfirm={cancelReservation}
        />
      ) : null}
    </div>
  );
}

function FormBlock({ title, icon, children }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-black uppercase text-park-green">
        {icon}{title}
      </legend>
      <div className="grid gap-3 md:grid-cols-4">{children}</div>
    </fieldset>
  );
}

function Label({ text }) {
  return <label className="mb-1 block text-xs font-black uppercase text-park-muted">{text}</label>;
}

function Input({ label, value, onChange, type, readOnly, ...props }) {
  return (
    <div>
      <Label text={label} />
      <input className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-park-green focus:outline-none disabled:bg-slate-50" type={type} value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} required={!readOnly} {...props} />
    </div>
  );
}

function Select({ label, value, onChange, children, required = true }) {
  return (
    <div>
      <Label text={label} />
      <select className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-park-green focus:outline-none" value={value} onChange={(event) => onChange(event.target.value)} required={required}>
        {children}
      </select>
    </div>
  );
}

function Action({ title, icon, onClick, danger, disabled }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-lg border text-sm disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "border-red-100 text-red-600 hover:bg-red-50" : "border-slate-200 text-park-green hover:bg-park-light"}`}>
      {icon}
    </button>
  );
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-drawer">
        <h3 className="font-display text-xl font-semibold text-park-dark">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-park-muted">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Volver</Button>
          <Button type="button" variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function ReservationDetail({ reservation, onClose }) {
  const client = reservation.client || {};
  const clientName = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Cliente sin nombre";
  const initials = [client.firstName, client.lastName].filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "CL";
  const documentLabel = client.documentNumber ? `DNI ${client.documentNumber}` : "Documento no registrado";

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 p-4">
      <aside className="ml-auto h-full max-w-lg overflow-auto rounded-panel bg-white p-5 shadow-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-park-gold">Reserva</p>
            <h3 className="font-sans text-lg font-semibold text-park-black">{reservation.code}</h3>
          </div>
          <Button onClick={onClose} size="sm" variant="secondary">Cerrar</Button>
        </div>
        <section className="mt-5 rounded-card border border-park-green/20 bg-park-green-soft/40 p-4">
          <p className="text-xs font-black uppercase text-park-green">Cliente</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-lg font-black text-park-green shadow-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <h4 className="truncate text-xl font-black text-park-black">{clientName}</h4>
              <span className="mt-1 inline-flex rounded-button bg-white px-2.5 py-1 text-xs font-black text-park-green">{documentLabel}</span>
            </div>
          </div>
          <div className="mt-4 grid overflow-hidden rounded-card border border-park-border bg-white md:grid-cols-2">
            <ClientInfo icon={Phone} label="Telefono" value={client.phone} />
            <ClientInfo icon={Mail} label="Correo" value={client.email} />
          </div>
          <div className="mt-3 rounded-card border border-park-border bg-white p-3">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 shrink-0 text-park-green" size={17} />
              <div>
                <p className="text-xs font-bold text-park-muted">Direccion</p>
                <p className="mt-1 font-semibold text-park-black">{client.address || "No registrado"}</p>
              </div>
            </div>
          </div>
        </section>
        <dl className="mt-5 grid gap-3 text-sm">
          <DetailRow label="Habitacion" value={reservation.room.number} />
          <DetailRow label="Entrada" value={formatDate(reservation.checkInDate)} />
          <DetailRow label="Salida" value={formatDate(reservation.checkOutDate)} />
          <DetailRow label="Noches" value={getNights(toInputDate(reservation.checkInDate), toInputDate(reservation.checkOutDate))} />
          <DetailRow label="Total" value={`S/ ${Number(reservation.totalPrice).toFixed(2)}`} />
          <DetailRow label="Adelanto" value={`S/ ${Number(reservation.advance).toFixed(2)}`} />
          <DetailRow label="Saldo" value={`S/ ${Number(reservation.balance).toFixed(2)}`} />
        </dl>
        <div className="mt-4"><StatusBadge value={reservation.status} /></div>
      </aside>
    </div>
  );
}

function ClientInfo({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3 border-b border-park-border p-3 md:border-b-0 md:border-r md:last:border-r-0">
      <Icon className="mt-0.5 shrink-0 text-park-green" size={17} />
      <div className="min-w-0">
        <p className="text-xs font-bold text-park-muted">{label}</p>
        <p className="mt-1 break-words font-semibold text-park-black">{value || "No registrado"}</p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return <div className="rounded-card bg-park-bg p-3"><dt className="text-xs font-bold uppercase text-park-muted">{label}</dt><dd className="mt-1 font-semibold text-park-black">{value || "-"}</dd></div>;
}

function MiniKpi({ label, value, tone = "green" }) {
  const toneClass = tone === "gold" ? "bg-park-gold-soft text-park-gold" : "bg-park-green-soft text-park-green";
  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <p className="text-sm font-semibold text-park-muted">{label}</p>
      <strong className={`mt-2 block font-display text-[28px] font-semibold ${toneClass} w-fit rounded-card px-3 py-1`}>{value || 0}</strong>
    </article>
  );
}

function getNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const nights = Math.round((end - start) / 86400000);
  return nights > 0 ? nights : 0;
}

function toInputDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toISOString().slice(0, 10);
}
