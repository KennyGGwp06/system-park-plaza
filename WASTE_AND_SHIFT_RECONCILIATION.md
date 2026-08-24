# Mermas y conciliación teórico-real

## Fórmulas por producto y lote

- `base disponible = inicial + entradas confirmadas - transferencias salientes + producción de entrada - consumo de producción ± ajustes autorizados`
- `esperado = base disponible - consumo teórico de ventas - mermas registradas`
- `consumo real derivado = base disponible - conteo físico - mermas registradas`
- `diferencia no justificada = consumo real derivado - consumo teórico = esperado - conteo físico`
- `diferencia porcentual = diferencia no justificada / |esperado| × 100`; si el esperado es cero y existe diferencia, es 100%.
- `diferencia económica = diferencia no justificada × costo histórico unitario`

El consumo de producción está separado del consumo teórico: al elaborar un intermedio se descuenta su insumo como `consumo de producción` y se ingresa el resultado como `producción de entrada`. Una venta posterior del intermedio solo consume su receta/versionado; no vuelve a descontar la materia prima original.

## Flujo y controles

1. Cocina o bar abre su turno y registra mermas inmediatamente en la unidad base del producto.
2. Cada merma crea un movimiento de kardex, conserva producto, lote, categoría, usuario, fecha, costo, observación y evidencia opcional.
3. Durante el conteo se registra todos los productos. Las diferencias mayores que la tolerancia del producto exigen explicación.
4. Enviado: el conteo y resumen quedan inmutables. Administración puede observar, aprobar/cerrar o reabrir con motivo auditado.
5. Al cerrar, cualquier diferencia se regulariza mediante movimiento compensatorio, nunca editando historial. Al reabrir, ese movimiento se revierte también con movimiento compensatorio.
6. Movimientos posteriores al corte permanecen en el siguiente turno; el resumen enviado/cerrado conserva su fotografía.

Categorías: limpieza, transformación, vencimiento, almacenamiento, error de preparación, producto dañado, derrame, dosificación, consumo interno y otra.
