ALTER TABLE inventory_stock_request_lines DROP COLUMN IF EXISTS justified_quantity;
ALTER TABLE inventory_stock_requests DROP COLUMN IF EXISTS source;
