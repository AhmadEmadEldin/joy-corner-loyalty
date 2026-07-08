import { FeaturePermission, StaffRole, featurePermissions } from "./domain";

export const actionFeaturePermissions: Record<string, FeaturePermission> = {
  addCustomer: "customers.create",
  addOrder: "orders.create",
  addPayment: "payments.create",
  addReceipt: "orders.create",
  appData: "dashboard.view",
  collectUnpaidPayment: "unpaid.update",
  customerHistory: "customers.view",
  customerSearch: "customers.view",
  dayHistory: "archive.view",
  debugAuth: "settings.manage",
  debugSheets: "settings.manage",
  exportData: "reports.export",
  generateVoucher: "rewards.manage",
  getAppData: "dashboard.view",
  historyDays: "archive.view",
  markReceiptAccepted: "orders.update",
  markReceiptDone: "orders.update",
  markReceiptPreparing: "orders.update",
  markReceiptReady: "orders.update",
  organizeSpreadsheet: "settings.manage",
  ownerOverview: "staff.view",
  redeemVoucher: "redemptions.create",
  removeCustomer: "customers.delete",
  resetDay: "day.reset",
  retrySyncFailures: "settings.manage",
  setStaffActive: "staff.manage",
  setStaffPermissions: "staff.manage",
  setStaffRole: "staff.manage",
  syncMenuToSheets: "menu.update",
  updateCustomer: "customers.update",
  updateMenuItem: "menu.update",
  updateReceiptPayment: "payments.create",
  updateVoucherCanvaLink: "rewards.manage",
  upsertStaff: "staff.manage",
};

export const roleFeaturePermissions: Record<
  StaffRole,
  Set<FeaturePermission>
> = {
  owner: new Set(featurePermissions),
  manager: new Set([
    "archive.view",
    "customers.create",
    "customers.delete",
    "customers.update",
    "customers.view",
    "dashboard.view",
    "menu.view",
    "orders.create",
    "orders.update",
    "orders.cancel",
    "orders.view",
    "payments.create",
    "payments.view",
    "redemptions.create",
    "redemptions.view",
    "reports.view",
    "rewards.manage",
    "rewards.view",
    "unpaid.update",
    "unpaid.view",
  ]),
  cashier: new Set([
    "archive.view",
    "customers.create",
    "customers.update",
    "customers.view",
    "dashboard.view",
    "menu.view",
    "orders.create",
    "orders.update",
    "orders.view",
    "payments.create",
    "payments.view",
    "redemptions.create",
    "redemptions.view",
    "rewards.manage",
    "rewards.view",
    "unpaid.update",
    "unpaid.view",
  ]),
  waiter: new Set([
    "customers.create",
    "customers.view",
    "dashboard.view",
    "menu.view",
    "orders.create",
    "orders.update",
    "orders.view",
  ]),
  barista: new Set(["dashboard.view", "orders.update", "orders.view"]),
};

export function permissionsForRole(role: string) {
  if (role === "owner") return new Set(featurePermissions);
  return (
    roleFeaturePermissions[role as StaffRole] || new Set<FeaturePermission>()
  );
}

export function isFeatureAllowed(options: {
  explicitPermissions?: string[];
  feature?: string;
  revokedPermissions?: string[];
  role: string;
}) {
  if (options.role === "owner") return true;
  const feature = options.feature as FeaturePermission | undefined;
  if (!feature) return false;
  const explicit = new Set(options.explicitPermissions || []);
  const revoked = new Set(options.revokedPermissions || []);
  if (revoked.has(feature)) return false;
  if (explicit.has(feature)) return true;
  return permissionsForRole(options.role).has(feature);
}
