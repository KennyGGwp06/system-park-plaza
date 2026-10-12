/* visits.js: Piscina, Mirador y Terraza con cupos, tarifas y extras reales. */
import { S, D, V, A, BACK, api, esc, money, fmt, fmtLong, ymd, today, go, render, toast, openCal, openGuests, fieldBtn, setBar, requireLogin, loadExp, errText, HOOKS, hhmm12 } from "./core.js";
import { planOf, extrasOf, round2, payPanel, validatePay, SERVICE_NAME, SERVICE_IMG, SERVICE_WIDE, catalog, flowHero, flowSteps } from "./common.js";
import { limaNow } from "./ui.js";
// Un turno de hoy que empezó hace más de una hora ya no se ofrece (la hora es la de Lima).
const gone = (date, time) => { if (date !== ymd(today)) return false; const [h, m] = String(time).split(":").map(Number), n = limaNow(); return h * 60 + (m || 0) < n.h * 60 + n.m - 60; };

export const VISIT = {
  PISCINA: { kick: "Días bajo el sol", blurb: "Pases por turnos, con duchas, casilleros y servicio a tu camastro. Recibe tu QR al instante.", max: 10, kids: true, needsCode: false, hours: "9:00 a. m. – 6:00 p. m.", includes: ["Acceso a la piscina", "Duchas y vestidores", "Pedidos a tu camastro", "QR propio de acceso"] },
  MIRADOR: { kick: "La ciudad desde arriba", blurb: "El mejor atardecer de Pucallpa, con la selva y el río como telón. El hotel verifica tu pago y activa tu pase.", max: 8, kids: false, needsCode: true, hours: "4:30 p. m. – 9:00 p. m.", includes: ["Acceso al mirador", "Vista panorámica del Ucayali", "Bebida o consumo según tu plan", "QR propio de acceso"] },
  TERRAZA: { kick: "Sabores en un ambiente para compartir", blurb: "Reserva tu mesa sin costo y paga solo lo que pidas. Elige tu zona y llegas directo a tu lugar.", max: 12, kids: false, needsCode: false, hours: "12:00 m. – 11:00 p. m.", includes: ["Reserva de mesa sin costo", "Elige tu zona", "Carta desde tu mesa", "QR propio de acceso"] }
};
const ZONES = ["Zona fresca", "Cerca al bar", "Mesa tranquila", "Cerca al jardín"];
Object.assign(BACK, { xhome: "servicios", xplan: "servicios", xpay: "xplan" });
const steps = i => flowSteps(i, ["Elige", "Tus datos", "Paga"]);
const newDraft = t => ({ type: t, date: null, slot: null, adults: t === "MIRADOR" ? 2 : 2, kids: 0, planCode: t === "MIRADOR" ? "ATARDECER" : t === "TERRAZA" ? "MESA" : "ADULTO", extras: {}, zone: ZONES[0], notes: "" });
export const vp = v => v.adults + v.kids;

export function vLines(v) {
  const L = [], svc = v.type, p = vp(v);
  if (svc === "PISCINA") { const a = Number(planOf("PISCINA", "ADULTO")?.price || 0), k = Number(planOf("PISCINA", "NINO")?.price || 0); if (v.adults) L.push({ label: `Pase adulto × ${v.adults}`, amt: a * v.adults }); if (v.kids) L.push({ label: `Pase niño × ${v.kids}`, amt: k * v.kids }); }
  if (svc === "MIRADOR") { const pl = planOf("MIRADOR", v.planCode) || {}; L.push({ label: `${pl.name || "Mirador"} × ${p}`, amt: Number(pl.price || 0) * p }); }
  if (svc === "TERRAZA") L.push({ label: `Reserva de mesa · ${v.zone}`, amt: 0 });
  extrasOf(svc).forEach(e => { if (v.extras[e.id]) L.push({ label: e.name, amt: Number(e.price) }); });
  return L;
}
export const vTotal = v => round2(vLines(v).reduce((s, l) => s + l.amt, 0));
const days = t => D.avail[t] || null;
const dayOf = (t, date) => (days(t) || []).find(d => d.date === date);
export async function loadAvail(t) { D.loading["a" + t] = true; try { D.avail[t] = await api(`/public/availability/${t}?from=${ymd(today)}`); } catch (e) { D.avail[t] = []; toast(errText(e)); } D.loading["a" + t] = false; render(true); }

function aside(v) {
  const L = vLines(v), tot = vTotal(v);
  return `<aside class="sum"><div class="feature"><img src="${SERVICE_WIDE[v.type]}" alt="" style="border-radius:12px;aspect-ratio:16/9;object-fit:cover;width:100%;margin-bottom:12px"><span class="eyebrow">Tu reserva</span><h2 style="margin:4px 0 8px">${SERVICE_NAME[v.type]}</h2>
    ${v.date ? `<div class="row"><span class="mut">Día</span><b>${fmt(v.date)}</b></div>` : ""}${v.slot ? `<div class="row"><span class="mut">Horario</span><b>${hhmm12(v.slot)}</b></div>` : ""}<div class="row"><span class="mut">Personas</span><b>${vp(v)}</b></div>
    ${L.map(l => `<div class="row"><span class="mut">${esc(l.label)}</span><b class="money">${l.amt ? money(l.amt) : "Sin costo"}</b></div>`).join("")}<div class="row t"><span>Total</span><span class="money">${tot ? money(tot) : "Sin costo"}</span></div>
    <p class="micro" style="margin-top:6px">${v.type === "TERRAZA" ? "Lo que pidas en la mesa se paga aparte." : "Impuestos incluidos. El hotel confirma el total al reservar."}</p></div></aside>`;
}

V.xhome = () => {
  const t = S.exp === "HOSPEDAJE" ? "PISCINA" : S.exp, x = VISIT[t], plans = catalog().plans[t] || [];
  const mine = (D.exp?.bookings || []).filter(b => b.serviceCode === t && !["CANCELADA", "FINALIZADA"].includes(b.status));
  const others = ["PISCINA", "MIRADOR", "TERRAZA"].filter(k => k !== t);
  return `<section class="view"><div class="layout" style="max-width:940px;margin:0 auto"><div class="xhero" style="background-image:linear-gradient(180deg,rgba(11,16,32,.15),rgba(11,16,32,.88)),url('${SERVICE_IMG[t]}')"><span class="eyebrow" style="color:var(--sky)">${x.kick}</span><h1>${SERVICE_NAME[t]}</h1><p>${x.blurb}</p></div>
  ${mine.length ? `<div class="note ok">Tienes ${mine.length} reserva${mine.length > 1 ? "s" : ""} activa${mine.length > 1 ? "s" : ""} de ${SERVICE_NAME[t]}. <button class="link" type="button" data-a="open-b" data-id="${mine[0].id}">Abrir la última</button></div>` : ""}
  <div class="grid-auto"><div class="card"><h3>Incluye</h3><ul class="checks" style="margin-top:10px">${x.includes.map(i => `<li>${i}</li>`).join("")}</ul></div>
   <div class="card"><h3>Precios</h3><div style="margin-top:8px">${plans.map(p => `<div class="kv"><span>${esc(p.name)}</span><b>${Number(p.price) ? money(p.price) : "Sin costo"}</b></div>`).join("")}</div></div>
   <div class="card"><h3>Horario</h3><p class="mut" style="margin:8px 0">${x.hours}</p><span class="micro">Los turnos y cupos se muestran al elegir el día.</span></div></div>
  <button class="btn" type="button" data-a="v-new" data-t="${t}">${t === "TERRAZA" ? "Reservar mi mesa →" : `Reservar ${SERVICE_NAME[t]} →`}</button>
  <div class="card stack flat"><h3>Combínalo con otra experiencia</h3><div class="chips">${others.map(k => `<button class="chip" type="button" data-a="start-exp" data-t="${k}">${SERVICE_NAME[k]}</button>`).join("")}<button class="chip" type="button" data-a="start-exp" data-t="HOSPEDAJE">Hospedaje</button><button class="chip" type="button" data-a="start-exp" data-t="EVENTOS">Eventos</button></div></div></div></section>`;
};

V.xplan = () => {
  const v = S.v, t = v.type, x = VISIT[t], d = v.date ? dayOf(t, v.date) : null, p = vp(v);
  const opt = (attr, name, desc, amt, on, radio) => `<button type="button" class="opt ${radio ? "radio" : ""}" ${attr} aria-pressed="${on}"><span class="dot"></span><span><b>${name}</b><small>${desc}</small></span><span class="amt">${amt}</span></button>`;
  const slots = !v.date ? `<span class="micro">Elige primero el día.</span>` : D.loading["a" + t] || !d ? `<span class="micro">Consultando cupos…</span>` : `<div class="slots" role="group" aria-label="Turnos">${d.slots.map(s => { const late = gone(v.date, s.time), ok = !late && s.available && s.remaining >= p; return `<button type="button" data-a="v-slot" data-v="${s.time}" aria-pressed="${v.slot === s.time}" ${ok ? "" : "disabled"}><b>${hhmm12(s.time)}</b><small>${late ? "ya pasó" : s.remaining >= p ? `quedan ${s.remaining}` : s.available ? "cupo insuficiente" : "agotado"}</small></button>`; }).join("")}</div>`;
  const next = (days(t) || []).slice(0, 10);
  const strip = next.length ? `<div class="dstrip" role="group" aria-label="Próximos días">${next.map(x => { const left = (x.slots || []).reduce((a, s) => a + (s.available && !gone(x.date, s.time) ? Number(s.remaining || 0) : 0), 0), ok = x.available && left >= p; return `<button type="button" data-a="v-day" data-v="${x.date}" aria-pressed="${v.date === x.date}" ${ok ? "" : "disabled"}><small>${x.date === ymd(today) ? "Hoy" : fmt(x.date, { weekday: "short" })}</small><b>${Number(x.date.slice(8))}</b><em>${ok ? `${left} cupos` : "lleno"}</em></button>`; }).join("")}<button type="button" class="more" data-a="v-cal">Más<br>fechas</button></div>` : "";
  let more = "";
  if (t === "MIRADOR") more = `<div class="card stack"><h2>Elige tu experiencia</h2>${(catalog().plans.MIRADOR || []).map(pl => opt(`data-a="v-plan" data-v="${pl.code}"`, esc(pl.name), esc(pl.description || ""), money(pl.price) + "<small>por persona</small>", v.planCode === pl.code, true)).join("")}</div>`;
  if (t === "TERRAZA") more = `<div class="card stack"><h2>¿Dónde te sientas?</h2><div class="chips">${ZONES.map(z => `<button class="chip" type="button" data-a="v-zone" data-v="${z}" aria-pressed="${v.zone === z}">${z}</button>`).join("")}</div><div class="note">La reserva no tiene costo: pagas únicamente lo que pidas desde tu mesa.</div></div>`;
  const extras = extrasOf(t);
  return `<section class="view"><div class="layout two"><div class="stack">${flowHero(t, t === "TERRAZA" ? "Reserva tu mesa" : (t === "PISCINA" ? "Tu día de piscina" : "Tu atardecer en el mirador"), t === "TERRAZA" ? "Día, hora y cuántos son. La reserva no tiene costo." : "Elige el día, tu turno y cuántos van. El total se actualiza al instante.")}${steps(0)}
  <div class="card stack"><h2>¿Qué día vienes?</h2>${strip || fieldBtn("Día", "cal", v.date ? fmtLong(v.date) : "", "Elige el día", "v-cal")}
    ${v.date ? `<p class="micro">Elegiste <b>${fmtLong(v.date)}</b>.</p>` : ""}
    ${fieldBtn("Personas", "usr", x.kids ? `${v.adults} adulto${v.adults > 1 ? "s" : ""} · ${v.kids} niño${v.kids === 1 ? "" : "s"}` : `${v.adults} persona${v.adults > 1 ? "s" : ""}`, "", "v-guests")}
    <div><div class="micro" style="font-weight:800;margin-bottom:8px">TURNO</div>${slots}</div></div>
  ${more}
  ${extras.length ? `<div class="card stack"><h2>Hazla más cómoda <span class="mut" style="font-weight:500">(opcional)</span></h2>${extras.map(e => opt(`data-a="v-extra" data-id="${e.id}"`, esc(e.name), esc(e.description || ""), money(e.price), !!v.extras[e.id])).join("")}</div>` : ""}
  <div class="card stack"><label class="f">¿Algo que debamos saber? (opcional)<textarea data-bind="v.notes" placeholder="${t === "TERRAZA" ? "Cumpleaños, alergias, silla para bebé…" : "Celebración, movilidad reducida, alergias…"}">${esc(v.notes)}</textarea></label></div>
  <button class="btn" type="button" data-a="v-next">${vTotal(v) ? "Continuar al pago →" : "Continuar →"}</button></div>${aside(v)}</div></section>`;
};
V.xpay = () => {
  const v = S.v, t = v.type, tot = vTotal(v), x = VISIT[t];
  if (!tot) return `<section class="view"><div class="layout two"><div class="stack">${flowHero(t, "Confirma tu mesa", "No hay nada que pagar ahora. Lo que pidas se paga desde tu mesa.")}${steps(2)}
    <div class="card stack"><h2>Resumen</h2><div class="row"><span>${fmtLong(v.date)}</span><b>${hhmm12(v.slot)}</b></div><div class="row"><span>Personas</span><b>${vp(v)}</b></div><div class="row"><span>Zona</span><b>${esc(v.zone)}</b></div><button class="btn" type="button" data-a="v-book">Confirmar reserva de mesa</button></div></div>${aside(v)}</div></section>`;
  return `<section class="view"><div class="layout two"><div class="stack">${flowHero(t, "Paga y reserva", x.needsCode ? "Envía tu operación; el hotel la verifica y activa tu pase." : "Paga con Yape o Plin y recibe tu QR al instante.")}${steps(2)}${payPanel({ total: tot, needsCode: x.needsCode, action: "v-book" })}</div>${aside(v)}</div></section>`;
};

Object.assign(A, {
  "v-new": d => { S.v = newDraft(d.t); S.exp = d.t; go("xplan"); loadAvail(d.t); },
  "v-cal": () => { const v = S.v, list = days(v.type) || []; const allowed = new Set(list.filter(x => x.available).map(x => x.date)); const busy = new Set(list.filter(x => x.available && x.remaining <= 6).map(x => x.date)); openCal({ mode: "single", from: v.date, title: "¿Qué día vienes?", allowed, busyDays: busy, maxDate: list.length ? list[list.length - 1].date : null, apply: f => { v.date = f; v.slot = null; render(true); } }); },
  "v-guests": () => { const v = S.v, x = VISIT[v.type]; openGuests({ adults: v.adults, kids: v.kids, max: x.max, kidsOn: x.kids, apply: (a, k) => { v.adults = a; v.kids = x.kids ? k : 0; v.slot = null; render(true); } }); },
  "v-slot": d => { S.v.slot = d.v; render(true); },
  "v-day": d => { S.v.date = d.v; S.v.slot = null; render(true); },
  "v-plan": d => { S.v.planCode = d.v; render(true); },
  "v-zone": d => { S.v.zone = d.v; render(true); },
  "v-extra": d => { if (S.v.extras[d.id]) delete S.v.extras[d.id]; else S.v.extras[d.id] = 1; render(true); },
  "v-next": () => { const v = S.v; if (!v.date) return toast("Elige el día de tu visita."); if (!v.slot) return toast("Elige un horario."); if (gone(v.date, v.slot)) { v.slot = null; render(true); return toast("Ese turno ya pasó. Elige otro."); } if (!requireLogin("xpay")) return; go("xpay"); },
  "v-book": async (d, el) => {
    const v = S.v, tot = vTotal(v), needs = VISIT[v.type].needsCode, cash = S.pay.method === "CAJA HOTEL";
    if (tot && !validatePay(needs)) { render(true); return; }
    const pl = planOf(v.type, v.planCode) || {};
    const body = { serviceCode: v.type, planCode: v.planCode, planName: pl.name || SERVICE_NAME[v.type], checkIn: v.date, checkOut: v.date, date: v.date, slot: v.slot, people: vp(v), adults: v.adults, children: v.kids, guests: [], extras: extrasOf(v.type).filter(e => v.extras[e.id]).map(e => ({ id: e.id })), vehicles: [], preferences: v.type === "TERRAZA" ? { tableZone: v.zone, notes: v.notes } : { notes: v.notes }, preorderItems: [], payMode: cash || !tot ? "FULL" : S.pay.mode, paymentMethod: tot ? S.pay.method : "YAPE", paymentCode: cash || !tot ? "" : String(S.pay.code || "").trim() };
    el.disabled = true;
    try { const res = await api("/public/bookings", { method: "POST", body }); S.cb = res.booking.id; S.cbKind = "B"; S.pay.code = ""; S.v = null; await loadExp(); go("trip"); toast(`Reserva ${res.booking.code} creada`); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  }
});
HOOKS.push(() => {
  const sc = S.screen; if (!S.v) return;
  if (sc === "xplan") setBar("Total", vTotal(S.v) ? money(vTotal(S.v)) : "Sin costo", "Continuar →");
  if (sc === "xpay") setBar(vTotal(S.v) ? "Pagas ahora" : "Sin costo", vTotal(S.v) ? money(S.pay.method === "CAJA HOTEL" ? 0 : S.pay.mode === "HALF" ? vTotal(S.v) / 2 : vTotal(S.v)) : "—", vTotal(S.v) ? "Reservar" : "Confirmar");
});
export const visitBarAction = () => { if (S.screen === "xplan") return A["v-next"](), true; if (S.screen === "xpay") return A["v-book"]({}, document.getElementById("barBtn")), true; return false; };
