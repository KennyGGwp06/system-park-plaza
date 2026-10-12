// Admisión y aforo › Accesos con QR. Cada ingreso validado con el pase del cliente (quién, a qué servicio, cuántas
// personas, quién lo validó y a qué hora), por servicio y por hora, y un validador para revisar un código a mano.
// Validar un ingreso exige turno abierto (lo hace Recepción); el dueño puede consultar el pase.
// Rutas: GET /api/access/logs, /api/clients, /api/usuarios, POST /api/access/preview.
import { useMemo, useState } from "react";
import { QrCode, ScanLine } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Columns, Empty, HBars, Kpi, PageHead, Seg, Status, Tag, addDays, limaDay, todayKey, useBusy, useChartTip, whenText } from "./kit";

const SERVICE = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos" };

export function AccessLogPage() {
  const [range, setRange] = useState("hoy");
  // El servidor entrega solo el período elegido (lo antiguo vive en el historial).
  const logs = useFetch(`/access/logs?range=${range === "hoy" ? 1 : range}`, { initialData: [], realtime: true, pollInterval: 30000 });
  const clients = useFetch("/clients", { initialData: [], realtime: false });
  const users = useFetch("/usuarios", { initialData: [], realtime: false });
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);
  const { busy, error, setError, run } = useBusy();
  const perService = useChartTip(), perHour = useChartTip();
  const today = todayKey();
  const from = range === "hoy" ? today : addDays(today, range === "7" ? -6 : -29);
  const nameOf = (list, id) => { const row = (Array.isArray(list) ? list : []).find((item) => Number(item.id) === Number(id)); return row ? `${row.firstName} ${row.lastName}` : "—"; };
  const rows = (Array.isArray(logs.data) ? logs.data : []).filter((row) => limaDay(row.validatedAt) >= from).sort((a, b) => String(b.validatedAt).localeCompare(String(a.validatedAt)));
  const people = rows.reduce((s, r) => s + Number(r.people || 0), 0);
  const services = useMemo(() => Object.keys(SERVICE).map((key) => ({ name: SERVICE[key], value: rows.filter((r) => r.serviceCode === key).reduce((s, r) => s + Number(r.people || 0), 0) })).filter((r) => r.value), [rows]);
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  const byHour = hours.map((h) => rows.filter((r) => Number(new Date(r.validatedAt).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Lima" })) === h).reduce((s, r) => s + Number(r.people || 0), 0));
  const check = () => { if (!code.trim()) return; run(async () => { setPreview(await api("/access/preview", { method: "POST", body: { code: code.trim() } })); }); };
  if (logs.loading && !rows.length && logs.data == null) return <LoadingSpinner label="Cargando accesos…" />;
  return <>
    <PageHead title="Accesos con QR" tools={<Seg value={range} onChange={setRange} options={[["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"]]} />}>Nadie entra sin validar su pase: identidad, pago, horario y servicio. Aquí ves cada ingreso validado y puedes revisar un código.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ScanLine} label="Ingresos validados" value={rows.length} detail={`${people} persona(s)`} />
      {services.slice(0, 3).map((row) => <Kpi key={row.name} label={row.name} value={row.value} detail="personas" />)}
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Personas por hora" subtitle={range === "hoy" ? "Hoy" : "Suma del periodo"}><ChartBox><Columns values={byHour} labels={hours.map((h) => `${h}h`)} name="Personas" tip={perHour.tip} everyLabel={2} highlight={byHour.map((v, i) => (v === Math.max(...byHour) && v ? i : -1)).filter((i) => i >= 0)} />{perHour.layer}</ChartBox></Card>
      <Card title="Por servicio" subtitle="Personas que ingresaron"><ChartBox><HBars rows={services} name="Personas" tip={perService.tip} x0={100} tooltipLabel="Personas" />{perService.layer}</ChartBox></Card>
    </div>
    <div className="ow-split">
      <Card title="Ingresos" flush>
        {rows.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th className="n">Personas</th><th>Validó</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td className="mut">{whenText(row.validatedAt)}</td><td>{nameOf(clients.data, row.clientId)}</td><td>{SERVICE[row.serviceCode] || row.serviceCode}</td><td className="n">{row.people}</td><td className="mut">{nameOf(users.data, row.employeeId)}</td></tr>)}</tbody></table></div> : <Empty icon={QrCode} title="Sin ingresos validados en el periodo" />}
      </Card>
      <Card title="Revisar un pase" subtitle="Escribe o escanea el código del cliente">
        <div style={{ display: "flex", gap: 8 }}><input className="rx-input rx-mono" value={code} onChange={(event) => { setCode(event.target.value); setPreview(null); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") check(); }} placeholder="Código del pase" /><button className="rx-btn rx-btn--primary" type="button" disabled={busy || !code.trim()} onClick={check}>Revisar</button></div>
        {preview ? <div style={{ marginTop: 12 }}><p style={{ margin: "0 0 6px" }}><b>{preview.client.firstName} {preview.client.lastName}</b> · DNI {preview.client.documentNumber} · pase <span className="rx-mono">{preview.pass.code}</span> <Status value={preview.pass.status} /></p>
          <ul className="rx-list">{(preview.entitlements || []).map((row, index) => <li key={index}><div className="grow"><b>{SERVICE[row.serviceCode] || row.serviceCode}</b><small>{row.people} persona(s){row.date ? ` · ${row.date}` : ""}{row.slot ? ` · ${row.slot}` : ""}</small></div><Tag tone={row.status === "UTILIZADO" ? "off" : row.valid === false ? "crit" : "ok"}>{row.status === "UTILIZADO" ? "Ya ingresó" : row.valid === false ? (row.reason || "No válido") : "Puede ingresar"}</Tag></li>)}</ul>
          <p className="ow-mini">El ingreso lo registra Recepción desde su estación (Accesos), con su turno abierto.</p></div> : null}
        {error ? <Alert tone="crit">{error}</Alert> : null}
      </Card>
    </div>
  </>;
}
