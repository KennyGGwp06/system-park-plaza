-- Fichas técnicas completas y manuales operativos para toda la carta demostrativa.
INSERT INTO inventory_products(code,name,category_id,base_unit_id,purchase_unit_id,product_type,minimum_stock,maximum_stock,average_cost,default_area_code,status,track_lots,track_expiry,tolerance_percent,metadata)
SELECT row.code,row.name,c.id,u.id,u.id,'RAW_MATERIAL',row.minimum_stock,row.maximum_stock,row.average_cost,row.area,'ACTIVE',TRUE,row.track_expiry,row.tolerance,'{"operationalPhase2Seed":true}'::jsonb
FROM (VALUES
  ('COCINA_TOMATE','Tomate','G',500,10000,0.005,'RESTAURANTE',TRUE,5),
  ('COCINA_AJI_AMARILLO','Ají amarillo','G',100,2000,0.020,'RESTAURANTE',TRUE,6),
  ('COCINA_PAPA','Papa amarilla','KG',3,50,4.500,'RESTAURANTE',TRUE,4),
  ('COCINA_SILLAO','Sillao','ML',500,5000,0.008,'RESTAURANTE',FALSE,3),
  ('COCINA_VINAGRE','Vinagre tinto','ML',300,3000,0.006,'RESTAURANTE',FALSE,3),
  ('COCINA_ACEITE','Aceite vegetal','ML',1000,10000,0.007,'RESTAURANTE',FALSE,3),
  ('COCINA_POLLO','Pollo deshuesado','KG',3,40,14.000,'RESTAURANTE',TRUE,4),
  ('COCINA_HOJA_BIJAO','Hoja de bijao','UNIT',20,300,0.800,'RESTAURANTE',TRUE,5),
  ('COCINA_HUEVO','Huevo','UNIT',30,500,0.700,'RESTAURANTE',TRUE,3),
  ('COCINA_ACEITUNA','Aceituna','UNIT',50,1000,0.180,'RESTAURANTE',TRUE,4),
  ('COCINA_PALILLO','Palillo / cúrcuma','G',100,1500,0.018,'RESTAURANTE',FALSE,5),
  ('COCINA_COMINO','Comino','G',100,1200,0.025,'RESTAURANTE',FALSE,5),
  ('BAR_JUGO_COCONA','Jugo de cocona para bar','ML',500,5000,0.009,'BARTENDER',TRUE,5),
  ('BAR_JUGO_MARACUYA','Jugo de maracuyá','ML',500,5000,0.010,'BARTENDER',TRUE,5),
  ('BAR_HIELO','Hielo','G',3000,30000,0.001,'BARTENDER',FALSE,8)
) AS row(code,name,unit_code,minimum_stock,maximum_stock,average_cost,area,track_expiry,tolerance)
JOIN inventory_units u ON u.code=row.unit_code
JOIN inventory_categories c ON c.code='RAW_MATERIALS'
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,average_cost=EXCLUDED.average_cost,metadata=inventory_products.metadata||EXCLUDED.metadata;

INSERT INTO inventory_lots(product_id,lot_code,manufactured_on,expires_on,unit_cost,status)
SELECT p.id,'PHASE2-'||p.code,CURRENT_DATE,CASE WHEN p.track_expiry THEN CURRENT_DATE+INTERVAL '30 days' END,p.average_cost,'AVAILABLE'
FROM inventory_products p WHERE p.metadata @> '{"operationalPhase2Seed":true}'::jsonb
ON CONFLICT(product_id,lot_code) DO NOTHING;

INSERT INTO inventory_stock_balances(product_id,warehouse_id,lot_id,on_hand,reserved)
SELECT p.id,w.id,l.id,CASE u.dimension WHEN 'VOLUME' THEN 5000 WHEN 'COUNT' THEN 300 ELSE 5000 END,0
FROM inventory_products p JOIN inventory_units u ON u.id=p.base_unit_id JOIN inventory_warehouses w ON w.code=p.default_area_code
JOIN inventory_lots l ON l.product_id=p.id AND l.lot_code='PHASE2-'||p.code
WHERE p.metadata @> '{"operationalPhase2Seed":true}'::jsonb
ON CONFLICT(product_id,warehouse_id,lot_id) DO NOTHING;

CREATE TEMP TABLE phase2_recipe_lines(menu_item_id BIGINT,product_code TEXT,unit_code TEXT,quantity NUMERIC,base_quantity NUMERIC,tolerance NUMERIC,technical_waste NUMERIC) ON COMMIT DROP;
INSERT INTO phase2_recipe_lines VALUES
  (1,'LEGACY_PRODUCT_1','G',220,0.22,3,2),(1,'COCINA_CEBOLLA_ROJA','G',40,40,5,2),(1,'COCINA_COCONA','G',35,35,5,3),(1,'COCINA_AJI_CHARAPITA','G',2,2,10,2),(1,'COCINA_CILANTRO','G',3,3,10,5),(1,'COCINA_SAL','G',3,3,10,0),(1,'COCINA_JUGO_LIMON','ML',50,50,5,2),(1,'COCINA_AJO','G',2,2,10,2),
  (2,'LEGACY_PRODUCT_3','G',200,0.20,3,2),(2,'LEGACY_PRODUCT_2','G',100,0.10,3,1),(2,'COCINA_CEBOLLA_ROJA','G',50,50,5,2),(2,'COCINA_TOMATE','G',60,60,5,2),(2,'COCINA_AJI_AMARILLO','G',15,15,6,3),(2,'COCINA_PAPA','G',250,0.25,4,3),(2,'COCINA_SILLAO','ML',15,15,3,1),(2,'COCINA_VINAGRE','ML',5,5,3,1),(2,'COCINA_ACEITE','ML',20,20,3,2),(2,'COCINA_CILANTRO','G',2,2,10,4),(2,'COCINA_SAL','G',3,3,10,0),
  (3,'LEGACY_PRODUCT_2','G',180,0.18,3,1),(3,'COCINA_POLLO','G',150,0.15,4,3),(3,'COCINA_HOJA_BIJAO','UNIT',1,1,5,0),(3,'COCINA_HUEVO','UNIT',1,1,3,0),(3,'COCINA_ACEITUNA','UNIT',2,2,4,0),(3,'COCINA_PALILLO','G',2,2,5,1),(3,'COCINA_AJO','G',5,5,8,2),(3,'COCINA_COMINO','G',1,1,8,1),(3,'COCINA_ACEITE','ML',15,15,3,2),(3,'COCINA_SAL','G',3,3,10,0),
  (4,'LEGACY_PRODUCT_4','ML',60,60,3,1),(4,'BAR_JUGO_LIMON','ML',30,30,5,2),(4,'BAR_JARABE_GOMA','ML',20,20,3,1),(4,'BAR_CLARA_HUEVO','ML',20,20,5,2),(4,'BAR_AMARGO_ANGOSTURA','ML',3,3,10,1),
  (5,'LEGACY_PRODUCT_6','ML',50,50,3,1),(5,'BAR_JUGO_COCONA','ML',40,40,5,2),(5,'BAR_JUGO_MARACUYA','ML',30,30,5,2),(5,'BAR_JARABE_GOMA','ML',15,15,3,1),(5,'BAR_JUGO_LIMON','ML',15,15,5,2),(5,'BAR_HIELO','G',180,180,8,3);

DO $$
DECLARE m RECORD; v_recipe BIGINT; v_version BIGINT; v_next INTEGER; v_unit BIGINT; v_total NUMERIC; v_price NUMERIC; v_manual JSONB;
BEGIN
  SELECT id INTO v_unit FROM inventory_units WHERE code='UNIT';
  FOR m IN SELECT DISTINCT menu_item_id FROM phase2_recipe_lines ORDER BY menu_item_id LOOP
    SELECT id INTO v_recipe FROM inventory_recipes WHERE legacy_menu_item_id=m.menu_item_id;
    IF v_recipe IS NULL OR EXISTS(SELECT 1 FROM inventory_recipe_versions WHERE recipe_id=v_recipe AND metadata @> '{"phase2CompleteRecipe":true}'::jsonb) THEN CONTINUE; END IF;
    SELECT COALESCE(MAX(version),0)+1 INTO v_next FROM inventory_recipe_versions WHERE recipe_id=v_recipe;
    SELECT COALESCE((metadata->>'price')::numeric,0) INTO v_price FROM inventory_recipe_versions WHERE recipe_id=v_recipe ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,version DESC LIMIT 1;
    v_price := CASE m.menu_item_id WHEN 1 THEN 34 WHEN 2 THEN 38 WHEN 3 THEN 29 WHEN 4 THEN 24 ELSE 27 END;
    v_manual := CASE m.menu_item_id
      WHEN 1 THEN '{"description":"Ceviche amazónico preparado al momento con corte uniforme y cadena de frío.","prepMinutes":22,"temperature":"0–5 °C","plating":"Plato frío; cebolla y hierbas al final","allergens":"Pescado","equipment":"Tabla exclusiva, cuchillo, balanza y bowl frío","steps":["Pesar 220 g de pescado limpio y mantenerlo refrigerado.","Cortar en cubos uniformes y sazonar con sal y ajo.","Agregar jugo de limón, cocona y ají; mezclar máximo 45 segundos.","Incorporar cebolla y cilantro sin maltratar el pescado.","Servir inmediatamente en plato frío y verificar presentación."]}'::jsonb
      WHEN 2 THEN '{"description":"Salteado de lomo por porción, con arroz crudo estandarizado y papas pesadas.","prepMinutes":28,"temperature":"Centro del lomo ≥ 63 °C","plating":"Arroz moldeado, papas separadas y salteado al centro","allergens":"Soya","equipment":"Balanza, wok, pinzas, cuchillo y termómetro","steps":["Pesar 200 g de lomo, 100 g de arroz crudo y 250 g de papa.","Cocinar el arroz según lote de producción y freír las papas.","Sellar el lomo en wok muy caliente con aceite.","Agregar cebolla, tomate y ají; saltear manteniendo textura.","Incorporar sillao y vinagre, rectificar sal y terminar con cilantro.","Verificar temperatura, porción y presentación antes de marcar listo."]}'::jsonb
      WHEN 3 THEN '{"description":"Juane regional estandarizado desde materia prima pesada y envoltura individual.","prepMinutes":45,"temperature":"Centro ≥ 74 °C","plating":"En hoja de bijao limpia y abierta al servir","allergens":"Huevo","equipment":"Balanza, olla, termómetro, mesa de armado y cuerda","steps":["Pesar arroz crudo y pollo para una porción.","Preparar aderezo con aceite, ajo, palillo, comino y sal.","Cocinar parcialmente arroz y pollo; enfriar hasta temperatura segura de armado.","Colocar arroz, pollo, huevo y aceitunas sobre la hoja higienizada.","Cerrar y amarrar sin fugas; cocinar hasta alcanzar 74 °C al centro.","Escurrir, reposar cinco minutos y verificar peso final."]}'::jsonb
      WHEN 4 THEN '{"description":"Pisco sour dosificado en mililitros para costo y sabor constantes.","prepMinutes":8,"temperature":"Servir 2–6 °C","plating":"Copa fría y tres gotas de angostura","allergens":"Huevo","equipment":"Jigger, coctelera, colador y copa fría","steps":["Enfriar la copa y medir todos los líquidos con jigger.","Agregar pisco, limón, jarabe y clara a la coctelera.","Batir en seco para emulsionar y luego con hielo.","Colar en la copa fría sin restos de hielo.","Agregar tres gotas de angostura y servir de inmediato."]}'::jsonb
      ELSE '{"description":"Cóctel tropical de autor con dosificación exacta y balance ácido.","prepMinutes":10,"temperature":"Servir 2–6 °C","plating":"Vaso alto frío y decoración de fruta","allergens":"Sin alérgenos declarados","equipment":"Jigger, coctelera, colador y vaso alto","steps":["Enfriar el vaso y pesar 180 g de hielo.","Medir ginebra, cocona, maracuyá, limón y jarabe.","Agitar en coctelera durante 12 segundos.","Colar sobre el hielo pesado en vaso frío.","Verificar volumen, decoración y limpieza del borde antes de servir."]}'::jsonb END;
    INSERT INTO inventory_recipe_versions(recipe_id,version,status,yield_quantity,yield_unit_id,sale_price,valid_from,metadata)
    VALUES(v_recipe,v_next,'DRAFT',1,v_unit,v_price,NOW(),jsonb_build_object('phase2CompleteRecipe',true,'manual',v_manual)) RETURNING id INTO v_version;
    INSERT INTO inventory_recipe_ingredients(recipe_version_id,product_id,quantity,unit_id,consumption_mode,waste_tolerance_percent,technical_waste_percent,base_quantity,unit_cost_snapshot,line_cost)
    SELECT v_version,p.id,l.quantity,u.id,'MAKE_TO_ORDER',l.tolerance,l.technical_waste,l.base_quantity,p.average_cost,ROUND(l.base_quantity*p.average_cost*(1+l.technical_waste/100),6)
    FROM phase2_recipe_lines l JOIN inventory_products p ON p.code=l.product_code JOIN inventory_units u ON u.code=l.unit_code WHERE l.menu_item_id=m.menu_item_id;
    SELECT COALESCE(SUM(line_cost),0) INTO v_total FROM inventory_recipe_ingredients WHERE recipe_version_id=v_version;
    UPDATE inventory_recipe_versions SET total_cost=v_total,cost_per_portion=v_total,margin_amount=v_price-v_total,margin_percent=CASE WHEN v_price>0 THEN ROUND((v_price-v_total)/v_price*100,4) ELSE 0 END,cost_percent=CASE WHEN v_price>0 THEN ROUND(v_total/v_price*100,4) ELSE 0 END WHERE id=v_version;
    UPDATE inventory_recipe_versions SET status='ARCHIVED',valid_to=NOW(),archived_at=NOW() WHERE recipe_id=v_recipe AND status='ACTIVE';
    UPDATE inventory_recipe_versions SET status='ACTIVE',activated_at=NOW() WHERE id=v_version;
  END LOOP;
END $$;
