import { NormalizedMenuItem } from "../../src/menuRepository";
import { menuItemSequenceId, slugId } from "./ids";

export type NormalizedMenuSeed = {
  categories: Record<string, unknown>[];
  extras: Record<string, unknown>[];
  flavors: Record<string, unknown>[];
  itemIdMap: Map<string, string>;
  items: Record<string, unknown>[];
  sizes: Record<string, unknown>[];
};

export function buildNormalizedMenuSeed(
  menu: NormalizedMenuItem[],
  now = new Date(),
): NormalizedMenuSeed {
  const timestamp = now.toISOString();
  const categories = new Map<string, Record<string, unknown>>();
  const extras = new Map<string, Record<string, unknown>>();
  const itemIdMap = new Map<string, string>();
  const items: Record<string, unknown>[] = [];
  const sizes: Record<string, unknown>[] = [];
  const flavors: Record<string, unknown>[] = [];

  menu.forEach((item, itemIndex) => {
    const categoryId = slugId("CAT", item.categoryId || item.category);
    const itemId = menuItemSequenceId(itemIndex + 1);
    itemIdMap.set(item.itemId, itemId);

    if (!categories.has(categoryId)) {
      categories.set(categoryId, {
        active: "Yes",
        categoryId,
        categoryName: item.category,
        createdAt: timestamp,
        displayOrder: categories.size + 1,
        updatedAt: timestamp,
      });
    }

    items.push({
      active: item.active ? "Yes" : "No",
      categoryId,
      createdAt: timestamp,
      description: "",
      displayOrder: item.displayOrder || itemIndex + 1,
      ingredients: item.ingredients.join(", "),
      itemId,
      itemName: item.itemName,
      loyaltyEligible: "Yes",
      preparationStation: item.preparationStation,
      soldOut: item.soldOut ? "Yes" : "No",
      updatedAt: timestamp,
    });

    item.sizes.forEach((size, sizeIndex) => {
      sizes.push({
        active: size.active ? "Yes" : "No",
        createdAt: timestamp,
        displayOrder: sizeIndex + 1,
        isDefault: size.size === item.standardSize ? "Yes" : "No",
        itemId,
        priceEgp: size.price,
        sizeId: `${itemId}-SIZE-${String(sizeIndex + 1).padStart(3, "0")}`,
        sizeName: size.sizeName || size.size,
        updatedAt: timestamp,
      });
    });

    item.flavors.forEach((flavor, flavorIndex) => {
      flavors.push({
        active: flavor.active ? "Yes" : "No",
        displayOrder: flavorIndex + 1,
        flavorId: `${itemId}-FLAVOR-${String(flavorIndex + 1).padStart(3, "0")}`,
        flavorName: flavor.name,
        itemId,
        priceAdjustmentEgp: 0,
      });
    });

    item.availableExtras.forEach((extra) => {
      const extraId = slugId("EXTRA", extra.extraId || extra.name);
      if (extras.has(extraId)) return;
      extras.set(extraId, {
        active: extra.active ? "Yes" : "No",
        createdAt: timestamp,
        displayOrder: extras.size + 1,
        extraId,
        extraName: extra.name,
        priceEgp: extra.price,
        updatedAt: timestamp,
      });
    });
  });

  return {
    categories: Array.from(categories.values()),
    extras: Array.from(extras.values()),
    flavors,
    itemIdMap,
    items,
    sizes,
  };
}

export function authoritativePriceForSize(options: {
  itemId: string;
  menu: NormalizedMenuSeed;
  sizeId: string;
}) {
  const row = options.menu.sizes.find(
    (size) =>
      String(size.itemId) === options.itemId &&
      String(size.sizeId) === options.sizeId &&
      String(size.active || "Yes").toLowerCase() !== "no",
  );
  if (!row) return null;
  const price = Number(row.priceEgp);
  return Number.isFinite(price) ? price : null;
}
