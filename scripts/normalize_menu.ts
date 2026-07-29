import fs from "node:fs";
import path from "node:path";

type RawItem = {
  flavors?: string[];
  name: string;
  price?: number;
  prices?: number[];
};

type RawCategory = {
  items: RawItem[];
  name: string;
};

type RawMenu = {
  brand?: string;
  categories: RawCategory[];
  currency?: string;
};

type CanonicalExtra = {
  id: string;
  name: string;
  priceMinor: number;
};

type CanonicalVariant = {
  displayOrder: number;
  id: string;
  name: string;
  priceMinor: number;
};

type CanonicalProduct = {
  active: boolean;
  archived: boolean;
  availabilityStatus: "available";
  costMinor: null;
  description: string;
  displayOrder: number;
  extras: CanonicalExtra[];
  id: string;
  imageProvider: null;
  imageUrl: null;
  loyaltyEligible: boolean;
  name: string;
  variants: CanonicalVariant[];
};

const workspaceRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(workspaceRoot, "data", "menu.json");
const outputPath = path.join(workspaceRoot, "data", "menu.normalized.json");
const mapPath = path.join(workspaceRoot, "data", "menu.normalization-map.json");

function priceList(item: RawItem): number[] {
  if (Array.isArray(item.prices)) return item.prices;
  if (typeof item.price === "number") return [item.price];
  throw new Error(`No price found for ${item.name}`);
}

function variantLabels(count: number): string[] {
  if (count === 1) return ["Standard"];
  if (count === 2) return ["Small", "Large"];
  if (count === 3) return ["Small", "Medium", "Large"];
  return Array.from({ length: count }, (_, index) => `Size ${index + 1}`);
}

function identifier(prefix: string, value: number, width: number): string {
  return `${prefix}-${String(value).padStart(width, "0")}`;
}

function variantToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

export function normalizeRawMenu(source: RawMenu) {
  const extrasByName = new Map<string, CanonicalExtra>();
  let nextExtra = 1;
  const mapping: {
    categories: Array<{
      canonicalId: string;
      name: string;
      sourcePath: string;
    }>;
    duplicateResolutions: Array<{
      canonicalId: string;
      classification: string;
      name: string;
      sourcePaths: string[];
    }>;
    products: Array<{
      canonicalId: string;
      name: string;
      sourcePaths: string[];
    }>;
    variants: Array<{
      canonicalId: string;
      name: string;
      sourcePath: string;
    }>;
  } = {
    categories: [],
    duplicateResolutions: [],
    products: [],
    variants: [],
  };
  let nextSourceProduct = 1;

  const categories = source.categories.map((category, categoryIndex) => {
    const categoryId = identifier("CAT", categoryIndex + 1, 3);
    mapping.categories.push({
      canonicalId: categoryId,
      name: category.name,
      sourcePath: `$.categories[${categoryIndex}]`,
    });

    const grouped = new Map<
      string,
      Array<{ item: RawItem; sourceOrdinal: number; sourcePath: string }>
    >();
    category.items.forEach((item, itemIndex) => {
      const key = item.name.trim().toLocaleLowerCase("en");
      const rows = grouped.get(key) ?? [];
      rows.push({
        item,
        sourceOrdinal: nextSourceProduct,
        sourcePath: `$.categories[${categoryIndex}].items[${itemIndex}]`,
      });
      nextSourceProduct += 1;
      grouped.set(key, rows);
    });

    let displayOrder = 0;
    const products: CanonicalProduct[] = [];
    grouped.forEach((rows) => {
      displayOrder += 1;
      const productId = identifier("ITEM", rows[0]!.sourceOrdinal, 4);
      const productName = rows[0]!.item.name.trim();
      const extras = new Map<string, CanonicalExtra>();
      const variants: CanonicalVariant[] = [];

      rows.forEach(({ item, sourcePath }, rowIndex) => {
        for (const flavor of item.flavors ?? []) {
          const normalizedName = flavor.trim();
          let extra = extrasByName.get(normalizedName.toLocaleLowerCase("en"));
          if (!extra) {
            extra = {
              id: identifier("EXTRA", nextExtra, 4),
              name: normalizedName,
              priceMinor: 0,
            };
            nextExtra += 1;
            extrasByName.set(normalizedName.toLocaleLowerCase("en"), extra);
          }
          extras.set(extra.id, extra);
        }

        const prices = priceList(item);
        const labels = variantLabels(prices.length);
        labels.forEach((label, priceIndex) => {
          const tier =
            rows.length === 1
              ? ""
              : item.flavors?.length
                ? "Flavored "
                : rowIndex === 0
                  ? "Classic "
                  : `Tier ${rowIndex + 1} `;
          const name = `${tier}${label}`;
          const id = `${productId}-${variantToken(name)}`;
          variants.push({
            displayOrder: variants.length + 1,
            id,
            name,
            priceMinor: Math.round(prices[priceIndex]! * 100),
          });
          mapping.variants.push({
            canonicalId: id,
            name,
            sourcePath: `${sourcePath}.${Array.isArray(item.prices) ? "prices" : "price"}${Array.isArray(item.prices) ? `[${priceIndex}]` : ""}`,
          });
        });
      });

      if (rows.length > 1) {
        mapping.duplicateResolutions.push({
          canonicalId: productId,
          classification:
            "same product with separate classic and flavored price variants",
          name: productName,
          sourcePaths: rows.map((row) => row.sourcePath),
        });
      }
      mapping.products.push({
        canonicalId: productId,
        name: productName,
        sourcePaths: rows.map((row) => row.sourcePath),
      });
      products.push({
        active: true,
        archived: false,
        availabilityStatus: "available",
        costMinor: null,
        description: "",
        displayOrder,
        extras: [...extras.values()],
        id: productId,
        imageProvider: null,
        imageUrl: null,
        loyaltyEligible: true,
        name: productName,
        variants,
      });
    });

    return {
      active: true,
      displayOrder: categoryIndex + 1,
      id: categoryId,
      name: category.name,
      products,
    };
  });

  return {
    mapping: {
      generatedAt: "deterministic",
      source: "data/menu.json",
      ...mapping,
    },
    menu: {
      brand: source.brand ?? "Joy Corner",
      categories,
      currency: source.currency ?? "EGP",
      version: 1,
    },
  };
}

if (require.main === module) {
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as RawMenu;
  const { mapping, menu } = normalizeRawMenu(source);
  fs.writeFileSync(outputPath, `${JSON.stringify(menu, null, 2)}\n`);
  fs.writeFileSync(mapPath, `${JSON.stringify(mapping, null, 2)}\n`);
  const productCount = menu.categories.reduce(
    (total, category) => total + category.products.length,
    0,
  );
  const variantCount = menu.categories.reduce(
    (total, category) =>
      total +
      category.products.reduce(
        (subtotal, product) => subtotal + product.variants.length,
        0,
      ),
    0,
  );
  console.log(
    `Normalized ${menu.categories.length} categories, ${productCount} products, and ${variantCount} price variants.`,
  );
}
