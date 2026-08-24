# RECEPTION AUDIT - ERP Hotel Park Plaza

Fecha: 2026-08-09

## Alcance Revisado

Se revisaron las rutas, componentes y endpoints relacionados con el rol `RECEPCIONISTA`:

- Frontend: `App.jsx`, `constants/menu.js`, `layouts/Sidebar.jsx`, `layouts/Navbar.jsx`.
- Vistas: `ReceptionPage`, `ClientsPage`, `ReservationsPage`, `RoomsPage`, `CheckInPage`, `CheckOutPage`, `AdminResourcePage`.
- Backend: `reception.service.js`, `reception.controller.js`, rutas `checkin` y `checkout`.
- Modelos Prisma relacionados: `Client`, `Room`, `Reservation`, `Stay`, `Consumption`, `Payment`, `CashMovement`, `CleaningTask`, `VehicleEntry`, `Event`.

## Lo Que Funciona Correctamente

- Autenticacion y permisos por rol ya protegen rutas y endpoints.
- `ReceptionPage` consume `/dashboard` y muestra metricas reales desde PostgreSQL.
- `CheckInPage` usa `/checkin/search` y `POST /checkin`.
- `CheckOutPage` usa `/checkout/stays` y `POST /checkout`.
- Backend de check-in crea `Stay`, actualiza `Reservation`, `Room` y `Client`.
- Backend de check-out valida saldo pendiente antes de finalizar.
- Backend de check-out registra pago, movimiento de caja, finaliza estadia, marca habitacion en limpieza y crea `CleaningTask`.
- Clientes, reservas, habitaciones, eventos, pagos, facturacion y cochera usan endpoints reales.
- El sidebar ya usa logo real y agrupacion por rol.

## Parcialmente Implementado

- Recepcion inicio funciona, pero no muestra proximas llegadas con accion directa; muestra tareas de limpieza.
- Clientes muestra datos reales, pero mantiene formulario de alta siempre visible.
- Reservas conecta cliente, habitacion, disponibilidad y adelanto, pero el formulario principal ocupa demasiado espacio.
- Habitaciones tiene cards conectadas, pero permite cambio manual de estado desde UI aunque puede contradecir estadias/reservas.
- Check-in funciona, pero es visualmente basico y no presenta KPIs ni estado de datos.
- Check-out funciona y protege saldo, pero no presenta detalle de cuenta con jerarquia clara.
- Consumos usa `/orders`; muestra codigo, area, estado y total, pero falta cliente/habitacion/estadia en la tabla.
- Cochera funciona como control basico de espacios y salidas; falta habitacion/contexto del huesped.
- Pagos son genericos; no priorizan busqueda por operacion o saldo pendiente.
- Facturacion lista comprobantes reales, pero faltan filtros/busqueda y acciones visuales.
- Eventos ya tiene calendario/lista basica y drawer, pero todavia puede pulirse para recepcion.

## Pantallas Muy Basicas o Redundantes

- `Nueva Operacion` (`/operaciones`) actualmente solo duplica accesos rapidos a reservas, check-in, check-out, pagos, habitaciones y clientes.
- No contiene funcionalidad unica. Recomendacion: mantener ruta por compatibilidad, pero mover su valor a acciones rapidas dentro de Recepcion.

## Componentes Duplicados o Inconsistentes

- Inputs y botones manuales en `CheckInPage`, `CheckOutPage` y partes de `ReservationsPage`.
- Cards con clases antiguas: `rounded-panel`, `shadow-soft`, `border-slate-200`.
- Limpieza conserva un `confirm()` nativo para finalizar tareas sin evidencia; Reservas y Eventos ya usan dialogo controlado.
- No existe `Drawer` reutilizable aun; hay drawers locales en otros modulos.

## Datos Hardcodeados

- No se detectaron datos principales hardcodeados en recepcion; las pantallas consumen API.
- Hay textos y labels estaticos normales de UI.
- Algunos resumentes se calculan en frontend desde respuestas API.

## Datos Desde PostgreSQL

- Dashboard: habitaciones, reservas, check-ins, check-outs, pagos, eventos, stock, reportes y limpieza.
- Clientes: `/clients`.
- Reservas: `/reservations`, `/rooms`, `/clients/search`.
- Habitaciones: `/rooms`.
- Check-in: `/checkin/search`.
- Check-out: `/checkout/stays`.
- Consumos: `/orders`.
- Cochera: `/cochera`.
- Pagos: `/pagos`.
- Facturacion: `/facturacion`.
- Eventos: `/events`.

## Cambios Recomendables

1. Reorganizar menu del rol `RECEPCIONISTA` en Inicio, Operacion, Servicios y Caja.
2. Redisenar `ReceptionPage` como centro operativo compacto: KPIs, acciones rapidas, proximas llegadas y resumen del dia.
3. Redisenar `CheckInPage` con header, buscador compacto, KPIs calculados y cards de llegada.
4. Redisenar `CheckOutPage` con KPIs, buscador, detalle de cuenta, pagos y acciones agrupadas.
5. Mover formulario permanente de Clientes a un drawer/modal.
6. Mover formulario permanente de Reservas a flujo/drawer en una fase posterior.
7. Evitar cambios manuales de estado de habitaciones para estados que dependan de estadia/reserva.
8. Mejorar tablas de Consumos, Pagos, Facturacion y Cochera con mas contexto.

## Cambios NO Necesarios Ahora

- No cambiar schema Prisma.
- No resetear ni recrear datos.
- No modificar la logica backend de check-in/check-out porque ya esta correctamente conectada.
- No crear integracion SUNAT.
- No implementar QR real si no existe token seguro.
- No reescribir `AppLayout`; el layout global ya permite acercarse al mockup con ajustes incrementales.

## Fase Aplicada en Esta Iteracion

Aplicado:

- Menu del rol recepcionista.
- `ReceptionPage`.
- `CheckInPage`.
- `CheckOutPage`.

Resultado:

- El menu del rol `RECEPCIONISTA` ahora queda agrupado como Inicio, Operacion, Servicios y Caja.
- Recepcion inicio conserva datos reales de `/dashboard` y agrega proximas llegadas desde `/reservations`.
- Check-in conserva `/checkin/search` y `POST /checkin`, pero ahora muestra KPIs, tabs y cards compactas.
- Check-out conserva `/checkout/stays` y `POST /checkout`, manteniendo la regla de no finalizar con saldo pendiente.

Se pospone para fases siguientes:

- Drawer de cliente reutilizable.
- Flujo guiado completo de nueva reserva.
- Refactor de Clientes, Consumos, Cochera, Pagos, Facturacion y Eventos.

## Fase 2 Aplicada

Aplicado:

- `ClientsPage` ahora prioriza busqueda, filtros y tabla; el alta de cliente se movio a drawer.
- `ClientsPage` agrega drawer de consulta rapida del cliente con reserva activa, contactos, eventos y accesos.
- `ReservationsPage` ahora muestra KPIs compactos, filtros por estado/fecha y buscador.
- El formulario de reserva dejo de estar permanente y se abre como drawer para crear/editar.

Pendiente:

- Evaluar si Limpieza debe reemplazar su `confirm()` nativo en una fase propia del modulo.
- Convertir nueva reserva en flujo guiado por pasos.
- Enlazar acciones del drawer de cliente a rutas con contexto cuando exista busqueda global.

## Fase 3 Aplicada

Aplicado:

- `RoomsPage` conserva cards, pero agrega contexto operativo por estado y acciones coherentes.
- Se retiro el cambio manual de estado desde la vista de recepcion para evitar contradicciones con reservas/estadias.
- `AdminResourcePage` mejora columnas de `Consumos`, `Cochera`, `Pagos` y `Facturacion`.
- Backend amplia includes existentes en ordenes, pagos y cochera para entregar cliente, habitacion y estadia sin crear endpoints nuevos.

Pendiente:

- Formulario de pagos orientado a busqueda por operacion/saldo.
- Busqueda y filtros especificos en facturacion.
- Acciones reales de descargar/enviar comprobante cuando exista integracion documental.
- Asociar vehiculo desde reserva/app cuando ese dato exista en el modelo.

## Fase 4 Aplicada

Aplicado:

- `AdminResourcePage` agrega busqueda compacta y filtros para `Consumos`, `Cochera`, `Pagos` y `Facturacion`.
- Los filtros usan los datos ya cargados desde PostgreSQL: cliente, documento, habitacion, codigo, concepto, estado o metodo.
- `EventsPage` agrega KPIs operativos: eventos hoy, proximos, pendientes y saldo pendiente.
- `EventsPage` permite alternar entre lista y calendario desde la misma vista, manteniendo `/eventos` y `/eventos/calendario`.
- El formulario de eventos se movio a drawer lateral para dejar la pantalla principal como panel operativo.

Pendiente:

- Evaluar si Limpieza debe reemplazar su `confirm()` nativo en una fase propia del modulo.
- Convertir pagos en un flujo orientado a busqueda de operacion con saldo pendiente.
- Definir acciones documentales reales para comprobantes cuando exista endpoint/archivo de descarga.

## Fase 5 Aplicada

Aplicado:

- `Pagos` ahora muestra pendientes por cobrar desde reservas, estadias activas y eventos con saldo.
- El formulario de pagos puede prellenarse desde una operacion real y enviar `clientId`, `reservationId`, `stayId` o `eventId` cuando corresponde.
- `Facturacion` ahora muestra pagos registrados sin comprobante y permite preparar la emision desde un pago real.
- `useFetch` acepta `enabled` para evitar cargar endpoints auxiliares cuando la pantalla no los necesita.

Pendiente:

- Implementar descarga/impresion real del comprobante cuando exista endpoint documental.
- Si se requiere facturacion electronica real, definir proveedor/API y credenciales antes de tocar backend.

## Fase 6 Aplicada

Aplicado:

- `Consumos` ahora permite avanzar pedidos con acciones reales usando `PATCH /orders/:id/status`.
- Las acciones respetan el flujo existente: restaurante pasa por cocina/listo/entregado y bar por preparacion/listo/entregado.
- `Limpieza` reemplaza el `confirm()` nativo al finalizar sin evidencia por un dialogo interno.
- Se limpiaron separadores visibles corruptos en textos de Limpieza.

Pendiente:

- Crear pedidos desde recepcion requiere un endpoint de alta de pedidos; actualmente el backend solo lista y cambia estado.
- Pulir visualmente Reportes si tambien debe quedar con el mismo lenguaje visual del mockup.

## Fase 7 Aplicada

Aplicado:

- `Inventario` mantiene sus endpoints y flujo, pero reemplaza estilos antiguos por clases del sistema visual actual.
- Se normalizaron cards, metricas, acciones e inputs locales de inventario.
- Se limpio el separador corrupto en el selector de productos.

Pendiente:

- `Reportes` ya tiene KPIs, filtros y drawer de detalle, pero podria recibir una pasada visual adicional.
