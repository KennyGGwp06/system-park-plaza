// Ejecutar en Linux: docker run --rm -v "$PWD":/source:ro parkplaza-audit-backend node /source/scripts/pruebas/deploy-guards.cjs
// Comandos externos simulados: nunca conecta a la nube ni usa Docker real.
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert/strict"), { spawnSync } = require("child_process");
const source = path.resolve(__dirname, "../..");
const envText = `COMPOSE_PROJECT_NAME=parkplaza_v2\nERP_PORT=18081\nCUSTOMER_PORT=18082\nERP_DOMAIN=erp.example.com\nCUSTOMER_DOMAIN=customer.example.com\nPOSTGRES_USER=postgres\nPOSTGRES_DB=hotel\nPOSTGRES_PASSWORD=abcdefghijklmnop\nDATABASE_URL=postgresql://postgres:abcdefghijklmnop@postgres:5432/hotel\nJWT_SECRET=abcdefghijklmnopqrstuvwxyz0123456789\nDEMO_STAFF_PASSWORD=abcdefghijklmnop\n`;
function fixture(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "parkplaza-guards-"));
  fs.mkdirSync(path.join(root, "deploy/aapanel"), { recursive: true });
  fs.mkdirSync(path.join(root, "bin"));
  for (const file of ["3-instalar-version-nueva.sh", "4-verificar.sh", "6-apagar-version-anterior.sh"]) fs.copyFileSync(path.join(source, "deploy/aapanel", file), path.join(root, "deploy/aapanel", file));
  fs.writeFileSync(path.join(root, ".env.aapanel"), envText);
  const script = (name, text) => fs.writeFileSync(path.join(root, "bin", name), "#!/usr/bin/env bash\n" + text, { mode: 0o755 });
  script("ss", "exit 0\n");
  script("free", "echo 'Mem: 4000 100 0 0 0 3000'\n");
  script("docker", `echo "$*" >> "$TRACE"\nif [[ "$MODE" == preflight && "$1" == run ]]; then exit 7; fi\nif [[ "$*" == *'pg_restore'* ]]; then exit 9; fi\nif [[ "$*" == *' ps -q postgres'* ]]; then echo fixture-postgres; fi\nexit 0\n`);
  script("curl", `if [[ "$*" == *'http_code'* ]]; then printf 200\nelif [[ "$*" == *'/health'* ]]; then printf '{"database":"connected"}'\nelif [[ "$*" == *'/auth/login'* ]]; then printf '{"token":"fixture"}'\nelif [[ "$*" == *'https://customer.example.com/'* ]]; then printf '<script src="/assets/old.js"></script>'\nelse printf '<script src="/assets/new.js"></script>'; fi\n`);
  return { root, env: { ...process.env, PATH: path.join(root, "bin") + ":" + process.env.PATH, MODE: mode, TRACE: path.join(root, "trace") } };
}
function run(f, script, args = []) { return spawnSync("bash", [path.join(f.root, "deploy/aapanel", script), ...args], { env: f.env, encoding: "utf8" }); }
const preflight = fixture("preflight");
assert.notEqual(run(preflight, "3-instalar-version-nueva.sh").status, 0);
assert.doesNotMatch(fs.readFileSync(preflight.env.TRACE, "utf8"), / up -d/);
const restore = fixture("restore");
fs.mkdirSync(path.join(restore.root, "datos"));
fs.writeFileSync(path.join(restore.root, "datos/parkplaza.dump"), "fixture");
fs.writeFileSync(path.join(restore.root, "datos/uploads.tgz"), "fixture");
const fixtureHash = require('crypto').createHash('sha256').update('fixture').digest('hex');
fs.writeFileSync(path.join(restore.root, "datos/SHA256SUMS"), `${fixtureHash}  parkplaza.dump\n${fixtureHash}  uploads.tgz\n`);
assert.notEqual(run(restore, "3-instalar-version-nueva.sh").status, 0);
assert.equal(fs.existsSync(path.join(restore.root, "datos/.cargado")), false);
assert.match(fs.readFileSync(restore.env.TRACE, "utf8"), /stop backend backup/);
assert.match(fs.readFileSync(restore.env.TRACE, "utf8"), /single-transaction --exit-on-error/);
const corrupt = fixture('restore');
fs.mkdirSync(path.join(corrupt.root,'datos'));
for(const file of ['parkplaza.dump','uploads.tgz','SHA256SUMS']) fs.copyFileSync(path.join(restore.root,'datos',file),path.join(corrupt.root,'datos',file));
fs.appendFileSync(path.join(corrupt.root,'datos/parkplaza.dump'),'corrupt');
assert.notEqual(run(corrupt,'3-instalar-version-nueva.sh').status,0);
assert.doesNotMatch(fs.readFileSync(corrupt.env.TRACE,'utf8'),/stop backend backup|pg_restore/,'No se restaura un paquete corrupto');
const domains = fixture("domains");
assert.equal(run(domains, "4-verificar.sh").status, 0, "Antes del cambio de proxy se permite verificar localmente");
assert.notEqual(run(domains, "4-verificar.sh", ["--require-domains"]).status, 0, "Ambos dominios deben apuntar a la nueva versión");
assert.notEqual(run(domains, "6-apagar-version-anterior.sh").status, 0);
assert.doesNotMatch(fs.readFileSync(domains.env.TRACE, "utf8"), /^stop /m, "No se detiene la anterior si un dominio sigue allí");
const envFile = path.join(domains.root, "mismatch.env");
fs.writeFileSync(envFile, envText.replace("postgres:abcdefghijklmnop@", "postgres:anotherpassword@"));
assert.notEqual(spawnSync(process.execPath, [path.join(source, "scripts/production/preflight.mjs"), envFile, "aapanel"], { cwd: source }).status, 0);
console.log("OK: preflight bloqueante, hashes obligatorios, restauración atómica sin marcador falso, dos dominios obligatorios y contraseña consistente");
