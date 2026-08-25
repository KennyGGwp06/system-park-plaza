import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bell, BellOff, Boxes, CheckCircle2,
  ClipboardCheck, Clock, Droplets, RefreshCw,
  Trash2, Wine, X, BookOpen, Utensils
} from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, Input, PageHeader, Select } from "../../components/ui";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Toast } from "../../components/Toast";
import { OperationalRecipeManual } from "../../components/OperationalRecipeManual";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const qty = (v) => Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const qtyS = (v) => Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: 1 });
const unitSummary = (rows = [], key) => rows.map((row) => `${qty(row[key])} ${row.unit}`).join(" · ") || "sin movimientos";

export function BarStationPage({ view = "DASHBOARD" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [prevPending, setPrevPending] = useState(-1);
  const audioRef = useRef(null);

  const { data: refsData = { stock: [], wasteCategories: [], warehouses: [] }, loading, reload: reloadRefs } =
    useFetch("/operational-inventory/references", { initialData: { stock: [], wasteCategories: [], warehouses: [] }, cacheTime: 60000, pollInterval: 10000 });
  const { data: sessionsData = [], reload: reloadSessions } =
    useFetch("/operational-inventory/sessions?area=BARTENDER", { initialData: [] });
  const refs = refsData && typeof refsData === "object" && !Array.isArray(refsData)
    ? { ...refsData, stock: Array.isArray(refsData.stock) ? refsData.stock : [], wasteCategories: Array.isArray(refsData.wasteCategories) ? refsData.wasteCategories : [], warehouses: Array.isArray(refsData.warehouses) ? refsData.warehouses : [] }
    : { stock: [], wasteCategories: [], warehouses: [] };
  const sessions = Array.isArray(sessionsData) ? sessionsData : [];
  // El Bar no trabaja por "día" sino por relevo. Un turno abierto a las
  // 22:00 sigue siendo el activo después de medianoche hasta su cierre físico.
  const active = useMemo(() => sessions.find((s) => ["OPEN", "OPERATING", "COUNTING", "REOPENED", "PENDING"].includes(s.status)) || null, [sessions]);
  const operationalReady = ["OPEN", "OPERATING", "REOPENED"].includes(active?.status);
  const { data: detail, reload: reloadDetail } = useFetch(
    active ? `/operational-inventory/sessions/${active.id}` : "/operational-inventory/sessions/0",
    { enabled: Boolean(active), initialData: null }
  );
  const { data: ordersData = [], error: ordersError, reload: reloadOrders } = useFetch("/bartender", { initialData: [], pollInterval: 1500 });
  const { data: bottlesData = [] } = useFetch("/bar/bottles", { initialData: [] });
  const orders = Array.isArray(ordersData) ? ordersData.filter((order) => order && typeof order === "object") : [];
  const bottles = Array.isArray(bottlesData) ? bottlesData.filter((bottle) => bottle && typeof bottle === "object") : [];

  // La barra recibe alerta únicamente por pedidos con pago confirmado.
  const pending = orders.filter((o) => o.status === "PENDIENTE" && o.paymentStatus === "PAGADO");
  const preparing = orders.filter((o) => ["EN_PREPARACION", "PREPARANDO"].includes(o.status));
  const ready = orders.filter((o) => o.status === "LISTO");

  function playBell() {
    try {
      const ctx = audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioRef.current = ctx;
      [0, 0.2, 0.4].forEach((d) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = 660; osc.type = "sine";
        g.gain.setValueAtTime(0.35, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.25);
        osc.start(ctx.currentTime + d); osc.stop(ctx.currentTime + d + 0.3);
      });
    } catch { }
  }

  useEffect(() => {
    if (soundEnabled && prevPending >= 0 && pending.length > prevPending) playBell();
    setPrevPending(pending.length);
  }, [pending.length]); // eslint-disable-line

  const refresh = useCallback(async () => {
    await Promise.all([reloadRefs(), reloadSessions(), reloadDetail(), reloadOrders()]);
  }, [reloadRefs, reloadSessions, reloadDetail, reloadOrders]);

  async function act(path, body, msg) {
    setBusy(true); setError("");
    try { await api(path, { method: "POST", body }); await refresh(); setToast(msg); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function openTurn() {
    setBusy(true); setError("");
    try {
      if (active && active.status !== "PENDING") throw new Error(`Ya tienes un turno ${active.shift} en estado ${active.statusLabel || active.status}. Debe cerrarse antes de abrir uno nuevo.`);
      const session = active?.status === "PENDING" ? active : await api("/operational-inventory/sessions", { method: "POST", body: { area: "BARTENDER" } });
      await api(`/operational-inventory/sessions/${session.id}/open`, { method: "POST", body: { openingCounts: openingCounts() } });
      await refresh(); setToast("Turno de bar abierto. Ya puedes atender pedidos.");
    } catch (e) { setError(e.message || "No se pudo abrir el turno de bar."); }
    finally { setBusy(false); }
  }

  async function changeStatus(orderId, status, extra = {}) {
    setBusy(true); setError("");
    try {
      await api(`/bartender/${orderId}/status`, { method: "PATCH", body: { status, ...extra } });
      await reloadOrders();
      const msgs = { EN_PREPARACION: "Pedido aceptado.", PREPARANDO: "Preparando bebida.", LISTO: "Listo para entregar.", ENTREGADO: "Entregado. Insumos descontados.", CANCELADO: "Pedido cancelado." };
      setToast(msgs[status] || "Actualizado.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const stockLines = detail?.lines || refs.stock.filter((x) => x.area === "BARTENDER");
  const lowStock = stockLines.filter((x) => {
    const av = Number(x.expectedQuantity ?? x.onHand);
    const mn = Number(x.minimumStock ?? x.minStock ?? 0);
    return mn > 0 ? av <= mn : av <= 0;
  });

  const openingCounts = () =>
    refs.stock.filter((x) => Number(x.warehouseId) === Number(refs.warehouses?.find((w) => w.area === "BARTENDER")?.id))
      .map((x) => ({ productId: x.productId, lotId: x.lotId, quantity: Number(x.onHand) }));

  if (loading) return <LoadingSpinner />;

  const titleMap = {
    DASHBOARD: "Dashboard de Bar",
    PEDIDOS: "Pedidos de Bebidas",
    INVENTARIO: "Insumos de Bar",
    RECETAS: "Manual de Bebidas",
    MERMAS: "Registro de Mermas",
    CIERRE: "Cierre de Turno"
  };

  return (
    <div className="space-y-4">
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow="Estación de Bar" title={titleMap[view] || "Bar"} description="Módulo independiente del sistema central." />
        <div className="flex gap-2 mt-1">
          <button onClick={() => setSoundEnabled((v) => !v)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${soundEnabled ? "bg-park-green text-white" : "bg-park-bg border border-park-border text-park-muted"}`}>
            {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />} {soundEnabled ? "Alerta ON" : "Alerta OFF"}
          </button>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg border border-park-border bg-white px-3 py-2 text-xs font-bold text-park-dark">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      <TurnBanner active={active} detail={detail} pendingCount={pending.length} lowCount={lowStock.length} openBottles={bottles.filter((b) => b.status === "OPEN").length} />

      {error ? <Alert tone="danger" title="No se pudo actualizar el turno">{error} La estación conserva los últimos datos válidos.</Alert> : null}
      {ordersError ? <Alert tone="danger" title="No se pudieron cargar los pedidos">{ordersError.message} La estación reintentará automáticamente.</Alert> : null}

      {view === "DASHBOARD" && <DashboardTab pending={pending} preparing={preparing} ready={ready} orders={orders} detail={detail} active={active} blockedByPriorShift={null} busy={busy} stockLines={stockLines} lowStock={lowStock} bottles={bottles} onStartTurn={openTurn} onOpenTurn={openTurn} />}
      {view === "PEDIDOS" && <PedidosTab pending={pending} preparing={preparing} ready={ready} busy={busy} operationalReady={operationalReady} blockedByPriorShift={null} onStatus={changeStatus} onRefresh={reloadOrders} />}
      {view === "INVENTARIO" && <InventarioTab stockLines={stockLines} lowStock={lowStock} detail={detail} bottles={bottles} />}
      {view === "RECETAS" && <OperationalRecipeManual area="BARTENDER" />}
      {view === "MERMAS" && <MermasTab detail={detail} refs={refs} busy={busy} act={act} />}
      {view === "CIERRE" && <CierreTab detail={detail} active={active} busy={busy} act={act} />}
    </div>
  );
}

function TurnBanner({ active, detail, pendingCount, lowCount, openBottles }) {
  const statusLabel = { PENDING: "Pendiente de apertura", OPEN: "Turno abierto", COUNTING: "En conteo fisico", SUBMITTED: "Cierre enviado", CLOSED: "Cerrado" };
  return (
    <section className={`rounded-card p-4 text-white ${active ? "bg-park-dark" : "bg-slate-600"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-park-gold">Estado del turno - Bar</p>
          <strong className="text-xl">{active ? `${active.shift} - ${statusLabel[active.status] || active.status}` : "Sin turno activo"}</strong>
          <p className="mt-0.5 text-sm text-slate-300">{detail ? `Esperado: ${unitSummary(detail.totalsByUnit,"expected")} · Consumo teórico: ${unitSummary(detail.totalsByUnit,"theoreticalConsumption")}` : "Abre el turno para ver el inventario de bar."}</p>
        </div>
        <div className="flex gap-4 text-center">
          {pendingCount > 0 && <div><p className="text-2xl font-black text-red-400 animate-pulse">{pendingCount}</p><p className="text-xs text-slate-300">Nuevos</p></div>}
          {openBottles > 0 && <div><p className="text-2xl font-black text-amber-400">{openBottles}</p><p className="text-xs text-slate-300">Botellas abiertas</p></div>}
          {lowCount > 0 && <div><p className="text-2xl font-black text-red-400">{lowCount}</p><p className="text-xs text-slate-300">Stock critico</p></div>}
        </div>
      </div>
    </section>
  );
}

function DashboardTab({ pending, preparing, ready, orders, active, blockedByPriorShift, busy, lowStock, bottles, onStartTurn, onOpenTurn }) {
  const delivered = orders.filter((o) => o.status === "ENTREGADO");
  const openBottles = bottles.filter((b) => b.status === "OPEN");
  return (
    <div className="space-y-4">
      {!active && !blockedByPriorShift && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-4 shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
            <div><h2 className="font-black text-amber-900">Turno de bar</h2><p className="text-sm text-amber-800 mt-1">Confirma el inventario inicial para empezar a atender pedidos.</p>
              <Button className="mt-3" loading={busy} onClick={onStartTurn}>Abrir turno</Button></div>
          </div>
        </div>
      )}
      {active?.status === "PENDING" && !blockedByPriorShift && (
        <div className="rounded-card border border-blue-200 bg-blue-50 p-4 shadow-card">
          <div className="flex items-start gap-3">
            <Clock size={20} className="mt-0.5 shrink-0 text-blue-600" />
            <div><h2 className="font-black text-blue-900">Confirma el inventario de apertura</h2><p className="text-sm text-blue-800 mt-1">Verifica los licores e insumos y abre el turno.</p>
              <Button className="mt-3" loading={busy} onClick={onOpenTurn}>Abrir turno</Button></div>
          </div>
        </div>
      )}
      {active && [...pending, ...preparing, ...ready].length > 0 ? (
        <section className={`rounded-card border p-4 shadow-card ${pending.length ? "border-red-200 bg-red-50" : preparing.length ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-wide text-park-muted">Tu siguiente acción</p><h2 className="text-lg font-black text-park-dark">{pending.length ? `${pending.length} pedido${pending.length === 1 ? "" : "s"} nuevo${pending.length === 1 ? "" : "s"} por atender` : preparing.length ? `${preparing.length} bebida${preparing.length === 1 ? "" : "s"} en preparación` : `${ready.length} pedido${ready.length === 1 ? "" : "s"} listo${ready.length === 1 ? "" : "s"} para entregar`}</h2><p className="mt-1 text-sm text-park-muted">Abre una sola lista operativa: acepta, consulta receta, prepara y confirma entrega.</p></div><Button as={Link} to="/bartender/pedidos" className="shrink-0" variant={pending.length ? "danger" : "primary"}>{pending.length ? "Atender pedidos" : preparing.length ? "Continuar preparación" : "Confirmar entrega"}</Button>
          </div>
        </section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Nuevos pedidos", pending.length, "text-red-600", "bg-red-50 border-red-200"], ["Preparando", preparing.length, "text-amber-600", "bg-amber-50 border-amber-200"], ["Listos", ready.length, "text-blue-600", "bg-blue-50 border-blue-200"], ["Entregados hoy", delivered.length, "text-park-green", "bg-park-green-soft border-park-green/20"]].map(([l, v, c, b]) => (
          <article key={l} className={`rounded-card border p-4 shadow-card ${b}`}>
            <p className={`text-3xl font-black ${c} ${l === "Nuevos pedidos" && v > 0 ? "animate-pulse" : ""}`}>{v}</p>
            <p className="mt-1 text-sm font-semibold text-park-dark">{l}</p>
          </article>
        ))}
      </div>
      {openBottles.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-4 shadow-card">
          <h2 className="font-black text-amber-900 mb-3 flex items-center gap-2"><Wine size={16} /> {openBottles.length} botella{openBottles.length !== 1 ? "s" : ""} abierta{openBottles.length !== 1 ? "s" : ""}</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {openBottles.slice(0, 6).map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-lg bg-white p-2 border border-amber-100">
                <div className="h-8 w-8 rounded bg-amber-100 flex items-center justify-center text-amber-600 font-black text-xs shrink-0">{(b.productName || "?")[0]}</div>
                <div><p className="text-xs font-black text-amber-900">{b.productName}</p><p className="text-xs text-amber-700">{qtyS(b.expectedMl)} ml restantes</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 shadow-card">
          <h2 className="font-black text-red-800 mb-3 flex items-center gap-2"><AlertTriangle size={16} /> {lowStock.length} insumo{lowStock.length !== 1 ? "s" : ""} con stock critico</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lowStock.map((x) => (
              <div key={`${x.productId}:${x.lotId || ""}`} className="flex items-center gap-2 rounded-lg bg-white p-2 border border-red-100">
                {x.imageUrl ? <img src={x.imageUrl} alt={x.productName} className="h-8 w-8 rounded object-cover shrink-0" /> : <div className="h-8 w-8 rounded bg-red-100 flex items-center justify-center text-red-500 text-xs font-black shrink-0">{(x.productName || "?")[0]}</div>}
                <div><p className="text-xs font-black text-red-900">{x.productName}</p><p className="text-xs text-red-600">{qty(x.expectedQuantity ?? x.onHand)} {x.unitSymbol}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {[...pending, ...preparing, ...ready].length > 0 ? (
        <div className="rounded-card border border-park-border bg-white p-4 shadow-card">
          <div className="flex items-center justify-between mb-3"><h2 className="font-black text-park-dark">Pedidos activos</h2></div>
          <div className="space-y-2">
            {[...pending, ...preparing, ...ready].slice(0, 5).map((o) => {
              const elapsed = Math.floor((Date.now() - new Date(o.createdAt || Date.now())) / 60000);
              const statusLabel = { PENDIENTE: "Nuevo", EN_PREPARACION: "Preparando", PREPARANDO: "Preparando", LISTO: "Listo" };
              return (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-park-border bg-park-bg px-3 py-2">
                  <div><span className="text-xs font-black text-park-dark">{o.code} - {o.destination?.label || "Mesa"}</span><p className="text-xs text-park-muted">{(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(", ")}</p></div>
                  <div className="flex items-center gap-2"><span className="text-xs text-park-muted">{elapsed}m</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold border border-park-border">{statusLabel[o.status] || o.status}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      ) : <EmptyState title="Sin pedidos activos" description="Los nuevos pedidos llegaran automaticamente y sonara una alerta." />}
    </div>
  );
}

function PedidosTab({ pending, preparing, ready, busy, operationalReady, blockedByPriorShift, onStatus, onRefresh }) {
  const [cancelModal, setCancelModal] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null);
  const [bucket, setBucket] = useState("ALL");
  const select = (rows) => bucket === "ALL" ? rows : rows.filter((order) => order.operationalBucket === bucket);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-park-dark">Pedidos de bebidas</h2><button onClick={onRefresh} className="flex items-center gap-1.5 rounded-lg border border-park-border bg-white px-3 py-2 text-xs font-bold"><RefreshCw size={13} /> Actualizar</button></div>
      {!operationalReady ? <Alert tone="warning" title={blockedByPriorShift ? "Pedidos bloqueados por turno anterior" : "Pedidos bloqueados hasta abrir el turno"}>{blockedByPriorShift ? `Administración debe cerrar el turno ${blockedByPriorShift.shift} del ${blockedByPriorShift.date} antes de iniciar la operación de hoy.` : "Confirma botellas, licores e insumos desde el Dashboard. Así cada bebida quedará vinculada al inventario correcto."}</Alert> : <Alert tone="info" title="Modo de trabajo guiado">Si estás aprendiendo, usa el icono del libro del producto para consultar medidas exactas, ingredientes y montaje antes de preparar.</Alert>}
      <div className="flex flex-wrap gap-2">{[["ALL","Todos"],["ACTIVE","Activos"],["LATE","Atrasados"],["ABANDONED","Abandonados"]].map(([value,label])=><button key={value} onClick={()=>setBucket(value)} className={`rounded-full px-3 py-1.5 text-xs font-black ${bucket===value?"bg-park-dark text-white":"border border-park-border bg-white text-park-muted"}`}>{label}</button>)}</div>
      <BarOrderColumn title="Nuevos pedidos" badge="red" orders={select(pending)} actionLabel="Aceptar y preparar" actionColor="bg-red-600 hover:bg-red-700 text-white" onAction={(o) => onStatus(o.id, "PREPARANDO")} busy={busy || !operationalReady} onCancel={setCancelModal} onRecipe={setRecipeModal} />
      <BarOrderColumn title="En preparacion" badge="amber" orders={select(preparing)} actionLabel="Marcar listo" actionColor="bg-amber-600 hover:bg-amber-700 text-white" onAction={(o) => onStatus(o.id, "LISTO")} busy={busy || !operationalReady} onCancel={setCancelModal} onRecipe={setRecipeModal} />
      <BarOrderColumn title="Listos para entregar" badge="blue" orders={select(ready)} actionLabel="Confirmar entrega" actionColor="bg-park-green hover:bg-park-green/90 text-white" onAction={(o) => onStatus(o.id, "ENTREGADO")} busy={busy || !operationalReady} onCancel={setCancelModal} onRecipe={setRecipeModal} />
      {cancelModal && <CancelModal order={cancelModal} onClose={() => setCancelModal(null)} onConfirm={async (reason, lossType) => { await onStatus(cancelModal.id, "CANCELADO", { reason, lossType }); setCancelModal(null); }} />}
      {recipeModal && <RecipeModal item={recipeModal} onClose={() => setRecipeModal(null)} />}
    </div>
  );
}

function BarOrderColumn({ title, badge, orders, actionLabel, actionColor, onAction, busy, onCancel, onRecipe }) {
  const colors = { red: "text-red-800", amber: "text-amber-900", blue: "text-blue-900" };
  return (
    <section>
      <h3 className={`mb-2 font-black text-sm ${colors[badge]}`}>{title} <span className="ml-1 rounded-full bg-park-bg border border-park-border px-2 py-0.5 text-xs text-park-dark">{orders.length}</span></h3>
      {orders.length === 0 ? <p className="rounded-lg border border-dashed border-park-border p-4 text-center text-sm text-park-muted">Sin pedidos aqui</p> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {orders.map((o) => <BarOrderCard key={o.id} order={o} actionLabel={actionLabel} actionColor={actionColor} onAction={() => onAction(o)} onCancel={() => onCancel(o)} onRecipe={onRecipe} busy={busy} />)}
        </div>
      )}
    </section>
  );
}

function BarOrderCard({ order, actionLabel, actionColor, onAction, onCancel, onRecipe, busy }) {
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt || Date.now())) / 60000);
  return (
    <article className={`rounded-card border-2 bg-white shadow-card flex flex-col ${elapsed >= 10 ? "border-red-400" : elapsed >= 5 ? "border-amber-400" : "border-park-border"}`}>
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div><p className="text-xs font-bold text-park-muted">{order.code}</p><p className="font-black text-park-dark">{order.destination?.label || "Mesa"}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${order.operationalBucket === "ABANDONED" ? "bg-red-100 text-red-700" : order.operationalBucket === "LATE" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{order.escalationLabel || "En tiempo"}</span></div>
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold shrink-0 ${elapsed >= 10 ? "bg-red-100 text-red-700" : elapsed >= 5 ? "bg-amber-100 text-amber-700" : "bg-park-bg text-park-muted"}`}><Clock size={10} /> {elapsed}m</span>
        </div>
        <ul className="mt-2 space-y-2 flex-1">
          {(order.items || []).map((item, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm">
                <div className="relative shrink-0">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-8 w-8 rounded object-cover border border-park-border" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-park-bg text-xs font-black text-park-muted">{item.name[0]}</div>
                  )}
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-park-green text-[9px] font-black text-white">{item.quantity}</span>
                </div>
                <span className="font-semibold text-park-dark flex-1 leading-tight">{item.name}</span>
                {item.recipe && item.recipe.length > 0 && <button onClick={() => onRecipe(item)} className="p-1.5 rounded bg-park-bg hover:bg-park-border text-park-dark" title="Ver receta técnica"><BookOpen size={16} /></button>}
              </div>
            </li>
          ))}
        </ul>
        {order.notes && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 font-semibold">Nota: {order.notes}</p>}
        {(order.acceptedBy || order.preparedBy || order.readyBy) && <p className="mt-2 text-[11px] text-park-muted">{order.readyBy ? `Listo por ${order.readyBy}` : order.preparedBy ? `Preparando: ${order.preparedBy}` : `Aceptado por ${order.acceptedBy}`}</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={onAction} disabled={busy} className={`flex-1 rounded-button py-2 text-xs font-black transition-colors ${actionColor} disabled:opacity-60`}>{actionLabel}</button>
          <button onClick={onCancel} disabled={busy} className="rounded-button border border-red-200 p-2 text-red-500 hover:bg-red-50" title="Cancelar"><X size={14} /></button>
        </div>
      </div>
    </article>
  );
}

function RecipeModal({ item, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-drawer">
        <div className="flex justify-between items-start mb-4">
          <h2 className="font-black text-park-dark text-lg flex items-center gap-2"><Utensils size={18} /> Receta: {item.name}</h2>
          <button onClick={onClose} className="text-park-muted hover:text-park-dark"><X size={18} /></button>
        </div>
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 mb-4">
          <p className="text-sm text-blue-900 font-medium">
            Los siguientes ingredientes seran descontados automaticamente al confirmar la <b>entrega</b> (por cada porción).
          </p>
        </div>
        <div className="mb-4">
          <h3 className="text-sm font-black text-park-dark mb-2 border-b border-park-border pb-1">Ingredientes por porción:</h3>
          <ul className="space-y-1">
            {item.recipe?.map((line, i) => (
              <li key={i} className="flex justify-between items-center text-sm">
                <span className="text-park-dark">{line.inventoryId} (ID de Insumo)</span>
                <strong className="text-park-green">{qty(line.quantity)} unid. base</strong>
              </li>
            ))}
            {(!item.recipe || item.recipe.length === 0) && <p className="text-xs text-park-muted">No hay receta técnica para este producto.</p>}
          </ul>
        </div>
        <div className="flex justify-end"><Button onClick={onClose}>Entendido</Button></div>
      </div>
    </div>
  );
}

function InventarioTab({ stockLines, lowStock, bottles }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const openBottles = bottles.filter((b) => b.status === "OPEN");
  const filtered = stockLines.filter((x) => {
    if (search && !(x.productName || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "LOW") return lowStock.some((l) => l.productId === x.productId);
    return true;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]"><label className="block text-xs font-bold text-park-muted mb-1">Buscar insumo</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej. vodka, ron, limones..." className="w-full rounded-input border border-park-border px-3 py-2 text-sm" /></div>
        <div className="flex gap-2">
          {[["ALL", "Todos"], ["LOW", `Critico (${lowStock.length})`]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === v ? "bg-park-green text-white" : "bg-park-bg border border-park-border text-park-dark"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-park-border bg-white p-3 shadow-card text-center"><p className="text-2xl font-black text-park-dark">{stockLines.length}</p><p className="text-xs text-park-muted">Insumos totales</p></div>
        <div className={`rounded-card border p-3 shadow-card text-center ${lowStock.length > 0 ? "border-red-200 bg-red-50" : "border-park-border bg-white"}`}><p className={`text-2xl font-black ${lowStock.length > 0 ? "text-red-600" : "text-park-dark"}`}>{lowStock.length}</p><p className="text-xs text-park-muted">Stock critico</p></div>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-3 shadow-card text-center"><p className="text-2xl font-black text-amber-700">{openBottles.length}</p><p className="text-xs text-park-muted">Botellas abiertas</p></div>
      </div>
      {openBottles.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-white p-4 shadow-card">
          <h2 className="font-black text-park-dark mb-3">Botellas abiertas</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {openBottles.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-2">
                <div><p className="text-xs font-black text-park-dark">{b.productName}</p><p className="text-xs text-park-muted">Cod. {b.code}</p></div>
                <div className="text-right"><p className="text-sm font-black text-park-green">{qtyS(b.expectedMl)} ml</p><p className="text-xs text-park-muted">restante</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!filtered.length ? <EmptyState title="Sin insumos" description="Abre el turno o recibe una transferencia para ver el inventario de bar." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => <BarStockCard key={`${item.productId}:${item.lotId || ""}`} item={item} isLow={lowStock.some((l) => l.productId === item.productId)} />)}
        </div>
      )}
    </div>
  );
}

function BarStockCard({ item, isLow }) {
  const available = Number(item.expectedQuantity ?? item.onHand);
  const consumed = Number(item.theoreticalConsumption ?? 0);
  return (
    <article className={`rounded-card border-2 bg-white shadow-card overflow-hidden ${isLow ? "border-red-300" : "border-park-border"}`}>
      <div className="flex items-center gap-3 p-3 border-b border-park-border">
        {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="h-14 w-14 rounded-lg object-cover border border-park-border shrink-0" /> : <div className={`h-14 w-14 rounded-lg flex items-center justify-center text-xl font-black shrink-0 ${isLow ? "bg-red-100 text-red-500" : "bg-park-bg text-park-muted"}`}>{(item.productName || "?")[0]}</div>}
        <div className="min-w-0"><p className="font-black text-park-dark truncate">{item.productName}</p><p className="text-xs text-park-muted">{item.lotCode || "Sin lote"} - {item.unitSymbol}</p>{isLow && <p className="mt-0.5 text-xs font-bold text-red-600">Stock critico</p>}</div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-park-bg p-2"><p className="text-park-muted">Disponible</p><p className={`text-lg font-black ${isLow ? "text-red-600" : "text-park-green"}`}>{qty(available)}</p><p className="text-park-muted">{item.unitSymbol}</p></div>
        <div className="rounded-lg bg-park-bg p-2"><p className="text-park-muted">Consumido hoy</p><p className="text-lg font-black text-park-dark">{qty(consumed)}</p><p className="text-park-muted">{item.unitSymbol}</p></div>
      </div>
    </article>
  );
}

function RecipeManualTab({ refs }) {
  const { data: catalogData, loading } = useFetch("/public/catalog", { initialData: { menu: [] } });
  const [search, setSearch] = useState("");
  
  if (loading) return <LoadingSpinner />;
  
  const menuItems = catalogData.menu?.filter((i) => i.area === "BARTENDER" || i.category === "Bar") || [];
  
  const filtered = menuItems.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getProductName = (invId) => {
    const prd = refs.stock?.find(s => s.productId === invId);
    return prd ? prd.productName : `Insumo ID: ${invId}`;
  };
  const getProductSymbol = (invId) => {
    const prd = refs.stock?.find(s => s.productId === invId);
    return prd ? prd.unitSymbol : "unid.";
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-park-border bg-white p-4 shadow-card">
        <h2 className="font-black text-park-dark mb-1 flex items-center gap-2"><BookOpen size={20} /> Manual de Bebidas</h2>
        <p className="text-sm text-park-muted">Consulta las recetas técnicas y las porciones exactas para preparar las bebidas. El inventario se descuenta automáticamente según esta receta.</p>
      </div>
      <Input placeholder="Buscar bebida por nombre..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? <EmptyState title="Sin recetas" description="No hay recetas técnicas configuradas en el bar." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <article key={item.id} className="rounded-card border border-park-border bg-white shadow-card overflow-hidden flex flex-col">
              <div className="p-3 bg-park-bg border-b border-park-border flex gap-3 items-center">
                {item.image ? <img src={item.image} alt={item.name} className="w-12 h-12 rounded object-cover" /> : <div className="w-12 h-12 bg-white rounded flex items-center justify-center font-black text-park-muted">{(item.name||"?")[0]}</div>}
                <div>
                  <h3 className="font-black text-park-dark">{item.name}</h3>
                  <p className="text-xs text-park-muted">{item.category}</p>
                </div>
              </div>
              <div className="p-4 flex-1">
                <h4 className="text-xs font-bold text-park-muted mb-2 uppercase tracking-wider">Ingredientes por porción</h4>
                {(!item.recipe || item.recipe.length === 0) ? (
                  <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">Esta bebida no tiene una receta técnica configurada. No descontará insumos del inventario de manera automática.</p>
                ) : (
                  <ul className="space-y-2">
                    {item.recipe.map((line, i) => (
                      <li key={i} className="flex justify-between items-center text-sm border-b border-park-border pb-1 last:border-0">
                        <span className="text-park-dark font-medium">{getProductName(line.inventoryId)}</span>
                        <strong className="text-park-green bg-park-green-soft px-2 py-0.5 rounded text-xs">{qty(line.quantity)} {getProductSymbol(line.inventoryId)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function MermasTab({ detail, refs, busy, act }) {
  const [form, setForm] = useState({ key: "", quantity: "", category: "SPILL", observation: "" });
  if (!detail) return <EmptyState title="Primero inicia el turno" description="Las mermas deben pertenecer a un turno abierto." />;
  const lines = detail.lines || [];
  const line = lines.find((x) => `${x.productId}:${x.lotId || ""}` === form.key);
  const categories = [["SPILL", "Derrame"], ["SPOILAGE", "Vencido"], ["BREAKAGE", "Botella/vaso roto"], ["CLEANING", "Limpieza"], ["OTHER", "Otro"]];
  return (
    <form className="rounded-card border border-park-border bg-white p-5 shadow-card space-y-4" onSubmit={(e) => { e.preventDefault(); if (!line || !window.confirm("Confirmar merma?")) return; act(`/operational-inventory/sessions/${detail.id}/waste`, { productId: line.productId, lotId: line.lotId, unitId: line.unitId, quantity: Number(form.quantity), category: form.category, observation: form.observation }, "Merma registrada."); setForm({ key: "", quantity: "", category: "SPILL", observation: "" }); }}>
      <div><h2 className="text-lg font-black text-park-dark">Registrar derrame o merma</h2><p className="text-sm text-park-muted mt-1">Registralo de inmediato para que el cierre sea exacto.</p></div>
      <div><p className="text-xs font-bold text-park-muted mb-2">Motivo rapido</p><div className="flex flex-wrap gap-2">{categories.map(([v, l]) => <button key={v} type="button" onClick={() => setForm({ ...form, category: v })} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${form.category === v ? "bg-park-danger text-white" : "bg-park-bg border border-park-border text-park-dark"}`}>{l}</button>)}</div></div>
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Producto" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required><option value="">Selecciona el insumo</option>{lines.map((x) => <option key={`${x.productId}:${x.lotId || ""}`} value={`${x.productId}:${x.lotId || ""}`}>{x.productName} ({qty(x.expectedQuantity)} {x.unitSymbol} disp.)</option>)}</Select>
        <Input label={`Cantidad${line ? ` (${line.unitSymbol})` : ""}`} type="number" min="0.000001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <div className="md:col-span-2"><Input label="Descripcion del motivo" value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} placeholder="Que ocurrio exactamente" /></div>
      </div>
      <Button loading={busy} disabled={!line || !form.quantity}>Confirmar merma</Button>
    </form>
  );
}

function CierreTab({ detail, active, busy, act }) {
  const [values, setValues] = useState({});
  if (!detail) return <EmptyState title="Sin turno" description="Inicia el turno para poder hacer el cierre." />;
  if (detail.status === "CLOSED") return <div className="rounded-card border border-park-border bg-white p-6 shadow-card text-center"><CheckCircle2 size={40} className="mx-auto text-park-green mb-2" /><h2 className="text-xl font-black text-park-dark">Turno cerrado</h2><p className="text-sm text-park-muted mt-1">El cierre fue aprobado y las diferencias quedaron auditadas.</p></div>;
  if (detail.status === "SUBMITTED") return <div className="rounded-card border border-park-border bg-white p-6 shadow-card text-center"><ClipboardCheck size={40} className="mx-auto text-blue-500 mb-2" /><h2 className="text-xl font-black text-park-dark">Cierre enviado</h2><p className="text-sm text-park-muted mt-1">Administracion revisara y aprobara.</p></div>;
  if (detail.status !== "COUNTING") return <div className="rounded-card border border-park-border bg-white p-6 shadow-card"><h2 className="text-xl font-black text-park-dark">Iniciar conteo fisico</h2><p className="text-sm text-park-muted mt-1">Pesa o mide cada insumo y registra las cantidades reales.</p><Button className="mt-4" loading={busy} onClick={() => act(`/operational-inventory/sessions/${active.id}/start-count`, {}, "Conteo iniciado.")}>Iniciar conteo</Button></div>;
  const lines = detail.lines || [];
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!window.confirm("Enviar conteo? No podras editarlo despues.")) return; act(`/operational-inventory/sessions/${active.id}/submit`, { counts: lines.map((x) => ({ productId: x.productId, lotId: x.lotId, quantity: Number(values[`${x.productId}:${x.lotId || ""}`] ?? x.expectedQuantity) })), notes: "Conteo desde estacion de bar" }, "Conteo enviado."); }}>
      <div className="rounded-card border border-park-border bg-white p-4 shadow-card"><h2 className="font-black text-park-dark">Conteo fisico - Mide cada insumo</h2><p className="text-sm text-park-muted">Ingresa la cantidad real que tienes en el bar ahora mismo.</p></div>
      {lines.map((x) => {
        const k = `${x.productId}:${x.lotId || ""}`;
        const physical = Number(values[k] ?? x.expectedQuantity);
        const diff = physical - Number(x.expectedQuantity);
        return (
          <div key={k} className="grid gap-3 rounded-card border border-park-border bg-white p-4 shadow-card md:grid-cols-[auto_1fr_180px]">
            {x.imageUrl ? <img src={x.imageUrl} alt={x.productName} className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-park-bg flex items-center justify-center text-park-muted font-black">{(x.productName || "?")[0]}</div>}
            <div><strong className="text-park-dark">{x.productName}</strong><p className="text-xs text-park-muted">Esperado: <b>{qty(x.expectedQuantity)}</b> {x.unitSymbol}</p>{values[k] !== undefined && <p className={`text-xs font-bold ${diff < -0.001 ? "text-red-600" : "text-park-green"}`}>{diff >= 0 ? "+" : ""}{qty(diff)} {x.unitSymbol}</p>}</div>
            <Input label="Conteo fisico" type="number" min="0" step="any" value={values[k] ?? x.expectedQuantity} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
          </div>
        );
      })}
      <Button loading={busy}>Enviar conteo y bloquear</Button>
    </form>
  );
}

function CancelModal({ order, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [lossType, setLossType] = useState("WASTE");
  const wasStarted = ["EN_PREPARACION", "PREPARANDO", "LISTO"].includes(order.status);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-drawer">
        <h2 className="font-black text-park-dark text-lg">Cancelar pedido {order.code}</h2>
        <p className="text-sm text-park-muted mt-1">{wasStarted ? "El pedido ya fue aceptado. Indica que paso con los insumos." : "Indica el motivo de cancelacion."}</p>
        {wasStarted && <div className="mt-3"><p className="text-xs font-bold text-park-muted mb-1">Que hago con los insumos?</p><div className="flex gap-2 flex-wrap">{[["WASTE", "Merma/Derrame"], ["INTERNAL_CONSUMPTION", "Consumo interno"], ["LOSS", "Perdida"]].map(([v, l]) => <button key={v} type="button" onClick={() => setLossType(v)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${lossType === v ? "bg-park-danger text-white" : "bg-park-bg border border-park-border text-park-dark"}`}>{l}</button>)}</div></div>}
        <div className="mt-3"><label className="block text-xs font-bold text-park-muted mb-1">Motivo *</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-input border border-park-border px-3 py-2 text-sm" placeholder="Escribe el motivo..." /></div>
        <div className="mt-4 flex gap-2 justify-end"><Button variant="secondary" onClick={onClose}>Volver</Button><Button variant="danger" disabled={reason.trim().length < 5} onClick={() => onConfirm(reason, lossType)}>Confirmar cancelacion</Button></div>
      </div>
    </div>
  );
}
