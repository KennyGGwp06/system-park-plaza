/* portada.js (v7): la entrada a Park Plaza en dos pantallas, sin página larga.
   1. Portada ("home"): una sola pantalla. Fotos de los cinco servicios que pasan solas, la marca y un botón para entrar.
      Tocar la foto, girar la rueda o deslizar hacia arriba también entra.
   2. Servicios ("servicios"): los cinco servicios como paneles que se abren (en fila en escritorio, apilados en celular).
      El panel abierto muestra su foto, sus textos, el dato en vivo de hoy y el botón para reservar.
   Todo sale del hotel en vivo:
   - Textos e imágenes: Catálogo y precios › Textos e imágenes del panel del dueño (experienceMedia).
   - Precios "desde" y espacios de eventos: el catálogo público.
   - Cupos de hoy (piscina y mirador) y habitaciones libres esta noche: la disponibilidad real.
   - Nombre y dirección: Control del sistema › Configuración general. */
import { S, D, V, A, BACK, HOOKS, api, esc, money, ymd, addDays, today, go, soft, save } from "./core.js";
import { catalog, allItems, bstate, hotel } from "./common.js";
import { capsule, quickChips } from "./hospedaje.js";
import { ic, sunsetPucallpa, limaNow } from "./ui.js";

export const EXPS = ["HOSPEDAJE", "PISCINA", "MIRADOR", "TERRAZA", "EVENTOS"];
const NAME = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos" };
const ICON = { HOSPEDAJE: "bed", PISCINA: "pool", MIRADOR: "sunset", TERRAZA: "dine", EVENTOS: "party" };
const HOURS = { HOSPEDAJE: "Llegada 3:00 p. m. · salida 12:00 m.", PISCINA: "9:00 a. m. – 6:00 p. m.", MIRADOR: "4:30 p. m. – 9:00 p. m.", TERRAZA: "12:00 m. – 11:00 p. m.", EVENTOS: "Fechas según disponibilidad" };
// Foto vertical para celular mientras el dueño no suba otra (en escritorio va la panorámica).
const PORTRAIT = { HOSPEDAJE: "/images/hs/hospedaje.webp", PISCINA: "/images/hs/piscina.webp", MIRADOR: "/images/hs/mirador.webp", TERRAZA: "/images/hs/terraza.webp", EVENTOS: "/images/hs/eventos.webp" };
// Copia de los textos por defecto del servidor por si el catálogo aún no carga.
const FALLBACK = {
  HOSPEDAJE: { place: "Hospedaje · Pucallpa", title: "Duerme con la selva", title2: "al otro lado de la ventana.", description: "Habitaciones con vista al jardín y todo el hotel a pasos: piscina, mirador y terraza.", imageUrl: "/images/v6/hospedaje-w.webp" },
  PISCINA: { place: "Piscina · de día", title: "Un día entero", title2: "junto al agua.", description: "Pases por turno con duchas, casilleros y pedidos a tu camastro.", imageUrl: "/images/v6/piscina-w.webp" },
  MIRADOR: { place: "Mirador · al atardecer", title: "El Ucayali,", title2: "en su hora dorada.", description: "El atardecer sobre el río, con la selva como telón.", imageUrl: "/images/v6/mirador-w.webp" },
  TERRAZA: { place: "Terraza · mesa al aire libre", title: "Tu mesa bajo el cielo,", title2: "sin costo de reserva.", description: "Elige zona y hora; pagas solo lo que pidas.", imageUrl: "/images/v6/terraza-w.webp" },
  EVENTOS: { place: "Eventos · a tu medida", title: "Tu celebración,", title2: "con la Amazonía de fondo.", description: "Cotiza en minutos: espacio, catering y equipo, con el total al instante.", imageUrl: "/images/v6/eventos-w.webp" }
};
const media = k => ({ ...FALLBACK[k], ...((catalog().experienceMedia || []).find(m => m.code === k) || {}) });
const imgUrl = u => (!u ? "" : /^https?:|^\//.test(u) ? u : `/${u}`);
const wideOf = k => imgUrl(media(k).imageUrl) || FALLBACK[k].imageUrl;
// Si el dueño cambió la foto, se usa la suya también en celular; si no, la vertical pensada para celular.
const tallOf = k => (media(k).imageUrl && imgUrl(media(k).imageUrl) !== FALLBACK[k].imageUrl ? wideOf(k) : PORTRAIT[k]);
const bg = k => `--w:url('${wideOf(k)}');--p:url('${tallOf(k)}')`;
const headline = (k, tag, cls = "") => { const m = media(k); return `<${tag} class="${cls}">${esc(m.title)}${m.title2 ? ` <span>${esc(m.title2)}</span>` : ""}</${tag}>`; };
const lowPrice = k => { const pl = (catalog().plans[k] || []).filter(p => !["NINO", "FAMILIAR"].includes(p.code)).map(p => Number(p.price)).filter(n => n > 0); return pl.length ? Math.min(...pl) : 0; };
const priceTag = k => {
  if (k === "HOSPEDAJE") { const r = (catalog().roomTypes || []).map(t => Number(t.price)).filter(Boolean); return r.length ? `Desde ${money(Math.min(...r))} la noche` : "Ver habitaciones"; }
  if (k === "TERRAZA") return "Reserva sin costo";
  if (k === "EVENTOS") { const s = (catalog().eventSpaces || []).map(x => Number(x.basePrice)).filter(Boolean); return s.length ? `Espacios desde ${money(Math.min(...s))}` : "Cotización gratis"; }
  return lowPrice(k) ? `Desde ${money(lowPrice(k))} por persona` : "Ver precios";
};
const cta = k => ({ HOSPEDAJE: "Ver habitaciones", PISCINA: "Reservar piscina", MIRADOR: "Reservar mirador", TERRAZA: "Reservar mi mesa", EVENTOS: "Cotizar mi evento" }[k]);
const minutesNow = () => { const n = limaNow(); return n.h * 60 + n.m; };
const hm = min => { const h = Math.floor(min / 60), m = min % 60; return h === 12 && !m ? "12:00 m." : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`; };
const inTxt = mins => mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Datos en vivo ---------- */
export async function loadLive() {
  const t = ymd(today), m = ymd(addDays(today, 1));
  const jobs = [
    api(`/public/rooms?checkIn=${t}&checkOut=${m}`).then(list => { D.tonight = { count: list.length, from: list.length ? Math.min(...list.map(r => Number(r.price))) : 0 }; }),
    ...["PISCINA", "MIRADOR"].map(k => D.avail[k] ? null : api(`/public/availability/${k}?from=${t}`).then(list => { D.avail[k] = list; }))
  ].filter(Boolean);
  await Promise.allSettled(jobs);
  if (soft[S.screen]) soft[S.screen]();
}
// Cupos que quedan hoy en los turnos que aún no pasan.
function spotsToday(k) {
  const day = (D.avail[k] || []).find(d => d.date === ymd(today)); if (!day) return null;
  const now = minutesNow(), ahead = (day.slots || []).filter(s => { const [h, mm] = String(s.time).split(":").map(Number); return h * 60 + (mm || 0) > now - 30; }), open = ahead.filter(s => s.available);
  return { left: open.reduce((a, s) => a + Number(s.remaining || 0), 0), over: !ahead.length, closed: day.available === false };
}
/* El dato de hoy de cada servicio, en una línea. `on` = hay algo disponible ahora (punto encendido). */
function liveOf(k) {
  const now = minutesNow(), sun = sunsetPucallpa(), sunMin = sun ? sun.h * 60 + sun.m : null;
  if (k === "HOSPEDAJE") { const t = D.tonight; return !t ? { txt: "Consultando habitaciones…", short: "Consultando…" } : t.count ? { on: true, txt: `Esta noche quedan ${t.count} habitaciones · desde ${money(t.from)}`, short: `${t.count} libres hoy` } : { txt: "Esta noche estamos completos · prueba otras fechas", short: "Completo hoy" }; }
  if (k === "PISCINA") { const p = spotsToday("PISCINA"); if (!p) return { txt: HOURS.PISCINA, short: "9:00 a. m. – 6:00 p. m." }; if (p.closed || p.over || now >= 18 * 60) return { txt: "Cerrada por hoy · reserva para mañana", short: "Abre mañana" }; return p.left ? { on: true, txt: `Hoy quedan ${p.left} cupos`, short: `${p.left} cupos hoy` } : { txt: "Completa hoy · reserva para mañana", short: "Completa hoy" }; }
  if (k === "MIRADOR") {
    const p = spotsToday("MIRADOR"), sunTxt = sunMin !== null && now < sunMin ? `El sol se oculta a las ${sun.label}, en ${inTxt(sunMin - now)}` : `Mañana el sol se oculta cerca de las ${sunsetPucallpa(addDays(new Date(), 1))?.label || "6:00 p. m."}`;
    const open = !!(p && p.left && !p.over && now < 21 * 60), short = sunMin !== null && now < sunMin ? `Atardecer ${sun.label}` : "Atardecer mañana";
    return { on: open, txt: open ? `${sunTxt} · quedan ${p.left} lugares` : sunTxt, short };
  }
  if (k === "TERRAZA") return now >= 12 * 60 && now < 23 * 60 ? { on: true, txt: "Abierta ahora · hasta las 11:00 p. m.", short: "Abierta ahora" } : { txt: now < 12 * 60 ? "Abre hoy a las 12:00 m." : "Abre mañana a las 12:00 m.", short: now < 12 * 60 ? "Abre 12:00 m." : "Abre mañana" };
  const sp = catalog().eventSpaces || [], most = sp.length ? Math.max(...sp.map(s => Number(s.capacity) || 0)) : 0;
  return { txt: sp.length ? `${sp.length} espacios${most ? ` · hasta ${most} invitados` : ""} · 50 % para separar la fecha` : "Cotiza gratis y separa tu fecha con el 50 %", short: most ? `Hasta ${most} invitados` : "Cotiza gratis" };
}
const liveLine = k => { const l = liveOf(k); return `<span class="lv ${l.on ? "on" : ""}"><i></i>${esc(l.txt)}</span>`; };

/* Reserva activa: acceso directo para volver a ella. */
function resumeChip() {
  const act = allItems().find(it => it.kind === "B" ? !["CANCELADA", "FINALIZADA"].includes(it.b.status) : !["CANCELADO", "FINALIZADO"].includes(it.e.status)); if (!act) return "";
  if (act.kind === "E") return `<button class="pp-res" type="button" data-a="open-e" data-id="${act.e.id}">${ic("party")}<span><small>Tu evento · ${esc(act.e.code)}</small><b>${esc(act.e.name || "Evento")}</b></span>${ic("arrow")}</button>`;
  const b = act.b, st = bstate(b), hosp = b.serviceCode === "HOSPEDAJE";
  return `<button class="pp-res" type="button" data-a="open-b" data-id="${b.id}">${ic(hosp ? "key" : ICON[b.serviceCode] || "spark")}<span><small>${hosp && b.room ? `Tu estadía · Hab. ${esc(b.room.number)}` : `Tu reserva · ${esc(b.code)}`}</small><b>${st.label}</b></span>${ic("arrow")}</button>`;
}

/* ======================= 1 · Portada ======================= */
const SLIDE_MS = 6500;
// La portada abre con el servicio que más sentido tiene a esa hora en Pucallpa.
const byHour = () => { const h = limaNow().h; return h >= 5 && h < 11 ? "PISCINA" : h < 15 && h >= 11 ? "TERRAZA" : h >= 15 && h < 19 ? "MIRADOR" : "HOSPEDAJE"; };
let slide = null, slideT = null, introDone = false;
try { introDone = sessionStorage.getItem("pp_intro") === "1"; } catch { /* sin almacenamiento */ }

function clockLine() {
  const now = minutesNow(), sun = sunsetPucallpa(), sunMin = sun ? sun.h * 60 + sun.m : null;
  const tail = sunMin === null ? "" : now < sunMin ? `el sol se oculta a las ${sun.label}` : `mañana el sol sale sobre el Ucayali`;
  return `<b>${hm(now)}</b> en Pucallpa${tail ? ` · ${tail}` : ""}`;
}
const WORD = "Park Plaza";
V.home = () => {
  if (slide === null) slide = EXPS.indexOf(byHour());
  const k = EXPS[slide], h = hotel(), maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address ? `${h.address} ${h.name || "Park Plaza"}` : `${h.name || "Park Plaza"} Pucallpa`)}`;
  const intro = !introDone && !reduced();
  return `<section class="pp ${intro ? "intro" : ""}" data-soft style="--ms:${SLIDE_MS}ms">
    <div class="pp-stage" data-a="enter" aria-hidden="true">${EXPS.map((x, j) => `<div class="pp-img ${j === slide ? "on" : ""}" style="${bg(x)}"></div>`).join("")}<div class="pp-shade"></div></div>
    <div class="pp-in">
      <div class="pp-main">
        <h1 class="pp-word" aria-label="${WORD}">${[...WORD].map((c, i) => `<span style="--c:${i}">${c === " " ? "&nbsp;" : c}</span>`).join("")}</h1>
        <p class="pp-sub">Hospedaje, piscina, mirador, terraza y eventos frente al río Ucayali. Reserva y paga desde tu celular.</p>
        <div class="pp-act"><button class="pp-go" type="button" data-a="enter"><span>Explorar experiencias</span><i>${ic("arrow")}</i></button><span class="pp-clock" data-clock>${clockLine()}</span></div>
        <div class="pp-resw" data-resume>${resumeChip()}</div>
      </div>
      <div class="pp-foot">
        <p class="pp-cap" data-cap aria-live="polite"><b>${NAME[k]}</b><span>${esc(media(k).title)} ${esc(media(k).title2 || "")}</span></p>
        <nav class="pp-dots" aria-label="Servicios">${EXPS.map((x, j) => `<button type="button" data-a="enter" data-v="${x}" class="${j === slide ? "on" : ""}"><i></i><span>${NAME[x]}</span></button>`).join("")}</nav>
        <a class="pp-map" href="${maps}" target="_blank" rel="noopener">${ic("pin")}<span>Cómo llegar</span></a>
      </div>
    </div>
    <div class="pp-cursor" aria-hidden="true"><span>Entrar</span></div></section>`;
};
function showSlide(j) {
  const root = document.querySelector(".pp"); if (!root) return; slide = (j + EXPS.length) % EXPS.length; const k = EXPS[slide];
  root.querySelectorAll(".pp-img").forEach((el, i) => el.classList.toggle("on", i === slide));
  root.querySelectorAll(".pp-dots button").forEach((el, i) => { el.classList.remove("on"); if (i === slide) { void el.offsetWidth; el.classList.add("on"); } });
  const cap = root.querySelector("[data-cap]"); cap.classList.add("out");
  setTimeout(() => { cap.innerHTML = `<b>${NAME[k]}</b><span>${esc(media(k).title)} ${esc(media(k).title2 || "")}</span>`; cap.classList.remove("out"); }, 260);
}
function startSlides() {
  clearInterval(slideT); if (reduced()) return;
  slideT = setInterval(() => { if (document.visibilityState === "visible" && S.screen === "home") showSlide(slide + 1); }, SLIDE_MS);
}
soft.home = () => {
  const root = document.querySelector(".pp"); if (!root) return false;
  root.querySelector("[data-clock]").innerHTML = clockLine();
  root.querySelector("[data-resume]").innerHTML = resumeChip();
  return true;
};

/* Entrar a los servicios con una transición: la foto de la portada se convierte en el panel del mismo servicio. */
function morph(fn) {
  if (!document.startViewTransition || reduced()) { fn(); return; }
  document.startViewTransition(fn);
}
function enter(k) {
  S.exp = k || EXPS[slide ?? 0]; save(); clearInterval(slideT);
  morph(() => go("servicios"));
}

/* ======================= 2 · Servicios ======================= */
Object.assign(BACK, { servicios: "home" });
function panelAction(k) {
  if (k === "HOSPEDAJE") return `${capsule("home")}${quickChips()}`;
  return `<button class="sv-go" type="button" data-a="start-exp" data-t="${k}"><span>${cta(k)}</span>${ic("arrow")}</button>`;
}
function panel(k, j) {
  const m = media(k), on = S.exp === k;
  return `<article class="sv-p ${on ? "on" : ""}" data-exp="${k}" style="${bg(k)}">
    <div class="sv-img" aria-hidden="true"></div><div class="sv-shade" aria-hidden="true"></div>
    <button class="sv-tab" type="button" data-a="sv-open" data-v="${k}" aria-expanded="${on}" aria-controls="sv-${k}"><em>0${j + 1}</em>${ic(ICON[k])}<b>${NAME[k]}</b><small data-live="${k}">${esc(liveOf(k).short)}</small>${ic("arrow", "sv-chev")}</button>
    <div class="sv-bd" id="sv-${k}" ${on ? "" : "inert"}>
      <span class="sv-k"><em>0${j + 1}</em>${ic(ICON[k])}${esc(m.place || NAME[k])}</span>
      ${headline(k, "h2", "sv-t")}
      <p class="sv-d">${esc(m.description || "")}</p>
      <div class="sv-live" data-livebd="${k}">${liveLine(k)}</div>
      <dl class="sv-meta"><div><dt>Horario</dt><dd>${HOURS[k]}</dd></div><div><dt>Precio</dt><dd>${priceTag(k)}</dd></div></dl>
      <div class="sv-act" data-act="${k}">${panelAction(k)}</div>
    </div></article>`;
}
V.servicios = () => {
  if (!EXPS.includes(S.exp)) S.exp = "HOSPEDAJE";
  return `<section class="sv" data-soft aria-label="Experiencias de Park Plaza">
    <header class="sv-h"><span class="pp-k">Cinco experiencias · un solo lugar</span><h1>¿Qué quieres vivir?</h1><button class="ghostb" type="button" data-a="carta">Ver carta de Restaurante y Bar</button></header>
    <div class="sv-row">${EXPS.map(panel).join("")}</div></section>`;
};
function openPanel(k, focus) {
  const root = document.querySelector(".sv"); if (!root || !EXPS.includes(k)) return;
  S.exp = k; save();
  root.querySelectorAll(".sv-p").forEach(p => {
    const on = p.dataset.exp === k; p.classList.toggle("on", on);
    p.querySelector(".sv-tab").setAttribute("aria-expanded", on); const bd = p.querySelector(".sv-bd"); if (on) bd.removeAttribute("inert"); else bd.setAttribute("inert", "");
  });
  const p = root.querySelector(`.sv-p[data-exp="${k}"]`);
  if (focus) p.querySelector(".sv-tab").focus({ preventScroll: true });
  // En celular los paneles van apilados: al abrir uno, que quede a la vista.
  if (innerWidth < 1000) setTimeout(() => { const r = p.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) window.scrollTo({ top: scrollY + r.top - 76, behavior: reduced() ? "auto" : "smooth" }); }, 420);
}
soft.servicios = () => {
  const root = document.querySelector(".sv"); if (!root) return false;
  EXPS.forEach(k => {
    const t = root.querySelector(`[data-live="${k}"]`); if (t) t.textContent = liveOf(k).short;
    const b = root.querySelector(`[data-livebd="${k}"]`); if (b) b.innerHTML = liveLine(k);
  });
  const act = root.querySelector('[data-act="HOSPEDAJE"]'); if (act) act.innerHTML = panelAction("HOSPEDAJE");
  return true;
};

/* ---------- Interacción ---------- */
Object.assign(A, {
  "enter": (d, el, ev) => { if (ev) ev.stopPropagation(); enter(d.v); },
  "sv-open": d => { if (S.exp !== d.v) openPanel(d.v); }
});
// Rueda hacia abajo o deslizar hacia arriba en la portada: entra a los servicios.
let wheelLock = 0;
addEventListener("wheel", ev => { if (S.screen !== "home" || document.querySelector(".sheet") || ev.deltaY < 30 || Date.now() < wheelLock) return; wheelLock = Date.now() + 1200; enter(); }, { passive: true });
let touchY = null;
addEventListener("touchstart", ev => { touchY = S.screen === "home" ? ev.touches[0].clientY : null; }, { passive: true });
addEventListener("touchend", ev => { if (touchY === null || S.screen !== "home") return; const dy = touchY - ev.changedTouches[0].clientY; touchY = null; if (dy > 60 && !ev.target.closest("a,button")) enter(); }, { passive: true });
// Flechas: cambian de panel en Servicios y de foto en la portada.
addEventListener("keydown", ev => {
  if (document.querySelector(".sheet") || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName || "")) return;
  const fwd = ["ArrowRight", "ArrowDown"].includes(ev.key), back = ["ArrowLeft", "ArrowUp"].includes(ev.key); if (!fwd && !back) return;
  if (S.screen === "servicios" && ev.target.closest && ev.target.closest(".sv-tab")) { const j = (EXPS.indexOf(S.exp) + (fwd ? 1 : EXPS.length - 1)) % EXPS.length; openPanel(EXPS[j], true); ev.preventDefault(); }
  else if (S.screen === "home" && ["ArrowRight", "ArrowLeft"].includes(ev.key)) { showSlide(slide + (fwd ? 1 : -1)); startSlides(); }
});
// Escritorio con mouse: el panel se abre al pasar por encima (con una pausa corta para no abrir todos al cruzar la pantalla).
let hoverT = null;
document.addEventListener("mouseover", ev => {
  if (S.screen !== "servicios" || !matchMedia("(hover: hover) and (min-width: 1000px)").matches) return;
  const p = ev.target.closest && ev.target.closest(".sv-p"); clearTimeout(hoverT); if (!p || p.classList.contains("on")) return;
  hoverT = setTimeout(() => openPanel(p.dataset.exp), 170);
});
// Cursor "Entrar" que sigue al mouse sobre la foto de la portada.
document.addEventListener("pointermove", ev => {
  if (S.screen !== "home" || ev.pointerType !== "mouse") return; const c = document.querySelector(".pp-cursor"); if (!c) return;
  const over = !!(ev.target.closest && ev.target.closest(".pp-stage")) || (ev.target.classList && ev.target.classList.contains("pp-in"));
  c.classList.toggle("show", over); c.style.transform = `translate3d(${ev.clientX}px,${ev.clientY}px,0)`;
});
// Tocar la foto (fuera de botones y textos) también entra.
document.addEventListener("click", ev => { if (S.screen === "home" && ev.target.classList && ev.target.classList.contains("pp-in")) enter(); });

HOOKS.push(() => {
  if (S.screen === "home") {
    startSlides();
    if (!introDone) { introDone = true; try { sessionStorage.setItem("pp_intro", "1"); } catch { /* ok */ } }
  } else clearInterval(slideT);
});
// El reloj de la portada y los datos de hoy se refrescan cada 30 s sin redibujar la pantalla.
setInterval(() => { if (document.visibilityState === "visible" && soft[S.screen]) soft[S.screen](); }, 30000);
