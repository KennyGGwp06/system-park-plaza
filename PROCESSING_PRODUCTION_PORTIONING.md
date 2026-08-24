# Procesamiento, producción y porcionado

## Alcance implementado

El módulo transforma existencias trazables de Cocina o Bar y registra todas las operaciones en PostgreSQL. Está disponible para Administración, Restaurante y Bartender en `Inventario > Producción y porcionado`.

### Procesamiento

- Consume una cantidad concreta de un lote de origen.
- Exige que la suma de producto aprovechable, subproducto, residuo y merma sea igual a la entrada.
- El producto aprovechable y el subproducto crean productos/lotes de salida reutilizables.
- El residuo y la merma quedan registrados en mermas y kardex como referencias; no descuentan por segunda vez la materia prima.
- Calcula rendimiento, porcentajes aprovechable, subproducto y merma, costo distribuido y alerta de tolerancia.

Fórmulas:

- `rendimiento % = (aprovechable + subproducto) / entrada × 100`
- `aprovechable % = aprovechable / entrada × 100`
- `subproducto % = subproducto / entrada × 100`
- `merma % = (residuo + merma) / entrada × 100`
- Sin distribución manual, el costo se reparte proporcionalmente entre las salidas productivas.

### Producción

- Usa únicamente una versión vigente de una receta técnica intermedia.
- Selecciona lotes de ingredientes con criterio FEFO.
- Consume los ingredientes una vez y crea un lote nuevo del producto intermedio.
- Conserva costo histórico, rendimiento planificado/real y alerta por tolerancia.
- Registra genealogía desde todos los lotes de ingredientes hacia el lote producido.

### Porcionado

- Consume un lote procesado y crea existencias en unidades/porciones.
- Convierte el peso objetivo a la unidad base mediante conversiones válidas.
- Acepta una muestra de pesos; no obliga a pesar todas las porciones.
- Calcula promedio real, porciones completas, sobrante, diferencia y tolerancia.
- El sobrante genera un lote separado y sigue disponible.
- La porción registra la relación con su lote procesado y, recursivamente, con la materia prima original.

## Migración 007

Tablas creadas:

- `inventory_processing_batches`
- `inventory_processing_outputs`
- `inventory_portioning_batches`
- `inventory_portion_weight_samples`
- `inventory_lot_genealogy`
- `inventory_product_lineage_rules`

También amplía `inventory_production_batches` con lote/producto de salida, costos y controles de tolerancia. Las transformaciones completadas, sus detalles, muestras, genealogía y movimientos son inmutables.

La migración 008 vincula las existencias heredadas que todavía no tenían lote a lotes de apertura auditados. La cantidad y el costo total no cambian; únicamente se habilita su trazabilidad para que puedan procesarse.

## API

- `GET /api/transformations/references`
- `GET /api/transformations`
- `GET /api/transformations/lots/:lotId/trace`
- `POST /api/transformations/processing`
- `POST /api/transformations/production`
- `POST /api/transformations/portioning`

## Prueba manual

1. Ingresa como administrador, restaurante o bartender.
2. Abre `Inventario > Producción y porcionado`.
3. En **Procesamiento**, elige un lote, registra la entrada y resultados que sumen exactamente lo mismo.
4. Confirma y revisa el historial, costos y alerta de tolerancia.
5. En **Porcionado**, elige el lote aprovechable, un producto de tipo porcionado, peso objetivo y muestras separadas por coma.
6. Confirma las porciones y el sobrante.
7. En **Historial y trazabilidad**, abre el lote producido para comprobar todos sus antecesores.
8. En **Producción**, elige una receta intermedia vigente y registra rendimiento planificado y real.

Prueba automatizada:

```powershell
npm run test:transformations
```

El escenario automatizado valida: procesamiento con merma, subproducto, porcionado, sobrante, tolerancia, trazabilidad, producción técnica, inmutabilidad y rollback controlado.
