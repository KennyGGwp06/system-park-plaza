// Limpieza y mantenimiento › Mantenimiento. Todas las incidencias: las que reporta Limpieza o el huésped y las que
// registra Recepción o el dueño. Aquí se aceptan y se asignan a un técnico en turno, y se ve la reparación con su foto de
// antes y después, qué se hizo y cuánto demoró. Rutas: GET/POST /api/reports, /reception/maintenance-employees,
// PATCH /reception/reports/:id/assign-maintenance.
import { useMemo, useState } from "react";
import { Camera, Plus, Wrench } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { photoSrc } from "../operaciones/OpsShell";
import { Alert, Card, ChartBox, Drawer, Empty, Field, HBars, Kpi, PageHead, Seg, Status, Tag, limaDay, todayKey, useBusy, useChartTip, useOpenId, useToast, whenText } from "./kit";

const DONE = ["SOLUCIONADO", "RESUELTO"];
const hours = (a, b) => (a && b ? Math.max(0, Math.round(((new Date(b) - new Date(a)) / 3600000) * 10) / 10) : null);
const typeLabel = (row) => String(row.type || "Incidencia").replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const sourceOf = (row) => (row.reportedFrom === "LIMPIEZA" ? `Limpieza${row.reportedByName ? ` (${row.reportedByName})` : ""}` : row.clientId ? "Huésped" : "Recepción / dueño");

export function MaintenanceReviewPage() {
  const reports = useFetch("/reports", { initialData: { reports: [] }, realtime: true, pollInterval: 20000 });
  const technicians = useFetch("/reception/maintenance-employees", { initialData: [], realtime: true, pollInterval: 30000 });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("abiertas");
  const byType = useChartTip();
  const all = (reports.data?.reports || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const rows = all.filter((row) => row.requiresMaintenance || row.area === "MANTENIMIENTO");
  const openRows = rows.filter((row) => !DONE.includes(row.status));
  const noTech = openRows.filter((row) => !row.assignedMaintenanceEmployeeId);
  const repairing = openRows.filter((row) => ["EN_REPARACION", "EN_REVISION"].includes(row.status));
  const monthDone = rows.filter((row) => DONE.includes(row.status) && limaDay(row.resolvedAt).startsWith(todayKey().slice(0, 7)));
  const times = rows.map((row) => hours(row.createdAt, row.resolvedAt)).filter((v) => v != null);
  const avg = times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null;
  const types = useMemo(() => { const map = new Map(); rows.forEach((row) => { const key = typeLabel(row); map.set(key, (map.get(key) || 0) + 1); }); return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6); }, [rows]);
  const shown = filter === "abiertas" ? openRows : filter === "sin" ? noTech : filter === "otras" ? all.filter((row) => !rows.includes(row)) : rows;
  const selected = all.find((row) => String(row.id) === openId) || null;

  if (reports.loading && !all.length) return <LoadingSpinner label="Cargando mantenimiento…" />;
  return <>
    <PageHead title="Mantenimiento" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nueva incidencia</button>}>Cada reparación se acepta, se asigna a un técnico en turno y se cierra con foto de antes y después. Lo que no tiene técnico no avanza.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Wrench} label="Abiertas" value={openRows.length} detail={`${repairing.length} en reparación`} />
      <Kpi label="Sin técnico" value={noTech.length} detail={technicians.data?.length ? `${technicians.data.length} técnico(s) en turno` : "Nadie de Mantenimiento en turno"} />
      <Kpi label="Solucionadas este mes" value={monthDone.length} detail="Con foto de antes y después" />
      <Kpi label="Tiempo de solución" value={avg != null ? `${avg} h` : "—"} detail="Promedio del reporte a la solución" />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Por tipo" subtitle="Incidencias de mantenimiento"><ChartBox><HBars rows={types} name="Incidencias" tip={byType.tip} x0={150} tooltipLabel="Incidencias" />{byType.layer}</ChartBox></Card>
      <Card title="Técnicos en turno" subtitle="Solo a ellos se puede asignar" flush>{technicians.data?.length ? <ul className="rx-list">{technicians.data.map((row) => <li key={row.id}><div className="grow"><b>{row.name}</b><small>{openRows.filter((r) => Number(r.assignedMaintenanceEmployeeId) === Number(row.id)).length} trabajo(s) abierto(s)</small></div><Tag tone="ok">En turno</Tag></li>)}</ul> : <Empty title="Nadie de Mantenimiento en turno" />}</Card>
    </div>
    <Card title="Incidencias" flush tools={<Seg value={filter} onChange={setFilter} options={[["abiertas", "Abiertas", openRows.length], ["sin", "Sin técnico", noTech.length], ["todas", "Todas", rows.length], ["otras", "Otras solicitudes", all.length - rows.length]]} />}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Código</th><th>Lugar</th><th>Tipo</th><th>Reportó</th><th>Prioridad</th><th>Técnico</th><th>Estado</th><th>Reportado</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.location || "—"}</td><td className="mut">{typeLabel(row)}</td><td className="mut">{sourceOf(row)}</td><td><Status value={row.priority} /></td>
          <td>{row.assignedMaintenanceTo || (row.requiresMaintenance ? <Tag tone="warn">Sin técnico</Tag> : "—")}</td><td><Status value={row.status} /></td><td className="mut">{whenText(row.createdAt)}</td>
        </tr>)}</tbody></table></div> : <Empty icon={Wrench} title="Sin incidencias en esta vista" />}
    </Card>
    {selected ? <ReportDrawer report={selected} technicians={technicians.data || []} onClose={() => open(null)} onDone={() => reports.reload()} /> : null}
    {creating ? <NewReport onClose={() => setCreating(false)} onDone={() => { setCreating(false); reports.reload(); }} /> : null}
  </>;
}

function ReportDrawer({ report, technicians, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [technician, setTechnician] = useState(String(report.assignedMaintenanceEmployeeId || ""));
  const photos = report.evidences || [];
  const open = !DONE.includes(report.status) && report.requiresMaintenance;
  const assign = () => run(async () => { await api(`/reception/reports/${report.id}/assign-maintenance`, { method: "PATCH", body: { employeeId: Number(technician) } }); show(report.requiresReceptionAcceptance && !report.receptionAcceptedAt ? "Incidencia aceptada y asignada." : "Técnico asignado."); onDone(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${report.code} · ${typeLabel(report)}`} title={report.location || "Incidencia"} subtitle={`Reportó ${sourceOf(report)} · ${whenText(report.createdAt)}`} footer={<button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Status value={report.status} /><Status value={report.priority} />{report.assignedMaintenanceTo ? <Tag>{report.assignedMaintenanceTo}</Tag> : null}</div>
    <section className="rx-sec"><h3>Qué pasó</h3><p style={{ margin: 0 }}>{report.description || "Sin detalle."}</p></section>
    {report.workDescription ? <section className="rx-sec"><h3>Qué se reparó</h3><p style={{ margin: 0 }}>{report.workDescription}{report.observations ? ` · ${report.observations}` : ""}</p></section> : null}
    <dl className="rx-dl"><div><dt>Empezó</dt><dd>{report.startedAt ? whenText(report.startedAt) : "—"}</dd></div><div><dt>Solucionado</dt><dd>{report.resolvedAt ? whenText(report.resolvedAt) : "—"}</dd></div><div><dt>Tiempo total</dt><dd>{hours(report.createdAt, report.resolvedAt) != null ? `${hours(report.createdAt, report.resolvedAt)} h` : "—"}</dd></div></dl>
    {open ? <section className="rx-sec"><h3>{report.requiresReceptionAcceptance && !report.receptionAcceptedAt ? "Aceptar y asignar técnico" : "Técnico"}</h3>{technicians.length ? <div style={{ display: "flex", gap: 8 }}><select className="rx-select" value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="">Elige el técnico</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="rx-btn rx-btn--primary" type="button" disabled={busy || !technician} onClick={assign}>Asignar</button></div> : <Alert tone="warn">Nadie de Mantenimiento marcó entrada: solo se asigna a quien está en turno.</Alert>}</section> : null}
    <section className="rx-sec"><h3>Fotos ({photos.length})</h3>{photos.length ? <div className="op-photos">{photos.map((item, index) => <div key={item.id || index} className="op-photo is-done"><a href={photoSrc(item)} target="_blank" rel="noreferrer"><img src={photoSrc(item)} alt={item.description || "Foto"} /></a><span><Camera size={12} />{item.stage === "ANTES" ? "Antes" : item.stage === "DESPUES" ? "Después" : "Del reporte"}</span></div>)}</div> : <p className="mut" style={{ margin: 0 }}>Sin fotos.</p>}</section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function NewReport({ onClose, onDone }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState({ location: "", type: "MANTENIMIENTO", priority: "MEDIA", description: "" });
  const save = () => { if (!form.location.trim() || !form.description.trim()) { setError("Pon el lugar y qué pasó."); return; } run(async () => { const report = await api("/reports", { method: "POST", body: { ...form, area: "MANTENIMIENTO", requiresMaintenance: true } }); show(`Incidencia ${report.code} registrada. Asígnale un técnico.`); onDone(); }); };
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Nueva incidencia" title="Reportar algo para reparar" footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>Registrar</button></>}>
    <div className="ow-form">
      <Field label="Lugar" full><input className="rx-input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Ej. Habitación 204, piscina, cocina" /></Field>
      <Field label="Tipo"><select className="rx-select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="MANTENIMIENTO">Mantenimiento</option><option value="DANO_INFRAESTRUCTURA">Daño de infraestructura</option><option value="DANO_EQUIPO">Equipo malogrado</option></select></Field>
      <Field label="Prioridad"><select className="rx-select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></Field>
      <Field label="Qué pasó" full><textarea className="rx-input" style={{ height: 90, paddingTop: 8 }} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
    </div>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
