import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Eye, Pencil, Search, XCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Table } from "../../components/Table";
import { Toast } from "../../components/Toast";
import { Button, Input as UiInput, PageHeader, Select as UiSelect, Tabs } from "../../components/ui";

const emptyEvent = {
  clientId: "",
  clientLabel: "",
  name: "",
  type: "Social",
  spaceId: "",
  date: "",
  startTime: "18:00",
  endTime: "22:00",
  guests: 20,
  price: 0,
  advance: 0,
  status: "RESERVADO",
  notes: ""
};

const eventColors = {
  CONFIRMADO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  RESERVADO: "bg-sky-100 text-sky-800 border-sky-200",
  COTIZACION: "bg-amber-100 text-amber-800 border-amber-200",
  CANCELADO: "bg-red-100 text-red-800 border-red-200",
  FINALIZADO: "bg-slate-100 text-slate-700 border-slate-200"
};

export function EventsPage() {
  const location = useLocation();
  const isCalendar = location.pathname.includes("calendario");
  const { data: events, loading, reload } = useFetch("/events", { initialData: [] });
  const { data: spaces } = useFetch("/events/spaces", { initialData: [] });
  const [mode, setMode] = useState(isCalendar ? "CALENDARIO" : "LISTA");
  const [view, setView] = useState("MES");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [form, setForm] = useState(emptyEvent);
  const [clientQuery, setClientQuery] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [payment, setPayment] = useState({ eventId: "", amount: "", method: "EFECTIVO", reference: "" });
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientQuery.trim() || clientQuery === form.clientLabel) return setClientOptions([]);
    const timeout = setTimeout(async () => {
      setClientOptions(await api(`/clients/search?q=${encodeURIComponent(clientQuery)}`).catch(() => []));
    }, 250);
    return () => clearTimeout(timeout);
  }, [clientQuery, form.clientLabel]);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return (events || []).filter((event) => {
      const text = `${event.code} ${event.name} ${event.type} ${event.client?.firstName} ${event.client?.lastName} ${event.client?.documentNumber}`.toLowerCase();
      return (!needle || text.includes(needle)) &&
        (!status || event.status === status) &&
        (!spaceId || String(event.spaceId) === String(spaceId)) &&
        (!date || event.startsAt?.slice(0, 10) === date);
    });
  }, [events, search, status, spaceId, date]);

  const summary = useMemo(() => eventSummary(events || []), [events]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.clientId) return setError("Selecciona un cliente existente.");
    if (form.endTime <= form.startTime) return setError("La hora final debe ser mayor a la hora inicial.");

    const payload = {
      clientId: Number(form.clientId),
      name: form.name,
      type: form.type,
      spaceId: Number(form.spaceId),
      startsAt: `${form.date}T${form.startTime}:00`,
      endsAt: `${form.date}T${form.endTime}:00`,
      guests: Number(form.guests),
      price: Number(form.price),
      advance: Number(form.advance),
      status: form.status,
      notes: form.notes
    };

    try {
      if (editingId) {
        await api(`/events/${editingId}`, { method: "PUT", body: payload });
        setToast("Evento actualizado.");
      } else {
        await api("/events", { method: "POST", body: payload });
        setToast("Reserva de evento creada.");
      }
      resetForm();
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelEvent() {
    if (!pendingCancel) return;
    await api(`/events/${pendingCancel.id}/status`, { method: "PATCH", body: { status: "CANCELADO" } });
    setToast("Evento cancelado.");
    setPendingCancel(null);
    reload();
  }

  async function registerPayment(event) {
    event.preventDefault();
    await api(`/events/${payment.eventId}/payments`, { method: "POST", body: payment });
    setToast("Pago registrado en eventos y caja.");
    setPayment({ eventId: "", amount: "", method: "EFECTIVO", reference: "" });
    reload();
  }

  function editEvent(event) {
    const label = `${event.client.firstName} ${event.client.lastName} - ${event.client.documentNumber}`;
    setEditingId(event.id);
    setClientQuery(label);
    setForm({
      clientId: event.clientId,
      clientLabel: label,
      name: event.name,
      type: event.type,
      spaceId: event.spaceId,
      date: event.startsAt.slice(0, 10),
      startTime: event.startsAt.slice(11, 16),
      endTime: event.endsAt.slice(11, 16),
      guests: event.guests,
      price: Number(event.price),
      advance: Number(event.advance),
      status: event.status,
      notes: event.notes || ""
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm(emptyEvent);
    setClientQuery("");
    setClientOptions([]);
    setEditingId(null);
    setShowForm(false);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow="Eventos"
        title={mode === "CALENDARIO" ? "Calendario de eventos" : "Reservas de eventos"}
        description="Administra salones, reservas, adelantos y seguimiento operativo de eventos."
        actions={<Button onClick={() => setShowForm(true)}>Nueva reserva</Button>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <EventKpi label="Eventos hoy" value={summary.today} tone="green" />
        <EventKpi label="Proximos" value={summary.upcoming} tone="blue" />
        <EventKpi label="Pendientes" value={summary.pending} tone="amber" />
        <EventKpi label="Saldo pendiente" value={`S/ ${summary.balance.toFixed(2)}`} tone="red" />
      </section>

      <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs tabs={[{ value: "LISTA", label: "Lista" }, { value: "CALENDARIO", label: "Calendario" }]} value={mode} onChange={setMode} />
          <div className="grid flex-1 gap-3 md:grid-cols-4 xl:max-w-5xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={17} />
              <input
                className="h-10 w-full rounded-input border border-park-border bg-white px-3 pl-9 text-sm text-park-black outline-none transition placeholder:text-park-muted focus:border-park-green focus:ring-2 focus:ring-park-green/15"
                placeholder="Buscar cliente, DNI, evento o codigo"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <UiSelect value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos los estados</option>
              {["COTIZACION", "RESERVADO", "CONFIRMADO", "FINALIZADO", "CANCELADO"].map((item) => <option key={item} value={item}>{item}</option>)}
            </UiSelect>
            <UiSelect value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
              <option value="">Todos los espacios</option>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </UiSelect>
            <UiInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-30 bg-slate-950/30 p-4">
          <aside className="ml-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-card bg-white shadow-drawer">
            <div className="flex items-start justify-between border-b border-park-border p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-park-green">Eventos</p>
                <h3 className="font-display text-xl font-semibold text-park-dark">{editingId ? "Editar reserva de evento" : "Nueva reserva de evento"}</h3>
              </div>
              <Button variant="ghost" type="button" onClick={resetForm}>Cerrar</Button>
            </div>
            <div className="overflow-auto p-5">
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={submit}>
            <div className="relative md:col-span-2">
              <Label text="Cliente" />
              <UiInput value={clientQuery} onChange={(event) => { setClientQuery(event.target.value); setForm({ ...form, clientId: "", clientLabel: "" }); }} placeholder="Buscar cliente por nombre o DNI" required />
              {clientOptions.length > 0 && <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-card border border-park-border bg-white shadow-card">
                {clientOptions.map((client) => <button key={client.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-park-light" onClick={() => {
                  const label = `${client.firstName} ${client.lastName} - ${client.documentNumber}`;
                  setClientQuery(label);
                  setClientOptions([]);
                  setForm({ ...form, clientId: client.id, clientLabel: label });
                }}><strong>{client.firstName} {client.lastName}</strong><span className="block text-xs text-park-muted">DNI {client.documentNumber} · {client.phone || "Sin telefono"} · {client.email || "Sin correo"}</span></button>)}
              </div>}
            </div>
            <Input label="Nombre del evento" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Input label="Tipo de evento" value={form.type} onChange={(type) => setForm({ ...form, type })} />
            <Select label="Espacio" value={form.spaceId} onChange={(spaceId) => setForm({ ...form, spaceId })}>
              <option value="">Seleccionar espacio</option>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name} · Cap. {space.capacity}</option>)}
            </Select>
            <Input label="Fecha" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
            <Input label="Hora inicio" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
            <Input label="Hora fin" type="time" value={form.endTime} onChange={(endTime) => setForm({ ...form, endTime })} />
            <Input label="Invitados" type="number" min="1" value={form.guests} onChange={(guests) => setForm({ ...form, guests })} />
            <Input label="Precio" type="number" min="0" step="0.01" value={form.price} onChange={(price) => setForm({ ...form, price })} />
            <Input label="Adelanto" type="number" min="0" step="0.01" value={form.advance} onChange={(advance) => setForm({ ...form, advance })} />
            <Input label="Saldo" type="number" value={Math.max(0, Number(form.price || 0) - Number(form.advance || 0)).toFixed(2)} readOnly />
            <Select label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status })}>
              {["COTIZACION", "RESERVADO", "CONFIRMADO", "FINALIZADO", "CANCELADO"].map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <div className="md:col-span-3"><UiInput label="Observaciones" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            <div className="flex items-end gap-2">
              <Button size="lg" type="submit">Guardar</Button>
              <Button size="lg" variant="secondary" type="button" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
            </div>
          </aside>
        </div>
      )}

      {mode === "CALENDARIO" ? (
        <CalendarView events={filtered} view={view} setView={setView} onSelect={setSelected} />
      ) : (
        <EventsTable events={filtered} onSelect={setSelected} onEdit={editEvent} onCancel={setPendingCancel} onPayment={(event) => setPayment({ ...payment, eventId: event.id, amount: Number(event.balance).toFixed(2) })} />
      )}

      {selected && <EventPanel event={selected} onClose={() => setSelected(null)} onEdit={() => editEvent(selected)} onPayment={() => setPayment({ ...payment, eventId: selected.id, amount: Number(selected.balance).toFixed(2) })} />}
      {payment.eventId && <PaymentPanel payment={payment} setPayment={setPayment} onSubmit={registerPayment} onClose={() => setPayment({ eventId: "", amount: "", method: "EFECTIVO", reference: "" })} />}
      {pendingCancel ? (
        <ConfirmDialog
          title="Cancelar evento"
          description={`Se cancelara el evento ${pendingCancel.name}. El registro quedara marcado como CANCELADO.`}
          confirmLabel="Cancelar evento"
          onCancel={() => setPendingCancel(null)}
          onConfirm={cancelEvent}
        />
      ) : null}
    </div>
  );
}

function CalendarView({ events, view, setView, onSelect }) {
  const groups = useMemo(() => groupEvents(events, view), [events, view]);
  return (
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-park-text"><CalendarDays size={20} /> Vista calendario</div>
        <Tabs tabs={["MES", "SEMANA", "DIA"].map((item) => ({ value: item, label: item }))} value={view} onChange={setView} />
      </div>
      {!events.length ? <EmptyState /> : <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Object.entries(groups).map(([day, items]) => (
          <div key={day} className="min-h-36 rounded-card border border-park-border bg-park-bg p-3">
            <h3 className="mb-3 text-sm font-black text-park-text">{day}</h3>
            <div className="space-y-2">
              {items.map((event) => <button key={event.id} className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-bold ${eventColors[event.status] || eventColors.COTIZACION}`} onClick={() => onSelect(event)}>
                <span className="block">{event.name}</span>
                <span className="font-medium">{time(event.startsAt)}-{time(event.endsAt)} · {event.space?.name}</span>
              </button>)}
            </div>
          </div>
        ))}
      </div>}
    </section>
  );
}

function EventKpi({ label, value, tone }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700"
  };

  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <p className="text-xs font-black uppercase tracking-wide text-park-muted">{label}</p>
      <strong className={`mt-3 inline-flex rounded-button px-3 py-2 font-display text-2xl font-semibold ${tones[tone] || tones.green}`}>
        {value}
      </strong>
    </article>
  );
}

function eventSummary(events) {
  const today = new Date().toISOString().slice(0, 10);
  return events.reduce((summary, event) => {
    const date = event.startsAt?.slice(0, 10);
    const balance = Number(event.balance || 0);
    if (date === today) summary.today += 1;
    if (date >= today && !["CANCELADO", "FINALIZADO"].includes(event.status)) summary.upcoming += 1;
    if (["COTIZACION", "RESERVADO"].includes(event.status)) summary.pending += 1;
    if (balance > 0 && !["CANCELADO"].includes(event.status)) summary.balance += balance;
    return summary;
  }, { today: 0, upcoming: 0, pending: 0, balance: 0 });
}

function EventsTable({ events, onSelect, onEdit, onCancel, onPayment }) {
  return <Table columns={["Evento", "Cliente", "Programacion", "Importes", "Estado", "Acciones"]} rows={events} renderRow={(event) => (
    <tr key={event.id}>
      <td className="px-4 py-3">
        <p className="font-black text-park-black">{event.name}</p>
        <p className="text-xs font-semibold text-park-muted">{event.code} / {event.space?.name}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-park-black">{event.client?.firstName} {event.client?.lastName}</p>
        <p className="text-xs font-semibold text-park-muted">DNI: {event.client?.documentNumber}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-park-black">{dateOnly(event.startsAt)}</p>
        <p className="text-xs font-semibold text-park-muted">{time(event.startsAt)} - {time(event.endsAt)} / {event.guests} invitados</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-park-black">Total S/ {Number(event.price).toFixed(2)}</p>
        <p className="text-xs font-semibold text-park-muted">Adelanto S/ {Number(event.advance).toFixed(2)}</p>
        <p className="text-xs font-black text-park-green">Saldo S/ {Number(event.balance).toFixed(2)}</p>
      </td>
      <td className="px-4 py-3"><StatusBadge value={event.status} /></td>
      <td className="px-4 py-3"><div className="flex gap-1"><IconButton icon={<Eye size={15} />} onClick={() => onSelect(event)} /><IconButton icon={<Pencil size={15} />} onClick={() => onEdit(event)} /><IconButton icon={<CreditCard size={15} />} onClick={() => onPayment(event)} /><IconButton danger icon={<XCircle size={15} />} onClick={() => onCancel(event)} /></div></td>
    </tr>
  )} />;
}

function EventPanel({ event, onClose, onEdit, onPayment }) {
  const catering = Array.isArray(event.catering) ? event.catering : [];
  const equipment = Array.isArray(event.equipment) ? event.equipment : [];
  return <div className="fixed inset-0 z-30 bg-slate-950/30 p-4"><aside className="ml-auto h-full max-w-md overflow-auto rounded-card bg-white p-5 shadow-drawer">
    <div className="flex justify-between"><h3 className="font-display text-xl font-semibold text-park-dark">{event.name}</h3><Button variant="ghost" type="button" onClick={onClose}>Cerrar</Button></div>
    <div className="mt-4 space-y-2 text-sm">
      {["client", "event"].map((key) => key === "client" ? <p key={key}><strong>Cliente:</strong> {event.client.firstName} {event.client.lastName} · DNI {event.client.documentNumber} · {event.client.phone}</p> : null)}
      <p><strong>Tipo:</strong> {event.type}</p><p><strong>Espacio:</strong> {event.space.name}</p><p><strong>Fecha:</strong> {dateOnly(event.startsAt)}</p><p><strong>Horario:</strong> {time(event.startsAt)} - {time(event.endsAt)}</p><p><strong>Invitados:</strong> {event.guests}</p><p><strong>Precio:</strong> S/ {Number(event.price).toFixed(2)}</p><p><strong>Adelanto:</strong> S/ {Number(event.advance).toFixed(2)}</p><p><strong>Saldo:</strong> S/ {Number(event.balance).toFixed(2)}</p><p><strong>Estado:</strong> <StatusBadge value={event.status} /></p>
    </div>
    {(event.layout || catering.length || equipment.length || event.parkingCount) ? <section className="mt-5 rounded-card border border-park-border bg-park-bg p-4">
      <h4 className="text-xs font-black uppercase tracking-wide text-park-green">Propuesta solicitada por el cliente</h4>
      <div className="mt-3 space-y-2 text-sm text-park-black">
        {event.layout ? <p><strong>Montaje:</strong> {String(event.layout).replaceAll("_", " ")}</p> : null}
        {catering.length ? <div><strong>Platos:</strong><ul className="mt-1 space-y-1">{catering.map((item) => <li key={item.menuItemId || item.name}>{item.quantity} x {item.name}</li>)}</ul></div> : null}
        {equipment.length ? <p><strong>Equipamiento:</strong> {equipment.map((item) => item.name).join(" · ")}</p> : null}
        {event.parkingCount ? <p><strong>Cochera preliminar:</strong> {event.parkingCount} espacios</p> : null}
        {event.notes ? <p><strong>Indicaciones:</strong> {event.notes}</p> : null}
      </div>
    </section> : null}
    <div className="mt-5 flex gap-2"><Button variant="secondary" type="button">Ver reserva</Button><Button type="button" onClick={onEdit}>Editar</Button><Button variant="gold" type="button" onClick={onPayment}>Registrar pago</Button></div>
  </aside></div>;
}

function PaymentPanel({ payment, setPayment, onSubmit, onClose }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/30 p-4"><form className="w-full max-w-md rounded-card bg-white p-5 shadow-drawer" onSubmit={onSubmit}>
    <h3 className="font-display text-xl font-semibold text-park-dark">Registrar pago de evento</h3>
    <div className="mt-4 grid gap-3"><Input label="Monto" type="number" min="0.01" step="0.01" value={payment.amount} onChange={(amount) => setPayment({ ...payment, amount })} /><Select label="Metodo" value={payment.method} onChange={(method) => setPayment({ ...payment, method })}>{["EFECTIVO", "TARJETA", "YAPE", "PLIN"].map((item) => <option key={item} value={item}>{item}</option>)}</Select><Input label="Referencia" value={payment.reference} onChange={(reference) => setPayment({ ...payment, reference })} /></div>
    <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button>Registrar</Button></div>
  </form></div>;
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

function Label({ text }) { return <label className="mb-1 block text-sm font-semibold text-park-black">{text}</label>; }
function Input({ label, value, onChange, readOnly, ...props }) { return <UiInput label={label} value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} required={!readOnly} {...props} />; }
function Select({ label, value, onChange, children }) { return <UiSelect label={label} value={value} onChange={(event) => onChange(event.target.value)} required>{children}</UiSelect>; }
function IconButton({ icon, onClick, danger }) { return <button type="button" className={`grid h-8 w-8 place-items-center rounded-button border transition ${danger ? "border-red-100 text-red-600 hover:bg-red-50" : "border-park-border text-park-green hover:bg-park-green-soft"}`} onClick={onClick}>{icon}</button>; }
function dateOnly(value) { return new Date(value).toLocaleDateString("es-PE"); }
function time(value) { return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
function groupEvents(events, view) {
  return events.reduce((groups, event) => {
    const day = view === "DIA" ? "Hoy" : dateOnly(event.startsAt);
    groups[day] = groups[day] || [];
    groups[day].push(event);
    return groups;
  }, {});
}
