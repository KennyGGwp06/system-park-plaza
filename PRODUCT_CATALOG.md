# Catálogo maestro de productos y unidades

## Ruta administrativa

```text
http://localhost:5173/inventario/catalogo
```

Solamente el rol `ADMINISTRADOR` puede crear, modificar o archivar productos, unidades y categorías. Restaurante y bartender pueden seguir consultando el inventario operativo, pero el backend devuelve `403` si intentan modificar el catálogo maestro.

## Tipos soportados

- `RAW_MATERIAL`: materia prima.
- `PROCESSED`: procesado.
- `INTERMEDIATE`: intermedio.
- `PORTION`: porcionado.
- `BEVERAGE`: bebida.
- `SUPPLY`: insumo.
- `FINISHED`: producto terminado.

## Reglas de conversión

- Todo producto tiene una unidad base y una unidad de compra.
- Toda presentación tiene un factor positivo hacia la unidad base.
- Las unidades de la misma dimensión pueden convertirse mediante un factor, por ejemplo `1 kg = 1,000 g`.
- Una presentación contable puede expresar contenido específico, por ejemplo `1 botella = 750 ml` o `1 caja = 24 unidades`.
- Masa y volumen no se convierten sin densidad o conversión específica del producto.
- La unidad base no puede cambiar cuando el producto ya tiene movimientos.

## Costos

`POST /api/catalog/products/:id/cost-receipt` registra una recepción valorizada y calcula:

```text
nuevo promedio =
(stock anterior × costo anterior + cantidad recibida × costo recibido)
÷
(stock anterior + cantidad recibida)
```

El movimiento conserva su costo unitario original. Las ediciones posteriores del costo maestro crean registros en `inventory_product_cost_history` y no modifican movimientos anteriores.

## FEFO

Para productos con lote y vencimiento:

```http
GET /api/catalog/products/:id/fefo?quantity=10
```

La respuesta asigna primero los lotes con fecha de vencimiento más próxima y deja los lotes sin vencimiento al final.

## Endpoints

- `GET /api/catalog/references`
- `GET /api/catalog/products`
- `GET /api/catalog/products/:id`
- `POST /api/catalog/products`
- `PUT /api/catalog/products/:id`
- `PATCH /api/catalog/products/:id/archive`
- `POST /api/catalog/products/:id/cost-receipt`
- `GET /api/catalog/products/:id/fefo`
- `POST /api/catalog/units`
- `POST /api/catalog/categories`

## Pruebas

```powershell
npm run test:product-catalog
npm run build --workspace client
```

Las pruebas usan un esquema PostgreSQL aislado, crean productos por peso, líquido y unidades, validan costos, FEFO y archivado, ejecutan el rollback de `002` y eliminan el esquema temporal.
