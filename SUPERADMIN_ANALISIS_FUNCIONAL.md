# Análisis funcional — Experiencia cliente, operación interna y Superadmin V6

## 1. Experiencia completa del cliente

El cliente dispone de un recorrido único para cuatro servicios: Hospedaje, Piscina, Mirador y Eventos.

1. Se registra con documento o Google y obtiene una identidad persistente.
2. Consulta catálogo, precios, planes, extras, habitaciones, horarios, cupos y ambientes disponibles.
3. Configura el servicio, acompañantes, cochera, preórdenes, alimentos, bebidas y observaciones.
4. Registra pago completo, adelanto o pago pendiente en Caja del hotel.
5. Consulta reservas, saldos, pases, vigencia y estado de acceso.
6. Después de validar el ingreso puede realizar pedidos a Restaurante o Bar.
7. Puede solicitar ayuda por limpieza, mantenimiento o atención general.
8. Consulta el progreso de pedidos y solicitudes desde su experiencia.

### Servicios

- **Hospedaje:** habitación, fechas, huéspedes, extras, cochera, pago, check-in, consumos y check-out.
- **Piscina:** fecha, horario, aforo real, tipo de pase, personas, extras, cochera y acceso.
- **Mirador:** fecha, horario, grupo, plan, consumo anticipado, detalles y cochera.
- **Eventos:** fecha, ambiente, aforo, montaje, temática, comida, bebidas, equipamiento, complementos, cochera y adelanto.

## 2. Responsabilidades internas

### Superadmin

Es el propietario del sistema. Visualiza y, progresivamente, administrará todos los dominios: clientes, recepción, servicios, dinero, pedidos, inventario, personal, auditoría y configuración.

### Administrador / jefe de recepción

Es el controlador de la operación interna diaria. Su prioridad es:

- reservas, llegadas, salidas y clientes;
- pagos en recepción y caja;
- validación de accesos;
- coordinación de pedidos de Restaurante y Bar;
- seguimiento de avisos de Limpieza y Mantenimiento;
- coordinación de Hospedaje, Piscina, Mirador, Eventos y Cochera.

No administra la arquitectura global, permisos, integridad, precios maestros ni gobierno del sistema; esas funciones pertenecen al Superadmin.

### Restaurante

Conserva su estación propia porque debe aceptar o rechazar pedidos, informar tiempo, pasar por preparación, listo y entregado, y registrar consumo teórico de recetas.

### Bartender

Conserva su estación propia por el mismo motivo, con control adicional de recetas líquidas, mililitros, botellas, porciones y mermas.

### Limpieza y Mantenimiento

No tienen una aplicación independiente en el diseño objetivo. Se modelan como tareas y alertas:

- el cliente, Recepción o una salida genera el aviso;
- Administración/Recepción asigna y sigue el trabajo;
- el responsable ejecuta físicamente la tarea;
- se registran estado, evidencia y resolución desde el control operativo.

## 3. Conexión actual del Superadmin V6

| Vista V6 | Fuente real | Estado |
|---|---|---|
| Dashboard | habitaciones, pagos, pedidos, eventos, solicitudes | Lectura conectada |
| Habitaciones | PostgreSQL `rooms` | Lectura conectada |
| Reservas | reservas y reservas públicas de Hospedaje | Lectura conectada |
| Contratos | derivados de reservas del ERP | Lectura conectada; documento legal pendiente |
| Check-in/out | reservas, estadías, cuentas y pagos | Lectura conectada; acciones V6 pendientes |
| Pagos y cuentas | pagos, reservas y estadías | Lectura conectada |
| Clientes | identidades creadas en experiencia cliente | Lectura conectada |
| Limpieza | tareas generadas por salida o solicitud | Lectura conectada |
| Mantenimiento e incidencias | solicitudes de clientes y reportes internos | Lectura conectada |
| Evidencias | evidencias asociadas a tareas y reportes | Lectura conectada |
| Notificaciones | derivadas de pedidos y solicitudes abiertas | Lectura conectada |
| Pedidos de clientes | pedidos de Restaurante y Bar | Lectura conectada |
| Piscina y Mirador | derechos de acceso y movimientos | Lectura conectada |
| Eventos y calendario | eventos registrados por el cliente/ERP | Lectura conectada |
| Personal, inventario, caja, roles y configuración | estructura V6 | Pendiente de adaptador completo de escritura |

La sincronización del V6 consulta la API cada 15 segundos y también al volver a la pestaña. Las acciones que modifican datos desde las pantallas V6 todavía no deben considerarse persistentes hasta implementar sus contratos `POST`, `PUT` y `PATCH`.

## 4. Decisiones eliminadas

- QR independiente de Bar.
- QR independiente de Terraza/Restaurante.
- sistema biométrico para empleados.
- sistema independiente de Limpieza.
- sistema independiente de Mantenimiento.
- módulo de Mascotas.

El cliente puede pedir desde cualquier servicio pagado y con ingreso validado. El pedido conserva el destino real —habitación, piscina, mirador o evento— sin depender de una mesa con QR.

## 5. Siguientes mejoras prioritarias

1. Conectar las acciones V6 de reservas, check-in/out, pagos, accesos y solicitudes a la API real.
2. Unificar pagos digitales demostrativos con Culqi y comprobantes electrónicos cuando se definan credenciales.
3. Convertir Limpieza y Mantenimiento en una bandeja única de tareas con asignación, evidencia y SLA.
4. Completar el descuento de inventario por receta al entregar pedidos y el cierre teórico contra físico.
5. Adaptar las operaciones V6 de personal, caja, proveedores, inventario y gobierno sin conservar datos simulados.
6. Implementar pruebas integrales: cliente paga → acceso validado → pedido → entrega → inventario/caja → auditoría.

## 6. Criterio de avance

Una vista se considera conectada completamente solo cuando cumple los cuatro puntos:

- lee PostgreSQL;
- escribe mediante la API;
- emite actualización en tiempo real;
- la operación aparece en auditoría.

Actualmente las vistas relacionadas con la experiencia cliente cumplen la lectura centralizada y reciben los cambios hechos desde cliente/ERP. La escritura directa desde el nuevo V6 será la siguiente fase.
