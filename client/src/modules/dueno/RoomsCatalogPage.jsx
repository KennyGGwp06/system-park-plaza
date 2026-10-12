// Catálogo y precios › Habitaciones. Cada tipo de habitación con su precio por noche, descripción y foto (lo que ve el
// cliente al reservar), y cada habitación con su estado: el dueño puede sacar una de servicio o pasarla a mantenimiento.
// Rutas: GET/PUT /api/admin/commercial-settings (roomTypes), POST/DELETE /api/admin/room-types/:name/image,
// GET /api/rooms, PATCH /api/rooms/:id.
import { useEffect, useState } from "react";
import { BedDouble, ImagePlus, Trash2 } from "lucide-react";
import { api, getToken } from "../../services/api";
import { apiBaseUrl, apiOrigin } from "../../config/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, Status, Tag, soles, useBusy, useToast } from "./kit";

export async function uploadImage(path, file) {
  if (!file) return null;
  const response = await fetch(`${apiBaseUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": file.type }, body: file });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "No se pudo subir la imagen");
  return data;
}
export const imageSrc = (url) => (!url ? "" : /^https?:/.test(url) || url.startsWith("/images") ? url : `${apiOrigin}${url}`);

export function RoomsCatalogPage() {
  const settings = useFetch("/admin/commercial-settings", { initialData: null, realtime: false });
  const rooms = useFetch("/rooms", { initialData: { rooms: [] }, realtime: true, pollInterval: 60000 });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [types, setTypes] = useState(null);
  const [room, setRoom] = useState(null);
  useEffect(() => { if (settings.data?.roomTypes) setTypes(structuredClone(settings.data.roomTypes)); }, [settings.data]);
  const list = (rooms.data?.rooms || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  if (!types) return <LoadingSpinner label="Cargando habitaciones…" />;
  const dirty = JSON.stringify(types) !== JSON.stringify(settings.data.roomTypes);
  const setType = (index, patch) => setTypes(types.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const save = () => run(async () => { await api("/admin/commercial-settings", { method: "PUT", body: { roomTypes: types.map((row) => ({ ...row, price: Number(row.price) })) } }); show("Precios y descripciones de habitaciones guardados."); settings.reload(); rooms.reload(); });
  const image = (row, file) => run(async () => { await uploadImage(`/admin/room-types/${encodeURIComponent(row.name)}/image`, file); show(`Foto de ${row.name} guardada.`); settings.reload(); });
  const removeImage = (row) => run(async () => { await api(`/admin/room-types/${encodeURIComponent(row.name)}/image`, { method: "DELETE" }); show("Foto quitada."); settings.reload(); });
  const floors = [...new Set(list.map((row) => row.floor))].sort();
  const count = (status) => list.filter((row) => row.status === status).length;
  return <>
    <PageHead title="Habitaciones" tools={<button className="rx-btn rx-btn--primary" type="button" disabled={!dirty || busy} onClick={save}>Guardar precios</button>}>Precio por noche, descripción y foto de cada tipo (lo que ve el cliente), y el estado de cada habitación. Un cambio de precio aplica a las nuevas reservas.</PageHead>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={BedDouble} label="Habitaciones" value={list.length} detail={`${types.length} tipos`} />
      <Kpi label="Libres" value={count("LIBRE")} detail="Listas para vender" />
      <Kpi label="Ocupadas" value={count("OCUPADA")} detail={`${list.length ? Math.round((count("OCUPADA") / list.length) * 100) : 0}% de ocupación`} />
      <Kpi label="Fuera de venta" value={count("MANTENIMIENTO") + count("FUERA_SERVICIO")} detail="Mantenimiento o fuera de servicio" />
    </div>
    <Card title="Tipos de habitación" flush style={{ marginBottom: 14 }}>
      <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Foto</th><th>Tipo</th><th className="n">Capacidad</th><th className="n">Habitaciones</th><th>Descripción que ve el cliente</th><th className="n">Precio por noche (S/)</th></tr></thead>
        <tbody>{types.map((row, index) => <tr key={row.name}>
          <td style={{ width: 120 }}>{row.imageUrl ? <div style={{ display: "flex", gap: 4, alignItems: "center" }}><img className="ow-thumb" src={imageSrc(row.imageUrl)} alt="" /><button className="rx-close" type="button" aria-label="Quitar foto" onClick={() => removeImage(row)}><Trash2 size={13} /></button></div> : <label className="rx-btn rx-btn--ghost rx-btn--sm" style={{ position: "relative" }}><ImagePlus />Foto<input type="file" accept="image/jpeg,image/png,image/webp" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(event) => image(row, event.target.files?.[0])} /></label>}</td>
          <td><b style={{ fontWeight: 600 }}>{row.name}</b></td><td className="n">{row.capacity}</td><td className="n">{row.rooms}</td>
          <td><input className="rx-input" value={row.description || ""} onChange={(event) => setType(index, { description: event.target.value })} placeholder="Qué incluye, vista, cama…" /></td>
          <td className="n" style={{ width: 150 }}><input className="rx-input rx-mono" style={{ textAlign: "right" }} type="number" min="0" step="1" value={row.price} onChange={(event) => setType(index, { price: event.target.value })} /></td>
        </tr>)}</tbody></table></div>
    </Card>
    <Card title="Habitaciones por piso" subtitle="Clic en una habitación para cambiar su estado">
      {floors.map((floor) => <div key={floor} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}><span className="mut" style={{ width: 54 }}>Piso {floor}</span>{list.filter((row) => row.floor === floor).map((row) => <button key={row.id} type="button" className="rx-btn rx-btn--sm" title={`${row.type?.name} · ${row.status}`} style={{ minWidth: 64, background: row.status === "OCUPADA" ? "var(--blue-soft)" : ["MANTENIMIENTO", "FUERA_SERVICIO"].includes(row.status) ? "var(--warn-bg)" : undefined }} onClick={() => setRoom(row)}>{row.number}</button>)}</div>)}
      {!list.length ? <Empty title="Sin habitaciones" /> : null}
    </Card>
    {room ? <RoomDrawer room={room} onClose={() => setRoom(null)} onDone={() => { setRoom(null); rooms.reload(); }} /> : null}
  </>;
}

function RoomDrawer({ room, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [note, setNote] = useState(room.statusNote || "");
  const change = (status) => run(async () => { await api(`/rooms/${room.id}`, { method: "PATCH", body: { status, note } }); show(`Habitación ${room.number}: ${status === "LIBRE" ? "disponible" : status === "MANTENIMIENTO" ? "en mantenimiento" : "fuera de servicio"}.`); onDone(); });
  const occupied = room.status === "OCUPADA";
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`Piso ${room.floor} · ${room.type?.name}`} title={`Habitación ${room.number}`} subtitle={`${soles(room.price)} por noche · ${room.capacity} persona(s)`} footer={<button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div style={{ display: "flex", gap: 6 }}><Status value={room.status} /><Tag>{String(room.cleaningStatus || "").toLowerCase()}</Tag></div>
    <p className="ow-mini">{(room.features || []).join(" · ")}</p>
    {occupied ? <Alert tone="info">Está ocupada: su estado cambia con la salida del huésped en Recepción.</Alert> : <>
      <Field label="Motivo o nota"><input className="rx-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. cambio de colchón" /></Field>
      <div className="ow-toolbar" style={{ marginTop: 8 }}>{room.status !== "LIBRE" ? <button className="rx-btn rx-btn--primary" type="button" disabled={busy} onClick={() => change("LIBRE")}>Dejar disponible</button> : null}{room.status !== "MANTENIMIENTO" ? <button className="rx-btn" type="button" disabled={busy} onClick={() => change("MANTENIMIENTO")}>Pasar a mantenimiento</button> : null}{room.status !== "FUERA_SERVICIO" ? <button className="rx-btn rx-btn--danger" type="button" disabled={busy} onClick={() => change("FUERA_SERVICIO")}>Fuera de servicio</button> : null}</div>
    </>}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
