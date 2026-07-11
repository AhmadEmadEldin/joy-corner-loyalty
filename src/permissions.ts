import { FeaturePermission, StaffRole, featurePermissions } from "./domain";

export const permissionCatalog = [...featurePermissions];

export const actionFeaturePermissions: Record<string, FeaturePermission> = {
  addCustomer: "customers.create",
  addOrder: "orders.create",
  addPayment: "payments.create",
  addReceipt: "orders.create",
  appData: "dashboard.view",
  archiveMenuCategory: "menu.delete",
  archiveMenuItem: "menu.delete",
  archiveMenuSize: "menu.delete",
  backupSheetsWorkbook: "settings.manage",
  cancelReceipt: "orders.update",
  collectUnpaidPayment: "unpaid.collect",
  collectReceiptPayment: "payments.create",
  customerHistory: "customers.history",
  customerSearch: "customers.search",
  dayHistory: "history.day.view",
  debugAuth: "settings.manage",
  debugSheets: "settings.manage",
  exportData: "reports.export",
  generateVoucher: "vouchers.generate",
  getAppData: "dashboard.view",
  historyDays: "history.view",
  inspectSheetsWorkbook: "settings.manage",
  liveData: "dashboard.view",
  markReceiptAccepted: "orders.accept",
  markReceiptDone: "orders.pickedup",
  markReceiptPreparing: "orders.update",
  markReceiptReady: "orders.ready",
  migrateSheetsWorkbook: "settings.manage",
  organizeSpreadsheet: "settings.manage",
  ownerOverview: "staff.view",
  reconcileSheetsWorkbook: "settings.manage",
  redeemVoucher: "vouchers.redeem",
  removeCustomer: "customers.delete",
  resetDay: "day.reset",
  retrySyncFailures: "settings.manage",
  setStaffActive: "staff.deactivate",
  setStaffPermissions: "permissions.manage",
  setStaffRole: "staff.update",
  syncMenuToSheets: "menu.update",
  updateCustomer: "customers.update",
  updateMenuItem: "menu.update",
  updateReceiptPayment: "payments.create",
  updateVoucherCanvaLink: "vouchers.generate",
  upsertMenuCategory: "menu.update",
  upsertMenuItem: "menu.update",
  upsertMenuSize: "menu.update",
  upsertStaff: "staff.create",
};

export const roleFeaturePermissions: Record<StaffRole, Set<FeaturePermission>> = {
  owner: new Set(featurePermissions),
  manager: new Set([
    "dashboard.view",
    "menu.view",
    "customers.view",
    "customers.create",
    "customers.update",
    "customers.search",
    "customers.history",
    "orders.view",
    "orders.create",
    "orders.update",
    "payments.view",
    "payments.create",
    "unpaid.view",
    "unpaid.collect",
    "rewards.view",
    "vouchers.view",
    "vouchers.generate",
    "vouchers.redeem",
    "history.view",
    "history.day.view",
    "receipts.view",
    "receipts.print",
    "receipts.reprint",
  ]),
  cashier: new Set([
    "dashboard.view",
    "menu.view",
    "customers.view",
    "customers.create",
    "customers.update",
    "customers.search",
    "customers.history",
    "orders.view",
    "orders.create",
    "orders.update",
    "payments.view",
    "payments.create",
    "unpaid.view",
    "unpaid.collect",
    "rewards.view",
    "vouchers.view",
    "vouchers.generate",
    "vouchers.redeem",
    "history.view",
    "history.day.view",
    "receipts.view",
    "receipts.print",
    "receipts.reprint",
  ]),
  waiter: new Set([
    "menu.view",
    "customers.view",
    "customers.search",
    "customers.history",
    "orders.view",
    "orders.create",
    "receipts.view",
  ]),
  barista: new Set([
    "orders.view",
    "orders.accept",
    "orders.ready",
    "orders.pickedup",
    "receipts.view",
  ]),
};

export type PermissionResolution = {
  duplicates: string[];
  effectivePermissions: FeaturePermission[];
  grant: FeaturePermission[];
  overlaps: string[];
  revoke: FeaturePermission[];
  roleDefaults: FeaturePermission[];
  unknown: string[];
};

export function normalizePermissionList(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[,\n|]+/);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const normalized: string[] = [];

  raw.forEach((item) => {
    const permission = String(item ?? "").trim().toLowerCase();
    if (!permission) return;
    if (seen.has(permission)) {
      duplicates.add(permission);
      return;
    }
    seen.add(permission);
    normalized.push(permission);
  });

  return {
    duplicates: Array.from(duplicates).sort(),
    normalized,
    unknown: normalized
      .filter((permission) => !permissionCatalog.includes(permission as never))
      .sort(),
  };
}

export function permissionsForRole(role: string) {
  const normalizedRole = role.toLowerCase() as StaffRole;
  if (normalizedRole === "owner") return new Set(featurePermissions);
  return roleFeaturePermissions[normalizedRole] || new Set<FeaturePermission>();
}

export function resolveEffectivePermissions(options: {
  grant?: unknown;
  permissions?: unknown;
  revoke?: unknown;
  revokedPermissions?: unknown;
  role: string;
}): PermissionResolution {
  const roleDefaults = Array.from(permissionsForRole(options.role));
  const grantInput = normalizePermissionList(options.grant ?? options.permissions ?? []);
  const revokeInput = normalizePermissionList(
    options.revoke ?? options.revokedPermissions ?? [],
  );
  const grant = grantInput.normalized.filter((permission) =>
    permissionCatalog.includes(permission as never),
  ) as FeaturePermission[];
  const revoke = revokeInput.normalized.filter((permission) =>
    permissionCatalog.includes(permission as never),
  ) as FeaturePermission[];
  const revokeSet = new Set(revoke);
  const overlaps = grant.filter((permission) => revokeSet.has(permission)).sort();
  const effectivePermissions = Array.from(
    new Set([...roleDefaults, ...grant]),
  )
    .filter((permission) => !revokeSet.has(permission))
    .sort() as FeaturePermission[];

  return {
    duplicates: Array.from(
      new Set([...grantInput.duplicates, ...revokeInput.duplicates]),
    ).sort(),
    effectivePermissions,
    grant,
    overlaps,
    revoke,
    roleDefaults: roleDefaults.sort() as FeaturePermission[],
    unknown: Array.from(
      new Set([...grantInput.unknown, ...revokeInput.unknown]),
    ).sort(),
  };
}

export function hasPermission(options: {
  effectivePermissions?: string[];
  feature?: string;
  grant?: unknown;
  permissions?: unknown;
  revoke?: unknown;
  revokedPermissions?: unknown;
  role: string;
}) {
  const feature = String(options.feature || "").trim().toLowerCase();
  if (!feature) return false;
  if (options.role.toLowerCase() === "owner") return true;
  const effective =
    options.effectivePermissions ||
    resolveEffectivePermissions({
      grant: options.grant,
      permissions: options.permissions,
      revoke: options.revoke,
      revokedPermissions: options.revokedPermissions,
      role: options.role,
    }).effectivePermissions;

  return effective.includes(feature);
}

export function isFeatureAllowed(options: {
  effectivePermissions?: string[];
  explicitPermissions?: string[];
  feature?: string;
  grant?: unknown;
  permissions?: unknown;
  revokedPermissions?: string[];
  revoke?: unknown;
  role: string;
}) {
  return hasPermission({
    effectivePermissions: options.effectivePermissions,
    feature: options.feature,
    grant: options.grant ?? options.explicitPermissions,
    permissions: options.permissions,
    revoke: options.revoke ?? options.revokedPermissions,
    role: options.role,
  });
}
