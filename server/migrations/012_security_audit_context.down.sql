DROP INDEX IF EXISTS idx_inventory_audit_security_context;
ALTER TABLE inventory_audit_events
  DROP COLUMN IF EXISTS reference,
  DROP COLUMN IF EXISTS operation,
  DROP COLUMN IF EXISTS shift_code,
  DROP COLUMN IF EXISTS area_code,
  DROP COLUMN IF EXISTS actor_role;
