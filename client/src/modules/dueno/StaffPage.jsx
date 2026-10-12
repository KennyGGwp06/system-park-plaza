// Equipo › Personal. Quién trabaja en el hotel (área, tarifa diaria, estado, si está en turno) y la planilla de la
// semana: días programados, asistidos, validados (los que se pagan), tardanzas y descuento. Crear o editar una persona
// y su PIN se hace en Control del sistema › Usuarios. Datos: GET /api/employees, /api/payroll/weekly?from=.
import { useState } from "react";
import { Users, Wallet } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Card, ChartBox, Empty, HBars, Kpi, PageHead, Seg, Status, Tag, addDays, dayText, soles, todayKey, useChartTip } from "./kit";

const AREA = { ADMINISTRADOR: "Recepción", RECEPCION: "Recepción", RESTAURANTE: "Cocina", BARTENDER: "Bar", LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento", SUPERADMIN: "Dirección" };
const mondayOf = (key) => { const d = new Date(`${key}T12:00:00`); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d.toISOString().slice(0, 10); };

export function StaffPage({ navigate }) {
  const [week, setWeek] = useState(mondayOf(todayKey()));
  const [tab, setTab] = useState("planilla");
  const employees = useFetch("/employees", { initialData: [], realtime: true, pollInterval: 60000 });
  const payroll = useFetch(`/payroll/weekly?from=${week}`, { initialData: [], realtime: true });
  const chart = useChartTip();
  const people = (Array.isArray(employees.data) ? employees.data : []).filter((row) => row.position !== "CUENTA_HISTORICA_DESACTIVADA");
  const rows = (Array.isArray(payroll.data) ? payroll.data : []).filter((row) => people.some((p) => Number(p.id) === Number(row.employeeId)));
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const pending = rows.reduce((s, r) => s + Number(r.pendingTotal || 0), 0);
  const bars = rows.filter((r) => r.total).map((r) => ({ name: r.employee, value: Math.round(Number(r.total)) })).sort((a, b) => b.value - a.value);
  if (employees.loading && !people.length) return <LoadingSpinner label="Cargando el personal…" />;
  return <>
    <PageHead title="Personal" tools={<><Seg value={tab} onChange={setTab} options={[["planilla", "Planilla semanal"], ["equipo", "Equipo", people.length]]} /><button className="rx-btn" type="button" onClick={() => navigate("sistema", "usuarios")}>Crear o editar personas</button></>}>El equipo y lo que se le paga. Un día se paga cuando está validado: entrada, salida y evidencia de trabajo (o tu aprobación en la Torre de control).</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Users} label="Personas activas" value={people.filter((p) => p.status === "ACTIVO").length} detail={`${people.filter((p) => p.attendanceStatus === "EN_TURNO").length} en turno ahora`} />
      <Kpi icon={Wallet} label="Planilla de la semana" value={soles(total)} detail="Días validados" />
      <Kpi label="Por validar" value={soles(pending)} detail="Se sumará si apruebas esos días" />
      <Kpi label="Descuentos por tardanza" value={soles(rows.reduce((s, r) => s + Number(r.discountAmount || 0), 0))} detail={`${rows.reduce((s, r) => s + Number(r.unjustifiedLates || 0), 0)} tardanza(s) sin justificar`} />
    </div>
    {tab === "planilla" ? <>
      <div className="ow-toolbar" style={{ marginBottom: 10 }}><button className="rx-btn rx-btn--sm" type="button" onClick={() => setWeek(addDays(week, -7))}>← Semana anterior</button><b style={{ fontWeight: 600 }}>Semana del {dayText(week)} al {dayText(addDays(week, 6))}</b><button className="rx-btn rx-btn--sm" type="button" disabled={addDays(week, 7) > todayKey()} onClick={() => setWeek(addDays(week, 7))}>Semana siguiente →</button></div>
      <Card title="A pagar por persona" subtitle="S/ de la semana" style={{ marginBottom: 14 }}><ChartBox><HBars rows={bars} name="S/" tip={chart.tip} x0={150} valueLabel={(v) => `S/ ${v}`} tooltipLabel="A pagar" />{chart.layer}</ChartBox></Card>
      <Card title="Planilla" flush>
        {rows.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Persona</th><th className="n">Tarifa</th><th className="n">Programados</th><th className="n">Asistió</th><th className="n">Faltas</th><th className="n">Validados</th><th className="n">Por validar</th><th className="n">Tardanzas</th><th className="n">Descuento</th><th className="n">A pagar</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.employeeId}><td><b style={{ fontWeight: 600 }}>{row.employee}</b></td><td className="n mut">{soles(row.dailyRate)}</td><td className="n">{row.scheduledDays}</td><td className="n">{row.attendedDays}</td><td className="n" style={{ color: row.absences ? "var(--crit)" : undefined }}>{row.absences}</td><td className="n">{row.payableDays}</td><td className="n">{row.pendingDays ? <Tag tone="warn">{row.pendingDays}</Tag> : "—"}</td><td className="n">{row.unjustifiedLates || "—"}</td><td className="n">{row.discountAmount ? `-${soles(row.discountAmount)}` : "—"}</td><td className="n"><b>{soles(row.total)}</b></td></tr>)}
            <tr><td><b>Total</b></td><td colSpan={8} /><td className="n"><b>{soles(total)}</b></td></tr></tbody></table></div> : <Empty title="Sin planilla esta semana" />}
      </Card>
    </> : <Card title="Equipo" flush>
      {people.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Persona</th><th>Área</th><th>DNI</th><th>Celular</th><th className="n">Tarifa diaria</th><th>Ingreso</th><th>Ahora</th><th>Estado</th></tr></thead>
        <tbody>{people.map((row) => <tr key={row.id}><td><b style={{ fontWeight: 600 }}>{row.firstName} {row.lastName}</b><small className="mut" style={{ display: "block" }}>{row.email}</small></td><td>{AREA[row.baseRole || row.role] || row.baseRole || row.role}</td><td className="mut rx-mono">{row.documentNumber || "—"}</td><td className="mut">{row.phone || "—"}</td><td className="n">{soles(row.dailyRate)}</td><td className="mut">{row.hireDate ? dayText(row.hireDate) : "—"}</td><td>{row.attendanceStatus === "EN_TURNO" ? <Tag tone="ok">En turno</Tag> : <span className="mut">Fuera</span>}</td><td><Status value={row.status} /></td></tr>)}</tbody></table></div> : <Empty icon={Users} title="Sin personal registrado" />}
    </Card>}
  </>;
}
