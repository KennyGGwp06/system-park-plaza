// Dinero › Gastos. Cada salida de dinero con su servicio (Hospedaje, Piscina, Mirador, Terraza, Eventos o General) y su
// categoría, para que la rentabilidad por servicio sea real. Registrar un gasto o ingreso manual y corregir el servicio
// de uno ya registrado. Rutas: GET /api/caja, POST /api/caja/movements, PATCH /api/caja/movements/:id/service.
import { useMemo, useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Drawer, Empty, Field, HBars, Kpi, PageHead, Seg, Tag, addDays, limaDay, soles, todayKey, useBusy, useChartTip, useOpenId, useToast, whenText } from "./kit";

export const SERVICES = [["HOSPEDAJE", "Hospedaje"], ["PISCINA", "Piscina"], ["MIRADOR", "Mirador"], ["TERRAZA", "Terraza"], ["EVENTOS", "Eventos"], ["GENERAL", "General (compartido)"]];
export const CATEGORIES = [["INSUMOS", "Insumos"], ["PLANILLA", "Planilla"], ["SERVICIOS", "Luz, agua, internet"], ["MANTENIMIENTO", "Mantenimiento"], ["MARKETING", "Marketing"], ["IMPUESTOS", "Impuestos"], ["OTROS", "Otros"]];
const nameOf = (list, code) => list.find(([key]) => key === code)?.[1] || null;

export function ExpensesPage() {
  const [range, setRange] = useState("30");
  // El servidor entrega solo el período elegido (lo antiguo vive en el historial).
  const cash = useFetch(`/caja?range=${range}`, { initialData: { movements: [] }, realtime: true, pollInterval: 60000 });
  const [filter, setFilter] = useState("gastos");
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const byCat = useChartTip(), byService = useChartTip();
  const from = addDays(todayKey(), -(Number(range) - 1));
  const manual = (cash.data?.movements || []).filter((row) => row.type === "EGRESO" || (row.type === "INGRESO" && row.serviceCode !== undefined && !row.clientId && row.concept));
  const rows = manual.filter((row) => limaDay(row.createdAt) >= from).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const expenses = rows.filter((row) => row.type === "EGRESO");
  const unassigned = expenses.filter((row) => !nameOf(SERVICES, row.serviceCode));
  const total = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  const group = (list, keyFn) => { const map = new Map(); list.forEach((row) => { const key = keyFn(row); map.set(key, (map.get(key) || 0) + Number(row.amount || 0)); }); return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value); };
  const cats = useMemo(() => group(expenses, (row) => nameOf(CATEGORIES, row.category) || "Otros"), [expenses]);
  const services = useMemo(() => group(expenses, (row) => nameOf(SERVICES, row.serviceCode) || "Sin servicio"), [expenses]);
  const shown = filter === "gastos" ? expenses : filter === "sin" ? unassigned : rows;
  const selected = manual.find((row) => String(row.id) === openId) || null;
  if (cash.loading && !manual.length) return <LoadingSpinner label="Cargando gastos…" />;
  return <>
    <PageHead title="Gastos" tools={<><Seg value={range} onChange={setRange} options={[["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["365", "Año"]]} /><button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Registrar gasto</button></>}>Cada gasto va a un servicio (o General si es compartido) y a una categoría. Así la rentabilidad de cada servicio es real.</PageHead>
    {unassigned.length ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>{unassigned.length} gasto(s) sin servicio</b> por {soles(unassigned.reduce((s, r) => s + Number(r.amount || 0), 0))}. Ábrelos y asígnales un servicio.</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={Receipt} label="Gastos del periodo" value={soles(total)} detail={`${expenses.length} registro(s)`} />
      <Kpi label="Mayor categoría" value={cats[0]?.name || "—"} detail={cats[0] ? soles(cats[0].value) : ""} />
      <Kpi label="Mayor servicio" value={services[0]?.name || "—"} detail={services[0] ? soles(services[0].value) : ""} />
      <Kpi label="Sin servicio" value={unassigned.length} detail="Afectan la rentabilidad" />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Por categoría" subtitle="S/"><ChartBox><HBars rows={cats} name="S/" tip={byCat.tip} x0={130} valueLabel={(v) => `S/ ${v}`} tooltipLabel="Gasto" />{byCat.layer}</ChartBox></Card>
      <Card title="Por servicio" subtitle="S/"><ChartBox><HBars rows={services} name="S/" tip={byService.tip} x0={130} valueLabel={(v) => `S/ ${v}`} tooltipLabel="Gasto" />{byService.layer}</ChartBox></Card>
    </div>
    <Card title="Movimientos" flush tools={<Seg value={filter} onChange={setFilter} options={[["gastos", "Gastos", expenses.length], ["sin", "Sin servicio", unassigned.length], ["todos", "Gastos e ingresos manuales", rows.length]]} />}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Servicio</th><th>Categoría</th><th>Medio</th><th className="n">Monto</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}><td className="mut">{whenText(row.createdAt)}</td><td>{row.concept}</td><td>{nameOf(SERVICES, row.serviceCode) || <Tag tone="warn">Sin servicio</Tag>}</td><td className="mut">{nameOf(CATEGORIES, row.category) || "—"}</td><td className="mut">{row.method}</td><td className="n" style={{ color: row.type === "EGRESO" ? "var(--crit)" : undefined }}>{row.type === "EGRESO" ? "-" : "+"}{soles(row.amount)}</td></tr>)}</tbody></table></div> : <Empty icon={Receipt} title="Sin movimientos en el periodo" />}
    </Card>
    {selected ? <MovementDrawer movement={selected} onClose={() => open(null)} onDone={() => { open(null); cash.reload(); }} /> : null}
    {creating ? <NewMovement onClose={() => setCreating(false)} onDone={() => { setCreating(false); cash.reload(); }} /> : null}
  </>;
}

function MovementDrawer({ movement, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [serviceCode, setServiceCode] = useState(movement.serviceCode && nameOf(SERVICES, movement.serviceCode) ? movement.serviceCode : "");
  const [category, setCategory] = useState(movement.category || "OTROS");
  const save = () => run(async () => { await api(`/caja/movements/${movement.id}/service`, { method: "PATCH", body: { serviceCode, category } }); show("Gasto asignado."); onDone(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={movement.type === "EGRESO" ? "Gasto" : "Ingreso manual"} title={`${movement.type === "EGRESO" ? "-" : "+"}${soles(movement.amount)}`} subtitle={`${movement.concept} · ${whenText(movement.createdAt)}`}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cerrar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy || !serviceCode}>Guardar</button></>}>
    <div className="ow-form"><Field label="Servicio"><select className="rx-select" value={serviceCode} onChange={(event) => setServiceCode(event.target.value)}><option value="">Elige</option>{SERVICES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>{movement.type === "EGRESO" ? <Field label="Categoría"><select className="rx-select" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field> : null}</div>
    <dl className="rx-dl"><div><dt>Medio</dt><dd>{movement.method || "—"}</dd></div><div><dt>Caja</dt><dd>{movement.sessionId ? `#${movement.sessionId}` : "Fuera de caja"}</dd></div></dl>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function NewMovement({ onClose, onDone }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState({ type: "EGRESO", concept: "", serviceCode: "", category: "OTROS", method: "EFECTIVO", amount: "" });
  const set = (patch) => setForm({ ...form, ...patch });
  const save = () => { if (!form.concept.trim() || !form.serviceCode || !(Number(form.amount) > 0)) { setError("Completa concepto, servicio y monto."); return; } run(async () => { await api("/caja/movements", { method: "POST", body: { ...form, amount: Number(form.amount) } }); show(form.type === "EGRESO" ? "Gasto registrado." : "Ingreso registrado."); onDone(); }); };
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Nuevo movimiento" title={form.type === "EGRESO" ? "Registrar gasto" : "Registrar ingreso manual"} footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>Registrar</button></>}>
    <Seg value={form.type} onChange={(value) => set({ type: value })} options={[["EGRESO", "Gasto"], ["INGRESO", "Ingreso"]]} />
    <div className="ow-form" style={{ marginTop: 10 }}>
      <Field label="Concepto" full><input className="rx-input" value={form.concept} onChange={(event) => set({ concept: event.target.value })} placeholder="Ej. recibo de luz de setiembre" /></Field>
      <Field label="Servicio"><select className="rx-select" value={form.serviceCode} onChange={(event) => set({ serviceCode: event.target.value })}><option value="">Elige</option>{SERVICES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>
      {form.type === "EGRESO" ? <Field label="Categoría"><select className="rx-select" value={form.category} onChange={(event) => set({ category: event.target.value })}>{CATEGORIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field> : null}
      <Field label="Medio"><select className="rx-select" value={form.method} onChange={(event) => set({ method: event.target.value })}>{["EFECTIVO", "TRANSFERENCIA", "YAPE", "PLIN", "TARJETA"].map((m) => <option key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</option>)}</select></Field>
      <Field label="Monto (S/)"><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={form.amount} onChange={(event) => set({ amount: event.target.value })} /></Field>
    </div>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
