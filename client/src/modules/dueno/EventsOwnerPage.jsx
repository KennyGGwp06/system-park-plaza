// Reservas › Eventos (dueño): el resumen con gráficos (ventas, ambientes, estado de pago) y, en la segunda pestaña,
// la agenda del mes con alta, edición, cobros y cancelación (la misma pantalla que usa Recepción).
import { useSearchParams } from "react-router-dom";
import { EventsReservationsPage } from "../admin/SuperAdminReservationsPage";
import { EventsDeskPage } from "../recepcion/EventsDeskPage";
import { Seg } from "./kit";

export function EventsOwnerPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("vista") === "agenda" ? "agenda" : "resumen";
  return <>
    <div style={{ marginBottom: 12 }}><Seg value={tab} onChange={(value) => setParams(value === "agenda" ? { vista: "agenda" } : {})} options={[["resumen", "Resumen"], ["agenda", "Agenda, alta y cobros"]]} /></div>
    {tab === "agenda" ? <EventsDeskPage embedded /> : <EventsReservationsPage />}
  </>;
}
