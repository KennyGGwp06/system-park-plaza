// Insumos › Movimientos. Kardex: toda entrada, salida y transferencia con origen, destino, responsable, motivo y costo.
// Nada se borra: un error se corrige con un movimiento contrario. Datos: GET /api/superadmin/stock-movements.
import { useMemo, useState } from "react";
import { ArrowLeftRight, Search } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Card, ChartBox, Empty, HBars, Kpi, PageHead, Seg, Tag, qty, soles, useChartTip, whenText } from "./kit";

export const MOVEMENT = { GOODS_RECEIPT: "Compra recibida", TRANSFER_DISPATCH: "Envío a un área", TRANSFER_RECEIPT: "Recepción en el área", TRANSFER_OVERAGE: "Sobrante recibido", THEORETICAL_CONSUMPTION: "Consumo por venta", SHIFT_CLOSING_ADJUSTMENT: "Ajuste de cierre", SHIFT_REOPEN_REVERSAL: "Reversa de cierre", LEGACY_RECONCILIATION: "Conciliación inicial", PRODUCTION_OUTPUT: "Producción (entra)", PRODUCTION_CONSUMPTION: "Producción (sale)", PROCESSING_OUTPUT: "Preparación (entra)", PROCESSING_CONSUMPTION: "Preparación (sale)", PORTIONING_OUTPUT: "Porcionado (entra)", PORTIONING_CONSUMPTION: "Porcionado (sale)", INTERNAL_CONSUMPTION: "Consumo interno", AUTHORIZED_ADJUSTMENT: "Ajuste autorizado", DAILY_BOX_ASSIGNMENT: "Asignación diaria", ASIGNACION_DIARIA: "Asignación diaria", ORDER_CANCELLATION_RETURN: "Devolución por cancelación" };
export const WASTE_LABEL = { WASTE_PREPARATION_ERROR: "Error de preparación", WASTE_DAMAGED: "Producto dañado", WASTE_EXPIRY: "Vencimiento", WASTE_SPILL: "Derrame", WASTE_STORAGE: "Mal almacenamiento", WASTE_CLEANING: "Limpieza del producto", WASTE_OTHER: "Otra merma", WASTE_INTERNAL_CONSUMPTION: "Consumo interno" };
export const movementLabel = (type) => MOVEMENT[type] || WASTE_LABEL[type] || (String(type).startsWith("WASTE") ? "Merma" : String(type).replaceAll("_", " ").toLowerCase());
const toneOf = (row) => (row.to && !row.from ? "ok" : row.from && !row.to ? (String(row.type).startsWith("WASTE") ? "crit" : "warn") : "info");

export function StockMovementsPage() {
  const [days, setDays] = useState("30");
  const [type, setType] = useState("");
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const chart = useChartTip();
  const data = useFetch(`/superadmin/stock-movements?days=${days}&type=${encodeURIComponent(type)}&q=${encodeURIComponent(term)}`, { initialData: null, realtime: true });
  const rows = data.data?.rows || [];
  const types = data.data?.types || [];
  const inn = rows.filter((r) => r.to && !r.from), out = rows.filter((r) => r.from && !r.to), moves = rows.filter((r) => r.from && r.to);
  const byType = useMemo(() => { const map = new Map(); rows.forEach((row) => { const key = movementLabel(row.type); map.set(key, (map.get(key) || 0) + 1); }); return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7); }, [rows]);
  if (data.loading && !data.data) return <LoadingSpinner label="Cargando el kardex…" />;
  return <>
    <PageHead title="Movimientos de inventario" tools={<Seg value={days} onChange={setDays} options={[["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["365", "Año"]]} />}>Toda entrada, salida y transferencia con origen, destino, responsable y motivo. Nada se borra: un error se corrige con un movimiento contrario.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ArrowLeftRight} label="Movimientos" value={rows.length} detail={rows.length >= 400 ? "Se muestran los 400 más recientes" : "En el periodo"} />
      <Kpi label="Entradas" value={inn.length} detail={soles(inn.reduce((s, r) => s + Number(r.quantity) * Number(r.unitCost || 0), 0))} />
      <Kpi label="Salidas y consumos" value={out.length} detail={soles(out.reduce((s, r) => s + Number(r.quantity) * Number(r.unitCost || 0), 0))} />
      <Kpi label="Entre almacenes" value={moves.length} detail="Envíos y recepciones" />
    </div>
      <Card style={{ marginBottom: 14 }} title="Por tipo de movimiento" subtitle="Cantidad de registros"><ChartBox><HBars rows={byType} name="Movimientos" tip={chart.tip} x0={150} tooltipLabel="Registros" />{chart.layer}</ChartBox></Card>
      <Card title="Kardex" flush tools={<form className="ow-toolbar" onSubmit={(event) => { event.preventDefault(); setTerm(text); }}><div className="rx-search" style={{ margin: 0, width: 230 }}><label style={{ background: "#fff" }}><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Insumo, motivo o código" aria-label="Buscar" /></label></div><select className="rx-select" value={type} onChange={(event) => setType(event.target.value)} style={{ width: 190 }}><option value="">Todos los tipos</option>{types.map((t) => <option key={t.t} value={t.t}>{movementLabel(t.t)} ({t.c})</option>)}</select><button className="rx-btn" type="submit">Buscar</button></form>}>
        {rows.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Cuándo</th><th>Movimiento</th><th>Insumo</th><th className="n">Cantidad</th><th>De → a</th><th>Responsable</th><th>Motivo</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td className="mut" style={{ whiteSpace: "nowrap" }}>{whenText(row.at)}</td><td><Tag tone={toneOf(row)}>{movementLabel(row.type)}</Tag></td>
            <td><b style={{ fontWeight: 600 }}>{row.product}</b>{row.lot ? <small className="mut" style={{ display: "block" }}>Lote {row.lot}</small> : null}</td>
            <td className="n">{qty(row.quantity, 3)} {row.unit}<small className="mut" style={{ display: "block" }}>{soles(Number(row.quantity) * Number(row.unitCost || 0))}</small></td>
            <td className="mut" style={{ whiteSpace: "nowrap" }}>{row.from || "Ingreso"} → {row.to || "Salida"}</td><td className="mut">{row.actor || "Sistema"}</td><td className="mut" style={{ maxWidth: 280 }}>{row.reason || row.sourceCode || "—"}</td>
          </tr>)}</tbody></table></div> : <Empty icon={ArrowLeftRight} title="Sin movimientos con este filtro" />}
      </Card>
  </>;
}
