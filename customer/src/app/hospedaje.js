/* hospedaje.js (v5): reserva de Hospedaje en 3 pasos, conectada a habitaciones, tarifas y disponibilidad reales.
   Portada (fechas + huéspedes en la cápsula) → 1. Habitación → 2. Arma tu estadía → 3. Confirma y paga.
   El servidor recalcula y confirma el total; aquí se usa su misma fórmula. */
import { S, D, V, A, BACK, api, esc, money, fmt, fmtLong, parse, ymd, addDays, today, nextFriday, go, render, refresh, toast, sheet, closeSheet, openCal, openGuests, setBar, loadExp, errText, HOOKS, client, setSession, logout } from "./core.js";
import { planOf, extrasOf, parkingRate, round2, validatePay, catalog, payInfo, fixMethod, hotel } from "./common.js";
import { ic, FEATURE_IC, countUp, copyText, sunsetPucallpa } from "./ui.js";

const STEPS = ["Habitación", "Tu estadía", "Confirma y paga"];
const STEP_OF = { rooms: 0, plan: 1, checkout: 2 };
Object.assign(BACK, { rooms: "servicios", plan: "rooms", checkout: "plan", room: "rooms", extras: "rooms", summary: "plan", pay: "plan", dates: "home" });
// Pantallas de la versión anterior (por si quedaron guardadas en la sesión del navegador).
V.dates = () => V.home(); V.room = () => V.rooms(); V.extras = () => V.plan(); V.summary = () => V.plan(); V.pay = () => V.checkout();

export const nights = () => S.h.from && S.h.to ? Math.round((parse(S.h.to) - parse(S.h.from)) / 864e5) : 0;
export const people = () => S.h.adults + S.h.kids;
const roomsFree = () => D.rooms || [];
const typeInfo = name => (catalog().roomTypes || []).find(t => t.name === name) || {};
const slug = n => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const roomImg = t => (typeInfo(t).imageUrl) || `/images/rooms/${slug(t)}.webp`;
export const chosenRoom = () => roomsFree().find(r => Number(r.id) === Number(S.h.roomId)) || null;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const nn = () => plural(nights(), "noche", "noches");
const guestsLabel = () => `${plural(S.h.adults, "adulto", "adultos")}${S.h.kids ? ` · ${plural(S.h.kids, "niño", "niños")}` : ""}`;
const range = (a, b) => { const A = parse(a), B = parse(b); return A.getMonth() === B.getMonth() ? `${A.getDate()}–${B.getDate()} ${fmt(b, { month: "short" }).toLowerCase()}` : `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short" })}`; };
// Texto propio para cada tipo mientras el hotel no cargue descripciones en el catálogo (solo datos reales: capacidad y características).
export const ROOM_COPY = { Simple: "Lo esencial para quien viaja solo: cama full, baño privado y silencio para descansar.", Matrimonial: "Una cama para dos, vista al jardín y la calma del hotel a tu alrededor.", Doble: "Para dos huéspedes, con vista al jardín y baño privado.", Triple: "Para tres: familia pequeña o amigos de viaje, con vista al jardín.", Suite: "La de mayor capacidad del hotel: hasta cuatro huéspedes con vista al jardín." };
const groups = () => {
  const map = new Map(); for (const r of roomsFree()) { const k = r.type?.name; if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  return [...map.entries()].map(([name, list]) => ({ name, list, price: Math.min(...list.map(r => Number(r.price))), capacity: Math.max(...list.map(r => Number(r.capacity || typeInfo(name).capacity || 1))), info: typeInfo(name) })).sort((a, b) => a.price - b.price);
};

/* ---------- Precio (misma fórmula que el servidor) ---------- */
const PREMIUM_PP = () => round2((Number(planOf("PISCINA", "ADULTO")?.price || 0) + Number(planOf("MIRADOR", "ACCESO")?.price || 0)) * 0.9);
const PREMIUM_FULL = () => Number(planOf("PISCINA", "ADULTO")?.price || 0) + Number(planOf("MIRADOR", "ACCESO")?.price || 0);
const BREAKFAST_PP = () => Number(planOf("HOSPEDAJE", "DESAYUNO")?.perPerson || 24);
export function hLines() {
  const h = S.h, r = chosenRoom(), n = nights(), p = people(), L = []; if (!r || !n) return L;
  L.push({ label: `${r.type.name} ${r.number} · ${nn()}`, sub: `${money(r.price)} por noche`, amt: Number(r.price) * n });
  if (h.plan === "DESAYUNO") L.push({ label: "Desayuno incluido", sub: `${money(BREAKFAST_PP())} × ${plural(p, "huésped", "huéspedes")}`, amt: BREAKFAST_PP() * p });
  if (h.plan === "PREMIUM") L.push({ label: "Premium: Piscina, Mirador y Terraza", sub: `${money(PREMIUM_PP())} × ${plural(p, "huésped", "huéspedes")} · 10 % menos`, amt: round2(PREMIUM_PP() * p) });
  extrasOf("HOSPEDAJE").forEach(e => { if (h.extras[e.id]) L.push({ label: e.name, amt: Number(e.price) }); });
  h.vehicles.forEach(v => L.push({ label: `Cochera · ${VEH[v.type] || v.type}`, sub: v.plate ? v.plate.toUpperCase() : "placa por confirmar", amt: parkingRate(v.type) }));
  return L;
}
export const hTotal = () => round2(hLines().reduce((s, l) => s + l.amt, 0));
export const dueNow = () => S.pay.method === "CAJA HOTEL" ? 0 : S.pay.mode === "HALF" ? round2(hTotal() / 2) : hTotal();
const VEH = { AUTO: "Auto", CAMIONETA: "Camioneta", MINIVAN: "Minivan", MOTO: "Moto" };

/* ---------- Cápsula de búsqueda (portada y habitaciones) ---------- */
export function capsule(where) {
  const h = S.h, n = nights();
  return `<div class="cap ${where}" role="group" aria-label="Tu búsqueda">
    <button class="cap-f" type="button" data-a="h-cal">${ic("cal")}<span><small>Llegada → Salida</small><b class="${h.from ? "" : "cap-ph"}">${h.from && h.to ? range(h.from, h.to) : "Elige tus fechas"}</b></span>${n ? `<em>${nn()}</em>` : ""}</button>
    <button class="cap-f" type="button" data-a="h-guests">${ic("user")}<span><small>Huéspedes</small><b>${guestsLabel()}</b></span></button>
    ${where === "home" ? `<button class="cap-go" type="button" data-a="h-search"><span>Ver habitaciones</span>${ic("arrow")}</button>` : ""}</div>`;
}
export const quickChips = () => `<div class="cap-quick" role="group" aria-label="Fechas rápidas">${[["tonight", "Esta noche"], ["weekend", "Fin de semana"], ["three", "3 noches"]].map(([k, t]) => `<button type="button" data-a="h-quick" data-v="${k}" aria-pressed="${S.h.quick === k}">${t}</button>`).join("")}</div>`;
const onCover = () => S.screen === "home" || S.screen === "servicios";
const afterDates = () => { S.h.roomId = null; S.h.roomType = null; D.rooms = null; if (onCover()) refresh(); else loadRooms(); };
const openRange = (anchor, then) => openCal({ mode: "range", from: S.h.from, to: S.h.to, title: "¿Cuándo vienes?", anchor, price: D.tonight?.from ? `desde ${money(D.tonight.from)}` : null, apply: (f, t) => { S.h.from = f; S.h.to = t; S.h.quick = null; afterDates(); if (then) then(); } });

/* ---------- Encabezado de cada paso ---------- */
const stepper = () => { const i = STEP_OF[S.screen] ?? 0; return `<ol class="hsteps" aria-label="Pasos">${STEPS.map((t, j) => `<li class="${j < i ? "done" : j === i ? "now" : ""}"><i>${j < i ? ic("check") : j + 1}</i><span>${t}</span></li>`).join("")}</ol>`; };

/* ---------- Resumen vivo (escritorio) ---------- */
function receipt() {
  const r = chosenRoom(), L = hLines(), t = hTotal();
  return `<aside class="rcpt" aria-label="Tu estadía">
    <div class="rcpt-ph">${r ? `<img src="${roomImg(r.type.name)}" alt="">` : `<img src="/images/hs/hospedaje.webp" alt="">`}<span>${r ? `${esc(r.type.name)} · Hab. ${esc(r.number)}` : "Tu estadía"}</span></div>
    <div class="rcpt-bd"><div class="rcpt-dates"><div><small>Llegas</small><b>${S.h.from ? fmt(S.h.from) : "—"}</b><em>desde 3:00 p. m.</em></div>${ic("arrow")}<div><small>Sales</small><b>${S.h.to ? fmt(S.h.to) : "—"}</b><em>hasta 12:00 m.</em></div></div>
    <div class="rcpt-meta"><span>${ic("user")}${guestsLabel()}</span><span>${ic("bed")}${nn()}</span></div>
    ${L.length ? `<ul class="rcpt-lines">${L.map(l => `<li><span>${esc(l.label)}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</span><b>${money(l.amt)}</b></li>`).join("")}</ul>
    <div class="rcpt-tot"><span>Total<small>Impuestos incluidos</small></span><b data-count="${t}" data-count-key="h-total">${money(t)}</b></div>` : `<p class="mut">Elige una habitación y verás aquí el precio final, sin sorpresas.</p>`}</div></aside>`;
}
function breakdownSheet() {
  const L = hLines(); if (!L.length) return;
  sheet(`<div class="sheethead"><h2>Tu estadía</h2><button class="xbtn" data-a="close" type="button" aria-label="Cerrar">${ic("x")}</button></div>
    <ul class="rcpt-lines">${L.map(l => `<li><span>${esc(l.label)}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</span><b>${money(l.amt)}</b></li>`).join("")}</ul>
    <div class="rcpt-tot"><span>Total<small>Impuestos incluidos</small></span><b>${money(hTotal())}</b></div>`, "bdsheet", null);
}

/* ---------- 1 · Habitación ---------- */
export async function loadRooms() {
  if (!S.h.from || !S.h.to) return;
  D.loading.rooms = true; D.rooms = null; render(true);
  try { D.rooms = await api(`/public/rooms?checkIn=${S.h.from}&checkOut=${S.h.to}`); }
  catch (e) { D.rooms = []; toast(errText(e)); }
  D.loading.rooms = false; render(true);
}
const people3 = cap => Array.from({ length: Math.min(cap, 4) }, () => ic("one")).join("");
V.rooms = () => {
  const p = people(), n = nights(), all = groups().filter(g => g.capacity >= p), loading = D.rooms === null;
  const best = all.slice().sort((a, b) => a.capacity - b.capacity || a.price - b.price)[0];
  const card = (g, i) => { const left = g.list.length, isBest = best && g.name === best.name;
    return `<article class="rc" style="--d:${i * 60}ms"><button class="rc-ph" type="button" data-a="h-type" data-v="${esc(g.name)}" aria-label="Ver ${esc(g.name)}"><img src="${roomImg(g.name)}" alt="Habitación ${esc(g.name)}" loading="lazy">${isBest ? `<span class="rc-tag">Ideal para ${plural(p, "persona", "personas")}</span>` : ""}${left <= 3 ? `<span class="rc-left">Quedan ${left}</span>` : ""}</button>
      <div class="rc-bd"><div class="rc-top"><h3>${esc(g.name)}</h3><span class="rc-cap" title="Hasta ${g.capacity} personas">${people3(g.capacity)}<small>hasta ${g.capacity}</small></span></div>
        <p>${esc(g.info.description || ROOM_COPY[g.name] || "")}</p>
        <ul class="rc-fe">${(g.info.features || []).map(f => `<li>${ic(FEATURE_IC(f))}${esc(f)}</li>`).join("")}</ul>
        <div class="rc-ft"><div><b>${money(g.price)}</b><small> / noche</small><em>${money(g.price * n)} por ${nn()}</em></div><button class="rc-go" type="button" data-a="h-type" data-v="${esc(g.name)}">Elegir ${ic("arrow")}</button></div></div></article>`; };
  return `<section class="view hflow"><div class="hwrap">${stepper()}
    <header class="hhead"><div><h1>Elige dónde descansar</h1><p class="lead">Solo te mostramos habitaciones libres donde caben ${p === 1 ? "tú" : `los ${p}`}, con el precio de todas tus noches.</p></div>${capsule("inline")}</header>
    ${loading ? `<div class="rgrid">${[0, 1, 2].map(() => `<div class="rc sk"><div class="rc-ph"></div><div class="rc-bd"><i></i><i></i><i></i></div></div>`).join("")}</div>`
      : all.length ? `<div class="rgrid">${all.map(card).join("")}</div>`
      : `<div class="empty"><b>No hay habitaciones libres para ${plural(p, "persona", "personas")} en esas fechas.</b><p class="mut">Prueba otras fechas: el calendario te muestra el precio desde.</p><button class="btn sm" style="margin:12px auto 0" data-a="h-cal" type="button">Cambiar fechas</button></div>`}
  </div></section>`;
};
function roomSheet() {
  const list = roomsFree().filter(r => r.type?.name === S.h.roomType).sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true })), r = chosenRoom();
  if (!r) return; const info = typeInfo(r.type.name), n = nights(), floors = [...new Set(list.map(x => x.floor))].sort();
  sheet(`<div class="drw-ph"><img src="${roomImg(r.type.name)}" alt="Habitación ${esc(r.type.name)}"><button class="xbtn drw-x" data-a="close" type="button" aria-label="Cerrar">${ic("x")}</button></div>
    <div class="drw-bd"><span class="eyebrow">Habitación ${esc(r.type.name)}</span><h2>${esc(info.description || ROOM_COPY[r.type.name] || r.type.name)}</h2>
      <ul class="rc-fe">${(r.features || info.features || []).map(f => `<li>${ic(FEATURE_IC(f))}${esc(f)}</li>`).join("")}<li>${ic("user")}Hasta ${r.capacity || info.capacity} personas</li></ul>
      <div class="floor"><div class="floor-hd"><b>Elige tu número</b><small>Ya reservamos una por ti; cámbiala si prefieres otro piso.</small></div>
        ${floors.map(fl => `<div class="floor-row"><span>Piso ${fl}</span><div>${list.filter(x => x.floor === fl).map(x => `<button type="button" class="door" data-a="h-room" data-id="${x.id}" aria-pressed="${Number(x.id) === Number(r.id)}">${esc(x.number)}</button>`).join("")}</div></div>`).join("")}</div>
      <div class="drw-ft"><div><small>${nn()} · ${range(S.h.from, S.h.to)}</small><b>${money(Number(r.price) * n)}</b></div><button class="btn" type="button" data-a="h-take">Continuar con la ${esc(r.number)} ${ic("arrow")}</button></div></div>`, "drawer", null);
}

/* ---------- 2 · Arma tu estadía ---------- */
const SLOTS = { PISCINA: ["09:00", "13:00", "16:00"], MIRADOR: ["16:30", "18:00", "19:30"], TERRAZA: ["12:00", "13:30", "15:00", "18:00", "20:00", "21:30"] };
// En Perú el mediodía se escribe "12:00 m."
const hh = t => { const [a, b] = t.split(":").map(Number); if (a === 12 && !b) return "12:00 m."; return `${a % 12 || 12}:${String(b).padStart(2, "0")} ${a >= 12 ? "p. m." : "a. m."}`; };
const BUNDLE = [["PISCINA", "Piscina", "pool"], ["MIRADOR", "Mirador al atardecer", "sunset"], ["TERRAZA", "Mesa en la Terraza", "dine"]];
const EXTRA_IC = { EARLY: "door", LATE: "clock", TOALLA: "towel" };
const stayDays = () => Array.from({ length: Math.max(1, nights()) }, (_, i) => ymd(addDays(parse(S.h.from), i)));
function itinerary() {
  const days = [...stayDays(), S.h.to], prem = S.h.plan === "PREMIUM", sun = sunsetPucallpa(parse(S.h.from));
  const ev = d => { const out = []; if (d === S.h.from) out.push({ t: "15:00", n: "Llegas al hotel", s: "Check‑in con tu QR en recepción", i: "key" });
    if (S.h.plan === "DESAYUNO" && d !== S.h.from) out.push({ t: "07:00", n: "Desayuno", s: "Incluido en tu plan", i: "coffee" });
    if (prem) BUNDLE.forEach(([k, name, i]) => { const sl = S.h.bundle[k].slot; if ((S.h.bundle[k].date || S.h.from) === d) out.push({ t: sl, n: name, s: d === S.h.from && sl < "15:00" ? "Es antes de tu check‑in de las 3:00 p. m." : k === "MIRADOR" && sun ? `El sol se oculta cerca de las ${sun.label}` : "Incluido en tu Premium", i }); });
    if (d === S.h.to) out.push({ t: "12:00", n: "Salida", s: "Solicítala desde tu celular, sin filas", i: "door" });
    return out.sort((a, b) => a.t.localeCompare(b.t)); };
  return `<div class="itin">${days.map((d, i) => `<div class="itin-day"><div class="itin-dh"><b>${fmt(d, { weekday: "long" })}</b><span>${fmt(d, { day: "numeric", month: "short" })}${i === 0 ? " · llegada" : i === days.length - 1 ? " · salida" : ""}</span></div>
    <ul>${ev(d).map(e => `<li>${ic(e.i)}<time>${hh(e.t)}</time><span><b>${e.n}</b><small>${e.s}</small></span></li>`).join("") || `<li class="free">${ic("leaf")}<span><b>Día libre</b><small>Descansa o suma una experiencia desde tu app.</small></span></li>`}</ul></div>`).join("")}</div>`;
}
V.plan = () => {
  const h = S.h, r = chosenRoom(), p = people();
  if (!r) return V.rooms();
  const planCard = (k, t, d, price, badge, icon) => `<button type="button" class="pc" data-a="h-plan" data-v="${k}" aria-pressed="${h.plan === k}">${badge ? `<em>${badge}</em>` : ""}<span class="pc-ic">${ic(icon)}</span><b>${t}</b><small>${d}</small><span class="pc-pr">${price}</span><i class="pc-ck">${ic("check")}</i></button>`;
  const prem = h.plan === "PREMIUM", days = stayDays();
  return `<section class="view hflow"><div class="hwrap two"><div class="hmain">${stepper()}
    <header class="hhead"><div><h1>Arma tu estadía</h1><p class="lead">Elige cómo vivirla. Nada viene marcado: el total cambia al instante y solo pagas lo que elijas.</p></div></header>
    <div class="blk"><h2>¿Cómo quieres vivirla?</h2><div class="pcs">
      ${planCard("FLEX", "Solo descanso", "La habitación y el hotel a tu alrededor. Cambios hasta 24 h antes.", "Incluido", "", "bed")}
      ${planCard("DESAYUNO", "Con desayuno", `Desayuno para cada huésped durante tu estadía.`, `+ ${money(BREAKFAST_PP() * p)}`, "", "coffee")}
      ${planCard("PREMIUM", "Premium", `Piscina, Mirador y mesa en la Terraza. Por separado costaría ${money(PREMIUM_FULL() * p)}.`, `+ ${money(round2(PREMIUM_PP() * p))}`, "Más completo", "spark")}</div></div>
    ${prem ? `<div class="blk"><h2>Tus experiencias incluidas</h2><p class="mut">Cada una tiene su propio QR. Elige el día y la hora; puedes cambiarlas en recepción.</p><div class="bxs">${BUNDLE.map(([k, name, i]) => `<div class="bx"><div class="bx-hd">${ic(i)}<b>${name}</b></div>
        <div class="seg" role="group" aria-label="Día de ${name}">${days.map(d => `<button type="button" data-a="h-bday" data-k="${k}" data-v="${d}" aria-pressed="${(h.bundle[k].date || h.from) === d}">${fmt(d, { weekday: "short", day: "numeric" })}</button>`).join("")}</div>
        <div class="seg sm" role="group" aria-label="Hora de ${name}">${SLOTS[k].map(t => `<button type="button" data-a="h-bslot" data-k="${k}" data-v="${t}" aria-pressed="${h.bundle[k].slot === t}">${hh(t)}</button>`).join("")}</div></div>`).join("")}</div></div>`
    : `<button type="button" class="upsell" data-a="h-plan" data-v="PREMIUM">${ic("spark")}<span><b>¿Y si sumas Piscina, Mirador y Terraza?</b><small>Con Premium pagas ${money(round2(PREMIUM_PP() * p))} en vez de ${money(PREMIUM_FULL() * p)}. También puedes reservarlas después desde tu app.</small></span>${ic("arrow")}</button>`}
    <div class="blk"><h2>Así se ve tu estadía</h2>${itinerary()}</div>
    <div class="blk"><h2>Comodidades <span class="mut">opcional</span></h2><div class="tiles">${extrasOf("HOSPEDAJE").map(e => `<button type="button" class="tile" data-a="h-extra" data-id="${e.id}" aria-pressed="${!!h.extras[e.id]}">${ic(EXTRA_IC[e.id] || "spark")}<b>${esc(e.name)}</b><small>${money(e.price)}</small><i class="pc-ck">${ic("check")}</i></button>`).join("")}
      <button type="button" class="tile" data-a="h-park" aria-pressed="${h.vehicles.length > 0}">${ic("car")}<b>Llevo vehículo</b><small>Cochera desde ${money(parkingRate("AUTO"))}</small><i class="pc-ck">${ic("check")}</i></button></div>
      ${h.vehicles.map((v, i) => `<div class="veh"><div class="seg" role="group" aria-label="Tipo de vehículo ${i + 1}">${Object.entries(VEH).map(([k, n]) => `<button type="button" data-a="h-vtype" data-i="${i}" data-v="${k}" aria-pressed="${v.type === k}">${n}<small>${parkingRate(k) ? money(parkingRate(k)) : "gratis"}</small></button>`).join("")}</div>
        <label class="f plate ${S.errors["plate" + i] ? "bad" : ""}">Placa<input data-bind="h.vehicles.${i}.plate" value="${esc(v.plate)}" placeholder="ABC-123" autocapitalize="characters" maxlength="8" autocomplete="off"><span class="err">${S.errors["plate" + i] || ""}</span></label>${h.vehicles.length > 1 ? `<button class="xbtn" type="button" data-a="h-park-del" data-i="${i}" aria-label="Quitar vehículo">${ic("x")}</button>` : ""}</div>`).join("")}
      ${h.vehicles.length && h.vehicles.length < 4 ? `<button class="link" type="button" data-a="h-park-add">+ Agregar otro vehículo</button>` : ""}</div>
    <button class="btn big hide-m" type="button" data-a="h-next-plan">Continuar a confirmar y pagar ${ic("arrow")}</button>
  </div>${receipt()}</div></section>`;
};

/* ---------- 3 · Confirma y paga ---------- */
function identity() {
  const c = client(), a = S.auth;
  if (c) return `<div class="blk id-ok"><span class="av">${esc((c.firstName || "?")[0])}${esc((c.lastName || "")[0] || "")}</span><div><small>Reserva a nombre de</small><b>${esc(c.firstName || "")} ${esc(c.lastName || "")}</b><span class="mut">${esc(c.documentType || "DNI")} ···${esc(String(c.documentNumber || "").slice(-3))}</span></div><button class="link" type="button" data-a="h-id-change">No soy yo</button></div>`;
  const inp = (path, label, type, ph, extra = "") => `<label class="f ${S.errors[path] ? "bad" : ""}">${label}<input data-bind="auth.${path}" type="${type}" value="${esc(a[path])}" placeholder="${ph}" ${extra}><span class="err">${S.errors[path] || ""}</span></label>`;
  return `<div class="blk"><h2><i class="num">1</i>¿Quién se hospeda?</h2><p class="mut">${a.register ? "Es tu primera vez con nosotros. Completa tus datos una sola vez." : "Con tu DNI te reconocemos si ya viniste antes. Sin contraseñas."}</p>
    ${inp("doc", "DNI o carnet de extranjería", "text", "8 dígitos", 'inputmode="numeric" autocomplete="off" maxlength="15"')}
    ${a.register ? `<div class="two">${inp("first", "Nombres", "text", "Como en tu documento", 'autocomplete="given-name"')}${inp("last", "Apellidos", "text", "Como en tu documento", 'autocomplete="family-name"')}</div><div class="two">${inp("phone", "Celular", "tel", "9 dígitos", 'inputmode="tel" maxlength="9" autocomplete="tel"')}${inp("email", "Correo (opcional)", "email", "para tu comprobante", 'autocomplete="email"')}</div>` : ""}
    <button class="btn" type="button" data-a="${a.register ? "h-id-register" : "h-id-go"}" ${a.busy ? "disabled" : ""}>${a.busy ? "Un momento…" : a.register ? "Guardar mis datos" : "Continuar"}</button>
    ${a.register ? `<button class="link" type="button" data-a="h-id-back">Usar otro documento</button>` : `<button class="gbtn" type="button" data-a="h-id-google"><b>G</b>Continuar con Google</button>`}</div>`;
}
V.checkout = () => {
  const r = chosenRoom(); if (!r) return V.rooms(); fixMethod(true);
  const on = !!client(), t = hTotal(), cash = S.pay.method === "CAJA HOTEL", half = S.pay.mode === "HALF" && !cash, now = dueNow();
  const pay = payInfo(S.pay.method);
  const method = (k, name, desc) => `<button type="button" class="pm" data-a="pay-method" data-v="${k}" aria-pressed="${S.pay.method === k}" ${k !== "CAJA HOTEL" && !payInfo(k) ? 'disabled title="El hotel aún no publica este número"' : ""}><span class="pm-lg ${k === "CAJA HOTEL" ? "cash" : k.toLowerCase()}">${k === "YAPE" ? "yape" : k === "PLIN" ? "plin" : ic("receipt")}</span><b>${name}</b><small>${desc}</small></button>`;
  return `<section class="view hflow"><div class="hwrap two"><div class="hmain">${stepper()}
    <header class="hhead"><div><h1>Confirma y paga</h1><p class="lead">Un último paso. Tu habitación ${esc(r.number)} queda separada en cuanto envíes tu pago.</p></div></header>
    ${identity()}
    <div class="blk ${on ? "" : "locked"}" ${on ? "" : 'aria-disabled="true"'}><h2><i class="num">${on ? "1" : "2"}</i>¿Cuánto pagas hoy?</h2>
      <div class="seg big" role="group"><button type="button" data-a="pay-mode" data-v="FULL" aria-pressed="${!half}" ${cash ? "disabled" : ""}><b>Todo</b><small>${money(t)} · sin saldo</small></button><button type="button" data-a="pay-mode" data-v="HALF" aria-pressed="${half}" ${cash ? "disabled" : ""}><b>El 50 %</b><small>${money(round2(t / 2))} hoy · resto antes de llegar</small></button></div></div>
    <div class="blk ${on ? "" : "locked"}"><h2><i class="num">${on ? "2" : "3"}</i>¿Cómo pagas?</h2><div class="pms">${method("YAPE", "Yape", "Al instante")}${method("PLIN", "Plin", "Al instante")}${method("CAJA HOTEL", "En el hotel", "Pagas al llegar")}</div>
      ${cash ? `<div class="note">Guardamos tu reserva y pagas ${money(t)} en la caja del hotel al llegar${hotel().address ? ` (${esc(hotel().address)})` : ""}. Tu llave se activa cuando caja confirme el pago.</div>`
      : `<ol class="ysteps"><li><i>1</i><span>Abre ${S.pay.method === "PLIN" ? "Plin" : "Yape"} y envía <b>${money(now)}</b> a</span><button class="copy" type="button" data-a="copy" data-v="${pay?.raw || ""}">${pay?.num || "—"}${ic("copy")}</button><small>${esc(pay?.holder || "")}</small></li>
          <li><i>2</i><span>En el mensaje escribe tu <b>DNI</b> para que ubiquemos tu pago.</span></li>
          <li><i>3</i><label class="f ${S.errors.code ? "bad" : ""}"><span>Copia aquí el <b>n.º de operación</b></span><input id="paycode" data-bind="pay.code" value="${esc(S.pay.code)}" placeholder="Ej.: 4589123" inputmode="numeric" maxlength="20" autocomplete="off"><span class="err">${S.errors.code || ""}</span></label></li></ol>
        <p class="micro">El hotel compara tu operación con su cuenta y activa tu llave digital; suele tomar pocos minutos en horario de atención.</p>`}
    </div>
    <div class="policy">${ic("receipt")}<span>Puedes pedir la devolución hasta 24 horas después de tu primer pago; se devuelve en 2 días hábiles.</span></div>
    <button class="btn big hide-m" type="button" data-a="h-book" ${on ? "" : "disabled"}>${cash ? "Reservar y pagar en el hotel" : `Enviar mi pago · ${money(now)}`}</button>
  </div>${receipt()}</div></section>`;
};

/* ---------- Acciones ---------- */
Object.assign(A, {
  "h-cal": (d, el) => openRange(el.closest(".cap") || el),
  "h-guests": (d, el) => openGuests({ adults: S.h.adults, kids: S.h.kids, max: 4, anchor: el.closest(".cap") || el, apply: (a, k) => { S.h.adults = a; S.h.kids = k; S.h.roomId = null; S.h.roomType = null; if (onCover()) refresh(); else render(true); } }),
  "h-quick": d => { const t = new Date(today); let a = t, b; if (d.v === "tonight") b = addDays(a, 1); else if (d.v === "weekend") { a = nextFriday(); b = addDays(a, 2); } else b = addDays(a, 3); Object.assign(S.h, { from: ymd(a), to: ymd(b) }); afterDates(); S.h.quick = d.v; refresh(); },
  "h-search": (d, el) => { if (!nights()) { openRange(el && el.closest ? el.closest(".cap") || el : null, () => go("rooms")); return; } go("rooms"); },
  "h-type": d => { S.h.roomType = d.v; const list = roomsFree().filter(r => r.type?.name === d.v); if (!list.some(r => Number(r.id) === Number(S.h.roomId))) S.h.roomId = list[0]?.id || null; roomSheet(); },
  "h-room": d => { S.h.roomId = Number(d.id); roomSheet(); },
  "h-take": () => { closeSheet(); go("plan"); },
  "h-plan": d => { S.h.plan = d.v; if (d.v === "PREMIUM") { const days = stayDays(), def = { PISCINA: days[1] ? [days[1], "09:00"] : [S.h.from, "16:00"], MIRADOR: [S.h.from, "18:00"], TERRAZA: [S.h.from, "20:00"] }; for (const [k] of BUNDLE) if (!S.h.bundle[k].date || !days.includes(S.h.bundle[k].date)) S.h.bundle[k] = { date: def[k][0], slot: def[k][1] }; } render(true); },
  "h-bday": d => { S.h.bundle[d.k].date = d.v; render(true); },
  "h-bslot": d => { S.h.bundle[d.k].slot = d.v; render(true); },
  "h-extra": d => { if (S.h.extras[d.id]) delete S.h.extras[d.id]; else S.h.extras[d.id] = 1; render(true); },
  "h-park": () => { S.h.vehicles = S.h.vehicles.length ? [] : [{ type: "AUTO", plate: "" }]; render(true); },
  "h-vtype": d => { S.h.vehicles[Number(d.i)].type = d.v; render(true); },
  "h-park-add": () => { if (S.h.vehicles.length < 4) S.h.vehicles.push({ type: "AUTO", plate: "" }); render(true); },
  "h-park-del": d => { S.h.vehicles.splice(Number(d.i), 1); render(true); },
  "h-next-plan": () => {
    const bad = {}; S.h.vehicles.forEach((v, i) => { if (String(v.plate || "").trim().length < 5) bad["plate" + i] = "Escribe la placa (o quita la cochera)."; });
    if (Object.keys(bad).length) { S.errors = bad; render(true); document.querySelector(".plate.bad input")?.focus(); return; }
    if (S.h.plan === "PREMIUM") for (const [k] of BUNDLE) if (!S.h.bundle[k].date) S.h.bundle[k].date = S.h.from;
    go("checkout");
  },
  "h-breakdown": () => breakdownSheet(),
  "copy": async (d, el) => { const ok = await copyText(d.v); el.classList.add("copied"); setTimeout(() => el.classList.remove("copied"), 1400); toast(ok ? "Número copiado" : d.v); },
  "h-id-go": async () => {
    const doc = S.auth.doc.trim(); if (!doc) { S.errors = { doc: "Ingresa tu documento." }; render(true); return; }
    S.auth.busy = true; render(true);
    try { const r = await api("/public/document-access", { method: "POST", body: { documentNumber: doc } }); setSession(r); S.auth.busy = false; await loadExp(true); toast(`¡Hola, ${r.client.firstName || ""}!`); render(true); }
    catch (e) { S.auth.busy = false; if (e.status === 404) { S.auth.register = true; S.errors = {}; } else toast(errText(e)); render(true); }
  },
  "h-id-register": async () => {
    const a = S.auth, e = {}, doc = a.doc.trim(), isDni = /^\d+$/.test(doc) && doc.length <= 8;
    if (isDni && !/^\d{8}$/.test(doc)) e.doc = "El DNI tiene 8 dígitos."; if (!isDni && doc.length < 6) e.doc = "Ingresa un documento válido.";
    if (!a.first.trim()) e.first = "Escribe tus nombres."; if (!a.last.trim()) e.last = "Escribe tus apellidos."; if (!/^\d{9}$/.test(a.phone.trim())) e.phone = "El celular tiene 9 dígitos.";
    if (a.email && !/^\S+@\S+\.\S+$/.test(a.email)) e.email = "Revisa el correo.";
    S.errors = e; if (Object.keys(e).length) { render(true); return; }
    a.busy = true; render(true);
    try { const r = await api("/public/identify", { method: "POST", body: { documentType: isDni ? "DNI" : "CE", documentNumber: doc, firstName: a.first.trim(), lastName: a.last.trim(), phone: a.phone.trim(), email: a.email.trim() } }); setSession(r); a.busy = false; await loadExp(true); toast(`¡Bienvenido, ${r.client.firstName}!`); render(true); }
    catch (er) { a.busy = false; toast(errText(er)); render(true); }
  },
  "h-id-back": () => { S.auth.register = false; S.errors = {}; render(true); },
  "h-id-change": () => { localStorage.removeItem("pp_customer_token"); localStorage.removeItem("pp_customer_client"); D.exp = null; S.auth = { doc: "", first: "", last: "", phone: "", email: "", register: false, busy: false }; render(true); },
  "h-id-google": () => { S.authNext = "checkout"; A["auth-google"] && A["auth-google"](); },
  "h-book": async (d, el) => {
    if (!client()) { toast("Primero dinos quién se hospeda."); document.querySelector('[data-bind="auth.doc"]')?.focus(); return; }
    if (!validatePay(true)) { render(true); document.getElementById("paycode")?.focus(); return; }
    const h = S.h, r = chosenRoom(), cash = S.pay.method === "CAJA HOTEL", n = people();
    const body = { serviceCode: "HOSPEDAJE", planCode: h.plan === "DESAYUNO" ? "DESAYUNO" : "FLEX", planName: { FLEX: "Flexible", DESAYUNO: "Descanso con desayuno", PREMIUM: "Premium" }[h.plan], roomId: r.id, checkIn: h.from, checkOut: h.to, date: h.from, slot: "15:00", people: n, adults: h.adults, children: h.kids, guests: [], extras: extrasOf("HOSPEDAJE").filter(e => h.extras[e.id]).map(e => ({ id: e.id })), vehicles: h.vehicles.map(v => ({ type: v.type, plate: v.plate.trim().toUpperCase() })), preferences: { checkInTime: "15:00", checkOutTime: "12:00" }, preorderItems: [], bundleCode: h.plan === "PREMIUM" ? "HOSPEDAJE_PREMIUM" : null, bundleServices: h.plan === "PREMIUM" ? BUNDLE.map(([k]) => ({ serviceCode: k, date: h.bundle[k].date || h.from, slot: h.bundle[k].slot, people: n })) : [], payMode: cash ? "FULL" : S.pay.mode, paymentMethod: S.pay.method, paymentCode: cash ? "" : String(S.pay.code).trim() };
    if (el) el.disabled = true;
    try { const res = await api("/public/bookings", { method: "POST", body }); S.cb = res.booking.id; S.cbKind = "B"; S.pay.code = ""; S.celebrate = res.booking.id; await loadExp(); S.h.roomId = null; go("trip"); }
    catch (e) { toast(errText(e)); if (el) el.disabled = false; if (e.status === 409) { D.rooms = null; } }
  }
});

HOOKS.push(() => {
  const sc = S.screen, info = document.querySelector("#bar .info");
  if (info) { if (["plan", "checkout"].includes(sc)) info.dataset.a = "h-breakdown"; else delete info.dataset.a; }
  if (sc === "plan") setBar(`Total · ${nn()}  ▴`, money(hTotal()), "Continuar");
  if (sc === "checkout") setBar(S.pay.method === "CAJA HOTEL" ? "Pagas en el hotel  ▴" : "Pagas hoy  ▴", money(dueNow()), S.pay.method === "CAJA HOTEL" ? "Reservar" : "Enviar pago", !client());
  countUp(document.getElementById("app"));
});
export const hospBarAction = () => {
  const sc = S.screen;
  if (sc === "plan") return A["h-next-plan"](), true;
  if (sc === "checkout") return A["h-book"]({}, document.getElementById("barBtn")), true;
  return false;
};
