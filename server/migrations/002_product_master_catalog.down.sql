DROP VIEW IF EXISTS inventory_fefo_available_lots;
DROP TABLE IF EXISTS inventory_product_cost_history;
DROP INDEX IF EXISTS uq_inventory_presentations_barcode;
ALTER TABLE inventory_presentations DROP COLUMN IF EXISTS purchase_cost, DROP COLUMN IF EXISTS supplier_id, DROP COLUMN IF EXISTS barcode;
DROP INDEX IF EXISTS idx_inventory_products_supplier;
DROP INDEX IF EXISTS idx_inventory_products_status_area;
ALTER TABLE inventory_products
  DROP CONSTRAINT IF EXISTS inventory_products_expiry_requires_lots,
  DROP CONSTRAINT IF EXISTS inventory_products_stock_range,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS density_kg_per_l,
  DROP COLUMN IF EXISTS tolerance_percent,
  DROP COLUMN IF EXISTS track_expiry,
  DROP COLUMN IF EXISTS track_lots,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS default_area_code,
  DROP COLUMN IF EXISTS maximum_stock,
  DROP COLUMN IF EXISTS habitual_supplier_id,
  DROP COLUMN IF EXISTS purchase_unit_id;
ALTER TABLE inventory_products DROP CONSTRAINT inventory_products_product_type_check;
ALTER TABLE inventory_products ADD CONSTRAINT inventory_products_product_type_check
  CHECK (product_type IN ('RAW_MATERIAL', 'PROCESSED', 'INTERMEDIATE', 'PORTION', 'FINISHED', 'PACKAGING', 'BEVERAGE'));
