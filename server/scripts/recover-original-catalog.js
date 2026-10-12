import 'dotenv/config';
import pg from 'pg';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { planCatalogRecovery } from '../src/catalog-recovery.js';

const apply=process.argv.includes('--apply');
if(!process.env.DATABASE_URL)throw Error('Configura DATABASE_URL de la instalación que se va a revisar.');
const source=JSON.parse(await readFile(new URL('../data/park-plaza-original-catalog.json',import.meta.url),'utf8'));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
let syncPool;
try{
  await client.query(apply?'BEGIN':'BEGIN READ ONLY');
  const rows=await client.query(`SELECT data FROM app_state WHERE id=1 ${apply?'FOR UPDATE':''}`);
  if(!rows.rowCount)throw Error('La instalación no tiene app_state; no se ejecuta ningún reinicio.');
  const before=rows.rows[0].data;
  const {state,report}=planCatalogRecovery(before,source);
  console.log(JSON.stringify({mode:apply?'APLICAR':'SOLO DIAGNÓSTICO',...report},null,2));
  if(report.conflicts.length)throw Error('Hay conflictos de identificadores o ingredientes. No se aplicó la recuperación.');
  if(apply&&report.changed){
    const folder=resolve(process.env.CATALOG_RECOVERY_BACKUP_DIR||'backups');await mkdir(folder,{recursive:true});
    const path=resolve(folder,`catalog-before-recovery-${Date.now()}.json`);
    await writeFile(path,JSON.stringify(before),{flag:'wx',mode:0o600});
    // Keep the existing compatibility synchronizer inside this transaction.
    // Importing db.js opens a pool but does not initialize or reseed the database.
    const {synchronizeLegacyInventory}=await import('../src/inventory-relational.js');
    syncPool=(await import('../src/db.js')).db;
    await synchronizeLegacyInventory(client,before,state,{mutationId:randomUUID()});
    await client.query('UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1',[JSON.stringify(state)]);
    console.log(`Respaldo previo guardado en ${path}`);
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  console.log(apply?'Recuperación terminada. Los productos añadidos quedan con venta pausada.':'No se modificó la base. Revisa el diagnóstico antes de usar --apply.');
}catch(error){await client.query('ROLLBACK');console.error(error.message);process.exitCode=1;}
finally{client.release();await pool.end();if(syncPool)await syncPool.end();}
