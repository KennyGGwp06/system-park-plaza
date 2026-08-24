ALTER TABLE inventory_audit_events
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(60),
  ADD COLUMN IF NOT EXISTS area_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS shift_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS operation VARCHAR(120),
  ADD COLUMN IF NOT EXISTS reference VARCHAR(240);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_security_context
  ON inventory_audit_events(operation, actor_legacy_user_id, created_at DESC)
  WHERE operation IS NOT NULL;
