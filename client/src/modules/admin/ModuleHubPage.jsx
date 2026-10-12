// Panel de cada módulo del Superadmin: qué resuelve, cifras reales, avisos y una tarjeta por submódulo con lo que se hace ahí.
// Datos en vivo: GET /api/superadmin/modules-overview. Textos fijos: moduleGuide.js.
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Users } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { MODULE_GUIDE } from "./moduleGuide";
import "./ModuleHub.css";

const TONE = { red: "is-red", amber: "is-amber", ok: "" };

export function ModuleHubPage({ module, navigate }) {
  const { data, loading, error, reload } = useFetch("/superadmin/modules-overview", { initialData: null, cacheTime: 10000, realtime: true, pollInterval: 30000 });
  const guide = MODULE_GUIDE[module.id];
  const live = data?.modules?.[module.id];
  if (!guide) return null;
  if (!data && loading) return <div className="mh"><LoadingSpinner label={`Preparando ${module.label}...`} /></div>;
  const subs = module.views.filter((view) => view.id !== "panel");
  return <div className="mh">
    <header className="mh-hero">
      <div><p>{module.label.toUpperCase()}</p><h2>{live?.headline || module.description}</h2><span>{guide.goal}</span></div>
      <button type="button" onClick={reload} aria-label="Actualizar"><RefreshCw size={16} />Actualizar</button>
    </header>
    {error && !data ? <div className="mh-alert is-red"><AlertTriangle size={16} /><span>No se pudieron cargar las cifras: {error.message}</span></div> : null}
    {live?.kpis?.length ? <section className="mh-kpis" aria-label="Cifras clave">{live.kpis.map((item) => <article key={item.label} className={TONE[item.tone] || ""}><small>{item.label}</small><b>{item.value}</b><span>{item.detail || " "}</span></article>)}</section> : null}
    {live?.alerts?.length ? <section className="mh-alerts" aria-label="Requiere atención">{live.alerts.map((item) => <button key={item.text} type="button" className={`mh-alert ${TONE[item.tone] || ""}`} onClick={() => navigate(item.go[0], item.go[1])}><AlertTriangle size={16} /><span>{item.text}</span><ArrowRight size={15} /></button>)}</section>
      : data ? <div className="mh-alert is-ok"><CheckCircle2 size={16} /><span>Nada requiere tu atención en este módulo.</span></div> : null}
    <section className="mh-flow" aria-label="Cómo funciona"><h3>Cómo funciona</h3><ol>{guide.flow.map((step, index) => <li key={step}><i>{index + 1}</i>{step}</li>)}</ol><p><Users size={14} />Quién lo usa: {guide.who}</p></section>
    <section className="mh-subs" aria-label="Submódulos">
      <h3>{subs.length} {subs.length === 1 ? "vista" : "vistas"} de este módulo</h3>
      <div>{subs.map((view) => { const info = guide.subs[view.id] || { does: [], go: "Abrir" }; const stat = live?.subs?.[`${module.id}:${view.id}`]; return <article key={view.id} className={TONE[stat?.tone] || ""}>
        <div className="mh-sub-top"><h4>{view.label}</h4>{stat ? <span>{stat.metric}</span> : null}</div>
        {stat?.hint ? <em>{stat.hint}</em> : null}
        <ul>{info.does.map((line) => <li key={line}>{line}</li>)}</ul>
        <button type="button" onClick={() => navigate(module.id, view.id)}>{info.go}<ArrowRight size={15} /></button>
      </article>; })}</div>
    </section>
  </div>;
}
