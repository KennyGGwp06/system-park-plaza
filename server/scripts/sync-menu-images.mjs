import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

// Solo actualiza las fotos del catálogo identificado. Requiere respaldo previo.
// No pasa por el editor de precios/recetas ni ejecuta migraciones o semillas.
const manifest = JSON.parse(await readFile(new URL('../data/menu-image-manifest.json', import.meta.url)));
assert.equal(manifest.images.length, 91);
assert.equal(new Set(manifest.images.map(image => image.menuItemId)).size, 91);
for (const image of manifest.images) {
 assert.ok(!image.file.includes('..') && image.url === `/uploads/menu/${image.file}`);
 const bytes = await readFile(new URL(`../public/menu/${image.file}`, import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
}
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const client = await pool.connect();
try {
 await client.query('BEGIN');
 const {rows} = await client.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE');
 assert.equal(rows.length,1);
 const before = rows[0].data;
 const state = structuredClone(before);
 let changed = 0;
 for (const image of manifest.images) {
  const item = state.menuItems.find(item => Number(item.id) === image.menuItemId);
  assert.equal(item?.name,image.name,`Identidad de producto distinta: ${image.menuItemId}`);
  if(item.image !== image.url) { item.image = image.url; changed++; }
 }
 const withoutImages = value => ({...value,menuItems:value.menuItems.map(({image,...item})=>item)});
 assert.deepEqual(withoutImages(state),withoutImages(before),'Cambió un dato distinto a imagen');
 if(changed) {
  await client.query('UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1',[JSON.stringify(state)]);
  const saved = (await client.query('SELECT data FROM app_state WHERE id=1')).rows[0].data;
  assert.deepEqual(withoutImages(saved),withoutImages(before),'El guardado alteró datos operativos');
 }
 await client.query('COMMIT');
 console.log(JSON.stringify({status:'PASSED',catalogPhotos:manifest.images.length,changed,operationalDataPreserved:true}));
} catch(error) {
 await client.query('ROLLBACK');
 throw error;
} finally { client.release(); await pool.end(); }
