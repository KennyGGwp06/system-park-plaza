import assert from "node:assert/strict";
import { electronicBillingAccess, electronicBillingConfiguration, electronicDocumentArtifact, issueElectronicDocument, retryElectronicDocument } from "../src/electronic-billing.js";

process.env.SUNAT_MODE = "demo";
let counter = 0;
const client = { id: 1, documentType: "DNI", documentNumber: "70000001", firstName: "Cliente", lastName: "Prueba", email: "cliente@example.com" };
const state = {
  facturacion: [],
  clients: [client],
  payments: [
    { id: 10, clientId: 1, amount: 118, status: "APROBADO", concept: "Cena Park Plaza" },
    { id: 11, clientId: 1, amount: 59, status: "APROBADO", concept: "Bar Park Plaza" }
  ]
};

const boleta = await issueElectronicDocument(state, {
  paymentId: 10,
  type: "BOLETA",
  recipient: { documentType: "DNI", documentNumber: "70000001", name: "Cliente Prueba", email: "cliente@example.com" },
  simulationResult: "ACEPTADO"
}, 1, () => ++counter);

assert.equal(electronicBillingConfiguration().simulation, true);
assert.deepEqual(electronicBillingAccess({ displayRole: "SUPERADMIN" }), {
  canView: true, canIssue: true, canDownload: true, canRetry: true, canConfigure: true, responsibility: "SUPERVISION"
});
assert.deepEqual(electronicBillingAccess({ role: "ADMINISTRADOR", position: "ADMIN_RECEPCION" }), {
  canView: true, canIssue: true, canDownload: true, canRetry: false, canConfigure: false, responsibility: "EMISION"
});
assert.equal(electronicBillingAccess({ role: "RESTAURANTE" }).canView, false);
assert.equal(boleta.status, "ACEPTADO");
assert.equal(boleta.series, "B001");
assert.equal(boleta.subtotal, 100);
assert.equal(boleta.tax, 18);
assert.equal(state.payments[0].invoiceId, boleta.id);
await assert.rejects(() => issueElectronicDocument(state, {
  paymentId: 10,
  type: "BOLETA",
  recipient: { documentType: "DNI", documentNumber: "70000001", name: "Cliente Prueba" }
}, 1, () => ++counter), /ya tiene un comprobante/);

const pending = await issueElectronicDocument(state, {
  paymentId: 11,
  type: "FACTURA",
  recipient: { documentType: "RUC", documentNumber: "20123456789", name: "Empresa Prueba SAC", address: "Jr. Prueba 123" },
  simulationResult: "PENDIENTE_REINTENTO"
}, 1, () => ++counter);
assert.equal(pending.status, "PENDIENTE_REINTENTO");
await retryElectronicDocument(pending);
assert.equal(pending.status, "ACEPTADO");
assert.equal(pending.attempts, 2);

for (const kind of ["pdf", "xml", "cdr"]) {
  const artifact = electronicDocumentArtifact(boleta, kind);
  assert.ok(artifact.body.length > 100);
  assert.ok(artifact.filename.includes("B001"));
}

console.log(JSON.stringify({ status: "PASSED", checks: 16, documents: state.facturacion.length }, null, 2));
