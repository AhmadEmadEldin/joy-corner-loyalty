import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import dotenv from "dotenv";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { PoolClient } from "pg";
import { getCairoBusinessDate } from "./cairoDate";
import { isValidEmail, normalizePhone } from "./validators";
import {
  applyNeonMigrations,
  closeNeonPool,
  neonHealth,
  query,
  transaction,
} from "./neon";
import {
  getMenuSyncResult,
  clearMenuSyncCache,
  menuSyncCacheInfo,
} from "./menuSync";

dotenv.config({ path: [".env.local", ".env"] });

type Role = "owner" | "manager" | "cashier" | "waiter" | "barista" | "customer";
type Claims = {
  email: string;
  exp: number;
  full_name: string;
  iat: number;
  role: Role;
  sub: string;
};
type AuthedRequest = Request & { auth?: Claims };
type OrderItemInput = {
  modifierIds?: string[];
  notes?: string;
  quantity?: number;
  sizeId?: string;
};

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
  throw new Error(
    "JWT_SECRET must contain at least 32 characters in production.",
  );
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin?.replace(/\/$/, "");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Idempotency-Key",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    );
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
  handler: (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
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
  const decodedHeader = JSON.parse(
    Buffer.from(header, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT")
    throw new Error("Invalid session.");
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
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as Claims;
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
  const part = String(req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(encoded));
  return part ? decodeURIComponent(part.slice(encoded.length)) : "";
}

function requestToken(req: Request): string {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ")
    ? value.slice(7)
    : cookieValue(req, sessionCookieName);
}

function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
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
      res
        .status(403)
        .json({ error: "You do not have permission for this action." });
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

async function passwordMatches(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(saltValue, "base64url"),
    expected.length,
  )) as Buffer;
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
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
    res
      .status(429)
      .json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }
  next();
}

function nonEmpty(value: unknown, max = 200): string {
  const result = String(value || "").trim();
  if (!result || result.length > max)
    throw new HttpError(400, "Required information is missing or too long.");
  return result;
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

app.get(
  "/health",
  asyncRoute(async (_req, res) => {
    res.status(200).json({ ok: true, service: "joy-corner-api" });
  }),
);

app.get(
  "/ready",
  asyncRoute(async (_req, res) => {
    const checks: Record<
      string,
      { ok: boolean; latencyMs?: number; error?: string }
    > = {};
    try {
      const db = await neonHealth();
      checks.database = db;
    } catch (error) {
      checks.database = {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown database error",
      };
    }
    const hasJwtSecret = Boolean(jwtSecret && jwtSecret.length >= 16);
    checks.config = { ok: hasJwtSecret };
    const allOk = Object.values(checks).every((check) => check.ok);
    res.status(allOk ? 200 : 503).json({ ok: allOk, checks });
  }),
);

app.post(
  "/api/auth/signup",
  loginRateLimit,
  asyncRoute(async (req, res) => {
    const email = nonEmpty(req.body?.email).toLowerCase();
    const fullName = nonEmpty(req.body?.fullName);
    const phone = normalizePhone(nonEmpty(req.body?.phone, 30));
    const password = String(req.body?.password || "");
    const marketingConsent = req.body?.marketingConsent === true;
    if (email.endsWith("@joycorner.com"))
      throw new HttpError(
        403,
        "Staff accounts cannot be created through signup.",
      );
    if (!isValidEmail(email))
      throw new HttpError(400, "Enter a valid email address.");
    if (!phone) throw new HttpError(400, "Enter a valid phone number.");
    if (password.length < 8 || password.length > 200)
      throw new HttpError(400, "Password must be at least 8 characters.");
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
        if (
          isProduction &&
          process.env.ALLOW_MIGRATED_ACCOUNT_CLAIM !== "true"
        ) {
          throw new HttpError(
            409,
            "This imported account needs an administrator password reset.",
          );
        }
        const claimed = await query<Record<string, unknown>>(
          `update accounts set password_hash=$2,full_name=$3,phone=$4
         where id=$1 returning *`,
          [existingEmail[0].id, passwordHash, fullName, phone],
        );
        await query(
          "insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)",
          [claimed[0]?.id],
        );
        res
          .status(200)
          .json(sessionResponse(claimed[0] as Record<string, unknown>, res));
        return;
      }
      throw new HttpError(409, "An account already exists for this email.");
    }
    const existingPhone = await query<Record<string, unknown>>(
      "select * from accounts where phone=$1 and role='customer' limit 1",
      [phone],
    );
    if (existingPhone[0]) {
      throw new HttpError(
        409,
        "A customer account already exists with this phone number.",
      );
    }
    const rows = await query<Record<string, unknown>>(
      `insert into accounts(email,password_hash,full_name,phone,role,customer_number,marketing_consent,marketing_consent_at)
     values($1,$2,$3,$4,'customer','JC-' || lpad(nextval('customer_number_seq')::text,6,'0'),$5,$6)
     on conflict(email) do nothing returning *`,
      [
        email,
        passwordHash,
        fullName,
        phone,
        marketingConsent,
        marketingConsent ? new Date().toISOString() : null,
      ],
    );
    if (!rows[0])
      throw new HttpError(409, "An account already exists for this email.");
    await query(
      "insert into rewards_accounts(customer_id) values($1) on conflict do nothing",
      [rows[0].id],
    );
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)",
      [rows[0].id],
    );
    res.status(201).json(sessionResponse(rows[0], res));
  }),
);

app.post(
  "/api/auth/login",
  loginRateLimit,
  asyncRoute(async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const rows = await query<Record<string, unknown>>(
      "select * from accounts where email=$1 and active=true limit 1",
      [email],
    );
    if (
      !rows[0] ||
      !(await passwordMatches(password, String(rows[0].password_hash)))
    ) {
      throw new HttpError(401, "Email or password is incorrect.");
    }
    loginAttempts.delete(req.ip || "unknown");
    res.json(sessionResponse(rows[0], res));
  }),
);

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get(
  "/api/auth/me",
  authenticate,
  asyncRoute(async (req, res) => {
    const rows = await query<Record<string, unknown>>(
      "select id,email,full_name,role from accounts where id=$1 and active=true",
      [req.auth?.sub],
    );
    if (!rows[0]) throw new HttpError(401, "Account is no longer active.");
    res.json({ user: { ...rows[0], id: String(rows[0].id) } });
  }),
);

app.get("/api/events", authenticate, (req: AuthedRequest, res) => {
  const requested = new Set(
    String(req.query.topics || "")
      .split(",")
      .filter(Boolean),
  );
  const allowed = new Set<string>();
  const role = req.auth?.role;
  if (role === "customer") {
    ["orders", "rewards_accounts", "vouchers", "notifications", "menu"].forEach(
      (topic) => {
        if (requested.has(topic)) allowed.add(topic);
      },
    );
  } else if (role) {
    if (
      ["owner", "manager", "cashier"].includes(role) &&
      requested.has("cashier_order_queue")
    )
      allowed.add("cashier_order_queue");
    if (
      ["owner", "manager", "barista"].includes(role) &&
      requested.has("kitchen_order_queue")
    )
      allowed.add("kitchen_order_queue");
    if (["owner", "manager"].includes(role) && requested.has("orders"))
      allowed.add("orders");
    if (["owner", "manager"].includes(role) && requested.has("notifications"))
      allowed.add("notifications");
    if (requested.has("menu")) allowed.add("menu");
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
              i.availability_state,i.loyalty_eligible,i.preparation_station,i.sort_order,
              c.name as category,
              case when i.image_bytes is null then null else '/api/menu/images/' || i.id::text end as image_url
       from menu_items i join menu_categories c on c.id=i.category_id
       where ($1::boolean or (i.active and i.available and c.active))
       order by c.sort_order,i.sort_order,i.name`,
      [includeInactive],
    ),
    query<Record<string, unknown>>(
      "select id,menu_item_id,size_name,price from menu_item_sizes order by sort_order,size_name",
    ),
    query<Record<string, unknown>>(
      "select id,name,price from menu_modifiers where active=true order by name",
    ),
    query<Record<string, unknown>>(
      "select menu_item_id,modifier_id from menu_item_modifiers",
    ),
  ]);
  const sizesByItem = new Map<string, Record<string, unknown>[]>();
  sizes.forEach((size) => {
    const key = String(size.menu_item_id);
    const list = sizesByItem.get(key) || [];
    list.push({
      id: String(size.id),
      price: Number(size.price),
      size_name: String(size.size_name),
    });
    sizesByItem.set(key, list);
  });
  const modifierById = new Map(
    modifiers.map((modifier) => [
      String(modifier.id),
      {
        id: String(modifier.id),
        name: String(modifier.name),
        price: Number(modifier.price),
      },
    ]),
  );
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
    available: Boolean(item.available),
    availability_state: String(item.availability_state || "available"),
    id: String(item.id),
    category_id: String(item.category_id),
    loyalty_eligible: Boolean(item.loyalty_eligible),
    sort_order: Number(item.sort_order),
    sizes: sizesByItem.get(String(item.id)) || [],
    modifiers: modifiersByItem.get(String(item.id)) || [],
  }));
}

app.get(
  "/api/menu",
  asyncRoute(async (_req, res) => res.json({ items: await menuItems(false) })),
);
app.get(
  "/api/menu/images/:itemId",
  asyncRoute(async (req, res) => {
    const rows = await query<{
      image_bytes: Buffer;
      image_content_type: string;
    }>(
      "select image_bytes,image_content_type from menu_items where id=$1 and image_bytes is not null",
      [req.params.itemId],
    );
    if (!rows[0]) throw new HttpError(404, "Image not found.");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type(rows[0].image_content_type).send(rows[0].image_bytes);
  }),
);

app.get(
  "/api/customer/profile",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const rows = await query<Record<string, unknown>>(
      `select id,customer_number,full_name,email,phone,date_of_birth,favorite_drink,
            marketing_consent,
            marketing_consent_at as "marketing_consent_at"
     from accounts where id=$1`,
      [req.auth?.sub],
    );
    res.json({ profile: rows[0] });
  }),
);

app.patch(
  "/api/customer/profile",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const fullName = nonEmpty(req.body?.fullName);
    const phone = normalizePhone(nonEmpty(req.body?.phone, 30));
    if (!phone) throw new HttpError(400, "Enter a valid phone number.");
    const dateOfBirth = req.body?.dateOfBirth
      ? String(req.body.dateOfBirth)
      : null;
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      throw new HttpError(400, "Date of birth must be in YYYY-MM-DD format.");
    }
    const marketingConsent = req.body?.marketingConsent === true;
    await query(
      `update accounts set full_name=$2,phone=$3,date_of_birth=$4,favorite_drink=$5,
            marketing_consent=$6,marketing_consent_at=case when $6 and marketing_consent_at is null then now() when $6 then marketing_consent_at else null end
     where id=$1`,
      [
        req.auth?.sub,
        fullName,
        phone,
        dateOfBirth,
        String(req.body?.favoriteDrink || "").trim() || null,
        marketingConsent,
      ],
    );
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)",
      [req.auth?.sub],
    );
    res.json({ ok: true });
  }),
);

app.get(
  "/api/customer/dashboard",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const userId = req.auth?.sub;
    const [
      orders,
      orderItems,
      orderModifiers,
      rewards,
      vouchers,
      notifications,
    ] = await Promise.all([
      query<Record<string, unknown>>(
        `select o.*,
              coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false)),0) as paid_amount,
              greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false)),0),0) as remaining_amount
       from orders o where o.customer_id=$1 order by o.created_at desc limit 100`,
        [userId],
      ),
      query<Record<string, unknown>>(
        `select oi.* from order_items oi join orders o on o.id=oi.order_id where o.customer_id=$1 order by oi.created_at`,
        [userId],
      ),
      query<Record<string, unknown>>(
        `select om.* from order_item_modifiers om join order_items oi on oi.id=om.order_item_id join orders o on o.id=oi.order_id where o.customer_id=$1 order by om.created_at`,
        [userId],
      ),
      query<Record<string, unknown>>(
        "select points_balance,eligible_purchase_count,free_rewards_available from rewards_accounts where customer_id=$1",
        [userId],
      ),
      query<Record<string, unknown>>(
        "select id,voucher_code,voucher_type,fixed_value,percentage_value,free_item_id,status,expires_at from vouchers where customer_id=$1 order by issued_at desc",
        [userId],
      ),
      query<Record<string, unknown>>(
        "select id,type,title,message,read,related_order_id,created_at from notifications where user_id=$1 order by created_at desc limit 50",
        [userId],
      ),
    ]);
    const numericOrderFields = [
      "subtotal",
      "discount_total",
      "voucher_discount",
      "tax_total",
      "total",
      "paid_amount",
      "remaining_amount",
    ];
    res.json({
      notifications,
      orderItems: orderItems.map((row) => ({
        ...row,
        unit_price: Number(row.unit_price),
        modifiers_total: Number(row.modifiers_total),
        total_price: Number(row.total_price),
      })),
      orderModifiers: orderModifiers.map((row) => ({
        ...row,
        unit_price: Number(row.unit_price),
        total_price: Number(row.total_price),
      })),
      orders: orders.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            numericOrderFields.includes(key) ? Number(value) : value,
          ]),
        ),
      ),
      rewards: rewards[0] || null,
      vouchers,
    });
  }),
);

app.post(
  "/api/customer/notifications/:id/read",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    await query(
      "update notifications set read=true where id=$1 and user_id=$2",
      [req.params.id, req.auth?.sub],
    );
    res.json({ ok: true });
  }),
);

async function createOrder(
  client: PoolClient,
  actor: Claims,
  input: {
    customerId: string | null;
    customerNotes: string;
    idempotencyKey: string;
    items: OrderItemInput[];
    paidAmount?: number;
    paymentMethod: string;
    pickupName: string;
    guestPhone?: string;
    voucherCode?: string;
  },
) {
  const existing = await client.query<{ id: string; order_number: string }>(
    "select id,order_number from orders where idempotency_key=$1",
    [input.idempotencyKey],
  );
  if (existing.rows[0])
    return {
      orderId: existing.rows[0].id,
      orderNumber: existing.rows[0].order_number,
    };
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 30
  )
    throw new HttpError(400, "Add at least one menu item.");
  const sizeIds = input.items.map((item) => String(item.sizeId || ""));
  const sizes = await client.query<Record<string, unknown>>(
    `select s.id,s.menu_item_id,s.size_name,s.price,i.name,i.loyalty_eligible,c.name as category
     from menu_item_sizes s join menu_items i on i.id=s.menu_item_id
     join menu_categories c on c.id=i.category_id
     where s.id=any($1::uuid[]) and i.active and i.available and c.active`,
    [sizeIds],
  );
  const sizeById = new Map(sizes.rows.map((row) => [String(row.id), row]));
  if (sizeById.size !== new Set(sizeIds).size)
    throw new HttpError(409, "One or more menu items are no longer available.");
  const modifierIds = [
    ...new Set(input.items.flatMap((item) => item.modifierIds || [])),
  ];
  const modifiers = modifierIds.length
    ? await client.query<Record<string, unknown>>(
        `select m.id,m.name,m.price,l.menu_item_id from menu_modifiers m
         join menu_item_modifiers l on l.modifier_id=m.id
         where m.id=any($1::uuid[]) and m.active`,
        [modifierIds],
      )
    : { rows: [] as Record<string, unknown>[] };
  const modifierByItemAndId = new Map(
    modifiers.rows.map((row) => [`${row.menu_item_id}:${row.id}`, row]),
  );
  let subtotal = 0;
  const prepared = input.items.map((item) => {
    const size = sizeById.get(String(item.sizeId));
    if (!size) throw new HttpError(409, "A selected size is unavailable.");
    const quantity = Number(item.quantity || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
      throw new HttpError(400, "Item quantity is invalid.");
    if (!Array.isArray(item.modifierIds) || item.modifierIds.length > 10) {
      throw new HttpError(400, "Too many options were selected for one item.");
    }
    const selectedModifiers = [...new Set(item.modifierIds)].map((id) => {
      const modifier = modifierByItemAndId.get(`${size.menu_item_id}:${id}`);
      if (!modifier)
        throw new HttpError(
          409,
          "A selected option is unavailable for this item.",
        );
      return modifier;
    });
    const modifiersTotal = selectedModifiers.reduce(
      (sum, row) => sum + Number(row.price),
      0,
    );
    const totalPrice = (Number(size.price) + modifiersTotal) * quantity;
    subtotal += totalPrice;
    return {
      item,
      modifiersTotal,
      quantity,
      selectedModifiers,
      size,
      totalPrice,
    };
  });
  let voucherDiscount = 0;
  if (input.voucherCode) {
    const voucherResult = await client.query<Record<string, unknown>>(
      `select * from vouchers where voucher_code=$1 and customer_id=$2 and status='active'
       and (expires_at is null or expires_at > now()) for update`,
      [input.voucherCode.trim(), input.customerId],
    );
    const voucher = voucherResult.rows[0];
    if (!voucher) throw new HttpError(400, "Voucher is invalid or expired.");
    if (voucher.fixed_value != null)
      voucherDiscount = Math.min(subtotal, Number(voucher.fixed_value));
    else if (voucher.percentage_value != null)
      voucherDiscount = Math.min(
        subtotal,
        (subtotal * Number(voucher.percentage_value)) / 100,
      );
    await client.query("update vouchers set status='redeemed' where id=$1", [
      voucher.id,
    ]);
  }
  const total = Math.max(0, subtotal - voucherDiscount);
  const tenderedAmount = Number(input.paidAmount || 0);
  if (!Number.isFinite(tenderedAmount) || tenderedAmount < 0)
    throw new HttpError(400, "Paid amount cannot be negative.");
  if (
    input.paymentMethod !== "cash_at_cashier" &&
    tenderedAmount > total + 0.01
  )
    throw new HttpError(409, "Non-cash payment exceeds the order total.");
  const paidAmount = Math.min(tenderedAmount, total);
  const changeDue =
    Math.max(0, Math.round((tenderedAmount - total) * 100)) / 100;
  const sequence = await client.query<{ value: string }>(
    "select nextval('order_number_seq')::text as value",
  );
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const orderNumber = `JC-${date}-${String(sequence.rows[0]?.value || "0").padStart(4, "0")}`;
  const orderResult = await client.query<{ id: string }>(
    `insert into orders(order_number,idempotency_key,customer_id,created_by,pickup_name,guest_phone,customer_notes,payment_method,subtotal,voucher_discount,total)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [
      orderNumber,
      input.idempotencyKey,
      input.customerId,
      actor.sub,
      input.pickupName,
      input.customerId ? null : input.guestPhone || null,
      input.customerNotes,
      input.paymentMethod,
      subtotal,
      voucherDiscount,
      total,
    ],
  );
  const orderId = orderResult.rows[0]?.id;
  if (!orderId) throw new Error("Order was not created.");
  for (const line of prepared) {
    const itemResult = await client.query<{ id: string }>(
      `insert into order_items(order_id,menu_item_id,item_name_snapshot,category_name_snapshot,size_name,quantity,unit_price,modifiers_total,total_price,customer_notes)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        orderId,
        line.size.menu_item_id,
        line.size.name,
        line.size.category,
        line.size.size_name,
        line.quantity,
        line.size.price,
        line.modifiersTotal,
        line.totalPrice,
        String(line.item.notes || "")
          .trim()
          .slice(0, 500),
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
          modifier.price,
          line.quantity,
          Number(modifier.price) * line.quantity,
        ],
      );
    }
  }
  if (paidAmount > 0) {
    const paymentSequence = await client.query<{ value: string }>(
      "select nextval('payment_number_seq')::text as value",
    );
    const paymentResult = await client.query<{ id: string }>(
      `insert into payments(payment_number,order_id,amount,payment_method,reference,received_by)
       values($1,$2,$3,$4,$5,$6) returning id`,
      [
        `PAY-${String(paymentSequence.rows[0]?.value || "0").padStart(6, "0")}`,
        orderId,
        paidAmount,
        input.paymentMethod,
        changeDue > 0
          ? `Cash received: EGP ${tenderedAmount.toFixed(2)}; change returned: EGP ${changeDue.toFixed(2)}`
          : "Payment recorded when the branch order was created",
        actor.sub,
      ],
    );
    const paymentStatus =
      paidAmount >= total - 0.01 ? "paid" : "partially_paid";
    await client.query("update orders set payment_status=$2 where id=$1", [
      orderId,
      paymentStatus,
    ]);
    await client.query(
      "insert into reporting_outbox(topic,entity_id,payload) values('payments',$1,$2::jsonb)",
      [
        paymentResult.rows[0]?.id,
        JSON.stringify({ amount: paidAmount, paymentStatus }),
      ],
    );
  }
  if (input.customerId) {
    await client.query(
      `insert into notifications(user_id,type,title,message,related_order_id)
       values($1,'order','Order received',$2,$3)`,
      [
        input.customerId,
        `Your order ${orderNumber} is waiting for confirmation.`,
        orderId,
      ],
    );
  }
  await client.query(
    "insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)",
    [orderId, JSON.stringify({ orderId, orderNumber })],
  );
  return { changeDue, orderId, orderNumber, tenderedAmount };
}

app.post(
  "/api/orders/customer",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const result = await transaction((client) =>
      createOrder(client, req.auth as Claims, {
        customerId: req.auth?.sub || null,
        customerNotes: String(req.body?.customerNotes || "")
          .trim()
          .slice(0, 1000),
        idempotencyKey: nonEmpty(req.body?.idempotencyKey),
        items: req.body?.items as OrderItemInput[],
        paymentMethod: nonEmpty(req.body?.paymentMethod, 40),
        pickupName: req.auth?.full_name || "Customer",
        voucherCode: String(req.body?.voucherCode || "").trim() || undefined,
      }),
    );
    publish("orders", result.orderId);
    publish("cashier_order_queue", result.orderId);
    res.status(201).json(result);
  }),
);

app.post(
  "/api/orders/staff",
  authenticate,
  requireRoles("owner", "manager", "cashier", "waiter"),
  asyncRoute(async (req, res) => {
    const allowedOrderPlaces = new Set([
      "dine_in",
      "takeaway",
      "car",
      "outside",
      "delivery",
    ]);
    const orderPlace = String(req.body?.orderPlace || "takeaway");
    if (!allowedOrderPlaces.has(orderPlace))
      throw new HttpError(400, "Select a valid order place.");
    const requestedPaidAmount = Number(req.body?.paidAmount || 0);
    const canReceivePayment = ["owner", "manager", "cashier"].includes(
      String(req.auth?.role || ""),
    );
    if (!canReceivePayment && requestedPaidAmount > 0)
      throw new HttpError(403, "Only cashier staff can record a payment.");
    const customerNotes = String(req.body?.customerNotes || "")
      .trim()
      .slice(0, 900);
    const carType = String(req.body?.carType || "")
      .split("[")
      .join(" ")
      .split("]")
      .join(" ")
      .replace(/[\r\n]/g, " ")
      .trim()
      .slice(0, 60);
    const carColor = String(req.body?.carColor || "")
      .split("[")
      .join(" ")
      .split("]")
      .join(" ")
      .replace(/[\r\n]/g, " ")
      .trim()
      .slice(0, 40);
    if (orderPlace === "car" && (!carType || !carColor))
      throw new HttpError(400, "Enter the car type and color.");
    const carDetails =
      orderPlace === "car"
        ? `\n[Car type: ${carType}]\n[Car color: ${carColor}]`
        : "";
    const customerId = String(req.body?.customerId || "") || null;
    const guestPhone = customerId
      ? undefined
      : normalizePhone(String(req.body?.customerPhone || "")) || undefined;
    const result = await transaction((client) =>
      createOrder(client, req.auth as Claims, {
        customerId,
        customerNotes: `[Order place: ${orderPlace}]${carDetails}${customerNotes ? `\n${customerNotes}` : ""}`,
        guestPhone,
        idempotencyKey: crypto.randomUUID(),
        items: req.body?.items as OrderItemInput[],
        paidAmount: canReceivePayment ? requestedPaidAmount : 0,
        paymentMethod: nonEmpty(req.body?.paymentMethod, 40),
        pickupName:
          String(req.body?.pickupName || "").trim().slice(0, 120) ||
          "Walk-in customer",
      }),
    );
    publish("cashier_order_queue", result.orderId);
    res.status(201).json(result);
  }),
);

async function queueRows(where: string, values: unknown[]) {
  const rows = await query<Record<string, unknown>>(
    `select o.id as order_id,o.order_number,o.pickup_name,o.status,o.confirmation_status,
            o.payment_status,o.payment_method,o.subtotal,o.discount_total,o.voucher_discount,o.tax_total,o.total,
            coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false)),0) as paid_amount,
            greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false)),0),0) as remaining_amount,
            o.customer_notes,o.created_at,o.created_at as order_time,
            a.full_name as customer_name,coalesce(a.phone,o.guest_phone) as customer_phone,
            coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'itemName',oi.item_name_snapshot,'quantity',oi.quantity,'size',oi.size_name,
              'unitPrice',oi.unit_price,'totalPrice',oi.total_price)
              order by oi.created_at) filter (where oi.id is not null),'[]'::jsonb) as item_summary
     from orders o
     left join accounts a on a.id=o.customer_id
     left join order_items oi on oi.order_id=o.id
     where ${where} group by o.id,a.id order by o.created_at`,
    values,
  );
  const numericFields = [
    "subtotal",
    "discount_total",
    "voucher_discount",
    "tax_total",
    "total",
    "paid_amount",
    "remaining_amount",
  ];
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        numericFields.includes(key) ? Number(value) : value,
      ]),
    ),
  );
}

app.get(
  "/api/staff/queues",
  authenticate,
  requireRoles("owner", "manager", "cashier", "barista", "waiter"),
  asyncRoute(async (req, res) => {
    const role = req.auth?.role;
    const canCashier = role
      ? ["owner", "manager", "cashier", "waiter"].includes(role)
      : false;
    const canKitchen = role
      ? ["owner", "manager", "barista"].includes(role)
      : false;
    const [cashier, kitchen] = await Promise.all([
      canCashier
        ? queueRows(
            `coalesce(nullif(o.business_date,'')::date,(o.created_at at time zone 'Africa/Cairo')::date)=$1::date
             and o.status != 'closed'`,
            [getCairoBusinessDate()],
          )
        : [],
      canKitchen
        ? queueRows(
            `coalesce(nullif(o.business_date,'')::date,(o.created_at at time zone 'Africa/Cairo')::date)=$1::date
             and o.status in ('confirmed','accepted','preparing','ready','picked_up','cancelled','rejected')`,
            [getCairoBusinessDate()],
          )
        : [],
    ]);
    res.json({ cashier, kitchen });
  }),
);

app.get(
  "/api/staff/customers",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (_req, res) => {
    const rows = await query<Record<string, unknown>>(
      `select a.id,a.full_name as "fullName",a.email,a.phone,a.customer_number as "customerNumber",
            a.marketing_consent as "marketingConsent",
            a.marketing_consent_at as "marketingConsentAt",
            a.created_at as "createdAt",
            coalesce(s.order_count,0)::int as "orderCount",
            coalesce(s.total_spend,0)::numeric as "totalSpend",
            coalesce(s.outstanding_balance,0)::numeric as "outstandingBalance",
            s.last_order_at as "lastOrderAt",
            (select o2.customer_notes from orders o2 where o2.customer_id=a.id
              and o2.customer_notes like '%[Car type:%' order by o2.created_at desc limit 1) as "lastOrderNotes",
            coalesce(r.points_balance,0)::int as "loyaltyPoints",
            coalesce(r.free_rewards_available,0)::int as "freeRewards"
     from accounts a
     left join lateral (
       select count(*) filter (where o.status not in ('cancelled','rejected'))::int as order_count,
              coalesce(sum((select coalesce(sum(p.amount),0) from payments p
                where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false))),0)::numeric as total_spend,
              coalesce(sum(greatest(o.total-(select coalesce(sum(p.amount),0) from payments p
                where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false)),0))
                filter (where o.status not in ('cancelled','rejected')),0)::numeric as outstanding_balance,
              max(o.created_at) as last_order_at
       from orders o where o.customer_id=a.id
     ) s on true
     left join rewards_accounts r on r.customer_id=a.id
     where a.role='customer' and a.active=true order by a.full_name`,
    );
    res.json({ customers: rows });
  }),
);

app.get(
  "/api/staff/customers/search",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (req, res) => {
    const raw = String(req.query.phone || "");
    const phone = normalizePhone(raw);
    if (!phone) throw new HttpError(400, "Enter a valid phone number.");
    const rows = await query<Record<string, unknown>>(
      `select a.id,a.full_name as "fullName",a.email,a.phone,a.customer_number as "customerNumber",
              coalesce(s.order_count,0)::int as "orderCount",
              coalesce(s.total_spend,0)::numeric as "totalSpend",
              coalesce(s.outstanding_balance,0)::numeric as "outstandingBalance",
              s.last_order_at as "lastOrderAt",
              (select o2.customer_notes from orders o2 where o2.customer_id=a.id
                and o2.customer_notes like '%[Car type:%' order by o2.created_at desc limit 1) as "lastOrderNotes",
              coalesce(r.points_balance,0)::int as "loyaltyPoints",
              coalesce(r.free_rewards_available,0)::int as "freeRewards"
       from accounts a
       left join lateral (
         select count(*) filter (where o.status not in ('cancelled','rejected'))::int as order_count,
                coalesce(sum((select coalesce(sum(p.amount),0) from payments p
                  where p.order_id=o.id and not p.is_refund and not p.voided)),0)::numeric as total_spend,
                coalesce(sum(greatest(o.total-(select coalesce(sum(p.amount),0) from payments p
                  where p.order_id=o.id and not coalesce(p.is_refund,false) and not coalesce(p.voided,false)),0))
                  filter (where o.status not in ('cancelled','rejected')),0)::numeric as outstanding_balance,
                max(o.created_at) filter (where o.status not in ('cancelled','rejected')) as last_order_at
         from orders o where o.customer_id=a.id
       ) s on true
       left join rewards_accounts r on r.customer_id=a.id
       where a.phone=$1 and a.role='customer' and a.active=true limit 1`,
      [phone],
    );
    res.json({ customer: rows[0] || null });
  }),
);

app.post(
  "/api/staff/customers",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (req, res) => {
    const fullName = nonEmpty(req.body?.fullName);
    const phone = normalizePhone(nonEmpty(req.body?.phone, 30));
    if (!phone) throw new HttpError(400, "Enter a valid phone number.");
    const emailRaw = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (emailRaw && !isValidEmail(emailRaw))
      throw new HttpError(400, "Enter a valid email address.");
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
      const email =
        emailRaw || `customer-${phone.replace(/\D/g, "")}@joycorner.local`;
      const insertResult = await client.query<Record<string, unknown>>(
        `insert into accounts(email,password_hash,full_name,phone,role,customer_number)
       values($1,$2,$3,$4,'customer','JC-' || lpad(nextval('customer_number_seq')::text,6,'0'))
       on conflict(email) do nothing returning id,full_name as "fullName",email,phone,customer_number as "customerNumber"`,
        [email, await hashPassword(crypto.randomUUID()), fullName, phone],
      );
      if (!insertResult.rows[0]) {
        const fallback = await client.query<Record<string, unknown>>(
          'select id,full_name as "fullName",email,phone,customer_number as "customerNumber" from accounts where phone=$1 and role=\'customer\' limit 1',
          [phone],
        );
        return { customer: fallback.rows[0] };
      }
      await client.query(
        "insert into rewards_accounts(customer_id) values($1) on conflict do nothing",
        [insertResult.rows[0].id],
      );
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('accounts',$1,'{}'::jsonb)",
        [insertResult.rows[0].id],
      );
      return { customer: insertResult.rows[0] };
    });
    res.status(201).json(result);
  }),
);

const transitions: Record<string, string[]> = {
  pending_confirmation: ["confirmed", "rejected", "cancelled"],
  confirmed: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: ["closed"],
};

app.post(
  "/api/orders/:id/status",
  authenticate,
  requireRoles("owner", "manager", "cashier", "barista"),
  asyncRoute(async (req, res) => {
    const status = nonEmpty(req.body?.status, 40);
    const reason = String(req.body?.reason || "")
      .trim()
      .slice(0, 500);
    const order = await transaction(async (client) => {
      const current = await client.query<Record<string, unknown>>(
        "select * from orders where id=$1 for update",
        [req.params.id],
      );
      const row = current.rows[0];
      if (!row) throw new HttpError(404, "Order not found.");
      if (!(transitions[String(row.status)] || []).includes(status))
        throw new HttpError(409, "That order status change is not allowed.");
      const role = req.auth?.role;
      const cashierStep =
        String(row.status) === "pending_confirmation" ||
        String(row.status) === "picked_up";
      const kitchenStep = [
        "confirmed",
        "accepted",
        "preparing",
        "ready",
      ].includes(String(row.status));
      if (cashierStep && !role?.match(/^(owner|manager|cashier)$/))
        throw new HttpError(403, "A cashier must perform that status change.");
      if (
        kitchenStep &&
        status !== "cancelled" &&
        !role?.match(/^(owner|manager|barista)$/)
      )
        throw new HttpError(403, "A barista must perform that status change.");
      if (["rejected", "cancelled"].includes(status) && !reason)
        throw new HttpError(
          400,
          `${status === "rejected" ? "A rejection" : "A cancellation"} reason is required.`,
        );
      if (
        status === "cancelled" &&
        !role?.match(/^(owner|manager|cashier|barista)$/)
      )
        throw new HttpError(
          403,
          "Only authorized operations staff can cancel an order.",
        );
      if (status === "closed" && row.payment_status !== "paid")
        throw new HttpError(
          409,
          "The order must be fully paid before it can be closed.",
        );
      const confirmationStatus =
        status === "confirmed"
          ? "confirmed"
          : status === "rejected"
            ? "rejected"
            : row.confirmation_status;
      await client.query(
        `update orders set status=$2,confirmation_status=$3,rejection_reason=case when $2='rejected' then $4 else rejection_reason end,
       cancellation_reason=case when $2='cancelled' then $4 else cancellation_reason end,
       closed_at=case when $2='closed' then now() else closed_at end where id=$1`,
        [req.params.id, status, confirmationStatus, reason || null],
      );
      if (row.customer_id) {
        await client.query(
          `insert into notifications(user_id,type,title,message,related_order_id)
         values($1,'order_status','Order update',$2,$3)`,
          [
            row.customer_id,
            `Order ${row.order_number} is now ${status.replace(/_/g, " ")}.`,
            req.params.id,
          ],
        );
      }
      if (
        status === "closed" &&
        row.customer_id &&
        row.payment_status === "paid" &&
        !row.rewards_applied
      ) {
        const points = Math.floor(Number(row.total));
        await client.query(
          `insert into rewards_accounts(customer_id,points_balance,eligible_purchase_count)
         values($1,$2,1) on conflict(customer_id) do update
         set points_balance=rewards_accounts.points_balance+$2,
             eligible_purchase_count=rewards_accounts.eligible_purchase_count+1,updated_at=now()`,
          [row.customer_id, points],
        );
        await client.query(
          "update orders set rewards_applied=true where id=$1",
          [req.params.id],
        );
        await client.query(
          "insert into reporting_outbox(topic,entity_id,payload) values('rewards_accounts',$1,'{}'::jsonb)",
          [row.customer_id],
        );
      }
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'change_status','order',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          req.params.id,
          JSON.stringify({ from: row.status, reason, to: status }),
        ],
      );
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)",
        [req.params.id, JSON.stringify({ status })],
      );
      return row;
    });
    publish("orders", String(req.params.id));
    publish("notifications", String(req.params.id));
    publish("cashier_order_queue", String(req.params.id));
    publish("kitchen_order_queue", String(req.params.id));
    res.json({ ok: true, orderId: order.id });
  }),
);

app.patch(
  "/api/orders/:id/items/:itemId",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (req, res) => {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      throw new HttpError(400, "Quantity must be a whole number from 0 to 99.");
    }
    const result = await transaction(async (client) => {
      const orderResult = await client.query<Record<string, unknown>>(
        "select * from orders where id=$1 for update",
        [req.params.id],
      );
      const order = orderResult.rows[0];
      if (!order) throw new HttpError(404, "Order not found.");
      if (
        !["pending_confirmation", "confirmed"].includes(String(order.status))
      ) {
        throw new HttpError(
          409,
          "Items can only be edited before preparation begins.",
        );
      }
      const itemResult = await client.query<Record<string, unknown>>(
        "select * from order_items where id=$1 and order_id=$2 for update",
        [req.params.itemId, req.params.id],
      );
      const item = itemResult.rows[0];
      if (!item) throw new HttpError(404, "Order item not found.");
      const replacementSizeId = String(
        req.body?.replacementSizeId || "",
      ).trim();
      if (quantity === 0) {
        const count = await client.query<{ count: string }>(
          "select count(*)::text as count from order_items where order_id=$1",
          [req.params.id],
        );
        if (Number(count.rows[0]?.count || 0) <= 1) {
          throw new HttpError(
            409,
            "An order must keep at least one item. Cancel the order instead.",
          );
        }
        await client.query(
          "delete from order_item_modifiers where order_item_id=$1",
          [req.params.itemId],
        );
        await client.query("delete from order_items where id=$1", [
          req.params.itemId,
        ]);
      } else if (replacementSizeId) {
        const replacement = await client.query<Record<string, unknown>>(
          `select s.id,s.menu_item_id,s.size_name,s.price,i.name,c.name as category
           from menu_item_sizes s
           join menu_items i on i.id=s.menu_item_id
           join menu_categories c on c.id=i.category_id
           where s.id=$1 and i.availability_state='available' and i.available=true`,
          [replacementSizeId],
        );
        const next = replacement.rows[0];
        if (!next) {
          throw new HttpError(409, "The replacement item is unavailable.");
        }
        await client.query(
          "delete from order_item_modifiers where order_item_id=$1",
          [req.params.itemId],
        );
        await client.query(
          `update order_items set menu_item_id=$3,item_name_snapshot=$4,
             category_name_snapshot=$5,size_name=$6,quantity=$7,unit_price=$8,
             modifiers_total=0,total_price=$8*$7,customer_notes=null
           where id=$1 and order_id=$2`,
          [
            req.params.itemId,
            req.params.id,
            next.menu_item_id,
            next.name,
            next.category,
            next.size_name,
            quantity,
            next.price,
          ],
        );
      } else {
        await client.query(
          `update order_items
           set quantity=$3,total_price=(unit_price+modifiers_total)*$3
           where id=$1 and order_id=$2`,
          [req.params.itemId, req.params.id, quantity],
        );
      }
      const totals = await client.query<{ subtotal: string }>(
        "select coalesce(sum(total_price),0)::text as subtotal from order_items where order_id=$1",
        [req.params.id],
      );
      const subtotal = Number(totals.rows[0]?.subtotal || 0);
      const total = Math.max(
        0,
        subtotal -
          Number(order.discount_total || 0) -
          Number(order.voucher_discount || 0) +
          Number(order.tax_total || 0),
      );
      const paidResult = await client.query<{ paid: string }>(
        `select coalesce(sum(amount),0)::text as paid from payments
         where order_id=$1 and not coalesce(is_refund,false) and not coalesce(voided,false)`,
        [req.params.id],
      );
      const paid = Number(paidResult.rows[0]?.paid || 0);
      if (paid > total + 0.01) {
        throw new HttpError(
          409,
          "This edit would make the receipt lower than the amount already paid.",
        );
      }
      const paymentStatus =
        paid <= 0 ? "unpaid" : paid >= total - 0.01 ? "paid" : "partially_paid";
      await client.query(
        "update orders set subtotal=$2,total=$3,payment_status=$4 where id=$1",
        [req.params.id, subtotal, total, paymentStatus],
      );
      if (order.customer_id) {
        await client.query(
          `insert into notifications(user_id,type,title,message,related_order_id)
           values($1,'order_update','Order items updated',$2,$3)`,
          [
            order.customer_id,
            `The cashier updated items for order ${order.order_number}. Your total is now EGP ${total.toFixed(2)}.`,
            req.params.id,
          ],
        );
      }
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)",
        [
          req.params.id,
          JSON.stringify({
            itemId: req.params.itemId,
            paymentStatus,
            quantity,
            total,
          }),
        ],
      );
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'edit_order_item','order',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          req.params.id,
          JSON.stringify({
            itemId: req.params.itemId,
            itemName: item.item_name_snapshot,
            quantity,
            replacementSizeId: replacementSizeId || null,
            subtotal,
            total,
          }),
        ],
      );
      return { paymentStatus, subtotal, total };
    });
    publish("orders", String(req.params.id));
    publish("notifications", String(req.params.id));
    publish("cashier_order_queue", String(req.params.id));
    publish("kitchen_order_queue", String(req.params.id));
    res.json({ ok: true, ...result });
  }),
);

app.post(
  "/api/orders/:id/payment",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new HttpError(400, "Payment amount must be greater than zero.");
    await transaction(async (client) => {
      const orderResult = await client.query<Record<string, unknown>>(
        "select * from orders where id=$1 for update",
        [req.params.id],
      );
      const order = orderResult.rows[0];
      if (!order) throw new HttpError(404, "Order not found.");
      if (["cancelled", "rejected"].includes(String(order.status))) {
        throw new HttpError(
          409,
          "Payments cannot be recorded for a cancelled or rejected order.",
        );
      }
      if (order.status === "pending_confirmation") {
        throw new HttpError(
          409,
          "Confirm the order before recording a payment.",
        );
      }
      const paidResult = await client.query<{ paid: string }>(
        "select coalesce(sum(amount),0)::text as paid from payments where order_id=$1 and not coalesce(is_refund,false) and not coalesce(voided,false)",
        [req.params.id],
      );
      const paidBefore = Number(paidResult.rows[0]?.paid || 0);
      const remaining = Math.max(0, Number(order.total) - paidBefore);
      if (amount > remaining + 0.01)
        throw new HttpError(
          409,
          "Payment exceeds the remaining order balance.",
        );
      const sequence = await client.query<{ value: string }>(
        "select nextval('payment_number_seq')::text as value",
      );
      const payment = await client.query<{ id: string }>(
        `insert into payments(payment_number,order_id,amount,payment_method,reference,received_by)
       values($1,$2,$3,$4,$5,$6) returning id`,
        [
          `PAY-${String(sequence.rows[0]?.value || "0").padStart(6, "0")}`,
          req.params.id,
          amount,
          nonEmpty(req.body?.paymentMethod, 40),
          String(req.body?.reference || "")
            .trim()
            .slice(0, 200) || null,
          req.auth?.sub,
        ],
      );
      const paymentStatus =
        paidBefore + amount >= Number(order.total) - 0.01
          ? "paid"
          : "partially_paid";
      await client.query("update orders set payment_status=$2 where id=$1", [
        req.params.id,
        paymentStatus,
      ]);
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('payments',$1,$2::jsonb)",
        [payment.rows[0]?.id, JSON.stringify({ amount, paymentStatus })],
      );
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('orders',$1,$2::jsonb)",
        [req.params.id, JSON.stringify({ paymentStatus })],
      );
    });
    publish("orders", String(req.params.id));
    publish("cashier_order_queue", String(req.params.id));
    res.json({ ok: true });
  }),
);

app.post(
  "/api/admin/end-day",
  authenticate,
  requireRoles("owner", "manager"),
  asyncRoute(async (req, res) => {
    const businessDate = String(
      req.body?.businessDate || getCairoBusinessDate(),
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate))
      throw new HttpError(400, "Business date must use YYYY-MM-DD.");
    const report = await transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `joy-corner-end-day:${businessDate}`,
      ]);
      const active = await client.query<{ count: string }>(
        `select count(*)::text as count from orders
       where (created_at at time zone 'Africa/Cairo')::date=$1::date
         and status not in ('closed','rejected','cancelled')`,
        [businessDate],
      );
      if (Number(active.rows[0]?.count || 0) > 0) {
        throw new HttpError(
          409,
          `${active.rows[0]?.count} order(s) must be closed, rejected, or cancelled before End Day.`,
        );
      }
      const summary = await client.query<Record<string, unknown>>(
        `select count(*)::int as order_count,
              count(*) filter (where status='closed')::int as closed_order_count,
              count(*) filter (where status in ('cancelled','rejected'))::int as cancelled_order_count,
              coalesce(sum(total) filter (where status='closed'),0)::numeric(12,2) as gross_sales,
              coalesce((select sum(p.amount) from payments p
                where (p.created_at at time zone 'Africa/Cairo')::date=$1::date),0)::numeric(12,2) as payments_received,
              (select count(*)::int from payments p
                where (p.created_at at time zone 'Africa/Cairo')::date=$1::date) as payment_count,
              coalesce(sum(floor(total)) filter (where status='closed' and rewards_applied),0)::int as loyalty_points_issued
       from orders where (created_at at time zone 'Africa/Cairo')::date=$1::date`,
        [businessDate],
      );
      const row = summary.rows[0] || {};
      const bestSeller = await client.query<{
        item_name_snapshot: string;
        quantity: number;
      }>(
        `select oi.item_name_snapshot,sum(oi.quantity)::int as quantity from order_items oi
       join orders o on o.id=oi.order_id
       where (o.created_at at time zone 'Africa/Cairo')::date=$1::date and o.status='closed'
       group by oi.item_name_snapshot order by quantity desc,oi.item_name_snapshot limit 1`,
        [businessDate],
      );
      const latestReceipt = await client.query<{ order_number: string }>(
        `select order_number from orders where (created_at at time zone 'Africa/Cairo')::date=$1::date
       order by created_at desc limit 1`,
        [businessDate],
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
        [
          businessDate,
          row.order_count || 0,
          row.closed_order_count || 0,
          row.cancelled_order_count || 0,
          row.gross_sales || 0,
          row.payments_received || 0,
          row.loyalty_points_issued || 0,
          req.auth?.sub,
          row.payment_count || 0,
          bestSeller.rows[0]?.item_name_snapshot || null,
          bestSeller.rows[0]?.quantity || 0,
          latestReceipt.rows[0]?.order_number || null,
        ],
      );
      const saved = inserted.rows[0];
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('end_day_reports',$1,'{}'::jsonb)",
        [saved?.id],
      );
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'end_day','end_day_report',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          saved?.id,
          JSON.stringify({ businessDate }),
        ],
      );
      return saved;
    });
    res.json({
      report: {
        ...report,
        gross_sales: Number(report?.gross_sales),
        payments_received: Number(report?.payments_received),
      },
    });
  }),
);

app.get(
  "/api/owner/menu",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (_req, res) => {
    res.json({ items: await menuItems(true) });
  }),
);

app.get(
  "/api/menu/sync",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (_req, res) => {
    try {
      const result = await getMenuSyncResult();
      res.json({
        products: result.products,
        categories: result.categories,
        lastSyncedAt: result.lastSyncedAt,
        productCount: result.productCount,
        categoryCount: result.categoryCount,
        unavailableCount: result.unavailableCount,
        errors: result.errors,
        fromCache: result.fromCache,
      });
    } catch (error) {
      const fallback = await menuItems(false);
      res.json({
        products: [],
        categories: [],
        lastSyncedAt: null,
        productCount: fallback.length,
        categoryCount: 0,
        unavailableCount: 0,
        errors: [
          error instanceof Error ? error.message : "Menu sync unavailable",
        ],
        fromCache: true,
        fallbackItems: fallback,
      });
    }
  }),
);

app.post(
  "/api/owner/menu/sync/refresh",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (_req, res) => {
    clearMenuSyncCache();
    const result = await getMenuSyncResult(true);
    res.json({
      ok: true,
      lastSyncedAt: result.lastSyncedAt,
      productCount: result.productCount,
      categoryCount: result.categoryCount,
      unavailableCount: result.unavailableCount,
      errors: result.errors,
    });
  }),
);

app.get(
  "/api/owner/menu/sync/status",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (_req, res) => {
    const info = menuSyncCacheInfo();
    res.json({
      cached: info.cached,
      expiresAt: info.expiresAt,
      productCount: info.productCount,
    });
  }),
);

app.patch(
  "/api/owner/menu/items/:id",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const availabilityState = String(
      req.body?.availabilityState || "available",
    );
    const validStates = [
      "available",
      "temporarily_unavailable",
      "sold_out",
      "archived",
    ];
    if (!validStates.includes(availabilityState))
      throw new HttpError(400, "Invalid availability state.");
    const active = availabilityState !== "archived";
    const available =
      availabilityState === "available" ||
      availabilityState === "temporarily_unavailable";
    await query(
      `update menu_items set name=$2,description=$3,active=$4,available=$5,
            availability_state=$6,loyalty_eligible=$7,preparation_station=$8,sort_order=$9
     where id=$1`,
      [
        req.params.id,
        nonEmpty(req.body?.name),
        String(req.body?.description || "")
          .trim()
          .slice(0, 1000),
        active,
        available,
        availabilityState,
        Boolean(req.body?.loyaltyEligible),
        req.body?.preparationStation === "kitchen" ? "kitchen" : "barista",
        Number(req.body?.sortOrder ?? 0),
      ],
    );
    publish("menu", String(req.params.id));
    res.json({ ok: true });
  }),
);

app.post(
  "/api/owner/menu/items",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const name = nonEmpty(req.body?.name);
    const categoryId = nonEmpty(req.body?.categoryId);
    if (!categoryId) throw new HttpError(400, "Category is required.");
    const result = await query<{ id: string }>(
      `insert into menu_items (name,description,category_id,active,available,availability_state,loyalty_eligible,preparation_station,sort_order)
     values ($1,$2,$3,true,true,'available',$4,$5,$6)
     returning id`,
      [
        name,
        String(req.body?.description || "")
          .trim()
          .slice(0, 1000),
        categoryId,
        Boolean(req.body?.loyaltyEligible ?? true),
        req.body?.preparationStation === "kitchen" ? "kitchen" : "barista",
        Number(req.body?.sortOrder ?? 0),
      ],
    );
    const itemId = String(result[0]?.id);
    publish("menu", itemId);
    res.json({ id: itemId });
  }),
);

app.patch(
  "/api/owner/menu/sizes/:id",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const price = Number(req.body?.price);
    if (!Number.isFinite(price) || price <= 0)
      throw new HttpError(400, "Price must be greater than zero.");
    const existing = await query<{ price: number; menu_item_id: string }>(
      "select price, menu_item_id from menu_item_sizes where id=$1",
      [req.params.id],
    );
    if (!existing[0]) throw new HttpError(404, "Size not found.");
    const oldPrice = Number(existing[0].price);
    if (oldPrice === price) {
      res.json({ ok: true });
      return;
    }
    await query("update menu_item_sizes set price=$2 where id=$1", [
      req.params.id,
      price,
    ]);
    await query(
      `insert into price_audit_logs (entity_type,entity_id,menu_item_id,old_price,new_price,changed_by_user_id,changed_by_role)
     values ('menu_item_size',$1,$2,$3,$4,$5,$6)`,
      [
        req.params.id,
        existing[0].menu_item_id,
        oldPrice,
        price,
        req.auth?.sub,
        req.auth?.role,
      ],
    );
    publish("menu", String(existing[0].menu_item_id));
    res.json({ ok: true });
  }),
);

app.put(
  "/api/owner/menu/items/:id/image",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const match =
      /^data:(image\/(?:avif|jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        String(req.body?.dataUrl || ""),
      );
    if (!match?.[1] || !match[2])
      throw new HttpError(400, "Image format is not supported.");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 5 * 1024 * 1024)
      throw new HttpError(413, "Menu images must be 5 MB or smaller.");
    await query(
      "update menu_items set image_content_type=$2,image_bytes=$3 where id=$1",
      [req.params.id, match[1], bytes],
    );
    res.json({ imageUrl: `/api/menu/images/${req.params.id}?v=${Date.now()}` });
  }),
);

app.delete(
  "/api/owner/menu/items/:id/image",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    await query(
      "update menu_items set image_content_type=null,image_bytes=null where id=$1",
      [req.params.id],
    );
    res.json({ ok: true });
  }),
);

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "JC-";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

app.get(
  "/api/owner/customers/:id/vouchers",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const customerId = req.params.id;
    const customer = await query<{ id: string }>(
      "select id from accounts where id=$1 and role='customer'",
      [customerId],
    );
    if (!customer[0]) throw new HttpError(404, "Customer not found.");
    const rows = await query<Record<string, unknown>>(
      `select id,voucher_code as "voucherCode",voucher_type as "voucherType",
            fixed_value as "fixedValue",percentage_value as "percentageValue",
            status,expires_at as "expiresAt",issued_at as "issuedAt",
            description
     from vouchers where customer_id=$1 order by issued_at desc`,
      [customerId],
    );
    res.json({ vouchers: rows });
  }),
);

app.post(
  "/api/owner/customers/:id/vouchers",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const customerId = req.params.id;
    const customer = await query<{
      id: string;
      full_name: string;
      phone: string | null;
    }>(
      "select id,full_name,phone from accounts where id=$1 and role='customer'",
      [customerId],
    );
    if (!customer[0]) throw new HttpError(404, "Customer not found.");
    const voucherType = String(req.body?.voucherType || "fixed").trim();
    if (!["fixed", "percentage", "free_item"].includes(voucherType)) {
      throw new HttpError(
        400,
        "Voucher type must be fixed, percentage, or free_item.",
      );
    }
    const description =
      String(req.body?.description || "")
        .trim()
        .slice(0, 200) || null;
    let fixedValue: number | null = null;
    let percentageValue: number | null = null;
    let freeItemId: string | null = null;
    if (voucherType === "fixed") {
      fixedValue = Number(req.body?.fixedValue);
      if (!Number.isFinite(fixedValue) || fixedValue! <= 0)
        throw new HttpError(400, "Fixed value must be greater than zero.");
    } else if (voucherType === "percentage") {
      percentageValue = Number(req.body?.percentageValue);
      if (
        !Number.isFinite(percentageValue) ||
        percentageValue! <= 0 ||
        percentageValue! > 100
      ) {
        throw new HttpError(400, "Percentage must be between 1 and 100.");
      }
    } else {
      freeItemId = String(req.body?.freeItemId || "").trim() || null;
    }
    const expiresInDays = Number(req.body?.expiresInDays);
    const expiresAt =
      Number.isFinite(expiresInDays) && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 86400_000).toISOString()
        : null;
    const code = generateVoucherCode();
    const [inserted] = await query<Record<string, unknown>>(
      `insert into vouchers(customer_id,voucher_code,voucher_type,fixed_value,percentage_value,free_item_id,expires_at,description)
     values($1,$2,$3,$4,$5,$6,$7,$8)
     returning id,voucher_code as "voucherCode",voucher_type as "voucherType",
               fixed_value as "fixedValue",percentage_value as "percentageValue",
               status,expires_at as "expiresAt",issued_at as "issuedAt",description`,
      [
        customerId,
        code,
        voucherType,
        fixedValue,
        percentageValue,
        freeItemId,
        expiresAt,
        description,
      ],
    );
    if (!inserted) throw new HttpError(500, "Failed to create voucher.");
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('vouchers',$1,'{}'::jsonb)",
      [inserted.id],
    );
    await query(
      "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'create','voucher',$3,$4::jsonb)",
      [
        req.auth?.sub,
        req.auth?.role,
        inserted.id,
        JSON.stringify({ customerId, code, voucherType }),
      ],
    );
    res.status(201).json({
      voucher: inserted,
      customer: { fullName: customer[0].full_name, phone: customer[0].phone },
    });
  }),
);

app.post(
  "/api/owner/vouchers/:id/revoke",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const voucherId = req.params.id;
    const rows = await query<Record<string, unknown>>(
      "select id,status from vouchers where id=$1",
      [voucherId],
    );
    if (!rows[0]) throw new HttpError(404, "Voucher not found.");
    if (rows[0].status !== "active")
      throw new HttpError(400, "Only active vouchers can be revoked.");
    await query("update vouchers set status='revoked' where id=$1", [
      voucherId,
    ]);
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('vouchers',$1,'{}'::jsonb)",
      [voucherId],
    );
    await query(
      "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'revoke','voucher',$3,$4::jsonb)",
      [req.auth?.sub, req.auth?.role, voucherId, JSON.stringify({})],
    );
    res.json({ ok: true });
  }),
);

app.get(
  "/api/owner/voucher-requests",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const statusFilter = String(req.query.status || "")
      .trim()
      .toUpperCase();
    const validStatuses = [
      "PENDING",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
      "FULFILLED",
    ];
    const where =
      statusFilter && validStatuses.includes(statusFilter)
        ? "where vr.status=$1"
        : "";
    const params =
      statusFilter && validStatuses.includes(statusFilter)
        ? [statusFilter]
        : [];
    const rows = await query<Record<string, unknown>>(
      `select vr.id,vr.customer_id as "customerId",vr.requested_by_user_id as "requestedByUserId",
            vr.request_reason as "requestReason",vr.requested_reward_type as "requestedRewardType",
            vr.status,vr.reviewed_by_user_id as "reviewedByUserId",vr.reviewed_at as "reviewedAt",
            vr.rejection_reason as "rejectionReason",vr.created_voucher_id as "createdVoucherId",
            vr.created_at as "createdAt",vr.updated_at as "updatedAt",
            a.full_name as "customerName",a.email as "customerEmail",a.phone as "customerPhone",
            ra.points_balance as "loyaltyPoints",ra.eligible_purchase_count as "orderCount",
            ra.free_rewards_available as "freeRewards"
     from voucher_requests vr
     join accounts a on a.id=vr.customer_id
     left join rewards_accounts ra on ra.customer_id=vr.customer_id
     ${where}
     order by vr.created_at desc limit 100`,
      params,
    );
    res.json({ requests: rows });
  }),
);

app.patch(
  "/api/owner/voucher-requests/:id",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const requestId = req.params.id;
    const action = String(req.body?.action || "")
      .trim()
      .toUpperCase();
    if (!["APPROVE", "REJECT"].includes(action))
      throw new HttpError(400, "Action must be APPROVE or REJECT.");
    const rows = await query<Record<string, unknown>>(
      'select id,customer_id as "customerId",status from voucher_requests where id=$1',
      [requestId],
    );
    if (!rows[0]) throw new HttpError(404, "Voucher request not found.");
    if (rows[0].status !== "PENDING")
      throw new HttpError(400, "Only pending requests can be reviewed.");
    if (action === "REJECT") {
      const rejectionReason =
        String(req.body?.rejectionReason || "")
          .trim()
          .slice(0, 500) || null;
      await query(
        "update voucher_requests set status='REJECTED',reviewed_by_user_id=$2,reviewed_at=now(),rejection_reason=$3,updated_at=now() where id=$1",
        [requestId, req.auth?.sub, rejectionReason],
      );
      res.json({ ok: true, status: "REJECTED" });
      return;
    }
    const voucherType = String(req.body?.voucherType || "fixed").trim();
    if (!["fixed", "percentage", "free_item"].includes(voucherType)) {
      throw new HttpError(
        400,
        "Voucher type must be fixed, percentage, or free_item.",
      );
    }
    const description =
      String(req.body?.description || "")
        .trim()
        .slice(0, 200) || null;
    let fixedValue: number | null = null;
    let percentageValue: number | null = null;
    let freeItemId: string | null = null;
    if (voucherType === "fixed") {
      fixedValue = Number(req.body?.fixedValue);
      if (!Number.isFinite(fixedValue) || fixedValue! <= 0)
        throw new HttpError(400, "Fixed value must be greater than zero.");
    } else if (voucherType === "percentage") {
      percentageValue = Number(req.body?.percentageValue);
      if (
        !Number.isFinite(percentageValue) ||
        percentageValue! <= 0 ||
        percentageValue! > 100
      ) {
        throw new HttpError(400, "Percentage must be between 1 and 100.");
      }
    } else {
      freeItemId = String(req.body?.freeItemId || "").trim() || null;
    }
    const expiresInDays = Number(req.body?.expiresInDays);
    const expiresAt =
      Number.isFinite(expiresInDays) && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 86400_000).toISOString()
        : null;
    const code = generateVoucherCode();
    const customerId = String(rows[0].customerId);
    const [inserted] = await query<Record<string, unknown>>(
      `insert into vouchers(customer_id,voucher_code,voucher_type,fixed_value,percentage_value,free_item_id,expires_at,description)
     values($1,$2,$3,$4,$5,$6,$7,$8)
     returning id,voucher_code as "voucherCode",voucher_type as "voucherType",
               fixed_value as "fixedValue",percentage_value as "percentageValue",
               status,expires_at as "expiresAt",issued_at as "issuedAt",description`,
      [
        customerId,
        code,
        voucherType,
        fixedValue,
        percentageValue,
        freeItemId,
        expiresAt,
        description,
      ],
    );
    if (!inserted) throw new HttpError(500, "Failed to create voucher.");
    await query(
      "update voucher_requests set status='FULFILLED',reviewed_by_user_id=$2,reviewed_at=now(),created_voucher_id=$3,updated_at=now() where id=$1",
      [requestId, req.auth?.sub, inserted.id],
    );
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('vouchers',$1,'{}'::jsonb)",
      [inserted.id],
    );
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('voucher_requests',$1,'{}'::jsonb)",
      [requestId],
    );
    await query(
      "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'approve','voucher_request',$3,$4::jsonb)",
      [
        req.auth?.sub,
        req.auth?.role,
        requestId,
        JSON.stringify({ customerId, code, voucherType }),
      ],
    );
    res.json({ ok: true, status: "FULFILLED", voucher: inserted });
  }),
);

app.post(
  "/api/customer/voucher-requests",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const userId = req.auth?.sub;
    const requestReason =
      String(req.body?.requestReason || "")
        .trim()
        .slice(0, 500) || null;
    const requestedRewardType =
      String(req.body?.requestedRewardType || "")
        .trim()
        .slice(0, 100) || null;
    const existing = await query<{ id: string }>(
      "select id from voucher_requests where customer_id=$1 and status='PENDING' limit 1",
      [userId],
    );
    if (existing[0])
      throw new HttpError(400, "You already have a pending voucher request.");
    const [inserted] = await query<Record<string, unknown>>(
      `insert into voucher_requests(customer_id,requested_by_user_id,request_reason,requested_reward_type)
     values($1,$1,$2,$3) returning id,status,created_at as "createdAt"`,
      [userId, requestReason, requestedRewardType],
    );
    if (!inserted) throw new HttpError(500, "Failed to create request.");
    await query(
      "insert into reporting_outbox(topic,entity_id,payload) values('voucher_requests',$1,'{}'::jsonb)",
      [inserted.id],
    );
    res.status(201).json({ request: inserted });
  }),
);

app.get(
  "/api/customer/voucher-requests",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const userId = req.auth?.sub;
    const rows = await query<Record<string, unknown>>(
      `select id,status,request_reason as "requestReason",requested_reward_type as "requestedRewardType",
            rejection_reason as "rejectionReason",created_voucher_id as "createdVoucherId",
            created_at as "createdAt",updated_at as "updatedAt"
     from voucher_requests where customer_id=$1 order by created_at desc limit 50`,
      [userId],
    );
    res.json({ requests: rows });
  }),
);

app.post(
  "/api/customer/voucher-requests/:id/cancel",
  authenticate,
  requireRoles("customer"),
  asyncRoute(async (req, res) => {
    const userId = req.auth?.sub;
    const requestId = req.params.id;
    const rows = await query<{ id: string; status: string }>(
      "select id,status from voucher_requests where id=$1 and customer_id=$2",
      [requestId, userId],
    );
    if (!rows[0]) throw new HttpError(404, "Request not found.");
    if (rows[0].status !== "PENDING")
      throw new HttpError(400, "Only pending requests can be cancelled.");
    await query(
      "update voucher_requests set status='CANCELLED',updated_at=now() where id=$1",
      [requestId],
    );
    res.json({ ok: true });
  }),
);

// ─────────────────────────────────────────────────────
// BUSINESS DAY MANAGEMENT
// ─────────────────────────────────────────────────────

async function getCurrentBusinessDay() {
  const rows = await query<Record<string, unknown>>(
    "select * from business_days where status='OPEN' order by opened_at desc limit 1",
  );
  return rows[0] || null;
}

app.get(
  "/api/owner/business-days/current",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (_req, res) => {
    const bd = await getCurrentBusinessDay();
    res.json({ businessDay: bd });
  }),
);

app.get(
  "/api/owner/business-days",
  authenticate,
  requireRoles("owner", "manager"),
  asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const rows = await query<Record<string, unknown>>(
      "select * from business_days order by business_date desc limit $1",
      [limit],
    );
    res.json({ businessDays: rows });
  }),
);

app.post(
  "/api/owner/business-days/start",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const existing = await getCurrentBusinessDay();
    if (existing) throw new HttpError(409, "A business day is already open.");
    const businessDate = String(
      req.body?.businessDate || getCairoBusinessDate(),
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate))
      throw new HttpError(400, "Business date must use YYYY-MM-DD.");
    const duplicate = await query<{ id: string }>(
      "select id from business_days where business_date=$1",
      [businessDate],
    );
    if (duplicate[0])
      throw new HttpError(
        409,
        "A business day record already exists for this date.",
      );
    const [inserted] = await query<Record<string, unknown>>(
      `insert into business_days(business_date, opened_by_user_id) values($1,$2) returning *`,
      [businessDate, req.auth?.sub],
    );
    res.status(201).json({ businessDay: inserted });
  }),
);

app.get(
  "/api/owner/business-days/:id/report",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const bd = await query<Record<string, unknown>>(
      "select * from business_days where id=$1",
      [req.params.id],
    );
    if (!bd[0]) throw new HttpError(404, "Business day not found.");
    const businessDate = String(bd[0].business_date);
    const [orders, payments, productSummary, serviceSummary, staffSummary] =
      await Promise.all([
        query<Record<string, unknown>>(
          `select o.id,o.order_number,o.pickup_name,o.status,o.payment_status,o.payment_method,
              o.subtotal,o.discount_total,o.voucher_discount,o.total,
              coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not p.is_refund and not p.voided),0) as paid_amount,
              greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not p.is_refund and not p.voided),0),0) as remaining_amount,
              o.created_at,
              a.full_name as customer_name, coalesce(a.phone,o.guest_phone) as customer_phone,
              cb.full_name as cashier_name, cr.full_name as creator_name
       from orders o
       left join accounts a on a.id=o.customer_id
       left join accounts cb on cb.id=(select p.received_by from payments p where p.order_id=o.id order by p.created_at desc limit 1)
       left join accounts cr on cr.id=o.created_by
       where o.business_date=$1
       order by o.created_at`,
          [businessDate],
        ),
        query<Record<string, unknown>>(
          `select payment_method,sum(amount) as total, count(*)::int as count,
              sum(case when is_refund then amount else 0 end) as refund_total,
              sum(case when voided then amount else 0 end) as void_total
       from payments p where (p.created_at at time zone 'Africa/Cairo')::date=$1::date
       group by payment_method`,
          [businessDate],
        ),
        query<Record<string, unknown>>(
          `select oi.item_name_snapshot as product, sum(oi.quantity)::int as quantity,
              sum(oi.total_price)::numeric(12,2) as gross_revenue,
              sum(oi.total_price - oi.quantity * oi.unit_price)::numeric(12,2) as discounts
       from order_items oi
       join orders o on o.id=oi.order_id
       where o.business_date=$1 and o.status='closed' and not o.archived
       group by oi.item_name_snapshot order by quantity desc`,
          [businessDate],
        ),
        query<Record<string, unknown>>(
          `select o.pickup_name as service_type, count(*)::int as order_count, sum(o.total)::numeric(12,2) as total
       from orders o where o.business_date=$1 and o.status='closed' and not o.archived
       group by o.pickup_name`,
          [businessDate],
        ),
        query<Record<string, unknown>>(
          `select cr.full_name as staff_name, count(*)::int as order_count
       from orders o join accounts cr on cr.id=o.created_by
       where o.business_date=$1 and o.status='closed' and not o.archived
       group by cr.full_name order by order_count desc`,
          [businessDate],
        ),
      ]);
    const summary = bd[0];
    const unpaidCarryForward = orders.filter(
      (o) =>
        String(o.payment_status) !== "paid" &&
        String(o.status) !== "cancelled" &&
        String(o.status) !== "rejected",
    );
    res.json({
      businessDay: summary,
      orders,
      payments,
      productSummary,
      serviceSummary,
      staffSummary,
      unpaidCarryForward,
    });
  }),
);

app.post(
  "/api/owner/business-days/:id/close",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const businessDayId = req.params.id;
    const notes =
      String(req.body?.notes || "")
        .trim()
        .slice(0, 1000) || null;
    const report = await transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `joy-corner-end-day:${businessDayId}`,
      ]);
      const bd = await client.query<Record<string, unknown>>(
        "select * from business_days where id=$1 for update",
        [businessDayId],
      );
      const row = bd.rows[0];
      if (!row) throw new HttpError(404, "Business day not found.");
      if (row.status !== "OPEN")
        throw new HttpError(409, "This business day has already been closed.");
      const activeOrders = await client.query<{ count: string }>(
        `select count(*)::text as count from orders
       where business_day_id=$1 and status not in ('closed','rejected','cancelled')`,
        [businessDayId],
      );
      if (Number(activeOrders.rows[0]?.count || 0) > 0) {
        throw new HttpError(
          409,
          `${activeOrders.rows[0]?.count} order(s) must be closed, rejected, or cancelled before End Day.`,
        );
      }
      const summary = await client.query<Record<string, unknown>>(
        `select count(*)::int as order_count,
              count(*) filter (where status='closed')::int as closed_order_count,
              count(*) filter (where status in ('cancelled','rejected'))::int as cancelled_order_count,
              coalesce(sum(total) filter (where status='closed' and not archived),0)::numeric(12,2) as gross_sales,
              coalesce(sum(total - coalesce(voucher_discount,0)) filter (where status='closed' and not archived),0)::numeric(12,2) as net_sales,
              coalesce(sum(voucher_discount) filter (where not archived),0)::numeric(12,2) as voucher_discounts,
              coalesce((select sum(p.amount) from payments p
                join orders o2 on o2.id=p.order_id where o2.business_day_id=$1 and not p.is_refund and not p.voided),0)::numeric(12,2) as paid_amount,
              coalesce((select sum(greatest(o2.total-coalesce((select sum(p2.amount) from payments p2 where p2.order_id=o2.id and not p2.is_refund and not p2.voided),0),0)) from orders o2 where o2.business_day_id=$1 and o2.status='closed' and o2.payment_status != 'paid' and not o2.archived),0)::numeric(12,2) as unpaid_amount,
              coalesce((select sum(o2.total) from orders o2 where o2.business_day_id=$1 and o2.payment_status='partially_paid' and o2.status='closed' and not o2.archived),0)::numeric(12,2) as partially_paid_amount,
              coalesce((select sum(p.amount) from payments p join orders o2 on o2.id=p.order_id where o2.business_day_id=$1 and p.is_refund),0)::numeric(12,2) as refunded_amount
       from orders where business_day_id=$1`,
        [businessDayId],
      );
      const s = summary.rows[0] || {};
      await client.query(
        `update business_days set status='CLOSED',closed_at=now(),closed_by_user_id=$2,
              gross_sales=$3,net_sales=$4,paid_amount=$5,unpaid_amount=$6,
              partially_paid_amount=$7,refunded_amount=$8,
              receipt_count=$9,order_count=$10,notes=$11,updated_at=now()
       where id=$1`,
        [
          businessDayId,
          req.auth?.sub,
          s.gross_sales || 0,
          s.net_sales || 0,
          s.paid_amount || 0,
          s.unpaid_amount || 0,
          s.partially_paid_amount || 0,
          s.refunded_amount || 0,
          s.closed_order_count || 0,
          s.order_count || 0,
          notes,
        ],
      );
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'close_day','business_day',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          businessDayId,
          JSON.stringify({ businessDate: String(row.business_date), notes }),
        ],
      );
      return { ...s, business_date: String(row.business_date), notes };
    });
    res.json({ report });
  }),
);

// ─────────────────────────────────────────────────────
// OWNER ORDERS & RECEIPTS
// ─────────────────────────────────────────────────────

app.get(
  "/api/owner/orders",
  authenticate,
  requireRoles("owner", "manager", "cashier"),
  asyncRoute(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const statusFilter = String(req.query.status || "").trim();
    const paymentStatus = String(req.query.paymentStatus || "").trim();
    const search = String(req.query.search || "").trim();
    const businessDayId = String(req.query.businessDayId || "").trim();
    const dateFilter = String(req.query.dateFilter || "").trim();

    if (statusFilter) {
      const statuses = statusFilter
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) {
        conditions.push(`o.status = any($${paramIdx}::text[])`);
        params.push(statuses);
        paramIdx++;
      }
    }
    if (paymentStatus) {
      const pstatuses = paymentStatus
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (pstatuses.length) {
        conditions.push(`o.payment_status = any($${paramIdx}::text[])`);
        params.push(pstatuses);
        paramIdx++;
      }
    }
    if (businessDayId) {
      conditions.push(`o.business_day_id=$${paramIdx}`);
      params.push(businessDayId);
      paramIdx++;
    } else if (dateFilter === "current_day") {
      const bd = await getCurrentBusinessDay();
      if (bd) {
        conditions.push(`o.business_day_id=$${paramIdx}`);
        params.push(bd.id);
        paramIdx++;
      }
    } else if (dateFilter === "today") {
      conditions.push(
        `coalesce(nullif(o.business_date::text,'')::date,(o.created_at at time zone 'Africa/Cairo')::date)=$${paramIdx}::date`,
      );
      params.push(getCairoBusinessDate());
      paramIdx++;
    } else if (dateFilter === "before_today") {
      conditions.push(
        `coalesce(nullif(o.business_date::text,'')::date,(o.created_at at time zone 'Africa/Cairo')::date)<$${paramIdx}::date`,
      );
      params.push(getCairoBusinessDate());
      paramIdx++;
    } else if (dateFilter === "previous_days") {
      const bd = await getCurrentBusinessDay();
      if (bd) {
        conditions.push(
          `(o.business_day_id is null or o.business_day_id != $${paramIdx})`,
        );
        params.push(bd.id);
        paramIdx++;
      }
    }
    if (search) {
      const normalizedSearch = search.replace(/^#/, "").trim();
      conditions.push(`(
      o.order_number ilike $${paramIdx}
      or replace(lower(o.order_number), '-', '') like replace(lower($${paramIdx}), '-', '')
      or o.pickup_name ilike $${paramIdx}
      or o.customer_notes ilike $${paramIdx}
      or a.full_name ilike $${paramIdx}
      or a.phone ilike $${paramIdx}
      or regexp_replace(coalesce(a.phone, ''), '[^0-9]', '', 'g') like regexp_replace($${paramIdx}, '[^0-9]', '', 'g')
      or a.email ilike $${paramIdx}
    )`);
      params.push(`%${normalizedSearch}%`);
      paramIdx++;
    }
    if (!req.query.includeArchived) {
      conditions.push("not o.archived");
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const countResult = await query<{ count: string }>(
      `select count(*)::text as count from orders o left join accounts a on a.id=o.customer_id ${where}`,
      params,
    );
    const total = Number(countResult[0]?.count || 0);

    const rows = await query<Record<string, unknown>>(
      `select o.id,o.order_number,o.pickup_name,o.status,o.confirmation_status,
            o.payment_status,o.payment_method,o.subtotal,o.discount_total,o.voucher_discount,o.tax_total,o.total,
            coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not p.is_refund and not p.voided),0) as paid_amount,
            greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not p.is_refund and not p.voided),0),0) as remaining_amount,
            o.customer_notes,o.created_at,o.closed_at,o.archived,o.archived_at,o.archive_reason,
            o.business_day_id,o.business_date,
            a.full_name as customer_name,coalesce(a.phone,o.guest_phone) as customer_phone,a.email as customer_email,a.id as customer_id,
            cr.full_name as creator_name,
            coalesce(jsonb_agg(jsonb_build_object('itemName',oi.item_name_snapshot,'quantity',oi.quantity,'size',oi.size_name,
              'unitPrice',oi.unit_price,'totalPrice',oi.total_price,'originalUnitPrice',oi.original_unit_price,
              'overrideReason',oi.override_reason)
              order by oi.created_at) filter (where oi.id is not null),'[]'::jsonb) as item_summary
     from orders o
     left join accounts a on a.id=o.customer_id
     left join accounts cr on cr.id=o.created_by
     left join order_items oi on oi.order_id=o.id
     ${where}
     group by o.id,a.id,cr.id
     order by o.created_at desc
     limit $${paramIdx} offset $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    const numericFields = [
      "subtotal",
      "discount_total",
      "voucher_discount",
      "tax_total",
      "total",
      "paid_amount",
      "remaining_amount",
    ];
    const result = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          numericFields.includes(key) ? Number(value) : value,
        ]),
      ),
    );

    res.json({
      orders: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

// ─────────────────────────────────────────────────────
// OWNER OVERVIEW ANALYTICS
// ─────────────────────────────────────────────────────

app.get(
  "/api/owner/overview",
  authenticate,
  requireRoles("owner", "manager"),
  asyncRoute(async (req, res) => {
    const dateFilter = String(req.query.dateFilter || "today").trim();
    let dateCondition: string;
    const params: unknown[] = [];
    const paramIdx = 1;

    if (dateFilter === "yesterday") {
      dateCondition = `(o.created_at at time zone 'Africa/Cairo')::date = (current_date at time zone 'Africa/Cairo')::date - 1`;
    } else if (dateFilter === "this_week") {
      dateCondition = `(o.created_at at time zone 'Africa/Cairo')::date >= (current_date at time zone 'Africa/Cairo')::date - extract(dow from current_date at time zone 'Africa/Cairo')::int`;
    } else if (dateFilter === "this_month") {
      dateCondition = `date_trunc('month', o.created_at at time zone 'Africa/Cairo') = date_trunc('month', current_date at time zone 'Africa/Cairo')`;
    } else if (
      dateFilter === "custom" &&
      req.query.startDate &&
      req.query.endDate
    ) {
      dateCondition = `(o.created_at at time zone 'Africa/Cairo')::date >= $${paramIdx}::date and (o.created_at at time zone 'Africa/Cairo')::date <= $${paramIdx + 1}::date`;
      params.push(String(req.query.startDate), String(req.query.endDate));
    } else {
      dateCondition = `(o.created_at at time zone 'Africa/Cairo')::date = (current_date at time zone 'Africa/Cairo')::date`;
    }

    const [stats, topProducts, categories, sizes, modifiers] =
      await Promise.all([
        query<Record<string, unknown>>(
          `select
         coalesce(sum(o.total) filter (where o.status='closed' and not o.archived),0)::numeric(12,2) as gross_sales,
         coalesce(sum(o.total - o.voucher_discount) filter (where o.status='closed' and not o.archived),0)::numeric(12,2) as net_sales,
         coalesce((select sum(p.amount) from payments p join orders o2 on o2.id=p.order_id where not p.is_refund and not p.voided and ${dateCondition.replace(/o\./g, "o2.")}),0)::numeric(12,2) as paid_amount,
         coalesce(sum(greatest(o.total-coalesce((select sum(p.amount) from payments p where p.order_id=o.id and not p.is_refund and not p.voided),0),0)) filter (where o.status='closed' and o.payment_status != 'paid' and not o.archived),0)::numeric(12,2) as unpaid_amount,
         coalesce(sum(o.total) filter (where o.status='closed' and o.payment_status='partially_paid' and not o.archived),0)::numeric(12,2) as partially_paid_amount,
         coalesce((select sum(p.amount) from payments p join orders o2 on o2.id=p.order_id where p.is_refund and ${dateCondition.replace(/o\./g, "o2.")}),0)::numeric(12,2) as refunded_amount,
         count(*) filter (where not o.archived and o.status not in ('cancelled','rejected'))::int as total_receipts,
         count(*) filter (where o.status='closed' and not o.archived)::int as completed_orders,
         count(*) filter (where o.status not in ('closed','rejected','cancelled') and not o.archived)::int as active_orders,
         case when count(*) filter (where o.status='closed' and not o.archived) > 0
           then (coalesce(sum(o.total) filter (where o.status='closed' and not o.archived),0) / count(*) filter (where o.status='closed' and not o.archived))::numeric(12,2)
           else 0 end as avg_order_value,
         coalesce(sum(oi.quantity) filter (where o.status='closed' and not o.archived),0)::int as total_items_sold,
         count(distinct o.customer_id) filter (where o.status='closed' and not o.archived and o.customer_id is not null)::int as unique_customers,
         count(distinct o.customer_id) filter (where o.status='closed' and not o.archived and o.customer_id is not null and
           (select count(*) from orders o3 where o3.customer_id=o.customer_id and o3.created_at < o.created_at) > 0)::int as returning_customers,
         count(*) filter (where o.status='closed' and not o.archived and o.customer_id is null)::int as guest_orders
       from orders o
       left join order_items oi on oi.order_id=o.id
       where ${dateCondition}`,
          params,
        ),
        query<Record<string, unknown>>(
          `select oi.item_name_snapshot as product, sum(oi.quantity)::int as units_sold,
              count(distinct oi.order_id)::int as order_count,
              sum(oi.total_price)::numeric(12,2) as gross_revenue,
              sum(oi.total_price - oi.quantity * oi.unit_price)::numeric(12,2) as discounts
       from order_items oi
       join orders o on o.id=oi.order_id
       where o.status='closed' and not o.archived and ${dateCondition}
       group by oi.item_name_snapshot order by units_sold desc limit 10`,
          params,
        ),
        query<Record<string, unknown>>(
          `select oi.item_name_snapshot as product, oi.quantity, oi.total_price
       from order_items oi join orders o on o.id=oi.order_id
       where o.status='closed' and not o.archived and ${dateCondition}`,
          params,
        ),
        query<Record<string, unknown>>(
          `select oi.item_name_snapshot as product, sum(oi.quantity)::int as units_sold
       from order_items oi join orders o on o.id=oi.order_id
       where o.status='closed' and not o.archived and ${dateCondition}
       group by oi.item_name_snapshot order by units_sold desc`,
          params,
        ),
        query<Record<string, unknown>>(
          `select o.payment_method, count(*)::int as count, coalesce(sum(o.total),0)::numeric(12,2) as total
       from orders o where o.status='closed' and not o.archived and ${dateCondition}
       group by o.payment_method`,
          params,
        ),
      ]);

    const catMap = new Map<string, number>();
    const sizeMap = new Map<string, number>();
    categories.forEach((r) => {
      catMap.set(String(r.product), Number(r.units_sold));
    });
    sizes.forEach((r) => {
      sizeMap.set(String(r.product), Number(r.units_sold));
    });

    res.json({
      stats: stats[0] || {},
      topProducts,
      categories: Array.from(catMap.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty),
      sizes: Array.from(sizeMap.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty),
      paymentMethods: modifiers,
    });
  }),
);

// ─────────────────────────────────────────────────────
// TOP SELLING ANALYTICS
// ─────────────────────────────────────────────────────

app.get(
  "/api/owner/analytics/products",
  authenticate,
  requireRoles("owner", "manager"),
  asyncRoute(async (req, res) => {
    const dateStart = String(req.query.startDate || "").trim();
    const dateEnd = String(req.query.endDate || "").trim();
    const categoryFilter = String(req.query.category || "").trim();
    let dateCondition = "o.status='closed' and not o.archived";
    const params: unknown[] = [];
    let paramIdx = 1;
    if (dateStart && dateEnd) {
      dateCondition += ` and (o.created_at at time zone 'Africa/Cairo')::date >= $${paramIdx}::date and (o.created_at at time zone 'Africa/Cairo')::date <= $${paramIdx + 1}::date`;
      params.push(dateStart, dateEnd);
      paramIdx += 2;
    }
    if (categoryFilter) {
      dateCondition += ` and oi.category_name_snapshot=$${paramIdx}`;
      params.push(categoryFilter);
    }
    const rows = await query<Record<string, unknown>>(
      `select oi.item_name_snapshot as product, oi.category_name_snapshot as category,
            sum(oi.quantity)::int as units_sold,
            count(distinct oi.order_id)::int as order_count,
            sum(oi.total_price)::numeric(12,2) as gross_revenue,
            sum(oi.quantity * oi.unit_price)::numeric(12,2) as net_revenue,
            sum(oi.total_price - oi.quantity * oi.unit_price)::numeric(12,2) as discounts,
            avg(oi.unit_price)::numeric(12,2) as avg_selling_price,
            max(o.created_at) as last_sold_at
     from order_items oi
     join orders o on o.id=oi.order_id
     where ${dateCondition}
     group by oi.item_name_snapshot, oi.category_name_snapshot
     order by net_revenue desc`,
      params,
    );
    res.json({ products: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
  }),
);

// ─────────────────────────────────────────────────────
// PAYMENT COLLECTION & VOID/REFUND
// ─────────────────────────────────────────────────────

app.post(
  "/api/owner/receipts/:id/payments",
  authenticate,
  requireRoles("owner", "cashier"),
  asyncRoute(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new HttpError(400, "Payment amount must be greater than zero.");
    const paymentMethod = String(
      req.body?.paymentMethod || "cash_at_cashier",
    ).trim();
    const reference =
      String(req.body?.reference || "")
        .trim()
        .slice(0, 200) || null;
    await transaction(async (client) => {
      const orderResult = await client.query<Record<string, unknown>>(
        "select * from orders where id=$1 for update",
        [req.params.id],
      );
      const order = orderResult.rows[0];
      if (!order) throw new HttpError(404, "Order not found.");
      if (["cancelled", "rejected"].includes(String(order.status)))
        throw new HttpError(
          409,
          "Cannot record payment for a cancelled or rejected order.",
        );
      const paidResult = await client.query<{ paid: string }>(
        "select coalesce(sum(amount),0)::text as paid from payments where order_id=$1 and not is_refund and not voided",
        [req.params.id],
      );
      const paidBefore = Number(paidResult.rows[0]?.paid || 0);
      const remaining = Math.max(0, Number(order.total) - paidBefore);
      if (amount > remaining + 0.01)
        throw new HttpError(409, "Payment exceeds the remaining balance.");
      const sequence = await client.query<{ value: string }>(
        "select nextval('payment_number_seq')::text as value",
      );
      const paymentNumber = `PAY-${String(sequence.rows[0]?.value || "0").padStart(6, "0")}`;
      await client.query(
        `insert into payments(payment_number,order_id,amount,payment_method,reference,received_by) values($1,$2,$3,$4,$5,$6)`,
        [
          paymentNumber,
          req.params.id,
          amount,
          paymentMethod,
          reference,
          req.auth?.sub,
        ],
      );
      const newPaid = paidBefore + amount;
      const paymentStatus =
        newPaid >= Number(order.total) - 0.01 ? "paid" : "partially_paid";
      await client.query(
        "update orders set payment_status=$2,payment_method=$3 where id=$1",
        [req.params.id, paymentStatus, paymentMethod],
      );
      await client.query(
        "insert into reporting_outbox(topic,entity_id,payload) values('payments',$1,$2::jsonb)",
        [req.params.id, JSON.stringify({ amount, paymentStatus })],
      );
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'record_payment','order',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          req.params.id,
          JSON.stringify({ amount, paymentMethod, paymentNumber, reference }),
        ],
      );
    });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/owner/receipts/:id/void",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) throw new HttpError(400, "A void reason is required.");
    await transaction(async (client) => {
      const order = await client.query<Record<string, unknown>>(
        "select * from orders where id=$1 for update",
        [req.params.id],
      );
      if (!order.rows[0]) throw new HttpError(404, "Order not found.");
      if (String(order.rows[0].status) === "cancelled")
        throw new HttpError(409, "Order is already cancelled/voided.");
      await client.query(
        `update orders set status='cancelled',cancellation_reason=$2 where id=$1`,
        [req.params.id, `VOIDED: ${reason}`],
      );
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'void','order',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          req.params.id,
          JSON.stringify({ reason }),
        ],
      );
    });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/owner/receipts/:id/archive",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    await query(
      `update orders set archived=true,archived_at=now(),archived_by_user_id=$2,archive_reason=$3 where id=$1`,
      [req.params.id, req.auth?.sub, reason || null],
    );
    await query(
      "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'archive','order',$3,$4::jsonb)",
      [
        req.auth?.sub,
        req.auth?.role,
        req.params.id,
        JSON.stringify({ reason }),
      ],
    );
    res.json({ ok: true });
  }),
);

app.post(
  "/api/owner/receipts/:id/unarchive",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    await query(
      `update orders set archived=false,archived_at=null,archived_by_user_id=null,archive_reason=null where id=$1`,
      [req.params.id],
    );
    await query(
      "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'unarchive','order',$3,'{}'::jsonb)",
      [req.auth?.sub, req.auth?.role, req.params.id],
    );
    res.json({ ok: true });
  }),
);

app.post(
  "/api/owner/receipts/:id/price-override",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (req, res) => {
    const { orderItemId, newUnitPrice, reason } = req.body || {};
    if (
      !orderItemId ||
      !Number.isFinite(Number(newUnitPrice)) ||
      Number(newUnitPrice) <= 0
    )
      throw new HttpError(400, "Invalid override data.");
    if (!reason || !String(reason).trim())
      throw new HttpError(400, "Override reason is required.");
    await transaction(async (client) => {
      const item = await client.query<Record<string, unknown>>(
        "select * from order_items where id=$1 for update",
        [orderItemId],
      );
      if (!item.rows[0]) throw new HttpError(404, "Order item not found.");
      const oldPrice = Number(item.rows[0].unit_price);
      const newPrice = Number(newUnitPrice);
      const qty = Number(item.rows[0].quantity);
      const totalDiff = (newPrice - oldPrice) * qty;
      await client.query(
        `update order_items set original_unit_price=$2,unit_price=$3,
              total_price=$3 * quantity + modifiers_total,
              override_reason=$4,overridden_by_user_id=$5,overridden_at=now()
       where id=$1`,
        [orderItemId, oldPrice, newPrice, String(reason).trim(), req.auth?.sub],
      );
      const order = await client.query<Record<string, unknown>>(
        "select * from orders where id=$1 for update",
        [item.rows[0].order_id],
      );
      if (order.rows[0]) {
        const newSubtotal = Number(order.rows[0].subtotal) + totalDiff;
        const newTotal = Math.max(
          0,
          newSubtotal - Number(order.rows[0].voucher_discount),
        );
        await client.query(
          "update orders set subtotal=$2,total=$3 where id=$1",
          [item.rows[0].order_id, newSubtotal, newTotal],
        );
      }
      await client.query(
        "insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,details) values($1,$2,'price_override','order_item',$3,$4::jsonb)",
        [
          req.auth?.sub,
          req.auth?.role,
          orderItemId,
          JSON.stringify({
            oldPrice,
            newPrice,
            qty,
            totalDiff,
            reason,
            orderNumber: order.rows[0]?.order_number,
          }),
        ],
      );
    });
    res.json({ ok: true });
  }),
);

// ─────────────────────────────────────────────────────
// ASSIGN BUSINESS DAY TO EXISTING ORDERS (migration helper)
// ─────────────────────────────────────────────────────

app.post(
  "/api/owner/business-days/assign-orders",
  authenticate,
  requireRoles("owner"),
  asyncRoute(async (_req, res) => {
    const bd = await getCurrentBusinessDay();
    if (!bd) throw new HttpError(409, "No open business day found.");
    const updated = await query(
      `update orders set business_day_id=$1, business_date=$2
     where business_day_id is null and (created_at at time zone 'Africa/Cairo')::date=$2::date`,
      [bd.id, bd.business_date],
    );
    res.json({
      ok: true,
      assigned: (updated as unknown as { rowCount: number }).rowCount || 0,
    });
  }),
);

// ─────────────────────────────────────────────────────

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Request failed", message);
  res.status(500).json({
    error: isProduction
      ? "The server could not complete the request."
      : message,
  });
});

// ─────────────────────────────────────────────────────
// STATIC FILE SERVING (same-origin production)
// ─────────────────────────────────────────────────────

if (isProduction) {
  const distPath = path.resolve(process.cwd(), "dist");

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  app.use(express.static(distPath, { index: false }));

  app.use((_req, res, next) => {
    if (/\.\w{2,5}$/.test(_req.path)) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    next();
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

async function seedStaffAccounts(): Promise<void> {
  const staff = [
    {
      email: "owner@joycorner.com",
      envKey: "SEED_OWNER_PASSWORD",
      role: "owner" as const,
      fullName: "Owner",
    },
    {
      email: "cashier@joycorner.com",
      envKey: "SEED_CASHIER_PASSWORD",
      role: "cashier" as const,
      fullName: "Cashier",
    },
    {
      email: "waiter@joycorner.com",
      envKey: "SEED_WAITER_PASSWORD",
      role: "waiter" as const,
      fullName: "Waiter",
    },
    {
      email: "barista@joycorner.com",
      envKey: "SEED_BARISTA_PASSWORD",
      role: "barista" as const,
      fullName: "Barista",
    },
  ];

  for (const { email, envKey, role, fullName } of staff) {
    const password = process.env[envKey];

    if (!password) {
      console.warn(`Skipping staff sync for ${email}: ${envKey} is not set.`);
      continue;
    }

    const passwordHash = await hashPassword(password);

    await query(
      `insert into accounts(email,password_hash,full_name,role,active)
       values($1,$2,$3,$4,true)
       on conflict(email) do update set
         password_hash=excluded.password_hash,
         full_name=excluded.full_name,
         role=excluded.role,
         active=true,
         updated_at=now()`,
      [email, passwordHash, fullName, role],
    );

    console.log(`Synchronized staff account: ${email}`);
  }
}
async function start(): Promise<void> {
  await applyNeonMigrations();
  await seedStaffAccounts();
  const server = app.listen(port, "0.0.0.0", () =>
    console.log(`Joy Corner API listening on ${port}`),
  );
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
