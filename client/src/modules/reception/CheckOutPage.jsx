import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CreditCard, LogOut, Search, WalletCards } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Toast } from "../../components/Toast";
import { Button, Input, PageHeader, Tabs } from "../../components/ui";
import { formatHotelDate as date, isHotelToday as isToday } from "../../utils/hotelDate";

function CheckInOutNav() {
  const { pathname } = useLocation();
  return (
    <div className="flex bg-park-bg rounded-input p-1 w-max mb-5 border border-park-border">
      <Link to="/checkin" className={`px-4 py-1.5 rounded text-sm font-bold ${pathname === '/checkin' ? 'bg-white shadow text-park-black' : 'text-park-muted hover:text-park-dark'}`}>Check-in (Entradas)</Link>
      <Link to="/checkout" className={`px-4 py-1.5 rounded text-sm font-bold ${pathname === '/checkout' ? 'bg-white shadow text-park-black' : 'text-park-muted hover:text-park-dark'}`}>Check-out (Salidas)</Link>
    </div>
  );
}

export function CheckOutPage() {
  const { data, loading, reload } = useFetch("/checkout/stays", { initialData: [] });
  const { data: dashboard } = useFetch("/dashboard", { initialData: { metrics: {} } });
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [payments, setPayments] = useState({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("TODOS");

  async function requestInspection(stay) {
    setError("");
    try {
      await api("/checkout/inspect", { method: "POST", body: { stayId: stay.id } });
      setToast("Inspección de habitación solicitada a limpieza.");
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const rows = useMemo(() => (data || []).filter((stay) => {
    const text = `${stay.client?.firstName} ${stay.client?.lastName} ${stay.client?.documentNumber} ${stay.room?.number}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesTab = tab === "HOY" ? isToday(stay.reservation?.checkOutDate) : tab === "PENDIENTES" ? getBalance(stay) > 0 : true;
    return matchesSearch && matchesTab;
  }), [data, search, tab]);

  const counters = useMemo(() => ({
    today: (data || []).filter((stay) => isToday(stay.reservation?.checkOutDate)).length,
    pending: (data || []).filter((stay) => getBalance(stay) > 0).length,
    completed: dashboard?.metrics?.checkOutsToday || 0
  }), [data, dashboard]);

  async function finish(stay) {
    setError("");
    try {
      const total = getTotal(stay);
      const paid = getPaid(stay);
      const amount = Number(payments[stay.id] ?? Math.max(0, total - paid));
      await api("/checkout", { method: "POST", body: { stayId: stay.id, paymentAmount: amount, paymentMethod: "EFECTIVO" } });
      setToast("Check-out finalizado con éxito.");
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="hotel-modern space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <CheckInOutNav />
      <PageHeader
        eyebrow="Recepcion"
        title="Check-out (Salidas)"
        description="Revisa cuenta, pagos y consumos antes de enviar la habitacion a limpieza."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <CompactMetric icon={LogOut} label="Salidas hoy" value={counters.today} />
        <CompactMetric icon={WalletCards} label="Pendientes de pago" value={counters.pending} tone="gold" />
        <CompactMetric icon={CreditCard} label="Completados hoy" value={counters.completed} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input className="md:w-96" placeholder="Buscar por habitacion, DNI o huesped" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button icon={Search} variant="secondary" type="button">Buscar</Button>
        </div>
        {error ? <p className="mt-3 rounded-card bg-park-danger-soft p-3 font-semibold text-park-danger">{error}</p> : null}
      </section>

      <Tabs
        tabs={[
          { value: "HOY", label: `Salidas hoy (${counters.today})` },
          { value: "PENDIENTES", label: `Pendientes (${counters.pending})` },
          { value: "TODOS", label: "Todas" }
        ]}
        value={tab}
        onChange={setTab}
      />

      <section className="grid gap-4">
        {rows.map((stay) => {
          const total = getTotal(stay);
          const paid = getPaid(stay);
          const balance = Math.max(0, total - paid);
          return (
            <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={stay.id}>
              <div className="grid gap-4 xl:grid-cols-[120px_1fr_1fr_1fr_auto] xl:items-center">
                <div className="rounded-card bg-park-green-soft px-4 py-3 text-center text-park-green">
                  <strong className="block font-display text-[28px] font-semibold">{stay.room.number}</strong>
                  <span className="text-xs font-semibold">{stay.room.type?.name}</span>
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-park-black">{stay.client.firstName} {stay.client.lastName}</h2>
                  <p className="text-sm text-park-muted">DNI: {stay.client.documentNumber}</p>
                  <p className="mt-1 text-xs text-park-muted">Entrada: {date(stay.checkInAt)} | Salida: {date(stay.reservation.checkOutDate)}</p>
                  {stay.expressCheckout && (
                    <div className="mt-2 rounded bg-park-gold-soft px-2 py-1 inline-block text-xs font-bold text-park-gold-deep">
                      🚀 SALIDA EXPRESS ({stay.expressCheckoutMethod}) {stay.expressCheckoutCode && ` - Ref: ${stay.expressCheckoutCode}`}
                    </div>
                  )}
                </div>
                <div className="rounded-card border border-park-border p-4 text-sm">
                  <p className="mb-2 font-semibold text-park-black">Detalle de cuenta</p>
                  <Line label={`Hospedaje (${nights(stay.reservation)} noches)`} value={money(stay.reservation.totalPrice)} />
                  <Line label="Consumos" value={money(stay.consumptions.reduce((sum, item) => sum + Number(item.amount || item.total), 0))} />
                  <Line label="Total" value={money(total)} strong />
                </div>
                <div className="rounded-card border border-park-border p-4 text-sm">
                  <p className="mb-2 font-semibold text-park-black">Pagos</p>
                  <Line label="Pagado" value={money(paid)} />
                  <Line label="Saldo pendiente" value={money(balance)} danger={balance > 0} strong />
                  <Input className="mt-3" type="number" value={payments[stay.id] ?? balance} onChange={(event) => setPayments({ ...payments, [stay.id]: event.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  {!stay.checkoutTask ? (
                    <Button onClick={() => requestInspection(stay)} type="button">Solicitar inspección de cuarto</Button>
                  ) : stay.checkoutTask.status !== "FINALIZADA" ? (
                    <Button disabled variant="secondary" type="button">Esperando revisión de Limpieza...</Button>
                  ) : (
                    <Button onClick={() => finish(stay)} type="button">Finalizar check-out</Button>
                  )}
                  <Button variant="secondary" type="button">Ver consumos</Button>
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length ? <p className="rounded-card border border-park-border bg-white p-6 text-center text-park-muted shadow-card">No hay estadias activas para este filtro.</p> : null}
      </section>
    </div>
  );
}

function getTotal(stay) {
  const lodging = Number(stay.reservation.totalPrice);
  const consumptions = stay.consumptions.reduce((sum, item) => sum + Number(item.amount), 0);
  return lodging + consumptions;
}

function getPaid(stay) {
  return stay.payments.reduce((sum, item) => sum + Number(item.amount), 0);
}

function getBalance(stay) {
  return Math.max(0, getTotal(stay) - getPaid(stay));
}

function CompactMetric({ icon: Icon, label, value, tone = "green" }) {
  const toneClass = tone === "gold" ? "bg-park-gold-soft text-park-gold" : "bg-park-green-soft text-park-green";
  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-card ${toneClass}`}><Icon size={20} /></span>
        <div>
          <p className="text-sm font-semibold text-park-muted">{label}</p>
          <strong className="font-display text-2xl font-semibold text-park-dark">{value}</strong>
        </div>
      </div>
    </article>
  );
}

function Line({ label, value, strong, danger }) {
  return (
    <p className={`flex justify-between gap-4 py-1 ${strong ? "font-semibold" : ""}`}>
      <span className="text-park-muted">{label}</span>
      <span className={danger ? "text-park-danger" : "text-park-black"}>{value}</span>
    </p>
  );
}

function money(value) {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nights(reservation) {
  const start = new Date(reservation.checkInDate);
  const end = new Date(reservation.checkOutDate);
  return Math.max(1, Math.round((end - start) / 86400000));
}
