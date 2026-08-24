DROP TRIGGER IF EXISTS trg_protect_recipe_sale_costs ON inventory_recipe_sales;
DROP FUNCTION IF EXISTS protect_recipe_sale_costs();
DROP TRIGGER IF EXISTS trg_protect_technical_recipe_ingredient ON inventory_recipe_ingredients;
DROP FUNCTION IF EXISTS protect_technical_recipe_ingredient();
DROP TRIGGER IF EXISTS trg_protect_technical_recipe_version ON inventory_recipe_versions;
DROP FUNCTION IF EXISTS protect_technical_recipe_version();
DROP INDEX IF EXISTS idx_inventory_recipe_versions_recipe_status;
DROP TABLE IF EXISTS inventory_recipe_sales;

ALTER TABLE inventory_recipe_ingredients
  DROP COLUMN IF EXISTS line_cost,
  DROP COLUMN IF EXISTS unit_cost_snapshot,
  DROP COLUMN IF EXISTS base_quantity,
  DROP COLUMN IF EXISTS technical_waste_percent;

ALTER TABLE inventory_recipe_versions
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS activated_at,
  DROP COLUMN IF EXISTS archived_by_legacy_user_id,
  DROP COLUMN IF EXISTS activated_by_legacy_user_id,
  DROP COLUMN IF EXISTS created_by_legacy_user_id,
  DROP COLUMN IF EXISTS cost_percent,
  DROP COLUMN IF EXISTS margin_percent,
  DROP COLUMN IF EXISTS margin_amount,
  DROP COLUMN IF EXISTS cost_per_portion,
  DROP COLUMN IF EXISTS total_cost,
  DROP COLUMN IF EXISTS sale_price;

DROP INDEX IF EXISTS uq_inventory_recipe_output_product;
ALTER TABLE inventory_recipes DROP CONSTRAINT IF EXISTS inventory_recipe_output_required;
ALTER TABLE inventory_recipes
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS output_product_id,
  DROP COLUMN IF EXISTS recipe_type;
