DROP TRIGGER IF EXISTS trg_inventory_transfer_lines_sent_immutable ON inventory_transfer_lines;
DROP TRIGGER IF EXISTS trg_inventory_transfers_final_immutable ON inventory_transfers;
DROP FUNCTION IF EXISTS reject_sent_inventory_transfer_line_mutation();
DROP FUNCTION IF EXISTS reject_final_inventory_transfer_mutation();
DROP TRIGGER IF EXISTS trg_validate_inventory_transfer_route ON inventory_transfers;
DROP FUNCTION IF EXISTS validate_inventory_transfer_route();
DROP INDEX IF EXISTS idx_inventory_transfer_alerts_open;
DROP INDEX IF EXISTS idx_inventory_transfers_status_date;
DROP TABLE IF EXISTS inventory_transfer_alerts;

ALTER TABLE inventory_transfer_lines
  DROP COLUMN IF EXISTS observation,
  DROP COLUMN IF EXISTS difference_quantity,
  DROP COLUMN IF EXISTS unit_id;

ALTER TABLE inventory_transfers
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS rejected_at,
  DROP COLUMN IF EXISTS rejected_by_legacy_user_id,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancelled_by_legacy_user_id,
  DROP COLUMN IF EXISTS observation,
  DROP COLUMN IF EXISTS received_shift_code,
  DROP COLUMN IF EXISTS sent_shift_code;

DELETE FROM inventory_warehouses w WHERE w.code IN ('TRANSIT','DISCREPANCY')
  AND NOT EXISTS(SELECT 1 FROM inventory_stock_balances b WHERE b.warehouse_id=w.id AND (b.on_hand<>0 OR b.reserved<>0))
  AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.from_warehouse_id=w.id OR m.to_warehouse_id=w.id);
