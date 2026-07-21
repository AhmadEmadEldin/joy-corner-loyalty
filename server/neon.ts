import fs from "node:fs/promises";
import path from "node:path";
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
  const migrationPath = path.resolve(
    process.cwd(),
    "server",
    "migrations",
    "001_initial.sql",
  );
  const sql = await fs.readFile(migrationPath, "utf8");
  await getNeonPool().query(sql);
}

export async function closeNeonPool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
