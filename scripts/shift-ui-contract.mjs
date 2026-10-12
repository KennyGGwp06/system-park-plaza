// Contrato de turnos y asistencia (2026-09-27, estaciones v2): un solo modal de turno compartido por las estaciones,
// el reloj de /reloj es una terminal que no abre sesiones, y el dueño tiene una sola entrada a esa terminal.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const occurrences = (text, fragment) => text.split(fragment).length - 1;

const [reception, kitchen, ops, shiftsAdmin, login, attendanceClock, kitchenNav] = await Promise.all([
  read("client/src/modules/recepcion/ReceptionShell.jsx"),
  read("client/src/modules/cocina/KitchenShell.jsx"),
  read("client/src/modules/operaciones/OpsShell.jsx"),
  read("client/src/modules/dueno/ShiftsAdminPage.jsx"),
  read("client/src/pages/Login.jsx"),
  read("client/src/modules/employees/AttendanceClockPage.jsx"),
  read("client/src/modules/cocina/kitchenNavigation.js")
]);

assert.equal(occurrences(reception, "export function ShiftClockModal"), 1, "El modal de turno vive una sola vez, en ReceptionShell.");
for (const [name, source] of [["Cocina y Bar", kitchen], ["Operaciones", ops]]) {
  assert.equal(source.includes("function ShiftClockModal"), false, `${name} no debe tener una copia propia del modal de turno.`);
  assert.equal(source.includes("ShiftClockModal"), true, `${name} debe usar el modal de turno compartido.`);
}
assert.equal(occurrences(shiftsAdmin, 'href="/reloj"'), 1, "El dueño debe tener una sola entrada a la terminal de asistencia.");
assert.equal(occurrences(login, 'href="/reloj"'), 1, "El ingreso del personal debe ofrecer marcar asistencia.");
assert.equal(kitchenNav.includes('["Cerrar turno"'), false, "El cierre de inventario no debe confundirse con la asistencia.");
assert.equal(attendanceClock.includes("openWorkerPanel"), false, "El reloj no debe abrir el panel privado del trabajador.");
assert.equal(attendanceClock.includes("window.location"), false, "El reloj debe confirmar la asistencia sin redirigir la terminal.");
assert.equal(attendanceClock.includes("Tu ingreso fue registrado correctamente."), true, "El reloj debe confirmar el ingreso en la misma pantalla.");
assert.equal(attendanceClock.includes('"/attendance/clock"'), true, "El reloj usa la marcación pública con DNI y PIN.");

console.log("OK: contrato de turnos y asistencia sin duplicidades.");
