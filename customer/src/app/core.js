/* Park Plaza · nueva experiencia del cliente (conectada al servidor real).
   core.js: estado, API, sesión, utilidades, calendario, hojas, enrutador. */
export const $ = (s, r = document) => r.querySelector(s);
export const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const money = n => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const parse = s => { const [a, b, c] = String(s).slice(0, 10).split("-").map(Number); return new Date(a, b - 1, c); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmt = (s, o) => parse(s).toLocaleDateString("es-PE", o || { weekday: "short", day: "numeric", month: "short" });
export const fmtLong = s => fmt(s, { weekday: "long", day: "numeric", month: "long" });
const limaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const today = parse(limaToday());
export const nextFriday = () => addDays(today, (5 - today.getDay() + 7) % 7 || 7);
export const hhmm12 = t => { const [h, m] = String(t).split(":").map(Number); if (Number.isNaN(h)) return t; return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`; };

/* ---------- Estado ---------- */
const FRESH = () => ({
  screen: "home", exp: "HOSPEDAJE", cb: null, tab: "inicio", errors: {}, authNext: "home", auth: { doc: "", first: "", last: "", phone: "", email: "", register: false, busy: false },
  h: { from: null, to: null, adults: 2, kids: 0, plan: "FLEX", roomType: null, roomId: null, extras: {}, vehicles: [], bundle: { PISCINA: { date: null, slot: "13:00" }, MIRADOR: { date: null, slot: "18:00" }, TERRAZA: { date: null, slot: "20:00" } }, filter: "all", quick: null, guestsNote: "" },
  v: null, ev: null, cart: {}, pay: { mode: "FULL", method: "YAPE", code: "" }, rating: 0
});
export let S = FRESH();
try { const saved = JSON.parse(sessionStorage.getItem("pp_nuevo") || "null"); if (saved && saved.v === 1) S = { ...FRESH(), ...saved.s, errors: {} }; } catch (e) { /* sin almacenamiento */ }
export const save = () => { try { sessionStorage.setItem("pp_nuevo", JSON.stringify({ v: 1, s: S })); } catch (e) { /* ok */ } };
export function resetDrafts() { const keep = { screen: "home" }; const f = FRESH(); S.h = f.h; S.v = null; S.ev = null; S.cart = {}; S.errors = {}; Object.assign(S, keep); save(); }
export const D = { catalog: null, exp: null, rooms: null, avail: {}, evAvail: null, loading: {} };

/* ---------- API ---------- */
export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" }; const token = localStorage.getItem("pp_customer_token"); if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, cache: "no-store", body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) }); }
  catch { const e = new Error("No pudimos conectar con el hotel. Revisa tu conexión e inténtalo de nuevo."); e.status = 0; throw e; }
  const data = await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(data?.message || "No pudimos completar la operación"); e.status = res.status; throw e; }
  return data;
}
export const client = () => { try { return localStorage.getItem("pp_customer_token") ? JSON.parse(localStorage.getItem("pp_customer_client") || "null") : null; } catch { return null; } };
export function setSession(result) { localStorage.setItem("pp_customer_token", result.token); localStorage.setItem("pp_customer_client", JSON.stringify(result.client)); }
export function logout() { localStorage.removeItem("pp_customer_token"); localStorage.removeItem("pp_customer_client"); D.exp = null; S.cb = null; go("home"); }
export async function loadCatalog() { D.catalog = await api("/public/catalog"); return D.catalog; }
export async function loadExp(silent) { if (!client()) { D.exp = null; return null; } try { D.exp = await api("/public/my-experience"); } catch (e) { if ([401, 403].includes(e.status)) { logout(); return null; } if (!silent) toast(e.message); } return D.exp; }

/* ---------- Vistas y acciones (los módulos se registran aquí) ---------- */
export const V = {}, A = {}, HOOKS = [];
export const BACK = {};
export const STEPPED = {};
let rendering = false, shown = null;
/* Historial del navegador: el botón Atrás del celular vuelve a la pantalla anterior en vez de salir de la app. */
export function go(screen, opts = {}) {
  const changed = screen !== S.screen; S.screen = screen; if (opts.keep !== true) S.errors = {};
  if (changed && !opts.fromHistory) { try { history.pushState({ pp: screen }, ""); } catch { /* ok */ } }
  render(opts.keepScroll);
}
try { history.replaceState({ pp: S.screen }, ""); } catch { /* ok */ }
addEventListener("popstate", ev => {
  if (document.querySelector("#layer .sheet")) { closeSheet(); try { history.pushState({ pp: S.screen }, ""); } catch { /* ok */ } return; }
  const to = ev.state && ev.state.pp ? ev.state.pp : "home"; go(V[to] ? to : "home", { fromHistory: true });
});
export function requireLogin(next) { if (client()) return true; S.authNext = next; S.auth = { doc: "", first: "", last: "", phone: "", email: "", register: false, busy: false }; go("auth"); return false; }

export function toast(t) { document.querySelectorAll(".toast").forEach(x => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); }
/* Hojas y ventanas flotantes. Si ya hay una abierta con el mismo tipo, solo se cambia su contenido:
   así tocar un día del calendario no vuelve a animar (ni parpadear) la hoja completa.
   Con `anchor` y pantalla ancha se abre como ventana flotante pegada al campo que la abrió. */
let ANCHOR = null;
export function sheet(html, cls = "", anchor) {
  const layer = $("#layer"), cur = layer.querySelector(".sheet");
  if (anchor !== undefined) ANCHOR = anchor || null;
  const pop = ANCHOR && innerWidth >= 760;
  if (cur && cur.dataset.cls === cls && cur.classList.contains("pop") === pop) { cur.innerHTML = html; if (pop) placePop(cur); return; }
  layer.innerHTML = `<div class="sheet-bg ${pop ? "clear" : ""}" data-a="sheet-bg"><div class="sheet ${pop ? "pop" : ""} ${cls}" data-cls="${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  if (pop) placePop(layer.querySelector(".sheet"));
}
function placePop(el) {
  if (!ANCHOR || !document.body.contains(ANCHOR)) return; const r = ANCHOR.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(16, Math.min(r.left, innerWidth - w - 16)); let top = r.bottom + 10; if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 10);
  el.style.left = left + "px"; el.style.top = top + "px";
}
export const closeSheet = () => { $("#layer").innerHTML = ""; ANCHOR = null; };
addEventListener("resize", () => { const el = document.querySelector(".sheet.pop"); if (el) placePop(el); });

/* ---------- Calendario en hoja ---------- */
let CAL = null;
export function openCal(o) {
  const base = o.from ? parse(o.from) : today;
  CAL = { mode: o.mode, from: o.from || null, to: o.mode === "range" ? (o.to || null) : null, cursor: new Date(base.getFullYear(), base.getMonth(), 1).getTime(), title: o.title || "¿Cuándo?", apply: o.apply, price: o.price || null, allowed: o.allowed || null, busyDays: o.busyDays || null, maxDate: o.maxDate || null, anchor: o.anchor || null, live: o.live || false };
  renderCal();
}
/* Vista previa del rango al pasar el mouse (escritorio): pinta los días entre la llegada y el día apuntado. */
document.addEventListener("mouseover", ev => {
  const d = ev.target.closest && ev.target.closest(".day[data-cday]"); if (!CAL || CAL.mode !== "range" || !CAL.from || CAL.to) return;
  document.querySelectorAll(".day.hov").forEach(x => x.classList.remove("hov")); if (!d) return; const k = d.dataset.cday; if (k <= CAL.from) return;
  document.querySelectorAll(".day[data-cday]").forEach(x => { if (x.dataset.cday > CAL.from && x.dataset.cday <= k) x.classList.add("hov"); });
});
function calMonth(y, m) {
  const off = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(); let cells = ""; for (let i = 0; i < off; i++) cells += "<span></span>";
  for (let d = 1; d <= dim; d++) {
    const date = new Date(y, m, d), key = ymd(date); let off2 = date < today || (CAL.maxDate && key > CAL.maxDate) || (CAL.allowed && !CAL.allowed.has(key));
    const edge = CAL.from === key || CAL.to === key, inside = CAL.mode === "range" && CAL.from && CAL.to && key > CAL.from && key < CAL.to, busy = CAL.busyDays ? CAL.busyDays.has(key) : false;
    const hint = CAL.priceByDay && !off2 && !edge && !inside ? `<span class="p">${CAL.price}</span>` : "";
    cells += `<button type="button" class="day ${edge ? "edge" : inside ? "in" : ""} ${busy && !off2 ? "busy" : ""} ${ymd(today) === key ? "today" : ""}" data-cday="${key}" ${off2 ? "disabled" : ""} aria-label="${fmtLong(key)}" aria-pressed="${edge}">${d}${hint}</button>`;
  }
  const name = new Date(y, m, 1).toLocaleDateString("es-PE", { month: "long" }).replace(/^./, c => c.toUpperCase()) + " " + y;
  return `<div><b class="mtitle">${name}</b><div class="grid7">${["L", "M", "M", "J", "V", "S", "D"].map(x => `<span class="dow">${x}</span>`).join("")}${cells}</div></div>`;
}
function renderCal() {
  const c = new Date(CAL.cursor), wide = innerWidth >= 760, months = wide ? [c, new Date(c.getFullYear(), c.getMonth() + 1, 1)] : [c];
  const canPrev = c > new Date(today.getFullYear(), today.getMonth(), 1), range = CAL.mode === "range";
  const nn = range && CAL.from && CAL.to ? Math.round((parse(CAL.to) - parse(CAL.from)) / 864e5) : 0, ok = range ? nn > 0 : !!CAL.from;
  const quick = range ? [["tonight", "Esta noche"], ["weekend", "Fin de semana"], ["week", "Una semana"]] : [["today", "Hoy"], ["tomorrow", "Mañana"], ["saturday", "Este sábado"]];
  sheet(`<div class="sheethead"><h2>${esc(CAL.title)}</h2><button class="xbtn" data-a="cal-close" type="button" aria-label="Cerrar">✕</button></div>
    <div class="chips">${quick.map(([k, n]) => `<button class="chip" type="button" data-cq="${k}">${n}</button>`).join("")}</div>
    <div class="sheethead"><button class="cal-nav" type="button" data-a="cal-prev" aria-label="Mes anterior" ${canPrev ? "" : "disabled"}>‹</button><span class="micro">${range ? "Toca la llegada y luego la salida" : "Toca el día que prefieres"}</span><button class="cal-nav" type="button" data-a="cal-next" aria-label="Mes siguiente">›</button></div>
    <div class="cal2 ${wide ? "two" : ""}">${months.map(d => calMonth(d.getFullYear(), d.getMonth())).join("")}</div>
    ${CAL.busyDays ? `<div class="legend"><span><i></i>Quedan pocos cupos</span></div>` : ""}${CAL.price ? `<div class="legend"><span>Habitaciones ${esc(CAL.price)} por noche · llegada 3:00 p. m., salida 12:00 m.</span></div>` : ""}
    <div class="range" aria-live="polite">${range ? (CAL.from && CAL.to ? `<span><small class="micro">Llegas</small><br><b>${fmt(CAL.from)}</b></span><span><small class="micro">Sales</small><br><b>${fmt(CAL.to)}</b></span><span><small class="micro">Noches</small><br><b>${nn}</b></span>` : CAL.from ? `<span>Llegas <b>${fmt(CAL.from)}</b> · ahora toca la <b>salida</b>.</span>` : `<span>Toca el día de <b>llegada</b>.</span>`) : (CAL.from ? `<span>Elegiste <b>${fmtLong(CAL.from)}</b></span>` : `<span>Aún no eliges un día.</span>`)}</div>
    <button class="btn" type="button" data-a="cal-apply" ${ok ? "" : "disabled"}>${range && nn ? `Aplicar · ${nn} noche${nn > 1 ? "s" : ""}` : "Aplicar"}</button>`, "calsheet", CAL.anchor);
}
function calQuick(k) {
  const t = new Date(today);
  if (k === "tonight") { CAL.from = ymd(t); CAL.to = ymd(addDays(t, 1)); }
  if (k === "weekend") { const f = nextFriday(); CAL.from = ymd(f); CAL.to = ymd(addDays(f, 2)); }
  if (k === "week") { CAL.from = ymd(t); CAL.to = ymd(addDays(t, 7)); }
  if (k === "today") CAL.from = ymd(t);
  if (k === "tomorrow") CAL.from = ymd(addDays(t, 1));
  if (k === "saturday") CAL.from = ymd(addDays(t, (6 - t.getDay() + 7) % 7 || 7));
  if (CAL.allowed && !CAL.allowed.has(CAL.from)) { toast("Ese día no tiene cupos. Elige otro."); CAL.from = null; CAL.to = null; return; }
  const b = parse(CAL.from); CAL.cursor = new Date(b.getFullYear(), b.getMonth(), 1).getTime();
}
/* ---------- Hoja de personas ---------- */
let GST = null;
export function openGuests(o) { GST = { a: o.adults, k: o.kids, max: o.max || 4, kidsOn: o.kidsOn !== false, apply: o.apply, title: o.title || "¿Quiénes vienen?", anchor: o.anchor || null }; renderGuests(); }
function renderGuests() {
  const tot = GST.a + GST.k;
  sheet(`<div class="sheethead"><h2>${esc(GST.title)}</h2><button class="xbtn" data-a="g-close" type="button" aria-label="Cerrar">✕</button></div>
    <div class="counters" style="grid-template-columns:1fr"><div class="counter"><div><small>${GST.kidsOn ? "Adultos" : "Personas"}</small><b>${GST.a}</b></div><div class="btns"><button class="stepper" type="button" data-a="g-a-" ${GST.a <= 1 ? "disabled" : ""} aria-label="Menos">−</button><button class="stepper" type="button" data-a="g-a+" ${tot >= GST.max ? "disabled" : ""} aria-label="Más">+</button></div></div>
    ${GST.kidsOn ? `<div class="counter"><div><small>Niños</small><b>${GST.k}</b></div><div class="btns"><button class="stepper" type="button" data-a="g-k-" ${GST.k <= 0 ? "disabled" : ""} aria-label="Menos niños">−</button><button class="stepper" type="button" data-a="g-k+" ${tot >= GST.max ? "disabled" : ""} aria-label="Más niños">+</button></div></div>` : ""}</div>
    <p class="micro">Máximo ${GST.max} personas por reserva.</p><button class="btn" type="button" data-a="g-apply">Aplicar · ${tot} persona${tot > 1 ? "s" : ""}</button>`, "gsheet", GST.anchor);
}

/* ---------- Acciones globales (calendario, hojas) ---------- */
Object.assign(A, {
  "sheet-bg": (d, el, ev) => { if (ev.target === el) closeSheet(); },
  "cal-close": () => closeSheet(), "g-close": () => closeSheet(), "close": () => closeSheet(),
  "cal-prev": () => { const c = new Date(CAL.cursor); CAL.cursor = new Date(c.getFullYear(), c.getMonth() - 1, 1).getTime(); renderCal(); },
  "cal-next": () => { const c = new Date(CAL.cursor); CAL.cursor = new Date(c.getFullYear(), c.getMonth() + 1, 1).getTime(); renderCal(); },
  "cal-apply": () => { const ap = CAL.apply, f = CAL.from, t = CAL.to; closeSheet(); ap(f, t); },
  "g-a-": () => { GST.a--; renderGuests(); }, "g-a+": () => { GST.a++; renderGuests(); }, "g-k-": () => { GST.k--; renderGuests(); }, "g-k+": () => { GST.k++; renderGuests(); },
  "g-apply": () => { const ap = GST.apply, a = GST.a, k = GST.k; closeSheet(); ap(a, k); },
  "toast": d => toast(d.msg), "go": d => go(d.to)
});
export function clickCalendar(t) {
  const d = t.dataset;
  if (d.cday) { const k = d.cday; if (CAL.mode === "single") CAL.from = k; else if (!CAL.from || (CAL.from && CAL.to)) { CAL.from = k; CAL.to = null; } else if (k > CAL.from) CAL.to = k; else { CAL.from = k; CAL.to = null; } renderCal(); return true; }
  if (d.cq) { calQuick(d.cq); renderCal(); return true; }
  return false;
}

/* ---------- Componentes comunes ---------- */
export const fieldBtn = (label, cls, value, ph, action, extra = "") => `<button type="button" class="fieldbtn ${cls} ${value ? "set" : ""}" data-a="${action}" ${extra}><small>${label}</small><b class="${value ? "" : "phd"}">${value || ph}</b></button>`;
export function timeline(items) { return `<ul class="tl">${items.map(i => `<li class="${i.s}"><i></i><div><b>${i.t}</b><small>${i.d || ""}</small></div></li>`).join("")}</ul>`; }
export const pill = (t, tone = "") => `<span class="pill ${tone}">${t}</span>`;
export function bindField(id, label, type, value, ph, extra = "") { const bad = S.errors[id]; return `<label class="f ${bad ? "bad" : ""}">${label}<input id="${id}" data-bind="${id}" type="${type}" value="${esc(value)}" placeholder="${ph}" ${extra} aria-invalid="${!!bad}"><span class="err">${bad || ""}</span></label>`; }
export function stepsHTML(i, names) { return `<div class="steps" aria-label="Progreso">${names.map((_, j) => `<i class="${j <= i ? "on" : ""}"></i>`).join("")}<em>${names[i]}</em></div>`; }

/* ---------- Barra superior y barra inferior ---------- */
function topbar() {
  const sc = S.screen, wide = sc === "home" || sc === "servicios"; document.body.classList.toggle("home", wide);
  const n = (D.exp ? countActive() : 0), c = client();
  const back = sc === "home" ? `<span></span>` : `<button class="tb arrow" data-a="back" type="button" aria-label="Volver">←</button>`;
  const mine = `<button class="${wide ? "ghostb" : "tb"}" data-a="mine" type="button">${c ? `Mis reservas${n ? ` (${n})` : ""}` : "Mis reservas"}</button>`;
  const right = wide ? `<span style="display:flex;gap:8px">${c ? `<button class="ghostb" data-a="logout" type="button">Salir</button>` : ""}${mine}</span>` : mine;
  $("#top").innerHTML = `${back}<a class="brand" href="/nuevo/" data-a="home"><img src="/brand/park-plaza-mark.svg" alt=""><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></a>${right}`;
}
export function countActive() { const e = D.exp; if (!e) return 0; return (e.bookings || []).filter(b => !["CANCELADA", "FINALIZADA"].includes(b.status)).length + (e.events || []).filter(x => !["CANCELADO", "FINALIZADO"].includes(x.status)).length; }
export function setBar(a, b, c, disabled = false) { const bar = $("#bar"); bar.classList.add("on"); $("#barSmall").textContent = a; $("#barBig").textContent = b; $("#barBtn").textContent = c; $("#barBtn").disabled = disabled; }
export function render(keepScroll) {
  if (rendering) return; rendering = true;
  try {
    topbar(); const main = $("#app"), enter = shown !== S.screen; shown = S.screen;
    // La animación de entrada solo corre al cambiar de pantalla; redibujar la misma (elegir plan, un día…) no parpadea.
    main.className = `${["home", "servicios"].includes(S.screen) ? "home" : ""} ${enter ? "enter" : ""} sc-${S.screen}`; const view = V[S.screen] || V.home;
    document.body.dataset.screen = S.screen;
    main.innerHTML = view(); $("#bar").classList.remove("on"); HOOKS.forEach(h => h()); save();
    if (!keepScroll || enter) window.scrollTo({ top: 0, behavior: "instant" });
  } finally { rendering = false; }
}
/* Actualización suave: la portada y los servicios se actualizan en su lugar (sin reconstruirlos) para que las fotos
   no parpadeen. Cada pantalla registra su función en `soft` y devuelve false si no está dibujada. */
export const soft = {};
export function refresh() { const f = soft[S.screen]; if (!(f && f())) render(true); }
export const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } finally { if (btn) btn.disabled = false; } };
export const errText = e => (e && e.message) || String(e);
