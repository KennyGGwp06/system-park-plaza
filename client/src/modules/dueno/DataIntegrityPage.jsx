// Control del sistema › Calidad de los datos. Revisiones automáticas de lo que puede romper la operación (pedidos
// incompletos, recetas sin ingredientes, saldos inválidos, lotes vencidos, marcaciones y pases inconsistentes), con
// corrección automática para lo que es seguro corregir. Rutas: GET /api/data-integrity, POST /api/data-integrity/sanitize.
import { CheckCircle2, Database, Wrench } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Empty, Kpi, PageHead, Tag, useBusy, useToast, whenText } from "./kit";

const SEVERITY = { CRITICAL: ["Crítico", "crit"], WARNING: ["Atención", "warn"], OK: ["Bien", "ok"] };

export function DataIntegrityPage() {
  const data = useFetch("/data-integrity", { initialData: null, realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  if (!data.data) return data.error ? <Alert tone="crit">{data.error.message}</Alert> : <LoadingSpinner label="Revisando los datos…" />;
  const d = data.data;
  const fixable = d.checks.filter((check) => check.autoFixable && check.items.length);
  const sanitize = () => run(async () => { await api("/data-integrity/sanitize", { method: "POST", body: {} }); show("Correcciones automáticas aplicadas."); data.reload(); });
  const ordered = d.checks.slice().sort((a, b) => ["CRITICAL", "WARNING", "OK"].indexOf(a.severity) - ["CRITICAL", "WARNING", "OK"].indexOf(b.severity));
  return <>
    <PageHead title="Calidad de los datos" tools={<button className="rx-btn rx-btn--primary" type="button" disabled={busy || !fixable.length} onClick={sanitize}><Wrench />Corregir lo automático ({fixable.length})</button>}>Revisiones que protegen la operación. Lo crítico puede romper pedidos, accesos o inventario; lo que se corrige solo se arregla con el botón y queda en la auditoría.</PageHead>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Database} label="Revisiones" value={d.checks.length} detail={`Revisado ${whenText(d.generatedAt)}`} />
      <Kpi label="Críticas" value={d.summary.critical} detail={d.summary.critical ? "Resolver hoy" : "Ninguna"} />
      <Kpi label="Con atención" value={d.summary.warnings} detail="Casos a revisar" />
      <Kpi label="En orden" value={d.summary.healthy} detail="Sin problemas" />
    </div>
    <div style={{ display: "grid", gap: 12 }}>{ordered.map((check) => { const [label, tone] = SEVERITY[check.severity] || [check.severity, "off"]; return <Card key={check.code} title={<>{check.title} <Tag tone={tone}>{label}</Tag>{check.autoFixable && check.items.length ? <> <Tag tone="info">Se corrige solo</Tag></> : null}</>} subtitle={check.items.length ? `${check.items.length} caso(s)` : "Sin casos"} flush>
      {check.items.length ? <ul className="rx-list">{check.items.slice(0, 12).map((item, index) => <li key={`${item.id}-${index}`}><div className="grow"><b>{item.label || item.id}</b><small>{item.detail || ""}</small></div></li>)}{check.items.length > 12 ? <li><small className="mut">y {check.items.length - 12} más…</small></li> : null}</ul> : <Empty icon={CheckCircle2} title="En orden" />}
    </Card>; })}</div>
  </>;
}
