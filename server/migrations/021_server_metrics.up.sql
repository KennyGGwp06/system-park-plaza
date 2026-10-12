-- Fase 2 de escalabilidad (2026-09-28): monitoreo de TODAS las copias del servidor.
-- Cada copia guarda aquí sus números por minuto y un latido; la pantalla Salud del sistema los suma.
CREATE TABLE IF NOT EXISTS server_metrics (
  host TEXT NOT NULL,
  minute TIMESTAMPTZ NOT NULL,
  requests INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  p50 INTEGER NOT NULL,
  p95 INTEGER NOT NULL,
  routes JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (host, minute)
);
CREATE INDEX IF NOT EXISTS server_metrics_minute_idx ON server_metrics (minute);
CREATE TABLE IF NOT EXISTS server_instances (
  host TEXT PRIMARY KEY,
  pid INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  memory_mb INTEGER,
  realtime_connections INTEGER,
  shared_channel BOOLEAN
);
