DROP TRIGGER IF EXISTS trg_goods_receipt_lines_final_immutable ON inventory_goods_receipt_lines;
DROP TRIGGER IF EXISTS trg_goods_receipts_final_immutable ON inventory_goods_receipts;
DROP FUNCTION IF EXISTS reject_final_goods_receipt_line_mutation();
DROP FUNCTION IF EXISTS reject_final_goods_receipt_mutation();

DROP INDEX IF EXISTS idx_goods_receipt_lines_order_line;
DROP INDEX IF EXISTS idx_goods_receipts_order_status;
DROP INDEX IF EXISTS idx_purchase_order_lines_product;
DROP INDEX IF EXISTS idx_purchase_orders_status_expected;

ALTER TABLE inventory_goods_receipt_lines
  DROP CONSTRAINT IF EXISTS inventory_receipt_line_individual_count_check,
  DROP CONSTRAINT IF EXISTS inventory_receipt_line_actual_split_check,
  DROP COLUMN IF EXISTS observation,
  DROP COLUMN IF EXISTS expires_on,
  DROP COLUMN IF EXISTS lot_code,
  DROP COLUMN IF EXISTS decision,
  DROP COLUMN IF EXISTS individual_measurements,
  DROP COLUMN IF EXISTS measurement_mode,
  DROP COLUMN IF EXISTS presentation_unit_cost,
  DROP COLUMN IF EXISTS difference_base_quantity,
  DROP COLUMN IF EXISTS rejected_base_quantity,
  DROP COLUMN IF EXISTS accepted_base_quantity,
  DROP COLUMN IF EXISTS actual_base_quantity,
  DROP COLUMN IF EXISTS theoretical_base_quantity,
  DROP COLUMN IF EXISTS received_presentation_quantity,
  DROP COLUMN IF EXISTS presentation_id;

ALTER TABLE inventory_goods_receipts
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS observation,
  DROP COLUMN IF EXISTS evidence_url,
  DROP COLUMN IF EXISTS posted_at,
  DROP COLUMN IF EXISTS posted_by_legacy_user_id,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verified_by_legacy_user_id;

ALTER TABLE inventory_purchase_order_lines
  DROP COLUMN IF EXISTS observation,
  DROP COLUMN IF EXISTS base_unit_cost,
  DROP COLUMN IF EXISTS ordered_base_quantity,
  DROP COLUMN IF EXISTS presentation_factor;

ALTER TABLE inventory_purchase_orders
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS requested_by_legacy_user_id;
