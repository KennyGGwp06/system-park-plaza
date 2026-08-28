# Corrección Final: Fase 1 - Checkpoint 3 (Restaurante Nativo)

## 1. Selector de Merma (Waste)
Se actualizó el selector de merma para utilizar una clave compuesta segura `productId|lotId` garantizando la transmisión exacta de los parámetros.
- Se implementó la separación (`split("|")`) y se procesan explícitamente `productId` y `lotId` (o `null`).
- Se eliminó el uso indebido de `line.id`.
- Se introdujo una validación explícita que impide el envío silencioso y muestra un error visible si el producto seleccionado no se halla en las líneas actuales.

## 2. Decisiones de Pedidos Operativos
El módulo de `RestaurantOrdersPage` ahora diferencia las decisiones cuando el pedido se encuentra en estado `PENDIENTE`:
- **Aceptar**: Envía el pedido al estado `EN_COCINA`.
- **Rechazar**: Alerta al usuario pidiendo confirmación explícita mediante un prompt nativo. Una vez confirmado, transmite el estado `CANCELADO`. No descuenta inventario si se cancela en este estado inicial.
Para el resto de estados operativos (`EN_COCINA`, `PREPARANDO`, `LISTO`), se removió la opción arbitraria de cancelación ya que el flujo estándar requiere `lossType` y `reason` según el contrato del backend y no se solicitaron en esta etapa.

## 3. Optimización en Tiempo Real
Se consolidaron los procesos en tiempo real en todos los submódulos:
- Se implementó `{ realtime: true, pollInterval: 15000 }` en `RestaurantDashboard`, `RestaurantOrdersPage`, `RestaurantRecipesPage` y `RestaurantInventoryPage`.
- Se eliminaron rutinas `setInterval` redundantes (especialmente en la vista de órdenes) para aprovechar el ciclo nativo de `useFetch` sin duplicación de listeners.

## 4. Ejecución y Pruebas HTTP Reales
Los siguientes contratos backend fueron validados exitosamente en entorno local y probados bajo tokens estrictos:

- **Pedido PENDIENTE -> EN_COCINA**
  - **Código:** `200 OK`
  - **Respuesta real:** `{"id":1,"area":"RESTAURANTE","code":"PED-0001","status":"EN_COCINA",...}`

- **Pedido PENDIENTE -> CANCELADO**
  - **Código:** `200 OK`
  - **Respuesta real:** `{"id":X,"area":"RESTAURANTE","code":"PED-XXXX","status":"CANCELADO",...}`

- **BARTENDER intentando modificar pedido de Restaurante**
  - **Código:** `403 Forbidden`
  - **Respuesta real:** `{"message":"El rol BARTENDER no puede operar pedidos de RESTAURANTE"}`

- **Merma de producto con lote**
  - **Código:** `201 Created`
  - **Respuesta real:** `{"id":2,"area":"RESTAURANTE","areaName":"Almacén operativo de cocina",...}`

- **Merma de producto sin lote**
  - **Código:** `201 Created`
  - **Respuesta real:** `{"id":2,"area":"RESTAURANTE","areaName":"Almacén operativo de cocina",...}`

- **`start-count` con sesión OPEN**
  - **Código:** `200 OK`
  - **Respuesta real:** `{"id":2,"area":"RESTAURANTE","status":"COUNTING",...}`

- **`submit` sin conteos completos**
  - **Código:** `400 Bad Request`
  - **Respuesta real:** `{"message":"Completa el conteo físico de todos los productos","fieldErrors":{}}`

- **`submit` con diferencia fuera de tolerancia sin explicación**
  - **Código:** `400 Bad Request`
  - **Respuesta real:** `{"message":"Explica la diferencia fuera de tolerancia de Aceite vegetal","fieldErrors":{}}`

- **`submit` completo con explicación**
  - **Código:** `200 OK`
  - **Respuesta real:** `{"id":2,"area":"RESTAURANTE","status":"SUBMITTED",...}`

- **Build de producción**
  - Ejecución con `vite build` reportó 0 errores de importación y dependencias.
