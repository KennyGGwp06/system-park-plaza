// Limpieza / Mantenimiento › Mi turno. Lo que el trabajador ve al llegar: su jornada (entrada, trabajo con evidencia
// y salida, que es lo que el dueño revisa para validar el día), cuánto trabajo hay y qué sigue.
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, Clock3, History } from "lucide-react";
import { Empty, Tag, dateLong, timeOf, todayKey, useShift } from "../recepcion/rxkit";
import { PRIORITY, cleaningKind, placeOf, useOps } from "./OpsShell";
import { finishedAt, isDone, isRunning, isUrgent, isWaiting } from "./opsNavigation";

const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");

export function OpsHomePage() {
  const { station, rows, open, running, waiting } = useOps();
  const { active, openClock, record, today, schedule } = useShift();
  const area = station.area;
  const listPath = `${station.base}/${area === "LIMPIEZA" ? "tareas" : "trabajos"}`;
  const Icon = station.icon;
  const doneToday = rows.filter((row) => isDone(area, row) && localDay(finishedAt(row)) === todayKey());
  const withEvidence = doneToday.filter((row) => (row.evidences || []).length > 0).length;
  const urgent = open.filter((row) => isUrgent(row) && !isWaiting(row));
  const next = open.filter((row) => !isWaiting(row)).sort((a, b) => (isRunning(area, b) - isRunning(area, a)) || (isUrgent(b) - isUrgent(a)) || String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, 6);
  const exited = Boolean(today?.checkOut);
  const steps = [
    { done: Boolean(today?.checkIn), title: "Entrada marcada", detail: today?.checkIn ? `A las ${timeOf(today.checkIn)}` : "Marca tu entrada con DNI y PIN" },
    { done: withEvidence > 0, title: "Trabajo con evidencia", detail: withEvidence ? `${withEvidence} ${station.noun}(s) finalizada(s) hoy con fotos` : `Finaliza tus ${station.nouns} con sus fotos` },
    { done: exited, title: "Salida marcada", detail: exited ? `A las ${timeOf(today.checkOut)}` : "Al terminar, marca tu salida con DNI y PIN" }
  ];

  return <>
    <section className="rx-day">
      <div>
        <small>{station.name} · {active ? `en turno desde ${timeOf(record?.checkIn || record?.clockIn)}` : exited ? "turno cerrado por hoy" : "turno sin iniciar"}</small>
        <h1>{dateLong(todayKey())}</h1>
        <p>{active ? `${open.length} ${station.noun}(s) abiertas${urgent.length ? ` · ${urgent.length} urgente(s)` : ""}${schedule?.start && schedule.source !== "ASISTENCIA" ? ` · horario ${schedule.start}${schedule.end ? `–${schedule.end}` : ""}` : ""}` : `Marca tu entrada con DNI y PIN para iniciar, fotografiar y finalizar tus ${station.nouns}.`}</p>
        <div className="rx-day-actions">
          {active ? <><Link className="rx-btn rx-btn--primary" to={listPath}><Icon />Ir a mis {station.nouns}</Link><Link className="rx-btn" to={`${station.base}/historial`}><History />Historial</Link><button className="rx-btn" type="button" onClick={openClock}><Clock3 />Marcar salida</button></> : <button className="rx-btn rx-btn--primary" type="button" onClick={openClock}><Clock3 />{exited ? "Volver a marcar entrada" : "Iniciar turno"}</button>}
        </div>
      </div>
      <div className="rx-day-stats">
        <div><b>{open.length - running.length - waiting.length}</b><span>por empezar</span></div>
        <div><b>{running.length}</b><span>en curso</span></div>
        <div><b style={{ color: urgent.length ? "#FF9AA2" : undefined }}>{urgent.length}</b><span>urgentes</span></div>
        <div><b>{doneToday.length}</b><span>finalizadas hoy</span></div>
      </div>
    </section>

    <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Lo que sigue</h2><p>En curso primero, luego lo urgente y lo más antiguo</p></div><Link to={listPath}>Ver todo <ArrowRight size={14} /></Link></div>
        {next.length ? <ul className="rx-list">{next.map((row) => { const [label, tone] = PRIORITY[row.priority] || ["Media", "info"]; return <li key={row.id}>
          <span className="rx-ico"><Icon /></span>
          <div className="grow"><b>{row.code} · {placeOf(area, row)}</b><small>{area === "LIMPIEZA" ? cleaningKind(row).label : String(row.type || "Mantenimiento").replaceAll("_", " ").toLowerCase()}{row.description ? ` · ${row.description}` : ""}</small></div>
          {isRunning(area, row) ? <Tag tone="info">En curso</Tag> : <Tag tone={tone}>{label}</Tag>}
        </li>; })}</ul> : <Empty icon={Icon} title={`Sin ${station.nouns} pendientes`}>{waiting.length ? `${waiting.length} esperan que Recepción las acepte.` : `Cuando Recepción te asigne ${station.nouns}, aparecerán aquí.`}</Empty>}
      </section>

      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Para que tu día cuente</h2><p>El dueño valida tu día con estos tres puntos</p></div></div>
        <ul className="op-check">{steps.map((step) => <li key={step.title} className={step.done ? "done" : ""}>{step.done ? <CheckCircle2 /> : <Circle />}<div><b>{step.title}</b><small>{step.detail}</small></div></li>)}</ul>
      </section>
    </div>
  </>;
}
