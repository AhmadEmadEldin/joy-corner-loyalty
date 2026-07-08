import rawMenu from "./joy_corner_menu_with_sizes.json";

export type MenuSize = {
  price: number;
  size: string;
  sizeId: string;
};

export type NormalizedMenuItem = {
  active: boolean;
  category: string;
  categoryId: string;
  currency: string;
  displayOrder: number;
  itemId: string;
  itemName: string;
  name: string;
  preparationStation: "barista" | "kitchen";
  priceText: string;
  sizes: MenuSize[];
  standardSize: string;
  suggestedPrice: string;
};

type RawMenu = {
  brand?: string;
  currency?: string;
  categories?: RawCategory[];
};

type RawCategory = {
  items?: RawItem[];
  name?: string;
};

type RawItem = {
  flavors?: unknown[];
  ingredients?: unknown[];
  name?: string;
  price?: number;
  sizes?: Array<{
    price?: number;
    size?: string;
  }>;
};

const menuSource = rawMenu as RawMenu;

export const normalizedMenu = normalizeMenu(menuSource);

export function normalizeMenu(menu: RawMenu): NormalizedMenuItem[] {
  const currency = menu.currency || "EGP";
  return (menu.categories || []).flatMap((category, categoryIndex) => {
    const categoryName = cleanValue(category.name) || "Menu";
    const categoryId = stableId(categoryName);

    return (category.items || []).map((item, itemIndex) => {
      const itemName = cleanValue(item.name) || `Item ${itemIndex + 1}`;
      const sizes = normalizeSizes(item);
      const standardSize =
        sizes.find((size) => size.size.toLowerCase() === "medium")?.size ||
        sizes[0]?.size ||
        "Standard";
      const suggestedPrice =
        sizes.find((size) => size.size === standardSize)?.price || sizes[0]?.price || 0;

      return {
        active: true,
        category: categoryName,
        categoryId,
        currency,
        displayOrder: categoryIndex * 1000 + itemIndex,
        itemId: `${categoryId}-${stableId(itemName)}`,
        itemName,
        name: itemName,
        preparationStation: stationForCategory(categoryName),
        priceText: sizes.map((size) => `${size.size} ${size.price}`).join(" / "),
        sizes,
        standardSize,
        suggestedPrice: suggestedPrice ? String(suggestedPrice) : "",
      };
    });
  });
}

export function findNormalizedMenuItem(itemId: string, itemName = "") {
  const id = cleanValue(itemId);
  const name = cleanValue(itemName).toLowerCase();
  return normalizedMenu.find((item) => {
    if (id && item.itemId === id) return true;
    return Boolean(name && item.itemName.toLowerCase() === name);
  });
}

export function resolveMenuPrice(itemId: string, size: string, itemName = "") {
  const item = findNormalizedMenuItem(itemId, itemName);
  if (!item) return null;

  const selectedSize = cleanValue(size);
  const menuSize =
    item.sizes.find((entry) => entry.size === selectedSize) ||
    item.sizes.find((entry) => entry.size === item.standardSize) ||
    item.sizes[0];

  if (!menuSize) return null;

  return {
    category: item.category,
    itemId: item.itemId,
    itemName: item.itemName,
    price: menuSize.price,
    size: menuSize.size,
  };
}

function normalizeSizes(item: RawItem): MenuSize[] {
  const rawSizes = item.sizes?.length
    ? item.sizes
    : [{ price: item.price || 0, size: "Standard" }];

  return rawSizes
    .map((size) => {
      const label = cleanValue(size.size) || "Standard";
      const price = Number(size.price || 0);
      return {
        price: Number.isFinite(price) ? price : 0,
        size: label,
        sizeId: stableId(label),
      };
    })
    .filter((size) => size.price > 0);
}

function stationForCategory(category: string) {
  return /food|dessert|sandwich|bakery|croissant|waffle|cake/i.test(category)
    ? "kitchen"
    : "barista";
}

function stableId(value: string) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanValue(value: unknown) {
  return String(value ?? "").trim();
}
