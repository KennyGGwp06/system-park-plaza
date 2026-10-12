// Admisión › Control de aforo. Muestra en vivo las personas dentro de los 5 servicios frente a su capacidad.
// Los números los calcula el servidor en GET /api/superadmin/home (misma fuente que el Inicio); aquí solo se dibujan.
import { AlertTriangle, QrCode, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { Bullets, HourColumns, TipLayer, fmt, useTip } from "./OwnerCharts";
import "./OwnerHome.css";
import "./ControlPages.css";

const TIME_ZONE = "America/Lima";
const timeOf = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const percent = (inside, capacity) => capacity ? Math.round((inside / capacity) * 100) : null;
const stateOf = (value) => value === null ? ["Sin aforo definido", "off"] : value >= 100 ? ["Lleno", "full"] : value >= 85 ? ["Casi lleno", "warn"] : ["Con cupo", "ok"];

function Card({ title, sub, children }) {
  return <section className="oh-card"><div className="oh-ch"><h2>{title}</h2></div>{sub ? <div className="oh-ch2">{sub}</div> : null}<div className="oh-body">{children}</div></section>;
}

export function LiveOccupancyPage({ navigate, endpoint = "/superadmin/home?days=1" }) {
  const tip = useTip();
  const { data, loading, error, reload } = useFetch(endpoint, { initialData: null, cacheTime: 15000, realtime: true, pollInterval: 30000 });

  if (!data && loading) return <main className="oh"><LoadingSpinner label="Consultando el aforo en vivo..."/></main>;
  if (!data) return <main className="oh"><div className="oh-error"><AlertTriangle/><div><strong>No se pudo cargar el aforo</strong><p>{error?.message || "Error desconocido"}</p><button type="button" onClick={reload}>Reintentar</button></div></div></main>;

  const { kpis, services, hourly, peakHour, notes } = data;
  const rows = [...services].sort((a, b) => (percent(b.inside, b.capacity) ?? -1) - (percent(a.inside, a.capacity) ?? -1) || b.inside - a.inside);
  const withCapacity = services.filter((row) => row.capacity);
  const free = withCapacity.reduce((total, row) => total + Math.max(0, row.capacity - row.inside), 0);
  const fullest = rows.find((row) => row.capacity && row.inside > 0) || null;
  const enteredToday = hourly.reduce((total, item) => total + item.count, 0);
  const totalPercent = percent(kpis.inside.value, kpis.inside.capacity);
  const estimatedNames = services.filter((row) => row.estimated).map((row) => row.name);
  const estimateNote = (notes || []).find((note) => /estimaci/i.test(note));

  return <main className="oh">
    <TipLayer tip={tip.tip}/>
    <div className="oh-ph">
      <div><h1>Control de aforo</h1><p>Personas dentro ahora en cada servicio · Actualizado a las {timeOf(data.generatedAt)} · se refresca cada 30 s</p></div>
      <div className="oh-tools">
        {navigate ? <button type="button" className="oh-btn" onClick={() => navigate("admision", "qr")}><QrCode size={16}/>Accesos QR</button> : null}
        <button type="button" className="oh-btn p" onClick={reload}><RefreshCw size={16}/>Actualizar</button>
      </div>
    </div>

    <section className="oh-card oh-kpis" aria-label="Indicadores de aforo">
      <div className="k"><div className="l">Personas dentro ahora</div><div className="v">{fmt(kpis.inside.value)}</div><div className="d">{totalPercent === null ? "Aforo sin definir" : `${totalPercent}% del aforo total`}</div><div className="km"><i style={{ width: `${Math.min(100, totalPercent || 0)}%` }}/></div></div>
      <div className="k"><div className="l">Aforo total</div><div className="v">{kpis.inside.capacity ? fmt(kpis.inside.capacity) : "—"}</div><div className="d">suma de los 5 servicios</div></div>
      <div className="k"><div className="l">Cupos disponibles</div><div className="v">{fmt(free)}</div><div className="d">personas que aún pueden entrar</div></div>
      <div className="k"><div className="l">Servicio más lleno</div><div className="v v--text">{fullest ? fullest.name : "—"}</div><div className="d">{fullest ? `${fmt(fullest.inside)} de ${fmt(fullest.capacity)} · ${percent(fullest.inside, fullest.capacity)}%` : "Nadie dentro por ahora"}</div></div>
      <div className="k"><div className="l">Ingresos de hoy</div><div className="v">{fmt(enteredToday)}</div><div className="d">{peakHour ? `hora pico ${peakHour.hour}:00` : "aún sin ingresos validados"}</div></div>
    </section>

    <div className="oh-grid g-8-4">
      <Card title="Ocupación por servicio" sub="Personas dentro frente al aforo · ≈ estimado">
        <Bullets rows={rows.map((row) => ({ code: row.code, name: row.name, inside: row.inside, capacity: row.capacity, estimated: row.estimated }))} total={kpis.inside} tip={tip}/>
      </Card>
      <Card title="Afluencia por hora" sub="Personas que ingresaron hoy">
        <HourColumns hourly={hourly} peak={peakHour} tip={tip}/>
      </Card>
    </div>

    <section className="oh-card" style={{ marginTop: 16 }}>
      <div className="oh-ch"><h2>Detalle por servicio</h2></div>
      <div className="oh-body oh-body--flush">
        <table className="oh-table">
          <thead><tr><th>Servicio</th><th className="n">Dentro</th><th className="n">Aforo</th><th className="n">Ocupación</th><th>Estado</th><th>Dato</th><th className="n">Reservas hoy</th></tr></thead>
          <tbody>{rows.map((row) => { const value = percent(row.inside, row.capacity); const [label, tone] = stateOf(value); return <tr key={row.code}>
            <td>{row.name}</td>
            <td className="n"><b>{fmt(row.inside)}</b>{row.estimated ? " ≈" : ""}</td>
            <td className="n">{row.capacity ? fmt(row.capacity) : "—"}</td>
            <td className="n">{value === null ? "—" : `${value}%`}</td>
            <td><span className={`oh-state oh-state--${tone}`}>{label}</span></td>
            <td className="mut">{row.estimated ? "Estimado" : "En vivo"}</td>
            <td className="n">{fmt(row.reservationsToday)}</td>
          </tr>; })}</tbody>
        </table>
      </div>
    </section>

    {estimatedNames.length ? <div className="oh-note oh-note--bottom"><strong>≈ Dato estimado:</strong> {estimateNote || `en ${estimatedNames.join(", ")} el sistema registra el ingreso, no la salida.`}</div> : null}
  </main>;
}
