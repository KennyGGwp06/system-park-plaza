// Insumos › Pedir y recibir. Une "Solicitar insumos" y "Recibir insumos": envíos del almacén que la cocina debe
// contar y confirmar (POST /api/transfers/:id/receive) y solicitudes al dueño (GET/POST /api/stock-requests).
// La cocina no compra ni transfiere: solo pide lo que falta y confirma lo que llega.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PackageCheck, PackagePlus, Plus, RefreshCw, Trash2, Truck } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Alert, Drawer, Empty, PageHead, Tag, dateShort, timeOf, useShift, useToast } from "../recepcion/rxkit";
import { useKitchen } from "./KitchenShell";
import { qty } from "./KitchenStockPage";

const REQUEST_STATE = (request) => request.status === "REJECTED" ? ["Rechazada", "crit"] : request.status === "REQUESTED" ? ["Espera al dueño", "warn"] : ["RECEIVED", "RECEIVED_WITH_DIFFERENCE"].includes(request.transferStatus) ? ["Recibida", "ok"] : request.transferStatus === "SENT" ? ["En camino", "info"] : ["Aprobada", "info"];

export function KitchenSupplyPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("vista") === "recibir" ? "recibir" : "pedir";
  const { station, incoming, transfers, reloadTransfers } = useKitchen();
  const requests = useFetch("/stock-requests", { initialData: [], realtime: true, pollInterval: 20000 });
  const [receiving, setReceiving] = useState(null);
  const [creating, setCreating] = useState(false);
  const received = transfers.filter((row) => row.toWarehouseCode === station.area && ["RECEIVED", "RECEIVED_WITH_DIFFERENCE"].includes(row.status)).slice(0, 8);
  const mine = (requests.data || []).slice().sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  const refresh = () => { reloadTransfers(); requests.reload(); };

  return <>
    <PageHead title="Pedir y recibir" tools={<>
      <div className="rx-seg">
        <button type="button" className={tab === "pedir" ? "is-on" : ""} onClick={() => setParams({})}><PackagePlus size={15} />Mis solicitudes<i>{mine.filter((row) => row.status === "REQUESTED").length}</i></button>
        <button type="button" className={tab === "recibir" ? "is-on" : ""} onClick={() => setParams({ vista: "recibir" })}><Truck size={15} />Por recibir<i>{incoming.length}</i></button>
      </div>
      <button className="rx-btn" type="button" onClick={refresh}><RefreshCw />Actualizar</button>
      <button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nueva solicitud</button>
    </>}>{tab === "pedir" ? "Pide al dueño lo que falta. Él aprueba y el almacén lo envía; aquí sigues cada solicitud." : "Cuenta lo que llegó del almacén y confírmalo: solo entonces entra a tu stock."}</PageHead>

    {tab === "recibir" ? <div className="rx-stack">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Envíos por confirmar</h2><p>{incoming.length} envío(s) del almacén general</p></div></div>
        {incoming.length ? <ul className="rx-list">{incoming.map((row) => <li key={row.id}><span className="rx-ico"><Truck /></span><div className="grow"><b>{row.code} · desde {row.fromWarehouseName || "Almacén general"}</b><small>{(row.lines || []).length} insumo(s) · enviado {row.sentAt ? `${dateShort(row.sentAt)} ${timeOf(row.sentAt)}` : ""}</small></div><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={() => setReceiving(row)}><PackageCheck />Contar y recibir</button></li>)}</ul> : <Empty icon={Truck} title="No hay envíos por recibir">Cuando el dueño apruebe una solicitud, el envío aparecerá aquí.</Empty>}
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Últimas recepciones</h2></div></div>
        {received.length ? <ul className="rx-list">{received.map((row) => <li key={row.id}><div className="grow"><b>{row.code}</b><small>{(row.lines || []).map((line) => `${line.productName} ${qty(line.receivedQuantity ?? line.sentQuantity)} ${line.unitSymbol || ""}`).join(", ")}</small></div><Tag tone={row.status === "RECEIVED" ? "ok" : "warn"}>{row.status === "RECEIVED" ? "Conforme" : "Con diferencia"}</Tag></li>)}</ul> : <Empty title="Aún no hay recepciones" />}
      </section>
    </div> : <section className="rx-card">
      <div className="rx-card-h"><div><h2>Mis solicitudes</h2><p>Del cierre del día y de emergencia</p></div></div>
      {mine.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Solicitud</th><th>Origen</th><th>Insumos</th><th>Pedida</th><th>Estado</th><th>Respuesta del dueño</th></tr></thead>
        <tbody>{mine.map((row) => { const [label, tone] = REQUEST_STATE(row); return <tr key={row.id}>
          <td><b className="rx-mono">{row.code}</b></td>
          <td>{row.source === "CIERRE" ? "Cierre del día" : "Emergencia"}</td>
          <td className="mut" style={{ maxWidth: 360 }}>{(row.lines || []).map((line) => `${line.productName} ${qty(line.approvedQuantity ?? line.requestedQuantity)} ${line.unitSymbol}${line.excess ? " (exceso)" : ""}`).join(", ")}</td>
          <td className="mut">{dateShort(row.requestedAt)} {timeOf(row.requestedAt)}</td>
          <td><Tag tone={tone}>{label}</Tag></td>
          <td className="mut">{row.reviewNote || "—"}</td>
        </tr>; })}</tbody>
      </table></div> : <Empty icon={PackagePlus} title="Aún no has pedido insumos" />}
    </section>}

    <ReceiveDrawer station={station} transfer={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); refresh(); }} />
    <RequestDrawer open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />
  </>;
}

function ReceiveDrawer({ station, transfer, onClose, onDone }) {
  const show = useToast();
  const { active } = useShift();
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!transfer) return null;
  const value = (line) => counts[line.id] ?? String(line.sentQuantity ?? line.requestedQuantity ?? 0);
  const differences = (transfer.lines || []).filter((line) => Math.abs(Number(value(line)) - Number(line.sentQuantity ?? line.requestedQuantity ?? 0)) > 0.0001);
  async function confirm() {
    setBusy(true); setError("");
    try { await api(`/transfers/${transfer.id}/receive`, { method: "POST", body: { observation: differences.length ? `Recibido con diferencias contadas por ${station.name}` : `Recepción confirmada por ${station.name}`, lines: transfer.lines.map((line) => ({ lineId: line.id, receivedQuantity: Number(value(line) || 0) })) } }); show(`Envío ${transfer.code} recibido. Ya está en tu stock.`); setCounts({}); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Drawer open onClose={() => { setCounts({}); onClose(); }} busy={busy} eyebrow={`Envío ${transfer.code}`} title="Contar y recibir" subtitle={`Desde ${transfer.fromWarehouseName || "Almacén general"} · anota lo que realmente llegó`}
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={confirm} disabled={busy || !active}><PackageCheck />{differences.length ? "Recibir con diferencias" : "Confirmar recepción"}</button></>}>
    <div className="kd-weigh">{(transfer.lines || []).map((line) => <div key={line.id}>
      <span><b style={{ fontWeight: 500 }}>{line.productName}</b><small>Enviado {qty(line.sentQuantity ?? line.requestedQuantity)} {line.unitSymbol}</small></span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}><input className="rx-input kd-count-input rx-mono" type="number" min="0" step="any" value={value(line)} onChange={(event) => setCounts({ ...counts, [line.id]: event.target.value })} aria-label={`Recibido de ${line.productName}`} /><small>{line.unitSymbol}</small></span>
    </div>)}</div>
    {differences.length ? <Alert tone="warn">Hay {differences.length} diferencia(s) con lo enviado. Quedarán registradas para el dueño.</Alert> : null}
    {!active ? <Alert tone="warn">Inicia tu turno para recibir insumos.</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function RequestDrawer({ open, onClose, onDone }) {
  const show = useToast();
  const references = useFetch("/stock-requests/references", { initialData: { products: [] }, enabled: open, realtime: false });
  const [lines, setLines] = useState([{ productId: "", quantity: "" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const products = useMemo(() => (references.data?.products || []).slice().sort((a, b) => a.name.localeCompare(b.name, "es")), [references.data]);
  if (!open) return null;
  const set = (index, patch) => setLines(lines.map((line, row) => (row === index ? { ...line, ...patch } : line)));
  const close = () => { setLines([{ productId: "", quantity: "" }]); setNote(""); setError(""); onClose(); };
  async function send() {
    const chosen = lines.filter((line) => line.productId);
    if (!chosen.length || chosen.some((line) => !(Number(line.quantity) > 0))) { setError("Elige cada insumo e indica la cantidad."); return; }
    if (new Set(chosen.map((line) => line.productId)).size !== chosen.length) { setError("Hay un insumo repetido."); return; }
    if (!note.trim()) { setError("Explica para qué lo necesitas: el dueño lo revisa."); return; }
    setBusy(true); setError("");
    try { const created = await api("/stock-requests", { method: "POST", body: { observation: note.trim(), lines: chosen.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })) } }); show(`Solicitud ${created.code} enviada al dueño.`); close(); onDone(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Drawer open onClose={close} busy={busy} eyebrow="Nueva solicitud" title="Pedir insumos al dueño" subtitle="Indica qué falta y cuánto; no necesitas lotes ni almacenes"
    footer={<><button className="rx-btn" type="button" onClick={close} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={send} disabled={busy}>Enviar solicitud</button></>}>
    <section className="rx-sec"><h3>Insumos</h3><div style={{ display: "grid", gap: 8 }}>
      {lines.map((line, index) => { const product = products.find((item) => String(item.id) === String(line.productId)); return <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: 8, alignItems: "end" }}>
        <label className="rx-field"><span>{index === 0 ? "Insumo" : " "}</span><select className="rx-select" value={line.productId} onChange={(event) => set(index, { productId: event.target.value })}><option value="">Elige el insumo</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unitSymbol})</option>)}</select></label>
        <label className="rx-field"><span>{index === 0 ? "Cantidad" : " "}</span><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.quantity} onChange={(event) => set(index, { quantity: event.target.value })} placeholder={product?.unitSymbol || ""} /></label>
        <button className="rx-close" type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((_, row) => row !== index) : lines)} aria-label="Quitar insumo"><Trash2 size={14} /></button>
        {product && Number(line.quantity) > Number(product.generalAvailable) ? <small style={{ gridColumn: "1 / -1", color: "var(--warn)" }}>El almacén general tiene {qty(product.generalAvailable)} {product.unitSymbol}; el dueño podría tener que comprar.</small> : null}
      </div>; })}
      <button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={() => setLines([...lines, { productId: "", quantity: "" }])} style={{ justifySelf: "start" }}><Plus />Agregar insumo</button>
    </div></section>
    <label className="rx-field"><span>Para qué lo necesitas</span><textarea className="rx-input" style={{ height: 70, paddingTop: 8 }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. se acabó un insumo en pleno servicio" /></label>
    <Alert tone="info">Para el pedido de mañana usa el paso final del Cierre del día: ahí el sistema sugiere lo que justifican tus ventas.</Alert>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
