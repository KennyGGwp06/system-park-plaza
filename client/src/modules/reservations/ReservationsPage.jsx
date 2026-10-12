import { useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarCheck, Eye, Mail, MapPin, Pencil, Phone, Plus, QrCode, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useLocation } from "react-router-dom";
import { currentHotelDateKey, formatHotelDate as formatDate, hotelDateKey } from "../../utils/hotelDate";
import { openClientAccessPage } from "../admin/clientAccessNavigation";
import { Columns, COLORS, Empty, fmt, OccupancyChart, StackedBar, TipLayer, useTip } from "../admin/OwnerCharts";
import "../admin/OwnerHome.css";
import "../admin/ReservationsOverview.css";
import "./ReservationsPage.css";

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
  requestedPaymentMethod: "",
  notes: ""
};

const STATUS_META = {
  PENDIENTE: ["warn", "Pendiente"], PENDIENTE_CAJA: ["warn", "Pendiente en caja"], PENDIENTE_PAGO: ["warn", "Pendiente de pago"],
  RESERVADA: ["warn", "Reservada"], CONFIRMADA: ["ok", "Confirmada"], CHECKED_IN: ["info", "Hospedado"],
  COMPLETADA: ["off", "Finalizada"], CANCELADA: ["bad", "Cancelada"], NO_SHOW: ["bad", "No show"]
};
function StatusPill({ value }) { const [tone, label] = STATUS_META[value] || ["off", String(value || "Pendiente").replaceAll("_", " ")]; return <span className={`ro-pill ro-pill--${tone}`}>{label}</span>; }

function addDays(dateKey, amount) { const date = new Date(`${dateKey}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function Card({ title, sub, legend, children }) { return <section className="oh-card"><div className="oh-ch"><h2>{title}</h2>{legend ? <div className="oh-leg">{legend}</div> : null}</div>{sub ? <div className="oh-ch2">{sub}</div> : null}<div className="oh-body">{children}</div></section>; }

export function ReservationsPage({ superAdmin = false }) {
  const location = useLocation();
  const tip = useTip();
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
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
  const totalPrice = Math.max(0, Number(form.totalPrice || 0));
  const advanceAmount = Math.max(0, Number(form.advance || 0));
  const balance = Math.max(0, totalPrice - advanceAmount);
  const halfPayment = totalPrice / 2;
  const paymentPercent = totalPrice > 0 ? Math.min(100, Math.round((advanceAmount / totalPrice) * 100)) : 0;
  const cashWebReservation = Boolean(editingId && form.requestedPaymentMethod === "CAJA HOTEL");

  const filteredReservations = useMemo(() => (reservations || []).filter((reservation) => {
    const text = `${reservation.code} ${reservation.client?.firstName} ${reservation.client?.lastName} ${reservation.client?.documentNumber} ${reservation.room?.number}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesFilter =
      filter === "TODAS" ||
      (filter === "HOY" && hotelDateKey(reservation.checkInDate) === currentHotelDateKey()) ||
      (filter === "PROXIMAS" && hotelDateKey(reservation.checkInDate) > currentHotelDateKey()) ||
      (filter === "PENDIENTES" && ["PENDIENTE", "PENDIENTE_CAJA", "PENDIENTE_PAGO"].includes(reservation.status)) ||
      (filter === "CONFIRMADAS" && reservation.status === "CONFIRMADA") ||
      (filter === "HOSPEDADOS" && reservation.status === "CHECKED_IN") ||
      (filter === "FINALIZADAS" && reservation.status === "COMPLETADA") ||
      (filter === "CANCELADAS" && ["CANCELADA", "NO_SHOW"].includes(reservation.status));
    return matchesSearch && matchesFilter;
  }), [reservations, search, filter]);

  useEffect(() => { setPage(1); }, [search, filter]);
  const pages = Math.max(1, Math.ceil(filteredReservations.length / pageSize));
  const pageRows = filteredReservations.slice((page - 1) * pageSize, page * pageSize);

  const counters = useMemo(() => ({
    today: (reservations || []).filter((reservation) => hotelDateKey(reservation.checkInDate) === currentHotelDateKey()).length,
    departures: (reservations || []).filter((reservation) => hotelDateKey(reservation.checkOutDate) === currentHotelDateKey()).length,
    hosted: (reservations || []).filter((reservation) => reservation.status === "CHECKED_IN").length,
    balance: (reservations || []).filter((reservation) => !["CANCELADA", "COMPLETADA"].includes(reservation.status)).reduce((sum, reservation) => sum + Number(reservation.balance || 0), 0),
    pending: (reservations || []).filter((reservation) => ["PENDIENTE", "PENDIENTE_CAJA", "PENDIENTE_PAGO"].includes(reservation.status)).length
  }), [reservations]);

  const occupancyData = useMemo(() => {
    const today = currentHotelDateKey();
    const capacity = rooms.length || 1;
    return Array.from({ length: 14 }, (_, index) => {
      const date = addDays(today, index - 13);
      const occupied = (reservations || []).filter((reservation) => {
        if (["CANCELADA", "NO_SHOW"].includes(reservation.status)) return false;
        const checkIn = toInputDate(reservation.checkInDate), checkOut = toInputDate(reservation.checkOutDate);
        return checkIn && checkOut && checkIn <= date && date < checkOut;
      }).length;
      return { date, percent: Math.min(100, Math.round((occupied / capacity) * 100)) };
    });
  }, [reservations, rooms]);

  const arrivalsNext7 = useMemo(() => {
    const today = currentHotelDateKey();
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index);
      const count = (reservations || []).filter((reservation) => !["CANCELADA", "NO_SHOW"].includes(reservation.status) && toInputDate(reservation.checkInDate) === date).length;
      const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
      return { count, label };
    });
  }, [reservations]);

  const statusSegments = useMemo(() => {
    const groups = { CONFIRMADA: 0, PENDIENTE: 0, CHECKED_IN: 0, COMPLETADA: 0, CANCELADA: 0 };
    (reservations || []).forEach((reservation) => {
      if (reservation.status === "CONFIRMADA") groups.CONFIRMADA += 1;
      else if (["PENDIENTE", "PENDIENTE_CAJA", "PENDIENTE_PAGO", "RESERVADA"].includes(reservation.status)) groups.PENDIENTE += 1;
      else if (reservation.status === "CHECKED_IN") groups.CHECKED_IN += 1;
      else if (reservation.status === "COMPLETADA") groups.COMPLETADA += 1;
      else if (["CANCELADA", "NO_SHOW"].includes(reservation.status)) groups.CANCELADA += 1;
    });
    return groups;
  }, [reservations]);

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

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
        setAvailability(await api(`/rooms/${form.roomId}/check-availability?checkIn=${form.checkInDate}&checkOut=${form.checkOutDate}${editingId ? `&excludeReservationId=${editingId}` : ""}`));
      } catch (err) {
        setAvailability({ available: false, message: err.message });
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [form.roomId, form.checkInDate, form.checkOutDate, nights, editingId]);

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
      status: Number(form.advance) >= Number(form.totalPrice) ? "CONFIRMADA" : Number(form.advance) > 0 ? "RESERVADA" : form.requestedPaymentMethod === "CAJA HOTEL" ? "PENDIENTE_CAJA" : "PENDIENTE",
      notes: form.notes
    };

    try {
      if (editingId) {
        await api(`/reservations/${editingId}`, { method: "PUT", body: payload });
        notify("Reserva actualizada correctamente.");
      } else {
        await api("/reservations", { method: "POST", body: payload });
        notify("Reserva creada correctamente.");
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
    notify("Reserva cancelada.");
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
      paymentMethod: reservation.paymentMethod === "CAJA HOTEL" ? "EFECTIVO" : reservation.paymentMethod || "EFECTIVO",
      requestedPaymentMethod: reservation.paymentMethod || "",
      notes: reservation.notes || ""
    });
    setShowForm(true);
  }

  if (loading) return <main className="oh"><LoadingSpinner label="Cargando la agenda de hospedaje..." /></main>;

  return <main className="oh">
    <TipLayer tip={tip.tip} />
    {toast ? <div className="ro-toast"><ShieldCheck size={16} />{toast}</div> : null}

    <div className="oh-ph"><div><h1>Hospedaje</h1><p>Reservas, llegadas, estadías y habitaciones desde un solo flujo.</p></div>
      <div className="oh-tools">
        <button type="button" className="oh-btn" onClick={() => openClientAccessPage("llegadas", "/checkin")}><QrCode size={16} />Ir a llegadas</button>
        <button type="button" className="oh-btn p" onClick={() => { setEditingId(null); setForm(emptyForm); setClientQuery(""); setShowForm(true); }}><Plus size={16} />Nueva reserva</button>
      </div>
    </div>

    <section className="oh-card oh-kpis">
      <div className="k"><div className="l">Llegan hoy</div><div className="v">{fmt(counters.today)}</div><div className="d">reservas programadas</div></div>
      <div className="k"><div className="l">Salen hoy</div><div className="v">{fmt(counters.departures)}</div><div className="d">check-outs programados</div></div>
      <div className="k"><div className="l">Hospedados</div><div className="v">{fmt(counters.hosted)}</div><div className="d">huéspedes en casa</div></div>
      <div className="k"><div className="l">Pendientes</div><div className="v" style={{ color: "#8A5A12" }}>{fmt(counters.pending)}</div><div className="d">por confirmar o cobrar</div></div>
      <div className="k"><div className="l">Por cobrar</div><div className="v" style={{ color: "var(--red)" }}>{money(counters.balance)}</div><div className="d">saldos pendientes</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Ocupación de las últimas 2 semanas" sub={`${rooms.length} habitaciones activas`}>
        <OccupancyChart data={occupancyData} tip={tip} />
      </Card>
      <Card title="Estado de las reservas" sub={`${(reservations || []).length} reservas en total`}>
        <StackedBar tip={tip} label="Reservas" legendValue="count" segments={[
          { name: "Confirmadas", value: statusSegments.CONFIRMADA, color: COLORS.blue },
          { name: "Hospedados", value: statusSegments.CHECKED_IN, color: COLORS.deep },
          { name: "Pendientes", value: statusSegments.PENDIENTE, color: COLORS.mid, text: COLORS.ink },
          { name: "Finalizadas", value: statusSegments.COMPLETADA, color: COLORS.gray, text: COLORS.ink },
          { name: "Canceladas", value: statusSegments.CANCELADA, color: COLORS.red }
        ]} />
        <div className="oh-sub2">Llegadas · próximos 7 días</div>
        <Columns values={arrivalsNext7.map((row) => row.count)} labels={arrivalsNext7.map((row) => row.label)} name="Llegadas" tip={tip} w={360} h={140} />
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Agenda de hospedaje</h2><small>{filteredReservations.length} resultado(s)</small></div>
      <div className="ro-fbar">
        <div className="ro-sbox"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por DNI, cliente, código o habitación" /></div>
        <div className="ro-chips">
          {[["TODAS", "Todas"], ["HOY", "Hoy"], ["PROXIMAS", "Próximas"], ["PENDIENTES", "Pendientes"], ["CONFIRMADAS", "Confirmadas"], ["HOSPEDADOS", "Hospedados"], ["FINALIZADAS", "Finalizadas"], ["CANCELADAS", "Canceladas"]].map(([value, label]) => (
            <button className={filter === value ? "on" : ""} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
          ))}
        </div>
      </div>

      {!pageRows.length ? <Empty title="No hay reservas con estos filtros" text="Cambia la búsqueda o el filtro seleccionado." /> : <table className="ro-table"><thead><tr><th>Reserva y cliente</th><th>Habitación</th><th>Estadía</th><th>Importes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {pageRows.map((reservation) => <tr key={reservation.id}>
          <td><strong>{reservation.code}</strong><small className="ro-mut">{reservation.client.firstName} {reservation.client.lastName}</small></td>
          <td><span className="ro-svc"><BedDouble size={14} />Hab. {reservation.room.number}</span></td>
          <td><strong>{formatDate(reservation.checkInDate)} – {formatDate(reservation.checkOutDate)}</strong><small className="ro-mut">{getNights(toInputDate(reservation.checkInDate), toInputDate(reservation.checkOutDate))} noches</small></td>
          <td><strong>{money(reservation.totalPrice)}</strong>{Number(reservation.balance) > 0 ? <small className="ro-neg">Saldo {money(reservation.balance)}</small> : <small className="ro-mut">Pagado</small>}</td>
          <td><StatusPill value={reservation.status} /></td>
          <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="ro-act" onClick={() => setSelected(reservation)}><Eye size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Ver</button>
            <button type="button" className="ro-act" onClick={() => editReservation(reservation)}><Pencil size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Editar</button>
            <button type="button" className="ro-act" style={{ color: "var(--red)" }} disabled={reservation.status === "CANCELADA"} onClick={() => setPendingCancel(reservation)}><Trash2 size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Cancelar</button>
          </div></td>
        </tr>)}
      </tbody></table>}
      <div className="pager"><span>Mostrando {pageRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredReservations.length)} de {filteredReservations.length}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="pb on">{page}</span><span>de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
    </section>

    {showForm ? <>
      <div className="ro-scrim" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setClientQuery(""); }} role="presentation" />
      <aside className="ro-drawer" style={{ width: 520 }} role="dialog" aria-modal="true" aria-label={editingId ? "Editar reserva" : "Nueva reserva"}>
        <div className="dh"><div><small>RESERVA</small><h2>{editingId ? "Editar reserva" : "Nueva reserva"}</h2></div><button type="button" aria-label="Cerrar" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setClientQuery(""); }}><X size={16} /></button></div>
        <form className="db" onSubmit={submit}>
          {error ? <div className="ro-error" style={{ marginBottom: 12 }}>{error}</div> : null}

          <fieldset className="hp-fieldset"><legend><Search size={13} />Cliente</legend>
            <div className="hp-field">
              <label>Cliente</label>
              <input value={clientQuery} onChange={(event) => { setClientQuery(event.target.value); setForm({ ...form, clientId: "", clientLabel: "" }); }} placeholder="Buscar por nombre, apellido o DNI" required />
              {clientOptions.length > 0 ? <div className="hp-drop">{clientOptions.map((client) => <button key={client.id} type="button" onClick={() => { const label = `${client.firstName} ${client.lastName} - ${client.documentNumber}`; setClientQuery(label); setClientOptions([]); setForm({ ...form, clientId: client.id, clientLabel: label }); }}><b>{client.firstName} {client.lastName}</b><small>DNI {client.documentNumber} · {client.phone || "Sin teléfono"}</small></button>)}</div> : null}
            </div>
          </fieldset>

          <fieldset className="hp-fieldset"><legend><CalendarCheck size={13} />Reserva</legend>
            <div className="hp-grid">
              <div className="hp-field hp-span2"><label>Habitación</label><select value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })} required>
                <option value="">Seleccionar habitación</option>
                {rooms.map((room) => <option key={room.id} value={room.id}>{room.number} · {room.type?.name} · Cap. {room.capacity} · S/ {Number(room.price).toFixed(2)} · {room.status}</option>)}
              </select></div>
              <div className="hp-field"><label>Fecha entrada</label><input type="date" value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value, checkOutDate: form.checkOutDate && form.checkOutDate > event.target.value ? form.checkOutDate : "" })} required /></div>
              <div className="hp-field"><label>Fecha salida</label><input type="date" min={form.checkInDate ? addDays(form.checkInDate, 1) : undefined} value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })} required /></div>
              <div className={`hp-avail hp-span4 ${availability?.available === false ? "bad" : "ok"}`}><small>Disponibilidad</small><b>{availability ? (availability.available ? (editingId ? "Asignada a esta reserva" : "Disponible") : "No disponible") : "Pendiente de fechas"}</b></div>
            </div>
          </fieldset>

          <fieldset className="hp-fieldset"><legend>Ocupación</legend>
            <div className="hp-grid">
              <div className="hp-field"><label>Adultos</label><input type="number" min="1" value={form.adults} onChange={(event) => setForm({ ...form, adults: event.target.value })} required /></div>
              <div className="hp-field"><label>Niños</label><input type="number" min="0" value={form.children} onChange={(event) => setForm({ ...form, children: event.target.value })} required /></div>
              <div className="hp-field"><label>Noches</label><input type="number" value={nights} readOnly /></div>
            </div>
          </fieldset>

          <fieldset className="hp-fieldset"><legend>Pago</legend>
            <div className="hp-payguide">
              <div><strong>{cashWebReservation ? "Cobra el pago completo solicitado en Caja" : "Define cuánto paga el cliente hoy"}</strong>
                <p>{cashWebReservation ? `El cliente reservó desde la web sin pagar. Al llegar debe cancelar el total de ${money(totalPrice)} antes del check-in.` : "Puedes registrar el 50 % ahora; el saldo queda visible para cobrarlo después."}</p></div>
              <div className="acts">
                {!cashWebReservation ? <button type="button" disabled={totalPrice <= 0} onClick={() => setForm({ ...form, advance: halfPayment.toFixed(2) })}>Registrar 50 %<span>{money(halfPayment)}</span></button> : null}
                <button type="button" disabled={totalPrice <= 0} onClick={() => setForm({ ...form, advance: totalPrice.toFixed(2) })}>{cashWebReservation ? "Registrar pago total" : "Pago completo"}<span>{money(totalPrice)}</span></button>
              </div>
            </div>
            <div className="hp-grid">
              <div className="hp-field"><label>Precio total de la estadía</label><div className="hp-money"><span>S/</span><input inputMode="decimal" min="0" step="0.01" type="number" value={form.totalPrice} onChange={(event) => setForm({ ...form, totalPrice: event.target.value })} required /></div></div>
              <div className="hp-field"><label>Pago recibido hoy</label><div className="hp-money"><span>S/</span><input inputMode="decimal" min="0" step="0.01" type="number" value={form.advance} onChange={(event) => setForm({ ...form, advance: event.target.value })} required /></div></div>
              <div className="hp-field"><label>Método del pago recibido</label><select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                <option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="YAPE">Yape</option><option value="PLIN">Plin</option>
              </select></div>
              <div className="hp-balance"><small>Saldo después de este pago</small><strong>{money(balance)}</strong><span>{totalPrice <= 0 ? "Ingresa el total" : advanceAmount >= totalPrice ? "Pago completo" : `${paymentPercent}% registrado`}</span></div>
              <div className={`hp-note hp-span4 ${totalPrice > 0 && advanceAmount >= halfPayment ? "ready" : ""}`}>{totalPrice <= 0 ? "Primero completa habitación y fechas para calcular el total." : advanceAmount >= totalPrice ? "La reserva quedará pagada por completo." : cashWebReservation ? `Pendiente de Caja: todavía deben cobrarse ${money(totalPrice)} completos.` : advanceAmount >= halfPayment ? `Adelanto suficiente: se registrará ${paymentPercent}% y quedará ${money(balance)} pendiente.` : `Para llegar al 50 % faltan ${money(Math.max(0, halfPayment - advanceAmount))}.`}</div>
              <div className="hp-field hp-span4"><label>Observaciones</label><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notas internas de la reserva" /></div>
            </div>
          </fieldset>

          <div className="hp-form-actions">
            <button type="button" className="ro-dbtn" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setClientQuery(""); }}>Cancelar</button>
            <button type="submit" className="ro-dbtn p">{editingId ? "Guardar cambios" : advanceAmount > 0 ? "Crear reserva y registrar pago" : "Crear reserva pendiente de pago"}</button>
          </div>
        </form>
      </aside>
    </> : null}

    {selected ? <ReservationDetail reservation={selected} onClose={() => setSelected(null)} /> : null}
    {pendingCancel ? <ConfirmDialog title="Cancelar reserva" description={`Se cancelará la reserva ${pendingCancel.code}. Esta acción actualizará la disponibilidad de la habitación.`} confirmLabel="Cancelar reserva" onCancel={() => setPendingCancel(null)} onConfirm={cancelReservation} /> : null}
  </main>;
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }) {
  return <>
    <div className="ro-scrim" onClick={onCancel} role="presentation" />
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 41, pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: "min(420px, 90vw)", background: "#fff", borderRadius: 8, border: "1px solid var(--line)", padding: 20, boxShadow: "0 12px 32px rgba(11,16,32,.18)" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{title}</h3>
        <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{description}</p>
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ro-dbtn" onClick={onCancel}>Volver</button>
          <button type="button" className="ro-dbtn r" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  </>;
}

function ReservationDetail({ reservation, onClose }) {
  const client = reservation.client || {};
  const clientName = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Cliente sin nombre";
  const initials = [client.firstName, client.lastName].filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "CL";
  const documentLabel = client.documentNumber ? `DNI ${client.documentNumber}` : "Documento no registrado";

  return <>
    <div className="ro-scrim" onClick={onClose} role="presentation" />
    <aside className="ro-drawer" role="dialog" aria-modal="true" aria-label={`Detalle ${reservation.code}`}>
      <div className="dh"><div><small>HOSPEDAJE · {reservation.code}</small><h2>{clientName}</h2></div><button type="button" aria-label="Cerrar" onClick={onClose}><X size={16} /></button></div>
      <div className="db">
        <div className="hp-profile">
          <div className="hp-avatar">{initials}</div>
          <div><h4>{clientName}</h4><span className="ro-pill ro-pill--info tag">{documentLabel}</span></div>
        </div>
        <h3>Contacto</h3>
        <div className="ro-dl">
          <div><span><Phone size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Teléfono</span><b>{client.phone || "No registrado"}</b></div>
          <div><span><Mail size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Correo</span><b>{client.email || "No registrado"}</b></div>
          <div><span><MapPin size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Dirección</span><b>{client.address || "No registrado"}</b></div>
        </div>
        <h3>Reserva</h3>
        <div className="ro-dl">
          <div><span>Habitación</span><b>{reservation.room.number}</b></div>
          <div><span>Entrada</span><b>{formatDate(reservation.checkInDate)}</b></div>
          <div><span>Salida</span><b>{formatDate(reservation.checkOutDate)}</b></div>
          <div><span>Noches</span><b>{getNights(toInputDate(reservation.checkInDate), toInputDate(reservation.checkOutDate))}</b></div>
        </div>
        <h3>Pago</h3>
        <div className="ro-dl">
          <div><span>Total</span><b>{money(reservation.totalPrice)}</b></div>
          <div><span>Adelanto</span><b>{money(reservation.advance)}</b></div>
          <div><span>Saldo</span><b>{money(reservation.balance)}</b></div>
        </div>
        <h3>Estado</h3>
        <StatusPill value={reservation.status} />
      </div>
    </aside>
  </>;
}

function money(value) { return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

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
