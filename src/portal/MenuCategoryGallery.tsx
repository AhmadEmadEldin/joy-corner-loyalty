import type { MenuItem } from "./repository";

const CATEGORY_COVERS: Record<string, string> = {
  Cocktails: "/assets/menu/categories-v3/cocktails.webp",
  Dessert: "/assets/menu/categories-v3/desserts.webp",
  Desserts: "/assets/menu/categories-v3/desserts.webp",
  "Extra Boba": "/assets/menu/categories-v3/extra-boba.webp",
  Extras: "/assets/menu/categories-v3/extras.webp",
  Frappes: "/assets/menu/categories-v3/frappes.webp",
  "Hot Beverages": "/assets/menu/categories-v3/hot-beverages.webp",
  "Iced Drinks": "/assets/menu/categories-v3/iced-drinks.webp",
  Juices: "/assets/menu/categories-v3/juices.webp",
  Matcha: "/assets/menu/categories-v3/matcha.webp",
  Sandwiches: "/assets/menu/categories-v3/sandwiches.webp",
  Shakes: "/assets/menu/categories-v3/shakes.webp",
  Smoothies: "/assets/menu/categories-v3/smoothies.webp",
  "Soft Drinks": "/assets/menu/categories-v3/soft-drinks.webp",
};

export function MenuCategoryGallery({
  categories,
  items,
  onSelect,
}: {
  categories: string[];
  items: MenuItem[];
  onSelect: (category: string) => void;
}) {
  return (
    <section
      aria-label="Choose a menu section"
      className="menu-category-gallery"
    >
      <header>
        <div>
          <p className="eyebrow">Explore the menu</p>
          <h3>Choose your section</h3>
        </div>
        <small>Tap a picture to see every item</small>
      </header>
      <div>
        {categories.map((category) => {
          const categoryItems = items.filter(
            (item) => item.category === category,
          );
          const cover =
            CATEGORY_COVERS[category] ||
            categoryItems.find((item) => item.image_url)?.image_url;
          return (
            <button
              key={category}
              onClick={() => onSelect(category)}
              type="button"
            >
              {cover ? (
                <img alt="" src={cover} />
              ) : (
                <span
                  aria-label={`${category} image needed`}
                  className="category-artwork-placeholder"
                  role="img"
                >
                  <span aria-hidden="true">{category.slice(0, 1)}</span>
                  <small>Category image needed</small>
                </span>
              )}
              <span>
                <strong>{category}</strong>
                <small>{categoryItems.length} items</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
