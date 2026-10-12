/* Límites de intentos (Fase 2 de escalabilidad). Se guardan en Postgres para que todas las copias del
   servidor cuenten juntas, y cuentan por persona (documento o correo) además de un tope por IP más alto:
   en un hotel muchos huéspedes salen a internet con la misma IP (el wifi), así que un tope bajo por IP
   bloqueaba a todos. */
import { db } from "./db.js";

async function hit(key, windowMinutes) {
  const { rows } = await db.query(`INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, NOW() + make_interval(mins => $2))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN NOW() + make_interval(mins => $2) ELSE rate_limits.reset_at END
    RETURNING count`, [key, windowMinutes]);
  return rows[0].count;
}

/* rules: [{ scope, limit, key: (req) => texto }] — basta que una se supere para rechazar. */
export function rateLimit(rules, message, windowMinutes = 15) {
  return async (req, res, next) => {
    try {
      for (const rule of rules) {
        const part = rule.key(req);
        if (part === null) continue;
        if (await hit(`${rule.scope}:${part}`, windowMinutes) > rule.limit) return res.status(429).json({ message });
      }
      next();
    } catch (error) { next(error); }
  };
}

/* Un ingreso correcto limpia el contador de esa persona (como hacía el límite anterior en memoria). */
export async function clearRateLimit(scope, part) { await db.query("DELETE FROM rate_limits WHERE key = $1", [`${scope}:${part}`]).catch(() => {}); }

export async function purgeRateLimits() { await db.query("DELETE FROM rate_limits WHERE reset_at < NOW()"); }
