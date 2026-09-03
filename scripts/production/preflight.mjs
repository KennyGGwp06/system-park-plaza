import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.argv[2] || ".env.production");
const requiredFiles = ["docker-compose.production.yml", "Caddyfile", "server/Dockerfile", "client/Dockerfile", "customer/Dockerfile", "operations/Dockerfile", ".dockerignore"];
const errors = [];
const warnings = [];

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

if (!existsSync(file)) {
  errors.push(`No existe ${file}. Copia .env.production.example como .env.production y reemplaza todos los valores.`);
}

const env = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
const required = ["ERP_DOMAIN", "CUSTOMER_DOMAIN", "OPERATIONS_DOMAIN", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "DATABASE_URL", "JWT_SECRET", "DEMO_STAFF_PASSWORD"];
for (const key of required) {
  if (!env[key]) errors.push(`Falta ${key}.`);
  if (/REEMPLAZAR|tudominio\.com/i.test(env[key] || "")) errors.push(`${key} todavía contiene el valor de ejemplo.`);
}

if ((env.JWT_SECRET || "").length < 32) errors.push("JWT_SECRET debe tener al menos 32 caracteres.");
if ((env.POSTGRES_PASSWORD || "").length < 16) errors.push("POSTGRES_PASSWORD debe tener al menos 16 caracteres.");
if ((env.DEMO_STAFF_PASSWORD || "").length < 12 || env.DEMO_STAFF_PASSWORD === "ParkPlaza123*") errors.push("DEMO_STAFF_PASSWORD debe ser una clave temporal nueva de al menos 12 caracteres.");

const domains = [env.ERP_DOMAIN, env.CUSTOMER_DOMAIN, env.OPERATIONS_DOMAIN].filter(Boolean);
if (new Set(domains).size !== domains.length) errors.push("ERP_DOMAIN, CUSTOMER_DOMAIN y OPERATIONS_DOMAIN deben ser dominios diferentes.");
if (domains.some((domain) => /localhost|https?:\/\//i.test(domain))) errors.push("Los dominios deben escribirse sin protocolo y no pueden ser localhost.");

if (env.DATABASE_URL) {
  try {
    const database = new URL(env.DATABASE_URL);
    if (database.protocol !== "postgresql:" && database.protocol !== "postgres:") errors.push("DATABASE_URL debe usar postgresql://.");
    if (database.hostname !== "postgres") errors.push("Dentro de Docker, DATABASE_URL debe usar el host postgres.");
    if (decodeURIComponent(database.username) !== env.POSTGRES_USER) errors.push("El usuario de DATABASE_URL no coincide con POSTGRES_USER.");
    if (decodeURIComponent(database.password) !== env.POSTGRES_PASSWORD) warnings.push("La contraseña de DATABASE_URL no coincide con POSTGRES_PASSWORD. Revisa la codificación URL de símbolos.");
    if (database.pathname.slice(1) !== env.POSTGRES_DB) errors.push("La base de DATABASE_URL no coincide con POSTGRES_DB.");
  } catch {
    errors.push("DATABASE_URL no es una URL PostgreSQL válida.");
  }
}

for (const path of requiredFiles) if (!existsSync(resolve(path))) errors.push(`Falta el archivo de despliegue ${path}.`);

console.log(JSON.stringify({ status: errors.length ? "FAILED" : "PASSED", environmentFile: file, checks: required.length + requiredFiles.length + 7, errors, warnings }, null, 2));
if (errors.length) process.exit(1);
