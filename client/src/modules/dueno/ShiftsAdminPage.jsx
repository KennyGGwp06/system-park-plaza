// Equipo › Turnos y asistencia. Horario de la semana por persona (programar, mover o cancelar turnos) y la asistencia
// real: quién marcó entrada y salida con DNI + PIN. Los turnos que nacen solo de marcar entrada se ven como "sin horario".
// Rutas: GET/POST /api/shifts, PATCH /api/shifts/:id, PATCH /api/shifts/:id/cancel, GET /api/employees.
import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Plus, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, Tag, addDays, dayText, todayKey, useBusy, useToast } from "./kit";

const AREAS = [["RECEPCION", "Recepción"], ["RESTAURANTE", "Cocina"], ["BARTENDER", "Bar"], ["LIMPIEZA", "Limpieza"], ["MANTENIMIENTO", "Mantenimiento"]];
const areaName = (code) => (AREAS.find(([key]) => key === code)?.[1]) || (code === "ADMINISTRADOR" ? "Recepción" : code);
const mondayOf = (key) => { const d = new Date(`${key}T12:00:00`); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d.toISOString().slice(0, 10); };
const WEEKDAY = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function ShiftsAdminPage() {
  const shifts = useFetch("/shifts", { initialData: [], realtime: true, pollInterval: 60000 });
  const employees = useFetch("/employees", { initialData: [], realtime: false });
  const [week, setWeek] = useState(mondayOf(todayKey()));
  const [editing, setEditing] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const people = (Array.isArray(employees.data) ? employees.data : []).filter((row) => row.status === "ACTIVO" && row.position !== "CUENTA_HISTORICA_DESACTIVADA" && (row.baseRole || row.role) !== "SUPERADMIN");
  const rows = (Array.isArray(shifts.data) ? shifts.data : []).filter((row) => days.includes(row.date) && !/CANCEL/i.test(row.status || ""));
  const cell = (employeeId, date) => rows.filter((row) => Number(row.employeeId) === Number(employeeId) && row.date === date);
  const today = todayKey();
  const programmed = rows.filter((row) => row.source !== "ASISTENCIA");
  const covered = useMemo(() => AREAS.map(([code, name]) => ({ code, name, days: days.filter((d) => rows.some((row) => row.date === d && (row.area === code || (code === "RECEPCION" && row.area === "ADMINISTRADOR")))).length })), [rows, days]);

  if (shifts.loading && !rows.length && employees.loading) return <LoadingSpinner label="Cargando turnos…" />;
  return <>
    <PageHead title="Turnos y asistencia" tools={<><a className="rx-btn" href="/reloj" target="_blank" rel="noreferrer"><Clock3 />Reloj de asistencia</a><button className="rx-btn rx-btn--primary" type="button" onClick={() => setEditing({ date: today >= week && today <= addDays(week, 6) ? today : week })}><Plus />Programar turno</button></>}>El horario de la semana y lo que realmente pasó. Haz clic en una casilla para programar, mover o cancelar un turno. La asistencia se marca con DNI y PIN en cada estación.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={CalendarDays} label="Turnos programados" value={programmed.length} detail="Esta semana" />
      <Kpi label="Marcaciones sin horario" value={rows.length - programmed.length} detail="Marcó entrada sin turno programado" />
      {covered.slice(0, 2).map((row) => <Kpi key={row.code} label={`${row.name}: días cubiertos`} value={`${row.days} / 7`} detail={row.days < 7 ? "Hay días sin nadie" : "Toda la semana"} />)}
    </div>
    <div className="ow-toolbar" style={{ marginBottom: 10 }}><button className="rx-btn rx-btn--sm" type="button" onClick={() => setWeek(addDays(week, -7))}>← Anterior</button><b style={{ fontWeight: 600 }}>Semana del {dayText(week)} al {dayText(addDays(week, 6))}</b><button className="rx-btn rx-btn--sm" type="button" onClick={() => setWeek(addDays(week, 7))}>Siguiente →</button><button className="rx-btn rx-btn--sm" type="button" onClick={() => setWeek(mondayOf(today))}>Hoy</button></div>
    <Card flush>
      {people.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Persona</th>{days.map((d, i) => <th key={d} style={{ background: d === today ? "var(--blue-soft)" : undefined }}>{WEEKDAY[i]} {d.slice(8)}</th>)}</tr></thead>
        <tbody>{people.map((person) => <tr key={person.id}><td><b style={{ fontWeight: 600 }}>{person.firstName} {person.lastName}</b><small className="mut" style={{ display: "block" }}>{areaName(person.baseRole || person.role)}</small></td>
          {days.map((d) => { const list = cell(person.id, d); return <td key={d} className="is-click" style={{ cursor: "pointer", verticalAlign: "top", minWidth: 96, background: d === today ? "#F5F9FE" : undefined }} onClick={() => setEditing(list[0] || { employeeId: person.id, date: d, area: person.baseRole === "ADMINISTRADOR" ? "RECEPCION" : person.baseRole || person.role })}>
            {list.length ? <>{list.filter((row) => row.source !== "ASISTENCIA").map((row) => <div key={row.id} style={{ fontSize: 12.5, lineHeight: 1.35 }}><b style={{ fontWeight: 600 }}>{row.start}–{row.end || "…"}</b><br /><span className="mut">{areaName(row.area)}</span></div>)}{list.some((row) => row.source === "ASISTENCIA") ? <div style={{ fontSize: 12 }}><Tag tone="off">Sin horario{list.filter((row) => row.source === "ASISTENCIA").length > 1 ? ` · ${list.filter((row) => row.source === "ASISTENCIA").length} marcaciones` : ""}</Tag><br /><span className="mut">desde {list.filter((row) => row.source === "ASISTENCIA").map((row) => row.start).sort()[0]}</span></div> : null}</> : <span className="mut" style={{ fontSize: 12 }}>—</span>}
          </td>; })}</tr>)}</tbody></table></div> : <Empty title="Sin personal activo" />}
    </Card>
    {editing ? <ShiftDrawer shift={editing} people={people} onClose={() => setEditing(null)} onDone={() => { setEditing(null); shifts.reload(); }} /> : null}
  </>;
}

function ShiftDrawer({ shift, people, onClose, onDone }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const existing = Boolean(shift.id);
  const [form, setForm] = useState({ employeeId: String(shift.employeeId || ""), date: shift.date || todayKey(), start: shift.start || "08:00", end: shift.end || "16:00", area: shift.area === "ADMINISTRADOR" ? "RECEPCION" : shift.area || "RECEPCION" });
  const [reason, setReason] = useState("");
  const save = () => { if (!form.employeeId) { setError("Elige a la persona."); return; } if (form.end <= form.start && form.end !== "00:00") { setError("La salida debe ser después de la entrada."); return; } run(async () => { await api(existing ? `/shifts/${shift.id}` : "/shifts", { method: existing ? "PATCH" : "POST", body: { ...form, employeeId: Number(form.employeeId) } }); show(existing ? "Turno actualizado." : "Turno programado."); onDone(); }); };
  const cancel = () => run(async () => { await api(`/shifts/${shift.id}/cancel`, { method: "PATCH", body: { reason: reason.trim() } }); show("Turno cancelado."); onDone(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={existing ? `Turno #${shift.id}` : "Nuevo turno"} title={existing ? "Editar turno" : "Programar turno"} subtitle={shift.source === "ASISTENCIA" ? "Nació de una marcación sin horario: puedes darle horario" : "El hotel atiende de 7:00 a 24:00"}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cerrar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{existing ? "Guardar" : "Programar"}</button></>}>
    <div className="ow-form">
      <Field label="Persona" full><select className="rx-select" value={form.employeeId} disabled={existing} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Elige</option>{people.map((row) => <option key={row.id} value={row.id}>{row.firstName} {row.lastName}</option>)}</select></Field>
      <Field label="Fecha"><input className="rx-input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
      <Field label="Área"><select className="rx-select" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })}>{AREAS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>
      <Field label="Entrada"><input className="rx-input" type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></Field>
      <Field label="Salida"><input className="rx-input" type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></Field>
    </div>
    {existing && shift.source !== "ASISTENCIA" ? <section className="rx-sec"><h3>Cancelar turno</h3><div style={{ display: "flex", gap: 8 }}><input className="rx-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo" /><button className="rx-btn rx-btn--danger" type="button" disabled={busy || reason.trim().length < 5} onClick={cancel}><X />Cancelar</button></div></section> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
