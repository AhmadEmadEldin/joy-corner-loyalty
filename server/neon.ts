import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;
const guardedMigration = "005_operational_integrity.sql";

type MigrationTarget = {
  database: string;
  host: string;
};

export function migrationTargetDetails(
  connectionString: string,
): MigrationTarget {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error("The database connection string is not a valid URL.");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("Migrations require a PostgreSQL connection string.");
  }
  const database = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  if (!target.hostname || !database) {
    throw new Error("The migration target must include a host and database name.");
  }
  return { database, host: target.hostname.toLowerCase() };
}

export function assertMigration005StagingTarget(
  connectionString: string,
  environment: NodeJS.ProcessEnv = process.env,
): MigrationTarget {
  const target = migrationTargetDetails(connectionString);
  if (environment.NODE_ENV === "test") return target;
  if (environment.NODE_ENV === "production") {
    throw new Error(
      "Migration 005 is blocked when NODE_ENV=production. No production bypass is configured.",
    );
  }
  if (environment.MIGRATION_CONFIRM_STAGING !== "true") {
    throw new Error(
      "Migration 005 requires MIGRATION_CONFIRM_STAGING=true for a staging target.",
    );
  }
  if (environment.DATABASE_SSL === "false") {
    throw new Error("Migration 005 requires DATABASE_SSL=true.");
  }
  if (!/(^|\.)neon\.tech$/i.test(target.host)) {
    throw new Error("Migration 005 requires a Neon staging database host.");
  }
  if (target.host.includes("-pooler.")) {
    throw new Error(
      "Migration 005 requires a direct, unpooled Neon connection string.",
    );
  }
  const productionMarker = /(^|[-_.])(prod|production)([-_.]|$)/i;
  if (
    productionMarker.test(target.host) ||
    productionMarker.test(target.database)
  ) {
    throw new Error(
      "Migration 005 is blocked because the target appears to be production.",
    );
  }
  return target;
}

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
  let advisoryLockHeld = false;
  try {
    const migrationTable = await client.query<{ exists: boolean }>(
      "select to_regclass('schema_migrations') is not null as exists",
    );
    const guardedApplied = migrationTable.rows[0]?.exists
      ? await client.query<{ exists: boolean }>(
          `select exists(
             select 1 from schema_migrations where filename=$1
           ) as exists`,
          [guardedMigration],
        )
      : { rows: [] as Array<{ exists: boolean }> };
    if (!guardedApplied.rows[0]?.exists) {
      const connectionString =
        process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
      const target = assertMigration005StagingTarget(connectionString);
      console.info(
        `Migration target confirmed: host=${target.host} database=${target.database}`,
      );
    }
    await client.query("select pg_advisory_lock(hashtext('joy-corner-schema-migrations'))");
    advisoryLockHeld = true;
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
    if (advisoryLockHeld) {
      await client
        .query(
          "select pg_advisory_unlock(hashtext('joy-corner-schema-migrations'))",
        )
        .catch(() => undefined);
    }
    client.release();
  }
}

export async function closeNeonPool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
