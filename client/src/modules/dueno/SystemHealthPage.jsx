// Control del sistema › Salud del sistema. Cuánto tarda el sistema en responder, cuántos pedidos atiende, si hubo
// errores, cuánta memoria usa y cuánto pesa lo vivo frente al historial (Fases 0-2 de escalabilidad).
// Ruta: GET /api/superadmin/system-health (cada copia del servidor responde con sus propios números).
import { Activity, Gauge, HardDrive, ServerCog } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, COLORS, Card, ChartBox, Columns, Empty, HBars, Kpi, PageHead, Tag, useChartTip, whenText } from "./kit";

const NAMES = { orders: "Pedidos", inventoryMovements: "Movimientos de inventario", payments: "Pagos", bookings: "Reservas", entitlements: "Accesos", passes: "Pases", requests: "Solicitudes", tasks: "Tareas", reservations: "Hospedaje", stays: "Estadías", events: "Eventos", poolEntries: "Ingresos a piscina", accessLogs: "Registros de acceso" };
const ms = (value) => (value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`);
const tone = (p95) => (p95 > 1000 ? "crit" : p95 > 400 ? "warn" : "ok");

export function SystemHealthPage() {
  const health = useFetch("/superadmin/system-health", { initialData: null, realtime: true, pollInterval: 15000 });
  const wait = useChartTip(), load = useChartTip(), hist = useChartTip();
  if (!health.data) return health.error ? <Alert tone="crit">{health.error.message}</Alert> : <LoadingSpinner label="Midiendo el sistema…" />;
  const h = health.data, last5 = h.last5, minutes = h.last60.perMinute, alive = (h.instances || []).filter((row) => row.alive);
  const labels = minutes.map((row) => new Date(row.minute).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }));
  const historyRows = h.history.byCollection.map((row) => ({ name: NAMES[row.collection] || row.collection, value: row.rows }));
  const verdict = last5.errors ? ["Hubo errores en los últimos 5 minutos", "crit"] : last5.p95 > 1000 ? ["Respuestas lentas", "crit"] : last5.p95 > 400 ? ["Algo lento", "warn"] : ["Funcionando bien", "ok"];
  return <>
    <PageHead title="Salud del sistema" tools={<Tag tone={verdict[1]}>{verdict[0]}</Tag>}>Qué tan rápido responde el sistema, cuánto trabajo atiende y cuánto pesa. Se actualiza sola, en tiempo real.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Gauge} label="Espera (5 % más lento)" value={ms(last5.p95)} detail={<Tag tone={tone(last5.p95)}>{`típica ${ms(last5.p50)}`}</Tag>} />
      <Kpi icon={Activity} label="Pedidos por segundo" value={last5.perSecond} detail={`${last5.requests} en 5 minutos`} />
      <Kpi label="Errores del servidor" value={last5.errors} detail={last5.errors ? "Revisar el registro" : "Ninguno en 5 minutos"} />
      <Kpi icon={HardDrive} label="Copias del servidor" value={`${alive.length} activa${alive.length === 1 ? "" : "s"}`} detail={`${alive.reduce((sum, row) => sum + Number(row.memoryMb || 0), 0)} MB de memoria · estado vivo ${h.state.sizeKb} KB`} />
    </div>
    <Card title="Espera del 5 % más lento" subtitle="Por minuto, última hora · lo ideal es menos de 400 ms" style={{ marginBottom: 14 }}><ChartBox>{minutes.some((row) => row.requests) ? <Columns values={minutes.map((row) => row.p95)} labels={labels} name="Espera" tip={wait.tip} valueLabel={(v) => ms(Math.round(v))} everyLabel={10} highlight={[minutes.length - 1]} w={960} h={220} /> : <Empty title="Sin pedidos en la última hora" />}{wait.layer}</ChartBox></Card>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Pedidos atendidos" subtitle="Por minuto, última hora"><ChartBox>{minutes.some((row) => row.requests) ? <Columns values={minutes.map((row) => row.requests)} labels={labels} name="Pedidos" tip={load.tip} everyLabel={10} highlight={[minutes.length - 1]} w={620} h={240} /> : <Empty title="Sin pedidos en la última hora" />}{load.layer}</ChartBox></Card>
      <Card title="Historial archivado" subtitle={`${h.history.total.toLocaleString("es-PE")} registros fuera del estado vivo · ${h.history.audit.toLocaleString("es-PE")} de auditoría`}><ChartBox><HBars rows={historyRows} name="Registros" tip={hist.tip} x0={170} tooltipLabel="Registros" />{hist.layer}</ChartBox></Card>
    </div>
    <div className="rx-grid rx-g-2">
      <Card title="Rutas más lentas" subtitle="Promedio de los últimos 5 minutos" flush>
        {last5.slowest.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Ruta</th><th className="n">Pedidos</th><th className="n">Promedio</th><th className="n">Máximo</th></tr></thead>
          <tbody>{last5.slowest.map((row) => <tr key={row.route}><td className="rx-mono" style={{ fontSize: 12 }}>{row.route}</td><td className="n">{row.count}</td><td className="n"><Tag tone={tone(row.avgMs)}>{ms(row.avgMs)}</Tag></td><td className="n mut">{ms(row.maxMs)}</td></tr>)}</tbody></table></div> : <Empty title="Sin pedidos en 5 minutos" />}
      </Card>
      <Card title="Servidor" subtitle="Copias en marcha (cada una atiende parte de los pedidos)">
        <ul className="rx-list" style={{ marginBottom: 10 }}>{(h.instances || []).map((row) => <li key={row.host}><div className="grow"><b className="rx-mono"><ServerCog size={13} /> {row.host}{row.host === h.instance.host ? " · respondió esta página" : ""}</b><small>{row.alive ? `encendida hace ${row.uptimeMinutes} min · ${row.memoryMb} MB · ${row.connections} pantallas en tiempo real` : `sin señal desde ${whenText(row.lastSeen)} · reemplazada al actualizar o caída`}</small></div><Tag tone={row.alive ? (row.sharedChannel ? "ok" : "warn") : "warn"}>{row.alive ? (row.sharedChannel ? "Activa" : "Sin canal compartido") : "Detenida"}</Tag></li>)}</ul>
        <dl className="rx-dl"><div><dt>Base de datos</dt><dd>{h.database.sizeMb} MB · {h.database.connections} conexiones · {h.database.pool.waiting} en espera</dd></div><div><dt>Último cambio</dt><dd>versión {h.state.version} · {whenText(h.state.updatedAt)}</dd></div></dl>
        <p className="ow-mini" style={{ color: COLORS.gray }}>Si la espera del 5 % más lento pasa de 1 s o hay errores, el servidor deja una alerta en su registro.</p>
      </Card>
    </div>
  </>;
}
