import "dotenv/config";
import pg from "pg";
import { migrateLegacyInventory } from "../src/inventory-relational.js";
import { migrateDown, migrateUp } from "../src/migrations.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const [direction = "up", version] = process.argv.slice(2);

try {
  if (direction === "up") {
    await migrateUp(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const source = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
      if (source.rowCount) await migrateLegacyInventory(client, source.rows[0].data);
      await client.query("COMMIT");
      console.log("Migraciones y datos existentes aplicados correctamente.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else if (direction === "down") {
    const reverted = await migrateDown(pool, version);
    console.log(reverted ? `Rollback aplicado: ${version || "última migración"}.` : "La migración ya estaba revertida.");
  } else {
    throw new Error("Uso: npm run migrate --workspace server -- up|down [version]");
  }
} finally {
  await pool.end();
}
