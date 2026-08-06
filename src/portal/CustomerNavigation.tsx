import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon, type AppIconName } from "./AppIcon";
import { BrandLogo } from "./BrandLogo";

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
  icon: AppIconName;
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
  { id: "home", icon: "home", label: "Home" },
  { id: "menu", icon: "menu", label: "Menu" },
  { id: "cart", icon: "cart", label: "My cart" },
  { id: "orders", icon: "orders", label: "My orders" },
  { id: "receipts", icon: "receipts", label: "Receipts" },
  { id: "unpaid", icon: "unpaid", label: "Unpaid receipts" },
  { id: "rewards", icon: "rewards", label: "Rewards" },
  { id: "vouchers", icon: "vouchers", label: "Vouchers" },
  { id: "notifications", icon: "notifications", label: "Notifications" },
  { id: "profile", icon: "profile", label: "Profile" },
];

const mobileItems = items.filter(({ id }) =>
  ["home", "menu", "orders", "rewards", "profile"].includes(id),
);

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
    const trigger = triggerRef.current;
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
      trigger?.focus();
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
        aria-label={open ? "Close navigation" : "Open navigation"}
        className={`customer-menu-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
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
        {items.map((item) => (
          <NavigationButton
            active={active === item.id}
            badge={badges[item.id]}
            item={item}
            key={item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>
      {open ? createPortal(
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
              <BrandLogo compact />
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
            <button
              className="drawer-signout"
              onClick={onSignOut}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
      <nav
        aria-label="Mobile customer sections"
        className="customer-mobile-nav"
      >
        {mobileItems.map((item) => (
          <NavigationButton
            active={active === item.id}
            badge={badges[item.id]}
            item={item}
            key={item.id}
            onClick={() => navigate(item.id)}
          />
        ))}
      </nav>
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
      <span aria-hidden="true" className="customer-navigation-icon">
        <AppIcon name={item.icon} />
      </span>
      <span>{item.label}</span>
      {badge ? (
        <span className="nav-badge">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </button>
  );
}
