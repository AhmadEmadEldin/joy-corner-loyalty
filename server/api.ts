import crypto from "node:crypto";
import { promisify } from "node:util";
import dotenv from "dotenv";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { PoolClient } from "pg";
import {
  canRoleTransitionOrder,
  derivePaymentStatusMinor,
  fromMinorUnits,
  normalizeOperationalOrderStatus,
  ORDER_STATUS,
  toMinorUnits,
  type OperationalOrderStatus,
  type OperationalRole,
} from "../src/orderWorkflow";
import { getCairoBusinessDate } from "./cairoDate";
import { removeMenuImage, storeMenuImage } from "./imageStorage";
import { isValidEmail, normalizePhone } from "./validators";
import {
  applyNeonMigrations,
  closeNeonPool,
  neonHealth,
  query,
  transaction,
} from "./neon";

dotenv.config({ path: [".env.local", ".env"] });

type Role = "owner" | "manager" | "cashier" | "waiter" | "barista" | "customer";
type Claims = { email: string; exp: number; full_name: string; iat: number; role: Role; sub: string };
type AuthedRequest = Request & { auth?: Claims };
type OrderItemInput = {
  modifierIds?: string[];
  notes?: string;
  quantity?: number;
  sizeId?: string;
};
type OrderPlace = "dine_in" | "takeaway" | "car" | "outside" | "delivery";

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || "";
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "joy_corner_session";
const sessionLifetimeSeconds = 12 * 60 * 60;
const scrypt = promisify(crypto.scrypt);
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:8081")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

if (isProduction && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin?.replace(/\/$/, "");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (origin && !allowedOrigins.has(origin) && req.path.startsWith("/api/")) {
    return res.status(403).json({ error: "This origin is not allowed." });
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

function asyncRoute(
  handler: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req as AuthedRequest, res, next).catch(next);
  };
}

function base64url(value: object | string): string {
  const input = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(input).toString("base64url");
}

function signToken(user: Omit<Claims, "exp" | "iat">): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { ...user, exp: iat + sessionLifetimeSeconds, iat };
  const unsigned = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}`;
  const signature = crypto
    .createHmac("sha256", jwtSecret || "joy-corner-development-secret-only")
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function verifyToken(token: string): Claims {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("Invalid session.");
  const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<string, unknown>;
  if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") throw new Error("Invalid session.");
  const unsigned = `${header}.${payload}`;
  const expected = crypto
    .createHmac("sha256", jwtSecret || "joy-corner-development-secret-only")
    .update(unsigned)
    .digest("base64url");
  const suppliedBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid session.");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
  const now = Math.floor(Date.now() / 1000);
  if (
    !claims.sub ||
    !Number.isFinite(claims.iat) ||
    !Number.isFinite(claims.exp) ||
    claims.iat > now + 60 ||
    claims.exp <= now ||
    claims.exp - claims.iat > sessionLifetimeSeconds
  ) {
    throw new Error("Session expired.");
  }
  return claims;
}

function cookieValue(req: Request, name: string): string {
  const encoded = `${name}=`;
  const part = String(req.headers.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(encoded));
  return part ? decodeURIComponent(part.slice(encoded.length)) : "";
}

function requestToken(req: Request): string {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : cookieValue(req, sessionCookieName);
}

function authenticate(req: AuthedRequest, res: Response, next: NextFunction): void {
  void (async () => {
    const verified = verifyToken(requestToken(req));
    const rows = await query<Record<string, unknown>>(
      "select id,email,full_name,role from accounts where id=$1 and active=true limit 1",
      [verified.sub],
    );
    if (!rows[0]) throw new Error("Inactive account.");
    req.auth = { ...publicUser(rows[0]), exp: verified.exp, iat: verified.iat };
    next();
  })().catch(() => {
    clearSessionCookie(res);
    res.status(401).json({ error: "Please sign in again." });
  });
}

function requireRoles(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "You do not have permission for this action." });
      return;
    }
    next();
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = (await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length)) as Buffer;
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicUser(row: Record<string, unknown>): Omit<Claims, "exp" | "iat"> {
  return {
    email: String(row.email),
    full_name: String(row.full_name),
    role: row.role as Role,
    sub: String(row.id),
  };
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    maxAge: sessionLifetimeSeconds * 1000,
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}

function sessionResponse(row: Record<string, unknown>, res: Response) {
  const claims = publicUser(row);
  setSessionCookie(res, signToken(claims));
  return {
    user: { ...claims, id: claims.sub },
  };
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    next();
    return;
  }
  current.count += 1;
  if (current.count > 12) {
    res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }
  next();
}

function nonEmpty(value: unknown, max = 200): string {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new HttpError(400, "Required information is missing or too long.");
  return result;
}

function validatedPlace(
  value: unknown,
  details: unknown,
): { orderPlace: OrderPlace; placeDetails: Record<string, string | number> } {
  const orderPlace = String(value || "takeaway") as OrderPlace;
  if (!["dine_in", "takeaway", "car", "outside", "delivery"].includes(orderPlace)) {
    throw new HttpError(400, "Select a valid order place.");
  }
  const source =
    details && typeof details === "object"
      ? (details as Record<string, unknown>)
      : {};
  const clean = (key: string, required = false) => {
    const result = String(source[key] || "").trim().slice(0, 300);
    if (required && !result) {
      throw new HttpError(400, `Complete the ${key.replace(/([A-Z])/g, " $1").toLowerCase()} field.`);
    }
    return result;
  };
  const placeDetails: Record<string, string | number> = {};
  if (orderPlace === "dine_in") placeDetails.tableNumber = clean("tableNumber", true);
  if (orderPlace === "takeaway") {
    placeDetails.pickupName = clean("pickupName", true);
    placeDetails.pickupTime = clean("pickupTime");
  }
  if (orderPlace === "car") {
    placeDetails.carColor = clean("carColor", true);
    placeDetails.carModel = clean("carModel", true);
    placeDetails.plateNumber = clean("plateNumber");
  }
  if (orderPlace === "delivery") {
    placeDetails.address = clean("address", true);
    placeDetails.phone = clean("phone", true);
    placeDetails.deliveryNote = clean("deliveryNote");
    const deliveryFee = Number(source.deliveryFee || 0);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      throw new HttpError(400, "Delivery fee is invalid.");
    }
    placeDetails.deliveryFee = fromMinorUnits(toMinorUnits(deliveryFee));
  }
  return { orderPlace, placeDetails };
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type EventClient = { res: Response; topics: Set<string>; user: Claims };
const eventClients = new Set<EventClient>();
function publish(topic: string, entityId: string): void {
  const frame = `event: change\ndata: ${JSON.stringify({ entityId, topic })}\n\n`;
  eventClients.forEach((client) => {
    if (client.topics.has(topic)) client.res.write(frame);
  });
}

app.get("/health", asyncRoute(async (_req, res) => {
  res.status(200).json({ ok: true, service: "joy-corner-api" });
}));

app.get("/ready", asyncRoute(async (_req, res) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  try {
    const db = await neonHealth();
    checks.database = db;
  } catch (error) {
    checks.database = { ok: false, error: error instanceof Error ? error.message : "Unknown database error" };
  }
  const hasJwtSecret = Boolean(jwtSecret && jwtSecret.length >= 16);
  checks.config = { ok: hasJwtSecret };
  const allOk = Object.values(checks).every((check) => check.ok);
  res.status(allOk ? 200 : 503).json({ ok: allOk, checks });
}));

app.post("/api/auth/signup", loginRateLimit, asyncRoute(async (req, res) => {
  const email = nonEmpty(req.body?.email).toLowerCase();
  const fullName = nonEmpty(req.body?.fullName);
  const phone = normalizePhone(nonEmpty(req.body?.phone, 30));
  const password = String(req.body?.password || "");
  if (email.endsWith("@joycorner.com")) throw new HttpError(403, "Staff accounts cannot be created through signup.");
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!phone) throw new HttpError(400, "Enter a valid phone number.");
  if (password.length < 8 || password.length > 200) throw new HttpError(400, "Password must be at least 8 characters.");
  const passwordHash = await hashPassword(password);
  const existingEmail = await query<Record<string, unknown>>(
    "select * from accounts where email=$1 limit 1",
    [email],
  );
  if (existingEmail[0]) {
    if (
      String(existingEmail[0].password_hash).startsWith("migrated$") &&
      String(existingEmail[0].phone || "") === phone
    ) {
      if (isProduction && process.env.ALLOW_MIGRATED_ACCOUNT_CLAIM !== "true") {
        throw new HttpError(409, "This imported account needs an administrator password reset.");
      }
      const claimed = await query<Record<string, unknown>>(
        `update accounts set password_hash=$2,full_name=$3,phone=$4
         where id=$1 returning *`,
        [existingEmail[0].id, passwordHash, fullName, phone],
      );
      await query("insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)", [claimed[0]?.id]);
      res.status(200).json(sessionResponse(claimed[0] as Record<string, unknown>, res));
      return;
    }
    throw new HttpError(409, "An account already exists for this email.");
  }
  const existingPhone = await query<Record<string, unknown>>(
    "select * from accounts where phone=$1 and role='customer' limit 1",
    [phone],
  );
  if (existingPhone[0]) {
    throw new HttpError(409, "A customer account already exists with this phone number.");
  }
  const rows = await query<Record<string, unknown>>(
    `insert into accounts(email,password_hash,full_name,phone,role,customer_number)
     values($1,$2,$3,$4,'customer','JC-' || lpad(nextval('customer_number_seq')::text,6,'0'))
     on conflict(email) do nothing returning *`,
    [email, passwordHash, fullName, phone],
  );
  if (!rows[0]) throw new HttpError(409, "An account already exists for this email.");
  await query("insert into rewards_accounts(customer_id) values($1) on conflict do nothing", [rows[0].id]);
  await query("insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)", [rows[0].id]);
  res.status(201).json(sessionResponse(rows[0], res));
}));

app.post("/api/auth/login", loginRateLimit, asyncRoute(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const rows = await query<Record<string, unknown>>(
    "select * from accounts where email=$1 and active=true limit 1",
    [email],
  );
  if (!rows[0] || !(await passwordMatches(password, String(rows[0].password_hash)))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  loginAttempts.delete(req.ip || "unknown");
  res.json(sessionResponse(rows[0], res));
}));

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get("/api/auth/me", authenticate, asyncRoute(async (req, res) => {
  const rows = await query<Record<string, unknown>>(
    "select id,email,full_name,role from accounts where id=$1 and active=true",
    [req.auth?.sub],
  );
  if (!rows[0]) throw new HttpError(401, "Account is no longer active.");
  res.json({ user: { ...rows[0], id: String(rows[0].id) } });
}));

app.get("/api/events", authenticate, (req: AuthedRequest, res) => {
  const requested = new Set(String(req.query.topics || "").split(",").filter(Boolean));
  const allowed = new Set<string>();
  const role = req.auth?.role;
  if (role === "customer") {
    ["menu", "orders", "rewards_accounts", "vouchers", "notifications"].forEach((topic) => {
      if (requested.has(topic)) allowed.add(topic);
    });
  } else if (role) {
    if (requested.has("menu")) allowed.add("menu");
    if (["owner", "manager", "cashier"].includes(role) && requested.has("cashier_order_queue")) allowed.add("cashier_order_queue");
    if (["owner", "manager", "barista"].includes(role) && requested.has("kitchen_order_queue")) allowed.add("kitchen_order_queue");
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("event: ready\ndata: {}\n\n");
  const client = { res, topics: allowed, user: req.auth as Claims };
  eventClients.add(client);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    eventClients.delete(client);
  });
});

async function menuItems(includeInactive: boolean) {
  const [items, sizes, modifiers, links] = await Promise.all([
    query<Record<string, unknown>>(
      `select i.id,i.category_id,i.name,i.description,i.active,i.available,
              i.availability_status,
              i.loyalty_eligible,i.preparation_station,i.sort_order,c.name as category,
              coalesce(i.image_url,case when i.image_bytes is null then null else '/api/menu/images/' || i.id::text end) as image_url
       from menu_items i join menu_categories c on c.id=i.category_id
       where ($1::boolean or (i.active and i.availability_status <> 'archived' and c.active))
       order by c.sort_order,i.sort_order,i.name`,
      [includeInactive],
    ),
    query<Record<string, unknown>>("select id,menu_item_id,size_name,price from menu_item_sizes order by sort_order,size_name"),
    query<Record<string, unknown>>("select id,name,price from menu_modifiers where active=true order by name"),
    query<Record<string, unknown>>("select menu_item_id,modifier_id from menu_item_modifiers"),
  ]);
  const sizesByItem = new Map<string, Record<string, unknown>[]>();
  sizes.forEach((size) => {
    const key = String(size.menu_item_id);
    const list = sizesByItem.get(key) || [];
    list.push({ id: String(size.id), price: Number(size.price), size_name: String(size.size_name) });
    sizesByItem.set(key, list);
  });
  const modifierById = new Map(modifiers.map((modifier) => [String(modifier.id), {
    id: String(modifier.id), name: String(modifier.name), price: Number(modifier.price),
  }]));
  const modifiersByItem = new Map<string, Record<string, unknown>[]>();
  links.forEach((link) => {
    const modifier = modifierById.get(String(link.modifier_id));
    if (!modifier) return;
    const key = String(link.menu_item_id);
    const list = modifiersByItem.get(key) || [];
    list.push(modifier);
    modifiersByItem.set(key, list);
  });
  return items.map((item) => ({
    ...item,
    active: Boolean(item.active),
    available: String(item.availability_status) === "available",
    id: String(item.id),
    category_id: String(item.category_id),
    loyalty_eligible: Boolean(item.loyalty_eligible),
    sort_order: Number(item.sort_order),
    sizes: sizesByItem.get(String(item.id)) || [],
    modifiers: modifiersByItem.get(String(item.id)) || [],
  }));
}

app.get("/api/menu", asyncRoute(async (_req, res) => res.json({ items: await menuItems(false) })));
app.get("/api/menu/images/:itemId", asyncRoute(async (req, res) => {
  const rows = await query<{ image_bytes: Buffer; image_content_type: string }>(
    "select image_bytes,image_content_type from menu_items where id=$1 and image_bytes is not null",
    [req.params.itemId],
  );
  if (!rows[0]) throw new HttpError(404, "Image not found.");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.type(rows[0].image_content_type).send(rows[0].image_bytes);
}));

app.get("/api/customer/profile", authenticate, requireRoles("customer"), asyncRoute(async (req, res) => {
  const rows = await query<Record<string, unknown>>(
    `select id,customer_number,full_name,email,phone,date_of_birth,favorite_drink
     from accounts where id=$1`, [req.auth?.sub],
  );
  res.json({ profile: rows[0] });
}));

app.patch("/api/customer/profile", authenticate, requireRoles("customer"), asyncRoute(async (req, res) => {
  const fullName = nonEmpty(req.body?.fullName);
  const phone = normalizePhone(nonEmpty(req.body?.phone, 30));
  if (!phone) throw new HttpError(400, "Enter a valid phone number.");
  const dateOfBirth = req.body?.dateOfBirth ? String(req.body.dateOfBirth) : null;
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new HttpError(400, "Date of birth must be in YYYY-MM-DD format.");
  }
  await query(
    `update accounts set full_name=$2,phone=$3,date_of_birth=$4,favorite_drink=$5 where id=$1`,
    [req.auth?.sub, fullName, phone, dateOfBirth, String(req.body?.favoriteDrink || "").trim() || null],
  );
  await query("insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)", [req.auth?.sub]);
  res.json({ ok: true });
}));

app.get("/api/customer/dashboard", authenticate, requireRoles("customer"), asyncRoute(async (req, res) => {
  const userId = req.auth?.sub;
  const [orders, orderItems, orderModifiers, rewards, vouchers, notifications] = await Promise.all([
    query<Record<string, unknown>>(
      `select o.*,
              coalesce((select sum(p.amount) from payments p where p.order_id=o.id),0) as paid_amount,
              greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id),0),0) as remaining_amount
       from orders o where o.customer_id=$1 order by o.created_at desc limit 100`,
      [userId],
    ),
    query<Record<string, unknown>>(`select oi.* from order_items oi join orders o on o.id=oi.order_id where o.customer_id=$1 order by oi.created_at`, [userId]),
    query<Record<string, unknown>>(`select om.* from order_item_modifiers om join order_items oi on oi.id=om.order_item_id join orders o on o.id=oi.order_id where o.customer_id=$1 order by om.created_at`, [userId]),
    query<Record<string, unknown>>("select points_balance,eligible_purchase_count,free_rewards_available from rewards_accounts where customer_id=$1", [userId]),
    query<Record<string, unknown>>("select id,voucher_code,voucher_type,fixed_value,percentage_value,free_item_id,status,expires_at from vouchers where customer_id=$1 order by issued_at desc", [userId]),
    query<Record<string, unknown>>("select id,type,title,message,read,related_order_id,created_at from notifications where user_id=$1 order by created_at desc limit 50", [userId]),
  ]);
  const numericOrderFields = ["subtotal", "discount_total", "voucher_discount", "tax_total", "service_fee", "delivery_fee", "total", "paid_amount", "remaining_amount"];
  res.json({
    notifications,
    orderItems: orderItems.map((row) => ({ ...row, unit_price: Number(row.unit_price), modifiers_total: Number(row.modifiers_total), total_price: Number(row.total_price) })),
    orderModifiers: orderModifiers.map((row) => ({ ...row, unit_price: Number(row.unit_price), total_price: Number(row.total_price) })),
    orders: orders.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numericOrderFields.includes(key) ? Number(value) : value]))),
    rewards: rewards[0] || null,
    vouchers,
  });
}));

app.post("/api/customer/notifications/:id/read", authenticate, requireRoles("customer"), asyncRoute(async (req, res) => {
  await query("update notifications set read=true where id=$1 and user_id=$2", [req.params.id, req.auth?.sub]);
  res.json({ ok: true });
}));

async function createOrder(
  client: PoolClient,
  actor: Claims,
  input: {
    customerId: string | null;
    customerNotes: string;
    idempotencyKey: string;
    items: OrderItemInput[];
    paymentMethod: string;
    orderPlace: OrderPlace;
    placeDetails: Record<string, string | number>;
    pickupName: string;
    voucherCode?: string;
  },
) {
  const existing = await client.query<{ id: string; order_number: string }>(
    "select id,order_number from orders where idempotency_key=$1", [input.idempotencyKey],
  );
  if (existing.rows[0]) return { orderId: existing.rows[0].id, orderNumber: existing.rows[0].order_number };
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) throw new HttpError(400, "Add at least one menu item.");
  const sizeIds = input.items.map((item) => String(item.sizeId || ""));
  const sizes = await client.query<Record<string, unknown>>(
    `select s.id,s.menu_item_id,s.size_name,s.price,i.name,i.loyalty_eligible,
            i.availability_status,i.image_url,c.name as category
     from menu_item_sizes s join menu_items i on i.id=s.menu_item_id
     join menu_categories c on c.id=i.category_id
     where s.id=any($1::uuid[]) and i.active
       and i.availability_status='available' and c.active`, [sizeIds],
  );
  const sizeById = new Map(sizes.rows.map((row) => [String(row.id), row]));
  if (sizeById.size !== new Set(sizeIds).size) throw new HttpError(409, "One or more menu items are no longer available.");
  const modifierIds = [...new Set(input.items.flatMap((item) => item.modifierIds || []))];
  const modifiers = modifierIds.length
    ? await client.query<Record<string, unknown>>(
        `select m.id,m.name,m.price,l.menu_item_id from menu_modifiers m
         join menu_item_modifiers l on l.modifier_id=m.id
         where m.id=any($1::uuid[]) and m.active`, [modifierIds],
      )
    : { rows: [] as Record<string, unknown>[] };
  const modifierByItemAndId = new Map(modifiers.rows.map((row) => [`${row.menu_item_id}:${row.id}`, row]));
  let subtotalMinor = 0;
  const prepared = input.items.map((item) => {
    const size = sizeById.get(String(item.sizeId));
    if (!size) throw new HttpError(409, "A selected size is unavailable.");
    const quantity = Number(item.quantity || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpError(400, "Item quantity is invalid.");
    if (!Array.isArray(item.modifierIds) || item.modifierIds.length > 10) {
      throw new HttpError(400, "Too many options were selected for one item.");
    }
    const selectedModifiers = [...new Set(item.modifierIds)].map((id) => {
      const modifier = modifierByItemAndId.get(`${size.menu_item_id}:${id}`);
      if (!modifier) throw new HttpError(409, "A selected option is unavailable for this item.");
      return modifier;
    });
    const modifiersTotalMinor = selectedModifiers.reduce(
      (sum, row) => sum + toMinorUnits(Number(row.price)),
      0,
    );
    const unitPriceMinor = toMinorUnits(Number(size.price));
    const totalPriceMinor =
      (unitPriceMinor + modifiersTotalMinor) * quantity;
    subtotalMinor += totalPriceMinor;
    return {
      item,
      modifiersTotalMinor,
      quantity,
      selectedModifiers,
      size,
      totalPriceMinor,
      unitPriceMinor,
    };
  });
  let voucherDiscountMinor = 0;
  let redeemedVoucherId: string | null = null;
  if (input.voucherCode) {
    const voucherResult = await client.query<Record<string, unknown>>(
      `select * from vouchers where voucher_code=$1 and customer_id=$2 and status='active'
       and (expires_at is null or expires_at > now()) for update`, [input.voucherCode.trim(), input.customerId],
    );
    const voucher = voucherResult.rows[0];
    if (!voucher) throw new HttpError(400, "Voucher is invalid or expired.");
    if (voucher.fixed_value != null) {
      voucherDiscountMinor = Math.min(
        subtotalMinor,
        toMinorUnits(Number(voucher.fixed_value)),
      );
    } else if (voucher.percentage_value != null) {
      voucherDiscountMinor = Math.min(
        subtotalMinor,
        Math.round(
          (subtotalMinor * Number(voucher.percentage_value)) / 100,
        ),
      );
    }
    redeemedVoucherId = String(voucher.id);
  }
  const deliveryFeeMinor =
    input.orderPlace === "delivery"
      ? toMinorUnits(Number(input.placeDetails.deliveryFee || 0))
      : 0;
  const totalMinor = Math.max(
    0,
    subtotalMinor - voucherDiscountMinor + deliveryFeeMinor,
  );
  const sequence = await client.query<{ value: string }>("select nextval('order_number_seq')::text as value");
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const orderNumber = `JC-${date}-${String(sequence.rows[0]?.value || "0").padStart(4, "0")}`;
  const orderResult = await client.query<{ id: string }>(
    `insert into orders(order_number,idempotency_key,customer_id,created_by,pickup_name,customer_notes,payment_method,subtotal,voucher_discount,delivery_fee,total,status,order_place,place_details)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) returning id`,
    [
      orderNumber,
      input.idempotencyKey,
      input.customerId,
      actor.sub,
      input.pickupName,
      input.customerNotes,
      input.paymentMethod,
      fromMinorUnits(subtotalMinor),
      fromMinorUnits(voucherDiscountMinor),
      fromMinorUnits(deliveryFeeMinor),
      fromMinorUnits(totalMinor),
      ORDER_STATUS.AWAITING_CONFIRMATION,
      input.orderPlace,
      JSON.stringify(input.placeDetails),
    ],
  );
  const orderId = orderResult.rows[0]?.id;
  if (!orderId) throw new Error("Order was not created.");
  for (const line of prepared) {
    const itemResult = await client.query<{ id: string }>(
      `insert into order_items(order_id,menu_item_id,item_name_snapshot,category_name_snapshot,size_name,quantity,unit_price,modifiers_total,total_price,customer_notes,image_url_snapshot)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [
        orderId,
        line.size.menu_item_id,
        line.size.name,
        line.size.category,
        line.size.size_name,
        line.quantity,
        fromMinorUnits(line.unitPriceMinor),
        fromMinorUnits(line.modifiersTotalMinor),
        fromMinorUnits(line.totalPriceMinor),
        String(line.item.notes || "").trim().slice(0, 500),
        line.size.image_url || null,
      ],
    );
    for (const modifier of line.selectedModifiers) {
      await client.query(
        `insert into order_item_modifiers(order_item_id,modifier_id,modifier_name_snapshot,unit_price,quantity,total_price)
         values($1,$2,$3,$4,$5,$6)`,
        [
          itemResult.rows[0]?.id,
          modifier.id,
          modifier.name,
          fromMinorUnits(toMinorUnits(Number(modifier.price))),
          line.quantity,
          fromMinorUnits(
            toMinorUnits(Number(modifier.price)) * line.quantity,
          ),
        ],
      );
    }
  }
  await client.query(
    `insert into order_status_history(
      order_id,previous_status,new_status,changed_by,changed_by_role,note
    ) values($1,$2,$3,$4,$5,$6),($1,$3,$7,$4,$5,$6)`,
    [
      orderId,
      ORDER_STATUS.DRAFT,
      ORDER_STATUS.SUBMITTED,
      actor.sub,
      actor.role,
      "Order created",
      ORDER_STATUS.AWAITING_CONFIRMATION,
    ],
  );
  if (redeemedVoucherId && input.customerId) {
    await client.query(
      `insert into voucher_redemptions(
        voucher_id,order_id,customer_id,discount_amount
      ) values($1,$2,$3,$4)`,
      [
        redeemedVoucherId,
        orderId,
        input.customerId,
        fromMinorUnits(voucherDiscountMinor),
      ],
    );
    await client.query(
      "update vouchers set status='redeemed' where id=$1 and status='active'",
      [redeemedVoucherId],
    );
  }
  if (input.customerId) {
    await client.query(
      `insert into notifications(user_id,type,title,message,related_order_id)
       values($1,'order','Order received',$2,$3)`,
      [input.customerId, `Your order ${orderNumber} is waiting for confirmation.`, orderId],
    );
  }
  await client.query(
    "insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)",
    [orderId, JSON.stringify({ orderId, orderNumber })],
  );
  return { orderId, orderNumber };
}

app.post("/api/orders/customer", authenticate, requireRoles("customer"), asyncRoute(async (req, res) => {
  const place = validatedPlace("takeaway", {
    pickupName: req.auth?.full_name || "Customer",
  });
  const result = await transaction((client) => createOrder(client, req.auth as Claims, {
    customerId: req.auth?.sub || null,
    customerNotes: String(req.body?.customerNotes || "").trim().slice(0, 1000),
    idempotencyKey: nonEmpty(req.body?.idempotencyKey),
    items: req.body?.items as OrderItemInput[],
    paymentMethod: nonEmpty(req.body?.paymentMethod, 40),
    ...place,
    pickupName: req.auth?.full_name || "Customer",
    voucherCode: String(req.body?.voucherCode || "").trim() || undefined,
  }));
  publish("orders", result.orderId);
  publish("cashier_order_queue", result.orderId);
  res.status(201).json(result);
}));

app.post("/api/orders/staff", authenticate, requireRoles("owner","manager","cashier","waiter"), asyncRoute(async (req, res) => {
  const place = validatedPlace(req.body?.orderPlace, req.body?.placeDetails);
  const result = await transaction((client) => createOrder(client, req.auth as Claims, {
    customerId: String(req.body?.customerId || "") || null,
    customerNotes: String(req.body?.customerNotes || "").trim().slice(0, 1000),
    idempotencyKey: crypto.randomUUID(),
    items: req.body?.items as OrderItemInput[],
    paymentMethod: nonEmpty(req.body?.paymentMethod, 40),
    ...place,
    pickupName: nonEmpty(req.body?.pickupName),
  }));
  publish("cashier_order_queue", result.orderId);
  res.status(201).json(result);
}));

async function queueRows(where: string, values: unknown[]) {
  const rows = await query<Record<string, unknown>>(
    `select o.id as order_id,o.order_number,o.pickup_name,o.status,o.confirmation_status,
            o.payment_status,o.payment_method,o.order_place,o.place_details,
            o.subtotal,o.discount_total,o.voucher_discount,o.tax_total,o.service_fee,o.delivery_fee,o.total,
            coalesce((select sum(p.amount) from payments p where p.order_id=o.id),0) as paid_amount,
            greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id),0),0) as remaining_amount,
            o.customer_notes,o.created_at,o.created_at as order_time,
            coalesce(jsonb_agg(jsonb_build_object('itemName',oi.item_name_snapshot,'quantity',oi.quantity,'size',oi.size_name,
              'unitPrice',oi.unit_price,'totalPrice',oi.total_price)
              order by oi.created_at) filter (where oi.id is not null),'[]'::jsonb) as item_summary
     from orders o left join order_items oi on oi.order_id=o.id
     where ${where} group by o.id order by o.created_at`, values,
  );
  const numericFields = ["subtotal", "discount_total", "voucher_discount", "tax_total", "service_fee", "delivery_fee", "total", "paid_amount", "remaining_amount"];
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, numericFields.includes(key) ? Number(value) : value]),
  ));
}

app.get("/api/staff/queues", authenticate, requireRoles("owner","manager","cashier","barista","waiter"), asyncRoute(async (req, res) => {
  const role = req.auth?.role;
  const canCashier = role ? ["owner","manager","cashier"].includes(role) : false;
  const canKitchen = role ? ["owner","manager","barista"].includes(role) : false;
  const [cashier, kitchen] = await Promise.all([
    canCashier
      ? queueRows(
          "o.status in ('submitted','awaiting_confirmation','confirmed','in_preparation','ready')",
          [],
        )
      : [],
    canKitchen
      ? queueRows(
          "o.status in ('confirmed','in_preparation','ready')",
          [],
        )
      : [],
  ]);
  res.json({ cashier, kitchen });
}));

app.get("/api/staff/orders", authenticate, requireRoles("owner","manager","cashier","barista","waiter"), asyncRoute(async (_req, res) => {
  const orders = await queueRows(
    "o.status in ('picked_up','rejected','cancelled')",
    [],
  );
  res.json({ orders: orders.slice(-100).reverse() });
}));

app.get("/api/staff/insights", authenticate, requireRoles("owner","manager"), asyncRoute(async (_req, res) => {
  const [todayRows, customerRows, rewardRows, voucherRows, endDayRows] =
    await Promise.all([
      query<Record<string, unknown>>(
        `select
          count(*)::int as order_count,
          coalesce(sum(total),0)::numeric(12,2) as order_value,
          coalesce(avg(total),0)::numeric(12,2) as average_order,
          coalesce(sum(total) filter (where payment_status <> 'paid'),0)::numeric(12,2) as unpaid_value,
          count(*) filter (where status in ('confirmed','in_preparation','ready'))::int as active_kitchen
         from orders
         where (created_at at time zone 'Africa/Cairo')::date =
           (now() at time zone 'Africa/Cairo')::date`,
      ),
      query<Record<string, unknown>>(
        `select
          count(*)::int as total_customers,
          count(*) filter (
            where (created_at at time zone 'Africa/Cairo')::date =
              (now() at time zone 'Africa/Cairo')::date
          )::int as new_customers
         from accounts where role='customer' and active=true`,
      ),
      query<Record<string, unknown>>(
        `select
          coalesce(sum(points_balance),0)::int as points_outstanding,
          coalesce(sum(eligible_purchase_count),0)::int as eligible_orders,
          coalesce(sum(free_rewards_available),0)::int as free_rewards
         from rewards_accounts`,
      ),
      query<Record<string, unknown>>(
        `select
          count(*)::int as total,
          count(*) filter (where status='active' and (expires_at is null or expires_at > now()))::int as active,
          count(*) filter (where status='redeemed')::int as redeemed,
          count(*) filter (where status='cancelled')::int as cancelled
         from vouchers`,
      ),
      query<Record<string, unknown>>(
        `select * from end_day_reports order by business_date desc limit 30`,
      ),
    ]);
  const today = todayRows[0] || {};
  res.json({
    analytics: {
      ...today,
      average_order: Number(today.average_order || 0),
      order_value: Number(today.order_value || 0),
      unpaid_value: Number(today.unpaid_value || 0),
    },
    customers: customerRows[0] || {},
    endDays: endDayRows.map((row) => ({
      ...row,
      gross_sales: Number(row.gross_sales || 0),
      payments_received: Number(row.payments_received || 0),
    })),
    integrations: {
      cloudinary: Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET,
      ),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID),
      neon: true,
      realtime: "SSE",
    },
    rewards: rewardRows[0] || {},
    vouchers: voucherRows[0] || {},
  });
}));

app.get("/api/staff/customers", authenticate, requireRoles("owner","manager","cashier"), asyncRoute(async (_req, res) => {
  const rows = await query<Record<string, unknown>>(
    `select a.id,a.full_name as "fullName",a.email,a.phone,
            a.customer_number as "customerNumber",
            (select count(*)::int from orders o where o.customer_id=a.id) as "orderCount",
            coalesce((select sum(o.total) from orders o where o.customer_id=a.id),0)::numeric(12,2) as "lifetimeSpend",
            coalesce((select sum(o.total) from orders o where o.customer_id=a.id and o.payment_status <> 'paid'),0)::numeric(12,2) as "unpaidBalance",
            coalesce((select r.points_balance from rewards_accounts r where r.customer_id=a.id),0)::int as "loyaltyPoints",
            (select count(*)::int from vouchers v where v.customer_id=a.id and v.status='active') as "activeVouchers"
     from accounts a
     where a.role='customer' and a.active=true
     order by a.full_name`,
  );
  res.json({
    customers: rows.map((row) => ({
      ...row,
      lifetimeSpend: Number(row.lifetimeSpend || 0),
      unpaidBalance: Number(row.unpaidBalance || 0),
    })),
  });
}));

app.get("/api/staff/customers/search", authenticate, requireRoles("owner","manager","cashier"), asyncRoute(async (req, res) => {
  const raw = String(req.query.phone || "");
  const phone = normalizePhone(raw);
  if (!phone) throw new HttpError(400, "Enter a valid phone number.");
  const rows = await query<Record<string, unknown>>(
    `select a.id,a.full_name as "fullName",a.email,a.phone,
            a.customer_number as "customerNumber",
            coalesce((select r.points_balance from rewards_accounts r where r.customer_id=a.id),0)::int as "loyaltyPoints",
            coalesce((select sum(o.total) from orders o where o.customer_id=a.id and o.payment_status <> 'paid'),0)::numeric(12,2) as "unpaidBalance",
            (select count(*)::int from vouchers v where v.customer_id=a.id and v.status='active' and (v.expires_at is null or v.expires_at > now())) as "activeVouchers",
            (select count(*)::int from orders o where o.customer_id=a.id) as "orderCount"
     from accounts a where a.phone=$1 and a.role='customer' and a.active=true limit 1`,
    [phone],
  );
  const customer = rows[0]
    ? { ...rows[0], unpaidBalance: Number(rows[0].unpaidBalance || 0) }
    : null;
  res.json({ customer });
}));

app.post("/api/staff/customers", authenticate, requireRoles("owner","manager","cashier"), asyncRoute(async (req, res) => {
  const fullName = nonEmpty(req.body?.fullName);
  const phone = normalizePhone(nonEmpty(req.body?.phone, 30));
  if (!phone) throw new HttpError(400, "Enter a valid phone number.");
  const emailRaw = String(req.body?.email || "").trim().toLowerCase();
  if (emailRaw && !isValidEmail(emailRaw)) throw new HttpError(400, "Enter a valid email address.");
  const result = await transaction(async (client) => {
    const existing = await client.query<Record<string, unknown>>(
      "select id,full_name,email,phone,customer_number from accounts where phone=$1 and role='customer' limit 1",
      [phone],
    );
    if (existing.rows[0]) {
      const setClauses = [`full_name=$2`];
      const values: unknown[] = [existing.rows[0].id, fullName];
      if (emailRaw) {
        setClauses.push("email=$3");
        values.push(emailRaw);
      }
      const updated = await client.query<Record<string, unknown>>(
        `update accounts set ${setClauses.join(",")} where id=$1 returning id,full_name as "fullName",email,phone,customer_number as "customerNumber"`,
        values,
      );
      return { customer: updated.rows[0] };
    }
    const email = emailRaw || `customer-${phone.replace(/\D/g, "")}@joycorner.local`;
    const insertResult = await client.query<Record<string, unknown>>(
      `insert into accounts(email,password_hash,full_name,phone,role,customer_number)
       values($1,$2,$3,$4,'customer','JC-' || lpad(nextval('customer_number_seq')::text,6,'0'))
       on conflict(email) do nothing returning id,full_name as "fullName",email,phone,customer_number as "customerNumber"`,
      [email, await hashPassword(crypto.randomUUID()), fullName, phone],
    );
    if (!insertResult.rows[0]) {
      const fallback = await client.query<Record<string, unknown>>(
        "select id,full_name as \"fullName\",email,phone,customer_number as \"customerNumber\" from accounts where phone=$1 and role='customer' limit 1",
        [phone],
      );
      return { customer: fallback.rows[0] };
    }
    await client.query("insert into rewards_accounts(customer_id) values($1) on conflict do nothing", [insertResult.rows[0].id]);
    await client.query("insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)", [insertResult.rows[0].id]);
    return { customer: insertResult.rows[0] };
  });
  res.status(201).json(result);
}));

app.post("/api/orders/:id/status", authenticate, requireRoles("owner","manager","cashier","barista"), asyncRoute(async (req, res) => {
  const status = normalizeOperationalOrderStatus(
    nonEmpty(req.body?.status, 40),
  );
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  const order = await transaction(async (client) => {
    const current = await client.query<Record<string, unknown>>("select * from orders where id=$1 for update", [req.params.id]);
    const row = current.rows[0];
    if (!row) throw new HttpError(404, "Order not found.");
    const currentStatus = normalizeOperationalOrderStatus(row.status);
    const role = req.auth?.role as OperationalRole;
    if (!canRoleTransitionOrder(role, currentStatus, status)) {
      throw new HttpError(
        409,
        "That order status change is not allowed for your role.",
      );
    }
    if (status === ORDER_STATUS.REJECTED && !reason) {
      throw new HttpError(400, "A rejection reason is required.");
    }
    if (status === ORDER_STATUS.CONFIRMED) {
      const invalidItems = await client.query<{ count: string }>(
        `select count(*)::text as count
         from order_items oi
         join menu_items i on i.id=oi.menu_item_id
         join menu_item_sizes s on s.menu_item_id=oi.menu_item_id
           and s.size_name=oi.size_name
         where oi.order_id=$1
           and (
             not i.active or i.availability_status <> 'available'
             or round(s.price * 100) <> round(oi.unit_price * 100)
           )`,
        [req.params.id],
      );
      if (Number(invalidItems.rows[0]?.count || 0) > 0) {
        throw new HttpError(
          409,
          "A product changed price or availability. Review the order before confirming.",
        );
      }
    }
    const confirmationStatus =
      status === ORDER_STATUS.CONFIRMED
        ? "confirmed"
        : status === ORDER_STATUS.REJECTED
          ? "rejected"
          : row.confirmation_status;
    await client.query(
      `update orders set status=$2,confirmation_status=$3,rejection_reason=case when $2='rejected' then $4 else rejection_reason end,
       cancellation_reason=case when $2='cancelled' then $4 else cancellation_reason end,
       closed_at=case when $2='picked_up' then now() else closed_at end where id=$1`,
      [req.params.id,status,confirmationStatus,reason || null],
    );
    await client.query(
      `insert into order_status_history(
        order_id,previous_status,new_status,changed_by,changed_by_role,note
      ) values($1,$2,$3,$4,$5,$6)`,
      [
        req.params.id,
        currentStatus,
        status,
        req.auth?.sub,
        req.auth?.role,
        reason || null,
      ],
    );
    if (row.customer_id) {
      await client.query(
        `insert into notifications(user_id,type,title,message,related_order_id)
         values($1,'order_status','Order update',$2,$3)`,
        [row.customer_id, `Order ${row.order_number} is now ${status.replace(/_/g, " ")}.`, req.params.id],
      );
    }
    if (
      status === ORDER_STATUS.PICKED_UP &&
      row.customer_id &&
      row.payment_status === "paid" &&
      !row.rewards_applied
    ) {
      const points = Math.floor(Number(row.total));
      const rewardResult = await client.query<{ points_balance: number }>(
        `insert into rewards_accounts(customer_id,points_balance,eligible_purchase_count)
         values($1,$2,1) on conflict(customer_id) do update
         set points_balance=rewards_accounts.points_balance+$2,
             eligible_purchase_count=rewards_accounts.eligible_purchase_count+1,updated_at=now()
         returning points_balance`,
        [row.customer_id, points],
      );
      await client.query(
        `insert into loyalty_ledger(
          customer_id,order_id,points_delta,balance_after,reason,changed_by
        ) values($1,$2,$3,$4,'completed_order',$5)
        on conflict(order_id,reason) do nothing`,
        [
          row.customer_id,
          req.params.id,
          points,
          Number(rewardResult.rows[0]?.points_balance || points),
          req.auth?.sub,
        ],
      );
      await client.query("update orders set rewards_applied=true where id=$1", [req.params.id]);
      await client.query("insert into reporting_outbox(topic,entity_id,payload) values('rewards_accounts',$1,'{}'::jsonb)", [row.customer_id]);
    }
    await client.query("insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'change_status','order',$3,$4::jsonb)", [req.auth?.sub,req.auth?.role,req.params.id,JSON.stringify({ from: row.status, reason, to: status })]);
    await client.query("insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)", [req.params.id,JSON.stringify({ status })]);
    return row;
  });
  publish("orders", String(req.params.id));
  publish("notifications", String(req.params.id));
  publish("cashier_order_queue", String(req.params.id));
  publish("kitchen_order_queue", String(req.params.id));
  res.json({ ok: true, orderId: order.id });
}));

app.post("/api/orders/:id/payment", authenticate, requireRoles("owner","manager","cashier"), asyncRoute(async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Payment amount must be greater than zero.");
  const idempotencyKey = nonEmpty(
    req.headers["idempotency-key"] || req.body?.idempotencyKey,
    160,
  );
  await transaction(async (client) => {
    const orderResult = await client.query<Record<string, unknown>>("select * from orders where id=$1 for update", [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) throw new HttpError(404, "Order not found.");
    if (["cancelled", "rejected"].includes(String(order.status))) {
      throw new HttpError(409, "Payments cannot be recorded for a cancelled or rejected order.");
    }
    if (
      ([
        ORDER_STATUS.SUBMITTED,
        ORDER_STATUS.AWAITING_CONFIRMATION,
      ] as OperationalOrderStatus[]).includes(
        normalizeOperationalOrderStatus(order.status),
      )
    ) {
      throw new HttpError(409, "Confirm the order before recording a payment.");
    }
    const duplicate = await client.query<{ id: string }>(
      "select id from payments where order_id=$1 and reference=$2 limit 1",
      [req.params.id, idempotencyKey],
    );
    if (duplicate.rows[0]) return;
    const paidResult = await client.query<{ paid: string }>("select coalesce(sum(amount),0)::text as paid from payments where order_id=$1", [req.params.id]);
    const totalMinor = toMinorUnits(Number(order.total));
    const paidBeforeMinor = toMinorUnits(
      Number(paidResult.rows[0]?.paid || 0),
    );
    const amountMinor = toMinorUnits(amount);
    const remainingMinor = Math.max(0, totalMinor - paidBeforeMinor);
    if (amountMinor > remainingMinor) {
      throw new HttpError(409, "Payment exceeds the remaining order balance.");
    }
    const sequence = await client.query<{ value: string }>("select nextval('payment_number_seq')::text as value");
    const payment = await client.query<{ id: string }>(
      `insert into payments(payment_number,order_id,amount,payment_method,reference,received_by)
       values($1,$2,$3,$4,$5,$6) returning id`,
      [
        `PAY-${String(sequence.rows[0]?.value || "0").padStart(6,"0")}`,
        req.params.id,
        fromMinorUnits(amountMinor),
        nonEmpty(req.body?.paymentMethod, 40),
        idempotencyKey,
        req.auth?.sub,
      ],
    );
    const paymentStatus = derivePaymentStatusMinor(
      totalMinor,
      paidBeforeMinor + amountMinor,
    );
    await client.query("update orders set payment_status=$2 where id=$1", [req.params.id,paymentStatus]);
    await client.query("insert into reporting_outbox(topic,entity_id,payload) values('payments',$1,$2::jsonb)", [payment.rows[0]?.id,JSON.stringify({ amount, paymentStatus })]);
    await client.query("insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)", [req.params.id,JSON.stringify({ paymentStatus })]);
  });
  publish("orders", String(req.params.id));
  publish("cashier_order_queue", String(req.params.id));
  res.json({ ok: true });
}));

app.post("/api/admin/end-day", authenticate, requireRoles("owner", "manager"), asyncRoute(async (req, res) => {
  const businessDate = String(req.body?.businessDate || getCairoBusinessDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new HttpError(400, "Business date must use YYYY-MM-DD.");
  const report = await transaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`joy-corner-end-day:${businessDate}`]);
    const active = await client.query<{ count: string }>(
      `select count(*)::text as count from orders
       where (created_at at time zone 'Africa/Cairo')::date=$1::date
         and status in ('draft','submitted','awaiting_confirmation','confirmed','in_preparation','ready')`,
      [businessDate],
    );
    if (Number(active.rows[0]?.count || 0) > 0) {
      throw new HttpError(409, `${active.rows[0]?.count} order(s) must be picked up, rejected, or cancelled before End Day.`);
    }
    const summary = await client.query<Record<string, unknown>>(
      `select count(*)::int as order_count,
              count(*) filter (where status='picked_up')::int as closed_order_count,
              count(*) filter (where status in ('cancelled','rejected'))::int as cancelled_order_count,
              coalesce(sum(total) filter (where status='picked_up'),0)::numeric(12,2) as gross_sales,
              coalesce((select sum(p.amount) from payments p
                where (p.created_at at time zone 'Africa/Cairo')::date=$1::date),0)::numeric(12,2) as payments_received,
              (select count(*)::int from payments p
                where (p.created_at at time zone 'Africa/Cairo')::date=$1::date) as payment_count,
              coalesce(sum(floor(total)) filter (where status='picked_up' and rewards_applied),0)::int as loyalty_points_issued
       from orders where (created_at at time zone 'Africa/Cairo')::date=$1::date`,
      [businessDate],
    );
    const row = summary.rows[0] || {};
    const bestSeller = await client.query<{ item_name_snapshot: string; quantity: number }>(
      `select oi.item_name_snapshot,sum(oi.quantity)::int as quantity from order_items oi
       join orders o on o.id=oi.order_id
       where (o.created_at at time zone 'Africa/Cairo')::date=$1::date and o.status='picked_up'
       group by oi.item_name_snapshot order by quantity desc,oi.item_name_snapshot limit 1`,
      [businessDate],
    );
    const latestReceipt = await client.query<{ order_number: string }>(
      `select order_number from orders where (created_at at time zone 'Africa/Cairo')::date=$1::date
       order by created_at desc limit 1`, [businessDate],
    );
    const inserted = await client.query<Record<string, unknown>>(
      `insert into end_day_reports(business_date,order_count,closed_order_count,cancelled_order_count,
          gross_sales,payments_received,loyalty_points_issued,performed_by,payment_count,
          best_selling_item,best_selling_qty,latest_receipt_serial)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict(business_date) do update set
          order_count=excluded.order_count,closed_order_count=excluded.closed_order_count,
          cancelled_order_count=excluded.cancelled_order_count,gross_sales=excluded.gross_sales,
          payments_received=excluded.payments_received,loyalty_points_issued=excluded.loyalty_points_issued,
          payment_count=excluded.payment_count,best_selling_item=excluded.best_selling_item,
          best_selling_qty=excluded.best_selling_qty,latest_receipt_serial=excluded.latest_receipt_serial,
          performed_by=excluded.performed_by,performed_at=now()
       returning *`,
      [businessDate,row.order_count || 0,row.closed_order_count || 0,row.cancelled_order_count || 0,
       row.gross_sales || 0,row.payments_received || 0,row.loyalty_points_issued || 0,req.auth?.sub,
       row.payment_count || 0,bestSeller.rows[0]?.item_name_snapshot || null,bestSeller.rows[0]?.quantity || 0,
       latestReceipt.rows[0]?.order_number || null],
    );
    const saved = inserted.rows[0];
    await client.query("insert into reporting_outbox(topic,entity_id,payload) values('end_day_reports',$1,'{}'::jsonb)", [saved?.id]);
    await client.query(
      "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'end_day','end_day_report',$3,$4::jsonb)",
      [req.auth?.sub, req.auth?.role, saved?.id, JSON.stringify({ businessDate })],
    );
    return saved;
  });
  res.json({ report: { ...report, gross_sales: Number(report?.gross_sales), payments_received: Number(report?.payments_received) } });
}));

app.get("/api/owner/menu", authenticate, requireRoles("owner"), asyncRoute(async (_req, res) => {
  res.json({ items: await menuItems(true) });
}));

app.post("/api/owner/menu/items", authenticate, requireRoles("owner"), asyncRoute(async (req, res) => {
  const priceMinor = toMinorUnits(Number(req.body?.price));
  if (priceMinor <= 0) {
    throw new HttpError(400, "The initial price must be greater than zero.");
  }
  const created = await transaction(async (client) => {
    const category = await client.query<{ id: string }>(
      "select id from menu_categories where id=$1 and active=true",
      [nonEmpty(req.body?.categoryId, 160)],
    );
    if (!category.rows[0]) throw new HttpError(400, "Select a valid category.");
    const item = await client.query<{ id: string }>(
      `insert into menu_items(
        category_id,name,description,active,available,availability_status,
        loyalty_eligible,preparation_station,sort_order
      ) values($1,$2,$3,true,true,'available',$4,$5,$6) returning id`,
      [
        category.rows[0].id,
        nonEmpty(req.body?.name, 120),
        String(req.body?.description || "").trim().slice(0, 1000),
        Boolean(req.body?.loyaltyEligible ?? true),
        req.body?.preparationStation === "kitchen" ? "kitchen" : "barista",
        Number.isInteger(Number(req.body?.sortOrder))
          ? Math.max(0, Number(req.body.sortOrder))
          : 0,
      ],
    );
    await client.query(
      `insert into menu_item_sizes(menu_item_id,size_name,price,sort_order)
       values($1,$2,$3,0)`,
      [
        item.rows[0]?.id,
        String(req.body?.sizeName || "Regular").trim().slice(0, 80) ||
          "Regular",
        fromMinorUnits(priceMinor),
      ],
    );
    await client.query(
      `insert into audit_logs(
        actor_id,actor_role,action,entity_type,entity_id,details
      ) values($1,$2,'create_product','menu_item',$3,'{}'::jsonb)`,
      [req.auth?.sub, req.auth?.role, item.rows[0]?.id],
    );
    return item.rows[0];
  });
  publish("menu", String(created?.id));
  res.status(201).json({ itemId: created?.id });
}));

app.patch("/api/owner/menu/items/:id", authenticate, requireRoles("owner"), asyncRoute(async (req, res) => {
  const allowedAvailability = new Set([
    "available",
    "temporarily_unavailable",
    "sold_out",
    "archived",
  ]);
  const availabilityStatus = String(
    req.body?.availabilityStatus ||
      (req.body?.available ? "available" : "temporarily_unavailable"),
  );
  if (!allowedAvailability.has(availabilityStatus)) {
    throw new HttpError(400, "Product availability is invalid.");
  }
  await transaction(async (client) => {
    await client.query(
      `update menu_items set
        name=$2,description=$3,category_id=$4,sort_order=$5,
        active=$6,available=$7,availability_status=$8,
        loyalty_eligible=$9,preparation_station=$10
       where id=$1`,
      [
        req.params.id,
        nonEmpty(req.body?.name),
        String(req.body?.description || "").trim().slice(0, 1000),
        nonEmpty(req.body?.categoryId, 160),
        Math.max(0, Number(req.body?.sortOrder) || 0),
        availabilityStatus !== "archived" && Boolean(req.body?.active),
        availabilityStatus === "available",
        availabilityStatus,
        Boolean(req.body?.loyaltyEligible),
        req.body?.preparationStation === "kitchen" ? "kitchen" : "barista",
      ],
    );
    await client.query(
      `insert into audit_logs(
        actor_id,actor_role,action,entity_type,entity_id,details
      ) values($1,$2,'update_product','menu_item',$3,$4::jsonb)`,
      [
        req.auth?.sub,
        req.auth?.role,
        req.params.id,
        JSON.stringify({ availabilityStatus }),
      ],
    );
  });
  publish("menu", String(req.params.id));
  res.json({ ok: true });
}));

app.patch("/api/owner/menu/sizes/:id", authenticate, requireRoles("owner"), asyncRoute(async (req, res) => {
  const price = Number(req.body?.price);
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Price must be greater than zero.");
  const changed = await transaction(async (client) => {
    const current = await client.query<{
      menu_item_id: string;
      price: string;
    }>(
      "select menu_item_id,price::text from menu_item_sizes where id=$1 for update",
      [req.params.id],
    );
    const size = current.rows[0];
    if (!size) throw new HttpError(404, "Product size not found.");
    const previousPriceMinor = toMinorUnits(Number(size.price));
    const newPriceMinor = toMinorUnits(price);
    if (previousPriceMinor === newPriceMinor) {
      return { itemId: size.menu_item_id, updated: false };
    }
    await client.query(
      "update menu_item_sizes set price=$2 where id=$1",
      [req.params.id, fromMinorUnits(newPriceMinor)],
    );
    await client.query(
      `insert into menu_price_history(
        menu_item_id,size_id,previous_price_minor,new_price_minor,changed_by
      ) values($1,$2,$3,$4,$5)`,
      [
        size.menu_item_id,
        req.params.id,
        previousPriceMinor,
        newPriceMinor,
        req.auth?.sub,
      ],
    );
    await client.query(
      `insert into audit_logs(
        actor_id,actor_role,action,entity_type,entity_id,details
      ) values($1,$2,'change_price','menu_item_size',$3,$4::jsonb)`,
      [
        req.auth?.sub,
        req.auth?.role,
        req.params.id,
        JSON.stringify({ newPriceMinor, previousPriceMinor }),
      ],
    );
    return { itemId: size.menu_item_id, updated: true };
  });
  if (changed.updated) publish("menu", changed.itemId);
  res.json({ ok: true });
}));

app.put("/api/owner/menu/items/:id/image", authenticate, requireRoles("owner"), asyncRoute(async (req, res) => {
  const stored = await storeMenuImage(
    String(req.params.id),
    String(req.body?.dataUrl || ""),
  ).catch((error) => {
    throw new HttpError(
      error instanceof Error && error.message.includes("5 MB") ? 413 : 400,
      error instanceof Error ? error.message : "The image upload failed.",
    );
  });
  await query(
    `update menu_items set
      image_url=$2,image_provider=$3,image_public_id=$4,
      image_content_type=null,image_bytes=null
     where id=$1`,
    [req.params.id, stored.url, stored.provider, stored.publicId],
  );
  publish("menu", String(req.params.id));
  res.json({ imageUrl: stored.url });
}));

app.delete("/api/owner/menu/items/:id/image", authenticate, requireRoles("owner"), asyncRoute(async (req, res) => {
  const rows = await query<{ image_public_id: string | null }>(
    "select image_public_id from menu_items where id=$1",
    [req.params.id],
  );
  if (!rows[0]) throw new HttpError(404, "Product not found.");
  if (rows[0].image_public_id) {
    await removeMenuImage(rows[0].image_public_id);
  }
  await query(
    `update menu_items set
      image_url=null,image_provider=null,image_public_id=null,
      image_content_type=null,image_bytes=null
     where id=$1`,
    [req.params.id],
  );
  publish("menu", String(req.params.id));
  res.json({ ok: true });
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Request failed", message);
  res.status(500).json({ error: isProduction ? "The server could not complete the request." : message });
});

async function seedStaffAccounts(): Promise<void> {
  const staff = [
    { email: "owner@joycorner.com", envKey: "SEED_OWNER_PASSWORD", role: "owner" as const, fullName: "Owner" },
    { email: "cashier@joycorner.com", envKey: "SEED_CASHIER_PASSWORD", role: "cashier" as const, fullName: "Cashier" },
    { email: "waiter@joycorner.com", envKey: "SEED_WAITER_PASSWORD", role: "waiter" as const, fullName: "Waiter" },
    { email: "barista@joycorner.com", envKey: "SEED_BARISTA_PASSWORD", role: "barista" as const, fullName: "Barista" },
  ];
  for (const { email, envKey, role, fullName } of staff) {
    const password = process.env[envKey];
    if (!password) {
      console.warn(`Skipping seed for ${email}: ${envKey} is not set.`);
      continue;
    }
    const existing = await query<{ id: string }>(
      "select id from accounts where email=$1 limit 1",
      [email],
    );
    if (existing[0]) continue;
    const passwordHash = await hashPassword(password);
    await query(
      `insert into accounts(email,password_hash,full_name,role)
       values($1,$2,$3,$4)
       on conflict(email) do nothing`,
      [email, passwordHash, fullName, role],
    );
    console.log(`Seeded staff account: ${email}`);
  }
}

async function start(): Promise<void> {
  await applyNeonMigrations();
  await seedStaffAccounts();
  const server = app.listen(port, "0.0.0.0", () => console.log(`Joy Corner API listening on ${port}`));
  const shutdown = () => {
    server.close(() => void closeNeonPool().finally(() => process.exit(0)));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.env.NODE_ENV !== "test") {
  void start().catch((error) => {
    console.error("API startup failed", error);
    process.exitCode = 1;
  });
}

export { app, hashPassword, passwordMatches, signToken, verifyToken };
