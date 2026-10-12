import { db } from "./db.js";

// Fase 2: consumo teórico (recetas × ventas), necesidades del día y estado del cierre por área.
const n = (value) => Number(value || 0);
const r3 = (value) => Math.round((n(value) + Number.EPSILON) * 1000) / 1000;
export const AREAS = [["RESTAURANTE", "Restaurante"], ["BARTENDER", "Bar"]];
export const DEFAULT_CLOSING_TIME = "23:00";
export const HISTORY_DAYS = 7;
// Se tolera un 10 % sobre lo justificado antes de marcar "exceso".
export const EXCESS_TOLERANCE = 0.10;
// Se avisa cuando el stock del área alcanza para menos de estos días de venta.
export const DEPLETION_ALERT_DAYS = 3;

export const normalizeClosingTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : DEFAULT_CLOSING_TIME;

function limaParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}` };
}

/** Unidades base que las recetas vigentes consumen por cada porción vendida, según lo vendido en los últimos `days` días. */
async function recipeUsage(client, area, days, timeZone) {
  return (await client.query(`
    SELECT ri.product_id "productId",
      SUM(s.quantity * ri.base_quantity * (1 + ri.technical_waste_percent/100.0) / NULLIF(rv.yield_quantity,0)) "usage"
    FROM inventory_recipe_sales s
    JOIN inventory_recipe_versions rv ON rv.id=s.recipe_version_id
    JOIN inventory_recipes r ON r.id=rv.recipe_id AND r.area_code=$1
    JOIN inventory_recipe_ingredients ri ON ri.recipe_version_id=rv.id
    WHERE s.status<>'CANCELLED' AND (s.created_at AT TIME ZONE $3)::date > ((NOW() AT TIME ZONE $3)::date - $2::int)
    GROUP BY ri.product_id`, [area, days, timeZone])).rows;
}

async function areaClosing(client, area, today, closingTime, nowTime, timeZone) {
  const row = (await client.query(`SELECT s.id,s.status,s.submitted_at "submittedAt",s.responsible_legacy_user_id "responsibleId"
    FROM inventory_shift_sessions s
    WHERE s.area_code=$1 AND s.status IN ('SUBMITTED','CLOSED') AND (s.submitted_at AT TIME ZONE $3)::date=$2::date
    ORDER BY s.submitted_at DESC LIMIT 1`, [area, today, timeZone])).rows[0];
  if (row) return { status: "CERRADO", label: "Cerró", submittedAt: row.submittedAt, sessionId: n(row.id) };
  if (nowTime >= closingTime) return { status: "SIN_CIERRE", label: "Sin cierre", submittedAt: null, sessionId: null };
  return { status: "PENDIENTE", label: `Cierra a las ${closingTime}`, submittedAt: null, sessionId: null };
}

/** Necesidades de un área: lo que se justifica pedir para mañana. */
export async function areaNeeds(client, area, { days = HISTORY_DAYS, timeZone = "America/Lima", extraProductIds = [] } = {}) {
  const warehouse = (await client.query("SELECT id FROM inventory_warehouses WHERE code=$1 AND active", [area])).rows[0];
  if (!warehouse) return [];
  const usage = new Map((await recipeUsage(client, area, days, timeZone)).map((row) => [n(row.productId), n(row.usage)]));
  const products = (await client.query(`
    SELECT p.id,p.name,p.minimum_stock "minimumStock",p.maximum_stock "maximumStock",p.average_cost "unitCost",u.symbol "unitSymbol",
      COALESCE((SELECT SUM(b.on_hand) FROM inventory_stock_balances b WHERE b.product_id=p.id AND b.warehouse_id=$1),0) "areaStock",
      COALESCE((SELECT SUM(b.on_hand-b.reserved) FROM inventory_stock_balances b JOIN inventory_warehouses w ON w.id=b.warehouse_id JOIN inventory_lots lot ON lot.id=b.lot_id WHERE b.product_id=p.id AND w.code='GENERAL' AND w.active AND lot.status='AVAILABLE'),0) "generalAvailable"
    FROM inventory_products p JOIN inventory_units u ON u.id=p.base_unit_id
    WHERE p.status='ACTIVE' AND (p.id=ANY($2::bigint[]) OR p.id=ANY($4::bigint[]) OR (p.default_area_code=$3 AND p.minimum_stock>0))
    ORDER BY p.name`, [warehouse.id, [...usage.keys()], area, extraProductIds.map(n)])).rows;
  return products.map((product) => {
    const weeklyUsage = usage.get(n(product.id)) || 0;
    const dailyUsage = weeklyUsage / days;
    const minimum = n(product.minimumStock);
    const areaStock = n(product.areaStock);
    const needed = Math.max(0, dailyUsage + minimum - areaStock);
    const toBuy = Math.max(0, needed - n(product.generalAvailable));
    return {
      productId: n(product.id), productName: product.name, unitSymbol: product.unitSymbol, unitCost: n(product.unitCost),
      soldUsagePerDay: r3(dailyUsage), minimumStock: minimum, areaStock: r3(areaStock), generalAvailable: r3(product.generalAvailable),
      justifiedQuantity: r3(needed), toBuyQuantity: r3(toBuy), hasRecipeBasis: weeklyUsage > 0,
      daysLeft: dailyUsage > 0 ? r3(areaStock / dailyUsage) : null
    };
  });
}

export async function dailyNeeds(state) {
  const timeZone = state?.settings?.timezone || "America/Lima";
  const closingTime = normalizeClosingTime(state?.settings?.closingTime);
  const { date: today, time: nowTime } = limaParts(new Date(), timeZone);
  const client = await db.connect();
  try {
    const areas = [];
    for (const [code, name] of AREAS) {
      const [closing, requests] = await Promise.all([
        areaClosing(client, code, today, closingTime, nowTime, timeZone),
        client.query(`SELECT r.id,r.code,r.source,r.requested_at "requestedAt",json_agg(json_build_object('productId',l.product_id,'requested',l.requested_quantity,'justified',l.justified_quantity)) lines
          FROM inventory_stock_requests r JOIN inventory_stock_request_lines l ON l.request_id=r.id
          WHERE r.area_code=$1 AND r.status='REQUESTED' GROUP BY r.id ORDER BY r.requested_at DESC`, [code])
      ]);
      const asked = new Map();
      for (const request of requests.rows) for (const line of request.lines) asked.set(n(line.productId), (asked.get(n(line.productId)) || 0) + n(line.requested));
      const lines = await areaNeeds(client, code, { timeZone, extraProductIds: [...asked.keys()] });
      const rows = lines.map((line) => {
        const requested = asked.get(line.productId) || 0;
        return { ...line, requestedQuantity: r3(requested), excess: requested > line.justifiedQuantity * (1 + EXCESS_TOLERANCE) + 0.000001 };
      }).filter((line) => line.justifiedQuantity > 0 || line.requestedQuantity > 0 || (line.daysLeft !== null && line.daysLeft <= DEPLETION_ALERT_DAYS));
      areas.push({ area: code, name, closing, pendingRequests: requests.rows.length, lines: rows, toBuyLines: rows.filter((line) => line.toBuyQuantity > 0).length });
    }
    return { closingTime, today, generatedAt: new Date().toISOString(), historyDays: HISTORY_DAYS, excessTolerancePercent: EXCESS_TOLERANCE * 100, depletionAlertDays: DEPLETION_ALERT_DAYS, areas };
  } finally { client.release(); }
}

/** Justificación por producto para marcar exceso en solicitudes. */
export async function justificationFor(client, area, timeZone = "America/Lima") {
  return new Map((await areaNeeds(client, area, { timeZone })).map((line) => [line.productId, line]));
}

export async function areaClosingStatus(state, area) {
  const timeZone = state?.settings?.timezone || "America/Lima";
  const closingTime = normalizeClosingTime(state?.settings?.closingTime);
  const { date, time } = limaParts(new Date(), timeZone);
  const client = await db.connect();
  try { return { closingTime, ...(await areaClosing(client, area, date, closingTime, time, timeZone)) }; } finally { client.release(); }
}
