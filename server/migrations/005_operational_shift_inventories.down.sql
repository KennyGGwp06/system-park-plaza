DROP TRIGGER IF EXISTS trg_shift_summary_immutable ON inventory_shift_summary_lines;
DROP FUNCTION IF EXISTS reject_shift_summary_mutation();
DROP TRIGGER IF EXISTS trg_shift_count_lines_immutable ON inventory_physical_count_lines;
DROP FUNCTION IF EXISTS reject_submitted_shift_count_line_mutation();
DROP INDEX IF EXISTS idx_inventory_movements_shift_window;
DROP TABLE IF EXISTS inventory_shift_summary_lines;
DROP TABLE IF EXISTS inventory_shift_opening_lines;
DROP INDEX IF EXISTS idx_inventory_shift_sessions_area_date;
DROP INDEX IF EXISTS uq_inventory_active_session_per_warehouse;

ALTER TABLE inventory_shift_sessions
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS previous_session_id,
  DROP COLUMN IF EXISTS opening_source,
  DROP COLUMN IF EXISTS reopen_count,
  DROP COLUMN IF EXISTS reopened_at,
  DROP COLUMN IF EXISTS reopened_by_legacy_user_id,
  DROP COLUMN IF EXISTS closed_by_legacy_user_id,
  DROP COLUMN IF EXISTS submitted_by_legacy_user_id,
  DROP COLUMN IF EXISTS opened_by_legacy_user_id,
  DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS period_started_at,
  DROP COLUMN IF EXISTS area_code;
