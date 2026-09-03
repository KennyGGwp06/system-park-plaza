import { useMemo, useState } from "react";
import { Camera, CheckCircle2, Eye, FileWarning, Upload, X, Clock, AlertTriangle, ShieldCheck, MapPin, Wrench, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getToken } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, Input as UiInput, PageHeader, Select as UiSelect } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { apiOrigin } from "../../config/api";

const API_ROOT = apiOrigin;

export function CleaningPage({ view = "ALERTAS" }) {
  const { can } = useAuth();
  const { data: currentShift } = useFetch("/attendance/current", { initialData: { active: false }, realtime: true, pollInterval: 2000 });
  const shiftActive = Boolean(currentShift?.active);
  const canCreate = can("LIMPIEZA", "CREAR") && shiftActive;
  const canEdit = can("LIMPIEZA", "EDITAR") && shiftActive;
  
  const { data, loading, reload } = useFetch("/cleaning/tasks", { initialData: [], realtime: true, pollInterval: 2000 });
  const tasks = Array.isArray(data) ? data.filter((task) => task && typeof task === "object") : [];
  const [toast, setToast] = useState("");
  
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [pendingFinish, setPendingFinish] = useState(null);
  const [selected, setSelected] = useState(null);

  const pendingTasks = useMemo(() => tasks.filter(t => t.status !== "FINALIZADA").sort((a, b) => taskRank(a) - taskRank(b)), [data]);
  const activeTasks = useMemo(() => tasks.filter(t => ["EN_LIMPIEZA", "EN_ATENCION"].includes(t.status)).sort((a, b) => taskRank(a) - taskRank(b)), [data]);
  const finishedTasks = useMemo(() => tasks.filter(t => t.status === "FINALIZADA"), [data]);
  const evidenceTasks = useMemo(() => tasks.filter(t => t.evidences && t.evidences.length > 0), [data]);
  const incidents = useMemo(() => tasks.filter(t => t.operationalReports && t.operationalReports.length > 0), [data]);
  const maintenanceReports = useMemo(() => tasks.flatMap((task) => task.operationalReports || [])
    .filter((report) => report?.requiresMaintenance)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))), [tasks]);

  async function startTask(task) {
    await api(`/cleaning/tasks/${task.id}/start`, { method: "PATCH" });
    setToast(`Limpieza iniciada en habitación ${roomNumber(task)}.`);
    reload();
  }

  async function finishTask(task) {
    await api(`/cleaning/tasks/${task.id}/finish`, { method: "PATCH" });
    setToast(`Habitación ${roomNumber(task)} finalizada y disponible para Recepción.`);
    setPendingFinish(null);
    reload();
  }

  if (loading) return <LoadingSpinner />;

  const titleMap = {
    ALERTAS: "Alertas de limpieza",
    EN_ATENCION: "En atención",
    HISTORIAL: "Historial de limpieza"
  };

  return (
    <div className="space-y-4">
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader eyebrow="Limpieza" title={titleMap[view] || "Limpieza"} description="Tu estación de trabajo. Atiende solo las habitaciones asignadas a tu cuenta." />
        <Button className="w-full sm:w-auto" onClick={reload} variant="secondary">Actualizar</Button>
      </div>

      <section className={`rounded-card border p-4 sm:p-5 shadow-card ${shiftActive ? "border-park-green bg-park-green-soft" : "border-amber-300 bg-amber-50"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${shiftActive ? "bg-park-green text-white" : "bg-amber-500 text-white"}`}>
            <Clock size={24}/>
          </span>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-wider text-park-muted">Jornada de housekeeping</p>
            <h2 className="mt-0.5 text-base sm:text-lg font-black text-park-dark">{shiftActive ? "Asistencia registrada · evidencia obligatoria" : "Operación bloqueada hasta registrar asistencia"}</h2>
            <p className="mt-1 text-sm text-park-muted leading-relaxed">{shiftActive ? "Atiende por prioridad, registra foto de entrada y salida, y reporta cualquier daño a Mantenimiento." : "Marca tu ingreso en el reloj de asistencia. La estación se habilitará automáticamente, sin recargar la página."}</p>
          </div>
        </div>
      </section>

      {view === "ALERTAS" && <TaskList tasks={pendingTasks} search={search} setSearch={setSearch} startTask={startTask} finishTask={finishTask} canCreate={canCreate} canEdit={canEdit} setModal={setModal} setSelected={setSelected} setPendingFinish={setPendingFinish} />}
      {view === "EN_ATENCION" && <TaskList tasks={activeTasks} search={search} setSearch={setSearch} startTask={startTask} finishTask={finishTask} canCreate={canCreate} canEdit={canEdit} setModal={setModal} setSelected={setSelected} setPendingFinish={setPendingFinish} />}
      {view === "HISTORIAL" && <TaskList tasks={finishedTasks} search={search} setSearch={setSearch} startTask={startTask} finishTask={finishTask} canCreate={canCreate} canEdit={canEdit} setModal={setModal} setSelected={setSelected} setPendingFinish={setPendingFinish} isFinishedView />}

      {modal?.type === "evidence" && <EvidenceModal task={modal.task} onClose={() => setModal(null)} onReport={(evidenceArea) => setModal({ type: "report", task: modal.task, evidenceArea })} onSaved={() => { setModal(null); setToast("Evidencia guardada."); reload(); }} />}
      {modal?.type === "report" && <ReportModal evidenceArea={modal.evidenceArea} task={modal.task} onClose={() => setModal(null)} onSaved={() => { setModal(null); setToast("Incidencia registrada."); reload(); }} />}
      {selected ? <ReviewDetail task={selected} onClose={() => setSelected(null)} /> : null}
      
      {pendingFinish ? (
        <ConfirmDialog
          title="Evidencia requerida"
          description={isGuestRequest(pendingFinish) ? `La solicitud de la habitación ${roomNumber(pendingFinish)} requiere una foto y un comentario antes de finalizar.` : `Antes de liberar la habitación ${roomNumber(pendingFinish)}, registra evidencia de entrada y de salida.`}
          confirmLabel="Ir a registrar"
          onCancel={() => setPendingFinish(null)}
          onConfirm={() => { setModal({ type: "evidence", task: pendingFinish }); setPendingFinish(null); }}
        />
      ) : null}
    </div>
  );
}

function DashboardTab({ pending, finished, incidents, maintenanceReports }) {
  const criticas = pending.filter(t => t.priority === "CRITICA" || t.priority === "ALTA");
  const enLimpieza = pending.filter(t => t.status === "EN_LIMPIEZA");
  const nextTask = enLimpieza[0] || pending[0];
  const openMaintenance = maintenanceReports.filter((report) => !["RESUELTO", "SOLUCIONADO"].includes(report.status));
  const total = pending.length + finished.length;
  const progress = total === 0 ? 0 : Math.round((finished.length / total) * 100);

  return (
    <div className="space-y-4">
      <section className={`rounded-card border p-4 shadow-card ${nextTask ? "border-blue-200 bg-blue-50" : "border-park-green/30 bg-park-green-soft"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ${nextTask ? "bg-blue-600" : "bg-park-green"}`}><ClipboardCheck size={21}/></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-park-muted">Tu siguiente acción</p>
              <h3 className="font-black text-park-dark">{nextTask ? `${["EN_LIMPIEZA", "EN_ATENCION"].includes(nextTask.status) ? "Continúa" : "Atiende"} la habitación ${roomNumber(nextTask)}` : "No tienes habitaciones pendientes"}</h3>
              <p className="mt-1 text-sm text-park-muted">{nextTask ? `${taskKind(nextTask)} · ${nextTask.priority || "Prioridad media"}. Registra evidencia antes de liberarla.` : "La jornada está al día. Puedes revisar evidencias o las novedades reportadas."}</p>
            </div>
          </div>
          <Button as={Link} to={nextTask ? "/limpieza/pendientes" : "/limpieza/evidencias"} className="w-full sm:w-auto">{nextTask ? "Ir a la tarea" : "Ver evidencias"}</Button>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
          <p className="text-3xl font-black text-park-dark">{pending.length}</p>
          <p className="mt-1 text-sm font-semibold text-park-muted">Por atender</p>
        </article>
        <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
          <p className="text-3xl font-black text-park-green">{finished.length}</p>
          <p className="mt-1 text-sm font-semibold text-park-muted">Finalizadas hoy</p>
        </article>
        <article className="rounded-card border border-red-200 bg-red-50 p-4 shadow-card">
          <p className="text-3xl font-black text-red-600 animate-pulse">{criticas.length}</p>
          <p className="mt-1 text-sm font-semibold text-red-800">Prioridad Crítica / Alta</p>
        </article>
        <article className="rounded-card border border-amber-200 bg-amber-50 p-4 shadow-card">
          <p className="text-3xl font-black text-amber-700">{incidents.length}</p>
          <p className="mt-1 text-sm font-semibold text-amber-900">Incidencias reportadas</p>
        </article>
      </div>

      {openMaintenance.length > 0 && (
        <section className="rounded-card border border-amber-200 bg-amber-50 p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><Wrench size={19}/></span><div><p className="text-xs font-black uppercase tracking-wide text-amber-800">Mantenimiento coordinado</p><h3 className="font-black text-park-dark">{openMaintenance.length} {openMaintenance.length === 1 ? "incidencia sigue" : "incidencias siguen"} en seguimiento</h3><p className="mt-1 text-sm text-park-muted">Recepción y Superadmin revisan esta incidencia. Puedes verla desde la tarea asignada.</p></div></div>
            <Button as={Link} to="/limpieza/pendientes" variant="secondary" className="w-full sm:w-auto">Ver tareas</Button>
          </div>
        </section>
      )}

      <div className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <h3 className="text-lg font-black text-park-dark mb-4">Progreso del Turno</h3>
        <div className="w-full bg-park-bg rounded-full h-4 mb-2">
          <div className="bg-park-green h-4 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="text-sm text-park-muted font-semibold text-right">{progress}% completado ({finished.length} de {total})</p>
      </div>
      
      {enLimpieza.length > 0 && (
        <div className="rounded-card border border-blue-200 bg-blue-50 p-5 shadow-card">
          <h3 className="text-sm font-black text-blue-900 mb-3 flex items-center gap-2"><Clock size={16}/> En proceso ahora</h3>
          <div className="grid gap-2">
            {enLimpieza.map(t => (
              <div key={t.id} className="bg-white p-3 rounded-lg border border-blue-100 flex justify-between items-center">
                <div>
                  <strong className="text-blue-900">Habitación {roomNumber(t)}</strong>
                  <p className="text-xs text-blue-700 mt-1">{t.assignedTo || "Personal"} limpiando...</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskList({ tasks, search, setSearch, startTask, finishTask, canCreate, canEdit, setModal, setSelected, setPendingFinish, isFinishedView }) {
  const filtered = tasks.filter((task) => !search || task.room?.number?.includes(search));

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-park-border bg-white p-4 shadow-card flex gap-3">
        <UiInput placeholder="Buscar por número de habitación..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full md:max-w-sm" />
      </div>

      {!filtered.length ? <EmptyState title="No hay tareas" description="Todo limpio por ahora." /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((task) => (
            <article key={task.id} className={`rounded-card border-2 p-4 flex flex-col ${task.priority === "CRITICA" ? "border-red-300 bg-red-50" : task.priority === "ALTA" ? "border-amber-300 bg-amber-50" : "border-park-border bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-2xl font-black text-park-dark">Hab. {roomNumber(task)}</h3>
                  <p className="text-sm text-park-muted mt-1">{taskKind(task)} · {task.room.type?.name}</p>
                </div>
                <StatusBadge value={task.status} />
              </div>
              
              {task.priority === "CRITICA" && <p className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded inline-block w-fit mb-3 uppercase animate-pulse">Prioridad Crítica</p>}
              
              <EvidenceSummary task={task} />

              {task.requiresReceptionAcceptance && !task.receptionAcceptedAt ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-100 p-2 text-sm text-amber-900"><strong>Solicitud del huésped recibida.</strong><p className="mt-0.5 text-xs">Recepción está confirmando la asignación. Podrás iniciar en cuanto la acepte.</p></div> : null}

              {task.operationalReports?.[0] && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-100 p-2 text-sm flex gap-2 items-start">
                  <FileWarning className="text-amber-700 shrink-0 mt-0.5" size={16}/>
                  <div>
                    <strong className="text-amber-900">Incidencia registrada:</strong>
                    <p className="text-amber-800 text-xs mt-0.5">{task.operationalReports[0].description}</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-park-border/50">
                {canEdit && task.status === "PENDIENTE" && !task.requiresReceptionAcceptance && <Button className="w-full sm:w-auto text-lg py-3" onClick={() => startTask(task)}>▶ {isGuestRequest(task) ? "Atender solicitud" : "Iniciar limpieza"}</Button>}
                {canEdit && task.status === "PENDIENTE" && task.requiresReceptionAcceptance && !task.receptionAcceptedAt ? <Button className="w-full sm:w-auto text-lg py-3" disabled>Esperando confirmación</Button> : null}
                {canEdit && task.status === "PENDIENTE" && task.requiresReceptionAcceptance && task.receptionAcceptedAt ? <Button className="w-full sm:w-auto text-lg py-3" onClick={() => startTask(task)}>▶ {isGuestRequest(task) ? "Atender solicitud" : "Iniciar limpieza"}</Button> : null}
                
                {task.status !== "PENDIENTE" && !isFinishedView && canCreate && <Button type="button" variant="secondary" icon={Camera} onClick={() => setModal({ type: "evidence", task })}>{isGuestRequest(task) ? "Registrar evidencia" : "Registrar evidencias"}</Button>}
                
                {canEdit && ["EN_LIMPIEZA", "EN_ATENCION"].includes(task.status) && <Button type="button" variant="gold" onClick={() => canReleaseRoom(task) ? finishTask(task) : setPendingFinish(task)} className="w-full sm:w-auto py-3">✓ Finalizar</Button>}
                
                {isFinishedView && <Button type="button" variant="secondary" icon={Eye} onClick={() => setSelected(task)}>Ver reporte completo</Button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceGalleryTab({ tasks }) {
  if (!tasks.length) return <EmptyState title="Sin evidencias" description="Aún no se han subido fotos de limpieza." />;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tasks.map(task => {
        const groups = splitEvidence(task.evidences);
        return (
          <div key={task.id} className="rounded-card border border-park-border bg-white p-4 shadow-card">
            <h3 className="font-black text-park-dark mb-2 border-b pb-2">Habitación {roomNumber(task)}</h3>
            <EvidenceGallery label="Evidencias de Entrada" items={groups.entry} />
            <EvidenceGallery label="Evidencias de Salida" items={groups.exit} />
          </div>
        );
      })}
    </div>
  );
}

function IncidentsTab({ tasks, maintenanceReports }) {
  const taskReports = tasks.flatMap((task) => (task.operationalReports || []).map((report) => ({ ...report, roomNumber: roomNumber(task) })));
  const taskReportIds = new Set(taskReports.map((report) => Number(report.id)));
  const extraMaintenance = maintenanceReports.filter((report) => !taskReportIds.has(Number(report.id)));
  if (!taskReports.length && !extraMaintenance.length) return <EmptyState title="Sin novedades" description="No hay problemas ni solicitudes de mantenimiento registradas en esta jornada." />;
  return (
    <div className="space-y-4">
      <section className="rounded-card border border-blue-200 bg-blue-50 p-4"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><Wrench size={19}/></span><div><h3 className="font-black text-park-dark">Cómo funciona el soporte</h3><p className="mt-1 text-sm text-park-muted">Registra el problema desde la tarea. Si es mantenimiento, el sistema lo escala a Recepción para coordinar al técnico. No bloquees la habitación ni la declares lista hasta que corresponda.</p></div></div></section>
      <div className="grid gap-4 md:grid-cols-2">
        {taskReports.map((report) => <IncidentCard key={`task-${report.id}`} report={report} roomNumber={report.roomNumber} />)}
        {extraMaintenance.map((report) => <IncidentCard key={`support-${report.id}`} report={report} roomNumber={report.location || "Área reportada"} />)}
      </div>
    </div>
  );
}

function IncidentCard({ report, roomNumber: location }) {
  const maintenance = report.requiresMaintenance || ["MANTENIMIENTO", "DANO_INFRAESTRUCTURA", "DANO_EQUIPO"].includes(report.type);
  return <article className={`rounded-card border p-4 shadow-card ${maintenance ? "border-amber-200 bg-amber-50" : "border-park-border bg-white"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-muted">{maintenance ? "Mantenimiento" : "Novedad operativa"}</p><h3 className="mt-1 font-black text-park-dark">{location}</h3></div><StatusBadge value={report.priority} /></div><p className="mt-3 text-sm font-semibold text-park-dark">{report.description || "Sin detalle registrado"}</p><div className="mt-4 flex items-center justify-between gap-2 border-t border-park-border/70 pt-3"><span className="text-xs font-bold text-park-muted">{String(report.type || "INCIDENCIA").replaceAll("_", " ")}</span><StatusBadge value={report.status || (maintenance ? "ABIERTO" : "PENDIENTE")} /></div>{maintenance ? <p className="mt-3 text-xs text-amber-900">Recepción y Superadmin darán seguimiento a esta incidencia.</p> : null}</article>;
}

function EvidenceSummary({ task }) {
  const groups = splitEvidence(task.evidences);
  return (
    <div className="mt-3 grid gap-2 grid-cols-2">
      <StateTile label="Foto Entrada" value={groups.entry.length ? "Lista" : "Falta"} ok={groups.entry.length > 0} />
      <StateTile label="Foto Salida" value={groups.exit.length ? "Lista" : "Falta"} ok={groups.exit.length > 0} />
    </div>
  );
}

function StateTile({ label, value, ok }) {
  return (
    <div className={`rounded-lg border p-2 text-center ${ok ? "bg-park-green-soft border-park-green/20" : "bg-slate-100 border-slate-200"}`}>
      <p className="text-[10px] font-black uppercase text-park-muted">{label}</p>
      <p className={`mt-0.5 text-xs font-black ${ok ? "text-park-green" : "text-park-muted"}`}>{value}</p>
    </div>
  );
}

function taskKind(task) { return isGuestRequest(task) ? "Solicitud de huésped" : "Limpieza post check-out"; }
function isGuestRequest(task) { return Boolean(task?.requestId) && task?.workflowType !== "POST_CHECKOUT"; }
function roomNumber(task) { return task?.room?.number || task?.roomId || "sin asignar"; }
function taskRank(task) {
  const priority = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
  const status = ["EN_LIMPIEZA", "EN_ATENCION"].includes(task.status) ? 0 : task.status === "PENDIENTE" ? 1 : 2;
  return status * 10 + (priority[task.priority] ?? 4);
}
const cleaningAreas = ["BAÑO", "CUARTO", "REFRI / DESPENSA"];

function evidenceArea(evidence) { return String(evidence?.area || "").trim().toUpperCase(); }
function evidenceStage(evidence) {
  const stage = String(evidence?.stage || "").trim().toUpperCase();
  return stage === "SALIDA" ? "SALIDA" : stage === "ENTRADA" ? "ENTRADA" : /salida/i.test(evidence?.description || evidence?.notes || "") ? "SALIDA" : "ENTRADA";
}
function pendingEvidenceStage(evidences = []) {
  const hasStage = (area, stage) => evidences.some((item) => evidenceArea(item) === area && evidenceStage(item) === stage);
  if (!cleaningAreas.every((area) => hasStage(area, "ENTRADA"))) return "ENTRADA";
  return cleaningAreas.every((area) => hasStage(area, "SALIDA")) ? null : "SALIDA";
}
function hasRequiredCleaningEvidence(evidences = []) {
  return cleaningAreas.every((area) => ["ENTRADA", "SALIDA"].every((stage) => evidences.some((item) => evidenceArea(item) === area && evidenceStage(item) === stage)));
}
function canReleaseRoom(task) { return isGuestRequest(task) ? task.evidences?.some((item) => String(item?.description || "").trim() && (item.fileUrl || item.imageUrl)) : hasRequiredCleaningEvidence(task.evidences); }

function ReviewDetail({ task, onClose }) {
  const groups = splitEvidence(task.evidences);
  return (
    <Modal title={`Detalle de revisión - Habitación ${roomNumber(task)}`} onClose={onClose}>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <section>
          <h4 className="mb-3 font-sans text-lg font-black text-park-black">Informacion general</h4>
          <div className="grid gap-3">
            <InfoRow label="Tipo" value={task.room?.type?.name} />
            <InfoRow label="Prioridad" value={task.priority} />
            <InfoRow label="Estado" value={<StatusBadge value={task.status} />} />
            <InfoRow label="Empleado" value={task.assignedTo || "Sin asignar"} />
            <InfoRow label="Inicio" value={formatDateTime(task.startedAt)} />
            <InfoRow label="Finalizacion" value={formatDateTime(task.finishedAt)} />
          </div>
        </section>
        <section>
          <h4 className="mb-3 font-sans text-lg font-black text-park-black">Evidencias</h4>
          <EvidenceGallery label="Entrada" items={groups.entry} />
          <EvidenceGallery label="Salida" items={groups.exit} />
        </section>
      </div>

    </Modal>
  );
}

function ExpandableImage({ src, alt, className }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <img className={`${className} cursor-pointer`} src={src} alt={alt} onClick={() => setExpanded(true)} />
      {expanded && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
          <div className="relative max-h-full max-w-full">
            <button className="absolute -right-4 -top-4 grid h-8 w-8 place-items-center rounded-full bg-white text-park-black shadow-md hover:bg-gray-100" onClick={() => setExpanded(false)} type="button"><X size={16} /></button>
            <img className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" src={src} alt={alt} />
          </div>
        </div>
      )}
    </>
  );
}

function EvidenceGallery({ label, items }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-black text-park-muted uppercase">{label}</p>
      {items.length ? (
        <div className="grid grid-cols-2 gap-2">
          {items.map((evidence) => <ExpandableImage className="h-24 w-full rounded-lg border border-park-border object-cover" key={evidence.id} src={`${API_ROOT}${evidence.imageUrl || evidence.fileUrl}`} alt={evidence.description || "Evidencia"} />)}
        </div>
      ) : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-400 border border-dashed border-slate-200">No hay fotos</p>}
    </div>
  );
}

function InfoRow({ label, value }) {
  return <div className="rounded-card bg-park-bg p-3"><p className="text-[10px] font-black uppercase text-park-muted">{label}</p><div className="mt-0.5 font-semibold text-park-dark text-sm">{value || "No registrado"}</div></div>;
}

function EvidenceModal({ task, onClose, onReport, onSaved }) {
  const guestRequest = isGuestRequest(task);
  const [area, setArea] = useState("BAÑO");
  const [drafts, setDrafts] = useState(() => Object.fromEntries(cleaningAreas.map((item) => [item, { files: [], description: "" }])));
  const [guestDraft, setGuestDraft] = useState({ files: [], description: "" });
  const [busy, setBusy] = useState(false);
  const stage = pendingEvidenceStage(task.evidences);
  const areaPhotos = task.evidences.filter((item) => evidenceArea(item) === area);
  const pendingAreas = cleaningAreas.filter((item) => !task.evidences.some((evidence) => evidenceArea(evidence) === item && evidenceStage(evidence) === stage));
  const currentDraft = drafts[area];
  const readyToSave = Boolean(stage) && pendingAreas.every((item) => drafts[item].files.length && drafts[item].description.trim());

  function updateDraft(areaName, next) {
    setDrafts((current) => ({ ...current, [areaName]: { ...current[areaName], ...next } }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (guestRequest) {
        const uploaded = await uploadImages(guestDraft.files);
        await api(`/cleaning/tasks/${task.id}/evidence`, { method: "POST", body: { description: guestDraft.description.trim(), files: uploaded } });
        onSaved();
        return;
      }
      if (!stage) return;
      for (const areaName of pendingAreas) {
        const draft = drafts[areaName];
        const uploaded = await uploadImages(draft.files);
        await api(`/cleaning/tasks/${task.id}/evidence`, { method: "POST", body: { area: areaName, stage, description: `${stage}: ${draft.description.trim()}`, files: uploaded } });
      }
      onSaved();
    } catch(e) {
      alert("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${guestRequest ? "Evidencia de solicitud" : "Evidencias"} · Habitación ${roomNumber(task)}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {guestRequest ? <>
          <div className="rounded-card border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Solicitud del huésped</strong><p className="mt-1 text-xs">Registra una foto y un comentario que demuestren que se atendió únicamente lo solicitado.</p></div>
          <p className="rounded-card bg-park-bg p-3 text-sm text-park-dark"><strong>Pedido:</strong> {task.description || task.serviceType || "Solicitud de habitación"}</p>
          <ImagePicker files={guestDraft.files} setFiles={(files) => setGuestDraft((current) => ({ ...current, files }))} />
          <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Describe qué se entregó o realizó..." value={guestDraft.description} onChange={(event) => setGuestDraft((current) => ({ ...current, description: event.target.value }))} required />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy || !guestDraft.files.length || !guestDraft.description.trim()} loading={busy}>Guardar evidencia</Button></div>
        </> : <>
        <label className="block text-sm font-black text-park-dark">Área fotografiada
          <select className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="BAÑO">Baño</option>
            <option value="CUARTO">Cuarto</option>
            <option value="REFRI / DESPENSA">Refri / despensa</option>
          </select>
        </label>
        <div className={`rounded-card border p-3 text-sm ${stage === "ENTRADA" ? "border-blue-200 bg-blue-50 text-blue-900" : stage === "SALIDA" ? "border-park-green/30 bg-park-green-soft text-park-dark" : "border-park-border bg-park-bg text-park-muted"}`}><strong>{stage ? `${stage === "ENTRADA" ? "Registro de entrada" : "Registro de salida"} · completa las tres áreas` : "Evidencias completas"}</strong><p className="mt-1 text-xs">{stage === "ENTRADA" ? "Carga fotos y comentario de baño, cuarto y despensa. Al final se guardarán todas juntas." : stage === "SALIDA" ? "Las entradas ya están registradas. Carga ahora las tres salidas y guárdalas en un solo paso." : "La limpieza ya tiene todas las evidencias requeridas."}</p></div>
        {stage ? <div className="grid grid-cols-3 gap-2">{cleaningAreas.map((areaName) => <button className={`rounded-card border p-2 text-left text-xs font-black ${area === areaName ? "border-park-green bg-park-green-soft text-park-dark" : drafts[areaName].files.length && drafts[areaName].description.trim() ? "border-blue-200 bg-blue-50 text-blue-800" : "border-park-border bg-white text-park-muted"}`} key={areaName} onClick={() => setArea(areaName)} type="button"><span className="block">{areaName}</span><span className="mt-1 block text-[10px] font-semibold">{task.evidences.some((item) => evidenceArea(item) === areaName && evidenceStage(item) === stage) ? "Guardada" : drafts[areaName].files.length ? "Lista para guardar" : "Pendiente"}</span></button>)}</div> : null}
        {areaPhotos.length ? <div className="grid grid-cols-3 gap-2">{areaPhotos.map((photo) => <ExpandableImage alt={`${area} ${evidenceStage(photo)}`} className="aspect-video w-full rounded-card border border-park-border object-cover" key={photo.id} src={`${API_ROOT}${photo.imageUrl || photo.fileUrl}`} />)}</div> : null}
        {stage ? <><ImagePicker files={currentDraft.files} setFiles={(files) => updateDraft(area, { files })} /><textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder={`Comentario sobre ${area.toLowerCase()}...`} value={currentDraft.description} onChange={(event) => updateDraft(area, { description: event.target.value })} /><p className="text-xs font-semibold text-park-muted">Añade fotos y comentario en cada área antes de guardar el lote.</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>{stage === "ENTRADA" ? <Button type="button" variant="danger" icon={FileWarning} onClick={() => onReport(area)}>Reportar daño</Button> : null}<Button disabled={busy || !readyToSave} loading={busy}>{stage === "ENTRADA" ? "Guardar entrada" : "Guardar salida"}</Button></div></> : <div className="flex justify-end"><Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button></div>}
        </>}
      </form>
    </Modal>
  );
}

function ReportModal({ task, evidenceArea, onClose, onSaved }) {
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({ type: "DANO_INFRAESTRUCTURA", priority: "ALTA", description: "" });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const uploaded = files.length ? await uploadImages(files) : [];
      await api(`/cleaning/tasks/${task.id}/report`, { method: "POST", body: { ...form, evidenceArea, files: uploaded } });
      onSaved();
    } catch(e){
      alert("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reportar daño o incidencia (Hab. ${roomNumber(task)})`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {evidenceArea ? <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Daño detectado en: {evidenceArea}. Los daños de infraestructura o equipos se enviarán a Recepción para su validación y asignación a Mantenimiento.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Categoría" value={form.type} onChange={(type) => setForm({ ...form, type })} options={["DANO_INFRAESTRUCTURA", "MANTENIMIENTO", "OBJETO_PERDIDO", "FALTA_INSUMO", "INCIDENCIA", "OTRO"]} />
          <Select label="Gravedad" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} options={["BAJA", "MEDIA", "ALTA", "CRITICA"]} />
        </div>
        <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Detalle qué está mal..." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        <ImagePicker files={files} setFiles={setFiles} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" disabled={busy} loading={busy}>Enviar reporte</Button></div>
      </form>
    </Modal>
  );
}

function ImagePicker({ files, setFiles }) {
  const previews = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
  return (
    <div>
      <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-park-green bg-park-green-soft text-park-green p-4 font-black transition-colors hover:bg-park-green hover:text-white">
        <Camera size={40} className="mb-2" />
        <span className="text-lg">Tomar foto / Seleccionar</span>
        <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => setFiles([...files, ...Array.from(event.target.files || [])])} />
      </label>
      {previews.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{previews.map(({ file, url }) => <div key={url} className="relative"><img className="h-20 w-24 rounded-lg object-cover" src={url} alt={file.name} /><button type="button" className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white" onClick={() => setFiles(files.filter((item) => item !== file))}><X size={14} /></button></div>)}</div>}
    </div>
  );
}

async function uploadImages(files) {
  if (!files.length) return [];
  const supported = new Set(["image/jpeg", "image/png", "image/webp"]);
  const uploaded = [];
  for (const file of files) {
    if (!supported.has(file.type)) throw new Error(`${file.name}: usa una imagen JPG, PNG o WEBP.`);
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: la imagen supera el límite de 10 MB.`);
    const response = await fetch(`${API_ROOT}/api/cleaning/evidence/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name)
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `No fue posible subir ${file.name}.`);
    uploaded.push(...(data.files || []));
  }
  return uploaded;
}

function Modal({ title, children, onClose }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-card bg-white p-5 shadow-drawer"><div className="mb-4 flex items-center justify-between"><h3 className="font-black text-xl text-park-dark">{title}</h3><button type="button" className="p-1 text-slate-400 hover:text-slate-800 bg-slate-100 rounded-full" onClick={onClose}><X size={20}/></button></div>{children}</section></div>;
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm rounded-card bg-white p-5 shadow-drawer text-center">
        <AlertTriangle size={48} className="mx-auto text-amber-500 mb-3" />
        <h3 className="font-black text-xl text-park-dark">{title}</h3>
        <p className="mt-2 text-sm text-park-muted">{description}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button type="button" variant="gold" onClick={onConfirm} className="w-full py-3">{confirmLabel}</Button>
          <Button type="button" variant="secondary" onClick={onCancel} className="w-full py-3">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return <UiSelect label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</UiSelect>;
}

function splitEvidence(evidences = []) {
  const entry = evidences.filter((item) => /entrada/i.test(item.description || item.notes || ""));
  const exit = evidences.filter((item) => /salida/i.test(item.description || item.notes || ""));
  if (!entry.length && !exit.length && evidences.length) {
    return { entry: evidences.slice(-1), exit: evidences.length > 1 ? evidences.slice(0, 1) : [] };
  }
  return { entry, exit };
}

function formatDateTime(value) {
  if (!value) return "No registrado";
  return new Date(value).toLocaleString("es-PE");
}
