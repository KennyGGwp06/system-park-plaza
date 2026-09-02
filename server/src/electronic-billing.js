const ALLOWED_DOCUMENT_TYPES = new Set(["BOLETA", "FACTURA"]);
const ALLOWED_SIMULATION_RESULTS = new Set(["ACEPTADO", "RECHAZADO", "PENDIENTE_REINTENTO"]);

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function safeText(value) {
  return String(value ?? "").trim();
}

function xmlEscape(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function billingMode() {
  const requested = String(process.env.SUNAT_MODE || "demo").trim().toLowerCase();
  return ["beta", "production"].includes(requested) ? requested : "demo";
}

export function electronicBillingConfiguration() {
  const mode = billingMode();
  const adapterConfigured = Boolean(process.env.SUNAT_ADAPTER_URL && process.env.SUNAT_ADAPTER_TOKEN);
  return {
    mode: mode.toUpperCase(),
    simulation: mode === "demo",
    adapterConfigured,
    ready: mode === "demo" || adapterConfigured,
    label: mode === "demo" ? "Simulación segura" : mode === "beta" ? "SUNAT Beta" : "SUNAT Producción",
    message: mode === "demo"
      ? "El flujo está listo para probarse sin credenciales. Ningún comprobante de esta pantalla se envía todavía a SUNAT."
      : adapterConfigured
        ? `Conexión configurada para ${mode === "beta" ? "pruebas SUNAT" : "producción SUNAT"}.`
        : "Faltan la URL interna y el token del adaptador SUNAT."
  };
}

export function electronicBillingAccess(user) {
  const role = safeText(user?.displayRole || user?.role).toUpperCase();
  const position = safeText(user?.position).toUpperCase();
  const operationalArea = safeText(user?.operationalArea).toUpperCase();
  const email = safeText(user?.email).toLowerCase();
  const isSuperAdmin = role === "SUPERADMIN";
  const isReceptionAdmin = role === "ADMINISTRADOR" && (
    position === "ADMIN_RECEPCION"
    || operationalArea === "RECEPCION"
    || email === "recepcion@parkplaza.com"
  );

  return {
    canView: isSuperAdmin || isReceptionAdmin,
    canIssue: isSuperAdmin || isReceptionAdmin,
    canDownload: isSuperAdmin || isReceptionAdmin,
    canRetry: isSuperAdmin,
    canConfigure: isSuperAdmin,
    responsibility: isSuperAdmin ? "SUPERVISION" : isReceptionAdmin ? "EMISION" : "NONE"
  };
}

function validateRecipient(type, recipient) {
  const documentNumber = digits(recipient.documentNumber);
  const documentType = safeText(recipient.documentType).toUpperCase();
  const name = safeText(recipient.name);
  const address = safeText(recipient.address);

  if (!name) throw Object.assign(new Error("Confirma el nombre o razón social del cliente"), { status: 400 });
  if (type === "FACTURA") {
    if (documentType !== "RUC" || documentNumber.length !== 11) {
      throw Object.assign(new Error("Para emitir una factura ingresa un RUC válido de 11 dígitos"), { status: 400 });
    }
    if (!address) throw Object.assign(new Error("Para emitir una factura confirma la dirección fiscal"), { status: 400 });
  } else if (!documentNumber || ![8, 9, 11, 12].includes(documentNumber.length)) {
    throw Object.assign(new Error("Confirma un documento válido para la boleta"), { status: 400 });
  }

  return {
    documentType: type === "FACTURA" ? "RUC" : documentType || "DNI",
    documentNumber,
    name,
    email: safeText(recipient.email),
    address
  };
}

function nextDocumentNumber(state, series) {
  const current = (state.facturacion || [])
    .filter((item) => item.series === series)
    .reduce((maximum, item) => Math.max(maximum, Number(item.correlative || item.number || 0)), 0);
  return current + 1;
}

function simulationResponse(payload) {
  const requested = String(payload.simulationResult || "ACEPTADO").toUpperCase();
  const status = ALLOWED_SIMULATION_RESULTS.has(requested) ? requested : "ACEPTADO";
  if (status === "RECHAZADO") {
    return { status, code: "DEMO-2001", description: "Rechazo simulado para comprobar la explicación del sistema." };
  }
  if (status === "PENDIENTE_REINTENTO") {
    return { status, code: "DEMO-TIMEOUT", description: "Interrupción simulada. El comprobante puede reintentarse sin duplicarlo." };
  }
  return { status, code: "0", description: "Aceptado en simulación. No fue enviado a SUNAT." };
}

async function sendToAdapter(document) {
  const url = String(process.env.SUNAT_ADAPTER_URL || "").replace(/\/$/, "");
  const token = process.env.SUNAT_ADAPTER_TOKEN;
  if (!url || !token) {
    return { status: "PENDIENTE_REINTENTO", code: "ADAPTER_NOT_CONFIGURED", description: "La conexión SUNAT todavía no tiene credenciales." };
  }

  try {
    const response = await fetch(`${url}/v1/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(Number(process.env.SUNAT_ADAPTER_TIMEOUT_MS || 30000))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status >= 500) return { status: "PENDIENTE_REINTENTO", code: String(data.code || response.status), description: data.message || "SUNAT no respondió temporalmente." };
      return { status: "RECHAZADO", code: String(data.code || response.status), description: data.message || "SUNAT rechazó el comprobante." };
    }
    return {
      status: data.status === "ACCEPTED" || data.status === "ACEPTADO" ? "ACEPTADO" : data.status === "REJECTED" || data.status === "RECHAZADO" ? "RECHAZADO" : "PENDIENTE_REINTENTO",
      code: String(data.code || "0"),
      description: data.description || data.message || "Respuesta recibida de SUNAT.",
      ticket: data.ticket || null,
      artifacts: data.artifacts || null
    };
  } catch (error) {
    return { status: "PENDIENTE_REINTENTO", code: "NETWORK_ERROR", description: `No se pudo contactar al adaptador SUNAT: ${error.message}` };
  }
}

export async function issueElectronicDocument(state, payload, userId, nextId) {
  state.facturacion ||= [];
  const paymentId = Number(payload.paymentId);
  const payment = (state.payments || []).find((item) => Number(item.id) === paymentId);
  if (!payment) throw Object.assign(new Error("El pago seleccionado ya no existe"), { status: 404 });
  if (payment.status && payment.status !== "APROBADO") throw Object.assign(new Error("Solo se puede facturar un pago aprobado"), { status: 409 });
  if (payment.invoiceId || state.facturacion.some((item) => Number(item.paymentId) === paymentId)) {
    throw Object.assign(new Error("Este pago ya tiene un comprobante"), { status: 409 });
  }

  const type = safeText(payload.type).toUpperCase();
  if (!ALLOWED_DOCUMENT_TYPES.has(type)) throw Object.assign(new Error("Elige boleta o factura"), { status: 400 });
  const recipient = validateRecipient(type, payload.recipient || {});
  const total = roundMoney(payment.amount);
  if (total <= 0) throw Object.assign(new Error("El pago debe ser mayor a cero"), { status: 400 });
  const subtotal = roundMoney(total / 1.18);
  const tax = roundMoney(total - subtotal);
  const series = type === "FACTURA" ? String(process.env.SUNAT_INVOICE_SERIES || "F001") : String(process.env.SUNAT_RECEIPT_SERIES || "B001");
  const correlative = nextDocumentNumber(state, series);
  const number = String(correlative).padStart(8, "0");
  const issuedAt = new Date().toISOString();
  const configuration = electronicBillingConfiguration();
  const id = nextId();
  const document = {
    id,
    paymentId,
    clientId: Number(payment.clientId || payload.clientId),
    idempotencyKey: `PAYMENT-${paymentId}`,
    type,
    sunatDocumentType: type === "FACTURA" ? "01" : "03",
    series,
    correlative,
    number,
    fullNumber: `${series}-${number}`,
    recipient,
    lines: [{ code: `PAY-${paymentId}`, description: safeText(payment.concept) || "Servicio Park Plaza", quantity: 1, unitCode: "NIU", unitValue: subtotal, igv: tax, total }],
    subtotal,
    tax,
    total,
    currency: "PEN",
    status: "ENVIANDO",
    environment: configuration.mode,
    attempts: 1,
    issuedAt,
    createdById: Number(userId),
    lastAttemptAt: issuedAt,
    artifacts: { xml: true, cdr: true, pdf: true }
  };

  const response = configuration.simulation ? simulationResponse(payload) : await sendToAdapter(document);
  Object.assign(document, {
    status: response.status,
    sunatCode: response.code,
    sunatDescription: response.description,
    sunatTicket: response.ticket || null,
    acceptedAt: response.status === "ACEPTADO" ? new Date().toISOString() : null,
    artifacts: response.artifacts || document.artifacts
  });
  state.facturacion.unshift(document);
  payment.invoiceId = id;
  return document;
}

export async function retryElectronicDocument(document) {
  if (document.status !== "PENDIENTE_REINTENTO") {
    throw Object.assign(new Error("Solo los comprobantes pendientes de reintento pueden reenviarse"), { status: 409 });
  }
  document.attempts = Number(document.attempts || 0) + 1;
  document.lastAttemptAt = new Date().toISOString();
  const configuration = electronicBillingConfiguration();
  const response = configuration.simulation
    ? { status: "ACEPTADO", code: "0", description: "Aceptado en el reintento simulado. No fue enviado a SUNAT." }
    : await sendToAdapter(document);
  document.status = response.status;
  document.sunatCode = response.code;
  document.sunatDescription = response.description;
  document.sunatTicket = response.ticket || document.sunatTicket || null;
  document.acceptedAt = response.status === "ACEPTADO" ? new Date().toISOString() : null;
  return document;
}

function documentXml(document) {
  const lines = (document.lines || []).map((line) => `    <Line><Description>${xmlEscape(line.description)}</Description><Quantity>${line.quantity}</Quantity><Total>${line.total.toFixed(2)}</Total></Line>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ARCHIVO DE SIMULACION: no es un CPE firmado ni enviado a SUNAT -->\n<ParkPlazaElectronicDocument environment="${xmlEscape(document.environment)}">\n  <Type>${xmlEscape(document.sunatDocumentType)}</Type>\n  <Number>${xmlEscape(document.fullNumber)}</Number>\n  <IssueDate>${xmlEscape(document.issuedAt)}</IssueDate>\n  <Recipient documentType="${xmlEscape(document.recipient.documentType)}" documentNumber="${xmlEscape(document.recipient.documentNumber)}">${xmlEscape(document.recipient.name)}</Recipient>\n  <Lines>\n${lines}\n  </Lines>\n  <Subtotal>${document.subtotal.toFixed(2)}</Subtotal>\n  <Tax>${document.tax.toFixed(2)}</Tax>\n  <Total currency="PEN">${document.total.toFixed(2)}</Total>\n</ParkPlazaElectronicDocument>\n`;
}

function documentCdr(document) {
  return JSON.stringify({
    simulation: document.environment === "DEMO",
    document: document.fullNumber,
    status: document.status,
    code: document.sunatCode,
    description: document.sunatDescription,
    processedAt: document.acceptedAt || document.lastAttemptAt
  }, null, 2);
}

function pdfEscape(value) {
  return safeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function simplePdf(document) {
  const rows = [
    "PARK PLAZA",
    `${document.type} ELECTRONICA - ${document.environment === "DEMO" ? "SIMULACION" : document.environment}`,
    document.fullNumber,
    `Cliente: ${document.recipient.name}`,
    `${document.recipient.documentType}: ${document.recipient.documentNumber}`,
    `Concepto: ${document.lines?.[0]?.description || "Servicio Park Plaza"}`,
    `Subtotal: S/ ${document.subtotal.toFixed(2)}`,
    `IGV: S/ ${document.tax.toFixed(2)}`,
    `TOTAL: S/ ${document.total.toFixed(2)}`,
    `Estado: ${document.status}`,
    document.environment === "DEMO" ? "Documento de prueba. No fue enviado a SUNAT." : document.sunatDescription
  ];
  const commands = rows.map((row, index) => `BT /F1 ${index < 3 ? 16 : 11} Tf 50 ${780 - index * 28} Td (${pdfEscape(row)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(commands)} >> stream\n${commands}\nendstream endobj`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(body)); body += `${object}\n`; }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export function electronicDocumentArtifact(document, kind) {
  const base = `${document.fullNumber}-${document.environment.toLowerCase()}`;
  if (kind === "xml") return { contentType: "application/xml; charset=utf-8", filename: `${base}.xml`, body: Buffer.from(documentXml(document)) };
  if (kind === "cdr") return { contentType: "application/json; charset=utf-8", filename: `R-${base}.json`, body: Buffer.from(documentCdr(document)) };
  if (kind === "pdf") return { contentType: "application/pdf", filename: `${base}.pdf`, body: simplePdf(document) };
  throw Object.assign(new Error("Archivo fiscal no reconocido"), { status: 404 });
}
