import assert from "node:assert/strict";
const bases = process.argv.slice(2);
if (!bases.length) bases.push("http://localhost:5173", "http://localhost:4173");
const results = [];
for (const base of bases) {
  const response = await fetch(new URL("/api/public/catalog", base), { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `Catálogo: ${base}`);
  const catalog = await response.json();
  assert.ok(catalog.fullMenu?.length >= Number(process.env.EXPECTED_MENU_COUNT || 91), "Falta la carta completa");
  const forbidden = ["recipe", "ingredients", "draftIngredients", "recipeCost", "recipeVersionId", "limitingIngredient"];
  for (const item of [...catalog.menu, ...catalog.restaurantMenu]) {
    for (const key of forbidden) assert.ok(!(key in item), `Dato interno publicado: ${item.name}.${key}`);
  }
  const pending = [];
  for (const item of catalog.fullMenu) {
    for (const key of forbidden) assert.ok(!(key in item), `Dato interno publicado: ${item.name}.${key}`);
    assert.ok(Number.isFinite(item.price) && item.price >= 0, `Precio inválido: ${item.name}`);
    if (item.photoPending) { pending.push(item.name); continue; }
    const image = await fetch(new URL(item.image, base), { signal: AbortSignal.timeout(15000) });
    assert.equal(image.status, 200, `Foto: ${item.name}`);
    assert.match(image.headers.get("content-type") || "", /^image\//, `Tipo de foto: ${item.name}`);
    assert.ok((await image.arrayBuffer()).byteLength > 0, `Foto vacía: ${item.name}`);
  }
  assert.ok(catalog.menu.every(item => item.available && item.salesEnabled), "La venta incluye productos no disponibles");
  if (process.env.REQUIRE_ORIGINAL_PHOTOS === "true") assert.deepEqual(pending, [], "Faltan fotos originales");
  results.push({ base, products: catalog.fullMenu.length, purchasable: catalog.menu.length, originalPhotos: catalog.fullMenu.length - pending.length, pendingPhotos: pending });
}
console.log(JSON.stringify({ status: "PASSED", results }, null, 2));
