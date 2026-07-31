import { useEffect, useRef, useState } from "react";
import { JoyIcon, type JoyIconName } from "../components/JoyUI";

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
  icon: JoyIconName;
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
  { icon: "home", id: "home", label: "Home" },
  { icon: "menu", id: "menu", label: "Menu" },
  { icon: "cart", id: "cart", label: "My cart" },
  { icon: "orders", id: "orders", label: "My orders" },
  { icon: "receipt", id: "receipts", label: "Receipts" },
  { icon: "cashier", id: "unpaid", label: "Unpaid receipts" },
  { icon: "rewards", id: "rewards", label: "Rewards" },
  { icon: "voucher", id: "vouchers", label: "Vouchers" },
  { icon: "bell", id: "notifications", label: "Notifications" },
  { icon: "profile", id: "profile", label: "Profile" },
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
      <nav aria-label="Customer mobile navigation" className="customer-bottom-nav">
        {items
          .filter((item) =>
            ["home", "menu", "orders", "rewards"].includes(item.id),
          )
          .map((item) => (
            <NavigationButton
              active={active === item.id}
              badge={badges[item.id]}
              item={item}
              key={item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        <button
          aria-current={
            ["home", "menu", "orders", "rewards"].includes(active)
              ? undefined
              : "page"
          }
          aria-label="More customer sections"
          onClick={() => setOpen(true)}
          type="button"
        >
          <JoyIcon name="more" />
          <span>More</span>
        </button>
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
              <div className="customer-drawer-brand">
                <img alt="" src="/assets/joy-corner-mark.png" />
                <span>
                  <strong>Joy Corner</strong>
                  <small>Coffee &amp; Story</small>
                </span>
              </div>
              <button
                aria-label="Close navigation"
                className="drawer-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                <JoyIcon name="close" />
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
              <JoyIcon name="logout" />
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
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={active ? "active" : ""}
      onClick={onClick}
      type="button"
    >
      <JoyIcon name={item.icon} />
      <span>{item.label}</span>
      {badge ? <span className="nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
