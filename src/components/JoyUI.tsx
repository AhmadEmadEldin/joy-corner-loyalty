import { useEffect, useRef, useState, type ReactNode } from "react";

export type JoyIconName =
  | "analytics"
  | "bell"
  | "branch"
  | "cart"
  | "cashier"
  | "check"
  | "close"
  | "customers"
  | "endDay"
  | "home"
  | "kitchen"
  | "logout"
  | "menu"
  | "more"
  | "newOrder"
  | "orders"
  | "profile"
  | "receipt"
  | "rewards"
  | "search"
  | "settings"
  | "voucher";

const iconPaths: Record<JoyIconName, ReactNode> = {
  analytics: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
      <path d="M2 20h22" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  branch: (
    <>
      <path d="M12 22s7-6.2 7-13A7 7 0 1 0 5 9c0 6.8 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 11h10.9l2-7H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  cashier: (
    <>
      <rect height="15" rx="2" width="18" x="3" y="5" />
      <path d="M7 9h10M7 13h4M15 13h2M7 17h2M12 17h5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  customers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M16 4a3 3 0 0 1 0 6M17 14c2.5.4 4 2.3 4 5" />
    </>
  ),
  endDay: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2M8 2l1 3M16 2l-1 3" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v11h14V10M9 21v-7h6v7" />
    </>
  ),
  kitchen: (
    <>
      <path d="M5 10h14l-1 10H6L5 10Z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M8 4 6 2M16 4l2-2" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  newOrder: (
    <>
      <path d="M5 5h14v16H5zM8 3h8v4H8z" />
      <path d="M9 13h6M12 10v6" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3h12v18H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.7-4.5 3.5-7 8-7s7.3 2.5 8 7" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v19l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  rewards: (
    <>
      <path d="M4 10h16v11H4zM3 7h18v4H3zM12 7v14" />
      <path d="M12 7c-4 0-5-5-2-5 2 0 2 3 2 5Zm0 0c4 0 5-5 2-5-2 0-2 3-2 5Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.6v.2h-4V21A1.8 1.8 0 0 0 8.8 19.4a1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 2.8 14h-.2v-4h.2a1.8 1.8 0 0 0 1.6-1.1 1.8 1.8 0 0 0-.4-2l-.1-.1L6.7 4l.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 2.8v-.2h4v.2a1.8 1.8 0 0 0 1.1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1L20 6.7l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1.1h.2v4h-.2a1.8 1.8 0 0 0-1.7 1.1Z" />
    </>
  ),
  voucher: (
    <>
      <path d="M3 7h18v10H3z" />
      <path d="M8 7v2M8 12v2M8 17v-1" />
      <path d="M13 11h5M15.5 8.5v5" />
    </>
  ),
};

export function JoyIcon({
  name,
  size = 20,
}: {
  name: JoyIconName;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="joy-icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      >
        {iconPaths[name]}
      </g>
    </svg>
  );
}

export function PageHeader({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="jc-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="jc-page-actions">{action}</div> : null}
    </header>
  );
}

export function MetricCard({
  hint,
  icon,
  label,
  value,
}: {
  hint?: ReactNode;
  icon?: JoyIconName;
  label: string;
  value: ReactNode;
}) {
  return (
    <article className="metric-card">
      <header>
        <small>{label}</small>
        {icon ? <JoyIcon name={icon} /> : null}
      </header>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </article>
  );
}

export function EmptyState({
  action,
  description,
  icon = "receipt",
  title,
}: {
  action?: ReactNode;
  description: string;
  icon?: JoyIconName;
  title: string;
}) {
  return (
    <div className="jc-state jc-empty-state">
      <span className="jc-state-icon">
        <JoyIcon name={icon} size={24} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="jc-state jc-loading-state">
      <span aria-hidden="true" className="jc-spinner" />
      <strong>{label}</strong>
      <div aria-hidden="true" className="jc-skeleton-lines">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="jc-state jc-error-state" role="alert">
      <span className="jc-state-icon">
        <JoyIcon name="close" size={24} />
      </span>
      <strong>We could not load this view</strong>
      <p>{message}</p>
      {onRetry ? (
        <button onClick={onRetry} type="button">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  busy = false,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  phrase,
  title,
}: {
  busy?: boolean;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  phrase: string;
  title: string;
}) {
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      setConfirmation("");
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [busy, onCancel, open]);

  if (!open) return null;
  return (
    <div className="jc-dialog-layer">
      <button
        aria-label="Cancel confirmation"
        className="jc-dialog-scrim"
        disabled={busy}
        onClick={onCancel}
        type="button"
      />
      <section
        aria-describedby="jc-confirm-description"
        aria-labelledby="jc-confirm-title"
        aria-modal="true"
        className="jc-confirm-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <span className="jc-state-icon">
          <JoyIcon name="endDay" size={24} />
        </span>
        <div>
          <p className="eyebrow">Confirmation required</p>
          <h2 id="jc-confirm-title">{title}</h2>
          <p id="jc-confirm-description">{description}</p>
        </div>
        <label>
          Type <strong>{phrase}</strong> to continue
          <input
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>
        <footer>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="danger-action"
            disabled={busy || confirmation !== phrase}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
