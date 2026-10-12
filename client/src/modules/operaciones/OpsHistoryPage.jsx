// Limpieza / Mantenimiento › Historial. Lo terminado, del más reciente al más antiguo, con sus fotos y lo que se hizo.
// Sirve al trabajador para demostrar su trabajo (la evidencia es lo que el dueño revisa para validar el día).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, History } from "lucide-react";
import { Drawer, Empty, PageHead, Tag, dateShort, timeOf, todayKey } from "../recepcion/rxkit";
import { cleaningKind, photoSrc, placeOf, useOps } from "./OpsShell";
import { finishedAt, isDone } from "./opsNavigation";

const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");
const RANGES = [["hoy", "Hoy"], ["semana", "7 días"], ["todo", "Todo"]];

export function OpsHistoryPage() {
  const { station, rows } = useOps();
  const area = station.area;
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState("semana");
  const today = todayKey();
  const weekAgo = new Date(Date.now() - 6 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const done = useMemo(() => rows.filter((row) => isDone(area, row)).filter((row) => { const day = localDay(finishedAt(row)); return range === "todo" || (range === "hoy" ? day === today : day >= weekAgo); }).sort((a, b) => String(finishedAt(b)).localeCompare(String(finishedAt(a)))), [rows, area, range, today, weekAgo]);
  const selected = rows.find((row) => String(row.id) === params.get("ver")) || null;
  const kindOf = (row) => (area === "LIMPIEZA" ? cleaningKind(row).short : String(row.type || "Mantenimiento").replaceAll("_", " ").toLowerCase());
  const outcome = (row) => (row.status === "DANOS_REPORTADOS" ? ["Con daños reportados", "warn"] : area === "LIMPIEZA" ? ["Finalizada", "ok"] : ["Solucionado", "ok"]);

  return <>
    <PageHead title="Historial" tools={<div className="rx-seg">{RANGES.map(([key, label]) => <button key={key} type="button" className={range === key ? "is-on" : ""} onClick={() => setRange(key)}>{label}</button>)}</div>}>{area === "LIMPIEZA" ? "Tus tareas terminadas con sus fotos." : "Tus reparaciones terminadas con la foto de antes y la de después."}</PageHead>
    <section className="rx-card">
      {done.length ? <ul className="rx-list">{done.map((row) => { const [label, tone] = outcome(row); const Icon = station.icon; return <li key={row.id} className="is-click" onClick={() => setParams({ ver: String(row.id) })} style={{ cursor: "pointer" }}>
        <span className="rx-ico"><Icon /></span>
        <div className="grow"><b>{row.code} · {placeOf(area, row)}</b><small>{kindOf(row)} · {dateShort(localDay(finishedAt(row)))} {timeOf(finishedAt(row))} · {(row.evidences || []).length} foto(s)</small></div>
        <Tag tone={tone}>{label}</Tag>
      </li>; })}</ul> : <Empty icon={History} title={range === "hoy" ? "Hoy aún no terminas ninguna" : "Sin registros en este periodo"} />}
    </section>
    {selected ? <Drawer open onClose={() => setParams({})} eyebrow={`${selected.code} · ${kindOf(selected)}`} title={placeOf(area, selected)} subtitle={`Terminado ${dateShort(localDay(finishedAt(selected)))} ${timeOf(finishedAt(selected))}`}>
      {selected.description ? <section className="rx-sec"><h3>Pedido</h3><p style={{ margin: 0, fontSize: 13.5 }}>{selected.description}</p></section> : null}
      {selected.workDescription ? <section className="rx-sec"><h3>Qué se hizo</h3><p style={{ margin: 0, fontSize: 13.5 }}>{selected.workDescription}{selected.observations ? ` · ${selected.observations}` : ""}</p></section> : null}
      <section className="rx-sec"><h3>Fotos ({(selected.evidences || []).length})</h3>
        {(selected.evidences || []).length ? <div className="op-photos">{selected.evidences.map((item, index) => <div className="op-photo is-done" key={item.id || index}><a href={photoSrc(item)} target="_blank" rel="noreferrer"><img src={photoSrc(item)} alt={item.description || "Evidencia"} /></a><span>{[item.area && item.area !== "MANTENIMIENTO" ? String(item.area).toLowerCase() : null, item.stage ? String(item.stage).replaceAll("_", " ").toLowerCase() : null].filter(Boolean).join(" · ") || "foto"}</span></div>)}</div> : <p className="mut" style={{ margin: 0, fontSize: 13 }}>Sin fotos.</p>}
      </section>
      {selected.operationalReports?.length ? <section className="rx-sec"><h3>Reportes</h3><ul className="rx-list">{selected.operationalReports.map((report) => <li key={report.id}><span className="rx-ico"><AlertTriangle /></span><div className="grow"><b>{report.code}</b><small>{report.description}</small></div></li>)}</ul></section> : null}
    </Drawer> : null}
  </>;
}
