import { ReactNode, useEffect, useRef, useState } from "react";
import type { StaffProfile } from "../portal/repository";
import { JoyIcon, type JoyIconName } from "./JoyUI";

export type StaffSection =
  | "overview"
  | "new_order"
  | "cashier"
  | "kitchen"
  | "orders"
  | "customers"
  | "rewards"
  | "vouchers"
  | "menu"
  | "analytics"
  | "end_day"
  | "system";

type NavItem = {
  badge?: number;
  icon: JoyIconName;
  id: StaffSection;
  label: string;
  roles: StaffProfile["role"][];
};

const groups: Array<{ label: string; items: Omit<NavItem, "badge">[] }> = [
  {
    label: "Operations",
    items: [
      { icon: "home", id: "overview", label: "Overview", roles: ["owner", "manager"] },
      {
        icon: "newOrder",
        id: "new_order",
        label: "New Order",
        roles: ["owner", "manager", "cashier", "waiter"],
      },
      {
        icon: "cashier",
        id: "cashier",
        label: "Cashier",
        roles: ["owner", "manager", "cashier"],
      },
      {
        icon: "kitchen",
        id: "kitchen",
        label: "Kitchen",
        roles: ["owner", "manager", "barista"],
      },
      {
        icon: "orders",
        id: "orders",
        label: "Orders",
        roles: ["owner", "manager", "cashier"],
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        icon: "customers",
        id: "customers",
        label: "Customers",
        roles: ["owner", "manager", "cashier"],
      },
      { icon: "rewards", id: "rewards", label: "Rewards", roles: ["owner", "manager"] },
      { icon: "voucher", id: "vouchers", label: "Vouchers", roles: ["owner", "manager"] },
    ],
  },
  {
    label: "Catalog",
    items: [
      { icon: "menu", id: "menu", label: "Menu & Images", roles: ["owner"] },
    ],
  },
  {
    label: "Business",
    items: [
      { icon: "analytics", id: "analytics", label: "Analytics", roles: ["owner", "manager"] },
      { icon: "endDay", id: "end_day", label: "End of Day", roles: ["owner", "manager"] },
      { icon: "settings", id: "system", label: "System", roles: ["owner"] },
    ],
  },
];

export function StaffAppShell({
  active,
  badges,
  children,
  message,
  onNavigate,
  onSignOut,
  profile,
}: {
  active: StaffSection;
  badges: Partial<Record<StaffSection, number>>;
  children: ReactNode;
  message: string;
  onNavigate: (section: StaffSection) => void;
  onSignOut: () => void;
  profile: StaffProfile;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
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
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [drawerOpen]);

  function navigate(section: StaffSection) {
    onNavigate(section);
    setDrawerOpen(false);
  }

  const navigation = (
    <>
      {groups.map((group) => {
        const visible = group.items.filter((item) =>
          item.roles.includes(profile.role),
        );
        if (!visible.length) return null;
        return (
          <section className="staff-nav-group" key={group.label}>
            <p>{group.label}</p>
            {visible.map((item) => (
              <button
                aria-current={active === item.id ? "page" : undefined}
                className={active === item.id ? "active" : ""}
                key={item.id}
                onClick={() => navigate(item.id)}
                type="button"
              >
                <span className="staff-nav-icon" aria-hidden="true">
                  <JoyIcon name={item.icon} size={18} />
                </span>
                <span>{item.label}</span>
                {badges[item.id] ? <em>{badges[item.id]}</em> : null}
              </button>
            ))}
          </section>
        );
      })}
    </>
  );

  return (
    <main className="staff-app-shell">
      <aside className="staff-sidebar">
        <button
          className="staff-brand"
          onClick={() => navigate("overview")}
          type="button"
        >
          <img alt="" src="/assets/joy-corner-mark.png" />
          <span>
            <strong>Joy Corner</strong>
            <small>Coffee &amp; Story</small>
          </span>
        </button>
        <nav aria-label="Staff navigation">{navigation}</nav>
        <div className="staff-user-card">
          <span>{profile.full_name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{profile.full_name}</strong>
            <small>{profile.role}</small>
          </div>
          <button aria-label="Sign out" onClick={onSignOut} type="button">
            <JoyIcon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <div className="staff-workspace">
        <header className="staff-topbar">
          <button
            aria-expanded={drawerOpen}
            aria-label="Open staff navigation"
            className="staff-menu-button"
            onClick={() => setDrawerOpen(true)}
            ref={menuButtonRef}
            type="button"
          >
            <JoyIcon name="menu" />
          </button>
          <div className="staff-topbar-context">
            <small>{profile.role}</small>
            <strong>
              {groups
                .flatMap((group) => group.items)
                .find((item) => item.id === active)?.label || "Workspace"}
            </strong>
          </div>
          <label className="staff-global-search">
            <span className="sr-only">Search the current workspace</span>
            <JoyIcon name="search" size={18} />
            <input placeholder="Search orders, products, customers…" type="search" />
          </label>
          <label className="staff-branch-select">
            <span className="sr-only">Branch</span>
            <JoyIcon name="branch" size={18} />
            <select aria-label="Branch" defaultValue="joy-corner">
              <option value="joy-corner">Joy Corner</option>
            </select>
          </label>
          <button aria-label="Notifications" className="staff-notifications" type="button">
            <JoyIcon name="bell" />
          </button>
        </header>
        {message ? (
          <p className="staff-toast" role="status">
            {message}
          </p>
        ) : null}
        <div className="staff-content">{children}</div>
      </div>

      {drawerOpen ? (
        <div className="staff-drawer-layer">
          <button
            aria-label="Close navigation"
            className="staff-drawer-scrim"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <aside
            aria-label="Staff navigation"
            aria-modal="true"
            className="staff-drawer"
            ref={drawerRef}
            role="dialog"
          >
            <header>
              <div className="staff-drawer-brand">
                <img alt="" src="/assets/joy-corner-mark.png" />
                <span>
                  <strong>Joy Corner</strong>
                  <small>Coffee &amp; Story</small>
                </span>
              </div>
              <button
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <JoyIcon name="close" />
              </button>
            </header>
            <nav>{navigation}</nav>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
