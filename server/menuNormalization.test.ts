import fs from "node:fs";
import path from "node:path";

import { normalizeRawMenu } from "../scripts/normalize_menu";

function loadSource(): Parameters<typeof normalizeRawMenu>[0] {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "data", "menu.json"), "utf8"),
  ) as Parameters<typeof normalizeRawMenu>[0];
}

describe("menu normalization", () => {
  it("is deterministic and preserves every source price point", () => {
    const first = normalizeRawMenu(loadSource());
    const second = normalizeRawMenu(loadSource());
    expect(second).toEqual(first);
    expect(first.menu.categories).toHaveLength(13);
    expect(
      first.menu.categories.flatMap((category) => category.products),
    ).toHaveLength(165);
    expect(
      first.menu.categories.flatMap((category) =>
        category.products.flatMap((product) => product.variants),
      ),
    ).toHaveLength(227);
  });

  it("merges only the duplicate Sahlab identity into explicit price tiers", () => {
    const result = normalizeRawMenu(loadSource());
    expect(result.mapping.duplicateResolutions).toEqual([
      expect.objectContaining({
        canonicalId: "ITEM-0037",
        classification:
          "same product with separate classic and flavored price variants",
        name: "Sahlab",
      }),
    ]);
    const sahlab = result.menu.categories
      .flatMap((category) => category.products)
      .find((product) => product.id === "ITEM-0037");
    expect(sahlab?.variants.map((variant) => variant.name)).toEqual([
      "Classic Small",
      "Classic Medium",
      "Classic Large",
      "Flavored Small",
      "Flavored Medium",
      "Flavored Large",
    ]);
    expect(sahlab?.extras.map((extra) => extra.name)).toEqual([
      "Caramel",
      "Kinder",
      "Nutella",
    ]);
  });
});
