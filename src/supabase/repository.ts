import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
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

export type MenuSize = {
  id: string;
  price: number;
  size_name: string;
};

export type MenuModifier = {
  id: string;
  name: string;
  price: number;
};

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

function fail(message: string, cause?: unknown): never {
  if (cause instanceof Error) throw cause;
  throw new Error(message);
}

export async function signUpCustomer(input: {
  email: string;
  fullName: string;
  password: string;
  phone: string;
}): Promise<void> {
  const { error } = await getSupabaseClient().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim(), phone: input.phone.trim() },
    },
  });
  if (error) fail("Could not create the customer account.", error);
}

export async function signInCustomer(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) fail("Could not sign in.", error);
}

export async function signOutCustomer(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) fail("Could not sign out.", error);
}

export async function signInStaff(
  email: string,
  password: string,
): Promise<void> {
  await signInCustomer(email, password);
  const profile = await loadStaffProfile();
  if (profile.role === "customer") {
    await signOutCustomer();
    throw new Error("This account does not have staff access.");
  }
}

export async function loadStaffProfile(): Promise<AuthProfile> {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("id,full_name,email,role")
    .single();
  if (error || !data) fail("Staff profile could not be loaded.", error);
  return data as AuthProfile;
}

export async function loadStaffQueues(): Promise<{
  cashier: QueueOrder[];
  kitchen: QueueOrder[];
}> {
  const client = getSupabaseClient();
  const [cashier, kitchen] = await Promise.all([
    client.from("cashier_order_queue").select("*").order("created_at"),
    client.from("kitchen_order_queue").select("*").order("order_time"),
  ]);
  const permittedError = cashier.error || kitchen.error;
  if (permittedError && permittedError.code !== "42501") {
    fail("Staff order queues could not be loaded.", permittedError);
  }
  return {
    cashier: (cashier.data || []) as QueueOrder[],
    kitchen: (kitchen.data || []) as QueueOrder[],
  };
}

export async function changeOrderStatus(
  orderId: string,
  status: OperationalOrderStatus,
  reason = "",
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("change_order_status", {
    idempotency_key: crypto.randomUUID(),
    reason: reason || null,
    requested_status: status,
    target_order_id: orderId,
  });
  if (error) fail("Order status could not be changed.", error);
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
  const { error } = await getSupabaseClient().rpc("confirm_order_payment", {
    amount: input.amount,
    idempotency_key: crypto.randomUUID(),
    proof_url: null,
    reference: input.reference || null,
    selected_payment_method: input.paymentMethod,
    target_order_id: input.orderId,
  });
  if (error) fail("Payment could not be confirmed.", error);
}

export async function loadCustomerDirectory(): Promise<
  Array<Record<string, unknown>>
> {
  const { data, error } = await getSupabaseClient().rpc("customer_directory");
  if (error) fail("Customer directory could not be loaded.", error);
  return (data || []) as Array<Record<string, unknown>>;
}

export function subscribeToStaffQueues(onChange: () => void): () => void {
  const client = getSupabaseClient();
  const channels = ["cashier_order_queue", "kitchen_order_queue"].map((table) =>
    client
      .channel(`staff:${table}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
      .subscribe(),
  );
  return () => {
    void Promise.all(channels.map((channel) => client.removeChannel(channel)));
  };
}

export async function loadCustomerProfile(): Promise<CustomerProfile> {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select(
      "id,customer_number,full_name,email,phone,date_of_birth,favorite_drink",
    )
    .single();
  if (error || !data) fail("Customer profile could not be loaded.", error);
  return data as CustomerProfile;
}

export async function updateCustomerProfile(input: {
  dateOfBirth: string | null;
  favoriteDrink: string | null;
  fullName: string;
  phone: string;
}): Promise<void> {
  const { error } = await getSupabaseClient().rpc("update_customer_profile", {
    date_of_birth: input.dateOfBirth,
    favorite_drink: input.favoriteDrink,
    full_name: input.fullName,
    phone: input.phone,
  });
  if (error) fail("Profile could not be saved.", error);
}

export async function loadMenu(): Promise<MenuItem[]> {
  const client = getSupabaseClient();
  const [
    { data: categories, error: categoryError },
    { data: items, error: itemError },
    { data: sizes, error: sizeError },
    { data: modifiers, error: modifierError },
    { data: itemModifiers, error: itemModifierError },
  ] = await Promise.all([
    client.from("menu_categories").select("id,name").order("sort_order"),
    client
      .from("menu_items")
      .select("id,category_id,name,description,image_url,available,loyalty_eligible")
      .order("sort_order"),
    client
      .from("menu_item_sizes")
      .select("id,menu_item_id,size_name,price")
      .order("sort_order"),
    client.from("menu_modifiers").select("id,name,price").order("name"),
    client.from("menu_item_modifiers").select("menu_item_id,modifier_id"),
  ]);
  if (
    categoryError ||
    itemError ||
    sizeError ||
    modifierError ||
    itemModifierError
  ) {
    fail(
      "The live menu could not be loaded.",
      categoryError ||
        itemError ||
        sizeError ||
        modifierError ||
        itemModifierError,
    );
  }
  const categoryMap = new Map(
    (categories || []).map((row) => [String(row.id), String(row.name)]),
  );
  const modifierMap = new Map(
    (modifiers || []).map((row) => [
      String(row.id),
      { id: String(row.id), name: String(row.name), price: Number(row.price) },
    ]),
  );
  return (items || []).map((row) => ({
    available: Boolean(row.available),
    category: categoryMap.get(String(row.category_id)) || "Menu",
    description: String(row.description || ""),
    id: String(row.id),
    image_url: row.image_url ? String(row.image_url) : null,
    loyalty_eligible: Boolean(row.loyalty_eligible),
    modifiers: (itemModifiers || [])
      .filter((link) => link.menu_item_id === row.id)
      .map((link) => modifierMap.get(String(link.modifier_id)))
      .filter((modifier): modifier is MenuModifier => Boolean(modifier)),
    name: String(row.name),
    sizes: (sizes || [])
      .filter((size) => size.menu_item_id === row.id)
      .map((size) => ({
        id: String(size.id),
        price: Number(size.price),
        size_name: String(size.size_name),
      })),
  }));
}

export async function loadCustomerDashboard(): Promise<{
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
}> {
  const client = getSupabaseClient();
  const [orders, orderItems, orderModifiers, rewards, vouchers, notifications] =
    await Promise.all([
    client
      .from("orders")
      .select(
        "id,order_number,status,confirmation_status,payment_status,payment_method,pickup_name,customer_notes,subtotal,discount_total,voucher_discount,tax_total,total,rejection_reason,cancellation_reason,created_at",
      )
      .order("created_at", { ascending: false }),
    client
      .from("order_items")
      .select(
        "id,order_id,item_name_snapshot,category_name_snapshot,size_name,quantity,unit_price,modifiers_total,total_price,customer_notes",
      )
      .order("created_at"),
    client
      .from("order_item_modifiers")
      .select(
        "order_item_id,modifier_name_snapshot,unit_price,quantity,total_price",
      )
      .order("created_at"),
    client
      .from("rewards_accounts")
      .select("points_balance,eligible_purchase_count,free_rewards_available")
      .maybeSingle(),
    client
      .from("vouchers")
      .select(
        "id,voucher_code,voucher_type,fixed_value,percentage_value,free_item_id,status,expires_at",
      )
      .order("issued_at", { ascending: false }),
    client
      .from("notifications")
      .select("id,type,title,message,read,related_order_id,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (
    orders.error ||
    orderItems.error ||
    orderModifiers.error ||
    rewards.error ||
    vouchers.error ||
    notifications.error
  ) {
    fail(
      "Customer dashboard could not be loaded.",
      orders.error ||
        orderItems.error ||
        orderModifiers.error ||
        rewards.error ||
        vouchers.error ||
        notifications.error,
    );
  }
  return {
    notifications: (notifications.data || []) as CustomerNotification[],
    orderItems: (orderItems.data || []) as CustomerOrderItem[],
    orderModifiers: (orderModifiers.data || []) as CustomerOrderModifier[],
    orders: (orders.data || []) as CustomerOrder[],
    rewards: rewards.data as {
      eligible_purchase_count: number;
      free_rewards_available: number;
      points_balance: number;
    } | null,
    vouchers: (vouchers.data || []) as CustomerVoucher[],
  };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);
  if (error) fail("Notification could not be marked as read.", error);
}

export async function placeCustomerOrder(input: {
  cart: CartLine[];
  customerNotes: string;
  paymentMethod:
    | "cash_at_cashier"
    | "card_at_branch"
    | "instapay"
    | "manual_transfer";
  voucherCode: string;
}): Promise<{ orderId: string; orderNumber: string }> {
  const currentMenu = await loadMenu();
  for (const line of input.cart) {
    const currentItem = currentMenu.find((item) => item.id === line.item.id);
    const currentSize = currentItem?.sizes.find((size) => size.id === line.size.id);
    if (!currentItem?.available || !currentSize) {
      throw new Error(`${line.item.name} is no longer available. Review your order.`);
    }
    if (currentSize.price !== line.size.price) {
      throw new Error(`${line.item.name} has a new price. Review your order before checkout.`);
    }
    const currentModifierIds = new Set(currentItem.modifiers.map((modifier) => modifier.id));
    if (line.modifiers.some((modifier) => !currentModifierIds.has(modifier.id))) {
      throw new Error(`${line.item.name} has updated options. Review your order.`);
    }
  }
  const idempotencyKey = crypto.randomUUID();
  const { data, error } = await getSupabaseClient().rpc(
    "place_customer_order",
    {
      customer_notes: input.customerNotes,
      idempotency_key: idempotencyKey,
      items: input.cart.map((line) => ({
        modifierIds: line.modifiers.map((modifier) => modifier.id),
        notes: line.notes,
        quantity: line.quantity,
        sizeId: line.size.id,
      })),
      requested_voucher_code: input.voucherCode || null,
      selected_payment_method: input.paymentMethod,
    },
  );
  if (error) fail("Order could not be submitted.", error);
  const result = data as { orderId: string; orderNumber: string };
  return result;
}

export async function createStaffOrder(input: {
  cart: CartLine[];
  customerId: string | null;
  customerNotes: string;
  paymentMethod:
    | "cash_at_cashier"
    | "card_at_branch"
    | "instapay"
    | "manual_transfer";
  pickupName: string;
}): Promise<{ orderId: string; orderNumber: string }> {
  const { data, error } = await getSupabaseClient().rpc("create_staff_order", {
    customer_id: input.customerId,
    customer_notes: input.customerNotes,
    idempotency_key: crypto.randomUUID(),
    items: input.cart.map((line) => ({
        modifierIds: line.modifiers.map((modifier) => modifier.id),
      notes: line.notes,
      quantity: line.quantity,
      sizeId: line.size.id,
    })),
    pickup_name: input.pickupName,
    selected_payment_method: input.paymentMethod,
  });
  if (error) fail("Branch order could not be created.", error);
  return data as { orderId: string; orderNumber: string };
}

export function subscribeToCustomerChanges(
  onChange: () => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const client = getSupabaseClient();
  const connectedChannels = new Set<string>();
  const channels: RealtimeChannel[] = [
    "orders",
    "payments",
    "rewards_accounts",
    "vouchers",
    "notifications",
  ].map((table) => {
    const channelName = `customer:${table}:${crypto.randomUUID()}`;
    return client
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") connectedChannels.add(channelName);
        else connectedChannels.delete(channelName);
        onConnectionChange?.(connectedChannels.size > 0);
      });
  });
  return () => {
    onConnectionChange?.(false);
    void Promise.all(channels.map((channel) => client.removeChannel(channel)));
  };
}
