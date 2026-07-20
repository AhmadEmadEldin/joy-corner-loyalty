import { getCairoBusinessDate } from "../../src/cairoDate";

export type DatabaseRow = Record<string, unknown>;

export type ReportingSheet = {
  idHeader: string;
  sheetName: string;
  toRecord: (row: DatabaseRow) => Record<string, unknown>;
};

const json = (value: unknown) => (value == null ? "" : JSON.stringify(value));

const customerSheet: ReportingSheet = {
  idHeader: "Customer ID",
  sheetName: "Customers",
  toRecord: (row) => ({
    "Active?": row.active ? "Yes" : "No",
    Birthday: row.date_of_birth,
    "Customer ID": row.id,
    "Favorite Drink": row.favorite_drink,
    "Full Name": row.full_name,
    "Join Date": row.created_at,
    "Phone/WhatsApp": row.phone,
    createdAt: row.created_at,
    email: row.email,
    phone: row.phone,
    updatedAt: row.updated_at,
  }),
};

const orderSheet: ReportingSheet = {
  idHeader: "orderId",
  sheetName: "Orders",
  toRecord: (row) => ({
    "Customer ID": row.customer_id,
    "Customer Name": row.pickup_name,
    "Order Date/Time": row.created_at,
    "Order Status": row.status,
    "Payment Status": row.payment_status,
    Total: row.total,
    Notes: row.customer_notes,
    activeBoard: !["closed", "rejected", "cancelled"].includes(
      String(row.status),
    ),
    archived: row.status === "closed",
    archivedAt: row.closed_at,
    businessDate: row.created_at
      ? getCairoBusinessDate(new Date(String(row.created_at)))
      : "",
    clientRequestId: row.idempotency_key,
    createdAt: row.created_at,
    customerNameSnapshot: row.pickup_name,
    customerNotes: row.customer_notes,
    discountTotal: row.discount_total,
    orderDiscount: row.discount_total,
    orderId: row.id,
    orderPlace: row.pickup_name,
    paymentMethod: row.payment_method,
    receiptNumber: row.order_number,
    rewardDiscount: row.voucher_discount,
    serviceType: row.source,
    staffUid: row.confirmed_by,
    subtotal: row.subtotal,
    tax: row.tax_total,
    updatedAt: row.updated_at,
  }),
};

const itemSheet: ReportingSheet = {
  idHeader: "orderItemId",
  sheetName: "Order Items",
  toRecord: (row) => ({
    category: row.category_name_snapshot,
    createdAt: row.created_at,
    extrasTotal: row.modifiers_total,
    itemNotes: row.customer_notes,
    lineTotal: row.total_price,
    menuItemId: row.menu_item_id,
    menuItemName: row.item_name_snapshot,
    menuItemNameSnapshot: row.item_name_snapshot,
    notes: row.preparation_notes,
    orderId: row.order_id,
    orderItemId: row.id,
    preparationStatus: "Requested",
    quantity: row.quantity,
    size: row.size_name,
    unitPrice: row.unit_price,
  }),
};

const paymentSheet: ReportingSheet = {
  idHeader: "paymentId",
  sheetName: "Payments",
  toRecord: (row) => ({
    Amount: row.amount,
    "Customer ID": row.customer_id,
    Method: row.payment_method,
    "Payment Date": row.confirmed_at || row.created_at,
    amountApplied: row.amount,
    amountReceived: row.amount,
    createdAt: row.created_at,
    notes: row.reference,
    orderId: row.order_id,
    paymentId: row.id,
    paymentMethod: row.payment_method,
    paymentType: row.status,
    receivedByUid: row.confirmed_by,
  }),
};

const rewardSheet: ReportingSheet = {
  idHeader: "Customer ID",
  sheetName: "Rewards",
  toRecord: (row) => ({
    "Customer ID": row.customer_id || row.id,
    "Customer Name": row.full_name,
    "Favorite Drink": row.favorite_drink,
    "Free Drinks Ready": row.free_rewards_available,
    "Loyalty Card Winner?":
      Number(row.free_rewards_available || 0) > 0 ? "Yes" : "No",
    "Next Reward Progress": `${Number(row.eligible_purchase_count || 0) % 7}/7`,
    "Paid Drinks": row.eligible_purchase_count,
    Phone: row.phone,
    "Redeem Status":
      Number(row.free_rewards_available || 0) > 0 ? "Ready" : "Collecting",
  }),
};

const voucherSheet: ReportingSheet = {
  idHeader: "Voucher Code",
  sheetName: "Generated Vouchers",
  toRecord: (row) => ({
    "Canva Link": row.canva_design_url,
    "Customer ID": row.customer_id,
    "Generated At": row.issued_at,
    "Redeem Status": row.status,
    "Voucher Code": row.voucher_code,
    "Voucher Reward": row.voucher_type,
    createdAt: row.created_at,
    date: row.issued_at,
  }),
};

const redemptionSheet: ReportingSheet = {
  idHeader: "Redemption ID",
  sheetName: "Reward Redemptions",
  toRecord: (row) => ({
    "Customer ID": row.customer_id,
    Date: row.redeemed_at,
    Notes: `Voucher ${String(row.voucher_id || "")}`,
    "Redemption ID": row.id,
    Staff: row.redeemed_by,
    "Value EGP": row.discount_amount,
  }),
};

const auditSheet: ReportingSheet = {
  idHeader: "auditId",
  sheetName: "Audit Log",
  toRecord: (row) => ({
    action: row.action,
    auditId: row.id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    newValue: json(row.new_values),
    previousValue: json(row.old_values),
    sessionMetadata: json(row.metadata),
    success: true,
    timestamp: row.created_at,
    userId: row.actor_user_id,
  }),
};

export const REPORTING_SHEETS: Record<string, ReportingSheet> = {
  audit_logs: auditSheet,
  order_items: itemSheet,
  orders: orderSheet,
  payments: paymentSheet,
  profiles: customerSheet,
  reward_transactions: rewardSheet,
  voucher_redemptions: redemptionSheet,
  vouchers: voucherSheet,
};

export function reportingRecord(sourceTable: string, row: DatabaseRow) {
  const sheet = REPORTING_SHEETS[sourceTable];
  if (!sheet) throw new Error(`Unsupported reporting source: ${sourceTable}`);
  return Object.fromEntries(
    Object.entries(sheet.toRecord(row)).map(([key, value]) => [
      key,
      value == null ? "" : value,
    ]),
  );
}
