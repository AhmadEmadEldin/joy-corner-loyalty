import { useEffect, useMemo, useRef, useState } from "react";
import type { CartLine, MenuItem } from "./repository";
import { ProductCustomizer } from "./ProductCustomizer";
import { ProductImage } from "./ProductImage";
import { MenuCategoryGallery } from "./MenuCategoryGallery";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

type CustomerMenuProps = {
  cart: CartLine[];
  loading: boolean;
  menu: MenuItem[];
  onCartChange: (cart: CartLine[]) => void;
  onCheckout: () => void;
};

export function CustomerMenu({
  cart,
  loading,
  menu,
  onCartChange,
  onCheckout,
}: CustomerMenuProps) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const cartRef = useRef(cart);
  const onCartChangeRef = useRef(onCartChange);
  cartRef.current = cart;
  onCartChangeRef.current = onCartChange;

  useEffect(() => {
    if (!menu.length || !cartRef.current.length) return;
    let changed = false;
    const updated = cartRef.current.map((line) => {
      const current = menu.find((m) => m.id === line.item.id);
      if (!current) return line;
      const currentSize = current.sizes.find((s) => s.id === line.size.id);
      if (!currentSize || currentSize.price === line.size.price) return line;
      changed = true;
      return { ...line, size: currentSize, item: current };
    });
    if (changed) {
      setPriceChanged(true);
      onCartChangeRef.current(updated);
    }
  }, [menu]);
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menu.map((item) => item.category)))],
    [menu],
  );
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return menu.filter(
      (item) =>
        (category === "All" || item.category === category) &&
        (!search ||
          item.name.toLocaleLowerCase().includes(search) ||
          item.description.toLocaleLowerCase().includes(search)),
    );
  }, [category, menu, query]);
  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const showCategoryLanding =
    category === "All" && !query.trim() && menu.length > 12;

  function saveLine(line: CartLine) {
    if (editing) {
      onCartChange(
        cart.map((current) =>
          current.lineId === line.lineId ? line : current,
        ),
      );
    } else {
      onCartChange([...cart, line]);
    }
    setEditing(null);
    setSelected(null);
  }

  function updateQuantity(lineId: string, nextQuantity: number) {
    if (nextQuantity < 1) {
      onCartChange(cart.filter((line) => line.lineId !== lineId));
      return;
    }
    onCartChange(
      cart.map((line) =>
        line.lineId === lineId
          ? { ...line, quantity: Math.min(99, nextQuantity) }
          : line,
      ),
    );
  }

  return (
    <>
      <div className="kiosk-layout">
        <section className="kiosk-menu" aria-labelledby="menu-heading">
          <header className="menu-heading-row">
            <div>
              <p className="eyebrow">Made for your moment</p>
              <h2 id="menu-heading">What can we make for you?</h2>
            </div>
            <label className="menu-search">
              <span className="sr-only">Search the menu</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search coffee, dessert…"
                type="search"
                value={query}
              />
            </label>
          </header>
          {category === "All" && !query.trim() && menu.length ? (
            <MenuCategoryGallery
              categories={categories.filter((name) => name !== "All")}
              items={menu}
              onSelect={setCategory}
            />
          ) : null}
          <nav aria-label="Menu categories" className="category-rail">
            {categories.map((name) => (
              <button
                aria-pressed={category === name}
                className={category === name ? "active" : ""}
                key={name}
                onClick={() => setCategory(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </nav>
          {loading ? (
            <div aria-label="Loading menu" className="kiosk-product-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="product-skeleton" key={index} />
              ))}
            </div>
          ) : menu.length === 0 ? (
            <div className="empty-menu-state">
              <strong>No menu items available.</strong>
              <p>Please check back later.</p>
            </div>
          ) : showCategoryLanding ? null : visible.length ? (
            <div className="kiosk-product-grid">
              {visible.map((item) => {
                const isUnavailable = item.availability_state !== "available";
                const cardClass = `kiosk-product-card${isUnavailable ? " product-card--unavailable" : ""}`;
                const overlayLabel =
                  item.availability_state === "temporarily_unavailable"
                    ? "Temporarily unavailable"
                    : item.availability_state === "sold_out"
                      ? "Sold out"
                      : item.availability_state === "archived"
                        ? "Unavailable"
                        : "";
                return (
                  <article className={cardClass} key={item.id}>
                    <button
                      aria-disabled={isUnavailable || !item.sizes.length}
                      aria-label={`Customize ${item.name}`}
                      className="product-card-main"
                      disabled={isUnavailable || !item.sizes.length}
                      onClick={() => setSelected(item)}
                      type="button"
                    >
                      <ProductImage
                        alt={item.name}
                        size="md"
                        src={item.image_url}
                      />
                      {isUnavailable ? (
                        <div className="product-card__availability-overlay">
                          <span className="product-card__availability-icon">
                            {item.availability_state === "sold_out"
                              ? "!"
                              : "\u23F8"}
                          </span>
                          <span className="product-card__availability-text">
                            {overlayLabel}
                          </span>
                        </div>
                      ) : null}
                      <span className="product-card-copy">
                        <small>{item.category}</small>
                        <strong>{item.name}</strong>
                        <span>
                          {item.description || "Freshly prepared to order."}
                        </span>
                      </span>
                    </button>
                    <footer>
                      <span>
                        {item.sizes[0]
                          ? `From ${money.format(item.sizes[0].price)}`
                          : "Unavailable"}
                      </span>
                      {item.loyalty_eligible ? (
                        <small>Reward eligible</small>
                      ) : null}
                      <button
                        aria-disabled={isUnavailable || !item.sizes.length}
                        disabled={isUnavailable || !item.sizes.length}
                        onClick={() => setSelected(item)}
                        type="button"
                      >
                        {isUnavailable ? overlayLabel : "Add"}
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-menu-state">
              <strong>No matching drinks or bites</strong>
              <p>Try another category or clear your search.</p>
              <button onClick={() => setQuery("")} type="button">
                Clear search
              </button>
            </div>
          )}
          <aside
            className="customer-brand-story"
            aria-label="The Joy Corner story"
          >
            <div>
              <p className="eyebrow">From farm to cup</p>
              <h3>Every cup tells a story</h3>
              <p>
                Carefully selected beans, warm hospitality, and drinks made for
                the small moments that bring people together.
              </p>
            </div>
            <div className="customer-brand-values" aria-label="Our values">
              <span>Est. 2016</span>
              <span>Brewed with care</span>
            </div>
          </aside>
        </section>
        <CartPanel
          cart={cart}
          onCheckout={onCheckout}
          onDismissPriceChange={() => setPriceChanged(false)}
          onEdit={(line) => {
            setEditing(line);
            setSelected(line.item);
          }}
          onQuantity={updateQuantity}
          priceChanged={priceChanged}
          total={total}
        />
      </div>
      {cart.length ? (
        <button
          className="mobile-cart-button"
          onClick={onCheckout}
          type="button"
        >
          <span>
            {quantity} {quantity === 1 ? "item" : "items"}
          </span>
          <strong>View order · {money.format(total)}</strong>
        </button>
      ) : null}
      {selected ? (
        <ProductCustomizer
          initial={editing || undefined}
          item={selected}
          onClose={() => {
            setEditing(null);
            setSelected(null);
          }}
          onSave={saveLine}
        />
      ) : null}
    </>
  );
}

export function lineTotal(line: CartLine): number {
  const modifierPrice = line.modifiers.reduce(
    (sum, modifier) => sum + modifier.price,
    0,
  );
  return (line.size.price + modifierPrice) * line.quantity;
}

function CartPanel({
  cart,
  onCheckout,
  onDismissPriceChange,
  onEdit,
  onQuantity,
  priceChanged,
  total,
}: {
  cart: CartLine[];
  onCheckout: () => void;
  onDismissPriceChange: () => void;
  onEdit: (line: CartLine) => void;
  onQuantity: (lineId: string, quantity: number) => void;
  priceChanged: boolean;
  total: number;
}) {
  return (
    <aside aria-label="Your order" className="kiosk-cart">
      <header>
        <div>
          <p className="eyebrow">Your order</p>
          <h2>{cart.length ? "Ready when you are" : "Start your order"}</h2>
        </div>
        <span>{cart.reduce((sum, line) => sum + line.quantity, 0)}</span>
      </header>
      {priceChanged ? (
        <div className="cart-price-change-banner" role="status">
          <span>Prices have been updated. Please review your order.</span>
          <button onClick={onDismissPriceChange} type="button">
            OK
          </button>
        </div>
      ) : null}
      <div className="kiosk-cart-lines">
        {cart.length ? (
          cart.map((line) => (
            <article className="kiosk-cart-line" key={line.lineId}>
              <div>
                <strong>{line.item.name}</strong>
                <small>
                  {line.size.size_name}
                  {line.modifiers.length
                    ? ` · ${line.modifiers.map((modifier) => modifier.name).join(", ")}`
                    : ""}
                </small>
                {line.notes ? <small>Note: {line.notes}</small> : null}
              </div>
              <strong>{money.format(lineTotal(line))}</strong>
              <div className="cart-line-actions">
                <button onClick={() => onEdit(line)} type="button">
                  Edit
                </button>
                <div className="quantity-control">
                  <button
                    aria-label={`Remove one ${line.item.name}`}
                    onClick={() => onQuantity(line.lineId, line.quantity - 1)}
                    type="button"
                  >
                    −
                  </button>
                  <output>{line.quantity}</output>
                  <button
                    aria-label={`Add one ${line.item.name}`}
                    onClick={() => onQuantity(line.lineId, line.quantity + 1)}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-cart-state">
            <p>Your favorite Joy Corner order will appear here.</p>
          </div>
        )}
      </div>
      <footer>
        <div>
          <span>Subtotal</span>
          <strong>{money.format(total)}</strong>
        </div>
        <small>Discounts are calculated securely at checkout.</small>
        <button disabled={!cart.length} onClick={onCheckout} type="button">
          Continue to checkout
        </button>
      </footer>
    </aside>
  );
}
