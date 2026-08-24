-- Convierte existencias heredadas sin lote en lotes de apertura trazables.
-- No altera la cantidad total ni crea movimientos productivos ficticios.
INSERT INTO inventory_lots(product_id,lot_code,unit_cost,status,created_at)
SELECT DISTINCT b.product_id,'LEGACY-OPENING-'||b.product_id,p.average_cost,'AVAILABLE',NOW()
FROM inventory_stock_balances b
JOIN inventory_products p ON p.id=b.product_id
WHERE b.lot_id IS NULL AND b.on_hand>0
ON CONFLICT(product_id,lot_code) DO NOTHING;

INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand,reserved,version,updated_at)
SELECT b.product_id,b.warehouse_id,l.id,b.on_hand,b.reserved,b.version,NOW()
FROM inventory_stock_balances b
JOIN inventory_lots l ON l.product_id=b.product_id AND l.lot_code='LEGACY-OPENING-'||b.product_id
WHERE b.lot_id IS NULL AND b.on_hand>0
ON CONFLICT(product_id,warehouse_id,lot_id) DO UPDATE SET
  on_hand=inventory_stock_balances.on_hand+EXCLUDED.on_hand,
  reserved=inventory_stock_balances.reserved+EXCLUDED.reserved,
  version=GREATEST(inventory_stock_balances.version,EXCLUDED.version),
  updated_at=NOW();

INSERT INTO inventory_audit_events(event_type,entity_type,entity_id,reason,after_data,correlation_id)
SELECT 'MIGRATE','OPENING_LOT',l.id,'Existencia heredada vinculada a lote de apertura sin cambiar cantidad',
       jsonb_build_object('productId',b.product_id,'warehouseId',b.warehouse_id,'quantity',b.on_hand,'reserved',b.reserved),
       'opening-lot:'||b.product_id||':'||b.warehouse_id
FROM inventory_stock_balances b
JOIN inventory_lots l ON l.product_id=b.product_id AND l.lot_code='LEGACY-OPENING-'||b.product_id
WHERE b.lot_id IS NULL AND b.on_hand>0;

DELETE FROM inventory_stock_balances WHERE lot_id IS NULL AND on_hand>0;

