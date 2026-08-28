# Reporte de Corrección: Fase 1 - Checkpoint 3 (Restaurante Nativo)

## Resumen de Correcciones
Se aplicaron correcciones obligatorias sobre la implementación nativa del rol `RESTAURANTE` para asegurar el cumplimiento estricto con los contratos del backend y las reglas de seguridad, sin alterar otros roles o módulos.

## 1. Ajuste de Rutas
- Se agregó la ruta raíz `/restaurante` en `App.jsx` para que el inicio de sesión redirija a una vista funcional nativa en lugar de una pantalla en blanco o no definida. 
- Mapeado: `["/restaurante", "RESTAURANTE:VER", <RestaurantDashboard />, ["RESTAURANTE"]]`

## 2. Refactorización de Autenticación
- Se eliminó el uso de `fetch` manual con `Authorization: Bearer ${user?.token}` en todos los componentes.
- Se implementó exclusivamente el cliente `api()` desde `client/src/services/api.js` para asegurar la correcta inyección del token mediante `hotel_park_plaza_token` centralizado en todas las mutaciones (actualización de estado de pedidos, registro de mermas, inicio de conteo y cierre).

## 3. Contrato Real de Inventario
- El componente `RestaurantInventoryPage.jsx` fue ajustado para usar el objeto `lines` del endpoint `GET /api/operational-inventory/sessions/:id`.
- Se corrigió la lectura y uso de los campos reales de PostgreSQL (`productId`, `productName`, `lotId`, `lotCode`, `unitSymbol`, `openingQuantity`, `theoreticalConsumption`, `wasteQuantity`, `expectedQuantity`, `baseAvailableQuantity`, `tolerancePercent`).
- Ya no se hace referencia a los campos inventados `stock`, `consumedQuantity`, `wastedQuantity`, ni `unit`.

## 4. Corrección en Mermas (Waste)
- El envío al endpoint `POST /waste` ya no manda un objeto `items`.
- Ahora el payload respeta estrictamente los nombres: `{ productId, lotId, quantity, category, observation }`.
- Se muestra correctamente la unidad del producto mediante el campo `unitSymbol` en formato de solo lectura.

## 5. Corrección en Cierre de Turno y Cuadre Físico
- El botón de `Iniciar Conteo de Cierre` ahora valida exclusivamente el estado `OPEN` del turno. Se restringió intencionalmente para no admitir `OPERATING`.
- El endpoint `POST /start-count` opera sin cuerpo.
- Se implementó la lógica de tolerancia en tiempo real durante el conteo físico.
- Si la diferencia de conteo excede la `tolerancePercent` del consumo esperado (`expectedQuantity`), el usuario está **obligado a justificar** en el campo motivo, lo que agrega su registro de explicación (`explanations`) al payload de envío (`submit`).
- Payload de `submit` ajustado: `{ counts: [...], explanations: [...], notes }`.

## 6. Estado de Sesión Activa (Dashboard e Inventario)
- Las verificaciones locales de turno activo ya **no** incluyen el estado terminal `SUBMITTED`. 
- Una vez enviada la rendición, la aplicación queda en modo solo lectura para la sesión reportando el mensaje de que ha sido enviada a revisión.

## 7. Integración de Tiempo Real
- En las vistas operativas (`RestaurantDashboard.jsx`, `RestaurantOrdersPage.jsx`, `RestaurantRecipesPage.jsx`, `RestaurantInventoryPage.jsx`), se integró en la función `useFetch` la configuración `{ realtime: true, pollInterval: 15000 }`.
- Esto asegura la actualización progresiva o "escucha" de cambios por parte de caja o inventario.

## Pruebas de Validación
- ✔ `/restaurante` carga la dashboard y permite visualizar turnos.
- ✔ Pedidos (Operaciones) utilizan `api()` de forma auténtica.
- ✔ Las mermas utilizan payload plano evitando errores 400.
- ✔ Envíos sin justificación en consumos de alta desviación detienen el avance al frontend evitando envíos 400.
- ✔ Build exitoso con Vite (0 errores de importación/exportación).
- ✔ Respeto al esquema visual y archivos base (`customer/`, `superadmin`).
