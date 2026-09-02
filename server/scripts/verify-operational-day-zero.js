import "dotenv/config";
import { db } from "../src/db.js";

const emptyStateKeys = [
  "clients", "bookings", "payments", "passes", "entitlements", "accessLogs", "orders",
  "requests", "attendance", "tasks", "audit", "reservations", "events", "compras",
  "facturacion", "stays", "inventoryMovements", "cashMovements", "cashSessions",
  "cashClosings", "productions", "wasteRecords", "inventoryClosings", "dailyInventoryBoxes"
];

const emptyTables = [
  "inventory_stock_requests", "inventory_stock_request_lines", "bar_bottles",
  "bar_bottle_services", "bar_bottle_measurements", "inventory_order_lines",
  "inventory_order_reservations", "inventory_order_events", "inventory_order_cancellation_losses",
  "inventory_consolidated_sales", "inventory_recipe_sales", "inventory_shift_sessions",
  "inventory_shift_opening_lines", "inventory_shift_summary_lines", "inventory_shift_variance_explanations",
  "inventory_physical_counts", "inventory_physical_count_lines", "inventory_closings",
  "inventory_waste_records", "inventory_production_batches", "inventory_processing_batches",
  "inventory_portioning_batches", "inventory_transfers", "inventory_transfer_lines",
  "inventory_transfer_alerts", "inventory_purchase_orders", "inventory_purchase_order_lines",
  "inventory_goods_receipts", "inventory_goods_receipt_lines", "inventory_reservations",
  "inventory_movements", "inventory_audit_events"
];

async function verifyDayZero() {
  const result = await db.query("SELECT data FROM app_state WHERE id=1");
  if (!result.rowCount) throw new Error("No existe el estado principal del sistema");
  const state = result.rows[0].data;
  const failures = [];

  for (const key of emptyStateKeys) {
    const count = Array.isArray(state[key]) ? state[key].length : 0;
    if (count !== 0) failures.push(`${key}: ${count}`);
  }
  if ((state.shifts || []).length !== 0) failures.push(`shifts: ${state.shifts.length}`);
  const busyRooms = (state.rooms || []).filter((room) => room.status !== "LIBRE");
  if (busyRooms.length) failures.push(`habitaciones no libres: ${busyRooms.length}`);
  const activeEmployees = (state.employees || []).filter((employee) => employee.attendanceStatus === "EN_TURNO");
  if (activeEmployees.length) failures.push(`trabajadores activos: ${activeEmployees.length}`);
  const occupiedParking = (state.cochera || []).filter((space) => space.status !== "LIBRE" || (space.entries || []).length);
  if (occupiedParking.length) failures.push(`cocheras ocupadas: ${occupiedParking.length}`);
  if (!state.settings?.operationalResetAt) failures.push("falta la marca operationalResetAt");

  const present = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])", [emptyTables]);
  const relationalCounts = {};
  for (const table of present.rows.map((row) => row.tablename)) {
    const count = Number((await db.query(`SELECT COUNT(*) AS count FROM public.${table}`)).rows[0].count);
    relationalCounts[table] = count;
    if (count !== 0) failures.push(`${table}: ${count}`);
  }

  const preserved = {
    users: (state.users || []).length,
    rooms: (state.rooms || []).length,
    services: (state.services || []).length,
    menuItems: (state.menuItems || []).length,
    inventoryProducts: (state.inventory || []).length
  };
  for (const [key, count] of Object.entries(preserved)) if (count <= 0) failures.push(`${key} no fue preservado`);

  const report = { status: failures.length ? "FAIL" : "OK", operationalResetAt: state.settings?.operationalResetAt || null, preserved, relationalTablesChecked: Object.keys(relationalCounts).length, failures };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

verifyDayZero().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
