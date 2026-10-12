import { createHash } from "node:crypto";

// Cada registro de auditoría guarda la firma del anterior (cadena SHA-256):
// editar, borrar o reordenar uno rompe la cadena y verifyAuditChain lo detecta.
// JSONB no conserva el orden de las claves, así que la firma se calcula sobre una serialización con claves ordenadas.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function auditDigest(entry, previousHash) {
  const { hash: _hash, ...body } = entry;
  return createHash("sha256").update(`${previousHash}|${stable(body)}`).digest("hex");
}

export function sealAudit(state, entry) {
  entry.prevHash = state.audit[0]?.hash || "GENESIS";
  entry.hash = auditDigest(entry, entry.prevHash);
  state.audit.unshift(entry);
  return entry;
}

export function verifyAuditChain(rows) {
  const chained = rows.filter((row) => row.hash);
  const broken = [];
  for (let index = 0; index < chained.length; index += 1) {
    const row = chained[index];
    const older = chained[index + 1];
    if (auditDigest(row, row.prevHash) !== row.hash) broken.push({ id: row.id, reason: "contenido alterado" });
    else if (older && older.hash !== row.prevHash) broken.push({ id: row.id, reason: "falta un registro anterior o fue reordenado" });
  }
  return { total: rows.length, chained: chained.length, unchained: rows.length - chained.length, intact: broken.length === 0, broken };
}
