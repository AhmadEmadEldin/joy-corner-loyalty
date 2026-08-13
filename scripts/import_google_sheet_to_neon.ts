import crypto from "node:crypto";
import { promisify } from "node:util";
import dotenv from "dotenv";
import type { PoolClient } from "pg";
import { applyNeonMigrations, closeNeonPool, transaction } from "../server/neon";
import { googleSheetsClient } from "../server/reporting/googleAuth";
import { parseLiveMenuSizes } from "../src/menuRepository";

dotenv.config({ path: [".env.local", ".env"] });

type Row = Record<string, unknown>;
const scrypt = promisify(crypto.scrypt);
const sheetId = process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
type ImportKind = "staff" | "customers" | "menu" | "orders";

function key(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function text(row: Row, ...names: string[]): string {
  for (const name of names) {
    const value = row[key(name)];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function value(row: Row, ...names: string[]): unknown {
  for (const name of names) {
    const result = row[key(name)];
    if (result != null && String(result).trim()) return result;
  }
  return "";
}

function number(row: Row, ...names: string[]): number {
  const value = text(row, ...names).replace(/,/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yes(value: unknown, fallback = true): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return !["no", "false", "0", "inactive", "disabled"].includes(normalized);
}

function parsedDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const sheetsEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(sheetsEpoch + value * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asDate(value: unknown): string {
  const parsed = parsedDate(value);
  if (!parsed) return new Date().toISOString();
  return parsed.toISOString();
}

function asDateOnly(value: unknown): string | null {
  const parsed = parsedDate(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

function rows(values: unknown[][] | null | undefined): Row[] {
  if (!values?.length) return [];
  const headers = (values[0] || []).map(key);
  return values.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function normalizeRole(value: string): string {
  const role = key(value);
  return ["owner", "manager", "cashier", "waiter", "barista"].includes(role)
    ? role
    : "cashier";
}

function normalizeOrderStatus(value: string): string {
  const status = key(value);
  const map: Record<string, string> = {
    accepted: "accepted",
    cancelled: "cancelled",
    closed: "closed",
    complete: "closed",
    completed: "closed",
    confirmed: "confirmed",
    pending: "pending_confirmation",
    pendingconfirmation: "pending_confirmation",
    pickedup: "picked_up",
    preparing: "preparing",
    ready: "ready",
    rejected: "rejected",
  };
  return map[status] || "closed";
}

function normalizePaymentStatus(value: string): string {
  const status = key(value);
  if (status === "paid") return "paid";
  if (status.includes("partial")) return "partially_paid";
  if (status === "refunded") return "refunded";
  return "unpaid";
}

async function migrateStaff(client: PoolClient, source: Row[]): Promise<number> {
  let count = 0;
  for (const row of source) {
    const email = text(row, "email").toLowerCase();
    const password = text(row, "password");
    if (!email || !password) continue;
    const passwordHash = await hashPassword(password);
    await client.query(
      `insert into accounts(email,password_hash,full_name,role,active)
       values($1,$2,$3,$4,$5)
       on conflict(email) do update set password_hash=excluded.password_hash,
       full_name=excluded.full_name,role=excluded.role,active=excluded.active`,
      [email, passwordHash, text(row, "displayName", "name") || email, normalizeRole(text(row, "role")), yes(row.active)],
    );
    count += 1;
  }
  return count;
}

async function migrateCustomers(client: PoolClient, source: Row[]): Promise<number> {
  let count = 0;
  for (const row of source) {
    const customerNumber = text(row, "customerId", "customerNumber");
    if (!customerNumber) continue;
    const phone = text(row, "phone", "phoneWhatsApp") || null;
    const suppliedEmail = text(row, "email").toLowerCase();
    const email = suppliedEmail || `${key(customerNumber)}@legacy.joycorner.local`;
    const result = await client.query<{ id: string }>(
      `insert into accounts(email,password_hash,full_name,phone,role,customer_number,date_of_birth,favorite_drink,active,created_at,account_status)
       values($1,'migrated$',$2,$3,'customer',$4,$5,$6,$7,$8,'guest')
       on conflict(customer_number) do update set full_name=excluded.full_name,
       phone=coalesce(excluded.phone,accounts.phone),email=case when accounts.password_hash='migrated$' then excluded.email else accounts.email end,
       date_of_birth=coalesce(excluded.date_of_birth,accounts.date_of_birth),favorite_drink=coalesce(excluded.favorite_drink,accounts.favorite_drink),active=excluded.active,
       account_status=case when accounts.password_hash='migrated$' then 'guest' else accounts.account_status end
       returning id`,
      [email, text(row, "fullName") || `Customer ${customerNumber}`, phone, customerNumber,
       asDateOnly(row[key("birthday")]), text(row, "favoriteDrink") || null,
       yes(row[key("active?")]), asDate(value(row, "createdAt", "joinDate"))],
    );
    if (result.rows[0]) {
      await client.query(
        `insert into rewards_accounts(customer_id,points_balance,eligible_purchase_count,free_rewards_available)
         values($1,$2,$3,$4) on conflict(customer_id) do update set
         points_balance=greatest(rewards_accounts.points_balance,excluded.points_balance),
         eligible_purchase_count=greatest(rewards_accounts.eligible_purchase_count,excluded.eligible_purchase_count),
         free_rewards_available=greatest(rewards_accounts.free_rewards_available,excluded.free_rewards_available)`,
        [result.rows[0].id, number(row, "points"), number(row, "paidDrinks", "totalOrders"), number(row, "freeDrinksReady", "freeDrinks")],
      );
    }
    count += 1;
  }
  return count;
}

async function migrateMenu(client: PoolClient, source: Row[]): Promise<number> {
  const items = source.flatMap((row, index) => {
    const legacyId = text(row, "itemId");
    const itemName = text(row, "itemName");
    const categoryName = text(row, "category") || "Menu";
    const priceText = text(row, "priceTextEditLater", "price");
    if (!legacyId || !itemName || !priceText) return [];
    const sizes = parseLiveMenuSizes(priceText, legacyId);
    return [{
      legacyId,
      itemName,
      categoryName,
      description: text(row, "flavorNotes"),
      active: yes(row.active),
      loyaltyEligible: yes(row[key("loyaltyEligible")]),
      preparationStation: /food|dessert|sandwich|bakery/i.test(categoryName) ? "kitchen" : "barista",
      sortOrder: index + 1,
      sizes: sizes.map((size, sizeIndex) => ({ name: size.sizeName, price: size.price, sortOrder: sizeIndex + 1 })),
    }];
  });
  if (!items.length) return 0;
  const payload = JSON.stringify(items);
  await client.query(
    `insert into menu_categories(name,sort_order)
     select distinct on (x->>'categoryName') x->>'categoryName', (x->>'sortOrder')::int
     from jsonb_array_elements($1::jsonb) x order by x->>'categoryName',(x->>'sortOrder')::int
     on conflict(name) do update set active=true`, [payload],
  );
  await client.query(
    `insert into menu_items(legacy_id,category_id,name,description,active,available,loyalty_eligible,preparation_station,sort_order)
     select x->>'legacyId',c.id,x->>'itemName',x->>'description',(x->>'active')::boolean,(x->>'active')::boolean,
            (x->>'loyaltyEligible')::boolean,x->>'preparationStation',(x->>'sortOrder')::int
     from jsonb_array_elements($1::jsonb) x join menu_categories c on c.name=x->>'categoryName'
     on conflict(legacy_id) do update set category_id=excluded.category_id,name=excluded.name,
       description=excluded.description,active=excluded.active,available=excluded.available,
       loyalty_eligible=excluded.loyalty_eligible,preparation_station=excluded.preparation_station,sort_order=excluded.sort_order`,
    [payload],
  );
  await client.query(
    `delete from menu_item_sizes where menu_item_id in
     (select i.id from menu_items i join jsonb_array_elements($1::jsonb) x on i.legacy_id=x->>'legacyId')`, [payload],
  );
  await client.query(
    `insert into menu_item_sizes(menu_item_id,size_name,price,sort_order)
     select i.id,s->>'name',(s->>'price')::numeric,(s->>'sortOrder')::int
     from jsonb_array_elements($1::jsonb) x
     join menu_items i on i.legacy_id=x->>'legacyId'
     cross join lateral jsonb_array_elements(x->'sizes') s`, [payload],
  );
  return items.length;
}

async function migrateOrders(client: PoolClient, source: Row[]): Promise<number> {
  let count = 0;
  const rowOffset = Number(process.env.GOOGLE_RANGE_ROW_OFFSET || 0);
  for (const [index, row] of source.entries()) {
    const createdRaw = value(row, "orderDateTime", "createdAt");
    const createdValue = String(createdRaw || "").trim();
    const itemName = text(row, "item", "menuItemName");
    if (!createdValue || !itemName) continue;
    const sheetRow = index + 2 + rowOffset;
    const legacyId = text(row, "orderId") || `orders-row-${sheetRow}`;
    const createdAt = asDate(createdRaw);
    const businessDate = createdAt.slice(0, 10).replace(/-/g, "");
    const orderNumber = text(row, "receiptNumber") || `LEGACY-${businessDate}-${String(sheetRow).padStart(4, "0")}`;
    const customerNumber = text(row, "customerId");
    const customer = customerNumber
      ? await client.query<{ id: string }>("select id from accounts where customer_number=$1", [customerNumber])
      : { rows: [] as { id: string }[] };
    const quantity = Math.max(1, number(row, "qty", "quantity"));
    const unitPrice = number(row, "unitPrice");
    const discount = number(row, "discount");
    const total = Math.max(0, number(row, "total") || quantity * unitPrice - discount);
    const status = normalizeOrderStatus(text(row, "orderStatus"));
    const orderResult = await client.query<{ id: string }>(
      `insert into orders(legacy_id,order_number,idempotency_key,customer_id,pickup_name,customer_notes,status,confirmation_status,payment_status,subtotal,discount_total,total,created_at,updated_at,closed_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$13::timestamptz,case when $7='closed' then $13::timestamptz else null end)
       on conflict(legacy_id) do update set status=excluded.status,payment_status=excluded.payment_status,
       subtotal=excluded.subtotal,discount_total=excluded.discount_total,total=excluded.total returning id`,
      [legacyId, orderNumber, `migration:${legacyId}`, customer.rows[0]?.id || null,
       text(row, "customerName") || "Legacy customer", text(row, "notes"), status,
       status === "pending_confirmation" ? "pending" : "confirmed", normalizePaymentStatus(text(row, "paymentStatus")),
       quantity * unitPrice, discount, total, createdAt],
    );
    const menu = await client.query<Record<string, unknown>>(
      `select i.id,i.name,c.name as category,s.size_name,s.price from menu_items i
       join menu_categories c on c.id=i.category_id join menu_item_sizes s on s.menu_item_id=i.id
       where lower(i.name)=lower($1) order by abs(s.price-$2) limit 1`, [itemName, unitPrice],
    );
    if (orderResult.rows[0] && menu.rows[0]) {
      await client.query(
        `insert into order_items(legacy_id,order_id,menu_item_id,item_name_snapshot,category_name_snapshot,size_name,quantity,unit_price,total_price,customer_notes,created_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict(legacy_id) do update set quantity=excluded.quantity,unit_price=excluded.unit_price,total_price=excluded.total_price`,
        [`${legacyId}:item`,orderResult.rows[0].id,menu.rows[0].id,itemName,text(row,"category") || menu.rows[0].category,
         menu.rows[0].size_name,quantity,unitPrice,total,text(row,"notes"),createdAt],
      );
    }
    count += 1;
  }
  return count;
}

async function main() {
  await applyNeonMigrations();
  const connectorPayload = process.env.GOOGLE_RANGE_VALUES_B64;
  const connectorKind = process.env.GOOGLE_RANGE_KIND as ImportKind | undefined;
  if (connectorPayload || connectorKind) {
    if (!connectorPayload || !connectorKind) {
      throw new Error("GOOGLE_RANGE_VALUES_B64 and GOOGLE_RANGE_KIND must be supplied together.");
    }
    const values = JSON.parse(Buffer.from(connectorPayload, "base64").toString("utf8")) as unknown[][];
    const summary = await transaction(async (client) => {
      if (connectorKind === "staff") return { staff: await migrateStaff(client, rows(values)) };
      if (connectorKind === "customers") return { customers: await migrateCustomers(client, rows(values)) };
      if (connectorKind === "menu") return { menu: await migrateMenu(client, rows(values)) };
      if (connectorKind === "orders") return { orders: await migrateOrders(client, rows(values)) };
      throw new Error(`Unsupported GOOGLE_RANGE_KIND: ${connectorKind}`);
    });
    console.log(JSON.stringify({ success: true, summary }, null, 2));
    return;
  }
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");
  const sheets = googleSheetsClient();
  const source = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: ["Staff!A1:J100", "Customers!A1:W1000", "Menu!A1:H1000", "Orders!A1:BE1000"],
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const [staff, customers, menu, orders] = source.data.valueRanges || [];
  const summary = await transaction(async (client) => ({
    staff: await migrateStaff(client, rows(staff?.values as unknown[][])),
    customers: await migrateCustomers(client, rows(customers?.values as unknown[][])),
    menu: await migrateMenu(client, rows(menu?.values as unknown[][])),
    orders: await migrateOrders(client, rows(orders?.values as unknown[][])),
  }));
  console.log(JSON.stringify({ success: true, summary }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeNeonPool());
