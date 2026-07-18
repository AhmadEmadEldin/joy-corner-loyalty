import {
  findNormalizedMenuItem,
  normalizedMenu,
  parseLiveMenuPrices,
  resolveMenuPrice,
  validateNormalizedMenu,
} from "./menuRepository";

describe("menuRepository", () => {
  it("normalizes the Joy Corner menu JSON into stable item records", () => {
    expect(normalizedMenu.length).toBeGreaterThan(50);
    expect(normalizedMenu[0]).toMatchObject({
      active: true,
      category: "Hot Beverages",
      itemId: "hot-beverages-turkish-coffee",
      itemName: "Turkish Coffee",
    });
  });

  it("resolves a size-specific price from the menu source of truth", () => {
    const latte = findNormalizedMenuItem("", "Latte");

    expect(latte).toBeTruthy();
    expect(resolveMenuPrice(latte?.itemId || "", "Medium")).toMatchObject({
      itemName: "Latte",
      price: 90,
      size: "Medium",
    });
  });

  it("falls back to the standard size when an unknown size is requested", () => {
    const cortado = findNormalizedMenuItem("", "Corto Classic");

    expect(resolveMenuPrice(cortado?.itemId || "", "Tiny")).toMatchObject({
      itemName: "Corto Classic",
      price: 65,
      size: "Standard",
    });
  });

  it("validates every normalized menu item against the domain schema", () => {
    expect(validateNormalizedMenu()).toHaveLength(normalizedMenu.length);
    expect(
      normalizedMenu.every((item) => item.sizes.every((size) => size.sizeId)),
    ).toBe(true);
  });

  it("parses the live Sheet multi-price format without inventing a trusted price", () => {
    expect(
      parseLiveMenuPrices("70 / 85 / 100", ["Small", "Medium", "Large"]),
    ).toMatchObject([
      { price: 70, size: "Small" },
      { price: 85, size: "Medium" },
      { price: 100, size: "Large" },
    ]);
    expect(parseLiveMenuPrices("45 / 60")).toMatchObject([
      { price: 45, size: "Option 1" },
      { price: 60, size: "Option 2" },
    ]);
  });
});
