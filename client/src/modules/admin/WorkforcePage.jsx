import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, DollarSign, LogIn, LogOut, Plus, Users } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../context/AuthContext";
import { PageHeader, Button, Input, Select, Tabs } from "../../components/ui";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";

export function WorkforcePage({ view = "empleados" }) {
  const { user } = useAuth();
  const { data: employees, loading, reload } = useFetch("/employees", { initialData: [] });
  const { data: shifts, reload: reloadShifts } = useFetch("/shifts", { initialData: [] });
  const weekStart = mondayInput();
  const { data: payroll, reload: reloadPayroll } = useFetch(`/payroll/weekly?from=${weekStart}`, { initialData: [] });
  const [showShift, setShowShift] = useState(false);
  const [form, setForm] = useState({ employeeId: "", date: new Date().toISOString().slice(0, 10), start: "08:00", end: "16:00", area: "RECEPCION" });
  const [message, setMessage] = useState("");
  if (loading) return <LoadingSpinner/>;

  async function attendance(action, employeeId = user.id) { try { await api(`/attendance/${action}`, { method: "POST", body: { employeeId } }); setMessage(action === "check-in" ? "Ingreso registrado." : "Salida registrada."); reload(); reloadPayroll(); } catch (error) { setMessage(error.message); } }
  async function createShift(event) { event.preventDefault(); try { await api("/shifts", { method: "POST", body: form }); setShowShift(false); setMessage("Turno programado."); reloadShifts(); } catch (error) { setMessage(error.message); } }
  const active = employees.filter((item) => item.attendanceStatus === "EN_TURNO").length;

  return <div className="space-y-5">
    <PageHeader eyebrow="Equipo Park Plaza" title={title(view)} description="Cargos base, asignaciones rotativas, asistencia y pago semanal por días trabajados." actions={view === "turnos" ? <Button icon={Plus} onClick={() => setShowShift(true)}>Programar turno</Button> : null}/>
    {message ? <div className="rounded-card bg-park-gold-soft px-4 py-3 font-semibold text-park-dark">{message}</div> : null}
    <section className="grid gap-4 md:grid-cols-4"><Metric icon={Users} label="Empleados" value={employees.length}/><Metric icon={CheckCircle2} label="Activos ahora" value={active}/><Metric icon={CalendarDays} label="Turnos programados" value={shifts.length}/><Metric icon={DollarSign} label="Planilla proyectada" value={`S/ ${payroll.reduce((sum, item) => sum + item.total, 0)}`}/></section>
    {view === "empleados" ? <EmployeeTable employees={employees} onAttendance={attendance} currentUser={user}/> : null}
    {view === "turnos" ? <ShiftBoard shifts={shifts} employees={employees}/> : null}
    {view === "planilla" ? <PayrollTable rows={payroll}/> : null}
    {showShift ? <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4"><form className="w-full max-w-xl rounded-card bg-white p-6 shadow-drawer" onSubmit={createShift}><h2 className="font-display text-2xl font-semibold text-park-dark">Programar turno rotativo</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Select label="Empleado" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required><option value="">Seleccionar</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</Select><Select label="Área asignada" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })}>{["RECEPCION", "RESTAURANTE", "BARTENDER", "LIMPIEZA", "PISCINA", "MIRADOR", "EVENTOS"].map((item) => <option key={item}>{item}</option>)}</Select><Input label="Fecha" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/><div className="grid grid-cols-2 gap-2"><Input label="Entrada" type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })}/><Input label="Salida" type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })}/></div></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowShift(false)}>Cancelar</Button><Button type="submit">Guardar turno</Button></div></form></div> : null}
  </div>;
}

function EmployeeTable({ employees }) { return <section className="overflow-hidden rounded-card border border-park-border bg-white shadow-card"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-park-bg text-xs uppercase text-park-muted"><tr><th className="px-4 py-3">Empleado</th><th>Cargo base</th><th>PIN Asistencia</th><th>Tarifa diaria</th><th>Estado</th><th>Terminal</th></tr></thead><tbody className="divide-y divide-park-border">{employees.map((item) => <tr key={item.id}><td className="px-4 py-3 font-black text-park-dark">{item.firstName} {item.lastName}<small className="block font-medium text-park-muted">{item.email}</small></td><td>{item.baseRole}</td><td className="font-mono font-bold text-park-gold">{item.pin}</td><td>S/ {item.dailyRate}</td><td><StatusBadge value={item.attendanceStatus}/></td><td><a href="/reloj" target="_blank" className="text-park-green font-bold hover:underline">Abrir Reloj</a></td></tr>)}</tbody></table></div></section>; }
function ShiftBoard({ shifts, employees }) { const grouped = useMemo(() => Object.entries(shifts.reduce((acc, item) => { (acc[item.date] ||= []).push(item); return acc; }, {})), [shifts]); return <div className="grid gap-5">{grouped.map(([date, rows]) => <section className="rounded-card border border-park-border bg-white p-5 shadow-card" key={date}><h2 className="font-sans text-lg font-black text-park-dark">{new Date(`${date}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((shift) => { const employee = employees.find((item) => item.id === shift.employeeId); return <article className="rounded-card bg-park-bg p-4" key={shift.id}><div className="flex justify-between"><strong>{employee?.firstName} {employee?.lastName}</strong><StatusBadge value={shift.status}/></div><p className="mt-2 font-black text-park-green">{shift.area}</p><p className="text-sm text-park-muted">{shift.start} – {shift.end}</p></article>; })}</div></section>)}</div>; }
function PayrollTable({ rows }) { return <section className="overflow-hidden rounded-card border border-park-border bg-white shadow-card"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-park-bg text-xs uppercase text-park-muted"><tr><th className="px-4 py-3">Empleado</th><th>Programados</th><th>Asistidos</th><th>Faltas</th><th>Días pagables</th><th>Tarifa</th><th>Total semanal</th></tr></thead><tbody className="divide-y divide-park-border">{rows.map((item) => <tr key={item.employeeId}><td className="px-4 py-3 font-black">{item.employee}</td><td>{item.scheduledDays}</td><td>{item.attendedDays}</td><td>{item.absences}</td><td>{item.payableDays}</td><td>S/ {item.dailyRate}</td><td className="font-black text-park-green">S/ {item.total}</td></tr>)}</tbody></table></div></section>; }
function Metric({ icon: Icon, label, value }) { return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><Icon className="text-park-green"/><p className="mt-3 text-sm text-park-muted">{label}</p><strong className="font-display text-2xl font-semibold text-park-dark">{value}</strong></article>; }
function title(view) { return { empleados: "Empleados y asistencia", turnos: "Horarios rotativos", planilla: "Pago semanal" }[view]; }
function mondayInput() { const date = new Date(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date.toISOString().slice(0, 10); }
