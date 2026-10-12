import "dotenv/config";
import { db } from "../src/db.js";

// Deja el sistema en "día cero" para empezar pruebas nuevas (npm run db:limpiar-operacion).
// CONSERVA: configuración del hotel, usuarios y roles, personal, habitaciones, servicios y tarifas, carta y recetas,
// productos, almacenes y stock actual, proveedores, espacios de eventos, cochera, textos e imágenes (y las fotos
// subidas, que viven en el volumen uploads_data).
// BORRA: clientes y todo lo que hicieron o se hizo por ellos (reservas, estadías, eventos, pagos, pases, accesos,
// pedidos, solicitudes, tareas, comprobantes, devoluciones), la operación del personal (marcaciones, turnos, cajas,
// días validados), la auditoría, el historial archivado y los registros técnicos (límites de intentos, métricas).
// Actualizado 2026-09-28 para el sistema actual (historial, audit_log, rate_limits, server_metrics) y 2026-10-12
// (numeración de comprobantes electrónicos por serie).
const transactionalTables = [
  "inventory_stock_request_lines", "inventory_stock_requests",
  "bar_bottle_measurements", "bar_bottle_services", "bar_bottles",
  "inventory_order_cancellation_losses", "inventory_consolidated_sales", "inventory_order_events", "inventory_order_reservations", "inventory_order_lines", "inventory_recipe_sales",
  "inventory_shift_variance_explanations", "inventory_shift_summary_lines", "inventory_shift_opening_lines", "inventory_closings", "inventory_physical_count_lines", "inventory_physical_counts", "inventory_shift_sessions",
  "inventory_waste_records", "inventory_portion_weight_samples", "inventory_portioning_batches", "inventory_processing_outputs", "inventory_processing_batches", "inventory_lot_genealogy", "inventory_production_outputs", "inventory_production_inputs", "inventory_production_batches",
  "inventory_transfer_alerts", "inventory_transfer_lines", "inventory_transfers", "inventory_goods_receipt_lines", "inventory_goods_receipts", "inventory_purchase_order_lines", "inventory_purchase_orders", "inventory_reservations", "inventory_movements", "inventory_audit_events",
  // Escalabilidad (Fases 0-2): historial archivado, auditoría completa, límites de intentos y métricas.
  "history_records", "audit_log", "rate_limits", "server_metrics", "server_instances"
];

const transactionalStateKeys = [
  "clients", "bookings", "payments", "passes", "entitlements", "accessLogs", "orders", "requests", "attendance", "tasks", "audit", "reservations", "events", "compras", "facturacion", "cleaning", "reports", "pool", "poolEntries", "poolReports", "parking", "stays", "inventoryMovements", "cashMovements", "cashSessions", "cashClosings", "productions", "wasteRecords", "inventoryClosings", "dailyInventoryBoxes",
  "refundRequests", "dayValidations", "lateJustifications"
];

const resetCounters = [
  "client", "booking", "payment", "pass", "entitlement", "access", "order", "request",
  "shift", "attendance", "task", "audit", "stay", "movement", "event", "invoice",
  "purchase", "production", "waste", "closing", "dailyBox", "cashSession", "cashClosing", "dayValidation", "lateJustification", "refund"
];

async function cleanOperationalDemo() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const present = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])", [transactionalTables]);
    const names = present.rows.map((row) => `public.${row.tablename}`);
    if (names.length) await client.query(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`);

    const locked = await client.query("SELECT data FROM app_state WHERE id=1 FOR UPDATE");
    if (!locked.rowCount) throw new Error("No se encontró el estado principal del sistema");
    const state = locked.rows[0].data;
    for (const key of transactionalStateKeys) state[key] = [];

    // Proveedores, productos, recetas y saldos base se mantienen como configuración.
    state.shifts = [];
    state.rooms = (state.rooms || []).map((room) => ({ ...room, status: "LIBRE", cleaningStatus: "LIMPIA", currentStayId: null, guestId: null, statusNote: "" }));
    state.cochera = (state.cochera || []).map((space) => ({ ...space, status: "LIBRE", entries: [] }));
    state.inventory = (state.inventory || []).map((item) => ({ ...item, reserved: 0 }));
    state.employees = (state.employees || []).map((employee) => ({ ...employee, attendanceStatus: "FUERA_DE_TURNO", currentAssignment: null }));
    state.counters = { ...(state.counters || {}) };
    for (const counter of resetCounters) state.counters[counter] = 0;
    // Numeración de boletas, facturas y notas de crédito por serie (2026-10-12): vuelve a empezar en 00000001.
    state.billingCounters = {};
    state.settings = { ...(state.settings || {}), operationalResetAt: new Date().toISOString() };

    await client.query("UPDATE inventory_stock_balances SET reserved=0,updated_at=NOW()");
    await client.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: "OK", message: "Sistema limpio para pruebas nuevas", operationalResetAt: state.settings.operationalResetAt, tablasVaciadas: names.length, preserved: ["configuración", "usuarios", "roles", "personal", "habitaciones", "servicios", "carta", "recetas", "productos", "almacenes", "stock", "proveedores", "fotos"] }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

cleanOperationalDemo().catch((error) => { console.error(error); process.exit(1); });
