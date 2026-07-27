/** @jest-environment node */

import {
  assertMigration005StagingTarget,
  migrationTargetDetails,
} from "./neon";

const directStagingUrl =
  "postgresql://staging-role:secret@ep-safe-stage.us-east-1.aws.neon.tech/neondb?sslmode=require";

describe("migration 005 staging target guard", () => {
  it("returns only safe host and database target details", () => {
    expect(migrationTargetDetails(directStagingUrl)).toEqual({
      database: "neondb",
      host: "ep-safe-stage.us-east-1.aws.neon.tech",
    });
  });

  it("requires explicit staging confirmation", () => {
    expect(() =>
      assertMigration005StagingTarget(directStagingUrl, {
        DATABASE_SSL: "true",
        NODE_ENV: "development",
      }),
    ).toThrow("MIGRATION_CONFIRM_STAGING=true");
  });

  it("rejects production mode without a bypass", () => {
    expect(() =>
      assertMigration005StagingTarget(directStagingUrl, {
        DATABASE_SSL: "true",
        MIGRATION_CONFIRM_STAGING: "true",
        NODE_ENV: "production",
      }),
    ).toThrow("blocked when NODE_ENV=production");
  });

  it("rejects pooled, non-Neon, insecure, and production-looking targets", () => {
    const confirmed = {
      DATABASE_SSL: "true",
      MIGRATION_CONFIRM_STAGING: "true",
      NODE_ENV: "development",
    };
    expect(() =>
      assertMigration005StagingTarget(
        directStagingUrl.replace(".us-east", "-pooler.us-east"),
        confirmed,
      ),
    ).toThrow("direct, unpooled");
    expect(() =>
      assertMigration005StagingTarget(
        "postgresql://role:secret@localhost/neondb",
        confirmed,
      ),
    ).toThrow("Neon staging");
    expect(() =>
      assertMigration005StagingTarget(directStagingUrl, {
        ...confirmed,
        DATABASE_SSL: "false",
      }),
    ).toThrow("DATABASE_SSL=true");
    expect(() =>
      assertMigration005StagingTarget(
        directStagingUrl.replace("/neondb", "/production"),
        confirmed,
      ),
    ).toThrow("appears to be production");
  });

  it("accepts a confirmed direct Neon staging target", () => {
    expect(
      assertMigration005StagingTarget(directStagingUrl, {
        DATABASE_SSL: "true",
        MIGRATION_CONFIRM_STAGING: "true",
        NODE_ENV: "development",
      }),
    ).toMatchObject({ database: "neondb" });
  });
});
