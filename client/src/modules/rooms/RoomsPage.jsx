import { useMemo, useState } from "react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, PageHeader, Select, Tabs } from "../../components/ui";
import { Link } from "react-router-dom";

const statuses = ["TODOS", "LIBRE", "RESERVADA", "OCUPADA", "EN_LIMPIEZA", "MANTENIMIENTO"];

const floorSections = [
  { key: "primer-nivel", title: "Primer nivel", range: "Habitaciones 101 al 111", start: 101, end: 111 },
  { key: "tercer-piso", title: "Tercer piso", range: "Habitaciones 301 al 311", start: 301, end: 311 },
  { key: "cuarto-piso", title: "Cuarto piso", range: "Habitaciones 401 al 411", start: 401, end: 411 }
];

export function RoomsPage() {
  const { data, loading, error, reload } = useFetch("/rooms");
  const [status, setStatus] = useState("TODOS");
  const [floor, setFloor] = useState("TODOS");
  const [toast, setToast] = useState("");

  const rooms = useMemo(() => {
    if (!data?.rooms) return [];
    return status === "TODOS" ? data.rooms : data.rooms.filter((room) => matchesStatus(room, status));
  }, [data, status]);

  const roomsByFloor = useMemo(() => floorSections
    .filter((section) => floor === "TODOS" || section.key === floor)
    .map((section) => ({
      ...section,
      rooms: rooms.filter((room) => {
        const roomNumber = Number(room.number);
        return roomNumber >= section.start && roomNumber <= section.end;
      })
    })), [floor, rooms]);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-park-danger">{error.message}</p>;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow="Alojamiento"
        title="Habitaciones"
        description="Disponibilidad y estado operativo de habitaciones, organizada por nivel y conectada a reservas, estadias y limpieza."
        actions={<Button variant="secondary" onClick={reload}>Actualizar</Button>}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs tabs={statuses.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))} value={status} onChange={setStatus} />
        <Select
          className="w-full lg:w-56"
          label="Filtrar por piso"
          value={floor}
          onChange={(event) => setFloor(event.target.value)}
        >
          <option value="TODOS">Todos los pisos</option>
          {floorSections.map((section) => <option key={section.key} value={section.key}>{section.title}</option>)}
        </Select>
      </div>
      <div className="space-y-7">
        {roomsByFloor.map((section) => (
          <section key={section.key} aria-labelledby={section.key}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1 border-b border-park-border pb-3">
              <h2 className="font-display text-2xl font-semibold text-park-dark" id={section.key}>{section.title}</h2>
              <p className="text-sm text-park-muted">{section.range}</p>
            </div>
            {section.rooms.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {section.rooms.map((room) => <RoomCard key={room.id} room={room} />)}
              </div>
            ) : (
              <p className="rounded-card border border-dashed border-park-border bg-white px-4 py-5 text-sm text-park-muted">
                No hay habitaciones de este nivel con el estado seleccionado.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room }) {
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <strong className="font-display text-[28px] font-semibold text-park-dark">{room.number}</strong>
          <p className="text-sm text-park-muted">Piso {room.floor} - {room.type.name}</p>
        </div>
        <StatusBadge value={room.status} />
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <Line label="Capacidad" value={`${room.capacity} persona${room.capacity === 1 ? "" : "s"}`} />
        <Line label="Tarifa" value={`S/ ${Number(room.price).toFixed(2)}`} />
        <Line label="Contexto" value={roomContext(room)} />
      </div>
      {room.usage ? (
        <div className={`mt-4 rounded-card border px-3 py-2.5 text-sm ${room.usage.state === "EN_USO" ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="font-semibold text-park-dark">{room.usage.label}</p>
          <p className="mt-1 text-park-muted">{room.usage.clientName || "Huésped por confirmar"}</p>
          <p className="mt-1 text-xs text-park-muted">{room.usage.reservationCode || "Sin código"} · Entrada {formatUsageDate(room.usage.checkIn)}</p>
        </div>
      ) : null}
      <div className="mt-4">
        {room.status === "LIBRE" ? <Button as={Link} to={`/reservas?nueva=1&habitacion=${room.id}`} className="w-full" variant="secondary">Crear reserva</Button> : null}
        {room.status === "OCUPADA" ? <Button as="a" href="/checkout" className="w-full" variant="secondary">Ver estadia</Button> : null}
        {room.status === "RESERVADA" ? <Button as="a" href="/reservas" className="w-full" variant="secondary">Ver reserva</Button> : null}
        {room.status === "EN_LIMPIEZA" ? <Button as="a" href="/admin/limpieza/pendientes" className="w-full" variant="secondary">Supervisar limpieza</Button> : null}
        {["MANTENIMIENTO", "FUERA_SERVICIO"].includes(room.status) ? <span className="block rounded-card bg-park-danger-soft px-3 py-2 text-center text-sm font-semibold text-park-danger">No disponible</span> : null}
      </div>
    </article>
  );
}

function Line({ label, value }) {
  return <p className="flex justify-between gap-3"><span className="text-park-muted">{label}</span><strong className="text-right font-semibold text-park-black">{value}</strong></p>;
}

function roomContext(room) {
  const labels = {
    LIBRE: "Disponible para venta",
    RESERVADA: "Tiene reserva asociada",
    OCUPADA: "Estadia activa",
    EN_LIMPIEZA: "Pendiente de limpieza",
    MANTENIMIENTO: "Requiere revision",
    FUERA_SERVICIO: "Fuera de operacion"
  };
  return labels[room.status] || "-";
}

function matchesStatus(room, status) {
  if (status === "RESERVADA") return room.usage?.state === "RESERVADA";
  return room.status === status;
}

function formatUsageDate(value) {
  if (!value) return "por confirmar";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}
