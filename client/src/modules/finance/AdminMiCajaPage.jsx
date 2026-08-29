import { useState, useEffect } from "react";
import { PageHeader, Button } from "../../components/ui";
import { api } from "../../services/api";
import { DollarSign, Check, AlertCircle } from "lucide-react";
import clsx from "clsx";

export function AdminMiCajaPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const data = await api("/cash-sessions/current");
      setSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openSession() {
    try {
      const data = await api("/cash-sessions", { method: "POST", body: { initialFund: 0 } });
      setSession(data);
      setSuccess("Sesión de caja abierta correctamente.");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitSession(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await api(`/cash-sessions/${session.id}/submit`, {
        method: "POST",
        body: { actualCash: Number(actualCash), notes }
      });
      setSession(data);
      setShowSubmit(false);
      setSuccess("Cierre de caja enviado al Superadmin para revisión.");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        eyebrow="Recepción" 
        title="Mi caja y cierre de turno" 
        description="Cuenta y cierra únicamente el efectivo recibido en tu turno. Yape, Plin, tarjeta y transferencias se registran aparte para el Superadmin."
        actions={<Button variant="secondary" onClick={loadSession} disabled={loading}>Actualizar</Button>}
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{success}</div>}

      {loading ? (
        <div className="p-8 text-center text-slate-500">Cargando estado de caja...</div>
      ) : !session ? (
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <DollarSign size={32} />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900">No tienes una caja abierta</h3>
          <p className="mt-2 text-slate-500">Inicia tu turno de caja.</p>
          <div className="mt-6 flex justify-center">
            <Button onClick={openSession}>Abrir mi caja</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className={clsx("p-6", session.status === "ABIERTA" ? "bg-emerald-50" : session.status === "EN_REVISION" ? "bg-amber-50" : "bg-blue-50")}>
              <div className="flex items-center gap-4">
                <div className={clsx("flex h-12 w-12 items-center justify-center rounded-xl", session.status === "ABIERTA" ? "bg-emerald-200 text-emerald-700" : session.status === "EN_REVISION" ? "bg-amber-200 text-amber-700" : "bg-blue-200 text-blue-700")}>
                  {session.status === "ABIERTA" ? <DollarSign size={24} /> : session.status === "EN_REVISION" ? <AlertCircle size={24} /> : <Check size={24} />}
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Estado de la sesión</p>
                  <p className={clsx("text-xl font-black", session.status === "ABIERTA" ? "text-emerald-700" : session.status === "EN_REVISION" ? "text-amber-700" : "text-blue-700")}>
                    {session.status === "ABIERTA" ? "ABIERTA" : session.status.replace("_", " ")}
                  </p>
                </div>
              </div>
            </div>
            <div className={clsx("grid divide-y md:divide-x md:divide-y-0", session.status === "ABIERTA" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
              <div className="p-6">
                <p className="text-sm font-medium text-slate-500">Fondo Inicial</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">S/ {Number(session.initialFund).toFixed(2)}</p>
              </div>
              {session.status !== "ABIERTA" && (
                <>
                  <div className="p-6">
                    <p className="text-sm font-medium text-slate-500">Esperado</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">S/ {Number(session.expectedCash || 0).toFixed(2)}</p>
                  </div>
                  <div className="p-6">
                    <p className="text-sm font-medium text-slate-500">Contado</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">S/ {Number(session.actualCash || 0).toFixed(2)}</p>
                  </div>
                  <div className="p-6 bg-slate-50">
                    <p className="text-sm font-medium text-slate-500">Diferencia</p>
                    <p className={clsx("mt-1 text-2xl font-bold", session.variance < 0 ? "text-red-600" : session.variance > 0 ? "text-emerald-600" : "text-slate-900")}>
                      {session.variance > 0 ? "+" : ""}S/ {Number(session.variance || 0).toFixed(2)}
                    </p>
                  </div>
                </>
              )}
              {session.status === "ABIERTA" && (
                <div className="p-6">
                  <p className="text-sm font-medium text-slate-500">Apertura</p>
                  <p className="mt-1 text-lg font-medium text-slate-700">{new Date(session.openedAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
          
          {session.status === "ABIERTA" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 md:flex md:items-center md:justify-between md:gap-6">
              <div><p className="font-bold text-amber-950">Antes de cerrar, cuenta solo el efectivo físico.</p><p className="mt-1 text-sm text-amber-800">Los pagos con Yape, Plin, tarjeta o transferencia no entran en tu efectivo contado; el Superadmin los ve en el control central.</p></div>
              <Button className="mt-4 md:mt-0" onClick={() => setShowSubmit(true)}>Cerrar mi caja de turno</Button>
            </div>
          )}
          {session.status === "EN_REVISION" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><strong>Tu cierre fue enviado.</strong> El efectivo contado, la diferencia y tu observación están bloqueados hasta que el Superadmin lo apruebe o rechace.</div>}
        </div>
      )}

      {showSubmit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-drawer" onSubmit={submitSession}>
            <h2 className="text-2xl font-black text-slate-900">Cerrar mi caja de turno</h2>
            <p className="mt-2 text-sm text-slate-600">Cuenta únicamente el efectivo físico que recibiste y envíalo al Superadmin. Los pagos digitales quedan fuera de este arqueo.</p>
            <label className="mt-4 block text-sm font-bold text-slate-800">
              Efectivo físico contado
              <input className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg font-black outline-none focus:border-blue-500" type="number" min="0" step="0.01" required autoFocus value={actualCash} onChange={(event) => setActualCash(event.target.value)} placeholder="0.00" />
            </label>
            <label className="mt-4 block text-sm font-bold text-slate-800">
              Observación <span className="font-normal text-slate-500">(opcional)</span>
              <textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal outline-none focus:border-blue-500" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Diferencia por sencillo, billete falso retenido..." />
            </label>
            <div className="mt-6 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowSubmit(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1" loading={submitting}>Cerrar y enviar al Superadmin</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
