-- Corrige las recetas heredadas importadas después de la migración técnica 006.
-- La cantidad heredada ya está expresada en la unidad base del producto.
ALTER TABLE inventory_recipe_ingredients DISABLE TRIGGER trg_protect_technical_recipe_ingredient;
UPDATE inventory_recipe_ingredients
SET base_quantity = quantity
WHERE base_quantity <= 0 AND quantity > 0;
UPDATE inventory_recipe_ingredients ri
SET unit_cost_snapshot = p.average_cost,
    line_cost = ROUND(ri.base_quantity * p.average_cost * (1 + ri.technical_waste_percent / 100), 6)
FROM inventory_products p
WHERE p.id = ri.product_id;
ALTER TABLE inventory_recipe_ingredients ENABLE TRIGGER trg_protect_technical_recipe_ingredient;

ALTER TABLE inventory_recipe_versions DISABLE TRIGGER trg_protect_technical_recipe_version;
UPDATE inventory_recipe_versions rv
SET yield_unit_id = COALESCE(rv.yield_unit_id, (SELECT id FROM inventory_units WHERE code='UNIT' LIMIT 1))
WHERE rv.yield_unit_id IS NULL;
WITH costs AS (
  SELECT rv.id, COALESCE(SUM(ri.line_cost), 0) total
  FROM inventory_recipe_versions rv
  LEFT JOIN inventory_recipe_ingredients ri ON ri.recipe_version_id = rv.id
  GROUP BY rv.id
)
UPDATE inventory_recipe_versions rv
SET total_cost = ROUND(costs.total, 6),
    cost_per_portion = ROUND(costs.total / rv.yield_quantity, 6),
    margin_amount = ROUND(rv.sale_price - costs.total / rv.yield_quantity, 6),
    margin_percent = CASE WHEN rv.sale_price > 0 THEN ROUND((rv.sale_price-costs.total/rv.yield_quantity)/rv.sale_price*100,4) ELSE 0 END,
    cost_percent = CASE WHEN rv.sale_price > 0 THEN ROUND((costs.total/rv.yield_quantity)/rv.sale_price*100,4) ELSE 0 END,
    metadata = rv.metadata || '{"baseQuantityStabilized":true}'::jsonb,
    updated_at = NOW()
FROM costs WHERE costs.id = rv.id;
ALTER TABLE inventory_recipe_versions ENABLE TRIGGER trg_protect_technical_recipe_version;
