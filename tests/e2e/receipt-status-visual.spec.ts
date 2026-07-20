import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve("src/app.css"), "utf8");

function receiptMarkup(classes: string) {
  return `
    <article class="order-ticket ${classes}">
      <div class="barista-receipt-content">
        <div class="ticket-head">
          <div class="ticket-title">
            <strong>Receipt #REC-20260708-001</strong>
            <span class="muted">Mona</span>
          </div>
          <div class="actions">
            <span class="pill status-badge preparation-status-badge status-picked-up">Picked Up</span>
            <span class="pill status-badge payment-status-badge payment-unpaid">Unpaid</span>
          </div>
        </div>
        <div class="ticket-items"><div class="ticket-item"><span>Latte</span><span>x1</span></div></div>
        <div class="ticket-total"><span>Total</span><span>75 EGP</span></div>
      </div>
    </article>
  `;
}

test("receipt status colors and finished slash are scoped by view", async ({
  page,
}) => {
  await page.setContent(`
    <style>${css}</style>
    <main>
      ${receiptMarkup("barista-receipt status-accepted payment-awaiting")}
      ${receiptMarkup("barista-receipt status-picked-up payment-paid")}
      ${receiptMarkup("barista-receipt status-ready payment-unpaid is-finished")}
      ${receiptMarkup("orders-receipt status-ready payment-unpaid")}
      <span id="paid" class="pill payment-status-badge payment-paid">Paid</span>
      <span id="unpaid" class="pill payment-status-badge payment-unpaid">Unpaid</span>
      <span id="partial" class="pill payment-status-badge payment-partial">Partially Paid</span>
    </main>
  `);

  await expect(
    page.locator(".barista-receipt.status-accepted").first(),
  ).toHaveCSS("border-left-color", "rgb(249, 115, 22)");
  await expect(
    page.locator(".barista-receipt.status-picked-up").first(),
  ).toHaveCSS("border-left-color", "rgb(185, 28, 28)");
  await expect(page.locator("#paid")).toHaveCSS("color", "rgb(22, 101, 52)");
  await expect(page.locator("#unpaid")).toHaveCSS("color", "rgb(153, 27, 27)");
  await expect(page.locator("#partial")).toHaveCSS("color", "rgb(154, 52, 18)");

  const baristaSlash = await page
    .locator(".barista-receipt.is-finished")
    .evaluate((element) => getComputedStyle(element, "::after").content);
  const ordersSlash = await page
    .locator(".orders-receipt.status-ready")
    .evaluate((element) => getComputedStyle(element, "::after").content);

  expect(baristaSlash).toBe('""');
  expect(ordersSlash).toBe("none");
});
