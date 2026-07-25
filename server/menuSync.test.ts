jest.mock("./neon", () => ({
  neonConfigured: jest.fn(() => false),
  query: jest.fn(async () => []),
}));

jest.mock("./reporting/googleAuth", () => ({
  googleSheetsClient: jest.fn(() => ({
    spreadsheets: {
      values: {
        get: jest.fn(async () => ({ data: { values: [] } })),
      },
    },
  })),
}));

import {
  buildHeaderMap,
  buildCategories,
  normalizeRows,
  getMenuSyncResult,
  clearMenuSyncCache,
  type NormalizedMenuProduct,
} from "./menuSync";

function first<T>(arr: T[]): T {
  const v = arr[0];
  if (v === undefined) throw new Error("Expected first element but array is empty");
  return v;
}

describe("buildHeaderMap", () => {
  it("maps case-insensitive headers to canonical names", () => {
    const { map } = buildHeaderMap(["Name", "Description", "Category", "Price"]);
    expect(map.name).toBe(0);
    expect(map.description).toBe(1);
    expect(map.categoryName).toBe(2);
    expect(map.price).toBe(3);
  });

  it("resolves alias 'Product Name' to canonical 'name'", () => {
    const { map } = buildHeaderMap(["Product Name", "Category", "Price"]);
    expect(map.name).toBe(0);
  });

  it("resolves alias 'Item Name' to canonical 'name'", () => {
    const { map } = buildHeaderMap(["Item Name", "Category"]);
    expect(map.name).toBe(0);
  });

  it("resolves 'display order' to canonical 'sortOrder'", () => {
    const { map } = buildHeaderMap(["Name", "Display Order"]);
    expect(map.sortOrder).toBe(1);
  });

  it("reports missing required columns", () => {
    const { missingRequired } = buildHeaderMap(["Description", "Category"]);
    expect(missingRequired).toContain("name");
  });

  it("does not report missing required when alias matches", () => {
    const { missingRequired } = buildHeaderMap(["Product Name"]);
    expect(missingRequired).toHaveLength(0);
  });

  it("ignores unknown columns without error", () => {
    const { unknownColumns } = buildHeaderMap(["Name", "Random Column X", "Category"]);
    expect(unknownColumns).toContain("Random Column X");
    expect(unknownColumns).toHaveLength(1);
  });

  it("handles extra whitespace and mixed casing in headers", () => {
    const { map } = buildHeaderMap(["  Name  ", "PRODUCT NAME ", "  Category  "]);
    expect(map.name).toBe(0);
    expect(map.categoryName).toBe(2);
  });

  it("handles snake_case headers", () => {
    const { map } = buildHeaderMap(["product_name", "category_name", "sort_order"]);
    expect(map.name).toBe(0);
    expect(map.categoryName).toBe(1);
    expect(map.sortOrder).toBe(2);
  });

  it("maps Arabic name alias", () => {
    const { map } = buildHeaderMap(["Name", "Name AR", "Category"]);
    expect(map.name).toBe(0);
    expect(map.nameAr).toBe(1);
  });
});

describe("normalizeRows", () => {
  const simpleHeaders = ["Name", "Category", "Price", "Available", "Sort Order"];
  const { map } = buildHeaderMap(simpleHeaders);

  function makeRow(values: string[]): Record<string, string> {
    const row: Record<string, string> = {};
    values.forEach((v, i) => (row[String(i)] = v));
    return row;
  }

  it("normalizes basic product data", () => {
    const rows = [makeRow(["Turkish Coffee", "Hot Beverages", "59", "Yes", "1"])];
    const { products, errors } = normalizeRows(rows, map);

    expect(errors).toHaveLength(0);
    expect(products.size).toBe(1);

    const product = first(Array.from(products.values()));
    expect(product.name).toBe("Turkish Coffee");
    expect(product.categoryName).toBe("Hot Beverages");
    expect(product.available).toBe(true);
    expect(product.sortOrder).toBe(1);
    expect(product.sizes).toHaveLength(1);
    expect(product.sizes[0]!.name).toBe("Standard");
    expect(product.sizes[0]!.price).toBe(59);
  });

  it("skips rows with no name and no id", () => {
    const rows = [makeRow(["", "Hot", "59"])];
    const { products } = normalizeRows(rows, map);
    expect(products.size).toBe(0);
  });

  it("reports error when name is missing but id exists", () => {
    const idHeaders = ["Product ID", "Name", "Category", "Price"];
    const { map: idMap } = buildHeaderMap(idHeaders);
    const rows = [makeRow(["ITEM-001", "", "Hot", "59"])];
    const { errors } = normalizeRows(rows, idMap);
    expect(errors.some((e) => e.includes("missing product name"))).toBe(true);
  });

  it("deduplicates product IDs by merging sizes", () => {
    const rows = [
      makeRow(["Latte", "Hot Beverages", "70", "Yes", "1"]),
      makeRow(["Latte", "Hot Beverages", "90", "Yes", "1"]),
    ];
    const { products } = normalizeRows(rows, map);
    expect(products.size).toBe(1);

    const product = first(Array.from(products.values()));
    expect(product.sizes).toHaveLength(2);
    expect(product.sizes[0]!.price).toBe(70);
    expect(product.sizes[1]!.price).toBe(90);
  });

  it("merges modifiers from duplicate product rows", () => {
    const modifierHeaders = ["Name", "Category", "Price", "Modifier Name", "Price Adjustment"];
    const { map: modMap } = buildHeaderMap(modifierHeaders);

    const rows = [
      makeRow(["Latte", "Hot Beverages", "70", "Extra Shot", "15"]),
      makeRow(["Latte", "Hot Beverages", "70", "Oat Milk", "10"]),
    ];
    const { products } = normalizeRows(rows, modMap);

    const product = first(Array.from(products.values()));
    expect(product.modifiers).toHaveLength(2);
    expect(product.modifiers![0]!.name).toBe("Extra Shot");
    expect(product.modifiers![0]!.priceAdjustment).toBe(15);
    expect(product.modifiers![1]!.name).toBe("Oat Milk");
    expect(product.modifiers![1]!.priceAdjustment).toBe(10);
  });

  it("normalizes boolean fields from various representations", () => {
    const headers = ["Name", "Category", "Available", "Featured", "Archived"];
    const { map: boolMap } = buildHeaderMap(headers);

    const rows = [
      makeRow(["Active Item", "Cat", "Yes", "Yes", "No"]),
      makeRow(["Inactive Item", "Cat", "no", "0", "false"]),
      makeRow(["Archived Item", "Cat", "inactive", "false", "yes"]),
    ];
    const { products } = normalizeRows(rows, boolMap);
    const items = Array.from(products.values());

    expect(items[0]!.available).toBe(true);
    expect(items[0]!.featured).toBe(true);
    expect(items[0]!.archived).toBe(false);

    expect(items[1]!.available).toBe(false);
    expect(items[1]!.featured).toBe(false);
    expect(items[1]!.archived).toBe(false);

    expect(items[2]!.available).toBe(false);
    expect(items[2]!.featured).toBe(false);
    expect(items[2]!.archived).toBe(true);
  });

  it("normalizes prices with commas and non-numeric values", () => {
    const headers = ["Name", "Category", "Price"];
    const { map: priceMap } = buildHeaderMap(headers);

    const rows = [
      makeRow(["Item A", "Cat", "1,250"]),
      makeRow(["Item B", "Cat", "not-a-price"]),
      makeRow(["Item C", "Cat", ""]),
    ];
    const { products } = normalizeRows(rows, priceMap);
    const items = Array.from(products.values());

    expect(items[0]!.sizes[0]!.price).toBe(1250);
    expect(items[1]!.sizes).toHaveLength(0);
    expect(items[2]!.sizes).toHaveLength(0);
  });

  it("generates a stable ID from category and name when no product ID provided", () => {
    const headers = ["Name", "Category", "Price"];
    const { map: autoIdMap } = buildHeaderMap(headers);

    const rows = [makeRow(["Turkish Coffee", "Hot Beverages", "59"])];
    const { products } = normalizeRows(rows, autoIdMap);

    const product = first(Array.from(products.values()));
    expect(product.id).toMatch(/^CAT-hot-beverages-turkish-coffee$/);
  });

  it("uses provided product ID when available", () => {
    const headers = ["Product ID", "Name", "Category", "Price"];
    const { map: idMap } = buildHeaderMap(headers);

    const rows = [makeRow(["ITEM-001", "Latte", "Hot", "70"])];
    const { products } = normalizeRows(rows, idMap);

    const product = first(Array.from(products.values()));
    expect(product.id).toBe("ITEM-001");
  });

  it("parses image data when present", () => {
    const headers = ["Name", "Category", "Price", "Image", "Zoom"];
    const { map: imgMap } = buildHeaderMap(headers);

    const rows = [makeRow(["Latte", "Hot", "70", "https://img.test/latte.jpg", "1.5"])];
    const { products } = normalizeRows(rows, imgMap);

    const product = first(Array.from(products.values()));
    expect(product.image).toBeDefined();
    expect(product.image!.url).toBe("https://img.test/latte.jpg");
    expect(product.image!.zoom).toBe(1.5);
    expect(product.image!.altText).toBe("Latte");
  });
});

describe("buildCategories", () => {
  it("extracts unique categories from products", () => {
    const products = new Map<string, NormalizedMenuProduct>();
    products.set("a", {
      id: "a", name: "Latte", categoryId: "CAT-hot", categoryName: "Hot Beverages", featured: false, available: true, archived: false, sortOrder: 1, sizes: [],
    });
    products.set("b", {
      id: "b", name: "Latte Macchiato", categoryId: "CAT-hot", categoryName: "Hot Beverages", featured: false, available: true, archived: false, sortOrder: 2, sizes: [],
    });
    products.set("c", {
      id: "c", name: "Coke", categoryId: "CAT-cold", categoryName: "Cold Beverages", featured: false, available: true, archived: false, sortOrder: 3, sizes: [],
    });

    const categories = buildCategories(products);
    expect(categories).toHaveLength(2);
    expect(categories[0]!.id).toBe("CAT-hot");
    expect(categories[0]!.name).toBe("Hot Beverages");
    expect(categories[1]!.id).toBe("CAT-cold");
    expect(categories[1]!.name).toBe("Cold Beverages");
  });

  it("preserves category sort order from product insertion order", () => {
    const products = new Map<string, NormalizedMenuProduct>();
    products.set("a", {
      id: "a", name: "Coke", categoryId: "CAT-cold", categoryName: "Cold", featured: false, available: true, archived: false, sortOrder: 1, sizes: [],
    });
    products.set("b", {
      id: "b", name: "Latte", categoryId: "CAT-hot", categoryName: "Hot", featured: false, available: true, archived: false, sortOrder: 2, sizes: [],
    });

    const categories = buildCategories(products);
    expect(categories[0]!.id).toBe("CAT-cold");
    expect(categories[1]!.id).toBe("CAT-hot");
  });
});

describe("getMenuSyncResult", () => {
  beforeEach(() => {
    clearMenuSyncCache();
  });

  it("returns a result with errors when Sheets env is not configured", async () => {
    delete process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    const result = await getMenuSyncResult(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.productCount).toBe(0);
  });

  it("serves from cache on subsequent calls", async () => {
    process.env.GOOGLE_SHEET_ID = "";

    await getMenuSyncResult(true);

    const cached = await getMenuSyncResult();
    expect(cached.fromCache).toBe(true);
  });

  it("respects forceRefresh to bypass cache", async () => {
    process.env.GOOGLE_SHEET_ID = "";

    await getMenuSyncResult(true);
    const refreshed = await getMenuSyncResult(true);
    expect(refreshed.fromCache).toBe(false);
  });
});
