INSERT INTO inventory_warehouses(code,name,warehouse_type,area_code,allows_negative,active) VALUES
  ('GENERAL','Almacén general','GENERAL','GENERAL',FALSE,TRUE),
  ('RESTAURANTE','Cocina','OPERATIONAL','RESTAURANTE',FALSE,TRUE),
  ('BARTENDER','Bar','OPERATIONAL','BARTENDER',FALSE,TRUE),
  ('TRANSIT','Mercancía en tránsito','IN_TRANSIT','TRANSIT',FALSE,TRUE),
  ('DISCREPANCY','Diferencias por investigar','WASTE','DISCREPANCY',FALSE,TRUE)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,warehouse_type=EXCLUDED.warehouse_type,area_code=EXCLUDED.area_code,active=TRUE;

ALTER TABLE inventory_transfers
  ADD COLUMN sent_shift_code VARCHAR(100),
  ADD COLUMN received_shift_code VARCHAR(100),
  ADD COLUMN observation VARCHAR(1000),
  ADD COLUMN cancelled_by_legacy_user_id BIGINT,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN rejected_by_legacy_user_id BIGINT,
  ADD COLUMN rejected_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE inventory_transfer_lines
  ADD COLUMN unit_id BIGINT REFERENCES inventory_units(id),
  ADD COLUMN difference_quantity NUMERIC(18,6),
  ADD COLUMN observation VARCHAR(500);

UPDATE inventory_transfer_lines tl SET unit_id=p.base_unit_id FROM inventory_products p WHERE p.id=tl.product_id AND tl.unit_id IS NULL;
ALTER TABLE inventory_transfer_lines ALTER COLUMN unit_id SET NOT NULL;

CREATE TABLE inventory_transfer_alerts (
  id BIGSERIAL PRIMARY KEY,
  transfer_id BIGINT NOT NULL REFERENCES inventory_transfers(id),
  transfer_line_id BIGINT NOT NULL REFERENCES inventory_transfer_lines(id),
  alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('SHORTAGE','OVERAGE')),
  severity VARCHAR(20) NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('WARNING','CRITICAL')),
  sent_quantity NUMERIC(18,6) NOT NULL CHECK (sent_quantity >= 0),
  received_quantity NUMERIC(18,6) NOT NULL CHECK (received_quantity >= 0),
  difference_quantity NUMERIC(18,6) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  created_by_legacy_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transfer_line_id)
);

CREATE INDEX idx_inventory_transfers_status_date ON inventory_transfers(status,created_at DESC);
CREATE INDEX idx_inventory_transfer_alerts_open ON inventory_transfer_alerts(status,created_at DESC) WHERE status='OPEN';

CREATE FUNCTION validate_inventory_transfer_route() RETURNS TRIGGER AS $$
DECLARE from_code VARCHAR; to_code VARCHAR;
BEGIN
  SELECT code INTO from_code FROM inventory_warehouses WHERE id=NEW.from_warehouse_id;
  SELECT code INTO to_code FROM inventory_warehouses WHERE id=NEW.to_warehouse_id;
  IF NOT ((from_code='GENERAL' AND to_code IN ('RESTAURANTE','BARTENDER')) OR
          (from_code='RESTAURANTE' AND to_code='BARTENDER') OR
          (from_code='BARTENDER' AND to_code='RESTAURANTE')) THEN
    RAISE EXCEPTION 'Ruta de transferencia no permitida: % → %',from_code,to_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_inventory_transfer_route
BEFORE INSERT OR UPDATE OF from_warehouse_id,to_warehouse_id ON inventory_transfers
FOR EACH ROW EXECUTE FUNCTION validate_inventory_transfer_route();

CREATE FUNCTION reject_final_inventory_transfer_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('RECEIVED','RECEIVED_WITH_DIFFERENCE','REJECTED','CANCELLED') THEN
    RAISE EXCEPTION 'La transferencia finalizada es inmutable; utilice movimientos compensatorios';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_sent_inventory_transfer_line_mutation() RETURNS TRIGGER AS $$
DECLARE transfer_status VARCHAR;
BEGIN
  SELECT status INTO transfer_status FROM inventory_transfers WHERE id=OLD.transfer_id;
  IF transfer_status IN ('DRAFT','PREPARED') THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP='UPDATE' AND transfer_status='SENT' AND OLD.received_quantity IS NULL
    AND NEW.transfer_id=OLD.transfer_id AND NEW.product_id=OLD.product_id
    AND NEW.lot_id IS NOT DISTINCT FROM OLD.lot_id AND NEW.requested_quantity=OLD.requested_quantity
    AND NEW.sent_quantity=OLD.sent_quantity AND NEW.unit_id=OLD.unit_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Las líneas enviadas son inmutables';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_transfers_final_immutable
BEFORE UPDATE OR DELETE ON inventory_transfers
FOR EACH ROW EXECUTE FUNCTION reject_final_inventory_transfer_mutation();

CREATE TRIGGER trg_inventory_transfer_lines_sent_immutable
BEFORE UPDATE OR DELETE ON inventory_transfer_lines
FOR EACH ROW EXECUTE FUNCTION reject_sent_inventory_transfer_line_mutation();
