import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartLine, MenuItem } from "./repository";
import { ProductCustomizer } from "./ProductCustomizer";
import { cartCanCheckout } from "./cartReconciliation";
import { EmptyState } from "../components/JoyUI";

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
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
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
  const closeCart = useCallback(() => setCartOpen(false), []);
  const checkoutFromCart = useCallback(() => {
    setCartOpen(false);
    onCheckout();
  }, [onCheckout]);

  function saveLine(line: CartLine) {
    if (editing) {
      onCartChange(cart.map((current) => (current.lineId === line.lineId ? line : current)));
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
        line.lineId === lineId ? { ...line, quantity: Math.min(99, nextQuantity) } : line,
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
            <EmptyState
              description="Please check back later."
              icon="menu"
              title="No menu items available."
            />
          ) : visible.length ? (
            <div className="kiosk-product-grid">
              {visible.map((item) => (
                <article
                  className={`kiosk-product-card availability-${item.availability_status}`}
                  key={item.id}
                >
                  <button
                    aria-label={`Customize ${item.name}`}
                    className="product-card-main"
                    disabled={!item.available || !item.sizes.length}
                    onClick={() => setSelected(item)}
                    type="button"
                  >
                    <span className="product-image-wrap">
                      <img
                        alt={item.name}
                        decoding="async"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                        }}
                        src={item.image_url || "/assets/coffee-bean-field.jpg"}
                      />
                    </span>
                    {!item.available ? (
                      <span className="product-unavailable-overlay">
                        <strong>
                          {item.availability_status === "sold_out"
                            ? "Sold out"
                            : "Temporarily unavailable"}
                        </strong>
                      </span>
                    ) : null}
                    <span className="product-card-copy">
                      <small>{item.category}</small>
                      <strong>{item.name}</strong>
                      <span>{item.description || "Freshly prepared to order."}</span>
                    </span>
                  </button>
                  <footer>
                    <span>
                      {item.sizes[0]
                        ? `From ${money.format(item.sizes[0].price)}`
                        : "Unavailable"}
                    </span>
                    {item.loyalty_eligible ? <small>Reward eligible</small> : null}
                    <button
                      disabled={!item.available || !item.sizes.length}
                      onClick={() => setSelected(item)}
                      type="button"
                    >
                      {item.available ? "Add" : "Unavailable"}
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              action={<button onClick={() => setQuery("")} type="button">Clear search</button>}
              description="Try another category or clear your search."
              icon="search"
              title="No matching drinks or bites"
            />
          )}
        </section>
        <CartPanel
          cart={cart}
          mobileOpen={cartOpen}
          onCheckout={checkoutFromCart}
          onEdit={(line) => {
            setEditing(line);
            setSelected(line.item);
          }}
          onQuantity={updateQuantity}
          onMobileClose={closeCart}
          total={total}
        />
      </div>
      {cartOpen ? (
        <button
          aria-label="Close cart"
          className="mobile-cart-scrim"
          onClick={closeCart}
          type="button"
        />
      ) : null}
      {cart.length ? (
        <button
          className="mobile-cart-button"
          disabled={!cartCanCheckout(cart)}
          onClick={() => setCartOpen(true)}
          type="button"
        >
          <span>{quantity} {quantity === 1 ? "item" : "items"}</span>
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
  const modifierPrice = line.modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
  return (line.size.price + modifierPrice) * line.quantity;
}

function CartPanel({
  cart,
  mobileOpen,
  onCheckout,
  onEdit,
  onMobileClose,
  onQuantity,
  total,
}: {
  cart: CartLine[];
  mobileOpen: boolean;
  onCheckout: () => void;
  onEdit: (line: CartLine) => void;
  onMobileClose: () => void;
  onQuantity: (lineId: string, quantity: number) => void;
  total: number;
}) {
  const cartRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cartRef.current?.querySelector<HTMLButtonElement>(".mobile-cart-close")?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onMobileClose();
        return;
      }
      if (event.key !== "Tab" || !cartRef.current) return;
      const focusable = Array.from(
        cartRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, onMobileClose]);

  return (
    <aside
      aria-label="Your order"
      aria-modal={mobileOpen ? "true" : undefined}
      className={`kiosk-cart ${mobileOpen ? "mobile-open" : ""}`}
      ref={cartRef}
      role={mobileOpen ? "dialog" : undefined}
    >
      <header>
        <div>
          <p className="eyebrow">Your order</p>
          <h2>{cart.length ? "Ready when you are" : "Start your order"}</h2>
        </div>
        <span>{cart.reduce((sum, line) => sum + line.quantity, 0)}</span>
        <button
          aria-label="Close cart"
          className="mobile-cart-close"
          onClick={onMobileClose}
          type="button"
        >
          ×
        </button>
      </header>
      <div className="kiosk-cart-lines">
        {cart.length ? (
          cart.map((line) => (
            <article className="kiosk-cart-line" key={line.lineId}>
              <img
                alt=""
                decoding="async"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                }}
                src={line.item.image_url || "/assets/coffee-bean-field.jpg"}
              />
              <div>
                <strong>{line.item.name}</strong>
                <small>
                  {line.size.size_name}
                  {line.modifiers.length
                    ? ` · ${line.modifiers.map((modifier) => modifier.name).join(", ")}`
                    : ""}
                </small>
                {line.notes ? <small>Note: {line.notes}</small> : null}
                {line.invalidReason ? (
                  <small className="cart-line-warning" role="alert">
                    {line.invalidReason}
                  </small>
                ) : null}
                {line.requiresPriceAcknowledgement ? (
                  <small className="cart-line-warning">
                    Price changed from {money.format(line.previousUnitPrice || 0)} to{" "}
                    {money.format(line.size.price)}.
                  </small>
                ) : null}
              </div>
              <strong>{money.format(lineTotal(line))}</strong>
              <div className="cart-line-actions">
                {line.requiresPriceAcknowledgement ? (
                  <button
                    onClick={() =>
                      onEdit({
                        ...line,
                        previousUnitPrice: undefined,
                        requiresPriceAcknowledgement: false,
                      })
                    }
                    type="button"
                  >
                    Review
                  </button>
                ) : (
                  <button disabled={Boolean(line.invalidReason)} onClick={() => onEdit(line)} type="button">Edit</button>
                )}
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
          <EmptyState
            description="Your favorite Joy Corner order will appear here."
            icon="cart"
            title="Your order is empty"
          />
        )}
      </div>
      <footer>
        <div><span>Subtotal</span><strong>{money.format(total)}</strong></div>
        <small>Discounts are calculated securely at checkout.</small>
        <button disabled={!cartCanCheckout(cart)} onClick={onCheckout} type="button">
          Continue to checkout
        </button>
      </footer>
    </aside>
  );
}
