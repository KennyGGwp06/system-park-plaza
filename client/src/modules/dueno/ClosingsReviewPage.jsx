// Restaurante / Bar › Cierres y consumo. Cada día la estación cuenta lo que quedó y envía el cierre; aquí el dueño ve
// el consumo teórico de las recetas, las mermas y las diferencias (en cantidad y en soles) y aprueba, observa o reabre.
// Abrir y contar lo hace la estación. Datos: /api/operational-inventory/sessions(/:id) y POST /:id/close|observe|reopen.
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, LockKeyhole, RotateCcw } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Columns, Drawer, Empty, Field, Kpi, PageHead, Seg, SearchBox, Status, Tag, dayText, qty, soles, useBusy, useChartTip, useOpenId, useToast, whenText } from "./kit";

export function ClosingsReviewPage({ area = "RESTAURANTE" }) {
  const label = area === "BARTENDER" ? "Bar" : "Cocina";
  const sessions = useFetch(`/operational-inventory/sessions?area=${area}`, { initialData: [], realtime: true, pollInterval: 20000 });
  const [openId, open] = useOpenId();
  const [filter, setFilter] = useState("todos");
  const chart = useChartTip();
  const rows = (Array.isArray(sessions.data) ? sessions.data : []).filter((row) => row.area === area && row.status !== "PENDING");
  const toReview = rows.filter((row) => ["SUBMITTED", "OBSERVED"].includes(row.status));
  const closed = rows.filter((row) => row.status === "CLOSED");
  const running = rows.filter((row) => ["OPEN", "OPERATING", "COUNTING", "REOPENED"].includes(row.status));
  const shown = filter === "revisar" ? toReview : filter === "cerrados" ? closed : rows;
  const recent = closed.slice(0, 14).reverse();
  const lossMonth = closed.filter((row) => String(row.date).slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, row) => sum + Math.min(0, Number(row.varianceCost || 0)), 0);

  if (sessions.loading && !rows.length) return <LoadingSpinner label="Cargando cierres…" />;
  return <>
    <PageHead title={`Cierres de ${label}`} tools={<Seg value={filter} onChange={setFilter} options={[["todos", "Todos", rows.length], ["revisar", "Por aprobar", toReview.length], ["cerrados", "Aprobados", closed.length]]} />}>Cada noche {label === "Bar" ? "la barra" : "la cocina"} cuenta lo que quedó sin ver lo esperado. Revisa las diferencias y aprueba: el día siguiente parte de este conteo.</PageHead>
    {toReview.length ? <div style={{ marginBottom: 12 }}><Alert tone="warn"><b>{toReview.length} cierre(s) esperan tu aprobación.</b> Mientras tanto {label === "Bar" ? "el Bar" : "la Cocina"} no puede abrir el inventario del día siguiente ni aceptar pedidos.</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ClipboardCheck} label="Por aprobar" value={toReview.length} detail={toReview[0] ? `Desde el ${dayText(toReview[0].date)}` : "Al día"} />
      <Kpi label="Turno en curso" value={running.length ? "Sí" : "No"} detail={running[0] ? `${running[0].shift} · ${running[0].status === "COUNTING" ? "contando" : "abierto"}` : "Se abre al marcar entrada"} />
      <Kpi label="Cierres aprobados" value={closed.length} detail="Historial completo" />
      <Kpi label="Pérdida del mes" value={soles(Math.abs(lossMonth))} detail="Diferencias negativas aprobadas" />
    </div>
    <Card title="Diferencia en soles por cierre" subtitle="Últimos 14 cierres aprobados · faltante (-) o sobrante (+)" style={{ marginBottom: 14 }}>
      <ChartBox><Columns values={recent.map((row) => Math.abs(Number(row.varianceCost || 0)))} labels={recent.map((row) => dayText(row.date).slice(0, 5))} name="Diferencia (S/)" tip={chart.tip} valueLabel={(v) => `S/ ${Number(v).toFixed(2)}`} highlight={recent.map((row, i) => (Number(row.varianceCost) < 0 ? i : -1)).filter((i) => i >= 0)} />{chart.layer}</ChartBox>
    </Card>
    <Card title="Turnos de inventario" flush>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha</th><th>Turno</th><th>Estado</th><th>Envió</th><th>Enviado</th><th className="n">Diferencia</th><th /></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b>{dayText(row.date)}</b></td><td className="rx-mono mut">{row.shift}</td><td><Status value={row.status} /></td><td className="mut">{row.submittedByName || row.responsibleName || "—"}</td><td className="mut">{row.submittedAt ? whenText(row.submittedAt) : "—"}</td>
          <td className="n" style={{ color: Number(row.varianceCost) < 0 ? "var(--crit)" : undefined }}>{row.varianceCost != null ? soles(row.varianceCost) : "—"}</td>
          <td className="n">{["SUBMITTED", "OBSERVED"].includes(row.status) ? <button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={(event) => { event.stopPropagation(); open(row.id); }}>Revisar</button> : null}</td>
        </tr>)}</tbody></table></div> : <Empty icon={CheckCircle2} title="Sin cierres en esta vista" />}
    </Card>
    {openId ? <ClosingDrawer id={openId} onClose={() => open(null)} onDone={() => sessions.reload()} /> : null}
  </>;
}

function ClosingDrawer({ id, onClose, onDone }) {
  const detail = useFetch(`/operational-inventory/sessions/${id}`, { initialData: null, realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [reason, setReason] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [text, setText] = useState("");
  const item = detail.data;
  const lines = useMemo(() => (item?.lines || []).filter((line) => (!onlyDiff || Math.abs(Number(line.varianceQuantity || 0)) > 0.000001) && (!text.trim() || line.productName.toLowerCase().includes(text.trim().toLowerCase()))).sort((a, b) => Math.abs(Number(b.differenceCost ?? b.varianceCost ?? 0)) - Math.abs(Number(a.differenceCost ?? a.varianceCost ?? 0))), [item, onlyDiff, text]);
  const act = (name, body, message) => run(async () => { await api(`/operational-inventory/sessions/${id}/${name}`, { method: "POST", body }); show(message); setReason(""); await detail.reload(); onDone(); });
  if (!item) return <Drawer open onClose={onClose} title="Cierre"><LoadingSpinner label="Cargando el cierre…" /></Drawer>;
  const review = ["SUBMITTED", "OBSERVED"].includes(item.status);
  const why = (line) => (item.explanations || []).find((row) => Number(row.productId) === Number(line.productId) && String(row.lotId || "") === String(line.lotId || ""))?.reason || "";
  const diffs = (item.lines || []).filter((line) => Math.abs(Number(line.varianceQuantity || 0)) > 0.000001);
  const consumption = (item.lines || []).reduce((sum, line) => sum + Number(line.theoreticalConsumption || 0) * Number(line.unitCost || 0), 0);
  const waste = (item.lines || []).reduce((sum, line) => sum + Number(line.wasteQuantity || 0) * Number(line.unitCost || 0), 0);
  const footer = review ? <><button className="rx-btn rx-btn--danger" type="button" disabled={busy || reason.trim().length < 8} onClick={() => act("observe", { reason: reason.trim() }, "Cierre observado: la estación verá tu observación.")}>Observar</button><button className="rx-btn rx-btn--primary" type="button" disabled={busy} onClick={() => act("close", {}, "Cierre aprobado. El día siguiente parte de este conteo.")}><LockKeyhole />Aprobar y cerrar</button></>
    : item.status === "CLOSED" ? <><button className="rx-btn" type="button" onClick={onClose}>Cerrar</button><button className="rx-btn" type="button" disabled={busy || reason.trim().length < 8} onClick={() => act("reopen", { reason: reason.trim() }, "Cierre reabierto con auditoría.")}><RotateCcw />Reabrir</button></> : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>;
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${item.areaName} · ${dayText(item.date)}`} title={`Cierre ${item.shift}`} subtitle={`${item.submittedByName ? `Enviado por ${item.submittedByName}` : ""}${item.submittedAt ? ` · ${whenText(item.submittedAt)}` : ""}`} footer={footer}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Status value={item.status} /><Tag>{item.openingSource === "PREVIOUS_CLOSE" ? "Partió del cierre anterior" : "Partió de un conteo de apertura"}</Tag>{item.reopenCount ? <Tag tone="warn">Reabierto {item.reopenCount} vez/veces</Tag> : null}</div>
    <dl className="rx-dl">
      <div><dt>Insumos contados</dt><dd>{(item.lines || []).length}</dd></div>
      <div><dt>Con diferencia</dt><dd style={{ color: diffs.length ? "var(--crit)" : undefined }}>{diffs.length}</dd></div>
      <div><dt>Diferencia en soles</dt><dd style={{ color: Number(item.totals?.varianceCost) < 0 ? "var(--crit)" : undefined }}>{soles(item.totals?.varianceCost)}</dd></div>
      <div><dt>Consumo teórico (costo)</dt><dd>{soles(consumption)}</dd></div>
      <div><dt>Mermas registradas (costo)</dt><dd>{soles(waste)}</dd></div>
    </dl>
    <section className="rx-sec"><h3>Insumos</h3>
      <div className="ow-toolbar" style={{ marginBottom: 8 }}><Seg value={onlyDiff ? "dif" : "todos"} onChange={(v) => setOnlyDiff(v === "dif")} options={[["dif", "Con diferencia", diffs.length], ["todos", "Todos", (item.lines || []).length]]} /><SearchBox value={text} onChange={setText} placeholder="Buscar insumo" width={200} /></div>
      {lines.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Insumo</th><th className="n">Inicial</th><th className="n">Consumo</th><th className="n">Mermas</th><th className="n">Esperado</th><th className="n">Contado</th><th className="n">Diferencia</th></tr></thead>
        <tbody>{lines.map((line) => { const v = Number(line.varianceQuantity || 0); return <tr key={`${line.productId}-${line.lotId || ""}`}>
          <td><b style={{ fontWeight: 600 }}>{line.productName}</b><small className="mut" style={{ display: "block" }}>{line.lotCode || "Sin lote"}{why(line) ? ` · ${why(line)}` : ""}</small></td>
          <td className="n">{qty(line.openingQuantity)}</td><td className="n mut">{qty(line.theoreticalConsumption)}</td><td className="n mut">{qty(line.wasteQuantity)}</td><td className="n">{qty(line.expectedQuantity)}</td><td className="n">{line.physicalQuantity != null ? qty(line.physicalQuantity) : "—"}</td>
          <td className="n" style={{ color: v < 0 ? "var(--crit)" : v > 0 ? "var(--warn)" : undefined }}>{v ? `${v > 0 ? "+" : ""}${qty(v)} ${line.unitSymbol}` : "—"}{line.differenceCost != null && v ? <small style={{ display: "block" }}>{soles(line.differenceCost)}</small> : null}</td>
        </tr>; })}</tbody></table></div> : <Empty icon={CheckCircle2} title={onlyDiff ? "Ningún insumo con diferencia" : "Sin insumos"} />}
    </section>
    {review || item.status === "CLOSED" ? <Field label={review ? "Observación (obligatoria para observar, mínimo 8 letras)" : "Motivo para reabrir (mínimo 8 letras)"}><textarea className="rx-input" style={{ height: 70, paddingTop: 8 }} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={review ? "Ej. el conteo del aceite no cuadra con la compra de ayer" : "Ej. se digitó mal el conteo del pisco"} /></Field> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
