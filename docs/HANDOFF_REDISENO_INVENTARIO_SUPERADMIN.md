# Rediseño del inventario de Super Admin

Fecha: 1 de septiembre de 2026

## Objetivo

Convertir el inventario técnico existente en un flujo diario comprensible para una persona que nunca ha usado un ERP, conservando trazabilidad, costos, lotes y controles internos.

## Navegación final

1. **Inicio**: prioridades y accesos rápidos.
2. **Solicitudes de insumos**: pedidos enviados por Restaurante y Bar.
3. **Comprar y recibir**: compra rápida o pedido previo a proveedor.
4. **Proveedores**: registro, búsqueda y contacto.
5. **Distribuir insumos**: salida desde Almacén general y confirmación del área receptora.
6. **Ver existencias**: cantidades reales por producto, almacén y lote.
7. **Insumos y unidades**: configuración de productos, presentaciones y conversiones.
8. **Preparación y porcionado**: limpieza, transformación, bases y porciones.
9. **Turnos y cierres**: apertura, conteo, envío y aprobación.

## Cambios realizados

- Se corrigió el permiso que enviaba al Super Admin a la vista operativa de Restaurante en `/inventario`.
- Se creó una consulta central de existencias con búsqueda, ubicación, estado, lotes, vencimientos y cantidades comprometidas.
- La portada ahora prioriza tareas: comprar, distribuir, consultar existencias y administrar proveedores.
- Los trece indicadores técnicos dejaron de competir en la primera pantalla. El análisis económico quedó como resumen secundario y los filtros dentro de **Consulta avanzada**.
- Se eliminaron de la vista diaria los registros técnicos `API_OPERATION` y `API_SECURITY`.
- El stock crítico ignora mínimos configurados en cero.
- El consumo real negativo se normaliza y el costo de diferencias se muestra en valor absoluto.
- Se agregó Proveedores e Insumos/Unidades al menú visible.
- Proveedores muestra totales, contacto y acceso directo a una nueva compra.
- Comprar y recibir tiene acceso directo al directorio de proveedores.
- Distribuir insumos parte por defecto del Almacén general para Super Admin.
- El receptor de una transferencia debe ser el operador del área destino; Super Admin conserva supervisión.
- Producción se renombró con lenguaje operativo: **Limpiar o cortar**, **Preparar una base**, **Crear porciones** y **Ver historial**.
- Turnos y cierres usa un recorrido explícito: abrir, trabajar, contar, enviar y aprobar.
- Las fechas diarias usan la zona horaria de Lima.

## Flujo que debe probarse

1. Crear o seleccionar proveedor.
2. Registrar una compra recibida y guardarla en Almacén general.
3. Confirmar que aparece en Ver existencias.
4. Enviar una parte a Restaurante o Bar.
5. Entrar con el usuario del área destino y confirmar la cantidad física.
6. Verificar la nueva cantidad en ambas ubicaciones.
7. Abrir el turno del área, procesar pedidos y registrar una merma de prueba.
8. Contar lo que quedó, enviar el cierre y aprobarlo con Super Admin.

## Verificación ejecutada

- Compilación completa de `client`, `customer` y `operations`: correcta.
- Pruebas de dashboard administrativo: 3/3.
- Compras y recepción: 9/9.
- Transferencias: 10/10.
- Inventario operativo y cierres: 12/12.
- Transformaciones: 9/9.

## Siguiente revisión visual

Realizar el flujo anterior con datos pequeños y capturas reales. Ajustar densidad, textos o posición de botones a partir del comportamiento del dueño; no cambiar la lógica que ya está cubierta por las pruebas.
