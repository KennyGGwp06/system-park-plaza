// Prueba unitaria de la facturación electrónica (2026-10-12): boleta, factura, nota de crédito, reglas SUNAT y archivos.
import assert from "node:assert/strict";
import { amountInWords, electronicBillingAccess, electronicBillingConfiguration, electronicDocumentArtifact, isValidRuc, issueCreditNote, issueElectronicDocument, previewElectronicDocument, retryElectronicDocument } from "../src/electronic-billing.js";

process.env.SUNAT_MODE = "demo";
let counter = 0, checks = 0;
const check = (fn) => { fn(); checks += 1; };
const nextId = () => ++counter;
const client = { id: 1, documentType: "DNI", documentNumber: "70000001", firstName: "Cliente", lastName: "Prueba", email: "cliente@example.com" };
const state = {
  settings: { hotelName: "Hotel Park Plaza", taxRate: 18 },
  facturacion: [], clients: [client], bookings: [], events: [], rooms: [],
  orders: [{ id: 1, groupCode: "GRP-1", clientId: 1, items: [{ menuItemId: 6, name: "Chaufa Amazónica", quantity: 2, price: 20 }, { menuItemId: 40, name: "Pisco Sour", quantity: 1, price: 18 }] }],
  payments: [
    { id: 10, clientId: 1, amount: 118, status: "APROBADO", concept: "Cena Park Plaza", method: "YAPE" },
    { id: 11, clientId: 1, amount: 59, status: "APROBADO", concept: "Bar Park Plaza", method: "PLIN" },
    { id: 12, clientId: 1, amount: 58, status: "APROBADO", concept: "Pedido GRP-1", method: "YAPE" },
    { id: 13, clientId: 1, amount: 900, status: "APROBADO", concept: "Evento", method: "EFECTIVO" }
  ]
};

// Reglas y utilidades
check(() => assert.equal(amountInWords(110), "CIENTO DIEZ CON 00/100 SOLES"));
check(() => assert.equal(amountInWords(1521.5), "MIL QUINIENTOS VEINTIUNO CON 50/100 SOLES"));
check(() => assert.equal(amountInWords(21000), "VEINTIÚN MIL CON 00/100 SOLES"));
check(() => assert.equal(amountInWords(1000000), "UN MILLÓN CON 00/100 SOLES"));
check(() => assert.equal(isValidRuc("20100047218"), true));
check(() => assert.equal(isValidRuc("20123456789"), false));
check(() => assert.equal(electronicBillingConfiguration(state).simulation, true));
check(() => assert.equal(electronicBillingConfiguration(state).issuer.rucIsDemo, true));
check(() => assert.equal(electronicBillingAccess({ displayRole: "SUPERADMIN" }).canVoid, true));
check(() => assert.equal(electronicBillingAccess({ role: "ADMINISTRADOR", position: "ADMIN_RECEPCION" }).canVoid, false));
check(() => assert.equal(electronicBillingAccess({ role: "RESTAURANTE" }).canView, false));

// Boleta
const boleta = await issueElectronicDocument(state, { paymentId: 10, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: "70000001", name: "Cliente Prueba" }, simulationResult: "ACEPTADO" }, 1, nextId);
check(() => assert.equal(boleta.status, "ACEPTADO"));
check(() => assert.equal(boleta.fullNumber, "B001-00000001"));
check(() => assert.equal(boleta.subtotal, 100));
check(() => assert.equal(boleta.tax, 18));
check(() => assert.equal(boleta.qrText.split("|").length, 11));
check(() => assert.ok(boleta.hash.length > 20));
check(() => assert.equal(state.payments[0].invoiceId, boleta.id));
await assert.rejects(() => issueElectronicDocument(state, { paymentId: 10, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: "70000001", name: "Cliente Prueba" } }, 1, nextId), /ya tiene el comprobante/); checks += 1;

// Detalle real de un pedido (dos líneas)
const preview = previewElectronicDocument(state, 12);
check(() => assert.equal(preview.lines.length, 2));
check(() => assert.equal(preview.total, 58));

// Factura: RUC con dígito verificador y dirección fiscal
await assert.rejects(() => issueElectronicDocument(state, { paymentId: 11, type: "FACTURA", recipient: { documentType: "RUC", documentNumber: "20123456789", name: "Empresa", address: "Jr. 1" } }, 1, nextId), /RUC no es válido/); checks += 1;
const pending = await issueElectronicDocument(state, { paymentId: 11, type: "FACTURA", recipient: { documentType: "RUC", documentNumber: "20100047218", name: "Empresa Prueba SAC", address: "Jr. Prueba 123" }, simulationResult: "PENDIENTE_REINTENTO" }, 1, nextId);
check(() => assert.equal(pending.status, "PENDIENTE_REINTENTO"));
await retryElectronicDocument(pending);
check(() => assert.equal(pending.status, "ACEPTADO"));
check(() => assert.equal(pending.attempts, 2));
check(() => assert.equal(pending.fullNumber, "F001-00000001"));

// Boleta sin documento: solo por menos de S/ 700
await assert.rejects(() => issueElectronicDocument(state, { paymentId: 13, type: "BOLETA", recipient: { documentType: "SIN_DOCUMENTO" } }, 1, nextId), /700/); checks += 1;

// Nota de crédito total: anula la factura y el pago puede volver a facturarse
const credit = await issueCreditNote(state, pending, { reasonCode: "01", reason: "Error en la razón social" }, 1, nextId);
check(() => assert.equal(credit.fullNumber, "FC01-00000001"));
check(() => assert.equal(credit.reference.fullNumber, "F001-00000001"));
check(() => assert.equal(pending.status, "ANULADO"));
const again = await issueElectronicDocument(state, { paymentId: 11, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: "70000001", name: "Cliente Prueba" } }, 1, nextId);
check(() => assert.equal(again.fullNumber, "B001-00000002"));

// Numeración por serie aunque el historial archive los comprobantes antiguos
state.facturacion = [];
const afterArchive = await issueElectronicDocument(state, { paymentId: 12, type: "BOLETA", recipient: { documentType: "DNI", documentNumber: "70000001", name: "Cliente Prueba" } }, 1, nextId);
check(() => assert.equal(afterArchive.fullNumber, "B001-00000003"));

// Archivos
const xml = electronicDocumentArtifact(boleta, "xml").body.toString();
check(() => assert.ok(xml.includes("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2") && xml.includes(`<ds:DigestValue>${boleta.hash}</ds:DigestValue>`)));
check(() => assert.ok(electronicDocumentArtifact(credit, "xml").body.toString().includes("<cac:DiscrepancyResponse>")));
const cdr = electronicDocumentArtifact(boleta, "cdr");
check(() => assert.equal(cdr.body.readUInt32LE(0), 0x04034b50));
check(() => assert.ok(cdr.filename.startsWith("R-") && cdr.filename.endsWith(".zip")));
const pdf = electronicDocumentArtifact(boleta, "pdf").body;
check(() => assert.ok(pdf.subarray(0, 8).toString().startsWith("%PDF-1.4") && pdf.length > 3000));

console.log(JSON.stringify({ status: "PASSED", checks, documents: counter }, null, 2));
