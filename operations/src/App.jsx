import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, ClipboardList, Clock3, History, LogOut, Play, RefreshCw, ShieldCheck, Sparkles, Wrench, X } from "lucide-react";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const apiOrigin = apiBase.replace(/\/api\/?$/, "");
const tokenKey = "park_plaza_operations_token";

async function request(path, options = {}, token) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No fue posible conectar con el sistema.");
  return data;
}

function useData(path, token, fallback) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const reload = async () => {
    if (!token) return;
    try { setError(""); const value = await request(path, {}, token); setData(value); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); const interval = window.setInterval(reload, 15000); return () => window.clearInterval(interval); }, [path, token]);
  return { data, loading, error, reload };
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) { setUser(null); setLoading(false); return; }
    request("/auth/me", {}, token).then((data) => {
      const profile = data.user;
      if (!["LIMPIEZA", "MANTENIMIENTO"].includes(profile.displayRole || profile.role)) throw new Error("Esta cuenta no pertenece a Operaciones.");
      setUser({ ...profile, role: profile.displayRole || profile.role });
    }).catch(() => { localStorage.removeItem(tokenKey); setToken(""); setUser(null); }).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="center-screen">Cargando estación…</div>;
  if (!user) return <Login onLogin={(nextToken) => { localStorage.setItem(tokenKey, nextToken); setToken(nextToken); }} />;
  return <OperationsPortal user={user} token={token} onLogout={() => { localStorage.removeItem(tokenKey); setToken(""); }} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await request("/auth/login", { method: "POST", body: { email, password } });
      const role = data.user.displayRole || data.user.role;
      if (!["LIMPIEZA", "MANTENIMIENTO"].includes(role)) throw new Error("Esta cuenta debe ingresar al ERP correspondiente.");
      onLogin(data.token);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">P</div><p className="eyebrow">Park Plaza</p><h1>Estación de operaciones</h1><p className="muted">Limpieza y Mantenimiento. Atiende solo el trabajo asignado a tu cuenta.</p><form onSubmit={submit}><label>Correo institucional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="nombre@parkplaza.com" /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Tu contraseña" /></label>{error ? <p className="notice error">{error}</p> : null}<button className="primary wide" disabled={busy}>{busy ? "Ingresando…" : "Ingresar a mi estación"}<ChevronRight size={18} /></button></form><p className="login-help">Si no puedes ingresar, solicita apoyo a Recepción o al Superadmin.</p></section></main>;
}

function OperationsPortal({ user, token, onLogout }) {
  const role = user.role;
  const [tab, setTab] = useState("alertas");
  const navigation = role === "LIMPIEZA" ? [["alertas", "Alertas", Sparkles], ["atencion", "En atención", ClipboardList], ["historial", "Historial", History]] : [["alertas", "Alertas", AlertTriangle], ["reparacion", "En reparación", Wrench], ["historial", "Historial", History]];
  useEffect(() => setTab("alertas"), [role]);
  return <div className="station"><header className="station-header"><div className="brand"><span className="brand-mark small">P</span><div><strong>Park Plaza</strong><small>Operaciones · {role === "LIMPIEZA" ? "Limpieza" : "Mantenimiento"}</small></div></div><div className="worker"><span className="avatar">{`${user.firstName || ""}`.slice(0, 1)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{role}</small></div><button className="icon-button" type="button" onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={18} /></button></div></header><div className="station-body"><aside className="station-nav"><p>MI JORNADA</p>{navigation.map(([key, label, Icon]) => <NavButton active={tab === key} Icon={Icon} key={key} label={label} onClick={() => setTab(key)} />)}</aside><main className="station-main">{role === "LIMPIEZA" ? <CleaningStation tab={tab} token={token} /> : <MaintenanceStation tab={tab} token={token} />}</main></div><nav className="bottom-nav">{navigation.map(([key, label, Icon]) => <NavButton active={tab === key} Icon={Icon} key={key} label={label} onClick={() => setTab(key)} compact />)}</nav></div>;
}

function CleaningStation({ tab, token }) {
  const tasksQuery = useData("/cleaning/tasks", token, []);
  const shiftQuery = useData("/attendance/current", token, { active: false });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reportTask, setReportTask] = useState(null);
  const tasks = Array.isArray(tasksQuery.data) ? tasksQuery.data : [];
  const active = Boolean(shiftQuery.data?.active);
  const visible = tab === "historial" ? tasks.filter((task) => task.status === "FINALIZADA") : tab === "atencion" ? tasks.filter((task) => task.status === "EN_LIMPIEZA") : tasks.filter((task) => task.status !== "FINALIZADA");
  async function run(action) { try { setError(""); await action(); setMessage("Acción registrada correctamente."); await Promise.all([tasksQuery.reload(), shiftQuery.reload()]); } catch (err) { setError(err.message); } }
  async function changeShift() { return run(() => request(`/attendance/${active ? "check-out" : "check-in"}`, { method: "POST", body: {} }, token)); }
  async function upload(task, stage, files) { if (!files?.length) return; return run(async () => { const saved = await uploadFiles(files, token); await request(`/cleaning/tasks/${task.id}/evidence`, { method: "POST", body: { description: `${stage}: evidencia de limpieza`, files: saved } }, token); }); }
  return <><PageTitle eyebrow="Limpieza" title={tab === "alertas" ? "Mis tareas de hoy" : tab === "atencion" ? "En atención" : "Historial de limpieza"} description="Trabaja por prioridad, toma las fotos requeridas y avisa cualquier problema." action={<><button className={active ? "secondary" : "gold"} onClick={changeShift}><Clock3 size={17} />{active ? "Cerrar turno" : "Iniciar turno"}</button><button className="icon-button" onClick={tasksQuery.reload}><RefreshCw size={17} /></button></>} /><ShiftBanner active={active} role="limpieza" />{message ? <Notice text={message} /> : null}{error ? <Notice text={error} error /> : null}{tab === "alertas" ? <CleaningSummary tasks={tasks} /> : null}<section className="task-list">{visible.length ? visible.map((task) => <CleaningTask active={active} key={task.id} task={task} onReport={() => setReportTask(task)} onStart={() => run(() => request(`/cleaning/tasks/${task.id}/start`, { method: "PATCH", body: {} }, token))} onFinish={() => run(() => request(`/cleaning/tasks/${task.id}/finish`, { method: "PATCH", body: {} }, token))} onUpload={upload} />) : <Empty text={tab === "historial" ? "Aún no hay tareas finalizadas." : "No tienes tareas para esta vista."} />}</section>{reportTask ? <CleaningReport task={reportTask} token={token} onClose={() => setReportTask(null)} onSaved={() => { setReportTask(null); tasksQuery.reload(); setMessage("Problema enviado a Recepción y Superadmin."); }} /> : null}</>;
}

function CleaningSummary({ tasks }) { const open = tasks.filter((task) => task.status !== "FINALIZADA"); const high = open.filter((task) => ["ALTA", "CRITICA"].includes(task.priority)); const finished = tasks.filter((task) => task.status === "FINALIZADA"); return <div className="metrics"><Metric value={open.length} label="Por atender" /><Metric value={high.length} label="Alta prioridad" warn /><Metric value={finished.length} label="Finalizadas" good /></div>; }

function CleaningTask({ active, task, onStart, onFinish, onUpload, onReport }) {
  const room = task.room?.number || task.roomId || "Área asignada";
  const evidence = task.evidences || [];
  const hasEntry = evidence.some((item) => /entrada/i.test(item.description || ""));
  const hasExit = evidence.some((item) => /salida/i.test(item.description || ""));
  return <article className={`task-card ${task.priority === "CRITICA" ? "critical" : ""}`}><div className="task-top"><div><p className="code">{task.code}</p><h2>Habitación {room}</h2><p className="muted">{task.requestId ? "Solicitud del huésped" : "Limpieza de checkout o rutina"}</p></div><Badge value={task.status} /><Badge value={task.priority} /></div>{task.description ? <p className="task-description">{task.description}</p> : null}<div className="evidence-state"><span className={hasEntry ? "done" : "pending"}>Foto inicial {hasEntry ? "✓" : "pendiente"}</span><span className={hasExit ? "done" : "pending"}>Foto final {hasExit ? "✓" : "pendiente"}</span></div>{task.operationalReports?.length ? <p className="incident"><AlertTriangle size={16} /> Tiene una novedad registrada</p> : null}<div className="actions">{active && task.status === "PENDIENTE" ? <button className="primary" onClick={onStart}><Play size={16} />Iniciar</button> : null}{active && task.status === "EN_LIMPIEZA" ? <><PhotoButton label="Foto inicial" onFiles={(files) => onUpload(task, "ENTRADA", files)} /><PhotoButton label="Foto final" onFiles={(files) => onUpload(task, "SALIDA", files)} /><button className="secondary" onClick={onReport}><AlertTriangle size={16} />Reportar</button><button className="gold" disabled={!task.requestId && (!hasEntry || !hasExit)} onClick={onFinish}><CheckCircle2 size={16} />Finalizar</button></> : null}{task.status === "FINALIZADA" ? <p className="completed"><CheckCircle2 size={17} />Finalizada {formatDate(task.finishedAt)}</p> : null}</div></article>;
}

function CleaningReport({ task, token, onClose, onSaved }) { const [form, setForm] = useState({ type: "DANO_INFRAESTRUCTURA", priority: "ALTA", description: "" }); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); async function submit(event) { event.preventDefault(); setBusy(true); try { await request(`/cleaning/tasks/${task.id}/report`, { method: "POST", body: form }, token); onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); } } return <Modal title={`Reportar problema · ${task.code}`} onClose={onClose}><form onSubmit={submit}><label>Tipo<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="DANO_INFRAESTRUCTURA">Daño de infraestructura</option><option value="DANO_EQUIPO">Daño de equipo</option><option value="MANTENIMIENTO">Mantenimiento</option><option value="FALTA_INSUMO">Falta de insumo</option><option value="OTRO">Otro</option></select></label><label>Prioridad<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>CRITICA</option></select></label><label>Detalle<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explica qué encontraste." /></label>{error ? <Notice text={error} error /> : null}<button className="primary wide" disabled={busy}>{busy ? "Enviando…" : "Enviar reporte"}</button></form></Modal>; }

function MaintenanceStation({ tab, token }) {
  const reportsQuery = useData("/maintenance/reports", token, []);
  const shiftQuery = useData("/attendance/current", token, { active: false });
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [finishReport, setFinishReport] = useState(null);
  const reports = Array.isArray(reportsQuery.data) ? reportsQuery.data : []; const active = Boolean(shiftQuery.data?.active);
  const visible = tab === "reparacion" ? reports.filter((report) => report.status === "EN_REVISION") : tab === "historial" ? reports.filter((report) => report.status === "RESUELTO") : reports.filter((report) => report.status === "ABIERTO");
  async function run(action, text = "Acción registrada correctamente.") { try { setError(""); await action(); setMessage(text); await Promise.all([reportsQuery.reload(), shiftQuery.reload()]); } catch (err) { setError(err.message); } }
  async function upload(report, files) { if (!files?.length) return; return run(async () => { const saved = await uploadFiles(files, token); await request(`/maintenance/reports/${report.id}/evidence`, { method: "POST", body: { files: saved } }, token); }, "Evidencia guardada."); }
  return <><PageTitle eyebrow="Mantenimiento" title={tab === "alertas" ? "Trabajos asignados" : tab === "reparacion" ? "En reparación" : "Historial de reparaciones"} description="Revisa la incidencia, documenta la reparación y finaliza solo cuando esté resuelta." action={<><button className={active ? "secondary" : "gold"} onClick={() => run(() => request(`/attendance/${active ? "check-out" : "check-in"}`, { method: "POST", body: {} }, token))}><Clock3 size={17} />{active ? "Cerrar turno" : "Iniciar turno"}</button><button className="icon-button" onClick={reportsQuery.reload}><RefreshCw size={17} /></button></>} /><ShiftBanner active={active} role="mantenimiento" />{message ? <Notice text={message} /> : null}{error ? <Notice text={error} error /> : null}{tab === "alertas" ? <div className="metrics"><Metric value={reports.filter((r) => r.status === "ABIERTO").length} label="Por atender" /><Metric value={reports.filter((r) => ["ALTA", "CRITICA"].includes(r.priority)).length} label="Urgentes" warn /><Metric value={reports.filter((r) => r.status === "RESUELTO").length} label="Finalizados" good /></div> : null}<section className="task-list">{visible.length ? visible.map((report) => <MaintenanceTask active={active} key={report.id} report={report} onStart={() => run(() => request(`/maintenance/reports/${report.id}/start`, { method: "PATCH", body: {} }, token), "Reparación iniciada.")} onUpload={upload} onFinish={() => setFinishReport(report)} />) : <Empty text="No tienes trabajos asignados en esta vista." />}</section>{finishReport ? <MaintenanceFinish report={finishReport} token={token} onClose={() => setFinishReport(null)} onSaved={() => { setFinishReport(null); reportsQuery.reload(); setMessage("Reparación finalizada y enviada a supervisión."); }} /> : null}</>;
}

function MaintenanceTask({ active, report, onStart, onUpload, onFinish }) { return <article className={`task-card ${report.priority === "CRITICA" ? "critical" : ""}`}><div className="task-top"><div><p className="code">{report.code}</p><h2>{report.location || report.area || "Área reportada"}</h2><p className="muted">{String(report.type || "MANTENIMIENTO").replaceAll("_", " ")}</p></div><Badge value={report.status} /><Badge value={report.priority} /></div><p className="task-description">{report.description}</p><p className="muted small">Reportado: {formatDate(report.createdAt)}</p><div className="actions">{active && report.status === "ABIERTO" ? <button className="primary" onClick={onStart}><Wrench size={16} />Iniciar reparación</button> : null}{active && report.status === "EN_REVISION" ? <><PhotoButton label="Agregar evidencia" onFiles={(files) => onUpload(report, files)} /><button className="gold" onClick={onFinish}><CheckCircle2 size={16} />Finalizar</button></> : null}{report.status === "RESUELTO" ? <p className="completed"><CheckCircle2 size={17} />Resuelto {formatDate(report.resolvedAt)}</p> : null}</div></article>; }

function MaintenanceFinish({ report, token, onClose, onSaved }) { const [workDescription, setWorkDescription] = useState(""); const [observations, setObservations] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); async function submit(event) { event.preventDefault(); setBusy(true); try { await request(`/maintenance/reports/${report.id}/finish`, { method: "PATCH", body: { workDescription, observations } }, token); onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); } } return <Modal title={`Finalizar · ${report.code}`} onClose={onClose}><form onSubmit={submit}><p className="muted">Antes de finalizar, agrega al menos una evidencia desde la tarjeta del trabajo.</p><label>Trabajo realizado<textarea required value={workDescription} onChange={(event) => setWorkDescription(event.target.value)} placeholder="Explica la reparación realizada." /></label><label>Observaciones<textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Notas opcionales." /></label>{error ? <Notice text={error} error /> : null}<button className="gold wide" disabled={busy}>{busy ? "Finalizando…" : "Confirmar reparación"}</button></form></Modal>; }

function PageTitle({ eyebrow, title, description, action }) { return <header className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div><div className="title-actions">{action}</div></header>; }
function ShiftBanner({ active, role }) { return <section className={`shift-banner ${active ? "active" : ""}`}><Clock3 size={19} /><div><strong>{active ? "Turno activo" : "Operación bloqueada hasta iniciar turno"}</strong><p>{active ? `Ya puedes atender tus tareas de ${role}.` : "Puedes consultar tus tareas, pero no iniciar, evidenciar ni finalizar."}</p></div></section>; }
function Metric({ value, label, warn, good }) { return <article className={`metric ${warn ? "warn" : ""} ${good ? "good" : ""}`}><strong>{value}</strong><span>{label}</span></article>; }
function Notice({ text, error = false }) { return <p className={`notice ${error ? "error" : ""}`}>{text}</p>; }
function Empty({ text }) { return <section className="empty"><ShieldCheck size={28} /><p>{text}</p></section>; }
function Badge({ value }) { if (!value) return null; return <span className={`badge ${String(value).toLowerCase()}`}>{String(value).replaceAll("_", " ")}</span>; }
function NavButton({ active, Icon, label, onClick, compact = false }) { return <button className={`nav-button ${active ? "active" : ""} ${compact ? "compact" : ""}`} type="button" onClick={onClick}><Icon size={compact ? 18 : 17} /><span>{label}</span></button>; }
function PhotoButton({ label, onFiles }) { return <label className="secondary upload"><Camera size={16} />{label}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => onFiles(event.target.files)} /></label>; }
function Modal({ title, children, onClose }) { return <div className="modal-backdrop"><section className="modal"><div className="modal-title"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{children}</section></div>; }
async function uploadFiles(files, token) { const uploaded = []; for (const file of Array.from(files || [])) { if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Usa fotos JPG, PNG o WEBP."); if (file.size > 10 * 1024 * 1024) throw new Error("Cada foto debe pesar como máximo 10 MB."); const response = await fetch(`${apiOrigin}/api/cleaning/evidence/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || "No se pudo subir la evidencia."); uploaded.push(...(data.files || [])); } return uploaded; }
function formatDate(value) { return value ? new Date(value).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "Sin registro"; }
