-- Revierte la Fase 0: quita el disparador y la versión. La tabla audit_log se conserva a propósito
-- (tiene la historia completa); para volver a meterla al JSON habría que hacerlo a mano.
DROP TRIGGER IF EXISTS app_state_before_update ON app_state;
DROP FUNCTION IF EXISTS app_state_before_update();
DROP FUNCTION IF EXISTS app_state_archive_audit(JSONB);
ALTER TABLE app_state DROP COLUMN IF EXISTS version;
