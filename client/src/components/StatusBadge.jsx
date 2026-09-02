const styles = {
  LIBRE: "bg-park-green-soft text-park-green",
  OCUPADA: "bg-park-danger-soft text-park-danger",
  RESERVADA: "bg-park-gold-soft text-park-black",
  EN_LIMPIEZA: "bg-park-green-soft text-park-dark",
  EN_ATENCION: "bg-blue-50 text-blue-700",
  EN_REPARACION: "bg-blue-50 text-blue-700",
  SOLUCIONADO: "bg-park-green-soft text-park-green",
  MANTENIMIENTO: "bg-slate-100 text-slate-700",
  FUERA_SERVICIO: "bg-park-danger-soft text-park-danger",
  CONFIRMADA: "bg-park-green-soft text-park-green",
  PENDIENTE: "bg-park-gold-soft text-park-black",
  PENDIENTE_PAGO: "bg-park-gold-soft text-park-black",
  EN_COCINA: "bg-park-green-soft text-park-dark",
  PREPARANDO: "bg-park-green-soft text-park-dark",
  LISTO: "bg-park-green-soft text-park-green",
  ENTREGADO: "bg-park-green-soft text-park-green",
  CANCELADO: "bg-park-danger-soft text-park-danger",
  CANCELADA: "bg-park-danger-soft text-park-danger",
  FINALIZADA: "bg-park-green-soft text-park-green",
  FINALIZADO: "bg-park-green-soft text-park-green",
  RESERVADO: "bg-park-gold-soft text-park-black",
  CONFIRMADO: "bg-park-green-soft text-park-green",
  COTIZACION: "bg-park-gold-soft text-park-black",
  OK: "bg-park-green-soft text-park-green",
  STOCK_BAJO: "bg-park-gold-soft text-park-black",
  SIN_STOCK: "bg-park-danger-soft text-park-danger",
  ENTRADA: "bg-park-green-soft text-park-green",
  SALIDA: "bg-park-danger-soft text-park-danger",
  AJUSTE: "bg-park-green-soft text-park-dark",
  BAJA: "bg-slate-100 text-slate-700",
  MEDIA: "bg-park-green-soft text-park-dark",
  ALTA: "bg-park-gold-soft text-park-black",
  CRITICA: "bg-park-danger-soft text-park-danger",
  ABIERTO: "bg-park-danger-soft text-park-danger",
  EN_REVISION: "bg-park-gold-soft text-park-black",
  RESUELTO: "bg-park-green-soft text-park-green",
  CHECKED_IN: "bg-park-green-soft text-park-green",
  COMPLETADA: "bg-park-green-soft text-park-green",
  NO_SHOW: "bg-park-danger-soft text-park-danger",
  ACTIVO: "bg-park-green-soft text-park-green",
  SUSPENDIDO: "bg-park-gold-soft text-park-black",
  INACTIVO: "bg-slate-100 text-slate-700",
  SIN_SERVICIOS: "bg-slate-100 text-slate-700",
  HOSPEDADO: "bg-park-green-soft text-park-green"
  ,APPROVED: "bg-park-gold-soft text-park-black"
  ,PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800"
  ,RECEIVED: "bg-park-green-soft text-park-green"
  ,DRAFT: "bg-slate-100 text-slate-700"
  ,VERIFIED: "bg-blue-100 text-blue-700"
  ,POSTED: "bg-park-green-soft text-park-green"
  ,REJECTED: "bg-park-danger-soft text-park-danger"
  ,SENT: "bg-blue-100 text-blue-700"
  ,RECEIVED_WITH_DIFFERENCE: "bg-amber-100 text-amber-800"
  ,CANCELLED: "bg-slate-100 text-slate-700"
  ,REQUESTED: "bg-park-gold-soft text-park-black"
  ,OPEN: "bg-park-green-soft text-park-green"
  ,OPERATING: "bg-park-green-soft text-park-green"
  ,COUNTING: "bg-park-gold-soft text-park-black"
  ,REOPENED: "bg-blue-100 text-blue-700"
  ,SUBMITTED: "bg-blue-100 text-blue-700"
  ,OBSERVED: "bg-park-danger-soft text-park-danger"
  ,CLOSED: "bg-slate-100 text-slate-700"
  ,ACTIVE: "bg-park-green-soft text-park-green"
  ,ARCHIVED: "bg-slate-100 text-slate-700"
  ,ACEPTADO: "bg-park-green-soft text-park-green"
  ,PENDIENTE_REINTENTO: "bg-park-gold-soft text-park-black"
  ,RECHAZADO: "bg-park-danger-soft text-park-danger"
  ,ENVIANDO: "bg-blue-100 text-blue-700"
};

const labels = {
    PENDIENTE_PAGO: "Falta completar pago",
    PENDIENTE: "Requiere atención",
    EN_COCINA: "En cocina",
    PREPARANDO: "En preparación",
    LISTO: "Listo para entregar",
    ENTREGADO: "Entregado",
    EN_LIMPIEZA: "En limpieza",
    EN_ATENCION: "En atención",
    EN_REPARACION: "En reparación",
    SOLUCIONADO: "Solucionado",
    EN_REVISION: "En revisión",
    COTIZACION: "Cotización solicitada",
    CHECKED_IN: "Huésped ingresó",
    NO_SHOW: "No se presentó",
    SIN_SERVICIOS: "Sin servicios activos"
    ,APPROVED: "Pendiente de recepción"
    ,PARTIALLY_RECEIVED: "Recepción parcial"
    ,RECEIVED: "Recibida completa"
    ,DRAFT: "Borrador"
    ,VERIFIED: "Verificada"
    ,POSTED: "Ingresada a almacén"
    ,REJECTED: "Rechazada"
    ,SENT: "Enviada / en tránsito"
    ,RECEIVED_WITH_DIFFERENCE: "Recibida con diferencia"
    ,CANCELLED: "Cancelada"
    ,REQUESTED: "Esperando aprobación"
    ,OPEN: "Turno abierto"
    ,OPERATING: "Turno operativo"
    ,COUNTING: "Conteo físico"
    ,REOPENED: "Reabierto para corregir"
    ,SUBMITTED: "Enviado para revisión"
    ,OBSERVED: "Devuelto con observaciones"
    ,CLOSED: "Cerrado"
    ,ACTIVE: "Activo"
    ,ARCHIVED: "Archivado"
    ,ACEPTADO: "Aceptado"
    ,PENDIENTE_REINTENTO: "Pendiente de reintento"
    ,RECHAZADO: "Rechazado"
    ,ENVIANDO: "Enviando"
  };

export function statusLabel(value) {
  if (labels[value]) return labels[value];
  const readable = String(value || "").replaceAll("_", " ").trim().toLocaleLowerCase("es-PE");
  return readable ? readable.charAt(0).toLocaleUpperCase("es-PE") + readable.slice(1) : "Sin estado";
}

export function StatusBadge({ value }) {
  return (
    <span title={`Estado: ${statusLabel(value)}`} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[value] || "bg-slate-100 text-slate-700"}`}>
      {statusLabel(value)}
    </span>
  );
}


