import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, Boxes, CheckCircle2, ClipboardList, Clock, Droplets, PackagePlus, Play, Save, Trash2, Wine } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { statusLabel } from "../../components/StatusBadge";

const ACTIVE = ["PENDING", "OPEN", "OPERATING", "COUNTING", "REOPENED"];
const keyOf = (line) => `${line.productId}|${line.lotId ?? ""}`;
const requestOptions = { realtime: true, pollInterval: 15000 };

function useBarSession() {
  const sessionsRequest = useFetch("/operational-inventory/sessions", { ...requestOptions, initialData: [] });
  const session = useMemo(() => (sessionsRequest.data || []).find((item) => ACTIVE.includes(item.status)) || null, [sessionsRequest.data]);
  const detailRequest = useFetch(session ? `/operational-inventory/sessions/${session.id}` : "", { ...requestOptions, initialData: {}, enabled: Boolean(session) });
  return { session, sessionsRequest, detailRequest };
}

export function BarDashboard() {
  const { session, sessionsRequest } = useBarSession();
  const { data: orderData = [] } = useFetch("/bartender", { ...requestOptions, initialData: [] });
  if (sessionsRequest.loading) return <Loading text="Cargando turno de Bar..." />;
  if (sessionsRequest.error) return <Failure error={sessionsRequest.error} />;
  if (!session) return <NoTurn />;
  const isCounting = ["COUNTING", "REOPENED"].includes(session.status);
  const pending = orderData.filter((item) => item.status === "PENDIENTE").length;
  const preparing = orderData.filter((item) => item.status === "PREPARANDO").length;
  const ready = orderData.filter((item) => item.status === "LISTO").length;
  return <main className="space-y-6 py-5">
    <Header icon={Wine} eyebrow="Bar · operación de turno" title="Mi turno" description="Prepara bebidas, controla tu inventario asignado y rinde al finalizar." />
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="Turno" value={session.shift || `#${session.id}`} help={session.date} />
      <Metric label="Estado" value={statusLabel(session.status)} help={session.areaName || "Bar"} />
      <Metric label="Responsable" value={session.responsibleName || "Personal de Bar"} help={session.openedAt ? `Abierto ${new Date(session.openedAt).toLocaleTimeString()}` : "Pendiente de apertura"} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <QuickAction to="/bartender/pedidos" label="Pedidos nuevos" value={pending} help="Aceptar y preparar" />
      <QuickAction to="/bartender/pedidos" label="En preparación" value={preparing} help="Revisar tiempos" />
      <QuickAction to="/bartender/pedidos" label="Listos para entregar" value={ready} help="Confirmar entrega" />
      <QuickAction to="/bartender/inventario/solicitudes" label="Solicitar insumos" value={<PackagePlus size={22} />} help="Pedir reposición" />
    </div>
    {isCounting ? <Alert tone="warning" title="Conteo físico en curso">No entregues nuevas bebidas. Finaliza la rendición desde “Cerrar y cuadrar”.</Alert> : <Alert tone="info" title="Turno operativo">Los pedidos autorizados aparecerán en tiempo real en tu cola.</Alert>}
  </main>;
}

export function BarOrdersPage() {
  const { data, loading, error, reload: refresh } = useFetch("/bartender", { ...requestOptions, initialData: [] });
  const [busy, setBusy] = useState(null); const [message, setMessage] = useState("");
  const orders = (data || []).filter((item) => !["ENTREGADO", "CANCELADO"].includes(item.status));
  const flow = [
    { status: "PENDIENTE", title: "Nuevos", next: "PREPARANDO", action: "Aceptar y preparar" },
    { status: "PREPARANDO", title: "Preparando", next: "LISTO", action: "Marcar como listo" },
    { status: "LISTO", title: "Listos", next: "ENTREGADO", action: "Confirmar entrega" }
  ];
  async function change(order, target) {
    if (target === "CANCELADO" && !window.confirm(`¿Rechazar el pedido ${order.code}?`)) return;
    setBusy(order.id); setMessage("");
    try { await api(`/bartender/${order.id}/status`, { method: "PATCH", body: { status: target } }); await refresh(); }
    catch (err) { setMessage(`No se pudo actualizar ${order.code}: ${err.message}`); }
    finally { setBusy(null); }
  }
  if (loading && !data) return <Loading text="Cargando pedidos de Bar..." />;
  if (error && !data) return <Failure error={error} />;
  return <main className="space-y-6 py-5">
    <Header icon={Wine} eyebrow="Bar · producción" title="Operación y pedidos" description="Cada bebida se descuenta de tu inventario únicamente al entregarla." action={<Button variant="outline" onClick={refresh} disabled={Boolean(busy)}>Actualizar</Button>} />
    {message ? <Alert tone="danger" title="Operación rechazada">{message}</Alert> : null}
    {!orders.length ? <Empty title="No hay bebidas pendientes" text="Los nuevos pedidos autorizados aparecerán aquí." /> : <div className="grid gap-4 xl:grid-cols-3">{flow.map((stage, stageIndex) => <section className="rounded-card border border-park-border bg-park-bg/70 p-3" key={stage.status}><div className="mb-3 flex items-center justify-between px-1"><div><b className="text-park-dark">{stageIndex + 1}. {stage.title}</b><small className="block text-park-muted">{stage.status === "LISTO" ? "Esperan entrega" : "Continúa el flujo"}</small></div><span className="grid h-8 min-w-8 place-items-center rounded-full bg-white px-2 font-black text-park-green">{orders.filter((order) => order.status === stage.status).length}</span></div><div className="space-y-3">{orders.filter((order) => order.status === stage.status).map((order) => <article className="rounded-xl border border-park-border bg-white p-4 shadow-sm" key={order.id}>
      <div className="flex items-start justify-between gap-3"><div><strong className="text-lg text-park-dark">{order.code}</strong><p className="mt-1 text-xs text-park-muted">{order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : "Pedido recibido"}</p></div><Status value={order.status} /></div>
      <div className="my-4 space-y-2">{(order.items || []).map((item, index) => <div className="flex justify-between border-b border-park-border pb-2 text-sm" key={`${item.menuItemId || item.name}-${index}`}><span><b>{item.quantity}×</b> {item.name}</span><span>{item.size || ""}</span></div>)}</div>
      {order.notes ? <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nota: {order.notes}</p> : null}
      <Button className="w-full" onClick={() => change(order, stage.next)} disabled={busy === order.id}>{busy === order.id ? "Procesando..." : stage.action}</Button>
      {order.status === "LISTO" ? <p className="mt-2 text-center text-[11px] text-park-muted">Al confirmar se descuenta el inventario del Bar.</p> : null}
      {order.status === "PENDIENTE" ? <Button className="mt-2 w-full" variant="ghost" onClick={() => change(order, "CANCELADO")} disabled={busy === order.id}>Rechazar pedido</Button> : null}
    </article>)}{!orders.some((order) => order.status === stage.status) ? <div className="rounded-xl border border-dashed border-park-border bg-white/70 p-6 text-center text-sm text-park-muted">Sin pedidos en esta etapa</div> : null}</div></section>)}</div>}
  </main>;
}

export function BarRecipesPage() {
  const { data, loading, error } = useFetch("/technical-recipes/manual/BARTENDER", { ...requestOptions, initialData: [] });
  if (loading) return <Loading text="Cargando manual técnico..." />;
  if (error) return <Failure error={error} />;
  const recipes = data || [];
  return <main className="space-y-6 py-5"><Header icon={Droplets} eyebrow="Bar · solo lectura" title="Manual y medidas" description="Recetas, insumos y porciones estándar definidos por el Superadmin." />
    {!recipes.length ? <Empty title="No hay recetas publicadas" text="Solicita al Superadmin completar la ficha técnica." /> : <div className="grid gap-4 lg:grid-cols-2">{recipes.map((recipe) => <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={recipe.id || recipe.menuItemId || recipe.name}><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-park-dark">{recipe.name || recipe.menuItemName}</h2><p className="mt-1 text-sm text-park-muted">Rinde {recipe.yieldQuantity || 1} {recipe.yieldUnitSymbol || "porción"}</p></div><span className="rounded-full bg-park-green-soft px-3 py-1 text-xs font-black text-park-green">{Number(recipe.availablePortions || 0)} disponibles</span></div><div className="mt-4 space-y-2">{(recipe.ingredients || recipe.lines || []).map((line, index) => <div className="flex justify-between border-b border-park-border py-2 text-sm" key={index}><span>{line.productName || line.name}</span><b>{Number(line.requiredPerPortion ?? line.quantity).toFixed(2)} {line.baseUnitSymbol || line.unitSymbol || line.unit || ""}</b></div>)}</div>{recipe.manual?.description ? <p className="mt-4 rounded-lg bg-park-bg p-3 text-sm text-park-muted">{recipe.manual.description}</p> : null}{recipe.manual?.steps?.length ? <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-park-muted">{recipe.manual.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol> : null}</article>)}</div>}
  </main>;
}

export function BarInventoryPage() {
  const { session, sessionsRequest, detailRequest } = useBarSession();
  const location = useLocation();
  const routeTab = location.pathname.endsWith("/mermas") ? "waste" : location.pathname.endsWith("/cierre") ? "close" : "stock";
  const [tab, setTab] = useState(routeTab), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [selection, setSelection] = useState(""), [waste, setWaste] = useState({ category: "PREPARATION_ERROR", quantity: "", observation: "" });
  const [counts, setCounts] = useState({}), [reasons, setReasons] = useState({});
  const detail = detailRequest.data; const lines = detail?.lines || []; const status = detail?.status || session?.status;
  const isOpen = status === "OPEN", isCounting = ["COUNTING", "REOPENED"].includes(status), isSubmitted = ["SUBMITTED", "OBSERVED", "CLOSED"].includes(status);
  useEffect(() => { setTab(routeTab); }, [routeTab]);
  async function run(work) { setBusy(true); setMessage(""); try { await work(); await detailRequest.refresh(); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }
  async function registerWaste(event) { event.preventDefault(); const [productId, lotId = ""] = selection.split("|"); if (!productId) return setMessage("Selecciona un producto o lote para registrar la merma."); await run(() => api(`/operational-inventory/sessions/${session.id}/waste`, { method: "POST", body: { productId: Number(productId), lotId: lotId ? Number(lotId) : null, quantity: Number(waste.quantity), category: waste.category, observation: waste.observation } })); setSelection(""); setWaste({ category: "PREPARATION_ERROR", quantity: "", observation: "" }); }
  async function submitCount() { const missing = lines.find((line) => counts[keyOf(line)] === undefined || counts[keyOf(line)] === ""); if (missing) return setMessage(`Falta contar: ${missing.productName}.`); const payload = { counts: [], explanations: [], notes: "Rendición enviada desde Bar nativo" }; for (const line of lines) { const quantity = Number(counts[keyOf(line)]); if (quantity < 0) return setMessage("No se permiten cantidades negativas."); payload.counts.push({ productId: line.productId, lotId: line.lotId || null, quantity }); const tolerance = Math.abs(Number(line.expectedQuantity || 0)) * Number(line.tolerancePercent || 0) / 100; if (Math.abs(quantity - Number(line.expectedQuantity || 0)) > tolerance) { if (!String(reasons[keyOf(line)] || "").trim()) return setMessage(`Explica la diferencia de ${line.productName}.`); payload.explanations.push({ productId: line.productId, lotId: line.lotId || null, reason: reasons[keyOf(line)] }); } } await run(() => api(`/operational-inventory/sessions/${session.id}/submit`, { method: "POST", body: payload })); }
  if (sessionsRequest.loading || (session && detailRequest.loading && !detail)) return <Loading text="Cargando inventario de Bar..." />;
  if (sessionsRequest.error || detailRequest.error) return <Failure error={sessionsRequest.error || detailRequest.error} />;
  if (!session) return <NoTurn />;
  return <main className="space-y-6 py-5"><Header icon={Boxes} eyebrow="Bar · inventario separado" title="Mi inventario de turno" description="Solo ves el stock asignado a Bar. Las diferencias se envían a revisión." />
    {message ? <Alert tone="danger" title="No se pudo completar la acción">{message}</Alert> : null}
    <nav className="flex flex-wrap gap-2"><Button variant={tab === "stock" ? "default" : "secondary"} onClick={() => setTab("stock")}>Stock</Button><Button variant={tab === "waste" ? "default" : "secondary"} onClick={() => setTab("waste")}>Merma</Button><Button variant={tab === "close" ? "default" : "secondary"} onClick={() => setTab("close")}>Cerrar y cuadrar</Button></nav>
    {tab === "stock" ? <StockTable lines={lines} /> : null}
    {tab === "waste" ? (isOpen || isCounting ? <form className="max-w-xl rounded-card border border-park-border bg-white p-5 shadow-card" onSubmit={registerWaste}><h2 className="font-black text-park-dark">Registrar merma</h2><select className="mt-4 w-full rounded-lg border p-3" value={selection} onChange={(event) => setSelection(event.target.value)} required><option value="">Selecciona producto o lote</option>{lines.map((line) => <option key={keyOf(line)} value={keyOf(line)}>{line.productName} {line.lotCode ? `· ${line.lotCode}` : ""} · {line.expectedQuantity} {line.unitSymbol}</option>)}</select><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input type="number" min="0.000001" step="any" required value={waste.quantity} onChange={(event) => setWaste({ ...waste, quantity: event.target.value })} placeholder="Cantidad" /><select className="rounded-lg border p-3" value={waste.category} onChange={(event) => setWaste({ ...waste, category: event.target.value })}><option value="PREPARATION_ERROR">Error de preparación</option><option value="SPILL">Derrame</option><option value="EXPIRY">Vencimiento</option><option value="DAMAGED">Producto dañado</option><option value="INTERNAL_CONSUMPTION">Consumo interno</option><option value="OTHER">Otra</option></select></div><Input className="mt-3" required value={waste.observation} onChange={(event) => setWaste({ ...waste, observation: event.target.value })} placeholder="Motivo detallado" /><Button className="mt-4 w-full" type="submit" disabled={busy}>{busy ? "Registrando..." : "Registrar merma"}</Button></form> : <Alert tone="info">La merma solo se registra durante un turno abierto o en conteo.</Alert>) : null}
    {tab === "close" ? <section className="rounded-card border border-park-border bg-white p-5 shadow-card">{isSubmitted ? <Alert tone="success" title="Rendición enviada">El Superadmin revisará y cerrará el turno.</Alert> : isOpen ? <div className="text-center"><ClipboardList className="mx-auto h-12 w-12 text-amber-600" /><h2 className="mt-3 font-black text-park-dark">Iniciar conteo físico</h2><p className="mt-1 text-sm text-park-muted">Al iniciar, no se podrán procesar más pedidos.</p><Button className="mt-4" onClick={() => run(() => api(`/operational-inventory/sessions/${session.id}/start-count`, { method: "POST" }))} disabled={busy}>{busy ? "Iniciando..." : "Comenzar conteo"}</Button></div> : isCounting ? <CountForm lines={lines} counts={counts} setCounts={setCounts} reasons={reasons} setReasons={setReasons} onSubmit={submitCount} busy={busy} /> : <Alert tone="info">Este turno debe ser abierto por el Superadmin antes de operarlo.</Alert>}</section> : null}
  </main>;
}

function StockTable({ lines }) { return <div className="overflow-x-auto rounded-card border border-park-border bg-white shadow-card"><table className="w-full text-sm"><thead className="bg-park-bg text-left text-park-muted"><tr><th className="p-3">Insumo</th><th className="p-3">Inicial</th><th className="p-3">Consumo</th><th className="p-3">Merma</th><th className="p-3">Esperado</th></tr></thead><tbody>{lines.map((line) => <tr className="border-t border-park-border" key={keyOf(line)}><td className="p-3 font-bold">{line.productName}<small className="block font-normal text-park-muted">{line.lotCode || "Sin lote"}</small></td><td className="p-3">{line.openingQuantity} {line.unitSymbol}</td><td className="p-3">{line.theoreticalConsumption} {line.unitSymbol}</td><td className="p-3">{line.wasteQuantity} {line.unitSymbol}</td><td className="p-3 font-bold">{line.expectedQuantity} {line.unitSymbol}</td></tr>)}</tbody></table>{!lines.length ? <Empty title="Sin insumos asignados" text="El Superadmin debe asignar stock al turno." /> : null}</div>; }
function CountForm({ lines, counts, setCounts, reasons, setReasons, onSubmit, busy }) { return <div><h2 className="font-black text-park-dark">Conteo físico</h2><p className="mt-1 text-sm text-park-muted">Completa todos los insumos. Las diferencias fuera de tolerancia requieren explicación.</p><div className="mt-4 space-y-3">{lines.map((line) => { const key = keyOf(line); return <div className="rounded-lg border border-park-border p-3" key={key}><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{line.productName}</b> <small className="text-park-muted">{line.lotCode || "Sin lote"} · esperado {line.expectedQuantity} {line.unitSymbol}</small></span><Input className="w-32" type="number" min="0" step="any" value={counts[key] ?? ""} onChange={(event) => setCounts({ ...counts, [key]: event.target.value })} placeholder={line.unitSymbol} /></div>{counts[key] !== undefined && Math.abs(Number(counts[key]) - Number(line.expectedQuantity || 0)) > Math.abs(Number(line.expectedQuantity || 0)) * Number(line.tolerancePercent || 0) / 100 ? <Input className="mt-2" value={reasons[key] || ""} onChange={(event) => setReasons({ ...reasons, [key]: event.target.value })} placeholder="Explica la diferencia" /> : null}</div>; })}</div><Button className="mt-5" onClick={onSubmit} disabled={busy}>{busy ? "Enviando..." : "Enviar rendición a revisión"}</Button></div>; }
function Header({ icon: Icon, eyebrow, title, description, action }) { return <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-park-gold">{eyebrow}</p><h1 className="mt-1 flex items-center gap-3 text-3xl font-black text-park-dark"><Icon className="text-park-gold" />{title}</h1><p className="mt-2 text-park-muted">{description}</p></div>{action}</header>; }
function Metric({ label, value, help }) { return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><p className="text-xs font-black uppercase text-park-muted">{label}</p><strong className="mt-2 block text-xl text-park-dark">{value}</strong><small className="text-park-muted">{help}</small></article>; }
function QuickAction({ to, label, value, help }) { return <Link className="rounded-card border border-park-border bg-white p-4 shadow-sm transition-shadow hover:shadow-card" to={to}><p className="text-xs font-black uppercase text-park-muted">{label}</p><strong className="mt-2 block text-2xl text-park-dark">{value}</strong><small className="text-park-green">{help} →</small></Link>; }
function Status({ value }) { return <span className="rounded-full bg-park-bg px-3 py-1 text-xs font-black text-park-dark">{value}</span>; }
function Empty({ title, text }) { return <div className="rounded-card border border-dashed border-park-border bg-white p-10 text-center"><Wine className="mx-auto h-8 w-8 text-park-gold" /><h2 className="mt-3 font-black text-park-dark">{title}</h2><p className="mt-1 text-sm text-park-muted">{text}</p></div>; }
function NoTurn() { return <main className="reception-command space-y-6 py-5"><section className="reception-hero"><div><p>BAR · OPERACIÓN INDEPENDIENTE</p><h1>Centro de Bar</h1><span>Pedidos, preparación, recetas y control de botellas en una sola estación.</span></div></section><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Turno","Sin apertura"],["Bebidas pendientes","0"],["En preparación","0"],["Stock asignado","Pendiente"]].map(([label,value])=><article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={label}><p className="text-xs font-black uppercase text-park-muted">{label}</p><strong className="mt-3 block text-2xl text-park-dark">{value}</strong></article>)}</section><Alert tone="warning" title="Turno pendiente de apertura">El Superadmin debe abrir el turno y asignar el inventario de Bar. La estación permanecerá en solo lectura hasta entonces.</Alert></main>; }
function Loading({ text }) { return <div className="p-10 text-center text-park-muted">{text}</div>; }
function Failure({ error }) { return <Alert tone="danger" title="No se pudo conectar al ERP">{error?.message || String(error)}</Alert>; }
