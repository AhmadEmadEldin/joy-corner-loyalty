import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve("src/app.css"), "utf8");

test("phone size picker keeps every size visible and tappable", async ({
  page,
}) => {
  await page.setViewportSize({ height: 740, width: 390 });
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${css}</style>
    <main class="joy-portal staff-portal-shell">
      <div class="payment-modal-overlay size-picker-overlay">
        <section class="payment-modal size-picker-modal">
          <header><div><p>Choose a size</p><h2>French Coffee</h2></div><button class="size-picker-close">×</button></header>
          <div class="size-picker-options">
            <button class="size-option-button"><span><strong>Small</strong><small>Tap to add</small></span><b>EGP 35.00</b></button>
            <button class="size-option-button"><span><strong>Medium</strong><small>Tap to add</small></span><b>EGP 42.00</b></button>
            <button class="size-option-button"><span><strong>Large</strong><small>Tap to add</small></span><b>EGP 49.00</b></button>
          </div>
          <div class="payment-modal-actions size-picker-actions"><button>Cancel</button></div>
        </section>
      </div>
    </main>
  `);

  for (const label of ["Small", "Medium", "Large"]) {
    await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  }
  const modal = page.locator(".size-picker-modal");
  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(740);
});

test("cashier ticket stays readable and exposes separate product and size controls", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 390 });
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${css}</style>
    <main class="joy-portal staff-portal-shell">
      <section class="queue-grid">
        <article class="queue-ticket">
          <ul class="queue-item-list">
            <li>
              <span class="queue-item-summary">1 × Frappuccino · Standard</span>
              <span class="queue-item-editor">
                <label><span>Product</span><select aria-label="Replacement product"><option>Choose product…</option></select></label>
                <label><span>Size</span><select aria-label="Replacement size"><option>Choose size…</option></select></label>
                <button class="queue-apply-edit">Update item</button><button>−</button><button>+</button><button>Remove</button>
              </span>
            </li>
          </ul>
        </article>
      </section>
    </main>
  `);

  const summary = page.locator(".queue-item-summary");
  await expect(summary).toBeVisible();
  const summaryBox = await summary.boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.width).toBeGreaterThan(200);
  await expect(page.getByLabel("Replacement product")).toBeVisible();
  await expect(page.getByLabel("Replacement size")).toBeVisible();
  await expect(page.getByRole("button", { name: "Update item" })).toBeVisible();
});
