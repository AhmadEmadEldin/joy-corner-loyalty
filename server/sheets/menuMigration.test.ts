import { normalizedMenu } from "../../src/menuRepository";
import {
  authoritativePriceForSize,
  buildNormalizedMenuSeed,
} from "./menuMigration";
import { NORMALIZED_SHEET_HEADERS } from "./schema";

describe("normalized Google Sheets menu migration", () => {
  it("maps menu JSON into separate categories, items, and numeric sizes", () => {
    const seed = buildNormalizedMenuSeed(normalizedMenu);

    expect(seed.categories.length).toBeGreaterThan(0);
    expect(seed.items.length).toBe(normalizedMenu.length);
    expect(seed.sizes.length).toBeGreaterThan(seed.items.length);
    expect(seed.sizes.every((row) => Number.isFinite(row.priceEgp))).toBe(true);
    expect(seed.sizes.every((row) => String(row.priceEgp).includes("/"))).toBe(
      false,
    );
  });

  it("creates deterministic ITEM ids and resolves authoritative size prices", () => {
    const seed = buildNormalizedMenuSeed(normalizedMenu);
    const firstItem = seed.items[0];
    const firstSize = seed.sizes.find(
      (row) => row.itemId === firstItem?.itemId,
    );

    expect(firstItem?.itemId).toBe("ITEM-000001");
    expect(firstSize?.sizeId).toMatch(/^ITEM-000001-SIZE-/);
    expect(
      authoritativePriceForSize({
        itemId: String(firstItem?.itemId),
        menu: seed,
        sizeId: String(firstSize?.sizeId),
      }),
    ).toBe(Number(firstSize?.priceEgp));
  });

  it("defines the exact owner-facing workbook tabs", () => {
    expect(Object.keys(NORMALIZED_SHEET_HEADERS)).toEqual([
      "Dashboard",
      "Settings",
      "Staff",
      "Menu",
      "Customers",
      "Orders",
      "Order Items",
      "Payments",
      "Loyalty",
      "System Log",
    ]);
  });
});
