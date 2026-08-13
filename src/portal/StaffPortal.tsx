import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { restoreSession, subscribeToSession, type SessionUser } from "./client";
import {
  archiveReceipt,
  assignOrdersToBusinessDay,
  BusinessDay,
  CartLine,
  changeOrderStatus,
  closeBusinessDay,
  createCustomerVoucher,
  createVoucherCampaign,
  createStaffCustomer,
  createStaffOrder,
  confirmOrderPayment,
  loadBusinessDayReport,
  loadBusinessDays,
  loadCurrentBusinessDay,
  loadCustomerDirectory,
  loadCustomerVouchers,
  loadOwnerOrders,
  loadOwnerOverview,
  loadStaffProfile,
  loadStaffQueues,
  loadMenu,
  loadVoucherRequests,
  MenuItem,
  MenuSize,
  OwnerOrder,
  OwnerOverviewStats,
  OwnerVoucher,
  QueueOrder,
  recordOwnerPayment,
  removeRedeemedVoucher,
  previewVoucher,
  reviewVoucherRequest,
  runEndDay,
  searchCustomerByPhone,
  signInStaff,
  signOut,
  StaffProfile,
  startBusinessDay,
  subscribeToStaffQueues,
  updateCashierOrderItem,
  VoucherRequest,
  VoucherCampaignRecipient,
  voidReceipt,
} from "./repository";
import { OperationalOrderStatus, statusLabel } from "./workflow";
import { OwnerMenuManager } from "./OwnerMenuManager";
import { BrandLogo } from "./BrandLogo";
import { AppIcon, type AppIconName } from "./AppIcon";
import { MenuCategoryGallery } from "./MenuCategoryGallery";
import { ProductImage } from "./ProductImage";
import { VoucherCard, shareVoucherArtwork } from "./VoucherCard";
import { createClientId } from "./cartDraft";
import { CoffeeWorldGame } from "./CoffeeWorldGame";
import {
  buildDailyReportHtml,
  buildReceiptPrintHtml,
  type DailyReportData,
} from "../receiptPrint";
import {
  isCancelledReceipt,
  isOutstandingReceipt,
} from "./receiptClassification";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

function remainingBalance(order: { paid_amount?: number; total?: number }) {
  return (
    Math.max(
      0,
      Math.round(
        (Number(order.total || 0) - Number(order.paid_amount || 0)) * 100,
      ),
    ) / 100
  );
}

const ORDER_PLACE_LABELS: Record<string, string> = {
  car: "Car",
  delivery: "Delivery",
  dine_in: "Dine in",
  outside: "Outside",
  takeaway: "Takeaway",
};

const STAFF_ROLE_BANNERS: Record<
  string,
  { eyebrow: string; headline: string; message: string }
> = {
  owner: {
    eyebrow: "Owner command",
    headline: "Lead the whole story.",
    message:
      "See every order, guest, payment, and team action from one clear place.",
  },
  manager: {
    eyebrow: "Manager workspace",
    headline: "Keep every shift moving.",
    message:
      "Coordinate the floor, follow performance, and support every service moment.",
  },
  cashier: {
    eyebrow: "Cashier counter",
    headline: "Make checkout effortless.",
    message:
      "Confirm each order, keep payments accurate, and send a clear ticket forward.",
  },
  waiter: {
    eyebrow: "Service floor",
    headline: "Turn every handoff into hospitality.",
    message:
      "Follow each guest and order from the first welcome through the final delivery.",
  },
  barista: {
    eyebrow: "Barista station",
    headline: "Craft every cup with care.",
    message:
      "Read the queue at a glance, prepare in sequence, and finish every drink confidently.",
  },
};

const STAFF_NAVIGATION_ICONS: Record<string, AppIconName> = {
  analytics: "analytics",
  cashier: "cashier",
  customers: "customers",
  coffee_game: "game",
  end_day: "end-day",
  kitchen: "kitchen",
  menu: "menu-images",
  new_order: "menu",
  orders_receipts: "receipts",
  overview: "overview",
  system_status: "system",
  voucher_requests: "voucher-requests",
};

function orderDetails(customerNotes?: string | null) {
  const notes = String(customerNotes || "");
  const placeMatch = notes.match(/^\[Order place: ([a-z_]+)\]\n?/);
  const carType = notes.match(/^\[Car type: (.+)\]$/m)?.[1] || "";
  const carColor = notes.match(/^\[Car color: (.+)\]$/m)?.[1] || "";
  return {
    carColor,
    carType,
    notes: notes
      .replace(/^\[Order place: [a-z_]+\]\n?/, "")
      .replace(/^\[Car type: .+\]\n?/m, "")
      .replace(/^\[Car color: .+\]\n?/m, "")
      .trim(),
    place: placeMatch?.[1]
      ? ORDER_PLACE_LABELS[placeMatch[1]] || "Takeaway"
      : "Takeaway",
  };
}

function OrderPlaceAndNotes({
  customerNotes,
}: {
  customerNotes?: string | null;
}) {
  const details = orderDetails(customerNotes);
  return (
    <>
      <p className="queue-order-place">
        <strong>Order place:</strong> {details.place}
      </p>
      {details.carType || details.carColor ? (
        <p className="queue-car-details">
          <strong>Car:</strong>{" "}
          {[details.carType, details.carColor].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {details.notes ? (
        <p>
          <strong>Customer note:</strong> {details.notes}
        </p>
      ) : null}
    </>
  );
}

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function StaffPortal() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    void restoreSession().then((sessionUser) => {
      setUser(sessionUser);
      setChecking(false);
    });
    const unsubscribe = subscribeToSession((sessionUser) => {
      setUser(sessionUser);
      setChecking(false);
    });
    return unsubscribe;
  }, []);
  if (checking)
    return (
      <main className="joy-portal center-state">Checking staff access…</main>
    );
  return user ? <StaffWorkspace user={user} /> : <StaffAccess />;
}

function StaffAccess() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await signInStaff(
        String(form.get("email") || ""),
        String(form.get("password") || ""),
      );
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell joy-access">
      <section
        className="auth-experience auth-experience--staff"
        aria-label="Joy Corner staff access"
      >
        <aside className="auth-story-panel">
          <BrandLogo markOnly showName />
          <div>
            <p className="eyebrow">Joy Corner operations</p>
            <h2>
              One team.
              <br />
              One warm welcome.
            </h2>
            <p>
              Owner, cashier, waiter, and barista tools in one secure workspace.
            </p>
          </div>
          <small>Authorized staff only</small>
        </aside>
        <section className="auth-card">
          <BrandLogo compact markOnly showName />
          <p className="eyebrow">Secure staff workspace</p>
          <h1>Staff sign in</h1>
          <form className="customer-order-form" onSubmit={submit}>
            <label>
              Email
              <input name="email" required type="email" />
            </label>
            <label>
              Password
              <div className="password-toggle">
                <input
                  name="password"
                  required
                  type={showPassword ? "text" : "password"}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {message ? <p role="alert">{message}</p> : null}
          <p className="auth-security-note">
            Staff accounts are created and managed by the owner.
          </p>
          <a className="auth-portal-link" href="/order">
            Open customer ordering
          </a>
        </section>
      </section>
    </main>
  );
}

function StaffWorkspace({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [cashier, setCashier] = useState<QueueOrder[]>([]);
  const [kitchen, setKitchen] = useState<QueueOrder[]>([]);
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [tab, setTab] = useState<
    | "overview"
    | "new_order"
    | "cashier"
    | "kitchen"
    | "customers"
    | "coffee_game"
    | "menu"
    | "voucher_requests"
    | "orders_receipts"
    | "end_day"
    | "analytics"
    | "system_status"
  >("cashier");
  const [message, setMessage] = useState("Loading operational queues…");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [endingDay, setEndingDay] = useState(false);
  const [menuRefreshVersion, setMenuRefreshVersion] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    if (!navigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeNavigation(event: KeyboardEvent) {
      if (event.key === "Escape") setNavigationOpen(false);
    }
    document.addEventListener("keydown", closeNavigation);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeNavigation);
    };
  }, [navigationOpen]);

  async function refreshQueues(role: StaffProfile["role"]) {
    try {
      const queues = await loadStaffQueues(role);
      setCashier(queues.cashier);
      setKitchen(queues.kitchen);
    } catch (error) {
      setMessage(getMessage(error));
    }
  }

  async function initializeWorkspace() {
    try {
      const nextProfile = await loadStaffProfile();
      if (nextProfile.role === "customer")
        throw new Error("This account does not have staff access.");
      const [queues, directory] = await Promise.all([
        loadStaffQueues(nextProfile.role),
        ["owner", "manager", "cashier"].includes(nextProfile.role)
          ? loadCustomerDirectory()
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile as StaffProfile);
      setCashier(queues.cashier);
      setKitchen(queues.kitchen);
      setCustomers(directory);
      setTab(
        nextProfile.role === "owner" || nextProfile.role === "manager"
          ? "overview"
          : nextProfile.role === "barista"
            ? "kitchen"
            : nextProfile.role === "waiter"
              ? "new_order"
              : "cashier",
      );
      setMessage("");
    } catch (error) {
      setMessage(getMessage(error));
    }
  }

  useEffect(() => {
    void initializeWorkspace();
  }, [user.id]);

  useEffect(() => {
    const role = profile?.role;
    if (!role) return;
    let refreshTimer: number | undefined;
    const unsubscribe = subscribeToStaffQueues(role, (event) => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (event?.topic === "menu") {
          setMenuRefreshVersion((current) => current + 1);
        } else {
          void refreshQueues(role);
        }
      }, 150);
    });
    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [profile?.role]);

  async function move(
    order: QueueOrder,
    next: OperationalOrderStatus,
    reason = "",
  ) {
    setBusyOrder(order.order_id);
    try {
      await changeOrderStatus(order.order_id, next, reason);
      const labels: Partial<Record<OperationalOrderStatus, string>> = {
        confirmed: `Order ${order.order_number} confirmed and sent to the barista.`,
        rejected: `Order ${order.order_number} rejected.`,
        cancelled: `Order ${order.order_number} cancelled.`,
        accepted: `Order ${order.order_number} accepted.`,
        preparing: `Order ${order.order_number} is now being prepared.`,
        ready: `Order ${order.order_number} is ready for pickup.`,
        picked_up: `Order ${order.order_number} marked as picked up.`,
        closed: `Order ${order.order_number} completed.`,
      };
      setMessage(labels[next] || `Order ${order.order_number} updated.`);
      if (profile) await refreshQueues(profile.role);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusyOrder(null);
    }
  }

  const [paymentOrder, setPaymentOrder] = useState<QueueOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash_at_cashier");
  const [paymentBusy, setPaymentBusy] = useState(false);

  function openPayment(order: QueueOrder) {
    const remaining = remainingBalance(order);
    setPaymentOrder(order);
    setPaymentAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setPaymentMethod(order.payment_method || "cash_at_cashier");
  }

  async function submitPayment() {
    if (!paymentOrder) return;
    const remaining = remainingBalance(paymentOrder);
    const amount = Number(paymentAmount.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.01) {
      setMessage(
        `Enter a payment between ${money.format(0.01)} and ${money.format(remaining)}.`,
      );
      return;
    }
    setPaymentBusy(true);
    try {
      await confirmOrderPayment({
        amount,
        orderId: paymentOrder.order_id,
        paymentMethod: paymentMethod as
          | "cash_at_cashier"
          | "card_at_branch"
          | "instapay"
          | "manual_transfer",
        reference: "",
      });
      setMessage(
        `${money.format(amount)} recorded for ${paymentOrder.order_number}.`,
      );
      setPaymentOrder(null);
      setPaymentAmount("");
      setPaymentMethod("cash_at_cashier");
      if (profile) await refreshQueues(profile.role);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setPaymentBusy(false);
    }
  }

  function printReceipt(order: QueueOrder) {
    const receiptWindow = window.open("", "_blank", "width=900,height=800");
    if (!receiptWindow) {
      setMessage("Allow pop-ups for Joy Corner to print the receipt.");
      return;
    }
    receiptWindow.opener = null;
    const items = Array.isArray(order.item_summary) ? order.item_summary : [];
    const details = orderDetails(order.customer_notes);
    receiptWindow.document.write(
      buildReceiptPrintHtml({
        customerName: order.customer_name || order.pickup_name,
        customerPhone: order.customer_phone || "",
        items: items.map((item) => ({
          itemName: item.itemName || item.name || "Item",
          qty: item.quantity || 1,
          size: item.size || "",
          total: Number(item.totalPrice || 0),
          unitPrice: Number(item.unitPrice || 0),
        })),
        notes: details.notes,
        orderDateTime: order.created_at
          ? new Date(order.created_at).toLocaleString()
          : "",
        orderPlace: [details.place, details.carType, details.carColor]
          .filter(Boolean)
          .join(" · "),
        outstandingAmount: remainingBalance(order),
        paidAmount: order.paid_amount || 0,
        paymentStatus: order.payment_status?.replace(/_/g, " ") || "unpaid",
        receiptNumber: order.order_number,
        staff: profile?.full_name || "Joy Corner staff",
        subtotal: order.subtotal || order.total || 0,
        total: order.total || 0,
      }),
    );
    receiptWindow.document.close();
  }

  async function endDay() {
    if (
      !window.confirm(
        "Close today's reporting period and send its summary to Google Sheets?",
      )
    )
      return;
    setEndingDay(true);
    try {
      const report = await runEndDay();
      setMessage(
        `End Day completed: ${report.order_count} orders, ${money.format(report.gross_sales)} gross sales. Reporting is queued for Google Sheets.`,
      );
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setEndingDay(false);
    }
  }

  const canCashier =
    profile && ["owner", "manager", "cashier"].includes(profile.role);
  const canKitchen =
    profile && ["owner", "manager", "barista"].includes(profile.role);
  const canWaiter = profile?.role === "waiter";
  const canCreate =
    profile && ["owner", "manager", "cashier", "waiter"].includes(profile.role);
  const canOverview = profile && ["owner", "manager"].includes(profile.role);
  const navigate = (nextTab: typeof tab) => {
    setTab(nextTab);
    setNavigationOpen(false);
  };
  const navigationGroups: Array<{
    label: string;
    items: Array<{
      badge?: number;
      label: string;
      tab: typeof tab;
      visible: boolean | null;
    }>;
  }> = [
    {
      label: "Operations",
      items: [
        { label: "Overview", tab: "overview", visible: canOverview },
        { label: "New order", tab: "new_order", visible: canCreate },
        {
          badge: cashier.length,
          label: canWaiter ? "Order status" : "Cashier",
          tab: "cashier",
          visible: canCashier || canWaiter,
        },
        {
          badge: kitchen.length,
          label: "Kitchen",
          tab: "kitchen",
          visible: canKitchen,
        },
        {
          label: "Orders & receipts",
          tab: "orders_receipts",
          visible: canCashier,
        },
      ],
    },
    {
      label: "Customers",
      items: [
        {
          badge: customers.length,
          label: "Customers",
          tab: "customers",
          visible: canCashier,
        },
        {
          label: "Voucher requests",
          tab: "voucher_requests",
          visible: profile?.role === "owner",
        },
        {
          label: "Coffee world game",
          tab: "coffee_game",
          visible: true,
        },
      ],
    },
    {
      label: "Catalog",
      items: [
        {
          label: "Menu & images",
          tab: "menu",
          visible: profile?.role === "owner",
        },
      ],
    },
    {
      label: "Business",
      items: [
        { label: "Analytics", tab: "analytics", visible: canOverview },
        {
          label: "End of day",
          tab: "end_day",
          visible: profile?.role === "owner",
        },
        {
          label: "System",
          tab: "system_status",
          visible: profile?.role === "owner",
        },
      ],
    },
  ];
  const activeRole = profile?.role || user.role || "staff";
  const roleBanner = STAFF_ROLE_BANNERS[activeRole] || {
    eyebrow: "Joy Corner operations",
    headline: "Make every moment count.",
    message: "A focused workspace for warm, accurate Joy Corner service.",
  };
  return (
    <main
      className={`joy-portal staff-portal-shell staff-role-${activeRole}${navigationOpen ? " navigation-open" : ""}`}
    >
      <button
        aria-expanded={navigationOpen}
        aria-label={
          navigationOpen ? "Close staff navigation" : "Open staff navigation"
        }
        className={`staff-floating-menu${navigationOpen ? " open" : ""}`}
        onClick={() => setNavigationOpen((open) => !open)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>
      <button
        aria-label="Close staff navigation"
        className={`staff-navigation-scrim${navigationOpen ? " open" : ""}`}
        onClick={() => setNavigationOpen(false)}
        type="button"
      />
      <aside
        aria-label="Staff navigation"
        className={`staff-sidebar${navigationOpen ? " open" : ""}`}
      >
        <div className="staff-sidebar-brand">
          <BrandLogo />
          <button
            aria-label="Close navigation"
            className="staff-sidebar-close"
            onClick={() => setNavigationOpen(false)}
            type="button"
          >
            ×
          </button>
        </div>
        <nav>
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.visible);
            return visibleItems.length ? (
              <section className="staff-navigation-group" key={group.label}>
                <h2>{group.label}</h2>
                {visibleItems.map((item) => (
                  <button
                    aria-current={tab === item.tab ? "page" : undefined}
                    className={tab === item.tab ? "active" : ""}
                    key={item.tab}
                    onClick={() => navigate(item.tab)}
                    type="button"
                  >
                    <span className="staff-navigation-icon" aria-hidden="true">
                      <AppIcon
                        name={STAFF_NAVIGATION_ICONS[item.tab] || "overview"}
                      />
                    </span>
                    <span>{item.label}</span>
                    {typeof item.badge === "number" ? (
                      <small>{item.badge}</small>
                    ) : null}
                  </button>
                ))}
              </section>
            ) : null;
          })}
        </nav>
        <aside
          className="staff-brand-story"
          aria-label="Joy Corner brand story"
        >
          <p className="eyebrow">Our story</p>
          <strong>Every cup tells a story.</strong>
          <span>
            Warm hospitality, carefully selected coffee, and unforgettable
            moments since 2016.
          </span>
        </aside>
        <div className="staff-sidebar-profile">
          <strong>{profile?.full_name || "Staff"}</strong>
          <span>{profile?.role || "Loading"}</span>
          <button onClick={() => void signOut()} type="button">
            Sign out
          </button>
        </div>
      </aside>
      <header
        className={`portal-header staff-role-banner staff-role-banner--${activeRole}`}
      >
        <div className="staff-role-banner-copy">
          <p className="eyebrow">{roleBanner.eyebrow}</p>
          <h1>{roleBanner.headline}</h1>
          <p>{roleBanner.message}</p>
        </div>
        <div className="staff-role-account">
          <img alt="" src="/assets/joy-corner-logo-mark.png" />
          <div>
            <small>{activeRole} account</small>
            <strong>{profile?.full_name || "Staff"}</strong>
            <span className="staff-header-context">
              {tab.replace(/_/g, " ")}
            </span>
            {profile?.role === "owner" ? (
              <span
                className="build-badge"
                title={`Built: ${typeof __BUILD_TIME__ !== "undefined" ? new Date(__BUILD_TIME__).toLocaleString() : "unknown"}`}
              >
                {typeof __BUILD_GIT_SHA__ !== "undefined"
                  ? __BUILD_GIT_SHA__
                  : ""}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {message ? (
        <p className="portal-message" role="status">
          {message}
        </p>
      ) : null}
      {tab === "overview" && canOverview ? (
        <StaffOverview
          cashier={cashier}
          customers={customers.length}
          kitchen={kitchen}
          onNavigate={setTab}
          onEndDay={() => void endDay()}
          endingDay={endingDay}
        />
      ) : null}
      {tab === "new_order" && canCreate ? (
        <StaffOrderForm
          customers={customers}
          menuRefreshVersion={menuRefreshVersion}
          role={profile?.role || user.role}
          onCreated={async (orderNumber, changeDue) => {
            setMessage(
              changeDue > 0
                ? `Order ${orderNumber} was created. Return ${money.format(changeDue)} change to the customer.`
                : `Order ${orderNumber} was sent to the cashier for confirmation.`,
            );
            if (profile) await refreshQueues(profile.role);
          }}
        />
      ) : null}
      {tab === "cashier" && (canCashier || canWaiter) ? (
        <Queue
          title={
            canWaiter
              ? "Orders sent by the service team"
              : "Cashier confirmation and payment"
          }
          orders={cashier}
          busyOrder={busyOrder}
          variant={canWaiter ? "waiter" : "cashier"}
          onEditItem={
            canWaiter
              ? undefined
              : async (order, itemId, quantity, replacementSizeId) => {
                  try {
                    await updateCashierOrderItem({
                      orderId: order.order_id,
                      orderItemId: itemId,
                      quantity,
                      replacementSizeId,
                    });
                    setMessage(
                      `Items and totals updated for ${order.order_number}. The customer account was updated too.`,
                    );
                    if (profile) await refreshQueues(profile.role);
                  } catch (error) {
                    setMessage(getMessage(error));
                  }
                }
          }
          actions={(order) => (
            <>
              {!canWaiter && order.status === "pending_confirmation" ? (
                <>
                  <button
                    onClick={() => void move(order, "confirmed")}
                    type="button"
                  >
                    Confirm
                  </button>
                  <button
                    className="button-danger"
                    onClick={() => {
                      const reason = window.prompt("Reason for rejection?");
                      if (reason !== null) {
                        if (reason.trim()) {
                          void move(order, "rejected", reason.trim());
                        } else {
                          setMessage("Rejection reason is required.");
                        }
                      }
                    }}
                    type="button"
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {!canWaiter &&
              order.status !== "pending_confirmation" &&
              order.payment_status !== "paid" ? (
                <button onClick={() => openPayment(order)} type="button">
                  Record payment ({money.format(remainingBalance(order))} due)
                </button>
              ) : null}
              <button
                className="button-secondary"
                onClick={() => printReceipt(order)}
                type="button"
              >
                Print receipt
              </button>
              {!canWaiter && order.status === "picked_up" ? (
                <button
                  className="button-danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Close order ${order.order_number}? This cannot be undone.`,
                      )
                    ) {
                      void move(order, "closed");
                    }
                  }}
                  type="button"
                >
                  Close
                </button>
              ) : null}
              {!canWaiter &&
              !["picked_up", "cancelled", "rejected", "closed"].includes(
                order.status,
              ) ? (
                <button
                  className="button-danger"
                  onClick={() => {
                    const reason = window.prompt(
                      `Why are you cancelling ${order.order_number}?`,
                    );
                    if (reason?.trim())
                      void move(order, "cancelled", reason.trim());
                    else if (reason !== null)
                      setMessage("Cancellation reason is required.");
                  }}
                  type="button"
                >
                  Cancel order
                </button>
              ) : null}
            </>
          )}
        />
      ) : null}
      {tab === "kitchen" && canKitchen ? (
        <Queue
          title="Confirmed kitchen queue"
          orders={kitchen}
          busyOrder={busyOrder}
          variant="kitchen"
          actions={(order) => {
            const next: Partial<
              Record<OperationalOrderStatus, OperationalOrderStatus>
            > = {
              confirmed: "accepted",
              accepted: "preparing",
              preparing: "ready",
              ready: "picked_up",
            };
            const target = next[order.status];
            return target ? (
              <>
                <button
                  className={`workflow-action workflow-action--${target}`}
                  onClick={() => void move(order, target)}
                  type="button"
                >
                  Mark {statusLabel(target)}
                </button>
                <button
                  className="button-danger"
                  onClick={() => {
                    const reason = window.prompt(
                      `Why are you cancelling ${order.order_number}?`,
                    );
                    if (reason?.trim())
                      void move(order, "cancelled", reason.trim());
                    else if (reason !== null)
                      setMessage("Cancellation reason is required.");
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </>
            ) : null;
          }}
        />
      ) : null}
      {tab === "customers" && canCashier ? (
        <StaffCustomerDirectory
          customers={customers}
          userRole={profile?.role || "cashier"}
          onRefresh={async () => {
            try {
              const directory = await loadCustomerDirectory();
              setCustomers(directory);
            } catch (error) {
              setMessage(getMessage(error));
            }
          }}
          onError={setMessage}
        />
      ) : null}
      {tab === "coffee_game" ? <CoffeeWorldGame /> : null}
      {tab === "menu" && profile?.role === "owner" ? (
        <OwnerMenuManager />
      ) : null}
      {tab === "voucher_requests" && profile?.role === "owner" ? (
        <OwnerVoucherRequests onError={setMessage} />
      ) : null}
      {tab === "orders_receipts" && canCashier ? (
        <OwnerOrdersReceipts
          onError={setMessage}
          userRole={profile?.role || "cashier"}
        />
      ) : null}
      {tab === "analytics" && canOverview ? (
        <OwnerAnalytics onError={setMessage} />
      ) : null}
      {tab === "end_day" && profile?.role === "owner" ? (
        <OwnerEndDay
          onError={setMessage}
          onRefreshQueues={() =>
            profile ? refreshQueues(profile.role) : Promise.resolve()
          }
        />
      ) : null}
      {tab === "system_status" && profile?.role === "owner" ? (
        <OwnerSystemStatus />
      ) : null}
      {paymentOrder ? (
        <div
          className="payment-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
        >
          <div className="payment-modal">
            <header>
              <p className="eyebrow">Record payment</p>
              <h2 id="payment-modal-title">{paymentOrder.order_number}</h2>
              <p className="muted">
                Remaining: {money.format(remainingBalance(paymentOrder))}
              </p>
            </header>
            <label>
              Payment amount (EGP)
              <input
                autoFocus
                inputMode="decimal"
                min="0.01"
                onChange={(e) => setPaymentAmount(e.target.value)}
                step="0.01"
                type="number"
                value={paymentAmount}
              />
            </label>
            <label>
              Payment method
              <select
                onChange={(e) => setPaymentMethod(e.target.value)}
                value={paymentMethod}
              >
                <option value="cash_at_cashier">Cash</option>
                <option value="card_at_branch">Card</option>
                <option value="instapay">InstaPay</option>
                <option value="manual_transfer">Transfer</option>
              </select>
            </label>
            <div className="payment-modal-actions">
              <button
                className="button-secondary"
                disabled={paymentBusy}
                onClick={() => {
                  setPaymentOrder(null);
                  setPaymentAmount("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                disabled={paymentBusy || !paymentAmount}
                onClick={() => void submitPayment()}
                type="button"
              >
                {paymentBusy ? "Recording…" : "Record payment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ═══════════════════════════════════════════════════
// OWNER SYSTEM STATUS
// ═══════════════════════════════════════════════════

type HealthCheck = {
  label: string;
  status: "healthy" | "unavailable" | "misconfigured" | "checking";
  detail: string;
};

function OwnerSystemStatus() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(true);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const results: HealthCheck[] = [];

    results.push({
      label: "Frontend",
      status: "healthy",
      detail: `Build ${typeof __BUILD_GIT_SHA__ !== "undefined" ? __BUILD_GIT_SHA__ : "unknown"} · ${typeof __BUILD_TIME__ !== "undefined" ? new Date(__BUILD_TIME__).toLocaleString() : "unknown"}`,
    });

    const apiOrigin =
      typeof __API_CONFIG__ !== "undefined"
        ? __API_CONFIG__.baseUrl
        : "not set";
    results.push({
      label: "API Origin",
      status:
        apiOrigin && apiOrigin !== "not set" ? "healthy" : "misconfigured",
      detail: apiOrigin || "VITE_API_URL not configured",
    });

    const backendUrl = apiOrigin.startsWith("http")
      ? apiOrigin.replace(/\/api\/?$/, "") || apiOrigin
      : "";

    try {
      const resp = await fetch(`${backendUrl}/health`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await resp.json();
      results.push({
        label: "Backend Health",
        status: data.ok ? "healthy" : "unavailable",
        detail: resp.ok
          ? `Service: ${data.service || "ok"}`
          : `HTTP ${resp.status}`,
      });
    } catch {
      results.push({
        label: "Backend Health",
        status: "unavailable",
        detail: "Could not reach backend",
      });
    }

    try {
      const resp = await fetch(`${backendUrl}/ready`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await resp.json();
      results.push({
        label: "Database",
        status: data.checks?.database?.ok ? "healthy" : "unavailable",
        detail: data.checks?.database?.ok
          ? `Latency: ${data.checks.database.latencyMs}ms`
          : "Database check failed",
      });
    } catch {
      results.push({
        label: "Database",
        status: "unavailable",
        detail: "Could not reach backend",
      });
    }

    try {
      const resp = await fetch(`${backendUrl}/api/auth/me`, {
        credentials: "include",
        signal: AbortSignal.timeout(5000),
      });
      results.push({
        label: "Session",
        status:
          resp.status === 401 ? "healthy" : resp.ok ? "healthy" : "unavailable",
        detail:
          resp.status === 401
            ? "Not signed in (expected)"
            : resp.ok
              ? "Authenticated"
              : `HTTP ${resp.status}`,
      });
    } catch {
      results.push({
        label: "Session",
        status: "unavailable",
        detail: "Could not check",
      });
    }

    results.push({
      label: "Menu Sync",
      status: "healthy",
      detail: "Backend serves /api/menu",
    });

    setChecks(results);
    setRunning(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const statusColor = (s: HealthCheck["status"]) => {
    if (s === "healthy") return "var(--joy-success, #51623d)";
    if (s === "misconfigured") return "var(--joy-danger, #c0392b)";
    return "var(--muted, #766650)";
  };

  return (
    <section className="portal-section">
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2>System Status</h2>
        </div>
        <button
          className="button-secondary"
          disabled={running}
          onClick={() => void runChecks()}
          type="button"
        >
          {running ? "Checking…" : "Refresh"}
        </button>
      </header>
      <div className="staff-table" style={{ marginTop: "1rem" }}>
        <div
          className="staff-table-row heading"
          style={{ gridTemplateColumns: "1fr auto 2fr" }}
        >
          <span>Component</span>
          <span>Status</span>
          <span>Detail</span>
        </div>
        {checks.map((c) => (
          <div
            className="staff-table-row"
            key={c.label}
            style={{ gridTemplateColumns: "1fr auto 2fr" }}
          >
            <span>
              <strong>{c.label}</strong>
            </span>
            <span style={{ color: statusColor(c.status), fontWeight: 600 }}>
              {c.status}
            </span>
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--joy-text-secondary, #766650)",
              }}
            >
              {c.detail}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomerLookupCard({
  customer,
}: {
  customer: Record<string, unknown>;
}) {
  const phone = String(customer.phone || "");
  const email = String(customer.email || "");
  const phoneDigits = phone.replace(/\D/g, "").replace(/^00/, "");
  const whatsappNumber = phoneDigits.startsWith("20")
    ? phoneDigits
    : phoneDigits.length >= 8
      ? `20${phoneDigits.replace(/^0/, "")}`
      : phoneDigits;
  const lastOrder = customer.lastOrderAt
    ? new Date(String(customer.lastOrderAt)).toLocaleString("en-EG", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "No previous visit";
  const savedCar = orderDetails(String(customer.lastOrderNotes || ""));

  return (
    <article className="customer-lookup-card">
      <header>
        <div>
          <small>Customer found</small>
          <strong>{String(customer.fullName || "")}</strong>
          {customer.customerNumber ? (
            <span>{String(customer.customerNumber)}</span>
          ) : null}
        </div>
        <span className="customer-found-mark">✓</span>
      </header>
      <dl>
        <div>
          <dt>Total spent</dt>
          <dd>{money.format(Number(customer.totalSpend || 0))}</dd>
        </div>
        <div>
          <dt>Balance due</dt>
          <dd>{money.format(Number(customer.outstandingBalance || 0))}</dd>
        </div>
        <div>
          <dt>Orders</dt>
          <dd>{Number(customer.orderCount || 0)}</dd>
        </div>
        <div>
          <dt>Loyalty points</dt>
          <dd>{Number(customer.loyaltyPoints || 0)}</dd>
        </div>
        <div>
          <dt>Free rewards</dt>
          <dd>{Number(customer.freeRewards || 0)}</dd>
        </div>
      </dl>
      <p>
        <span>Last visit</span>
        <strong>{lastOrder}</strong>
      </p>
      {savedCar.carType || savedCar.carColor ? (
        <p>
          <span>Saved car</span>
          <strong>
            {[savedCar.carType, savedCar.carColor].filter(Boolean).join(" · ")}
          </strong>
        </p>
      ) : null}
      <nav aria-label="Contact customer">
        {phone ? <a href={`tel:${phone}`}>Call</a> : null}
        {whatsappNumber ? (
          <a
            href={`https://wa.me/${whatsappNumber}`}
            rel="noreferrer"
            target="_blank"
          >
            WhatsApp
          </a>
        ) : null}
        {email ? <a href={`mailto:${email}`}>Email</a> : null}
      </nav>
    </article>
  );
}

function StaffOrderForm({
  customers: _customers,
  menuRefreshVersion,
  onCreated,
  role,
}: {
  customers: Array<Record<string, unknown>>;
  menuRefreshVersion: number;
  onCreated: (orderNumber: string, changeDue: number) => Promise<void>;
  role: StaffProfile["role"];
}) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupName, setPickupName] = useState("");
  const [orderPlace, setOrderPlace] = useState<
    "dine_in" | "takeaway" | "car" | "outside" | "delivery"
  >("dine_in");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash_at_cashier" | "card_at_branch" | "instapay" | "manual_transfer"
  >("cash_at_cashier");
  const [carType, setCarType] = useState("");
  const [carColor, setCarColor] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [category, setCategory] = useState("All");
  const [menuQuery, setMenuQuery] = useState("");
  const [sizePickerItem, setSizePickerItem] = useState<MenuItem | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherPreview, setVoucherPreview] = useState<{
    discount: number;
    total: number;
  } | null>(null);
  const [voucherChecking, setVoucherChecking] = useState(false);
  useEffect(() => {
    void loadMenu()
      .then(setMenu)
      .catch((error) => setMessage(getMessage(error)));
  }, [menuRefreshVersion]);
  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(menu.map((item) => item.category).filter(Boolean))),
    ],
    [menu],
  );
  const filteredMenu = useMemo(() => {
    const search = menuQuery.trim().toLocaleLowerCase();
    return menu.filter(
      (item) =>
        (category === "All" || item.category === category) &&
        (!search ||
          item.name.toLocaleLowerCase().includes(search) ||
          item.description.toLocaleLowerCase().includes(search)),
    );
  }, [category, menu, menuQuery]);
  const orderTotal = cart.reduce(
    (sum, line) =>
      sum +
      line.quantity *
        (line.size.price +
          line.modifiers.reduce(
            (extra, modifier) => extra + modifier.price,
            0,
          )),
    0,
  );
  const roundedOrderTotal = Math.round(orderTotal * 100) / 100;
  const payableOrderTotal = voucherPreview?.total ?? roundedOrderTotal;
  const numericPaidAmount =
    Math.round(Math.max(0, Number(paidAmount || 0)) * 100) / 100;
  const appliedPaidAmount = Math.min(payableOrderTotal, numericPaidAmount);
  const remainingAmount =
    Math.max(0, Math.round((payableOrderTotal - appliedPaidAmount) * 100)) /
    100;
  const changeDue =
    Math.max(0, Math.round((numericPaidAmount - payableOrderTotal) * 100)) /
    100;
  const canReceivePayment = ["owner", "manager", "cashier"].includes(role);
  useEffect(() => {
    setVoucherPreview(null);
  }, [roundedOrderTotal, selectedCustomerId]);
  function addWithSize(item: MenuItem, size: MenuSize) {
    setCart((current) => {
      const found = current.find((line) => line.size.id === size.id);
      return found
        ? current.map((line) =>
            line === found ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [
            ...current,
            {
              item,
              lineId: createClientId(),
              modifiers: [],
              notes: "",
              quantity: 1,
              size,
            },
          ];
    });
  }
  function add(item: MenuItem) {
    const size = item.sizes[0];
    if (!size) return;
    if (item.sizes.length > 1) {
      setSizePickerItem(item);
      return;
    }
    addWithSize(item, size);
  }
  function updateLineQuantity(lineId: string, delta: number) {
    setCart((current) => {
      return current
        .map((line) =>
          line.lineId === lineId
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0);
    });
  }
  function removeLine(lineId: string) {
    setCart((current) => current.filter((line) => line.lineId !== lineId));
  }
  async function searchCustomer() {
    if (!customerPhone.trim()) return;
    setSearching(true);
    setMessage("");
    try {
      const customer = await searchCustomerByPhone(customerPhone.trim());
      if (customer) {
        setFoundCustomer(customer);
        setSelectedCustomerId(String(customer.id));
        setPickupName(String(customer.fullName || ""));
        const savedCar = orderDetails(String(customer.lastOrderNotes || ""));
        setCarType(savedCar.carType);
        setCarColor(savedCar.carColor);
        setMessage(`Customer found: ${String(customer.fullName || "")}`);
      } else {
        setFoundCustomer(null);
        setSelectedCustomerId(null);
        setCarType("");
        setCarColor("");
        setMessage(
          "Walk-in customer. This phone will be kept only on the receipt; web sign-up is required for a saved customer profile.",
        );
      }
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setSearching(false);
    }
  }
  async function checkVoucher() {
    if (!voucherCode.trim() || !selectedCustomerId || !cart.length) return;
    setVoucherChecking(true);
    setMessage("");
    try {
      const preview = await previewVoucher({
        code: voucherCode.trim(),
        customerId: selectedCustomerId,
        subtotal: roundedOrderTotal,
      });
      setVoucherCode(preview.code);
      setVoucherPreview({ discount: preview.discount, total: preview.total });
      setMessage(
        `Voucher applied: ${money.format(preview.discount)} discount.`,
      );
    } catch (error) {
      setVoucherPreview(null);
      setMessage(getMessage(error));
    } finally {
      setVoucherChecking(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) return;
    if (
      paymentMethod !== "cash_at_cashier" &&
      numericPaidAmount > payableOrderTotal + 0.01
    ) {
      setMessage("Non-cash payments cannot exceed the order total.");
      return;
    }
    if (voucherCode.trim() && !voucherPreview) {
      setMessage("Apply and verify the voucher before creating the order.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await createStaffOrder({
        cart,
        carColor,
        carType,
        customerId: selectedCustomerId || null,
        customerPhone: selectedCustomerId ? "" : customerPhone.trim(),
        customerNotes: String(form.get("customerNotes") || ""),
        orderPlace,
        paidAmount: canReceivePayment ? numericPaidAmount : 0,
        paymentMethod,
        pickupName: String(form.get("pickupName") || ""),
        voucherCode: voucherPreview ? voucherCode.trim() : "",
      });
      setCart([]);
      setFoundCustomer(null);
      setCustomerPhone("");
      setPickupName("");
      setPaidAmount("");
      setPaymentMethod("cash_at_cashier");
      setOrderPlace("dine_in");
      setCarType("");
      setCarColor("");
      setSelectedCustomerId(null);
      setVoucherCode("");
      setVoucherPreview(null);
      await onCreated(result.orderNumber, result.changeDue);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="portal-section">
      <h2>Create branch order</h2>
      <div className="staff-order-layout">
        <div className="staff-menu-panel">
          <label className="menu-search staff-search">
            <span className="sr-only">Search menu</span>
            <input
              onChange={(e) => setMenuQuery(e.target.value)}
              placeholder="Search menu…"
              type="search"
              value={menuQuery}
            />
          </label>
          {category === "All" && !menuQuery.trim() ? (
            <MenuCategoryGallery
              categories={categories.filter((name) => name !== "All")}
              items={menu}
              onSelect={setCategory}
            />
          ) : null}
          <nav
            aria-label="Menu categories"
            className="category-rail staff-category-rail"
          >
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
          <div className="compact-menu">
            {filteredMenu.map((item) => {
              const isUnavailable = item.availability_state !== "available";
              return (
                <button
                  aria-disabled={isUnavailable || !item.sizes.length}
                  className={
                    isUnavailable ? "compact-menu-item--unavailable" : ""
                  }
                  disabled={isUnavailable || !item.sizes.length}
                  key={item.id}
                  onClick={() => add(item)}
                  type="button"
                >
                  <ProductImage
                    alt={item.name}
                    size="sm"
                    src={item.image_url}
                  />
                  <strong>{item.name}</strong>
                  {item.description ? (
                    <small className="menu-item-desc">{item.description}</small>
                  ) : null}
                  <small className="menu-item-price">
                    {item.sizes[0]
                      ? money.format(item.sizes[0].price)
                      : "Unavailable"}
                  </small>
                  {isUnavailable ? (
                    <small className="menu-item-unavailable-label">
                      {item.availability_state === "sold_out"
                        ? "Sold out"
                        : item.availability_state === "temporarily_unavailable"
                          ? "Paused"
                          : "Unavailable"}
                    </small>
                  ) : null}
                </button>
              );
            })}
            {filteredMenu.length === 0 && menu.length > 0 ? (
              <div className="empty-menu-state">
                <p>No items in this category.</p>
              </div>
            ) : null}
          </div>
        </div>
        <form className="profile-grid staff-order-form" onSubmit={submit}>
          <label>
            Pickup name
            <input
              name="pickupName"
              onChange={(event) => setPickupName(event.target.value)}
              placeholder="Optional for walk-in customer"
              value={pickupName}
            />
          </label>
          <fieldset
            style={{
              border: "1px solid var(--border, #ccc)",
              padding: "0.5rem",
              borderRadius: "4px",
            }}
          >
            <legend>
              <strong>Customer (optional)</strong>
            </legend>
            <label>
              Phone number
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  inputMode="tel"
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    setFoundCustomer(null);
                    setSelectedCustomerId(null);
                    setCarType("");
                    setCarColor("");
                    setVoucherCode("");
                    setVoucherPreview(null);
                  }}
                  placeholder="+201234567890"
                  value={customerPhone}
                />
                <button
                  disabled={searching || !customerPhone.trim()}
                  onClick={() => void searchCustomer()}
                  type="button"
                >
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>
            </label>
            {foundCustomer ? (
              <CustomerLookupCard customer={foundCustomer} />
            ) : null}
            {!foundCustomer && customerPhone.trim() ? (
              <p className="walk-in-customer-note">
                Walk-in receipt contact only. This phone is not added to the
                customer directory. The customer must sign up in the web app
                to save a profile.
              </p>
            ) : null}
            {selectedCustomerId ? (
              <input
                type="hidden"
                name="customerId"
                value={selectedCustomerId}
              />
            ) : null}
          </fieldset>
          <section className="staff-voucher-entry">
            <label>
              Voucher ID / code
              <div>
                <input
                  autoComplete="off"
                  disabled={!selectedCustomerId || !cart.length}
                  onChange={(event) => {
                    setVoucherCode(event.target.value.toLocaleUpperCase());
                    setVoucherPreview(null);
                  }}
                  placeholder="JC-XXXXXX"
                  value={voucherCode}
                />
                <button
                  disabled={
                    voucherChecking ||
                    !voucherCode.trim() ||
                    !selectedCustomerId ||
                    !cart.length
                  }
                  onClick={() => void checkVoucher()}
                  type="button"
                >
                  {voucherChecking ? "Checking…" : "Apply"}
                </button>
              </div>
              <small>
                Vouchers belong to saved customer accounts and are single use.
              </small>
            </label>
            {voucherPreview ? (
              <dl>
                <div><dt>Voucher discount</dt><dd>− {money.format(voucherPreview.discount)}</dd></div>
                <div><dt>New total</dt><dd>{money.format(voucherPreview.total)}</dd></div>
              </dl>
            ) : null}
          </section>
          <fieldset className="order-place-options">
            <legend>Order place</legend>
            <div role="group" aria-label="Order place">
              {(
                [
                  ["dine_in", "Dine in"],
                  ["takeaway", "Takeaway"],
                  ["car", "Car"],
                  ["outside", "Outside"],
                  ["delivery", "Delivery"],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-pressed={orderPlace === value}
                  className={orderPlace === value ? "active" : ""}
                  key={value}
                  onClick={() => setOrderPlace(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {orderPlace === "car" ? (
            <fieldset className="car-details-fields">
              <legend>Customer car</legend>
              <label>
                Car make or type
                <input
                  list="common-car-types"
                  onChange={(event) => setCarType(event.target.value)}
                  placeholder="Select or type, e.g. Hyundai Elantra"
                  required
                  value={carType}
                />
                <datalist id="common-car-types">
                  {[
                    "Toyota",
                    "Hyundai",
                    "Kia",
                    "Nissan",
                    "Chevrolet",
                    "Renault",
                    "MG",
                    "Mercedes-Benz",
                    "BMW",
                    "Peugeot",
                    "Fiat",
                    "Skoda",
                  ].map((car) => (
                    <option key={car} value={car} />
                  ))}
                </datalist>
              </label>
              <label>
                Car color
                <input
                  list="common-car-colors"
                  onChange={(event) => setCarColor(event.target.value)}
                  placeholder="Select or type a color"
                  required
                  value={carColor}
                />
                <datalist id="common-car-colors">
                  {[
                    "Black",
                    "White",
                    "Silver",
                    "Gray",
                    "Blue",
                    "Red",
                    "Beige",
                    "Green",
                    "Brown",
                  ].map((color) => (
                    <option key={color} value={color} />
                  ))}
                </datalist>
              </label>
              {foundCustomer && (carType || carColor) ? (
                <small>
                  Saved from this customer’s latest car order. You can update it
                  for today.
                </small>
              ) : null}
            </fieldset>
          ) : null}
          <label>
            Payment method
            <select
              name="paymentMethod"
              onChange={(event) => {
                setPaymentMethod(event.target.value as typeof paymentMethod);
                if (event.target.value !== "cash_at_cashier") {
                  setPaidAmount((current) =>
                    String(Math.min(Number(current || 0), payableOrderTotal)),
                  );
                }
              }}
              value={paymentMethod}
            >
              <option value="cash_at_cashier">Cash</option>
              <option value="card_at_branch">Card</option>
              <option value="instapay">InstaPay</option>
              <option value="manual_transfer">Transfer</option>
            </select>
          </label>
          {canReceivePayment ? (
            <section className="order-payment-entry">
              <label>
                {paymentMethod === "cash_at_cashier"
                  ? "Cash received"
                  : "Paid now"}
                <input
                  inputMode="decimal"
                  max={
                    paymentMethod === "cash_at_cashier"
                      ? undefined
                      : payableOrderTotal
                  }
                  min="0"
                  onChange={(event) => setPaidAmount(event.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={paidAmount}
                />
              </label>
              <dl>
                <div>
                  <dt>Order total</dt>
                  <dd>{money.format(payableOrderTotal)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{money.format(appliedPaidAmount)}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{money.format(remainingAmount)}</dd>
                </div>
                {paymentMethod === "cash_at_cashier" ? (
                  <div>
                    <dt>Change due</dt>
                    <dd>{money.format(changeDue)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : (
            <p className="muted">
              The cashier will record the customer payment.
            </p>
          )}
          <label>
            Notes
            <textarea name="customerNotes" />
          </label>
          <div className="staff-cart">
            {cart.length === 0 ? (
              <p className="muted" style={{ padding: "0.5rem 0" }}>
                No items in cart. Click a menu item to add.
              </p>
            ) : (
              cart.map((line) => (
                <div key={line.lineId} className="staff-cart-line">
                  <div className="staff-cart-line-info">
                    <strong>{line.item.name}</strong>
                    <small>
                      {line.size.size_name} — {money.format(line.size.price)}
                    </small>
                  </div>
                  <div className="staff-cart-line-actions">
                    <button
                      className="button-secondary"
                      onClick={() => updateLineQuantity(line.lineId, -1)}
                      type="button"
                      style={{ padding: "0.2rem 0.5rem", minWidth: "2rem" }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: "2rem", textAlign: "center" }}>
                      {line.quantity}
                    </span>
                    <button
                      className="button-secondary"
                      onClick={() => updateLineQuantity(line.lineId, 1)}
                      type="button"
                      style={{ padding: "0.2rem 0.5rem", minWidth: "2rem" }}
                    >
                      +
                    </button>
                    <button
                      className="button-danger"
                      onClick={() => removeLine(line.lineId)}
                      type="button"
                      style={{
                        padding: "0.2rem 0.5rem",
                        marginLeft: "0.25rem",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
            {cart.length > 0 ? (
              <div className="staff-cart-total">
                <span>
                  {cart.reduce((sum, line) => sum + line.quantity, 0)} items
                </span>
                <strong>Total {money.format(payableOrderTotal)}</strong>
                <small>Payment is confirmed separately at the cashier.</small>
              </div>
            ) : null}
          </div>
          <button disabled={busy || !cart.length} type="submit">
            {busy ? "Creating…" : "Create and send to kitchen"}
          </button>
        </form>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {sizePickerItem ? (
        <div
          className="payment-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setSizePickerItem(null)}
        >
          <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <p className="eyebrow">Select size</p>
              <h2>{sizePickerItem.name}</h2>
            </header>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {sizePickerItem.sizes.map((size) => (
                <button
                  className="size-option-button"
                  key={size.id}
                  onClick={() => {
                    addWithSize(sizePickerItem, size);
                    setSizePickerItem(null);
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border, #ccc)",
                    background: "var(--surface, #fff)",
                    cursor: "pointer",
                  }}
                  type="button"
                >
                  <span>{size.size_name}</span>
                  <strong>{money.format(size.price)}</strong>
                </button>
              ))}
            </div>
            <div
              className="payment-modal-actions"
              style={{ marginTop: "1rem" }}
            >
              <button
                className="button-secondary"
                onClick={() => setSizePickerItem(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Queue({
  title,
  orders,
  actions,
  busyOrder,
  onEditItem,
  variant,
}: {
  title: string;
  orders: QueueOrder[];
  actions: (order: QueueOrder) => React.ReactNode;
  busyOrder: string | null;
  onEditItem?: (
    order: QueueOrder,
    itemId: string,
    quantity: number,
    replacementSizeId?: string,
  ) => Promise<void>;
  variant: "cashier" | "kitchen" | "waiter";
}) {
  type QueueView =
    | "all"
    | "waiting"
    | "in_progress"
    | "ready"
    | "finished"
    | "paid"
    | "unpaid"
    | "cancelled";
  const [view, setView] = useState<QueueView>("all");
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [editableMenu, setEditableMenu] = useState<MenuItem[]>([]);
  const [replacementSizeByItem, setReplacementSizeByItem] = useState<
    Record<string, string>
  >({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (variant !== "cashier") return;
    void loadMenu()
      .then((items) =>
        setEditableMenu(
          items.filter(
            (item) => item.available && item.availability_state === "available",
          ),
        ),
      )
      .catch(() => setEditableMenu([]));
  }, [variant]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const visibleOrders = orders
    .filter((order) => {
      if (view === "all") return true;
      if (view === "waiting")
        return variant === "cashier" || variant === "waiter"
          ? order.status === "pending_confirmation"
          : order.status === "confirmed";
      if (view === "in_progress")
        return ["confirmed", "accepted", "preparing"].includes(order.status);
      if (view === "ready") return order.status === "ready";
      if (view === "finished")
        return ["picked_up", "closed"].includes(order.status);
      if (view === "paid") return order.payment_status === "paid";
      if (view === "unpaid") return isOutstandingReceipt(order);
      if (view === "cancelled")
        return ["cancelled", "rejected"].includes(order.status);
      return true;
    })
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return variant === "kitchen" ? ta - tb : tb - ta;
    });
  const views: Array<{ id: QueueView; label: string }> = [
    { id: "all", label: "All orders" },
    { id: "waiting", label: "Waiting" },
    { id: "in_progress", label: "In progress" },
    { id: "ready", label: "Ready" },
    { id: "finished", label: "Finished" },
    ...(variant === "cashier"
      ? [
          { id: "paid" as const, label: "Paid" },
          { id: "unpaid" as const, label: "Payment due" },
        ]
      : []),
    { id: "cancelled", label: "Cancelled" },
  ];
  const countForView = (option: QueueView) => {
    if (option === "all") return orders.length;
    if (option === "waiting")
      return orders.filter((order) =>
        variant === "cashier" || variant === "waiter"
          ? order.status === "pending_confirmation"
          : order.status === "confirmed",
      ).length;
    if (option === "in_progress")
      return orders.filter((order) =>
        ["confirmed", "accepted", "preparing"].includes(order.status),
      ).length;
    if (option === "ready")
      return orders.filter((order) => order.status === "ready").length;
    if (option === "finished")
      return orders.filter((order) =>
        ["picked_up", "closed"].includes(order.status),
      ).length;
    if (option === "paid")
      return orders.filter((order) => order.payment_status === "paid").length;
    if (option === "unpaid") return orders.filter(isOutstandingReceipt).length;
    return orders.filter((order) =>
      ["cancelled", "rejected"].includes(order.status),
    ).length;
  };
  return (
    <section
      className={`portal-section queue-section queue-section--${variant}`}
    >
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">
            {variant === "cashier"
              ? "Cashier desk"
              : variant === "waiter"
                ? "Waiter order tracking"
                : "Barista kitchen"}{" "}
            · Live operations
          </p>
          <h2>{title}</h2>
        </div>
        <div className="queue-view-tabs" role="group" aria-label="Queue view">
          {views.map((option) => (
            <button
              aria-pressed={view === option.id}
              key={option.id}
              onClick={() => setView(option.id)}
              type="button"
            >
              {option.label} ({countForView(option.id)})
            </button>
          ))}
        </div>
      </header>
      {visibleOrders.length ? (
        <div className="queue-grid">
          {visibleOrders.map((order) => (
            <article
              className={`queue-ticket status-${order.status}${["picked_up", "closed"].includes(order.status) ? " queue-ticket--finished" : ""}${["cancelled", "rejected"].includes(order.status) ? " queue-ticket--cancelled" : ""}`}
              key={order.order_id}
              aria-busy={busyOrder === order.order_id}
            >
              <header>
                <div>
                  <strong>{order.order_number}</strong>
                  <small className="queue-customer-name">
                    {order.customer_name ||
                      order.pickup_name ||
                      "Guest customer"}
                  </small>
                  <small className="queue-customer-phone">
                    {order.customer_phone ? (
                      <a href={`tel:${order.customer_phone}`}>
                        {order.customer_phone}
                      </a>
                    ) : (
                      "Phone not provided"
                    )}
                  </small>
                  <small className="elapsed-time">
                    {elapsedLabel(order.order_time || order.created_at, now)}
                  </small>
                </div>
                <div className="queue-statuses">
                  <span className={`status-pill status-${order.status}`}>
                    {statusLabel(order.status)}
                  </span>
                  {variant === "cashier" && order.payment_status ? (
                    <span
                      className={`payment-badge payment-${order.payment_status}`}
                    >
                      {order.payment_status.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
              </header>
              <ul className="queue-item-list">
                {(order.item_summary || []).map((item, index) => (
                  <li key={item.id || index}>
                    <span>
                      {item.quantity || 1} ×{" "}
                      {item.itemName || item.name || "Item"}{" "}
                      {item.size ? `· ${item.size}` : ""}
                    </span>
                    {variant === "cashier" &&
                    onEditItem &&
                    item.id &&
                    ["pending_confirmation", "confirmed"].includes(
                      order.status,
                    ) ? (
                      <span className="queue-item-editor">
                        <label>
                          <span className="sr-only">
                            Replacement for{" "}
                            {item.itemName || item.name || "item"}
                          </span>
                          <select
                            aria-label={`Replacement for ${item.itemName || item.name || "item"}`}
                            disabled={busyItem === item.id}
                            onChange={(event) =>
                              setReplacementSizeByItem((current) => ({
                                ...current,
                                [item.id as string]: event.target.value,
                              }))
                            }
                            value={replacementSizeByItem[item.id] || ""}
                          >
                            <option value="">Choose item and size…</option>
                            {editableMenu.map((menuItem) => (
                              <optgroup key={menuItem.id} label={menuItem.name}>
                                {menuItem.sizes.map((size) => (
                                  <option key={size.id} value={size.id}>
                                    {size.size_name} — {money.format(size.price)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                        <button
                          disabled={
                            busyItem === item.id ||
                            !replacementSizeByItem[item.id]
                          }
                          onClick={async () => {
                            const replacementSizeId =
                              replacementSizeByItem[item.id as string];
                            if (!replacementSizeId) return;
                            setBusyItem(item.id || null);
                            try {
                              await onEditItem(
                                order,
                                item.id as string,
                                Number(item.quantity || 1),
                                replacementSizeId,
                              );
                              setReplacementSizeByItem((current) => ({
                                ...current,
                                [item.id as string]: "",
                              }));
                            } finally {
                              setBusyItem(null);
                            }
                          }}
                          type="button"
                        >
                          Apply edit
                        </button>
                        <button
                          aria-label={`Reduce ${item.itemName || item.name || "item"}`}
                          disabled={busyItem === item.id}
                          onClick={async () => {
                            setBusyItem(item.id || null);
                            try {
                              await onEditItem(
                                order,
                                item.id as string,
                                Math.max(0, Number(item.quantity || 1) - 1),
                              );
                            } finally {
                              setBusyItem(null);
                            }
                          }}
                          type="button"
                        >
                          −
                        </button>
                        <button
                          aria-label={`Add another ${item.itemName || item.name || "item"}`}
                          disabled={busyItem === item.id}
                          onClick={async () => {
                            setBusyItem(item.id || null);
                            try {
                              await onEditItem(
                                order,
                                item.id as string,
                                Number(item.quantity || 1) + 1,
                              );
                            } finally {
                              setBusyItem(null);
                            }
                          }}
                          type="button"
                        >
                          +
                        </button>
                        <button
                          aria-label={`Remove unavailable ${item.itemName || item.name || "item"}`}
                          className="button-danger"
                          disabled={busyItem === item.id}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Remove ${item.itemName || item.name || "this item"} from ${order.order_number}?`,
                              )
                            )
                              return;
                            setBusyItem(item.id || null);
                            try {
                              await onEditItem(order, item.id as string, 0);
                            } finally {
                              setBusyItem(null);
                            }
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <OrderPlaceAndNotes customerNotes={order.customer_notes} />
              {variant === "cashier" && typeof order.total === "number" ? (
                <dl className="queue-payment-summary">
                  <div>
                    <dt>Total</dt>
                    <dd>{money.format(order.total)}</dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>{money.format(order.paid_amount || 0)}</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{money.format(remainingBalance(order))}</dd>
                  </div>
                </dl>
              ) : null}
              <footer>{actions(order)}</footer>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No orders in this view.</p>
      )}
    </section>
  );
}

function StaffOverview({
  cashier,
  customers,
  endingDay,
  kitchen,
  onEndDay,
  onNavigate,
}: {
  cashier: QueueOrder[];
  customers: number;
  endingDay: boolean;
  kitchen: QueueOrder[];
  onEndDay: () => void;
  onNavigate: (
    tab:
      | "overview"
      | "new_order"
      | "cashier"
      | "kitchen"
      | "customers"
      | "analytics",
  ) => void;
}) {
  const pending = cashier.filter(
    (order) => order.status === "pending_confirmation",
  ).length;
  const unpaid = cashier.filter(isOutstandingReceipt).length;
  const ready = kitchen.filter((order) => order.status === "ready").length;
  const orderTotal = cashier.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const paidTotal = cashier.reduce(
    (sum, order) => sum + Number(order.paid_amount || 0),
    0,
  );
  const remainingTotal = cashier.reduce(
    (sum, order) => sum + remainingBalance(order),
    0,
  );
  const activeKitchen = kitchen.filter((order) =>
    ["accepted", "preparing"].includes(order.status),
  ).length;
  const finished = kitchen.filter((order) =>
    ["picked_up", "closed"].includes(order.status),
  ).length;
  const waiting = Math.max(0, kitchen.length - activeKitchen - ready - finished);
  const paymentCoverage = orderTotal
    ? Math.min(100, Math.round((paidTotal / orderTotal) * 100))
    : 0;
  const completionRate = kitchen.length
    ? Math.round((finished / kitchen.length) * 100)
    : 0;
  const orderFlow = [
    { key: "waiting", label: "Waiting", value: waiting },
    { key: "active", label: "Preparing", value: activeKitchen },
    { key: "ready", label: "Ready", value: ready },
    { key: "finished", label: "Finished", value: finished },
  ];
  const insight =
    unpaid > 0
      ? `${unpaid} order${unpaid === 1 ? "" : "s"} need payment follow-up before End Day.`
      : ready > 0
        ? `${ready} order${ready === 1 ? " is" : "s are"} ready for a fast guest handoff.`
        : activeKitchen > 0
          ? `${activeKitchen} order${activeKitchen === 1 ? " is" : "s are"} being prepared. The queue is moving.`
          : "Today’s active queue is clear. You are ready for the next order.";
  return (
    <section className="staff-overview">
      <header>
        <p className="eyebrow">Owner operations</p>
        <h2>Today at Joy Corner</h2>
        <p>
          Live operational metrics from the protected cashier and kitchen
          projections.
        </p>
      </header>
      <div className="staff-metric-grid">
        <button onClick={() => onNavigate("cashier")} type="button">
          <small>Awaiting confirmation</small>
          <strong>{pending}</strong>
          <span>Open cashier queue</span>
        </button>
        <button onClick={() => onNavigate("kitchen")} type="button">
          <small>Kitchen orders</small>
          <strong>{kitchen.length}</strong>
          <span>{ready} ready for pickup</span>
        </button>
        <button onClick={() => onNavigate("cashier")} type="button">
          <small>Unpaid current orders</small>
          <strong>{unpaid}</strong>
          <span>Review payments</span>
        </button>
        <button onClick={() => onNavigate("customers")} type="button">
          <small>Customer directory</small>
          <strong>{customers}</strong>
          <span>Permission-filtered records</span>
        </button>
      </div>
      <div className="owner-command-grid">
        <article className="owner-analysis-card owner-analysis-card--flow">
          <header>
            <div>
              <p className="eyebrow">Live order flow</p>
              <h3>From queue to pickup</h3>
            </div>
            <strong>{completionRate}% complete</strong>
          </header>
          <div className="owner-flow-bar" aria-label="Order status distribution">
            {orderFlow.map((stage) => (
              <span
                className={`owner-flow-segment owner-flow-segment--${stage.key}`}
                key={stage.key}
                style={{
                  flexGrow: stage.value,
                  display: stage.value ? undefined : "none",
                }}
                title={`${stage.label}: ${stage.value}`}
              />
            ))}
          </div>
          <div className="owner-flow-legend">
            {orderFlow.map((stage) => (
              <button
                key={stage.key}
                onClick={() => onNavigate("kitchen")}
                type="button"
              >
                <i className={`owner-flow-dot owner-flow-dot--${stage.key}`} />
                <span>{stage.label}</span>
                <strong>{stage.value}</strong>
              </button>
            ))}
          </div>
        </article>
        <article className="owner-analysis-card owner-analysis-card--money">
          <header>
            <div>
              <p className="eyebrow">Payment health</p>
              <h3>Today’s collection</h3>
            </div>
            <strong>{paymentCoverage}% covered</strong>
          </header>
          <div className="owner-payment-progress" aria-label={`${paymentCoverage}% of order value paid`}>
            <span style={{ width: `${paymentCoverage}%` }} />
          </div>
          <dl className="owner-money-summary">
            <div><dt>Order value</dt><dd>{money.format(orderTotal)}</dd></div>
            <div><dt>Paid</dt><dd>{money.format(paidTotal)}</dd></div>
            <div><dt>Remaining</dt><dd>{money.format(remainingTotal)}</dd></div>
          </dl>
        </article>
        <article className="owner-insight-card">
          <div>
            <p className="eyebrow">Owner insight</p>
            <h3>{insight}</h3>
            <p>Calculated from the current cashier and barista queues.</p>
          </div>
          <button onClick={() => onNavigate("analytics")} type="button">
            Open full analytics
          </button>
        </article>
        <article className="owner-end-day-card">
          <div>
            <p className="eyebrow">Daily reporting</p>
            <h3>Close today with confidence</h3>
            <p>Available when every order is closed, rejected, or cancelled.</p>
          </div>
          <button disabled={endingDay} onClick={onEndDay} type="button">
            {endingDay ? "Closing day…" : "End Day & queue report"}
          </button>
        </article>
      </div>
    </section>
  );
}

function StaffCustomerDirectory({
  customers,
  userRole,
  onRefresh,
  onError,
}: {
  customers: Array<Record<string, unknown>>;
  userRole: string;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [directoryFilter, setDirectoryFilter] = useState<
    "all" | "registered" | "guest" | "unpaid" | "vouchers"
  >("all");
  const [sort, setSort] = useState<"newest" | "name" | "unpaid" | "orders">(
    "newest",
  );
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<OwnerVoucher[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherType, setVoucherType] = useState<"fixed" | "percentage">(
    "fixed",
  );
  const [voucherValue, setVoucherValue] = useState("");
  const [voucherDesc, setVoucherDesc] = useState("");
  const [voucherExpiry, setVoucherExpiry] = useState("");
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [removingVoucherId, setRemovingVoucherId] = useState<string | null>(null);
  const [campaignAudience, setCampaignAudience] = useState<
    "all" | "subscribed"
  >("subscribed");
  const [campaignType, setCampaignType] = useState<"fixed" | "percentage">(
    "fixed",
  );
  const [campaignValue, setCampaignValue] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignExpiry, setCampaignExpiry] = useState("");
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignResults, setCampaignResults] = useState<
    VoucherCampaignRecipient[]
  >([]);
  const PAGE_SIZE = 20;
  const canManageVouchers = userRole === "owner";

  const subscribedCount = customers.filter((c) =>
    Boolean(c.marketingConsent),
  ).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const matching = customers.filter((c) => {
      if (directoryFilter === "registered" && c.accountStatus !== "registered")
        return false;
      if (directoryFilter === "guest" && c.accountStatus !== "guest") return false;
      if (directoryFilter === "unpaid" && Number(c.outstandingBalance || 0) <= 0)
        return false;
      if (directoryFilter === "vouchers" && Number(c.activeVoucherCount || 0) <= 0)
        return false;
      if (!q) return true;
      return (
        String(c.fullName || "")
          .toLocaleLowerCase()
          .includes(q) ||
        String(c.email || "")
          .toLocaleLowerCase()
          .includes(q) ||
        String(c.phone || "")
          .toLocaleLowerCase()
          .includes(q) ||
        String(c.customerNumber || "")
          .toLocaleLowerCase()
          .includes(q)
      );
    });
    return [...matching].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      if (sort === "name")
        return String(a.fullName || "").localeCompare(String(b.fullName || ""));
      if (sort === "unpaid")
        return Number(b.outstandingBalance || 0) - Number(a.outstandingBalance || 0);
      if (sort === "orders")
        return Number(b.orderCount || 0) - Number(a.orderCount || 0);
      return new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime();
    });
  }, [customers, directoryFilter, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  async function addCustomer() {
    if (!addName.trim() || !addPhone.trim()) return;
    setBusy(true);
    try {
      await createStaffCustomer({
        email: addEmail.trim() || undefined,
        fullName: addName.trim(),
        phone: addPhone.trim(),
      });
      setAddName("");
      setAddPhone("");
      setAddEmail("");
      await onRefresh();
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(customerId: string) {
    if (expandedId === customerId) {
      setExpandedId(null);
      setVouchers([]);
      return;
    }
    setExpandedId(customerId);
    setVoucherType("fixed");
    setVoucherValue("");
    setVoucherDesc("");
    setVoucherExpiry("");
    if (canManageVouchers) {
      setVoucherLoading(true);
      try {
        const list = await loadCustomerVouchers(customerId);
        setVouchers(list);
      } catch (error) {
        onError(getMessage(error));
      } finally {
        setVoucherLoading(false);
      }
    }
  }

  async function issueVoucher(customerId: string) {
    const numVal = Number(voucherValue);
    if (!numVal || numVal <= 0) return;
    setVoucherBusy(true);
    try {
      await createCustomerVoucher({
        customerId,
        description: voucherDesc.trim() || undefined,
        expiresInDays: voucherExpiry ? Number(voucherExpiry) : undefined,
        fixedValue: voucherType === "fixed" ? numVal : undefined,
        percentageValue: voucherType === "percentage" ? numVal : undefined,
        voucherType,
      });
      setVoucherValue("");
      setVoucherDesc("");
      setVoucherExpiry("");
      const list = await loadCustomerVouchers(customerId);
      setVouchers(list);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setVoucherBusy(false);
    }
  }

  async function removeRedeemed(customerId: string, voucher: OwnerVoucher) {
    if (
      !window.confirm(
        `Confirm ${voucher.voucherCode} was redeemed and remove it from this customer? This cannot be undone.`,
      )
    )
      return;
    setRemovingVoucherId(voucher.id);
    try {
      await removeRedeemedVoucher(voucher.id);
      setVouchers((current) => current.filter((item) => item.id !== voucher.id));
      await onRefresh();
      onError(`Redemption confirmed. Voucher ${voucher.voucherCode} was removed.`);
    } catch (error) {
      onError(getMessage(error));
      const list = await loadCustomerVouchers(customerId);
      setVouchers(list);
    } finally {
      setRemovingVoucherId(null);
    }
  }

  async function issueCampaign() {
    const value = Number(campaignValue);
    if (!Number.isFinite(value) || value <= 0) return;
    const audienceLabel =
      campaignAudience === "subscribed"
        ? `${subscribedCount} subscribed customers`
        : `all ${customers.length} customer records, including unsubscribed customers`;
    if (
      !window.confirm(
        `Create one unique, single-use voucher for ${audienceLabel}?`,
      )
    )
      return;
    setCampaignBusy(true);
    setCampaignResults([]);
    try {
      const result = await createVoucherCampaign({
        audience: campaignAudience,
        description: campaignDescription.trim() || undefined,
        expiresInDays: campaignExpiry ? Number(campaignExpiry) : undefined,
        value,
        voucherType: campaignType,
      });
      setCampaignResults(result.issued);
      await onRefresh();
      onError(
        `${result.issued.length} unique vouchers created. Each customer account has its voucher; use the WhatsApp share list below for phone delivery.`,
      );
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setCampaignBusy(false);
    }
  }

  function formatCurrency(value: unknown): string {
    const num = Number(value || 0);
    return num > 0 ? `EGP ${num.toFixed(2)}` : "—";
  }

  function timeAgo(dateStr: unknown): string {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(String(dateStr)).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <section className="portal-section">
      <div className="staff-customer-header">
        <div>
          <p className="eyebrow">Customer directory</p>
          <h2>Customers</h2>
          <p className="muted">
            {customers.length} total · {subscribedCount} subscribed
          </p>
        </div>
      </div>
      {canManageVouchers ? (
        <section className="voucher-campaign-studio">
          <div className="voucher-campaign-intro">
            <p className="eyebrow">Voucher campaign</p>
            <h3>Send a unique offer to an audience</h3>
            <p>
              Every recipient receives a different one-time code in their Joy
              Corner account. WhatsApp sharing remains under your control.
            </p>
          </div>
          <div className="voucher-campaign-controls">
            <label>
              Audience
              <select
                onChange={(event) =>
                  setCampaignAudience(event.target.value as typeof campaignAudience)
                }
                value={campaignAudience}
              >
                <option value="subscribed">Subscribed only ({subscribedCount})</option>
                <option value="all">All, including unsubscribed ({customers.length})</option>
              </select>
            </label>
            <label>
              Discount type
              <select
                onChange={(event) =>
                  setCampaignType(event.target.value as typeof campaignType)
                }
                value={campaignType}
              >
                <option value="fixed">Fixed EGP</option>
                <option value="percentage">Percentage</option>
              </select>
            </label>
            <label>
              Value
              <input
                inputMode="decimal"
                max={campaignType === "percentage" ? 100 : undefined}
                min="1"
                onChange={(event) => setCampaignValue(event.target.value)}
                placeholder={campaignType === "fixed" ? "80 EGP" : "10%"}
                type="number"
                value={campaignValue}
              />
            </label>
            <label>
              Expiry days
              <input
                inputMode="numeric"
                min="1"
                onChange={(event) => setCampaignExpiry(event.target.value)}
                placeholder="30"
                type="number"
                value={campaignExpiry}
              />
            </label>
            <label className="voucher-campaign-description">
              Message / description
              <input
                maxLength={200}
                onChange={(event) => setCampaignDescription(event.target.value)}
                placeholder="A special drink reward from Joy Corner"
                value={campaignDescription}
              />
            </label>
            <button
              disabled={campaignBusy || !Number(campaignValue)}
              onClick={() => void issueCampaign()}
              type="button"
            >
              {campaignBusy ? "Creating campaign…" : "Create account vouchers"}
            </button>
          </div>
          {campaignResults.length ? (
            <div className="voucher-campaign-results">
              <header>
                <strong>{campaignResults.length} vouchers ready</strong>
                <span>Share each customer's voucher artwork to WhatsApp.</span>
              </header>
              <div>
                {campaignResults.map((recipient) => (
                  <button
                    onClick={() => void shareVoucherArtwork({
                      code: recipient.voucherCode,
                      customerName: recipient.customerName,
                      expiresAt: recipient.expiresAt,
                      reward: recipient.description || (recipient.voucherType === "fixed"
                        ? `${Number(recipient.fixedValue).toFixed(0)} EGP`
                        : `${Number(recipient.percentageValue).toFixed(0)}% off`),
                    })}
                    key={recipient.id}
                    type="button"
                  >
                    <span>{recipient.customerName}</span>
                    <strong>{recipient.voucherCode}</strong>
                    <small>Share voucher artwork</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      <form
        className="profile-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void addCustomer();
        }}
        style={{ marginBottom: "1rem" }}
      >
        <label>
          Name
          <input
            onChange={(e) => setAddName(e.target.value)}
            required
            value={addName}
          />
        </label>
        <label>
          Phone
          <input
            inputMode="tel"
            onChange={(e) => setAddPhone(e.target.value)}
            placeholder="+201234567890"
            required
            value={addPhone}
          />
        </label>
        <label>
          Email (optional)
          <input
            onChange={(e) => setAddEmail(e.target.value)}
            value={addEmail}
          />
        </label>
        <button
          disabled={busy || !addName.trim() || !addPhone.trim()}
          type="submit"
        >
          {busy ? "Adding…" : "Add customer"}
        </button>
      </form>
      <div className="customer-directory-filters">
        <label className="menu-search staff-search" style={{ flex: 1 }}>
          <span className="sr-only">Search customers</span>
          <input
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, or phone…"
            type="search"
            value={search}
          />
        </label>
        <div
          className="category-rail staff-category-rail"
          style={{ margin: 0 }}
        >
          {(["all", "registered", "guest", "unpaid", "vouchers"] as const).map((option) => (
            <button
              aria-pressed={directoryFilter === option}
              className={directoryFilter === option ? "active" : ""}
              key={option}
              onClick={() => {
                setDirectoryFilter(option);
                setPage(1);
              }}
              type="button"
            >
              {option === "all" ? "All" : option === "guest" ? "Unsubscribed" : option === "unpaid" ? "Has unpaid balance" : option === "vouchers" ? "Has active vouchers" : "Registered"}
            </button>
          ))}
        </div>
        <label>
          <span className="sr-only">Sort customers</span>
          <select onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="unpaid">Highest unpaid</option>
            <option value="orders">Most orders</option>
          </select>
        </label>
      </div>
      <div className="staff-table">
        <div className="staff-table-row heading">
          <span>Customer</span>
          <span>Account</span>
          <span>Orders</span>
          <span>Unpaid</span>
          <span>Vouchers</span>
          {canManageVouchers ? <span>Actions</span> : null}
        </div>
        {paged.map((customer) => {
          const cid = String(customer.id);
          const isExpanded = expandedId === cid;
          return (
            <div key={cid}>
              <div
                className={`staff-table-row ${isExpanded ? "expanded" : ""}`}
              >
                <div>
                  <strong>{String(customer.fullName || "")}</strong>
                  <span
                    className="muted"
                    style={{ fontSize: "0.75rem", display: "block" }}
                  >
                    {String(customer.email || "—")}
                    {customer.phone ? ` · ${String(customer.phone)}` : ""}
                    {` · Last visit ${timeAgo(customer.lastOrderAt)}`}
                  </span>
                </div>
                <span className={`consent-badge ${customer.accountStatus === "guest" ? "not-subscribed" : "subscribed"}`}>
                  {customer.accountStatus === "guest" ? "Unsubscribed" : "Registered"}
                </span>
                <span>
                  <span className="stat-pill">
                    {Number(customer.orderCount || 0)}
                  </span>
                </span>
                <span>
                  <strong>{formatCurrency(customer.outstandingBalance)}</strong>
                  <small className="customer-unpaid-count">
                    {Number(customer.unpaidReceiptCount || 0)} unpaid{" "}
                    {Number(customer.unpaidReceiptCount || 0) === 1
                      ? "receipt"
                      : "receipts"}
                  </small>
                </span>
                <span>{Number(customer.activeVoucherCount || 0)}</span>
                {canManageVouchers ? (
                  <span>
                    <button
                      className="compact-menu-btn"
                      onClick={() => void toggleExpand(cid)}
                      type="button"
                    >
                      {isExpanded ? "Close" : "Vouchers"}
                    </button>
                  </span>
                ) : null}
              </div>
              {isExpanded && canManageVouchers ? (
                <div className="customer-voucher-panel">
                  <div className="voucher-create-row">
                    <select
                      value={voucherType}
                      onChange={(e) =>
                        setVoucherType(e.target.value as "fixed" | "percentage")
                      }
                    >
                      <option value="fixed">Fixed Amount (EGP)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                    <input
                      inputMode="decimal"
                      onChange={(e) => setVoucherValue(e.target.value)}
                      placeholder={
                        voucherType === "fixed" ? "Amount (EGP)" : "Percent (%)"
                      }
                      value={voucherValue}
                    />
                    <input
                      onChange={(e) => setVoucherDesc(e.target.value)}
                      placeholder="Description (optional)"
                      value={voucherDesc}
                    />
                    <input
                      inputMode="numeric"
                      onChange={(e) => setVoucherExpiry(e.target.value)}
                      placeholder="Expiry days"
                      value={voucherExpiry}
                    />
                    <button
                      className="compact-menu-btn"
                      disabled={voucherBusy || !Number(voucherValue)}
                      onClick={() => void issueVoucher(cid)}
                      type="button"
                    >
                      {voucherBusy ? "Issuing…" : "Issue Voucher"}
                    </button>
                  </div>
                  {voucherLoading ? (
                    <p className="muted" style={{ padding: "0.75rem" }}>
                      Loading vouchers…
                    </p>
                  ) : vouchers.length ? (
                    <div className="voucher-list">
                      {vouchers.map((v) => {
                        const label =
                          v.description ||
                          (v.voucherType === "fixed"
                            ? `${Number(v.fixedValue).toFixed(0)} EGP`
                            : `${Number(v.percentageValue).toFixed(0)}% off`);
                        const isRedeemable =
                          v.status === "active" &&
                          (!v.expiresAt || new Date(v.expiresAt) > new Date());
                        return (
                          <div className="voucher-card" key={v.id}>
                            <VoucherCard
                              data={{
                                code: v.voucherCode,
                                customerName: String(customer.fullName || ""),
                                expiresAt: v.expiresAt,
                                reward: label,
                                status: v.status,
                              }}
                              variant="standard"
                            />
                            <div className="voucher-card-info">
                              <strong>{v.voucherCode}</strong>
                              <span>{label}</span>
                              <span
                                className="muted"
                                style={{ fontSize: "0.75rem" }}
                              >
                                {v.status === "active"
                                  ? "Active"
                                  : v.status === "redeemed"
                                    ? "Redeemed"
                                    : v.status}
                                {v.expiresAt
                                  ? ` · Expires ${new Date(v.expiresAt).toLocaleDateString()}`
                                  : ""}
                              </span>
                            </div>
                            <div className="voucher-card-actions">
                              <button
                                className="compact-menu-btn"
                                onClick={() => void navigator.clipboard.writeText(v.voucherCode)}
                                type="button"
                              >
                                Copy code
                              </button>
                              {isRedeemable ? (
                                <button
                                  className="compact-menu-btn"
                                  onClick={() => void shareVoucherArtwork({ code: v.voucherCode, customerName: String(customer.fullName || ""), expiresAt: v.expiresAt, reward: label })}
                                  type="button"
                                >
                                  Share artwork to WhatsApp
                                </button>
                              ) : null}
                              {v.status === "redeemed" ? (
                                <button
                                  className="button-danger compact-menu-btn"
                                  disabled={removingVoucherId === v.id}
                                  onClick={() => void removeRedeemed(cid, v)}
                                  type="button"
                                >
                                  {removingVoucherId === v.id
                                    ? "Removing…"
                                    : "Confirm redeemed & remove"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted" style={{ padding: "0.75rem" }}>
                      No vouchers yet. Issue one above.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {!paged.length ? (
          <p className="muted" style={{ padding: "1rem" }}>
            {customers.length
              ? "No customers match your filters."
              : "No customers yet."}
          </p>
        ) : null}
      </div>
      {totalPages > 1 ? (
        <div className="customer-directory-pagination">
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Previous
          </button>
          <span className="muted">
            Page {safePage} of {totalPages}
          </span>
          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function elapsedLabel(value: string | undefined, now: number): string {
  if (!value) return "Time unavailable";
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(value).getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) return "Just arrived";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min elapsed`;
  const hours = Math.floor(elapsedMinutes / 60);
  return `${hours} hr ${elapsedMinutes % 60} min elapsed`;
}

function OwnerVoucherRequests({ onError }: { onError: (msg: string) => void }) {
  const [requests, setRequests] = useState<VoucherRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState({
    description: "",
    expiresInDays: "30",
    fixedValue: "",
    percentageValue: "",
    voucherType: "fixed",
  });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadVoucherRequests(statusFilter || undefined);
      setRequests(list);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, onError]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function handleReject(requestId: string) {
    setReviewBusy(true);
    try {
      await reviewVoucherRequest({
        action: "REJECT",
        rejectionReason: "Not eligible at this time.",
        requestId,
      });
      await loadRequests();
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleApprove(requestId: string) {
    setReviewBusy(true);
    try {
      const numVal = Number(
        approveForm.fixedValue || approveForm.percentageValue,
      );
      await reviewVoucherRequest({
        action: "APPROVE",
        description: approveForm.description.trim() || undefined,
        expiresInDays: Number(approveForm.expiresInDays) || undefined,
        fixedValue: approveForm.voucherType === "fixed" ? numVal : undefined,
        percentageValue:
          approveForm.voucherType === "percentage" ? numVal : undefined,
        requestId,
        voucherType: approveForm.voucherType,
      });
      setShowApproveModal(null);
      setApproveForm({
        description: "",
        expiresInDays: "30",
        fixedValue: "",
        percentageValue: "",
        voucherType: "fixed",
      });
      await loadRequests();
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setReviewBusy(false);
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const others = requests.filter((r) => r.status !== "PENDING");

  return (
    <section className="portal-section">
      <div className="staff-customer-header">
        <div>
          <p className="eyebrow">Loyalty &amp; Vouchers</p>
          <h2>Voucher Requests</h2>
          <p className="muted">
            {pending.length} pending · {requests.length} total
          </p>
        </div>
      </div>
      <div
        className="customer-directory-filters"
        style={{ marginBottom: "1rem" }}
      >
        <div
          className="category-rail staff-category-rail"
          style={{ margin: 0 }}
        >
          {[
            "",
            "PENDING",
            "APPROVED",
            "REJECTED",
            "FULFILLED",
            "CANCELLED",
          ].map((s) => (
            <button
              aria-pressed={statusFilter === s}
              className={statusFilter === s ? "active" : ""}
              key={s}
              onClick={() => setStatusFilter(s)}
              type="button"
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="muted">Loading requests…</p>
      ) : !requests.length ? (
        <div className="auth-staff-note">
          <p>No voucher requests yet.</p>
          <p className="muted" style={{ fontSize: "0.8125rem" }}>
            Customer requests will appear here for owner review.
          </p>
        </div>
      ) : (
        <div className="voucher-request-queue">
          {pending.map((req) => (
            <div className="voucher-request-queue-item" key={req.id}>
              <div className="queue-item-header">
                <div>
                  <strong>{req.customerName}</strong>
                  <span
                    className="muted"
                    style={{ marginLeft: "8px", fontSize: "0.8125rem" }}
                  >
                    {req.customerEmail || "—"}
                  </span>
                </div>
                <span className="request-status pending">Pending</span>
              </div>
              <div className="queue-item-body">
                <div className="queue-item-customer">
                  <span style={{ fontSize: "0.8125rem" }}>
                    Loyalty Points: <strong>{req.loyaltyPoints}</strong>
                  </span>
                  <span style={{ fontSize: "0.8125rem" }}>
                    Orders: <strong>{req.orderCount}</strong>
                  </span>
                  <span style={{ fontSize: "0.8125rem" }}>
                    Free Rewards: <strong>{req.freeRewards}</strong>
                  </span>
                  <span style={{ fontSize: "0.8125rem" }}>
                    Requested:{" "}
                    <strong>{req.requestedRewardType || "Any reward"}</strong>
                  </span>
                </div>
                <div className="queue-item-meta">
                  {req.requestReason ? (
                    <span
                      className="request-reason"
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--joy-text-secondary)",
                      }}
                    >
                      "{req.requestReason}"
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--joy-text-tertiary)",
                    }}
                  >
                    Submitted {new Date(req.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="queue-item-actions">
                <button
                  className="button-secondary"
                  disabled={reviewBusy}
                  onClick={() => void handleReject(req.id)}
                  type="button"
                  style={{ fontSize: "0.8125rem", padding: "6px 14px" }}
                >
                  Reject
                </button>
                <button
                  className="button-primary"
                  disabled={reviewBusy}
                  onClick={() => setShowApproveModal(req.id)}
                  type="button"
                  style={{ fontSize: "0.8125rem", padding: "6px 14px" }}
                >
                  Approve &amp; Create Voucher
                </button>
              </div>
            </div>
          ))}
          {others.map((req) => (
            <div
              className="voucher-request-queue-item"
              key={req.id}
              style={{ opacity: 0.7 }}
            >
              <div className="queue-item-header">
                <div>
                  <strong>{req.customerName}</strong>
                  <span
                    className="muted"
                    style={{ marginLeft: "8px", fontSize: "0.8125rem" }}
                  >
                    {req.customerEmail || "—"}
                  </span>
                </div>
                <span className={`request-status ${req.status.toLowerCase()}`}>
                  {req.status}
                </span>
              </div>
              <div className="queue-item-body">
                <div className="queue-item-customer">
                  <span style={{ fontSize: "0.8125rem" }}>
                    Requested:{" "}
                    <strong>{req.requestedRewardType || "Any reward"}</strong>
                  </span>
                  {req.rejectionReason ? (
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--joy-danger)",
                      }}
                    >
                      Reason: {req.rejectionReason}
                    </span>
                  ) : null}
                  {req.createdVoucherId ? (
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--joy-success)",
                      }}
                    >
                      Voucher created
                    </span>
                  ) : null}
                </div>
                <div className="queue-item-meta">
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--joy-text-tertiary)",
                    }}
                  >
                    {new Date(req.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showApproveModal ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true">
          <div className="payment-modal" style={{ maxWidth: "480px" }}>
            <header>
              <p className="eyebrow">Create Voucher</p>
              <h2>Approve &amp; Issue</h2>
            </header>
            <div className="profile-grid" style={{ padding: "16px" }}>
              <label>
                Voucher Type
                <select
                  value={approveForm.voucherType}
                  onChange={(e) =>
                    setApproveForm((f) => ({
                      ...f,
                      voucherType: e.target.value,
                    }))
                  }
                >
                  <option value="fixed">Fixed Amount (EGP)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </label>
              {approveForm.voucherType === "fixed" ? (
                <label>
                  Amount (EGP)
                  <input
                    inputMode="decimal"
                    onChange={(e) =>
                      setApproveForm((f) => ({
                        ...f,
                        fixedValue: e.target.value,
                      }))
                    }
                    value={approveForm.fixedValue}
                  />
                </label>
              ) : (
                <label>
                  Percentage (%)
                  <input
                    inputMode="decimal"
                    onChange={(e) =>
                      setApproveForm((f) => ({
                        ...f,
                        percentageValue: e.target.value,
                      }))
                    }
                    value={approveForm.percentageValue}
                  />
                </label>
              )}
              <label>
                Description (optional)
                <input
                  onChange={(e) =>
                    setApproveForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  value={approveForm.description}
                />
              </label>
              <label>
                Expires in days
                <input
                  inputMode="numeric"
                  onChange={(e) =>
                    setApproveForm((f) => ({
                      ...f,
                      expiresInDays: e.target.value,
                    }))
                  }
                  value={approveForm.expiresInDays}
                />
              </label>
            </div>
            <div className="payment-modal-actions">
              <button
                className="button-secondary"
                onClick={() => {
                  setShowApproveModal(null);
                  setApproveForm({
                    description: "",
                    expiresInDays: "30",
                    fixedValue: "",
                    percentageValue: "",
                    voucherType: "fixed",
                  });
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button-primary"
                disabled={
                  reviewBusy ||
                  (!Number(approveForm.fixedValue) &&
                    !Number(approveForm.percentageValue))
                }
                onClick={() => void handleApprove(showApproveModal)}
                type="button"
              >
                {reviewBusy ? "Creating…" : "Create & Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ═══════════════════════════════════════════════════
// OWNER ORDERS & RECEIPTS
// ═══════════════════════════════════════════════════

type OrdersTab =
  | "all"
  | "active"
  | "completed"
  | "paid"
  | "unpaid"
  | "partially_paid"
  | "cancelled"
  | "archived";

type ReceiptDateScope = "today" | "previous" | "all";

const cairoReceiptDate = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Africa/Cairo",
  year: "numeric",
});

function receiptDateKey(order: OwnerOrder): string {
  if (order.business_date) return order.business_date.slice(0, 10);
  const parts = cairoReceiptDate.formatToParts(new Date(order.created_at));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function receiptDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-EG", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Cairo",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+02:00`));
}

function OwnerOrdersReceipts({
  onError,
  userRole,
}: {
  onError: (msg: string) => void;
  userRole: string;
}) {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<OrdersTab>("all");
  const [dateScope, setDateScope] = useState<ReceiptDateScope>("today");
  const [currentBusinessDay, setCurrentBusinessDay] =
    useState<BusinessDay | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<OwnerOrder | null>(null);
  const [payModal, setPayModal] = useState<OwnerOrder | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash_at_cashier");
  const [payBusy, setPayBusy] = useState(false);
  const [voidModal, setVoidModal] = useState<OwnerOrder | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);

  const loadOrders = useCallback(
    async (
      p: number,
      paymentFilter?: string,
      searchVal?: string,
      receiptScope: ReceiptDateScope = "today",
    ) => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { limit: 50, page: p };
        if (paymentFilter && paymentFilter !== "all") {
          if (paymentFilter === "active")
            params.status =
              "pending_confirmation,confirmed,accepted,preparing,ready,picked_up";
          else if (paymentFilter === "completed") params.status = "closed";
          else if (paymentFilter === "paid") params.paymentStatus = "paid";
          else if (paymentFilter === "unpaid") params.paymentStatus = "unpaid";
          else if (paymentFilter === "partially_paid")
            params.paymentStatus = "partially_paid";
          else if (paymentFilter === "cancelled")
            params.status = "cancelled,rejected";
          else if (paymentFilter === "archived") params.includeArchived = true;
        }
        if (searchVal) params.search = searchVal;
        if (receiptScope === "today") params.dateFilter = "today";
        else if (receiptScope === "previous")
          params.dateFilter = "before_today";
        const result = await loadOwnerOrders(params);
        setOrders(result.orders);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (error) {
        onError(getMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    void loadOrders(1, tab, search, dateScope);
    void loadCurrentBusinessDay()
      .then(setCurrentBusinessDay)
      .catch(() => setCurrentBusinessDay(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function switchTab(newTab: OrdersTab) {
    setTab(newTab);
    setPage(1);
    await loadOrders(1, newTab, search, dateScope);
  }

  async function switchDateScope(nextScope: ReceiptDateScope) {
    setDateScope(nextScope);
    setPage(1);
    setSelectedOrder(null);
    await loadOrders(1, tab, search, nextScope);
  }

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function doSearch(val: string) {
    setSearch(val);
    setPage(1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void loadOrders(1, tab, val, dateScope);
    }, 300);
  }

  async function recordPayment() {
    if (!payModal || !payAmount) return;
    const amount = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      onError("Invalid amount.");
      return;
    }
    setPayBusy(true);
    try {
      await recordOwnerPayment({
        amount,
        paymentMethod: payMethod,
        receiptId: payModal.id,
      });
      setPayModal(null);
      setPayAmount("");
      await loadOrders(page, tab, search, dateScope);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setPayBusy(false);
    }
  }

  async function doVoid() {
    if (!voidModal || !voidReason.trim()) return;
    setVoidBusy(true);
    try {
      await voidReceipt(voidModal.id, voidReason.trim());
      setVoidModal(null);
      setVoidReason("");
      await loadOrders(page, tab, search, dateScope);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setVoidBusy(false);
    }
  }

  async function doArchive(orderId: string) {
    setArchiveBusy(orderId);
    try {
      await archiveReceipt(orderId, "Archived by owner");
      await loadOrders(page, tab, search, dateScope);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setArchiveBusy(null);
    }
  }

  function printReceipt(order: OwnerOrder) {
    const items = Array.isArray(order.item_summary) ? order.item_summary : [];
    const details = orderDetails(order.customer_notes);
    const html = buildReceiptPrintHtml({
      customerName: order.customer_name || order.pickup_name,
      items: items.map((item) => ({
        itemName: item.itemName,
        qty: item.quantity,
        size: item.size,
        total: Number(item.totalPrice || 0),
        unitPrice: Number(item.unitPrice || 0),
      })),
      notes: details.notes,
      orderDateTime: order.created_at
        ? new Date(order.created_at).toLocaleString()
        : "",
      orderPlace: [details.place, details.carType, details.carColor]
        .filter(Boolean)
        .join(" · "),
      outstandingAmount: remainingBalance(order),
      paidAmount: order.paid_amount,
      paymentStatus: order.payment_status?.replace(/_/g, " ") || "unpaid",
      receiptNumber: order.order_number,
      staff: order.creator_name || "Joy Corner",
      subtotal: order.subtotal,
      total: order.total,
    });
    const w = window.open("", "_blank", "width=900,height=800");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  const todayKey = receiptDateKey({
    business_date: null,
    created_at: new Date().toISOString(),
  } as OwnerOrder);
  const receiptGroups = useMemo(() => {
    const grouped = new Map<string, OwnerOrder[]>();
    [...orders]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .forEach((order) => {
        const key = receiptDateKey(order);
        const group = grouped.get(key) || [];
        group.push(order);
        grouped.set(key, group);
      });
    return Array.from(grouped, ([date, groupOrders]) => ({
      date,
      orders: groupOrders,
      paid: groupOrders.filter((order) => order.payment_status === "paid")
        .length,
      unpaid: groupOrders.filter(isOutstandingReceipt).length,
      remaining: groupOrders.reduce(
        (sum, order) =>
          sum + (isOutstandingReceipt(order) ? order.remaining_amount : 0),
        0,
      ),
    }));
  }, [orders]);

  function toggleReceiptDay(date: string) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <section className="portal-section">
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">Financial Operations</p>
          <h2>Orders &amp; Receipts</h2>
          <p className="muted">{total} receipts total</p>
        </div>
      </header>
      <div
        className="customer-directory-filters"
        style={{ marginBottom: "1rem" }}
      >
        <label className="menu-search staff-search" style={{ flex: 1 }}>
          <span className="sr-only">Search orders</span>
          <input
            onChange={(e) => void doSearch(e.target.value)}
            placeholder="Search by receipt #, customer name, phone…"
            type="search"
            value={search}
          />
        </label>
      </div>
      <div
        className="category-rail staff-category-rail"
        style={{ margin: "0 0 1rem" }}
      >
        {(
          [
            "all",
            "active",
            "completed",
            "paid",
            "unpaid",
            "partially_paid",
            "cancelled",
            "archived",
          ] as const
        ).map((t) => (
          <button
            aria-pressed={tab === t}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => void switchTab(t)}
            type="button"
          >
            {t === "all"
              ? "All"
              : t === "active"
                ? "Active"
                : t === "completed"
                  ? "Completed"
                  : t === "paid"
                    ? "Paid"
                    : t === "unpaid"
                      ? "Unpaid"
                      : t === "cancelled"
                        ? "Cancelled"
                      : t === "archived"
                        ? "Archived"
                        : "Partially Paid"}
          </button>
        ))}
      </div>
      <div
        className="receipt-date-filters"
        role="group"
        aria-label="Receipt date"
      >
        {(
          [
            ["today", "Today"],
            ["previous", "Previous days"],
            ["all", "All dates"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={dateScope === value}
            className={dateScope === value ? "active" : ""}
            key={value}
            onClick={() => void switchDateScope(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="muted">Loading orders…</p>
      ) : !orders.length ? (
        <div className="auth-staff-note">
          <p>No orders found.</p>
        </div>
      ) : (
        <div className="receipt-day-list">
          {receiptGroups.map((group) => {
            const collapsed = collapsedDays.has(group.date);
            const isToday = group.date === todayKey;
            const isOpenDay =
              isToday &&
              currentBusinessDay?.business_date?.slice(0, 10) === group.date;
            return (
              <section className="receipt-day-group" key={group.date}>
                <button
                  aria-expanded={!collapsed}
                  className="receipt-day-divider"
                  onClick={() => toggleReceiptDay(group.date)}
                  type="button"
                >
                  <span className="receipt-day-title">
                    <strong>
                      {isToday ? "Today" : receiptDateLabel(group.date)}
                    </strong>
                    <small>
                      {isOpenDay ? "Business day open" : "End of day · Closed"}
                    </small>
                  </span>
                  <span className="receipt-day-summary">
                    <small>{group.orders.length} receipts</small>
                    <small>{group.paid} paid</small>
                    <small>{group.unpaid} unpaid</small>
                    {group.remaining > 0 ? (
                      <strong>{money.format(group.remaining)} due</strong>
                    ) : null}
                    <i aria-hidden="true">{collapsed ? "+" : "−"}</i>
                  </span>
                </button>
                {!collapsed ? (
                  <div className="queue-grid receipt-day-grid">
                    {group.orders.map((order) => (
                      <article
                        className={`queue-ticket receipt-ticket payment-${order.payment_status} status-${order.status}${["picked_up", "closed"].includes(order.status) ? " queue-ticket--finished" : ""}${["cancelled", "rejected"].includes(order.status) ? " queue-ticket--cancelled" : ""}`}
                        key={order.id}
                        onClick={() =>
                          setSelectedOrder(
                            selectedOrder?.id === order.id ? null : order,
                          )
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <header>
                          <div>
                            <strong>{order.order_number}</strong>
                            <small className="queue-customer-name">
                              {order.customer_name ||
                                order.pickup_name ||
                                "Guest customer"}
                            </small>
                            <small className="queue-customer-phone">
                              {order.customer_phone ? (
                                <a
                                  href={`tel:${order.customer_phone}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {order.customer_phone}
                                </a>
                              ) : (
                                "Phone not provided"
                              )}
                            </small>
                          </div>
                          <div className="queue-statuses">
                            <span
                              className={`status-pill status-${order.status}`}
                            >
                              {statusLabel(
                                order.status as OperationalOrderStatus,
                              )}
                            </span>
                            {!isCancelledReceipt(order) ? (
                              <span
                                className={`payment-badge payment-${order.payment_status}`}
                              >
                                {order.payment_status?.replace(/_/g, " ")}
                              </span>
                            ) : null}
                          </div>
                        </header>
                        {selectedOrder?.id === order.id ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <dl className="queue-payment-summary">
                              <div>
                                <dt>Total</dt>
                                <dd>{money.format(order.total)}</dd>
                              </div>
                              <div>
                                <dt>Paid</dt>
                                <dd>{money.format(order.paid_amount)}</dd>
                              </div>
                              <div>
                                <dt>Remaining</dt>
                                <dd>{money.format(remainingBalance(order))}</dd>
                              </div>
                            </dl>
                            <ul
                              style={{ fontSize: "0.8125rem", margin: "8px 0" }}
                            >
                              {order.item_summary.map((item, i) => (
                                <li key={i}>
                                  {item.quantity} × {item.itemName} ·{" "}
                                  {item.size} — {money.format(item.unitPrice)}
                                  /ea
                                </li>
                              ))}
                            </ul>
                            <div
                              style={{
                                fontSize: "0.8125rem",
                                color: "var(--joy-text-secondary)",
                                marginBottom: 8,
                              }}
                            >
                              {order.created_at && (
                                <span>
                                  {new Date(order.created_at).toLocaleString()}{" "}
                                  ·{" "}
                                </span>
                              )}
                              {order.customer_phone && (
                                <span>
                                  {order.customer_name} — {order.customer_phone}{" "}
                                  ·{" "}
                                </span>
                              )}
                              {order.creator_name && (
                                <span>By: {order.creator_name}</span>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                className="button-secondary"
                                onClick={() => printReceipt(order)}
                                type="button"
                              >
                                Print
                              </button>
                              {order.payment_status !== "paid" &&
                              order.status !== "cancelled" &&
                              order.status !== "rejected" ? (
                                <button
                                  onClick={() => {
                                    setPayModal(order);
                                    setPayAmount(
                                      remainingBalance(order) > 0
                                        ? remainingBalance(order).toFixed(2)
                                        : "",
                                    );
                                    setPayMethod(
                                      order.payment_method || "cash_at_cashier",
                                    );
                                  }}
                                  type="button"
                                >
                                  Record Payment (
                                  {money.format(remainingBalance(order))})
                                </button>
                              ) : null}
                              {userRole === "owner" &&
                              order.status !== "cancelled" &&
                              order.status !== "rejected" ? (
                                <button
                                  className="button-danger"
                                  onClick={() => setVoidModal(order)}
                                  type="button"
                                  style={{ fontSize: "0.8125rem" }}
                                >
                                  Void
                                </button>
                              ) : null}
                              {userRole === "owner" && !order.archived ? (
                                <button
                                  className="button-secondary"
                                  disabled={archiveBusy === order.id}
                                  onClick={() => void doArchive(order.id)}
                                  type="button"
                                  style={{ fontSize: "0.8125rem" }}
                                >
                                  {archiveBusy === order.id
                                    ? "Archiving…"
                                    : "Archive"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
      {totalPages > 1 ? (
        <div className="customer-directory-pagination">
          <button
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              void loadOrders(p, tab, search, dateScope);
            }}
            type="button"
          >
            Previous
          </button>
          <span className="muted">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              void loadOrders(p, tab, search, dateScope);
            }}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
      {payModal ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true">
          <div className="payment-modal">
            <header>
              <p className="eyebrow">Collect Payment</p>
              <h2>{payModal.order_number}</h2>
              <p className="muted">
                Total: {money.format(payModal.total)} · Paid:{" "}
                {money.format(payModal.paid_amount)} · Remaining:{" "}
                {money.format(remainingBalance(payModal))}
              </p>
            </header>
            <label>
              Amount (EGP)
              <input
                autoFocus
                inputMode="decimal"
                min="0.01"
                onChange={(e) => setPayAmount(e.target.value)}
                step="0.01"
                type="number"
                value={payAmount}
              />
            </label>
            <label>
              Method
              <select
                onChange={(e) => setPayMethod(e.target.value)}
                value={payMethod}
              >
                <option value="cash_at_cashier">Cash</option>
                <option value="card_at_branch">Card</option>
                <option value="instapay">InstaPay</option>
                <option value="manual_transfer">Transfer</option>
              </select>
            </label>
            <div className="payment-modal-actions">
              <button
                className="button-secondary"
                disabled={payBusy}
                onClick={() => setPayModal(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                disabled={payBusy || !payAmount}
                onClick={() => void recordPayment()}
                type="button"
              >
                {payBusy ? "Recording…" : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {voidModal ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true">
          <div className="payment-modal">
            <header>
              <p className="eyebrow">Void Receipt</p>
              <h2>{voidModal.order_number}</h2>
            </header>
            <label>
              Reason (required)
              <input
                autoFocus
                onChange={(e) => setVoidReason(e.target.value)}
                value={voidReason}
              />
            </label>
            <div className="payment-modal-actions">
              <button
                className="button-secondary"
                disabled={voidBusy}
                onClick={() => {
                  setVoidModal(null);
                  setVoidReason("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button-danger"
                disabled={voidBusy || !voidReason.trim()}
                onClick={() => void doVoid()}
                type="button"
              >
                {voidBusy ? "Voiding…" : "Void Receipt"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ═══════════════════════════════════════════════════
// OWNER ANALYTICS
// ═══════════════════════════════════════════════════

function OwnerAnalytics({ onError }: { onError: (msg: string) => void }) {
  const [stats, setStats] = useState<OwnerOverviewStats | null>(null);
  const [topProducts, setTopProducts] = useState<
    Array<{
      discount: number;
      gross_revenue: number;
      order_count: number;
      product: string;
      units_sold: number;
    }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ name: string; qty: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("today");

  const load = useCallback(
    async (filter: string) => {
      setLoading(true);
      try {
        const data = await loadOwnerOverview(filter);
        setStats(data.stats);
        setTopProducts(data.topProducts);
        setCategories(data.categories);
      } catch (error) {
        onError(getMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    void load(dateFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function switchFilter(f: string) {
    setDateFilter(f);
    await load(f);
  }

  return (
    <section className="portal-section">
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">Business Intelligence</p>
          <h2>Sales Analytics</h2>
        </div>
      </header>
      <div
        className="category-rail staff-category-rail"
        style={{ margin: "0 0 1rem" }}
      >
        {(["today", "yesterday", "this_week", "this_month"] as const).map(
          (f) => (
            <button
              aria-pressed={dateFilter === f}
              className={dateFilter === f ? "active" : ""}
              key={f}
              onClick={() => void switchFilter(f)}
              type="button"
            >
              {f === "today"
                ? "Today"
                : f === "yesterday"
                  ? "Yesterday"
                  : f === "this_week"
                    ? "This Week"
                    : "This Month"}
            </button>
          ),
        )}
      </div>
      {loading ? (
        <p className="muted">Loading analytics…</p>
      ) : stats ? (
        <>
          <div className="staff-metric-grid">
            <div className="kpi-card">
              <small>Gross Sales</small>
              <strong>{money.format(Number(stats.gross_sales || 0))}</strong>
            </div>
            <div className="kpi-card">
              <small>Net Sales</small>
              <strong>{money.format(Number(stats.net_sales || 0))}</strong>
            </div>
            <div className="kpi-card">
              <small>Paid</small>
              <strong>{money.format(Number(stats.paid_amount || 0))}</strong>
            </div>
            <div className="kpi-card">
              <small>Unpaid</small>
              <strong>{money.format(Number(stats.unpaid_amount || 0))}</strong>
            </div>
            <div className="kpi-card">
              <small>Receipts</small>
              <strong>{stats.total_receipts || 0}</strong>
            </div>
            <div className="kpi-card">
              <small>Completed</small>
              <strong>{stats.completed_orders || 0}</strong>
            </div>
            <div className="kpi-card">
              <small>Active</small>
              <strong>{stats.active_orders || 0}</strong>
            </div>
            <div className="kpi-card">
              <small>Avg Order</small>
              <strong>
                {money.format(Number(stats.avg_order_value || 0))}
              </strong>
            </div>
            <div className="kpi-card">
              <small>Items Sold</small>
              <strong>{stats.total_items_sold || 0}</strong>
            </div>
            <div className="kpi-card">
              <small>Customers</small>
              <strong>{stats.unique_customers || 0}</strong>
            </div>
          </div>
          <h3 style={{ marginTop: "1.5rem" }}>Top Products by Quantity</h3>
          {topProducts.length ? (
            <div className="staff-table">
              <div className="staff-table-row heading">
                <span>#</span>
                <span>Product</span>
                <span>Units</span>
                <span>Orders</span>
                <span>Revenue</span>
              </div>
              {topProducts.map((p, i) => (
                <div className="staff-table-row" key={i}>
                  <span>{i + 1}</span>
                  <span>
                    <strong>{p.product}</strong>
                  </span>
                  <span>{p.units_sold}</span>
                  <span>{p.order_count}</span>
                  <span>{money.format(Number(p.gross_revenue || 0))}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No sales data for this period.</p>
          )}
          {categories.length ? (
            <>
              <h3 style={{ marginTop: "1.5rem" }}>Popular Categories</h3>
              <div className="staff-table">
                <div className="staff-table-row heading">
                  <span>Category</span>
                  <span>Units Sold</span>
                </div>
                {categories.map((c, i) => (
                  <div className="staff-table-row" key={i}>
                    <span>
                      <strong>{c.name}</strong>
                    </span>
                    <span>{c.qty}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// ═══════════════════════════════════════════════════
// OWNER END OF DAY
// ═══════════════════════════════════════════════════

function OwnerEndDay({
  onError,
  onRefreshQueues,
}: {
  onError: (msg: string) => void;
  onRefreshQueues: () => Promise<void>;
}) {
  const [currentDay, setCurrentDay] = useState<BusinessDay | null>(null);
  const [history, setHistory] = useState<BusinessDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [showReport, setShowReport] = useState<Record<string, unknown> | null>(
    null,
  );
  const [closeNotes, setCloseNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bd, days] = await Promise.all([
        loadCurrentBusinessDay(),
        loadBusinessDays(),
      ]);
      setCurrentDay(bd);
      setHistory(days);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCloseDay() {
    if (!currentDay) return;
    setClosing(true);
    try {
      await closeBusinessDay(currentDay.id, closeNotes.trim() || undefined);
      const report = await loadBusinessDayReport(currentDay.id);
      setShowReport(report);
      setCloseNotes("");
      await load();
      await onRefreshQueues();
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setClosing(false);
    }
  }

  async function handleStartDay() {
    if (
      !window.confirm(
        "Start a new business day? Orders will be linked to this day until it is closed.",
      )
    )
      return;
    try {
      await startBusinessDay();
      await load();
    } catch (error) {
      onError(getMessage(error));
    }
  }

  async function handleAssignOrders() {
    setAssigning(true);
    try {
      await assignOrdersToBusinessDay();
      await load();
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setAssigning(false);
    }
  }

  function printDailyReport() {
    if (!showReport) return;
    const html = buildDailyReportHtml(showReport as unknown as DailyReportData);
    const w = window.open("", "_blank", "width=900,height=800");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  async function printHistoryReport(bdId: string) {
    try {
      const report = await loadBusinessDayReport(bdId);
      const html = buildDailyReportHtml(report as unknown as DailyReportData);
      const w = window.open("", "_blank", "width=900,height=800");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    } catch (error) {
      onError(getMessage(error));
    }
  }

  return (
    <section className="portal-section">
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">Business Day Management</p>
          <h2>End of Day</h2>
        </div>
      </header>
      {loading ? (
        <p className="muted">Loading business day status…</p>
      ) : currentDay ? (
        <div className="staff-overview">
          <div className="staff-metric-grid">
            <div className="kpi-card">
              <small>Status</small>
              <strong style={{ color: "var(--joy-success)" }}>OPEN</strong>
            </div>
            <div className="kpi-card">
              <small>Date</small>
              <strong>{currentDay.business_date}</strong>
            </div>
            <div className="kpi-card">
              <small>Opened</small>
              <strong>
                {new Date(currentDay.opened_at).toLocaleTimeString()}
              </strong>
            </div>
            <div className="kpi-card">
              <small>Receipts</small>
              <strong>{currentDay.receipt_count}</strong>
            </div>
          </div>
          <div style={{ margin: "1rem 0" }}>
            <button
              className="button-secondary"
              disabled={assigning}
              onClick={() => void handleAssignOrders()}
              type="button"
              style={{ marginRight: 8 }}
            >
              {assigning ? "Assigning…" : "Assign Today's Orders"}
            </button>
          </div>
          <label>
            Closing Note (optional)
            <textarea
              onChange={(e) => setCloseNotes(e.target.value)}
              rows={2}
              value={closeNotes}
            />
          </label>
          <button
            disabled={closing}
            onClick={() => void handleCloseDay()}
            type="button"
            style={{ marginTop: 8 }}
          >
            {closing ? "Closing Business Day…" : "End Business Day"}
          </button>
        </div>
      ) : (
        <div className="staff-overview">
          <p style={{ marginBottom: 16 }}>No business day is currently open.</p>
          <button onClick={() => void handleStartDay()} type="button">
            Start New Business Day
          </button>
        </div>
      )}
      {showReport ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true">
          <div
            className="payment-modal"
            style={{ maxWidth: 600, maxHeight: "80vh", overflow: "auto" }}
          >
            <header>
              <p className="eyebrow">Daily Report</p>
              <h2>Business Day Closed</h2>
              <p>{String(showReport.business_date || "")}</p>
            </header>
            <div style={{ padding: 16, fontSize: "0.875rem" }}>
              <p>
                <strong>Order Count:</strong>{" "}
                {String(showReport.order_count || 0)}
              </p>
              <p>
                <strong>Gross Sales:</strong>{" "}
                {money.format(Number(showReport.gross_sales || 0))}
              </p>
              <p>
                <strong>Paid Amount:</strong>{" "}
                {money.format(Number(showReport.paid_amount || 0))}
              </p>
              <p>
                <strong>Unpaid:</strong>{" "}
                {money.format(Number(showReport.unpaid_amount || 0))}
              </p>
              <p>
                <strong>Refunded:</strong>{" "}
                {money.format(Number(showReport.refunded_amount || 0))}
              </p>
              {showReport.notes ? (
                <p>
                  <strong>Notes:</strong> {String(showReport.notes)}
                </p>
              ) : null}
            </div>
            <div className="payment-modal-actions">
              <button
                className="button-secondary"
                onClick={() => {
                  printDailyReport();
                }}
                type="button"
              >
                Print Daily Report
              </button>
              <button onClick={() => setShowReport(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {history.length ? (
        <details className="business-day-history" open>
          <summary>
            <span>
              <strong>Business Day History</strong>
              <small>{history.length} reporting periods</small>
            </span>
          </summary>
          <div className="staff-table business-day-history-table">
            <div className="staff-table-row heading">
              <span>Date</span>
              <span>Status</span>
              <span>Receipts</span>
              <span>Gross Sales</span>
              <span>Paid</span>
              <span>Unpaid</span>
              <span></span>
            </div>
            {history.map((bd, idx) => (
              <div key={bd.id}>
                {idx > 0 &&
                bd.status === "CLOSED" &&
                history[idx - 1]?.status === "CLOSED" ? (
                  <div className="business-day-divider" />
                ) : null}
                <div
                  className={`staff-table-row${bd.status === "OPEN" ? " business-day-open" : ""}`}
                >
                  <span>
                    <strong>{bd.business_date}</strong>
                  </span>
                  <span>
                    <span
                      className={`status-pill status-${bd.status === "OPEN" ? "confirmed" : "closed"}`}
                    >
                      {bd.status}
                    </span>
                  </span>
                  <span>{bd.receipt_count}</span>
                  <span>{money.format(Number(bd.gross_sales || 0))}</span>
                  <span>{money.format(Number(bd.paid_amount || 0))}</span>
                  <span>{money.format(Number(bd.unpaid_amount || 0))}</span>
                  <span>
                    {bd.status === "CLOSED" ? (
                      <button
                        className="button-secondary"
                        onClick={() => void printHistoryReport(bd.id)}
                        type="button"
                        style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                      >
                        Print Report
                      </button>
                    ) : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
