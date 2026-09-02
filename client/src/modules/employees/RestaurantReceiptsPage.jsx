import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { Alert, Button, Input, PageHeader } from "../../components/ui";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Toast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const quantity = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 4 });

export function RestaurantReceiptsPage() {
  const { user } = useAuth();
  const areaCode = user?.role === "BARTENDER" ? "BARTENDER" : "RESTAURANTE";
  const areaLabel = areaCode === "BARTENDER" ? "Bar" : "Restaurante";
  const { data: transfers = [], loading, error, reload } = useFetch("/transfers", { initialData: [], realtime: true, pollInterval: 10000 });
  const [selected, setSelected] = useState(null);
  const [received, setReceived] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const pending = useMemo(() => transfers.filter((item) => item.toWarehouseCode === areaCode && item.status === "SENT" && Number(item.sentBy) !== Number(user?.id)), [transfers, user?.id, areaCode]);
  const history = useMemo(() => transfers.filter((item) => item.toWarehouseCode === areaCode && ["RECEIVED", "RECEIVED_WITH_DIFFERENCE"].includes(item.status)).slice(0, 5), [transfers, areaCode]);

  function startReceipt(transfer) {
    setSelected(transfer);
    setReceived(Object.fromEntries((transfer.lines || []).map((line) => [line.id, String(line.sentQuantity ?? line.requestedQuantity ?? 0)])));
    setFailure("");
  }

  async function confirmReceipt(event) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setFailure("");
    try {
      await api(`/transfers/${selected.id}/receive`, { method: "POST", body: { observation: `Recepción confirmada por ${areaLabel}`, lines: selected.lines.map((line) => ({ lineId: line.id, receivedQuantity: Number(received[line.id] || 0) })) } });
      setSelected(null); setMessage(`Insumos recibidos. Ya se incorporaron al stock de ${areaLabel}.`); await reload();
    } catch (cause) { setFailure(cause.message); } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner label={`Revisando insumos enviados a ${areaLabel}...`} />;
  if (error) return <Alert tone="danger" title="No se pudieron cargar las recepciones">{error.message}</Alert>;

  return <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8"><Toast message={message} onClose={() => setMessage("")} /><PageHeader eyebrow={`Inventario · ${areaLabel}`} title="Recibir insumos" description={`Aquí aparecen únicamente los productos que el almacén general envió a ${areaLabel}. Cuenta lo que llegó y confírmalo para incorporarlo a tu stock.`} actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>Actualizar</Button>} />
    {failure ? <Alert tone="danger" title="No se pudo confirmar la recepción">{failure}</Alert> : null}
    <section className="rounded-card border border-park-border bg-park-green-soft p-4 text-sm text-park-dark"><strong>Tu paso diario:</strong> cuando recibas una caja o insumo, entra aquí, compáralo con lo enviado y confirma la cantidad física. No debes crear compras ni transferencias desde {areaLabel}.</section>
    <section><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">PENDIENTE DE TU CONFIRMACIÓN</p><h2 className="text-xl font-black text-park-dark">{pending.length} envío(s) por recibir</h2></div></div>{pending.length ? <div className="grid gap-4 lg:grid-cols-2">{pending.map((transfer) => <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={transfer.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">{transfer.code}</p><h3 className="mt-1 text-lg font-black text-park-dark">Insumos desde {transfer.fromWarehouseName}</h3><p className="mt-1 text-xs text-park-muted">Enviado por {transfer.sentUser?.name || "Almacén"}. Cuenta físicamente antes de confirmar.</p></div><Truck className="text-park-gold" size={24}/></div><div className="mt-4 space-y-2">{transfer.lines.map((line) => <div className="flex items-center justify-between rounded-lg bg-park-bg px-3 py-2 text-sm" key={line.id}><span className="font-semibold text-park-dark">{line.productName}</span><span>{quantity(line.sentQuantity)} {line.unitSymbol}</span></div>)}</div><div className="mt-4 border-t border-park-border pt-4"><Button icon={PackageCheck} onClick={() => startReceipt(transfer)}>Contar y recibir</Button></div></article>)}</div> : <div className="rounded-card border border-dashed border-park-border bg-white p-10 text-center"><CheckCircle2 className="mx-auto text-park-green" size={30}/><h3 className="mt-3 font-black text-park-dark">No tienes insumos pendientes</h3><p className="mt-1 text-sm text-park-muted">Cuando el Super Admin envíe productos desde Almacén general, aparecerán aquí.</p><Button as={Link} className="mt-4" to={areaCode === "BARTENDER" ? "/bartender/inventario/solicitudes" : "/restaurante/inventario/solicitudes"}>Solicitar insumos</Button></div>}</section>
    {history.length ? <section><p className="text-xs font-black uppercase tracking-wide text-park-gold">ÚLTIMAS RECEPCIONES</p><div className="mt-3 grid gap-3 md:grid-cols-2">{history.map((transfer) => <article className="rounded-card border border-park-border bg-white p-4" key={transfer.id}><strong className="text-park-dark">{transfer.code}</strong><p className="mt-1 text-sm text-park-muted">{transfer.fromWarehouseName} → {areaLabel} · confirmado</p></article>)}</div></section> : null}
    {selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form className="w-full max-w-2xl rounded-card bg-white p-6 shadow-xl" onSubmit={confirmReceipt}><p className="text-xs font-black uppercase tracking-wide text-park-gold">{selected.code}</p><h2 className="mt-1 text-xl font-black text-park-dark">Confirma lo que realmente llegó</h2><p className="mt-1 text-sm text-park-muted">Si la cantidad es distinta, registra lo que contaste; el sistema deja la diferencia registrada.</p><div className="mt-5 space-y-3">{selected.lines.map((line) => <div className="grid gap-3 rounded-lg border border-park-border p-3 md:grid-cols-[1fr_180px]"><div><strong className="text-sm text-park-dark">{line.productName}</strong><p className="text-xs text-park-muted">Enviado: {quantity(line.sentQuantity)} {line.unitSymbol}</p></div><Input label={`Recibido (${line.unitSymbol})`} type="number" min="0" step="any" value={received[line.id] ?? ""} onChange={(event) => setReceived({ ...received, [line.id]: event.target.value })} required /></div>)}</div><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setSelected(null)}>Cancelar</Button><Button type="submit" loading={saving} icon={CheckCircle2}>Confirmar recepción</Button></div></form></div> : null}
  </main>;
}
