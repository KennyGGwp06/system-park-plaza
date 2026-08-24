import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      checksum VARCHAR(128) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function listMigrations() {
  const names = await readdir(migrationsDirectory);
  return names.filter((name) => name.endsWith(".up.sql")).sort().map((name) => ({
    version: name.replace(/\.up\.sql$/, ""),
    upPath: join(migrationsDirectory, name),
    downPath: join(migrationsDirectory, name.replace(/\.up\.sql$/, ".down.sql"))
  }));
}

export async function migrateUp(pool) {
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    for (const migration of await listMigrations()) {
      const applied = await client.query("SELECT version FROM schema_migrations WHERE version = $1", [migration.version]);
      if (applied.rowCount) continue;
      const sql = await readFile(migration.upPath, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version, checksum) VALUES ($1, md5($2))", [migration.version, sql]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Falló la migración ${migration.version}: ${error.message}`, { cause: error });
      }
    }
  } finally {
    client.release();
  }
}

export async function migrateDown(pool, version) {
  const migrations = await listMigrations();
  const selected = version ? migrations.find((item) => item.version === version) : migrations.at(-1);
  if (!selected) throw new Error(`Migración no encontrada: ${version || "última"}`);
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version = $1", [selected.version]);
    if (!applied.rowCount) return false;
    const sql = await readFile(selected.downPath, "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("DELETE FROM schema_migrations WHERE version = $1", [selected.version]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Falló el rollback ${selected.version}: ${error.message}`, { cause: error });
    }
  } finally {
    client.release();
  }
}

export { migrationsDirectory };
