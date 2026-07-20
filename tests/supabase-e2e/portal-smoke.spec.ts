import { expect, test } from "@playwright/test";

test("Supabase staff portal loads its lazy route", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Staff sign in" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Customer ordering" }),
  ).toHaveAttribute("href", "/order");
  expect(pageErrors).toEqual([]);
});

test("Supabase customer portal loads its lazy route without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/order", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
