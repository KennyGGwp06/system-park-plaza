# Pedidos, ventas e inventario inteligente

## Flujo implementado

```text
PEDIDO CONFIRMADO
→ RESERVA DE EXISTENCIAS POR LOTE (FEFO)
→ PREPARACIÓN / STOCK COMPROMETIDO
→ LISTO
→ ENTREGADO
→ VENTA CONSOLIDADA
→ CONSUMO TEÓRICO
```

La creación del pedido, sus líneas, la versión de receta, los costos y la reserva se guardan en la misma transacción PostgreSQL que el estado compatible del ERP. Si no existe stock suficiente en el almacén del área, el pedido no se confirma parcialmente.

## Reglas de estado

- `PENDIENTE`: las existencias están reservadas por producto y lote.
- `EN_COCINA`: Cocina aceptó el pedido; la reserva sigue vigente.
- `PREPARANDO`: la reserva queda comprometida a producción.
- `LISTO`: el producto preparado espera entrega.
- `ENTREGADO`: se registra una venta consolidada y un único movimiento `THEORETICAL_CONSUMPTION` por reserva.
- `CANCELADO` antes de preparar: libera la reserva sin afectar stock físico.
- `CANCELADO` después de preparar: exige `WASTE`, `INTERNAL_CONSUMPTION` o `LOSS`, un motivo, y genera la salida correspondiente. No devuelve ingredientes al stock.

Bar usa el almacén `BARTENDER` y Cocina usa `RESTAURANTE`. Los pedidos mixtos comparten `groupCode`, pero crean pedidos, líneas y reservas independientes por área.

## Persistencia

La migración `009_orders_inventory_sales` crea:

- `inventory_order_lines`
- `inventory_order_reservations`
- `inventory_order_events`
- `inventory_consolidated_sales`
- `inventory_order_cancellation_losses`

Las líneas guardan la versión y costo histórico. Los eventos usan claves de idempotencia y los movimientos utilizan una clave por reserva; repetir una entrega no vuelve a descontar.

## Tiempo real

Todos los `POST`, `PUT`, `PATCH` y `DELETE` exitosos publican `state:changed` por Socket.IO. Las vistas de Cocina, Bar, administración y cliente están suscritas y recargan sus datos automáticamente sin actualizar la página.

Endpoint de diagnóstico no destructivo:

```text
POST /api/realtime/ping
```

## Endpoints relevantes

```text
POST  /api/public/orders
PATCH /api/orders/:id/status
PATCH /api/restaurante/:id/status
PATCH /api/bartender/:id/status
GET   /api/orders/:id/inventory
```

Para cancelar después de preparar:

```json
{
  "status": "CANCELADO",
  "lossType": "WASTE",
  "reason": "Cliente canceló cuando el plato ya estaba preparado"
}
```

## Pruebas

```powershell
npm run test:order-inventory
npm run test:realtime
```

La suite cubre restaurante, bar, pedido combinado, cancelación antes/después de preparar, separación por área, costo histórico, venta consolidada, reintento duplicado, descuento único y rollback.
