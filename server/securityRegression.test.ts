/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

const apiSource = fs.readFileSync(path.resolve("server/api.ts"), "utf8");
const importSource = fs.readFileSync(
  path.resolve("scripts/import_google_sheet_to_neon.ts"),
  "utf8",
);

describe("security regression guards", () => {
  it("requires a configured session secret without a code fallback", () => {
    expect(apiSource).toContain("if (jwtSecret.length < 32)");
    expect(apiSource).not.toContain("development-secret-only");
  });

  it("sanitizes public readiness failures", () => {
    expect(apiSource).toContain('error: "database_unavailable"');
    expect(apiSource).not.toContain(
      'checks.database = { ok: false, error: error instanceof Error ? error.message',
    );
  });

  it("limits full completed-order history to financial roles", () => {
    expect(apiSource).toContain(
      'requireRoles("owner","manager","cashier"), asyncRoute(async (_req, res) => {',
    );
  });

  it("validates active customer role and idempotency ownership", () => {
    expect(apiSource).toContain("where id=$1 and role='customer' and active=true");
    expect(apiSource).toContain("prior.created_by !== actor.sub");
    expect(apiSource).toContain("prior.customer_id !== input.customerId");
  });

  it("rejects missing products, sizes, and modifiers at confirmation", () => {
    expect(apiSource).toContain("i.id is null or s.id is null");
    expect(apiSource).toContain("m.id is null or not m.active");
    expect(apiSource).toContain("link.modifier_id is null");
  });

  it("keeps End Day current-date-only and non-overwriting", () => {
    expect(apiSource).toContain(
      "End Day can close only the current Cairo business date.",
    );
    expect(apiSource).toContain(
      "End Day is already complete for this business date.",
    );
    expect(apiSource).not.toContain("on conflict(business_date) do update set");
  });

  it("guards Google Sheet imports with the staging target assertion", () => {
    const guard = importSource.indexOf("assertMigration005StagingTarget");
    const migration = importSource.indexOf("await applyNeonMigrations()");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(migration);
  });
});
