# Plan de Fase 1 - Checkpoint 3 (Restaurante Nativo)

## Veredicto de Preparación
**El backend está preparado para la migración.** La lógica crítica de negocio (transiciones de estado de pedidos, descuentos idempotentes de inventario, consulta de recetas, mermas y cierres de turno) ya existe de forma robusta en `server/src/order-inventory.js`, `server/src/operational-inventory.js` y `server/src/technical-recipes.js`. No será necesario crear contratos nuevos en el backend, sino conectar la interfaz nativa de React (front-end) a estos endpoints reales existentes para reemplazar progresivamente el iframe estático.

## Mapa de Vistas, Rutas y Endpoints

| Vista (Propuesta) | Ruta | Endpoint a consumir | Fuente (DB) | Permiso | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mi turno** | `/restaurante/dashboard` | `GET /api/operational-inventory/sessions` (buscar sesión activa) | PostgreSQL relacional | `RESTAURANTE:VER` | Endpoint real y existente. Falta UI nativa. |
| **Operación y pedidos** | `/restaurante/pedidos` | `GET /api/restaurante`, `PATCH /api/restaurante/:id/status` | app_state (Pedidos) + PostgreSQL (Inv.) | `RESTAURANTE:VER` | Endpoints reales y existentes. Falta UI nativa. |
| **Manual y porciones** | `/restaurante/inventario/recetas` | `GET /api/technical-recipes/manual/RESTAURANTE` | PostgreSQL relacional | `RESTAURANTE:VER` | Endpoint real y existente. Falta UI nativa. |
| **Mi inventario (Stock)** | `/restaurante/inventario/insumos` | `GET /api/operational-inventory/sessions/:id` | PostgreSQL relacional | `RESTAURANTE:VER` | Endpoint real y existente. Falta UI nativa. |
| **Registrar merma** | `/restaurante/inventario/mermas` | `POST /api/operational-inventory/sessions/:id/waste` | PostgreSQL relacional | `RESTAURANTE:VER` | Endpoint real y existente. Falta UI nativa. |
| **Cerrar y cuadrar** | `/restaurante/inventario/cierre` | `POST /.../start-count`, `POST /.../submit` | PostgreSQL relacional | `RESTAURANTE:VER` | Endpoints reales. Falta UI nativa con flujo estricto. |

## Lista de Acciones Reales Actuales (Backend listo)
- **Consulta de pedidos:** El endpoint `GET /api/restaurante` filtra nativamente y retorna solo los pedidos del área "RESTAURANTE".
- **Transición de estados:** `PATCH /api/restaurante/:id/status` valida rigurosamente el estado del pedido, permisos y área. El flujo exacto y obligatorio de estados es: `PENDIENTE → EN_COCINA → PREPARANDO → LISTO → ENTREGADO`.
- **Regla Operativa Crítica:** Un pedido solo puede ser aceptado si existe un turno operativo de Restaurante abierto.
- **Descuento de Inventario de Restaurante:** El consumo permanece reservado/comprometido antes de entregar. `transitionOrderInventory` garantiza atómicamente que el stock se convierte en consumo real una única vez, exclusivamente cuando el pedido alcanza el estado `ENTREGADO`.
- **Consulta de Recetas Técnicas:** Accesible y aislada para restaurante usando PostgreSQL relacional.
- **Rendición de Inventario y Merma:** Endpoints persistidos y validados en PostgreSQL relacional (turno operativo, conteo físico y registro justificado de mermas).

## Lista de Funciones “Falta conectar” y Flujos de UI
Todas las funcionalidades requeridas a nivel de *pantallas* se encuentran en estado de "Falta conectar", ya que actualmente el usuario `RESTAURANTE` es dirigido a un iframe (`KitchenStationPage.jsx` que apunta a `/superadmin-v6/index.html?mode=restaurant`). No hay lógica nativa React implementada para él todavía. Se crearán componentes nativos sin mocks de datos.

- **Mi turno e Inventario:** Se consumirá `GET /api/operational-inventory/sessions`. El rol RESTAURANTE ya queda filtrado automáticamente al área RESTAURANTE desde el backend. El Frontend deberá seleccionar la sesión activa más reciente con estado: `PENDING`, `OPEN`, `OPERATING`, `COUNTING` o `REOPENED`. Para los detalles y stock, utilizará `GET /api/operational-inventory/sessions/:id`.
- **Cerrar y Cuadrar (Flujo Estricto Obligatorio):**
  1. Se utilizará `POST /api/operational-inventory/sessions/:id/start-count` para iniciar el cierre. Esto solo se habilita en UI si el estado es `OPEN` o `OPERATING`, cambiando el turno a estado `COUNTING`.
  2. En modo de conteo, se deben mostrar todos los insumos obtenidos de `GET /api/operational-inventory/sessions/:id`. El trabajador deberá ingresar su conteo físico para cada producto/lote manteniendo la unidad real inmutable (g, kg, ml, L, unidad, porción). La UI bloqueará el envío si faltan productos por contar o si se ingresan cantidades negativas.
  3. Se enviará el cierre usando `POST /api/operational-inventory/sessions/:id/submit` con el payload real: `{ counts: [{ productId, lotId, quantity }] }`.
  4. El backend aceptará el envío solo cuando la sesión está en `COUNTING`. El turno quedará en estado enviado (para revisión); el usuario Restaurante no tiene capacidad de aprobar ni cerrar definitivamente su propia rendición.

## Diseño de Fallback Técnico (`/restaurante-legacy`)
El componente actual `KitchenStationPage.jsx` será conservado y renteado a la ruta `/restaurante-legacy`. Esta ruta servirá como resguardo operativo (fallback técnico). Así, si existiera un bloqueo imprevisto durante la migración de los usuarios de cocina, podrán continuar usando el sistema mediante el `iframe` antiguo de V6 sin interrumpir la operación del hotel. Se registrará este fallback temporal en `App.jsx`.

## Archivos exactos que se modificarían en la siguiente ejecución
1. **Rutas y Layout:**
   - `client/src/App.jsx` (Redirigir rutas de `/restaurante/*` a vistas nativas, mover iframe a `/restaurante-legacy`).
   - `client/src/constants/menu.js` (Confirmar que el menú `RESTAURANTE` apunte a las nuevas rutas).
2. **Nuevos Componentes Nativos:**
   - `client/src/modules/employees/RestaurantDashboard.jsx` (Resumen, Alertas de mi turno obteniendo la sesión activa).
   - `client/src/modules/employees/RestaurantOrdersPage.jsx` (Gestión de la cola de pedidos y estados).
   - `client/src/modules/employees/RestaurantRecipesPage.jsx` (Consulta de solo lectura del recetario técnico).
   - `client/src/modules/employees/RestaurantInventoryPage.jsx` (Insumos asignados, Merma y Formulario de rendición/cierre con flujo start-count -> submit y validación de faltantes).
3. **Mantenimiento del Legado:**
   - `client/src/modules/employees/KitchenStationPage.jsx` (Adaptar para que actúe exclusivamente como `/restaurante-legacy`).

## Plan de Pruebas (HTTP y UI)
- **Pruebas HTTP Backend:**
  1. Validar que un usuario `RESTAURANTE` puede cambiar estados (`PENDIENTE → EN_COCINA → PREPARANDO → LISTO → ENTREGADO`) pero que `BARTENDER` es rechazado (HTTP 404/403) si intenta tocar un pedido del restaurante.
  2. Verificar que el endpoint de estado falla si se intenta saltar fases o si no hay turno operativo activo (HTTP 409).
  3. Probar el flujo de cierre operativo:
     - `POST /submit` sin haber llamado a `start-count` → **HTTP 409**.
     - `POST /start-count` en una sesión válida → **HTTP 200**.
     - `POST /submit` con el payload de un producto faltante → **HTTP 400**.
     - `POST /submit` con todos los conteos completos → **HTTP 200**.
     - Validar que un usuario Restaurante recibe **HTTP 403** si intenta llamar a los endpoints de administración: `close`, `observe` o `reopen` sesión.
- **Pruebas UI Frontend:**
  1. Loguearse con las credenciales del restaurante.
  2. Comprobar que en las pantallas nativas se cargue la sesión activa correcta sin endpoints inventados.
  3. Realizar un flujo de pedido comprobando que el inventario se descuenta *solo* al presionar "Entregar".
  4. Comprobar que la interfaz bloquea el doble clic al interactuar con un pedido, y muestra el error real `409` del servidor si ya fue entregado.
  5. Navegar a `/bartender` estando logueado como Restaurante y comprobar que la aplicación muestra una página de error o `Forbidden`.
  6. Comprobar diseño visual responsive (Sidebar verde, componentes blancos/dorados).

## Análisis de Riesgos
- **[P0] Riesgo Crítico de Doble Consumo:** Que en la nueva UI un doble-clic envíe dos peticiones simultáneas de actualización. Mitigación: El backend ya bloquea mediante estados terminales y validación atómica. La UI debe deshabilitar los botones inmediatamente tras hacer clic y capturar el código `409`.
- **[P1] Fuga de Permisos a Otras Áreas:** Que el restaurante pueda ver los pedidos del Bar. Mitigación: Uso riguroso de `GET /api/restaurante` garantizado a nivel de controlador por área.
- **[P2] Problemas de Usabilidad en Cocina:** Las pantallas de cocina suelen ser tablets pequeñas. Mitigación: Diseño responsivo basado en Flex/Grid priorizando botones legibles.
- **[P3] Discrepancia Visual:** Pérdida de la paleta corporativa. Mitigación: Reutilizar estrictamente los `components/ui/` preexistentes.
