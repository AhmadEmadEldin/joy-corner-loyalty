import type { User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "./client";
import {
  CartLine,
  changeOrderStatus,
  createStaffOrder,
  confirmOrderPayment,
  loadCustomerDirectory,
  loadStaffProfile,
  loadStaffQueues,
  loadMenu,
  MenuItem,
  QueueOrder,
  sendStaffMagicLink,
  signInStaff,
  signOutCustomer,
  StaffProfile,
  subscribeToStaffQueues,
} from "./repository";
import { OperationalOrderStatus, statusLabel } from "./workflow";
import { OwnerMenuManager } from "./OwnerMenuManager";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function SupabaseStaffPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const client = getSupabaseClient();
    void client.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setChecking(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (checking)
    return (
      <main className="supabase-portal center-state">
        Checking staff access…
      </main>
    );
  return user ? <StaffWorkspace user={user} /> : <StaffAccess />;
}

function StaffAccess() {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
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
  async function sendMagicLink() {
    setBusy(true);
    setMessage("");
    try {
      await sendStaffMagicLink(email);
      setMessage("Check your email for a secure Joy Corner sign-in link.");
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell supabase-access">
      <section className="auth-card">
        <img
          alt="Joy Corner"
          className="brand-mark"
          src="/assets/joy-corner-logo.svg"
        />
        <p className="eyebrow">Secure staff workspace</p>
        <h1>Staff sign in</h1>
        <form className="customer-order-form" onSubmit={submit}>
          <label>
            Email
            <input
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input name="password" required type="password" />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            className="button-secondary"
            disabled={busy || !email.trim()}
            onClick={sendMagicLink}
            type="button"
          >
            Email me a secure sign-in link
          </button>
        </form>
        {message ? <p role="alert">{message}</p> : null}
        <a href="/order">Customer ordering</a>
      </section>
    </main>
  );
}

function StaffWorkspace({ user }: { user: User }) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [cashier, setCashier] = useState<QueueOrder[]>([]);
  const [kitchen, setKitchen] = useState<QueueOrder[]>([]);
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [tab, setTab] = useState<
    "overview" | "new_order" | "cashier" | "kitchen" | "customers" | "menu"
  >("cashier");
  const [message, setMessage] = useState("Loading operational queues…");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

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
    if (!profile) return;
    let refreshTimer: number | undefined;
    const unsubscribe = subscribeToStaffQueues(profile.role, () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(
        () => void refreshQueues(profile.role),
        150,
      );
    });
    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [profile?.id, profile?.role]);

  async function move(
    order: QueueOrder,
    next: OperationalOrderStatus,
    reason = "",
  ) {
    setBusyOrder(order.order_id);
    try {
      await changeOrderStatus(order.order_id, next, reason);
      if (profile) await refreshQueues(profile.role);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusyOrder(null);
    }
  }

  async function collect(order: QueueOrder) {
    setBusyOrder(order.order_id);
    try {
      await confirmOrderPayment({
        amount: order.total || 0,
        orderId: order.order_id,
        paymentMethod: (order.payment_method || "cash_at_cashier") as
          | "cash_at_cashier"
          | "card_at_branch"
          | "instapay"
          | "manual_transfer",
        reference: "",
      });
      if (profile) await refreshQueues(profile.role);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusyOrder(null);
    }
  }

  const canCashier =
    profile && ["owner", "manager", "cashier"].includes(profile.role);
  const canKitchen =
    profile && ["owner", "manager", "barista"].includes(profile.role);
  const canCreate =
    profile && ["owner", "manager", "cashier", "waiter"].includes(profile.role);
  const canOverview = profile && ["owner", "manager"].includes(profile.role);
  return (
    <main className="supabase-portal">
      <header className="portal-header">
        <div>
          <p className="eyebrow">Joy Corner operations</p>
          <h1>{profile?.full_name || "Staff"}</h1>
          <small>{profile?.role}</small>
        </div>
        <button
          className="button-secondary"
          onClick={() => void signOutCustomer()}
          type="button"
        >
          Sign out
        </button>
      </header>
      {message ? (
        <p className="portal-message" role="status">
          {message}
        </p>
      ) : null}
      <nav className="portal-tabs">
        {canOverview ? (
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
            type="button"
          >
            Overview
          </button>
        ) : null}
        {canCreate ? (
          <button
            className={tab === "new_order" ? "active" : ""}
            onClick={() => setTab("new_order")}
            type="button"
          >
            New order
          </button>
        ) : null}
        {canCashier ? (
          <button
            className={tab === "cashier" ? "active" : ""}
            onClick={() => setTab("cashier")}
            type="button"
          >
            Cashier ({cashier.length})
          </button>
        ) : null}
        {profile?.role === "owner" ? (
          <button
            className={tab === "menu" ? "active" : ""}
            onClick={() => setTab("menu")}
            type="button"
          >
            Menu & images
          </button>
        ) : null}
        {canKitchen ? (
          <button
            className={tab === "kitchen" ? "active" : ""}
            onClick={() => setTab("kitchen")}
            type="button"
          >
            Kitchen ({kitchen.length})
          </button>
        ) : null}
        {canCashier ? (
          <button
            className={tab === "customers" ? "active" : ""}
            onClick={() => setTab("customers")}
            type="button"
          >
            Customers ({customers.length})
          </button>
        ) : null}
      </nav>
      {tab === "overview" && canOverview ? (
        <StaffOverview
          cashier={cashier}
          customers={customers.length}
          kitchen={kitchen}
          onNavigate={setTab}
        />
      ) : null}
      {tab === "new_order" ? (
        <StaffOrderForm
          customers={customers}
          onCreated={async (orderNumber) => {
            setMessage(`Order ${orderNumber} was sent to the kitchen.`);
            if (profile) await refreshQueues(profile.role);
          }}
        />
      ) : null}
      {tab === "cashier" && canCashier ? (
        <Queue
          title="Cashier confirmation and payment"
          orders={cashier}
          busyOrder={busyOrder}
          variant="cashier"
          actions={(order) => (
            <>
              {order.status === "pending_confirmation" ? (
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
                      const reason =
                        window.prompt("Reason for rejection?") || "";
                      if (reason) void move(order, "rejected", reason);
                    }}
                    type="button"
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {order.payment_status !== "paid" ? (
                <button onClick={() => void collect(order)} type="button">
                  Confirm {money.format(order.total || 0)} paid
                </button>
              ) : null}
              {order.status === "picked_up" ? (
                <button
                  onClick={() => void move(order, "closed")}
                  type="button"
                >
                  Close
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
              <button onClick={() => void move(order, target)} type="button">
                Mark {statusLabel(target)}
              </button>
            ) : null;
          }}
        />
      ) : null}
      {tab === "customers" ? (
        <section className="portal-section">
          <h2>Customer directory</h2>
          <div className="staff-table">
            <div className="staff-table-row heading">
              <span>Customer</span>
              <span>Contact</span>
              <span>Number</span>
            </div>
            {customers.map((customer) => (
              <div className="staff-table-row" key={String(customer.id)}>
                <strong>{String(customer.fullName || "")}</strong>
                <span>
                  {String(customer.phone || customer.email || "Restricted")}
                </span>
                <span>{String(customer.customerNumber || "")}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {tab === "menu" && profile?.role === "owner" ? (
        <OwnerMenuManager />
      ) : null}
    </main>
  );
}

function StaffOrderForm({
  customers,
  onCreated,
}: {
  customers: Array<Record<string, unknown>>;
  onCreated: (orderNumber: string) => Promise<void>;
}) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadMenu()
      .then(setMenu)
      .catch((error) => setMessage(getMessage(error)));
  }, []);
  function add(item: MenuItem) {
    const size = item.sizes[0];
    if (!size) return;
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
              lineId: crypto.randomUUID(),
              modifiers: [],
              notes: "",
              quantity: 1,
              size,
            },
          ];
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await createStaffOrder({
        cart,
        customerId: String(form.get("customerId") || "") || null,
        customerNotes: String(form.get("customerNotes") || ""),
        paymentMethod: String(
          form.get("paymentMethod") || "cash_at_cashier",
        ) as
          | "cash_at_cashier"
          | "card_at_branch"
          | "instapay"
          | "manual_transfer",
        pickupName: String(form.get("pickupName") || ""),
      });
      setCart([]);
      await onCreated(result.orderNumber);
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
        <div className="compact-menu">
          {menu.map((item) => (
            <button
              disabled={!item.sizes.length}
              key={item.id}
              onClick={() => add(item)}
              type="button"
            >
              <strong>{item.name}</strong>
              <small>
                {item.sizes[0]
                  ? money.format(item.sizes[0].price)
                  : "Unavailable"}
              </small>
            </button>
          ))}
        </div>
        <form className="profile-grid staff-order-form" onSubmit={submit}>
          <label>
            Pickup name
            <input name="pickupName" required />
          </label>
          <label>
            Customer
            <select name="customerId">
              <option value="">Walk-in customer</option>
              {customers.map((customer) => (
                <option key={String(customer.id)} value={String(customer.id)}>
                  {String(customer.fullName || customer.customerNumber)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment method
            <select name="paymentMethod">
              <option value="cash_at_cashier">Cash</option>
              <option value="card_at_branch">Card</option>
              <option value="instapay">InstaPay</option>
              <option value="manual_transfer">Transfer</option>
            </select>
          </label>
          <label>
            Notes
            <textarea name="customerNotes" />
          </label>
          <div className="staff-cart">
            {cart.map((line) => (
              <span key={line.size.id}>
                {line.quantity} × {line.item.name}
              </span>
            ))}
            <strong>
              {money.format(
                cart.reduce(
                  (sum, line) => sum + line.quantity * line.size.price,
                  0,
                ),
              )}
            </strong>
          </div>
          <button disabled={busy || !cart.length} type="submit">
            {busy ? "Creating…" : "Create and send to kitchen"}
          </button>
        </form>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function Queue({
  title,
  orders,
  actions,
  busyOrder,
  variant,
}: {
  title: string;
  orders: QueueOrder[];
  actions: (order: QueueOrder) => React.ReactNode;
  busyOrder: string | null;
  variant: "cashier" | "kitchen";
}) {
  const [view, setView] = useState<"all" | "new" | "current" | "ready">("all");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const visibleOrders = orders.filter((order) => {
    if (view === "all") return true;
    if (view === "new")
      return variant === "cashier"
        ? order.status === "pending_confirmation"
        : order.status === "confirmed";
    if (view === "ready") return order.status === "ready";
    return !["pending_confirmation", "confirmed", "ready"].includes(
      order.status,
    );
  });
  return (
    <section className="portal-section">
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">Live operations</p>
          <h2>{title}</h2>
        </div>
        <div className="queue-view-tabs" role="group" aria-label="Queue view">
          {(["all", "new", "current", "ready"] as const).map((option) => (
            <button
              aria-pressed={view === option}
              key={option}
              onClick={() => setView(option)}
              type="button"
            >
              {option} {option === "all" ? `(${orders.length})` : ""}
            </button>
          ))}
        </div>
      </header>
      {visibleOrders.length ? (
        <div className="queue-grid">
          {visibleOrders.map((order) => (
            <article
              className="queue-ticket"
              key={order.order_id}
              aria-busy={busyOrder === order.order_id}
            >
              <header>
                <div>
                  <strong>{order.order_number}</strong>
                  <small>{order.pickup_name}</small>
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
              <ul>
                {(order.item_summary || []).map((item, index) => (
                  <li key={index}>
                    {item.quantity || 1} ×{" "}
                    {item.itemName || item.name || "Item"}{" "}
                    {item.size ? `· ${item.size}` : ""}
                  </li>
                ))}
              </ul>
              {order.customer_notes ? (
                <p>
                  <strong>Customer note:</strong> {order.customer_notes}
                </p>
              ) : null}
              {typeof order.total === "number" ? (
                <strong>{money.format(order.total)}</strong>
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
  kitchen,
  onNavigate,
}: {
  cashier: QueueOrder[];
  customers: number;
  kitchen: QueueOrder[];
  onNavigate: (
    tab: "overview" | "new_order" | "cashier" | "kitchen" | "customers",
  ) => void;
}) {
  const pending = cashier.filter(
    (order) => order.status === "pending_confirmation",
  ).length;
  const unpaid = cashier.filter(
    (order) => order.payment_status !== "paid",
  ).length;
  const ready = kitchen.filter((order) => order.status === "ready").length;
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
