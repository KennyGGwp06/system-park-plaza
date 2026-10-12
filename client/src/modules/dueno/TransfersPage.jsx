// Insumos › Distribución a las áreas. El dueño envía insumos del almacén general a Cocina o Bar (o entre ellas); el
// sistema toma primero el lote que vence antes y el área confirma lo que llegó (otra persona, por separación de
// responsabilidades). Aquí se ven los envíos en camino y los que llegaron con diferencia.
// Rutas: GET /api/transfers(/references|/stock), POST /api/transfers, /:id/send, /:id/cancel.
import { useState } from "react";
import { Plus, Send, Trash2, Truck, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, Seg, Status, qty, soles, useBusy, useOpenId, useToast, whenText } from "./kit";

const ROUTES = new Set(["GENERAL>RESTAURANTE", "GENERAL>BARTENDER", "RESTAURANTE>BARTENDER", "BARTENDER>RESTAURANTE"]);

export function TransfersPage() {
  const transfers = useFetch("/transfers", { initialData: [], realtime: true, pollInterval: 30000 });
  const references = useFetch("/transfers/references", { initialData: { warehouses: [], stock: [] }, realtime: true });
  const overview = useFetch("/transfers/stock", { initialData: { warehouses: [] }, realtime: true });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("curso");
  const rows = (Array.isArray(transfers.data) ? transfers.data : []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const inTransit = rows.filter((row) => row.status === "SENT");
  const drafts = rows.filter((row) => row.status === "DRAFT");
  const diff = rows.filter((row) => row.status === "RECEIVED_WITH_DIFFERENCE" || (row.alerts || []).some((alert) => alert.status !== "RESOLVED"));
  const shown = filter === "curso" ? [...drafts, ...inTransit] : filter === "dif" ? diff : rows;
  const selected = rows.find((row) => String(row.id) === openId) || null;
  const refresh = () => { transfers.reload(); references.reload(); overview.reload(); };

  if (transfers.loading && !rows.length) return <LoadingSpinner label="Cargando envíos…" />;
  return <>
    <PageHead title="Distribución a las áreas" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Send />Enviar insumos</button>}>Envía del almacén general a Cocina o Bar. El sistema toma primero el lote que vence antes y el área cuenta lo que llegó: si no coincide, queda como diferencia.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      {(overview.data?.warehouses || []).filter((w) => ["GENERAL", "RESTAURANTE", "BARTENDER"].includes(w.warehouseCode)).map((w) => <Kpi key={w.warehouseId} label={w.warehouseName} value={qty(w.available, 0)} detail={`unidades base disponibles${Number(w.committed) ? ` · ${qty(w.committed, 0)} comprometidas` : ""}`} />)}
      <Kpi icon={Truck} label="En camino" value={inTransit.length} detail={diff.length ? `${diff.length} con diferencia` : "Sin diferencias"} />
    </div>
    <Card title="Envíos" flush tools={<Seg value={filter} onChange={setFilter} options={[["curso", "En curso", drafts.length + inTransit.length], ["dif", "Con diferencia", diff.length], ["todos", "Todos", rows.length]]} />}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Envío</th><th>De → a</th><th>Insumos</th><th>Enviado</th><th>Estado</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}>
          <td><b className="rx-mono">{row.code}</b></td><td>{row.fromWarehouseName} → {row.toWarehouseName}</td><td className="mut" style={{ maxWidth: 320 }}>{(row.lines || []).map((line) => `${line.productName} ${qty(line.sentQuantity ?? line.requestedQuantity)} ${line.unitSymbol || ""}`).join(", ")}</td>
          <td className="mut">{row.sentAt ? whenText(row.sentAt) : "Borrador"}</td><td><Status value={row.status} /></td>
        </tr>)}</tbody></table></div> : <Empty icon={Truck} title="Sin envíos en esta vista" />}
    </Card>
    {selected ? <TransferDrawer transfer={selected} onClose={() => open(null)} onDone={() => { open(null); refresh(); }} /> : null}
    {creating ? <CreateTransfer references={references.data} onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} /> : null}
  </>;
}

function TransferDrawer({ transfer, onClose, onDone }) {
  const show = useToast();
  const { busy, error, run } = useBusy();
  const act = (name, body, message) => run(async () => { await api(`/transfers/${transfer.id}/${name}`, { method: "POST", body }); show(message); onDone(); });
  return <Drawer open onClose={onClose} busy={busy} eyebrow={transfer.code} title={`${transfer.fromWarehouseName} → ${transfer.toWarehouseName}`} subtitle={transfer.observation || "Sin observación"}
    footer={transfer.status === "DRAFT" ? <><button className="rx-btn rx-btn--danger" type="button" disabled={busy} onClick={() => act("cancel", { observation: "Cancelada por el dueño antes del envío" }, "Borrador cancelado: el stock quedó libre.")}><X />Cancelar</button><button className="rx-btn rx-btn--primary" type="button" disabled={busy} onClick={() => act("send", {}, "Enviado: el stock está en camino.")}><Send />Enviar</button></> : <button className="rx-btn" type="button" onClick={onClose}>Cerrar</button>}>
    <div style={{ display: "flex", gap: 6 }}><Status value={transfer.status} /></div>
    <dl className="rx-dl"><div><dt>Envió</dt><dd>{transfer.sentUser?.name || "—"}</dd></div><div><dt>Enviado</dt><dd>{transfer.sentAt ? whenText(transfer.sentAt) : "—"}</dd></div><div><dt>Recibió</dt><dd>{transfer.receivedUser?.name || "—"}</dd></div><div><dt>Recibido</dt><dd>{transfer.receivedAt ? whenText(transfer.receivedAt) : "—"}</dd></div></dl>
    <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Insumo</th><th>Lote</th><th className="n">Enviado</th><th className="n">Recibido</th><th className="n">Diferencia</th></tr></thead>
      <tbody>{(transfer.lines || []).map((line) => { const d = line.receivedQuantity == null ? null : Number(line.receivedQuantity) - Number(line.sentQuantity); return <tr key={line.id}><td>{line.productName}</td><td className="mut">{line.lotCode || "—"}</td><td className="n">{qty(line.sentQuantity ?? line.requestedQuantity)} {line.unitSymbol}</td><td className="n">{line.receivedQuantity == null ? "—" : qty(line.receivedQuantity)}</td><td className="n" style={{ color: d ? "var(--crit)" : undefined }}>{d == null ? "—" : d ? `${d > 0 ? "+" : ""}${qty(d)}` : "—"}{d && line.unitCost ? <small style={{ display: "block" }}>{soles(d * Number(line.unitCost))}</small> : null}</td></tr>; })}</tbody></table></div>
    {(transfer.alerts || []).length ? <Alert tone="warn">{transfer.alerts.map((alert) => alert.message || alert.type).join(" · ")}</Alert> : null}
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function CreateTransfer({ references, onClose, onDone }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const refs = references || { warehouses: [], stock: [] };
  const general = refs.warehouses.find((item) => item.code === "GENERAL");
  const [form, setForm] = useState({ fromWarehouseId: general?.id || "", toWarehouseId: "", observation: "", lines: [{ productName: "", quantity: "" }] });
  const origin = refs.warehouses.find((item) => String(item.id) === String(form.fromWarehouseId));
  const destinations = refs.warehouses.filter((item) => ROUTES.has(`${origin?.code}>${item.code}`));
  const originStock = refs.stock.filter((item) => String(item.warehouseId) === String(form.fromWarehouseId) && Number(item.available) > 0);
  const names = [...new Set(originStock.map((item) => item.productName))].sort((a, b) => a.localeCompare(b, "es"));
  const totalOf = (name) => originStock.filter((item) => item.productName.toLowerCase() === name.trim().toLowerCase()).reduce((sum, item) => sum + Number(item.available), 0);
  const setLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, row) => (row === index ? { ...line, ...patch } : line)) }));
  const submit = () => {
    if (!form.toWarehouseId) { setError("Elige a qué área va."); return; }
    run(async () => {
      const lines = [];
      for (const input of form.lines) {
        const candidates = originStock.filter((item) => item.productName.toLowerCase() === input.productName.trim().toLowerCase()).sort((a, b) => String(a.expiresOn || "9999").localeCompare(String(b.expiresOn || "9999")));
        if (!candidates.length) throw new Error(`Elige “${input.productName || "insumo"}” de la lista.`);
        let pending = Number(input.quantity);
        if (!(pending > 0)) throw new Error(`Pon la cantidad de ${input.productName}.`);
        for (const stock of candidates) { const amount = Math.min(pending, Number(stock.available)); if (amount > 0) lines.push({ productId: Number(stock.productId), lotId: stock.lotId ? Number(stock.lotId) : null, quantity: amount }); pending -= amount; if (pending <= 0.000001) break; }
        if (pending > 0.000001) throw new Error(`No hay suficiente ${input.productName}.`);
      }
      const created = await api("/transfers", { method: "POST", body: { fromWarehouseId: Number(form.fromWarehouseId), toWarehouseId: Number(form.toWarehouseId), observation: form.observation, lines } });
      await api(`/transfers/${created.id}/send`, { method: "POST", body: {} });
      show(`Envío ${created.code} en camino. El área debe confirmar que llegó.`); onDone();
    });
  };
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Envío rápido" title="Enviar insumos a un área" subtitle="Se reparte entre los lotes que vencen primero"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={submit} disabled={busy}><Send />Enviar</button></>}>
    <div className="ow-form">
      <Field label="Sale de"><select className="rx-select" value={form.fromWarehouseId} onChange={(event) => setForm({ ...form, fromWarehouseId: event.target.value, toWarehouseId: "", lines: [{ productName: "", quantity: "" }] })}>{refs.warehouses.filter((item) => ["GENERAL", "RESTAURANTE", "BARTENDER"].includes(item.code)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Va hacia"><select className="rx-select" value={form.toWarehouseId} onChange={(event) => setForm({ ...form, toWarehouseId: event.target.value })}><option value="">Elige</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Motivo (opcional)" full><input className="rx-input" value={form.observation} onChange={(event) => setForm({ ...form, observation: event.target.value })} placeholder="Ej. abastecimiento del fin de semana" /></Field>
    </div>
    <section className="rx-sec"><h3>Insumos</h3><div style={{ display: "grid", gap: 6 }}>{form.lines.map((line, index) => { const unit = originStock.find((item) => item.productName.toLowerCase() === line.productName.trim().toLowerCase())?.unitSymbol; return <div key={index} style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr 32px", gap: 6, alignItems: "end" }}>
      <Field label={index ? " " : "Insumo"}><input className="rx-input" list={`owner-transfer-${index}`} value={line.productName} onChange={(event) => setLine(index, { productName: event.target.value })} placeholder="Escribe para buscar" /><datalist id={`owner-transfer-${index}`}>{names.map((name) => <option key={name} value={name} />)}</datalist></Field>
      <Field label={index ? " " : `Cantidad${unit ? ` (${unit}, hay ${qty(totalOf(line.productName))})` : ""}`}><input className="rx-input rx-mono" type="number" min="0" step="any" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} /></Field>
      <button className="rx-close" type="button" aria-label="Quitar" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, row) => row !== index) })}><Trash2 size={14} /></button>
    </div>; })}<button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" style={{ justifySelf: "start" }} onClick={() => setForm({ ...form, lines: [...form.lines, { productName: "", quantity: "" }] })}><Plus />Agregar insumo</button></div></section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
