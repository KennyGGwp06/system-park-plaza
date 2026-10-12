// Limpieza y mantenimiento › Limpieza. Supervisión para el dueño y Recepción: qué habitaciones esperan limpieza, quién la
// hace, cuánto demora, las fotos de cada zona y los daños reportados. Aquí se asigna o reasigna la tarea (solo a quien
// marcó entrada) y se ordena la limpieza de una habitación. La hace la estación de Limpieza.
// Rutas: GET /api/reception/tasks, /reception/cleaning-employees, POST /reception/tasks, PATCH /reception/tasks/:id/assign.
import { useMemo, useState } from "react";
import { Camera, Plus, Sparkles } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { cleaningKind, photoSrc } from "../operaciones/OpsShell";
import { Alert, Card, ChartBox, Columns, Drawer, Empty, Field, HBars, Kpi, PageHead, Seg, Status, Tag, addDays, limaDay, todayKey, useBusy, useChartTip, useOpenId, useToast, whenText } from "./kit";

const DONE = ["FINALIZADA", "DANOS_REPORTADOS"];
const minutes = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);

export function CleaningReviewPage() {
  const tasks = useFetch("/reception/tasks", { initialData: [], realtime: true, pollInterval: 20000 });
  const employees = useFetch("/reception/cleaning-employees", { initialData: [], realtime: true, pollInterval: 30000 });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("abiertas");
  const perDay = useChartTip(), perWorker = useChartTip();
  const rows = (Array.isArray(tasks.data) ? tasks.data : []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const open_ = rows.filter((row) => !DONE.includes(row.status));
  const unassigned = open_.filter((row) => !row.assignedEmployeeId);
  const running = open_.filter((row) => row.status === "EN_LIMPIEZA");
  const today = todayKey();
  const doneToday = rows.filter((row) => DONE.includes(row.status) && limaDay(row.finishedAt) === today);
  const damaged = rows.filter((row) => row.status === "DANOS_REPORTADOS" || (row.operationalReports || []).length);
  const durations = rows.map((row) => minutes(row.startedAt, row.finishedAt)).filter((v) => v != null);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const byWorker = useMemo(() => { const map = new Map(); rows.filter((row) => DONE.includes(row.status)).forEach((row) => { const key = row.assignedTo || "Sin asignar"; map.set(key, (map.get(key) || 0) + 1); }); return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6); }, [rows]);
  const shown = filter === "abiertas" ? open_ : filter === "asignar" ? unassigned : filter === "danos" ? damaged : rows;
  const selected = rows.find((row) => String(row.id) === openId) || null;

  if (tasks.loading && !rows.length) return <LoadingSpinner label="Cargando limpieza…" />;
  return <>
    <PageHead title="Limpieza" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Ordenar limpieza</button>}>Cada tarea exige sus fotos y queda con quién la hizo y cuánto demoró. Asigna solo a quien marcó entrada hoy; si nadie la tiene asignada, la puede tomar cualquiera.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Sparkles} label="Abiertas" value={open_.length} detail={`${running.length} en curso ahora`} />
      <Kpi label="Sin responsable" value={unassigned.length} detail={employees.data?.length ? `${employees.data.length} en turno para asignar` : "Nadie de Limpieza en turno"} />
      <Kpi label="Terminadas hoy" value={doneToday.length} detail={avg != null ? `Promedio ${avg} min por tarea` : "Sin tiempos aún"} />
      <Kpi label="Con daños" value={damaged.length} detail="Reportados con foto" />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Tareas terminadas por día" subtitle="Últimos 14 días"><ChartBox><Columns values={days.map((d) => rows.filter((row) => DONE.includes(row.status) && limaDay(row.finishedAt) === d).length)} labels={days.map((d) => d.slice(8))} name="Tareas" tip={perDay.tip} highlight={[13]} everyLabel={2} />{perDay.layer}</ChartBox></Card>
      <Card title="Por trabajador" subtitle="Tareas terminadas"><ChartBox><HBars rows={byWorker} name="Tareas" tip={perWorker.tip} x0={130} tooltipLabel="Tareas" />{perWorker.layer}</ChartBox></Card>
    </div>
    <Card title="Tareas" flush tools={<Seg value={filter} onChange={setFilter} options={[["abiertas", "Abiertas", open_.length], ["asignar", "Sin responsable", unassigned.length], ["danos", "Con daños", damaged.length], ["todas", "Todas", rows.length]]} />}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Tarea</th><th>Habitación</th><th>Tipo</th><th>Prioridad</th><th>Responsable</th><th>Estado</th><th className="n">Fotos</th><th>Creada</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.room?.number || row.roomId}</td><td className="mut">{cleaningKind(row).short}</td><td><Status value={row.priority} /></td>
          <td>{row.assignedTo || <Tag tone="warn">Sin asignar</Tag>}</td><td><Status value={row.status} />{row.requiresReceptionAcceptance && !row.receptionAcceptedAt ? <> <Tag tone="warn">Por aceptar</Tag></> : null}</td>
          <td className="n">{(row.evidences || []).length}</td><td className="mut">{whenText(row.createdAt)}</td>
        </tr>)}</tbody></table></div> : <Empty icon={Sparkles} title="Sin tareas en esta vista" />}
    </Card>
    {selected ? <TaskDrawer task={selected} employees={employees.data || []} onClose={() => open(null)} onDone={() => tasks.reload()} /> : null}
    {creating ? <NewTask employees={employees.data || []} onClose={() => setCreating(false)} onDone={() => { setCreating(false); tasks.reload(); }} /> : null}
  </>;
}

function TaskDrawer({ task, employees, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [employeeId, setEmployeeId] = useState(String(task.assignedEmployeeId || ""));
  const open = !DONE.includes(task.status);
  const assign = () => run(async () => { await api(`/reception/tasks/${task.id}/assign`, { method: "PATCH", body: { employeeId: Number(employeeId) } }); show(task.requiresReceptionAcceptance && !task.receptionAcceptedAt ? "Pedido aceptado y asignado." : "Tarea asignada."); onDone(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${task.code} · ${cleaningKind(task).label}`} title={`Habitación ${task.room?.number || task.roomId}`} subtitle={task.description || ""} footer={<button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Status value={task.status} /><Status value={task.priority} />{task.assignedTo ? <Tag>{task.assignedTo}</Tag> : <Tag tone="warn">Sin asignar</Tag>}</div>
    <dl className="rx-dl"><div><dt>Creada</dt><dd>{whenText(task.createdAt)}</dd></div><div><dt>Empezó</dt><dd>{task.startedAt ? whenText(task.startedAt) : "—"}</dd></div><div><dt>Terminó</dt><dd>{task.finishedAt ? whenText(task.finishedAt) : "—"}</dd></div><div><dt>Duración</dt><dd>{minutes(task.startedAt, task.finishedAt) != null ? `${minutes(task.startedAt, task.finishedAt)} min` : "—"}</dd></div></dl>
    {open ? <section className="rx-sec"><h3>{task.requiresReceptionAcceptance && !task.receptionAcceptedAt ? "Aceptar y asignar" : "Responsable"}</h3>
      {employees.length ? <div style={{ display: "flex", gap: 8 }}><select className="rx-select" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Elige quién la hace</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name || `${item.firstName} ${item.lastName}`}</option>)}</select><button className="rx-btn rx-btn--primary" type="button" disabled={busy || !employeeId} onClick={assign}>Asignar</button></div> : <Alert tone="warn">Nadie de Limpieza marcó entrada todavía: solo se asigna a quien está en turno.</Alert>}
    </section> : null}
    <section className="rx-sec"><h3>Fotos ({(task.evidences || []).length})</h3>{(task.evidences || []).length ? <div className="op-photos">{task.evidences.map((item, index) => <div key={item.id || index} className="op-photo is-done"><a href={photoSrc(item)} target="_blank" rel="noreferrer"><img src={photoSrc(item)} alt={item.description || "Foto"} /></a><span><Camera size={12} />{[item.area, item.stage].filter(Boolean).join(" · ").toLowerCase() || "foto"}</span></div>)}</div> : <p className="mut" style={{ margin: 0 }}>Sin fotos todavía.</p>}</section>
    {(task.operationalReports || []).length ? <section className="rx-sec"><h3>Reportes</h3><ul className="rx-list">{task.operationalReports.map((report) => <li key={report.id}><div className="grow"><b>{report.code} · {String(report.type || "").replaceAll("_", " ").toLowerCase()}</b><small>{report.description}</small></div><Tag tone={report.requiresMaintenance ? "warn" : "info"}>{report.requiresMaintenance ? "A mantenimiento" : "A Recepción"}</Tag></li>)}</ul></section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function NewTask({ employees, onClose, onDone }) {
  const rooms = useFetch("/rooms", { initialData: [], realtime: true });
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState({ roomId: "", priority: "MEDIA", description: "", employeeId: "" });
  const save = () => { if (!form.roomId) { setError("Elige la habitación."); return; } run(async () => { const task = await api("/reception/tasks", { method: "POST", body: { ...form, roomId: Number(form.roomId), employeeId: form.employeeId ? Number(form.employeeId) : null } }); show(`Limpieza ${task.code} ordenada.`); onDone(); }); };
  const list = (Array.isArray(rooms.data) ? rooms.data : rooms.data?.rooms || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Nueva tarea" title="Ordenar limpieza de habitación" subtitle="Pedirá foto de entrada y de salida del cuarto, el baño y la despensa"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>Ordenar</button></>}>
    <div className="ow-form">
      <Field label="Habitación"><select className="rx-select" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}><option value="">Elige</option>{list.map((room) => <option key={room.id} value={room.id}>{room.number} · {String(room.status || "").toLowerCase().replaceAll("_", " ")}</option>)}</select></Field>
      <Field label="Prioridad"><select className="rx-select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></Field>
      <Field label="Qué hacer" full><input className="rx-input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ej. limpieza profunda antes de la llegada de las 15:00" /></Field>
      <Field label="Responsable (opcional)" full><select className="rx-select" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">La toma quien esté libre</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name || `${item.firstName} ${item.lastName}`}</option>)}</select></Field>
    </div>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
