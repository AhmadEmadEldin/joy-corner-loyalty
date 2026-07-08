import { z } from "zod";

export const staffRoles = [
  "owner",
  "manager",
  "cashier",
  "waiter",
  "barista",
] as const;

export const featurePermissions = [
  "dashboard.view",
  "menu.view",
  "menu.create",
  "menu.update",
  "menu.delete",
  "customers.view",
  "customers.create",
  "customers.update",
  "customers.delete",
  "orders.view",
  "orders.create",
  "orders.update",
  "orders.cancel",
  "payments.view",
  "payments.create",
  "payments.refund",
  "unpaid.view",
  "unpaid.update",
  "rewards.view",
  "rewards.manage",
  "redemptions.view",
  "redemptions.create",
  "staff.view",
  "staff.manage",
  "reports.view",
  "reports.export",
  "day.close",
  "day.reset",
  "archive.view",
  "settings.manage",
] as const;

export const orderStatuses = [
  "Draft",
  "Submitted",
  "Accepted",
  "Preparing",
  "Ready",
  "Served",
  "Awaiting Payment",
  "Partially Paid",
  "Paid",
  "Unpaid",
  "Cancelled",
  "Refunded",
  "Archived",
] as const;

export const paymentStatuses = [
  "Paid",
  "Partial",
  "Unpaid",
  "Refunded",
] as const;

const isoDateStringSchema = z.string().min(1);
const idSchema = z.string().min(1).max(160);
const moneySchema = z.number().finite().nonnegative();

export const featurePermissionSchema = z.enum(featurePermissions);
export const staffRoleSchema = z.enum(staffRoles);
export const orderStatusSchema = z.enum(orderStatuses);
export const paymentStatusSchema = z.enum(paymentStatuses);

export const userSchema = z.object({
  active: z.boolean().default(true),
  createdAt: isoDateStringSchema,
  displayName: z.string().min(1),
  email: z.string().email(),
  role: staffRoleSchema,
  updatedAt: isoDateStringSchema,
  userId: idSchema,
});

export const customerSchema = z.object({
  createdAt: isoDateStringSchema,
  customerId: idSchema,
  email: z.string().email().or(z.literal("")).default(""),
  lifetimeOrders: z.number().int().nonnegative().default(0),
  lifetimeSpend: moneySchema.default(0),
  loyaltyPoints: z.number().int().default(0),
  name: z.string().min(1),
  phone: z.string().default(""),
  status: z.string().min(1).default("active"),
  unpaidBalance: moneySchema.default(0),
  updatedAt: isoDateStringSchema,
});

export const menuSizeSchema = z.object({
  active: z.boolean().default(true),
  menuItemId: idSchema,
  price: moneySchema,
  sizeId: idSchema,
  sizeName: z.string().min(1),
});

export const menuFlavorSchema = z.object({
  active: z.boolean().default(true),
  flavorId: idSchema,
  menuItemId: idSchema,
  name: z.string().min(1),
});

export const extraSchema = z.object({
  active: z.boolean().default(true),
  extraId: idSchema,
  name: z.string().min(1),
  price: moneySchema.default(0),
});

export const menuItemSchema = z.object({
  active: z.boolean().default(true),
  availableExtras: z.array(extraSchema).default([]),
  availability: z.string().default("available"),
  category: z.string().min(1),
  categoryId: idSchema,
  currency: z.string().min(1).default("EGP"),
  displayOrder: z.number().int().nonnegative(),
  flavors: z.array(menuFlavorSchema).default([]),
  ingredients: z.array(z.string()).default([]),
  itemId: idSchema,
  itemName: z.string().min(1),
  preparationStation: z.enum(["barista", "kitchen"]).default("barista"),
  sizes: z.array(menuSizeSchema).min(1),
  soldOut: z.boolean().default(false),
  standardSize: z.string().min(1),
});

export const orderItemExtraSchema = z.object({
  extraId: idSchema,
  name: z.string().min(1),
  orderItemExtraId: idSchema,
  orderItemId: idSchema,
  quantity: z.number().int().positive(),
  total: moneySchema,
  unitPrice: moneySchema,
});

export const orderItemSchema = z.object({
  category: z.string().min(1),
  extras: z.array(orderItemExtraSchema).default([]),
  extrasTotal: moneySchema.default(0),
  lineTotal: moneySchema,
  menuItemId: idSchema,
  menuItemName: z.string().min(1),
  notes: z.string().default(""),
  orderId: idSchema,
  orderItemId: idSchema,
  preparationStatus: orderStatusSchema.default("Submitted"),
  quantity: z.number().int().positive(),
  size: z.string().min(1),
  unitPrice: moneySchema,
});

export const orderSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cashierId: z.string().default(""),
  closedAt: z.string().default(""),
  createdAt: isoDateStringSchema,
  customerId: z.string().default(""),
  discount: moneySchema.default(0),
  idempotencyKey: z.string().default(""),
  orderId: idSchema,
  paidAmount: moneySchema.default(0),
  paymentStatus: paymentStatusSchema,
  receiptNumber: idSchema,
  status: orderStatusSchema,
  subtotal: moneySchema.default(0),
  tax: moneySchema.default(0),
  total: moneySchema.default(0),
  unpaidAmount: moneySchema.default(0),
  updatedAt: isoDateStringSchema,
  waiterId: z.string().default(""),
});

export const paymentSchema = z.object({
  amount: moneySchema,
  createdAt: isoDateStringSchema,
  customerId: z.string().default(""),
  orderId: z.string().default(""),
  paymentId: idSchema,
  paymentMethod: z.string().min(1),
  receivedBy: z.string().default(""),
  status: z.string().min(1).default("created"),
});

export const unpaidAccountSchema = z.object({
  createdAt: isoDateStringSchema,
  customerId: idSchema,
  dueDate: z.string().default(""),
  orderId: z.string().default(""),
  originalAmount: moneySchema,
  paidAmount: moneySchema.default(0),
  remainingAmount: moneySchema,
  status: z.string().min(1).default("open"),
  unpaidId: idSchema,
  updatedAt: isoDateStringSchema,
});

export const rewardTransactionSchema = z.object({
  balanceAfter: z.number().int(),
  createdAt: isoDateStringSchema,
  customerId: idSchema,
  orderId: z.string().default(""),
  pointsAdded: z.number().int().default(0),
  pointsRemoved: z.number().int().default(0),
  reason: z.string().min(1),
  rewardTransactionId: idSchema,
});

export const loyaltyWinnerSchema = z.object({
  createdAt: isoDateStringSchema,
  customerId: idSchema,
  customerName: z.string().min(1),
  qualificationReason: z.string().min(1),
  rewardName: z.string().min(1),
  status: z.string().min(1).default("ready"),
  winnerId: idSchema,
});

export const rewardRedemptionSchema = z.object({
  customerId: idSchema,
  pointsUsed: z.number().int().nonnegative().default(0),
  redeemedAt: isoDateStringSchema,
  redeemedBy: z.string().default(""),
  redemptionId: idSchema,
  rewardId: z.string().default(""),
  rewardName: z.string().min(1),
  status: z.string().min(1).default("redeemed"),
});

export const businessDaySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closedAt: z.string().default(""),
  closedBy: z.string().default(""),
  openedAt: isoDateStringSchema,
  status: z.enum(["open", "closing", "closed", "archived"]),
});

export const dailyArchiveSchema = z.object({
  archiveId: idSchema,
  archivedAt: isoDateStringSchema,
  archivedBy: z.string().default(""),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.record(z.string(), z.unknown()),
});

export const auditLogSchema = z.object({
  action: z.string().min(1),
  auditId: idSchema,
  entityId: z.string().default(""),
  entityType: z.string().min(1),
  newValue: z.unknown().optional(),
  previousValue: z.unknown().optional(),
  reason: z.string().default(""),
  requestId: z.string().default(""),
  role: z.string().default(""),
  sessionMetadata: z.record(z.string(), z.unknown()).default({}),
  success: z.boolean(),
  timestamp: isoDateStringSchema,
  userId: z.string().default(""),
});

export const syncJobSchema = z.object({
  completedAt: z.string().default(""),
  source: z.string().min(1),
  startedAt: isoDateStringSchema,
  status: z.string().min(1),
  syncJobId: idSchema,
  target: z.string().min(1),
});

export const syncFailureSchema = z.object({
  createdAt: isoDateStringSchema,
  entityId: z.string().default(""),
  entityType: z.string().min(1),
  errorMessage: z.string().min(1),
  resolvedAt: z.string().default(""),
  retryCount: z.number().int().nonnegative().default(0),
  syncFailureId: idSchema,
  syncJobId: z.string().default(""),
});

export const receiptItemPayloadSchema = z.object({
  discount: z.coerce.number().nonnegative().default(0),
  extras: z.array(orderItemExtraSchema.partial()).default([]),
  flavorId: z.string().default(""),
  flavorName: z.string().default(""),
  itemId: idSchema,
  itemName: z.string().min(1),
  notes: z.string().default(""),
  qty: z.coerce.number().int().positive().default(1),
  size: z.string().min(1),
});

export const addReceiptPayloadSchema = z.object({
  customerId: z.string().default(""),
  customerName: z.string().default(""),
  customerPhone: z.string().default(""),
  idempotencyKey: z.string().min(8),
  items: z.array(receiptItemPayloadSchema).min(1),
  notes: z.string().default(""),
  orderPlace: z.string().default(""),
  paidAmount: z.coerce.number().nonnegative().default(0),
  paymentMethod: z.string().default("Cash"),
  paymentStatus: z.string().default("Paid"),
  staff: z.string().default(""),
});

export type FeaturePermission = (typeof featurePermissions)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type StaffRole = (typeof staffRoles)[number];
