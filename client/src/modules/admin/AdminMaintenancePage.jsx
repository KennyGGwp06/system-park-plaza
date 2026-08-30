import { AlertTriangle, CheckCircle2, Clock3, Eye, Phone, Plus, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, Input, PageHeader, Select } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

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
  const field = (name) => ({ value: draft[name], onChange: (event) => setDraft({ ...draft, [name]: event.target.value }) });
  async function save(status = draft.status) { setBusy(true); try { if (draft.assignedMaintenanceEmployeeId && Number(draft.assignedMaintenanceEmployeeId) !== Number(report.assignedMaintenanceEmployeeId)) await api(`/reception/reports/${report.id}/assign-maintenance`, { method: "PATCH", body: { employeeId: Number(draft.assignedMaintenanceEmployeeId) } }); await api(`/reports/${report.id}/status`, { method: "PATCH", body: { ...draft, estimatedCost: Number(draft.estimatedCost || 0), status } }); await onSaved(); } finally { setBusy(false); } }
  return <Modal title={`${report.code} · Gestionar mantenimiento`} subtitle={`${report.location || report.area} — ${report.description}`} onClose={onClose}><div className="mb-4 flex gap-2"><StatusBadge value={report.priority}/><StatusBadge value={report.status}/></div><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Cuenta de Mantenimiento</span><select className="h-10 w-full rounded-input border border-park-border px-3" value={draft.assignedMaintenanceEmployeeId} onChange={(event) => setDraft({ ...draft, assignedMaintenanceEmployeeId: event.target.value })} disabled={report.status === "RESUELTO"}><option value="">Asignar trabajador interno</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><Input label="Responsable externo (opcional)" placeholder="Nombre del técnico" {...field("contractorName")}/><Input label="Teléfono" type="tel" placeholder="999 999 999" {...field("contractorPhone")}/><Input label="Fecha programada" type="date" {...field("visitDate")}/><Input label="Costo estimado (S/)" min="0" step="0.01" type="number" {...field("estimatedCost")}/></div><label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold">Notas de coordinación</span><textarea className="min-h-24 w-full rounded-input border border-park-border p-3" {...field("notes")}/></label>{draft.contractorPhone ? <a className="mt-4 inline-flex items-center gap-2 font-bold text-park-green" href={`tel:${draft.contractorPhone}`}><Phone size={17}/>Llamar al responsable</a> : null}<div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button>{report.status === "ABIERTO" ? <Button disabled={busy || !draft.assignedMaintenanceEmployeeId} onClick={() => save("ABIERTO")}>Asignar a operaciones</Button> : null}{report.status === "EN_REVISION" ? <Button disabled={busy} onClick={() => save("RESUELTO")}>Marcar como resuelta</Button> : null}{report.status === "RESUELTO" ? <Button disabled={busy} onClick={() => save("RESUELTO")}>Guardar cambios</Button> : null}</div></Modal>;
}

function Modal({ title, subtitle, onClose, children }) { return <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"><section className="mx-auto max-h-full max-w-2xl overflow-auto rounded-card bg-white p-6 shadow-drawer"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold text-park-dark">{title}</h2><p className="mt-1 text-sm text-park-muted">{subtitle}</p></div><button className="grid h-9 w-9 place-items-center rounded-button border border-park-border hover:bg-slate-100" onClick={onClose} type="button"><X size={18}/></button></div>{children}</section></div>; }
function filterReports(view, reports) { if (view === "solicitudes") return reports.filter((r) => r.status === "ABIERTO"); if (view === "reparacion") return reports.filter((r) => r.status === "EN_REVISION"); if (view === "finalizados") return reports.filter((r) => r.status === "RESUELTO"); return reports; }
function pageTitle(view) { return ({ resumen: "Incidencias y soporte externo", solicitudes: "Incidencias abiertas", reparacion: "Incidencias en seguimiento", finalizados: "Incidencias cerradas" })[view] || "Incidencias y soporte externo"; }
