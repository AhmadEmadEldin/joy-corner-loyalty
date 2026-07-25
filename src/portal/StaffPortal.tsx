import { FormEvent, useEffect, useState } from "react";
import {
  restoreSession,
  subscribeToSession,
  type SessionUser,
} from "./client";
import {
  CartLine,
  changeOrderStatus,
  createStaffCustomer,
  createStaffOrder,
  confirmOrderPayment,
  loadCustomerDirectory,
  loadStaffProfile,
  loadStaffQueues,
  loadMenu,
  MenuItem,
  QueueOrder,
  runEndDay,
  searchCustomerByPhone,
  signInStaff,
  signOutCustomer,
  StaffProfile,
  subscribeToStaffQueues,
} from "./repository";
import { OperationalOrderStatus, statusLabel } from "./workflow";
import { OwnerMenuManager } from "./OwnerMenuManager";
import { createClientId } from "./cartDraft";
import { buildReceiptPrintHtml } from "../receiptPrint";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

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
      <main className="joy-portal center-state">
        Checking staff access…
      </main>
    );
  return user ? <StaffWorkspace user={user} /> : <StaffAccess />;
}

function StaffAccess() {
  const [busy, setBusy] = useState(false);
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
  return (
    <main className="auth-shell joy-access">
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
              required
              type="email"
            />
          </label>
          <label>
            Password
            <input name="password" required type="password" />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {message ? <p role="alert">{message}</p> : null}
        <a href="/order">Customer ordering</a>
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
    "overview" | "new_order" | "cashier" | "kitchen" | "customers" | "menu"
  >("cashier");
  const [message, setMessage] = useState("Loading operational queues…");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [endingDay, setEndingDay] = useState(false);

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
    const unsubscribe = subscribeToStaffQueues(role, () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(
        () => void refreshQueues(role),
        150,
      );
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
      if (next === "confirmed") {
        setMessage(`Order ${order.order_number} confirmed and sent to the barista.`);
      }
      if (profile) await refreshQueues(profile.role);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusyOrder(null);
    }
  }

  const [paymentOrder, setPaymentOrder] = useState<QueueOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);

  function openPayment(order: QueueOrder) {
    const remaining = order.remaining_amount ?? order.total ?? 0;
    setPaymentOrder(order);
    setPaymentAmount(remaining > 0 ? remaining.toFixed(2) : "");
  }

  async function submitPayment() {
    if (!paymentOrder) return;
    const remaining = paymentOrder.remaining_amount ?? paymentOrder.total ?? 0;
    const amount = Number(paymentAmount.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.01) {
      setMessage(`Enter a payment between ${money.format(0.01)} and ${money.format(remaining)}.`);
      return;
    }
    setPaymentBusy(true);
    try {
      await confirmOrderPayment({
        amount,
        orderId: paymentOrder.order_id,
        paymentMethod: (paymentOrder.payment_method || "cash_at_cashier") as
          | "cash_at_cashier"
          | "card_at_branch"
          | "instapay"
          | "manual_transfer",
        reference: "",
      });
      setMessage(`${money.format(amount)} recorded for ${paymentOrder.order_number}.`);
      setPaymentOrder(null);
      setPaymentAmount("");
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
    receiptWindow.document.write(buildReceiptPrintHtml({
      customerName: order.pickup_name,
      items: items.map((item) => ({
        itemName: item.itemName || item.name || "Item",
        qty: item.quantity || 1,
        size: item.size || "",
        total: Number(item.totalPrice || 0),
        unitPrice: Number(item.unitPrice || 0),
      })),
      notes: order.customer_notes,
      orderDateTime: order.created_at ? new Date(order.created_at).toLocaleString() : "",
      orderPlace: "Joy Corner pickup",
      outstandingAmount: order.remaining_amount || 0,
      paidAmount: order.paid_amount || 0,
      paymentStatus: order.payment_status?.replace(/_/g, " ") || "unpaid",
      receiptNumber: order.order_number,
      staff: profile?.full_name || "Joy Corner staff",
      subtotal: order.subtotal || order.total || 0,
      total: order.total || 0,
    }));
    receiptWindow.document.close();
  }

  async function endDay() {
    if (!window.confirm("Close today's reporting period and send its summary to Google Sheets?")) return;
    setEndingDay(true);
    try {
      const report = await runEndDay();
      setMessage(`End Day completed: ${report.order_count} orders, ${money.format(report.gross_sales)} gross sales. Reporting is queued for Google Sheets.`);
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
  const canCreate =
    profile && ["owner", "manager", "cashier", "waiter"].includes(profile.role);
  const canOverview = profile && ["owner", "manager"].includes(profile.role);
  return (
    <main className="joy-portal">
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
          onEndDay={() => void endDay()}
          endingDay={endingDay}
        />
      ) : null}
      {tab === "new_order" ? (
        <StaffOrderForm
          customers={customers}
          onCreated={async (orderNumber) => {
            setMessage(`Order ${orderNumber} was sent to the cashier for confirmation.`);
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
              {order.status !== "pending_confirmation" && order.payment_status !== "paid" ? (
                <button onClick={() => openPayment(order)} type="button">
                  Record payment ({money.format(order.remaining_amount ?? order.total ?? 0)} due)
                </button>
              ) : null}
              <button className="button-secondary" onClick={() => printReceipt(order)} type="button">
                Print receipt
              </button>
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
        <StaffCustomerDirectory
          customers={customers}
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
      {tab === "menu" && profile?.role === "owner" ? (
        <OwnerMenuManager />
      ) : null}
      {paymentOrder ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
          <div className="payment-modal">
            <header>
              <p className="eyebrow">Record payment</p>
              <h2 id="payment-modal-title">{paymentOrder.order_number}</h2>
              <p className="muted">
                Remaining: {money.format(paymentOrder.remaining_amount ?? paymentOrder.total ?? 0)}
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
              <select defaultValue={paymentOrder.payment_method || "cash_at_cashier"}>
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
                onClick={() => { setPaymentOrder(null); setPaymentAmount(""); }}
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

function StaffOrderForm({
  customers: _customers,
  onCreated,
}: {
  customers: Array<Record<string, unknown>>;
  onCreated: (orderNumber: string) => Promise<void>;
}) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Record<string, unknown> | null>(null);
  const [showCreateInline, setShowCreateInline] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
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
              lineId: createClientId(),
              modifiers: [],
              notes: "",
              quantity: 1,
              size,
            },
          ];
    });
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
        setShowCreateInline(false);
        setMessage(`Customer found: ${String(customer.fullName || "")}`);
      } else {
        setFoundCustomer(null);
        setSelectedCustomerId(null);
        setShowCreateInline(true);
        setMessage("No customer found with this phone number.");
      }
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setSearching(false);
    }
  }
  async function createInlineCustomer() {
    if (!newCustomerName.trim() || !customerPhone.trim()) return;
    setCreatingCustomer(true);
    setMessage("");
    try {
      const customer = await createStaffCustomer({
        email: newCustomerEmail.trim() || undefined,
        fullName: newCustomerName.trim(),
        phone: customerPhone.trim(),
      });
      setFoundCustomer(customer);
      setSelectedCustomerId(String(customer.id));
      setShowCreateInline(false);
      setMessage(`Customer created: ${String(customer.fullName || "")}`);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setCreatingCustomer(false);
    }
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
        customerId: selectedCustomerId || null,
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
      setFoundCustomer(null);
      setCustomerPhone("");
      setSelectedCustomerId(null);
      setShowCreateInline(false);
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
          <fieldset style={{ border: "1px solid var(--border, #ccc)", padding: "0.5rem", borderRadius: "4px" }}>
            <legend><strong>Customer (optional)</strong></legend>
            <label>
              Phone number
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  inputMode="tel"
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+201234567890"
                  value={customerPhone}
                />
                <button disabled={searching || !customerPhone.trim()} onClick={() => void searchCustomer()} type="button">
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>
            </label>
            {foundCustomer ? (
              <p style={{ color: "green" }}>
                Found: <strong>{String(foundCustomer.fullName || "")}</strong>
                {foundCustomer.customerNumber ? ` (${String(foundCustomer.customerNumber)})` : ""}
              </p>
            ) : null}
            {showCreateInline ? (
              <div style={{ marginTop: "0.5rem" }}>
                <label>
                  New customer name
                  <input onChange={(e) => setNewCustomerName(e.target.value)} required value={newCustomerName} />
                </label>
                <label>
                  Email (optional)
                  <input onChange={(e) => setNewCustomerEmail(e.target.value)} value={newCustomerEmail} />
                </label>
                <button disabled={creatingCustomer || !newCustomerName.trim()} onClick={() => void createInlineCustomer()} type="button">
                  {creatingCustomer ? "Creating…" : "Create Customer"}
                </button>
              </div>
            ) : null}
            {selectedCustomerId ? (
              <input type="hidden" name="customerId" value={selectedCustomerId} />
            ) : null}
          </fieldset>
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
    return !["pending_confirmation", "ready"].includes(order.status);
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
                <dl className="queue-payment-summary">
                  <div><dt>Total</dt><dd>{money.format(order.total)}</dd></div>
                  <div><dt>Paid</dt><dd>{money.format(order.paid_amount || 0)}</dd></div>
                  <div><dt>Remaining</dt><dd>{money.format(order.remaining_amount ?? order.total)}</dd></div>
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
      <div className="portal-section">
        <h3>Daily reporting</h3>
        <p>End Day is available when every order for today is closed, rejected, or cancelled.</p>
        <button disabled={endingDay} onClick={onEndDay} type="button">
          {endingDay ? "Closing day…" : "End Day & queue Google Sheets report"}
        </button>
      </div>
    </section>
  );
}

function StaffCustomerDirectory({
  customers,
  onRefresh,
  onError,
}: {
  customers: Array<Record<string, unknown>>;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [busy, setBusy] = useState(false);
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
  return (
    <section className="portal-section">
      <h2>Customer directory</h2>
      <form
        className="profile-grid"
        onSubmit={(e) => { e.preventDefault(); void addCustomer(); }}
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
        <button disabled={busy || !addName.trim() || !addPhone.trim()} type="submit">
          {busy ? "Adding…" : "Add customer"}
        </button>
      </form>
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
