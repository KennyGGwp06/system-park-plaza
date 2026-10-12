// Mantenimiento › Trabajos. Por hacer y En reparación. Recepción acepta cada incidencia y la asigna; el técnico la
// inicia, toma la foto de antes y la de después, y la finaliza explicando qué hizo.
// Rutas: PATCH /api/maintenance/reports/:id/start|finish y POST /:id/evidence (el servidor exige turno abierto).
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, CheckCircle2, Clock3, MapPin, Play, RefreshCw, Wrench } from "lucide-react";
import { api } from "../../services/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, PageHead, Tag, dateShort, timeOf, useShift, useToast } from "../recepcion/rxkit";
import { PRIORITY, photoSrc, uploadPhotos, useOps } from "./OpsShell";
import { isRunning, isUrgent } from "./opsNavigation";

const photoOf = (job, stage) => (job.evidences || []).find((item) => String(item.stage || "").toUpperCase() === stage) || null;
// Las fotos que mandó quien reportó se guardan junto a las de la reparación, pero sin etapa ANTES / DESPUES.
const reportPhotos = (job) => (job.evidences || []).filter((item) => !["ANTES", "DESPUES"].includes(String(item.stage || "").toUpperCase()) && (item.fileUrl || item.imageUrl));
const typeLabel = (job) => String(job.type || "MANTENIMIENTO").replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const sourceLabel = (job) => (job.reportedFrom === "LIMPIEZA" ? `Reportado por Limpieza${job.reportedByName ? ` (${job.reportedByName})` : ""}` : job.clientId ? "Pedido del huésped" : "Reportado por Recepción");
const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");

export function MaintenanceJobsPage() {
  const { rows, open, loading, reload } = useOps();
  const { active: shiftActive, openClock } = useShift();
  const show = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("vista") === "curso" ? "curso" : "hacer";
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const running = open.filter((row) => isRunning("MANTENIMIENTO", row));
  const todo = open.filter((row) => !isRunning("MANTENIMIENTO", row)).sort((a, b) => (isUrgent(b) - isUrgent(a)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const list = tab === "curso" ? running : todo;
  const selected = rows.find((row) => String(row.id) === params.get("ver")) || null;
  const openJob = (row) => setParams({ ...(tab === "curso" ? { vista: "curso" } : {}), ver: String(row.id) });
  const close = () => setParams(tab === "curso" ? { vista: "curso" } : {});

  async function start(job) {
    setBusy(job.id); setError("");
    try { await api(`/maintenance/reports/${job.id}/start`, { method: "PATCH", body: {} }); show(`${job.code} en reparación. Toma la foto de cómo está antes de tocar nada.`); await reload(); setParams({ vista: "curso", ver: String(job.id) }); }
    catch (cause) { setError(`${job.code}: ${cause.message}`); } finally { setBusy(null); }
  }
  if (loading) return <LoadingSpinner label="Cargando tus trabajos…" />;

  return <>
    <PageHead title="Trabajos" tools={<>
      <div className="rx-seg">
        <button type="button" className={tab === "hacer" ? "is-on" : ""} onClick={() => setParams({})}>Por hacer<i>{todo.length}</i></button>
        <button type="button" className={tab === "curso" ? "is-on" : ""} onClick={() => setParams({ vista: "curso" })}>En reparación<i>{running.length}</i></button>
      </div>
      <button className="rx-btn" type="button" onClick={reload}><RefreshCw />Actualizar</button>
    </>}>Inicia el trabajo, toma la foto de antes y la de después, y finalízalo explicando qué hiciste. Recepción ve el avance al instante.</PageHead>
    {!shiftActive ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>Inicia tu turno para trabajar.</b> Puedes ver tus trabajos, pero no iniciarlos, fotografiarlos ni finalizarlos. <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}

    {list.length ? <div className="op-cards">{list.map((job) => { const [pLabel, pTone] = PRIORITY[job.priority] || ["Media", "info"]; const before = photoOf(job, "ANTES"), after = photoOf(job, "DESPUES"); return <article key={job.id} className={`op-card ${job.priority === "CRITICA" ? "is-crit" : isUrgent(job) ? "is-warn" : ""}`} onClick={() => openJob(job)}>
      <header><div><small>{job.code} · {typeLabel(job)}</small><b>{job.location || job.area || "Área reportada"}</b></div><Tag tone={pTone}>{pLabel}</Tag></header>
      {job.description ? <p>{job.description}</p> : null}
      <div className="op-meta"><span><Clock3 size={13} />{dateShort(localDay(job.createdAt))} {timeOf(job.createdAt)}</span><span>{sourceLabel(job)}</span>{isRunning("MANTENIMIENTO", job) ? <span><Camera size={13} />{(before ? 1 : 0) + (after ? 1 : 0)} de 2 fotos</span> : null}</div>
      {isRunning("MANTENIMIENTO", job) ? <button className="rx-btn rx-btn--primary" type="button" onClick={(event) => { event.stopPropagation(); openJob(job); }}><Camera />Continuar</button> : <button className="rx-btn rx-btn--primary" type="button" disabled={!shiftActive || busy === job.id} onClick={(event) => { event.stopPropagation(); start(job); }}><Play />{busy === job.id ? "Iniciando…" : "Iniciar reparación"}</button>}
    </article>; })}</div> : <section className="rx-card"><Empty icon={Wrench} title={tab === "curso" ? "No tienes trabajos en reparación" : "No tienes trabajos por hacer"}>Cuando Recepción acepte una incidencia y te la asigne, aparecerá aquí al instante.</Empty></section>}

    <JobDrawer job={selected} onClose={close} onStart={() => start(selected)} busy={busy === selected?.id} />
  </>;
}

function JobDrawer({ job, onClose, onStart, busy }) {
  const { reload } = useOps();
  const { active: shiftActive } = useShift();
  const show = useToast();
  const [uploading, setUploading] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [form, setForm] = useState({ workDescription: "", observations: "" });
  const [error, setError] = useState("");
  if (!job) return null;
  const running = isRunning("MANTENIMIENTO", job);
  const before = photoOf(job, "ANTES"), after = photoOf(job, "DESPUES");
  const canWork = running && shiftActive;
  const slots = [["ANTES", "Antes de reparar", before, null], ["DESPUES", "Después de reparar", after, "ANTES"]];

  async function upload(stage, files) {
    if (!files?.length) return;
    setUploading(stage); setError("");
    try { const saved = await uploadPhotos(files); await api(`/maintenance/reports/${job.id}/evidence`, { method: "POST", body: { stage, description: stage === "ANTES" ? "Estado antes de la reparación" : "Resultado después de la reparación", files: saved } }); show(stage === "ANTES" ? "Foto de antes guardada." : "Foto de después guardada."); await reload(); }
    catch (cause) { setError(cause.message); } finally { setUploading(""); }
  }
  async function finish() {
    if (!form.workDescription.trim()) { setError("Explica qué reparaste: queda en el historial y lo ve el dueño."); return; }
    setFinishing(true); setError("");
    try { await api(`/maintenance/reports/${job.id}/finish`, { method: "PATCH", body: { workDescription: form.workDescription.trim(), observations: form.observations.trim() } }); show(`${job.code} finalizado.`); setForm({ workDescription: "", observations: "" }); await reload(); onClose(); }
    catch (cause) { setError(cause.message); } finally { setFinishing(false); }
  }
  const footer = ["ABIERTO", "PENDIENTE"].includes(job.status) ? <><button className="rx-btn" type="button" onClick={onClose}>Cerrar</button><button className="rx-btn rx-btn--primary" type="button" onClick={onStart} disabled={busy || !shiftActive}><Play />Iniciar reparación</button></>
    : running ? <><button className="rx-btn" type="button" onClick={onClose}>Cerrar</button><button className="rx-btn rx-btn--primary" type="button" onClick={finish} disabled={!before || !after || finishing || !shiftActive}><CheckCircle2 />{finishing ? "Finalizando…" : "Finalizar trabajo"}</button></>
    : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>;

  return <Drawer open onClose={onClose} busy={Boolean(uploading) || finishing} eyebrow={`${job.code} · ${typeLabel(job)}`} title={job.location || job.area || "Área reportada"} subtitle={`${sourceLabel(job)} · ${dateShort(localDay(job.createdAt))} ${timeOf(job.createdAt)}`} footer={footer}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Tag tone={(PRIORITY[job.priority] || [])[1] || "info"}>Prioridad {((PRIORITY[job.priority] || ["media"])[0]).toLowerCase()}</Tag>{running ? <Tag tone="info">En reparación desde {timeOf(job.startedAt)}</Tag> : null}</div>
    <section className="rx-sec"><h3>Qué reportaron</h3><p style={{ margin: 0, fontSize: 13.5 }}>{job.description || "Sin detalle."}</p>
      {reportPhotos(job).length ? <div className="op-photos" style={{ marginTop: 10 }}>{reportPhotos(job).map((file, index) => <div className="op-photo is-done" key={index}><a href={photoSrc(file)} target="_blank" rel="noreferrer"><img src={photoSrc(file)} alt="Foto del reporte" /></a><span>Foto del reporte</span></div>)}</div> : null}
    </section>
    <section className="rx-sec"><h3>Fotos de la reparación</h3>
      <div className="op-photos">{slots.map(([stage, label, photo, after]) => { const blocked = after && !photoOf(job, after); return <div key={stage} className={`op-photo ${photo ? "is-done" : ""}`}>
        {photo ? <a href={photoSrc(photo)} target="_blank" rel="noreferrer"><img src={photoSrc(photo)} alt={label} /></a> : <label className={`op-shot ${!canWork || blocked || uploading ? "is-off" : ""}`}><Camera />{uploading === stage ? "Subiendo…" : blocked ? "Primero la de antes" : "Tomar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!canWork || blocked || Boolean(uploading)} onChange={(event) => { upload(stage, event.target.files); event.target.value = ""; }} /></label>}
        <span>{photo ? <CheckCircle2 size={13} /> : null}{label}</span>
      </div>; })}</div>
    </section>
    {running ? <>
      <label className="rx-field"><span>Qué reparaste</span><textarea className="rx-input" style={{ height: 80, paddingTop: 8 }} value={form.workDescription} onChange={(event) => setForm({ ...form, workDescription: event.target.value })} placeholder="Ej. cambié el empaque de la llave de la ducha" /></label>
      <label className="rx-field"><span>Observaciones (opcional)</span><input className="rx-input" value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} placeholder="Ej. conviene cambiar la grifería completa el próximo mes" /></label>
      {!before || !after ? <Alert tone="info">Con la foto de antes y la de después se habilita Finalizar.</Alert> : null}
    </> : null}
    {!shiftActive && running ? <Alert tone="warn">Inicia tu turno para seguir con este trabajo.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
