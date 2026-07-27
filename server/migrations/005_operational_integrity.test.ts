import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "server",
    "migrations",
    "005_operational_integrity.sql",
  ),
  "utf8",
);

describe("migration 005 operational integrity", () => {
  it("updates only legacy order statuses", () => {
    expect(migration).toMatch(
      /where status in \('pending_confirmation','accepted','preparing','closed'\);/,
    );
  });

  it("backfills only missing menu availability values", () => {
    expect(migration).toMatch(/where availability_status is null;/);
  });

  it("constrains order places to application values", () => {
    expect(migration).toContain("orders_order_place_check");
    expect(migration).toContain(
      "order_place in ('dine_in','takeaway','car','outside','delivery')",
    );
  });

  it("enforces non-negative monetary and loyalty balances", () => {
    expect(migration).toContain("orders_service_fee_nonnegative");
    expect(migration).toContain("orders_delivery_fee_nonnegative");
    expect(migration).toContain(
      "voucher_redemptions_discount_amount_nonnegative",
    );
    expect(migration).toContain(
      "loyalty_ledger_balance_after_nonnegative",
    );
  });

  it("checks duplicate payment references before creating the unique index", () => {
    const guard = migration.indexOf(
      "duplicate non-empty payment reference group(s) exist",
    );
    const index = migration.indexOf(
      "create unique index if not exists payments_order_reference_unique",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(guard);
  });

  it("does not invent status or price history", () => {
    expect(migration).not.toMatch(
      /insert\s+into\s+(order_status_history|menu_price_history)/i,
    );
  });
});
