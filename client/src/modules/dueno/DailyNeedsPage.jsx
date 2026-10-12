// Insumos › Necesidades del día. El servidor calcula (GET /api/superadmin/daily-needs): ventas recientes × receta +
// reposición al mínimo − stock del área. Aquí el dueño ve si cada área cerró, qué se justifica pedir, qué pidieron
// (y si es exceso), qué hay en el almacén y qué falta comprar; crea la orden de compra y define la hora de cierre.
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ShoppingCart } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, ChartBox, Empty, HBars, Kpi, PageHead, Tag, qty, timeOf, useBusy, useChartTip, useToast } from "./kit";

export function DailyNeedsPage({ navigate }) {
  const data = useFetch("/superadmin/daily-needs", { initialData: null, realtime: true, pollInterval: 30000 });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [closingTime, setClosingTime] = useState("23:00");
  const chart = useChartTip();
  useEffect(() => { if (data.data?.closingTime) setClosingTime(data.data.closingTime); }, [data.data?.closingTime]);
  if (!data.data) return data.error ? <Alert tone="crit">{data.error.message}</Alert> : <LoadingSpinner label="Calculando las necesidades del día…" />;
  const d = data.data;
  const lines = d.areas.flatMap((area) => area.lines.map((line) => ({ ...line, areaName: area.name })));
  const toBuy = lines.filter((line) => line.toBuyQuantity > 0);
  const excess = lines.filter((line) => line.excess);
  const soon = lines.filter((line) => line.daysLeft !== null && line.daysLeft <= d.depletionAlertDays).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8).map((line) => ({ name: line.productName.length > 18 ? `${line.productName.slice(0, 17)}…` : line.productName, value: Math.max(0, Math.round(line.daysLeft * 10) / 10) }));
  const unclosed = d.areas.filter((area) => area.closing.status === "SIN_CIERRE");
  const createOrder = () => run(async () => { const order = await api("/superadmin/daily-needs/purchase-order", { method: "POST", body: {} }); show(`Orden ${order.code} creada con lo que falta comprar.`); navigate("insumos", "lista"); });
  const saveTime = () => run(async () => { await api("/superadmin/closing-time", { method: "PUT", body: { closingTime } }); show(`Las áreas cerrarán a las ${closingTime}.`); data.reload(); });

  return <>
    <PageHead title="Necesidades del día" tools={<><button className="rx-btn" type="button" onClick={() => navigate("insumos", "solicitudes")}>Solicitudes <ArrowRight size={14} /></button><button className="rx-btn rx-btn--primary" type="button" disabled={busy || !toBuy.length} onClick={createOrder}><ShoppingCart />Crear orden con lo que falta</button></>}>Lo que cada área necesita para mañana: ventas de los últimos {d.historyDays} días por receta, más reposición al mínimo, menos lo que ya tiene. Con los cierres de las {d.closingTime} compras desde la medianoche.</PageHead>
    {unclosed.length ? <div style={{ marginBottom: 12 }}><Alert tone="crit"><b>Sin cierre del día: {unclosed.map((area) => area.name).join(" y ")}.</b> Sus necesidades se calculan solo con el stock del sistema.</Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      {d.areas.map((area) => <Kpi key={area.area} icon={area.closing.status === "CERRADO" ? CheckCircle2 : area.closing.status === "SIN_CIERRE" ? AlertTriangle : Clock} label={area.name} value={area.lines.filter((line) => line.toBuyQuantity > 0).length} detail={`${area.closing.status === "CERRADO" ? `Cerró a las ${timeOf(area.closing.submittedAt)}` : area.closing.status === "SIN_CIERRE" ? "Sin cierre" : area.closing.label} · ${area.pendingRequests} solicitud(es)`} />)}
      <Kpi label="Por comprar" value={toBuy.length} detail="Insumos que no alcanzan con el almacén" />
      <Kpi label="Pedidos en exceso" value={excess.length} detail={`Más de lo justificado (+${d.excessTolerancePercent}%)`} />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
        <Card title="Se agotan primero" subtitle={`Días que alcanza el stock (alerta a ${d.depletionAlertDays} días)`}><ChartBox><HBars rows={soon} name="Días" tip={chart.tip} x0={120} valueLabel={(v) => `${v} d`} tooltipLabel="Días" />{chart.layer}</ChartBox></Card>
        <Card title="Hora de cierre de las áreas" subtitle="A esa hora Cocina y Bar cuentan lo que quedó">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input className="rx-input" type="time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} style={{ width: 130 }} /><button className="rx-btn" type="button" disabled={busy || closingTime === d.closingTime} onClick={saveTime}>Guardar hora</button></div>
          <p className="ow-mini" style={{ marginBottom: 0 }}>El hotel abre de 7:00 a 24:00; el cierre una hora antes deja la lista lista a medianoche.</p>
        </Card>
    </div>
      <Card title="Qué se necesita" flush>
        {lines.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Insumo</th><th>Área</th><th className="n">Se usa por día</th><th className="n">Tiene</th><th className="n">Alcanza</th><th className="n">Se justifica</th><th className="n">Pidió</th><th className="n">En almacén</th><th className="n">Comprar</th></tr></thead>
          <tbody>{lines.map((line) => <tr key={`${line.areaName}-${line.productId}`}>
            <td><b style={{ fontWeight: 600 }}>{line.productName}</b>{!line.hasRecipeBasis ? <small className="mut" style={{ display: "block" }}>Solo reposición al mínimo</small> : null}</td><td className="mut">{line.areaName}</td>
            <td className="n mut">{qty(line.soldUsagePerDay)} {line.unitSymbol}</td><td className="n">{qty(line.areaStock)}</td>
            <td className="n">{line.daysLeft === null ? "—" : <Tag tone={line.daysLeft <= 1 ? "crit" : line.daysLeft <= d.depletionAlertDays ? "warn" : "off"}>{line.daysLeft < 1 ? "< 1 día" : `${Math.floor(line.daysLeft)} día(s)`}</Tag>}</td>
            <td className="n"><b>{qty(line.justifiedQuantity)}</b></td><td className="n">{line.requestedQuantity ? <>{qty(line.requestedQuantity)}{line.excess ? <> <Tag tone="crit">Exceso</Tag></> : null}</> : "—"}</td>
            <td className="n mut">{qty(line.generalAvailable)}</td><td className="n" style={{ color: line.toBuyQuantity ? "var(--deep)" : undefined, fontWeight: line.toBuyQuantity ? 600 : 400 }}>{line.toBuyQuantity ? `${qty(line.toBuyQuantity)} ${line.unitSymbol}` : "—"}</td>
          </tr>)}</tbody></table></div> : <Empty icon={CheckCircle2} title="Nada que pedir para mañana" />}
      </Card>
  </>;
}
