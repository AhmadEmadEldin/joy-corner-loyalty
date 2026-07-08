import { featurePermissions } from "./domain";
import {
  actionFeaturePermissions,
  isFeatureAllowed,
  permissionsForRole,
} from "./permissions";

describe("permissions", () => {
  it("gives owners every feature permission", () => {
    expect(permissionsForRole("owner").size).toBe(featurePermissions.length);
  });

  it("maps protected actions to feature permissions", () => {
    expect(actionFeaturePermissions.resetDay).toBe("day.reset");
    expect(actionFeaturePermissions.upsertStaff).toBe("staff.manage");
  });

  it("supports explicit grants and revocations", () => {
    expect(
      isFeatureAllowed({
        explicitPermissions: ["payments.refund"],
        feature: "payments.refund",
        role: "cashier",
      }),
    ).toBe(true);
    expect(
      isFeatureAllowed({
        feature: "customers.update",
        revokedPermissions: ["customers.update"],
        role: "cashier",
      }),
    ).toBe(false);
  });
});
