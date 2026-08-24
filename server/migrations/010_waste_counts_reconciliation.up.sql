-- Mermas, explicaciones de variaciones y conciliación teórico-real por turno.
ALTER TABLE inventory_waste_records
  ADD COLUMN IF NOT EXISTS shift_session_id BIGINT REFERENCES inventory_shift_sessions(id),
  ADD COLUMN IF NOT EXISTS unit_id BIGINT REFERENCES inventory_units(id),
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE inventory_shift_summary_lines
  ADD COLUMN IF NOT EXISTS production_consumption NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS derived_actual_consumption NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS unexplained_difference NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS difference_percent NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS difference_cost NUMERIC(18,6);

CREATE TABLE inventory_shift_variance_explanations (
  id BIGSERIAL PRIMARY KEY,
  closing_id BIGINT NOT NULL REFERENCES inventory_closings(id) ON DELETE RESTRICT,
  physical_count_line_id BIGINT NOT NULL REFERENCES inventory_physical_count_lines(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  variance_quantity NUMERIC(18,6) NOT NULL,
  tolerance_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tolerance_percent BETWEEN 0 AND 100),
  reason VARCHAR(500) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_waste_record_id BIGINT REFERENCES inventory_waste_records(id),
  submitted_by_legacy_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(closing_id, physical_count_line_id)
);

CREATE INDEX idx_inventory_waste_session ON inventory_waste_records(shift_session_id, occurred_at DESC);
CREATE INDEX idx_inventory_variance_closing ON inventory_shift_variance_explanations(closing_id);

DROP INDEX IF EXISTS uq_inventory_active_session_per_warehouse;
CREATE UNIQUE INDEX uq_inventory_active_session_per_warehouse
  ON inventory_shift_sessions(warehouse_id)
  WHERE status IN ('OPEN','OPERATING','COUNTING','SUBMITTED','OBSERVED','REOPENED');
