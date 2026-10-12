-- Antes de bajar esta migración hay que devolver el historial al estado (si no, esos registros dejan de verse).
-- Se deja la tabla a propósito: borrarla perdería la historia archivada.
DROP INDEX IF EXISTS history_records_code_idx;
DROP INDEX IF EXISTS history_records_client_idx;
DROP INDEX IF EXISTS history_records_range_idx;
