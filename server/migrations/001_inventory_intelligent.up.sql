CREATE TABLE inventory_categories (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_units (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('MASS', 'VOLUME', 'COUNT', 'LENGTH', 'OTHER')),
  decimal_places SMALLINT NOT NULL DEFAULT 3 CHECK (decimal_places BETWEEN 0 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_products (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category_id BIGINT REFERENCES inventory_categories(id),
  base_unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  product_type VARCHAR(30) NOT NULL DEFAULT 'RAW_MATERIAL' CHECK (product_type IN ('RAW_MATERIAL', 'PROCESSED', 'INTERMEDIATE', 'PORTION', 'FINISHED', 'PACKAGING', 'BEVERAGE')),
  minimum_stock NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  average_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_products_category ON inventory_products(category_id);
CREATE INDEX idx_inventory_products_name ON inventory_products(name);

CREATE TABLE inventory_presentations (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  conversion_factor NUMERIC(18,9) NOT NULL CHECK (conversion_factor > 0),
  is_purchase_unit BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, code)
);

CREATE TABLE inventory_product_conversions (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES inventory_products(id),
  from_unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  to_unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  factor NUMERIC(18,9) NOT NULL CHECK (factor > 0),
  reason VARCHAR(250),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_unit_id <> to_unit_id),
  UNIQUE NULLS NOT DISTINCT(product_id, from_unit_id, to_unit_id)
);

CREATE FUNCTION validate_inventory_conversion() RETURNS TRIGGER AS $$
DECLARE
  from_dimension VARCHAR(20);
  to_dimension VARCHAR(20);
BEGIN
  SELECT dimension INTO from_dimension FROM inventory_units WHERE id = NEW.from_unit_id;
  SELECT dimension INTO to_dimension FROM inventory_units WHERE id = NEW.to_unit_id;
  IF from_dimension <> to_dimension AND NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'Las conversiones entre dimensiones requieren un producto específico';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_inventory_conversion
BEFORE INSERT OR UPDATE ON inventory_product_conversions
FOR EACH ROW EXECUTE FUNCTION validate_inventory_conversion();

CREATE TABLE inventory_warehouses (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  warehouse_type VARCHAR(25) NOT NULL CHECK (warehouse_type IN ('GENERAL', 'OPERATIONAL', 'IN_TRANSIT', 'WASTE')),
  area_code VARCHAR(40),
  allows_negative BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_suppliers (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  tax_id VARCHAR(30),
  name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(160),
  phone VARCHAR(40),
  email VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_inventory_suppliers_tax_id ON inventory_suppliers(tax_id) WHERE tax_id IS NOT NULL AND tax_id <> '';

CREATE TABLE inventory_lots (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  supplier_id BIGINT REFERENCES inventory_suppliers(id),
  lot_code VARCHAR(100) NOT NULL,
  manufactured_on DATE,
  expires_on DATE,
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'QUARANTINE', 'BLOCKED', 'EXPIRED', 'CONSUMED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_on IS NULL OR manufactured_on IS NULL OR expires_on >= manufactured_on),
  UNIQUE(product_id, lot_code)
);

CREATE INDEX idx_inventory_lots_fefo ON inventory_lots(product_id, expires_on) WHERE status = 'AVAILABLE';

CREATE TABLE inventory_stock_balances (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  on_hand NUMERIC(18,6) NOT NULL DEFAULT 0,
  reserved NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reserved <= GREATEST(on_hand, 0)),
  UNIQUE NULLS NOT DISTINCT(product_id, warehouse_id, lot_id)
);

CREATE INDEX idx_inventory_stock_product_warehouse ON inventory_stock_balances(product_id, warehouse_id);

CREATE TABLE inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  movement_type VARCHAR(50) NOT NULL,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  from_warehouse_id BIGINT REFERENCES inventory_warehouses(id),
  to_warehouse_id BIGINT REFERENCES inventory_warehouses(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  affects_balance BOOLEAN NOT NULL DEFAULT TRUE,
  source_type VARCHAR(60),
  source_legacy_id BIGINT,
  source_code VARCHAR(120),
  actor_legacy_user_id BIGINT,
  operational_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason VARCHAR(500) NOT NULL,
  reversal_of_id BIGINT REFERENCES inventory_movements(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT affects_balance OR from_warehouse_id IS NOT NULL OR to_warehouse_id IS NOT NULL),
  CHECK (from_warehouse_id IS NULL OR to_warehouse_id IS NULL OR from_warehouse_id <> to_warehouse_id)
);

CREATE INDEX idx_inventory_movements_product_date ON inventory_movements(product_id, operational_date, created_at);
CREATE INDEX idx_inventory_movements_warehouse_from ON inventory_movements(from_warehouse_id, created_at);
CREATE INDEX idx_inventory_movements_warehouse_to ON inventory_movements(to_warehouse_id, created_at);
CREATE INDEX idx_inventory_movements_source ON inventory_movements(source_type, source_legacy_id);

CREATE FUNCTION reject_inventory_movement_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de inventario son inmutables; registre una reversión o compensación';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_movements_immutable
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION reject_inventory_movement_mutation();

CREATE FUNCTION post_inventory_movement(
  p_idempotency_key VARCHAR,
  p_movement_type VARCHAR,
  p_product_id BIGINT,
  p_quantity NUMERIC,
  p_from_warehouse_id BIGINT,
  p_to_warehouse_id BIGINT,
  p_lot_id BIGINT,
  p_unit_cost NUMERIC,
  p_reason VARCHAR,
  p_actor_legacy_user_id BIGINT DEFAULT NULL,
  p_source_type VARCHAR DEFAULT NULL,
  p_source_legacy_id BIGINT DEFAULT NULL,
  p_source_code VARCHAR DEFAULT NULL,
  p_legacy_id BIGINT DEFAULT NULL,
  p_reversal_of_id BIGINT DEFAULT NULL,
  p_allow_negative BOOLEAN DEFAULT FALSE,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT AS $$
DECLARE
  existing_id BIGINT;
  movement_id BIGINT;
  current_qty NUMERIC(18,6);
  negative_authorized BOOLEAN;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  IF p_from_warehouse_id IS NULL AND p_to_warehouse_id IS NULL THEN RAISE EXCEPTION 'Se requiere almacén origen o destino'; END IF;
  IF p_from_warehouse_id IS NOT NULL AND p_from_warehouse_id = p_to_warehouse_id THEN RAISE EXCEPTION 'Origen y destino no pueden ser iguales'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  SELECT id INTO existing_id FROM inventory_movements WHERE idempotency_key = p_idempotency_key;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  negative_authorized := p_allow_negative
    AND p_actor_legacy_user_id IS NOT NULL
    AND LENGTH(TRIM(COALESCE(p_reason, ''))) > 0
    AND COALESCE((p_metadata->>'negative_authorized')::boolean, FALSE);

  IF p_from_warehouse_id IS NOT NULL THEN
    INSERT INTO inventory_stock_balances(product_id, warehouse_id, lot_id)
    VALUES (p_product_id, p_from_warehouse_id, p_lot_id)
    ON CONFLICT (product_id, warehouse_id, lot_id) DO NOTHING;
    SELECT on_hand INTO current_qty
      FROM inventory_stock_balances
      WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id AND lot_id IS NOT DISTINCT FROM p_lot_id
      FOR UPDATE;
    IF current_qty - p_quantity < 0 AND NOT negative_authorized THEN
      RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', current_qty, p_quantity USING ERRCODE = 'P0001';
    END IF;
    UPDATE inventory_stock_balances
      SET on_hand = on_hand - p_quantity, version = version + 1, updated_at = NOW()
      WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id AND lot_id IS NOT DISTINCT FROM p_lot_id;
  END IF;

  IF p_to_warehouse_id IS NOT NULL THEN
    INSERT INTO inventory_stock_balances(product_id, warehouse_id, lot_id)
    VALUES (p_product_id, p_to_warehouse_id, p_lot_id)
    ON CONFLICT (product_id, warehouse_id, lot_id) DO NOTHING;
    PERFORM 1 FROM inventory_stock_balances
      WHERE product_id = p_product_id AND warehouse_id = p_to_warehouse_id AND lot_id IS NOT DISTINCT FROM p_lot_id
      FOR UPDATE;
    UPDATE inventory_stock_balances
      SET on_hand = on_hand + p_quantity, version = version + 1, updated_at = NOW()
      WHERE product_id = p_product_id AND warehouse_id = p_to_warehouse_id AND lot_id IS NOT DISTINCT FROM p_lot_id;
  END IF;

  INSERT INTO inventory_movements(
    legacy_id, idempotency_key, movement_type, product_id, lot_id, from_warehouse_id, to_warehouse_id,
    quantity, unit_cost, source_type, source_legacy_id, source_code, actor_legacy_user_id,
    reason, reversal_of_id, metadata
  ) VALUES (
    p_legacy_id, p_idempotency_key, p_movement_type, p_product_id, p_lot_id, p_from_warehouse_id, p_to_warehouse_id,
    p_quantity, COALESCE(p_unit_cost, 0), p_source_type, p_source_legacy_id, p_source_code, p_actor_legacy_user_id,
    p_reason, p_reversal_of_id, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO movement_id;
  RETURN movement_id;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE inventory_reservations (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  source_type VARCHAR(60) NOT NULL,
  source_legacy_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX idx_inventory_reservations_active ON inventory_reservations(product_id, warehouse_id) WHERE status = 'ACTIVE';

CREATE TABLE inventory_purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(80) NOT NULL UNIQUE,
  supplier_id BIGINT REFERENCES inventory_suppliers(id),
  status VARCHAR(30) NOT NULL CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  ordered_at TIMESTAMPTZ,
  expected_at TIMESTAMPTZ,
  total NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_purchase_order_lines (
  id BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES inventory_purchase_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  presentation_id BIGINT REFERENCES inventory_presentations(id),
  ordered_quantity NUMERIC(18,6) NOT NULL CHECK (ordered_quantity > 0),
  unit_cost NUMERIC(18,6) NOT NULL CHECK (unit_cost >= 0),
  UNIQUE NULLS NOT DISTINCT(purchase_order_id, product_id, presentation_id)
);

CREATE TABLE inventory_goods_receipts (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(80) NOT NULL UNIQUE,
  purchase_order_id BIGINT REFERENCES inventory_purchase_orders(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  status VARCHAR(25) NOT NULL CHECK (status IN ('DRAFT', 'VERIFIED', 'POSTED', 'REJECTED', 'REVERSED')),
  received_by_legacy_user_id BIGINT,
  received_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_goods_receipt_lines (
  id BIGSERIAL PRIMARY KEY,
  goods_receipt_id BIGINT NOT NULL REFERENCES inventory_goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id BIGINT REFERENCES inventory_purchase_order_lines(id),
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  received_quantity NUMERIC(18,6) NOT NULL CHECK (received_quantity >= 0),
  accepted_quantity NUMERIC(18,6) NOT NULL CHECK (accepted_quantity >= 0),
  rejected_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  unit_cost NUMERIC(18,6) NOT NULL CHECK (unit_cost >= 0),
  CHECK (accepted_quantity + rejected_quantity <= received_quantity)
);

CREATE TABLE inventory_transfers (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(80) NOT NULL UNIQUE,
  from_warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  to_warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  status VARCHAR(30) NOT NULL CHECK (status IN ('DRAFT', 'PREPARED', 'SENT', 'IN_TRANSIT', 'RECEIVED', 'RECEIVED_WITH_DIFFERENCE', 'REJECTED', 'CANCELLED')),
  requested_by_legacy_user_id BIGINT,
  sent_by_legacy_user_id BIGINT,
  received_by_legacy_user_id BIGINT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE inventory_transfer_lines (
  id BIGSERIAL PRIMARY KEY,
  transfer_id BIGINT NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  requested_quantity NUMERIC(18,6) NOT NULL CHECK (requested_quantity > 0),
  sent_quantity NUMERIC(18,6) CHECK (sent_quantity >= 0),
  received_quantity NUMERIC(18,6) CHECK (received_quantity >= 0),
  UNIQUE NULLS NOT DISTINCT(transfer_id, product_id, lot_id)
);

CREATE TABLE inventory_recipes (
  id BIGSERIAL PRIMARY KEY,
  legacy_menu_item_id BIGINT UNIQUE,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  area_code VARCHAR(40) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_recipe_versions (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES inventory_recipes(id),
  version INTEGER NOT NULL CHECK (version > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  yield_quantity NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
  yield_unit_id BIGINT REFERENCES inventory_units(id),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(recipe_id, version)
);

CREATE UNIQUE INDEX uq_inventory_recipe_active_version ON inventory_recipe_versions(recipe_id) WHERE status = 'ACTIVE';

CREATE TABLE inventory_recipe_ingredients (
  id BIGSERIAL PRIMARY KEY,
  recipe_version_id BIGINT NOT NULL REFERENCES inventory_recipe_versions(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  consumption_mode VARCHAR(25) NOT NULL DEFAULT 'MAKE_TO_ORDER' CHECK (consumption_mode IN ('MAKE_TO_ORDER', 'PREPRODUCED')),
  waste_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (waste_tolerance_percent BETWEEN 0 AND 100),
  UNIQUE(recipe_version_id, product_id)
);

CREATE TABLE inventory_production_batches (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  code VARCHAR(100) NOT NULL UNIQUE,
  recipe_version_id BIGINT REFERENCES inventory_recipe_versions(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  status VARCHAR(25) NOT NULL CHECK (status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REVERSED')),
  planned_yield NUMERIC(18,6),
  actual_yield NUMERIC(18,6),
  responsible_legacy_user_id BIGINT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_production_inputs (
  id BIGSERIAL PRIMARY KEY,
  production_batch_id BIGINT NOT NULL REFERENCES inventory_production_batches(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  movement_id BIGINT REFERENCES inventory_movements(id)
);

CREATE TABLE inventory_production_outputs (
  id BIGSERIAL PRIMARY KEY,
  production_batch_id BIGINT NOT NULL REFERENCES inventory_production_batches(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  movement_id BIGINT REFERENCES inventory_movements(id)
);

CREATE TABLE inventory_waste_records (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  reason_code VARCHAR(60) NOT NULL,
  detail VARCHAR(500),
  movement_id BIGINT REFERENCES inventory_movements(id),
  responsible_legacy_user_id BIGINT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE inventory_shift_sessions (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  operational_date DATE NOT NULL,
  shift_code VARCHAR(80) NOT NULL,
  responsible_legacy_user_id BIGINT,
  status VARCHAR(25) NOT NULL CHECK (status IN ('PENDING', 'OPEN', 'OPERATING', 'COUNTING', 'SUBMITTED', 'OBSERVED', 'APPROVED', 'CLOSED', 'REOPENED')),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, operational_date, shift_code)
);

CREATE TABLE inventory_physical_counts (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  session_id BIGINT NOT NULL REFERENCES inventory_shift_sessions(id),
  count_number SMALLINT NOT NULL DEFAULT 1 CHECK (count_number > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED')),
  counted_by_legacy_user_id BIGINT,
  counted_at TIMESTAMPTZ,
  notes VARCHAR(500),
  UNIQUE(session_id, count_number)
);

CREATE TABLE inventory_physical_count_lines (
  id BIGSERIAL PRIMARY KEY,
  physical_count_id BIGINT NOT NULL REFERENCES inventory_physical_counts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT REFERENCES inventory_lots(id),
  expected_quantity NUMERIC(18,6) NOT NULL,
  actual_quantity NUMERIC(18,6) NOT NULL CHECK (actual_quantity >= 0),
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  variance_quantity NUMERIC(18,6) GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
  UNIQUE NULLS NOT DISTINCT(physical_count_id, product_id, lot_id)
);

CREATE TABLE inventory_closings (
  id BIGSERIAL PRIMARY KEY,
  legacy_id BIGINT UNIQUE,
  session_id BIGINT NOT NULL REFERENCES inventory_shift_sessions(id),
  physical_count_id BIGINT NOT NULL REFERENCES inventory_physical_counts(id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUBMITTED', 'OBSERVED', 'APPROVED', 'CLOSED', 'REOPENED')),
  variance_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  approved_by_legacy_user_id BIGINT,
  approved_at TIMESTAMPTZ,
  reopen_reason VARCHAR(500),
  previous_closing_id BIGINT REFERENCES inventory_closings(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, revision)
);

CREATE TABLE inventory_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  actor_legacy_user_id BIGINT,
  reason VARCHAR(500),
  before_data JSONB,
  after_data JSONB,
  correlation_id VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_audit_entity ON inventory_audit_events(entity_type, entity_id, created_at);

CREATE TABLE inventory_migration_runs (
  id BIGSERIAL PRIMARY KEY,
  source_name VARCHAR(80) NOT NULL,
  source_checksum VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(source_name, source_checksum)
);
