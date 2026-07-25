import { googleSheetsClient } from "./reporting/googleAuth";
import { query, neonConfigured } from "./neon";

export type NormalizedMenuProduct = {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  categoryId: string;
  categoryName: string;
  categoryNameAr?: string;
  featured: boolean;
  available: boolean;
  archived: boolean;
  sortOrder: number;
  image?: {
    url?: string;
    storagePath?: string;
    altText?: string;
    positionX: number;
    positionY: number;
    zoom: number;
  };
  sizes: Array<{
    id: string;
    name: string;
    nameAr?: string;
    price: number;
    available: boolean;
  }>;
  modifiers?: Array<{
    id: string;
    name: string;
    nameAr?: string;
    priceAdjustment: number;
    available: boolean;
  }>;
};

export type MenuSyncResult = {
  products: NormalizedMenuProduct[];
  categories: Array<{ id: string; name: string; nameAr?: string; sortOrder: number }>;
  lastSyncedAt: string;
  productCount: number;
  categoryCount: number;
  unavailableCount: number;
  errors: string[];
  fromCache: boolean;
};

type RawRow = Record<string, string>;
type HeaderMap = Record<string, number>;

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "product name", "item name", "item_name", "product", "menu item"],
  nameAr: ["name ar", "namear", "arabic name", "product name ar", "item name ar"],
  description: ["description", "desc", "notes", "flavor notes", "flavor_notes"],
  descriptionAr: ["description ar", "desc ar", "descriptionar"],
  categoryId: ["category id", "categoryid", "category_id", "cat id"],
  categoryName: ["category", "category name", "categoryname", "category_name"],
  categoryNameAr: ["category name ar", "category ar", "categorynamear"],
  featured: ["featured", "is featured", "highlight", "promote"],
  available: ["available", "active", "in stock", "in_stock", "is available"],
  archived: ["archived", "is archived", "retired", "hidden"],
  sortOrder: ["sort order", "sortorder", "sort_order", "display order", "displayorder", "display_order", "order"],
  imageUrl: ["image", "image url", "imageurl", "image_url", "photo", "photo url", "img"],
  imageStoragePath: ["storage path", "storagepath", "storage_path", "image path"],
  imageAltText: ["alt text", "alttext", "alt_text", "image alt"],
  imagePositionX: ["position x", "positionx", "position_x", "x"],
  imagePositionY: ["position y", "positiony", "position_y", "y"],
  imageZoom: ["zoom", "scale"],
  sizeId: ["size id", "sizeid", "size_id"],
  sizeName: ["size", "size name", "sizename", "size_name"],
  sizeNameAr: ["size name ar", "size ar", "sizenamear"],
  price: ["price", "price egp", "base price", "unit price"],
  sizeAvailable: ["size available", "size active", "size in stock"],
  modifierId: ["modifier id", "modifierid", "modifier_id", "extra id", "extraid", "extra_id"],
  modifierName: ["modifier", "modifier name", "modifiername", "modifier_name", "extra", "extra name"],
  modifierNameAr: ["modifier name ar", "extra name ar"],
  priceAdjustment: ["price adjustment", "priceadjustment", "price_adjustment", "adjustment", "price diff"],
  modifierAvailable: ["modifier available", "modifier active", "extra available", "extra active"],
  productId: ["product id", "productid", "product_id", "item id", "itemid", "item_id", "id"],
};

const REQUIRED_COLUMNS = ["name"];

const SHEET_TAB = "Menu";
const SHEET_RANGE = `${SHEET_TAB}!A1:ZZ5000`;
const CACHE_TTL_MS = 5 * 60 * 1000;
const API_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

let cache: { result: MenuSyncResult; expiresAt: number } | null = null;

function normalizeHeader(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function findColumnIndex(
  headers: string[],
  canonicalName: string,
): number | null {
  const aliases = COLUMN_ALIASES[canonicalName] || [canonicalName];
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const idx = normalizedHeaders.indexOf(normalizedAlias);
    if (idx !== -1) return idx;
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const idx = normalizedHeaders.findIndex(
      (h) => h === normalizedAlias || h.replace(/[\s_-]/g, "") === normalizedAlias.replace(/[\s_-]/g, ""),
    );
    if (idx !== -1) return idx;
  }

  return null;
}

export function buildHeaderMap(headers: string[]): {
  map: HeaderMap;
  missingRequired: string[];
  unknownColumns: string[];
} {
  const map: HeaderMap = {};
  const missingRequired: string[] = [];
  const unknownColumns: string[] = [];
  const mappedAliases = new Set<string>();

  for (const canonical of Object.keys(COLUMN_ALIASES)) {
    const idx = findColumnIndex(headers, canonical);
    if (idx !== null) {
      map[canonical] = idx;
      mappedAliases.add(normalizeHeader(headers[idx]!));
    }
  }

  for (const required of REQUIRED_COLUMNS) {
    if (map[required] === undefined) {
      missingRequired.push(required);
    }
  }

  const allCanonicalAliases = new Set(
    Object.values(COLUMN_ALIASES).flatMap((aliases) => aliases.map(normalizeHeader)),
  );

  const normalizedHeaders = headers.map(normalizeHeader);
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const h = normalizedHeaders[i];
    if (!h) continue;
    if (mappedAliases.has(h)) continue;
    if (allCanonicalAliases.has(h)) continue;
    if (h.replace(/[\s_-]/g, "") === "") continue;
    unknownColumns.push(headers[i]!);
  }

  return { map, missingRequired, unknownColumns };
}

function cell(row: RawRow, headerMap: HeaderMap, canonical: string): string {
  const idx = headerMap[canonical];
  if (idx === undefined) return "";
  const value = row[String(idx)];
  return String(value ?? "").trim();
}

function boolCell(row: RawRow, headerMap: HeaderMap, canonical: string, fallback: boolean): boolean {
  const raw = cell(row, headerMap, canonical);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  return !["no", "false", "0", "inactive", "disabled", "archived"].includes(normalized);
}

function numCell(row: RawRow, headerMap: HeaderMap, canonical: string, fallback: number): number {
  const raw = cell(row, headerMap, canonical).replace(/,/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableId(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSizesFromRow(row: RawRow, headerMap: HeaderMap, productId: string): NormalizedMenuProduct["sizes"] {
  const sizeName = cell(row, headerMap, "sizeName");
  const price = numCell(row, headerMap, "price", 0);

  if (!sizeName && price <= 0) return [];

  const sizeId = cell(row, headerMap, "sizeId") || `${productId}-${stableId(sizeName || "default")}`;

  return [
    {
      id: sizeId,
      name: sizeName || "Standard",
      nameAr: cell(row, headerMap, "sizeNameAr") || undefined,
      price,
      available: boolCell(row, headerMap, "sizeAvailable", true),
    },
  ];
}

function parseModifiersFromRow(row: RawRow, headerMap: HeaderMap): NormalizedMenuProduct["modifiers"] {
  const modifierName = cell(row, headerMap, "modifierName");
  if (!modifierName) return undefined;

  const modifierId = cell(row, headerMap, "modifierId") || `mod-${stableId(modifierName)}`;

  return [
    {
      id: modifierId,
      name: modifierName,
      nameAr: cell(row, headerMap, "modifierNameAr") || undefined,
      priceAdjustment: numCell(row, headerMap, "priceAdjustment", 0),
      available: boolCell(row, headerMap, "modifierAvailable", true),
    },
  ];
}

export function normalizeRows(
  rawRows: RawRow[],
  headerMap: HeaderMap,
): {
  products: Map<string, NormalizedMenuProduct>;
  errors: string[];
} {
  const products = new Map<string, NormalizedMenuProduct>();
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]!;
    const rowNum = i + 2;

    const name = cell(row, headerMap, "name");
    if (!name) {
      const id = cell(row, headerMap, "productId");
      if (!id) continue;
      errors.push(`Row ${rowNum}: missing product name, skipped`);
      continue;
    }

    const rawId = cell(row, headerMap, "productId");
    const categoryName = cell(row, headerMap, "categoryName") || "Menu";
    const categoryId = cell(row, headerMap, "categoryId") || `CAT-${stableId(categoryName)}`;
    const productId = rawId || `${categoryId}-${stableId(name)}`;

    if (products.has(productId)) {
      const existing = products.get(productId)!;
      const sizeName = cell(row, headerMap, "sizeName");
      const price = numCell(row, headerMap, "price", 0);
      if (price > 0) {
        const resolvedName = sizeName || `Size ${existing.sizes.length + 1}`;
        existing.sizes.push({
          id: cell(row, headerMap, "sizeId") || `${productId}-size-${stableId(resolvedName)}`,
          name: resolvedName,
          nameAr: cell(row, headerMap, "sizeNameAr") || undefined,
          price,
          available: boolCell(row, headerMap, "sizeAvailable", true),
        });
      }
      const modifiers = parseModifiersFromRow(row, headerMap);
      if (modifiers?.length) {
        existing.modifiers = existing.modifiers || [];
        existing.modifiers.push(...modifiers);
      }
      continue;
    }

    const imageUrl = cell(row, headerMap, "imageUrl");
    const product: NormalizedMenuProduct = {
      id: productId,
      name,
      nameAr: cell(row, headerMap, "nameAr") || undefined,
      description: cell(row, headerMap, "description") || undefined,
      descriptionAr: cell(row, headerMap, "descriptionAr") || undefined,
      categoryId,
      categoryName,
      categoryNameAr: cell(row, headerMap, "categoryNameAr") || undefined,
      featured: boolCell(row, headerMap, "featured", false),
      available: boolCell(row, headerMap, "available", true),
      archived: boolCell(row, headerMap, "archived", false),
      sortOrder: numCell(row, headerMap, "sortOrder", products.size + 1),
      sizes: parseSizesFromRow(row, headerMap, productId),
      modifiers: parseModifiersFromRow(row, headerMap),
    };

    if (imageUrl) {
      product.image = {
        url: imageUrl,
        storagePath: cell(row, headerMap, "imageStoragePath") || undefined,
        altText: cell(row, headerMap, "imageAltText") || name,
        positionX: numCell(row, headerMap, "imagePositionX", 0),
        positionY: numCell(row, headerMap, "imagePositionY", 0),
        zoom: numCell(row, headerMap, "imageZoom", 1),
      };
    }

    products.set(productId, product);
  }

  return { products, errors };
}

export function buildCategories(
  products: Map<string, NormalizedMenuProduct>,
): Array<{ id: string; name: string; nameAr?: string; sortOrder: number }> {
  const categoryMap = new Map<string, { id: string; name: string; nameAr?: string; sortOrder: number }>();
  let order = 0;

  for (const product of products.values()) {
    if (categoryMap.has(product.categoryId)) continue;
    order += 1;
    categoryMap.set(product.categoryId, {
      id: product.categoryId,
      name: product.categoryName,
      nameAr: product.categoryNameAr,
      sortOrder: order,
    });
  }

  return Array.from(categoryMap.values());
}

async function fetchSheetValues(): Promise<string[][]> {
  const sheetId = process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");

  const sheets = googleSheetsClient();

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const response = await sheets.spreadsheets.values.get(
        {
          spreadsheetId: sheetId,
          range: SHEET_RANGE,
          valueRenderOption: "UNFORMATTED_VALUE",
        },
        { signal: controller.signal },
      );

      clearTimeout(timeout);
      return (response.data.values as string[][]) || [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isAbort = lastError.name === "AbortError";
      const isRateLimit = lastError.message.includes("429") || lastError.message.includes("quota");
      const isRetryable = isAbort || isRateLimit || lastError.message.includes("ECONNRESET") || lastError.message.includes("ENOTFOUND");

      if (!isRetryable || attempt === MAX_RETRIES - 1) break;

      const delay = Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`[menuSync] Sheets API attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Failed to fetch Google Sheet after retries.");
}

function rowsToRawRows(values: string[][]): RawRow[] {
  if (!values.length) return [];
  const headers = values[0] || [];
  return values.slice(1).map((cells) => {
    const row: RawRow = {};
    for (let i = 0; i < headers.length; i++) {
      row[String(i)] = String(cells[i] ?? "");
    }
    return row;
  });
}

async function loadMenuFromNeon(): Promise<NormalizedMenuProduct[]> {
  if (!neonConfigured()) return [];

  try {
    const [items, sizes] = await Promise.all([
      query<Record<string, unknown>>(
        `select i.id, i.name, i.description, i.active, i.available, i.sort_order,
                c.id as category_id, c.name as category_name
         from menu_items i
         join menu_categories c on c.id = i.category_id
         where i.active = true
         order by c.sort_order, i.sort_order, i.name`,
      ),
      query<Record<string, unknown>>(
        `select s.id, s.menu_item_id, s.size_name, s.price, s.sort_order
         from menu_item_sizes s
         order by s.sort_order`,
      ),
    ]);

    const sizesByItem = new Map<string, Record<string, unknown>[]>();
    for (const size of sizes) {
      const key = String(size.menu_item_id);
      const list = sizesByItem.get(key) || [];
      list.push(size);
      sizesByItem.set(key, list);
    }

    const productMap = new Map<string, NormalizedMenuProduct>();

    for (const item of items) {
      const id = String(item.id);
      const itemSizes = (sizesByItem.get(id) || []).map((s) => ({
        id: String(s.id),
        name: String(s.size_name),
        price: Number(s.price),
        available: true,
      }));

      productMap.set(id, {
        id,
        name: String(item.name),
        description: item.description ? String(item.description) : undefined,
        categoryId: String(item.category_id),
        categoryName: String(item.category_name),
        featured: false,
        available: Boolean(item.available),
        archived: false,
        sortOrder: Number(item.sort_order) || 0,
        sizes: itemSizes,
      });
    }

    return Array.from(productMap.values());
  } catch (error) {
    console.error("[menuSync] Failed to load menu from Neon:", error);
    return [];
  }
}

async function syncFromSheets(): Promise<MenuSyncResult> {
  const errors: string[] = [];

  const values = await fetchSheetValues();
  if (!values.length) {
    errors.push("Sheet 'Menu' tab is empty or not found.");
    return {
      products: [],
      categories: [],
      lastSyncedAt: new Date().toISOString(),
      productCount: 0,
      categoryCount: 0,
      unavailableCount: 0,
      errors,
      fromCache: false,
    };
  }

  const headers = (values[0] || []).map(String);
  const { map, missingRequired } = buildHeaderMap(headers);

  if (missingRequired.length) {
    errors.push(`Missing required columns: ${missingRequired.join(", ")}`);
    return {
      products: [],
      categories: [],
      lastSyncedAt: new Date().toISOString(),
      productCount: 0,
      categoryCount: 0,
      unavailableCount: 0,
      errors,
      fromCache: false,
    };
  }

  const rawRows = rowsToRawRows(values.slice(1));
  const { products, errors: normalizationErrors } = normalizeRows(rawRows, map);
  errors.push(...normalizationErrors);

  const productsArray = Array.from(products.values());
  const categories = buildCategories(products);

  const unavailableCount = productsArray.filter((p) => !p.available || p.archived).length;

  return {
    products: productsArray,
    categories,
    lastSyncedAt: new Date().toISOString(),
    productCount: productsArray.length,
    categoryCount: categories.length,
    unavailableCount,
    errors,
    fromCache: false,
  };
}

export async function getMenuSyncResult(forceRefresh = false): Promise<MenuSyncResult> {
  const now = Date.now();

  if (!forceRefresh && cache && cache.expiresAt > now) {
    return { ...cache.result, fromCache: true };
  }

  try {
    const result = await syncFromSheets();
    cache = { result, expiresAt: now + CACHE_TTL_MS };
    return result;
  } catch (sheetsError) {
    const message = sheetsError instanceof Error ? sheetsError.message : "Unknown sheets error";
    console.warn(`[menuSync] Google Sheets unavailable, falling back to Neon: ${message}`);

    const fallbackProducts = await loadMenuFromNeon();
    if (fallbackProducts.length > 0) {
      const categories = buildCategories(new Map(fallbackProducts.map((p) => [p.id, p])));
      const result: MenuSyncResult = {
        products: fallbackProducts,
        categories,
        lastSyncedAt: new Date().toISOString(),
        productCount: fallbackProducts.length,
        categoryCount: categories.length,
        unavailableCount: fallbackProducts.filter((p) => !p.available || p.archived).length,
        errors: [`Fell back to Neon DB: ${message}`],
        fromCache: false,
      };
      cache = { result, expiresAt: now + CACHE_TTL_MS };
      return result;
    }

    const emptyResult: MenuSyncResult = {
      products: [],
      categories: [],
      lastSyncedAt: new Date().toISOString(),
      productCount: 0,
      categoryCount: 0,
      unavailableCount: 0,
      errors: [`Sheets unavailable (${message}) and no Neon fallback data.`],
      fromCache: false,
    };
    cache = { result: emptyResult, expiresAt: now + CACHE_TTL_MS };
    return emptyResult;
  }
}

export function clearMenuSyncCache(): void {
  cache = null;
}

export function menuSyncCacheInfo(): { cached: boolean; expiresAt: number | null; productCount: number } {
  if (!cache) return { cached: false, expiresAt: null, productCount: 0 };
  return {
    cached: true,
    expiresAt: cache.expiresAt,
    productCount: cache.result.productCount,
  };
}
