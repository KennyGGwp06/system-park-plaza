ALTER TABLE inventory_products DROP CONSTRAINT inventory_products_product_type_check;
ALTER TABLE inventory_products ADD CONSTRAINT inventory_products_product_type_check
  CHECK (product_type IN ('RAW_MATERIAL', 'PROCESSED', 'INTERMEDIATE', 'PORTION', 'BEVERAGE', 'SUPPLY', 'FINISHED', 'PACKAGING'));

ALTER TABLE inventory_products
  ADD COLUMN purchase_unit_id BIGINT REFERENCES inventory_units(id),
  ADD COLUMN habitual_supplier_id BIGINT REFERENCES inventory_suppliers(id),
  ADD COLUMN maximum_stock NUMERIC(18,6) CHECK (maximum_stock IS NULL OR maximum_stock >= 0),
  ADD COLUMN default_area_code VARCHAR(40),
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  ADD COLUMN track_lots BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (tolerance_percent BETWEEN 0 AND 100),
  ADD COLUMN density_kg_per_l NUMERIC(18,9) CHECK (density_kg_per_l IS NULL OR density_kg_per_l > 0),
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD CONSTRAINT inventory_products_stock_range CHECK (maximum_stock IS NULL OR maximum_stock >= minimum_stock),
  ADD CONSTRAINT inventory_products_expiry_requires_lots CHECK (NOT track_expiry OR track_lots);

CREATE INDEX idx_inventory_products_status_area ON inventory_products(status, default_area_code);
CREATE INDEX idx_inventory_products_supplier ON inventory_products(habitual_supplier_id);

ALTER TABLE inventory_presentations
  ADD COLUMN barcode VARCHAR(80),
  ADD COLUMN supplier_id BIGINT REFERENCES inventory_suppliers(id),
  ADD COLUMN purchase_cost NUMERIC(18,6) CHECK (purchase_cost IS NULL OR purchase_cost >= 0);

CREATE UNIQUE INDEX uq_inventory_presentations_barcode ON inventory_presentations(barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE inventory_product_cost_history (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  previous_cost NUMERIC(18,6) NOT NULL CHECK (previous_cost >= 0),
  new_cost NUMERIC(18,6) NOT NULL CHECK (new_cost >= 0),
  valuation_method VARCHAR(30) NOT NULL CHECK (valuation_method IN ('INITIAL', 'MANUAL', 'WEIGHTED_AVERAGE')),
  received_quantity NUMERIC(18,6),
  receipt_unit_cost NUMERIC(18,6),
  source_type VARCHAR(60),
  source_id BIGINT,
  actor_legacy_user_id BIGINT,
  reason VARCHAR(500) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_cost_history_product_date ON inventory_product_cost_history(product_id, effective_at DESC);

INSERT INTO inventory_units(code, name, symbol, dimension, decimal_places) VALUES
  ('G', 'Gramo', 'g', 'MASS', 3),
  ('L', 'Litro', 'l', 'VOLUME', 3),
  ('BOTTLE', 'Botella', 'bot', 'COUNT', 0),
  ('BOX', 'Caja', 'caja', 'COUNT', 0),
  ('PACK', 'Paquete', 'paq', 'COUNT', 0)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol;

INSERT INTO inventory_categories(code, name) VALUES
  ('RAW_MATERIALS', 'Materias primas'),
  ('PROCESSED', 'Procesados'),
  ('BEVERAGES', 'Bebidas'),
  ('SUPPLIES', 'Insumos'),
  ('FINISHED', 'Productos terminados')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

UPDATE inventory_products p SET
  purchase_unit_id = COALESCE(p.purchase_unit_id, p.base_unit_id),
  default_area_code = COALESCE(p.default_area_code, p.metadata->>'legacyArea', 'GENERAL'),
  status = CASE WHEN p.active THEN 'ACTIVE' ELSE 'INACTIVE' END
WHERE p.purchase_unit_id IS NULL OR p.default_area_code IS NULL;

INSERT INTO inventory_product_cost_history(product_id, previous_cost, new_cost, valuation_method, reason, effective_at)
SELECT id, average_cost, average_cost, 'INITIAL', 'Costo inicial migrado', created_at
FROM inventory_products
ON CONFLICT DO NOTHING;

CREATE VIEW inventory_fefo_available_lots AS
SELECT
  l.id AS lot_id,
  l.product_id,
  l.lot_code,
  l.expires_on,
  l.unit_cost,
  b.warehouse_id,
  b.on_hand,
  b.reserved,
  b.on_hand - b.reserved AS available
FROM inventory_lots l
JOIN inventory_stock_balances b ON b.lot_id = l.id
WHERE l.status = 'AVAILABLE' AND b.on_hand - b.reserved > 0
ORDER BY l.product_id, l.expires_on ASC NULLS LAST, l.created_at ASC;
