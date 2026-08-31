import { AlertTriangle, CheckCircle2, Clock3, Eye, Phone, Plus, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { apiOrigin } from "../../config/api";

const emptyForm = { type: "DANO_INFRAESTRUCTURA", area: "HOTEL", location: "", description: "", priority: "MEDIA" };

export function AdminMaintenancePage({ view = "resumen" }) {
  const { data, loading, reload } = useFetch("/reports", { initialData: { reports: [] } });
  const { data: employeesData } = useFetch("/reception/maintenance-employees", { initialData: [] });
  const [selected, setSelected] = useState(null);
  const [inspected, setInspected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const reports = useMemo(() => (data?.reports || []).filter((item) => item.requiresMaintenance), [data]);
  const employees = Array.isArray(employeesData) ? employeesData : [];
  const visible = useMemo(() => filterReports(view, reports), [reports, view]);
  const pendingCustomerReports = useMemo(() => reports.filter((report) => report.clientId && report.requiresReceptionAcceptance && !report.receptionAcceptedAt && report.status !== "RESUELTO"), [reports]);

  async function createIncident(event) {
    event.preventDefault();
    await api("/reports", { method: "POST", body: { ...form, requiresMaintenance: true } });
    setForm(emptyForm); setCreating(false); setMessage("Incidencia registrada. Administración y Recepción ya pueden darle seguimiento.");
    await reload();
  }

  if (loading) return <LoadingSpinner />;
  return <div className="space-y-5">
    <PageHeader eyebrow="Operación / Mantenimiento" title={pageTitle(view)} description="Registra el problema, asígnalo al equipo de mantenimiento y conserva la trazabilidad hasta su cierre." actions={<Button icon={Plus} onClick={() => setCreating(true)}>Nueva incidencia</Button>} />
    {message ? <div className="rounded-card border border-park-green/20 bg-park-green-soft p-3 text-sm font-semibold text-park-green">{message}</div> : null}
    {pendingCustomerReports.length ? <section className="flex flex-col gap-3 border border-amber-300 bg-amber-50 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-button bg-amber-500 text-white"><AlertTriangle size={20} /></span><div><p className="text-xs font-black uppercase tracking-wide text-amber-800">Solicitud de huésped</p><h2 className="font-black text-park-dark">{pendingCustomerReports.length} {pendingCustomerReports.length === 1 ? "reparación espera" : "reparaciones esperan"} aceptación de Recepción</h2><p className="text-sm text-park-muted">El técnico asignado ya puede ver la alerta. Confirma el responsable para habilitar el trabajo.</p></div></div><Button onClick={() => setSelected(pendingCustomerReports[0])} type="button">Revisar y aceptar</Button></section> : null}
    <MaintenanceWorkspace reports={reports} inspected={inspected} onInspect={setInspected} onManage={setSelected} />
    {creating ? <IncidentForm form={form} setForm={setForm} onClose={() => setCreating(false)} onSubmit={createIncident}/> : null}
    {selected ? <IncidentDetail employees={employees} report={selected} onClose={() => setSelected(null)} onSaved={async () => { setSelected(null); setMessage("Seguimiento actualizado correctamente."); await reload(); }}/>: null}
  </div>;
}

function MaintenanceWorkspace({ reports, inspected, onInspect, onManage }) {
  const [tab, setTab] = useState("EN_REVISION");
  const open = reports.filter((report) => report.status === "ABIERTO");
  const active = reports.filter((report) => report.status === "EN_REVISION");
  const closed = reports.filter((report) => report.status === "RESUELTO");
  const urgent = reports.filter((report) => ["ALTA", "CRITICA"].includes(report.priority) && report.status !== "RESUELTO");
  const tabs = [["ABIERTO", "Por atender", open], ["EN_REVISION", "En reparación", active], ["RESUELTO", "Finalizados", closed], ["URGENTES", "Urgentes", urgent]];
  const rows = (tabs.find(([key]) => key === tab)?.[2] || []).slice(0, 12);
  const detail = inspected || rows[0] || reports[0] || null;
  const metrics = [[AlertTriangle, "Por atender", open.length, "bg-amber-50 text-amber-700"], [Wrench, "En reparación", active.length, "bg-blue-50 text-blue-700"], [CheckCircle2, "Resueltas hoy", closed.length, "bg-park-green-soft text-park-green"], [Clock3, "Urgentes", urgent.length, "bg-red-50 text-park-danger"]];
  return <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([Icon, label, value, tone]) => <article className="border border-park-border bg-white p-5 shadow-card" key={label}><span className={`grid h-11 w-11 place-items-center rounded-button ${tone}`}><Icon size={20}/></span><p className="mt-4 text-sm font-semibold text-park-muted">{label}</p><strong className="font-display text-3xl text-park-dark">{value}</strong><p className="text-xs text-park-muted">Reportes</p></article>)}</section><section className="border border-park-border bg-white shadow-card"><div className="flex overflow-x-auto border-b border-park-border">{tabs.map(([key, label, items]) => <button className={`min-w-max border-b-2 px-5 py-4 text-sm font-black ${tab === key ? "border-park-green text-park-green" : "border-transparent text-park-muted hover:text-park-dark"}`} key={key} onClick={() => setTab(key)} type="button">{label} ({items.length})</button>)}</div><div className="p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold text-park-dark">{tabs.find(([key]) => key === tab)?.[1]} de mantenimiento</h2><p className="text-sm text-park-muted">Coordina el trabajo técnico y conserva el historial de cada intervención.</p></div><input className="h-10 w-full max-w-56 rounded-input border border-park-border px-3 text-sm outline-none focus:border-park-green" placeholder="Buscar ubicación..." /></div>{rows.length ? <div className="overflow-x-auto border border-park-border"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-park-bg text-xs uppercase text-park-muted"><tr><th className="px-4 py-3">Ubicación</th><th>Trabajo requerido</th><th>Responsable</th><th>Prioridad</th><th>Estado</th><th>Programado</th><th></th></tr></thead><tbody className="divide-y divide-park-border">{rows.map((report) => <tr className="cursor-pointer hover:bg-park-green-soft/30" key={report.id} onClick={() => onInspect(report)}><td className="px-4 py-4 font-black text-park-green">{report.location || report.area}</td><td className="max-w-[240px]">{report.description}</td><td>{report.assignedMaintenanceTo || report.contractorName || "Sin asignar"}</td><td><StatusBadge value={report.priority}/></td><td><StatusBadge value={report.status}/></td><td>{report.visitDate ? new Date(`${report.visitDate}T12:00:00`).toLocaleDateString("es-PE") : "Sin fecha"}</td><td className="pr-4"><Button icon={Eye} onClick={(event) => { event.stopPropagation(); onManage(report); }} size="sm" type="button" variant="secondary">Ver detalle</Button></td></tr>)}</tbody></table></div> : <EmptyState title="Sin reportes en este estado" description="Los nuevos reportes aparecerán aquí automáticamente." />}</div></section></div><MaintenanceInspector report={detail} onManage={onManage}/></section>;
}

function MaintenanceInspector({ report, onManage }) {
  if (!report) return <aside className="border border-park-border bg-white p-5 shadow-card"><EmptyState title="Selecciona un reporte" description="Aquí aparecerá la información del trabajo técnico." /></aside>;
  return <aside className="h-fit border border-park-border bg-white shadow-card xl:sticky xl:top-5"><div className="flex items-start justify-between border-b border-park-border p-5"><div><p className="text-xs font-black uppercase text-park-gold">Detalle de mantenimiento</p><h2 className="font-display text-xl font-semibold text-park-dark">{report.location || report.area}</h2></div><StatusBadge value={report.status}/></div><div className="space-y-5 p-5"><div><p className="font-black text-park-dark">{report.description}</p><p className="mt-1 text-sm text-park-muted">{report.type?.replaceAll("_", " ")}</p></div><div className="grid gap-3 border-y border-park-border py-4 text-sm"><MaintenanceLine label="Responsable" value={report.assignedMaintenanceTo || report.contractorName || "Sin asignar"}/><MaintenanceLine label="Prioridad" value={report.priority}/><MaintenanceLine label="Inicio" value={report.startedAt ? new Date(report.startedAt).toLocaleString("es-PE") : "No iniciado"}/><MaintenanceLine label="Visita" value={report.visitDate ? new Date(`${report.visitDate}T12:00:00`).toLocaleDateString("es-PE") : "Sin fecha"}/></div><div><h3 className="mb-2 font-black text-park-dark">Trabajo realizado</h3><p className="text-sm text-park-muted">{report.workDescription || "Pendiente de registrar por el técnico."}</p></div><div><h3 className="mb-2 font-black text-park-dark">Evidencias ({report.evidences?.length || 0})</h3><div className="grid grid-cols-4 gap-2">{report.evidences?.slice(0, 4).map((item) => <img alt="Evidencia de mantenimiento" className="h-14 w-full border border-park-border object-cover" key={item.id} src={`${item.imageUrl || item.fileUrl}`} />)}</div>{!report.evidences?.length ? <p className="text-sm text-park-muted">Aún no se adjuntaron evidencias.</p> : null}</div><Button className="w-full" onClick={() => onManage(report)} type="button">Gestionar reporte</Button></div></aside>;
}

function MaintenanceLine({ label, value }) { return <div className="flex items-center justify-between gap-3"><span className="text-park-muted">{label}</span><strong className="text-right text-park-dark">{value || "No registrado"}</strong></div>; }

function Metrics({ reports }) {
  const values = [
    [AlertTriangle, "Abiertas", reports.filter((r) => r.status === "ABIERTO").length, "text-park-danger bg-red-50"],
    [Wrench, "En seguimiento", reports.filter((r) => r.status === "EN_REVISION").length, "text-blue-700 bg-blue-50"],
    [CheckCircle2, "Cerradas", reports.filter((r) => r.status === "RESUELTO").length, "text-park-green bg-park-green-soft"],
    [Clock3, "Visitas programadas", reports.filter((r) => r.visitDate && r.status !== "RESUELTO").length, "text-park-gold bg-park-gold-soft"]
  ];
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{values.map(([Icon, label, value, tone]) => <article className="rounded-card border border-park-border bg-white p-4 shadow-card" key={label}><span className={`grid h-10 w-10 place-items-center rounded-button ${tone}`}><Icon size={19}/></span><p className="mt-3 text-sm font-semibold text-park-muted">{label}</p><strong className="font-display text-3xl text-park-dark">{value}</strong></article>)}</section>;
}

function IncidentForm({ form, setForm, onClose, onSubmit }) {
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  return <Modal title="Registrar incidencia" subtitle="Recepción y Superadmin supervisan la atención del equipo de mantenimiento." onClose={onClose}><form className="grid gap-4" onSubmit={onSubmit}><div className="grid gap-4 sm:grid-cols-2"><Select label="Tipo" {...field("type")}><option>DANO_INFRAESTRUCTURA</option><option>DANO_EQUIPO</option><option>FALLA_ELECTRICA</option><option>FALLA_SANITARIA</option><option>OTRO</option></Select><Select label="Prioridad" {...field("priority")}><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>CRITICA</option></Select><Input label="Área" required {...field("area")}/><Input label="Ubicación exacta" required placeholder="Ej. Habitación 204" {...field("location")}/></div><label className="block"><span className="mb-1.5 block text-sm font-semibold">Descripción</span><textarea className="min-h-28 w-full rounded-input border border-park-border p-3 outline-none focus:border-park-green" required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Registrar y notificar</Button></div></form></Modal>;
}

function IncidentDetail({ report, employees, onClose, onSaved }) {
  const [draft, setDraft] = useState({ contractorName: report.contractorName || "", contractorPhone: report.contractorPhone || "", visitDate: report.visitDate || "", estimatedCost: report.estimatedCost || "", notes: report.notes || "", status: report.status, assignedMaintenanceEmployeeId: report.assignedMaintenanceEmployeeId ? String(report.assignedMaintenanceEmployeeId) : "" });
  const [busy, setBusy] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const field = (name) => ({ value: draft[name], onChange: (event) => setDraft({ ...draft, [name]: event.target.value }) });

  async function save(status = draft.status) {
    setBusy(true);
    try {
      if (draft.assignedMaintenanceEmployeeId && Number(draft.assignedMaintenanceEmployeeId) !== Number(report.assignedMaintenanceEmployeeId)) {
        await api(`/reception/reports/${report.id}/assign-maintenance`, { method: "PATCH", body: { employeeId: Number(draft.assignedMaintenanceEmployeeId) } });
      }
      await api(`/reports/${report.id}/status`, { method: "PATCH", body: { ...draft, estimatedCost: Number(draft.estimatedCost || 0), status } });
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside aria-modal="true" className="max-h-[88vh] w-[min(1100px,90vw)] max-w-none overflow-auto rounded-card bg-white p-5 shadow-drawer" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h3 className="font-sans text-2xl font-black text-park-black">{report.code} · Gestionar mantenimiento</h3><StatusBadge value={report.status} /></div>
            <p className="mt-2 text-sm text-park-muted">{report.location || report.area} — {report.description}</p>
          </div>
          <button aria-label="Cerrar detalle" className="grid h-10 w-10 place-items-center rounded-button border border-park-border text-park-muted hover:text-park-dark" onClick={onClose} type="button"><X size={19} /></button>
        </div>
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <section className="rounded-card border border-park-border bg-white p-3.5">
              <h2 className="mb-2 font-sans text-base font-black text-park-black">Información general</h2>
              <div className="divide-y divide-park-border border-y border-park-border">
                <CompactDetailRow label="Ubicación" value={report.location || report.area} />
                <CompactDetailRow label="Tipo" value={report.type?.replaceAll("_", " ")} />
                <CompactDetailRow label="Prioridad" value={<StatusBadge value={report.priority} />} />
                <CompactDetailRow label="Estado" value={<StatusBadge value={report.status} />} />
                <CompactDetailRow label="Inicio" value={report.startedAt ? new Date(report.startedAt).toLocaleString("es-PE") : "No iniciado"} />
                <CompactDetailRow label="Costo est." value={report.estimatedCost ? `S/ ${report.estimatedCost}` : "No registrado"} />
                <CompactDetailRow label="Trabajo" value={report.workDescription || "Pendiente"} />
              </div>
            </section>
            
            {report.status !== "RESUELTO" && (
              <section className="rounded-card border border-park-border bg-white p-3.5">
                <h2 className="mb-2 font-sans text-base font-black text-park-black">Asignación y revisión</h2>
                <label className="block text-sm font-black text-park-black">Cuenta de Mantenimiento
                  <select className="mt-1 h-9 w-full rounded-input border border-park-border px-3 text-sm font-normal" value={draft.assignedMaintenanceEmployeeId} onChange={(event) => setDraft({ ...draft, assignedMaintenanceEmployeeId: event.target.value })}>
                    <option value="">Selecciona al responsable</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                </label>
                <div className="mt-2 divide-y divide-park-border border-y border-park-border">
                  <CompactDetailRow label="Trabajador" value={report.assignedMaintenanceTo || "Sin asignar"} />
                  <CompactDetailRow label="Estado tarea" value={<StatusBadge value={report.status} />} />
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <Button className="w-full" disabled={busy || !draft.assignedMaintenanceEmployeeId} onClick={() => save(report.status)} type="button" variant="secondary">{report.requiresReceptionAcceptance && !report.receptionAcceptedAt ? "Aceptar y enviar a Mantenimiento" : "Actualizar responsable"}</Button>
                  {report.status === "EN_REVISION" ? <Button className="w-full" disabled={busy} onClick={() => save("RESUELTO")} type="button">Marcar como resuelta</Button> : null}
                </div>
              </section>
            )}
            
            {report.status === "RESUELTO" && (
              <section className="rounded-card border border-park-border bg-white p-3.5">
                <p className="rounded-card bg-park-green-soft p-2 text-sm font-black text-park-green">Incidencia resuelta. Trabajo finalizado.</p>
                <div className="mt-3 flex justify-end">
                  <Button disabled={busy} onClick={() => save("RESUELTO")} type="button" variant="secondary">Guardar cambios extra</Button>
                </div>
              </section>
            )}
          </div>
          
          <section className="min-w-0 rounded-card border border-park-border bg-white p-4">
            <h2 className="font-sans text-lg font-black text-park-black">Evidencias</h2>
            <p className="mb-4 mt-1 text-sm text-park-muted">Fotografías adjuntadas durante el trabajo de mantenimiento.</p>
            <div className="max-h-[510px] overflow-y-auto pr-1">
              {!report.evidences?.length ? (
                 <div className="grid aspect-video place-items-center rounded-card border border-dashed border-park-border bg-park-bg px-3 text-center text-sm text-park-muted">Sin evidencia registrada</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {report.evidences.map((evidence) => (
                    <button key={evidence.id} className="group block w-full text-left" onClick={() => setSelectedEvidence(evidence)} type="button">
                      <img alt="Evidencia" className="aspect-video w-full rounded-card border border-park-border object-cover transition group-hover:border-park-green" src={`${apiOrigin}${evidence.imageUrl || evidence.fileUrl}`} />
                      <span className="mt-2 block text-xs font-semibold text-park-muted"><Clock3 size={12} className="mr-1 inline" />{new Date(evidence.createdAt).toLocaleString("es-PE")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
      {selectedEvidence ? <MaintenanceEvidencePreview evidence={selectedEvidence} onClose={() => setSelectedEvidence(null)} /> : null}
    </div>
  );
}

function MaintenanceEvidencePreview({ evidence, onClose }) {
  const [expanded, setExpanded] = useState(false);
  
  if (expanded) {
    return (
      <div className="fixed inset-0 z-[60] bg-black" onClick={() => setExpanded(false)}>
        <img alt="Evidencia expandida" className="w-full h-full object-contain cursor-zoom-out" src={`${apiOrigin}${evidence.imageUrl || evidence.fileUrl}`} title="Haz clic para contraer" />
      </div>
    );
  }

  return (
    <section aria-modal="true" className="fixed inset-x-4 bottom-4 z-50 max-h-[calc(100vh-2rem)] overflow-auto rounded-card bg-white shadow-drawer md:inset-x-auto md:right-8 md:top-1/2 md:w-[420px] md:-translate-y-1/2" role="dialog">
      <div className="flex items-start justify-between p-5">
        <div>
          <p className="font-sans text-lg font-black text-park-black">Evidencia de trabajo</p>
          <p className="mt-1 text-sm text-park-muted"><Clock3 size={14} className="mr-1 inline" />{new Date(evidence.createdAt).toLocaleString("es-PE")}</p>
        </div>
        <button aria-label="Cerrar foto" className="grid h-9 w-9 place-items-center rounded-button border border-park-border" onClick={onClose} type="button"><X size={18} /></button>
      </div>
      <img alt="Evidencia" className="max-h-[46vh] w-full cursor-zoom-in object-cover transition hover:opacity-90" onClick={() => setExpanded(true)} src={`${apiOrigin}${evidence.imageUrl || evidence.fileUrl}`} title="Haz clic para expandir" />
      <div className="space-y-3 p-5">
        <div className="border border-park-border bg-park-bg p-3 text-sm">
          <p className="text-xs font-black uppercase text-park-muted">Comentario</p>
          <p className="mt-1 leading-6 text-park-dark">{evidence.description || evidence.notes || "Sin comentario registrado"}</p>
        </div>
        <Button className="w-full" onClick={onClose} type="button" variant="secondary">Cerrar</Button>
      </div>
    </section>
  );
}

function CompactDetailRow({ label, value }) { return <div className="flex items-center justify-between py-2.5 text-sm"><span className="text-park-muted">{label}</span><strong className="text-park-dark text-right max-w-[150px]">{value}</strong></div>; }

function Modal({ title, subtitle, onClose, children }) { return <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="mx-auto max-h-full max-w-2xl overflow-auto rounded-card bg-white p-6 shadow-drawer"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold text-park-dark">{title}</h2><p className="mt-1 text-sm text-park-muted">{subtitle}</p></div><button className="grid h-9 w-9 place-items-center rounded-button border border-park-border hover:bg-slate-100" onClick={onClose} type="button"><X size={18}/></button></div>{children}</section></div>; }
function filterReports(view, reports) { if (view === "solicitudes") return reports.filter((r) => r.status === "ABIERTO"); if (view === "reparacion") return reports.filter((r) => r.status === "EN_REVISION"); if (view === "finalizados") return reports.filter((r) => r.status === "RESUELTO"); return reports; }
function pageTitle(view) { return ({ resumen: "Incidencias y soporte externo", solicitudes: "Incidencias abiertas", reparacion: "Incidencias en seguimiento", finalizados: "Incidencias cerradas" })[view] || "Incidencias y soporte externo"; }
