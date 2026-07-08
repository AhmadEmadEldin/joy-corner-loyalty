import rawMenu from "./joy_corner_menu_with_sizes.json";

export type MenuSize = {
  active: boolean;
  menuItemId: string;
  price: number;
  size: string;
  sizeId: string;
  sizeName: string;
};

export type MenuFlavor = {
  active: boolean;
  flavorId: string;
  menuItemId: string;
  name: string;
};

export type MenuExtra = {
  active: boolean;
  extraId: string;
  name: string;
  price: number;
};

export type NormalizedMenuItem = {
  active: boolean;
  availability: string;
  availableExtras: MenuExtra[];
  category: string;
  categoryId: string;
  currency: string;
  displayOrder: number;
  flavors: MenuFlavor[];
  ingredients: string[];
  itemId: string;
  itemName: string;
  name: string;
  preparationStation: "barista" | "kitchen";
  priceText: string;
  sizes: MenuSize[];
  soldOut: boolean;
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
  extras?: unknown[];
  active?: boolean;
  availability?: string;
  image?: string;
  soldOut?: boolean;
  sold_out?: boolean;
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
      const itemId = `${categoryId}-${stableId(itemName)}`;
      const sizes = normalizeSizes(item, itemId);
      const standardSize =
        sizes.find((size) => size.size.toLowerCase() === "medium")?.size ||
        sizes[0]?.size ||
        "Standard";
      const suggestedPrice =
        sizes.find((size) => size.size === standardSize)?.price ||
        sizes[0]?.price ||
        0;

      const normalizedItem = {
        active: true,
        availability: cleanValue(item.availability) || "available",
        availableExtras: normalizeExtras(item.extras),
        category: categoryName,
        categoryId,
        currency,
        displayOrder: categoryIndex * 1000 + itemIndex,
        flavors: normalizeFlavors(item.flavors, itemId),
        ingredients: normalizeStringList(item.ingredients),
        itemId,
        itemName,
        name: itemName,
        preparationStation: stationForCategory(categoryName),
        priceText: sizes
          .map((size) => `${size.size} ${size.price}`)
          .join(" / "),
        sizes,
        soldOut: Boolean(item.soldOut || item.sold_out),
        standardSize,
        suggestedPrice: suggestedPrice ? String(suggestedPrice) : "",
      };

      return normalizedItem;
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

export function validateNormalizedMenu(
  menu: NormalizedMenuItem[] = normalizedMenu,
) {
  return menu.map((item) => {
    if (!item.itemId || !item.itemName || !item.categoryId || !item.category) {
      throw new Error(
        `Invalid menu item: ${item.itemId || item.itemName || "unknown"}`,
      );
    }
    if (!item.sizes.length) {
      throw new Error(`Menu item has no prices: ${item.itemName}`);
    }
    for (const size of item.sizes) {
      if (!size.sizeId || !size.size || size.price <= 0) {
        throw new Error(`Invalid menu size for ${item.itemName}`);
      }
    }
    return item;
  });
}

function normalizeSizes(item: RawItem, menuItemId: string): MenuSize[] {
  const rawSizes = item.sizes?.length
    ? item.sizes
    : [{ price: item.price || 0, size: "Standard" }];

  return rawSizes
    .map((size) => {
      const label = cleanValue(size.size) || "Standard";
      const price = Number(size.price || 0);
      return {
        active: true,
        menuItemId,
        price: Number.isFinite(price) ? price : 0,
        size: label,
        sizeId: stableId(label),
        sizeName: label,
      };
    })
    .filter((size) => size.price > 0);
}

function normalizeFlavors(flavors: unknown, menuItemId: string): MenuFlavor[] {
  return normalizeStringList(flavors).map((name) => ({
    active: true,
    flavorId: `${menuItemId}-${stableId(name)}`,
    menuItemId,
    name,
  }));
}

function normalizeExtras(extras: unknown): MenuExtra[] {
  if (!Array.isArray(extras)) return [];

  return extras
    .map((extra) => {
      if (typeof extra === "string") {
        return {
          active: true,
          extraId: stableId(extra),
          name: extra,
          price: 0,
        };
      }

      const record = extra as Record<string, unknown>;
      const name = cleanValue(record.name || record.extra || record.label);
      const price = Number(record.price || 0);
      return {
        active: true,
        extraId: stableId(cleanValue(record.extraId || record.id) || name),
        name,
        price: Number.isFinite(price) && price > 0 ? price : 0,
      };
    })
    .filter((extra) => extra.name);
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return cleanValue(entry);
      const record = entry as Record<string, unknown>;
      return cleanValue(
        record.name || record.flavor || record.ingredient || record.label,
      );
    })
    .filter(Boolean);
}

function stationForCategory(category: string): "barista" | "kitchen" {
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
