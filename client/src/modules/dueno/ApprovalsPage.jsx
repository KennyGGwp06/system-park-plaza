// Dirección › Por aprobar. Todo lo que en cualquier área espera una decisión del dueño (cierres de inventario, pagos
// digitales, solicitudes de insumos, devoluciones, cajas y días de trabajo), cada caso con su botón para resolverlo,
// y lo que conviene vigilar. Datos: GET /api/superadmin/approvals (server/src/owner-approvals.js).
import { ArrowRight, CheckCircle2, ClipboardCheck, Eye } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Empty, Kpi, PageHead, Tag, dateShort, money, timeOf } from "../recepcion/rxkit";

const TONE = { crit: "crit", warn: "warn", info: "info" };
const when = (iso) => { if (!iso) return ""; const text = String(iso); if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return dateShort(text); const day = new Date(text).toLocaleDateString("en-CA", { timeZone: "America/Lima" }); return `${dateShort(day)} ${timeOf(text)}`; };

export function ApprovalsPage({ approvals, navigate }) {
  const data = approvals?.data || { total: 0, groups: [], watch: [] };
  if (approvals?.loading && !data.groups.length) return <LoadingSpinner label="Revisando lo que espera tu decisión…" />;
  const open = data.groups.filter((group) => group.count);
  const done = data.groups.filter((group) => !group.count);
  const openItem = (group, item) => { const [module, view] = item.go || group.go; navigate(module, view, item.ref ? `?ver=${item.ref}` : ""); };

  return <>
    <PageHead title="Por aprobar" tools={<button className="rx-btn" type="button" onClick={approvals?.reload}>Actualizar</button>}>Lo que en cualquier área espera tu decisión. Resuelve de arriba hacia abajo: lo rojo detiene la operación.</PageHead>
    <div className="ow-kpis">{data.groups.map((group) => <Kpi key={group.key} as="button" type="button" onClick={() => navigate(...group.go)} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} label={group.label} value={<span style={{ color: group.count ? (group.tone === "crit" ? "var(--crit)" : group.tone === "warn" ? "var(--warn)" : "var(--deep)") : "var(--faint)" }}>{group.count}</span>} detail={group.count ? "Esperan tu decisión" : "Al día"} />)}</div>

    {!open.length ? <section className="rx-card" style={{ marginBottom: 14 }}><Empty icon={CheckCircle2} title="Nada espera tu decisión">Cocina, Bar, Recepción, Insumos y el equipo están al día.</Empty></section> : open.map((group) => <section key={group.key} className="rx-card ow-group">
      <div className="rx-card-h"><div><h2><span className={`ow-count ${TONE[group.tone] || ""}`}>{group.count}</span>{group.label}</h2><p>{group.detail}</p></div><button className="rx-btn rx-btn--sm" type="button" onClick={() => navigate(...group.go)}>Abrir módulo <ArrowRight size={14} /></button></div>
      <ul className="rx-list">{group.items.map((item) => <li key={item.id}>
        <span className="rx-ico"><ClipboardCheck /></span>
        <div className="grow"><b>{item.title}</b><small>{item.detail}{item.at ? ` · ${when(item.at)}` : ""}</small></div>
        {item.amount ? <span className="ow-amount">{money(item.amount)}</span> : null}
        {item.status ? <Tag tone={item.status === "Observado" ? "crit" : "info"}>{item.status}</Tag> : null}
        <button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={() => openItem(group, item)}>Resolver</button>
      </li>)}</ul>
    </section>)}

    <div className="ow-split">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Para vigilar</h2><p>No piden tu firma, pero si se acumulan algo está fallando</p></div></div>
        <ul className="rx-list">{data.watch.map((row) => <li key={row.key} className="is-click" style={{ cursor: "pointer" }} onClick={() => navigate(...row.go)}>
          <span className="rx-ico"><Eye /></span><div className="grow"><b>{row.label}</b></div><Tag tone={row.count ? "warn" : "ok"}>{row.count}</Tag><ArrowRight size={14} />
        </li>)}</ul>
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Al día</h2><p>Sin nada pendiente</p></div></div>
        {done.length ? <ul className="rx-list">{done.map((group) => <li key={group.key}><span className="rx-ico"><CheckCircle2 /></span><div className="grow"><b>{group.label}</b></div><Tag tone="ok">Al día</Tag></li>)}</ul> : <Empty title="Todo tiene algo pendiente" />}
      </section>
    </div>
  </>;
}
