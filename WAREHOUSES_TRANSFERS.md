# Almacenes y transferencias confirmadas

## Ubicaciones

- `GENERAL`: Almacén general.
- `RESTAURANTE`: Cocina.
- `BARTENDER`: Bar.
- `TRANSIT`: existencia enviada y todavía no confirmada.
- `DISCREPANCY`: faltantes físicos que deben investigarse.

Las dos últimas ubicaciones son contables y no aparecen como destinos seleccionables.

## Rutas permitidas

- Almacén general → Cocina.
- Almacén general → Bar.
- Cocina → Bar.
- Bar → Cocina.

La base de datos y el backend rechazan cualquier otra combinación.

## Estados

- `DRAFT`: borrador; stock comprometido, pero todavía permanece físicamente en el origen.
- `SENT`: enviada; el stock salió del origen y se encuentra en Tránsito.
- `RECEIVED`: cantidad recibida igual a la enviada.
- `RECEIVED_WITH_DIFFERENCE`: cantidad real distinta; se crea una alerta.
- `REJECTED`: el destino rechazó la transferencia y el stock regresó al origen.
- `CANCELLED`: borrador cancelado antes de enviar; la reserva se libera.

## Definiciones de stock

- Físico: existencia `on_hand` en una ubicación.
- Comprometido: existencia reservada por transferencias en borrador.
- Disponible: `físico - comprometido`.
- En tránsito: existencia retirada del origen mediante `TRANSFER_DISPATCH`, alojada temporalmente en `TRANSIT`.
- Diferencia: faltante trasladado mediante `TRANSFER_SHORTAGE` a `DISCREPANCY`.

## Movimientos contables

- Envío: origen → Tránsito (`TRANSFER_DISPATCH`).
- Recepción conforme: Tránsito → destino (`TRANSFER_RECEIPT`).
- Recepción menor: cantidad real a destino y faltante a Diferencias (`TRANSFER_SHORTAGE`).
- Recepción mayor: cantidad enviada desde Tránsito y sobrante físico auditado al destino (`TRANSFER_OVERAGE`).
- Rechazo: Tránsito → almacén de origen (`TRANSFER_REJECT_RETURN`).

Crear o cancelar un borrador no cambia existencia física: crea/libera una reserva y registra auditoría. No se fabrica un movimiento de cantidad porque todavía no hubo traslado físico.

## Separación de responsabilidades

- Administración puede emitir desde cualquier almacén.
- Cocina puede emitir desde Cocina y recibir en Cocina.
- Bar puede emitir desde Bar y recibir en Bar.
- El usuario que envió no puede confirmar ni rechazar por el receptor.
- Cada confirmación registra usuario, fecha/hora y turno.
- El receptor debe introducir la cantidad real de todas las líneas.
- La cabecera se bloquea con `SELECT ... FOR UPDATE`; dos recepciones simultáneas no pueden contabilizar dos veces.
- Los movimientos usan claves de idempotencia por línea.

## Alertas

Una cantidad menor crea alerta `SHORTAGE`; una mayor crea `OVERAGE`. La alerta guarda cantidad enviada, recibida, diferencia, gravedad, usuario y fecha. Una diferencia igual o mayor al 10% o a una unidad se considera crítica.

## Endpoints

- `GET /api/transfers/references`
- `GET /api/transfers/stock`
- `GET /api/transfers`
- `GET /api/transfers/:id`
- `POST /api/transfers`
- `POST /api/transfers/:id/send`
- `POST /api/transfers/:id/receive`
- `POST /api/transfers/:id/reject`
- `POST /api/transfers/:id/cancel`

## Prueba manual

1. Abre `http://localhost:5173/transferencias` como Administración.
2. Crea un borrador desde Almacén general hacia Cocina o Bar.
3. Comprueba que la cantidad aparece como comprometida y disminuye el disponible, pero el físico no cambia.
4. Pulsa **Enviar**; el físico disminuye en el origen y aumenta en Tránsito.
5. Cierra sesión.
6. Ingresa como `restaurante@parkplaza.com` para destino Cocina o `bartender@parkplaza.com` para destino Bar.
7. Abre **Transferencias** y pulsa **Confirmar recepción**.
8. Introduce la cantidad que llegó realmente.
9. Si coincide, la transferencia termina como Recibida.
10. Si es menor o mayor, termina como Recibida con diferencia y muestra una alerta.
11. Comprueba que Tránsito quedó en cero y revisa los movimientos en Kardex.

Para probar rechazo, indica un motivo y pulsa **Rechazar todo**. Para probar cancelación, cancela mientras todavía sea borrador.

## Pruebas automatizadas

```powershell
npm run test:transfers --workspace server
```

La suite utiliza un esquema PostgreSQL aislado y valida transferencia correcta, menor cantidad, mayor cantidad, rechazo, cancelación, recepción doble, concurrencia de dos receptores, separación emisor/receptor, movimientos, tránsito y rollback.
