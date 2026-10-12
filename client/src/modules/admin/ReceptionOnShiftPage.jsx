// Coordinación › Personal en turno (Admin de recepción, solo lectura).
// Quién trabaja hoy, en qué área, de qué hora a qué hora y si ya marcó. No muestra tarifas ni planilla.
import { AlertTriangle, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { fmt } from "./OwnerCharts";
import "./OwnerHome.css";
import "./ControlPages.css";

const TIME_ZONE = "America/Lima";
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE }) : "—");
const AREAS = { RECEPCION: "Recepción", RESTAURANTE: "Restaurante", BARTENDER: "Bar", LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento", PISCINA: "Piscina", MIRADOR: "Mirador", EVENTOS: "Eventos", ADMINISTRADOR: "Recepción", SUPERADMIN: "Dirección" };
const STATES = { EN_TURNO: ["En turno", "ok"], POR_ENTRAR: ["Por entrar", "warn"], TERMINO: ["Terminó", "off"] };
const areaName = (area) => AREAS[area] || area || "Sin área";

export function ReceptionOnShiftPage() {
  const { data, loading, error, reload } = useFetch("/reception/on-shift", { initialData: null, cacheTime: 15000, realtime: true, pollInterval: 30000 });

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Consultando el personal de hoy..."/></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudo cargar el personal en turno</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const rows = data.rows || [];
  const count = (state) => rows.filter((row) => row.status === state).length;
  const areas = [...new Set(rows.map((row) => row.area))];

  return <main className="oh">
    <div className="oh-ph">
      <div><h1>Personal en turno</h1><p>Turnos de hoy ({data.date}) · Actualizado a las {timeOf(data.generatedAt)} · se refresca cada 30 s · solo lectura</p></div>
      <div className="oh-tools"><button type="button" className="oh-btn p" onClick={reload}><RefreshCw size={16}/>Actualizar</button></div>
    </div>

    <section className="oh-card oh-kpis oh-kpis--4" aria-label="Resumen del personal de hoy">
      <div className="k"><div className="l">Turnos de hoy</div><div className="v">{fmt(rows.length)}</div><div className="d">en {fmt(areas.length)} áreas</div></div>
      <div className="k"><div className="l">En turno ahora</div><div className="v">{fmt(count("EN_TURNO"))}</div><div className="d">ya marcaron entrada</div></div>
      <div className="k"><div className="l">Por entrar</div><div className="v">{fmt(count("POR_ENTRAR"))}</div><div className="d">aún no marcan entrada</div></div>
      <div className="k"><div className="l">Terminaron</div><div className="v">{fmt(count("TERMINO"))}</div><div className="d">ya marcaron salida</div></div>
    </section>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Personal de hoy</h2></div>
      <div className="oh-body oh-body--flush">
        {rows.length ? <table className="oh-table">
          <thead><tr><th>Persona</th><th>Área</th><th>Horario</th><th>Estado</th><th className="n">Entrada</th><th className="n">Salida</th></tr></thead>
          <tbody>{rows.map((row) => { const [label, tone] = STATES[row.status] || ["—", "off"]; return <tr key={row.shiftId}>
            <td><b>{row.name}</b></td>
            <td>{areaName(row.area)}</td>
            <td className="mut">{row.start || "—"}{row.end ? ` – ${row.end}` : ""}</td>
            <td><span className={`oh-state oh-state--${tone}`}>{label}</span></td>
            <td className="n">{timeOf(row.checkIn)}</td>
            <td className="n">{timeOf(row.checkOut)}</td>
          </tr>; })}</tbody>
        </table> : <div className="oh-empty"><strong>No hay turnos programados para hoy</strong><p>Los horarios los programa el Superadmin.</p></div>}
      </div>
    </section>

    <div className="oh-note oh-note--bottom"><strong>Solo lectura:</strong> los horarios, tarifas y la planilla los administra el Superadmin. Cada persona marca su entrada y salida con DNI y PIN en el reloj.</div>
  </main>;
}
