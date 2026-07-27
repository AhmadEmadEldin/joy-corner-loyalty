import crypto from "node:crypto";
import { promisify } from "node:util";
import dotenv from "dotenv";
import { closeNeonPool, query } from "../server/neon";
import { ORDER_STATUS } from "../src/orderWorkflow";

dotenv.config({ path: [".env.local", ".env"] });

if (process.env.E2E_ALLOW_DATABASE_MUTATION !== "true") {
  throw new Error("Set E2E_ALLOW_DATABASE_MUTATION=true to run the disposable Neon workflow test.");
}

const apiBase = (process.env.E2E_API_URL || "http://localhost:3001/api").replace(/\/$/, "");
const origin = process.env.FRONTEND_ORIGIN || "http://localhost:8081";
const password = `Joy-${crypto.randomBytes(12).toString("base64url")}!`;
const runId = crypto.randomBytes(6).toString("hex");
const scrypt = promisify(crypto.scrypt);
const roles = ["owner", "manager", "cashier", "waiter", "barista", "customer"] as const;
type Role = (typeof roles)[number];
const accountIds: string[] = [];
const orderIds: string[] = [];
const paymentIds: string[] = [];

async function hashPassword(value: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(value, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function request<T>(path: string, cookie = "", init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(`${path}: ${payload.error || response.status}`);
  return payload;
}

async function login(role: Role): Promise<string> {
  const email = `codex-e2e-${runId}-${role}@example.invalid`;
  const response = await fetch(`${apiBase}/auth/login`, {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json", Origin: origin },
    method: "POST",
  });
  if (!response.ok) throw new Error(`${role} login failed: ${await response.text()}`);
  const cookie = String(response.headers.get("set-cookie") || "").split(";")[0] || "";
  if (!cookie.startsWith("joy_corner_session=")) throw new Error(`${role} login did not set the secure session cookie.`);
  const me = await request<{ user: { role: Role } }>("/auth/me", cookie);
  if (me.user.role !== role) throw new Error(`${role} authorization resolved as ${me.user.role}.`);
  return cookie;
}

async function seedAccounts(): Promise<void> {
  const passwordHash = await hashPassword(password);
  for (const role of roles) {
    const rows = await query<{ id: string }>(
      `insert into accounts(email,password_hash,full_name,phone,role,customer_number)
       values($1,$2,$3,$4,$5,case when $5='customer' then 'E2E-' || $6 else null end)
       returning id`,
      [`codex-e2e-${runId}-${role}@example.invalid`,passwordHash,`Codex E2E ${role}`,`010${runId.slice(0,8)}`,role,runId],
    );
    const account = rows[0];
    if (!account) throw new Error(`Failed to seed the ${role} account.`);
    accountIds.push(account.id);
    if (role === "customer") await query("insert into rewards_accounts(customer_id) values($1)", [account.id]);
  }
}

async function main(): Promise<void> {
  await seedAccounts();
  const cookies = Object.fromEntries(await Promise.all(roles.map(async (role) => [role, await login(role)]))) as Record<Role, string>;
  const menu = await request<{ items: Array<{ sizes: Array<{ id: string }> }> }>("/menu");
  const sizeId = menu.items.find((item) => item.sizes.length)?.sizes[0]?.id;
  if (!sizeId) throw new Error("No available menu size exists for the workflow test.");

  const controller = new AbortController();
  const stream = await fetch(`${apiBase}/events?topics=kitchen_order_queue`, {
    headers: { Cookie: cookies.barista, Origin: origin },
    signal: controller.signal,
  });
  if (!stream.ok || !stream.body) throw new Error("Barista realtime stream did not open.");
  const reader = stream.body.getReader();
  const readyFrame = new TextDecoder().decode((await reader.read()).value);
  if (!readyFrame.includes("event: ready")) throw new Error("Barista realtime stream did not become ready.");

  const customerOrder = await request<{ orderId: string; orderNumber: string }>("/orders/customer", cookies.customer, {
    body: JSON.stringify({ customerNotes: "Disposable end-to-end verification", idempotencyKey: `e2e-${runId}`, items: [{ modifierIds: [], quantity: 1, sizeId }], paymentMethod: "cash_at_cashier", voucherCode: "" }),
    method: "POST",
  });
  orderIds.push(customerOrder.orderId);
  const beforeConfirmation = await request<{ kitchen: Array<{ order_id: string }> }>("/staff/queues", cookies.barista);
  if (beforeConfirmation.kitchen.some((order) => order.order_id === customerOrder.orderId)) {
    throw new Error("An unconfirmed order leaked into the barista queue.");
  }
  await request(`/orders/${customerOrder.orderId}/status`, cookies.owner, { body: JSON.stringify({ status: "confirmed" }), method: "POST" });
  const changeFrame = new TextDecoder().decode((await reader.read()).value);
  if (!changeFrame.includes("event: change")) throw new Error("Barista did not receive the realtime confirmation update.");
  const afterConfirmation = await request<{ kitchen: Array<{ order_id: string }> }>("/staff/queues", cookies.barista);
  if (!afterConfirmation.kitchen.some((order) => order.order_id === customerOrder.orderId)) {
    throw new Error("The confirmed order did not appear in the barista queue.");
  }
  controller.abort();

  for (const status of [
    ORDER_STATUS.IN_PREPARATION,
    ORDER_STATUS.READY,
  ]) {
    await request(`/orders/${customerOrder.orderId}/status`, cookies.barista, { body: JSON.stringify({ status }), method: "POST" });
  }
  const queues = await request<{ cashier: Array<{ order_id: string; total: number }> }>("/staff/queues", cookies.cashier);
  const queued = queues.cashier.find((order) => order.order_id === customerOrder.orderId);
  if (!queued) throw new Error("Cashier queue did not contain the pickup order.");
  await request(`/orders/${customerOrder.orderId}/payment`, cookies.cashier, {
    body: JSON.stringify({
      amount: queued.total,
      idempotencyKey: `e2e-${runId}`,
      paymentMethod: "cash_at_cashier",
    }),
    headers: { "Idempotency-Key": `e2e-${runId}` },
    method: "POST",
  });
  const paymentRows = await query<{ id: string }>("select id from payments where order_id=$1", [customerOrder.orderId]);
  paymentIds.push(...paymentRows.map((row) => row.id));
  await request(`/orders/${customerOrder.orderId}/status`, cookies.barista, {
    body: JSON.stringify({ status: ORDER_STATUS.PICKED_UP }),
    method: "POST",
  });

  const dashboard = await request<{
    orders: Array<{ id: string; paid_amount: number; remaining_amount: number }>;
    rewards: { eligible_purchase_count: number; points_balance: number };
  }>("/customer/dashboard", cookies.customer);
  if (Number(dashboard.rewards?.eligible_purchase_count) !== 1 || Number(dashboard.rewards?.points_balance) <= 0) {
    throw new Error("Closing the paid customer order did not apply loyalty credit.");
  }
  const receipt = dashboard.orders.find((order) => order.id === customerOrder.orderId);
  if (!receipt || Number(receipt.paid_amount) !== Number(queued.total) || Number(receipt.remaining_amount) !== 0) {
    throw new Error("The customer receipt did not expose the correct paid and remaining amounts.");
  }

  const customerId = accountIds[roles.indexOf("customer")];
  const waiterOrder = await request<{ orderId: string }>("/orders/staff", cookies.waiter, {
    body: JSON.stringify({ customerId, customerNotes: "Waiter authorization verification", items: [{ modifierIds: [], quantity: 1, sizeId }], paymentMethod: "cash_at_cashier", pickupName: "E2E Waiter" }),
    method: "POST",
  });
  orderIds.push(waiterOrder.orderId);
  await request(`/orders/${waiterOrder.orderId}/status`, cookies.owner, { body: JSON.stringify({ reason: "Disposable verification", status: "cancelled" }), method: "POST" });

  await request("/admin/end-day", cookies.manager, { body: JSON.stringify({}), method: "POST" });
  console.log(JSON.stringify({
    authRoles: roles,
    customerOrder: customerOrder.orderNumber,
    endDay: "verified",
    loyalty: "verified",
    orderLifecycle: [
      ORDER_STATUS.AWAITING_CONFIRMATION,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.IN_PREPARATION,
      ORDER_STATUS.READY,
      "paid",
      ORDER_STATUS.PICKED_UP,
    ],
    receiptAmounts: "verified",
    realtime: "verified",
    unconfirmedBaristaVisibility: "blocked",
    waiterOrder: "verified",
  }, null, 2));
}

async function cleanup(): Promise<void> {
  if (!accountIds.length) return;
  const existingOwner = await query<{ id: string }>("select id from accounts where role='owner' and id<>all($1::uuid[]) order by created_at limit 1", [accountIds]);
  await query("delete from reporting_outbox where entity_id=any($1::text[])", [[...accountIds, ...orderIds, ...paymentIds]]);
  if (orderIds.length) {
    await query("delete from payments where order_id=any($1::uuid[])", [orderIds]);
    await query("delete from audit_logs where entity_id=any($1::text[])", [orderIds]);
    await query("delete from orders where id=any($1::uuid[])", [orderIds]);
  }
  await query("delete from audit_logs where actor_id=any($1::uuid[])", [accountIds]);
  if (existingOwner[0]) {
    await query("update end_day_reports set performed_by=$1 where performed_by=any($2::uuid[])", [existingOwner[0].id, accountIds]);
  }
  await query("delete from accounts where id=any($1::uuid[])", [accountIds]);
}

void main()
  .finally(cleanup)
  .finally(() => closeNeonPool());
