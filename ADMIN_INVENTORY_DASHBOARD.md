# Panel central de inventario

Ruta: `/admin/inventario` (rol `ADMINISTRADOR`, permiso `INVENTARIO:VER`).

El panel no almacena indicadores propios. Cada carga consulta las tablas operativas: balances y lotes para valorización, movimientos para consumo teórico, cierres por turno para consumo real y diferencias, ventas de recetas para costo/margen, y registros de merma, transferencias, procesamiento y auditoría.

## Acciones y detalle

- Cada tarjeta de alerta enlaza al módulo que genera el dato: catálogo/almacén, turnos y cierres, transferencias, transformaciones o auditoría.
- La aprobación y reapertura permanecen en **Inventarios por turno**, donde se exige permiso, motivo y auditoría; el panel central muestra los cierres pendientes y lleva a esa pantalla.
- **Exportar CSV** descarga los indicadores y la valorización por almacén correspondientes al filtro activo.

## Filtros

Fecha, turno y área filtran los procesos temporales; almacén, producto, lote y proveedor acotan la valorización de stock. Los selectores se alimentan de las entidades reales, no de listas locales.

## Verificación

Ejecutar desde la raíz del proyecto:

```powershell
npm run test:inventory-admin --workspace server
npm run test:operational-inventory --workspace server
npm run build --workspace client
```

La prueba administrativa crea un esquema temporal, migra todo el inventario, inserta balances, lote próximo a vencer y un movimiento teórico; después verifica totales, filtros e identificadores de detalle. No altera los datos de demostración.
