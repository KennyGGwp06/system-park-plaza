// Equipo › Torre de control (GET /api/superadmin/control-tower). Quién trabaja hoy y si llegó a tiempo, qué áreas
// cerraron, huecos de cobertura, relevos, alertas sin atender, tardanzas (justificar) y días por validar (aprobar o
// rechazar: define el pago semanal), con las reglas del personal. Un día se paga con entrada, salida y evidencia.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, UserCheck } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Empty, Field, HBars, Kpi, PageHead, Tag, dayText, useBusy, useChartTip, useToast } from "./kit";

const STATUS = { ESPERADO: ["Esperado", "off"], EN_TURNO: ["En turno", "ok"], TARDO: ["Llegó tarde", "warn"], SIN_MARCAR: ["Sin marcar", "crit"], FALTO: ["Faltó", "crit"], CERRO: ["Cerró turno", "info"] };
const DAY = { VALIDADO: ["Validado", "ok"], PENDIENTE: ["Por validar", "warn"], NO_VALIDADO: ["No validado", "crit"] };

export function ControlTowerPage() {
  const [date, setDate] = useState("");
  const data = useFetch(`/superadmin/control-tower${date ? `?date=${date}` : ""}`, { initialData: null, realtime: true, pollInterval: 30000 });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [reasons, setReasons] = useState({});
  const [rules, setRules] = useState(null);
  const chart = useChartTip();
  useEffect(() => { if (data.data?.settings) setRules(data.data.settings); }, [data.data?.settings?.toleranceMinutes, data.data?.settings?.minEvidence, data.data?.settings?.lateThreshold]);
  if (!data.data) return data.error ? <Alert tone="crit">{data.error.message}</Alert> : <LoadingSpinner label="Armando la torre de control…" />;
  const d = data.data;
  const decide = (row, decision) => run(async () => { await api("/superadmin/day-validations", { method: "POST", body: { employeeId: row.employeeId, date: row.date, decision, reason: reasons[`${row.employeeId}|${row.date}`] || "" } }); show(`${row.name}: día ${dayText(row.date)} ${decision === "APROBADO" ? "aprobado" : "rechazado"}.`); data.reload(); });
  const justify = (item) => run(async () => { await api("/superadmin/late-justifications", { method: "POST", body: { employeeId: item.employeeId, date: item.date, reason: reasons[`late|${item.employeeId}|${item.date}`] || "" } }); show(`Tardanza de ${item.name} justificada.`); data.reload(); });
  const saveRules = () => run(async () => { await api("/superadmin/workforce-settings", { method: "PUT", body: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, Number(v)])) }); show("Reglas del personal guardadas."); data.reload(); });
  const lateRank = d.ranking.filter((row) => row.lateMinutes).map((row) => ({ name: row.name, value: row.lateMinutes })).sort((a, b) => b.value - a.value).slice(0, 8);
  const reason = (key) => reasons[key] || "";
  return <>
    <PageHead title="Torre de control" tools={<input className="rx-input" type="date" value={date || d.today} max={d.today} onChange={(event) => setDate(event.target.value)} style={{ width: 160 }} />}>Quién trabaja, quién llegó tarde, qué áreas cerraron y qué días esperan tu validación. Un día se paga cuando tiene entrada, salida y evidencia de trabajo.</PageHead>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={UserCheck} label="En turno" value={d.summary.inShift} detail={`${d.summary.scheduled} con turno programado`} />
      <Kpi label="Tarde o sin marcar" value={d.summary.late + d.summary.missing} detail={`${d.summary.late} tarde · ${d.summary.missing} sin marcar o faltó`} />
      <Kpi label="Días por validar" value={d.summary.pendingValidation} detail="Sin evidencia automática" />
      <Kpi label="Alertas vencidas" value={d.summary.overdueAlerts} detail={`Más de ${d.settings.alertSlaMinutes} min sin atender`} />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Cierre del día por área">{d.closings.map((item) => <div key={item.area} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>{item.status === "SIN_CIERRE" ? <AlertTriangle size={16} color="var(--crit)" /> : item.status === "CERRADO" ? <CheckCircle2 size={16} color="#12A07A" /> : <Clock size={16} color="var(--muted)" />}<b style={{ fontWeight: 600 }}>{item.name}</b><span className="mut">{item.status === "SIN_CIERRE" ? "sin cierre" : item.status === "CERRADO" ? "cerró" : `cierra a las ${item.closingTime}`}</span></div>)}
        {d.coverageGaps.length ? <Alert tone="warn"><b>Huecos de cobertura (7:00–24:00):</b> {d.coverageGaps.map((gap) => `${gap.areaLabel} sin nadie ${gap.gaps.join(", ")}`).join(" · ")}</Alert> : null}</Card>
      <Card title="Minutos tarde por persona" subtitle={`Últimos ${d.days} días`}><ChartBox><HBars rows={lateRank} name="Minutos" tip={chart.tip} x0={140} valueLabel={(v) => `${v} min`} tooltipLabel="Minutos tarde" />{chart.layer}</ChartBox></Card>
    </div>
    <Card title={`Tablero del día · ${dayText(d.date)}`} flush style={{ marginBottom: 14 }}>
      {d.board.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Persona</th><th>Área</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Estado</th><th>Día</th></tr></thead>
        <tbody>{d.board.map((row) => { const [s, st] = STATUS[row.status] || [row.status, "off"]; const [dd, dt] = DAY[row.day.status] || [row.day.status, "off"]; return <tr key={`${row.employeeId}-${row.shiftId}`}><td><b style={{ fontWeight: 600 }}>{row.name}</b></td><td>{row.areaLabel}</td><td className="mut">{row.start ? `${row.start}–${row.end || "…"}` : "Sin turno"}</td><td>{row.checkIn || "—"}{row.lateMinutes ? <small style={{ color: "var(--warn)" }}> +{row.lateMinutes} min</small> : null}</td><td>{row.checkOut || "—"}</td><td><Tag tone={st}>{s}</Tag></td><td title={row.day.reason}><Tag tone={dt}>{dd}</Tag> <small className="mut">{row.day.evidence} evid.</small></td></tr>; })}</tbody></table></div> : <Empty title="Nadie tiene turno ni marcó entrada ese día" />}
    </Card>
    <Card title={`Días por validar (${d.pendingValidation.length})`} subtitle="Marcaron entrada y salida pero el sistema no encontró evidencia de trabajo. Tu decisión queda en la auditoría." flush style={{ marginBottom: 14 }}>
      {d.pendingValidation.length ? <div className="rx-table-wrap"><table className="rx-table"><tbody>{d.pendingValidation.map((row) => { const key = `${row.employeeId}|${row.date}`; return <tr key={key}><td><b style={{ fontWeight: 600 }}>{row.name}</b><small className="mut" style={{ display: "block" }}>{row.area} · {dayText(row.date)}</small></td><td className="mut">{row.reason}</td><td style={{ width: 240 }}><input className="rx-input" value={reason(key)} onChange={(event) => setReasons({ ...reasons, [key]: event.target.value })} placeholder="Motivo (mín. 8 letras)" /></td><td className="n" style={{ whiteSpace: "nowrap" }}><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" disabled={busy || reason(key).trim().length < 8} onClick={() => decide(row, "APROBADO")}>Aprobar día</button> <button className="rx-btn rx-btn--sm" type="button" disabled={busy || reason(key).trim().length < 8} onClick={() => decide(row, "RECHAZADO")}>Rechazar</button></td></tr>; })}</tbody></table></div> : <Empty icon={CheckCircle2} title="No hay días esperando tu decisión" />}
    </Card>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title={`Tardanzas de la semana (${d.lates.length})`} subtitle={`Cada ${d.settings.lateThreshold} sin justificar descuentan ${d.settings.lateDiscountPercent}% del pago semanal`} flush>
        {d.lates.length ? <ul className="rx-list">{d.lates.map((item) => { const key = `late|${item.employeeId}|${item.date}`; return <li key={key}><div className="grow"><b>{item.name} · +{item.lateMinutes} min</b><small>{dayText(item.date)} · turno {item.shiftStart} · entró {item.checkIn}{item.justified ? ` · justificada: ${item.justification.reason}` : ""}</small></div>{item.justified ? <Tag tone="ok">Justificada</Tag> : <><input className="rx-input" style={{ width: 170 }} value={reason(key)} onChange={(event) => setReasons({ ...reasons, [key]: event.target.value })} placeholder="Motivo" /><button className="rx-btn rx-btn--sm" type="button" disabled={busy || reason(key).trim().length < 8} onClick={() => justify(item)}>Justificar</button></>}</li>; })}</ul> : <Empty title="Sin tardanzas esta semana" />}
      </Card>
      <Card title={`Alertas sin atender (${d.overdueAlerts.length})`} subtitle={`Pasados ${d.settings.alertSlaMinutes} min escalan a Recepción; al doble, a ti`} flush>
        {d.overdueAlerts.length ? <ul className="rx-list">{d.overdueAlerts.slice(0, 12).map((item) => <li key={item.code}><div className="grow"><b>{item.code} · {item.area}</b><small>{item.detail || item.kind}{item.assigned ? "" : " · sin responsable"}</small></div><Tag tone={item.level === "SUPERADMIN" ? "crit" : "warn"}>{item.waitingMinutes >= 1440 ? `${Math.floor(item.waitingMinutes / 1440)} d` : `${item.waitingMinutes} min`}</Tag></li>)}</ul> : <Empty icon={CheckCircle2} title="Todas las alertas atendidas a tiempo" />}
      </Card>
    </div>
    <Card title={`Puntualidad y cumplimiento · últimos ${d.days} días`} flush style={{ marginBottom: 14 }}>
      {d.ranking.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Persona</th><th>Área</th><th className="n">Turnos</th><th className="n">Asistió</th><th className="n">Tardanzas</th><th className="n">Min. tarde</th><th className="n">Faltas</th><th className="n">Días validados</th></tr></thead>
        <tbody>{d.ranking.map((row) => <tr key={row.employeeId}><td><b style={{ fontWeight: 600 }}>{row.name}</b></td><td>{row.area}</td><td className="n">{row.scheduled}</td><td className="n">{row.attended}</td><td className="n">{row.lateCount}</td><td className="n" style={{ color: row.lateMinutes ? "var(--warn)" : undefined }}>{row.lateMinutes}</td><td className="n" style={{ color: row.absences ? "var(--crit)" : undefined }}>{row.absences}</td><td className="n">{row.validated}</td></tr>)}</tbody></table></div> : <Empty title="Sin turnos programados en el periodo" />}
    </Card>
    {d.handovers.length ? <Card title="Relevos de turno del día" flush style={{ marginBottom: 14 }}><div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Área</th><th>Entregó</th><th>Recibió</th><th className="n">Espacio sin cubrir</th></tr></thead><tbody>{d.handovers.map((item, index) => <tr key={index}><td>{item.area}</td><td>{item.outgoing} · {item.outAt}</td><td>{item.incoming} · {item.inAt}</td><td className="n" style={{ color: item.gapMinutes > 0 ? "var(--warn)" : undefined }}>{item.gapMinutes > 0 ? `${item.gapMinutes} min` : "Sin hueco"}</td></tr>)}</tbody></table></div></Card> : null}
    {rules ? <Card title="Reglas del personal" subtitle="Se aplican a la validación de días y al pago semanal">
      <div className="ow-form" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <Field label="Tolerancia (min)"><input className="rx-input rx-mono" type="number" min="0" max="120" value={rules.toleranceMinutes} onChange={(event) => setRules({ ...rules, toleranceMinutes: event.target.value })} /></Field>
        <Field label="Evidencia mínima"><input className="rx-input rx-mono" type="number" min="0" max="50" value={rules.minEvidence} onChange={(event) => setRules({ ...rules, minEvidence: event.target.value })} /></Field>
        <Field label="Plazo de alerta (min)"><input className="rx-input rx-mono" type="number" min="5" max="1440" value={rules.alertSlaMinutes} onChange={(event) => setRules({ ...rules, alertSlaMinutes: event.target.value })} /></Field>
        <Field label="Tardanzas para descontar"><input className="rx-input rx-mono" type="number" min="1" max="20" value={rules.lateThreshold} onChange={(event) => setRules({ ...rules, lateThreshold: event.target.value })} /></Field>
        <Field label="Descuento semanal (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" value={rules.lateDiscountPercent} onChange={(event) => setRules({ ...rules, lateDiscountPercent: event.target.value })} /></Field>
      </div>
      <button className="rx-btn rx-btn--primary" type="button" style={{ marginTop: 10 }} disabled={busy} onClick={saveRules}>Guardar reglas</button>
    </Card> : null}
  </>;
}
