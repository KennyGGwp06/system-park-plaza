import { db } from "./db.js";

const clean = (value, limit = 240) => String(value ?? "").trim().slice(0, limit) || null;
const roleOf = (user) => typeof user?.role === "string" ? user.role : user?.role?.name || null;

export async function writeSecurityAudit({ req, eventType, operation, reason, status, user = req?.user, area, shift, reference } = {}) {
  try {
    const actorId = user?.id ? Number(user.id) : null;
    const resolvedArea = clean(area ?? req?.body?.area ?? req?.query?.area, 60);
    const resolvedShift = clean(shift ?? req?.body?.shift ?? req?.body?.shiftCode ?? req?.query?.shift, 100);
    const resolvedReference = clean(reference ?? `${req?.method || "SYSTEM"} ${req?.path || ""}`, 240);
    await db.query(`INSERT INTO inventory_audit_events
      (event_type,entity_type,actor_legacy_user_id,actor_role,area_code,shift_code,operation,reference,reason,after_data,correlation_id)
      VALUES($1,'API_SECURITY',$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, [
      clean(eventType, 80) || "API_OPERATION", actorId, roleOf(user), resolvedArea, resolvedShift,
      clean(operation, 120), resolvedReference, clean(reason, 500),
      JSON.stringify({ status: Number(status || 0) || null, method: req?.method || null, path: req?.path || null }),
      `security:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
    ]);
  } catch (error) {
    // La auditoría complementaria no debe convertir una denegación en un 500.
    console.error("security audit write failed", error.message);
  }
}

export function normalizeStaffRole(value) {
  const role = String(value || "").toUpperCase();
  return role === "COCINA" ? "RESTAURANTE" : role;
}
