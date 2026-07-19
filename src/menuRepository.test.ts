import {
  findNormalizedMenuItem,
  normalizedMenu,
  parseLiveMenuSizes,
  resolveLiveMenuPrice,
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

  it("parses editable Google Sheet prices into predictable live sizes", () => {
    expect(parseLiveMenuSizes("59 / 69 / 79", "ITEM-0002")).toEqual([
      expect.objectContaining({ price: 59, size: "Small" }),
      expect.objectContaining({ price: 69, size: "Medium" }),
      expect.objectContaining({ price: 79, size: "Large" }),
    ]);
  });

  it("resolves a selected price from a live Sheet menu item", () => {
    const sizes = parseLiveMenuSizes("34 / 39", "ITEM-0001", [
      "Single",
      "Double",
    ]);
    expect(
      resolveLiveMenuPrice(
        {
          category: "Hot Beverages",
          itemId: "ITEM-0001",
          itemName: "Turkish Coffee",
          name: "Turkish Coffee",
          sizes,
          standardSize: "Single",
        },
        "Double",
      ),
    ).toMatchObject({ itemId: "ITEM-0001", price: 39, size: "Double" });
  });
});
