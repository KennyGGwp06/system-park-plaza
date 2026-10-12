/* main.js: identificación, navegación, eventos globales y actualización en vivo. La portada vive en portada.js. */
import { S, D, V, A, BACK, HOOKS, $, api, esc, money, fmt, go, render, refresh, soft, toast, save, client, setSession, logout, loadCatalog, loadExp, requireLogin, errText, clickCalendar, resetDrafts, ymd, addDays, today } from "./core.js";
import { hospBarAction, loadRooms } from "./hospedaje.js";
import { EXPS, loadLive } from "./portada.js";
import { visitBarAction, loadAvail } from "./visits.js";
import { eventBarAction, loadEvAvail } from "./events.js";
import "./site.js";
import "./estadia.js";
import "./carta.js";
import { googleAuthError } from "./google-auth.js";

/* ---------- Identificación ---------- */
Object.assign(BACK, { auth: "home" });
V.auth = () => {
  const a = S.auth;
  const inp = (path, label, type, ph, extra = "") => `<label class="f ${S.errors[path] ? "bad" : ""}">${label}<input data-bind="auth.${path}" type="${type}" value="${esc(a[path])}" placeholder="${ph}" ${extra}><span class="err">${S.errors[path] || ""}</span></label>`;
  return `<section class="view"><div class="layout" style="max-width:640px;margin:0 auto"><div><span class="eyebrow">Una sola vez</span><h1>${a.register ? "Crea tu cuenta" : "¿Quién reserva?"}</h1><p class="lead">${a.register ? "No encontramos ese documento. Completa tus datos y seguimos." : "Ingresa tu DNI. Si ya reservaste antes, te reconocemos y sigues sin repetir datos."}</p></div>
  <div class="card stack">${inp("doc", "DNI o documento", "text", "8 dígitos", 'inputmode="numeric" autocomplete="off" maxlength="15"')}
    ${a.register ? `<div class="two">${inp("first", "Nombres", "text", "Como en tu DNI", 'autocomplete="given-name"')}${inp("last", "Apellidos", "text", "Como en tu DNI", 'autocomplete="family-name"')}</div><div class="two">${inp("phone", "Celular (9 dígitos)", "tel", "987654321", 'inputmode="tel" maxlength="9"')}${inp("email", "Correo (opcional)", "email", "para tu comprobante")}</div>` : ""}
    ${a.register ? "" : `<button class="chip" type="button" data-a="auth-google" style="justify-content:center;min-height:50px;width:100%"><b style="color:#4285F4">G</b> Continuar con Google</button><div class="micro" style="text-align:center">o ingresa con tu documento</div>`}
    <button class="btn" type="button" data-a="${a.register ? "auth-register" : "auth-go"}" ${a.busy ? "disabled" : ""}>${a.busy ? "Un momento…" : a.register ? "Crear mi cuenta y continuar" : "Continuar"} →</button>
    ${a.register ? `<button class="link" type="button" data-a="auth-back" style="justify-self:center">← Ya tengo cuenta con otro documento</button>` : ""}</div></div></section>`;
};
Object.assign(A, {
  "auth-go": async () => {
    const doc = S.auth.doc.trim(); if (!doc) { S.errors = { doc: "Ingresa tu documento." }; render(true); return; }
    S.auth.busy = true; render(true);
    try { const r = await api("/public/document-access", { method: "POST", body: { documentNumber: doc } }); setSession(r); S.auth.busy = false; await loadExp(); toast(`¡Hola, ${r.client.firstName || ""}!`); go(S.authNext || "home"); }
    catch (e) { S.auth.busy = false; if (e.status === 404) { S.auth.register = true; S.errors = {}; render(true); } else { toast(errText(e)); render(true); } }
  },
  "auth-google": async () => {
    try {
      const { signInWithGoogle } = await import("./firebase.js");
      const { user, idToken } = await signInWithGoogle();
      const r = await api("/public/google-auth", { method: "POST", body: { idToken } });
      setSession({ token: r.token, client: { ...r.client, avatarUrl: r.client.avatarUrl || user.photoURL || "", authProvider: "GOOGLE" } });
      await loadExp(); toast("¡Hola, " + (r.client.firstName || "") + "!"); go(S.authNext || "home");
    } catch (e) { toast(googleAuthError(e)); }
  },
  "auth-back": () => { S.auth.register = false; render(true); },
  "auth-register": async () => {
    const a = S.auth, e = {}, doc = a.doc.trim(), isDni = /^\d+$/.test(doc) && doc.length <= 8;
    if (isDni && !/^\d{8}$/.test(doc)) e.doc = "El DNI debe tener 8 dígitos."; if (!isDni && doc.length < 6) e.doc = "Ingresa un documento válido.";
    if (!a.first.trim()) e.first = "Escribe tus nombres."; if (!a.last.trim()) e.last = "Escribe tus apellidos."; if (!/^\d{9}$/.test(a.phone.trim())) e.phone = "El celular tiene 9 dígitos.";
    if (a.email && !/^\S+@\S+\.\S+$/.test(a.email)) e.email = "Revisa el correo.";
    S.errors = e; if (Object.keys(e).length) { render(true); return; }
    a.busy = true; render(true);
    try { const r = await api("/public/identify", { method: "POST", body: { documentType: isDni ? "DNI" : "CE", documentNumber: doc, firstName: a.first.trim(), lastName: a.last.trim(), phone: a.phone.trim(), email: a.email.trim() } }); setSession(r); a.busy = false; await loadExp(); toast(`¡Bienvenido, ${r.client.firstName}!`); go(S.authNext || "home"); }
    catch (er) { a.busy = false; toast(errText(er)); render(true); }
  }
});

/* ---------- Navegación global ---------- */
function startExp(t, el) {
  S.exp = t; save();
  // Hospedaje: si ya hay fechas va directo a las habitaciones; si no, abre el calendario junto al botón tocado.
  if (t === "HOSPEDAJE") { if (S.h.from && S.h.from < ymd(today)) { S.h.from = null; S.h.to = null; } A["h-search"]({}, el || null); return; }
  if (t === "EVENTOS") { A["ev-new"](); return; }
  A["v-new"]({ t });
}
Object.assign(A, {
  "start-exp": (d, el) => { document.getElementById("layer").innerHTML = ""; startExp(d.t, el); },
  "back": () => { go(BACK[S.screen] || "home"); },
  "home": (d, el, ev) => { ev.preventDefault(); go("home"); },
  "mine": async () => { if (!client()) { requireLogin("mine"); return; } go("mine"); await loadExp(); render(true); },
  "login": () => { requireLogin("mine"); },
  "logout": () => { logout(); toast("Cerraste tu sesión"); },
});
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-a],[data-cday],[data-cq]"); if (!t) return;
  if (clickCalendar(t)) return;
  const fn = A[t.dataset.a]; if (fn) { const r = fn(t.dataset, t, ev); if (r && r.catch) r.catch(e => toast(errText(e))); }
});
$("#barBtn").addEventListener("click", () => { hospBarAction() || visitBarAction() || eventBarAction(); });


/* ---------- Campos enlazados al estado ---------- */
function setPath(root, path, value) { const keys = path.split("."); let o = root; for (let i = 0; i < keys.length - 1; i++) { o = o[keys[i]]; if (o == null) return; } o[keys[keys.length - 1]] = value; }
document.addEventListener("input", ev => {
  const el = ev.target; const path = el.dataset && el.dataset.bind; if (!path) return;
  setPath(S, path, el.value); if (S.errors) { const k = path.split(".").pop(); delete S.errors[k]; if (path === "pay.code") delete S.errors.code; } save();
});

/* ---------- Datos que se cargan al abrir cada pantalla ---------- */
HOOKS.push(() => {
  const sc = S.screen, h = S.h;
  if (["rooms", "plan", "checkout"].includes(sc) && h.from && h.to && D.rooms === null && !D.loading.rooms) loadRooms();
  if (sc === "xplan" && S.v && !D.avail[S.v.type] && !D.loading["a" + S.v.type]) loadAvail(S.v.type);
  if (sc === "evplan" && !D.evAvail && !D.loading.ev) { D.loading.ev = true; loadEvAvail().finally(() => { D.loading.ev = false; }); }
  if ((sc === "trip" || sc === "stay" || sc === "etrip" || sc === "done") && !D.exp && client()) loadExp().then(() => render(true));
});

/* ---------- Actualización en vivo: el hotel verifica pagos y valida ingresos desde el ERP ---------- */
setInterval(async () => {
  if (document.visibilityState !== "visible" || !client()) return;
  const before = JSON.stringify(D.exp || {});
  await loadExp(true);
  if (JSON.stringify(D.exp || {}) === before) return;
  const active = document.activeElement, typing = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName), sheetOpen = !!document.querySelector(".sheet");
  if (!typing && !sheetOpen && ["trip", "stay", "etrip", "mine", "done", "home", "servicios"].includes(S.screen)) { refresh(); if (!["home", "servicios"].includes(S.screen)) toast("Tu reserva se actualizó"); }
}, 8000);

/* ---------- Inicio ---------- */
(async function init() {
  try { await loadCatalog(); } catch (e) { toast(errText(e)); }
  if (client()) await loadExp(true);
  const p = new URLSearchParams(location.search); if (p.get("exp") && EXPS.includes(p.get("exp"))) { S.exp = p.get("exp"); S.screen = "servicios"; }
  // Pantallas de la versión anterior guardadas en la sesión → su equivalente actual.
  const OLD = { dates: "home", room: "rooms", extras: "plan", summary: "plan", pay: "checkout" }; if (OLD[S.screen]) S.screen = OLD[S.screen];
  if (["plan", "checkout"].includes(S.screen) && !S.h.roomId) S.screen = S.h.from ? "rooms" : "home";
  render(true); loadLive();
})();
window.__pp = { S, D, go, A, V, resetDrafts };
