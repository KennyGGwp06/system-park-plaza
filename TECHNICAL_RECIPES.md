# Recetas técnicas versionadas

La fase 006 incorpora recetas técnicas inmutables para Cocina, Bar y productos intermedios.

## Estados

`BORRADOR → VIGENTE → ARCHIVADA`

- Solo el borrador puede editar ingredientes, rendimiento, precio o vigencia.
- Editar una receta vigente crea una versión nueva en borrador.
- Al activar la nueva versión, la vigente anterior se archiva.
- Versiones vigentes, archivadas y ventas históricas no se eliminan ni sobrescriben.

## Costos

Para cada ingrediente se conserva:

- cantidad y unidad ingresada;
- conversión a unidad base;
- tolerancia operativa;
- merma técnica;
- costo unitario utilizado;
- costo de la línea.

Fórmulas:

`costo línea = cantidad base × (1 + merma técnica %) × costo unitario histórico`

`costo por porción = suma de costos de ingredientes ÷ rendimiento`

`margen = precio de venta - costo por porción`

`margen % = margen ÷ precio × 100`

`porcentaje de costo = costo por porción ÷ precio × 100`

## Productos intermedios y doble consumo

Una receta intermedia exige un producto de salida de tipo `INTERMEDIATE`. Las recetas de venta pueden consumir ese producto ya producido. El servicio recorre las recetas intermedias vigentes y rechaza:

- consumir el intermedio y una materia prima que ya contiene;
- ciclos entre productos intermedios;
- un producto consumiéndose a sí mismo;
- unidades sin conversión específica al producto.

El pedido continúa consumiendo una sola lista de ingredientes embebida. Cuando se activa una receta técnica, esa lista se sincroniza con el menú existente; no se genera un segundo descuento paralelo.

## Ventas históricas

Cada nuevo pedido guarda `recipe_version_id`, costo por porción, precio, margen y porcentaje de costo en `inventory_recipe_sales`. Entregar o cancelar solo cambia su estado, nunca su versión ni costo.

Los pedidos existentes se migran de forma idempotente durante el arranque. Cuando el sistema anterior no guardaba costo técnico, quedan identificados con `costEstimated: true` en metadatos.

## API

- `GET /api/technical-recipes/references`
- `GET /api/technical-recipes`
- `GET /api/technical-recipes/:id`
- `GET /api/technical-recipes/sales`
- `POST /api/technical-recipes`
- `PUT /api/technical-recipes/:id/versions/:versionId`
- `POST /api/technical-recipes/:id/versions`
- `POST /api/technical-recipes/:id/versions/:versionId/activate`
- `POST /api/technical-recipes/:id/versions/:versionId/archive`

La administración de recetas requiere rol `ADMINISTRADOR`.

## Prueba manual

1. Abrir `http://localhost:5173/inventario/recetas` como Administración.
2. Crear una receta de producto de venta o producto intermedio.
3. Ingresar rendimiento, unidad, precio, fecha e ingredientes.
4. Guardar el borrador y revisar costo, margen y porcentaje de costo.
5. Poner la versión vigente.
6. Crear un pedido desde la experiencia del cliente y entregarlo desde Cocina o Bar.
7. Crear una nueva versión después de cambiar el costo de un producto.
8. Comprobar que la venta anterior mantiene la versión y el costo originales.

## Pruebas automatizadas

```powershell
npm run test:technical-recipes
```

Incluyen cocina, bebida, intermedio, unidades incompatibles, doble consumo, cambio de costo, nueva versión, venta histórica, margen, idempotencia y rollback.
