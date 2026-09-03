# Park Plaza ERP — cierre de fase 3

Fecha: 31 de agosto de 2026

## Objetivo de la fase

Cerrar el circuito diario de abastecimiento entre Restaurante/Bar y Super Admin, reducir códigos técnicos visibles, entregar alertas útiles por rol y asegurar que las listas administrativas grandes sean manejables por una persona sin experiencia previa en sistemas.

Esta fase continúa el trabajo documentado en:

- `HANDOFF_FASE_1_SUPERADMIN_RESTAURANTE_BAR.md`
- `HANDOFF_FASE_2_SUPERADMIN_RESTAURANTE_BAR.md`

## Resultado funcional

### 1. Solicitud de insumos con control preventivo

El flujo queda así:

1. Restaurante o Bar crea una solicitud desde su estación.
2. El formulario muestra la existencia real disponible en el almacén general.
3. Si la cantidad solicitada supera lo disponible, el operador recibe una advertencia clara. Puede enviar la solicitud para dejar constancia de su necesidad.
4. Super Admin ve la solicitud pendiente en su campana y en su bandeja.
5. En la revisión, Super Admin ve solicitado versus disponible.
6. El sistema bloquea **Aprobar y enviar** mientras alguna cantidad supere la existencia real.
7. Super Admin ajusta la cantidad o primero repone el almacén.
8. Al aprobar, el stock queda comprometido; al enviar pasa a tránsito.
9. Restaurante o Bar recibe desde su propia bandeja.
10. La confirmación aumenta el stock de destino y deja movimientos auditados.

El backend sigue siendo la autoridad. La advertencia visual no reemplaza la validación transaccional.

Archivos principales:

- `server/src/stock-requests.js`
- `client/src/modules/inventory/StockRequestsPage.jsx`
- `server/scripts/stock-requests-test.js`

### 2. Alertas conectadas por responsabilidad

La campana ya no presenta al personal accesos que no puede utilizar.

- **Super Admin:** solicitudes de insumos por aprobar y alertas administrativas.
- **Restaurante:** solicitudes listas para recibir, aprobadas pendientes de envío, rechazadas recientes y pedidos demorados de cocina.
- **Bar:** solicitudes listas para recibir, aprobadas pendientes de envío, rechazadas recientes y pedidos demorados de bar.
- Cada alerta lleva directamente a la vista operativa correspondiente al rol.
- La bandeja aclara que cada usuario solo ve acciones de su responsabilidad.

Archivo principal:

- `client/src/layouts/Navbar.jsx`

### 3. Estados expresados en lenguaje normal

Se centralizó la presentación de estados para evitar textos internos como `OPEN`, `COUNTING`, `EN_COCINA` o `RECEIVED_WITH_DIFFERENCE`.

Ejemplos visibles:

- `OPEN` → **Turno abierto**
- `COUNTING` → **Conteo físico**
- `REJECTED` → **Rechazada**
- `SENT` → **Enviada / en tránsito**
- `EN_COCINA` → **En cocina**
- Estados no registrados se convierten automáticamente a una frase legible.

Se aplicó a dashboards, inventario operativo, botellas de bar y controles generales.

Archivos principales:

- `client/src/components/StatusBadge.jsx`
- `client/src/modules/employees/RestaurantDashboard.jsx`
- `client/src/modules/employees/BarPages.jsx`
- `client/src/modules/inventory/OperationalInventoryPage.jsx`
- `client/src/modules/inventory/BarBottlePage.jsx`

### 4. Tablas administrativas manejables

La vista reutilizada por Auditoría, Consumos, Cochera, Contratos, Compras, Proveedores, Pagos, Facturación, Caja y Usuarios ahora incorpora:

- búsqueda específica por los campos importantes de cada módulo;
- filtros con nombres legibles;
- contador `Mostrando X-Y de N registros`;
- indicación de cuántos registros quedan ocultos por el filtro;
- paginación de 12 filas;
- botones Anterior/Siguiente;
- reinicio automático a la primera página cuando cambia la búsqueda o filtro;
- acciones operativas con texto natural, por ejemplo **Marcar como en preparación**.

Archivo principal:

- `client/src/modules/admin/AdminResourcePage.jsx`

## Prueba automática ampliada

`server/scripts/stock-requests-test.js` ya no comprueba solamente crear y aprobar. Ahora recorre en un esquema aislado:

1. referencias y disponibilidad del almacén general;
2. creación de solicitud;
3. separación por área;
4. aprobación;
5. reserva de existencias;
6. envío de transferencia;
7. recepción por Restaurante;
8. aumento del stock de destino;
9. rechazo;
10. idempotencia.

## Validaciones ejecutadas

Todas finalizaron correctamente:

- `npm run build`: cliente interno, experiencia del cliente y operaciones compilados.
- `npm run test:stock-requests --workspace server`: **10/10**.
- `npm run test:transfers --workspace server`: **10/10**.
- `npm run test:rbac-security --workspace server`: **11/11**.
- `npm run test:connectivity`: **7/7**.
- `git diff --check`: sin errores de espacios o parches.

Total de verificaciones funcionales relevantes: **38**.

También se validó en navegador la interfaz actualizada:

- Restaurante ve `Turno abierto`, no el código `OPEN`.
- La solicitud excesiva muestra disponibilidad y advertencia preventiva.
- Super Admin recibe la alerta de aprobación.
- El botón de aprobación queda desactivado si falta stock.
- Restaurante recibe la notificación de rechazo y accede a su propia bandeja.
- Auditoría mostró 740 registros divididos en 62 páginas; búsqueda y paginación funcionaron correctamente.

## Datos de prueba creados

Durante la validación visual se creó la solicitud `SOL-RES-4B7F8D`. Se dejó **rechazada** con una nota que explica que corresponde a la validación preventiva de fase 3. Se conserva porque el sistema es auditable y no debe borrar historia operativa silenciosamente.

## Decisiones de diseño

- Se mantuvo **Park Plaza Moderno**: contraste sobrio, tarjetas claras, dorado como acento y verde institucional.
- Las transiciones son discretas y rápidas; no se agregaron animaciones decorativas que distraigan en una operación diaria.
- No se agregó impresión de comandas en esta fase porque aún no existe una necesidad confirmada de impresora o formato físico. No conviene sumar una función sin flujo real de negocio.

## Estado al cerrar la fase 3

La parte trabajada de Super Admin, Restaurante y Bar está conectada para pruebas reales del flujo de solicitudes e inventario. Los controles críticos se ejecutan también en backend, los roles conservan permisos separados y las vistas principales ya traducen los estados técnicos.

Esto no significa que el despliegue de producción esté terminado. Antes de publicar en servidor todavía se debe completar la fase de preparación operativa: variables y secretos reales, reconstrucción de contenedores, dominio/TLS, respaldo y restauración de PostgreSQL, almacenamiento persistente de imágenes, monitoreo y prueba de recuperación.

## Entrada recomendada para la fase 4

1. Preparación de despliegue y lista de comprobación de producción.
2. Prueba guiada del dueño con datos no técnicos y medición de pasos/confusiones.
3. Ajustes visuales de las vistas especializadas que todavía no usan la tabla administrativa común.
4. Revisión del peso del bundle de experiencia del cliente; actualmente compila, pero Vite advierte que su archivo principal supera 500 kB.
5. Prueba E2E de navegador automatizada en CI cuando se defina el entorno estable de integración.

## Cómo retomar sin romper lo ya hecho

- Leer primero los tres handoff de fases.
- No eliminar validaciones de disponibilidad ni permitir que el cliente sea la única autoridad.
- Mantener la separación emisor/receptor en transferencias.
- Mantener las rutas de alertas limitadas por rol.
- Ejecutar como mínimo `npm run build`, `test:stock-requests`, `test:transfers`, `test:rbac-security` y `test:connectivity` después de cualquier cambio transversal.
