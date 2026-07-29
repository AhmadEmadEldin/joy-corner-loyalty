import crypto from "node:crypto";

export const MENU_AVAILABILITY = [
  "available",
  "temporarily_unavailable",
  "sold_out",
  "archived",
] as const;

export const MENU_IMAGE_PROVIDERS = [null, "cloudinary"] as const;

export const SUPPORTED_MENU_CATEGORIES = [
  "Hot Beverages",
  "Iced Drinks",
  "Shakes",
  "Smoothies",
  "Juices",
  "Frappes",
  "Cocktails",
  "Soft Drinks",
  "Sandwiches",
  "Sandwiches Utopia",
  "Matcha",
  "Dessert",
  "Desserts",
  "Extras",
  "Extra Boba",
] as const;

type Availability = (typeof MENU_AVAILABILITY)[number];
type ImageProvider = (typeof MENU_IMAGE_PROVIDERS)[number];

export type MenuImportIssue = {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
};

export type MenuImportVariant = {
  id: string;
  name: string;
  priceMinor: number;
  sortOrder: number;
};

export type MenuImportExtra = {
  id: string;
  name: string;
  priceMinor: number;
};

export type MenuImportProduct = {
  availabilityStatus: Availability;
  categoryId: string;
  categoryName: string;
  categorySortOrder: number;
  costMinor: number | null;
  description: string;
  extras: MenuImportExtra[];
  id: string;
  imageProvider: ImageProvider;
  imageUrl: string | null;
  loyaltyEligible: boolean;
  name: string;
  sortOrder: number;
  variants: MenuImportVariant[];
};

export type NormalizedMenuImport = {
  currency: string;
  products: MenuImportProduct[];
  version: number;
};

export type ExistingMenuProduct = {
  availability_status?: unknown;
  category?: unknown;
  category_id?: unknown;
  description?: unknown;
  id?: unknown;
  image_provider?: unknown;
  image_url?: unknown;
  loyalty_eligible?: unknown;
  legacy_id?: unknown;
  modifiers?: Array<{ id?: unknown; name?: unknown; price?: unknown }>;
  name?: unknown;
  sizes?: Array<{
    id?: unknown;
    price?: unknown;
    size_name?: unknown;
  }>;
  sort_order?: unknown;
};

export type MenuImportChange = {
  fields: string[];
  id: string;
  name: string;
};

export type MenuImportPreview = {
  additions: MenuImportChange[];
  archives: MenuImportChange[];
  digest: string;
  errors: MenuImportIssue[];
  priceChanges: MenuImportChange[];
  unchanged: MenuImportChange[];
  updates: MenuImportChange[];
  warnings: MenuImportIssue[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stableMenuIdPattern =
  /^(?:CAT-\d{3}|ITEM-\d{4}(?:-[A-Z0-9]+(?:-[A-Z0-9]+)*)?|EXTRA-\d{4})$/;
const sensitiveKeyPattern =
  /(private.?key|client.?secret|api.?secret|jwt.?secret|database.?url|password|access.?token)/i;
const sensitiveValuePattern =
  /(BEGIN (?:RSA )?PRIVATE KEY|postgres(?:ql)?:\/\/[^/\s]+:[^@\s]+@|cloudinary:\/\/[^/\s]+:[^@\s]+@)/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function temporaryId(path: string): string {
  return `preview:${crypto.createHash("sha256").update(path).digest("hex").slice(0, 20)}`;
}

function addIssue(
  issues: MenuImportIssue[],
  severity: MenuImportIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, message, path, severity });
}

function inspectSensitiveValues(
  value: unknown,
  issues: MenuImportIssue[],
  path = "$",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      inspectSensitiveValues(entry, issues, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && sensitiveValuePattern.test(value)) {
      addIssue(
        issues,
        "error",
        "credential_value",
        path,
        "Credential-like content is not allowed in menu data.",
      );
    }
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (sensitiveKeyPattern.test(key)) {
      addIssue(
        issues,
        "error",
        "credential_key",
        childPath,
        "Credential-like fields are not allowed in menu data.",
      );
    }
    inspectSensitiveValues(child, issues, childPath);
  });
}

function normalizeId(
  value: unknown,
  issues: MenuImportIssue[],
  path: string,
): string {
  const id = text(value);
  if (!id) {
    addIssue(
      issues,
      "error",
      "missing_id",
      path,
      "A stable menu identifier or UUID is required.",
    );
    return temporaryId(path);
  }
  if (!uuidPattern.test(id) && !stableMenuIdPattern.test(id)) {
    addIssue(
      issues,
      "error",
      "invalid_id",
      path,
      "The identifier must be a UUID or a canonical CAT/ITEM/EXTRA identifier.",
    );
  }
  return id;
}

function priceMinor(
  source: Record<string, unknown>,
  issues: MenuImportIssue[],
  path: string,
): number {
  if (source.priceMinor !== undefined || source.price_minor !== undefined) {
    const value = Number(source.priceMinor ?? source.price_minor);
    if (!Number.isSafeInteger(value) || value < 0) {
      addIssue(
        issues,
        "error",
        "invalid_price",
        path,
        "priceMinor must be a non-negative safe integer.",
      );
      return 0;
    }
    return value;
  }
  const legacy = Number(source.price);
  if (!Number.isFinite(legacy) || legacy < 0) {
    addIssue(
      issues,
      "error",
      "invalid_price",
      path,
      "A non-negative priceMinor value is required.",
    );
    return 0;
  }
  addIssue(
    issues,
    "warning",
    "legacy_price_converted",
    path,
    "A legacy EGP price was converted to integer minor units for preview.",
  );
  return Math.round(legacy * 100);
}

function variantLabels(count: number): string[] {
  if (count === 1) return ["Regular"];
  if (count === 2) return ["Small", "Large"];
  if (count === 3) return ["Small", "Medium", "Large"];
  return Array.from({ length: count }, (_, index) => `Size ${index + 1}`);
}

export function normalizeMenuImport(input: unknown): {
  issues: MenuImportIssue[];
  menu: NormalizedMenuImport;
} {
  const issues: MenuImportIssue[] = [];
  inspectSensitiveValues(input, issues);
  const root = record(input);
  const categories = Array.isArray(root.categories) ? root.categories : [];
  if (!categories.length) {
    addIssue(
      issues,
      "error",
      "missing_categories",
      "$.categories",
      "At least one category is required.",
    );
  }
  const products: MenuImportProduct[] = [];
  categories.forEach((categoryValue, categoryIndex) => {
    const category = record(categoryValue);
    const categoryPath = `$.categories[${categoryIndex}]`;
    const categoryName = text(category.name);
    if (!categoryName) {
      addIssue(
        issues,
        "error",
        "missing_category_name",
        `${categoryPath}.name`,
        "Category name is required.",
      );
    } else if (
      !SUPPORTED_MENU_CATEGORIES.includes(
        categoryName as (typeof SUPPORTED_MENU_CATEGORIES)[number],
      )
    ) {
      addIssue(
        issues,
        "error",
        "unsupported_category",
        `${categoryPath}.name`,
        "The category is not supported by the application.",
      );
    }
    const categoryId = normalizeId(category.id, issues, `${categoryPath}.id`);
    if (
      category.sortOrder === undefined &&
      category.sort_order === undefined &&
      category.displayOrder === undefined
    ) {
      addIssue(
        issues,
        "error",
        "missing_sort_order",
        `${categoryPath}.sortOrder`,
        "Category sort order is required.",
      );
    }
    const rawProducts = Array.isArray(category.products)
      ? category.products
      : Array.isArray(category.items)
        ? category.items
        : [];
    rawProducts.forEach((productValue, productIndex) => {
      const product = record(productValue);
      const productPath = `${categoryPath}.products[${productIndex}]`;
      const name = text(product.name);
      if (!name) {
        addIssue(
          issues,
          "error",
          "missing_product_name",
          `${productPath}.name`,
          "Product name is required.",
        );
      }
      const id = normalizeId(product.id, issues, `${productPath}.id`);
      const rawAvailability =
        product.availabilityStatus ?? product.availability_status ?? product.availability;
      const availability = text(rawAvailability);
      if (!availability) {
        addIssue(
          issues,
          "error",
          "missing_availability",
          `${productPath}.availabilityStatus`,
          "Availability status is required.",
        );
      } else if (!MENU_AVAILABILITY.includes(availability as Availability)) {
        addIssue(
          issues,
          "error",
          "unsupported_availability",
          `${productPath}.availabilityStatus`,
          "Availability status is not supported.",
        );
      }
      if (
        product.sortOrder === undefined &&
        product.sort_order === undefined &&
        product.displayOrder === undefined
      ) {
        addIssue(
          issues,
          "error",
          "missing_sort_order",
          `${productPath}.sortOrder`,
          "Product sort order is required.",
        );
      }
      const providerValue =
        product.imageProvider ?? product.image_provider ?? null;
      const provider =
        providerValue === null || providerValue === ""
          ? null
          : text(providerValue);
      if (provider !== null && provider !== "cloudinary") {
        addIssue(
          issues,
          "error",
          "unsupported_image_provider",
          `${productPath}.imageProvider`,
          "Image provider must be null or cloudinary.",
        );
      }
      const imageUrl = text(product.imageUrl ?? product.image_url) || null;
      if (imageUrl) {
        try {
          const url = new URL(imageUrl);
          if (url.protocol !== "https:") throw new Error("not https");
        } catch {
          addIssue(
            issues,
            "error",
            "malformed_image_url",
            `${productPath}.imageUrl`,
            "Image URL must be a valid HTTPS URL.",
          );
        }
      }
      if (provider === "cloudinary" && !imageUrl) {
        addIssue(
          issues,
          "error",
          "missing_image_url",
          `${productPath}.imageUrl`,
          "Cloudinary images require an HTTPS image URL.",
        );
      }
      let rawVariants: unknown[] = [];
      if (Array.isArray(product.variants)) rawVariants = product.variants;
      else if (Array.isArray(product.sizes)) rawVariants = product.sizes;
      else if (Array.isArray(product.prices)) {
        const labels = variantLabels(product.prices.length);
        rawVariants = product.prices.map((price, index) => ({
          name: labels[index],
          price,
          sortOrder: index,
        }));
      } else if (product.price !== undefined) {
        rawVariants = [{ name: "Regular", price: product.price, sortOrder: 0 }];
      }
      if (!rawVariants.length) {
        addIssue(
          issues,
          "error",
          "missing_variants",
          `${productPath}.variants`,
          "At least one priced variant is required.",
        );
      }
      const variants = rawVariants.map((variantValue, variantIndex) => {
        const variant = record(variantValue);
        const variantPath = `${productPath}.variants[${variantIndex}]`;
        const variantName = text(
          variant.name ?? variant.sizeName ?? variant.size_name ?? variant.size,
        );
        if (!variantName) {
          addIssue(
            issues,
            "error",
            "missing_variant_name",
            `${variantPath}.name`,
            "Variant name is required.",
          );
        }
        if (
          variant.sortOrder === undefined &&
          variant.sort_order === undefined &&
          variant.displayOrder === undefined
        ) {
          addIssue(
            issues,
            "error",
            "missing_sort_order",
            `${variantPath}.sortOrder`,
            "Variant sort order is required.",
          );
        }
        return {
          id: normalizeId(variant.id, issues, `${variantPath}.id`),
          name: variantName,
          priceMinor: priceMinor(variant, issues, `${variantPath}.priceMinor`),
          sortOrder: integer(
            variant.sortOrder ?? variant.sort_order ?? variant.displayOrder,
            variantIndex,
          ),
        };
      });
      const rawExtras = Array.isArray(product.extras) ? product.extras : [];
      const extras = rawExtras.map((extraValue, extraIndex) => {
        const extra =
          typeof extraValue === "string"
            ? { name: extraValue }
            : record(extraValue);
        const extraPath = `${productPath}.extras[${extraIndex}]`;
        const extraName = text(extra.name);
        if (!extraName) {
          addIssue(
            issues,
            "error",
            "missing_extra_name",
            `${extraPath}.name`,
            "Extra name is required.",
          );
        }
        return {
          id: normalizeId(extra.id, issues, `${extraPath}.id`),
          name: extraName,
          priceMinor: priceMinor(extra, issues, `${extraPath}.priceMinor`),
        };
      });
      if (Array.isArray(product.flavors) && product.flavors.length) {
        addIssue(
          issues,
          "warning",
          "unmapped_flavors",
          `${productPath}.flavors`,
          "Flavor data was preserved as a reported field but is not mapped to menu extras.",
        );
      }
      const rawCost = product.costMinor ?? product.cost_minor;
      const costMinor =
        rawCost === undefined || rawCost === null
          ? null
          : Number(rawCost);
      if (
        costMinor !== null &&
        (!Number.isSafeInteger(costMinor) || costMinor < 0)
      ) {
        addIssue(
          issues,
          "error",
          "invalid_cost",
          `${productPath}.costMinor`,
          "Cost must be a non-negative integer in minor units.",
        );
      }
      products.push({
        availabilityStatus: MENU_AVAILABILITY.includes(
          availability as Availability,
        )
          ? (availability as Availability)
          : "available",
        categoryId,
        categoryName,
        categorySortOrder: integer(
          category.sortOrder ?? category.sort_order ?? category.displayOrder,
          categoryIndex,
        ),
        costMinor:
          costMinor !== null && Number.isSafeInteger(costMinor) && costMinor >= 0
            ? costMinor
            : null,
        description: text(product.description),
        extras,
        id,
        imageProvider:
          provider === "cloudinary" ? "cloudinary" : null,
        imageUrl,
        loyaltyEligible:
          product.loyaltyEligible === undefined &&
          product.loyalty_eligible === undefined
            ? true
            : Boolean(product.loyaltyEligible ?? product.loyalty_eligible),
        name,
        sortOrder: integer(
          product.sortOrder ?? product.sort_order ?? product.displayOrder,
          productIndex,
        ),
        variants,
      });
    });
  });

  const duplicate = (
    values: Array<{ key: string; path: string }>,
    code: string,
    message: string,
  ) => {
    const seen = new Set<string>();
    values.forEach(({ key, path }) => {
      const normalized = key.trim().toLowerCase();
      if (seen.has(normalized)) {
        addIssue(issues, "error", code, path, message);
      }
      seen.add(normalized);
    });
  };
  duplicate(
    products.map((product, index) => ({
      key: product.id,
      path: `$.products[${index}].id`,
    })),
    "duplicate_product_id",
    "Product IDs must be unique.",
  );
  duplicate(
    products.flatMap((product, productIndex) =>
      product.variants.map((variant, variantIndex) => ({
        key: variant.id,
        path: `$.products[${productIndex}].variants[${variantIndex}].id`,
      })),
    ),
    "duplicate_variant_id",
    "Variant IDs must be unique.",
  );
  duplicate(
    products.flatMap((product, productIndex) =>
      product.variants.map((variant, variantIndex) => ({
        key: `${product.id}:${variant.name}`,
        path: `$.products[${productIndex}].variants[${variantIndex}].name`,
      })),
    ),
    "duplicate_product_variant",
    "A product cannot contain the same variant name twice.",
  );
  duplicate(
    products.map((product, index) => ({
      key: `${product.categoryName}:${product.name}`,
      path: `$.products[${index}].name`,
    })),
    "duplicate_category_product",
    "Product names must be unique within a category.",
  );

  return {
    issues,
    menu: {
      currency: text(root.currency) || "EGP",
      products,
      version: integer(root.version, 1),
    },
  };
}

export function parseMenuImportJson(source: string): {
  issues: MenuImportIssue[];
  menu: NormalizedMenuImport;
} {
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  try {
    return normalizeMenuImport(JSON.parse(source) as unknown);
  } catch {
    return {
      issues: [
        {
          code: "invalid_json",
          message: "The file is not valid JSON. Comments and trailing commas are not allowed.",
          path: "$",
          severity: "error",
        },
      ],
      menu: { currency: "EGP", products: [], version: 1 },
    };
  }
}

function digest(menu: NormalizedMenuImport): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(menu))
    .digest("hex");
}

function productFields(
  incoming: MenuImportProduct,
  existing: ExistingMenuProduct,
): string[] {
  const fields: string[] = [];
  const compare = (field: string, left: unknown, right: unknown) => {
    if (JSON.stringify(left) !== JSON.stringify(right)) fields.push(field);
  };
  compare("name", incoming.name, text(existing.name));
  compare("description", incoming.description, text(existing.description));
  compare("category", incoming.categoryName, text(existing.category));
  compare(
    "availability",
    incoming.availabilityStatus,
    text(existing.availability_status),
  );
  compare(
    "loyaltyEligibility",
    incoming.loyaltyEligible,
    Boolean(existing.loyalty_eligible),
  );
  compare("sortOrder", incoming.sortOrder, Number(existing.sort_order || 0));
  if (incoming.imageUrl !== null) {
    compare("imageUrl", incoming.imageUrl, text(existing.image_url) || null);
    compare(
      "imageProvider",
      incoming.imageProvider,
      text(existing.image_provider) || null,
    );
  }
  const incomingVariants = incoming.variants
    .map((variant) => ({
      name: variant.name,
      priceMinor: variant.priceMinor,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const existingVariants = (existing.sizes || [])
    .map((variant) => ({
      name: text(variant.size_name),
      priceMinor: Math.round(Number(variant.price || 0) * 100),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  compare("variants", incomingVariants, existingVariants);
  const incomingExtras = incoming.extras
    .map((extra) => ({
      name: extra.name,
      priceMinor: extra.priceMinor,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const existingExtras = (existing.modifiers || [])
    .map((extra) => ({
      name: text(extra.name),
      priceMinor: Math.round(Number(extra.price || 0) * 100),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  compare("extras", incomingExtras, existingExtras);
  return fields;
}

export function previewMenuImport(
  input: unknown,
  existingProducts: ExistingMenuProduct[],
): MenuImportPreview {
  const { issues, menu } = normalizeMenuImport(input);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const empty = {
    additions: [] as MenuImportChange[],
    archives: [] as MenuImportChange[],
    digest: digest(menu),
    errors,
    priceChanges: [] as MenuImportChange[],
    unchanged: [] as MenuImportChange[],
    updates: [] as MenuImportChange[],
    warnings,
  };
  if (errors.length) return empty;
  const existingById = new Map(
    existingProducts.map((product) => [
      text(product.legacy_id) || text(product.id),
      product,
    ]),
  );
  const incomingIds = new Set(menu.products.map((product) => product.id));
  menu.products.forEach((product) => {
    const existing = existingById.get(product.id);
    if (!existing) {
      empty.additions.push({
        fields: ["product"],
        id: product.id,
        name: product.name,
      });
      return;
    }
    const fields = productFields(product, existing);
    const change = { fields, id: product.id, name: product.name };
    if (!fields.length) empty.unchanged.push(change);
    else {
      empty.updates.push(change);
      if (fields.includes("variants")) empty.priceChanges.push(change);
    }
  });
  existingProducts.forEach((product) => {
    const id = text(product.legacy_id) || text(product.id);
    if (!incomingIds.has(id) && text(product.availability_status) !== "archived") {
      empty.archives.push({
        fields: ["availability"],
        id,
        name: text(product.name),
      });
    }
  });
  return empty;
}
