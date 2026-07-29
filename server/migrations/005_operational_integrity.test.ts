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
const preflight = fs.readFileSync(
  path.resolve(process.cwd(), "MIGRATION_005_PREFLIGHT.sql"),
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

  it("allows only null or Cloudinary external image providers", () => {
    expect(migration).toContain("menu_items_image_provider_check");
    expect(migration).toContain(
      "image_provider is null or image_provider = 'cloudinary'",
    );
  });

  it("normalizes whitespace-only payment references before duplicate checks", () => {
    const normalization = migration.indexOf(
      "where reference is not null and btrim(reference) = ''",
    );
    const guard = migration.indexOf(
      "duplicate non-empty payment reference group(s) exist",
    );
    expect(normalization).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(normalization);
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

  it("keeps the standalone preflight a single read-only query", () => {
    expect(preflight).toMatch(/select jsonb_build_object\(/);
    expect(preflight).not.toMatch(/\bcreate\s+(?:temporary\s+)?table\b/i);
    expect(preflight).not.toMatch(/\binsert\s+into\b/i);
    expect(preflight).not.toMatch(/\bupdate\s+(orders|payments|menu_items)\b/i);
    expect(preflight).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("reports required integrity and inventory checks", () => {
    for (const check of [
      "invalid_order_status",
      "invalid_payment_status",
      "duplicate_payment_reference",
      "invalid_order_place",
      "null_menu_availability",
      "invalid_service_fee",
      "invalid_delivery_fee",
      "orphaned_order_item_order",
      "orphaned_payment_order",
      "orphaned_voucher_customer",
      "duplicate_voucher_redemption_candidate",
      "'schemaMigrations'",
      "'inventory'",
      "'duplicatePaymentReferences'",
      "'whitespacePaymentReferences'",
      "'menuAvailabilityPreview'",
    ]) {
      expect(preflight).toContain(check);
    }
    expect(preflight).toContain("from schema_migrations");
    expect(preflight).toContain("from payments");
    expect(preflight).toContain("'orders',true,count(*) from orders");
  });
});
