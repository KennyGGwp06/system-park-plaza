// Control del sistema › Auditoría. Quién hizo qué, cuándo y qué cambió (antes → después), sin posibilidad de borrarlo.
// La cadena de registros está firmada: aquí se verifica que nadie la alteró. Rutas: GET /api/auditoria,
// GET /api/superadmin/audit/verify.
import { useMemo, useState } from "react";
import { ScrollText, ShieldCheck } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Empty, HBars, Kpi, PageHead, SearchBox, Seg, Tag, addDays, limaDay, todayKey, useChartTip, whenText } from "./kit";

export function AuditPage() {
  const audit = useFetch("/auditoria", { initialData: [], realtime: true });
  const verify = useFetch("/superadmin/audit/verify", { initialData: null, realtime: false });
  const [text, setText] = useState("");
  const [module, setModule] = useState("");
  const [range, setRange] = useState("7");
  const chart = useChartTip();
  const from = addDays(todayKey(), -(Number(range) - 1));
  const rows = (Array.isArray(audit.data) ? audit.data : []).filter((row) => limaDay(row.createdAt) >= from);
  const userName = (row) => (row.user ? `${row.user.firstName} ${row.user.lastName}` : "Sistema");
  const modules = [...new Set(rows.map((row) => row.module))].sort();
  const shown = useMemo(() => rows.filter((row) => (!module || row.module === module) && (!text.trim() || `${userName(row)} ${row.module} ${row.action} ${row.detail}`.toLowerCase().includes(text.trim().toLowerCase()))).slice(0, 400), [rows, module, text]);
  const byUser = Object.entries(rows.reduce((acc, row) => { const key = userName(row); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);
  const v = verify.data;
  if (audit.loading && !rows.length) return <LoadingSpinner label="Cargando la auditoría…" />;
  return <>
    <PageHead title="Auditoría" tools={<Seg value={range} onChange={setRange} options={[["1", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["365", "Año"]]} />}>Todo lo que se hizo en el sistema, con quién y qué cambió. Nada se puede borrar; la cadena de registros está firmada y se verifica abajo.</PageHead>
    {v ? <div style={{ marginBottom: 12 }}><Alert tone={v.rotos ? "crit" : "ok"}><ShieldCheck size={15} style={{ verticalAlign: -3 }} /> {v.rotos ? <b>La cadena de auditoría tiene {v.rotos} registro(s) alterado(s).</b> : <b>Cadena íntegra:</b>} {v.encadenados} registros firmados de {v.total}{v.sinFirma ? ` (${v.sinFirma} anteriores a la firma)` : ""}.</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ScrollText} label="Registros" value={rows.length} detail="En el periodo" />
      <Kpi label="Personas" value={byUser.length} detail="Hicieron cambios" />
      <Kpi label="Módulos" value={modules.length} detail="Con actividad" />
      <Kpi label="Cambios con antes → después" value={rows.filter((row) => (row.changes || []).length).length} detail="Precios, accesos, reglas" />
    </div>
    <Card title="Actividad por persona" subtitle="Registros en el periodo" style={{ marginBottom: 14 }}><ChartBox><HBars rows={byUser} name="Registros" tip={chart.tip} x0={150} tooltipLabel="Registros" />{chart.layer}</ChartBox></Card>
    <Card title="Registros" flush tools={<><SearchBox value={text} onChange={setText} placeholder="Persona, acción o detalle" width={240} /><select className="rx-select" value={module} onChange={(event) => setModule(event.target.value)} style={{ width: 170 }}><option value="">Todos los módulos</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select></>}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha y hora</th><th>Persona</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id}><td className="mut" style={{ whiteSpace: "nowrap" }}>{whenText(row.createdAt)}</td><td>{userName(row)}</td><td><Tag>{row.module}</Tag></td><td className="mut">{String(row.action || "").replaceAll("_", " ").toLowerCase()}</td><td style={{ maxWidth: 520 }}>{row.detail || "—"}{(row.changes || []).length ? <small className="mut" style={{ display: "block" }}>{row.changes.map((c) => `${c.label}: ${c.before ?? "—"} → ${c.after ?? "—"}`).join(" · ")}</small> : null}</td></tr>)}</tbody></table></div> : <Empty icon={ScrollText} title="Sin registros con este filtro" />}
    </Card>
  </>;
}
