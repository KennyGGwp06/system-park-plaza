-- Rollback permitido solo mientras los lotes de apertura no hayan sido usados
-- por movimientos o genealogía posterior.
INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand,reserved,version,updated_at)
SELECT b.product_id,b.warehouse_id,NULL,b.on_hand,b.reserved,b.version,NOW()
FROM inventory_stock_balances b
JOIN inventory_lots l ON l.id=b.lot_id AND l.lot_code='LEGACY-OPENING-'||l.product_id
ON CONFLICT(product_id,warehouse_id,lot_id) DO UPDATE SET
  on_hand=inventory_stock_balances.on_hand+EXCLUDED.on_hand,
  reserved=inventory_stock_balances.reserved+EXCLUDED.reserved,
  version=GREATEST(inventory_stock_balances.version,EXCLUDED.version),
  updated_at=NOW();

DELETE FROM inventory_stock_balances b USING inventory_lots l
WHERE b.lot_id=l.id AND l.lot_code='LEGACY-OPENING-'||l.product_id;

DELETE FROM inventory_audit_events WHERE entity_type='OPENING_LOT' AND correlation_id LIKE 'opening-lot:%';
DELETE FROM inventory_lots l
WHERE l.lot_code='LEGACY-OPENING-'||l.product_id
  AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.lot_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM inventory_lot_genealogy g WHERE g.parent_lot_id=l.id OR g.child_lot_id=l.id);
