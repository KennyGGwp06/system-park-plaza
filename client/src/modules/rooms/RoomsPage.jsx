import { useMemo, useState } from "react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, PageHeader, Tabs } from "../../components/ui";
import { Link } from "react-router-dom";

const statuses = ["TODOS", "LIBRE", "RESERVADA", "OCUPADA", "EN_LIMPIEZA", "MANTENIMIENTO"];

export function RoomsPage() {
  const { data, loading, error, reload } = useFetch("/rooms");
  const [status, setStatus] = useState("TODOS");
  const [toast, setToast] = useState("");

  const rooms = useMemo(() => {
    if (!data?.rooms) return [];
    return status === "TODOS" ? data.rooms : data.rooms.filter((room) => room.status === status);
  }, [data, status]);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-park-danger">{error.message}</p>;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow="Alojamiento"
        title="Habitaciones"
        description="Disponibilidad y estado operativo de habitaciones conectado a reservas, estadias y limpieza."
        actions={<Button variant="secondary" onClick={reload}>Actualizar</Button>}
      />
      <Tabs tabs={statuses.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))} value={status} onChange={setStatus} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rooms.map((room) => (
          <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={room.id}>
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
            <div className="mt-4">
              {room.status === "LIBRE" ? <Button as={Link} to={`/reservas?nueva=1&habitacion=${room.id}`} className="w-full" variant="secondary">Crear reserva</Button> : null}
              {room.status === "OCUPADA" ? <Button as="a" href="/checkout" className="w-full" variant="secondary">Ver estadia</Button> : null}
              {room.status === "RESERVADA" ? <Button as="a" href="/reservas" className="w-full" variant="secondary">Ver reserva</Button> : null}
              {room.status === "EN_LIMPIEZA" ? <Button as="a" href="/limpieza/pendientes" className="w-full" variant="secondary">Ver limpieza</Button> : null}
              {["MANTENIMIENTO", "FUERA_SERVICIO"].includes(room.status) ? <span className="block rounded-card bg-park-danger-soft px-3 py-2 text-center text-sm font-semibold text-park-danger">No disponible</span> : null}
            </div>
          </article>
        ))}
      </section>
    </div>
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
