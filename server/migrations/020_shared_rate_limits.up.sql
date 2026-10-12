-- Fase 2 de escalabilidad (2026-09-28): límites de intentos compartidos entre todas las copias del servidor.
-- Antes vivían en la memoria de un solo proceso y contaban por IP: detrás del proxy todos los clientes
-- compartían la misma IP y el cliente número 11 en 15 minutos quedaba bloqueado.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits (reset_at);
