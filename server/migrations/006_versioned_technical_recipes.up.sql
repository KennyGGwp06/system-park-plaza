ALTER TABLE inventory_recipes
  ADD COLUMN recipe_type VARCHAR(25) NOT NULL DEFAULT 'MENU' CHECK (recipe_type IN ('MENU','INTERMEDIATE')),
  ADD COLUMN output_product_id BIGINT REFERENCES inventory_products(id),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD CONSTRAINT inventory_recipe_output_required CHECK (
    (recipe_type='MENU') OR (recipe_type='INTERMEDIATE' AND output_product_id IS NOT NULL)
  );

CREATE UNIQUE INDEX uq_inventory_recipe_output_product
  ON inventory_recipes(output_product_id) WHERE output_product_id IS NOT NULL AND active;

ALTER TABLE inventory_recipe_versions
  ADD COLUMN sale_price NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  ADD COLUMN total_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  ADD COLUMN cost_per_portion NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (cost_per_portion >= 0),
  ADD COLUMN margin_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  ADD COLUMN cost_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  ADD COLUMN created_by_legacy_user_id BIGINT,
  ADD COLUMN activated_by_legacy_user_id BIGINT,
  ADD COLUMN archived_by_legacy_user_id BIGINT,
  ADD COLUMN activated_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE inventory_recipe_versions rv
SET sale_price=COALESCE((rv.metadata->>'price')::numeric,0),
    activated_at=CASE WHEN rv.status='ACTIVE' THEN rv.valid_from END;

ALTER TABLE inventory_recipe_ingredients
  ADD COLUMN technical_waste_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (technical_waste_percent BETWEEN 0 AND 100),
  ADD COLUMN base_quantity NUMERIC(18,9) NOT NULL DEFAULT 0 CHECK (base_quantity >= 0),
  ADD COLUMN unit_cost_snapshot NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost_snapshot >= 0),
  ADD COLUMN line_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (line_cost >= 0);

UPDATE inventory_recipe_ingredients SET base_quantity=quantity WHERE base_quantity=0;

UPDATE inventory_recipe_ingredients ri
SET unit_cost_snapshot=p.average_cost,
    line_cost=ROUND(ri.base_quantity*p.average_cost*(1+ri.technical_waste_percent/100),6)
FROM inventory_products p WHERE p.id=ri.product_id;

WITH costs AS (
  SELECT rv.id,COALESCE(SUM(ri.line_cost),0) total
  FROM inventory_recipe_versions rv LEFT JOIN inventory_recipe_ingredients ri ON ri.recipe_version_id=rv.id
  GROUP BY rv.id
)
UPDATE inventory_recipe_versions rv
SET total_cost=ROUND(costs.total,6),
    cost_per_portion=ROUND(costs.total/rv.yield_quantity,6),
    margin_amount=ROUND(rv.sale_price-costs.total/rv.yield_quantity,6),
    margin_percent=CASE WHEN rv.sale_price>0 THEN ROUND((rv.sale_price-costs.total/rv.yield_quantity)/rv.sale_price*100,4) ELSE 0 END,
    cost_percent=CASE WHEN rv.sale_price>0 THEN ROUND((costs.total/rv.yield_quantity)/rv.sale_price*100,4) ELSE 0 END
FROM costs WHERE costs.id=rv.id;

CREATE TABLE inventory_recipe_sales (
  id BIGSERIAL PRIMARY KEY,
  legacy_order_id BIGINT NOT NULL,
  legacy_order_code VARCHAR(80),
  legacy_menu_item_id BIGINT NOT NULL,
  recipe_version_id BIGINT NOT NULL REFERENCES inventory_recipe_versions(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  recipe_unit_cost NUMERIC(18,6) NOT NULL CHECK (recipe_unit_cost >= 0),
  total_recipe_cost NUMERIC(18,6) NOT NULL CHECK (total_recipe_cost >= 0),
  sale_unit_price NUMERIC(18,6) NOT NULL CHECK (sale_unit_price >= 0),
  total_sale NUMERIC(18,6) NOT NULL CHECK (total_sale >= 0),
  margin_amount NUMERIC(18,6) NOT NULL,
  cost_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','CONSUMED','CANCELLED')),
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(legacy_order_id,legacy_menu_item_id)
);

CREATE INDEX idx_inventory_recipe_sales_version ON inventory_recipe_sales(recipe_version_id,created_at DESC);
CREATE INDEX idx_inventory_recipe_versions_recipe_status ON inventory_recipe_versions(recipe_id,status,version DESC);

CREATE FUNCTION protect_technical_recipe_version() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('ACTIVE','ARCHIVED') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Una versión vigente o archivada no puede eliminarse'; END IF;
    IF OLD.status='ACTIVE' AND NEW.status='ARCHIVED'
      AND NEW.recipe_id=OLD.recipe_id AND NEW.version=OLD.version
      AND NEW.yield_quantity=OLD.yield_quantity AND NEW.yield_unit_id IS NOT DISTINCT FROM OLD.yield_unit_id
      AND NEW.sale_price=OLD.sale_price AND NEW.total_cost=OLD.total_cost
      AND NEW.cost_per_portion=OLD.cost_per_portion AND NEW.margin_amount=OLD.margin_amount
      AND NEW.margin_percent=OLD.margin_percent AND NEW.cost_percent=OLD.cost_percent
      AND NEW.valid_from=OLD.valid_from AND NEW.created_by_legacy_user_id IS NOT DISTINCT FROM OLD.created_by_legacy_user_id
      AND NEW.activated_by_legacy_user_id IS NOT DISTINCT FROM OLD.activated_by_legacy_user_id
      AND NEW.metadata=OLD.metadata THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'La versión vigente es inmutable; cree una versión nueva';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_technical_recipe_version
BEFORE UPDATE OR DELETE ON inventory_recipe_versions
FOR EACH ROW EXECUTE FUNCTION protect_technical_recipe_version();

CREATE FUNCTION protect_technical_recipe_ingredient() RETURNS TRIGGER AS $$
DECLARE version_status VARCHAR;
BEGIN
  SELECT status INTO version_status FROM inventory_recipe_versions WHERE id=OLD.recipe_version_id;
  IF version_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Los ingredientes de una versión vigente son inmutables';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_technical_recipe_ingredient
BEFORE UPDATE OR DELETE ON inventory_recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION protect_technical_recipe_ingredient();

CREATE FUNCTION protect_recipe_sale_costs() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las ventas históricas de recetas no pueden eliminarse'; END IF;
  IF NEW.legacy_order_id<>OLD.legacy_order_id OR NEW.legacy_menu_item_id<>OLD.legacy_menu_item_id
    OR NEW.recipe_version_id<>OLD.recipe_version_id OR NEW.quantity<>OLD.quantity
    OR NEW.recipe_unit_cost<>OLD.recipe_unit_cost OR NEW.total_recipe_cost<>OLD.total_recipe_cost
    OR NEW.sale_unit_price<>OLD.sale_unit_price OR NEW.total_sale<>OLD.total_sale
    OR NEW.margin_amount<>OLD.margin_amount OR NEW.cost_percent<>OLD.cost_percent THEN
    RAISE EXCEPTION 'La versión y el costo histórico de una venta son inmutables';
  END IF;
  IF OLD.status IN ('CONSUMED','CANCELLED') AND NEW.status<>OLD.status THEN
    RAISE EXCEPTION 'La venta finalizada no puede cambiar de estado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_recipe_sale_costs
BEFORE UPDATE OR DELETE ON inventory_recipe_sales
FOR EACH ROW EXECUTE FUNCTION protect_recipe_sale_costs();
