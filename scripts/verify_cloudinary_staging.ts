import fs from "node:fs";

import dotenv from "dotenv";
import { Client } from "pg";

import { assertMigration005StagingTarget } from "../server/neon";

dotenv.config({ path: [".env.local", ".env"] });

const apiBase = "http://127.0.0.1:3001/api";
const connectionString =
  process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";

function required(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredRow<T>(rows: T[], description: string): T {
  const row = rows[0];
  if (!row) throw new Error(`${description} was not returned.`);
  return row;
}

function imageDataUrl(path: string): string {
  const bytes = fs.readFileSync(path);
  const mediaType =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : "image/png";
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}

async function request(
  path: string,
  init: RequestInit = {},
  cookie?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${apiBase}${path}`, { ...init, headers });
}

async function safeFailure(response: Response): Promise<string> {
  const body = (await response.clone().json().catch(() => ({}))) as {
    error?: unknown;
  };
  const message = String(body.error || "");
  if (message.includes("payload is invalid")) return "invalid_image_payload";
  if (message.includes("file type")) return "file_signature_mismatch";
  if (message.includes("5 MB")) return "image_too_large";
  if (message.includes("Invalid Signature")) return "invalid_cloudinary_signature";
  if (message.includes("Unknown API key")) return "unknown_cloudinary_key";
  if (message.includes("Product image storage is not configured")) {
    return "missing_cloudinary_configuration";
  }
  return message ? "other_application_error" : "empty_error_response";
}

async function roleCookie(email: string, passwordVariable: string): Promise<string> {
  const response = await request("/auth/login", {
    body: JSON.stringify({
      email,
      password: required(passwordVariable),
    }),
    method: "POST",
  });
  if (!response.ok) throw new Error(`${passwordVariable} authentication failed.`);
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) throw new Error("Owner session cookie was not returned.");
  return cookie;
}

async function menuImage(
  legacyId: string,
  cookie?: string,
): Promise<string | null | undefined> {
  const response = await request("/menu", {}, cookie);
  if (!response.ok) throw new Error("Menu projection request failed.");
  const body = (await response.json()) as {
    items?: Array<{ image_url?: string | null; legacy_id?: string }>;
  };
  return body.items?.find((item) => item.legacy_id === legacyId)?.image_url;
}

async function main() {
  const target = assertMigration005StagingTarget(connectionString, {
    ...process.env,
    MIGRATION_CONFIRM_STAGING: "true",
  });
  if (required("CLOUDINARY_FOLDER") !== "joy-corner/staging/menu-items") {
    throw new Error("Cloudinary staging folder is not exact.");
  }
  required("CLOUDINARY_CLOUD_NAME");
  required("CLOUDINARY_API_KEY");
  required("CLOUDINARY_API_SECRET");

  const client = new Client({
    connectionString: connectionString.replace(
      "sslmode=require",
      "sslmode=verify-full",
    ),
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  let itemId = "";
  let legacyId: string;
  let cleanupCookie = "";
  try {
    const item = await client.query<{
      id: string;
      legacy_id: string;
    }>(
      `select id,legacy_id
       from menu_items
       where active=true
         and availability_status='available'
         and image_public_id is null
         and image_url is null
       order by sort_order,id
       limit 1`,
    );
    if (!item.rows[0]) {
      throw new Error("No active image-free staging menu item is available.");
    }
    itemId = item.rows[0].id;
    legacyId = item.rows[0].legacy_id;

    const historicalBefore = await client.query<{ digest: string }>(
      `select md5(
         coalesce(
           string_agg(
             id::text || ':' || coalesce(image_url_snapshot,'<null>'),
             '|' order by id
           ),
           ''
         )
       ) as digest
       from order_items`,
    );
    const auditBefore = await client.query<{ count: string }>(
      `select count(*)::text as count
       from audit_logs
       where entity_id=$1
         and action in ('replace_product_image','remove_product_image')`,
      [itemId],
    );

    const sessions = {
      barista: await roleCookie(
        "barista@joycorner.com",
        "STAGING_BARISTA_PASSWORD",
      ),
      cashier: await roleCookie(
        "cashier@joycorner.com",
        "STAGING_CASHIER_PASSWORD",
      ),
      customer: await roleCookie(
        "staging.customer@example.com",
        "STAGING_CUSTOMER_PASSWORD",
      ),
      owner: await roleCookie("owner@joycorner.com", "STAGING_OWNER_PASSWORD"),
    };
    const cookie = sessions.owner;
    cleanupCookie = sessions.owner;
    const firstImage = imageDataUrl(
      "artifacts/staging-screenshots/mobile-staff-sign-in.png",
    );
    const secondImage = imageDataUrl(
      "artifacts/staging-screenshots/mobile-profile.png",
    );

    const firstUpload = await request(
      `/owner/menu/items/${encodeURIComponent(itemId)}/image`,
      { body: JSON.stringify({ dataUrl: firstImage }), method: "PUT" },
      cookie,
    );
    if (!firstUpload.ok) {
      throw new Error(
        `First signed upload failed (${firstUpload.status}, ${await safeFailure(firstUpload)}).`,
      );
    }
    const firstStored = await client.query<{
      image_provider: string | null;
      image_public_id: string | null;
      image_url: string | null;
    }>(
      "select image_provider,image_public_id,image_url from menu_items where id=$1",
      [itemId],
    );
    const first = requiredRow(firstStored.rows, "First image metadata");
    if (
      first.image_provider !== "cloudinary" ||
      !first.image_public_id?.startsWith(
        "joy-corner/staging/menu-items/",
      ) ||
      !first.image_url?.startsWith("https://")
    ) {
      throw new Error("First upload metadata was not stored safely.");
    }
    for (const [role, roleCookieValue] of Object.entries(sessions)) {
      if ((await menuImage(legacyId, roleCookieValue)) !== first.image_url) {
        throw new Error(`${role} menu did not receive the uploaded image.`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const replacement = await request(
      `/owner/menu/items/${encodeURIComponent(itemId)}/image`,
      { body: JSON.stringify({ dataUrl: secondImage }), method: "PUT" },
      cookie,
    );
    if (!replacement.ok) {
      throw new Error(
        `Image replacement failed (${replacement.status}, ${await safeFailure(replacement)}).`,
      );
    }
    const secondStored = await client.query<{
      image_public_id: string | null;
      image_url: string | null;
    }>(
      "select image_public_id,image_url from menu_items where id=$1",
      [itemId],
    );
    const second = requiredRow(secondStored.rows, "Replacement image metadata");
    if (
      !second.image_public_id ||
      second.image_public_id === first.image_public_id ||
      !second.image_url ||
      second.image_url === first.image_url
    ) {
      throw new Error("Replacement did not use a distinct staged asset.");
    }
    for (const [role, roleCookieValue] of Object.entries(sessions)) {
      if ((await menuImage(legacyId, roleCookieValue)) !== second.image_url) {
        throw new Error(`${role} menu did not receive the replacement image.`);
      }
    }

    const removal = await request(
      `/owner/menu/items/${encodeURIComponent(itemId)}/image`,
      { method: "DELETE" },
      cookie,
    );
    if (!removal.ok) {
      throw new Error(`Image removal failed (${removal.status}).`);
    }
    cleanupCookie = "";
    const removed = await client.query<{
      image_provider: string | null;
      image_public_id: string | null;
      image_url: string | null;
    }>(
      "select image_provider,image_public_id,image_url from menu_items where id=$1",
      [itemId],
    );
    const removedImage = requiredRow(removed.rows, "Removed image metadata");
    if (
      removedImage.image_provider !== null ||
      removedImage.image_public_id !== null ||
      removedImage.image_url !== null ||
      (await menuImage(legacyId)) !== null
    ) {
      throw new Error("Fallback image state was not restored.");
    }

    const historicalAfter = await client.query<{ digest: string }>(
      `select md5(
         coalesce(
           string_agg(
             id::text || ':' || coalesce(image_url_snapshot,'<null>'),
             '|' order by id
           ),
           ''
         )
       ) as digest
       from order_items`,
    );
    const auditAfter = await client.query<{ count: string }>(
      `select count(*)::text as count
       from audit_logs
       where entity_id=$1
         and action in ('replace_product_image','remove_product_image')`,
      [itemId],
    );
    const auditDelta =
      Number(requiredRow(auditAfter.rows, "Final audit count").count) -
      Number(requiredRow(auditBefore.rows, "Initial audit count").count);
    if (
      requiredRow(historicalAfter.rows, "Final historical digest").digest !==
        requiredRow(historicalBefore.rows, "Initial historical digest").digest ||
      auditDelta !== 3
    ) {
      throw new Error("Image history or audit verification failed.");
    }

    console.log(
      JSON.stringify({
        accountMetadata: "PASS",
        auditEvents: auditDelta,
        baristaProjection: "PASS",
        cashierProjection: "PASS",
        customerProjection: "PASS",
        fallbackRestored: true,
        folder: "joy-corner/staging/menu-items",
        historicalSnapshotsUnchanged: true,
        ownerProjection: "PASS",
        remove: "PASS",
        replace: "PASS",
        result: "PASS",
        stagingDatabase: target.database,
        upload: "PASS",
      }),
    );
  } finally {
    if (cleanupCookie && itemId) {
      await request(
        `/owner/menu/items/${encodeURIComponent(itemId)}/image`,
        { method: "DELETE" },
        cleanupCookie,
      ).catch(() => undefined);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
