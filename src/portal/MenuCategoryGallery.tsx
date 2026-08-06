import type { MenuItem } from "./repository";

const CATEGORY_COVERS: Record<string, string> = {
  Cocktails: "/assets/menu/categories-v2/cocktails.png",
  Dessert: "/assets/menu/categories-v2/desserts.png",
  Desserts: "/assets/menu/categories-v2/desserts.png",
  "Extra Boba": "/assets/menu/categories-v2/extras.png",
  Extras: "/assets/menu/categories-v2/extras.png",
  Frappes: "/assets/menu/categories-v2/frappes.png",
  "Hot Beverages": "/assets/menu/categories-v2/hot-beverages.png",
  "Iced Drinks": "/assets/menu/categories-v2/iced-drinks.png",
  Juices: "/assets/menu/categories-v2/juices.png",
  Matcha: "/assets/menu/categories-v2/matcha.png",
  Sandwiches: "/assets/menu/categories-v2/sandwiches.png",
  Shakes: "/assets/menu/categories-v2/shakes.png",
  Smoothies: "/assets/menu/categories-v2/smoothies.png",
  "Soft Drinks": "/assets/menu/categories-v2/soft-drinks.png",
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
