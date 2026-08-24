const baseUrl = (process.env.PERF_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoints = (process.env.PERF_ENDPOINTS || "/api/health,/api/public/catalog")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const slowThreshold = Number(process.env.PERF_SLOW_MS || 1200);

async function measure(path) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { headers: { "Cache-Control": "no-cache" } });
  const body = await response.arrayBuffer();
  const elapsed = Math.round(performance.now() - startedAt);
  return { path, status: response.status, elapsed, bytes: body.byteLength };
}

console.log(`Prueba móvil de API: ${baseUrl}`);
console.log(`Objetivo por consulta: ≤ ${slowThreshold} ms`);
let failed = false;
for (const path of endpoints) {
  try {
    const result = await measure(path);
    const status = result.status >= 200 && result.status < 400 && result.elapsed <= slowThreshold ? "OK" : "REVISAR";
    console.log(`${status.padEnd(8)} ${result.path.padEnd(30)} ${String(result.elapsed).padStart(5)} ms  ${String(result.bytes).padStart(7)} bytes  HTTP ${result.status}`);
    failed ||= status === "REVISAR";
  } catch (error) {
    failed = true;
    console.log(`ERROR    ${path}: ${error.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
