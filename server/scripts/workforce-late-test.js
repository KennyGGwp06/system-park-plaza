import assert from "node:assert/strict";
import { lateDiscount, lateEvents } from "../src/workforce.js";

// Turnos a las 07:00 (Lima = UTC-5): entrar 12:15Z son 07:15 (5 min después de la tolerancia de 10), 12:05Z son 07:05 (dentro de tolerancia).
const mk = (date, hourUtc) => ({ employeeId: 9, date, checkIn: `${date}T${hourUtc}:00Z`, checkOut: `${date}T20:00:00Z` });
const state = {
  settings: { timezone: "America/Lima" },
  shifts: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map((date, i) => ({ id: i + 1, employeeId: 9, date, start: "07:00", end: "15:30", status: "PROGRAMADO" })),
  attendance: [mk("2026-09-21", "12:15"), mk("2026-09-22", "12:16"), mk("2026-09-23", "12:20"), mk("2026-09-24", "12:05")],
  lateJustifications: []
};
assert.equal(lateEvents(state, "2026-09-21", "2026-09-27").length, 3, "tres tardanzas; la de 07:05 cae en la tolerancia");
let result = lateDiscount(state, 9, "2026-09-21", "2026-09-27", 260);
assert.deepEqual([result.unjustifiedLates, result.discountPercent, result.discountAmount], [3, 20, 52]);
state.lateJustifications.push({ employeeId: 9, date: "2026-09-21", reason: "Bloqueo de la avenida" });
result = lateDiscount(state, 9, "2026-09-21", "2026-09-27", 260);
assert.deepEqual([result.unjustifiedLates, result.discountPercent, result.discountAmount], [2, 0, 0], "con una justificada quedan 2: no hay descuento");
console.log("workforce-late-test: todas las pruebas pasaron");
process.exit(0);
