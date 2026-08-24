import { ensureOrderDeadlines } from "./order-operations.js";

const n = (value) => Number(value);
const finite = (value) => Number.isFinite(n(value));
const positive = (value) => finite(value) && n(value) > 0;
const normalized = (value) => String(value || "").trim().toLocaleLowerCase("es-PE");

function nextCollectionId(state, key) {
  const id = Math.max(Number(state.counters?.[key] || 0), ...(state[key === "pass" ? "passes" : "entitlements"] || []).map((row) => Number(row.id) || 0)) + 1;
  state.counters ||= {};
  state.counters[key] = id;
  return id;
}

function findMenuItem(state, item) {
  const menu = state.menuItems || [];
  return menu.find((row) => Number(row.id) === Number(item?.menuItemId))
    || menu.find((row) => item?.code && normalized(row.code) === normalized(item.code))
    || menu.find((row) => item?.name && normalized(row.name) === normalized(item.name));
}

export function repairIncompleteOrders(state, at = new Date().toISOString()) {
  const repaired = [];
  for (const order of state.orders || []) {
    const issues = [];
    let changed = false;
    if (!String(order.code || "").trim()) { order.code = `PED-${String(order.id || 0).padStart(4, "0")}`; changed = true; }
    if (!Array.isArray(order.items)) { order.items = []; changed = true; }
    order.items = order.items.map((raw, index) => {
      const item = raw && typeof raw === "object" ? { ...raw } : {};
      const menu = findMenuItem(state, item);
      if (menu) {
        const quantity = positive(item.quantity) ? n(item.quantity) : 1;
        const expected = {
          id: item.id || index + 1,
          menuItemId: menu.id,
          code: item.code || menu.code,
          name: menu.name,
          quantity,
          price: finite(item.price) && n(item.price) >= 0 ? n(item.price) : Number(menu.price || 0),
          recipe: Array.isArray(item.recipe) && item.recipe.length ? item.recipe : (menu.recipe || []),
          area: item.area || menu.area
        };
        const result = { ...item, ...expected };
        if (JSON.stringify(result) !== JSON.stringify(raw)) changed = true;
        return result;
      }
      const safeName = String(item.name || item.code || "Producto no identificado").trim();
      issues.push(`Línea ${index + 1}: producto sin correspondencia en el menú`);
      changed = true;
      return { ...item, id: item.id || index + 1, name: safeName, quantity: positive(item.quantity) ? n(item.quantity) : 1, price: finite(item.price) && n(item.price) >= 0 ? n(item.price) : 0, integrityStatus: "REQUIRES_REVIEW" };
    });
    const areas = [...new Set(order.items.map((item) => item.area).filter(Boolean))];
    if (!order.area && areas.length === 1) { order.area = areas[0]; changed = true; }
    const total = order.items.reduce((sum, item) => sum + n(item.price || 0) * n(item.quantity || 0), 0);
    if (!finite(order.total) || Math.abs(n(order.total) - total) > 0.001) { order.total = Math.round(total * 100) / 100; changed = true; }
    order.createdAt ||= at;
    order.updatedAt ||= order.createdAt;
    ensureOrderDeadlines(order);
    order.integrityStatus = issues.length ? "REQUIRES_REVIEW" : "VALID";
    if (issues.length) order.integrityIssues = issues;
    else delete order.integrityIssues;
    if (changed) { order.repairedAt = at; repaired.push(order.id); }
  }
  return repaired;
}

export function validateOrderSchema(state, order) {
  const fieldErrors = {};
  if (!order || typeof order !== "object") fieldErrors.order = "El pedido es obligatorio";
  if (!String(order?.code || "").trim()) fieldErrors.code = "El pedido necesita un código";
  if (!Number.isInteger(Number(order?.id)) || Number(order.id) <= 0) fieldErrors.id = "El pedido necesita un ID válido";
  if (!["RESTAURANTE", "BARTENDER"].includes(order?.area)) fieldErrors.area = "El área debe ser RESTAURANTE o BARTENDER";
  if (!Array.isArray(order?.items) || !order.items.length) fieldErrors.items = "El pedido debe contener al menos un producto";
  else order.items.forEach((item, index) => {
    const menu = findMenuItem(state, item);
    if (!menu) fieldErrors[`items.${index}.menuItemId`] = "Producto inexistente o no identificable";
    if (!String(item?.name || "").trim()) fieldErrors[`items.${index}.name`] = "El nombre es obligatorio";
    if (!positive(item?.quantity)) fieldErrors[`items.${index}.quantity`] = "La cantidad debe ser mayor a cero";
    if (!finite(item?.price) || n(item.price) < 0) fieldErrors[`items.${index}.price`] = "El precio debe ser un número no negativo";
  });
  if (Object.keys(fieldErrors).length) {
    const error = new Error("El pedido está incompleto o contiene datos inválidos");
    error.status = 400;
    error.fieldErrors = fieldErrors;
    throw error;
  }
  ensureOrderDeadlines(order);
  return order;
}

export function ensureStayAccess(state, reservation, stay, at = new Date().toISOString()) {
  if (!reservation || !stay || stay.status !== "ACTIVA") return null;
  let pass = (state.passes || []).find((row) => Number(row.clientId) === Number(stay.clientId) && row.status !== "REVOCADO");
  if (!pass) {
    const id = nextCollectionId(state, "pass");
    pass = { id, clientId: stay.clientId, code: `PP-AUTO-${String(id).padStart(4, "0")}`, status: "ACTIVO", createdAt: at, repairedFromStayId: stay.id };
    state.passes.push(pass);
  }
  let entitlement = (state.entitlements || []).find((row) => Number(row.passId) === Number(pass.id) && Number(row.bookingId) === Number(reservation.id) && row.serviceCode === "HOSPEDAJE");
  if (!entitlement) {
    const booking = (state.bookings || []).find((row) => Number(row.id) === Number(reservation.id));
    entitlement = {
      id: nextCollectionId(state, "entitlement"), passId: pass.id, bookingId: reservation.id,
      serviceCode: "HOSPEDAJE", status: "ACTIVO",
      people: Number(reservation.adults ?? booking?.people ?? 1) + Number(reservation.children || 0),
      date: String(reservation.checkInDate || booking?.date || at).slice(0, 10),
      slot: String(reservation.checkInDate || booking?.slot || "15:00").includes("T") ? String(reservation.checkInDate).slice(11, 16) : (booking?.slot || "15:00"),
      usedAt: null, createdAt: at, repairedFromStayId: stay.id
    };
    state.entitlements.push(entitlement);
  } else if (["PENDIENTE", "LISTO_INGRESO", "REVOCADO"].includes(entitlement.status)) {
    entitlement.status = "ACTIVO";
    entitlement.reactivatedAt = at;
  }
  return { pass, entitlement };
}

export function stabilizeLegacyState(state, at = new Date().toISOString()) {
  const repairedOrders = repairIncompleteOrders(state, at);
  const repairedStays = [];
  for (const stay of state.stays || []) {
    if (stay.status !== "ACTIVA") continue;
    const reservation = (state.reservations || []).find((row) => Number(row.id) === Number(stay.reservationId));
    if (!reservation) continue;
    const before = `${state.passes?.length || 0}:${state.entitlements?.length || 0}`;
    ensureStayAccess(state, reservation, stay, at);
    if (before !== `${state.passes.length}:${state.entitlements.length}`) repairedStays.push(stay.id);
  }
  return { repairedOrders, repairedStays };
}
