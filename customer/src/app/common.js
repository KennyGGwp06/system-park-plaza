/* common.js: estados de reserva, pases, cuenta y pagos compartidos por todos los servicios. */
import { S, D, A, api, esc, money, fmt, sheet, closeSheet, toast, render, go, loadExp, errText, pill, bindField } from "./core.js";
import { ic } from "./ui.js";

export const SERVICE_NAME = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", BAR: "Bar", EVENTOS: "Eventos" };
export const SERVICE_IMG = { HOSPEDAJE: "/images/hs/hospedaje.webp", PISCINA: "/images/hs/piscina.webp", MIRADOR: "/images/hs/mirador.webp", TERRAZA: "/images/hs/terraza.webp", BAR: "/images/hs/bar.webp", EVENTOS: "/images/hs/eventos.webp" };
export const SERVICE_WIDE = { HOSPEDAJE: "/images/v6/hospedaje-w.webp", PISCINA: "/images/v6/piscina-w.webp", MIRADOR: "/images/v6/mirador-w.webp", TERRAZA: "/images/v6/terraza-w.webp", BAR: "/images/v6/bar-w.webp", EVENTOS: "/images/v6/eventos-w.webp" };
/* Datos del hotel y números de cobro: los configura el dueño en Control del sistema › Configuración general. */
export const hotel = () => catalog().hotel || {};
const phone9 = n => String(n || "").replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
export function payInfo(method) { const h = hotel(), n = method === "PLIN" ? h.plinNumber : method === "YAPE" ? h.yapeNumber : ""; return n ? { num: phone9(n), raw: String(n).replace(/\D/g, ""), holder: h.payHolder || h.name || "Park Plaza" } : null; }
export const digitalPay = () => !!(payInfo("YAPE") || payInfo("PLIN"));
// Si el hotel no publicó el número del método elegido, se pasa al que sí tenga (o a la caja).
export function fixMethod(allowCash = true) { if (S.pay.method === "CAJA HOTEL" && allowCash) return; if (payInfo(S.pay.method)) return; S.pay.method = payInfo("YAPE") ? "YAPE" : payInfo("PLIN") ? "PLIN" : allowCash ? "CAJA HOTEL" : S.pay.method; }
const payChips = (allowCash, attr = "pay-method") => `<div class="chips" role="group">${["YAPE", "PLIN"].map(m => `<button class="chip" type="button" data-a="${attr}" data-v="${m}" aria-pressed="${S.pay.method === m}" ${payInfo(m) ? "" : "disabled title=\"El hotel aún no publica este número\""}>${m === "YAPE" ? "Yape" : "Plin"}</button>`).join("")}${allowCash ? `<button class="chip" type="button" data-a="${attr}" data-v="CAJA HOTEL" aria-pressed="${S.pay.method === "CAJA HOTEL"}">En caja del hotel</button>` : ""}</div>`;
export const payBox = amount => { const p = payInfo(S.pay.method); return p ? `<div class="paybox"><b>${S.pay.method === "YAPE" ? "Yapea" : "Plinea"} ${amount ? money(amount) + " " : ""}a:</b><span class="num">${p.num}</span><span class="mut">${esc(p.holder)} · escribe tu DNI en el mensaje.</span></div>` : `<div class="note warn">El hotel aún no publica su número de Yape o Plin. Paga en la caja del hotel o pide el número en recepción.</div>`; };
export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const catalog = () => D.catalog || { plans: {}, extrasByService: {}, parking: {}, roomTypes: [], restaurantMenu: [], eventSpaces: [], eventEquipment: [], eventLayouts: [], services: [] };
export const planOf = (svc, code) => (catalog().plans[svc] || []).find(p => p.code === code);
export const extrasOf = svc => catalog().extrasByService[svc] || [];
export const parkingRate = type => { const p = catalog().parking || {}; return Number({ MOTO: p.motorcyclePrice, AUTO: p.carPrice, CAMIONETA: p.truckPrice, MINIVAN: p.vanPrice }[type] || 0); };
export const bookingById = id => (D.exp?.bookings || []).find(b => Number(b.id) === Number(id));
export const eventById = id => (D.exp?.events || []).find(e => Number(e.id) === Number(id));

/* ---------- Estado de una reserva (según los datos reales del hotel) ---------- */
export function bstate(b) {
  if (!b) return { k: "none", label: "—", tone: "gray" };
  if (b.status === "CANCELADA") return { k: "cancelled", label: "Cancelada", tone: "bad" };
  if (b.status === "FINALIZADA") return { k: "finished", label: "Finalizada", tone: "gray" };
  if (b.status === "NO_SHOW") return { k: "finished", label: "Vencida · no se usó", tone: "gray" };
  const inside = b.status === "CHECKED_IN" || b.accessStatus === "INGRESO_VALIDADO";
  if (inside && b.serviceCode === "HOSPEDAJE" && b.checkoutRequestedAt) return { k: "checkout_wait", label: "Salida en revisión", tone: "warn" };
  if (inside) return { k: "onsite", label: b.serviceCode === "HOSPEDAJE" ? "En estadía" : "Disfrutando", tone: "ok" };
  if (b.paymentStatus === "PENDIENTE_VERIFICACION") return { k: "verifying", label: "Pago en verificación", tone: "warn" };
  if (b.paymentStatus === "PENDIENTE_CAJA" || b.status === "PENDIENTE_CAJA") return { k: "cash", label: "Pago pendiente en caja", tone: "warn" };
  if (Number(b.balance || 0) > 0.001) return { k: "partial", label: "Saldo pendiente", tone: "warn" };
  return { k: "ready", label: "Confirmada", tone: "ok" };
}
export function estate(e) {
  if (!e) return { k: "none", label: "—", tone: "gray" };
  if (e.status === "CANCELADO") return { k: "cancelled", label: "Cancelado", tone: "bad" };
  if (e.status === "FINALIZADO") return { k: "finished", label: "Finalizado", tone: "gray" };
  if (e.status === "COTIZACION") return { k: "quote", label: "Cotización guardada", tone: "warn" };
  if (e.accessStatus === "INGRESO_VALIDADO") return { k: "onsite", label: "Evento en curso", tone: "ok" };
  if (e.status === "PENDIENTE_CAJA") return { k: "cash", label: "Anticipo pendiente en caja", tone: "warn" };
  if (Number(e.balance || 0) > 0.001) return { k: "reserved", label: "Reservado · saldo pendiente", tone: "ok" };
  return { k: "ready", label: "Confirmado", tone: "ok" };
}
export function allItems() {
  const e = D.exp; if (!e) return [];
  return [...(e.bookings || []).map(b => ({ kind: "B", b, at: b.createdAt })), ...(e.events || []).map(x => ({ kind: "E", e: x, at: x.createdAt }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* ---------- Pases y QR ---------- */
export function passesOf(b) {
  const out = [];
  for (const p of (D.exp?.passes || [])) for (const en of (p.entitlements || [])) if (Number(en.bookingId) === Number(b.id)) out.push({ pass: p, ent: en });
  return out;
}
export const mainPass = b => passesOf(b).find(x => x.ent.serviceCode === b.serviceCode && !x.ent.includedByBundle) || passesOf(b)[0] || null;
export const eventPass = e => { for (const p of (D.exp?.passes || [])) for (const en of (p.entitlements || [])) if (Number(en.eventId) === Number(e.id)) return { pass: p, ent: en }; return null; };
export const qrImg = (code, locked) => `<img class="qr ${locked ? "locked" : ""}" src="/api/public/pass/${encodeURIComponent(code)}/qr" alt="Código QR de tu pase" width="170" height="170">`;

/* ---------- Cuenta ---------- */
export const paymentsOf = b => (D.exp?.payments || []).filter(p => Number(p.bookingId) === Number(b.id) && p.status !== "ANULADO");
export const ordersOf = b => (D.exp?.orders || []).filter(o => Number(o.bookingId) === Number(b.id));
export const eventPaymentsOf = e => (D.exp?.payments || []).filter(p => Number(p.eventId) === Number(e.id) && p.status !== "ANULADO");
export const eventOrdersOf = e => (D.exp?.orders || []).filter(o => Number(o.eventId) === Number(e.id));
export const ORDER_LABEL = { PENDIENTE: ["Recibido", "warn"], ACEPTADO: ["Aceptado", "warn"], EN_COCINA: ["En cocina", "warn"], EN_PREPARACION: ["Preparando", "warn"], PREPARANDO: ["Preparando", "warn"], LISTO: ["Listo, en camino", "warn"], ENTREGADO: ["Entregado", "ok"], CANCELADO: ["Cancelado", "bad"] };
export const orderPending = o => !["ENTREGADO", "CANCELADO"].includes(o.status);

/* ---------- Pago: panel reutilizable ---------- */
export function payPanel({ total, dueLabel, allowHalf = true, needsCode, allowCash = true, action }) {
  fixMethod(allowCash);
  const mode = allowHalf ? S.pay.mode : "FULL", cash = S.pay.method === "CAJA HOTEL";
  const now = cash ? 0 : mode === "HALF" ? round2(total / 2) : total;
  return `<div class="card stack"><h2>¿Cuánto pagas ahora?</h2>
    <button type="button" class="opt radio" data-a="pay-mode" data-v="FULL" aria-pressed="${mode === "FULL"}"><span class="dot"></span><span><b>Pagar el total</b><small>Sin saldo pendiente</small></span><span class="amt">${money(total)}</span></button>
    ${allowHalf ? `<button type="button" class="opt radio" data-a="pay-mode" data-v="HALF" aria-pressed="${mode === "HALF"}"><span class="dot"></span><span><b>Reservar con el 50 %</b><small>Separa tu lugar; completa el saldo antes del ingreso</small></span><span class="amt">${money(round2(total / 2))}</span></button>` : ""}</div>
  <div class="card stack"><h2>¿Cómo pagas?</h2>${payChips(allowCash)}
    ${cash ? `<div class="paybox"><b>Paga ${money(total)} en la caja del hotel</b><span class="mut">${hotel().address ? `${esc(hotel().address)} · ` : ""}Tu reserva queda pendiente hasta que caja confirme el pago.</span></div>`
      : `${payBox(now)}
      <label class="f ${S.errors.code ? "bad" : ""}">N.º de operación${needsCode ? "" : " (opcional)"}<input id="paycode" data-bind="pay.code" value="${esc(S.pay.code)}" placeholder="Ejemplo: 4589123" inputmode="numeric" maxlength="20"><span class="err">${S.errors.code || ""}</span></label>`}
    <div class="note warn">Este pago es solo para <b>reservar</b>. Tu pase de acceso aparece cuando el hotel ${needsCode && !cash ? "verifica tu operación" : "confirma el pago"}${mode === "HALF" ? " y completas el saldo" : ""}.</div>
    <p class="mut">Puedes pedir la devolución hasta 24 horas después de tu primer pago; se devuelve en 2 días hábiles.</p>
    <button class="btn" type="button" data-a="${action}" ${!cash && !payInfo(S.pay.method) ? "disabled" : ""}>${cash ? "Reservar y pagar en caja" : needsCode ? "Ya pagué · enviar mi operación" : "Pagar y reservar"} · ${money(cash ? 0 : now)}</button></div>`;
}
export function validatePay(needsCode) {
  const m = S.pay.method, code = String(S.pay.code || "").trim(); S.errors = {};
  if (m !== "CAJA HOTEL") { if (needsCode && !/^\d{4,20}$/.test(code)) S.errors.code = "Ingresa el código de operación de Yape o Plin (4 a 20 dígitos)."; else if (code && !/^\d{4,20}$/.test(code)) S.errors.code = "Usa solo números (4 a 20 dígitos)."; }
  return !Object.keys(S.errors).length;
}
Object.assign(A, {
  "pay-mode": d => { S.pay.mode = d.v; render(true); },
  "pay-method": d => { S.pay.method = d.v; S.errors = {}; render(true); }
});

/* ---------- Pagar saldo (reservas) ---------- */
export function balanceSheet(b) {
  fixMethod(false);
  const needsCode = ["HOSPEDAJE", "MIRADOR"].includes(b.serviceCode);
  S.pay = { ...S.pay, method: S.pay.method === "CAJA HOTEL" ? "YAPE" : S.pay.method, code: "" };
  sheet(`<h2>Pagar saldo · ${money(b.balance)}</h2><p class="mut">${needsCode ? "El hotel verifica tu operación y activa tu pase." : "Tu pase se activa al confirmar el pago."}</p>
    ${payChips(false, "sheet-method")}<div id="sheetpay">${payBox(0)}</div>
    <label class="f">N.º de operación${needsCode ? "" : " (opcional)"}<input id="sheetcode" data-bind="pay.code" placeholder="Ejemplo: 4589123" inputmode="numeric" maxlength="20"></label>
    <p class="err" id="sheeterr"></p><button class="btn" data-a="sheet-pay-balance" data-id="${b.id}" data-kind="booking" type="button">Enviar pago de ${money(b.balance)}</button><button class="btn outline" data-a="close" type="button">Cancelar</button>`);
}
export function eventBalanceSheet(e) {
  fixMethod(false);
  S.pay = { ...S.pay, method: S.pay.method === "CAJA HOTEL" ? "YAPE" : S.pay.method, code: "" };
  sheet(`<h2>Pagar saldo · ${money(e.balance)}</h2><p class="mut">Con el saldo completo tu evento queda confirmado.</p>
    ${payChips(false, "sheet-method")}<div id="sheetpay">${payBox(0)}</div>
    <label class="f">N.º de operación (opcional)<input data-bind="pay.code" placeholder="Ejemplo: 4589123" inputmode="numeric" maxlength="20"></label>
    <p class="err" id="sheeterr"></p><button class="btn" data-a="sheet-pay-balance" data-id="${e.id}" data-kind="event" type="button">Pagar ${money(e.balance)}</button><button class="btn outline" data-a="close" type="button">Cancelar</button>`);
}
Object.assign(A, {
  "sheet-method": d => { S.pay.method = d.v; document.querySelectorAll("[data-a=sheet-method]").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === d.v)); const box = document.getElementById("sheetpay"); if (box) box.innerHTML = payBox(0); },
  "sheet-pay-balance": async (d, el) => {
    const code = String(S.pay.code || "").trim(), kind = d.kind, err = document.getElementById("sheeterr");
    const needs = kind === "booking" && ["HOSPEDAJE", "MIRADOR"].includes(bookingById(d.id)?.serviceCode);
    if (!payInfo(S.pay.method)) { if (err) err.textContent = "El hotel aún no publica ese número. Paga el saldo en la caja del hotel."; return; }
    if ((needs && !/^\d{4,20}$/.test(code)) || (code && !/^\d{4,20}$/.test(code))) { if (err) err.textContent = "Ingresa el código de operación (4 a 20 dígitos)."; return; }
    el.disabled = true;
    try { await api(kind === "event" ? `/public/events/${d.id}/pay-balance` : `/public/bookings/${d.id}/pay-balance`, { method: "POST", body: { paymentMethod: S.pay.method, paymentCode: code } }); closeSheet(); await loadExp(); toast(needs ? "Enviamos tu operación: el hotel la verificará." : "Saldo pagado. ¡Todo al día!"); render(true); }
    catch (e) { if (err) err.textContent = errText(e); el.disabled = false; }
  }
});

/* ---------- Cabecera con foto y pasos (Piscina, Mirador, Terraza y Eventos, igual que Hospedaje) ---------- */
const FLOW_IC = { PISCINA: "pool", MIRADOR: "sunset", TERRAZA: "dine", EVENTOS: "party", HOSPEDAJE: "bed" };
export function flowHero(code, title, lead) {
  const m = (catalog().experienceMedia || []).find(x => x.code === code) || {}, wide = m.imageUrl || SERVICE_WIDE[code], tall = m.imageUrl && m.imageUrl !== SERVICE_WIDE[code] ? m.imageUrl : SERVICE_IMG[code];
  return `<header class="fhero" style="--w:url('${wide}');--p:url('${tall}')"><div><span class="fhero-k">${ic(FLOW_IC[code] || "spark")}${esc(m.place || SERVICE_NAME[code])}</span><h1>${title}</h1><p>${lead}</p></div></header>`;
}
export const flowSteps = (i, names) => `<ol class="hsteps" aria-label="Pasos">${names.map((t, j) => `<li class="${j < i ? "done" : j === i ? "now" : ""}"><i>${j < i ? ic("check") : j + 1}</i><span>${t}</span></li>`).join("")}</ol>`;

/* Comprobantes electrónicos (boleta, factura y nota de crédito) de los pagos de una reserva, con su PDF. */
const DOC_NAME = { BOLETA: "Boleta", FACTURA: "Factura", NOTA_CREDITO: "Nota de crédito" };
export function invoicesHTML(b, { inline = false, payments = null } = {}) {
  const ids = new Set((payments || paymentsOf(b)).map(p => Number(p.id)));
  const docs = (D.exp?.invoices || []).filter(d => ids.has(Number(d.paymentId)));
  if (!docs.length) return "";
  const rows = docs.map(d => `<div class="row"><span>${DOC_NAME[d.type] || "Comprobante"} <b>${esc(d.fullNumber)}</b><small>${money(d.total)} · ${d.status === "ANULADO" ? "anulado con nota de crédito" : d.type === "NOTA_CREDITO" ? `modifica ${esc(d.reference?.fullNumber || "")}` : "electrónico, aceptado"}</small></span><button class="chip" type="button" data-a="invoice-pdf" data-id="${d.id}">PDF</button></div>`).join("");
  return inline ? `<div class="stack" style="margin-top:14px"><h3 style="margin:0">Comprobantes</h3>${rows}</div>` : `<div class="card stack"><h2>Comprobantes</h2>${rows}</div>`;
}
Object.assign(A, {
  "invoice-pdf": async (d, el) => {
    el.disabled = true;
    try {
      const res = await fetch(`/api/public/invoices/${d.id}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem("pp_customer_token") || ""}` } });
      if (!res.ok) throw new Error("El comprobante aún no está disponible.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `comprobante-${d.id}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast(errText(e)); } finally { el.disabled = false; }
  }
});
