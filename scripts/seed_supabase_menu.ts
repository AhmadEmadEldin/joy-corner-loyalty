import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { normalizedMenu } from "../src/menuRepository";

dotenv.config({ path: [".env.local", ".env"] });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const categoryIds = new Map<string, string>();
let sizeCount = 0;

for (const menuItem of normalizedMenu) {
  let categoryId = categoryIds.get(menuItem.category);
  if (!categoryId) {
    const category = await client
      .from("menu_categories")
      .upsert(
        {
          active: true,
          legacy_id: menuItem.categoryId,
          name: menuItem.category,
          sort_order: Math.floor(menuItem.displayOrder / 1000),
        },
        { onConflict: "legacy_id" },
      )
      .select("id")
      .single();
    if (category.error) throw category.error;
    categoryId = String(category.data.id);
    categoryIds.set(menuItem.category, categoryId);
  }

  const item = await client
    .from("menu_items")
    .upsert(
      {
        active: menuItem.active,
        available: !menuItem.soldOut,
        base_price: Number(
          menuItem.suggestedPrice || menuItem.sizes[0]?.price || 0,
        ),
        category_id: categoryId,
        legacy_id: menuItem.itemId,
        name: menuItem.itemName,
        preparation_station: menuItem.preparationStation,
        sort_order: menuItem.displayOrder % 1000,
      },
      { onConflict: "legacy_id" },
    )
    .select("id")
    .single();
  if (item.error) throw item.error;

  for (const [index, size] of menuItem.sizes.entries()) {
    const result = await client.from("menu_item_sizes").upsert(
      {
        active: size.active,
        legacy_id: size.sizeId,
        menu_item_id: item.data.id,
        price: size.price,
        size_name: size.sizeName,
        sort_order: index,
      },
      { onConflict: "legacy_id" },
    );
    if (result.error) throw result.error;
    sizeCount += 1;
  }
}

console.log(
  `Seeded ${categoryIds.size} categories, ${normalizedMenu.length} items, and ${sizeCount} sizes.`,
);
