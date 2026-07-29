import {
  normalizeMenuImport,
  parseMenuImportJson,
  previewMenuImport,
} from "./menuImport";

const ids = {
  category: "11111111-1111-4111-8111-111111111111",
  product: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
};

function validMenu(priceMinor = 4500) {
  return {
    currency: "EGP",
    version: 1,
    categories: [
      {
        id: ids.category,
        name: "Hot Beverages",
        sortOrder: 1,
        products: [
          {
            availabilityStatus: "available",
            description: "Double shot",
            id: ids.product,
            imageProvider: null,
            loyaltyEligible: true,
            name: "Espresso",
            sortOrder: 1,
            variants: [
              {
                id: ids.variant,
                name: "Regular",
                priceMinor,
                sortOrder: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("menu import validation and preview", () => {
  it("accepts a canonical menu and reports a new product", () => {
    const preview = previewMenuImport(validMenu(), []);
    expect(preview.errors).toEqual([]);
    expect(preview.additions).toHaveLength(1);
  });

  it("accepts canonical stable IDs and displayOrder aliases", () => {
    const input = validMenu();
    input.categories[0]!.id = "CAT-001";
    Object.assign(input.categories[0]!, { displayOrder: 1 });
    delete (input.categories[0] as { sortOrder?: number }).sortOrder;
    const product = input.categories[0]!.products[0]!;
    product.id = "ITEM-0001";
    Object.assign(product, { displayOrder: 1 });
    delete (product as { sortOrder?: number }).sortOrder;
    product.variants[0]!.id = "ITEM-0001-STANDARD";
    Object.assign(product.variants[0]!, { displayOrder: 1 });
    delete (product.variants[0] as { sortOrder?: number }).sortOrder;
    expect(normalizeMenuImport(input).issues).toEqual([]);
  });

  it("rejects malformed JSON and comments", () => {
    expect(parseMenuImportJson('{"categories": [] // no comments\n}').issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_json" })]),
    );
  });

  it.each([
    ["negative price", -1, "invalid_price"],
    ["non-integer price", 12.5, "invalid_price"],
  ])("rejects %s", (_label, priceMinor, code) => {
    const result = normalizeMenuImport(validMenu(priceMinor));
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it("rejects missing names, unsupported status, category, and image URL", () => {
    const input = validMenu();
    const category = input.categories[0]!;
    category.name = "Unknown";
    const product = category.products[0]!;
    product.name = "";
    product.availabilityStatus = "paused";
    Object.assign(product, { imageProvider: "cloudinary" });
    Object.assign(product, { imageUrl: "javascript:alert(1)" });
    const codes = normalizeMenuImport(input).issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "unsupported_category",
        "missing_product_name",
        "unsupported_availability",
        "malformed_image_url",
      ]),
    );
  });

  it("rejects duplicate product IDs and duplicate size rows", () => {
    const input = validMenu();
    const product = input.categories[0]!.products[0]!;
    input.categories[0]!.products.push(
      JSON.parse(JSON.stringify(product)) as typeof product,
    );
    product.variants.push({ ...product.variants[0]! });
    const codes = normalizeMenuImport(input).issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "duplicate_product_id",
        "duplicate_variant_id",
        "duplicate_product_variant",
      ]),
    );
  });

  it("rejects credential-like fields", () => {
    const input = Object.assign(validMenu(), { jwt_secret: "do-not-import" });
    expect(normalizeMenuImport(input).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "credential_key" })]),
    );
  });

  it("classifies unchanged, price update, and archive changes", () => {
    const existing = [
      {
        availability_status: "available",
        category: "Hot Beverages",
        category_id: ids.category,
        description: "Double shot",
        id: ids.product,
        image_provider: null,
        image_url: null,
        loyalty_eligible: true,
        modifiers: [],
        name: "Espresso",
        sizes: [{ id: ids.variant, price: 45, size_name: "Regular" }],
        sort_order: 1,
      },
    ];
    expect(previewMenuImport(validMenu(), existing).unchanged).toHaveLength(1);
    const updated = previewMenuImport(validMenu(5000), existing);
    expect(updated.updates[0]?.fields).toContain("variants");
    expect(updated.priceChanges).toHaveLength(1);
    const other = {
      ...existing[0],
      id: "44444444-4444-4444-8444-444444444444",
      name: "Old item",
    };
    expect(previewMenuImport(validMenu(), [...existing, other]).archives).toHaveLength(1);
  });

  it("keeps legacy fields visible while blocking unsafe identity inference", () => {
    const legacy = {
      currency: "EGP",
      categories: [
        {
          name: "Hot Beverages",
          items: [{ flavors: ["Vanilla"], name: "Latte", prices: [50, 60] }],
        },
      ],
    };
    const result = normalizeMenuImport(legacy);
    expect(result.menu.products[0]?.variants).toHaveLength(2);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_id" }),
        expect.objectContaining({ code: "legacy_price_converted" }),
        expect.objectContaining({ code: "unmapped_flavors" }),
      ]),
    );
  });
});
