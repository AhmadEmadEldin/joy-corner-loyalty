import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

const apiBase = "http://127.0.0.1:3001/api";

async function responseJson(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error || `HTTP ${response.status}`));
  }
  return body;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Staging menu import is blocked in production.");
  }
  if (process.env.STAGING_MENU_CONFIRM !== "APPLY MENU IMPORT") {
    throw new Error(
      "Set STAGING_MENU_CONFIRM=APPLY MENU IMPORT for this staging-only run.",
    );
  }
  const password = process.env.STAGING_OWNER_PASSWORD;
  if (!password) throw new Error("STAGING_OWNER_PASSWORD is not configured.");
  const login = await fetch(`${apiBase}/auth/login`, {
    body: JSON.stringify({
      email: "owner@joycorner.com",
      password,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  await responseJson(login);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Owner session cookie was not issued.");
  const source = JSON.parse(
    await fs.readFile(
      path.resolve(process.cwd(), "data", "menu.normalized.json"),
      "utf8",
    ),
  ) as unknown;
  const previewResponse = await fetch(`${apiBase}/owner/menu/import/preview`, {
    body: JSON.stringify({ source }),
    headers: { "Content-Type": "application/json", Cookie: cookie },
    method: "POST",
  });
  const previewBody = await responseJson(previewResponse);
  const preview = previewBody.preview as {
    additions: Array<{ id: string; name: string }>;
    archives: Array<{ id: string; name: string }>;
    digest: string;
    errors: unknown[];
    priceChanges: unknown[];
    updates: unknown[];
    warnings: unknown[];
  };
  if (preview.errors.length || preview.warnings.length) {
    throw new Error("Staging menu preview contains validation findings.");
  }
  if (preview.additions.length !== 0) {
    throw new Error(
      `Expected no new product identities; preview found ${preview.additions.length}.`,
    );
  }
  if (
    preview.archives.length !== 1 ||
    preview.archives[0]?.id !== "ITEM-0039" ||
    preview.archives[0]?.name !== "Sahlab"
  ) {
    throw new Error("Preview did not contain the single expected Sahlab archive.");
  }
  const applyResponse = await fetch(`${apiBase}/owner/menu/import/apply`, {
    body: JSON.stringify({
      confirmation: "APPLY MENU IMPORT",
      digest: preview.digest,
      source,
    }),
    headers: { "Content-Type": "application/json", Cookie: cookie },
    method: "POST",
  });
  const result = (await responseJson(applyResponse)).result;
  console.log(
    JSON.stringify({
      applied: true,
      preview: {
        additions: preview.additions.length,
        archives: preview.archives.length,
        priceChanges: preview.priceChanges.length,
        updates: preview.updates.length,
      },
      result,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
