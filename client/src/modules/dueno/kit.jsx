// Kit de las pantallas del dueño: piezas de rxkit (misma identidad que las estaciones) + gráficos de OwnerCharts +
// ayudas comunes (tarjeta con cabecera, filtros segmentados, buscador, estados en español, fechas de Lima).
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { TipLayer, useTip } from "../admin/OwnerCharts";
import { Tag as RxTag } from "../recepcion/rxkit";
import "../admin/OwnerHome.css";
import "../admin/owner.css";

export { Alert, Drawer, Empty, Kpi, PageHead, Tag, dateShort, money, money0, timeOf, todayKey, addDays, useToast } from "../recepcion/rxkit";
export { COLORS, Columns, HBars, StackedBar, StackedRows, GroupedBars, LineChart, HourColumns, useTip, TipLayer } from "../admin/OwnerCharts";

export const limaDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");
export const qty = (value, digits = 2) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: digits });
export const soles = (value) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const whenText = (iso) => { if (!iso) return "—"; const day = limaDay(iso); const [y, m, d] = day.split("-"); return `${d}/${m}/${y.slice(2)} ${new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" })}`; };
export const dayText = (key) => { if (!key) return "—"; const [y, m, d] = String(key).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
export const fullName = (row) => [row?.firstName, row?.lastName].filter(Boolean).join(" ") || row?.name || "—";

// Estados que llegan del servidor en inglés o en mayúsculas: una sola traducción para todo el panel del dueño.
const STATUS = {
  PENDING: ["Sin abrir", "off"], OPEN: ["Abierto", "ok"], OPERATING: ["Abierto", "ok"], COUNTING: ["En conteo", "info"], REOPENED: ["Reabierto", "warn"], SUBMITTED: ["Por aprobar", "warn"], OBSERVED: ["Observado", "crit"], CLOSED: ["Cerrado", "off"], APPROVED: ["Aprobado", "ok"],
  REQUESTED: ["Por aprobar", "warn"], REJECTED: ["Rechazado", "crit"], SENT: ["En camino", "info"], RECEIVED: ["Recibido", "ok"], RECEIVED_WITH_DIFFERENCE: ["Recibido con diferencia", "warn"], CANCELLED: ["Anulado", "off"], DRAFT: ["Borrador", "off"], VERIFIED: ["Verificado", "info"], POSTED: ["Ingresado", "ok"], PARTIALLY_RECEIVED: ["Recepción parcial", "warn"], ACTIVE: ["Activo", "ok"], ARCHIVED: ["Archivado", "off"], AVAILABLE: ["Disponible", "ok"], EXPIRED: ["Vencido", "crit"], BLOCKED: ["Bloqueado", "crit"],
  PENDIENTE: ["Pendiente", "warn"], EN_COCINA: ["Aceptado", "info"], PREPARANDO: ["En preparación", "info"], LISTO: ["Listo", "ok"], ENTREGADO: ["Entregado", "ok"], CANCELADO: ["Cancelado", "off"], CANCELADA: ["Cancelada", "off"],
  CONFIRMADA: ["Confirmada", "ok"], CONFIRMADO: ["Confirmado", "ok"], RESERVADA: ["Reservada", "info"], CHECKED_IN: ["En estadía", "ok"], FINALIZADA: ["Finalizada", "off"], FINALIZADO: ["Finalizado", "off"], NO_SHOW: ["No se presentó", "crit"],
  PAGADO: ["Pagado", "ok"], PARCIAL: ["Pago parcial", "warn"], PENDIENTE_VERIFICACION: ["Por verificar", "warn"], APROBADO: ["Aprobado", "ok"], RECHAZADO: ["Rechazado", "crit"], ANULADO: ["Anulado", "off"],
  ABIERTO: ["Abierto", "warn"], EN_REPARACION: ["En reparación", "info"], EN_REVISION: ["En revisión", "warn"], SOLUCIONADO: ["Solucionado", "ok"], RESUELTO: ["Resuelto", "ok"], EN_LIMPIEZA: ["En curso", "info"], DANOS_REPORTADOS: ["Con daños", "crit"],
  LIBRE: ["Libre", "ok"], OCUPADA: ["Ocupada", "info"], MANTENIMIENTO: ["Mantenimiento", "warn"], FUERA_SERVICIO: ["Fuera de servicio", "crit"],
  ACTIVO: ["Activo", "ok"], INACTIVO: ["Inactivo", "off"], BLOQUEADO: ["Bloqueado", "crit"], EN_TURNO: ["En turno", "ok"], ABIERTA: ["Abierta", "ok"], CERRADA: ["Cerrada", "off"],
  ACEPTADO: ["Aceptado", "ok"], PENDIENTE_REINTENTO: ["Por reintentar", "warn"], ENVIANDO: ["Enviando", "info"], SOLICITADA: ["Por decidir", "warn"], APROBADA: ["Aprobada", "info"], DEVUELTA: ["Devuelta", "ok"], RECHAZADA: ["Rechazada", "crit"],
  OK: ["Bien", "ok"], STOCK_BAJO: ["Stock bajo", "warn"], SIN_STOCK: ["Sin stock", "crit"], ALTA: ["Alta", "warn"], MEDIA: ["Media", "info"], BAJA: ["Baja", "off"], CRITICA: ["Crítica", "crit"]
};
export function statusOf(value) { const key = String(value || "").toUpperCase(); if (STATUS[key]) return STATUS[key]; const text = key.replaceAll("_", " ").toLowerCase(); return [text ? text[0].toUpperCase() + text.slice(1) : "—", "off"]; }
export function Status({ value }) { const [label, tone] = statusOf(value); return <RxTag tone={tone}>{label}</RxTag>; }

// Tarjeta con cabecera (título, bajada y herramientas).
export function Card({ title, subtitle, tools, children, flush = false, className = "", style }) {
  return <section className={`rx-card ${className}`} style={style}>
    {title || tools ? <div className="rx-card-h"><div>{title ? <h2>{title}</h2> : null}{subtitle ? <p>{subtitle}</p> : null}</div>{tools ? <div className="ow-toolbar">{tools}</div> : null}</div> : null}
    {flush ? children : <div className="rx-card-b">{children}</div>}
  </section>;
}
// Contenedor para los gráficos azules (usan los estilos de .oh) con su tooltip.
export function ChartBox({ children, height }) { return <div className="oh" style={height ? { minHeight: height } : undefined}>{children}</div>; }
export function useChartTip() { const tip = useTip(); return { tip, layer: <TipLayer tip={tip.tip} /> }; }

export function Seg({ value, options, onChange }) {
  return <div className="rx-seg">{options.map(([key, label, count]) => <button key={key} type="button" className={value === key ? "is-on" : ""} onClick={() => onChange(key)}>{label}{count != null ? <i>{count}</i> : null}</button>)}</div>;
}
export function SearchBox({ value, onChange, placeholder = "Buscar", width = 280 }) {
  return <div className="rx-search" style={{ margin: 0, width, maxWidth: "100%" }}><label style={{ background: "#fff" }}><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label></div>;
}
export function Field({ label, children, full = false }) { return <label className={`rx-field ${full ? "full" : ""}`}><span>{label}</span>{children}</label>; }

// Caso abierto en un panel lateral según ?ver=ID (así la bandeja "Por aprobar" puede abrir un caso concreto).
export function useOpenId(key = "ver") {
  const [params, setParams] = useSearchParams();
  const id = params.get(key);
  const open = (value) => { const next = new URLSearchParams(params); if (value == null) next.delete(key); else next.set(key, String(value)); setParams(next); };
  return [id, open];
}
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work) => { setBusy(true); setError(""); try { return await work(); } catch (cause) { setError(cause.message || "No se pudo completar."); return null; } finally { setBusy(false); } };
  return { busy, error, setError, run };
}
