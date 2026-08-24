ALTER TABLE inventory_purchase_orders
  ADD COLUMN requested_by_legacy_user_id BIGINT,
  ADD COLUMN notes VARCHAR(1000),
  ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE inventory_purchase_order_lines
  ADD COLUMN presentation_factor NUMERIC(18,9) NOT NULL DEFAULT 1 CHECK (presentation_factor > 0),
  ADD COLUMN ordered_base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (ordered_base_quantity >= 0),
  ADD COLUMN base_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (base_unit_cost >= 0),
  ADD COLUMN observation VARCHAR(500);

UPDATE inventory_purchase_order_lines
SET ordered_base_quantity = ordered_quantity,
    base_unit_cost = unit_cost;

UPDATE inventory_purchase_order_lines pol
SET presentation_factor = p.conversion_factor,
    ordered_base_quantity = pol.ordered_quantity * p.conversion_factor,
    base_unit_cost = pol.unit_cost / p.conversion_factor
FROM inventory_presentations p
WHERE p.id = pol.presentation_id;

ALTER TABLE inventory_goods_receipts
  ADD COLUMN verified_by_legacy_user_id BIGINT,
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN posted_by_legacy_user_id BIGINT,
  ADD COLUMN posted_at TIMESTAMPTZ,
  ADD COLUMN evidence_url VARCHAR(1000),
  ADD COLUMN observation VARCHAR(1000),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE inventory_goods_receipt_lines
  ADD COLUMN presentation_id BIGINT REFERENCES inventory_presentations(id),
  ADD COLUMN received_presentation_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (received_presentation_quantity >= 0),
  ADD COLUMN theoretical_base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (theoretical_base_quantity >= 0),
  ADD COLUMN actual_base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (actual_base_quantity >= 0),
  ADD COLUMN accepted_base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (accepted_base_quantity >= 0),
  ADD COLUMN rejected_base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (rejected_base_quantity >= 0),
  ADD COLUMN difference_base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN presentation_unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (presentation_unit_cost >= 0),
  ADD COLUMN measurement_mode VARCHAR(20) NOT NULL DEFAULT 'DIRECT' CHECK (measurement_mode IN ('DIRECT', 'TOTAL', 'INDIVIDUAL')),
  ADD COLUMN individual_measurements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(individual_measurements) = 'array'),
  ADD COLUMN decision VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED' CHECK (decision IN ('ACCEPTED', 'PARTIAL', 'REJECTED')),
  ADD COLUMN lot_code VARCHAR(100),
  ADD COLUMN expires_on DATE,
  ADD COLUMN observation VARCHAR(500);

UPDATE inventory_goods_receipt_lines
SET received_presentation_quantity = received_quantity,
    theoretical_base_quantity = received_quantity,
    actual_base_quantity = received_quantity,
    accepted_base_quantity = accepted_quantity,
    rejected_base_quantity = rejected_quantity,
    difference_base_quantity = received_quantity - received_quantity,
    presentation_unit_cost = unit_cost,
    decision = CASE WHEN accepted_quantity = 0 AND rejected_quantity > 0 THEN 'REJECTED' WHEN rejected_quantity > 0 THEN 'PARTIAL' ELSE 'ACCEPTED' END;

ALTER TABLE inventory_goods_receipt_lines
  ADD CONSTRAINT inventory_receipt_line_actual_split_check
    CHECK (accepted_base_quantity + rejected_base_quantity <= actual_base_quantity + 0.000001),
  ADD CONSTRAINT inventory_receipt_line_individual_count_check
    CHECK (measurement_mode <> 'INDIVIDUAL' OR jsonb_array_length(individual_measurements) > 0);

CREATE INDEX idx_purchase_orders_status_expected ON inventory_purchase_orders(status, expected_at);
CREATE INDEX idx_purchase_order_lines_product ON inventory_purchase_order_lines(product_id);
CREATE INDEX idx_goods_receipts_order_status ON inventory_goods_receipts(purchase_order_id, status);
CREATE INDEX idx_goods_receipt_lines_order_line ON inventory_goods_receipt_lines(purchase_order_line_id);

CREATE FUNCTION reject_final_goods_receipt_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'La recepción contabilizada es inmutable; use un movimiento compensatorio';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_final_goods_receipt_line_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM inventory_goods_receipts WHERE id = OLD.goods_receipt_id AND status IN ('VERIFIED', 'POSTED', 'REVERSED')
  ) THEN
    RAISE EXCEPTION 'Las líneas verificadas son inmutables; cree otra recepción o un movimiento compensatorio';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_goods_receipts_final_immutable
BEFORE UPDATE OR DELETE ON inventory_goods_receipts
FOR EACH ROW EXECUTE FUNCTION reject_final_goods_receipt_mutation();

CREATE TRIGGER trg_goods_receipt_lines_final_immutable
BEFORE UPDATE OR DELETE ON inventory_goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION reject_final_goods_receipt_line_mutation();
