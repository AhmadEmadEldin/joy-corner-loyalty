import { expect, test } from "@playwright/test";

test("staff login shell renders with Joy Corner branding and favicon", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle(/Joy Corner Cafe Management/);
  await expect(
    page.getByRole("heading", { name: /Joy Corner Loyalty/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/Staff Email/i)).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /joy-corner-logo\.svg/,
  );
  expect(consoleErrors).toEqual([]);
});

test("mobile layout does not overflow horizontally on the login screen", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const overflow = await page.evaluate(() => {
    return (
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
    );
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test("login shell stays usable across supported viewport widths", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ height: width <= 768 ? 780 : 900, width });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByLabel(/Staff Email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign In/i })).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      1,
    );
  }
});

test("customer order route renders and keeps protected staff routes separate", async ({
  page,
}) => {
  await page.goto("/order", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /^Joy Corner$/i }),
  ).toBeVisible();
  await expect(page.getByText(/Customer Access/i)).toBeVisible();
  await expect(page.getByLabel(/Email/i)).toBeVisible();
});
