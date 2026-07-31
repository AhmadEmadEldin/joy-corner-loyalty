import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { chromium, type Page } from "@playwright/test";

dotenv.config({ path: [".env.local", ".env"] });

const baseUrl = process.env.UI_REVIEW_URL || "http://localhost:8081";
const outputDirectory = path.resolve("artifacts/ui-redesign-screenshots");

function required(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
}

async function sanitize(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("code").forEach((element) => {
      element.textContent = "••••••••";
    });
    document
      .querySelectorAll<HTMLInputElement>(
        'input[type="email"], input[type="tel"], input[name*="phone" i]',
      )
      .forEach((element) => {
        element.value = "";
      });
  });
}

async function capture(page: Page, name: string, fullPage = false) {
  await sanitize(page);
  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  if (
    layout.bodyWidth > layout.viewportWidth + 1 ||
    layout.documentWidth > layout.viewportWidth + 1
  ) {
    throw new Error(`${name} has horizontal overflow.`);
  }
  await page.screenshot({
    animations: "disabled",
    fullPage,
    path: path.join(outputDirectory, `${name}.png`),
  });
}

async function staffScreenshots() {
  const browser = await chromium.launch({ headless: true });
  try {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { height: 960, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(baseUrl);
  await page.getByLabel("Email").fill("owner@joycorner.com");
  await page
    .locator('input[name="password"]')
    .fill(required("STAGING_OWNER_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Today at Joy Corner").waitFor();
  const sections = [
    ["Overview", "desktop-owner-overview"],
    ["New Order", "desktop-pos"],
    ["Cashier", "desktop-cashier"],
    ["Kitchen", "desktop-barista"],
    ["Orders", "desktop-orders"],
    ["Customers", "desktop-customers"],
    ["Rewards", "desktop-rewards"],
    ["Vouchers", "desktop-vouchers"],
    ["Menu & Images", "desktop-menu-manager"],
    ["Analytics", "desktop-analytics"],
    ["End of Day", "desktop-end-day"],
    ["System", "desktop-system"],
  ] as const;
  for (const [label, fileName] of sections) {
    await page
      .getByRole("navigation", { name: "Staff navigation" })
      .getByRole("button", { name: label })
      .click();
    if (label === "New Order") {
      await page.locator(".compact-menu > button").first().waitFor();
    }
    if (label === "Menu & Images") {
      await page.getByText(/\d+ products.*\d+ missing images/).waitFor();
    }
    await settle(page);
    await capture(page, fileName);
  }
  await page.setViewportSize({ height: 1024, width: 820 });
  for (const [label, fileName] of [
    ["New Order", "tablet-pos"],
    ["Cashier", "tablet-cashier"],
    ["Kitchen", "tablet-barista"],
    ["Menu & Images", "tablet-menu-manager"],
  ] as const) {
    await page.getByRole("button", { name: "Open staff navigation" }).click();
    await page
      .getByRole("dialog", { name: "Staff navigation" })
      .getByRole("button", { name: label })
      .click();
    if (label === "New Order") {
      await page.locator(".compact-menu > button").first().waitFor();
    }
    if (label === "Menu & Images") {
      await page.getByText(/\d+ products.*\d+ missing images/).waitFor();
    }
    await settle(page);
    await capture(page, fileName);
  }
  if (browserErrors.length) {
    throw new Error(`Staff browser emitted ${browserErrors.length} page errors.`);
  }
  } finally {
    await browser.close();
  }
}

async function customerScreenshots() {
  const browser = await chromium.launch({ headless: true });
  let screenshotCount = 0;
  try {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`${baseUrl}/order`);
  await settle(page);
  await capture(page, "mobile-sign-in");
  screenshotCount += 1;
  await page.getByRole("button", { name: /Create account/ }).click();
  await capture(page, "mobile-sign-up");
  screenshotCount += 1;
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByLabel("Email").fill("staging.customer@example.com");
  await page.locator('input[name="password"]').fill(
    required("STAGING_CUSTOMER_PASSWORD"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("navigation", { name: "Customer mobile navigation" }).waitFor();
  const directSections = [
    ["Home", "mobile-home"],
    ["Menu", "mobile-menu"],
    ["My orders", "mobile-orders"],
    ["Rewards", "mobile-rewards"],
  ] as const;
  for (const [label, fileName] of directSections) {
    await page
      .getByRole("navigation", { name: "Customer mobile navigation" })
      .getByRole("button", { exact: true, name: label })
      .click();
    await settle(page);
    await capture(page, fileName);
    screenshotCount += 1;
  }
  await page
    .getByRole("navigation", { name: "Customer mobile navigation" })
    .getByRole("button", { exact: true, name: "Menu" })
    .click();
  await page.getByRole("button", { name: /^Customize / }).first().click();
  await capture(page, "mobile-product-details", false);
  screenshotCount += 1;
  await page.getByRole("button", { name: /Add to order/ }).click();
  await page.locator(".mobile-cart-button").click();
  await page.getByRole("dialog", { name: "Your order" }).waitFor();
  await capture(page, "mobile-cart", false);
  screenshotCount += 1;
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page
    .getByRole("dialog", { name: "Complete your Joy Corner order" })
    .waitFor();
  await capture(page, "mobile-checkout", false);
  screenshotCount += 1;
  await page.getByRole("button", { name: "Close checkout" }).click();
  await page
    .getByRole("navigation", { name: "Customer mobile navigation" })
    .getByRole("button", { exact: true, name: "My orders" })
    .click();
  const trackingButton = page.getByRole("button", { name: "Track & view" }).first();
  if (await trackingButton.isVisible().catch(() => false)) {
    await trackingButton.click();
    await capture(page, "mobile-tracking", false);
    screenshotCount += 1;
    await page.getByRole("button", { name: "All orders" }).click();
  }
  const drawerSections = [
    ["Receipts", "mobile-receipts"],
    ["Unpaid receipts", "mobile-unpaid"],
    ["Vouchers", "mobile-vouchers"],
    ["Notifications", "mobile-notifications"],
    ["Profile", "mobile-account"],
  ] as const;
  for (const [label, fileName] of drawerSections) {
    await page.getByRole("button", { name: "More customer sections" }).click();
    await page
      .getByRole("dialog", { name: "Customer navigation" })
      .getByRole("button", { exact: true, name: label })
      .click();
    await settle(page);
    await capture(page, fileName);
    screenshotCount += 1;
  }
  if (browserErrors.length) {
    throw new Error(
      `Customer browser emitted ${browserErrors.length} page errors.`,
    );
  }
  } finally {
    await browser.close();
  }
  return screenshotCount;
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  await staffScreenshots();
  const mobile = await customerScreenshots();
  console.log(
    JSON.stringify({
      desktop: 12,
      mobile,
      output: "artifacts/ui-redesign-screenshots",
      result: "PASS",
      tablet: 4,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UI capture failed.");
  process.exitCode = 1;
});
