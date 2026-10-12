-- Fase 0 de escalabilidad (2026-09-28, ver ESCALABILIDAD_AUDITORIA_2026-09-28.md).
-- 1. `version`: número que sube en cada escritura de app_state, venga de donde venga (mutateState,
--    compras, traslados, recetas…). El servidor guarda una copia en memoria y solo vuelve a leer el
--    JSON completo cuando este número cambió.
-- 2. `audit_log`: la auditoría completa vive en su propia tabla. En el JSON quedan solo los 200
--    registros más recientes (los que usan "Cambios recientes" y la firma de la cadena).
ALTER TABLE app_state ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT PRIMARY KEY,
  module TEXT,
  action TEXT,
  detail TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ,
  entry JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_detail_idx ON audit_log (detail text_pattern_ops);

CREATE OR REPLACE FUNCTION app_state_archive_audit(entries JSONB) RETURNS VOID AS $$
  INSERT INTO audit_log (id, module, action, detail, user_id, created_at, entry)
  SELECT (e->>'id')::BIGINT, e->>'module', e->>'action', e->>'detail', e->>'userId',
         CASE WHEN e->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}(T[0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$' THEN (e->>'createdAt')::TIMESTAMPTZ END,
         e
  FROM jsonb_array_elements(COALESCE(entries, '[]'::JSONB)) AS e
  WHERE jsonb_typeof(e) = 'object' AND e->>'id' ~ '^\d{1,15}$'
  ON CONFLICT (id) DO NOTHING;
$$ LANGUAGE sql;

-- Cada escritura: sube la versión y archiva los registros nuevos. sealAudit los agrega al INICIO del arreglo,
-- así que basta revisar desde el inicio hasta el primero que ya está archivado (normalmente 0 a 2 registros).
-- Cuando el arreglo pasa de 250, se archiva todo lo que falte y se recorta a los 200 más recientes.
CREATE OR REPLACE FUNCTION app_state_before_update() RETURNS TRIGGER AS $$
DECLARE
  newest BIGINT;
  entries JSONB;
  total INT;
  i INT := 0;
  e JSONB;
BEGIN
  NEW.version := OLD.version + 1;
  entries := NEW.data->'audit';
  IF jsonb_typeof(entries) = 'array' THEN
    total := jsonb_array_length(entries);
    SELECT COALESCE(MAX(id), 0) INTO newest FROM audit_log;
    WHILE i < total LOOP
      e := entries->i;
      EXIT WHEN CASE WHEN jsonb_typeof(e) = 'object' AND e->>'id' ~ '^\d{1,15}$' THEN (e->>'id')::BIGINT <= newest ELSE TRUE END;
      PERFORM app_state_archive_audit(jsonb_build_array(e));
      i := i + 1;
    END LOOP;
    IF total > 250 THEN
      PERFORM app_state_archive_audit(entries);
      NEW.data := jsonb_set(NEW.data, '{audit}', (
        SELECT jsonb_agg(x ORDER BY ord) FROM jsonb_array_elements(entries) WITH ORDINALITY AS t(x, ord) WHERE ord <= 200
      ));
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_state_before_update ON app_state;
CREATE TRIGGER app_state_before_update BEFORE UPDATE ON app_state FOR EACH ROW EXECUTE FUNCTION app_state_before_update();

-- Pasa toda la auditoría actual a la tabla y recorta el JSON (el disparador hace el recorte).
SELECT app_state_archive_audit(data->'audit') FROM app_state;
UPDATE app_state SET data = data WHERE id = 1;
