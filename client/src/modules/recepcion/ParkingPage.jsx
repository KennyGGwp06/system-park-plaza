// Accesos › Cochera. Plano de espacios (libre, reservado por una reserva, ocupado), ingreso de vehículos y salida.
// Datos: GET /api/cochera; ingreso POST /api/cochera/entries; salida PATCH /api/cochera/entries/:id/finish.
// Al cerrar la salida de un huésped el servidor libera su espacio automáticamente.
import { useMemo, useState } from "react";
import { CarFront, LogIn, LogOut, RefreshCw } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, Kpi, PageHead, Tag, dateShort, timeOf, useToast } from "./rxkit";

const STATE = { LIBRE: ["Libre", "ok", "#12A07A"], RESERVADO: ["Reservado", "info", "#1E6FD6"], OCUPADO: ["Ocupado", "ink", "#0B1020"] };
const VEHICLES = [["AUTO", "Auto"], ["CAMIONETA", "Camioneta"], ["MINIVAN", "Minivan"], ["MOTO", "Moto"]];
const nameOf = (client) => `${client?.firstName || ""} ${client?.lastName || ""}`.trim();

export function ParkingPage() {
  const { data, loading, reload } = useFetch("/cochera", { initialData: [], realtime: true, pollInterval: 30000 });
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const spaces = useMemo(() => (data || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true })), [data]);
  const count = (status) => spaces.filter((space) => space.status === status).length;
  const visible = spaces.filter((space) => !filter || space.status === filter);
  if (loading && !spaces.length) return <LoadingSpinner label="Cargando cochera…" />;

  return <>
    <PageHead title="Cochera" tools={<button className="rx-btn" type="button" onClick={reload}><RefreshCw />Actualizar</button>}>Espacios del estacionamiento: quién los tiene reservados, quién está dentro y la salida de cada vehículo.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={CarFront} label="Espacios" value={spaces.length} detail={`${Math.round(((spaces.length - count("LIBRE")) / Math.max(1, spaces.length)) * 100)} % en uso`} bar={[((spaces.length - count("LIBRE")) / Math.max(1, spaces.length)) * 100]} />
      <Kpi label="Libres" value={count("LIBRE")} detail="Disponibles ahora" />
      <Kpi label="Reservados" value={count("RESERVADO")} detail="Por una reserva, aún sin llegar" />
      <Kpi label="Ocupados" value={count("OCUPADO")} detail="Vehículos dentro" />
    </div>
    <section className="rx-card">
      <div className="rx-filters">
        <div className="rx-seg">{[["", "Todos"], ["LIBRE", "Libres"], ["RESERVADO", "Reservados"], ["OCUPADO", "Ocupados"]].map(([key, label]) => <button key={key || "all"} type="button" className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <div className="rx-legend" style={{ marginLeft: "auto" }}>{Object.entries(STATE).map(([key, [label, , color]]) => <span key={key}><i style={{ background: color }} />{label}</span>)}</div>
      </div>
      {visible.length ? <div className="rx-rooms">{visible.map((space) => { const entry = space.entries?.[0]; const [label, , color] = STATE[space.status] || [space.status, "off", "#8A97AB"]; return <button key={space.id} type="button" className="rx-room" style={{ borderLeftColor: color, minHeight: 80 }} onClick={() => setSelected(space)}>
        <span className="num"><b>{space.code}</b><small>{label}</small></span>
        <span className="who">{entry ? nameOf(entry.client) || "Sin cliente" : ""}</span>
        <span className="st">{entry ? `${entry.plate || "Sin placa"} · ${(VEHICLES.find(([key]) => key === entry.vehicleType) || [null, entry.vehicleType || ""])[1]}` : "Disponible"}</span>
      </button>; })}</div> : <Empty icon={CarFront} title="Ningún espacio con este filtro" />}
    </section>
    <SpaceDrawer space={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); reload(); }} />
  </>;
}

function SpaceDrawer({ space, onClose, onDone }) {
  const show = useToast();
  const [form, setForm] = useState({ plate: "", vehicleType: "AUTO", brand: "", model: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!space) return null;
  const entry = space.entries?.[0];
  const [label, tone] = STATE[space.status] || [space.status, "off"];
  const close = () => { setError(""); setForm({ plate: "", vehicleType: "AUTO", brand: "", model: "" }); onClose(); };

  async function enter() {
    const plate = (form.plate || entry?.plate || "").trim().toUpperCase();
    if (!plate) { setError("Registra la placa del vehículo."); return; }
    setBusy(true); setError("");
    try { await api("/cochera/entries", { method: "POST", body: { spaceId: space.id, plate, vehicleType: entry?.vehicleType || form.vehicleType, brand: form.brand, model: form.model, clientId: entry?.clientId || undefined, bookingId: entry?.bookingId || undefined } }); show(`Ingreso registrado en ${space.code}: ${plate}.`); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function exit() {
    setBusy(true); setError("");
    try { await api(`/cochera/entries/${entry.id}/finish`, { method: "PATCH" }); show(`${space.code} liberado.`); onDone(); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <Drawer open onClose={close} busy={busy} eyebrow="Cochera" title={`Espacio ${space.code}`} subtitle={label}
    footer={<>
      <button className="rx-btn" type="button" onClick={close} disabled={busy}>Cerrar</button>
      {(space.status === "OCUPADO" || space.status === "RESERVADO") && entry ? <button className="rx-btn" type="button" onClick={exit} disabled={busy}><LogOut />{space.status === "OCUPADO" ? "Registrar salida" : "Liberar reserva"}</button> : null}
      {space.status !== "OCUPADO" ? <button className="rx-btn rx-btn--primary" type="button" onClick={enter} disabled={busy}><LogIn />Registrar ingreso</button> : null}
    </>}>
    <div><Tag tone={tone}>{label}</Tag></div>
    {entry ? <section className="rx-sec"><h3>{space.status === "OCUPADO" ? "Vehículo dentro" : "Reservado para"}</h3>
      <dl className="rx-dl">
        <div><dt>Cliente</dt><dd>{nameOf(entry.client) || "Sin cliente"}</dd></div>
        <div><dt>Placa</dt><dd className="rx-mono">{entry.plate || "—"}</dd></div>
        <div><dt>Vehículo</dt><dd>{[(VEHICLES.find(([key]) => key === entry.vehicleType) || [null, entry.vehicleType])[1], entry.brand, entry.model].filter(Boolean).join(" · ") || "—"}</dd></div>
        <div><dt>{space.status === "OCUPADO" ? "Ingresó" : "Desde"}</dt><dd>{entry.startedAt ? `${dateShort(entry.startedAt)} ${timeOf(entry.startedAt)}` : dateShort(entry.startsAt)}</dd></div>
      </dl>
    </section> : null}
    {space.status !== "OCUPADO" ? <section className="rx-sec"><h3>Registrar ingreso</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="rx-field"><span>Placa</span><input className="rx-input rx-mono" value={form.plate} placeholder={entry?.plate || "ABC-123"} onChange={(event) => setForm({ ...form, plate: event.target.value.toUpperCase() })} /></label>
        <label className="rx-field"><span>Tipo</span><select className="rx-select" value={entry?.vehicleType || form.vehicleType} disabled={Boolean(entry)} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })}>{VEHICLES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <label className="rx-field"><span>Marca (opcional)</span><input className="rx-input" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label>
        <label className="rx-field"><span>Modelo (opcional)</span><input className="rx-input" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label>
      </div>
      {entry ? <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 12.5 }}>Si la placa es la misma de la reserva, puedes dejarla vacía.</p> : null}
    </section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
