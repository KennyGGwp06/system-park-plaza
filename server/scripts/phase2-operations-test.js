import assert from "node:assert/strict";
import { ensureOrderDeadlines, orderTiming, totalsByUnit } from "../src/order-operations.js";

const base = { id: 1, code: "PED-0001", status: "PENDIENTE", createdAt: "2026-08-21T10:00:00.000Z", estimatedMinutes: 20 };
ensureOrderDeadlines(base);
assert.equal(orderTiming(base, new Date("2026-08-21T10:10:00.000Z")).operationalBucket, "ACTIVE");
assert.equal(orderTiming(base, new Date("2026-08-21T10:21:00.000Z")).operationalBucket, "LATE");
assert.equal(orderTiming(base, new Date("2026-08-21T10:31:00.000Z")).operationalBucket, "ABANDONED");
const totals = totalsByUnit([{ unitSymbol: "kg", expectedQuantity: 2, theoreticalConsumption: 0.2 }, { unitSymbol: "ml", expectedQuantity: 500, theoreticalConsumption: 60 }, { unitSymbol: "kg", expectedQuantity: 1, theoreticalConsumption: 0.1 }]);
assert.deepEqual(totals, [{ unit: "kg", expected: 3, physical: 0, variance: 0, theoreticalConsumption: 0.3 }, { unit: "ml", expected: 500, physical: 0, variance: 0, theoreticalConsumption: 60 }]);
console.log("OK phase 2: SLA activo/atrasado/abandonado y totales separados por unidad");
