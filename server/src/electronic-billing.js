/* Facturación electrónica (boleta 03, factura 01 y nota de crédito 07) con el formato de SUNAT.
   Modo "demo" (por defecto): todo el proceso es real menos el envío. Se arma el XML UBL 2.1, se calcula el hash
   (DigestValue SHA-256) que va en la representación impresa y en el QR, se simula la respuesta (CDR en ZIP) y se
   genera el PDF A4. Con SUNAT_MODE=beta|production el documento se envía al adaptador SUNAT (OSE/PSE del cliente).
   Los números se llevan por serie en state.billingCounters: nunca se repiten aunque el historial archive los
   comprobantes antiguos. */
import { createHash, createHmac } from "node:crypto";
import QRCode from "qrcode";

const ALLOWED_DOCUMENT_TYPES = new Set(["BOLETA", "FACTURA"]);
const ALLOWED_SIMULATION_RESULTS = new Set(["ACEPTADO", "RECHAZADO", "PENDIENTE_REINTENTO"]);
const SUNAT_TYPE = { FACTURA: "01", BOLETA: "03", NOTA_CREDITO: "07" };
const TYPE_LABEL = { FACTURA: "FACTURA ELECTRÓNICA", BOLETA: "BOLETA DE VENTA ELECTRÓNICA", NOTA_CREDITO: "NOTA DE CRÉDITO ELECTRÓNICA" };
// Catálogo 06 de SUNAT (tipo de documento de identidad).
const ID_TYPES = { DNI: "1", RUC: "6", CE: "4", PASAPORTE: "7", SIN_DOCUMENTO: "0" };
const ID_LABEL = { DNI: "DNI", RUC: "RUC", CE: "C.E.", PASAPORTE: "PASAPORTE", SIN_DOCUMENTO: "SIN DOC." };
// Catálogo 09 de SUNAT (motivos de la nota de crédito) que usa el hotel.
export const CREDIT_NOTE_REASONS = { "01": "Anulación de la operación", "02": "Anulación por error en el RUC", "03": "Corrección por error en la descripción", "06": "Devolución total", "07": "Devolución por ítem", "09": "Disminución en el valor", "10": "Otros conceptos" };
// Desde S/ 700 la boleta debe identificar al comprador (DNI, C.E. o pasaporte).
export const BOLETA_ID_THRESHOLD = 700;
const SUNAT_RUC = "20131312955";

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = (value) => round(value).toFixed(2);
const safeText = (value) => String(value ?? "").trim();
const fail = (status, message) => Object.assign(new Error(message), { status });
const xmlEscape = (value) => safeText(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const limaParts = (iso) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}`, display: `${parts.day}/${parts.month}/${parts.year}` };
};

/* ---------- Validaciones ---------- */
export function isValidRuc(value) {
  const ruc = String(value || "");
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(ruc[index]), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ruc[10]);
}
function demoRuc() { const base = "2060000000"; for (let digit = 0; digit < 10; digit++) if (isValidRuc(base + digit)) return base + digit; return "20600000001"; }

/* ---------- Importe en letras (como lo imprime SUNAT: "CIENTO DIEZ CON 00/100 SOLES") ---------- */
const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const TENS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
function underThousand(n) {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const hundreds = Math.floor(n / 100), rest = n % 100;
  const restText = rest < 30 ? UNITS[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` Y ${UNITS[rest % 10]}` : ""}`;
  return [HUNDREDS[hundreds], restText].filter(Boolean).join(" ");
}
const apocope = (text) => text.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/(^|\s)UNO$/, "$1UN");
function integerWords(n) {
  if (n === 0) return "CERO";
  const millions = Math.floor(n / 1e6), thousands = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  const out = [];
  if (millions) out.push(millions === 1 ? "UN MILLÓN" : `${apocope(integerWords(millions))} MILLONES`);
  if (thousands) out.push(thousands === 1 ? "MIL" : `${apocope(underThousand(thousands))} MIL`);
  if (rest) out.push(underThousand(rest));
  return out.join(" ");
}
export function amountInWords(total, currency = "SOLES") {
  const cents = Math.round(Number(total) * 100);
  return `${integerWords(Math.floor(cents / 100))} CON ${String(cents % 100).padStart(2, "0")}/100 ${currency}`;
}

/* ---------- Configuración ---------- */
function billingMode() {
  const requested = String(process.env.SUNAT_MODE || "demo").trim().toLowerCase();
  return ["beta", "production"].includes(requested) ? requested : "demo";
}
export function billingIssuer(state) {
  const settings = state?.settings || {};
  const ruc = String(settings.ruc || process.env.SUNAT_RUC || "").replace(/\D/g, "");
  const validRuc = isValidRuc(ruc);
  return {
    ruc: validRuc ? ruc : demoRuc(),
    rucIsDemo: !validRuc,
    legalName: safeText(settings.legalName) || `${safeText(settings.hotelName) || "HOTEL PARK PLAZA"}`.toUpperCase(),
    commercialName: safeText(settings.hotelName) || "Hotel Park Plaza",
    address: safeText(settings.fiscalAddress || settings.address) || "Pucallpa, Coronel Portillo, Ucayali",
    ubigeo: safeText(settings.ubigeo) || "250101",
    district: safeText(settings.district) || "CALLERIA",
    province: safeText(settings.province) || "CORONEL PORTILLO",
    department: safeText(settings.department) || "UCAYALI",
    phone: safeText(settings.phone),
    email: safeText(settings.email)
  };
}
export function billingSeries(state) {
  const settings = state?.settings || {};
  const valid = (value, letter) => (/^[A-Z][A-Z0-9]{3}$/.test(String(value || "").toUpperCase()) && String(value).toUpperCase().startsWith(letter) ? String(value).toUpperCase() : null);
  return {
    BOLETA: valid(settings.receiptSeries, "B") || valid(process.env.SUNAT_RECEIPT_SERIES, "B") || "B001",
    FACTURA: valid(settings.invoiceSeries, "F") || valid(process.env.SUNAT_INVOICE_SERIES, "F") || "F001",
    NOTA_CREDITO_BOLETA: "BC01",
    NOTA_CREDITO_FACTURA: "FC01"
  };
}
export function electronicBillingConfiguration(state) {
  const mode = billingMode();
  const adapterConfigured = Boolean(process.env.SUNAT_ADAPTER_URL && process.env.SUNAT_ADAPTER_TOKEN);
  const issuer = billingIssuer(state);
  return {
    mode: mode.toUpperCase(),
    simulation: mode === "demo",
    adapterConfigured,
    ready: mode === "demo" || adapterConfigured,
    label: mode === "demo" ? "Modo demostración" : mode === "beta" ? "SUNAT Beta (pruebas)" : "SUNAT Producción",
    message: mode === "demo"
      ? `Se generan el XML UBL 2.1, el hash, el CDR y el PDF como en la operación real, pero nada se envía a SUNAT.${issuer.rucIsDemo ? " El RUC es de prueba: registra el RUC y la razón social del hotel en Configuración general." : ""}`
      : adapterConfigured
        ? `Conexión configurada para ${mode === "beta" ? "pruebas SUNAT" : "producción SUNAT"}.`
        : "Faltan la URL interna y el token del adaptador SUNAT.",
    issuer,
    series: billingSeries(state),
    taxRate: Number(state?.settings?.taxRate ?? 18),
    boletaIdThreshold: BOLETA_ID_THRESHOLD,
    creditNoteReasons: CREDIT_NOTE_REASONS
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
    canVoid: isSuperAdmin,
    responsibility: isSuperAdmin ? "SUPERVISION" : isReceptionAdmin ? "EMISION" : "NONE"
  };
}

/* ---------- Receptor ---------- */
function validateRecipient(type, recipient, total) {
  let documentType = safeText(recipient.documentType).toUpperCase().replace("PASSPORT", "PASAPORTE");
  if (!ID_TYPES[documentType]) documentType = type === "FACTURA" ? "RUC" : "DNI";
  let documentNumber = safeText(recipient.documentNumber).toUpperCase().replace(/\s/g, "");
  let name = safeText(recipient.name).replace(/\s+/g, " ");
  const address = safeText(recipient.address);

  if (type === "FACTURA") {
    if (documentType !== "RUC") throw fail(400, "La factura se emite solo a un RUC. Para personas sin RUC emite una boleta.");
    if (!/^\d{11}$/.test(documentNumber)) throw fail(400, "Para emitir una factura ingresa un RUC de 11 dígitos");
    if (!isValidRuc(documentNumber)) throw fail(400, "El RUC no es válido: revisa los dígitos (el último es un dígito verificador)");
    if (!name) throw fail(400, "Confirma la razón social de la empresa");
    if (!address) throw fail(400, "Para emitir una factura confirma la dirección fiscal");
  } else if (documentType === "SIN_DOCUMENTO") {
    if (Number(total) >= BOLETA_ID_THRESHOLD) throw fail(400, `Desde S/ ${BOLETA_ID_THRESHOLD} la boleta debe identificar al cliente con su DNI, C.E. o pasaporte (regla SUNAT)`);
    documentNumber = "-";
    name = name || "CLIENTES VARIOS";
  } else {
    if (documentType === "DNI" && !/^\d{8}$/.test(documentNumber)) throw fail(400, "El DNI debe tener 8 dígitos");
    if (documentType === "RUC" && !isValidRuc(documentNumber)) throw fail(400, "El RUC no es válido");
    if (["CE", "PASAPORTE"].includes(documentType) && !/^[A-Z0-9]{6,12}$/.test(documentNumber)) throw fail(400, "El carné de extranjería o pasaporte debe tener de 6 a 12 letras o números");
    if (!name) throw fail(400, "Confirma el nombre del cliente");
  }
  return { documentType, documentTypeCode: ID_TYPES[documentType], documentNumber, name: name.toUpperCase(), email: safeText(recipient.email), address };
}

/* ---------- Detalle (ítems) a partir del pago ---------- */
const SERVICE_NAME = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", BAR: "Bar", EVENTOS: "Eventos" };
const dayText = (value) => { const day = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split("-").reverse().join("/") : ""; };
function paymentLines(state, payment) {
  const amount = round(payment.amount);
  const booking = (state.bookings || []).find((item) => Number(item.id) === Number(payment.bookingId || payment.reservationId));
  const event = (state.events || []).find((item) => Number(item.id) === Number(payment.eventId));
  const group = /^Pedido\s+(\S+)/.exec(safeText(payment.concept))?.[1];
  if (group) {
    const lines = (state.orders || []).filter((order) => order.groupCode === group && Number(order.clientId) === Number(payment.clientId)).flatMap((order) => (order.items || []).map((item) => ({ code: `MENU-${item.menuItemId}`, description: item.name, quantity: Number(item.quantity || 1), unitCode: "NIU", price: Number(item.price || 0) })));
    const sum = round(lines.reduce((total, line) => total + line.price * line.quantity, 0));
    if (lines.length && Math.abs(sum - amount) < 0.011) return lines;
  }
  let description = safeText(payment.concept) || "Servicio Park Plaza";
  let code = `PAGO-${payment.id}`;
  let full = null;
  if (booking) {
    const service = SERVICE_NAME[booking.serviceCode] || booking.serviceCode;
    full = Number(booking.total || 0);
    code = `${booking.serviceCode}-${booking.code}`;
    if (booking.serviceCode === "HOSPEDAJE") {
      const room = (state.rooms || []).find((item) => Number(item.id) === Number(booking.roomId)) || booking.room || {};
      const nights = Math.max(1, Math.round((new Date(`${String(booking.checkOut).slice(0, 10)}T12:00:00Z`) - new Date(`${String(booking.checkIn).slice(0, 10)}T12:00:00Z`)) / 86400000) || 1);
      description = `Hospedaje hab. ${room.number || ""} ${room.type?.name || ""} · ${nights} ${nights === 1 ? "noche" : "noches"} del ${dayText(booking.checkIn)} al ${dayText(booking.checkOut)} · ${booking.code}`.replace(/\s+/g, " ");
    } else {
      const plan = booking.planName && booking.planName !== service ? ` · ${booking.planName}` : "";
      description = `${service}${plan} · ${booking.people || 1} pers. · ${dayText(booking.date)} ${booking.slot || ""} · ${booking.code}`.replace(/\s+/g, " ");
    }
    if (/^(Cierre|Saldo)/i.test(safeText(payment.concept))) { description = `${safeText(payment.concept)} · ${description}`; full = null; }
  } else if (event) {
    full = Number(event.price || 0);
    code = `EVENTO-${event.code}`;
    description = `Evento "${event.name}" · ${event.space?.name || ""} · ${dayText(event.startsAt)} · ${event.guests || ""} invitados · ${event.code}`.replace(/\s+/g, " ");
  }
  if (full && amount + 0.01 < full) description = `Pago a cuenta (${Math.round((amount / full) * 100)} %) · ${description}`;
  return [{ code, description, quantity: 1, unitCode: "ZZ", price: amount }];
}
// IGV incluido en el precio: valor de venta = precio / (1 + tasa). El último ítem absorbe el redondeo.
function withTaxes(rawLines, taxRate) {
  const factor = 1 + taxRate / 100;
  const lines = rawLines.map((line, index) => {
    const total = round(line.price * line.quantity);
    const valueTotal = round(total / factor);
    return { index: index + 1, code: line.code, description: line.description, quantity: line.quantity, unitCode: line.unitCode, unitPrice: round(line.price), unitValue: round(line.price / factor), valueTotal, igv: round(total - valueTotal), total, taxAffectation: "10" };
  });
  const total = round(lines.reduce((sum, line) => sum + line.total, 0));
  const subtotal = round(lines.reduce((sum, line) => sum + line.valueTotal, 0));
  return { lines, subtotal, tax: round(total - subtotal), total };
}
export function previewElectronicDocument(state, paymentId) {
  const payment = (state.payments || []).find((item) => Number(item.id) === Number(paymentId));
  if (!payment) throw fail(404, "El pago seleccionado ya no existe");
  const taxRate = Number(state?.settings?.taxRate ?? 18);
  return { paymentId: payment.id, taxRate, ...withTaxes(paymentLines(state, payment), taxRate), amountInWords: amountInWords(payment.amount), boletaIdThreshold: BOLETA_ID_THRESHOLD };
}

/* ---------- Numeración ---------- */
function nextNumber(state, series) {
  state.billingCounters ||= {};
  if (state.billingCounters[series] == null) state.billingCounters[series] = (state.facturacion || []).filter((item) => item.series === series).reduce((max, item) => Math.max(max, Number(item.correlative || item.number || 0)), 0);
  state.billingCounters[series] += 1;
  return state.billingCounters[series];
}

/* ---------- Envío ---------- */
function simulationResponse(document, requested) {
  const status = ALLOWED_SIMULATION_RESULTS.has(String(requested || "ACEPTADO").toUpperCase()) ? String(requested || "ACEPTADO").toUpperCase() : "ACEPTADO";
  const name = { FACTURA: "La Factura", BOLETA: "La Boleta", NOTA_CREDITO: "La Nota de Crédito" }[document.type];
  if (status === "RECHAZADO") return { status, code: "2800", description: `${name} numero ${document.fullNumber} ha sido rechazada: el tipo de documento del receptor no es válido (rechazo simulado).` };
  if (status === "PENDIENTE_REINTENTO") return { status, code: "0109", description: "El sistema de SUNAT no respondió a tiempo (simulación). Reintenta el envío: el número se conserva." };
  return { status, code: "0", description: `${name} numero ${document.fullNumber}, ha sido aceptada${document.environment === "DEMO" ? " (simulación, no enviada a SUNAT)" : ""}` };
}
async function sendToAdapter(document) {
  const url = String(process.env.SUNAT_ADAPTER_URL || "").replace(/\/$/, "");
  const token = process.env.SUNAT_ADAPTER_TOKEN;
  if (!url || !token) return { status: "PENDIENTE_REINTENTO", code: "ADAPTER_NOT_CONFIGURED", description: "La conexión SUNAT todavía no tiene credenciales." };
  try {
    const response = await fetch(`${url}/v1/documents`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...document, xml: documentXml(document) }), signal: AbortSignal.timeout(Number(process.env.SUNAT_ADAPTER_TIMEOUT_MS || 30000)) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status >= 500) return { status: "PENDIENTE_REINTENTO", code: String(data.code || response.status), description: data.message || "SUNAT no respondió temporalmente." };
      return { status: "RECHAZADO", code: String(data.code || response.status), description: data.message || "SUNAT rechazó el comprobante." };
    }
    return { status: ["ACCEPTED", "ACEPTADO"].includes(data.status) ? "ACEPTADO" : ["REJECTED", "RECHAZADO"].includes(data.status) ? "RECHAZADO" : "PENDIENTE_REINTENTO", code: String(data.code || "0"), description: data.description || data.message || "Respuesta recibida de SUNAT.", ticket: data.ticket || null };
  } catch (error) {
    return { status: "PENDIENTE_REINTENTO", code: "NETWORK_ERROR", description: `No se pudo contactar al adaptador SUNAT: ${error.message}` };
  }
}
async function send(document, simulationResult) {
  const configuration = electronicBillingConfiguration();
  const response = configuration.simulation ? simulationResponse(document, simulationResult) : await sendToAdapter(document);
  Object.assign(document, { status: response.status, sunatCode: response.code, sunatDescription: response.description, sunatTicket: response.ticket || document.sunatTicket || null, acceptedAt: response.status === "ACEPTADO" ? new Date().toISOString() : null, lastAttemptAt: new Date().toISOString() });
  return document;
}

/* ---------- Armado del comprobante ---------- */
function finalize(state, document) {
  const unsigned = documentXml({ ...document, hash: "", signatureValue: "" });
  document.hash = createHash("sha256").update(unsigned).digest("base64");
  document.signatureValue = createHmac("sha256", process.env.JWT_SECRET || "park-plaza-demo").update(document.hash).digest("base64");
  const issued = limaParts(document.issuedAt);
  document.qrText = [document.issuer.ruc, document.sunatDocumentType, document.series, document.number, money(document.tax), money(document.total), issued.date, document.recipient.documentTypeCode, document.recipient.documentNumber, document.hash, ""].join("|");
  return document;
}

export async function issueElectronicDocument(state, payload, userId, nextId) {
  state.facturacion ||= [];
  const paymentId = Number(payload.paymentId);
  const payment = (state.payments || []).find((item) => Number(item.id) === paymentId);
  if (!payment) throw fail(404, "El pago seleccionado ya no existe");
  if (payment.status && payment.status !== "APROBADO") throw fail(409, "Solo se puede facturar un pago aprobado");
  const previous = state.facturacion.filter((item) => Number(item.paymentId) === paymentId && item.type !== "NOTA_CREDITO");
  const live = previous.find((item) => !["RECHAZADO", "ANULADO"].includes(item.status));
  if (payment.refundCode || previous.some((item) => item.closedByRefund)) throw fail(409, "Este pago se devolvió al cliente: su comprobante quedó anulado con nota de crédito y no se emite otro.");
  if (live) throw fail(409, `Este pago ya tiene el comprobante ${live.fullNumber}${live.status === "PENDIENTE_REINTENTO" ? " (pendiente de reenvío)" : ""}. Para cambiarlo, anúlalo primero con una nota de crédito.`);

  const type = safeText(payload.type).toUpperCase();
  if (!ALLOWED_DOCUMENT_TYPES.has(type)) throw fail(400, "Elige boleta o factura");
  const taxRate = Number(state?.settings?.taxRate ?? 18);
  const totals = withTaxes(paymentLines(state, payment), taxRate);
  if (totals.total <= 0) throw fail(400, "El pago debe ser mayor a cero");
  const recipient = validateRecipient(type, payload.recipient || {}, totals.total);
  const series = billingSeries(state)[type];
  const correlative = nextNumber(state, series);
  const number = String(correlative).padStart(8, "0");
  const configuration = electronicBillingConfiguration(state);
  const document = finalize(state, {
    id: nextId(), paymentId, clientId: Number(payment.clientId || payload.clientId) || null, idempotencyKey: `PAYMENT-${paymentId}-${previous.length + 1}`,
    type, sunatDocumentType: SUNAT_TYPE[type], series, correlative, number, fullNumber: `${series}-${number}`,
    issuer: configuration.issuer, recipient, ...totals, taxRate, amountInWords: amountInWords(totals.total), currency: "PEN",
    paymentMethod: safeText(payment.method).toUpperCase() || "EFECTIVO", paymentTerms: "Contado",
    status: "ENVIANDO", environment: configuration.mode, attempts: 1, issuedAt: new Date().toISOString(), createdById: Number(userId) || null,
    creditedAmount: 0, artifacts: { xml: true, cdr: true, pdf: true }
  });
  await send(document, payload.simulationResult);
  state.facturacion.unshift(document);
  payment.invoiceId = document.id;
  return document;
}

export async function issueCreditNote(state, original, payload, userId, nextId) {
  if (!original || original.type === "NOTA_CREDITO") throw fail(404, "Comprobante no encontrado");
  if (original.status !== "ACEPTADO") throw fail(409, original.status === "ANULADO" ? "Este comprobante ya fue anulado" : "Solo se emite nota de crédito sobre un comprobante aceptado por SUNAT");
  const reasonCode = String(payload.reasonCode || "01").padStart(2, "0");
  if (!CREDIT_NOTE_REASONS[reasonCode]) throw fail(400, "Elige el motivo de la nota de crédito");
  const available = round(Number(original.total) - Number(original.creditedAmount || 0));
  const amount = payload.amount === undefined || payload.amount === null || payload.amount === "" ? available : round(payload.amount);
  if (!(amount > 0) || amount > available + 0.001) throw fail(400, `El monto debe ser mayor a cero y no superar S/ ${money(available)}`);
  const partial = amount + 0.001 < Number(original.total);
  if (["01", "02", "06"].includes(reasonCode) && partial) throw fail(400, "La anulación o devolución total debe ser por el importe completo. Para un monto parcial usa «Disminución en el valor» o «Devolución por ítem».");
  const reason = safeText(payload.reason) || CREDIT_NOTE_REASONS[reasonCode];
  const taxRate = Number(original.taxRate ?? 18);
  const totals = partial
    ? withTaxes([{ code: `NC-${original.fullNumber}`, description: `${CREDIT_NOTE_REASONS[reasonCode]} · ${reason} · ref. ${original.fullNumber}`, quantity: 1, unitCode: "ZZ", price: amount }], taxRate)
    : withTaxes(original.lines.map((line) => ({ code: line.code, description: line.description, quantity: line.quantity, unitCode: line.unitCode, price: line.unitPrice })), taxRate);
  const series = billingSeries(state)[original.type === "FACTURA" ? "NOTA_CREDITO_FACTURA" : "NOTA_CREDITO_BOLETA"];
  const correlative = nextNumber(state, series);
  const number = String(correlative).padStart(8, "0");
  const configuration = electronicBillingConfiguration(state);
  const document = finalize(state, {
    id: nextId(), paymentId: original.paymentId, clientId: original.clientId, idempotencyKey: `CREDIT-${original.id}-${correlative}`,
    type: "NOTA_CREDITO", sunatDocumentType: "07", series, correlative, number, fullNumber: `${series}-${number}`,
    reference: { id: original.id, type: original.type, sunatDocumentType: original.sunatDocumentType, fullNumber: original.fullNumber, issuedAt: original.issuedAt },
    reasonCode, reason, refundId: payload.refundId || null,
    issuer: configuration.issuer, recipient: original.recipient, ...totals, taxRate, amountInWords: amountInWords(totals.total), currency: "PEN",
    paymentMethod: original.paymentMethod, paymentTerms: "Contado",
    status: "ENVIANDO", environment: configuration.mode, attempts: 1, issuedAt: new Date().toISOString(), createdById: Number(userId) || null,
    artifacts: { xml: true, cdr: true, pdf: true }
  });
  await send(document, "ACEPTADO");
  state.facturacion.unshift(document);
  if (document.status === "ACEPTADO") {
    original.creditedAmount = round(Number(original.creditedAmount || 0) + amount);
    original.creditNotes = [...(original.creditNotes || []), { id: document.id, fullNumber: document.fullNumber, amount, reasonCode }];
    if (original.creditedAmount + 0.001 >= Number(original.total)) { original.status = "ANULADO"; original.voidedAt = document.issuedAt; }
    // Anulado por una devolución: el dinero volvió al cliente y el pago ya no necesita un comprobante nuevo.
    if (payload.refundId) original.closedByRefund = true;
  }
  return document;
}

export async function retryElectronicDocument(document) {
  if (document.status !== "PENDIENTE_REINTENTO") throw fail(409, "Solo los comprobantes pendientes de reintento pueden reenviarse");
  document.attempts = Number(document.attempts || 0) + 1;
  return send(document, "ACEPTADO");
}

/* ---------- XML UBL 2.1 ---------- */
function partyAddress(issuer) {
  return `<cac:RegistrationAddress><cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">${xmlEscape(issuer.ubigeo)}</cbc:ID><cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">0000</cbc:AddressTypeCode><cbc:CityName>${xmlEscape(issuer.province)}</cbc:CityName><cbc:CountrySubentity>${xmlEscape(issuer.department)}</cbc:CountrySubentity><cbc:District>${xmlEscape(issuer.district)}</cbc:District><cac:AddressLine><cbc:Line>${xmlEscape(issuer.address)}</cbc:Line></cac:AddressLine><cac:Country><cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country">PE</cbc:IdentificationCode></cac:Country></cac:RegistrationAddress>`;
}
const taxScheme = `<cac:TaxScheme><cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>`;
export function documentXml(document) {
  const credit = document.type === "NOTA_CREDITO";
  const root = credit ? "CreditNote" : "Invoice";
  const issued = limaParts(document.issuedAt);
  const cur = `currencyID="${document.currency || "PEN"}"`;
  const issuer = document.issuer;
  const signature = document.hash === "" ? "" : `<ds:Signature Id="SignParkPlaza"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${document.hash}</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>${document.signatureValue}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509SubjectName>CN=${document.environment === "DEMO" ? "CERTIFICADO DE DEMOSTRACION" : xmlEscape(issuer.legalName)}, O=${xmlEscape(issuer.legalName)}, C=PE</ds:X509SubjectName></ds:X509Data></ds:KeyInfo></ds:Signature>`;
  const lineTag = credit ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = credit ? "CreditedQuantity" : "InvoicedQuantity";
  const lines = (document.lines || []).map((line) => `  <cac:${lineTag}><cbc:ID>${line.index}</cbc:ID><cbc:${qtyTag} unitCode="${line.unitCode}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${line.quantity}</cbc:${qtyTag}><cbc:LineExtensionAmount ${cur}>${money(line.valueTotal)}</cbc:LineExtensionAmount><cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount ${cur}>${money(line.unitPrice)}</cbc:PriceAmount><cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference><cac:TaxTotal><cbc:TaxAmount ${cur}>${money(line.igv)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount ${cur}>${money(line.valueTotal)}</cbc:TaxableAmount><cbc:TaxAmount ${cur}>${money(line.igv)}</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>${document.taxRate}</cbc:Percent><cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${line.taxAffectation}</cbc:TaxExemptionReasonCode>${taxScheme}</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:Item><cbc:Description><![CDATA[${String(line.description).replaceAll("]]>", "]] >")}]]></cbc:Description><cac:SellersItemIdentification><cbc:ID>${xmlEscape(line.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount ${cur}>${money(line.unitValue)}</cbc:PriceAmount></cac:Price></cac:${lineTag}>`).join("\n");
  const head = credit
    ? `  <cbc:DocumentCurrencyCode>${document.currency || "PEN"}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse><cbc:ReferenceID>${xmlEscape(document.reference.fullNumber)}</cbc:ReferenceID><cbc:ResponseCode listAgencyName="PE:SUNAT" listName="Tipo de nota de credito" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo09">${document.reasonCode}</cbc:ResponseCode><cbc:Description><![CDATA[${document.reason}]]></cbc:Description></cac:DiscrepancyResponse>
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${xmlEscape(document.reference.fullNumber)}</cbc:ID><cbc:DocumentTypeCode>${document.reference.sunatDocumentType}</cbc:DocumentTypeCode></cac:InvoiceDocumentReference></cac:BillingReference>`
    : `  <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01" name="Tipo de Operacion">${document.sunatDocumentType}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[${document.amountInWords}]]></cbc:Note>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${document.currency || "PEN"}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${(document.lines || []).length}</cbc:LineCountNumeric>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
${document.environment === "DEMO" ? "<!-- DEMOSTRACION: estructura UBL 2.1 de SUNAT con firma simulada. No es un comprobante valido ni fue enviado a SUNAT. -->\n" : ""}<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent>${signature}</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>
  <cbc:ID>${document.fullNumber}</cbc:ID>
  <cbc:IssueDate>${issued.date}</cbc:IssueDate>
  <cbc:IssueTime>${issued.time}</cbc:IssueTime>
${head}
  <cac:Signature><cbc:ID>SignParkPlaza</cbc:ID><cac:SignatoryParty><cac:PartyIdentification><cbc:ID>${issuer.ruc}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name><![CDATA[${issuer.legalName}]]></cbc:Name></cac:PartyName></cac:SignatoryParty><cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignParkPlaza</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment></cac:Signature>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${issuer.ruc}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name><![CDATA[${issuer.commercialName}]]></cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[${issuer.legalName}]]></cbc:RegistrationName>${partyAddress(issuer)}</cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${document.recipient.documentTypeCode}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${xmlEscape(document.recipient.documentNumber)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[${document.recipient.name}]]></cbc:RegistrationName>${document.recipient.address ? `<cac:RegistrationAddress><cac:AddressLine><cbc:Line><![CDATA[${document.recipient.address}]]></cbc:Line></cac:AddressLine></cac:RegistrationAddress>` : ""}</cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
${document.type === "FACTURA" ? `  <cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>\n` : ""}  <cac:TaxTotal><cbc:TaxAmount ${cur}>${money(document.tax)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount ${cur}>${money(document.subtotal)}</cbc:TaxableAmount><cbc:TaxAmount ${cur}>${money(document.tax)}</cbc:TaxAmount><cac:TaxCategory>${taxScheme}</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount ${cur}>${money(document.subtotal)}</cbc:LineExtensionAmount><cbc:TaxInclusiveAmount ${cur}>${money(document.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount ${cur}>${money(document.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lines}
</${root}>
`;
}
const fileBase = (document) => `${document.issuer.ruc}-${document.sunatDocumentType}-${document.fullNumber}`;

/* ---------- CDR (constancia de recepción) en ZIP ---------- */
function cdrXml(document) {
  const responded = limaParts(document.acceptedAt || document.lastAttemptAt || document.issuedAt);
  const issued = limaParts(document.issuedAt);
  return `<?xml version="1.0" encoding="UTF-8"?>
${document.environment === "DEMO" ? "<!-- DEMOSTRACION: constancia simulada, SUNAT no la emitio. -->\n" : ""}<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.0</cbc:CustomizationID>
  <cbc:ID>${Date.parse(document.acceptedAt || document.lastAttemptAt || document.issuedAt)}</cbc:ID>
  <cbc:IssueDate>${responded.date}</cbc:IssueDate>
  <cbc:IssueTime>${responded.time}</cbc:IssueTime>
  <cbc:ResponseDate>${responded.date}</cbc:ResponseDate>
  <cbc:ResponseTime>${responded.time}</cbc:ResponseTime>
  <cac:SenderParty><cac:PartyIdentification><cbc:ID>${SUNAT_RUC}</cbc:ID></cac:PartyIdentification></cac:SenderParty>
  <cac:ReceiverParty><cac:PartyIdentification><cbc:ID>6-${document.issuer.ruc}</cbc:ID></cac:PartyIdentification></cac:ReceiverParty>
  <cac:DocumentResponse>
    <cac:Response><cbc:ReferenceID>${document.fullNumber}</cbc:ReferenceID><cbc:ResponseCode>${xmlEscape(document.sunatCode)}</cbc:ResponseCode><cbc:Description>${xmlEscape(document.sunatDescription)}</cbc:Description></cac:Response>
    <cac:DocumentReference><cbc:ID>${document.fullNumber}</cbc:ID><cbc:IssueDate>${issued.date}</cbc:IssueDate><cbc:IssueTime>${issued.time}</cbc:IssueTime><cbc:DocumentTypeCode>${document.sunatDocumentType}</cbc:DocumentTypeCode></cac:DocumentReference>
    <cac:RecipientParty><cac:PartyIdentification><cbc:ID>${document.recipient.documentTypeCode}-${xmlEscape(document.recipient.documentNumber)}</cbc:ID></cac:PartyIdentification></cac:RecipientParty>
  </cac:DocumentResponse>
</ar:ApplicationResponse>
`;
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// ZIP sin compresión (método 0) con un archivo: es lo que entrega SUNAT como CDR.
function zipSingle(name, content) {
  const data = Buffer.from(content), nameBytes = Buffer.from(name), crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(0, 30); central.writeUInt32LE(0, 34); central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42);
  const localSize = local.length + nameBytes.length + data.length, centralSize = central.length + nameBytes.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(localSize, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}

/* ---------- Representación impresa (PDF A4) ---------- */
// Anchos de Helvetica (AFM, por 1000) para alinear importes a la derecha y cortar descripciones.
const NARROW = new Set(" .,:;'|!iljfIt()[]-/");
const charWidth = (ch, bold) => (NARROW.has(ch) ? (ch === "-" || ch === "(" || ch === ")" ? 333 : 278) : /[0-9$]/.test(ch) ? 556 : /[mwMW]/.test(ch) ? 833 : /[A-Z]/.test(ch) ? (bold ? 722 : 667) : bold ? 611 : 556);
const textWidth = (text, size, bold = false) => [...String(text)].reduce((sum, ch) => sum + charWidth(ch, bold), 0) * size / 1000;
const pdfString = (value) => { const bytes = Buffer.from(String(value ?? "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/·/g, "·"), "latin1"); let out = ""; for (const byte of bytes) out += byte === 40 || byte === 41 || byte === 92 ? `\\${String.fromCharCode(byte)}` : byte < 32 || byte > 126 ? `\\${byte.toString(8).padStart(3, "0")}` : String.fromCharCode(byte); return `(${out})`; };
function wrap(text, size, width, bold = false) {
  const words = String(text || "").split(/\s+/); const rows = []; let row = "";
  for (const word of words) { const candidate = row ? `${row} ${word}` : word; if (textWidth(candidate, size, bold) > width && row) { rows.push(row); row = word; } else row = candidate; }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}
function buildPdf(document) {
  const ops = [];
  const color = (r, g, b) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;
  const INK = color(11, 16, 32), BLUE = color(30, 111, 214), MUTED = color(90, 99, 117), LINE = color(214, 221, 232), PAPER = color(245, 248, 252);
  const text = (x, y, value, { size = 9, bold = false, fill = INK, align = "left" } = {}) => { const width = textWidth(value, size, bold); const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x; ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${fill} rg ${left.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`); };
  const rect = (x, y, w, h, { fill, stroke, width = 0.8 } = {}) => ops.push(`${fill ? `${fill} rg ` : ""}${stroke ? `${stroke} RG ${width} w ` : ""}${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
  const line = (x1, y1, x2, y2, stroke = LINE, width = 0.6) => ops.push(`${stroke} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const issuer = document.issuer, recipient = document.recipient, issued = limaParts(document.issuedAt);
  const demo = document.environment === "DEMO";

  if (demo) ops.push(`q 0.93 0.95 0.98 rg BT /F2 64 Tf 0.819 0.574 -0.574 0.819 118 250 Tm ${pdfString("DEMOSTRACIÓN")} Tj ET Q`);
  // Emisor
  rect(40, 768, 6, 46, { fill: BLUE });
  text(54, 800, issuer.commercialName, { size: 17, bold: true });
  text(54, 786, issuer.legalName, { size: 9, fill: MUTED });
  wrap(issuer.address, 8.5, 290).slice(0, 2).forEach((row, index) => text(54, 774 - index * 11, row, { size: 8.5, fill: MUTED }));
  const contact = [issuer.phone && `Tel. ${issuer.phone}`, issuer.email].filter(Boolean).join(" · ");
  if (contact) text(54, 752, contact, { size: 8.5, fill: MUTED });
  // Recuadro del comprobante
  rect(372, 742, 183, 76, { stroke: BLUE, width: 1.4 });
  text(463.5, 798, `R.U.C. N° ${issuer.ruc}`, { size: 11, bold: true, align: "center" });
  rect(372, 770, 183, 20, { fill: BLUE });
  text(463.5, 776, TYPE_LABEL[document.type], { size: document.type === "BOLETA" ? 8.6 : 9.4, bold: true, fill: "1 1 1", align: "center" });
  text(463.5, 752, document.fullNumber, { size: 13, bold: true, align: "center" });
  // Receptor
  rect(40, 650, 515, 80, { fill: PAPER, stroke: LINE });
  const label = (x, y, title, value, width = 250) => { text(x, y, title, { size: 7.5, fill: MUTED }); wrap(value || "—", 9, width).slice(0, 2).forEach((row, index) => text(x, y - 11 - index * 10, row, { size: 9, bold: index === 0 })); };
  label(52, 716, "SEÑOR(ES)", recipient.name, 300);
  label(52, 684, ID_LABEL[recipient.documentType] || recipient.documentType, recipient.documentNumber, 120);
  label(190, 684, "DIRECCIÓN", recipient.address || "—", 170);
  label(380, 716, "FECHA DE EMISIÓN", `${issued.display} ${issued.time.slice(0, 5)}`, 160);
  label(380, 684, "MONEDA · FORMA DE PAGO", `SOLES · ${document.paymentTerms || "Contado"} (${String(document.paymentMethod || "").toLowerCase()})`, 165);
  let y = 632;
  if (document.type === "NOTA_CREDITO") {
    rect(40, y - 30, 515, 34, { stroke: LINE });
    text(52, y - 10, `Documento que modifica: ${document.reference.type === "FACTURA" ? "Factura" : "Boleta"} ${document.reference.fullNumber} del ${limaParts(document.reference.issuedAt).display}`, { size: 9, bold: true });
    text(52, y - 23, `Motivo: ${document.reasonCode} - ${CREDIT_NOTE_REASONS[document.reasonCode]}${document.reason && document.reason !== CREDIT_NOTE_REASONS[document.reasonCode] ? ` · ${document.reason}` : ""}`.slice(0, 120), { size: 8.5 });
    y -= 44;
  }
  // Detalle
  const cols = { qty: 40, unit: 78, desc: 118, vu: 400, pu: 462, total: 555 };
  rect(40, y - 18, 515, 20, { fill: INK });
  const headY = y - 12;
  text(cols.qty + 4, headY, "CANT.", { size: 7.5, bold: true, fill: "1 1 1" });
  text(cols.unit + 2, headY, "UNID.", { size: 7.5, bold: true, fill: "1 1 1" });
  text(cols.desc + 4, headY, "DESCRIPCIÓN", { size: 7.5, bold: true, fill: "1 1 1" });
  text(cols.vu + 54, headY, "V. UNIT.", { size: 7.5, bold: true, fill: "1 1 1", align: "right" });
  text(cols.pu + 46, headY, "P. UNIT.", { size: 7.5, bold: true, fill: "1 1 1", align: "right" });
  text(cols.total - 6, headY, "IMPORTE", { size: 7.5, bold: true, fill: "1 1 1", align: "right" });
  y -= 32;
  for (const item of (document.lines || []).slice(0, 18)) {
    const rows = wrap(item.description, 8.5, cols.vu - cols.desc - 12).slice(0, 3);
    text(cols.qty + 4, y, String(item.quantity), { size: 8.5 });
    text(cols.unit + 2, y, item.unitCode === "NIU" ? "UND" : "SERV", { size: 8.5 });
    rows.forEach((row, index) => text(cols.desc + 4, y - index * 10.5, row, { size: 8.5 }));
    text(cols.vu + 54, y, money(item.unitValue), { size: 8.5, align: "right" });
    text(cols.pu + 46, y, money(item.unitPrice), { size: 8.5, align: "right" });
    text(cols.total - 6, y, money(item.total), { size: 8.5, bold: true, align: "right" });
    y -= 10.5 * rows.length + 6;
    line(40, y + 4, 555, y + 4);
  }
  // Totales
  y -= 8;
  const totals = [["OP. GRAVADA", document.subtotal], [`IGV ${document.taxRate} %`, document.tax], ["IMPORTE TOTAL", document.total]];
  totals.forEach(([title, amount], index) => { const last = index === totals.length - 1; if (last) rect(372, y - 5, 183, 18, { fill: PAPER }); text(380, y, title, { size: last ? 9.5 : 8.5, bold: last }); text(549, y, `S/ ${money(amount)}`, { size: last ? 10 : 8.5, bold: last, align: "right" }); y -= 16; });
  y -= 4;
  text(40, y, `SON: ${document.amountInWords}`, { size: 9, bold: true });
  y -= 22;
  // QR + hash
  const qr = QRCode.create(document.qrText || document.fullNumber, { errorCorrectionLevel: "Q" });
  const size = qr.modules.size, box = 92, cell = box / size, qx = 40, qy = Math.max(60, y - box);
  const cells = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (qr.modules.get(r, c)) cells.push(`${(qx + c * cell).toFixed(2)} ${(qy + box - (r + 1) * cell).toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re`);
  ops.push(`0 0 0 rg ${cells.join(" ")} f`);
  const tx = 146;
  text(tx, qy + box - 10, `Representación impresa de la ${TYPE_LABEL[document.type]}`, { size: 9, bold: true });
  text(tx, qy + box - 24, `Código hash: ${document.hash}`, { size: 8, fill: MUTED });
  text(tx, qy + box - 37, `Estado SUNAT: ${document.status}${document.sunatCode ? ` (código ${document.sunatCode})` : ""}`, { size: 8, fill: MUTED });
  wrap(demo ? "DEMOSTRACIÓN: documento generado por el sistema de prueba. No fue enviado a SUNAT y no tiene valor tributario." : "Consulte la validez de este comprobante en www.sunat.gob.pe con el RUC del emisor, la serie, el número y el importe.", 8, 400).forEach((row, index) => text(tx, qy + box - 52 - index * 10, row, { size: 8, fill: demo ? color(176, 58, 46) : MUTED, bold: demo }));
  line(40, 46, 555, 46, LINE, 0.6);
  text(297.5, 34, `${issuer.commercialName} · Gracias por su preferencia`, { size: 8, fill: MUTED, align: "center" });

  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfString(`${TYPE_LABEL[document.type]} ${document.fullNumber}`)} /Author ${pdfString(issuer.legalName)} /Producer (Park Plaza ERP) >>`
  ];
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body, "latin1")); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/* Documentos emitidos antes de 2026-10-12 (formato antiguo, sin emisor ni hash): se completan al vuelo. */
function upgradeLegacy(document) {
  if (document.issuer && document.hash) return document;
  const copy = JSON.parse(JSON.stringify(document));
  copy.issuer ||= billingIssuer(null);
  copy.taxRate ??= 18;
  copy.recipient = { ...copy.recipient, documentTypeCode: copy.recipient?.documentTypeCode || ID_TYPES[copy.recipient?.documentType] || "1", name: String(copy.recipient?.name || "").toUpperCase() };
  copy.lines = (copy.lines || []).map((line, index) => ({ index: index + 1, code: line.code, description: line.description, quantity: line.quantity || 1, unitCode: line.unitCode === "NIU" ? "ZZ" : line.unitCode || "ZZ", unitPrice: Number(line.total), unitValue: Number(line.unitValue), valueTotal: Number(line.unitValue), igv: Number(line.igv), total: Number(line.total), taxAffectation: "10" }));
  copy.amountInWords ||= amountInWords(copy.total);
  copy.paymentTerms ||= "Contado";
  return finalize(null, copy);
}

export function electronicDocumentArtifact(stored, kind) {
  const document = upgradeLegacy(stored);
  const base = fileBase(document);
  if (kind === "xml") return { contentType: "application/xml; charset=utf-8", filename: `${base}.xml`, body: Buffer.from(documentXml(document)) };
  if (kind === "cdr") {
    if (!["ACEPTADO", "RECHAZADO", "ANULADO"].includes(document.status)) throw fail(404, "SUNAT todavía no devolvió la constancia (CDR) de este comprobante");
    return { contentType: "application/zip", filename: `R-${base}.zip`, body: zipSingle(`R-${base}.xml`, cdrXml(document)) };
  }
  if (kind === "pdf") return { contentType: "application/pdf", filename: `${base}.pdf`, body: buildPdf(document) };
  throw fail(404, "Archivo fiscal no reconocido");
}

/* Para la vista previa en pantalla: el comprobante con su QR listo para mostrarse como imagen. */
export async function electronicDocumentView(stored) {
  const document = upgradeLegacy(stored);
  const qrDataUrl = await QRCode.toDataURL(document.qrText || document.fullNumber, { errorCorrectionLevel: "Q", margin: 1, width: 220 });
  return { ...document, typeLabel: TYPE_LABEL[document.type], recipientDocumentLabel: ID_LABEL[document.recipient?.documentType] || document.recipient?.documentType, qrDataUrl, issuedDisplay: `${limaParts(document.issuedAt).display} ${limaParts(document.issuedAt).time.slice(0, 5)}`, files: { xml: `${fileBase(document)}.xml`, cdr: `R-${fileBase(document)}.zip`, pdf: `${fileBase(document)}.pdf` } };
}
