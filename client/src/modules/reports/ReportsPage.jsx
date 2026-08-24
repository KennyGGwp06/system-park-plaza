import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Search, Wrench } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Table } from "../../components/Table";
import { Toast } from "../../components/Toast";
import { Button, Input as UiInput, PageHeader, Select as UiSelect, Tabs } from "../../components/ui";
import { apiOrigin } from "../../config/api";

const API_ROOT = apiOrigin;

export function ReportsPage() {
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const query = `/reports?${new URLSearchParams({ area, type, priority, status, from: date, search }).toString()}`;
  const { data, loading, reload } = useFetch(query, { initialData: { reports: [], summary: {} } });

  const reports = data?.reports || [];
  const summary = data?.summary || {};
  const visible = useMemo(() => reports, [reports]);

  async function changeStatus(report, nextStatus) {
    const updated = await api(`/reports/${report.id}/status`, { method: "PATCH", body: { status: nextStatus } });
    setToast(`Reporte ${updated.code} actualizado.`);
    setSelected(updated);
    reload();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader eyebrow="Administrador" title="Reportes e Incidencias" description="Seguimiento de incidencias operativas por area, prioridad, estado y evidencia." />
      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Abiertos" value={summary.open || 0} icon={<AlertTriangle />} />
          <Metric label="En revision" value={summary.review || 0} icon={<Wrench />} />
          <Metric label="Resueltos" value={summary.resolved || 0} icon={<CheckCircle2 />} />
          <Metric label="Alta / critica" value={summary.high || 0} icon={<AlertTriangle />} />
        </div>
        <div className="mt-5">
          <Tabs tabs={["", "BARTENDER", "RESTAURANTE", "LIMPIEZA"].map((item) => ({ value: item, label: item || "TODOS" }))} value={area} onChange={setArea} />
        </div>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-park-black">Buscar</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={17} />
              <input
                className="h-10 w-full rounded-input border border-park-border bg-white px-3 pl-9 text-sm text-park-black outline-none transition placeholder:text-park-muted focus:border-park-green focus:ring-2 focus:ring-park-green/15"
                placeholder="Descripcion, empleado, habitacion"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>
          <UiSelect label="Tipo" value={type} onChange={(event) => setType(event.target.value)}>{["", "FALTA_INSUMO", "DANO_EQUIPO", "DANO_INFRAESTRUCTURA", "MANTENIMIENTO", "INCIDENCIA", "OTRO"].map((option) => <option key={option || "TODOS"} value={option}>{option ? option.replaceAll("_", " ") : "Todos"}</option>)}</UiSelect>
          <UiSelect label="Prioridad" value={priority} onChange={(event) => setPriority(event.target.value)}>{["", "BAJA", "MEDIA", "ALTA", "CRITICA"].map((option) => <option key={option || "TODOS"} value={option}>{option || "Todos"}</option>)}</UiSelect>
          <UiSelect label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>{["", "ABIERTO", "EN_REVISION", "RESUELTO"].map((option) => <option key={option || "TODOS"} value={option}>{option ? option.replaceAll("_", " ") : "Todos"}</option>)}</UiSelect>
          <UiInput label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </section>

      {!visible.length ? <EmptyState title="Sin reportes" description="No hay incidencias con los filtros actuales." /> : (
        <Table columns={["Reporte", "Origen", "Descripcion", "Prioridad", "Estado", "Accion"]} rows={visible} renderRow={(report) => (
          <tr key={report.id}>
            <td className="px-4 py-3">
              <p className="font-black text-park-black">{report.code}</p>
              <p className="text-xs font-semibold text-park-muted">{new Date(report.createdAt).toLocaleDateString("es-PE")}</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-semibold text-park-black">{report.area}</p>
              <p className="text-xs font-semibold text-park-muted">{report.reportedBy ? `${report.reportedBy.firstName} ${report.reportedBy.lastName}` : "Sistema"}</p>
            </td>
            <td className="max-w-md px-4 py-3">
              <p className="font-semibold text-park-black">{report.type.replaceAll("_", " ")}</p>
              <p className="text-sm text-park-muted">{report.description}</p>
              <p className="mt-1 text-xs font-semibold text-park-muted">
                {report.room ? `Habitacion ${report.room.number}` : "Sin habitacion"} / {report.product?.name || "Sin producto"}
              </p>
            </td>
            <td className="px-4 py-3"><StatusBadge value={report.priority} /></td>
            <td className="px-4 py-3"><StatusBadge value={report.status} /></td>
            <td className="px-4 py-3"><Button aria-label="Ver reporte" className="h-8 w-8 px-0" onClick={() => setSelected(report)} size="sm" variant="secondary"><Eye size={15} /></Button></td>
          </tr>
        )} />
      )}

      {selected && <Detail report={selected} onClose={() => setSelected(null)} onStatus={(nextStatus) => changeStatus(selected, nextStatus)} />}
    </div>
  );
}

function Detail({ report, onClose, onStatus }) {
  return <div className="fixed inset-0 z-40 bg-slate-950/30 p-4"><aside className="ml-auto h-full max-w-xl overflow-auto rounded-card bg-white p-5 shadow-drawer">
    <div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase text-park-gold">{report.area}</p><h3 className="font-sans text-xl font-semibold text-park-black">{report.code}</h3></div><Button onClick={onClose} size="sm" variant="secondary">Cerrar</Button></div>
    <div className="mt-5 grid gap-3 text-sm">
      <DetailRow label="Reportado por" value={report.reportedBy ? `${report.reportedBy.firstName} ${report.reportedBy.lastName}` : "Sistema"} />
      <DetailRow label="Fecha" value={new Date(report.createdAt).toLocaleString("es-PE")} />
      <DetailRow label="Tipo" value={report.type.replaceAll("_", " ")} />
      <DetailRow label="Descripcion" value={report.description} />
      <DetailRow label="Prioridad" value={<StatusBadge value={report.priority} />} />
      <DetailRow label="Estado" value={<StatusBadge value={report.status} />} />
      <DetailRow label="Habitacion / zona" value={report.room ? `Habitacion ${report.room.number}` : "-"} />
      <DetailRow label="Producto relacionado" value={report.product?.name || "-"} />
      {report.requiresMaintenance && <p className="rounded-lg bg-amber-50 p-3 font-bold text-amber-700">Requiere revision de mantenimiento.</p>}
    </div>
    <div className="mt-5">
      <h4 className="font-sans text-lg font-semibold text-park-black">Fotos</h4>
      {report.evidences?.length ? <div className="mt-2 flex flex-wrap gap-2">{report.evidences.map((item) => <img key={item.id} className="h-24 w-32 rounded-card border border-park-border object-cover" src={`${API_ROOT}${item.imageUrl}`} alt={item.fileName || "Evidencia"} />)}</div> : <p className="mt-2 text-sm text-park-muted">Sin fotos adjuntas.</p>}
    </div>
    <div className="mt-5">
      <h4 className="font-sans text-lg font-semibold text-park-black">Historial</h4>
      <p className="mt-2 text-sm text-park-muted">Creado como {report.status}. {report.resolvedAt ? `Resuelto el ${new Date(report.resolvedAt).toLocaleString("es-PE")}.` : ""}</p>
    </div>
    <div className="mt-5 flex flex-wrap gap-2">
      {report.status !== "EN_REVISION" && report.status !== "RESUELTO" && <Button onClick={() => onStatus("EN_REVISION")} variant="gold">Pasar a revision</Button>}
      {report.status !== "RESUELTO" && <Button onClick={() => onStatus("RESUELTO")}>Resolver</Button>}
    </div>
  </aside></div>;
}

function Metric({ label, value, icon }) {
  return <div className="rounded-card border border-park-border bg-park-bg p-4"><div className="flex items-center gap-2 text-park-green">{icon}<span className="font-display text-[28px] font-semibold">{value}</span></div><p className="mt-1 text-xs font-bold uppercase text-park-muted">{label}</p></div>;
}

function DetailRow({ label, value }) {
  return <div className="rounded-card border border-park-border bg-park-bg p-3"><p className="text-xs font-black uppercase text-park-muted">{label}</p><div className="mt-1 font-semibold text-park-dark">{value}</div></div>;
}
