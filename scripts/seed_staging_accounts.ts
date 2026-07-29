import crypto from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";

import dotenv from "dotenv";
import { Client } from "pg";

import { assertMigration005StagingTarget } from "../server/neon";

dotenv.config({ path: [".env.local", ".env"] });

const scrypt = promisify(crypto.scrypt);
const envPath = ".env.local";
const connectionString =
  process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";

function setLocalEnvironment(name: string, value: string): void {
  let source = fs.readFileSync(envPath, "utf8");
  const pattern = new RegExp(`^${name}=.*$`, "m");
  source = pattern.test(source)
    ? source.replace(pattern, `${name}=${value}`)
    : `${source.replace(/\s*$/, "")}\n${name}=${value}\n`;
  fs.writeFileSync(envPath, source);
}

function stagingPassword(name: string): string {
  const existing = process.env[name];
  if (existing && existing.length >= 16) return existing;
  const generated = crypto.randomBytes(24).toString("base64url");
  setLocalEnvironment(name, generated);
  return generated;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function main() {
  const target = assertMigration005StagingTarget(connectionString, {
    ...process.env,
    MIGRATION_CONFIRM_STAGING: "true",
  });
  const accounts = [
    {
      email: "owner@joycorner.com",
      env: "STAGING_OWNER_PASSWORD",
      fullName: "Staging Owner",
      role: "owner",
    },
    {
      email: "cashier@joycorner.com",
      env: "STAGING_CASHIER_PASSWORD",
      fullName: "Staging Cashier",
      role: "cashier",
    },
    {
      email: "barista@joycorner.com",
      env: "STAGING_BARISTA_PASSWORD",
      fullName: "Staging Barista",
      role: "barista",
    },
    {
      email: "staging.customer@example.com",
      env: "STAGING_CUSTOMER_PASSWORD",
      fullName: "Staging Customer",
      role: "customer",
    },
  ];
  const client = new Client({
    connectionString: connectionString.replace(
      "sslmode=require",
      "sslmode=verify-full",
    ),
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    await client.query("begin");
    for (const account of accounts) {
      const passwordHash = await hashPassword(stagingPassword(account.env));
      const phone =
        account.role === "customer" ? "+201000000999" : null;
      const customerNumber =
        account.role === "customer" ? "STAGE-CUST-001" : null;
      await client.query(
        `insert into accounts(
           email,password_hash,full_name,phone,role,customer_number,active
         ) values($1,$2,$3,$4,$5,$6,true)
         on conflict(email) do update set
           password_hash=excluded.password_hash,
           full_name=excluded.full_name,
           phone=excluded.phone,
           role=excluded.role,
           customer_number=coalesce(accounts.customer_number,excluded.customer_number),
           active=true`,
        [
          account.email,
          passwordHash,
          account.fullName,
          phone,
          account.role,
          customerNumber,
        ],
      );
    }
    await client.query("commit");
    console.log(
      JSON.stringify({
        accounts: accounts.map((account) => account.role),
        database: target.database,
        host: target.host,
        result: "PASS",
      }),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
