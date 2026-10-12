// Nueva reserva de hospedaje o edición de una existente, en la hoja lateral de la Agenda (reemplaza a la
// pantalla "Reservas de hospedaje"). Mismas reglas del servidor: POST/PUT /api/reservations, disponibilidad
// con /api/rooms/:id/check-availability. El adelanto se registra como cobro a nombre de quien atiende.
import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Alert, Drawer, money, nightsBetween, todayKey, addDays, useShift, useToast } from "./rxkit";
import { METHODS } from "./PaymentFields";

const empty = { clientId: "", clientLabel: "", roomId: "", checkInDate: "", checkOutDate: "", adults: 1, children: 0, advance: 0, paymentMethod: "EFECTIVO", notes: "" };
const emptyClient = { documentNumber: "", firstName: "", lastName: "", phone: "", email: "" };

export function HotelReservationDrawer({ open, editId, roomId, onClose, onSaved }) {
  const show = useToast();
  const { cashSession } = useShift();
  const rooms = useFetch("/rooms", { initialData: { rooms: [] }, enabled: open, realtime: false });
  const reservations = useFetch("/reservations", { initialData: [], enabled: open && Boolean(editId), realtime: false });
  const [form, setForm] = useState(empty);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [newClient, setNewClient] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = (reservations.data || []).find((row) => Number(row.id) === Number(editId)) || null;

  useEffect(() => {
    if (!open) return;
    setError(""); setNewClient(null); setOptions([]);
    if (!editId) { const start = todayKey(); setForm({ ...empty, roomId: roomId ? String(roomId) : "", checkInDate: start, checkOutDate: addDays(start, 1) }); setQuery(""); }
  }, [open, editId, roomId]);
  useEffect(() => {
    if (!editing) return;
    const label = `${editing.client?.firstName || ""} ${editing.client?.lastName || ""} · DNI ${editing.client?.documentNumber || "—"}`.trim();
    setQuery(label);
    setForm({ clientId: editing.clientId, clientLabel: label, roomId: String(editing.roomId), checkInDate: String(editing.checkInDate).slice(0, 10), checkOutDate: String(editing.checkOutDate).slice(0, 10), adults: editing.adults, children: editing.children, advance: Number(editing.advance || 0), paymentMethod: "EFECTIVO", notes: editing.notes || "" });
  }, [editing?.id]);

  const roomList = (rooms.data?.rooms || []).filter((room) => !["MANTENIMIENTO", "FUERA_SERVICIO"].includes(room.status)).sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  const room = roomList.find((item) => String(item.id) === String(form.roomId));
  const nights = form.checkInDate && form.checkOutDate && form.checkOutDate > form.checkInDate ? nightsBetween(form.checkInDate, form.checkOutDate) : 0;
  const total = room ? Number(room.price) * nights : 0;
  const alreadyPaid = editing ? Number(editing.advance || 0) : 0;
  const payNow = editing ? 0 : Math.max(0, Number(form.advance || 0));
  const guests = Number(form.adults || 0) + Number(form.children || 0);

  useEffect(() => {
    if (!open || !query.trim() || query === form.clientLabel) { setOptions([]); return undefined; }
    const timer = window.setTimeout(async () => { try { setOptions((await api(`/clients/search?q=${encodeURIComponent(query.trim())}`)).slice(0, 6)); } catch { setOptions([]); } }, 250);
    return () => window.clearTimeout(timer);
  }, [query, form.clientLabel, open]);
  useEffect(() => {
    if (!open || !form.roomId || !nights) { setAvailability(null); return undefined; }
    const timer = window.setTimeout(async () => {
      try { setAvailability(await api(`/rooms/${form.roomId}/check-availability?checkIn=${form.checkInDate}&checkOut=${form.checkOutDate}${editId ? `&excludeReservationId=${editId}` : ""}`)); }
      catch (cause) { setAvailability({ available: false, message: cause.message }); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, form.roomId, form.checkInDate, form.checkOutDate, nights, editId]);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const pick = (client) => { const label = `${client.firstName} ${client.lastName} · DNI ${client.documentNumber}`; set({ clientId: client.id, clientLabel: label }); setQuery(label); setOptions([]); };

  async function createClient() {
    if (!/^\d{8}$/.test(newClient.documentNumber) || !newClient.firstName.trim() || !newClient.lastName.trim()) { setError("Para registrar al cliente ingresa DNI de 8 dígitos, nombres y apellidos."); return; }
    setBusy(true); setError("");
    try { const client = await api("/clients", { method: "POST", body: { documentType: "DNI", ...newClient } }); pick(client); setNewClient(null); show(`Cliente ${client.firstName} ${client.lastName} registrado.`); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  async function submit() {
    if (!form.clientId) return setError("Busca y elige al titular, o regístralo.");
    if (!room) return setError("Elige la habitación.");
    if (!nights) return setError("La salida debe ser posterior a la entrada.");
    if (room.capacity && guests > Number(room.capacity)) return setError(`La habitación ${room.number} admite ${room.capacity} persona(s).`);
    if (availability?.available === false) return setError(availability.message || "La habitación no está libre en esas fechas.");
    if (payNow > total) return setError("El adelanto no puede superar el total.");
    const advance = editing ? alreadyPaid : payNow;
    const payload = { clientId: Number(form.clientId), roomId: Number(form.roomId), checkInDate: form.checkInDate, checkOutDate: form.checkOutDate, adults: Number(form.adults), children: Number(form.children), totalPrice: total, advance, paymentMethod: form.paymentMethod, notes: form.notes, status: advance >= total ? "CONFIRMADA" : advance > 0 ? "RESERVADA" : "PENDIENTE" };
    if (editing) payload.status = editing.status === "CHECKED_IN" ? "CHECKED_IN" : payload.status;
    setBusy(true); setError("");
    try {
      const saved = await api(editing ? `/reservations/${editing.id}` : "/reservations", { method: editing ? "PUT" : "POST", body: payload });
      show(editing ? `Reserva ${saved.code} actualizada.` : `Reserva ${saved.code} creada para la habitación ${room.number}.`);
      onSaved?.(saved); onClose();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  if (!open) return null;
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Hospedaje" title={editing ? `Editar ${editing.code}` : "Nueva reserva de hospedaje"} subtitle={editing ? `${editing.client?.firstName || ""} ${editing.client?.lastName || ""}` : "Titular, habitación, fechas y adelanto"}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : payNow > 0 ? `Crear y cobrar ${money(payNow)}` : "Crear reserva"}</button></>}>
    <section className="rx-sec"><h3>Titular</h3>
      {!newClient ? <div style={{ position: "relative", display: "grid", gap: 6 }}>
        <input className="rx-input" value={query} onChange={(event) => { setQuery(event.target.value); set({ clientId: "", clientLabel: "" }); }} placeholder="Buscar por DNI, nombre o teléfono" disabled={Boolean(editing)} />
        {options.length ? <div className="rx-search-pop" style={{ top: 38 }}>{options.map((client) => <button key={client.id} type="button" onClick={() => pick(client)}><span><b>{client.firstName} {client.lastName}</b><small>DNI {client.documentNumber}{client.phone ? ` · ${client.phone}` : ""}</small></span></button>)}</div> : null}
        {!editing ? <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" style={{ justifySelf: "start" }} onClick={() => setNewClient({ ...emptyClient, documentNumber: /^\d+$/.test(query.trim()) ? query.trim() : "" })}><UserPlus />Registrar cliente nuevo</button> : null}
      </div> : <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <label className="rx-field"><span>DNI</span><input className="rx-input" inputMode="numeric" maxLength={8} value={newClient.documentNumber} onChange={(event) => setNewClient({ ...newClient, documentNumber: event.target.value.replace(/\D/g, "") })} /></label>
        <label className="rx-field"><span>Teléfono</span><input className="rx-input" inputMode="tel" value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} /></label>
        <label className="rx-field"><span>Nombres</span><input className="rx-input" value={newClient.firstName} onChange={(event) => setNewClient({ ...newClient, firstName: event.target.value })} /></label>
        <label className="rx-field"><span>Apellidos</span><input className="rx-input" value={newClient.lastName} onChange={(event) => setNewClient({ ...newClient, lastName: event.target.value })} /></label>
        <label className="rx-field" style={{ gridColumn: "1 / -1" }}><span>Correo (opcional)</span><input className="rx-input" type="email" value={newClient.email} onChange={(event) => setNewClient({ ...newClient, email: event.target.value })} /></label>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}><button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={createClient} disabled={busy}>Registrar y usar</button><button className="rx-btn rx-btn--sm" type="button" onClick={() => setNewClient(null)}>Volver a buscar</button></div>
      </div>}
    </section>

    <section className="rx-sec"><h3>Estadía</h3>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="rx-field"><span>Entrada</span><input className="rx-input" type="date" value={form.checkInDate} onChange={(event) => set({ checkInDate: event.target.value })} /></label>
        <label className="rx-field"><span>Salida</span><input className="rx-input" type="date" value={form.checkOutDate} min={form.checkInDate} onChange={(event) => set({ checkOutDate: event.target.value })} /></label>
        <label className="rx-field"><span>Adultos</span><input className="rx-input" type="number" min="1" value={form.adults} onChange={(event) => set({ adults: event.target.value })} /></label>
        <label className="rx-field"><span>Niños</span><input className="rx-input" type="number" min="0" value={form.children} onChange={(event) => set({ children: event.target.value })} /></label>
        <label className="rx-field" style={{ gridColumn: "1 / -1" }}><span>Habitación</span>
          <select className="rx-select" value={form.roomId} onChange={(event) => set({ roomId: event.target.value })}>
            <option value="">Elige una habitación</option>
            {roomList.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.type?.name} · {item.capacity} pers. · {money(item.price)} por noche{item.status !== "LIBRE" ? " · hoy ocupada" : ""}</option>)}
          </select>
        </label>
      </div>
      {availability ? <div style={{ marginTop: 8 }}><Alert tone={availability.available === false ? "crit" : "ok"}>{availability.available === false ? availability.message || "La habitación ya está reservada en esas fechas." : `Habitación ${room?.number} libre del ${form.checkInDate.split("-").reverse().join("/")} al ${form.checkOutDate.split("-").reverse().join("/")}.`}</Alert></div> : null}
    </section>

    <section className="rx-sec"><h3>Cuenta</h3>
      <div className="rx-ledger">
        <div><span>{nights || 0} noche(s) × {money(room?.price || 0)}</span><b>{money(total)}</b></div>
        {editing ? <div><span>Ya pagado</span><b>{money(alreadyPaid)}</b></div> : null}
        <div className={total - (editing ? alreadyPaid : payNow) > 0 ? "due" : "clear"}><span>Saldo después de guardar</span><b>{money(Math.max(0, total - (editing ? alreadyPaid : payNow)))}</b></div>
      </div>
    </section>

    {!editing ? <section className="rx-sec"><h3>Adelanto que paga ahora</h3>
      <div style={{ display: "grid", gap: 10 }}>
        <div className="rx-pay-methods">{METHODS.map(({ code, label, icon: Icon }) => <button key={code} type="button" className={form.paymentMethod === code ? "is-on" : ""} onClick={() => set({ paymentMethod: code })}><Icon />{label}</button>)}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <label className="rx-field" style={{ flex: 1 }}><span>Monto</span><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={form.advance} onChange={(event) => set({ advance: event.target.value })} /></label>
          <button className="rx-btn rx-btn--sm" type="button" onClick={() => set({ advance: Math.round(total * 50) / 100 })}>50 %</button>
          <button className="rx-btn rx-btn--sm" type="button" onClick={() => set({ advance: total })}>Todo</button>
        </div>
        {form.paymentMethod === "EFECTIVO" && payNow > 0 && cashSession?.status !== "ABIERTA" ? <Alert tone="warn">Tu caja está cerrada: ábrela antes de recibir efectivo.</Alert> : null}
      </div>
    </section> : <Alert tone="info">Los cobros de una reserva existente se registran desde su ficha ("Cobrar saldo") para que queden en tu caja.</Alert>}

    <label className="rx-field"><span>Notas para Recepción (opcional)</span><textarea className="rx-input" style={{ height: 64, paddingTop: 8 }} value={form.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
