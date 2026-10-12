/* ui.js: piezas visuales compartidas del flujo de Hospedaje (v5): íconos, atardecer real, saludos, conteos. */

/* Íconos de trazo propio (24×24). Un solo estilo en toda la app: trazo 1.7, puntas redondeadas. */
const P = {
  bed: '<path d="M3 18v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6M3 18h18M3 15h18M6 9V7a1 1 0 0 1 1-1h4v3"/>',
  pool: '<path d="M3 9c2 0 2 1.5 4.5 1.5S10 9 12 9s2.5 1.5 4.5 1.5S19 9 21 9M3 14c2 0 2 1.5 4.5 1.5S10 14 12 14s2.5 1.5 4.5 1.5S19 14 21 14M3 19c2 0 2 1.5 4.5 1.5S10 19 12 19s2.5 1.5 4.5 1.5S19 19 21 19"/>',
  sunset: '<path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 5v3M5.6 8.6l1.8 1.8M18.4 8.6l-1.8 1.8M3 14h1.5M19.5 14H21M9 21h6"/>',
  dine: '<path d="M5 3l7 9M19 3l-7 9M12 12v9M8 21h8"/>',
  party: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  user: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.6-3.6 3.1-5.5 6.2-5.5s5.6 1.9 6.2 5.5M16 4.6a3.4 3.4 0 0 1 0 6.8M18 14.9c1.8.7 3 2.3 3.4 5.1"/>',
  one: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.5-5.8 7-5.8s6.3 2 7 5.8"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14.5 8.5L16.5 10.5"/>',
  towel: '<path d="M6 4h12v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="M6 8h12M10 12h4"/>',
  broom: '<path d="M14 3l-3 8M7 11h8l2 10H5z"/><path d="M9 15v6M13 15v6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.4-.4-2.4z"/>',
  bell: '<path d="M4 17h16M6 17a6 6 0 0 1 12 0M12 8V6M10 6h4M3 20h18"/>',
  food: '<path d="M4 11h16a8 8 0 0 1-16 0zM12 3v3M8 4.5l1 2M16 4.5l-1 2"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4M4 16h16v3h-3v-3M7 16v3H4M7.5 12.5h.01M16.5 12.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14.5 12h.01"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a4.8 4.8 0 0 1 6.4 0M12 19.5h.01"/>',
  leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"/>',
  glass: '<path d="M6 3h12l-1.5 7a4.5 4.5 0 0 1-9 0zM12 14.5V21M8 21h8M6.6 7h10.8"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  bath: '<path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0M7 20l-1 2M17 20l1 2"/>'
};
export const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.spark}</svg>`;
export const FEATURE_IC = f => /wi-?fi/i.test(f) ? "wifi" : /baño/i.test(f) ? "bath" : /jard|vista/i.test(f) ? "leaf" : /cama/i.test(f) ? "bed" : "check";

/* Atardecer real en Pucallpa (algoritmo del almanaque náutico, error de ±2 min). Hora de Lima (UTC−5). */
export function sunsetPucallpa(date = new Date()) {
  const lat = -8.3791, lng = -74.5539, rad = Math.PI / 180, deg = 180 / Math.PI;
  const start = Date.UTC(date.getFullYear(), 0, 0), N = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
  const lngHour = lng / 15, t = N + ((18 - lngHour) / 24), M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
  let RA = (Math.atan(0.91764 * Math.tan(L * rad)) * deg + 360) % 360; RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad)); if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) * deg / 15, T = H + RA - 0.06571 * t - 6.622, UT = ((T - lngHour) % 24 + 24) % 24, local = ((UT - 5) % 24 + 24) % 24;
  const h = Math.floor(local), m = Math.round((local - h) * 60);
  return { h: m === 60 ? h + 1 : h, m: m === 60 ? 0 : m, label: `${(h % 12) || 12}:${String(m === 60 ? 0 : m).padStart(2, "0")} p. m.` };
}

/* Hora actual en Lima y saludo según la hora. */
export const limaNow = () => { const s = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number); return { h: s[0], m: s[1] }; };
export const greet = () => { const h = limaNow().h; return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; };

/* Montos que cuentan hasta su nuevo valor (solo si cambian; respeta "reducir movimiento"). */
const lastVal = new Map();
export function countUp(root = document) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach(el => {
    const key = el.dataset.countKey || "", to = Number(el.dataset.count), from = lastVal.has(key) ? lastVal.get(key) : to; lastVal.set(key, to);
    const fmt = v => "S/ " + Math.round(v).toLocaleString("es-PE");
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 520; el.classList.add("ticking");
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else { el.textContent = fmt(to); el.classList.remove("ticking"); } };
    el.textContent = fmt(from); requestAnimationFrame(step);
  });
}

/* Copiar al portapapeles con respuesta visible. */
export async function copyText(txt) { try { await navigator.clipboard.writeText(txt); return true; } catch { return false; } }
