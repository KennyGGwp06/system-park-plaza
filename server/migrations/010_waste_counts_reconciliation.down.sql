DROP INDEX IF EXISTS idx_inventory_variance_closing;
DROP INDEX IF EXISTS idx_inventory_waste_session;
DROP INDEX IF EXISTS uq_inventory_active_session_per_warehouse;
CREATE UNIQUE INDEX uq_inventory_active_session_per_warehouse
  ON inventory_shift_sessions(warehouse_id)
  WHERE status IN ('OPEN','OPERATING','COUNTING','SUBMITTED','REOPENED');
DROP TABLE IF EXISTS inventory_shift_variance_explanations;

ALTER TABLE inventory_shift_summary_lines
  DROP COLUMN IF EXISTS difference_cost,
  DROP COLUMN IF EXISTS difference_percent,
  DROP COLUMN IF EXISTS unexplained_difference,
  DROP COLUMN IF EXISTS derived_actual_consumption,
  DROP COLUMN IF EXISTS production_consumption;

ALTER TABLE inventory_waste_records
  DROP COLUMN IF EXISTS evidence,
  DROP COLUMN IF EXISTS unit_id,
  DROP COLUMN IF EXISTS shift_session_id;
