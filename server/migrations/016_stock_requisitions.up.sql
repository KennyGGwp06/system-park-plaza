CREATE TABLE inventory_stock_requests (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  area_code VARCHAR(30) NOT NULL CHECK (area_code IN ('RESTAURANTE','BARTENDER')),
  status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED','CANCELLED')),
  requested_by_legacy_user_id BIGINT,
  reviewed_by_legacy_user_id BIGINT,
  transfer_id BIGINT REFERENCES inventory_transfers(id),
  observation TEXT,
  review_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_stock_request_lines (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES inventory_stock_requests(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  requested_quantity NUMERIC(18,6) NOT NULL CHECK (requested_quantity > 0),
  approved_quantity NUMERIC(18,6) CHECK (approved_quantity >= 0),
  observation TEXT,
  UNIQUE(request_id, product_id)
);

CREATE INDEX idx_stock_requests_area_status ON inventory_stock_requests(area_code,status,requested_at DESC);

