// Dinero › Ingresos y pagos. Cada cobro con su cliente, servicio, reserva, medio y estado: cuánto entró, por dónde
// (efectivo, Yape, Plin, tarjeta), por qué canal y qué falta verificar. Verificar un Yape/Plin se hace en la reserva.
// Datos: GET /api/pagos.
import { useMemo, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { COLORS, Card, ChartBox, Columns, Drawer, Empty, Kpi, PageHead, SearchBox, Seg, StackedBar, Status, addDays, dayText, limaDay, soles, todayKey, useChartTip, useOpenId, whenText } from "./kit";

const METHOD_COLOR = { EFECTIVO: COLORS.deep, YAPE: COLORS.blue, PLIN: COLORS.mid, TARJETA: COLORS.gray };
const clientName = (row) => (row.client ? `${row.client.firstName} ${row.client.lastName}` : "—");
const refOf = (row) => row.reservation?.code || row.booking?.code || row.event?.code || row.stay?.code || (row.bookingId ? `RES-${row.bookingId}` : row.eventId ? `EVT-${row.eventId}` : "—");

export function PaymentsLedgerPage({ navigate }) {
  const [range, setRange] = useState("30");
  const [text, setText] = useState("");
  const [method, setMethod] = useState("");
  const [openId, open] = useOpenId();
  const stack = useChartTip(), daily = useChartTip();
  const today = todayKey();
  const from = range === "hoy" ? today : addDays(today, -(Number(range) - 1));
  // El servidor entrega solo el período elegido (lo antiguo vive en el historial).
  const payments = useFetch(`/pagos?from=${from}`, { initialData: [], realtime: true, pollInterval: 30000 });
  const rows = (Array.isArray(payments.data) ? payments.data : []).filter((row) => limaDay(row.createdAt) >= from).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const approved = rows.filter((row) => row.status === "APROBADO");
  const verifying = rows.filter((row) => /VERIFIC/.test(row.status || ""));
  const total = approved.reduce((s, r) => s + Number(r.amount || 0), 0);
  const byMethod = ["EFECTIVO", "YAPE", "PLIN", "TARJETA"].map((key) => ({ name: key[0] + key.slice(1).toLowerCase(), value: approved.filter((r) => r.method === key).reduce((s, r) => s + Number(r.amount || 0), 0), color: METHOD_COLOR[key], tooltip: soles(approved.filter((r) => r.method === key).reduce((s, r) => s + Number(r.amount || 0), 0)) }));
  const days = range === "hoy" ? [today] : Array.from({ length: Math.min(Number(range), 30) }, (_, i) => addDays(today, i - Math.min(Number(range), 30) + 1));
  const shown = useMemo(() => rows.filter((row) => (!method || row.method === method) && (!text.trim() || `${clientName(row)} ${row.concept} ${refOf(row)} ${row.operationCode || ""}`.toLowerCase().includes(text.trim().toLowerCase()))), [rows, method, text]);
  const selected = rows.find((row) => String(row.id) === openId) || null;
  if (payments.loading && !rows.length) return <LoadingSpinner label="Cargando pagos…" />;
  return <>
    <PageHead title="Ingresos y pagos" tools={<Seg value={range} onChange={setRange} options={[["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["365", "1 año"]]} />}>Todo lo que entró, con quién pagó, por qué y cómo. Un Yape o Plin cuenta cuando lo verificas en la reserva.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={CircleDollarSign} label="Cobrado" value={soles(total)} detail={`${approved.length} pago(s) aprobados`} />
      <Kpi label="Por verificar" value={verifying.length} detail={soles(verifying.reduce((s, r) => s + Number(r.amount || 0), 0))} />
      <Kpi label="Efectivo" value={soles(byMethod[0].value)} detail="Debe cuadrar con las cajas" />
      <Kpi label="Digital" value={soles(total - byMethod[0].value)} detail="Yape, Plin y tarjeta" />
    </div>
    <div className="rx-grid rx-g-2" style={{ marginBottom: 14 }}>
      <Card title="Cobrado por día" subtitle="Pagos aprobados"><ChartBox><Columns values={days.map((d) => approved.filter((r) => limaDay(r.createdAt) === d).reduce((s, r) => s + Number(r.amount || 0), 0))} labels={days.map((d) => d.slice(8))} name="Cobrado" tip={daily.tip} valueLabel={(v) => `S/ ${Math.round(v)}`} highlight={[days.length - 1]} everyLabel={days.length > 14 ? 5 : 1} />{daily.layer}</ChartBox></Card>
      <Card title="Por medio de pago" subtitle="Pagos aprobados"><ChartBox><StackedBar label="Cobrado" tip={stack.tip} format={(v) => soles(v)} legendValue="value" segments={byMethod} />{stack.layer}</ChartBox></Card>
    </div>
    <Card title="Pagos" flush tools={<><SearchBox value={text} onChange={setText} placeholder="Cliente, concepto, reserva u operación" width={260} /><select className="rx-select" value={method} onChange={(event) => setMethod(event.target.value)} style={{ width: 140 }}><option value="">Todo medio</option>{["EFECTIVO", "YAPE", "PLIN", "TARJETA"].map((m) => <option key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</option>)}</select></>}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Reserva</th><th>Medio</th><th>Estado</th><th className="n">Monto</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}><td className="mut">{whenText(row.createdAt)}</td><td>{clientName(row)}</td><td className="mut" style={{ maxWidth: 260 }}>{row.concept || "—"}</td><td className="rx-mono mut">{refOf(row)}</td><td>{row.method}</td><td><Status value={row.status} /></td><td className="n"><b>{soles(row.amount)}</b></td></tr>)}</tbody></table></div> : <Empty icon={CircleDollarSign} title="Sin pagos en el periodo" />}
    </Card>
    {selected ? <Drawer open onClose={() => open(null)} eyebrow={`Pago #${selected.id} · ${refOf(selected)}`} title={soles(selected.amount)} subtitle={`${clientName(selected)} · ${whenText(selected.createdAt)}`} footer={<><button className="rx-btn" type="button" onClick={() => open(null)}>Cerrar</button>{/VERIFIC/.test(selected.status || "") ? <button className="rx-btn rx-btn--primary" type="button" onClick={() => navigate("reservas", "general")}>Verificar en Reservas</button> : null}</>}>
      <dl className="rx-dl"><div><dt>Concepto</dt><dd>{selected.concept || "—"}</dd></div><div><dt>Medio</dt><dd>{selected.method}</dd></div><div><dt>Estado</dt><dd><Status value={selected.status} /></dd></div><div><dt>Área</dt><dd>{selected.area || "—"}</dd></div><div><dt>Operación</dt><dd>{selected.operationCode || "—"}</dd></div><div><dt>Documento del cliente</dt><dd>{selected.client?.documentNumber || "—"}</dd></div></dl>
      {selected.reservation ? <p className="ow-mini">Reserva {selected.reservation.code} del {dayText(selected.reservation.date)}{selected.reservation.room ? ` · habitación ${selected.reservation.room.number}` : ""}</p> : null}
    </Drawer> : null}
  </>;
}
