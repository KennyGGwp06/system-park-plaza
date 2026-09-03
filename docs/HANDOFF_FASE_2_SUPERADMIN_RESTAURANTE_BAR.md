# Fase 2 — Solicitudes internas y simplificación operativa

Fecha de cierre: 31 de agosto de 2026
Estado: completada y verificada

## Objetivo de esta fase

Completar el circuito diario de abastecimiento entre Restaurante, Bar y Super Admin, y reducir controles confusos o sin función en las vistas administrativas.

La regla aplicada fue mantener la lógica segura del inventario —lotes, reservas, tránsito, kardex y separación de responsables— pero ocultar esa complejidad al trabajador que solo necesita pedir y recibir productos.

## Resultado funcional

### Flujo conectado de insumos

El flujo nuevo queda así:

`Restaurante o Bar solicita → Super Admin revisa → aprueba y envía → el área cuenta y confirma → inventario operativo actualizado`

El trabajador de Restaurante o Bar:

- abre **Solicitar insumos**;
- escribe el nombre del producto y selecciona una sugerencia;
- indica la cantidad usando la unidad real del producto;
- puede agregar varios productos y un motivo;
- envía una única solicitud a Super Admin;
- consulta el estado y la respuesta desde la misma vista;
- recibe el despacho desde **Recibir insumos**.

No necesita elegir almacén, lote, transferencia, kardex ni costo.

El Super Admin:

- dispone de **Solicitudes de insumos** dentro de Inventario;
- ve únicamente las solicitudes que requieren una decisión;
- identifica claramente si vienen de Restaurante o Bar;
- puede ajustar la cantidad solicitada;
- debe escribir un motivo cuando rechaza;
- al aprobar, el sistema crea la transferencia, reserva los lotes por la lógica existente y realiza el envío desde Almacén general;
- si el envío automático no se completa, recibe una indicación clara para terminarlo en **Distribuir insumos**.

El tablero principal del Super Admin consulta las solicitudes pendientes y muestra una acción prioritaria cuando corresponde.

### Restaurante

- Se agregó **Solicitar insumos** al menú de Inventario.
- Se agregó **Recibir insumos** como paso independiente de la solicitud.
- El inicio muestra una acción rápida para pedir reposición.
- Cuando no existen recepciones pendientes, la pantalla propone directamente crear una solicitud.
- El historial explica si la solicitud espera aprobación, fue rechazada, fue enviada o ya fue recibida.

### Bar

- Se agregó el mismo circuito, adaptado al centro de Bar.
- El inicio tiene acceso directo a **Solicitar insumos**.
- Se mantiene separado el control de botellas, merma, stock y cierre de turno.
- Las solicitudes del Bar solo aparecen en la estación del Bar y en la supervisión autorizada.

### Catálogo de servicios

- Se reemplazó el guardado general por botones de guardado específicos por tarjeta o grupo.
- Un precio, capacidad o descripción puede guardarse sin enviar todos los demás formularios.
- Los filtros separan Hospedaje, Piscina, Mirador, Eventos y Complementos.
- Planes y extras permiten agregar, editar, ocultar y eliminar elementos.
- El formulario conserva los cambios escritos al cambiar de filtro y evita que una actualización en segundo plano los reemplace antes de guardar.

### Limpieza y Mantenimiento

- El buscador de Limpieza ahora filtra por habitación, código, trabajador, estado y descripción.
- El buscador de Mantenimiento filtra por ubicación, área, código, descripción y responsable.
- Cuando una búsqueda no encuentra coincidencias, la pantalla explica el resultado en vez de mostrar una bandeja vacía ambigua.
- Ambas vistas usan el contenedor visual Park Plaza Moderno ya aplicado al Hotel.

### Controles corregidos

- Se retiraron de Facturación los botones **Ver** y **Descargar** que no ejecutaban ninguna acción.
- En Eventos se retiró el botón redundante **Ver reserva**; el panel conserva **Editar reserva** y **Registrar pago**, que sí están conectados.
- El asistente interno dirige a Restaurante y Bar a la nueva solicitud de insumos.

## Rutas agregadas

- Super Admin: `/admin/solicitudes-stock`
- Restaurante: `/restaurante/inventario/solicitudes`
- Bar: `/bartender/inventario/solicitudes`

Las recepciones continúan en:

- Restaurante: `/restaurante/inventario/recepciones`
- Bar: `/bartender/inventario/recepciones`

## Archivos principales de esta fase

- `client/src/modules/inventory/StockRequestsPage.jsx`
- `client/src/App.jsx`
- `client/src/constants/menu.js`
- `client/src/components/TrainingAssistant.jsx`
- `client/src/modules/admin/SuperAdminControlPage.jsx`
- `client/src/modules/admin/CommercialSettingsPage.jsx`
- `client/src/modules/admin/AdminCleaningPage.jsx`
- `client/src/modules/admin/AdminMaintenancePage.jsx`
- `client/src/modules/admin/AdminResourcePage.jsx`
- `client/src/modules/events/EventsPage.jsx`
- `client/src/modules/employees/RestaurantDashboard.jsx`
- `client/src/modules/employees/RestaurantReceiptsPage.jsx`
- `client/src/modules/employees/BarPages.jsx`

La lógica de solicitudes y transferencias ya existía en el backend y fue reutilizada:

- `server/src/stock-requests.js`
- endpoints de solicitudes en `server/src/index.js`
- servicio de transferencias en `server/src/transfers.js`

El repositorio continúa teniendo cambios paralelos del equipo. No deben descartarse ni restaurarse archivos completos sin revisar primero el diff.

## Verificación ejecutada

### Compilación de producción

- ERP interno: aprobada
- Experiencia del cliente: aprobada
- Operaciones: aprobada

La experiencia del cliente mantiene una advertencia no bloqueante: su paquete principal supera 500 kB y conviene dividirlo antes o después del primer despliegue.

### Pruebas automáticas

Se aprobaron **33 verificaciones** en el cierre de esta fase:

- Solicitudes de stock: 5
- Transferencias y recepción: 10
- Seguridad y permisos: 11
- Conectividad Cliente, Recepción, Limpieza, Mantenimiento y Super Admin: 7

Las pruebas confirman:

- separación de solicitudes entre Restaurante y Bar;
- aprobación con reserva real de inventario;
- rechazo e idempotencia;
- tránsito sin duplicación de existencias;
- recepción con faltantes o sobrantes;
- separación entre quien envía y quien recibe;
- prohibición de compras, recetas o inventario central para roles no autorizados;
- trazabilidad completa de solicitudes de huéspedes y operación interna.

### Validación visual en navegador

Se probó la versión actual del código con backend y frontend aislados de la imagen antigua de Docker.

- Super Admin inicia sesión y ve **Solicitudes de insumos** en el menú.
- La bandeja explica el flujo en tres pasos y muestra el estado vacío correcto.
- Restaurante inicia sesión y ve **Solicitar insumos** y **Recibir insumos**.
- El formulario de Restaurante solicita solo producto, cantidad y motivo opcional.
- Bar inicia sesión y dispone del mismo circuito con su propia separación de área.
- No se detectaron errores de consola en estas vistas.

Nota: los puertos `5173` y `3000` estaban atendidos por una imagen Docker anterior. La validación de esta fase se ejecutó con el backend actualizado en `3001` y el frontend actualizado en `4175`. Para ver los cambios en el entorno habitual hay que reconstruir o reiniciar los contenedores.

## Cómo demostrar esta fase

1. Reiniciar o reconstruir el entorno habitual para que use el código actual.
2. Entrar como Restaurante.
3. Abrir **Inventario → Solicitar insumos**.
4. Crear una solicitud con producto y cantidad.
5. Entrar como Super Admin.
6. Abrir **Inventario → Solicitudes de insumos**.
7. Revisar la solicitud y elegir **Aprobar y enviar**.
8. Volver a Restaurante.
9. Abrir **Inventario → Recibir insumos**.
10. Contar la cantidad física y confirmar la recepción.
11. Revisar **Mi stock** para confirmar la existencia asignada.
12. Repetir el circuito con Bar para demostrar que las áreas permanecen separadas.

## Pendientes recomendados para la Fase 3

Prioridad alta:

1. Crear una prueba E2E automatizada de interfaz que genere una solicitud, la apruebe y confirme la recepción usando los tres roles.
2. Revisar todas las tablas administrativas para añadir filtros reales, paginación y estados vacíos con acción.
3. Unificar los nombres visibles de estados de inventario; el usuario no debería ver términos técnicos en inglés.
4. Añadir notificaciones visibles para Restaurante y Bar cuando Super Admin apruebe, rechace o envíe una solicitud.
5. Mostrar una advertencia preventiva cuando la cantidad solicitada supera el stock general disponible.
6. Añadir una vista de impresión o comprobante interno de despacho solo si el negocio realmente la necesita.

Antes de producción:

1. Reconstruir los contenedores y verificar que no estén sirviendo bundles antiguos.
2. Cambiar contraseñas de demostración, secreto JWT y variables de entorno.
3. Ejecutar las migraciones en una copia de la base de producción y verificar respaldo/recuperación.
4. Configurar HTTPS, dominio, CORS exacto, monitoreo y conservación de evidencias subidas.
5. Realizar una prueba piloto con el dueño usando datos controlados y una lista de aceptación firmada.
6. Dividir el bundle grande de la experiencia del cliente.

## Regla para continuar

La Fase 3 debe partir de este estado. No recrear la solicitud de insumos como un formulario de transferencias: la simplicidad para Restaurante y Bar es intencional. Tampoco reemplazar los servicios de stock, lotes o transferencias; la nueva vista es una capa operativa sobre esa lógica segura.

Antes de modificar Catálogo, Hotel, Compras, Transferencias o la experiencia del cliente, revisar los cambios paralelos del equipo y coordinar por archivo para evitar sobrescrituras.
