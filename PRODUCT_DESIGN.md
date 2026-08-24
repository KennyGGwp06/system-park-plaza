# Diseño funcional — Hotel Park Plaza

## Objetivo

Construir un demo funcional compuesto por dos aplicaciones React: una experiencia
móvil para clientes y un ERP para empleados. Ambas comparten una API Express y una
base PostgreSQL, y se ejecutan con Docker Desktop.

## Usuarios

- Cliente remoto, cliente que escanea el QR exterior y cliente asistido por recepción.
- Visitante externo de piscina, mirador o eventos.
- Recepción, cocina, bartender, trabajador con asignación temporal y administrador.

## Recorrido del cliente

1. Identificación por DNI, CE o pasaporte, evitando duplicados.
2. Elección de hospedaje, piscina, mirador o eventos.
3. Configuración de fecha, horario, personas, habitación, extras y cochera.
4. Resumen vivo y pago completo o adelanto del 50%.
5. Creación de un único pase QR por cliente.
6. El pase contiene permisos independientes por servicio.
7. Hospedaje al 50% queda pendiente; al 100% habilita check-in, restaurante y bar.
8. Piscina y mirador pagados pueden estar activos aunque hospedaje siga pendiente.
9. Durante la estadía se permiten pedidos y solicitudes operativas.

## Pase y control de acceso

- Un solo QR firmado por cliente; no contiene información personal.
- Cada permiso guarda servicio, fecha, horario, cantidad de personas, vigencia y usos.
- Piscina y mirador permiten un ingreso grupal por reserva.
- Al validar se registra trabajador, hora y número de personas.
- Un segundo intento se bloquea; solo administración puede corregir con auditoría.

## Pedidos e inventario

- Restaurante y bartender reciben pedidos en tiempo real.
- Estados: RECIBIDO, ACEPTADO, PREPARANDO, LISTO, ENTREGADO y CANCELADO.
- El cliente ve el tiempo estimado y cada cambio.
- Cada producto del menú tiene receta, ingredientes y cantidades.
- Al aceptar se reservan insumos; al entregar se confirma consumo.
- Al cancelar se devuelve la reserva de inventario.

## Empleados, tareas y asistencia

- Todos los usuarios internos pertenecen al directorio de empleados.
- Cada uno tiene cargo base y asignaciones temporales.
- Estados de asistencia: FUERA_DE_TURNO, EN_TURNO, EN_DESCANSO y SALIDA_REGISTRADA.
- Tareas: ASIGNADA, ACEPTADA, EN_PROCESO, FINALIZADA o INCIDENCIA.
- Limpieza registra entrada/salida de zona, checklist, evidencias e incidencias.
- Administración ve empleados activos, retrasos, ausencias y servicios sin cobertura.

## Horarios rotativos y pago

- Calendario semanal por empleado, área y horario.
- Prevención de superposición y alerta de servicio sin responsable.
- Estados: PROGRAMADO, CONFIRMADO, ASISTIDO, TARDANZA, FALTA o REEMPLAZADO.
- Tarifa diaria configurable.
- Día pagable con ingreso y salida válidos, o ajuste autorizado.
- Resumen semanal de programados, asistidos, faltas, pagables y total.

## Requisitos del demo

- JavaScript, React, Express, PostgreSQL y Docker; no se cambia el lenguaje.
- Hasta 30 usuarios simultáneos.
- Pagos simulados, pero saldos, movimientos y estados persistentes.
- Datos demo reproducibles.
- Auditoría de pagos, QR, inventario, asistencia y cambios administrativos.
- Correcciones administrativas requieren motivo.
- Operación local; publicación remota futura requerirá HTTPS y dominio.

## Decisiones

1. **Dos aplicaciones y datos compartidos.** Se eligió separar la experiencia del
   cliente del ERP para preservar claridad y seguridad, manteniendo una API común.
2. **Un pase con permisos múltiples.** Evita QR duplicados y permite activar cada
   servicio según su propio pago y vigencia.
3. **Ingreso grupal consumible.** Controla aforo y evita compartir accesos.
4. **Cargo base más asignación temporal.** Soporta horarios rotativos sin cambiar
   roles permanentemente.
5. **Inventario basado en recetas.** Controla merma y necesidades de compra.
6. **Pago semanal por día pagable.** Refleja la forma real de remuneración indicada.
7. **Pago externo simulado.** El demo tendrá flujo íntegro sin procesar dinero real.

## Referencias de producto

- Hilton: selección de habitación, check-in y pase digital.
- Marriott: solicitudes y pedidos móviles durante la estadía.
- Toast KDS: recetas e instrucciones visibles en el punto de preparación.
