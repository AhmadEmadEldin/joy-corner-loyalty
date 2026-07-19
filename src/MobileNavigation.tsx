import { ReactNode, useEffect, useRef, useState } from "react";

export type MobileNavigationTab = readonly [string, string];

type MobileNavigationProps = {
  activeTab: string;
  displayName: string;
  onSelect: (tabId: string) => void;
  onSignOut: () => void;
  renderIcon?: (tabId: string) => ReactNode;
  role: string;
  tabs: MobileNavigationTab[];
};

export function MobileNavigation({
  activeTab,
  displayName,
  onSelect,
  onSignOut,
  renderIcon,
  role,
  tabs,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current
      ?.querySelector<HTMLElement>("button, [href], input, select, textarea")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
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
  }, [open]);

  function selectTab(tabId: string) {
    onSelect(tabId);
    setOpen(false);
  }

  return (
    <>
      <button
        aria-controls="mobile-navigation-drawer"
        aria-expanded={open}
        aria-label="Open navigation menu"
        className="mobile-menu-trigger"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="hamburger-lines">
          <span />
          <span />
          <span />
        </span>
        <span>Menu</span>
      </button>

      {open && (
        <div className="mobile-navigation-layer">
          <button
            aria-label="Close navigation menu"
            className="navigation-overlay"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside
            aria-label="Staff navigation"
            aria-modal="true"
            className="mobile-navigation-drawer"
            id="mobile-navigation-drawer"
            ref={drawerRef}
            role="dialog"
          >
            <div className="drawer-header">
              <div>
                <strong>{displayName}</strong>
                <span>{role}</span>
              </div>
              <button
                aria-label="Close navigation menu"
                className="drawer-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <nav aria-label="Mobile app sections" className="drawer-nav">
              {tabs.map(([id, label]) => (
                <button
                  aria-current={activeTab === id ? "page" : undefined}
                  className={`drawer-link ${activeTab === id ? "active" : ""}`}
                  key={id}
                  onClick={() => selectTab(id)}
                  type="button"
                >
                  {renderIcon?.(id)}
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <button
              className="drawer-signout"
              onClick={onSignOut}
              type="button"
            >
              Sign out
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
