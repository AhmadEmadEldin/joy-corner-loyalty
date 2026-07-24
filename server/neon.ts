import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function neonConfigured(): boolean {
  return Boolean(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
}

export function getNeonPool(): Pool {
  const connectionString =
    process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("NEON_DATABASE_URL is not configured.");
  if (!pool) {
    const secureConnectionString = connectionString.replace(
      "sslmode=require",
      "sslmode=verify-full",
    );
    pool = new Pool({
      connectionString: secureConnectionString,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: true },
    });
    pool.on("error", (error) => console.error("Unexpected database error", error));
  }
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getNeonPool().query<T>(text, values);
  return result.rows;
}

export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getNeonPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function neonHealth(): Promise<{
  configured: boolean;
  latencyMs?: number;
  ok: boolean;
}> {
  if (!neonConfigured()) return { configured: false, ok: false };
  const startedAt = Date.now();
  await getNeonPool().query("select 1");
  return { configured: true, latencyMs: Date.now() - startedAt, ok: true };
}

export async function applyNeonMigrations(): Promise<void> {
  const migrationsPath = path.resolve(
    process.cwd(),
    "server",
    "migrations",
  );
  const files = (await fs.readdir(migrationsPath))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));
  const client = await getNeonPool().connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('joy-corner-schema-migrations'))");
    await client.query(
      `create table if not exists schema_migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )`,
    );
    for (const filename of files) {
      const sql = await fs.readFile(path.join(migrationsPath, filename), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "select checksum from schema_migrations where filename=$1",
        [filename],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${filename} has been modified.`);
        }
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations(filename,checksum) values($1,$2)",
          [filename, checksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('joy-corner-schema-migrations'))").catch(() => undefined);
    client.release();
  }
}

export async function closeNeonPool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
