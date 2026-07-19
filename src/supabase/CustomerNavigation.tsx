import { useEffect, useRef, useState } from "react";

export type CustomerSection =
  | "home"
  | "menu"
  | "cart"
  | "orders"
  | "receipts"
  | "unpaid"
  | "rewards"
  | "vouchers"
  | "notifications"
  | "profile";

type NavigationItem = {
  badge?: number;
  id: CustomerSection;
  label: string;
};

type CustomerNavigationProps = {
  active: CustomerSection;
  badges: Partial<Record<CustomerSection, number>>;
  onNavigate: (section: CustomerSection) => void;
  onSignOut: () => void;
};

const items: Array<Omit<NavigationItem, "badge">> = [
  { id: "home", label: "Home" },
  { id: "menu", label: "Menu" },
  { id: "cart", label: "My cart" },
  { id: "orders", label: "My orders" },
  { id: "receipts", label: "Receipts" },
  { id: "unpaid", label: "Unpaid receipts" },
  { id: "rewards", label: "Rewards" },
  { id: "vouchers", label: "Vouchers" },
  { id: "notifications", label: "Notifications" },
  { id: "profile", label: "Profile" },
];

export function CustomerNavigation({
  active,
  badges,
  onNavigate,
  onSignOut,
}: CustomerNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
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
      triggerRef.current?.focus();
    };
  }, [open]);

  function navigate(section: CustomerSection) {
    onNavigate(section);
    setOpen(false);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Open navigation"
        className="customer-menu-trigger"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="hamburger-icon">
          <i />
          <i />
          <i />
        </span>
      </button>
      <nav aria-label="Customer sections" className="customer-desktop-nav">
        {items.slice(0, 8).map((item) => (
          <NavigationButton
            active={active === item.id}
            badge={badges[item.id]}
            item={item}
            key={item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>
      {open ? (
        <div className="customer-drawer-layer">
          <button
            aria-label="Close navigation"
            className="customer-drawer-scrim"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            aria-label="Customer navigation"
            aria-modal="true"
            className="customer-drawer"
            ref={drawerRef}
            role="dialog"
          >
            <header>
              <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
              <button
                aria-label="Close navigation"
                className="drawer-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <nav aria-label="Mobile customer sections">
              {items.map((item) => (
                <NavigationButton
                  active={active === item.id}
                  badge={badges[item.id]}
                  item={item}
                  key={item.id}
                  onClick={() => navigate(item.id)}
                />
              ))}
            </nav>
            <button className="drawer-signout" onClick={onSignOut} type="button">
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function NavigationButton({
  active,
  badge,
  item,
  onClick,
}: {
  active: boolean;
  badge?: number;
  item: Omit<NavigationItem, "badge">;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={active ? "active" : ""}
      onClick={onClick}
      type="button"
    >
      <span>{item.label}</span>
      {badge ? <span className="nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
