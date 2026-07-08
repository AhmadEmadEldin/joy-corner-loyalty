import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

type AuditEvent = {
  action: string;
  auditId: string;
  entityId?: string;
  entityType: string;
  newValue?: unknown;
  previousValue?: unknown;
  reason?: string;
  requestId?: string;
  role: string;
  sessionMetadata?: unknown;
  success: boolean;
  timestamp: string;
  userId?: string;
};

let pool: Pool | null = null;

export function neonConfigured() {
  return (
    process.env.NEON_BACKUP_ENABLED === "true" &&
    Boolean(process.env.NEON_DATABASE_URL)
  );
}

export function getNeonPool() {
  if (!neonConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function neonHealth() {
  const connection = getNeonPool();
  if (!connection) {
    return {
      configured: false,
      ok: false,
      message:
        "NEON_DATABASE_URL is not configured or NEON_BACKUP_ENABLED is not true.",
    };
  }

  const startedAt = Date.now();
  await connection.query("select 1 as ok");
  return {
    configured: true,
    latencyMs: Date.now() - startedAt,
    ok: true,
  };
}

export async function applyNeonMigrations() {
  const connection = getNeonPool();
  if (!connection) {
    throw new Error("Neon is not configured.");
  }

  const schemaPath = path.resolve(process.cwd(), "docs", "neon-schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  await connection.query("begin");
  try {
    await connection.query(sql);
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  }
}

export async function writeNeonAuditLog(event: AuditEvent) {
  const connection = getNeonPool();
  if (!connection) return { skipped: true };

  await connection.query(
    `insert into audit_logs (
      audit_id,
      user_id,
      user_role,
      action,
      entity_type,
      entity_id,
      previous_value,
      new_value,
      success,
      reason,
      request_id,
      session_metadata,
      created_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (audit_id) do nothing`,
    [
      event.auditId,
      event.userId || null,
      event.role,
      event.action,
      event.entityType,
      event.entityId || null,
      event.previousValue == null ? null : JSON.stringify(event.previousValue),
      event.newValue == null ? null : JSON.stringify(event.newValue),
      event.success,
      event.reason || null,
      event.requestId || null,
      event.sessionMetadata == null
        ? null
        : JSON.stringify(event.sessionMetadata),
      event.timestamp,
    ],
  );

  return { skipped: false };
}
