// Solo para una base NUEVA. No importa ventas, usuarios ni existencias de un respaldo.
export function initialCatalog(state, source) {
  if (source.originalCount !== 91 || source.menuItems?.length !== 91) throw new Error("Carta original incompleta");
  const next = structuredClone(state);
  next.menuItems = source.menuItems.map((item) => {
    const { recipeVersionId, draftIngredients, ...catalog } = structuredClone(item);
    return { ...catalog, salesEnabled: false };
  });
  next.inventory = source.inventory.map((item) => ({ ...structuredClone(item), stock: 0, reserved: 0, openedStock: 0 }));
  return next;
}

// El cliente recibe datos de presentación; costos y recetas quedan en el ERP.
export function publicCatalogItem(item, operational) {
  const salesEnabled = item.salesEnabled === true;
  const portions = Math.max(0, Number(operational?.availablePortions || 0));
  return {
    id: item.id, code: item.code, name: item.name, area: item.area,
    description: item.description || "", category: item.category || "Carta",
    tags: item.tags || [], image: item.image || "", price: Number(item.price),
    prepMinutes: item.prepMinutes, availableFor: item.availableFor || [],
    salesEnabled, available: salesEnabled && portions > 0,
    photoPending: !item.image || /placeholder/.test(item.image)
  };
}
