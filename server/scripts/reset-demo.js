import 'dotenv/config';
import { db } from '../src/db.js';

async function resetDemo() {
  console.log('Borrando base de datos para recargar db.js...');
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;');
  console.log('¡Base de datos reseteada con éxito!');
  process.exit(0);
}

resetDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
