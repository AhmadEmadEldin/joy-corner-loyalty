import crypto from "node:crypto";

import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

const apiBase = "http://127.0.0.1:3001/api";

type Session = { cookie: string; role: string; userId: string };
type ApiResult = {
  body: Record<string, unknown>;
  status: number;
};

async function request(
  path: string,
  session?: Session,
  init: RequestInit = {},
): Promise<ApiResult> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session.cookie } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { body, status: response.status };
}

async function expectStatus(
  path: string,
  session: Session | undefined,
  expected: number,
  init: RequestInit = {},
) {
  const result = await request(path, session, init);
  if (result.status !== expected) {
    throw new Error(
      `${path} returned ${result.status}; expected ${expected}: ${String(result.body.error || "")}`,
    );
  }
  return result.body;
}

async function login(
  email: string,
  passwordEnvironment: string,
  role: string,
): Promise<Session> {
  const password = process.env[passwordEnvironment];
  if (!password) throw new Error(`${passwordEnvironment} is not configured.`);
  const response = await fetch(`${apiBase}/auth/login`, {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    error?: string;
    user?: { id: string; role: string };
  };
  if (!response.ok || body.user?.role !== role) {
    throw new Error(`Staging ${role} sign-in failed: ${body.error || response.status}`);
  }
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`Staging ${role} session cookie is missing.`);
  return { cookie, role, userId: body.user.id };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Staging workflow verification is blocked in production.");
  }
  const [owner, cashier, barista, customer] = await Promise.all([
    login("owner@joycorner.com", "STAGING_OWNER_PASSWORD", "owner"),
    login("cashier@joycorner.com", "STAGING_CASHIER_PASSWORD", "cashier"),
    login("barista@joycorner.com", "STAGING_BARISTA_PASSWORD", "barista"),
    login(
      "staging.customer@example.com",
      "STAGING_CUSTOMER_PASSWORD",
      "customer",
    ),
  ]);
  await expectStatus("/owner/menu", customer, 403);
  await expectStatus("/staff/orders", barista, 403);

  const ownerMenu = (await expectStatus("/owner/menu", owner, 200)).items as Array<
    Record<string, unknown>
  >;
  const item = ownerMenu.find((entry) => entry.legacy_id === "ITEM-0001");
  if (!item) throw new Error("ITEM-0001 is missing from the Owner menu.");
  const sizes = item.sizes as Array<Record<string, unknown>>;
  const size = sizes[0];
  if (!size) throw new Error("ITEM-0001 has no priced size.");
  const originalPrice = Number(size.price);
  const itemPatch = {
    active: true,
    availabilityStatus: "temporarily_unavailable",
    categoryId: item.category_id,
    description: item.description,
    loyaltyEligible: item.loyalty_eligible,
    name: item.name,
    preparationStation: item.preparation_station,
    sortOrder: item.sort_order,
  };
  await expectStatus(`/owner/menu/items/${item.id}`, owner, 200, {
    body: JSON.stringify(itemPatch),
    method: "PATCH",
  });
  const unavailableMenu = (await expectStatus("/menu", undefined, 200))
    .items as Array<Record<string, unknown>>;
  const unavailableItem = unavailableMenu.find((entry) => entry.id === item.id);
  if (!unavailableItem || unavailableItem.available !== false) {
    throw new Error("Unavailable item was not retained with ordering disabled.");
  }
  const unavailableAttempt = await request("/orders/customer", customer, {
    body: JSON.stringify({
      idempotencyKey: `staging-unavailable-${crypto.randomUUID()}`,
      items: [{ modifierIds: [], quantity: 1, sizeId: size.id }],
      paymentMethod: "cash",
    }),
    method: "POST",
  });
  if (unavailableAttempt.status !== 409) {
    throw new Error("Backend accepted a stale unavailable product.");
  }
  await expectStatus(`/owner/menu/items/${item.id}`, owner, 200, {
    body: JSON.stringify({
      ...itemPatch,
      availabilityStatus: "available",
    }),
    method: "PATCH",
  });

  const dashboardBefore = await expectStatus(
    "/customer/dashboard",
    customer,
    200,
  );
  const pointsBefore = Number(
    (dashboardBefore.rewards as Record<string, unknown> | null)?.points_balance ||
      0,
  );
  const orderKey = `staging-workflow-${crypto.randomUUID()}`;
  const createPayload = {
    customerNotes: "Sanitized staging workflow",
    idempotencyKey: orderKey,
    items: [{ modifierIds: [], quantity: 1, sizeId: size.id }],
    paymentMethod: "cash",
    voucherCode: "STAGING-E2E-VOUCHER",
  };
  const created = await expectStatus("/orders/customer", customer, 201, {
    body: JSON.stringify(createPayload),
    method: "POST",
  });
  const orderId = String(created.orderId);
  const duplicateCreate = await expectStatus(
    "/orders/customer",
    customer,
    201,
    { body: JSON.stringify(createPayload), method: "POST" },
  );
  if (duplicateCreate.orderId !== orderId) {
    throw new Error("Order idempotency returned a different order.");
  }
  const voucherReplay = await request("/orders/customer", customer, {
    body: JSON.stringify({
      ...createPayload,
      idempotencyKey: `staging-voucher-replay-${crypto.randomUUID()}`,
    }),
    method: "POST",
  });
  if (voucherReplay.status !== 400) {
    throw new Error("Redeemed voucher was accepted a second time.");
  }

  await expectStatus(`/orders/${orderId}/status`, cashier, 200, {
    body: JSON.stringify({ status: "confirmed" }),
    method: "POST",
  });
  const duplicateConfirmation = await request(
    `/orders/${orderId}/status`,
    cashier,
    {
      body: JSON.stringify({ status: "confirmed" }),
      method: "POST",
    },
  );
  if (duplicateConfirmation.status !== 409) {
    throw new Error("Duplicate order confirmation was not rejected.");
  }
  const cashierQueues = await expectStatus("/staff/queues", cashier, 200);
  const cashierOrder = (
    cashierQueues.cashier as Array<Record<string, unknown>>
  ).find((entry) => entry.order_id === orderId);
  if (!cashierOrder) throw new Error("Confirmed order is missing from Cashier.");
  const total = Number(cashierOrder.total);
  const paymentKey = `staging-payment-${crypto.randomUUID()}`;
  await expectStatus(`/orders/${orderId}/payment`, cashier, 200, {
    body: JSON.stringify({
      amount: total,
      idempotencyKey: paymentKey,
      paymentMethod: "cash",
    }),
    headers: { "Idempotency-Key": paymentKey },
    method: "POST",
  });
  await expectStatus(`/orders/${orderId}/payment`, cashier, 200, {
    body: JSON.stringify({
      amount: total,
      idempotencyKey: paymentKey,
      paymentMethod: "cash",
    }),
    headers: { "Idempotency-Key": paymentKey },
    method: "POST",
  });
  for (const status of ["in_preparation", "ready", "picked_up"]) {
    await expectStatus(`/orders/${orderId}/status`, barista, 200, {
      body: JSON.stringify({ status }),
      method: "POST",
    });
  }
  const duplicatePickup = await request(
    `/orders/${orderId}/status`,
    barista,
    {
      body: JSON.stringify({ status: "picked_up" }),
      method: "POST",
    },
  );
  if (duplicatePickup.status !== 409) {
    throw new Error("Duplicate pickup transition was not rejected.");
  }
  const baristaQueues = await expectStatus("/staff/queues", barista, 200);
  if (
    (baristaQueues.kitchen as Array<Record<string, unknown>>).some(
      (entry) => entry.order_id === orderId,
    )
  ) {
    throw new Error("Picked-up order remained in the Barista queue.");
  }
  const dashboardAfter = await expectStatus(
    "/customer/dashboard",
    customer,
    200,
  );
  const customerOrder = (
    dashboardAfter.orders as Array<Record<string, unknown>>
  ).find((entry) => entry.id === orderId);
  if (
    customerOrder?.status !== "picked_up" ||
    customerOrder?.payment_status !== "paid"
  ) {
    throw new Error("Customer tracking did not reach paid and picked up.");
  }
  const pointsAfter = Number(
    (dashboardAfter.rewards as Record<string, unknown>)?.points_balance || 0,
  );
  if (pointsAfter - pointsBefore !== Math.floor(total)) {
    throw new Error("Loyalty points were not awarded exactly once.");
  }
  const originalSnapshotPrice = Number(
    (
      dashboardAfter.orderItems as Array<Record<string, unknown>>
    ).find((entry) => entry.order_id === orderId)?.unit_price,
  );
  await expectStatus(`/owner/menu/sizes/${size.id}`, owner, 200, {
    body: JSON.stringify({ price: originalPrice + 1 }),
    method: "PATCH",
  });
  const changedMenu = (await expectStatus("/menu", undefined, 200))
    .items as Array<Record<string, unknown>>;
  const changedSize = (
    changedMenu.find((entry) => entry.id === item.id)?.sizes as Array<
      Record<string, unknown>
    >
  ).find((entry) => entry.id === size.id);
  if (Number(changedSize?.price) !== originalPrice + 1) {
    throw new Error("Updated Owner price did not reach the public menu.");
  }
  const dashboardHistorical = await expectStatus(
    "/customer/dashboard",
    customer,
    200,
  );
  const historicalPrice = Number(
    (
      dashboardHistorical.orderItems as Array<Record<string, unknown>>
    ).find((entry) => entry.order_id === orderId)?.unit_price,
  );
  if (historicalPrice !== originalSnapshotPrice) {
    throw new Error("Historical order-item price snapshot changed.");
  }
  await expectStatus(`/owner/menu/sizes/${size.id}`, owner, 200, {
    body: JSON.stringify({ price: originalPrice }),
    method: "PATCH",
  });
  console.log(
    JSON.stringify({
      duplicateConfirmationRejected: true,
      historicalPricePreserved: true,
      loyaltyAwardedOnce: true,
      orderId,
      paymentIdempotent: true,
      roles: ["owner", "cashier", "barista", "customer"],
      status: "PASS",
      unavailableRejected: true,
      voucherRedeemedOnce: true,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
