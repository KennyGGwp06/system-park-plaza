# Compras y recepción física

## Resultado implementado

El módulo separa la orden de compra de la mercancía que realmente llegó:

`ORDEN → PENDIENTE DE RECEPCIÓN → RECEPCIÓN FÍSICA → VERIFICACIÓN → INGRESO A ALMACÉN → COSTO PROMEDIO → KARDEX`

Crear una orden no cambia existencias. Una recepción en borrador tampoco cambia existencias. El movimiento se genera únicamente al contabilizar una recepción previamente verificada.

## Reglas de negocio

- La cantidad pedida y la recibida se conservan por separado.
- Una orden puede recibirse parcialmente en documentos diferentes.
- Un producto puede dividirse en varios lotes y vencimientos dentro de una misma recepción.
- La medición puede ser directa, por peso/volumen total o por mediciones individuales.
- En medición individual, el backend suma las mediciones; esa suma es la cantidad base real que ingresa al inventario.
- Un producto rechazado queda documentado, pero no aumenta stock ni cambia costo.
- Los productos con control de lote o vencimiento exigen esos datos antes de aceptar mercancía.
- La diferencia se guarda como `cantidad real - cantidad teórica`.
- El costo de una presentación se convierte a costo por unidad base antes de valorizar.
- Promedio ponderado: `(stock anterior × costo anterior + cantidad aceptada × costo recibido) / stock resultante`.
- Cada partida aceptada genera un movimiento idempotente en kardex.
- Una recepción contabilizada y sus líneas verificadas son inmutables.
- El flujo antiguo que copiaba lo comprado al stock devuelve HTTP `410 Gone`.

## Persistencia

La migración `003_purchasing_receiving` amplía:

- `inventory_purchase_orders`
- `inventory_purchase_order_lines`
- `inventory_goods_receipts`
- `inventory_goods_receipt_lines`

Los movimientos se registran en `inventory_movements`, los costos históricos en `inventory_product_cost_history`, los lotes en `inventory_lots`, las existencias en `inventory_stock_balances` y la auditoría en `inventory_audit_events`.

## Endpoints

- `GET /api/purchasing/references`
- `GET /api/purchasing/orders`
- `GET /api/purchasing/orders/:id`
- `POST /api/purchasing/orders`
- `POST /api/purchasing/orders/:id/receipts`
- `POST /api/purchasing/receipts/:id/verify`
- `POST /api/purchasing/receipts/:id/post`

Las acciones de escritura requieren rol `ADMINISTRADOR`. Los endpoints antiguos `POST /api/compras` y `PATCH /api/compras/:id/receive` quedan retirados para impedir ingresos automáticos.

## Prueba manual

1. Abre `http://localhost:5173/login`.
2. Ingresa con `admin@parkplaza.com` y la contraseña del demo.
3. Entra a **Inventario → Compras**.
4. Crea una orden seleccionando proveedor, producto, presentación, cantidad y costo.
5. Comprueba que el stock todavía no cambió.
6. Pulsa **Registrar recepción**.
7. Selecciona almacén y registra lo que llegó. Para productos variables selecciona **Mediciones individuales** y escribe valores separados por coma.
8. Si existen dos lotes, usa **Agregar lote** y coloca lote/vencimiento distinto en cada fila.
9. Guarda el borrador y pulsa **Verificar**.
10. Comprueba nuevamente que el stock todavía no cambió.
11. Pulsa **Ingresar a almacén**.
12. Revisa que la orden cambie a recepción parcial o completa y que muestre el número de movimiento de kardex.
13. Abre **Inventario/Kardex** para comprobar la entrada y el costo histórico.

## Pruebas automatizadas

```powershell
npm run test:purchasing --workspace server
```

La suite crea un esquema PostgreSQL aislado, ejecuta las migraciones y valida:

- recepción completa;
- recepción parcial;
- diferencia teórica/real;
- rechazo sin movimiento;
- dos lotes con vencimientos distintos;
- diez pollos con pesos individuales y suma real;
- promedio ponderado;
- movimiento en kardex;
- inmutabilidad y rollback.

## Docker Desktop

```powershell
docker compose up -d --build backend frontend
docker compose ps
```

Si `docker` no está agregado al `PATH` en esta instalación:

```powershell
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" compose up -d --build backend frontend
```
