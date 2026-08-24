CREATE TABLE bar_bottles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  bottle_type VARCHAR(20) NOT NULL CHECK (bottle_type IN ('SPIRIT','WINE','OTHER')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN','CLOSED','EMPTY','ARCHIVED')),
  nominal_content_ml NUMERIC(18,6) NOT NULL CHECK (nominal_content_ml > 0),
  initial_content_ml NUMERIC(18,6) NOT NULL CHECK (initial_content_ml > 0),
  expected_content_ml NUMERIC(18,6) NOT NULL CHECK (expected_content_ml >= 0),
  physical_content_ml NUMERIC(18,6),
  density_kg_per_l NUMERIC(18,8),
  tare_grams NUMERIC(18,6),
  unit_cost_per_ml NUMERIC(18,8) NOT NULL DEFAULT 0,
  opened_by_legacy_user_id BIGINT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by_legacy_user_id BIGINT,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bar_bottle_services (
  id BIGSERIAL PRIMARY KEY,
  bottle_id BIGINT NOT NULL REFERENCES bar_bottles(id) ON DELETE RESTRICT,
  service_type VARCHAR(20) NOT NULL CHECK (service_type IN ('DRINK','WINE_GLASS','SPILL')),
  target_ml NUMERIC(18,6) NOT NULL CHECK (target_ml >= 0),
  measured_ml NUMERIC(18,6) NOT NULL CHECK (measured_ml >= 0),
  tolerance_ml NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (tolerance_ml >= 0),
  result VARCHAR(20) NOT NULL CHECK (result IN ('NORMAL','UNDERPOURED','OVERPOURED','SPILL')),
  cups INTEGER NOT NULL DEFAULT 0 CHECK (cups >= 0),
  notes VARCHAR(500),
  movement_id BIGINT REFERENCES inventory_movements(id),
  served_by_legacy_user_id BIGINT,
  served_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE bar_bottle_measurements (
  id BIGSERIAL PRIMARY KEY,
  bottle_id BIGINT NOT NULL REFERENCES bar_bottles(id) ON DELETE RESTRICT,
  method VARCHAR(20) NOT NULL CHECK (method IN ('VOLUME','WEIGHT')),
  content_ml NUMERIC(18,6) NOT NULL CHECK (content_ml >= 0),
  gross_weight_grams NUMERIC(18,6),
  tare_grams NUMERIC(18,6),
  density_kg_per_l NUMERIC(18,8),
  measured_by_legacy_user_id BIGINT,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes VARCHAR(500)
);
CREATE INDEX idx_bar_bottles_active ON bar_bottles(warehouse_id,status,opened_at DESC);
CREATE INDEX idx_bar_bottle_services_bottle ON bar_bottle_services(bottle_id,served_at DESC);
