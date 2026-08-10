import {
  apiRequest,
  clearSession,
  setSession,
  subscribeToEvents,
  type SessionUser,
} from "./client";
import type { OperationalOrderStatus } from "./workflow";
import {
  resolveMenuImage,
  type MenuImageSource,
} from "./generatedMenuImages";

export type CustomerProfile = {
  customer_number: string | null;
  date_of_birth: string | null;
  email: string | null;
  favorite_drink: string | null;
  full_name: string;
  id: string;
  marketing_consent: boolean;
  phone: string | null;
};
export type MenuSize = { id: string; price: number; size_name: string };
export type MenuModifier = { id: string; name: string; price: number };
export type MenuItem = {
  availability_state:
    | "available"
    | "temporarily_unavailable"
    | "sold_out"
    | "archived";
  available: boolean;
  category: string;
  description: string;
  id: string;
  image_url: string | null;
  image_source?: MenuImageSource;
  owner_image_url?: string | null;
  loyalty_eligible: boolean;
  modifiers: MenuModifier[];
  name: string;
  sizes: MenuSize[];
};
export type OwnerMenuItem = MenuItem & {
  active: boolean;
  category_id: string;
  preparation_station: "barista" | "kitchen";
  sort_order: number;
};

function withGeneratedMenuImage<T extends MenuItem>(item: T): T {
  const ownerImageUrl = item.image_url;
  const resolved = resolveMenuImage({
    category: item.category,
    name: item.name,
    ownerImageUrl,
  });
  return {
    ...item,
    image_source: resolved.source,
    image_url: resolved.src,
    owner_image_url: ownerImageUrl,
  };
}
export type CustomerOrder = {
  cancellation_reason: string | null;
  confirmation_status: string;
  created_at: string;
  customer_notes: string;
  discount_total: number;
  id: string;
  order_number: string;
  paid_amount: number;
  payment_method: string | null;
  payment_status: string;
  pickup_name: string;
  rejection_reason: string | null;
  remaining_amount: number;
  subtotal: number;
  status: OperationalOrderStatus;
  tax_total: number;
  total: number;
  voucher_discount: number;
};
export type CustomerOrderItem = {
  category_name_snapshot: string;
  customer_notes: string;
  id: string;
  item_name_snapshot: string;
  modifiers_total: number;
  order_id: string;
  quantity: number;
  size_name: string;
  total_price: number;
  unit_price: number;
};
export type CustomerOrderModifier = {
  modifier_name_snapshot: string;
  order_item_id: string;
  quantity: number;
  total_price: number;
  unit_price: number;
};
export type CustomerNotification = {
  created_at: string;
  id: string;
  message: string;
  read: boolean;
  related_order_id: string | null;
  title: string;
  type: string;
};
export type CustomerVoucher = {
  expires_at: string | null;
  fixed_value: number | null;
  free_item_id: string | null;
  id: string;
  percentage_value: number | null;
  status: string;
  voucher_code: string;
  voucher_type: string;
};
export type CartLine = {
  item: MenuItem;
  lineId: string;
  modifiers: MenuModifier[];
  notes: string;
  quantity: number;
  size: MenuSize;
};
export type StaffProfile = {
  email: string;
  full_name: string;
  id: string;
  role: "owner" | "manager" | "cashier" | "waiter" | "barista";
};
export type AuthProfile = Omit<StaffProfile, "role"> & {
  role: StaffProfile["role"] | "customer";
};
export type QueueOrder = {
  confirmation_status?: string;
  created_at?: string;
  customer_notes?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  item_summary: Array<{
    id?: string;
    itemName?: string;
    name?: string;
    quantity?: number;
    size?: string;
    totalPrice?: number;
    unitPrice?: number;
  }>;
  order_id: string;
  order_time?: string;
  order_number: string;
  paid_amount?: number;
  payment_method?: string | null;
  payment_status?: string;
  pickup_name: string;
  remaining_amount?: number;
  status: OperationalOrderStatus;
  subtotal?: number;
  discount_total?: number;
  voucher_discount?: number;
  tax_total?: number;
  total?: number;
};

export function staffQueueTables(
  role: StaffProfile["role"],
): Array<
  | "cashier_order_queue"
  | "kitchen_order_queue"
  | "orders"
  | "notifications"
  | "menu"
> {
  return [
    ...(["owner", "manager", "cashier"].includes(role)
      ? (["cashier_order_queue"] as const)
      : []),
    ...(["owner", "manager", "barista"].includes(role)
      ? (["kitchen_order_queue"] as const)
      : []),
    ...(["owner", "manager"].includes(role)
      ? (["orders", "notifications"] as const)
      : []),
    "menu",
  ];
}

type AuthResult = { user: SessionUser };
type OrderInput = {
  modifierIds: string[];
  notes: string;
  quantity: number;
  sizeId: string;
};

function cartPayload(cart: CartLine[]): OrderInput[] {
  return cart.map((line) => ({
    modifierIds: line.modifiers.map((modifier) => modifier.id),
    notes: line.notes,
    quantity: line.quantity,
    sizeId: line.size.id,
  }));
}

export async function signUpCustomer(input: {
  email: string;
  fullName: string;
  password: string;
  phone: string;
  marketingConsent?: boolean;
}): Promise<void> {
  const result = await apiRequest<AuthResult>("/auth/signup", {
    body: JSON.stringify(input),
    method: "POST",
  });
  setSession(result.user);
}

export async function signInCustomer(
  email: string,
  password: string,
): Promise<void> {
  const result = await apiRequest<AuthResult>("/auth/login", {
    body: JSON.stringify({ email: email.trim(), password }),
    method: "POST",
  });
  setSession(result.user);
}

export async function signOut(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
  clearSession();
}

export const signOutCustomer = signOut;

export async function signInStaff(
  email: string,
  password: string,
): Promise<void> {
  await signInCustomer(email, password);
  const profile = await loadStaffProfile();
  if (profile.role === "customer") {
    await signOut();
    throw new Error("This account does not have staff access.");
  }
}

export async function sendStaffMagicLink(): Promise<void> {
  throw new Error(
    "Email sign-in links are not enabled. Sign in with your password.",
  );
}

export async function loadStaffProfile(): Promise<AuthProfile> {
  return (await apiRequest<{ user: AuthProfile }>("/auth/me")).user;
}

export async function loadStaffQueues(role: StaffProfile["role"]): Promise<{
  cashier: QueueOrder[];
  kitchen: QueueOrder[];
}> {
  return apiRequest(`/staff/queues?role=${encodeURIComponent(role)}`);
}

export async function changeOrderStatus(
  orderId: string,
  status: OperationalOrderStatus,
  reason = "",
): Promise<void> {
  await apiRequest(`/orders/${encodeURIComponent(orderId)}/status`, {
    body: JSON.stringify({ reason, status }),
    method: "POST",
  });
}

export async function confirmOrderPayment(input: {
  amount: number;
  orderId: string;
  paymentMethod:
    | "cash_at_cashier"
    | "card_at_branch"
    | "instapay"
    | "manual_transfer";
  reference: string;
}): Promise<void> {
  await apiRequest(`/orders/${encodeURIComponent(input.orderId)}/payment`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function updateCashierOrderItem(input: {
  orderId: string;
  orderItemId: string;
  quantity: number;
  replacementSizeId?: string;
}): Promise<void> {
  await apiRequest(
    `/orders/${encodeURIComponent(input.orderId)}/items/${encodeURIComponent(input.orderItemId)}`,
    {
      body: JSON.stringify({
        quantity: input.quantity,
        replacementSizeId: input.replacementSizeId,
      }),
      method: "PATCH",
    },
  );
}

export async function loadCustomerDirectory(): Promise<
  Array<Record<string, unknown>>
> {
  return (
    await apiRequest<{ customers: Array<Record<string, unknown>> }>(
      "/staff/customers",
    )
  ).customers;
}

export async function searchCustomerByPhone(
  phone: string,
): Promise<Record<string, unknown> | null> {
  const result = await apiRequest<{ customer: Record<string, unknown> | null }>(
    `/staff/customers/search?phone=${encodeURIComponent(phone)}`,
  );
  return result.customer;
}

export async function createStaffCustomer(input: {
  email?: string;
  fullName: string;
  phone: string;
}): Promise<Record<string, unknown>> {
  const result = await apiRequest<{ customer: Record<string, unknown> }>(
    "/staff/customers",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
  return result.customer;
}

export type EndDayReport = {
  business_date: string;
  cancelled_order_count: number;
  closed_order_count: number;
  gross_sales: number;
  loyalty_points_issued: number;
  order_count: number;
  payments_received: number;
  performed_at: string;
};

export async function runEndDay(): Promise<EndDayReport> {
  return (
    await apiRequest<{ report: EndDayReport }>("/admin/end-day", {
      body: JSON.stringify({}),
      method: "POST",
    })
  ).report;
}

export function subscribeToStaffQueues(
  role: StaffProfile["role"],
  onChange: (event?: { entityId?: string; topic?: string }) => void,
): () => void {
  return subscribeToEvents(staffQueueTables(role), onChange);
}

export async function loadCustomerProfile(): Promise<CustomerProfile> {
  return (await apiRequest<{ profile: CustomerProfile }>("/customer/profile"))
    .profile;
}

export async function updateCustomerProfile(input: {
  dateOfBirth: string | null;
  favoriteDrink: string | null;
  fullName: string;
  marketingConsent?: boolean;
  phone: string;
}): Promise<void> {
  await apiRequest("/customer/profile", {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export async function loadMenu(): Promise<MenuItem[]> {
  return (await apiRequest<{ items: MenuItem[] }>("/menu")).items.map(
    withGeneratedMenuImage,
  );
}

export async function loadOwnerMenu(): Promise<OwnerMenuItem[]> {
  return (
    await apiRequest<{ items: OwnerMenuItem[] }>("/owner/menu")
  ).items.map(withGeneratedMenuImage);
}

export async function updateOwnerMenuItem(input: {
  availabilityState?:
    | "available"
    | "temporarily_unavailable"
    | "sold_out"
    | "archived";
  description: string;
  id: string;
  loyaltyEligible: boolean;
  name: string;
  preparationStation: "barista" | "kitchen";
  sortOrder?: number;
}): Promise<void> {
  await apiRequest(`/owner/menu/items/${encodeURIComponent(input.id)}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export async function createOwnerMenuItem(input: {
  categoryId: string;
  description?: string;
  loyaltyEligible?: boolean;
  name: string;
  preparationStation?: "barista" | "kitchen";
  sortOrder?: number;
}): Promise<{ id: string }> {
  return apiRequest<{ id: string }>("/owner/menu/items", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function updateOwnerMenuSize(
  sizeId: string,
  price: number,
): Promise<void> {
  if (!Number.isFinite(price) || price <= 0)
    throw new Error("Size price must be greater than zero.");
  await apiRequest(`/owner/menu/sizes/${encodeURIComponent(sizeId)}`, {
    body: JSON.stringify({ price }),
    method: "PATCH",
  });
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export async function uploadOwnerMenuImage(
  itemId: string,
  file: File,
  _previousUrl: string | null,
): Promise<string> {
  if (
    !["image/avif", "image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    throw new Error("Choose a JPG, PNG, WebP, or AVIF image.");
  }
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Menu images must be 5 MB or smaller.");
  const result = await apiRequest<{ imageUrl: string }>(
    `/owner/menu/items/${encodeURIComponent(itemId)}/image`,
    {
      body: JSON.stringify({ dataUrl: await fileAsDataUrl(file) }),
      method: "PUT",
    },
  );
  return result.imageUrl;
}

export async function removeOwnerMenuImage(
  itemId: string,
  _imageUrl: string | null,
): Promise<void> {
  await apiRequest(`/owner/menu/items/${encodeURIComponent(itemId)}/image`, {
    method: "DELETE",
  });
}

export type OwnerVoucher = {
  description: string | null;
  expiresAt: string | null;
  fixedValue: number | null;
  id: string;
  issuedAt: string;
  percentageValue: number | null;
  status: string;
  voucherCode: string;
  voucherType: string;
};

export async function loadCustomerVouchers(
  customerId: string,
): Promise<OwnerVoucher[]> {
  return (
    await apiRequest<{ vouchers: OwnerVoucher[] }>(
      `/owner/customers/${encodeURIComponent(customerId)}/vouchers`,
    )
  ).vouchers;
}

export async function createCustomerVoucher(input: {
  customerId: string;
  description?: string;
  expiresInDays?: number;
  fixedValue?: number;
  freeItemId?: string;
  percentageValue?: number;
  voucherType: "fixed" | "percentage" | "free_item";
}): Promise<{
  customer: { fullName: string; phone: string | null };
  voucher: OwnerVoucher;
}> {
  const { customerId, ...body } = input;
  return apiRequest(
    `/owner/customers/${encodeURIComponent(customerId)}/vouchers`,
    {
      body: JSON.stringify(body),
      method: "POST",
    },
  );
}

export type VoucherCampaignRecipient = OwnerVoucher & {
  customerId: string;
  customerName: string;
  phone: string | null;
};

export async function createVoucherCampaign(input: {
  audience: "all" | "subscribed";
  description?: string;
  expiresInDays?: number;
  value: number;
  voucherType: "fixed" | "percentage";
}): Promise<{ audience: string; issued: VoucherCampaignRecipient[] }> {
  return apiRequest("/owner/voucher-campaigns", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function buildWhatsAppVoucherLink(
  phone: string | null,
  code: string,
  description: string | null,
  customerName: string,
): string {
  const label = description || `${code} voucher`;
  const text = `Hi ${customerName}! 🎉\n\nYou've received a voucher from Joy Corner:\n*${label}*\nVoucher code: *${code}*\n\nShow this code at checkout to redeem. Valid at any Joy Corner branch.\n\n— Joy Corner Team`;
  const digits = (phone || "").replace(/\D/g, "");
  const num = digits.startsWith("20")
    ? digits
    : digits.length >= 8
      ? `20${digits}`
      : "";
  return num
    ? `https://wa.me/${num}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function revokeVoucher(voucherId: string): Promise<void> {
  await apiRequest(`/owner/vouchers/${encodeURIComponent(voucherId)}/revoke`, {
    method: "POST",
  });
}

export async function removeRedeemedVoucher(voucherId: string): Promise<void> {
  await apiRequest(`/owner/vouchers/${encodeURIComponent(voucherId)}`, {
    method: "DELETE",
  });
}

export type VoucherRequest = {
  createdAt: string;
  createdVoucherId: string | null;
  customerEmail: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  freeRewards: number;
  id: string;
  loyaltyPoints: number;
  orderCount: number;
  rejectionReason: string | null;
  requestedByUserId: string;
  requestedRewardType: string | null;
  requestReason: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  status: "APPROVED" | "CANCELLED" | "FULFILLED" | "PENDING" | "REJECTED";
  updatedAt: string;
};

export async function loadVoucherRequests(
  status?: string,
): Promise<VoucherRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return (
    await apiRequest<{ requests: VoucherRequest[] }>(
      `/owner/voucher-requests${qs}`,
    )
  ).requests;
}

export async function reviewVoucherRequest(input: {
  action: "APPROVE" | "REJECT";
  customerId?: string;
  description?: string;
  expiresInDays?: number;
  fixedValue?: number;
  freeItemId?: string;
  percentageValue?: number;
  rejectionReason?: string;
  requestId: string;
  voucherType?: string;
}): Promise<{ voucher?: OwnerVoucher; status: string }> {
  const { requestId, ...body } = input;
  return apiRequest(
    `/owner/voucher-requests/${encodeURIComponent(requestId)}`,
    {
      body: JSON.stringify(body),
      method: "PATCH",
    },
  );
}

export type CustomerVoucherRequest = {
  createdAt: string;
  createdVoucherId: string | null;
  id: string;
  rejectionReason: string | null;
  requestedRewardType: string | null;
  requestReason: string | null;
  status: "APPROVED" | "CANCELLED" | "FULFILLED" | "PENDING" | "REJECTED";
  updatedAt: string;
};

export async function createVoucherRequest(input: {
  requestedRewardType?: string;
  requestReason?: string;
}): Promise<{ request: CustomerVoucherRequest }> {
  return apiRequest("/customer/voucher-requests", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function loadCustomerVoucherRequests(): Promise<
  CustomerVoucherRequest[]
> {
  return (
    await apiRequest<{ requests: CustomerVoucherRequest[] }>(
      "/customer/voucher-requests",
    )
  ).requests;
}

export async function cancelVoucherRequest(requestId: string): Promise<void> {
  await apiRequest(
    `/customer/voucher-requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST" },
  );
}

export type CustomerDashboard = {
  notifications: CustomerNotification[];
  orderItems: CustomerOrderItem[];
  orderModifiers: CustomerOrderModifier[];
  orders: CustomerOrder[];
  rewards: {
    eligible_purchase_count: number;
    free_rewards_available: number;
    points_balance: number;
  } | null;
  vouchers: CustomerVoucher[];
};

export async function loadCustomerDashboard(): Promise<CustomerDashboard> {
  return apiRequest("/customer/dashboard");
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  await apiRequest(
    `/customer/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
    },
  );
}

export async function placeCustomerOrder(input: {
  cart: CartLine[];
  customerNotes: string;
  idempotencyKey: string;
  paymentMethod:
    | "cash_at_cashier"
    | "card_at_branch"
    | "instapay"
    | "manual_transfer";
  voucherCode: string;
}): Promise<{ orderId: string; orderNumber: string }> {
  return apiRequest("/orders/customer", {
    body: JSON.stringify({
      ...input,
      cart: undefined,
      items: cartPayload(input.cart),
    }),
    method: "POST",
  });
}

export async function createStaffOrder(input: {
  cart: CartLine[];
  carColor: string;
  carType: string;
  customerId: string | null;
  customerPhone: string;
  customerNotes: string;
  orderPlace: "dine_in" | "takeaway" | "car" | "outside" | "delivery";
  paidAmount: number;
  paymentMethod:
    | "cash_at_cashier"
    | "card_at_branch"
    | "instapay"
    | "manual_transfer";
  pickupName: string;
  voucherCode: string;
}): Promise<{
  changeDue: number;
  orderId: string;
  orderNumber: string;
  tenderedAmount: number;
}> {
  return apiRequest("/orders/staff", {
    body: JSON.stringify({
      ...input,
      cart: undefined,
      items: cartPayload(input.cart),
      idempotencyKey: crypto.randomUUID(),
    }),
    method: "POST",
  });
}

export async function previewVoucher(input: {
  code: string;
  customerId?: string | null;
  subtotal: number;
}): Promise<{
  code: string;
  discount: number;
  total: number;
  voucherType: string;
}> {
  return apiRequest("/vouchers/preview", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

// ─── Business Days ───────────────────────────

export type BusinessDay = {
  business_date: string;
  closed_at: string | null;
  closed_by_user_id: string | null;
  gross_sales: number;
  id: string;
  net_sales: number;
  notes: string | null;
  opened_at: string;
  opened_by_user_id: string;
  order_count: number;
  paid_amount: number;
  partially_paid_amount: number;
  receipt_count: number;
  refunded_amount: number;
  status: string;
  unpaid_amount: number;
};

export async function loadCurrentBusinessDay(): Promise<BusinessDay | null> {
  return (
    await apiRequest<{ businessDay: BusinessDay | null }>(
      "/owner/business-days/current",
    )
  ).businessDay;
}

export async function loadBusinessDays(limit = 30): Promise<BusinessDay[]> {
  return (
    await apiRequest<{ businessDays: BusinessDay[] }>(
      `/owner/business-days?limit=${limit}`,
    )
  ).businessDays;
}

export async function startBusinessDay(): Promise<BusinessDay> {
  return (
    await apiRequest<{ businessDay: BusinessDay }>(
      "/owner/business-days/start",
      { method: "POST", body: JSON.stringify({}) },
    )
  ).businessDay;
}

export async function closeBusinessDay(
  businessDayId: string,
  notes?: string,
): Promise<Record<string, unknown>> {
  return (
    await apiRequest<{ report: Record<string, unknown> }>(
      `/owner/business-days/${encodeURIComponent(businessDayId)}/close`,
      {
        method: "POST",
        body: JSON.stringify({ notes }),
      },
    )
  ).report;
}

export async function loadBusinessDayReport(
  businessDayId: string,
): Promise<Record<string, unknown>> {
  return apiRequest(
    `/owner/business-days/${encodeURIComponent(businessDayId)}/report`,
  );
}

export async function assignOrdersToBusinessDay(): Promise<{
  assigned: number;
}> {
  return apiRequest("/owner/business-days/assign-orders", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ─── Owner Orders & Receipts ─────────────────

export type OwnerOrder = {
  archived: boolean;
  archive_reason: string | null;
  archived_at: string | null;
  business_date: string | null;
  business_day_id: string | null;
  confirmation_status: string;
  created_at: string;
  creator_name: string | null;
  customer_email: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_notes: string;
  customer_phone: string | null;
  discount_total: number;
  id: string;
  item_summary: Array<{
    itemName: string;
    originalUnitPrice?: number;
    overrideReason?: string;
    quantity: number;
    size: string;
    totalPrice: number;
    unitPrice: number;
  }>;
  order_number: string;
  paid_amount: number;
  payment_method: string | null;
  payment_status: string;
  pickup_name: string;
  remaining_amount: number;
  status: string;
  subtotal: number;
  tax_total: number;
  total: number;
  voucher_discount: number;
};

export async function loadOwnerOrders(
  params: {
    businessDayId?: string;
    dateFilter?: string;
    includeArchived?: boolean;
    limit?: number;
    page?: number;
    paymentStatus?: string;
    search?: string;
    status?: string;
  } = {},
): Promise<{
  orders: OwnerOrder[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.paymentStatus) qs.set("paymentStatus", params.paymentStatus);
  if (params.search) qs.set("search", params.search);
  if (params.businessDayId) qs.set("businessDayId", params.businessDayId);
  if (params.dateFilter) qs.set("dateFilter", params.dateFilter);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.includeArchived) qs.set("includeArchived", "true");
  return apiRequest(`/owner/orders?${qs.toString()}`);
}

// ─── Owner Overview ──────────────────────────

export type OwnerOverviewStats = {
  active_orders: number;
  avg_order_value: number;
  completed_orders: number;
  gross_sales: number;
  guest_orders: number;
  net_sales: number;
  paid_amount: number;
  partially_paid_amount: number;
  refunded_amount: number;
  returning_customers: number;
  total_items_sold: number;
  total_receipts: number;
  unpaid_amount: number;
  unique_customers: number;
};

export async function loadOwnerOverview(
  dateFilter = "today",
  startDate?: string,
  endDate?: string,
): Promise<{
  categories: Array<{ name: string; qty: number }>;
  paymentMethods: Array<{
    count: number;
    total: number;
    payment_method: string;
  }>;
  sizes: Array<{ name: string; qty: number }>;
  stats: OwnerOverviewStats;
  topProducts: Array<{
    discount: number;
    gross_revenue: number;
    order_count: number;
    product: string;
    units_sold: number;
  }>;
}> {
  const qs = new URLSearchParams({ dateFilter });
  if (startDate) qs.set("startDate", startDate);
  if (endDate) qs.set("endDate", endDate);
  return apiRequest(`/owner/overview?${qs.toString()}`);
}

// ─── Payment Collection ──────────────────────

export async function recordOwnerPayment(input: {
  amount: number;
  paymentMethod: string;
  reference?: string;
  receiptId: string;
}): Promise<void> {
  await apiRequest(
    `/owner/receipts/${encodeURIComponent(input.receiptId)}/payments`,
    {
      body: JSON.stringify({
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
      }),
      method: "POST",
    },
  );
}

export async function voidReceipt(
  receiptId: string,
  reason: string,
): Promise<void> {
  await apiRequest(`/owner/receipts/${encodeURIComponent(receiptId)}/void`, {
    body: JSON.stringify({ reason }),
    method: "POST",
  });
}

export async function archiveReceipt(
  receiptId: string,
  reason?: string,
): Promise<void> {
  await apiRequest(`/owner/receipts/${encodeURIComponent(receiptId)}/archive`, {
    body: JSON.stringify({ reason }),
    method: "POST",
  });
}

export async function unarchiveReceipt(receiptId: string): Promise<void> {
  await apiRequest(
    `/owner/receipts/${encodeURIComponent(receiptId)}/unarchive`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function overrideItemPrice(input: {
  newUnitPrice: number;
  orderItemId: string;
  reason: string;
}): Promise<void> {
  await apiRequest(`/owner/receipts/${input.orderItemId}/price-override`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function subscribeToCustomerChanges(
  _customerId: string,
  onChange: (event?: { entityId?: string; topic?: string }) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  onConnectionChange?.(true);
  const unsubscribe = subscribeToEvents(
    ["orders", "rewards_accounts", "vouchers", "notifications", "menu"],
    onChange,
  );
  return () => {
    onConnectionChange?.(false);
    unsubscribe();
  };
}
