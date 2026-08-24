ALTER TABLE inventory_shift_sessions
  ADD COLUMN area_code VARCHAR(60),
  ADD COLUMN period_started_at TIMESTAMPTZ,
  ADD COLUMN submitted_at TIMESTAMPTZ,
  ADD COLUMN opened_by_legacy_user_id BIGINT,
  ADD COLUMN submitted_by_legacy_user_id BIGINT,
  ADD COLUMN closed_by_legacy_user_id BIGINT,
  ADD COLUMN reopened_by_legacy_user_id BIGINT,
  ADD COLUMN reopened_at TIMESTAMPTZ,
  ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  ADD COLUMN opening_source VARCHAR(30) CHECK (opening_source IN ('PREVIOUS_CLOSE','OPENING_COUNT')),
  ADD COLUMN previous_session_id BIGINT REFERENCES inventory_shift_sessions(id),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE inventory_shift_sessions s
SET area_code=w.area_code,
    period_started_at=COALESCE(s.opened_at,s.created_at),
    submitted_at=CASE WHEN s.status IN ('SUBMITTED','OBSERVED','APPROVED','CLOSED','REOPENED') THEN COALESCE(s.closed_at,s.created_at) END
FROM inventory_warehouses w
WHERE w.id=s.warehouse_id;

ALTER TABLE inventory_shift_sessions ALTER COLUMN area_code SET NOT NULL;

CREATE UNIQUE INDEX uq_inventory_active_session_per_warehouse
  ON inventory_shift_sessions(warehouse_id)
  WHERE status IN ('OPEN','OPERATING','COUNTING','SUBMITTED','REOPENED');

CREATE INDEX idx_inventory_shift_sessions_area_date
  ON inventory_shift_sessions(area_code,operational_date DESC,shift_code,status);

CREATE TABLE inventory_shift_opening_lines (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES inventory_shift_sessions(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  opening_quantity NUMERIC(18,6) NOT NULL CHECK (opening_quantity >= 0),
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  source VARCHAR(30) NOT NULL CHECK (source IN ('PREVIOUS_CLOSE','OPENING_COUNT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT(session_id,product_id,lot_id)
);

CREATE TABLE inventory_shift_summary_lines (
  id BIGSERIAL PRIMARY KEY,
  closing_id BIGINT NOT NULL REFERENCES inventory_closings(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  opening_quantity NUMERIC(18,6) NOT NULL,
  confirmed_entries NUMERIC(18,6) NOT NULL DEFAULT 0,
  outbound_transfers NUMERIC(18,6) NOT NULL DEFAULT 0,
  production_entries NUMERIC(18,6) NOT NULL DEFAULT 0,
  theoretical_consumption NUMERIC(18,6) NOT NULL DEFAULT 0,
  waste_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  authorized_adjustments NUMERIC(18,6) NOT NULL DEFAULT 0,
  expected_quantity NUMERIC(18,6) NOT NULL,
  physical_quantity NUMERIC(18,6) NOT NULL CHECK (physical_quantity >= 0),
  variance_quantity NUMERIC(18,6) NOT NULL,
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  variance_cost NUMERIC(18,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT(closing_id,product_id,lot_id)
);

CREATE INDEX idx_inventory_shift_summary_closing ON inventory_shift_summary_lines(closing_id,product_id);
CREATE INDEX idx_inventory_movements_shift_window ON inventory_movements(created_at,from_warehouse_id,to_warehouse_id);

CREATE FUNCTION reject_submitted_shift_count_line_mutation() RETURNS TRIGGER AS $$
DECLARE count_status VARCHAR;
BEGIN
  SELECT status INTO count_status FROM inventory_physical_counts WHERE id=OLD.physical_count_id;
  IF count_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'El conteo enviado es inmutable; reabra el turno y cree una nueva revisión';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shift_count_lines_immutable
BEFORE UPDATE OR DELETE ON inventory_physical_count_lines
FOR EACH ROW EXECUTE FUNCTION reject_submitted_shift_count_line_mutation();

CREATE FUNCTION reject_shift_summary_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El resumen histórico del turno es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shift_summary_immutable
BEFORE UPDATE OR DELETE ON inventory_shift_summary_lines
FOR EACH ROW EXECUTE FUNCTION reject_shift_summary_mutation();
