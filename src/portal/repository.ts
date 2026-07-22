import {
  apiRequest,
  clearSession,
  setSession,
  subscribeToEvents,
  type SessionUser,
} from "./client";
import type { OperationalOrderStatus } from "./workflow";

export type CustomerProfile = {
  customer_number: string | null;
  date_of_birth: string | null;
  email: string | null;
  favorite_drink: string | null;
  full_name: string;
  id: string;
  phone: string | null;
};
export type MenuSize = { id: string; price: number; size_name: string };
export type MenuModifier = { id: string; name: string; price: number };
export type MenuItem = {
  available: boolean;
  category: string;
  description: string;
  id: string;
  image_url: string | null;
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
export type CustomerOrder = {
  cancellation_reason: string | null;
  confirmation_status: string;
  created_at: string;
  customer_notes: string;
  discount_total: number;
  id: string;
  order_number: string;
  payment_method: string | null;
  payment_status: string;
  pickup_name: string;
  rejection_reason: string | null;
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
  item_summary: Array<{
    itemName?: string;
    name?: string;
    quantity?: number;
    size?: string;
  }>;
  order_id: string;
  order_time?: string;
  order_number: string;
  payment_method?: string | null;
  payment_status?: string;
  pickup_name: string;
  status: OperationalOrderStatus;
  total?: number;
};

export function staffQueueTables(
  role: StaffProfile["role"],
): Array<"cashier_order_queue" | "kitchen_order_queue"> {
  return [
    ...(["owner", "manager", "cashier"].includes(role)
      ? (["cashier_order_queue"] as const)
      : []),
    ...(["owner", "manager", "barista"].includes(role)
      ? (["kitchen_order_queue"] as const)
      : []),
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
}): Promise<void> {
  const result = await apiRequest<AuthResult>("/auth/signup", {
    body: JSON.stringify(input),
    method: "POST",
  });
  setSession(result.user);
}

export async function signInCustomer(email: string, password: string): Promise<void> {
  const result = await apiRequest<AuthResult>("/auth/login", {
    body: JSON.stringify({ email: email.trim(), password }),
    method: "POST",
  });
  setSession(result.user);
}

export async function signOutCustomer(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
  clearSession();
}

export async function signInStaff(email: string, password: string): Promise<void> {
  await signInCustomer(email, password);
  const profile = await loadStaffProfile();
  if (profile.role === "customer") {
    await signOutCustomer();
    throw new Error("This account does not have staff access.");
  }
}

export async function sendStaffMagicLink(): Promise<void> {
  throw new Error("Email sign-in links are not enabled. Sign in with your password.");
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
  paymentMethod: "cash_at_cashier" | "card_at_branch" | "instapay" | "manual_transfer";
  reference: string;
}): Promise<void> {
  await apiRequest(`/orders/${encodeURIComponent(input.orderId)}/payment`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function loadCustomerDirectory(): Promise<Array<Record<string, unknown>>> {
  return (await apiRequest<{ customers: Array<Record<string, unknown>> }>("/staff/customers"))
    .customers;
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
  return (await apiRequest<{ report: EndDayReport }>("/admin/end-day", {
    body: JSON.stringify({}),
    method: "POST",
  })).report;
}

export function subscribeToStaffQueues(
  role: StaffProfile["role"],
  onChange: () => void,
): () => void {
  return subscribeToEvents(staffQueueTables(role), onChange);
}

export async function loadCustomerProfile(): Promise<CustomerProfile> {
  return (await apiRequest<{ profile: CustomerProfile }>("/customer/profile")).profile;
}

export async function updateCustomerProfile(input: {
  dateOfBirth: string | null;
  favoriteDrink: string | null;
  fullName: string;
  phone: string;
}): Promise<void> {
  await apiRequest("/customer/profile", { body: JSON.stringify(input), method: "PATCH" });
}

export async function loadMenu(): Promise<MenuItem[]> {
  return (await apiRequest<{ items: MenuItem[] }>("/menu")).items;
}

export async function loadOwnerMenu(): Promise<OwnerMenuItem[]> {
  return (await apiRequest<{ items: OwnerMenuItem[] }>("/owner/menu")).items;
}

export async function updateOwnerMenuItem(input: {
  active: boolean;
  available: boolean;
  description: string;
  id: string;
  loyaltyEligible: boolean;
  name: string;
  preparationStation: "barista" | "kitchen";
}): Promise<void> {
  await apiRequest(`/owner/menu/items/${encodeURIComponent(input.id)}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export async function updateOwnerMenuSize(sizeId: string, price: number): Promise<void> {
  if (!Number.isFinite(price) || price <= 0) throw new Error("Size price must be greater than zero.");
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
  if (!["image/avif", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, WebP, or AVIF image.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Menu images must be 5 MB or smaller.");
  const result = await apiRequest<{ imageUrl: string }>(
    `/owner/menu/items/${encodeURIComponent(itemId)}/image`,
    { body: JSON.stringify({ dataUrl: await fileAsDataUrl(file) }), method: "PUT" },
  );
  return result.imageUrl;
}

export async function removeOwnerMenuImage(
  itemId: string,
  _imageUrl: string | null,
): Promise<void> {
  await apiRequest(`/owner/menu/items/${encodeURIComponent(itemId)}/image`, { method: "DELETE" });
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

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiRequest(`/customer/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
  });
}

export async function placeCustomerOrder(input: {
  cart: CartLine[];
  customerNotes: string;
  idempotencyKey: string;
  paymentMethod: "cash_at_cashier" | "card_at_branch" | "instapay" | "manual_transfer";
  voucherCode: string;
}): Promise<{ orderId: string; orderNumber: string }> {
  return apiRequest("/orders/customer", {
    body: JSON.stringify({ ...input, cart: undefined, items: cartPayload(input.cart) }),
    method: "POST",
  });
}

export async function createStaffOrder(input: {
  cart: CartLine[];
  customerId: string | null;
  customerNotes: string;
  paymentMethod: "cash_at_cashier" | "card_at_branch" | "instapay" | "manual_transfer";
  pickupName: string;
}): Promise<{ orderId: string; orderNumber: string }> {
  return apiRequest("/orders/staff", {
    body: JSON.stringify({ ...input, cart: undefined, items: cartPayload(input.cart) }),
    method: "POST",
  });
}

export function subscribeToCustomerChanges(
  _customerId: string,
  onChange: () => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  onConnectionChange?.(true);
  const unsubscribe = subscribeToEvents(
    ["orders", "rewards_accounts", "vouchers", "notifications"],
    onChange,
  );
  return () => {
    onConnectionChange?.(false);
    unsubscribe();
  };
}
