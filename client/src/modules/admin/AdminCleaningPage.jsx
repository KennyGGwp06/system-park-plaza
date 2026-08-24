import { AlertTriangle, BedDouble, Camera, CheckCircle2, Clock, Eye, FileWarning, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, PageHeader } from "../../components/ui";
import { apiOrigin } from "../../config/api";
import { useFetch } from "../../hooks/useFetch";

const API_ROOT = apiOrigin;

export function AdminCleaningPage({ view = "resumen" }) {
  const { data, loading } = useFetch("/cleaning/tasks", { initialData: [] });
  const [selected, setSelected] = useState(null);
  const tasks = Array.isArray(data) ? data : [];
  const reports = useMemo(() => tasks.flatMap((task) => (task.operationalReports || []).map((report) => ({ ...report, task }))), [tasks]);
  const visibleTasks = useMemo(() => filterTasks(view, tasks), [view, tasks]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrador"
        title={pageTitle(view)}
        description="Supervisa el estado de limpieza del hotel sin interferir con el flujo operativo del empleado."
      />

      {view === "resumen" ? <CleaningSummary reports={reports} tasks={tasks} onSelect={setSelected} /> : null}
      {["pendientes", "finalizadas"].includes(view) ? <TaskGrid tasks={visibleTasks} onSelect={setSelected} /> : null}
      {view === "evidencias" ? <EvidenceList tasks={tasks.filter((task) => task.evidences?.length)} onSelect={setSelected} /> : null}
      {view === "incidencias" ? <IncidentList reports={reports} onSelect={(report) => setSelected(report.task)} /> : null}

      {selected ? <CleaningDetail task={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function CleaningSummary({ tasks, reports, onSelect }) {
  const pending = tasks.filter((task) => task.status === "PENDIENTE");
  const inProgress = tasks.filter((task) => task.status === "EN_LIMPIEZA");
  const finishedToday = tasks.filter((task) => task.status === "FINALIZADA" && isToday(task.finishedAt));
  const priorityCounts = countBy(tasks, "priority");
  const statusCounts = countBy(tasks, "status");
  const recentReports = reports.slice(0, 4);
  const recentActivity = tasks
    .filter((task) => task.startedAt || task.finishedAt || task.evidences?.length)
    .slice(0, 5);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Clock} label="Pendientes" tone="gold" value={pending.length} />
        <Metric icon={BedDouble} label="En revision" tone="blue" value={inProgress.length} />
        <Metric icon={CheckCircle2} label="Finalizadas hoy" tone="green" value={finishedToday.length} />
        <Metric icon={AlertTriangle} label="Incidencias" tone="red" value={reports.length} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr_1.1fr]">
        <Panel title="Estado por prioridad">
          <div className="space-y-3">
            {["CRITICA", "ALTA", "MEDIA", "BAJA"].map((priority) => (
              <ProgressLine key={priority} label={priority} total={tasks.length} value={priorityCounts[priority] || 0} />
            ))}
          </div>
        </Panel>
        <Panel title="Estado general">
          <div className="space-y-3">
            {["PENDIENTE", "EN_LIMPIEZA", "FINALIZADA"].map((status) => (
              <ProgressLine key={status} label={status.replaceAll("_", " ")} total={tasks.length} value={statusCounts[status] || 0} />
            ))}
            <ProgressLine label="Con incidencias" total={tasks.length} value={tasks.filter((task) => task.operationalReports?.length).length} />
          </div>
        </Panel>
        <Panel title="Incidencias recientes">
          {recentReports.length ? (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <button className="w-full rounded-card border border-park-border bg-park-bg p-3 text-left hover:border-park-green" key={report.id} onClick={() => onSelect(report.task)} type="button">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-park-black">Habitacion {report.room?.number || report.task?.room?.number || "-"}</p>
                      <p className="text-sm text-park-muted">{report.description}</p>
                    </div>
                    <StatusBadge value={report.priority} />
                  </div>
                </button>
              ))}
            </div>
          ) : <EmptyState title="Sin incidencias" description="No hay danos o novedades reportadas por limpieza." />}
        </Panel>
      </section>

      <Panel title="Actividad reciente">
        {recentActivity.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-park-muted"><tr><th className="py-2">Actividad</th><th>Habitacion</th><th>Empleado</th><th>Fecha</th></tr></thead>
              <tbody className="divide-y divide-park-border">
                {recentActivity.map((task) => (
                  <tr key={task.id}>
                    <td className="py-3 font-semibold text-park-black">{task.status === "FINALIZADA" ? "Finalizo revision" : task.status === "EN_LIMPIEZA" ? "Inicio revision" : "Adjunto evidencia"}</td>
                    <td>Habitacion {task.room?.number}</td>
                    <td>{task.assignedTo || "Sin asignar"}</td>
                    <td>{formatDateTime(task.finishedAt || task.startedAt || task.evidences?.[0]?.createdAt || task.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Sin actividad" description="La actividad de limpieza aparecera aqui." />}
      </Panel>
    </>
  );
}

function TaskGrid({ tasks, onSelect }) {
  if (!tasks.length) return <EmptyState title="Sin tareas" description="No hay habitaciones para esta vista." />;
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {tasks.map((task) => (
        <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={task.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-park-black">Habitacion {task.room?.number}</h3>
              <p className="text-sm font-semibold text-park-muted">{task.room?.type?.name || "Tipo no registrado"}</p>
            </div>
            <StatusBadge value={task.status} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoTile label="Empleado" value={task.assignedTo || "Sin asignar"} />
            <InfoTile label="Prioridad" value={<StatusBadge value={task.priority} />} />
            <InfoTile label="Solicitado" value={formatDateTime(task.checkoutAt || task.createdAt)} />
            <InfoTile label="Incidencias" value={task.operationalReports?.length || 0} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <EvidenceMini task={task} />
            <Button icon={Eye} onClick={() => onSelect(task)} size="sm" type="button" variant="secondary">Ver detalle</Button>
          </div>
        </article>
      ))}
    </section>
  );
}

function EvidenceList({ tasks, onSelect }) {
  if (!tasks.length) return <EmptyState title="Sin evidencias" description="Las evidencias registradas apareceran aqui." />;
  return (
    <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-park-muted"><tr><th className="py-3">Habitacion</th><th>Empleado</th><th>Entrada</th><th>Salida</th><th>Incidencias</th><th>Fecha</th><th>Accion</th></tr></thead>
          <tbody className="divide-y divide-park-border">
            {tasks.map((task) => {
              const groups = splitEvidence(task.evidences);
              return (
                <tr key={task.id}>
                  <td className="py-3 font-black text-park-black">Habitacion {task.room?.number}</td>
                  <td>{task.assignedTo || "Sin asignar"}</td>
                  <td><Thumb evidence={groups.entry[0]} /></td>
                  <td><Thumb evidence={groups.exit[0]} /></td>
                  <td>{task.operationalReports?.length ? `${task.operationalReports.length} novedad(es)` : "Sin novedades"}</td>
                  <td>{formatDateTime(task.evidences?.[0]?.createdAt || task.updatedAt)}</td>
                  <td><Button icon={Eye} onClick={() => onSelect(task)} size="sm" type="button" variant="secondary" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IncidentList({ reports, onSelect }) {
  if (!reports.length) return <EmptyState title="Sin incidencias" description="No hay danos reportados desde limpieza." />;
  return (
    <section className="grid gap-3">
      {reports.map((report) => (
        <article className="rounded-card border border-park-border bg-white p-4 shadow-card" key={report.id}>
          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_auto] lg:items-center">
            <div>
              <p className="font-black text-park-black">Habitacion {report.room?.number || report.task?.room?.number || "-"}</p>
              <p className="text-sm font-semibold text-park-muted">{report.type?.replaceAll("_", " ")}</p>
            </div>
            <div>
              <p className="font-semibold text-park-black">{report.description}</p>
              <p className="text-xs text-park-muted">Reportado por {report.reportedBy ? `${report.reportedBy.firstName} ${report.reportedBy.lastName}` : report.task?.assignedTo || "Sin asignar"} / {formatDateTime(report.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={report.priority} />
              <StatusBadge value={report.status} />
              <Button icon={Eye} onClick={() => onSelect(report)} size="sm" type="button" variant="secondary" />
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function CleaningDetail({ task, onClose }) {
  const groups = splitEvidence(task.evidences);
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 p-4">
      <aside className="ml-auto h-full max-w-5xl overflow-auto rounded-card bg-white p-5 shadow-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-park-gold">Detalle de revision</p>
            <h3 className="font-sans text-2xl font-black text-park-black">Habitacion {task.room?.number}</h3>
          </div>
          <Button onClick={onClose} size="sm" type="button" variant="secondary">Cerrar</Button>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr_1fr]">
          <Panel title="Informacion general">
            <div className="grid gap-3">
              <InfoTile label="Tipo" value={task.room?.type?.name || "No registrado"} />
              <InfoTile label="Prioridad" value={<StatusBadge value={task.priority} />} />
              <InfoTile label="Estado" value={<StatusBadge value={task.status} />} />
              <InfoTile label="Empleado" value={task.assignedTo || "Sin asignar"} />
              <InfoTile label="Inicio" value={formatDateTime(task.startedAt)} />
              <InfoTile label="Finalizacion" value={formatDateTime(task.finishedAt)} />
            </div>
          </Panel>
          <Panel title="Evidencias">
            <EvidenceBlock items={groups.entry} label="Entrada" />
            <EvidenceBlock items={groups.exit} label="Salida" />
          </Panel>
          <Panel title="Novedades / Danos">
            {task.operationalReports?.length ? (
              <div className="space-y-3">
                {task.operationalReports.map((report) => (
                  <div className="rounded-card border border-amber-200 bg-amber-50 p-3" key={report.id}>
                    <div className="flex items-start justify-between gap-2"><p className="font-black text-park-black">{report.description}</p><StatusBadge value={report.priority} /></div>
                    <p className="mt-2 text-xs text-park-muted">{formatDateTime(report.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Sin novedades" description="No se registraron danos para esta revision." />}
          </Panel>
        </div>
      </aside>
    </div>
  );
}

function EvidenceBlock({ label, items }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-black text-park-black">{label}</p>
      {items.length ? <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{items.map((item) => <Thumb evidence={item} key={item.id} large />)}</div> : <p className="rounded-card bg-park-bg p-3 text-sm text-park-muted">Sin evidencia de {label.toLowerCase()}.</p>}
    </div>
  );
}

function EvidenceMini({ task }) {
  const groups = splitEvidence(task.evidences);
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-park-muted">
      <Camera size={16} />
      Entrada {groups.entry.length} / Salida {groups.exit.length}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  const tones = {
    gold: "bg-park-gold-soft text-park-gold",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-park-green-soft text-park-green",
    red: "bg-red-50 text-park-danger"
  };
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <span className={`grid h-11 w-11 place-items-center rounded-button ${tones[tone]}`}><Icon size={20} /></span>
      <p className="mt-4 text-sm font-semibold text-park-muted">{label}</p>
      <strong className="font-display text-[28px] font-semibold text-park-dark">{value}</strong>
    </article>
  );
}

function Panel({ title, children }) {
  return <section className="rounded-card border border-park-border bg-white p-5 shadow-card"><h2 className="mb-4 font-sans text-lg font-black text-park-black">{title}</h2>{children}</section>;
}

function ProgressLine({ label, value, total }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold text-park-black">{label}</span><span className="text-park-muted">{value} / {percent}%</span></div>
      <div className="mt-2 h-2 rounded-full bg-park-bg"><div className="h-2 rounded-full bg-park-green" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function InfoTile({ label, value }) {
  return <div className="rounded-card bg-park-bg p-3"><p className="text-xs font-black uppercase text-park-muted">{label}</p><div className="mt-1 font-semibold text-park-black">{value || "No registrado"}</div></div>;
}

function Thumb({ evidence, large = false }) {
  if (!evidence) return <span className="text-sm text-park-muted">Sin foto</span>;
  return <img className={`${large ? "h-24 w-full" : "h-14 w-16"} rounded-card border border-park-border object-cover`} src={`${API_ROOT}${evidence.imageUrl || evidence.fileUrl}`} alt={evidence.description || "Evidencia"} />;
}

function splitEvidence(evidences = []) {
  const entry = evidences.filter((item) => /entrada/i.test(item.description || item.notes || ""));
  const exit = evidences.filter((item) => /salida/i.test(item.description || item.notes || ""));
  if (!entry.length && !exit.length && evidences.length) {
    return { entry: evidences.slice(-1), exit: evidences.length > 1 ? evidences.slice(0, 1) : [] };
  }
  return { entry, exit };
}

function countBy(items, key) {
  return items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] || 0) + 1 }), {});
}

function filterTasks(view, tasks) {
  if (view === "pendientes") return tasks.filter((task) => task.status !== "FINALIZADA");
  if (view === "finalizadas") return tasks.filter((task) => task.status === "FINALIZADA");
  return tasks;
}

function pageTitle(view) {
  const titles = {
    resumen: "Limpieza - Resumen general",
    pendientes: "Limpieza - Pendientes",
    finalizadas: "Limpieza - Finalizadas",
    evidencias: "Limpieza - Evidencias",
    incidencias: "Limpieza - Incidencias"
  };
  return titles[view] || titles.resumen;
}

function formatDateTime(value) {
  if (!value) return "No registrado";
  return new Date(value).toLocaleString("es-PE");
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}
