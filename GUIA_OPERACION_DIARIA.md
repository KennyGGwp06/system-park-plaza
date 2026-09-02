# Operación diaria del sistema interno — Hotel Park Plaza

Esta guía describe el recorrido que se debe demostrar desde un sistema en **día cero**. Los valores operativos comienzan en cero; los catálogos no se eliminan: trabajadores, roles, habitaciones, servicios, precios, carta, recetas, productos, almacenes y stock base permanecen configurados.

## 1. Preparación de día cero

1. Crear una copia de seguridad de PostgreSQL antes de limpiar.
2. Ejecutar `npm run clean:operational-demo --workspace server` una sola vez.
3. Reiniciar backend y comprobar `npm run verify:operational-day-zero --workspace server`.
4. Confirmar en Superadmin: ingresos, ocupación, reservas, huéspedes, incidencias, personal activo, pedidos demorados y estacionamientos ocupados en cero.
5. `Habitaciones disponibles` y cantidades de catálogo/stock no deben estar en cero: representan capacidad instalada, no movimientos del día.

## 2. Superadmin — apertura del día

1. Inicia sesión como dueño; no marca asistencia porque no es trabajador de turno.
2. Revisa el Centro Superadmin, integridad de datos, habitaciones libres, caja sin movimientos e incidencias vacías.
3. Verifica o crea trabajadores con DNI de 8 dígitos, PIN de 4 dígitos, rol, estado y tarifa diaria.
4. Programa los turnos de Recepción, Restaurante, Bar, Limpieza y Mantenimiento. Si no los programa, el sistema crea un turno al marcar asistencia, pero para operación real se recomienda programarlos.
5. Verifica stock central, recetas activas, precios de carta y disponibilidad de almacenes de Restaurante y Bar.
6. Mantiene abiertos los monitores de recepción, pedidos, limpieza, mantenimiento, caja e inventario. Los cambios llegan por Socket.IO y cuentan con sondeo de respaldo; no se requiere F5.

## 3. Admin de Recepción

### Inicio

1. Inicia sesión con su cuenta.
2. Marca ingreso con su propio DNI y PIN.
3. Abre su caja con el fondo físico inicial.
4. Revisa llegadas, habitaciones, pagos pendientes, accesos e incidencias.

### Durante el día

1. Registra clientes o reservas presenciales y cobra adelanto o pago completo.
2. Solo registra efectivo si tiene caja abierta; los pagos quedan ligados a su sesión.
3. Realiza check-in, valida accesos y supervisa pedidos.
4. En el check-out cobra el saldo, cierra la estadía y genera la tarea de limpieza.
5. Acepta y asigna solicitudes de limpieza o mantenimiento únicamente a trabajadores con asistencia activa.

### Cierre

1. Termina operaciones pendientes y cuenta el efectivo físico.
2. Envía la caja a revisión del Superadmin.
3. Marca salida con DNI y PIN. El sistema impide salir mientras su caja siga abierta.

## 4. Restaurante y Bartender

### Inicio

1. Inician sesión en su estación y marcan ingreso con DNI y PIN.
2. La asistencia crea automáticamente una sesión de inventario del área en estado pendiente.
3. El Superadmin confirma la apertura y las cantidades iniciales del inventario.
4. Sin asistencia activa, las URLs internas redirigen al panel y la API bloquea pedidos, transferencias, solicitudes, producción, mermas y botellas.

### Durante el día

1. Reciben pedidos en tiempo real.
2. Restaurante: pendiente → cocina/preparación → listo → entregado.
3. Bartender: pendiente → preparación → listo → entregado; además controla apertura, servicio, medición y cierre de botellas.
4. El inventario reserva y descuenta insumos según recetas. Las faltas se solicitan al Superadmin y las transferencias se reciben desde la estación activa.
5. Toda merma requiere cantidad y motivo; las diferencias quedan auditadas.

### Cierre

1. Dejan de aceptar producción, inician conteo físico y explican diferencias fuera de tolerancia.
2. Envían la rendición de inventario a revisión.
3. Marcan salida con DNI y PIN. El sistema bloquea la salida si el inventario sigue abierto, operando o en conteo.
4. El Superadmin observa, reabre si corresponde o aprueba el cierre.

## 5. Limpieza

### Inicio

1. Inicia sesión en Operaciones y marca ingreso con DNI y PIN.
2. Ve en tiempo real tareas asignadas o disponibles por prioridad.

### Durante el día

1. Inicia una tarea aceptada por Recepción.
2. Registra evidencia de entrada y salida de cuarto, baño y refrigerador/despensa.
3. Reporta daños que deban escalar a Mantenimiento.
4. Finaliza la tarea; en limpieza posterior a check-out la habitación vuelve a libre.

### Cierre

1. Verifica que no dejó una tarea iniciada sin evidencia o explicación.
2. Marca salida con DNI y PIN. La planilla considera el día solamente cuando existen ingreso y salida.

## 6. Mantenimiento

### Inicio

1. Inicia sesión en Operaciones y marca ingreso con DNI y PIN.
2. Revisa trabajos asignados y prioridades.

### Durante el día

1. Inicia una incidencia aceptada por Recepción.
2. Registra evidencia anterior, diagnóstico y evidencia posterior.
3. Finaliza la reparación y deja trazabilidad para Recepción y Superadmin.

### Cierre

1. Confirma que los trabajos iniciados estén resueltos o documentados como pendientes.
2. Marca salida con DNI y PIN.

## 7. Superadmin — cierre del día

1. Confirma que ningún trabajador permanezca en turno por error.
2. Revisa y aprueba o rechaza la rendición de caja de Recepción.
3. Revisa y cierra los inventarios enviados por Restaurante y Bar.
4. Comprueba pedidos pendientes/demorados, habitaciones en limpieza, incidencias abiertas, diferencias de inventario y pagos pendientes.
5. Realiza el cierre diario definitivo de caja con efectivo contado y observación.
6. Revisa auditoría y planilla: cada acción sensible debe identificar usuario, fecha y operación.

## 8. Tiempo real y seguridad que deben probarse

- Abrir Superadmin y otra estación en navegadores distintos. Crear o cambiar una operación y comprobar que la otra pantalla se actualice sin F5.
- Desconectar temporalmente Socket.IO: el sondeo de respaldo converge en 2–15 segundos según la pantalla.
- Intentar operar sin marcar asistencia: la API debe responder `409`.
- Intentar usar el DNI/PIN de otro trabajador desde una sesión ajena: debe responder `401`.
- Intentar acceder con un rol distinto: debe responder `403` y registrar auditoría de seguridad.
- En producción se deben configurar secretos fuertes, HTTPS, orígenes CORS exactos, credenciales SUNAT/proveedor de pago y copias de seguridad automáticas.

## 9. Integración futura de Experiencia del Cliente

Antes de unir la reestructuración del compañero: crear una rama de integración, comparar contratos de API y rutas, ejecutar los recorridos de esta guía, resolver conflictos sin reemplazar los controles internos y repetir las pruebas de tiempo real, roles, caja, inventario y asistencia.
