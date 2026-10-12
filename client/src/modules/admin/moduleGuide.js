// Guía de cada módulo del Superadmin: qué resuelve, quién lo usa y qué se hace en cada submódulo.
// Las cifras en vivo vienen de GET /api/superadmin/modules-overview (clave "módulo:vista"); aquí solo va el texto fijo.
export const MODULE_GUIDE = {
  clientes: {
    goal: "Que cada persona exista una sola vez y que veas todo lo que hizo en Park Plaza.",
    who: "Superadmin y Recepción (lectura).",
    flow: ["Se registra por la app o en Recepción", "Reserva y paga", "Ingresa con su QR", "Consume y deja historial"],
    subs: {
      directorio: { does: ["Buscar por nombre, DNI o teléfono", "Ver quién está dentro ahora y quién debe saldo", "Segmentar: nuevos, recurrentes, VIP", "Exportar la base"], go: "Abrir el directorio" },
      perfil: { does: ["Ver identidad, reservas, pagos y consumos de una persona", "Detectar duplicados y fichas incompletas", "Ver su libro de consumo por servicio"], go: "Abrir un perfil" }
    }
  },
  reservas: {
    goal: "Controlar la venta programada de los 5 servicios con su propio flujo cada uno.",
    who: "Superadmin y Admin de Recepción.",
    flow: ["Cliente reserva", "Paga (o queda por verificar)", "Recepción confirma", "Llega y usa", "Cierra la cuenta"],
    subs: {
      general: { does: ["Ver todas las reservas juntas y filtrar por servicio, estado o fecha", "Aprobar pagos Yape/Plin verificados", "Cobrar saldos y cancelar con motivo"], go: "Ver todas las reservas" },
      hospedaje: { does: ["Ver habitaciones, llegadas, estadías y salidas", "Asignar habitación y liberar al salir", "Seguir el ciclo de limpieza del cuarto"], go: "Abrir Hospedaje" },
      piscina: { does: ["Ver turnos y aforo por horario", "Validar ingresos y acompañantes", "Ver cuántos siguen dentro"], go: "Abrir Piscina" },
      mirador: { does: ["Ver horarios, mesas y experiencias vendidas", "Verificar pagos Yape/Plin", "Consumo por reserva"], go: "Abrir Mirador" },
      terraza: { does: ["Reservas de mesa sin costo por zona", "Consumo asociado a cada mesa", "Aforo por horario"], go: "Abrir Terraza" },
      eventos: { does: ["Cotizaciones, anticipos y saldos", "Espacios, invitados, catering y equipo", "Cronograma y cierre del evento"], go: "Abrir Eventos" }
    }
  },
  admision: {
    goal: "Que nadie ingrese sin identidad, pago, horario y servicio autorizados.",
    who: "Recepción y Superadmin.",
    flow: ["Cliente muestra su QR", "El sistema valida pago y horario", "Se registra el ingreso", "Se cuenta el aforo"],
    subs: {
      accesos: { does: ["Ver cada ingreso validado con su pase", "Personas por servicio y por hora", "Revisar un código de pase"], go: "Ver accesos" },
      aforo: { does: ["Ver personas dentro de cada servicio en vivo", "Comparar con la capacidad", "Ver la afluencia por hora"], go: "Ver el aforo" }
    }
  },
  catalogo: {
    goal: "Definir exactamente lo que el cliente ve, reserva y paga.",
    who: "Solo el Superadmin.",
    flow: ["Configuras precios y cupos", "Habilitas platos y fotos", "Se publica en la app del cliente"],
    subs: {
      servicios: { does: ["Editar nombre, descripción, precio y cupo de cada servicio", "Cambiar tarifas de cochera, planes y extras", "Cada cambio queda auditado (antes → después)"], go: "Editar tarifas" },
      habitaciones: { does: ["Ver y editar tipos, precios y capacidad", "Cambiar el estado de cada habitación", "Subir fotos por tipo"], go: "Ver habitaciones" },
      carta: { does: ["Activar o pausar platos y bebidas para el cliente", "Ver cuáles no se pueden vender por falta de receta o insumo", "Asignar a qué servicios se ofrece"], go: "Abrir la carta" },
      contenido: { does: ["Cambiar portadas, títulos y descripciones", "Subir imágenes de cada experiencia"], go: "Editar contenido" }
    }
  },
  restaurante: {
    goal: "Saber qué se cocina, cuánto cuesta y si el inventario cuadra.",
    who: "Superadmin (supervisa) y personal de cocina (opera).",
    flow: ["Pedido entra", "Cocina prepara", "Se entrega", "Se descuentan los insumos", "Se cierra el turno"],
    subs: {
      pedidos: { does: ["Ver pedidos por estado y tiempo", "Detectar retrasos", "Ver quién aceptó, preparó y entregó"], go: "Supervisar pedidos" },
      recetas: { does: ["Crear y versionar recetas con cantidades y merma", "Ver costo por porción y margen", "Activar una versión nueva"], go: "Abrir recetas" },
      preparacion: { does: ["Ver lo que la cocina limpió, preparó y porcionó", "Rendimiento y merma de cada operación", "Trazabilidad de cada lote"], go: "Ver preparaciones" },
      cierres: { does: ["Aprobar u observar cierres de turno", "Comparar consumo teórico con el conteo físico", "Reabrir un cierre con motivo"], go: "Revisar cierres" }
    }
  },
  bar: {
    goal: "Controlar bebidas, botellas y diferencias de barra.",
    who: "Superadmin y Bartender.",
    flow: ["Pedido de bebida", "Barra prepara", "Se descuenta por receta y por botella", "Cierre de turno"],
    subs: {
      pedidos: { does: ["Ver pedidos de barra en vivo", "Tiempos de preparación"], go: "Supervisar la barra" },
      recetas: { does: ["Recetas de coctelería con costo y margen", "Versiones vigentes"], go: "Abrir recetas de bar" },
      botellas: { does: ["Ver cada botella abierta y cerrada", "Precisión de las dosis servidas", "Faltante en ml y en soles"], go: "Ver botellas" },
      cierres: { does: ["Aprobar u observar el cierre del bar", "Consumo teórico frente al conteo", "Reabrir un cierre con motivo"], go: "Revisar cierres" }
    }
  },
  insumos: {
    goal: "Que Restaurante y Bar no pidan más de lo que justifican sus ventas y que tú compres solo lo necesario.",
    who: "Superadmin decide; las áreas cuentan y solicitan.",
    flow: ["El área cierra a las 23:00 y solicita", "Se compara contra recetas × ventas", "Ves lo que falta y compras", "Distribuyes y ellos confirman"],
    subs: {
      existencias: { does: ["Ver stock por almacén y lote", "Alertas de mínimo y de vencimiento", "Valor del inventario"], go: "Ver existencias" },
      movimientos: { does: ["Kardex de toda entrada, salida y ajuste", "Origen, destino y responsable"], go: "Ver movimientos" },
      mermas: { does: ["Mermas, consumo interno y faltantes de cierre", "Costo de lo perdido por insumo, motivo y área"], go: "Ver mermas" },
      distribucion: { does: ["Enviar insumos del almacén a un área", "Recepción con conteo (quien despacha ≠ quien recibe)", "Diferencias en tránsito"], go: "Distribuir" },
      necesidades: { does: ["Ver lo que cada área necesita mañana", "Días de stock restantes", "Crear la orden de compra con lo que falta", "Configurar la hora de cierre"], go: "Ver necesidades" },
      foodcost: { does: ["Costo teórico vs real por cierre", "Insumos con mayor diferencia", "Food cost por plato"], go: "Ver food cost" },
      solicitudes: { does: ["Aprobar, ajustar o rechazar lo que piden las áreas", "Ver el exceso contra lo justificado"], go: "Revisar solicitudes" },
      lista: { does: ["Registrar la compra que ya llegó", "Pedidos a proveedor y recepción por lotes"], go: "Abrir compras" },
      proveedores: { does: ["Registrar y consultar proveedores", "Precios históricos"], go: "Ver proveedores" }
    }
  },
  dinero: {
    goal: "Conciliar cada sol: quién pagó, qué entró a caja y cuánto deja cada servicio.",
    who: "Solo el Superadmin (Recepción opera su caja).",
    flow: ["Cliente paga", "Entra a caja o se verifica", "Se factura", "Se cierra la caja", "Se calcula la utilidad"],
    subs: {
      pagos: { does: ["Ver cada pago ligado a reserva y cliente", "Método, referencia y estado"], go: "Ver pagos" },
      cajas: { does: ["Revisar arqueos y cierres de caja", "Diferencias entre declarado y registrado"], go: "Revisar cajas" },
      facturacion: { does: ["Emitir y consultar boletas y facturas", "Vincular con pagos confirmados"], go: "Abrir facturación" },
      gastos: { does: ["Registrar egresos por servicio y categoría", "Ver gastos sin servicio asignado"], go: "Abrir gastos" },
      devoluciones: { does: ["Aprobar y devolver dentro de 24 h del pago", "Plazo de 2 días hábiles", "Solo tú devuelves dinero"], go: "Resolver devoluciones" },
      rentabilidad: { does: ["Ventas, gastos y margen por servicio", "Incluye costo de recetas y planilla validada", "Comparar periodos"], go: "Ver rentabilidad" }
    }
  },
  equipo: {
    goal: "Saber quién trabajó, si fue puntual y cuánto se le paga.",
    who: "Solo el Superadmin.",
    flow: ["Marca entrada con DNI + PIN", "Trabaja (deja evidencia)", "Marca salida", "Se valida el día", "Se paga la semana"],
    subs: {
      torre: { does: ["Tablero del día por turno y área", "Tardanzas, faltas y huecos de cobertura", "Aprobar días sin evidencia y justificar tardanzas", "Alertas sin atender y relevos"], go: "Abrir la torre" },
      personal: { does: ["Ver el equipo y quién está en turno", "Planilla semanal con días validados y descuentos"], go: "Ver personal" },
      turnos: { does: ["Programar, mover o cancelar turnos", "Ver quién marcó entrada y salida"], go: "Programar turnos" }
    }
  },
  operaciones: {
    goal: "Habitaciones listas y fallas resueltas, con evidencia.",
    who: "Superadmin supervisa; Limpieza y Mantenimiento operan.",
    flow: ["Salida de huésped o reporte", "Se asigna al personal", "Trabaja con fotos", "Recepción aprueba"],
    subs: {
      limpieza: { does: ["Ver tareas, responsables y tiempos", "Fotos de entrada y salida por zona"], go: "Ver limpieza" },
      mantenimiento: { does: ["Ver incidencias, urgencia y responsable", "Fotos antes y después", "Tiempo de solución"], go: "Ver mantenimiento" }
    }
  },
  sistema: {
    goal: "Que el sistema sea seguro, trazable y esté configurado a tu manera.",
    who: "Solo el Superadmin.",
    flow: ["Defines reglas", "Cada usuario tiene su rol", "Toda acción sensible se registra"],
    subs: {
      configuracion: { does: ["Datos del hotel, moneda e impuestos", "Zona horaria y reglas generales"], go: "Abrir configuración" },
      usuarios: { does: ["Crear cuentas internas", "Restablecer accesos"], go: "Ver usuarios" },
      permisos: { does: ["Definir qué ve y hace cada rol"], go: "Ver roles" },
      auditoria: { does: ["Ver quién cambió qué y cuándo (antes → después)", "Verificar que la cadena no fue alterada"], go: "Abrir auditoría" },
      datos: { does: ["Detectar duplicados, huecos y datos raros", "Corregir antes de que afecten reportes"], go: "Revisar datos" }
    }
  }
};
