import { db } from "./db.js";
import { dailyNeeds } from "./daily-needs.js";
import { controlTower } from "./workforce.js";

// Panel de cada módulo del Superadmin: cifras reales por submódulo ("módulo:vista") y avisos con destino.
const n = (v) => Number(v || 0);
const up = (v) => String(v || "").toUpperCase();
const money = (v) => `S/ ${n(v).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
const day = (v) => String(v || "").slice(0, 10);
const CLOSED = new Set(["CANCELADA", "CANCELADO", "FINALIZADA", "FINALIZADO", "COMPLETADA"]);
const tone = (count, bad = "amber") => (count > 0 ? bad : "ok");

async function scalar(sql, params = []) { try { return n((await db.query(sql, params)).rows[0]?.v); } catch { return 0; } }

export async function moduleHub(state) {
  const today = state?.settings?.today || day(new Date().toISOString());
  const S = (k) => state[k] || [];
  const bookings = S("bookings"), events = S("events"), orders = S("orders"), payments = S("payments");
  const svc = (code) => bookings.filter((b) => b.serviceCode === code);
  const openB = (code) => svc(code).filter((b) => !CLOSED.has(up(b.status)));
  const upcoming = (list) => list.filter((b) => day(b.date || b.checkIn) >= today).length;
  const toVerify = bookings.filter((b) => b.paymentStatus === "PENDIENTE_VERIFICACION");
  const owing = bookings.filter((b) => !CLOSED.has(up(b.status)) && n(b.balance) > 0.001);
  const rooms = S("rooms"), roomBy = (s) => rooms.filter((r) => up(r.status) === s).length;
  const activeOrders = orders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(up(o.status)));
  const ordersOf = (area) => activeOrders.filter((o) => up(o.area) === area);
  const cash = S("cashMovements"), cashToday = cash.filter((m) => day(m.createdAt) === today);
  const income = (list) => list.filter((m) => up(m.type) !== "EGRESO").reduce((s, m) => s + n(m.amount), 0);
  const outgo = (list) => list.filter((m) => up(m.type) === "EGRESO").reduce((s, m) => s + n(m.amount), 0);
  const refunds = S("refundRequests");
  const emps = S("employees").filter((e) => e.status === "ACTIVO");
  const openReq = S("requests").filter((r) => !["RESUELTO", "SOLUCIONADO", "CERRADO", "FINALIZADA"].includes(up(r.status)));
  const tasks = S("tasks");

  const [products, stockLow, movements30, wasteOpen, transfersOpen, suppliers, purchasesOpen, stockReq, closingsReview, lotsExpiring, recipes] = await Promise.all([
    scalar("SELECT COUNT(*) v FROM inventory_products WHERE status='ACTIVE'"),
    scalar("SELECT COUNT(*) v FROM (SELECT p.id FROM inventory_products p LEFT JOIN inventory_stock_balances b ON b.product_id=p.id WHERE p.status='ACTIVE' AND p.minimum_stock>0 GROUP BY p.id HAVING COALESCE(SUM(b.on_hand),0)<=p.minimum_stock) t"),
    scalar("SELECT COUNT(*) v FROM inventory_movements WHERE created_at>=NOW()-INTERVAL '30 days'"),
    scalar("SELECT COUNT(*) v FROM inventory_waste_records WHERE occurred_at>=NOW()-INTERVAL '7 days'"),
    scalar("SELECT COUNT(*) v FROM inventory_transfers WHERE status IN ('DRAFT','SENT','PENDING')"),
    scalar("SELECT COUNT(*) v FROM inventory_suppliers WHERE status='ACTIVE'"),
    scalar("SELECT COUNT(*) v FROM inventory_purchase_orders WHERE status IN ('APPROVED','PARTIALLY_RECEIVED','ORDERED')"),
    scalar("SELECT COUNT(*) v FROM inventory_stock_requests WHERE status='REQUESTED'"),
    scalar("SELECT COUNT(*) v FROM inventory_shift_sessions WHERE status IN ('SUBMITTED','OBSERVED')"),
    scalar("SELECT COUNT(*) v FROM inventory_lots WHERE expires_on IS NOT NULL AND expires_on<=CURRENT_DATE+7"),
    scalar("SELECT COUNT(*) v FROM inventory_recipes r JOIN inventory_recipe_versions v ON v.recipe_id=r.id AND v.status='ACTIVE'")
  ]);
  let needs = { areas: [] }, tower = { summary: {}, closings: [], pendingValidation: [], overdueAlerts: [] };
  try { needs = await dailyNeeds(state); } catch {}
  try { tower = await controlTower(state, {}); } catch {}
  const toBuy = needs.areas.reduce((s, a) => s + a.toBuyLines, 0);
  const unclosed = (tower.closings || []).filter((c) => c.status === "SIN_CIERRE").length;
  const menuOn = S("menuItems").filter((m) => m.active !== false && m.salesEnabled === true).length;
  const roles = S("roles"), users = S("users");
  const audit = S("audit");
  const lastAudit = audit.length ? audit[audit.length - 1] : null;
  const fact = S("facturacion");
  const inside = bookings.filter((b) => !CLOSED.has(up(b.status)) && (b.status === "CHECKED_IN" || b.accessStatus === "INGRESO_VALIDADO")).reduce((t, b) => t + Math.max(1, n(b.people)), 0);

  const one = (t) => String(t ?? "").replace(/1 (abiertas|abiertos|próximas|cotizaciones|pendientes|solicitadas|activos|cierres|órdenes abiertas|llegadas hoy|turnos hoy|tardanzas hoy|pases|cuentas|roles|registros|productos|habitaciones|servicios|platos activos|clientes|reservas)/g, (_, w) => "1 " + ({ abiertas: "abierta", abiertos: "abierto", próximas: "próxima", cotizaciones: "cotización", pendientes: "pendiente", solicitadas: "solicitada", activos: "activo", cierres: "cierre", "órdenes abiertas": "orden abierta", "llegadas hoy": "llegada hoy", "turnos hoy": "turno hoy", "tardanzas hoy": "tardanza hoy", pases: "pase", cuentas: "cuenta", roles: "rol", registros: "registro", productos: "producto", habitaciones: "habitación", servicios: "servicio", "platos activos": "plato activo", clientes: "cliente", reservas: "reserva" }[w] || w));
  const m = (headline, kpis, subs, alerts = []) => ({ headline, kpis: kpis.map((x) => ({ ...x, detail: one(x.detail) })), subs: Object.fromEntries(Object.entries(subs).map(([key, v]) => [key, { ...v, metric: one(v.metric), hint: one(v.hint) }])), alerts: alerts.filter(Boolean) });
  const k = (label, value, detail = "", t = "") => ({ label, value: String(value), detail, tone: t });
  const a = (text, t, go) => ({ text, tone: t, go });
  const pay = payments.filter((p) => day(p.createdAt) === today);

  return {
    generatedAt: new Date().toISOString(), today,
    modules: {
      clientes: m("Una persona, una identidad", [k("Clientes", S("clients").length, "registrados"), k("Con saldo pendiente", new Set(owing.map((b) => b.clientId)).size, money(owing.reduce((s, b) => s + n(b.balance), 0)), tone(owing.length)), k("Dentro ahora", inside, "ingresos validados")],
        { "clientes:directorio": { metric: `${S("clients").length} clientes`, hint: `${new Set(bookings.map((b) => b.clientId)).size} con reservas` }, "clientes:perfil": { metric: "Historial 360°", hint: "Reservas, consumos, pagos y accesos" } },
        [owing.length ? a(`${owing.length} reserva(s) con saldo por cobrar`, "amber", ["reservas", "general"]) : null]),
      reservas: m("Ventas programadas de los 5 servicios", [k("Reservas abiertas", bookings.filter((b) => !CLOSED.has(up(b.status))).length + events.filter((e) => !CLOSED.has(up(e.status))).length), k("Pagos por verificar", toVerify.length, "Yape/Plin", tone(toVerify.length, "red")), k("Saldo por cobrar", money(owing.reduce((s, b) => s + n(b.balance), 0)), `${owing.length} reservas`, tone(owing.length))],
        { "reservas:general": { metric: `${bookings.length + events.length} en total`, hint: `${toVerify.length} por verificar`, tone: tone(toVerify.length, "red") }, "reservas:hospedaje": { metric: `${openB("HOSPEDAJE").length} abiertas`, hint: `${upcoming(svc("HOSPEDAJE"))} próximas` }, "reservas:piscina": { metric: `${openB("PISCINA").length} abiertas`, hint: `${upcoming(svc("PISCINA"))} próximas` }, "reservas:mirador": { metric: `${openB("MIRADOR").length} abiertas`, hint: `${svc("MIRADOR").filter((b) => b.paymentStatus === "PENDIENTE_VERIFICACION").length} por verificar` }, "reservas:terraza": { metric: `${openB("TERRAZA").length} abiertas`, hint: `${upcoming(svc("TERRAZA"))} próximas` }, "reservas:eventos": { metric: `${events.filter((e) => !CLOSED.has(up(e.status))).length} abiertos`, hint: `${events.filter((e) => up(e.status) === "COTIZACION").length} cotizaciones` } },
        [toVerify.length ? a(`${toVerify.length} operación(es) Yape/Plin esperan tu verificación`, "red", ["reservas", "general"]) : null]),
      admision: m("Nadie entra sin pase válido", [k("Dentro ahora", inside), k("Pases activos", S("passes").filter((p) => up(p.status) !== "REVOCADO").length), k("Llegadas de hoy", bookings.filter((b) => day(b.checkIn || b.date) === today && !CLOSED.has(up(b.status))).length)],
        { "admision:llegadas": { metric: `${bookings.filter((b) => b.serviceCode === "HOSPEDAJE" && day(b.checkIn) === today && !CLOSED.has(up(b.status))).length} llegadas hoy`, hint: "Check-in y check-out" }, "admision:accesos": { metric: `${S("passes").length} pases`, hint: "Valida un QR" }, "admision:aforo": { metric: `${inside} dentro`, hint: "Por servicio, en vivo" } }),
      catalogo: m("Lo que ve y compra el cliente", [k("Habitaciones", rooms.length, `${roomBy("LIBRE")} libres`), k("Platos en venta", menuOn, "habilitados para el cliente"), k("Servicios", S("services").length)],
        { "catalogo:servicios": { metric: `${S("services").length} servicios`, hint: "Precios y cupos" }, "catalogo:habitaciones": { metric: `${rooms.length} habitaciones`, hint: `${roomBy("LIBRE")} libres · ${roomBy("OCUPADA")} ocupadas` }, "catalogo:carta": { metric: `${menuOn} platos activos`, hint: "Lo que aparece en la app" }, "catalogo:contenido": { metric: "Portadas y fotos", hint: "Textos e imágenes" } }),
      restaurante: m("Cocina bajo control", [k("Pedidos en curso", ordersOf("RESTAURANTE").length, "", tone(ordersOf("RESTAURANTE").length, "amber")), k("Recetas vigentes", recipes), k("Cierres por revisar", closingsReview, "", tone(closingsReview))],
        { "restaurante:pedidos": { metric: `${ordersOf("RESTAURANTE").length} en curso`, hint: "Por estado y tiempo" }, "restaurante:recetas": { metric: `${recipes} recetas`, hint: "Costo y margen" }, "restaurante:preparacion": { metric: "Preparaciones", hint: "Rendimiento y lotes" }, "restaurante:cierres": { metric: `${closingsReview} cierres`, hint: "Teórico vs real" } }),
      bar: m("Barra y botellas", [k("Pedidos en curso", ordersOf("BARTENDER").length), k("Recetas vigentes", recipes), k("Bebidas activas", S("menuItems").filter((x) => up(x.area) === "BARTENDER" && x.active !== false).length)],
        { "bar:pedidos": { metric: `${ordersOf("BARTENDER").length} en curso`, hint: "Barra en vivo" }, "bar:recetas": { metric: "Recetas de bar", hint: "Costo y margen" }, "bar:botellas": { metric: "Botellas", hint: "Dosis y faltantes" }, "bar:cierres": { metric: "Cierres del bar", hint: "Teórico vs real" } }),
      insumos: m("Del pedido a la compra", [k("Por reponer", stockLow, "bajo el mínimo", tone(stockLow)), k("Por comprar hoy", toBuy, "según necesidades", tone(toBuy)), k("Solicitudes", stockReq, "esperan tu decisión", tone(stockReq))],
        { "insumos:existencias": { metric: `${products} productos`, hint: `${stockLow} bajo el mínimo`, tone: tone(stockLow) }, "insumos:movimientos": { metric: `${movements30} en 30 días`, hint: "Kardex" }, "insumos:mermas": { metric: `${wasteOpen} esta semana`, hint: "Pérdidas registradas" }, "insumos:distribucion": { metric: `${transfersOpen} en curso`, hint: "Almacén → áreas" }, "insumos:necesidades": { metric: `${toBuy} por comprar`, hint: unclosed ? `${unclosed} área sin cierre` : "Con los cierres de las 23:00", tone: tone(unclosed, "red") }, "insumos:foodcost": { metric: "Real vs teórico", hint: "Por plato y turno" }, "insumos:solicitudes": { metric: `${stockReq} pendientes`, hint: "Cierre o emergencia", tone: tone(stockReq) }, "insumos:lista": { metric: `${purchasesOpen} órdenes abiertas`, hint: "Compras y recepción" }, "insumos:proveedores": { metric: `${suppliers} activos`, hint: "Precios y cumplimiento" } },
        [stockLow ? a(`${stockLow} producto(s) bajo el mínimo`, "amber", ["insumos", "existencias"]) : null, unclosed ? a(`${unclosed} área(s) sin cierre del día`, "red", ["insumos", "necesidades"]) : null, lotsExpiring ? a(`${lotsExpiring} lote(s) vencen en 7 días`, "amber", ["insumos", "existencias"]) : null, closingsReview ? a(`${closingsReview} cierre(s) de turno por aprobar`, "amber", ["restaurante", "consumo"]) : null]),
      dinero: m("Todo el dinero explicado", [k("Ingresos de hoy", money(income(cashToday) + pay.reduce((s, p) => s + n(p.amount), 0))), k("Egresos de hoy", money(outgo(cashToday))), k("Devoluciones", refunds.filter((r) => ["SOLICITADA", "APROBADA"].includes(r.status)).length, "por resolver", tone(refunds.filter((r) => ["SOLICITADA", "APROBADA"].includes(r.status)).length))],
        { "dinero:pagos": { metric: `${payments.length} pagos`, hint: `${pay.length} hoy` }, "dinero:cajas": { metric: `${S("cashSessions").filter((s) => up(s.status) === "EN_REVISION").length} por revisar`, hint: "Arqueo y cierre" }, "dinero:facturacion": { metric: `${fact.length} comprobantes`, hint: "Boletas y facturas" }, "dinero:gastos": { metric: money(outgo(cashToday)), hint: "Salidas de hoy" }, "dinero:devoluciones": { metric: `${refunds.filter((r) => r.status === "SOLICITADA").length} solicitadas`, hint: "Solo tú devuelves" }, "dinero:rentabilidad": { metric: "Por servicio", hint: "Ventas, gastos y margen" } },
        [refunds.some((r) => r.status === "SOLICITADA") ? a("Hay devoluciones esperando tu decisión", "amber", ["dinero", "devoluciones"]) : null]),
      equipo: m("Personal, puntualidad y pago", [k("Personal activo", emps.length), k("Faltan o sin marcar", tower.summary.missing || 0, "hoy", tone(tower.summary.missing || 0, "red")), k("Días por validar", (tower.pendingValidation || []).length, "esperan tu decisión", tone((tower.pendingValidation || []).length))],
        { "equipo:torre": { metric: `${tower.summary.inShift || 0} en turno`, hint: `${tower.summary.late || 0} tardanzas hoy`, tone: tone(tower.summary.missing || 0, "red") }, "equipo:personal": { metric: `${emps.length} activos`, hint: "Roles y tarifas" }, "equipo:turnos": { metric: `${S("shifts").filter((s) => s.date === today).length} turnos hoy`, hint: "Horarios y planilla" } },
        [(tower.summary.missing || 0) ? a(`${tower.summary.missing} persona(s) sin marcar o que faltaron`, "red", ["equipo", "torre"]) : null, (tower.overdueAlerts || []).length ? a(`${tower.overdueAlerts.length} alerta(s) sin atender pasado el plazo`, "amber", ["equipo", "torre"]) : null]),
      operaciones: m("Limpieza y mantenimiento", [k("Tareas de limpieza", tasks.filter((t) => !["FINALIZADA", "DANOS_REPORTADOS"].includes(up(t.status))).length, "abiertas"), k("Incidencias abiertas", openReq.length, "", tone(openReq.length)), k("Sin responsable", openReq.filter((r) => r.requiresMaintenance && !r.assignedMaintenanceEmployeeId).length, "mantenimiento", tone(openReq.filter((r) => r.requiresMaintenance && !r.assignedMaintenanceEmployeeId).length, "red"))],
        { "operaciones:limpieza": { metric: `${tasks.filter((t) => up(t.status) === "PENDIENTE").length} pendientes`, hint: "Evidencia por zona" }, "operaciones:mantenimiento": { metric: `${openReq.filter((r) => r.requiresMaintenance).length} abiertas`, hint: "Antes y después" } }),
      sistema: m("Reglas, seguridad y trazabilidad", [k("Usuarios", users.filter((u) => u.status === "ACTIVO").length, "activos"), k("Roles", roles.length), k("Último cambio", lastAudit ? `${lastAudit.module}` : "—", lastAudit ? String(lastAudit.action || "") : "")],
        { "sistema:configuracion": { metric: state.settings?.hotelName || "Hotel", hint: `Cierre ${state.settings?.closingTime || "23:00"} · tolerancia ${state.settings?.punctualityToleranceMinutes ?? 10} min` }, "sistema:usuarios": { metric: `${users.length} cuentas`, hint: "Acceso interno" }, "sistema:permisos": { metric: `${roles.length} roles`, hint: "Qué puede hacer cada uno" }, "sistema:auditoria": { metric: `${audit.length} registros`, hint: "Cadena inmutable" }, "sistema:datos": { metric: "Integridad", hint: "Duplicados y huecos" } })
    }
  };
}
