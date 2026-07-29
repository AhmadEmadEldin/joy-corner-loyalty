import { ReactNode, useEffect, useState } from "react";
import type { StaffProfile } from "../portal/repository";

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
  id: StaffSection;
  label: string;
  roles: StaffProfile["role"][];
};

const groups: Array<{ label: string; items: Omit<NavItem, "badge">[] }> = [
  {
    label: "Operations",
    items: [
      { id: "overview", label: "Overview", roles: ["owner", "manager"] },
      {
        id: "new_order",
        label: "New Order",
        roles: ["owner", "manager", "cashier", "waiter"],
      },
      {
        id: "cashier",
        label: "Cashier",
        roles: ["owner", "manager", "cashier"],
      },
      {
        id: "kitchen",
        label: "Kitchen",
        roles: ["owner", "manager", "barista"],
      },
      {
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
        id: "customers",
        label: "Customers",
        roles: ["owner", "manager", "cashier"],
      },
      { id: "rewards", label: "Rewards", roles: ["owner", "manager"] },
      { id: "vouchers", label: "Vouchers", roles: ["owner", "manager"] },
    ],
  },
  {
    label: "Catalog",
    items: [
      { id: "menu", label: "Menu & Images", roles: ["owner"] },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "analytics", label: "Analytics", roles: ["owner", "manager"] },
      { id: "end_day", label: "End of Day", roles: ["owner", "manager"] },
      { id: "system", label: "System", roles: ["owner"] },
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

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
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
                  {item.label.slice(0, 1)}
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
          <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
        </button>
        <nav aria-label="Staff navigation">{navigation}</nav>
        <div className="staff-user-card">
          <span>{profile.full_name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{profile.full_name}</strong>
            <small>{profile.role}</small>
          </div>
          <button aria-label="Sign out" onClick={onSignOut} type="button">
            ↗
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
            type="button"
          >
            ☰
          </button>
          <label className="staff-global-search">
            <span className="sr-only">Search the current workspace</span>
            <input placeholder="Search orders, products, customers…" type="search" />
          </label>
          <label className="staff-branch-select">
            <span className="sr-only">Branch</span>
            <select aria-label="Branch" defaultValue="joy-corner">
              <option value="joy-corner">Joy Corner</option>
            </select>
          </label>
          <button aria-label="Notifications" className="staff-notifications" type="button">
            ◌
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
            role="dialog"
          >
            <header>
              <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
              <button
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <nav>{navigation}</nav>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
