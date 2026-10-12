// Limpieza › Tareas. Por hacer y En curso. Cada tarea pide sus fotos según cómo nació:
// - Revisión antes de la salida del huésped: una foto por zona (cuarto, baño, despensa); si hay daños se reportan con foto.
// - Pedido del huésped (limpieza o toallas): una foto del trabajo hecho; primero Recepción debe aceptarlo.
// - Limpieza de habitación: foto de entrada y de salida por zona (la de salida después de la de entrada).
// Rutas: PATCH /api/cleaning/tasks/:id/start|finish, POST /:id/evidence y /:id/report (el servidor exige turno abierto).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, Clock3, Play, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../../services/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, Tag, timeOf, useShift, useToast } from "../recepcion/rxkit";
import { PRIORITY, cleaningKind, photoSrc, uploadPhotos, useOps } from "./OpsShell";
import { isRunning, isUrgent, isWaiting } from "./opsNavigation";

const ZONES = [["CUARTO", "Cuarto"], ["BAÑO", "Baño"], ["REFRI / DESPENSA", "Refri / despensa"]];
const has = (task, area, stage) => (task.evidences || []).find((item) => String(item.area || "").toUpperCase() === area && String(item.stage || "").toUpperCase() === stage) || null;

// Qué fotos pide cada tipo de tarea y si ya está completa.
export function evidencePlan(task) {
  const kind = cleaningKind(task).key;
  if (kind === "revision") return { kind, slots: ZONES.map(([area, label]) => ({ area, stage: "REVISION", label, photo: has(task, area, "REVISION") })) };
  if (kind === "solicitud") { const photo = (task.evidences || []).find((item) => String(item.fileUrl || item.imageUrl || "").trim()) || null; return { kind, slots: [{ area: "SOLICITUD", stage: "TRABAJO_REALIZADO", label: "Trabajo realizado", photo }] }; }
  return { kind, slots: ZONES.flatMap(([area, label]) => [{ area, stage: "ENTRADA", label: `${label} · al entrar`, photo: has(task, area, "ENTRADA") }, { area, stage: "SALIDA", label: `${label} · al terminar`, photo: has(task, area, "SALIDA"), after: "ENTRADA" }]) };
}
const complete = (task) => evidencePlan(task).slots.every((slot) => slot.photo);
const startLabel = (task) => ({ revision: "Revisar habitación", solicitud: "Atender pedido", rutina: "Iniciar limpieza" }[cleaningKind(task).key]);

export function CleaningTasksPage() {
  const { rows, open, loading, reload } = useOps();
  const { active: shiftActive, openClock } = useShift();
  const show = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("vista") === "curso" ? "curso" : "hacer";
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const running = open.filter((row) => isRunning("LIMPIEZA", row));
  const todo = open.filter((row) => !isRunning("LIMPIEZA", row)).sort((a, b) => (isWaiting(a) - isWaiting(b)) || (isUrgent(b) - isUrgent(a)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const list = tab === "curso" ? running : todo;
  const selected = rows.find((row) => String(row.id) === params.get("ver")) || null;
  const openTask = (row) => setParams({ ...(tab === "curso" ? { vista: "curso" } : {}), ver: String(row.id) });
  const close = () => setParams(tab === "curso" ? { vista: "curso" } : {});

  async function start(task) {
    setBusy(task.id); setError("");
    try { await api(`/cleaning/tasks/${task.id}/start`, { method: "PATCH", body: {} }); show(`${task.code} en curso. Toma las fotos que pide la tarea.`); await reload(); setParams({ vista: "curso", ver: String(task.id) }); }
    catch (cause) { setError(`${task.code}: ${cause.message}`); } finally { setBusy(null); }
  }
  if (loading) return <LoadingSpinner label="Cargando tus tareas…" />;

  return <>
    <PageHead title="Tareas" tools={<>
      <div className="rx-seg">
        <button type="button" className={tab === "hacer" ? "is-on" : ""} onClick={() => setParams({})}>Por hacer<i>{todo.length}</i></button>
        <button type="button" className={tab === "curso" ? "is-on" : ""} onClick={() => setParams({ vista: "curso" })}>En curso<i>{running.length}</i></button>
      </div>
      <button className="rx-btn" type="button" onClick={reload}><RefreshCw />Actualizar</button>
    </>}>Empieza la tarea, toma las fotos que pide y finalízala. Si encuentras un daño o falta algo, repórtalo desde la tarea.</PageHead>
    {!shiftActive ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>Inicia tu turno para trabajar.</b> Puedes ver tus tareas, pero no iniciarlas, fotografiarlas ni finalizarlas. <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}

    {list.length ? <div className="op-cards">{list.map((task) => { const kind = cleaningKind(task); const [pLabel, pTone] = PRIORITY[task.priority] || ["Media", "info"]; const waiting = isWaiting(task); const plan = evidencePlan(task); const done = plan.slots.filter((slot) => slot.photo).length; return <article key={task.id} className={`op-card ${task.priority === "CRITICA" ? "is-crit" : isUrgent(task) ? "is-warn" : ""}`} onClick={() => openTask(task)}>
      <header><div><small>{task.code} · {kind.short}</small><b>Habitación {task.room?.number || task.roomId || "—"}</b></div><Tag tone={pTone}>{pLabel}</Tag></header>
      {task.description ? <p>{task.description}</p> : null}
      <div className="op-meta"><span><Clock3 size={13} />{timeOf(task.createdAt)}</span>{isRunning("LIMPIEZA", task) ? <span><Camera size={13} />{done} de {plan.slots.length} fotos</span> : null}{task.operationalReports?.length ? <span className="crit"><AlertTriangle size={13} />Con reporte</span> : null}</div>
      {waiting ? <div className="op-wait">Espera que Recepción acepte el pedido</div> : isRunning("LIMPIEZA", task) ? <button className="rx-btn rx-btn--primary" type="button" onClick={(event) => { event.stopPropagation(); openTask(task); }}><Camera />Continuar</button> : <button className="rx-btn rx-btn--primary" type="button" disabled={!shiftActive || busy === task.id} onClick={(event) => { event.stopPropagation(); start(task); }}><Play />{busy === task.id ? "Iniciando…" : startLabel(task)}</button>}
    </article>; })}</div> : <section className="rx-card"><Empty icon={Sparkles} title={tab === "curso" ? "No tienes tareas en curso" : "No tienes tareas por hacer"}>Las tareas que Recepción te asigne aparecerán aquí al instante.</Empty></section>}

    <TaskDrawer task={selected} onClose={close} onStart={() => start(selected)} busy={busy === selected?.id} />
  </>;
}

function TaskDrawer({ task, onClose, onStart, busy }) {
  const { reload } = useOps();
  const { active: shiftActive } = useShift();
  const show = useToast();
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const plan = useMemo(() => (task ? evidencePlan(task) : null), [task]);
  if (!task) return null;
  const kind = cleaningKind(task);
  const running = isRunning("LIMPIEZA", task);
  const waiting = isWaiting(task);
  const ready = complete(task);
  const canWork = running && shiftActive;

  async function upload(slot, files) {
    if (!files?.length) return;
    setUploading(`${slot.area}-${slot.stage}`); setError("");
    try { const saved = await uploadPhotos(files); await api(`/cleaning/tasks/${task.id}/evidence`, { method: "POST", body: { area: slot.area, stage: slot.stage, description: `${slot.label}: revisado`, files: saved } }); show(`Foto guardada: ${slot.label.toLowerCase()}.`); await reload(); }
    catch (cause) { setError(cause.message); } finally { setUploading(""); }
  }
  async function finish() {
    setFinishing(true); setError("");
    try { await api(`/cleaning/tasks/${task.id}/finish`, { method: "PATCH", body: {} }); show(`${task.code} finalizada.`); await reload(); onClose(); }
    catch (cause) { setError(cause.message); } finally { setFinishing(false); }
  }
  const footer = task.status === "PENDIENTE" ? <><button className="rx-btn" type="button" onClick={onClose}>Cerrar</button><button className="rx-btn rx-btn--primary" type="button" onClick={onStart} disabled={busy || waiting || !shiftActive}><Play />{startLabel(task)}</button></>
    : running ? <><button className="rx-btn rx-btn--danger" type="button" onClick={() => setReporting(true)} disabled={!shiftActive}><AlertTriangle />{kind.key === "revision" ? "Reportar daños" : "Reportar problema"}</button><button className="rx-btn rx-btn--primary" type="button" onClick={finish} disabled={!ready || finishing || !shiftActive}><CheckCircle2 />{kind.key === "revision" ? "Confirmar sin daños" : "Finalizar"}</button></>
    : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>;

  return <>
    <Drawer open onClose={onClose} busy={Boolean(uploading) || finishing} eyebrow={`${task.code} · ${kind.label}`} title={`Habitación ${task.room?.number || task.roomId || "—"}`} subtitle={task.description || (kind.key === "revision" ? "El huésped está por salir: revisa que todo esté en orden" : kind.key === "rutina" ? "Deja la habitación lista para el siguiente huésped" : "Pedido hecho desde la app del huésped")} footer={footer}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Tag tone={(PRIORITY[task.priority] || [])[1] || "info"}>Prioridad {((PRIORITY[task.priority] || ["media"])[0]).toLowerCase()}</Tag>{running ? <Tag tone="info">En curso desde {timeOf(task.startedAt || task.updatedAt)}</Tag> : null}{task.assignedTo ? <Tag>Asignada a {task.assignedTo}</Tag> : <Tag>Sin asignar: la puede tomar cualquiera</Tag>}</div>
      {waiting ? <Alert tone="warn">Recepción aún no acepta este pedido del huésped. Cuando lo acepte podrás empezar.</Alert> : null}
      {task.status === "PENDIENTE" && !waiting ? <Alert tone="info">Al empezar se te pedirán {plan.slots.length} foto(s). {kind.key === "rutina" ? "En cada zona: una al entrar y otra al terminar." : kind.key === "revision" ? "Una por zona. Si ves un daño, repórtalo con foto." : "Una del trabajo hecho."}</Alert> : null}
      <section className="rx-sec"><h3>Fotos {running ? `(${plan.slots.filter((slot) => slot.photo).length} de ${plan.slots.length})` : ""}</h3>
        <div className="op-photos">{plan.slots.map((slot) => { const key = `${slot.area}-${slot.stage}`; const blocked = slot.after && !has(task, slot.area, slot.after); return <div key={key} className={`op-photo ${slot.photo ? "is-done" : ""}`}>
          {slot.photo ? <a href={photoSrc(slot.photo)} target="_blank" rel="noreferrer"><img src={photoSrc(slot.photo)} alt={slot.label} /></a> : <label className={`op-shot ${!canWork || blocked || uploading ? "is-off" : ""}`}><Camera />{uploading === key ? "Subiendo…" : blocked ? "Primero la de entrada" : "Tomar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!canWork || blocked || Boolean(uploading)} onChange={(event) => { upload(slot, event.target.files); event.target.value = ""; }} /></label>}
          <span>{slot.photo ? <CheckCircle2 size={13} /> : null}{slot.label}</span>
        </div>; })}</div>
      </section>
      {task.operationalReports?.length ? <section className="rx-sec"><h3>Reportes enviados</h3><ul className="rx-list">{task.operationalReports.map((report) => <li key={report.id}><span className="rx-ico"><AlertTriangle /></span><div className="grow"><b>{report.code} · {String(report.type || "").replaceAll("_", " ").toLowerCase()}</b><small>{report.description}</small></div><Tag tone={report.requiresMaintenance ? "warn" : "info"}>{report.requiresMaintenance ? "A mantenimiento" : "A Recepción"}</Tag></li>)}</ul></section> : null}
      {running && !ready ? <Alert tone="info">{kind.key === "revision" ? "Con las 3 fotos puedes confirmar que la habitación está sin daños." : "Cuando estén todas las fotos se habilita Finalizar."}</Alert> : null}
      {!shiftActive && running ? <Alert tone="warn">Inicia tu turno para seguir con esta tarea.</Alert> : null}
      {error ? <Alert tone="crit">{error}</Alert> : null}
    </Drawer>
    {reporting ? <ReportDrawer task={task} onClose={() => setReporting(false)} onDone={() => { setReporting(false); reload(); if (kind.key === "revision") onClose(); }} /> : null}
  </>;
}

function ReportDrawer({ task, onClose, onDone }) {
  const show = useToast();
  const revision = cleaningKind(task).key === "revision";
  const [form, setForm] = useState({ type: "DANO_INFRAESTRUCTURA", priority: "ALTA", description: "" });
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    if (!form.description.trim()) { setError("Describe lo que encontraste."); return; }
    if (revision && !files?.length) { setError("Adjunta una foto del daño: Recepción la necesita para cobrarlo o repararlo."); return; }
    setBusy(true); setError("");
    try { const saved = files?.length ? await uploadPhotos(files) : []; const report = await api(`/cleaning/tasks/${task.id}/report`, { method: "POST", body: { ...form, description: form.description.trim(), files: saved } }); show(`Reporte ${report.code} enviado${report.requiresMaintenance ? " a Mantenimiento (Recepción lo asigna)" : " a Recepción"}.`); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${task.code} · Habitación ${task.room?.number || task.roomId}`} title={revision ? "Reportar daños" : "Reportar un problema"} subtitle={revision ? "La revisión termina aquí: Recepción ve el daño antes de cerrar la salida del huésped" : "Recepción lo recibe al instante; si es una reparación, pasa a Mantenimiento"}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--danger" type="button" onClick={send} disabled={busy}><AlertTriangle />{busy ? "Enviando…" : "Enviar reporte"}</button></>}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <label className="rx-field"><span>Qué pasó</span><select className="rx-select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="DANO_INFRAESTRUCTURA">Daño en la habitación</option><option value="DANO_EQUIPO">Equipo malogrado</option><option value="MANTENIMIENTO">Necesita mantenimiento</option><option value="FALTA_INSUMO">Falta un insumo</option><option value="OTRO">Otro</option></select></label>
      <label className="rx-field"><span>Prioridad</span><select className="rx-select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
    </div>
    <label className="rx-field"><span>Detalle</span><textarea className="rx-input" style={{ height: 90, paddingTop: 8 }} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={revision ? "Ej. mancha en la alfombra junto a la cama" : "Ej. la ducha gotea"} /></label>
    <label className="op-shot op-shot--inline" style={{ justifySelf: "start" }}><Camera />{files?.length ? `${files.length} foto(s) lista(s)` : revision ? "Adjuntar foto del daño" : "Adjuntar foto (opcional)"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => setFiles(event.target.files)} /></label>
    {!revision && ["DANO_INFRAESTRUCTURA", "DANO_EQUIPO", "MANTENIMIENTO"].includes(form.type) ? <Alert tone="info">Irá a Mantenimiento cuando Recepción lo acepte y lo asigne.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
