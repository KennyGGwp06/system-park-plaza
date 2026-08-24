DROP TRIGGER IF EXISTS trg_lot_genealogy_immutable ON inventory_lot_genealogy;
DROP TRIGGER IF EXISTS trg_portion_samples_immutable ON inventory_portion_weight_samples;
DROP TRIGGER IF EXISTS trg_portioning_batches_immutable ON inventory_portioning_batches;
DROP TRIGGER IF EXISTS trg_processing_outputs_immutable ON inventory_processing_outputs;
DROP FUNCTION IF EXISTS protect_transformation_detail();
DROP TRIGGER IF EXISTS trg_processing_completed_immutable ON inventory_processing_batches;
DROP TRIGGER IF EXISTS trg_production_completed_immutable ON inventory_production_batches;
DROP FUNCTION IF EXISTS protect_completed_transformation();
DROP INDEX IF EXISTS idx_product_lineage_child;
DROP TABLE IF EXISTS inventory_lot_genealogy;
DROP TABLE IF EXISTS inventory_portion_weight_samples;
DROP TABLE IF EXISTS inventory_portioning_batches;
DROP TABLE IF EXISTS inventory_processing_outputs;
DROP TABLE IF EXISTS inventory_processing_batches;
DROP TABLE IF EXISTS inventory_product_lineage_rules;

ALTER TABLE inventory_production_batches
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS unit_cost,
  DROP COLUMN IF EXISTS total_cost,
  DROP COLUMN IF EXISTS out_of_tolerance,
  DROP COLUMN IF EXISTS yield_difference_percent,
  DROP COLUMN IF EXISTS tolerance_percent,
  DROP COLUMN IF EXISTS output_lot_id,
  DROP COLUMN IF EXISTS output_product_id;
