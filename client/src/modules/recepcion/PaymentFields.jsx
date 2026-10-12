// Bloque de cobro de Recepción: método, monto y número de operación. Lo usan el check-in, la salida y
// "Cobros pendientes". El efectivo exige la caja abierta (regla del servidor: attachCashSession).
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, money } from "./rxkit";

export const METHODS = [
  { code: "EFECTIVO", label: "Efectivo", icon: Banknote },
  { code: "YAPE", label: "Yape", icon: Smartphone },
  { code: "PLIN", label: "Plin", icon: Smartphone },
  { code: "TARJETA", label: "Tarjeta", icon: CreditCard }
];

export function PaymentFields({ value, onChange, max, cashOpen, lockAmount = false, hint }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const digital = ["YAPE", "PLIN"].includes(value.method);
  return <div style={{ display: "grid", gap: 10 }}>
    <div className="rx-pay-methods" role="radiogroup" aria-label="Método de pago">
      {METHODS.map(({ code, label, icon: Icon }) => <button key={code} type="button" role="radio" aria-checked={value.method === code} className={value.method === code ? "is-on" : ""} onClick={() => set({ method: code })}><Icon aria-hidden="true" />{label}</button>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: digital ? "1fr 1fr" : "1fr", gap: 10 }}>
      <label className="rx-field"><span>Monto a cobrar{max != null ? ` (máximo ${money(max)})` : ""}</span><input className="rx-input rx-mono" type="number" min="0" step="0.01" value={value.amount} readOnly={lockAmount} onChange={(event) => set({ amount: event.target.value })} /></label>
      {digital ? <label className="rx-field"><span>N.º de operación</span><input className="rx-input rx-mono" inputMode="numeric" value={value.reference} onChange={(event) => set({ reference: event.target.value.replace(/\s/g, "") })} placeholder="Ej. 01234567" /></label> : null}
    </div>
    {value.method === "EFECTIVO" && !cashOpen ? <Alert tone="warn"><b>Tu caja está cerrada.</b> Para recibir efectivo primero ábrela en <Link to="/admin-panel/mi-caja" style={{ fontWeight: 600 }}>Mi caja y cierre</Link>.</Alert> : null}
    {hint ? <Alert tone="info">{hint}</Alert> : null}
  </div>;
}

export function paymentError(value, max) {
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Ingresa un monto mayor a cero.";
  if (max != null && amount > Number(max) + 0.001) return `El monto no puede superar ${money(max)}.`;
  if (["YAPE", "PLIN"].includes(value.method) && !/^\d{4,20}$/.test(String(value.reference || ""))) return "Ingresa el número de operación (4 a 20 dígitos).";
  return "";
}
