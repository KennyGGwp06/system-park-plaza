/* site.js: seguimiento de una reserva (pase, saldo, check-in), estadía, pedidos, ayuda, cuenta, salida y "Mis reservas". */
import { S, D, V, A, BACK, api, esc, money, fmt, fmtLong, parse, today, go, render, toast, sheet, closeSheet, timeline, requireLogin, loadExp, errText, HOOKS, client, hhmm12 } from "./core.js";
import { bstate, estate, allItems, bookingById, passesOf, mainPass, qrImg, paymentsOf, ordersOf, ORDER_LABEL, orderPending, balanceSheet, SERVICE_NAME, SERVICE_IMG, catalog, round2, hotel, invoicesHTML } from "./common.js";

Object.assign(BACK, { trip: "mine", stay: "trip", mine: "home", done: "mine" });
const svcOf = b => b.serviceCode;
export const cur = () => bookingById(S.cb);
const dateOf = b => b.checkIn || b.date;
// Etiqueta y tono del pase según el estado real del acceso (ACTIVO = huésped dentro; no es "pendiente").
const PASS_LABEL = { PENDIENTE: ["Pendiente de pago", "warn"], LISTO_INGRESO: ["Listo", "ok"], ACTIVO: ["Activo", "ok"], UTILIZADO: ["En uso", "ok"], FINALIZADO: ["Finalizado", "gray"], REVOCADO: ["Desactivado", "bad"] };
const passLabel = st => PASS_LABEL[st] || [String(st || "").toLowerCase().replace(/_/g, " "), "warn"];
const HELP = { HOSPEDAJE: [["TOALLAS", "🧺", "Toallas adicionales"], ["LIMPIEZA", "🧹", "Limpieza de la habitación"], ["MANTENIMIENTO", "🔧", "Algo no funciona"], ["CONSERJERIA", "🛎️", "Hablar con recepción"]], OTRO: [["CONSERJERIA", "🙋", "Llamar al personal"], ["OTRO", "💬", "Otra cosa"]] };

/* ---------- Mis reservas ---------- */
V.mine = () => {
  if (!client()) return `<section class="view"><div class="layout" style="max-width:760px;margin:0 auto"><div><span class="eyebrow">Mis reservas</span><h1>Encuentra tus reservas</h1><p class="lead">Ingresa con tu DNI para ver todo lo que reservaste.</p></div><button class="btn" data-a="login" type="button">Ingresar con mi DNI →</button></div></section>`;
  const items = allItems();
  const card = it => it.kind === "B" ? (() => { const b = it.b, st = bstate(b); return `<button class="hubcard" type="button" data-a="open-b" data-id="${b.id}"><img src="${SERVICE_IMG[b.serviceCode] || SERVICE_IMG.HOSPEDAJE}" alt=""><span class="tx"><b>${SERVICE_NAME[b.serviceCode] || b.serviceCode}</b><span class="mut">${b.serviceCode === "HOSPEDAJE" ? `${fmt(b.checkIn)} → ${fmt(b.checkOut)}${b.room ? ` · Hab. ${esc(b.room.number)}` : ""}` : `${fmt(b.date)} · ${hhmm12(b.slot)} · ${b.people} pers.`}</span><span><span class="pill ${st.tone}">${st.label}</span> <span class="micro">${esc(b.code)}</span></span></span><span style="font-size:22px;color:var(--deep)">›</span></button>`; })()
    : (() => { const e = it.e, st = estate(e); return `<button class="hubcard" type="button" data-a="open-e" data-id="${e.id}"><img src="${SERVICE_IMG.EVENTOS}" alt=""><span class="tx"><b>Evento · ${esc(e.name || "Evento")}</b><span class="mut">${fmt(e.startsAt)} · ${e.guests} invitados</span><span><span class="pill ${st.tone}">${st.label}</span> <span class="micro">${esc(e.code)}</span></span></span><span style="font-size:22px;color:var(--deep)">›</span></button>`; })();
  return `<section class="view"><div class="layout" style="max-width:820px;margin:0 auto"><div><span class="eyebrow">${esc(client().firstName || "Tu cuenta")} ${esc(client().lastName || "")}</span><h1>Mis reservas</h1><p class="lead">Todo lo que reservaste en Park Plaza, en un solo lugar.</p></div>
  ${items.length ? `<div class="stack">${items.map(card).join("")}</div>` : D.exp ? `<div class="empty"><b>Aún no tienes reservas</b><p class="mut" style="margin-top:6px">Elige una experiencia y empieza.</p></div>` : `<div class="empty"><b>Cargando tus reservas…</b></div>`}
  <div class="card stack"><h2>Reservar otra experiencia</h2><div class="chips">${["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"].map(k => `<button class="chip" type="button" data-a="start-exp" data-t="${k}">${k === "HOSPEDAJE" ? "Hospedaje" : SERVICE_NAME[k]}</button>`).join("")}</div><span class="micro">Tus datos ya están guardados: solo eliges fecha y pagas.</span></div></div></section>`;
};

/* ---------- Seguimiento de la reserva ---------- */
V.trip = () => {
  const b = cur(); if (!b) return V.mine();
  const st = bstate(b), name = SERVICE_NAME[svcOf(b)], hosp = b.serviceCode === "HOSPEDAJE", mp = mainPass(b), ready = ["ready", "partial"].includes(st.k) && b.accessStatus !== "PENDIENTE_PAGO";
  if (["onsite", "checkout_wait"].includes(st.k)) return V.stay();
  if (["finished", "cancelled"].includes(st.k)) return V.done();
  const H = { verifying: ["Estamos verificando tu pago", "El hotel compara tu operación con el banco. Suele tardar pocos minutos en horario de atención."], cash: ["Paga en la caja del hotel", "Tu reserva queda guardada. Cuando caja confirme el pago se activa tu pase."], partial: ["Falta completar tu saldo", `Paga ${money(b.balance)} para activar tu pase de acceso.`], ready: ["¡Tu reserva está confirmada!", "Muestra tu QR al llegar: el personal valida tu ingreso."] }[st.k];
  const locked = st.k !== "ready";
  const days = Math.max(0, Math.round((parse(dateOf(b)) - today) / 864e5));
  const line = [{ s: "done", t: "Reserva creada", d: b.code }, { s: st.k === "verifying" || st.k === "cash" ? "now" : "done", t: b.paymentMethod === "CAJA HOTEL" || st.k === "cash" ? "Pago en caja" : "Pago verificado por el hotel", d: st.k === "verifying" ? "En verificación…" : st.k === "cash" ? "Pendiente" : "Aprobado" }, { s: st.k === "partial" ? "now" : st.k === "ready" ? "done" : "", t: "Saldo completo", d: Number(b.balance) > 0.001 ? `Faltan ${money(b.balance)}` : "Sin saldo pendiente" }, { s: st.k === "ready" ? "now" : "", t: hosp ? "Llegada y check‑in" : "Llegada y validación del QR", d: `${fmt(dateOf(b))}${hosp ? " desde las 3:00 p. m." : ` · ${hhmm12(b.slot)}`}` }, { s: "", t: hosp ? "Estadía" : "Disfrutas", d: "Pedidos y ayuda desde tu celular" }, { s: "", t: hosp ? "Check‑out" : "Sales", d: "Sin filas" }];
  const bundle = passesOf(b).filter(x => x.ent.includedByBundle);
  return `<section class="view"><div class="layout two"><div class="stack"><div><span class="eyebrow">${name} · ${esc(b.code)}</span><h1>${H[0]}</h1><p class="lead">${H[1]}</p></div>
  <div class="feature"><span class="eyebrow">${st.label}</span><h2 style="margin:6px 0">${days === 0 ? "Es hoy" : days === 1 ? "Es mañana" : `Faltan ${days} días`}</h2><div class="g2" style="color:#fff"><div><small style="color:#C7DBF0">${hosp ? "Llegada" : "Día"}</small><b>${fmtLong(dateOf(b))}</b></div><div><small style="color:#C7DBF0">${hosp ? "Salida" : "Horario"}</small><b>${hosp ? fmtLong(b.checkOut) : hhmm12(b.slot)}</b></div></div></div>
  <div class="ticket"><div class="hd"><small style="letter-spacing:.2em;color:var(--sky)">CÓDIGO DE RESERVA</small><div class="code">${esc(b.code)}</div><span class="pill ${st.tone}">${st.label}</span></div>
    <div class="bd"><div class="g2"><div><small>${hosp ? "Habitación" : "Servicio"}</small><b>${hosp ? esc(b.room ? `${b.room.type?.name || ""} ${b.room.number}` : "—") : name}</b></div><div><small>Personas</small><b>${b.people}</b></div><div><small>Total</small><b>${money(b.total)}</b></div><div><small>Saldo</small><b>${money(b.balance)}</b></div></div>
      ${mp ? `<div class="qrbox">${qrImg(mp.pass.code, locked)}<div><b>Pase de ${name.toLowerCase()}</b><p class="mut">${locked ? (st.k === "partial" ? `Se activa cuando completes el saldo de ${money(b.balance)}.` : "Se activa cuando el hotel confirme tu pago.") : `Preséntalo ${hosp ? "en recepción" : "al llegar"}. Solo abre este servicio.`}</p></div></div>` : ""}</div></div>
  <div class="card stack"><h2>Tu camino</h2>${timeline(line)}</div>
  ${bundle.length ? `<div class="card stack"><h2>Incluido en tu Premium</h2>${bundle.map(x => `<div class="row"><span><b>${SERVICE_NAME[x.ent.serviceCode]}</b><small>${fmt(x.ent.date)} · ${hhmm12(x.ent.slot)} · ${x.ent.people} pers.</small></span><span class="pill ${passLabel(x.ent.status)[1]}">${x.ent.status === "LISTO_INGRESO" ? "QR listo" : passLabel(x.ent.status)[0]}</span></div>`).join("")}</div>` : ""}
  ${hosp ? `<div class="card stack"><h2>Cómo llegar</h2><div class="map"><span>📍 ${esc(hotel().name || "Park Plaza")} · ${esc(hotel().address || "Pucallpa")}</span></div><ul style="margin-left:18px;font-size:14px;color:#2A3550;display:grid;gap:6px"><li>Lleva tu DNI o pasaporte (el mismo de la reserva).</li><li>Muestra tu QR en recepción: ellos validan tu check‑in.</li><li>Check‑in desde las 3:00 p. m. · check‑out hasta las 12:00 m.</li></ul></div>` : ""}</div>
  <aside class="sum"><div class="card stack">${Number(b.balance) > 0.001 && st.k !== "verifying" && st.k !== "cash" ? `<div class="row t" style="padding:0"><span>Saldo pendiente</span><span class="money">${money(b.balance)}</span></div><button class="btn" data-a="pay-balance" data-id="${b.id}" type="button">Pagar saldo · ${money(b.balance)}</button>` : `<div class="row t" style="padding:0"><span>Saldo pendiente</span><span class="money">${money(b.balance)}</span></div>`}
    ${st.k === "verifying" ? `<div class="note warn">Estamos verificando tu operación. Esta pantalla se actualiza sola.</div>` : ""}
    <button class="btn outline" data-a="refresh" type="button">↻ Actualizar estado</button><button class="btn outline" data-a="mine" type="button">Ver mis reservas</button></div></aside></div></section>`;
};

/* ---------- En sitio ---------- */
const canOrder = b => b.serviceCode !== "TERRAZA" && ["HOSPEDAJE", "PISCINA", "MIRADOR"].includes(b.serviceCode) && bstate(b).k === "onsite";
const menuFor = svc => (catalog().restaurantMenu || []).filter(m => { const a = Array.isArray(m.availableFor) ? m.availableFor : String(m.availableFor || "").split(/[\s,|]+/); const list = a.map(x => String(x).toUpperCase()).filter(Boolean); return m.salesEnabled === true && (svc === "TERRAZA" || !list.length || list.includes(svc)); });
V.stay = () => {
  const b = cur(); if (!b) return V.mine(); const st = bstate(b), name = SERVICE_NAME[b.serviceCode], tab = S.tab, hosp = b.serviceCode === "HOSPEDAJE";
  if (["finished", "cancelled"].includes(st.k)) return V.done();
  const tabs = [["inicio", "Inicio"], ["pedidos", "Pedidos"], ["accesos", "Mis accesos"], ["cuenta", "Mi cuenta"], ...(hosp ? [["salida", "Salida"]] : [])];
  const pend = ordersOf(b).filter(orderPending).length;
  const body = tab === "pedidos" ? stayOrders(b) : tab === "accesos" ? stayAccess(b) : tab === "cuenta" ? account(b) : tab === "salida" && hosp ? stayExit(b) : stayHome(b);
  return `<section class="view"><div class="layout" style="max-width:860px;margin:0 auto"><div><span class="eyebrow">${name}${hosp && b.room ? ` · Hab. ${esc(b.room.number)}` : ""}</span><h1>${st.k === "checkout_wait" ? "Recepción revisa tu salida" : `Disfruta, ${esc(client()?.firstName || "")}`}</h1></div>
  <div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" type="button" data-a="tab" data-v="${k}" aria-selected="${tab === k}">${n}${k === "pedidos" && pend ? ` (${pend})` : ""}</button>`).join("")}</div><div class="stack">${body}</div></div></section>`;
};
function stayHome(b) {
  const hosp = b.serviceCode === "HOSPEDAJE", reqs = (D.exp?.requests || []).filter(r => r.type !== "OTRO" || !String(r.description).startsWith("Opinión")).slice(0, 6), H = HELP[hosp ? "HOSPEDAJE" : "OTRO"];
  return `<div class="feature"><span class="eyebrow">${hosp ? "Tu habitación" : "Tu visita"}</span><h2 style="margin:6px 0">${hosp ? `N.º ${esc(b.room?.number || "—")} · ${esc(b.room?.type?.name || "")}` : `${SERVICE_NAME[b.serviceCode]} · ${hhmm12(b.slot)}`}</h2><div class="g2" style="color:#fff"><div><small style="color:#C7DBF0">${hosp ? "Salida" : "Día"}</small><b>${fmt(hosp ? b.checkOut : b.date)}</b></div><div><small style="color:#C7DBF0">Personas</small><b>${b.people}</b></div></div></div>
  <div class="card stack"><h2>¿Necesitas algo?</h2><div class="chips">${H.map(([k, e, n]) => `<button class="chip" type="button" data-a="help" data-type="${k}" data-text="${esc(n)}">${e} ${n}</button>`).join("")}</div>
    ${reqs.length ? `<div>${reqs.map(r => `<div class="row"><span>${esc(r.description || r.type)}<small>${esc(r.code)}</small></span><span class="pill ${["RESUELTO", "SOLUCIONADO", "CERRADO", "FINALIZADA"].includes(r.status) ? "ok" : "warn"}">${esc(String(r.status).toLowerCase().replace(/_/g, " "))}</span></div>`).join("")}</div>` : `<span class="micro">Tus solicitudes llegan al personal y ves aquí su estado.</span>`}</div>
  ${hosp ? `<button class="btn" data-a="tab" data-v="salida" type="button">Prepararme para la salida →</button>` : `<div class="card stack flat"><h3>Descubre más</h3><div class="chips">${["PISCINA", "MIRADOR", "TERRAZA"].filter(k => k !== b.serviceCode).map(k => `<button class="chip" data-a="start-exp" data-t="${k}" type="button">${SERVICE_NAME[k]}</button>`).join("")}<button class="chip" data-a="start-exp" data-t="HOSPEDAJE" type="button">Hospedaje</button></div></div>`}`;
}
function stayOrders(b) {
  const menu = menuFor(b.serviceCode), items = menu.filter(m => S.cart[m.id]), tot = items.reduce((s, m) => s + Number(m.price) * S.cart[m.id], 0), orders = ordersOf(b);
  return `<div class="card stack"><h2>${b.serviceCode === "TERRAZA" ? "Pide desde tu mesa" : "Carta a tu lugar"}</h2><p class="mut">El pedido se paga al enviarlo con Yape o Plin y llega a tu ${b.serviceCode === "HOSPEDAJE" ? "habitación" : b.serviceCode === "TERRAZA" ? "mesa" : "lugar"}.</p>
    ${menu.length ? `<div class="menu">${menu.map(m => `<div class="dish"><div class="im">${m.image ? `<img src="${esc(m.image)}" alt="">` : "🍽️"}</div><div class="tx"><b>${esc(m.name)}</b><span class="micro">${esc((m.tags || []).slice(0, 3).join(" · "))}</span><div class="q"><b>${money(m.price)}</b><span class="qtyrow"><button class="stepper" style="width:36px;height:36px" type="button" data-a="dish" data-id="${m.id}" data-v="-1" ${S.cart[m.id] ? "" : "disabled"} aria-label="Quitar">−</button><b>${S.cart[m.id] || 0}</b><button class="stepper" style="width:36px;height:36px" type="button" data-a="dish" data-id="${m.id}" data-v="1" aria-label="Agregar">+</button></span></div></div></div>`).join("")}</div>` : `<span class="micro">Por ahora no hay platos habilitados para este servicio.</span>`}
    ${items.length ? `<div class="chips"><button class="chip" data-a="pay-method" data-v="YAPE" aria-pressed="${S.pay.method !== "PLIN"}" type="button">Yape</button><button class="chip" data-a="pay-method" data-v="PLIN" aria-pressed="${S.pay.method === "PLIN"}" type="button">Plin</button></div><div class="paybox"><b>${PAY(S)} ${money(tot)}</b></div><button class="btn" type="button" data-a="send-order" data-id="${b.id}">Pagar y enviar pedido · ${money(tot)}</button>` : ""}</div>
  <div class="card stack"><h2>Mis pedidos</h2>${orders.length ? orders.slice().reverse().map(o => { const L = ORDER_LABEL[o.status] || [o.status, "warn"]; return `<div><div class="row"><b>${esc(o.code)}</b><span class="pill ${L[1]}">${L[0]}</span></div><div class="mut">${(o.items || []).map(i => `${i.quantity}× ${esc(i.name)}`).join(" · ")} — ${money(o.total)}</div></div>`; }).join("") : `<span class="micro">Aún no has pedido nada.</span>`}</div>`;
}
const PAY = s => `${s.pay.method === "PLIN" ? "Plin" : "Yape"} · pago inmediato de`;
function stayAccess(b) {
  const list = passesOf(b);
  return `<div class="note">Cada servicio tiene su <b>propio QR</b>. Un pase no abre otro servicio.</div>${list.map(x => `<div class="card"><div class="qrbox">${qrImg(x.pass.code, x.ent.status !== "LISTO_INGRESO" && x.ent.status !== "UTILIZADO" && x.ent.status !== "ACTIVO")}<div><h3>${SERVICE_NAME[x.ent.serviceCode] || x.ent.serviceCode}</h3><span class="pill ${passLabel(x.ent.status)[1]}">${passLabel(x.ent.status)[0]}</span><p class="mut" style="margin-top:6px">${fmt(x.ent.date)} · ${hhmm12(x.ent.slot)} · ${x.ent.people} pers.</p></div></div></div>`).join("") || `<span class="micro">Tus pases aparecen aquí.</span>`}`;
}
function account(b) {
  const pays = paymentsOf(b), orders = ordersOf(b).filter(o => o.status !== "CANCELADO");
  return `<div class="card stack"><h2>Mi cuenta</h2><div><div class="row"><span>${SERVICE_NAME[b.serviceCode]} · ${esc(b.planName || "")}</span><b class="money">${money(b.total)}</b></div>${orders.map(o => `<div class="row"><span>Pedido ${esc(o.code)}: ${(o.items || []).map(i => `${i.quantity}× ${esc(i.name)}`).join(", ")}<small>${o.paymentStatus === "PAGADO" ? "pagado al enviarlo" : ""}</small></span><b class="money">${money(o.total)}</b></div>`).join("")}
    ${pays.map(p => `<div class="row"><span class="mut">Pagado · ${esc(p.method)} ${esc(p.concept || "")}</span><b class="money" style="color:var(--ok)">− ${money(p.amount)}</b></div>`).join("")}
    <div class="row t"><span>Saldo de la reserva</span><span class="money" style="color:${Number(b.balance) > 0.001 ? "var(--bad)" : "var(--ok)"}">${money(b.balance)}</span></div></div>
    ${Number(b.balance) > 0.001 ? `<button class="btn" data-a="pay-balance" data-id="${b.id}" type="button">Pagar saldo · ${money(b.balance)}</button>` : ""}</div>${invoicesHTML(b)}`;
}
function stayExit(b) {
  const st = bstate(b), pend = ordersOf(b).filter(orderPending), bal = Number(b.balance) > 0.001, wait = st.k === "checkout_wait", can = !pend.length && !bal;
  return `${account(b)}<div class="card stack"><h2>Antes de salir</h2>${timeline([{ s: pend.length ? "now" : "done", t: pend.length ? `Tienes ${pend.length} pedido${pend.length > 1 ? "s" : ""} en curso` : "Sin pedidos en curso", d: pend.length ? "Espera a que lleguen a tu habitación." : "" }, { s: bal ? "now" : "done", t: bal ? `Saldo por pagar: ${money(b.balance)}` : "Cuenta al día", d: "" }, { s: wait ? "now" : "", t: "Recepción revisa la habitación", d: "Confirma cuenta y estado del cuarto" }])}
    ${wait ? `<div class="note ok">Avisamos a recepción a las ${new Date(b.checkoutRequestedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }).replace(/.$/, "")}. En cuanto confirmen, tu pase se desactiva.</div>` : `<button class="btn ${can ? "" : "outline"}" type="button" data-a="checkout" data-id="${b.id}" ${can ? "" : "disabled"}>Solicitar check‑out</button>${can ? "" : `<span class="micro">Se activa cuando no haya pedidos en curso ni saldo.</span>`}`}</div>`;
}

/* ---------- Cierre ---------- */
V.done = () => {
  const b = cur(); if (!b) return V.mine(); const st = bstate(b), canc = st.k === "cancelled";
  if (canc) return `<section class="view"><div class="layout" style="max-width:720px;margin:0 auto;text-align:center"><div><span class="eyebrow">${esc(b.code)}</span><h1>Reserva cancelada</h1><p class="lead" style="margin:0 auto">Si pagaste, el hotel te devuelve el dinero en 2 días hábiles.</p></div><button class="btn" data-a="mine" type="button">Ver mis reservas</button></div></section>`;
  const orders = ordersOf(b).filter(o => o.status !== "CANCELADO");
  return `<section class="view"><div class="layout" style="max-width:760px;margin:0 auto;text-align:center"><div><span class="eyebrow">Gracias por tu visita</span><h1>¡Ojalá vuelvas pronto, ${esc(client()?.firstName || "")}!</h1><p class="lead" style="margin:0 auto">Tu reserva ${esc(b.code)} terminó. Tus pases ya no están activos.</p></div>
  <div class="card stack" style="text-align:left"><h2>Comprobante</h2><div><div class="row"><span>${SERVICE_NAME[b.serviceCode]}</span><b class="money">${money(b.total)}</b></div>${orders.map(o => `<div class="row"><span>Pedido ${esc(o.code)}</span><b class="money">${money(o.total)}</b></div>`).join("")}<div class="row t"><span>Total</span><span class="money">${money(Number(b.total) + orders.reduce((s, o) => s + Number(o.total), 0))}</span></div></div><div class="chips no-print"><button class="chip" type="button" onclick="window.print()">⬇ Descargar / imprimir</button></div></div>
  <div class="card stack" style="text-align:left"><h2>¿Cómo estuvo?</h2><div class="stars" role="group">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-a="star" data-v="${i}" class="${(S.rating || 0) >= i ? "on" : ""}" aria-label="${i} estrellas">★</button>`).join("")}</div><button class="btn outline" type="button" data-a="send-rating" data-id="${b.id}" ${S.rating ? "" : "disabled"}>Enviar mi opinión</button></div>
  <div class="feature" style="text-align:left"><span class="eyebrow">Sigue disfrutando</span><h2 style="margin:6px 0">¿Qué más te gustaría hacer?</h2><div class="chips" style="margin-top:8px">${["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"].map(k => `<button class="chip" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)" type="button" data-a="start-exp" data-t="${k}">${k === "HOSPEDAJE" ? "Hospedaje" : SERVICE_NAME[k]}</button>`).join("")}</div></div></div></section>`;
};

/* ---------- Acciones ---------- */
Object.assign(A, {
  "open-b": d => { S.cb = Number(d.id); S.cbKind = "B"; S.tab = "inicio"; const b = cur(); go(b && ["onsite", "checkout_wait"].includes(bstate(b).k) ? "stay" : b && ["finished", "cancelled"].includes(bstate(b).k) ? "done" : "trip"); },
  "pay-balance": d => { const b = bookingById(d.id); if (b) balanceSheet(b); },
  "refresh": async () => { await loadExp(); toast("Estado actualizado"); render(true); },
  "tab": d => { S.tab = d.v; render(true); },
  "dish": d => { const q = Math.max(0, (S.cart[d.id] || 0) + Number(d.v)); if (q) S.cart[d.id] = q; else delete S.cart[d.id]; render(true); },
  "send-order": async (d, el) => {
    const b = bookingById(d.id); const items = Object.entries(S.cart).map(([id, q]) => ({ menuItemId: Number(id), quantity: q })); if (!items.length) return;
    el.disabled = true;
    try { await api("/public/orders", { method: "POST", body: { bookingId: b.id, serviceCode: b.serviceCode, items, paymentMethod: S.pay.method === "PLIN" ? "PLIN" : "YAPE" } }); S.cart = {}; await loadExp(); toast("¡Pedido enviado a cocina!"); render(true); }
    catch (e) { toast(errText(e)); el.disabled = false; }
  },
  "help": async (d, el) => {
    el.disabled = true; try { await api("/public/requests", { method: "POST", body: { type: d.type, description: d.text } }); await loadExp(); toast("Avisamos al personal"); render(true); } catch (e) { toast(errText(e)); el.disabled = false; }
  },
  "checkout": async (d, el) => { if (el) el.disabled = true; try { await api(`/public/bookings/${d.id}/checkout`, { method: "POST", body: {} }); closeSheet(); S.tab = "salida"; await loadExp(); toast("Avisamos a recepción"); render(true); } catch (e) { toast(errText(e)); if (el) { el.disabled = false; el.classList.remove("fired"); } } },
  "star": d => { S.rating = Number(d.v); render(true); },
  "send-rating": async (d, el) => { const b = bookingById(d.id); el.disabled = true; try { await api("/public/requests", { method: "POST", body: { type: "OTRO", description: `Opinión de estadía ${b.code}: ${S.rating}/5 estrellas.`, location: `Reserva ${b.code}` } }); toast("¡Gracias por tu opinión!"); } catch (e) { toast(errText(e)); el.disabled = false; } }
});
