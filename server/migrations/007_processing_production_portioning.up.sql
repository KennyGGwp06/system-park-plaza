CREATE TABLE inventory_product_lineage_rules (
  id BIGSERIAL PRIMARY KEY,
  parent_product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  child_product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  process_type VARCHAR(25) NOT NULL CHECK (process_type IN ('PROCESSING','PRODUCTION','PORTIONING')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_product_id<>child_product_id),
  UNIQUE(parent_product_id,child_product_id,process_type)
);

CREATE TABLE inventory_processing_batches (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  input_product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  input_lot_id BIGINT NOT NULL REFERENCES inventory_lots(id),
  input_quantity NUMERIC(18,6) NOT NULL CHECK (input_quantity>0),
  input_unit_cost NUMERIC(18,6) NOT NULL CHECK (input_unit_cost>=0),
  expected_usable_percent NUMERIC(9,4) CHECK (expected_usable_percent BETWEEN 0 AND 100),
  tolerance_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tolerance_percent BETWEEN 0 AND 100),
  yield_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  usable_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  byproduct_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  waste_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  out_of_tolerance BOOLEAN NOT NULL DEFAULT FALSE,
  total_input_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COMPLETED','REVERSED')),
  responsible_legacy_user_id BIGINT,
  completed_at TIMESTAMPTZ,
  observation VARCHAR(1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_processing_outputs (
  id BIGSERIAL PRIMARY KEY,
  processing_batch_id BIGINT NOT NULL REFERENCES inventory_processing_batches(id) ON DELETE RESTRICT,
  output_type VARCHAR(20) NOT NULL CHECK (output_type IN ('USABLE','BYPRODUCT','RESIDUE','WASTE')),
  product_id BIGINT REFERENCES inventory_products(id),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity>0),
  allocation_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (allocation_percent BETWEEN 0 AND 100),
  allocated_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (allocated_cost>=0),
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost>=0),
  output_lot_id BIGINT REFERENCES inventory_lots(id),
  movement_id BIGINT REFERENCES inventory_movements(id),
  observation VARCHAR(500),
  CHECK ((output_type IN ('USABLE','BYPRODUCT') AND product_id IS NOT NULL AND output_lot_id IS NOT NULL)
      OR (output_type IN ('RESIDUE','WASTE') AND product_id IS NULL AND output_lot_id IS NULL))
);

CREATE TABLE inventory_portioning_batches (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  warehouse_id BIGINT NOT NULL REFERENCES inventory_warehouses(id),
  source_product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  source_lot_id BIGINT NOT NULL REFERENCES inventory_lots(id),
  output_product_id BIGINT NOT NULL REFERENCES inventory_products(id),
  input_quantity NUMERIC(18,6) NOT NULL CHECK (input_quantity>0),
  source_unit_cost NUMERIC(18,6) NOT NULL CHECK (source_unit_cost>=0),
  target_weight_base NUMERIC(18,6) NOT NULL CHECK (target_weight_base>0),
  tolerance_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tolerance_percent BETWEEN 0 AND 100),
  sample_average_base NUMERIC(18,6) NOT NULL CHECK (sample_average_base>0),
  complete_portions INTEGER NOT NULL CHECK (complete_portions>0),
  portioned_quantity NUMERIC(18,6) NOT NULL CHECK (portioned_quantity>0),
  leftover_quantity NUMERIC(18,6) NOT NULL CHECK (leftover_quantity>=0),
  average_difference NUMERIC(18,6) NOT NULL,
  average_difference_percent NUMERIC(9,4) NOT NULL,
  out_of_tolerance BOOLEAN NOT NULL DEFAULT FALSE,
  portion_unit_cost NUMERIC(18,6) NOT NULL CHECK (portion_unit_cost>=0),
  output_lot_id BIGINT REFERENCES inventory_lots(id),
  leftover_lot_id BIGINT REFERENCES inventory_lots(id),
  input_movement_id BIGINT REFERENCES inventory_movements(id),
  output_movement_id BIGINT REFERENCES inventory_movements(id),
  leftover_movement_id BIGINT REFERENCES inventory_movements(id),
  responsible_legacy_user_id BIGINT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation VARCHAR(1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_portion_weight_samples (
  id BIGSERIAL PRIMARY KEY,
  portioning_batch_id BIGINT NOT NULL REFERENCES inventory_portioning_batches(id) ON DELETE RESTRICT,
  sample_number INTEGER NOT NULL CHECK (sample_number>0),
  weight_quantity NUMERIC(18,6) NOT NULL CHECK (weight_quantity>0),
  unit_id BIGINT NOT NULL REFERENCES inventory_units(id),
  base_weight NUMERIC(18,6) NOT NULL CHECK (base_weight>0),
  UNIQUE(portioning_batch_id,sample_number)
);

CREATE TABLE inventory_lot_genealogy (
  id BIGSERIAL PRIMARY KEY,
  parent_lot_id BIGINT NOT NULL REFERENCES inventory_lots(id),
  child_lot_id BIGINT NOT NULL REFERENCES inventory_lots(id),
  relation_type VARCHAR(25) NOT NULL CHECK (relation_type IN ('PROCESSING','PRODUCTION','PORTIONING','LEFTOVER')),
  source_type VARCHAR(60) NOT NULL,
  source_id BIGINT NOT NULL,
  input_quantity NUMERIC(18,6) NOT NULL CHECK (input_quantity>0),
  output_quantity NUMERIC(18,6) NOT NULL CHECK (output_quantity>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_lot_id<>child_lot_id),
  UNIQUE(parent_lot_id,child_lot_id,source_type,source_id)
);

ALTER TABLE inventory_production_batches
  ADD COLUMN output_product_id BIGINT REFERENCES inventory_products(id),
  ADD COLUMN output_lot_id BIGINT REFERENCES inventory_lots(id),
  ADD COLUMN tolerance_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tolerance_percent BETWEEN 0 AND 100),
  ADD COLUMN yield_difference_percent NUMERIC(9,4),
  ADD COLUMN out_of_tolerance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN total_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (total_cost>=0),
  ADD COLUMN unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost>=0),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_processing_batches_date ON inventory_processing_batches(created_at DESC,status);
CREATE INDEX idx_portioning_batches_date ON inventory_portioning_batches(created_at DESC);
CREATE INDEX idx_lot_genealogy_parent ON inventory_lot_genealogy(parent_lot_id);
CREATE INDEX idx_lot_genealogy_child ON inventory_lot_genealogy(child_lot_id);
CREATE INDEX idx_product_lineage_child ON inventory_product_lineage_rules(child_product_id) WHERE active;

CREATE FUNCTION protect_completed_transformation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('COMPLETED','REVERSED') THEN
    RAISE EXCEPTION 'La transformación completada es inmutable; use una reversión auditada';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_processing_completed_immutable
BEFORE UPDATE OR DELETE ON inventory_processing_batches
FOR EACH ROW EXECUTE FUNCTION protect_completed_transformation();
CREATE TRIGGER trg_production_completed_immutable
BEFORE UPDATE OR DELETE ON inventory_production_batches
FOR EACH ROW EXECUTE FUNCTION protect_completed_transformation();

CREATE FUNCTION protect_transformation_detail() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El detalle histórico de transformación es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_processing_outputs_immutable BEFORE UPDATE OR DELETE ON inventory_processing_outputs FOR EACH ROW EXECUTE FUNCTION protect_transformation_detail();
CREATE TRIGGER trg_portioning_batches_immutable BEFORE UPDATE OR DELETE ON inventory_portioning_batches FOR EACH ROW EXECUTE FUNCTION protect_transformation_detail();
CREATE TRIGGER trg_portion_samples_immutable BEFORE UPDATE OR DELETE ON inventory_portion_weight_samples FOR EACH ROW EXECUTE FUNCTION protect_transformation_detail();
CREATE TRIGGER trg_lot_genealogy_immutable BEFORE UPDATE OR DELETE ON inventory_lot_genealogy FOR EACH ROW EXECUTE FUNCTION protect_transformation_detail();
