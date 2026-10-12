import { db } from "./db.js";

/* Monitoreo (Fase 2 de escalabilidad): tiempos de respuesta y errores por minuto, en memoria de cada copia.
   El dueño lo ve en Control del sistema › Salud del sistema; si en un minuto la espera del 5 % más lento
   pasa de 1 s o hay errores 500, se deja una alerta en el registro del servidor. */
const buckets = new Map(); // minuto → { count, errors, durations[], routes: Map }
const SAMPLE = 3000;
const minuteOf = (ms) => Math.floor(ms / 60000);
const routeOf = (req) => (req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path.replace(/\/\d+(?=\/|$)/g, "/:id"));

export function metricsMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6, minute = minuteOf(Date.now());
    let bucket = buckets.get(minute);
    if (!bucket) { bucket = { count: 0, errors: 0, durations: [], routes: new Map() }; buckets.set(minute, bucket); for (const key of buckets.keys()) if (key < minute - 60) buckets.delete(key); }
    bucket.count++;
    if (res.statusCode >= 500) bucket.errors++;
    if (bucket.durations.length < SAMPLE) bucket.durations.push(ms); else bucket.durations[Math.floor(Math.random() * SAMPLE)] = ms;
    const key = `${req.method} ${routeOf(req)}`, route = bucket.routes.get(key) || { count: 0, total: 0, max: 0 };
    route.count++; route.total += ms; route.max = Math.max(route.max, ms); bucket.routes.set(key, route);
  });
  next();
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
export function snapshot(minutes = 5) {
  const now = minuteOf(Date.now()), durations = [], routes = new Map(), perMinute = [];
  let count = 0, errors = 0;
  for (let m = now - minutes + 1; m <= now; m++) {
    const bucket = buckets.get(m);
    perMinute.push({ minute: new Date(m * 60000).toISOString(), requests: bucket?.count || 0, errors: bucket?.errors || 0, p95: bucket ? Math.round(pct([...bucket.durations].sort((a, b) => a - b), 0.95)) : 0 });
    if (!bucket) continue;
    count += bucket.count; errors += bucket.errors; durations.push(...bucket.durations);
    for (const [key, value] of bucket.routes) { const r = routes.get(key) || { count: 0, total: 0, max: 0 }; r.count += value.count; r.total += value.total; r.max = Math.max(r.max, value.max); routes.set(key, r); }
  }
  durations.sort((a, b) => a - b);
  const slowest = [...routes.entries()].map(([route, r]) => ({ route, count: r.count, avgMs: Math.round(r.total / r.count), maxMs: Math.round(r.max) })).sort((a, b) => b.avgMs - a.avgMs).slice(0, 8);
  return { minutes, requests: count, perSecond: Math.round((count / (minutes * 60)) * 10) / 10, p50: Math.round(pct(durations, 0.5)), p95: Math.round(pct(durations, 0.95)), p99: Math.round(pct(durations, 0.99)), errors, slowest, perMinute };
}

export function startAlerts() {
  const timer = setInterval(() => {
    const last = snapshot(1);
    if (last.requests && (last.p95 > 1000 || last.errors)) console.warn(`ALERTA rendimiento: ${last.requests} pedidos en el último minuto · p95 ${last.p95} ms · ${last.errors} errores 500 · más lenta: ${last.slowest[0]?.route || "—"}`);
  }, 60000);
  timer.unref?.();
}

/* ---------- Varias copias del servidor ----------
   Cada copia guarda cada 15 s su minuto en curso (y el anterior) en server_metrics, más un latido en
   server_instances. La pantalla Salud del sistema suma todas las copias con clusterSnapshot. */
export function startMetricsFlush({ host, extra }) {
  const startedAt = new Date();
  const flush = async () => {
    const now = minuteOf(Date.now());
    for (const minute of [now - 1, now]) {
      const bucket = buckets.get(minute); if (!bucket) continue;
      const sorted = [...bucket.durations].sort((a, b) => a - b);
      const routes = Object.fromEntries([...bucket.routes.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 20).map(([key, r]) => [key, [r.count, Math.round(r.total), Math.round(r.max)]]));
      await db.query(`INSERT INTO server_metrics (host, minute, requests, errors, p50, p95, routes) VALUES ($1, to_timestamp($2::bigint * 60), $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (host, minute) DO UPDATE SET requests = EXCLUDED.requests, errors = EXCLUDED.errors, p50 = EXCLUDED.p50, p95 = EXCLUDED.p95, routes = EXCLUDED.routes`,
        [host, minute, bucket.count, bucket.errors, Math.round(pct(sorted, 0.5)), Math.round(pct(sorted, 0.95)), JSON.stringify(routes)]);
    }
    const info = extra();
    await db.query(`INSERT INTO server_instances (host, pid, started_at, last_seen, memory_mb, realtime_connections, shared_channel) VALUES ($1, $2, $3, NOW(), $4, $5, $6)
      ON CONFLICT (host) DO UPDATE SET pid = EXCLUDED.pid, started_at = EXCLUDED.started_at, last_seen = NOW(), memory_mb = EXCLUDED.memory_mb, realtime_connections = EXCLUDED.realtime_connections, shared_channel = EXCLUDED.shared_channel`,
      [host, process.pid, startedAt, info.memoryMb, info.connections, info.shared]);
  };
  const timer = setInterval(() => { flush().catch(() => {}); }, 15000);
  timer.unref?.();
  flush().catch(() => {});
}

/* Suma de todas las copias en los últimos N minutos. La espera del 5 % más lento de varias copias se
   aproxima con el promedio ponderado por pedidos de la de cada copia (no se guardan todos los tiempos). */
export async function clusterSnapshot(minutes = 5) {
  const now = minuteOf(Date.now());
  const { rows } = await db.query("SELECT (EXTRACT(EPOCH FROM minute)::bigint / 60) AS m, requests, errors, p50, p95, routes FROM server_metrics WHERE minute >= to_timestamp($1::bigint * 60)", [now - minutes + 1]);
  const byMinute = new Map(), routes = new Map();
  let count = 0, errors = 0, w50 = 0, w95 = 0;
  for (const row of rows) {
    const m = Number(row.m), agg = byMinute.get(m) || { requests: 0, errors: 0, w95: 0 };
    agg.requests += row.requests; agg.errors += row.errors; agg.w95 += row.p95 * row.requests; byMinute.set(m, agg);
    count += row.requests; errors += row.errors; w50 += row.p50 * row.requests; w95 += row.p95 * row.requests;
    for (const [key, [c, total, max]] of Object.entries(row.routes || {})) { const r = routes.get(key) || { count: 0, total: 0, max: 0 }; r.count += c; r.total += total; r.max = Math.max(r.max, max); routes.set(key, r); }
  }
  const perMinute = [];
  for (let m = now - minutes + 1; m <= now; m++) { const agg = byMinute.get(m); perMinute.push({ minute: new Date(m * 60000).toISOString(), requests: agg?.requests || 0, errors: agg?.errors || 0, p95: agg?.requests ? Math.round(agg.w95 / agg.requests) : 0 }); }
  const slowest = [...routes.entries()].map(([route, r]) => ({ route, count: r.count, avgMs: Math.round(r.total / Math.max(1, r.count)), maxMs: r.max })).sort((a, b) => b.avgMs - a.avgMs).slice(0, 8);
  return { minutes, requests: count, perSecond: Math.round((count / (minutes * 60)) * 10) / 10, p50: count ? Math.round(w50 / count) : 0, p95: count ? Math.round(w95 / count) : 0, errors, slowest, perMinute };
}

export async function purgeOldMetrics() {
  await db.query("DELETE FROM server_metrics WHERE minute < NOW() - INTERVAL '2 days'");
  await db.query("DELETE FROM server_instances WHERE last_seen < NOW() - INTERVAL '1 day'");
}
