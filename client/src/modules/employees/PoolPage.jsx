import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Users, Waves } from "lucide-react";
import { useLocation } from "react-router-dom";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, Input as UiInput, PageHeader, Select as UiSelect } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";

export function PoolPage() {
  const { can } = useAuth();
  const canCreate = can("RECEPCION", "VER");
  const canEdit = can("RECEPCION", "VER");
  const location = useLocation();
  const isReports = location.pathname.includes("reportes");
  const isActive = location.pathname.includes("clientes-activos");
  const endpoint = isReports ? "/pool/reports" : `/pool${isActive ? "?status=ACTIVO" : ""}`;
  const { data, loading, reload } = useFetch(endpoint, { initialData: [] });
  const [toast, setToast] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState({ clientId: "", type: "HUESPED", people: 1 });
  const [report, setReport] = useState({ clientId: "", type: "OBSERVACION", priority: "MEDIA", description: "" });
  const visibleRows = useMemo(() => (data || []).filter((item) => !typeFilter || item.type === typeFilter), [data, typeFilter]);
  const summary = useMemo(() => ({
    total: data?.length || 0,
    active: (data || []).filter((item) => item.status === "ACTIVO").length,
    people: (data || []).filter((item) => item.status === "ACTIVO").reduce((sum, item) => sum + Number(item.people || 0), 0),
    reports: isReports ? data?.length || 0 : 0
  }), [data, isReports]);

  useEffect(() => {
    if (!clientQuery.trim()) return setClients([]);
    const timeout = setTimeout(async () => {
      setClients(await api(`/pool/client-search?q=${encodeURIComponent(clientQuery)}`).catch(() => []));
    }, 250);
    return () => clearTimeout(timeout);
  }, [clientQuery]);

  async function createEntry(event) {
    event.preventDefault();
    await api("/pool", { method: "POST", body: form });
    setToast("Ingreso a piscina registrado.");
    setForm({ clientId: "", type: "HUESPED", people: 1 });
    setClientQuery("");
    reload();
  }

  async function finishEntry(entry) {
    await api(`/pool/${entry.id}/finish`, { method: "PATCH" });
    setToast("Salida registrada.");
    reload();
  }

  async function createReport(event) {
    event.preventDefault();
    await api("/pool/reports", { method: "POST", body: report });
    setToast("Reporte registrado.");
    setReport({ clientId: "", type: "OBSERVACION", priority: "MEDIA", description: "" });
    setClientQuery("");
    reload();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow="Piscina"
        title={isReports ? "Reportes de piscina" : "Control de ingresos"}
        description="Registra ingresos, salidas y observaciones de seguridad o servicio en el area de piscina."
        actions={<span className="inline-flex h-10 w-10 items-center justify-center rounded-card bg-park-green-soft text-park-green"><Waves size={20} /></span>}
      />

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <PoolMetric icon={Waves} label={isReports ? "Reportes" : "Registros"} value={summary.total} />
          <PoolMetric icon={Users} label="Activos" value={summary.active} />
          <PoolMetric icon={Users} label="Personas dentro" value={summary.people} />
          <PoolMetric icon={AlertTriangle} label="Incidencias" value={summary.reports} tone="gold" />
        </div>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={isReports ? createReport : createEntry}>
          <ClientPicker query={clientQuery} setQuery={setClientQuery} clients={clients} onSelect={(client) => {
            const label = `${client.firstName} ${client.lastName} - ${client.documentNumber}`;
            setClientQuery(label);
            setClients([]);
            if (isReports) setReport({ ...report, clientId: client.id });
            else setForm({ ...form, clientId: client.id });
          }} />
          {isReports ? (
            <>
              <Select label="Tipo" value={report.type} onChange={(type) => setReport({ ...report, type })} options={["OBSERVACION", "QUEJA", "INCIDENTE", "ACCIDENTE", "PROBLEMA_SERVICIO", "OTRO"]} />
              <Select label="Prioridad" value={report.priority} onChange={(priority) => setReport({ ...report, priority })} options={["BAJA", "MEDIA", "ALTA"]} />
              <UiInput className="md:col-span-3" placeholder="Descripcion" value={report.description} onChange={(event) => setReport({ ...report, description: event.target.value })} required />
            </>
          ) : (
            <>
              <Select label="Tipo de ingreso" value={form.type} onChange={(type) => setForm({ ...form, type })} options={["HUESPED", "CLIENTE_EXTERNO", "EVENTO"]} />
              <Input label="Personas" type="number" min="1" value={form.people} onChange={(people) => setForm({ ...form, people })} />
            </>
          )}
          {canCreate ? <Button className="md:col-span-1" size="lg" type="submit">Registrar</Button> : null}
        </form>
      </section>

      <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          {["", "HUESPED", "CLIENTE_EXTERNO", "EVENTO"].map((item) => (
            <button className={`rounded-button border px-3 py-2 text-xs font-black ${typeFilter === item ? "border-park-green bg-park-green text-white" : "border-park-border text-park-muted hover:text-park-green"}`} key={item || "TODOS"} type="button" onClick={() => setTypeFilter(item)}>
              {item ? item.replaceAll("_", " ") : "Todos"}
            </button>
          ))}
        </div>
      </section>

      {!visibleRows?.length ? <EmptyState /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visibleRows.map((item) => (
            <article key={item.id} className="rounded-card border border-park-border bg-white p-4 shadow-card">
              {isReports ? (
                <>
                  <div className="flex justify-between gap-3"><h3 className="font-black">{item.type.replaceAll("_", " ")}</h3><StatusBadge value={item.status} /></div>
                  <p className="mt-2 text-sm text-park-muted">{item.description}</p>
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-3"><h3 className="font-black">{item.qrCode}</h3><StatusBadge value={item.status} /></div>
                  <p className="mt-2 text-sm text-park-muted">{item.client ? `${item.client.firstName} ${item.client.lastName}` : "Cliente externo"} - {item.people} personas</p>
                  {canEdit && item.status === "ACTIVO" && <Button className="mt-4" variant="gold" type="button" onClick={() => finishEntry(item)}>Registrar salida</Button>}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientPicker({ query, setQuery, clients, onSelect }) {
  return (
    <div className="relative md:col-span-2">
      <Label text="Cliente" />
      <UiInput placeholder="Buscar cliente" value={query} onChange={(event) => setQuery(event.target.value)} />
      {clients.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-card border border-park-border bg-white shadow-card">
          {clients.map((client) => <button key={client.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-park-light" onClick={() => onSelect(client)}>{client.firstName} {client.lastName} - {client.documentNumber}</button>)}
        </div>
      )}
    </div>
  );
}

function Label({ text }) {
  return <label className="mb-1 block text-sm font-semibold text-park-black">{text}</label>;
}

function PoolMetric({ icon: Icon, label, value, tone = "green" }) {
  const toneClass = tone === "gold" ? "bg-park-gold-soft text-park-black" : "bg-park-green-soft text-park-green";
  return (
    <article className="rounded-card border border-park-border bg-park-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-park-muted">{label}</p>
          <strong className="mt-1 block font-display text-2xl font-semibold text-park-dark">{value}</strong>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-full ${toneClass}`}><Icon size={18} /></span>
      </div>
    </article>
  );
}

function Input({ label, value, onChange, type, ...props }) {
  return <UiInput label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} />;
}

function Select({ label, value, onChange, options }) {
  return <UiSelect label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</UiSelect>;
}
