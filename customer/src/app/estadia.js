/* estadia.js (v5): lo que vive el huésped de Hospedaje después de reservar.
   Viaje (pase de embarque + llave + cuenta regresiva) → Estadía (llave digital, pedidos, ayuda, "Hoy en Park Plaza")
   → Salida guiada (cuenta, pedidos, mantener presionado para pedir la salida) → Gracias (tu estadía en números).
   Las demás experiencias (Piscina, Mirador, Terraza) siguen usando las pantallas de site.js. */
import { S, D, V, A, api, esc, money, fmt, fmtLong, parse, ymd, today, go, render, toast, sheet, closeSheet, loadExp, errText, client, hhmm12 } from "./core.js";
import { bstate, passesOf, mainPass, paymentsOf, ordersOf, ORDER_LABEL, orderPending, balanceSheet, SERVICE_NAME, catalog, bookingById, invoicesHTML } from "./common.js";
import { cur } from "./site.js";
import { ic, greet, sunsetPucallpa, limaNow } from "./ui.js";

const baseTrip = V.trip, baseStay = V.stay, baseDone = V.done;
const isH = b => b && b.serviceCode === "HOSPEDAJE";
V.trip = () => { const b = cur(); if (!isH(b)) return baseTrip(); const k = bstate(b).k; if (["onsite", "checkout_wait"].includes(k)) return hStay(b); if (["finished", "cancelled"].includes(k)) return hDone(b); return hTrip(b); };
V.stay = () => { const b = cur(); if (!isH(b)) return baseStay(); const k = bstate(b).k; if (["finished", "cancelled"].includes(k)) return hDone(b); if (!["onsite", "checkout_wait"].includes(k)) return hTrip(b); return hStay(b); };
V.done = () => { const b = cur(); if (!isH(b)) return baseDone(); return hDone(b); };

const first = () => esc(client()?.firstName ? client().firstName.charAt(0) + client().firstName.slice(1).toLowerCase() : "");
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const nightsOf = b => Math.max(1, Math.round((parse(b.checkOut) - parse(b.checkIn)) / 864e5));
const roomName = b => b.room ? `${esc(b.room.type?.name || "")} ${esc(b.room.number)}` : "Por asignar";
const qr = (code, locked, big) => `<span class="qrw ${locked ? "locked" : ""} ${big ? "big" : ""}"><img src="/api/public/pass/${encodeURIComponent(code)}/qr" alt="Código QR de tu llave" width="220" height="220">${locked ? `<em>${ic("lock")}<small>Se activa al confirmar tu pago</small></em>` : ""}</span>`;
// Momento exacto (hora de Lima) para la cuenta regresiva: llegada 3:00 p. m. y salida 12:00 m.
const at = (day, hh) => new Date(`${String(day).slice(0, 10)}T${hh}:00-05:00`).getTime();
const leftTxt = ms => { if (ms <= 0) return "ahora"; const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };
setInterval(() => document.querySelectorAll("[data-cd]").forEach(el => { el.textContent = leftTxt(Number(el.dataset.cd) - Date.now()); }), 30000);

/* ---------- Viaje: de la reserva a la llegada ---------- */
function tracker(i) {
  const names = ["Reserva", "Pago verificado", "Check‑in", "Estadía", "Salida"];
  return `<ol class="trk" style="--p:${i / (names.length - 1)}">${names.map((n, j) => `<li class="${j < i ? "done" : j === i ? "now" : ""}"><i>${j < i ? ic("check") : ""}</i><span>${n}</span></li>`).join("")}</ol>`;
}
function passCard(b, locked) {
  const mp = mainPass(b), st = bstate(b);
  return `<div class="pass"><div class="pass-l"><div class="pass-brand"><img src="/brand/park-plaza-mark.svg" alt=""><span>PARK PLAZA<small>Hospedaje · ${esc(b.code)}</small></span></div>
      <div class="pass-route"><div><small>Llegada</small><b>${fmt(b.checkIn, { weekday: "short", day: "numeric", month: "short" })}</b><em>desde 3:00 p. m.</em></div><span class="pass-n">${ic("bed")}${plural(nightsOf(b), "noche", "noches")}</span><div><small>Salida</small><b>${fmt(b.checkOut, { weekday: "short", day: "numeric", month: "short" })}</b><em>hasta 12:00 m.</em></div></div>
      <dl class="pass-kv"><div><dt>Habitación</dt><dd>${roomName(b)}</dd></div><div><dt>Huéspedes</dt><dd>${b.people}</dd></div><div><dt>Plan</dt><dd>${esc(b.planName || "Flexible")}</dd></div><div><dt>Estado</dt><dd><span class="pill ${st.tone}">${st.label}</span></dd></div></dl></div>
    <div class="pass-cut" aria-hidden="true"></div>
    <div class="pass-r">${mp ? qr(mp.pass.code, locked) : ""}<small>${locked ? "Tu llave digital" : "Muéstrala en recepción"}</small></div></div>`;
}
function addCards(b) {
  const sun = sunsetPucallpa(parse(b.checkIn)), bundle = passesOf(b).filter(x => x.ent.includedByBundle);
  if (bundle.length) return `<div class="blk"><h2>Incluido en tu Premium</h2><ul class="today">${bundle.map(x => `<li>${ic({ PISCINA: "pool", MIRADOR: "sunset", TERRAZA: "dine" }[x.ent.serviceCode] || "spark")}<span><b>${SERVICE_NAME[x.ent.serviceCode]}</b><small>${fmt(x.ent.date)} · ${hhmm12(x.ent.slot)}</small></span><span class="pill ${x.ent.status === "PENDIENTE" ? "warn" : "ok"}">${x.ent.status === "PENDIENTE" ? "Se activa con tu pago" : x.ent.status === "UTILIZADO" ? "Usado" : "Listo"}</span></li>`).join("")}</ul></div>`;
  const low = k => Math.min(...(catalog().plans[k] || []).filter(p => !["NINO", "FAMILIAR"].includes(p.code)).map(p => Number(p.price)).filter(n => n > 0));
  const card = (k, t, s, img) => `<button class="xc" type="button" data-a="add-exp" data-t="${k}" style="background-image:linear-gradient(180deg,rgba(11,16,32,0) 30%,rgba(11,16,32,.92)),url('${img}')"><small>${s}</small><b>${t}</b><span>Reservar ${ic("arrow")}</span></button>`;
  return `<div class="blk"><h2>Haz más de tu estadía</h2><p class="mut">Tus datos ya están guardados: eliges el día y listo.</p><div class="xcs">
    ${card("PISCINA", "Piscina", `Desde ${money(low("PISCINA"))} · 9 a. m. a 6 p. m.`, "/images/hs/piscina.webp")}
    ${card("MIRADOR", "Mirador", sun ? `Atardecer cerca de las ${sun.label}` : "Atardecer sobre el Ucayali", "/images/hs/mirador.webp")}
    ${card("TERRAZA", "Terraza", "Reserva de mesa sin costo", "/images/hs/terraza.webp")}</div></div>`;
}
function hTrip(b) {
  const st = bstate(b), k = st.k, locked = k !== "ready", arrive = at(b.checkIn, "15:00"), celebrate = S.celebrate === b.id;
  if (celebrate) S.celebrate = null;
  const H = { verifying: [`Recibimos tu pago, ${first()}.`, "El hotel lo está verificando con su cuenta. Esta pantalla se actualiza sola y te avisa al aprobarlo."], cash: ["Tu habitación está separada.", `Paga ${money(b.total)} en la caja del hotel al llegar y tu llave se activa en ese momento.`], partial: ["Solo falta tu saldo.", `Paga ${money(b.balance)} antes de llegar para activar tu llave digital.`], ready: [`Todo listo, ${first()}. Te esperamos.`, "Muestra tu llave en recepción al llegar: el check‑in toma un minuto."] }[k] || ["Tu reserva", ""];
  return `<section class="view hflow trip"><div class="hwrap">${celebrate ? `<div class="burst" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${(i % 5) * 40}ms"></i>`).join("")}</div>` : ""}
    <header class="hhead"><div><span class="eyebrow">${ic(k === "ready" ? "check" : "clock")} ${st.label}</span><h1>${H[0]}</h1><p class="lead">${H[1]}</p></div>
      <div class="cd"><small>Tu llegada es en</small><b data-cd="${arrive}">${leftTxt(arrive - Date.now())}</b><span>${fmtLong(b.checkIn)} · 3:00 p. m.</span></div></header>
    ${tracker(k === "ready" ? 2 : 1)}${passCard(b, locked)}
    ${Number(b.balance) > 0.001 && !["verifying", "cash"].includes(k) ? `<div class="blk pay-due"><div><b>Saldo pendiente · ${money(b.balance)}</b><small>Págalo antes de llegar y tu llave se activa al instante de la verificación.</small></div><button class="btn sm" type="button" data-a="pay-balance" data-id="${b.id}">Pagar saldo</button></div>` : ""}
    <div class="g2c"><div class="blk"><h2>Antes de llegar</h2><ul class="chk"><li>${ic("user")}<span><b>Lleva tu DNI</b><small>El mismo documento de la reserva.</small></span></li><li>${ic("key")}<span><b>Tu llave es este QR</b><small>Recepción lo escanea y te entrega la habitación.</small></span></li><li>${ic("clock")}<span><b>Llega desde las 3:00 p. m.</b><small>¿Antes? Pide ingreso temprano en recepción.</small></span></li>${(b.vehicles || []).length ? `<li>${ic("car")}<span><b>Cochera reservada</b><small>${(b.vehicles || []).map(v => esc(v.plate)).join(", ")}</small></span></li>` : ""}</ul></div>
      <div class="blk"><h2>Cómo llegar</h2><div class="arrive"><span>${ic("pin")}Park Plaza · Pucallpa</span></div><a class="btn outline sm" style="width:100%;margin-top:12px" href="https://www.google.com/maps/search/?api=1&query=Park+Plaza+Pucallpa" target="_blank" rel="noopener">Abrir en Google Maps ${ic("arrow")}</a></div></div>
    ${addCards(b)}
    <div class="row-actions"><button class="btn outline sm" type="button" data-a="refresh">Actualizar estado</button><button class="btn outline sm" type="button" data-a="mine">Mis reservas</button></div>
  </div></section>`;
}

/* ---------- Estadía ---------- */
const TABS = [["inicio", "Inicio", "home"], ["pedir", "Pedir", "food"], ["llave", "Llave", "key"], ["cuenta", "Cuenta", "receipt"], ["salida", "Salida", "door"]];
const HELP = [["TOALLAS", "towel", "Toallas", "Toallas adicionales", "¿Te llevamos toallas adicionales a la habitación?"], ["LIMPIEZA", "broom", "Limpieza", "Limpieza de la habitación", "¿Enviamos a limpiar tu habitación?"], ["MANTENIMIENTO", "wrench", "Algo no funciona", "Algo no funciona", "Cuéntanos qué no funciona y enviamos a alguien."], ["CONSERJERIA", "bell", "Recepción", "Hablar con recepción", "¿En qué te ayudamos? Recepción te responde en persona."]];
const REQ_OK = ["RESUELTO", "SOLUCIONADO", "CERRADO", "FINALIZADA", "ATENDIDO", "COMPLETADO"];
function stayProgress(b) {
  const a = at(b.checkIn, "15:00"), z = at(b.checkOut, "12:00"), now = Date.now(), p = Math.max(0, Math.min(1, (now - a) / (z - a))), n = nightsOf(b);
  const night = Math.min(n, Math.max(1, Math.floor((now - a) / 864e5) + 1));
  return `<div class="sp"><div class="sp-top"><div><small>Hab. ${esc(b.room?.number || "—")} · ${esc(b.room?.type?.name || "")}</small><b>Noche ${night} de ${n}</b></div><div class="sp-left"><small>Te quedan</small><b data-cd="${z}">${leftTxt(z - now)}</b></div></div>
    <div class="sp-bar"><i style="width:${Math.round(p * 100)}%"></i>${Array.from({ length: n - 1 }, (_, i) => `<em style="left:${((i + 1) / n) * 100}%"></em>`).join("")}</div>
    <div class="sp-ft"><span>Llegaste ${fmt(b.checkIn)}</span><span>Sales ${fmt(b.checkOut)} · 12:00 m.</span></div></div>`;
}
function hStay(b) {
  const tab = TABS.some(t => t[0] === S.tab) ? S.tab : "inicio", wait = bstate(b).k === "checkout_wait", pend = ordersOf(b).filter(orderPending).length;
  const body = { inicio: sInicio, pedir: sPedir, llave: sLlave, cuenta: sCuenta, salida: sSalida }[tab](b);
  return `<section class="view hflow stay"><div class="hwrap"><header class="shead"><div><span class="eyebrow">${greet()}</span><h1>${wait ? "Tu salida está en revisión" : `Estás en casa, ${first()}.`}</h1></div></header>
    ${stayProgress(b)}
    <nav class="dock" role="tablist" aria-label="Tu estadía">${TABS.map(([k, n, i]) => `<button role="tab" type="button" data-a="tab" data-v="${k}" aria-selected="${tab === k}">${ic(i)}<span>${n}</span>${k === "pedir" && pend ? `<em>${pend}</em>` : ""}${k === "salida" && wait ? `<em class="dot"></em>` : ""}</button>`).join("")}</nav>
    <div class="sbody">${body}</div></div></section>`;
}
function sInicio(b) {
  const mp = mainPass(b), wait = bstate(b).k === "checkout_wait", reqs = (D.exp?.requests || []).filter(r => !String(r.description || "").startsWith("Opinión")).slice(0, 5);
  const sun = sunsetPucallpa(), nowH = limaNow().h, bundle = passesOf(b).filter(x => x.ent.includedByBundle), todayK = ymd(today);
  const inc = k => bundle.find(x => x.ent.serviceCode === k && x.ent.date === todayK);
  const svc = [["PISCINA", "Piscina", "pool", "9:00 a. m. – 6:00 p. m.", nowH < 18], ["MIRADOR", "Mirador", "sunset", sun ? `Atardecer cerca de las ${sun.label}` : "4:30 p. m. – 9:00 p. m.", nowH < 21], ["TERRAZA", "Terraza", "dine", "12:00 m. – 11:00 p. m.", nowH < 23]];
  return `${wait ? `<button class="banner" type="button" data-a="tab" data-v="salida"><i class="pulse"></i><span><b>Recepción revisa tu habitación</b><small>Toca para ver el estado de tu salida.</small></span>${ic("arrow")}</button>` : ""}
    <div class="g2c"><button class="keyc" type="button" data-a="key-full" ${mp ? "" : "disabled"}><span class="keyc-tx"><small>Tu llave digital</small><b>Hab. ${esc(b.room?.number || "—")}</b><em>Toca para mostrarla</em></span>${mp ? `<span class="keyc-qr"><img src="/api/public/pass/${encodeURIComponent(mp.pass.code)}/qr" alt=""></span>` : ""}</button>
      <div class="blk"><h2>¿Qué necesitas?</h2><div class="need"><button type="button" data-a="tab" data-v="pedir">${ic("food")}<span>Pedir comida</span></button>${HELP.map(([k, i, n]) => `<button type="button" data-a="help-ask" data-type="${k}">${ic(i)}<span>${n}</span></button>`).join("")}<button type="button" data-a="help-ask" data-type="LATE">${ic("clock")}<span>Salida tardía</span></button></div></div></div>
    ${reqs.length ? `<div class="blk"><h2>Tus solicitudes</h2><ul class="reqs">${reqs.map(r => { const ok = REQ_OK.includes(String(r.status).toUpperCase()); return `<li><span><b>${esc(r.description || r.type)}</b><small>${esc(r.code || "")}</small></span><span class="pill ${ok ? "ok" : "warn"}">${ok ? "Atendida" : String(r.status).toUpperCase() === "PENDIENTE" ? "Recibida" : esc(String(r.status).toLowerCase().replace(/_/g, " "))}</span></li>`; }).join("")}</ul></div>` : ""}
    <div class="blk" id="hoy"><h2>Hoy en Park Plaza</h2><ul class="today">${svc.map(([k, n, i, s, open]) => { const x = inc(k); return `<li>${ic(i)}<span><b>${n}</b><small>${s}</small></span>${x ? `<span class="pill ok">Incluido · ${hhmm12(x.ent.slot)}</span>` : open ? `<button class="chip sm" type="button" data-a="add-exp" data-t="${k}">Reservar</button>` : `<span class="pill gray">Cerrado por hoy</span>`}</li>`; }).join("")}</ul></div>
    ${wait ? "" : `<button class="outc" type="button" data-a="tab" data-v="salida">${ic("door")}<span><b>Tu salida: ${fmt(b.checkOut)} hasta las 12:00 m.</b><small>Prepárala desde aquí, sin filas.</small></span>${ic("arrow")}</button>`}`;
}
const menuFor = svc => (catalog().restaurantMenu || []).filter(m => { const a = Array.isArray(m.availableFor) ? m.availableFor : String(m.availableFor || "").split(/[\s,|]+/); const list = a.map(x => String(x).toUpperCase()).filter(Boolean); return m.salesEnabled === true && (!list.length || list.includes(svc)); });
const ORDER_STEPS = ["Recibido", "En cocina", "En camino", "Entregado"];
const orderStep = s => ({ PENDIENTE: 0, ACEPTADO: 0, EN_COCINA: 1, EN_PREPARACION: 1, PREPARANDO: 1, LISTO: 2, ENTREGADO: 3 }[s] ?? 0);
function sPedir(b) {
  const menu = menuFor("HOSPEDAJE"), items = menu.filter(m => S.cart[m.id]), qty = items.reduce((s, m) => s + S.cart[m.id], 0), tot = items.reduce((s, m) => s + Number(m.price) * S.cart[m.id], 0), orders = ordersOf(b);
  return `<div class="blk"><h2>A tu habitación</h2><p class="mut">Pagas con Yape o Plin al enviar y lo llevamos a la ${esc(b.room?.number || "habitación")}.</p>
    ${menu.length ? `<div class="dishes">${menu.map(m => `<div class="dsh ${S.cart[m.id] ? "on" : ""}"><div class="dsh-im">${m.image ? `<img src="${esc(m.image)}" alt="" loading="lazy">` : ic("food")}</div><div class="dsh-tx"><b>${esc(m.name)}</b><small>${esc((m.tags || []).slice(0, 3).join(" · "))}</small><div class="dsh-ft"><b>${money(m.price)}</b><span class="qtyrow"><button class="stepper" type="button" data-a="dish" data-id="${m.id}" data-v="-1" ${S.cart[m.id] ? "" : "disabled"} aria-label="Quitar ${esc(m.name)}">−</button><b>${S.cart[m.id] || 0}</b><button class="stepper" type="button" data-a="dish" data-id="${m.id}" data-v="1" aria-label="Agregar ${esc(m.name)}">+</button></span></div></div></div>`).join("")}</div>` : `<p class="mut">Por ahora la cocina no tiene platos habilitados para habitaciones.</p>`}</div>
    ${items.length ? `<div class="cart"><div class="cart-hd"><b>${plural(qty, "plato", "platos")} · ${money(tot)}</b><div class="seg sm" role="group"><button type="button" data-a="pay-method" data-v="YAPE" aria-pressed="${S.pay.method !== "PLIN"}">Yape</button><button type="button" data-a="pay-method" data-v="PLIN" aria-pressed="${S.pay.method === "PLIN"}">Plin</button></div></div><button class="btn" type="button" data-a="send-order" data-id="${b.id}">Pagar y pedir · ${money(tot)}</button></div>` : ""}
    <div class="blk"><h2>Tus pedidos</h2>${orders.length ? `<ul class="ords">${orders.slice().reverse().map(o => { const cancel = o.status === "CANCELADO", i = orderStep(o.status); return `<li><div class="ord-hd"><b>${esc(o.code)}</b><span>${money(o.total)}</span></div><small>${(o.items || []).map(x => `${x.quantity}× ${esc(x.name)}`).join(" · ")}</small>${cancel ? `<span class="pill bad">Cancelado</span>` : `<ol class="mini">${ORDER_STEPS.map((n, j) => `<li class="${j < i ? "done" : j === i ? "now" : ""}">${n}</li>`).join("")}</ol>`}</li>`; }).join("")}</ul>` : `<p class="mut">Aún no has pedido nada.</p>`}</div>`;
}
function sLlave(b) {
  const list = passesOf(b), main = mainPass(b), rest = list.filter(x => x !== main);
  return `<div class="blk keyfull">${main ? qr(main.pass.code, false, true) : ""}<b>Hab. ${esc(b.room?.number || "—")} · ${esc(b.room?.type?.name || "")}</b><small>Muestra este código en recepción. Cada servicio tiene su propio QR: uno no abre otro.</small></div>
    ${rest.length ? `<div class="blk"><h2>Tus otros pases</h2><ul class="today">${rest.map(x => `<li><img class="qrs" src="/api/public/pass/${encodeURIComponent(x.pass.code)}/qr" alt=""><span><b>${SERVICE_NAME[x.ent.serviceCode] || x.ent.serviceCode}</b><small>${fmt(x.ent.date)} · ${hhmm12(x.ent.slot)} · ${x.ent.people} pers.</small></span><span class="pill ${x.ent.status === "PENDIENTE" ? "warn" : "ok"}">${x.ent.status === "PENDIENTE" ? "Pendiente de pago" : x.ent.status === "UTILIZADO" ? "Usado" : "Listo"}</span></li>`).join("")}</ul></div>` : ""}`;
}
function statement(b) {
  const pays = paymentsOf(b), orders = ordersOf(b).filter(o => o.status !== "CANCELADO"), bal = Number(b.balance) > 0.001;
  return `<ul class="stmt"><li><span>${ic("bed")}<b>Estadía · ${esc(b.planName || "Flexible")}</b><small>${roomName(b)} · ${plural(nightsOf(b), "noche", "noches")}</small></span><b>${money(b.total)}</b></li>
    ${orders.map(o => `<li class="${o.paymentStatus === "PAGADO" ? "paid" : ""}"><span>${ic("food")}<b>Pedido ${esc(o.code)}</b><small>${(o.items || []).map(i => `${i.quantity}× ${esc(i.name)}`).join(", ")}${o.paymentStatus === "PAGADO" ? " · pagado al pedir" : ""}</small></span><b>${money(o.total)}</b></li>`).join("")}
    ${pays.map(p => `<li class="paid"><span>${ic("check")}<b>Pago ${esc(p.method)}</b><small>${esc(p.concept || "")}${p.createdAt ? ` · ${new Date(p.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}` : ""}</small></span><b>− ${money(p.amount)}</b></li>`).join("")}</ul>
    <div class="stmt-tot ${bal ? "due" : "ok"}"><span>${bal ? "Saldo por pagar" : "Tu cuenta está al día"}</span><b>${money(b.balance)}</b></div>
    ${bal ? `<button class="btn" type="button" data-a="pay-balance" data-id="${b.id}">Pagar saldo · ${money(b.balance)}</button>` : ""}${invoicesHTML(b, { inline: true })}`;
}
const sCuenta = b => `<div class="blk"><h2>Tu cuenta</h2>${statement(b)}</div>`;
function sSalida(b) {
  const st = bstate(b), pend = ordersOf(b).filter(orderPending), bal = Number(b.balance) > 0.001, wait = st.k === "checkout_wait", can = !pend.length && !bal;
  if (wait) { const t = new Date(b.checkoutRequestedAt).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
    return `<div class="blk waitc"><span class="ring">${ic("door")}</span><h2>Recepción revisa la habitación ${esc(b.room?.number || "")}</h2><p class="mut">Suele tomar unos minutos. Puedes esperar en el lobby o seguir disfrutando del hotel.</p>
      <ol class="vt"><li class="done"><i>${ic("check")}</i><span><b>Solicitaste tu salida</b><small>${t}</small></span></li><li class="now"><i></i><span><b>Revisión de la habitación</b><small>Confirman el estado del cuarto y tu cuenta.</small></span></li><li><i></i><span><b>Salida confirmada</b><small>Tu llave digital se desactiva y recibes tu comprobante.</small></span></li></ol></div>`; }
  return `<div class="blk"><h2>Tu salida, en tres pasos</h2><p class="mut">Sales el ${fmtLong(b.checkOut)} hasta las 12:00 m. Cuando todo esté en verde, pides la salida y recepción revisa la habitación.</p>
    <ol class="vt"><li class="${bal ? "now" : "done"}"><i>${bal ? "1" : ic("check")}</i><span><b>${bal ? `Saldo pendiente: ${money(b.balance)}` : "Tu cuenta está al día"}</b><small>${bal ? "Págalo aquí mismo con Yape o Plin." : "No debes nada."}</small>${bal ? `<button class="btn sm" type="button" data-a="pay-balance" data-id="${b.id}">Pagar saldo</button>` : ""}</span></li>
      <li class="${pend.length ? "now" : "done"}"><i>${pend.length ? "2" : ic("check")}</i><span><b>${pend.length ? `${plural(pend.length, "pedido", "pedidos")} en camino` : "Sin pedidos en curso"}</b><small>${pend.length ? "Espera a que lleguen a tu habitación." : "Todo entregado."}</small></span></li>
      <li class="${can ? "now" : ""}"><i>3</i><span><b>Entrega tu habitación</b><small>Recepción revisa el cuarto y cierra tu estadía.</small></span></li></ol>
    <button class="hold" type="button" data-hold="checkout" data-id="${b.id}" ${can ? "" : "disabled"} aria-label="Mantén presionado para solicitar tu salida"><i></i><span>${can ? "Mantén presionado para pedir tu salida" : "Completa los pasos para pedir tu salida"}</span></button>
    <button class="link" type="button" data-a="help-ask" data-type="LATE">¿Necesitas más tiempo? Pide salida tardía</button></div>
    <div class="blk"><h2>Tu cuenta</h2>${statement(b)}</div>`;
}

/* ---------- Gracias ---------- */
const STAR_TXT = ["", "Mala", "Regular", "Buena", "Muy buena", "Excelente"];
function hDone(b) {
  if (bstate(b).k === "cancelled") return `<section class="view hflow"><div class="hwrap narrow"><div class="blk center"><span class="ring">${ic("x")}</span><h1>Reserva cancelada</h1><p class="lead">Si pagaste, el hotel te devuelve el dinero en 2 días hábiles.</p><button class="btn" type="button" data-a="mine">Ver mis reservas</button></div></div></section>`;
  const orders = ordersOf(b).filter(o => o.status !== "CANCELADO"), used = passesOf(b).filter(x => x.ent.includedByBundle && x.ent.status === "UTILIZADO").length, spent = Number(b.total) + orders.reduce((s, o) => s + Number(o.total), 0);
  return `<section class="view hflow done"><div class="hwrap narrow"><header class="hhead center"><div><span class="eyebrow">Hasta pronto</span><h1>Gracias por quedarte con nosotros, ${first()}.</h1><p class="lead">Tu estadía ${esc(b.code)} terminó y tu llave ya no está activa.</p></div></header>
    <div class="nums"><div><b>${nightsOf(b)}</b><small>${nightsOf(b) === 1 ? "noche" : "noches"}</small></div><div><b>${orders.length}</b><small>${orders.length === 1 ? "pedido" : "pedidos"}</small></div>${used ? `<div><b>${used}</b><small>${used === 1 ? "experiencia" : "experiencias"}</small></div>` : ""}<div><b>${money(spent)}</b><small>en total</small></div></div>
    <div class="blk"><h2>¿Cómo estuvo tu estadía?</h2><div class="stars" role="group" aria-label="Calificación">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-a="star" data-v="${i}" class="${(S.rating || 0) >= i ? "on" : ""}" aria-label="${i} de 5: ${STAR_TXT[i]}">${ic("star")}</button>`).join("")}<span>${STAR_TXT[S.rating || 0] || "Toca una estrella"}</span></div>
      <label class="f">Cuéntanos algo (opcional)<textarea data-bind="ratingNote" placeholder="Lo que más te gustó o lo que podemos mejorar">${esc(S.ratingNote || "")}</textarea></label><button class="btn outline" type="button" data-a="h-rate" data-id="${b.id}" ${S.rating ? "" : "disabled"}>Enviar mi opinión</button></div>
    <div class="blk"><h2>Tu comprobante</h2>${statement(b)}<button class="chip no-print" type="button" onclick="window.print()">Descargar o imprimir</button></div>
    <button class="btn big" type="button" data-a="h-again">Reservar otra estadía ${ic("arrow")}</button></div></section>`;
}

/* ---------- Acciones ---------- */
Object.assign(A, {
  "key-full": () => { const b = cur(), mp = b && mainPass(b); if (!mp) return; sheet(`<div class="keysheet">${qr(mp.pass.code, false, true)}<b>Hab. ${esc(b.room?.number || "—")}</b><small>${esc(client()?.firstName || "")} ${esc(client()?.lastName || "")} · ${esc(b.code)}</small><p class="mut">Sube el brillo de tu pantalla para que lo lean más rápido.</p><button class="btn outline" type="button" data-a="close">Listo</button></div>`, "keyview", null); },
  "help-ask": d => {
    const late = d.type === "LATE", h = HELP.find(x => x[0] === d.type) || ["CONSERJERIA", "clock", "Salida tardía", "Salida tardía", "¿Quieres quedarte más tiempo? Recepción te confirma si es posible y su costo."];
    const room = cur()?.room?.number;
    S.helpNote = ""; sheet(`<div class="sheethead"><h2>${ic(h[1])} ${h[3]}</h2><button class="xbtn" data-a="close" type="button" aria-label="Cerrar">${ic("x")}</button></div><p class="mut">${h[4]}</p>
      <label class="f">Detalle (opcional)<textarea data-bind="helpNote" placeholder="${d.type === "MANTENIMIENTO" ? "Ej.: el aire acondicionado no enfría" : "Algo que debamos saber"}"></textarea></label>
      <button class="btn" type="button" data-a="help-send" data-type="${late ? "CONSERJERIA" : h[0]}" data-text="${esc(late ? "Solicito salida tardía" : h[3])}">Enviar a ${late || h[0] === "CONSERJERIA" ? "recepción" : "la habitación " + esc(room || "")}</button>`, "helpsheet", null);
  },
  "help-send": async (d, el) => { el.disabled = true; const note = String(S.helpNote || "").trim(); try { await api("/public/requests", { method: "POST", body: { type: d.type, description: note ? `${d.text}: ${note}` : d.text } }); closeSheet(); await loadExp(); toast("Listo, el personal ya lo sabe"); render(true); } catch (e) { toast(errText(e)); el.disabled = false; } },
  "add-exp": d => { const b = cur(); A["v-new"]({ t: d.t }); if (S.v && b) { const dd = ymd(today) >= b.checkIn && ymd(today) < b.checkOut ? ymd(today) : b.checkIn; S.v.date = dd >= ymd(today) ? dd : null; S.v.adults = Math.min(b.adults || b.people || 2, 8); render(true); } },
  "h-rate": async (d, el) => { const b = bookingById(d.id); el.disabled = true; const note = String(S.ratingNote || "").trim(); try { await api("/public/requests", { method: "POST", body: { type: "OTRO", description: `Opinión de estadía ${b.code}: ${S.rating}/5 estrellas.${note ? ` ${note}` : ""}`, location: `Reserva ${b.code}` } }); toast("¡Gracias por tu opinión!"); el.textContent = "Opinión enviada"; } catch (e) { toast(errText(e)); el.disabled = false; } },
  "h-again": () => { const b = cur(); if (b) { S.h.adults = b.adults || 2; S.h.kids = b.children || 0; } S.h.from = null; S.h.to = null; S.exp = "HOSPEDAJE"; go("servicios"); }
});

/* Mantener presionado para pedir la salida (evita pedirla por un toque accidental). Con teclado: confirmación en hoja. */
let holdT = null;
const stopHold = () => { clearTimeout(holdT); document.querySelectorAll(".hold.holding").forEach(x => x.classList.remove("holding")); };
document.addEventListener("pointerdown", ev => { const h = ev.target.closest && ev.target.closest(".hold[data-hold]"); if (!h || h.disabled) return; h.classList.add("holding"); holdT = setTimeout(() => { h.classList.remove("holding"); h.classList.add("fired"); A.checkout({ id: h.dataset.id }, h); }, 1300); });
["pointerup", "pointerleave", "pointercancel"].forEach(t => document.addEventListener(t, stopHold, true));
document.addEventListener("keydown", ev => { const h = ev.target.closest && ev.target.closest(".hold[data-hold]"); if (!h || h.disabled || !["Enter", " "].includes(ev.key)) return; ev.preventDefault();
  sheet(`<h2>¿Pedimos tu salida?</h2><p class="mut">Recepción revisará la habitación y cerrará tu estadía.</p><button class="btn" type="button" data-a="checkout" data-id="${h.dataset.id}">Sí, pedir mi salida</button><button class="btn outline" type="button" data-a="close">Todavía no</button>`, "confirm", null); });
