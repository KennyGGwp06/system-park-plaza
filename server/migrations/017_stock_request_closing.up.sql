-- Fase 2: la solicitud nace del cierre del día (CIERRE) o es un pedido de emergencia (EMERGENCIA),
-- y cada línea guarda lo que las recetas y ventas justificaban en el momento de pedir.
ALTER TABLE inventory_stock_requests
  ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'EMERGENCIA' CHECK (source IN ('CIERRE','EMERGENCIA'));
ALTER TABLE inventory_stock_request_lines
  ADD COLUMN justified_quantity NUMERIC(18,6);
