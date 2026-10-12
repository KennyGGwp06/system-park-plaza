// Prueba de carga contra el servidor de prueba (copia pp_carga). Uso: node carga.mjs <escenario> [segundos]
// Escenarios: lectura · cliente · escritura · mixto
// API puede ser una lista separada por comas (varias copias del servidor): se reparte un pedido a cada una por turno.
const APIS = (process.env.API || "http://localhost:3000/api").split(",");
let turn = 0;
const API = APIS[0];
const [scenario = "lectura", secs = "10"] = process.argv.slice(2);
const DUR = Number(secs) * 1000;
const t = () => performance.now();
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

async function req(path, { method = "GET", body, token } = {}) {
  const t0 = t();
  try {
    const r = await fetch(APIS[turn++ % APIS.length] + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    await r.arrayBuffer();
    return { ms: t() - t0, ok: r.ok, status: r.status };
  } catch (e) { return { ms: t() - t0, ok: false, status: e.name === "TimeoutError" ? "timeout" : "error" }; }
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
const READS = ["/public/catalog", `/public/rooms?checkIn=${today}&checkOut=${tomorrow}`, `/public/availability/PISCINA?from=${today}`, `/public/availability/MIRADOR?from=${today}`];

async function tokenFor(doc) { const r = await fetch(API + "/public/document-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentNumber: doc }) }); const j = await r.json(); return j.token; }

async function run(concurrency) {
  const stats = { read: [], write: [], errors: {}, n: 0 };
  const token = ["cliente", "escritura", "mixto"].includes(scenario) ? await tokenFor("40222333") : null;
  const end = t() + DUR;
  const worker = async (w) => {
    let i = w;
    while (t() < end) {
      let res, kind = "read";
      if (scenario === "lectura") res = await req(READS[i % READS.length]);
      else if (scenario === "cliente") res = await req(i % 2 ? "/public/my-experience" : READS[i % READS.length], { token });
      else if (scenario === "escritura") { kind = "write"; res = await req("/public/requests", { method: "POST", token, body: { type: "OTRO", description: "prueba de carga" } }); }
      else { // mixto: 1 de cada 10 es una escritura
        if (i % 10 === 0) { kind = "write"; res = await req("/public/requests", { method: "POST", token, body: { type: "OTRO", description: "prueba de carga" } }); }
        else res = await req(i % 3 ? READS[i % READS.length] : "/public/my-experience", { token });
      }
      stats[kind].push(res.ms); stats.n++;
      if (!res.ok) stats.errors[res.status] = (stats.errors[res.status] || 0) + 1;
      i += concurrency;
    }
  };
  const t0 = t(); await Promise.all(Array.from({ length: concurrency }, (_, w) => worker(w))); const el = (t() - t0) / 1000;
  const all = [...stats.read, ...stats.write];
  const errs = Object.values(stats.errors).reduce((a, b) => a + b, 0);
  const line = { usuarios: concurrency, "pedidos/s": Math.round(stats.n / el), p50: Math.round(pct(all, .5)), p95: Math.round(pct(all, .95)), p99: Math.round(pct(all, .99)), max: Math.round(Math.max(...all)), errores: errs ? `${errs} (${Math.round(errs / stats.n * 100)} %) ${JSON.stringify(stats.errors)}` : "0" };
  if (stats.write.length) Object.assign(line, { "escrituras/s": Math.round(stats.write.length / el), "p95 escritura": Math.round(pct(stats.write, .95)) });
  return line;
}
const levels = (process.env.LEVELS || "1,10,50,100,200").split(",").map(Number);
const out = [];
for (const c of levels) { const r = await run(c); out.push(r); console.log(JSON.stringify(r)); await new Promise(r => setTimeout(r, 1500)); }
console.table(out);
