import { db } from "./db.js";
import { createPurchaseOrder } from "./purchasing.js";
import { dailyNeeds, AREAS } from "./daily-needs.js";

// Fase 2: food cost teórico (recetas × ventas) contra el real (lo que salió del conteo físico del cierre).
const n = (value) => Number(value || 0);
const r2 = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;
const pct = (part, whole) => n(whole) > 0 ? r2(n(part) / n(whole) * 100) : null;

/** Cierres enviados o cerrados de los últimos `days` días, con costo teórico y real por insumo. */
export async function foodCostReport({ days = 14 } = {}) {
  const span = Math.min(Math.max(Math.trunc(n(days)) || 14, 1), 90);
  const sessions = (await db.query(`SELECT s.id,s.area_code area,s.status,s.period_started_at "periodStart",s.submitted_at "periodEnd",c.id "closingId"
    FROM inventory_shift_sessions s
    JOIN LATERAL (SELECT id FROM inventory_closings WHERE session_id=s.id ORDER BY revision DESC LIMIT 1) c ON TRUE
    WHERE s.status IN ('SUBMITTED','CLOSED') AND s.submitted_at >= NOW() - ($1::int || ' days')::interval AND s.period_started_at IS NOT NULL
    ORDER BY s.submitted_at DESC`, [span])).rows;
  const areas = [];
  for (const [code, name] of AREAS) {
    const rows = [];
    for (const session of sessions.filter((item) => item.area === code)) {
      const lines = (await db.query(`SELECT p.name "productName",u.symbol "unitSymbol",l.theoretical_consumption theoretical,l.derived_actual_consumption actual,l.unexplained_difference difference,l.unit_cost "unitCost"
        FROM inventory_shift_summary_lines l JOIN inventory_products p ON p.id=l.product_id JOIN inventory_units u ON u.id=l.unit_id WHERE l.closing_id=$1`, [session.closingId])).rows;
      const theoreticalCost = lines.reduce((sum, line) => sum + n(line.theoretical) * n(line.unitCost), 0);
      const realCost = lines.reduce((sum, line) => sum + Math.max(0, n(line.actual)) * n(line.unitCost), 0);
      const sales = (await db.query(`SELECT COALESCE(SUM(s.total_sale),0) sales FROM inventory_recipe_sales s JOIN inventory_recipe_versions rv ON rv.id=s.recipe_version_id JOIN inventory_recipes r ON r.id=rv.recipe_id
        WHERE r.area_code=$1 AND s.status<>'CANCELLED' AND s.created_at>=$2 AND s.created_at<=$3`, [code, session.periodStart, session.periodEnd])).rows[0].sales;
      rows.push({
        sessionId: n(session.id), status: session.status, from: session.periodStart, to: session.periodEnd, sales: r2(sales),
        theoreticalCost: r2(theoreticalCost), realCost: r2(realCost), differenceCost: r2(realCost - theoreticalCost),
        theoreticalPercent: pct(theoreticalCost, sales), realPercent: pct(realCost, sales),
        topDifferences: lines.map((line) => ({ productName: line.productName, unitSymbol: line.unitSymbol, difference: n(line.difference), cost: r2(n(line.difference) * n(line.unitCost)) }))
          .filter((line) => Math.abs(line.cost) >= 0.01).sort((a, b) => Math.abs(b.cost) - Math.abs(a.cost)).slice(0, 5)
      });
    }
    // Por plato: costo teórico de la receta. El real por plato no se mide; se estima repartiendo la diferencia del periodo según el costo teórico.
    const dishes = (await db.query(`SELECT r.name,SUM(s.quantity) quantity,SUM(s.total_sale) sales,SUM(s.total_recipe_cost) cost
      FROM inventory_recipe_sales s JOIN inventory_recipe_versions rv ON rv.id=s.recipe_version_id JOIN inventory_recipes r ON r.id=rv.recipe_id
      WHERE r.area_code=$1 AND s.status<>'CANCELLED' AND s.created_at >= NOW() - ($2::int || ' days')::interval GROUP BY r.id,r.name ORDER BY SUM(s.total_sale) DESC`, [code, span])).rows;
    const totalTheoretical = rows.reduce((sum, row) => sum + row.theoreticalCost, 0);
    const totalDifference = rows.reduce((sum, row) => sum + row.differenceCost, 0);
    const dishTotal = dishes.reduce((sum, dish) => sum + n(dish.cost), 0);
    areas.push({
      area: code, name,
      totals: { sales: r2(rows.reduce((sum, row) => sum + row.sales, 0)), theoreticalCost: r2(totalTheoretical), realCost: r2(rows.reduce((sum, row) => sum + row.realCost, 0)), differenceCost: r2(totalDifference) },
      shifts: rows,
      dishes: dishes.map((dish) => {
        const estimatedReal = n(dish.cost) + (dishTotal > 0 ? totalDifference * n(dish.cost) / dishTotal : 0);
        return { name: dish.name, quantity: n(dish.quantity), sales: r2(dish.sales), theoreticalCost: r2(dish.cost), theoreticalPercent: pct(dish.cost, dish.sales), estimatedRealCost: r2(estimatedReal), estimatedRealPercent: pct(estimatedReal, dish.sales) };
      })
    });
  }
  return { days: span, generatedAt: new Date().toISOString(), areas };
}

/** Crea una orden de compra con lo que Necesidades del día marca como "por comprar" (suma de ambas áreas). */
export async function purchaseOrderFromNeeds(state, payload, actorId) {
  const needs = await dailyNeeds(state);
  const wanted = payload?.lines?.length ? new Map(payload.lines.map((line) => [n(line.productId), n(line.quantity)])) : null;
  const merged = new Map();
  for (const area of needs.areas) for (const line of area.lines) {
    if (line.toBuyQuantity <= 0) continue;
    const current = merged.get(line.productId) || { productId: line.productId, orderedQuantity: 0, unitCost: line.unitCost, observation: "" };
    current.orderedQuantity += line.toBuyQuantity;
    current.observation += `${current.observation ? " · " : ""}${area.name}: ${line.toBuyQuantity} ${line.unitSymbol}`;
    merged.set(line.productId, current);
  }
  const lines = [...merged.values()].map((line) => ({ ...line, orderedQuantity: wanted ? (wanted.get(line.productId) ?? 0) : line.orderedQuantity })).filter((line) => line.orderedQuantity > 0);
  if (!lines.length) { const error = new Error("No hay nada por comprar según las necesidades del día"); error.status = 409; throw error; }
  return createPurchaseOrder({ supplierId: payload?.supplierId || null, notes: `Necesidades del día ${needs.today}`, lines }, actorId);
}
