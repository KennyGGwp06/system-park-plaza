/* Tiempo real entre copias del servidor (Fase 2 de escalabilidad). Cada copia escucha el canal
   `pp_state_changed` de Postgres (LISTEN/NOTIFY) y reenvía el aviso a las pantallas conectadas a ella.
   Así un cambio atendido por una copia llega a todas, sin agregar Redis. Si el canal se cae, el aviso
   al menos llega a las pantallas de esta copia (y el ERP igual sondea cada 30 s) mientras se reconecta. */
import pg from "pg";
import { db } from "./db.js";

const CHANNEL = "pp_state_changed";
let listening = false;
export const busStatus = () => ({ listening });

export function startRealtimeBus(io) {
  let retry = null;
  const scheduleRetry = () => { listening = false; if (!retry) retry = setTimeout(() => { retry = null; connect(); }, 2000); };
  const connect = async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (message) => { try { io.emit("state:changed", JSON.parse(message.payload)); } catch { /* aviso malformado: se ignora */ } });
    client.on("error", () => { client.end().catch(() => {}); scheduleRetry(); });
    client.on("end", scheduleRetry);
    try { await client.connect(); await client.query(`LISTEN ${CHANNEL}`); listening = true; }
    catch { client.end().catch(() => {}); scheduleRetry(); }
  };
  connect();
}

export async function publishChange(io, payload) {
  const body = JSON.stringify({ ...payload, paths: (payload.paths || []).slice(0, 20) });
  if (listening) {
    try { await db.query("SELECT pg_notify($1, $2)", [CHANNEL, body]); return; } catch { /* cae a local */ }
  }
  io.emit("state:changed", JSON.parse(body));
}

/* Tareas de mantenimiento que basta con que haga UNA copia a la vez (archivar, cerrar la jornada). */
export async function asLeader(lockId, task) {
  const client = await db.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [lockId]);
    if (!rows[0].ok) return null;
    try { return await task(); } finally { await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch(() => {}); }
  } finally { client.release(); }
}
