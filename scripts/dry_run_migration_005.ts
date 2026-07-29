import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import { Client } from "pg";

import {
  assertMigration005StagingTarget,
  migrationTargetDetails,
} from "../server/neon";

dotenv.config({ path: [".env.local", ".env"] });

const connectionString =
  process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const migrationPath = path.resolve(
  process.cwd(),
  "server",
  "migrations",
  "005_operational_integrity.sql",
);

async function scalarRows(client: Client) {
  const result = await client.query<{
    accounts: string;
    menu_item_sizes: string;
    menu_items: string;
    order_items: string;
    orders: string;
    payments: string;
    vouchers: string;
  }>(
    `select
       (select count(*) from accounts)::text as accounts,
       (select count(*) from menu_items)::text as menu_items,
       (select count(*) from menu_item_sizes)::text as menu_item_sizes,
       (select count(*) from orders)::text as orders,
       (select count(*) from order_items)::text as order_items,
       (select count(*) from payments)::text as payments,
       (select count(*) from vouchers)::text as vouchers`,
  );
  return result.rows[0]!;
}

async function schemaSignature(client: Client): Promise<string> {
  const result = await client.query<{ signature: string }>(
    `select md5(coalesce(string_agg(entry,E'\n' order by entry),''))
       as signature
     from (
       select concat_ws('|','column',table_name,column_name,data_type,
                is_nullable,column_default) as entry
       from information_schema.columns
       where table_schema=current_schema()
       union all
       select concat_ws('|','constraint',conrelid::regclass::text,
                conname,pg_get_constraintdef(oid)) as entry
       from pg_constraint
       where connamespace=current_schema()::regnamespace
       union all
       select concat_ws('|','index',tablename,indexname,indexdef) as entry
       from pg_indexes where schemaname=current_schema()
     ) catalog`,
  );
  return result.rows[0]!.signature;
}

async function migrationApplied(client: Client): Promise<boolean> {
  const result = await client.query<{ applied: boolean }>(
    `select exists(
       select 1 from schema_migrations
       where filename='005_operational_integrity.sql'
     ) as applied`,
  );
  return result.rows[0]!.applied;
}

async function main() {
  const target = migrationTargetDetails(connectionString);
  assertMigration005StagingTarget(connectionString, {
    ...process.env,
    MIGRATION_CONFIRM_STAGING: "true",
  });
  const migrationSql = await fs.readFile(migrationPath, "utf8");
  const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
  const secureConnectionString = connectionString.replace(
    "sslmode=require",
    "sslmode=verify-full",
  );
  const client = new Client({
    connectionString: secureConnectionString,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    const beforeRows = await scalarRows(client);
    const beforeSchema = await schemaSignature(client);
    const appliedBefore = await migrationApplied(client);
    if (appliedBefore) {
      throw new Error("Migration 005 is already applied; dry run stopped.");
    }

    await client.query("begin");
    try {
      await client.query(migrationSql);
      const inside = await client.query<{
        has_history: boolean;
        has_ledger: boolean;
        has_price_history: boolean;
        has_redemptions: boolean;
        order_place_not_null: boolean;
        payment_reference_index: boolean;
      }>(
        `select
           to_regclass('order_status_history') is not null as has_history,
           to_regclass('menu_price_history') is not null as has_price_history,
           to_regclass('loyalty_ledger') is not null as has_ledger,
           to_regclass('voucher_redemptions') is not null as has_redemptions,
           exists(
             select 1 from information_schema.columns
             where table_schema=current_schema() and table_name='orders'
               and column_name='order_place' and is_nullable='NO'
           ) as order_place_not_null,
           to_regclass('payments_order_reference_unique') is not null
             as payment_reference_index`,
      );
      if (Object.values(inside.rows[0]!).some((value) => value !== true)) {
        throw new Error("Migration 005 dry-run verification failed inside transaction.");
      }
    } finally {
      await client.query("rollback");
    }

    const afterRows = await scalarRows(client);
    const afterSchema = await schemaSignature(client);
    const appliedAfter = await migrationApplied(client);
    const rowCountsUnchanged =
      JSON.stringify(beforeRows) === JSON.stringify(afterRows);
    const schemaUnchanged = beforeSchema === afterSchema;
    if (!rowCountsUnchanged || !schemaUnchanged || appliedAfter) {
      throw new Error("Migration 005 dry run left persistent changes.");
    }
    console.log(
      JSON.stringify(
        {
          checksum,
          database: target.database,
          host: target.host,
          migrationAppliedAfter: appliedAfter,
          migrationAppliedBefore: appliedBefore,
          result: "PASS",
          rolledBack: true,
          rowCountsUnchanged,
          schemaUnchanged,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
