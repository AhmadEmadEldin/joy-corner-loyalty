import { buildHeaderMap, normalizeRows, buildCategories, getMenuSyncResult, clearMenuSyncCache } from "./menuSync";

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

function makeRow(values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  values.forEach((v, i) => (row[String(i)] = v));
  return row;
}

describe("Menu category filtering", () => {
  const headers = ["Name", "Category", "Price", "Available"];
  const { map } = buildHeaderMap(headers);

  it("extracts unique categories from menu products", () => {
    const rows = [
      makeRow(["Turkish Coffee", "Hot Beverages", "59", "Yes"]),
      makeRow(["Latte", "Hot Beverages", "70", "Yes"]),
      makeRow(["Cola", "Cold Beverages", "25", "Yes"]),
      makeRow(["Brownie", "Desserts", "45", "Yes"]),
    ];
    const { products } = normalizeRows(rows, map);
    const categories = buildCategories(products);
    expect(categories).toHaveLength(3);
    expect(categories.map((c) => c.name)).toEqual(["Hot Beverages", "Cold Beverages", "Desserts"]);
  });

  it("removes duplicate categories", () => {
    const rows = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Latte", "Hot", "70", "Yes"]),
      makeRow(["Espresso", "Hot", "45", "Yes"]),
    ];
    const { products } = normalizeRows(rows, map);
    const categories = buildCategories(products);
    expect(categories).toHaveLength(1);
    expect(categories[0]!.name).toBe("Hot");
  });

  it("'All' displays every available product", () => {
    const rows = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Cola", "Cold", "25", "Yes"]),
      makeRow(["Brownie", "Dessert", "45", "Yes"]),
    ];
    const { products } = normalizeRows(rows, map);
    const allProducts = Array.from(products.values());
    const visible = allProducts.filter((p) => p.available && !p.archived);
    expect(visible).toHaveLength(3);
  });

  it("selecting a category displays only matching products", () => {
    const rows = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Latte", "Hot", "70", "Yes"]),
      makeRow(["Cola", "Cold", "25", "Yes"]),
    ];
    const { products } = normalizeRows(rows, map);
    const selectedCategory = "Hot";
    const visible = Array.from(products.values()).filter(
      (p) => p.categoryName === selectedCategory && p.available && !p.archived,
    );
    expect(visible).toHaveLength(2);
    expect(visible.every((p) => p.categoryName === "Hot")).toBe(true);
  });

  it("category selection works after menu refresh", () => {
    const rows1 = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Cola", "Cold", "25", "Yes"]),
    ];
    const { products: products1 } = normalizeRows(rows1, map);
    const visible1 = Array.from(products1.values()).filter(
      (p) => p.categoryName === "Hot",
    );
    expect(visible1).toHaveLength(1);

    const rows2 = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Espresso", "Hot", "45", "Yes"]),
      makeRow(["Cola", "Cold", "25", "Yes"]),
    ];
    const { products: products2 } = normalizeRows(rows2, map);
    const visible2 = Array.from(products2.values()).filter(
      (p) => p.categoryName === "Hot",
    );
    expect(visible2).toHaveLength(2);
  });

  it("unavailable products remain hidden from customers", () => {
    const rows = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Secret Menu", "Hot", "100", "No"]),
    ];
    const { products } = normalizeRows(rows, map);
    const customerVisible = Array.from(products.values()).filter(
      (p) => p.available && !p.archived,
    );
    expect(customerVisible).toHaveLength(1);
    expect(customerVisible[0]!.name).toBe("Turkish Coffee");
  });

  it("owner can still view unavailable products", () => {
    const rows = [
      makeRow(["Turkish Coffee", "Hot", "59", "Yes"]),
      makeRow(["Secret Menu", "Hot", "100", "No"]),
    ];
    const { products } = normalizeRows(rows, map);
    const allProducts = Array.from(products.values());
    expect(allProducts).toHaveLength(2);
  });
});

describe("Menu categories from normalized data", () => {
  it("each product has valid categoryId and categoryName", () => {
    const headers = ["Name", "Category", "Price"];
    const { map } = buildHeaderMap(headers);
    const rows = [
      makeRow(["Turkish Coffee", "Hot Beverages", "59"]),
      makeRow(["Latte", "Hot Beverages", "70"]),
      makeRow(["Cola", "Cold Beverages", "25"]),
    ];
    const { products } = normalizeRows(rows, map);
    for (const product of products.values()) {
      expect(product.categoryId).toBeTruthy();
      expect(product.categoryName).toBeTruthy();
      expect(typeof product.categoryId).toBe("string");
      expect(typeof product.categoryName).toBe("string");
    }
  });
});

describe("getMenuSyncResult", () => {
  beforeEach(() => {
    clearMenuSyncCache();
  });

  it("returns fallback result when env not configured", async () => {
    delete process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const result = await getMenuSyncResult(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("serves from cache on subsequent calls", async () => {
    process.env.GOOGLE_SHEET_ID = "";
    await getMenuSyncResult(true);
    const cached = await getMenuSyncResult();
    expect(cached.fromCache).toBe(true);
  });
});
