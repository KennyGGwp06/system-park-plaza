const n = (value) => Number(value || 0);
const round = (value) => Math.round((n(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
const TERMINAL = new Set(["ENTREGADO", "CANCELADO"]);

export function ensureOrderDeadlines(order) {
  if (!order || TERMINAL.has(order.status)) return order;
  const created = new Date(order.createdAt || Date.now());
  const estimatedMinutes = Math.max(1, n(order.estimatedMinutes) || 15);
  const dueAt = new Date(created.getTime() + estimatedMinutes * 60000);
  const abandonmentGrace = Math.max(10, Math.ceil(estimatedMinutes * 0.5));
  order.estimatedMinutes = estimatedMinutes;
  order.warningAt ||= new Date(created.getTime() + estimatedMinutes * 0.75 * 60000).toISOString();
  order.dueAt ||= dueAt.toISOString();
  order.abandonmentAt ||= new Date(dueAt.getTime() + abandonmentGrace * 60000).toISOString();
  return order;
}

export function orderTiming(order, at = new Date()) {
  ensureOrderDeadlines(order);
  if (TERMINAL.has(order?.status)) return { operationalBucket: "COMPLETED", escalationLevel: 0, isLate: false, isAbandoned: false, remainingMinutes: 0 };
  const now = at instanceof Date ? at : new Date(at);
  const created = new Date(order.createdAt || now);
  const warning = new Date(order.warningAt);
  const due = new Date(order.dueAt);
  const abandonment = new Date(order.abandonmentAt);
  const elapsedMinutes = Math.max(0, Math.floor((now - created) / 60000));
  const remainingMinutes = Math.ceil((due - now) / 60000);
  const isAbandoned = order.status === "PENDIENTE" && now >= abandonment;
  const isLate = !isAbandoned && now >= due;
  const escalationLevel = isAbandoned ? 3 : isLate ? 2 : now >= warning ? 1 : 0;
  return {
    operationalBucket: isAbandoned ? "ABANDONED" : isLate ? "LATE" : "ACTIVE",
    operationalBucketLabel: isAbandoned ? "Abandonado" : isLate ? "Atrasado" : "Activo",
    escalationLevel,
    escalationLabel: ["En tiempo", "Por vencer", "Vencido", "Abandonado"][escalationLevel],
    isLate, isAbandoned, elapsedMinutes, remainingMinutes,
    dueAt: order.dueAt, abandonmentAt: order.abandonmentAt
  };
}

export function withOrderTiming(order, at = new Date()) {
  return { ...order, ...orderTiming(order, at) };
}

export function totalsByUnit(lines = []) {
  const totals = new Map();
  for (const line of lines) {
    const unit = String(line.unitSymbol || "sin unidad");
    const current = totals.get(unit) || { unit, expected: 0, physical: 0, variance: 0, theoreticalConsumption: 0 };
    current.expected += n(line.expectedQuantity);
    current.physical += n(line.physicalQuantity);
    current.variance += n(line.varianceQuantity);
    current.theoreticalConsumption += n(line.theoreticalConsumption);
    totals.set(unit, current);
  }
  return [...totals.values()].map((item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, key === "unit" ? value : round(value)])));
}
