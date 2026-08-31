import { AlertTriangle, BedDouble, Camera, CheckCircle2, Clock, Eye, FileWarning, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, PageHeader } from "../../components/ui";
import { apiOrigin } from "../../config/api";
import { useFetch } from "../../hooks/useFetch";
import { api, getToken } from "../../services/api";

const API_ROOT = apiOrigin;

export function AdminCleaningPage({ view = "resumen" }) {
  const { data, loading, reload } = useFetch("/reception/tasks", { initialData: [] });
  const { data: employeesData } = useFetch("/reception/cleaning-employees", { initialData: [] });
  const [selected, setSelected] = useState(null);
  const [inspected, setInspected] = useState(null);
  const tasks = Array.isArray(data) ? data : [];
  const employees = Array.isArray(employeesData) ? employeesData : [];
  const reports = useMemo(() => tasks.flatMap((task) => (task.operationalReports || []).map((report) => ({ ...report, task }))), [tasks]);
  const visibleTasks = useMemo(() => filterTasks(view, tasks), [view, tasks]);
  const pendingCustomerTasks = useMemo(() => tasks.filter((task) => task.requestId && task.requiresReceptionAcceptance && !task.receptionAcceptedAt && task.status !== "FINALIZADA"), [tasks]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrador"
        title={pageTitle(view)}
        description="Asigna cada habitación a una cuenta de Limpieza, revisa sus fotos reales y valida el resultado. El trabajador ejecuta la tarea desde su estación móvil."
      />

      {pendingCustomerTasks.length ? <section className="flex flex-col gap-3 border border-amber-300 bg-amber-50 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-button bg-amber-500 text-white"><AlertTriangle size={20} /></span><div><p className="text-xs font-black uppercase tracking-wide text-amber-800">Solicitud de huésped</p><h2 className="font-black text-park-dark">{pendingCustomerTasks.length} {pendingCustomerTasks.length === 1 ? "solicitud espera" : "solicitudes esperan"} aceptación de Recepción</h2><p className="text-sm text-park-muted">El personal de Limpieza ya recibió la alerta. Confirma el responsable para habilitar el inicio.</p></div></div><Button onClick={() => setSelected(pendingCustomerTasks[0])} type="button">Revisar y aceptar</Button></section> : null}

      {view === "resumen" ? <CleaningWorkspace reports={reports} tasks={tasks} inspected={inspected} onInspect={setInspected} onManage={setSelected} /> : null}
      {["pendientes", "finalizadas"].includes(view) ? <TaskGrid tasks={visibleTasks} onSelect={setSelected} /> : null}
      {view === "evidencias" ? <EvidenceList tasks={tasks.filter((task) => task.evidences?.length)} onSelect={setSelected} /> : null}
      {view === "incidencias" ? <IncidentList reports={reports} onSelect={(report) => setSelected(report.task)} /> : null}

      {selected ? <CleaningDetail task={selected} employees={employees} onClose={() => setSelected(null)} onSaved={async () => { setSelected(null); await reload(); }} /> : null}
    </div>
  );
}

function CleaningWorkspace({ tasks, reports, inspected, onInspect, onManage }) {
  const [tab, setTab] = useState("FINALIZADA");
  const pending = tasks.filter((task) => task.status === "PENDIENTE");
  const inProgress = tasks.filter((task) => task.status === "EN_LIMPIEZA");
  const finished = tasks.filter((task) => task.status === "FINALIZADA");
  const withIncidents = tasks.filter((task) => task.operationalReports?.length);
  const tabs = [
    ["PENDIENTE", "Por atender", pending],
    ["EN_LIMPIEZA", "En limpieza", inProgress],
    ["FINALIZADA", "Limpiadas", finished],
    ["INCIDENCIAS", "Incidencias", withIncidents]
  ];
  const rows = (tabs.find(([key]) => key === tab)?.[2] || []).slice(0, 12);
  const detail = inspected || rows[0] || tasks[0] || null;
  const metrics = [
    [Clock, "Por atender", pending.length, "bg-amber-50 text-amber-700"],
    [BedDouble, "En limpieza", inProgress.length, "bg-blue-50 text-blue-700"],
    [CheckCircle2, "Limpiadas hoy", finished.filter((task) => isToday(task.finishedAt)).length, "bg-park-green-soft text-park-green"],
    [AlertTriangle, "Con incidencias", withIncidents.length, "bg-red-50 text-park-danger"]
  ];

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([Icon, label, value, tone]) => <article className="border border-park-border bg-white p-5 shadow-card" key={label}><span className={`grid h-11 w-11 place-items-center rounded-button ${tone}`}><Icon size={20} /></span><p className="mt-4 text-sm font-semibold text-park-muted">{label}</p><strong className="font-display text-3xl text-park-dark">{value}</strong><p className="text-xs text-park-muted">Habitaciones</p></article>)}
        </section>

        <section className="border border-park-border bg-white shadow-card">
          <div className="flex overflow-x-auto border-b border-park-border">
            {tabs.map(([key, label, items]) => <button className={`min-w-max border-b-2 px-5 py-4 text-sm font-black ${tab === key ? "border-park-green text-park-green" : "border-transparent text-park-muted hover:text-park-dark"}`} key={key} onClick={() => setTab(key)} type="button">{label} ({items.length})</button>)}
          </div>
          <div className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold text-park-dark">{tabs.find(([key]) => key === tab)?.[1]} de habitaciones</h2><p className="text-sm text-park-muted">Control operativo y evidencias recibidas desde la estación de limpieza.</p></div><input className="h-10 w-full max-w-56 rounded-input border border-park-border px-3 text-sm outline-none focus:border-park-green" placeholder="Buscar habitación..." /></div>
            {tab === "INCIDENCIAS" ? (
              <IncidentList reports={reports} onSelect={onInspect} />
            ) : rows.length ? <div className="overflow-x-auto border border-park-border"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-park-bg text-xs uppercase text-park-muted"><tr><th className="px-4 py-3">Habitación</th><th>Tipo</th><th>Trabajador</th><th>Estado</th><th>Fotos</th><th>Incidencia</th><th>Resultado</th><th></th></tr></thead><tbody className="divide-y divide-park-border">{rows.map((task) => <tr className="cursor-pointer hover:bg-park-green-soft/30" key={task.id} onClick={() => onInspect(task)}><td className="px-4 py-4 font-black text-park-green">{task.room?.number || "-"}</td><td>{task.requestId ? "Solicitada" : "Check-out"}</td><td><WorkerLabel name={task.assignedTo} /></td><td><StatusBadge value={task.status} /></td><td>{task.evidences?.length || 0}</td><td>{task.operationalReports?.length ? <span className="font-semibold text-park-danger">{task.operationalReports.length} reporte(s)</span> : <span className="text-park-green">-</span>}</td><td><StatusBadge value={task.status === "FINALIZADA" ? "FINALIZADA" : task.status} /></td><td className="pr-4"><Button icon={Eye} onClick={(event) => { event.stopPropagation(); onManage(task); }} size="sm" type="button" variant="secondary">Ver detalle</Button></td></tr>)}</tbody></table></div> : <EmptyState title="Sin habitaciones en este estado" description="Las nuevas tareas aparecerán aquí automáticamente." />}
          </div>
        </section>
      </div>
      <CleaningInspector reports={reports} task={detail} onManage={onManage} />
    </section>
  );
}

function CleaningInspector({ task, reports, onManage }) {
  if (!task) return <aside className="border border-park-border bg-white p-5 shadow-card"><EmptyState title="Selecciona una habitación" description="Aquí se mostrará el detalle operativo de limpieza." /></aside>;
  const relatedReports = reports.filter((report) => Number(report.task?.id) === Number(task.id));
  return <aside className="h-fit border border-park-border bg-white shadow-card xl:sticky xl:top-5"><div className="flex items-start justify-between border-b border-park-border p-5"><div><p className="text-xs font-black uppercase text-park-gold">Detalle operativo</p><h2 className="font-display text-2xl font-semibold text-park-dark">Habitación {task.room?.number}</h2></div><StatusBadge value={task.status} /></div><div className="space-y-5 p-5"><div className="grid gap-3 text-sm"><DetailLine label="Tipo de limpieza" value={task.requestId ? "Solicitada" : "Check-out"} /><DetailLine label="Trabajador" value={task.assignedTo || "Sin asignar"} /><DetailLine label="Inicio" value={formatDateTime(task.startedAt)} /><DetailLine label="Finalización" value={formatDateTime(task.finishedAt)} /></div><div className="border-t border-park-border pt-4"><div className="mb-3 flex justify-between"><h3 className="font-black text-park-dark">Evidencias ({task.evidences?.length || 0})</h3><span className="text-sm font-semibold text-park-green">Revisar</span></div><div className="grid grid-cols-4 gap-2">{task.evidences?.slice(0, 4).map((item) => <Thumb evidence={item} key={item.id} large />) || null}</div>{!task.evidences?.length ? <p className="text-sm text-park-muted">Aún no se adjuntaron fotografías.</p> : null}</div><div className="border-t border-park-border pt-4"><h3 className="mb-3 font-black text-park-dark">Incidencias reportadas</h3>{relatedReports.length ? relatedReports.map((report) => <div className="mb-2 border border-amber-200 bg-amber-50 p-3 text-sm" key={report.id}><p className="font-bold text-amber-800">{report.description}</p><p className="mt-1 text-xs text-park-muted">{formatDateTime(report.createdAt)}</p></div>) : <p className="text-sm text-park-muted">Sin incidencias registradas.</p>}</div><Button className="w-full" onClick={() => onManage(task)} type="button">Gestionar habitación</Button></div></aside>;
}

function WorkerLabel({ name }) { const initials = String(name || "Sin asignar").split(" ").map((word) => word[0]).join("").slice(0, 2); return <span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-park-green text-[10px] font-black text-white">{initials}</span>{name || "Sin asignar"}</span>; }
function DetailLine({ label, value }) { return <div className="flex items-center justify-between gap-3"><span className="text-park-muted">{label}</span><strong className="text-right text-park-dark">{value || "No registrado"}</strong></div>; }

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

function CleaningDetail({ task, employees, onClose, onSaved }) {
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(task.assignedEmployeeId ? String(task.assignedEmployeeId) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (selectedEvidence) setSelectedEvidence(null);
      else onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selectedEvidence]);
  async function assign() { setBusy(true); try { await api(`/reception/tasks/${task.id}/assign`, { method: "PATCH", body: { employeeId: Number(assignedEmployeeId) } }); await onSaved(); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside aria-modal="true" className="max-h-[88vh] w-[min(1100px,90vw)] max-w-none overflow-auto rounded-card bg-white p-5 shadow-drawer" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h3 className="font-sans text-2xl font-black text-park-black">Habitacion {task.room?.number}</h3><StatusBadge value={task.status} /></div>
            <p className="mt-2 text-sm text-park-muted">Tipo: {task.room?.type?.name || "No registrado"} <span className="mx-2">•</span> Servicio: {task.requestId ? "Solicitado" : "Check-out"} <span className="mx-2">•</span> Prioridad: {task.priority || "MEDIA"}</p>
          </div>
          <button aria-label="Cerrar detalle" className="grid h-10 w-10 place-items-center rounded-button border border-park-border text-park-muted hover:text-park-dark" onClick={onClose} type="button"><X size={19} /></button>
        </div>
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <section className="rounded-card border border-park-border bg-white p-3.5">
              <h2 className="mb-2 font-sans text-base font-black text-park-black">Informacion general</h2>
              <div className="divide-y divide-park-border border-y border-park-border">
                <CompactDetailRow label="Tipo" value={task.room?.type?.name || "No registrado"} />
                <CompactDetailRow label="Prioridad" value={<StatusBadge value={task.priority} />} />
                <CompactDetailRow label="Estado" value={<StatusBadge value={task.status} />} />
                <CompactDetailRow label="Empleado" value={task.assignedTo || "Sin asignar"} />
                <CompactDetailRow label="Inicio" value={formatDateTime(task.startedAt)} />
                <CompactDetailRow label="Finalización" value={formatDateTime(task.finishedAt)} />
                <CompactDetailRow label="Duración" value={task.startedAt && task.finishedAt ? formatDuration(task.startedAt, task.finishedAt) : "No registrado"} />
              </div>
            </section>
            {task.status === "PENDIENTE" && (
              <section className="rounded-card border border-park-border bg-white p-3.5">
                <h2 className="mb-2 font-sans text-base font-black text-park-black">Asignación y revisión</h2>
                {message ? <p className="mb-3 rounded-card bg-red-50 p-3 text-sm font-semibold text-park-danger">{message}</p> : null}
                <label className="block text-sm font-black text-park-black">Cuenta de Limpieza<select className="mt-1 h-9 w-full rounded-input border border-park-border px-3 text-sm font-normal" value={assignedEmployeeId} onChange={(event) => setAssignedEmployeeId(event.target.value)} disabled={task.status === "FINALIZADA"}><option value="">Selecciona al responsable</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                <div className="mt-2 divide-y divide-park-border border-y border-park-border"><CompactDetailRow label="Trabajador" value={task.assignedTo || "Sin asignar"} /><CompactDetailRow label="Estado tarea" value={<StatusBadge value={task.status} />} /></div>
                {task.status !== "FINALIZADA" ? <Button className="mt-2 w-full" disabled={busy || !assignedEmployeeId} onClick={assign} type="button" variant="secondary">{task.requiresReceptionAcceptance && !task.receptionAcceptedAt ? "Aceptar y enviar a Limpieza" : "Actualizar responsable"}</Button> : <p className="mt-2 rounded-card bg-park-green-soft p-2 text-sm font-black text-park-green">Tarea terminada por {task.assignedTo || "el trabajador asignado"}.</p>}
              </section>
            )}
          </div>
          <section className="min-w-0 rounded-card border border-park-border bg-white p-4">
            <h2 className="font-sans text-lg font-black text-park-black">Evidencias</h2>
            <p className="mb-4 mt-1 text-sm text-park-muted">Fotografías registradas desde la operación de Limpieza.</p>
            <div className="max-h-[510px] overflow-y-auto pr-1"><EvidenceComparison evidences={task.evidences || []} onSelect={setSelectedEvidence} selectedId={selectedEvidence?.id} /></div>
          </section>
        </div>
      </aside>
      {selectedEvidence ? <EvidencePreview evidence={selectedEvidence} task={task} onClose={() => setSelectedEvidence(null)} /> : null}
    </div>
  );
}

function EvidenceComparison({ evidences, onSelect, selectedId }) {
  const groups = groupEvidenceByArea(evidences);
  if (!groups.length) return <p className="rounded-card bg-park-bg p-3 text-sm text-park-muted">Aún no se registraron evidencias.</p>;
  return <div className="space-y-5">{groups.map((group) => <section className="border-b border-park-border pb-5 last:border-0 last:pb-0" key={group.area}><p className="mb-3 text-sm font-black text-park-green">{group.area}</p><div className="grid grid-cols-2 gap-4"><EvidenceColumn evidences={group.entry} label="Entrada" onSelect={onSelect} selectedId={selectedId} /><EvidenceColumn evidences={group.exit} label="Salida" onSelect={onSelect} selectedId={selectedId} /></div></section>)}</div>;
}

function EvidenceColumn({ evidences, label, onSelect, selectedId }) {
  return <div><p className="mb-2 text-sm font-black text-park-dark">{label}</p>{evidences.length ? <div className="space-y-4">{evidences.map((evidence) => <EvidenceTile evidence={evidence} key={evidence.id} onSelect={onSelect} selected={evidence.id === selectedId} />)}</div> : <div className="grid aspect-video place-items-center rounded-card border border-dashed border-park-border bg-park-bg px-3 text-center text-sm text-park-muted">Sin evidencia registrada</div>}</div>;
}

function EvidenceTile({ evidence, onSelect, selected }) {
  return <button className="group block w-full text-left" onClick={() => onSelect(evidence)} type="button"><img alt={`Evidencia de ${evidenceStage(evidence)}`} className={`aspect-video w-full rounded-card border object-cover transition group-hover:border-park-green ${selected ? "border-park-green ring-2 ring-park-green/20" : "border-park-border"}`} src={`${API_ROOT}${evidence.imageUrl || evidence.fileUrl}`} /><span className="mt-2 block text-xs font-semibold text-park-muted"><Clock size={12} className="mr-1 inline" />{formatDateTime(evidence.createdAt)}</span></button>;
}

function EvidencePreview({ evidence, task, onClose }) {
  const stage = evidenceStage(evidence);
  const comment = String(evidence.description || evidence.notes || "").replace(/^(ENTRADA|SALIDA):\s*/i, "").trim();
  return (
    <section aria-modal="true" className="fixed inset-x-4 bottom-4 z-50 max-h-[calc(100vh-2rem)] overflow-auto rounded-card bg-white shadow-drawer md:inset-x-auto md:right-8 md:top-1/2 md:w-[420px] md:-translate-y-1/2" role="dialog">
        <div className="flex items-start justify-between p-5">
          <div><p className="font-sans text-lg font-black text-park-black">{evidenceArea(evidence)} · {stage}</p><p className="mt-1 text-sm text-park-muted"><Clock size={14} className="mr-1 inline" />{formatDateTime(evidence.createdAt)}</p></div>
          <button aria-label="Cerrar foto" className="grid h-9 w-9 place-items-center rounded-button border border-park-border" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <img alt={`Evidencia de ${stage}`} className="max-h-[46vh] w-full object-cover" src={`${API_ROOT}${evidence.imageUrl || evidence.fileUrl}`} />
        <div className="space-y-3 p-5">
          <WorkerLabel name={task.assignedTo} />
          <p className="-mt-2 text-xs text-park-muted">Trabajador asignado a la tarea</p>
          <div className="border border-park-border bg-park-bg p-3 text-sm">
            <p className="text-xs font-black uppercase text-park-muted">Comentario de {stage.toLowerCase()}</p>
            <p className="mt-1 leading-6 text-park-dark">{comment || "Sin comentario registrado"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-park-border pt-3 text-sm">
            <DetailLine label="Área" value={evidenceArea(evidence)} />
            <DetailLine label="Evidencia" value={stage} />
          </div>
          <Button className="w-full" onClick={onClose} type="button" variant="secondary">Cerrar</Button>
        </div>
    </section>
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

function Panel({ title, children, className = "" }) {
  return <section className={`rounded-card border border-park-border bg-white p-5 shadow-card ${className}`}><h2 className="mb-4 font-sans text-lg font-black text-park-black">{title}</h2>{children}</section>;
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

function evidenceArea(evidence) {
  return String(evidence?.area || "").trim().toUpperCase() || "EVIDENCIAS GENERALES";
}

function evidenceStage(evidence) {
  if (String(evidence?.stage || "").toUpperCase() === "SALIDA") return "Salida";
  if (String(evidence?.stage || "").toUpperCase() === "ENTRADA") return "Entrada";
  return /salida/i.test(evidence?.description || evidence?.notes || "") ? "Salida" : "Entrada";
}

function groupEvidenceByArea(evidences = []) {
  const groups = new Map(["BAÑO", "CUARTO", "REFRI / DESPENSA"].map((area) => [area, { area, entry: [], exit: [] }]));
  evidences.forEach((evidence) => {
    const area = evidenceArea(evidence);
    if (!groups.has(area)) groups.set(area, { area, entry: [], exit: [] });
    const stage = evidenceStage(evidence) === "Salida" ? "exit" : "entry";
    groups.get(area)[stage].push(evidence);
  });
  const order = ["BAÑO", "CUARTO", "REFRI / DESPENSA", "EVIDENCIAS GENERALES"];
  return Array.from(groups.values()).sort((first, second) => {
    const firstIndex = order.indexOf(first.area);
    const secondIndex = order.indexOf(second.area);
    return (firstIndex < 0 ? order.length : firstIndex) - (secondIndex < 0 ? order.length : secondIndex);
  });
}

function CompactDetailRow({ label, value }) {
  return <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 py-1 text-sm"><span className="text-park-muted">{label}</span><strong className="break-words text-right text-park-dark">{value || "No registrado"}</strong></div>;
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
    resumen: "Habitaciones y evidencias",
    pendientes: "Tareas de habitación pendientes",
    finalizadas: "Tareas de habitación finalizadas",
    evidencias: "Evidencias recibidas por WhatsApp",
    incidencias: "Novedades de habitaciones"
  };
  return titles[view] || titles.resumen;
}

async function uploadWhatsappEvidence(file) {
  const response = await fetch(`${API_ROOT}/api/cleaning/evidence/upload`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": file.type }, body: file });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "No se pudo subir la foto");
  return { fileUrl: data.fileUrl, imageUrl: data.fileUrl, originalName: file.name };
}

function formatDateTime(value) {
  if (!value) return "No registrado";
  return new Date(value).toLocaleString("es-PE");
}

function formatDuration(startedAt, finishedAt) {
  const milliseconds = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "No registrado";
  const minutes = Math.round(milliseconds / 60000);
  return `${minutes} min`;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}
