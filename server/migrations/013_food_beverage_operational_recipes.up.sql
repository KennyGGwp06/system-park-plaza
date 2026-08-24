-- Insumos mínimos para demostrar recetas operativas pesadas de Restaurante y Bar.
INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,minimum_stock,maximum_stock,average_cost,default_area_code,status,track_lots,track_expiry,tolerance_percent,metadata)
SELECT row.code,row.name,c.id,u.id,u.id,'RAW_MATERIAL',row.minimum_stock,row.maximum_stock,row.average_cost,row.area,'ACTIVE',TRUE,row.track_expiry,row.tolerance,'{"operationalRecipeSeed":true}'::jsonb
FROM (VALUES
  ('COCINA_CEBOLLA_ROJA','Cebolla roja','G',500,5000,0.006,'RESTAURANTE',TRUE,3),
  ('COCINA_COCONA','Cocona','G',500,5000,0.008,'RESTAURANTE',TRUE,5),
  ('COCINA_AJI_CHARAPITA','Ají charapita','G',50,500,0.080,'RESTAURANTE',TRUE,5),
  ('COCINA_CILANTRO','Cilantro','G',50,500,0.020,'RESTAURANTE',TRUE,8),
  ('COCINA_SAL','Sal','G',250,3000,0.001,'RESTAURANTE',FALSE,5),
  ('COCINA_JUGO_LIMON','Jugo de limón','ML',500,5000,0.006,'RESTAURANTE',TRUE,5),
  ('COCINA_AJO','Ajo','G',100,1000,0.012,'RESTAURANTE',TRUE,5),
  ('BAR_JUGO_LIMON','Jugo de limón para bar','ML',500,5000,0.006,'BARTENDER',TRUE,5),
  ('BAR_JARABE_GOMA','Jarabe de goma','ML',500,5000,0.005,'BARTENDER',TRUE,3),
  ('BAR_CLARA_HUEVO','Clara de huevo pasteurizada','ML',300,3000,0.010,'BARTENDER',TRUE,5),
  ('BAR_AMARGO_ANGOSTURA','Amargo de angostura','ML',50,1000,0.090,'BARTENDER',FALSE,5)
) AS row(code,name,unit_code,minimum_stock,maximum_stock,average_cost,area,track_expiry,tolerance)
JOIN inventory_units u ON u.code=row.unit_code
JOIN inventory_categories c ON c.code='RAW_MATERIALS'
ON CONFLICT(code) DO NOTHING;

INSERT INTO inventory_lots(product_id,lot_code,manufactured_on,expires_on,unit_cost,status)
SELECT p.id,'DEMO-'||p.code,CURRENT_DATE,
  CASE WHEN p.track_expiry THEN CURRENT_DATE+INTERVAL '30 days' ELSE NULL END,
  p.average_cost,'AVAILABLE'
FROM inventory_products p
WHERE p.metadata @> '{"operationalRecipeSeed":true}'::jsonb
ON CONFLICT(product_id,lot_code) DO NOTHING;

INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand,reserved)
SELECT p.id,w.id,l.id,
  CASE WHEN u.dimension='VOLUME' THEN 5000 ELSE 3000 END,0
FROM inventory_products p
JOIN inventory_units u ON u.id=p.base_unit_id
JOIN inventory_warehouses w ON w.code=p.default_area_code
JOIN inventory_lots l ON l.product_id=p.id AND l.lot_code='DEMO-'||p.code
WHERE p.metadata @> '{"operationalRecipeSeed":true}'::jsonb
ON CONFLICT(product_id,warehouse_id,lot_id) DO NOTHING;

DO $$
DECLARE
  v_recipe_id BIGINT;
  v_version_id BIGINT;
  v_next_version INTEGER;
  v_unit_id BIGINT;
  v_sale_price NUMERIC;
  v_total NUMERIC;
BEGIN
  -- Ceviche amazónico: cada ingrediente queda expresado y convertido a su unidad base.
  SELECT id INTO v_recipe_id FROM inventory_recipes WHERE legacy_menu_item_id=1;
  IF v_recipe_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM inventory_recipe_versions WHERE recipe_id=v_recipe_id AND metadata @> '{"operationalExactRecipe":true}'::jsonb
  ) THEN
    SELECT COALESCE(MAX(version),0)+1 INTO v_next_version FROM inventory_recipe_versions WHERE recipe_id=v_recipe_id;
    SELECT id INTO v_unit_id FROM inventory_units WHERE code='UNIT';
    v_sale_price := 34;
    INSERT INTO inventory_recipe_versions(recipe_id,version,status,yield_quantity,yield_unit_id,sale_price,valid_from,metadata)
    VALUES(v_recipe_id,v_next_version,'DRAFT',1,v_unit_id,v_sale_price,NOW(),'{"operationalExactRecipe":true,"dish":"CEVICHE_AMAZONICO"}'::jsonb)
    RETURNING id INTO v_version_id;

    INSERT INTO inventory_recipe_ingredients(recipe_version_id,product_id,quantity,unit_id,consumption_mode,waste_tolerance_percent,technical_waste_percent,base_quantity,unit_cost_snapshot,line_cost)
    SELECT v_version_id,p.id,x.quantity,u.id,'MAKE_TO_ORDER',x.tolerance,x.technical_waste,x.base_quantity,p.average_cost,
      ROUND(x.base_quantity*p.average_cost*(1+x.technical_waste/100),6)
    FROM (VALUES
      ('LEGACY_PRODUCT_1','G',220::numeric,0.22::numeric,3::numeric,2::numeric),
      ('COCINA_CEBOLLA_ROJA','G',40,40,5,2),
      ('COCINA_COCONA','G',35,35,5,3),
      ('COCINA_AJI_CHARAPITA','G',2,2,10,2),
      ('COCINA_CILANTRO','G',3,3,10,5),
      ('COCINA_SAL','G',3,3,10,0),
      ('COCINA_JUGO_LIMON','ML',50,50,5,2),
      ('COCINA_AJO','G',2,2,10,2)
    ) AS x(product_code,unit_code,quantity,base_quantity,tolerance,technical_waste)
    JOIN inventory_products p ON p.code=x.product_code
    JOIN inventory_units u ON u.code=x.unit_code;

    SELECT COALESCE(SUM(line_cost),0) INTO v_total FROM inventory_recipe_ingredients WHERE recipe_version_id=v_version_id;
    UPDATE inventory_recipe_versions SET total_cost=v_total,cost_per_portion=v_total,margin_amount=v_sale_price-v_total,
      margin_percent=CASE WHEN v_sale_price>0 THEN ROUND((v_sale_price-v_total)/v_sale_price*100,4) ELSE 0 END,
      cost_percent=CASE WHEN v_sale_price>0 THEN ROUND(v_total/v_sale_price*100,4) ELSE 0 END
    WHERE id=v_version_id;
    UPDATE inventory_recipe_versions SET status='ARCHIVED',archived_at=NOW() WHERE recipe_id=v_recipe_id AND status='ACTIVE';
    UPDATE inventory_recipe_versions SET status='ACTIVE',activated_at=NOW() WHERE id=v_version_id;
  END IF;

  -- Pisco sour: mililitros exactos para dosificación y consumo del Bar.
  SELECT id INTO v_recipe_id FROM inventory_recipes WHERE legacy_menu_item_id=4;
  IF v_recipe_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM inventory_recipe_versions WHERE recipe_id=v_recipe_id AND metadata @> '{"operationalExactRecipe":true}'::jsonb
  ) THEN
    SELECT COALESCE(MAX(version),0)+1 INTO v_next_version FROM inventory_recipe_versions WHERE recipe_id=v_recipe_id;
    SELECT id INTO v_unit_id FROM inventory_units WHERE code='UNIT';
    v_sale_price := 24;
    INSERT INTO inventory_recipe_versions(recipe_id,version,status,yield_quantity,yield_unit_id,sale_price,valid_from,metadata)
    VALUES(v_recipe_id,v_next_version,'DRAFT',1,v_unit_id,v_sale_price,NOW(),'{"operationalExactRecipe":true,"drink":"PISCO_SOUR"}'::jsonb)
    RETURNING id INTO v_version_id;

    INSERT INTO inventory_recipe_ingredients(recipe_version_id,product_id,quantity,unit_id,consumption_mode,waste_tolerance_percent,technical_waste_percent,base_quantity,unit_cost_snapshot,line_cost)
    SELECT v_version_id,p.id,x.quantity,u.id,'MAKE_TO_ORDER',x.tolerance,x.technical_waste,x.quantity,p.average_cost,
      ROUND(x.quantity*p.average_cost*(1+x.technical_waste/100),6)
    FROM (VALUES
      ('LEGACY_PRODUCT_4','ML',60::numeric,3::numeric,1::numeric),
      ('BAR_JUGO_LIMON','ML',30,5,2),
      ('BAR_JARABE_GOMA','ML',20,3,1),
      ('BAR_CLARA_HUEVO','ML',20,5,2),
      ('BAR_AMARGO_ANGOSTURA','ML',3,10,1)
    ) AS x(product_code,unit_code,quantity,tolerance,technical_waste)
    JOIN inventory_products p ON p.code=x.product_code
    JOIN inventory_units u ON u.code=x.unit_code;

    SELECT COALESCE(SUM(line_cost),0) INTO v_total FROM inventory_recipe_ingredients WHERE recipe_version_id=v_version_id;
    UPDATE inventory_recipe_versions SET total_cost=v_total,cost_per_portion=v_total,margin_amount=v_sale_price-v_total,
      margin_percent=CASE WHEN v_sale_price>0 THEN ROUND((v_sale_price-v_total)/v_sale_price*100,4) ELSE 0 END,
      cost_percent=CASE WHEN v_sale_price>0 THEN ROUND(v_total/v_sale_price*100,4) ELSE 0 END
    WHERE id=v_version_id;
    UPDATE inventory_recipe_versions SET status='ARCHIVED',archived_at=NOW() WHERE recipe_id=v_recipe_id AND status='ACTIVE';
    UPDATE inventory_recipe_versions SET status='ACTIVE',activated_at=NOW() WHERE id=v_version_id;
  END IF;
END $$;

