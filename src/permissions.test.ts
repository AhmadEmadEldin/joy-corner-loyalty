import { featurePermissions } from "./domain";
import {
  actionFeaturePermissions,
  isFeatureAllowed,
  permissionsForRole,
  resolveEffectivePermissions,
  visibleTabsForPermissions,
} from "./permissions";

describe("permissions", () => {
  it("gives owners every feature permission", () => {
    expect(permissionsForRole("owner").size).toBe(featurePermissions.length);
  });

  it("maps protected actions to feature permissions", () => {
    expect(actionFeaturePermissions.resetDay).toBe("day.reset");
    expect(actionFeaturePermissions.upsertStaff).toBe("staff.create");
    expect(actionFeaturePermissions.setStaffPermissions).toBe(
      "permissions.manage",
    );
    expect(actionFeaturePermissions.setStaffActive).toBe("staff.deactivate");
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

  it("resolves role defaults plus grant minus revoke", () => {
    const resolution = resolveEffectivePermissions({
      grant: ["receipts.print", "customers.delete"],
      revoke: ["customers.delete", "menu.view"],
      role: "waiter",
    });

    expect(resolution.effectivePermissions).toContain("receipts.print");
    expect(resolution.effectivePermissions).not.toContain("customers.delete");
    expect(resolution.effectivePermissions).not.toContain("menu.view");
    expect(resolution.overlaps).toEqual(["customers.delete"]);
  });

  it("warns about duplicate and unknown permission overrides", () => {
    const resolution = resolveEffectivePermissions({
      grant: "payments.refund, PAYMENTS.REFUND, made.up.permission",
      role: "cashier",
    });

    expect(resolution.grant).toEqual(["payments.refund"]);
    expect(resolution.duplicates).toEqual(["payments.refund"]);
    expect(resolution.unknown).toEqual(["made.up.permission"]);
  });

  it("keeps non-owner defaults limited by role", () => {
    expect(permissionsForRole("cashier").has("customers.history")).toBe(true);
    expect(permissionsForRole("cashier").has("customers.delete")).toBe(false);
    expect(permissionsForRole("waiter").has("orders.create")).toBe(true);
    expect(permissionsForRole("waiter").has("payments.create")).toBe(false);
    expect(permissionsForRole("barista").has("orders.ready")).toBe(false);
    expect(permissionsForRole("barista").has("orders.accept")).toBe(true);
    expect(permissionsForRole("barista").has("orders.pickedup")).toBe(true);
    expect(permissionsForRole("cashier").has("orders.accept")).toBe(true);
    expect(permissionsForRole("cashier").has("orders.pickedup")).toBe(true);
    expect(permissionsForRole("manager").has("orders.accept")).toBe(true);
    expect(permissionsForRole("manager").has("orders.pickedup")).toBe(true);
    expect(permissionsForRole("barista").has("settings.manage")).toBe(false);
    expect(permissionsForRole("manager").has("vouchers.generate")).toBe(true);
    expect(permissionsForRole("manager").has("permissions.manage")).toBe(false);
  });

  it("derives visible tabs from effective permissions", () => {
    const visibleTabIds = (
      role: Parameters<typeof visibleTabsForPermissions>[0],
      permissions: string[],
    ) => visibleTabsForPermissions(role, permissions).map(([id]) => id);

    expect(visibleTabIds("cashier", ["dashboard.view"])).toContain("dashboard");
    expect(visibleTabIds("barista", ["orders.view"])).toEqual(["dashboard"]);
    expect(visibleTabIds("waiter", ["orders.view"])).not.toContain("dashboard");
    expect(visibleTabIds("owner", ["staff.view"])).toContain("owner");
  });
});
