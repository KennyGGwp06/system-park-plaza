import { useState, useEffect } from "react";
import { PageHeader, Button } from "../../components/ui";
import { api } from "../../services/api";
import { DollarSign, CreditCard, Smartphone, Check, X, Wallet, TrendingUp, AlertCircle } from "lucide-react";
import clsx from "clsx";

export function CentralCashRegister() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyClosing, setDailyClosing] = useState(null);
  const [showClosing, setShowClosing] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadPayments();
    const refreshId = window.setInterval(loadPayments, 15000);
    return () => window.clearInterval(refreshId);
  }, []);

  async function loadPayments() {
    try {
      const [data, closing] = await Promise.all([api("/pagos"), api("/caja/cierre-diario")]);
      setPayments(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setDailyClosing(closing);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function closeDailyCash(event) {
    event.preventDefault();
    setClosingBusy(true);
    try {
      await api("/caja/cierre-diario", { method: "POST", body: { actualCash: Number(actualCash), notes } });
      setShowClosing(false); setActualCash(""); setNotes(""); setMessage("Caja diaria cerrada y registrada en auditoría.");
      await loadPayments();
    } catch (error) { setMessage(error.message); }
    finally { setClosingBusy(false); }
  }

  const kpis = {
    total: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    yape: payments.filter(p => ["YAPE", "PLIN"].includes(p.method)).reduce((sum, p) => sum + Number(p.amount), 0),
    efectivo: payments.filter(p => p.method === "EFECTIVO").reduce((sum, p) => sum + Number(p.amount), 0),
    pos: payments.filter(p => ["TARJETA", "POS"].includes(p.method)).reduce((sum, p) => sum + Number(p.amount), 0),
  };

  const getMethodIcon = (method) => {
    if (method === "EFECTIVO") return <DollarSign size={20} className="text-emerald-500" />;
    if (["YAPE", "PLIN"].includes(method)) return <Smartphone size={20} className="text-purple-500" />;
    return <CreditCard size={20} className="text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        eyebrow="Finanzas" 
        title="Caja Centralizada" 
        description="Control del dueño sobre ingresos, métodos de pago y cierre diario auditado." 
        actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={loadPayments} disabled={loading}>Actualizar</Button>{dailyClosing?.closure ? <Button variant="secondary" disabled>Caja cerrada</Button> : <Button onClick={() => setShowClosing(true)}>Cerrar caja de hoy</Button>}</div>}
      />

      {message ? <div className={`rounded-xl border p-3 text-sm font-bold ${message.startsWith("Caja") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</div> : null}
      {dailyClosing?.closure ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Cierre diario registrado · {dailyClosing.date}</p><p className="mt-1 font-black text-slate-900">Efectivo esperado S/ {Number(dailyClosing.closure.expectedCash || 0).toFixed(2)} · contado S/ {Number(dailyClosing.closure.actualCash || 0).toFixed(2)}</p>{Number(dailyClosing.closure.variance || 0) !== 0 ? <p className="mt-1 text-sm text-amber-800">Diferencia registrada: S/ {Number(dailyClosing.closure.variance).toFixed(2)}</p> : <p className="mt-1 text-sm text-emerald-700">Cuadre sin diferencias.</p>}</div><Check className="text-emerald-600" size={28}/></div></section> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Caja abierta.</strong> Al terminar la jornada, cuenta el efectivo físico y registra el cierre. Los pagos digitales quedan separados del efectivo.</section>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4 bg-gradient-to-br from-teal-500/10 to-teal-600/5 border-teal-500/20">
          <div className="p-3 bg-teal-500/20 text-teal-600 rounded-xl">
            <Wallet size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-teal-600/80">Ingreso Total</p>
            <p className="text-2xl font-black text-teal-700">S/ {kpis.total.toFixed(2)}</p>
          </div>
        </Card>
        
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
            <Smartphone size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Billeteras Digitales</p>
            <p className="text-2xl font-bold text-slate-800">S/ {kpis.yape.toFixed(2)}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
            <DollarSign size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Efectivo Físico</p>
            <p className="text-2xl font-bold text-slate-800">S/ {kpis.efectivo.toFixed(2)}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <CreditCard size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Tarjetas (POS)</p>
            <p className="text-2xl font-bold text-slate-800">S/ {kpis.pos.toFixed(2)}</p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">Registro de Operaciones (Tiempo Real)</h2>
          <Button variant="secondary" size="sm" onClick={loadPayments} disabled={loading}>
            Actualizar
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-4 font-semibold text-slate-500">Fecha y Hora</th>
                <th className="p-4 font-semibold text-slate-500">Referencia / Concepto</th>
                <th className="p-4 font-semibold text-slate-500">Área</th>
                <th className="p-4 font-semibold text-slate-500">Método</th>
                <th className="p-4 font-semibold text-slate-500">Estado</th>
                <th className="p-4 font-semibold text-slate-500 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">Cargando operaciones...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">No hay pagos registrados hoy.</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-slate-600">
                      {new Date(payment.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-slate-800">{payment.concept || "Pago"}</p>
                      {payment.reference && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5">Ref: {payment.reference}</p>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {payment.area || "RECEPCION"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getMethodIcon(payment.method)}
                        <span className="font-medium">{payment.method}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={clsx("px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-max",
                        payment.status === "APROBADO" ? "bg-emerald-100 text-emerald-700" :
                        payment.status === "PENDIENTE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      )}>
                        {payment.status === "APROBADO" ? <Check size={14} /> : 
                         payment.status === "PENDIENTE" ? <AlertCircle size={14} /> : <X size={14} />}
                        {payment.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-bold text-slate-800 text-lg">
                        S/ {Number(payment.amount).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {showClosing ? <ClosingModal expectedCash={dailyClosing?.expectedCash || 0} digitalPayments={dailyClosing?.digitalPayments || 0} actualCash={actualCash} setActualCash={setActualCash} notes={notes} setNotes={setNotes} busy={closingBusy} onClose={() => setShowClosing(false)} onSubmit={closeDailyCash} /> : null}
    </div>
  );
}

function ClosingModal({ expectedCash, digitalPayments, actualCash, setActualCash, notes, setNotes, busy, onClose, onSubmit }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-drawer" onSubmit={onSubmit}><h2 className="text-2xl font-black text-slate-900">Cerrar caja diaria</h2><p className="mt-2 text-sm text-slate-600">Cuenta el efectivo físico antes de confirmar. Este registro queda auditado y no modifica pagos ya emitidos.</p><div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between gap-3"><span>Efectivo esperado</span><strong>S/ {Number(expectedCash).toFixed(2)}</strong></div><div className="flex justify-between gap-3"><span>Pagos digitales aprobados</span><strong>S/ {Number(digitalPayments).toFixed(2)}</strong></div></div><label className="mt-4 block text-sm font-bold text-slate-800">Efectivo físico contado<input className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg font-black outline-none focus:border-blue-500" type="number" min="0" step="0.01" required autoFocus value={actualCash} onChange={(event) => setActualCash(event.target.value)} placeholder="0.00" /></label><label className="mt-4 block text-sm font-bold text-slate-800">Observación <span className="font-normal text-slate-500">(opcional)</span><textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal outline-none focus:border-blue-500" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Fondo fijo incluido, diferencia explicada..." /></label><div className="mt-6 flex gap-2"><Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button><Button type="submit" className="flex-1" loading={busy}>Confirmar cierre</Button></div></form></div>;
}

function Card({ className, children }) {
  return (
    <div className={clsx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}
