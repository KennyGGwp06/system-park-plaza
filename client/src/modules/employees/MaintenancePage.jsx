import { AlertTriangle, Camera, CheckCircle2, Clock, Eye, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, PageHeader } from "../../components/ui";
import { api } from "../../services/api";
import { getToken } from "../../services/api";
import { apiOrigin } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";

const API_ROOT = apiOrigin;

export function MaintenancePage({ view = "pendientes" }) {
  const { user, can } = useAuth();
  const { data: currentShift } = useFetch("/attendance/current", { initialData: { active: false }, realtime: true, pollInterval: 2000 });
  const shiftActive = Boolean(currentShift?.active);
  const canCreate = can("MANTENIMIENTO", "CREAR") && shiftActive;
  const canEdit = can("MANTENIMIENTO", "EDITAR") && shiftActive;
  const { data, loading, reload } = useFetch("/maintenance/reports", { initialData: [], realtime: true, pollInterval: 2000 });
  const [selected, setSelected] = useState(null);
  const [finalizing, setFinalizing] = useState(null);
  const [addingEvidence, setAddingEvidence] = useState(null);
  const [filters, setFilters] = useState({ search: "", priority: "", type: "", location: "" });
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const reports = useMemo(() => Array.isArray(data) ? data.filter((report) => report.requiresMaintenance && (!report.requiresReceptionAcceptance || report.receptionAcceptedAt)).map((report) => ({ ...report, status: maintenanceStatus(report.status) })) : [], [data]);
  const visible = useMemo(() => applyFilters(filterReports(view, reports, user), filters), [filters, reports, user, view]);

  async function changeStatus(report, status, payload = {}) {
    setError("");
    try {
      const endpoint = status === "EN_REPARACION" ? `/maintenance/reports/${report.id}/start` : `/maintenance/reports/${report.id}/finish`;
      await api(endpoint, { method: "PATCH", body: payload });
      setToast(status === "EN_REPARACION" ? "Reparación iniciada." : "Problema solucionado.");
      await reload();
      setSelected(null);
      setFinalizing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader eyebrow="Mantenimiento" title={pageTitle(view)} description="Gestiona trabajos tecnicos derivados desde reportes operativos del hotel." />
      {error ? <p className="rounded-card bg-park-danger-soft p-4 font-semibold text-park-danger">{error}</p> : null}
      <section className={`rounded-card border p-4 shadow-card ${shiftActive ? "border-park-green bg-park-green-soft" : "border-amber-300 bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${shiftActive ? "bg-park-green text-white" : "bg-amber-500 text-white"}`}><Clock size={19} /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-park-muted">Jornada de mantenimiento</p>
            <h2 className="font-black text-park-dark">{shiftActive ? "Asistencia registrada · operación habilitada" : "Operación bloqueada hasta registrar asistencia"}</h2>
            <p className="text-sm text-park-muted">{shiftActive ? "Puedes iniciar, documentar y finalizar los trabajos asignados a tu cuenta." : "Marca tu ingreso en el reloj de asistencia. Esta estación se habilitará automáticamente."}</p>
          </div>
        </div>
      </section>
      <MaintenanceFilters filters={filters} setFilters={setFilters} />
      {view === "evidencias" ? <EvidenceView reports={visible} onSelect={setSelected} /> : <WorkGrid canCreate={canCreate} canEdit={canEdit} reports={visible} onEvidence={setAddingEvidence} onFinish={setFinalizing} onSelect={setSelected} onStatus={changeStatus} />}
      {selected ? <MaintenanceDetail canCreate={canCreate} canEdit={canEdit} report={selected} onClose={() => setSelected(null)} onEvidence={setAddingEvidence} onFinish={setFinalizing} onStatus={changeStatus} /> : null}
      {addingEvidence ? <EvidenceModal report={addingEvidence} onClose={() => setAddingEvidence(null)} onSaved={async () => { setAddingEvidence(null); await reload(); setToast("Evidencia adjuntada."); }} /> : null}
      {finalizing ? <FinishModal report={finalizing} onClose={() => setFinalizing(null)} onFinish={changeStatus} /> : null}
    </div>
  );
}

function MaintenanceFilters({ filters, setFilters }) {
  return (
    <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <input className="w-full rounded-input border border-park-border px-4 py-3 text-sm outline-none focus:border-park-green" placeholder="Buscar incidencia..." value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
    </section>
  );
}

function WorkGrid({ canCreate, canEdit, reports, onEvidence, onFinish, onSelect, onStatus }) {
  if (!reports.length) return <EmptyState title="Sin trabajos" description="No hay trabajos tecnicos para esta vista." />;
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {reports.map((report) => (
        <article className="rounded-card border border-park-border bg-white shadow-card overflow-hidden" key={report.id}>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-park-muted">{report.code}</p>
                <h3 className="mt-1 font-black text-park-black">{report.description}</h3>
                <p className="mt-1 text-sm font-semibold text-park-muted">{locationLabel(report)}</p>
              </div>
              <StatusBadge value={report.priority} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoTile label="Origen" value={report.area} />
              <InfoTile label="Tipo" value={report.type?.replaceAll("_", " ")} />
              <InfoTile label="Reportado por" value={report.reportedBy ? `${report.reportedBy.firstName} ${report.reportedBy.lastName}` : "No registrado"} />
              <InfoTile label="Estado" value={<StatusBadge value={report.status} />} />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-park-border bg-slate-50 p-3">
            {report.status === "PENDIENTE" ? (
              <Button className="w-full" disabled={!canEdit} onClick={() => onStatus(report, "EN_REPARACION")} type="button">Iniciar trabajo</Button>
            ) : report.status === "EN_REPARACION" ? (
              <ActiveWorkActions canEdit={canEdit} onEvidence={onEvidence} onFinish={onFinish} report={report} />
            ) : (
              <Button className="w-full" disabled={!canEdit} onClick={() => onSelect(report)} type="button" variant="secondary">Revisar detalle</Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function ActiveWorkActions({ canEdit, onEvidence, onFinish, report }) {
  const hasBefore = (report.evidences || []).some((item) => String(item.stage || "").toUpperCase() === "ANTES");
  const hasAfter = (report.evidences || []).some((item) => String(item.stage || "").toUpperCase() === "DESPUES");
  const evidenceLabel = hasBefore ? (hasAfter ? "Evidencias completas" : "Registrar salida") : "Registrar entrada";

  return (
    <div className="w-full space-y-2">
      <p className="text-xs font-semibold text-park-muted">{hasBefore ? (hasAfter ? "Fotos y comentarios de entrada y salida registrados." : "Entrada registrada. Falta documentar la salida.") : "Registra la foto y el comentario del ingreso antes de reparar."}</p>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!canEdit || hasAfter} icon={Camera} onClick={() => onEvidence(report)} type="button" variant="secondary">{evidenceLabel}</Button>
        <Button className="flex-1" disabled={!canEdit} onClick={() => onFinish(report)} type="button">Finalizar</Button>
      </div>
    </div>
  );
}

function EvidenceView({ reports, onSelect }) {
  if (!reports.length) return <EmptyState title="Sin evidencias" description="Los trabajos con evidencia apareceran aqui." />;
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {reports.map((report) => (
        <article className="rounded-card border border-park-border bg-white p-4 shadow-card" key={report.id}>
          <Thumb evidence={report.evidences?.[0]} />
          <p className="mt-3 text-xs font-black uppercase text-park-muted">{report.code}</p>
          <h3 className="font-black text-park-black">{report.description}</h3>
          <p className="text-sm text-park-muted">{locationLabel(report)}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <StatusBadge value={report.status} />
            <Button className="h-8 w-8 px-0" icon={Eye} onClick={() => onSelect(report)} size="sm" type="button" variant="secondary" />
          </div>
        </article>
      ))}
    </section>
  );
}

function MaintenanceDetail({ canCreate, canEdit, report, onClose, onEvidence, onFinish, onStatus }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ml-auto h-full max-w-xl overflow-auto rounded-card bg-white p-5 shadow-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-park-gold">Detalle del trabajo</p>
            <h3 className="font-sans text-xl font-black text-park-black">{report.code}</h3>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-button border border-park-border text-park-muted hover:text-park-black" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="mt-3 flex gap-2"><StatusBadge value={report.status} /><StatusBadge value={report.priority} /></div>
        <Panel title="Informacion general">
          <DetailRow label="Ubicacion" value={locationLabel(report)} />
          <DetailRow label="Tipo" value={report.type?.replaceAll("_", " ")} />
          <DetailRow label="Origen" value={report.area} />
          <DetailRow label="Descripcion" value={report.description} />
          <DetailRow label="Reportado por" value={report.reportedBy ? `${report.reportedBy.firstName} ${report.reportedBy.lastName}` : "No registrado"} />
          <DetailRow label="Fecha" value={formatDateTime(report.createdAt)} />
          <DetailRow label="Tecnico" value={report.assignedTo ? `${report.assignedTo.firstName} ${report.assignedTo.lastName}` : report.assignedMaintenanceTo ? report.assignedMaintenanceTo : report.resolvedBy ? `${report.resolvedBy.firstName} ${report.resolvedBy.lastName}` : "No asignado"} />
          <DetailRow label="Inicio" value={formatDateTime(report.startedAt)} />
          <DetailRow label="Trabajo realizado" value={report.workDescription} />
          <DetailRow label="Observaciones" value={report.observations} />
        </Panel>
        <Panel title="Evidencia inicial">
          <div className="grid gap-2 md:grid-cols-2">{report.evidences?.length ? report.evidences.map((item) => <Thumb evidence={item} key={item.id} />) : <p className="text-sm text-park-muted">Sin evidencias adjuntas.</p>}</div>
        </Panel>
        <Panel title="Historial">
          {historyFor(report).map((item) => <div className="flex gap-3 pb-3 last:pb-0" key={item}><span className="mt-1 h-2.5 w-2.5 rounded-full bg-park-green" /><p className="text-sm font-semibold text-park-black">{item}</p></div>)}
        </Panel>
        <div className="mt-5 flex justify-end gap-2">
          {canEdit && report.status === "PENDIENTE" && report.requiresReceptionAcceptance && !report.receptionAcceptedAt ? <Button disabled icon={Clock} type="button">Esperando confirmación</Button> : null}
          {canEdit && report.status === "PENDIENTE" && (!report.requiresReceptionAcceptance || report.receptionAcceptedAt) ? <Button icon={Wrench} onClick={() => onStatus(report, "EN_REPARACION")} type="button">Iniciar trabajo</Button> : null}
          {canCreate && report.status === "EN_REPARACION" ? <Button icon={Camera} onClick={() => onEvidence(report)} type="button">{(report.evidences || []).some((item) => String(item.stage || "").toUpperCase() === "ANTES") ? "Registrar salida" : "Registrar entrada"}</Button> : null}
          {canEdit && report.status === "EN_REPARACION" ? <Button icon={CheckCircle2} onClick={() => onFinish(report)} type="button" variant="gold">Finalizar reparación</Button> : null}
        </div>
      </aside>
    </div>
  );
}

function EvidenceModal({ report, onClose, onSaved }) {
  const [files, setFiles] = useState([]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const hasBefore = (report.evidences || []).some((item) => String(item.stage || "").toUpperCase() === "ANTES");
  const stage = hasBefore ? "DESPUES" : "ANTES";

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return alert("Por favor agrega al menos una foto.");
    setBusy(true);
    try {
      const uploadedFiles = await uploadImages(files);
      await api(`/maintenance/reports/${report.id}/evidence`, { method: "POST", body: { description, stage, files: uploadedFiles } });
      onSaved();
    } catch(e) {
      alert("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="w-full max-w-lg rounded-card bg-white p-6 shadow-drawer" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-sans text-xl font-black text-park-black">{stage === "ANTES" ? "Registro de entrada" : "Registro de salida"}</p>
            <div className="mb-3 flex items-start justify-between gap-3">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-wider ${report.status === "SOLUCIONADO" ? "bg-park-green-soft text-park-green" : report.status === "EN_REPARACION" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{report.status === "PENDIENTE" ? "Pendiente" : report.status === "EN_REPARACION" ? "Atendiendo" : "Cerrado"}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold ${report.priority === "ALTA" ? "text-park-danger" : report.priority === "MEDIA" ? "text-amber-600" : "text-park-muted"}`}>{report.priority}</span>
            </div>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-button border border-park-border text-park-muted hover:text-park-black" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="mt-5 space-y-4">
          <ImagePicker files={files} setFiles={setFiles} />
          <textarea className="min-h-24 w-full rounded-input border border-park-border p-3 text-sm" placeholder={stage === "ANTES" ? "Comenta el estado al iniciar el trabajo..." : "Comenta el resultado al finalizar el trabajo..."} required value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy || !files.length || !description.trim()} loading={busy}>Guardar foto {stage.toLowerCase()}</Button>
        </div>
      </form>
    </div>
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
    const response = await fetch(`${API_ROOT}/api/reports/evidence/upload`, {
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

function FinishModal({ report, onClose, onFinish }) {
  const [submitting, setSubmitting] = useState(false);
  const hasBefore = (report.evidences || []).some((item) => String(item.stage || "").toUpperCase() === "ANTES");
  const hasAfter = (report.evidences || []).some((item) => String(item.stage || "").toUpperCase() === "DESPUES");
  const evidenceComplete = hasBefore && hasAfter;

  async function submit(event) {
    event.preventDefault();
    if (!evidenceComplete) return;
    setSubmitting(true);
    try {
      await onFinish(report, "RESUELTO", { problemSolved: true });
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="w-full max-w-lg rounded-card bg-white p-6 shadow-drawer max-h-[90vh] overflow-y-auto" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-park-gold">Finalizar trabajo</p>
            <h3 className="font-sans text-xl font-black text-park-black">{report.code}</h3>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-button border border-park-border text-park-muted hover:text-park-black" onClick={onClose} type="button"><X size={18} /></button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-card border p-3 text-sm ${hasBefore ? "border-park-green/30 bg-park-green-soft text-park-green" : "border-amber-300 bg-amber-50 text-amber-800"}`}><strong className="block">Foto antes</strong><span>{hasBefore ? "Registrada" : "Pendiente"}</span></div>
            <div className={`rounded-card border p-3 text-sm ${hasAfter ? "border-park-green/30 bg-park-green-soft text-park-green" : "border-amber-300 bg-amber-50 text-amber-800"}`}><strong className="block">Foto después</strong><span>{hasAfter ? "Registrada" : "Pendiente"}</span></div>
          </div>
        </div>

        {!evidenceComplete ? <p className="mt-4 rounded-card border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Antes de finalizar registra las fotos antes y después desde “Registrar evidencia”.</p> : <p className="mt-4 rounded-card border border-park-green/20 bg-park-green-soft p-3 text-sm font-semibold text-park-green">Evidencias completas. Ya puedes confirmar la solución.</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={submitting || !evidenceComplete} icon={CheckCircle2} type="submit">{submitting ? "Finalizando..." : "Confirmar solución"}</Button>
        </div>
      </form>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  const tones = { gold: "bg-park-gold-soft text-park-gold", blue: "bg-blue-50 text-blue-700", green: "bg-park-green-soft text-park-green", red: "bg-red-50 text-park-danger", purple: "bg-purple-50 text-purple-700" };
  return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><span className={`grid h-11 w-11 place-items-center rounded-button ${tones[tone]}`}><Icon size={20} /></span><p className="mt-4 text-sm font-semibold text-park-muted">{label}</p><strong className="font-display text-[28px] font-semibold text-park-dark">{value}</strong></article>;
}

function Panel({ title, children }) {
  return <section className="mt-5 rounded-card border border-park-border bg-white p-5 shadow-card"><h2 className="mb-4 font-sans text-lg font-black text-park-black">{title}</h2>{children}</section>;
}

function InfoTile({ label, value }) {
  return <div className="rounded-card bg-park-bg p-3"><p className="text-xs font-black uppercase text-park-muted">{label}</p><div className="mt-1 font-semibold text-park-black">{value || "No registrado"}</div></div>;
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return <div className="mb-3 grid grid-cols-[120px_1fr] gap-3 text-sm last:mb-0"><span className="font-semibold text-park-muted">{label}</span><strong className="text-park-black">{value}</strong></div>;
}

function Thumb({ evidence }) {
  const [expanded, setExpanded] = useState(false);
  if (!evidence) return <div className="grid h-32 place-items-center rounded-card border border-dashed border-park-border bg-park-bg text-sm text-park-muted">Sin evidencia</div>;
  return (
    <>
      <img className="h-32 w-full rounded-card border border-park-border object-cover cursor-pointer" src={`${API_ROOT}${evidence.imageUrl}`} alt={evidence.fileName || "Evidencia"} onClick={() => setExpanded(true)} />
      {expanded && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
          <div className="relative max-h-full max-w-full">
            <button className="absolute -right-4 -top-4 grid h-8 w-8 place-items-center rounded-full bg-white text-park-black shadow-md hover:bg-gray-100" onClick={() => setExpanded(false)} type="button"><X size={16} /></button>
            <img className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" src={`${API_ROOT}${evidence.imageUrl}`} alt={evidence.fileName || "Evidencia"} />
          </div>
        </div>
      )}
    </>
  );
}

function filterReports(view, reports, user) {
  const currentUserId = user?.id;
  if (view === "pendientes") return reports.filter((report) => ["PENDIENTE", "EN_REPARACION"].includes(report.status) && (!report.assignedMaintenanceEmployeeId || Number(report.assignedMaintenanceEmployeeId) === Number(currentUserId)) && (!report.assignedToId || Number(report.assignedToId) === Number(currentUserId)));
  if (view === "reparacion") return reports.filter((report) => report.status === "EN_REPARACION" && (!report.assignedMaintenanceEmployeeId || Number(report.assignedMaintenanceEmployeeId) === Number(currentUserId)) && (!report.assignedToId || Number(report.assignedToId) === Number(currentUserId)));
  if (view === "finalizados") return reports.filter((report) => report.status === "SOLUCIONADO" && (!report.assignedMaintenanceEmployeeId || Number(report.assignedMaintenanceEmployeeId) === Number(currentUserId)) && (!report.resolvedById || Number(report.resolvedById) === Number(currentUserId)));
  if (view === "evidencias") return reports.filter((report) => report.evidences?.length);
  return reports;
}

function applyFilters(reports, filters) {
  const search = filters.search.trim().toLowerCase();
  return reports.filter((report) => {
    const haystack = [report.code, report.description, report.area, report.type, locationLabel(report), report.reportedBy?.firstName, report.reportedBy?.lastName].filter(Boolean).join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    return true;
  });
}

function pageTitle(view) {
  const titles = { pendientes: "Alertas de mantenimiento", reparacion: "En atención", finalizados: "Historial de mantenimiento", evidencias: "Evidencias" };
  return titles[view] || titles.pendientes;
}

function maintenanceStatus(value) {
  const status = String(value || "").toUpperCase();
  if (status === "ABIERTO") return "PENDIENTE";
  if (status === "EN_REVISION") return "EN_REPARACION";
  if (status === "RESUELTO") return "SOLUCIONADO";
  return status;
}

function locationLabel(report) {
  if (report.room?.number) return `Habitación ${report.room.number}`;
  if (report.product?.name) return report.product.name;
  return report.area || "Área operativa";
}

function historyFor(report) {
  const steps = ["Reportado"];
  if (["EN_REPARACION", "SOLUCIONADO"].includes(report.status)) steps.push("Reparación iniciada");
  if (report.evidences?.length) steps.push("Evidencia agregada");
  if (report.status === "SOLUCIONADO") steps.push("Problema solucionado");
  return steps;
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
