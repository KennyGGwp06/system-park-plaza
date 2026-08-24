DO $$
DECLARE
  seeded RECORD;
  previous_id BIGINT;
BEGIN
  FOR seeded IN
    SELECT rv.id,rv.recipe_id FROM inventory_recipe_versions rv
    WHERE rv.metadata @> '{"operationalExactRecipe":true}'::jsonb
  LOOP
    IF EXISTS(SELECT 1 FROM inventory_order_lines WHERE recipe_version_id=seeded.id)
       OR EXISTS(SELECT 1 FROM inventory_recipe_sales WHERE recipe_version_id=seeded.id) THEN
      RAISE EXCEPTION 'No se puede revertir la receta operativa: ya tiene pedidos históricos';
    END IF;
    SELECT id INTO previous_id FROM inventory_recipe_versions
      WHERE recipe_id=seeded.recipe_id AND id<>seeded.id AND status='ARCHIVED'
      ORDER BY version DESC LIMIT 1;
    ALTER TABLE inventory_recipe_versions DISABLE TRIGGER trg_protect_technical_recipe_version;
    ALTER TABLE inventory_recipe_ingredients DISABLE TRIGGER trg_protect_technical_recipe_ingredient;
    DELETE FROM inventory_recipe_ingredients WHERE recipe_version_id=seeded.id;
    DELETE FROM inventory_recipe_versions WHERE id=seeded.id;
    IF previous_id IS NOT NULL THEN UPDATE inventory_recipe_versions SET status='ACTIVE',archived_at=NULL WHERE id=previous_id; END IF;
    ALTER TABLE inventory_recipe_ingredients ENABLE TRIGGER trg_protect_technical_recipe_ingredient;
    ALTER TABLE inventory_recipe_versions ENABLE TRIGGER trg_protect_technical_recipe_version;
  END LOOP;
END $$;

-- Los insumos se conservan al revertir para no borrar posibles movimientos o conteos posteriores.
