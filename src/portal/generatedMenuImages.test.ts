import {
  normalizeMenuImageKey,
  resolveMenuImage,
} from "./generatedMenuImages";

describe("generated menu image resolver", () => {
  it("keeps owner uploads ahead of Joy Corner defaults", () => {
    expect(
      resolveMenuImage({
        category: "Hot Beverages",
        name: "Cappuccino",
        ownerImageUrl: "/owner/cappuccino.webp",
      }),
    ).toEqual({ source: "owner", src: "/owner/cappuccino.webp" });
  });

  it("maps database aliases to the matching supplied-board photograph", () => {
    expect(
      resolveMenuImage({
        category: "Hot Beverages",
        name: "American Black",
      }),
    ).toEqual(expect.objectContaining({ source: "generated" }));
  });

  it("normalizes punctuation without changing visible product data", () => {
    expect(normalizeMenuImageKey("  Espresso—Con Panna  ")).toBe(
      "espresso con panna",
    );
  });

  it("uses the reusable branded cup for an unmapped smoothie", () => {
    const result = resolveMenuImage({
      category: "Smoothies",
      name: "A database-only smoothie",
    });
    expect(result.source).toBe("generated");
    expect(result.src).toContain("data:image/svg+xml");
    expect(decodeURIComponent(result.src)).toContain("MIXED FRUIT");
  });

  it("colors and labels the same branded cup for berry drinks", () => {
    const result = resolveMenuImage({
      category: "Smoothies",
      name: "Mixed Berries Smoothie",
    });
    expect(result.source).toBe("generated");
    expect(decodeURIComponent(result.src)).toContain("#a92e4f");
    expect(decodeURIComponent(result.src)).toContain("BERRIES");
  });

  it.each(["Frappes", "Cocktails"])(
    "uses the reusable cup system for %s",
    (category) => {
      const result = resolveMenuImage({ category, name: `Mango ${category}` });
      expect(result.source).toBe("generated");
      expect(decodeURIComponent(result.src)).toContain("#f3a51f");
      expect(decodeURIComponent(result.src)).toContain("MANGO");
    },
  );

  it.each(["Iced Drinks", "Juices", "Shakes", "Soft Drinks"])(
    "replaces old cold-drink artwork with the receipt-logo cup for %s",
    (category) => {
      const result = resolveMenuImage({ category, name: `House ${category}` });
      const artwork = decodeURIComponent(result.src);
      expect(result.source).toBe("generated");
      expect(artwork).toContain("joy-cold-cup");
    },
  );

  it("replaces the old iced-coffee asset with the reusable logo cup", () => {
    const result = resolveMenuImage({ category: "Iced Drinks", name: "Iced Coffee" });
    expect(result.src).toContain("data:image/svg+xml");
    expect(result.src).not.toContain("cold-beverages/iced-coffee");
  });

  it.each([
    ["Americano", "#2d1710", "joy-hot-cup"],
    ["Hot Chocolate", "#4f2d22", "Chocolate"],
    ["Green Tea", "#718b45", "Leaf"],
  ])("uses a white hot cup with suitable artwork for %s", (name, color, marker) => {
    const result = resolveMenuImage({ category: "Hot Beverages", name });
    const artwork = decodeURIComponent(result.src);
    expect(result.source).toBe("generated");
    expect(artwork).toContain(color);
    expect(artwork).toContain(marker === "joy-hot-cup" ? marker : color);
  });

  it("uses the steaming white cup for Hot Matcha", () => {
    const result = resolveMenuImage({ category: "Matcha", name: "Hot Matcha" });
    const artwork = decodeURIComponent(result.src);
    expect(artwork).toContain("joy-hot-cup");
    expect(artwork).toContain("#718b45");
  });

  it.each([
    "Ice Matcha Cubes",
    "Frappe Matcha",
    "Matcha Strawberry",
    "Matcha Mango",
  ])("uses the transparent iced cup for %s", (name) => {
    const result = resolveMenuImage({ category: "Matcha", name });
    const artwork = decodeURIComponent(result.src);
    expect(artwork).toContain("joy-cold-cup");
    expect(artwork).toContain("#78934d");
  });

  it.each([
    ["Flavor", "FLAVOR SYRUP"],
    ["Espresso", "ESPRESSO SHOT"],
    ["Whipped Cream", "WHIPPED CREAM"],
    ["Pistachio", "PISTACHIO"],
    ["Nutella", "HAZELNUT"],
    ["White Chocolate", "WHITE CHOCOLATE"],
    ["Lotes", "LOTUS BISCUIT"],
    ["Puree", "FRUIT PUREE"],
  ])("uses suitable extras clipart for %s", (name, label) => {
    const result = resolveMenuImage({ category: "Extras", name });
    expect(decodeURIComponent(result.src)).toContain(label);
  });

  it("uses a pearl cup illustration for boba extras", () => {
    const result = resolveMenuImage({ category: "Extra Boba", name: "Boba Flavor" });
    expect(decodeURIComponent(result.src)).toContain("BOBA");
  });
});
