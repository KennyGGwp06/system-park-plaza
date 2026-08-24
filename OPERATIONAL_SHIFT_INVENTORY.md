# Inventarios operativos por turno

Implementación relacional para Cocina y Bar. El inventario se separa por fecha, área y turno y usa el kardex inmutable como fuente de movimientos.

## Flujo

`PENDIENTE → ABIERTO → EN_CONTEO → ENVIADO → CERRADO`

- Cocina: `ALMUERZO`, `CENA`.
- Bar: `TARDE`, `NOCHE`.
- El primer turno sin cierre previo exige un conteo de apertura.
- Los siguientes turnos toman como inicial el conteo físico del último cierre.
- Al enviar se congela el instante de corte y se crea una revisión histórica inmutable.
- Administración aprueba el cierre. Las diferencias generan movimientos compensatorios; no se edita el kardex.
- Solo Administración puede reabrir. La reapertura exige motivo, revierte el ajuste anterior y conserva todas las revisiones.
- Un movimiento posterior al corte no altera el resumen enviado; se calcula en el siguiente turno.

## Fórmula

`stock esperado = stock inicial + entradas confirmadas - transferencias salientes + producción de entrada - consumo teórico - mermas ± ajustes autorizados`

`diferencia = conteo físico - stock esperado`

`diferencia económica = diferencia × costo histórico unitario`

## Migración 005

Archivos:

- `server/migrations/005_operational_shift_inventories.up.sql`
- `server/migrations/005_operational_shift_inventories.down.sql`

Agrega límites temporales y responsables a `inventory_shift_sessions`, además de:

- `inventory_shift_opening_lines`: fotografía de apertura.
- `inventory_shift_summary_lines`: resumen inmutable por revisión de cierre.
- índice único de un inventario activo por almacén operativo.
- índices de fecha, área y ventana del kardex.
- protección de líneas de conteo ya enviadas y resúmenes históricos.

## Endpoints

- `GET /api/operational-inventory/references`
- `GET /api/operational-inventory/sessions?area=RESTAURANTE&date=AAAA-MM-DD`
- `GET /api/operational-inventory/sessions/:id`
- `POST /api/operational-inventory/sessions`
- `POST /api/operational-inventory/sessions/:id/open`
- `POST /api/operational-inventory/sessions/:id/start-count`
- `POST /api/operational-inventory/sessions/:id/submit`
- `POST /api/operational-inventory/sessions/:id/close` — Administración.
- `POST /api/operational-inventory/sessions/:id/reopen` — Administración y motivo obligatorio.

El endpoint antiguo `POST /api/inventory/daily-close` devuelve `410 Gone` para impedir cierres JSON que no distinguen turnos.

## Prueba manual

1. Ingresar como Cocina (`restaurante@parkplaza.com`) o Bar (`bartender@parkplaza.com`), contraseña `ParkPlaza123*`.
2. Abrir **Cierre por turno** desde el menú.
3. Programar fecha y turno.
4. Abrir el turno. Si no existe cierre anterior, confirmar el conteo inicial.
5. Registrar compras, transferencias, producción o merma y pulsar **Actualizar**; el stock esperado cambia sin editar el conteo.
6. Iniciar conteo, ingresar cantidades físicas y enviar.
7. Comprobar que el usuario del área ya no puede modificarlo.
8. Ingresar como Administración (`admin@parkplaza.com`), revisar diferencia y cerrar.
9. Para corregir, escribir un motivo y reabrir; volver a enviar y cerrar como nueva revisión.
10. Programar el siguiente turno y comprobar que toma el cierre físico anterior y solo los movimientos posteriores al corte.

## Pruebas automáticas

```powershell
npm run test:operational-inventory
```

La suite cubre apertura, ausencia de cierre previo, exclusión mutua, entradas durante turno, envío inmutable, cierre, reapertura auditada, cambio de turno sin mezcla, trazabilidad y rollback.
