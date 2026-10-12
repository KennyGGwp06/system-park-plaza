// Infla la COPIA pp_carga para simular N días de operación pasada (nunca la base real).
// Uso (desde la raíz): node scripts/carga/inflar.mjs <dias> [url]
// Ritmo por día (hotel de 33 habitaciones + piscina, mirador y terraza): 40 reservas, 40 pagos, 30 pases,
// 30 derechos de acceso, 150 pedidos, 20 solicitudes, 12 tareas, 60 movimientos de inventario, 1 200 registros
// de auditoría. Cada copia se corre a su día en el pasado (todas sus fechas) y queda CERRADA como en la vida
// real (reserva finalizada y pagada, pedido entregado, solicitud resuelta, tarea finalizada).
import pg from "pg";
const days = Number(process.argv[2] || 90);
const url = process.argv[3] || "postgresql://PARK_PLAZA:park_plaza123@localhost:5433/pp_carga";
if (!/\/pp_carga\w*(\?|$)/.test(url)) throw new Error("Solo se inflan copias pp_carga*");
const db = new pg.Pool({ connectionString: url });
const { rows } = await db.query("SELECT data FROM app_state WHERE id = 1");
const s = rows[0].data;
const PER_DAY = { bookings: 40, payments: 40, passes: 30, entitlements: 30, orders: 150, requests: 20, tasks: 12, inventoryMovements: 60, audit: 1200 };
const CLOSE = { bookings: { status: "FINALIZADA", balance: 0, paymentStatus: "PAGADO" }, orders: { status: "ENTREGADO" }, requests: { status: "RESUELTO" }, tasks: { status: "FINALIZADA" }, payments: { status: "APROBADO" }, entitlements: { status: "FINALIZADO" } };
const DATE_KEY = /(^date$|Date$|At$|^checkIn$|^checkOut$|^startsAt$|^endsAt$|^day$)/;
const shift = (value, back) => { const d = new Date(`${value.slice(0, 10)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10) + value.slice(10); };
const moveBack = (item, back) => { for (const [key, value] of Object.entries(item)) if (DATE_KEY.test(key) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) item[key] = shift(value, back); return item; };
let firstId = 5_000_000;
for (const [k, perDay] of Object.entries(PER_DAY)) {
  const base = (s[k] || []).filter(Boolean); if (!base.length) continue;
  const out = [...base];
  for (let day = 2; day < days + 2; day++) {
    for (let j = 0; j < perDay; j++) {
      const copy = moveBack(structuredClone(base[(day * perDay + j) % base.length]), day);
      copy.id = ++firstId;
      if (copy.code) copy.code = `${String(copy.code).split("-")[0]}-H${copy.id}`;
      // Los vínculos a padres inexistentes se sueltan (en la vida real cada pago tiene su reserva cerrada).
      for (const key of ["bookingId", "reservationId", "eventId", "orderId", "stayId", "passId"]) if (key in copy) copy[key] = null;
      Object.assign(copy, CLOSE[k] || {});
      out.push(copy);
    }
  }
  s[k] = out;
}
const json = JSON.stringify(s);
await db.query("UPDATE app_state SET data = $1::jsonb WHERE id = 1", [json]);
console.log(`${days} días simulados · app_state enviado = ${(json.length / 1048576).toFixed(1)} MB`);
await db.end();
