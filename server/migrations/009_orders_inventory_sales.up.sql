CREATE TABLE inventory_order_lines (
  id BIGSERIAL PRIMARY KEY,
  legacy_order_id BIGINT NOT NULL,
  legacy_order_code VARCHAR(80) NOT NULL,
  group_code VARCHAR(80),
  area_code VARCHAR(40) NOT NULL CHECK (area_code IN ('RESTAURANTE','BARTENDER')),
  legacy_menu_item_id BIGINT NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  recipe_version_id BIGINT NOT NULL REFERENCES inventory_recipe_versions(id),
  recipe_version INTEGER NOT NULL CHECK (recipe_version>0),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity>0),
  recipe_unit_cost NUMERIC(18,6) NOT NULL CHECK (recipe_unit_cost>=0),
  sale_unit_price NUMERIC(18,6) NOT NULL CHECK (sale_unit_price>=0),
  total_recipe_cost NUMERIC(18,6) NOT NULL CHECK (total_recipe_cost>=0),
  total_sale NUMERIC(18,6) NOT NULL CHECK (total_sale>=0),
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','COMMITTED','CONSUMED','RELEASED','WASTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(legacy_order_id,legacy_menu_item_id)
);

CREATE TABLE inventory_order_reservations (
  id BIGSERIAL PRIMARY KEY,
  order_line_id BIGINT NOT NULL REFERENCES inventory_order_lines(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  lot_id BIGINT NOT NULL REFERENCES inventory_lots(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity>0),
  unit_cost_snapshot NUMERIC(18,6) NOT NULL CHECK (unit_cost_snapshot>=0),
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','COMMITTED','CONSUMED','RELEASED','WASTED')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  movement_id BIGINT REFERENCES inventory_movements(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(order_line_id,product_id,lot_id)
);

CREATE TABLE inventory_order_events (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  legacy_order_id BIGINT NOT NULL,
  legacy_order_code VARCHAR(80) NOT NULL,
  group_code VARCHAR(80),
  area_code VARCHAR(40) NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  event_type VARCHAR(35) NOT NULL CHECK (event_type IN ('CONFIRM','COMMIT','READY','DELIVER','CANCEL_RELEASE','CANCEL_LOSS','NOOP')),
  actor_legacy_user_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_consolidated_sales (
  id BIGSERIAL PRIMARY KEY,
  legacy_order_id BIGINT NOT NULL UNIQUE,
  legacy_order_code VARCHAR(80) NOT NULL,
  group_code VARCHAR(80),
  area_code VARCHAR(40) NOT NULL,
  gross_total NUMERIC(18,6) NOT NULL CHECK (gross_total>=0),
  theoretical_cost NUMERIC(18,6) NOT NULL CHECK (theoretical_cost>=0),
  margin_amount NUMERIC(18,6) NOT NULL,
  delivered_by_legacy_user_id BIGINT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE inventory_order_cancellation_losses (
  id BIGSERIAL PRIMARY KEY,
  legacy_order_id BIGINT NOT NULL,
  order_reservation_id BIGINT NOT NULL UNIQUE REFERENCES inventory_order_reservations(id),
  disposition VARCHAR(30) NOT NULL CHECK (disposition IN ('WASTE','INTERNAL_CONSUMPTION','LOSS')),
  product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  lot_id BIGINT NOT NULL REFERENCES inventory_lots(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity>0),
  unit_cost NUMERIC(18,6) NOT NULL CHECK (unit_cost>=0),
  reason VARCHAR(500) NOT NULL,
  movement_id BIGINT NOT NULL REFERENCES inventory_movements(id),
  actor_legacy_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_lines_order ON inventory_order_lines(legacy_order_id,status);
CREATE INDEX idx_order_reservations_active ON inventory_order_reservations(warehouse_id,product_id,status);
CREATE INDEX idx_order_events_order ON inventory_order_events(legacy_order_id,created_at);
CREATE INDEX idx_consolidated_sales_date ON inventory_consolidated_sales(delivered_at DESC,area_code);

CREATE FUNCTION protect_order_inventory_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'El historial de pedido e inventario no puede eliminarse'; END IF;
  IF TG_TABLE_NAME IN ('inventory_order_events','inventory_consolidated_sales','inventory_order_cancellation_losses') THEN
    RAISE EXCEPTION 'El historial de pedido e inventario es inmutable';
  END IF;
  IF OLD.status IN ('CONSUMED','RELEASED','WASTED') THEN
    RAISE EXCEPTION 'La reserva finalizada es inmutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_lines_history BEFORE UPDATE OR DELETE ON inventory_order_lines FOR EACH ROW EXECUTE FUNCTION protect_order_inventory_history();
CREATE TRIGGER trg_order_reservations_history BEFORE UPDATE OR DELETE ON inventory_order_reservations FOR EACH ROW EXECUTE FUNCTION protect_order_inventory_history();
CREATE TRIGGER trg_order_events_history BEFORE UPDATE OR DELETE ON inventory_order_events FOR EACH ROW EXECUTE FUNCTION protect_order_inventory_history();
CREATE TRIGGER trg_order_sales_history BEFORE UPDATE OR DELETE ON inventory_consolidated_sales FOR EACH ROW EXECUTE FUNCTION protect_order_inventory_history();
CREATE TRIGGER trg_order_losses_history BEFORE UPDATE OR DELETE ON inventory_order_cancellation_losses FOR EACH ROW EXECUTE FUNCTION protect_order_inventory_history();

