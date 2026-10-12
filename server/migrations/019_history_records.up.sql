-- Fase 1 de escalabilidad (2026-09-28, ver ESCALABILIDAD_AUDITORIA_2026-09-28.md).
-- Historial: lo cerrado y antiguo (reservas terminadas, pedidos entregados, pagos de reservas cerradas,
-- solicitudes resueltas…) sale del estado operativo (app_state) y vive aquí, con índices por fecha,
-- cliente y código. El estado en memoria queda acotado a lo vivo; los reportes piden solo el rango que usan.
CREATE TABLE IF NOT EXISTS history_records (
  collection TEXT NOT NULL,
  id BIGINT NOT NULL,
  date_from DATE,
  date_to DATE,
  client_id BIGINT,
  code TEXT,
  data JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection, id)
);
-- Consultas por rango: "registros cuya vida toca [desde, hasta]" (date_to >= desde AND date_from <= hasta).
CREATE INDEX IF NOT EXISTS history_records_range_idx ON history_records (collection, date_to, date_from);
CREATE INDEX IF NOT EXISTS history_records_client_idx ON history_records (client_id, collection);
CREATE INDEX IF NOT EXISTS history_records_code_idx ON history_records (code);
