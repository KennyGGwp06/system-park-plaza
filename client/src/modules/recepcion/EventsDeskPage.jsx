// Eventos (Recepción y dueño). Agenda del mes, lista de eventos con su saldo, alta y edición (cliente, ambiente, fecha,
// horario, invitados, precio y estado), cobro de adelantos o saldo y cancelación. Reemplaza a la pantalla antigua de
// eventos (calendario + formulario). Rutas: GET/POST /api/events, PUT /api/events/:id, PATCH /:id/status,
// POST /:id/payments, GET /api/events/spaces, GET /api/clients/search.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper, Plus, Wallet, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, Kpi, PageHead, Tag, money, todayKey, useToast } from "./rxkit";

const STATUS = { COTIZACION: ["Cotización", "warn"], RESERVADO: ["Reservado", "info"], CONFIRMADO: ["Confirmado", "ok"], FINALIZADO: ["Finalizado", "off"], CANCELADO: ["Cancelado", "crit"] };
const dayOf = (iso) => String(iso || "").slice(0, 10);
const hourOf = (iso) => String(iso || "").slice(11, 16);
const fmtDay = (key) => { if (!key) return "—"; const [y, m, d] = key.split("-"); return `${d}/${m}/${y}`; };
const clientName = (row) => (row.client ? `${row.client.firstName} ${row.client.lastName}` : "—");
const WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function EventsDeskPage({ embedded = false }) {
  const events = useFetch("/events", { initialData: [], realtime: true, pollInterval: 30000 });
  const spaces = useFetch("/events/spaces", { initialData: [], realtime: false });
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState("proximos");
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [editing, setEditing] = useState(params.get("nuevo") ? {} : null);
  const rows = (Array.isArray(events.data) ? events.data : []).slice().sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  const today = todayKey();
  const upcoming = rows.filter((row) => dayOf(row.startsAt) >= today && row.status !== "CANCELADO");
  const shown = view === "proximos" ? upcoming : rows.slice().reverse();
  const selected = rows.find((row) => String(row.id) === params.get("evento")) || null;
  const open = (row) => { const next = new URLSearchParams(params); next.set("evento", String(row.id)); setParams(next); };
  const close = () => { const next = new URLSearchParams(params); next.delete("evento"); next.delete("nuevo"); setParams(next); };
  const balance = upcoming.reduce((s, r) => s + Number(r.balance || 0), 0);
  if (events.loading && !rows.length) return <LoadingSpinner label="Cargando eventos…" />;
  return <>
    {!embedded ? <PageHead title="Eventos" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setEditing({})}><Plus />Nuevo evento</button>}>Bodas, cumpleaños y reuniones en la Terraza, el Mirador o el Salón Amazónico. El cliente ingresa con su QR cuando el evento está pagado.</PageHead> : <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 10 }}><button className="rx-btn rx-btn--primary" type="button" onClick={() => setEditing({})}><Plus />Nuevo evento</button></div>}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={PartyPopper} label="Próximos" value={upcoming.length} detail={upcoming[0] ? `El siguiente: ${fmtDay(dayOf(upcoming[0].startsAt))}` : "Sin eventos por venir"} />
      <Kpi label="Por confirmar" value={upcoming.filter((r) => ["COTIZACION", "RESERVADO"].includes(r.status)).length} detail="Cotizaciones y reservados" />
      <Kpi icon={Wallet} label="Saldo por cobrar" value={money(balance)} detail="De los eventos próximos" />
      <Kpi label="Invitados próximos" value={upcoming.reduce((s, r) => s + Number(r.guests || 0), 0)} detail="Suma de invitados" />
    </div>
    <div className="rx-seg" style={{ marginBottom: 12 }}>
      <button type="button" className={view === "proximos" ? "is-on" : ""} onClick={() => setView("proximos")}>Próximos<i>{upcoming.length}</i></button>
      <button type="button" className={view === "mes" ? "is-on" : ""} onClick={() => setView("mes")}><CalendarDays size={15} />Calendario</button>
      <button type="button" className={view === "todos" ? "is-on" : ""} onClick={() => setView("todos")}>Todos<i>{rows.length}</i></button>
    </div>
    {view === "mes" ? <MonthView rows={rows} month={month} setMonth={setMonth} onOpen={open} /> : <section className="rx-card">
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Evento</th><th>Cliente</th><th>Fecha</th><th>Ambiente</th><th className="n">Invitados</th><th>Estado</th><th className="n">Total</th><th className="n">Saldo</th></tr></thead>
        <tbody>{shown.map((row) => { const [label, tone] = STATUS[row.status] || [row.status, "off"]; return <tr key={row.id} className="is-click" onClick={() => open(row)}>
          <td><b style={{ fontWeight: 600 }}>{row.name}</b><small className="mut" style={{ display: "block" }}>{row.code} · {row.type}</small></td><td>{clientName(row)}</td><td>{fmtDay(dayOf(row.startsAt))}<small className="mut" style={{ display: "block" }}>{hourOf(row.startsAt)}–{hourOf(row.endsAt)}</small></td><td>{row.space?.name || "—"}</td><td className="n">{row.guests}</td><td><Tag tone={tone}>{label}</Tag></td><td className="n">{money(row.price)}</td><td className="n" style={{ color: Number(row.balance) > 0 ? "var(--warn)" : undefined }}>{money(row.balance)}</td>
        </tr>; })}</tbody></table></div> : <Empty icon={PartyPopper} title={view === "proximos" ? "No hay eventos próximos" : "Sin eventos registrados"} />}
    </section>}
    {selected ? <EventDrawer event={selected} onClose={close} onEdit={() => { setEditing(selected); close(); }} onDone={() => events.reload()} /> : null}
    {editing ? <EventForm initial={editing} spaces={Array.isArray(spaces.data) ? spaces.data : []} onClose={() => { setEditing(null); close(); }} onSaved={() => { setEditing(null); close(); events.reload(); }} /> : null}
  </>;
}

function MonthView({ rows, month, setMonth, onOpen }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1); const offset = (first.getDay() + 6) % 7; const days = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => { const d = i - offset + 1; return d >= 1 && d <= days ? `${month}-${String(d).padStart(2, "0")}` : null; });
  const shift = (delta) => { const date = new Date(y, m - 1 + delta, 1); setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`); };
  const today = todayKey();
  return <section className="rx-card">
    <div className="rx-card-h"><div><h2 style={{ textTransform: "capitalize" }}>{first.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</h2></div><div style={{ display: "flex", gap: 6 }}><button className="rx-btn rx-btn--sm" type="button" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft /></button><button className="rx-btn rx-btn--sm" type="button" onClick={() => setMonth(today.slice(0, 7))}>Hoy</button><button className="rx-btn rx-btn--sm" type="button" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight /></button></div></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderTop: "1px solid var(--line-2)" }}>
      {WEEK.map((d) => <div key={d} style={{ padding: "6px 8px", fontSize: 11.5, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>{d}</div>)}
      {cells.map((key, i) => { const list = key ? rows.filter((row) => dayOf(row.startsAt) === key && row.status !== "CANCELADO") : []; return <div key={i} style={{ minHeight: 88, borderTop: "1px solid var(--line-2)", borderLeft: i % 7 ? "1px solid var(--line-2)" : 0, padding: 6, background: key === today ? "var(--blue-soft)" : key ? "#fff" : "#F7F9FC" }}>
        {key ? <small style={{ fontWeight: 600, color: key === today ? "var(--deep)" : "var(--muted)" }}>{Number(key.slice(8))}</small> : null}
        {list.map((row) => <button key={row.id} type="button" onClick={() => onOpen(row)} style={{ display: "block", width: "100%", textAlign: "left", marginTop: 4, padding: "3px 6px", borderRadius: 4, border: 0, cursor: "pointer", fontSize: 12, background: row.status === "CONFIRMADO" ? "#DCF3EA" : row.status === "COTIZACION" ? "var(--warn-bg)" : "#E3EDFB", color: "var(--text)" }}>{hourOf(row.startsAt)} {row.name}</button>)}
      </div>; })}
    </div>
  </section>;
}

function EventDrawer({ event, onClose, onEdit, onDone }) {
  const show = useToast();
  const [payment, setPayment] = useState({ amount: String(Number(event.balance || 0) || ""), method: "EFECTIVO", reference: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [label, tone] = STATUS[event.status] || [event.status, "off"];
  const act = async (work, message) => { setBusy(true); setError(""); try { await work(); show(message); onDone(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  const pay = () => act(() => api(`/events/${event.id}/payments`, { method: "POST", body: { amount: Number(payment.amount), method: payment.method, reference: payment.reference } }), `Pago de ${money(payment.amount)} registrado.`);
  const cancel = () => act(() => api(`/events/${event.id}/status`, { method: "PATCH", body: { status: "CANCELADO" } }), "Evento cancelado.");
  const open = !["CANCELADO", "FINALIZADO"].includes(event.status);
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${event.code} · ${event.type}`} title={event.name} subtitle={`${clientName(event)} · ${fmtDay(dayOf(event.startsAt))} ${hourOf(event.startsAt)}–${hourOf(event.endsAt)} · ${event.space?.name || ""}`}
    footer={open ? <><button className="rx-btn rx-btn--danger" type="button" disabled={busy} onClick={() => (cancelling ? cancel() : setCancelling(true))}><X />{cancelling ? "Confirmar cancelación" : "Cancelar evento"}</button><button className="rx-btn" type="button" onClick={onEdit}>Editar</button></> : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Tag tone={tone}>{label}</Tag>{event.accessStatus ? <Tag>{String(event.accessStatus).replaceAll("_", " ").toLowerCase()}</Tag> : null}</div>
    <dl className="rx-dl"><div><dt>Invitados</dt><dd>{event.guests} de {event.space?.capacity || "—"}</dd></div><div><dt>Total</dt><dd>{money(event.price)}</dd></div><div><dt>Pagado</dt><dd>{money(event.advance)}</dd></div><div><dt>Saldo</dt><dd style={{ color: Number(event.balance) > 0 ? "var(--warn)" : undefined }}>{money(event.balance)}</dd></div><div><dt>Montaje</dt><dd>{(event.layouts || [event.layout]).filter(Boolean).join(", ").toLowerCase() || "—"}</dd></div><div><dt>Celular</dt><dd>{event.client?.phone || "—"}</dd></div></dl>
    {(event.equipment || []).length || (event.catering || []).length ? <section className="rx-sec"><h3>Pidió</h3><p style={{ margin: 0 }}>{[...(event.equipment || []), ...(event.catering || [])].map((item) => `${item.name}${item.price ? ` (${money(item.price)})` : ""}`).join(" · ")}</p></section> : null}
    {event.notes ? <section className="rx-sec"><h3>Notas</h3><p style={{ margin: 0 }}>{event.notes}</p></section> : null}
    {open && Number(event.balance) > 0 ? <section className="rx-sec"><h3>Registrar pago</h3><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
      <label className="rx-field"><span>Monto (S/)</span><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></label>
      <label className="rx-field"><span>Medio</span><select className="rx-select" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>{["EFECTIVO", "YAPE", "PLIN", "TARJETA", "TRANSFERENCIA"].map((m) => <option key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</option>)}</select></label>
      <label className="rx-field"><span>Operación (digital)</span><input className="rx-input" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></label>
      <button className="rx-btn rx-btn--primary" type="button" disabled={busy || !(Number(payment.amount) > 0)} onClick={pay}>Cobrar</button>
    </div><p style={{ fontSize: 12, color: "var(--muted)" }}>El efectivo exige la caja de Recepción abierta.</p></section> : null}
    {cancelling ? <Alert tone="warn">¿Seguro? Si hubo pagos, la devolución se gestiona en Devoluciones.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function EventForm({ initial, spaces, onClose, onSaved }) {
  const show = useToast();
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({ clientId: initial?.clientId || "", clientLabel: initial?.client ? clientName(initial) : "", name: initial?.name || "", type: initial?.type || "Social", spaceId: String(initial?.spaceId || spaces[0]?.id || ""), date: dayOf(initial?.startsAt) || "", startTime: hourOf(initial?.startsAt) || "18:00", endTime: hourOf(initial?.endsAt) || "22:00", guests: String(initial?.guests || 20), price: String(initial?.price ?? ""), advance: String(initial?.advance ?? 0), status: initial?.status || "RESERVADO", notes: initial?.notes || "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const space = spaces.find((row) => String(row.id) === String(form.spaceId));
  const set = (patch) => setForm({ ...form, ...patch });
  const search = async (text) => { setQuery(text); if (text.trim().length < 3) { setResults([]); return; } setResults(await api(`/clients/search?q=${encodeURIComponent(text.trim())}`).catch(() => [])); };
  const save = async () => {
    if (!form.clientId) { setError("Elige al cliente (búscalo por nombre o DNI)."); return; }
    if (!form.name.trim() || !form.date) { setError("Pon el nombre del evento y la fecha."); return; }
    if (form.endTime <= form.startTime) { setError("La hora de fin debe ser después de la de inicio."); return; }
    if (space && Number(form.guests) > Number(space.capacity)) { setError(`${space.name} recibe hasta ${space.capacity} invitados.`); return; }
    setBusy(true); setError("");
    const body = { clientId: Number(form.clientId), name: form.name.trim(), type: form.type, spaceId: Number(form.spaceId), startsAt: `${form.date}T${form.startTime}:00`, endsAt: `${form.date}T${form.endTime}:00`, guests: Number(form.guests), price: Number(form.price || 0), advance: Number(form.advance || 0), status: form.status, notes: form.notes };
    try { await api(editing ? `/events/${initial.id}` : "/events", { method: editing ? "PUT" : "POST", body }); show(editing ? "Evento actualizado." : "Evento creado."); onSaved(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Drawer open onClose={onClose} busy={busy} eyebrow={editing ? initial.code : "Nuevo evento"} title={editing ? initial.name : "Reservar un evento"} subtitle="Cliente, ambiente, fecha y precio"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{editing ? "Guardar" : "Crear evento"}</button></>}>
    <section className="rx-sec"><h3>Cliente</h3>
      {form.clientId ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Tag tone="info">{form.clientLabel}</Tag>{!editing ? <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={() => set({ clientId: "", clientLabel: "" })}>Cambiar</button> : null}</div> : <>
        <input className="rx-input" value={query} onChange={(event) => search(event.target.value)} placeholder="Nombre, DNI o celular (mín. 3 letras)" />
        {results.length ? <ul className="rx-list" style={{ marginTop: 6 }}>{results.slice(0, 6).map((row) => <li key={row.id} className="is-click" style={{ cursor: "pointer" }} onClick={() => { set({ clientId: row.id, clientLabel: `${row.firstName} ${row.lastName}` }); setResults([]); }}><div className="grow"><b>{row.firstName} {row.lastName}</b><small>{row.documentType} {row.documentNumber} · {row.phone}</small></div></li>)}</ul> : query.trim().length >= 3 ? <p className="mut" style={{ fontSize: 12.5 }}>Sin coincidencias. Regístralo primero en Clientes.</p> : null}
      </>}
    </section>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <label className="rx-field" style={{ gridColumn: "1 / -1" }}><span>Nombre del evento</span><input className="rx-input" value={form.name} onChange={(event) => set({ name: event.target.value })} placeholder="Ej. Boda de Lucía y Carlos" /></label>
      <label className="rx-field"><span>Tipo</span><select className="rx-select" value={form.type} onChange={(event) => set({ type: event.target.value })}>{["Social", "Boda", "Cumpleaños", "Corporativo", "Graduación", "Otro"].map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="rx-field"><span>Ambiente</span><select className="rx-select" value={form.spaceId} onChange={(event) => { const next = spaces.find((row) => String(row.id) === event.target.value); set({ spaceId: event.target.value, price: form.price || String(next?.basePrice || "") }); }}>{spaces.map((row) => <option key={row.id} value={row.id}>{row.name} · hasta {row.capacity} · {money(row.basePrice)}</option>)}</select></label>
      <label className="rx-field"><span>Fecha</span><input className="rx-input" type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} /></label>
      <label className="rx-field"><span>Invitados</span><input className="rx-input rx-mono" type="number" min="1" value={form.guests} onChange={(event) => set({ guests: event.target.value })} /></label>
      <label className="rx-field"><span>Inicio</span><input className="rx-input" type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} /></label>
      <label className="rx-field"><span>Fin</span><input className="rx-input" type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} /></label>
      <label className="rx-field"><span>Precio total (S/)</span><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={form.price} onChange={(event) => set({ price: event.target.value })} placeholder={space ? String(space.basePrice) : ""} /></label>
      {!editing ? <label className="rx-field"><span>Adelanto ya pagado (S/)</span><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={form.advance} onChange={(event) => set({ advance: event.target.value })} /></label> : null}
      <label className="rx-field"><span>Estado</span><select className="rx-select" value={form.status} onChange={(event) => set({ status: event.target.value })}><option value="COTIZACION">Cotización</option><option value="RESERVADO">Reservado</option><option value="CONFIRMADO">Confirmado</option>{editing ? <option value="FINALIZADO">Finalizado</option> : null}</select></label>
      <label className="rx-field" style={{ gridColumn: "1 / -1" }}><span>Notas</span><textarea className="rx-input" style={{ height: 70, paddingTop: 8 }} value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Decoración, catering, horarios de proveedores…" /></label>
    </div>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
