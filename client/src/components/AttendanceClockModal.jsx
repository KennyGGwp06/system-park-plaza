import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../services/api";
import { Button } from "./ui/Button";

export function AttendanceClockModal({ active, user, onClose, onRegistered }) {
  const [documentNumber, setDocumentNumber] = useState(String(user?.documentNumber || "").replace(/\D/g, "").slice(0, 8));
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!/^\d{8}$/.test(documentNumber) || !/^\d{4}$/.test(pin)) {
      setError("Ingresa tu DNI de 8 dígitos y tu PIN de asistencia de 4 dígitos.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/attendance/self/clock", { method: "POST", body: { documentNumber, pin } });
      await onRegistered?.(result);
      onClose();
    } catch (cause) {
      setError(cause.message || "No fue posible registrar la asistencia.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm"><form className="w-full max-w-md rounded-card bg-white p-6 shadow-drawer" onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-park-gold">Asistencia personal</p><h2 className="mt-1 text-xl font-black text-park-dark">{active ? "Cerrar turno" : "Iniciar turno"}</h2></div><button className="grid h-9 w-9 place-items-center rounded-button border border-park-border" onClick={onClose} type="button" aria-label="Cerrar"><X size={18}/></button></div><p className="mt-3 text-sm text-park-muted">Confirma tu identidad con tu DNI y el PIN asignado por el Superadmin.</p><div className="mt-5 grid gap-4"><label className="text-sm font-black text-park-dark">DNI<input className="mt-2 h-11 w-full rounded-input border border-park-border px-3 outline-none focus:border-park-green" inputMode="numeric" maxLength={8} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.replace(/\D/g, "").slice(0, 8))} required /></label><label className="text-sm font-black text-park-dark">PIN de asistencia<input className="mt-2 h-11 w-full rounded-input border border-park-border px-3 outline-none focus:border-park-green" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} required autoFocus /></label></div>{error ? <p className="mt-4 rounded-card bg-park-danger-soft p-3 text-sm font-semibold text-park-danger">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" variant="gold" loading={busy}>{active ? "Confirmar salida" : "Confirmar ingreso"}</Button></div></form></div>;
}
