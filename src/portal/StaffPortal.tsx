import { FormEvent, useEffect, useRef, useState } from "react";
import {
  currentSessionUser,
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
  loadStaffHistory,
  loadStaffInsights,
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
  StaffInsights,
  subscribeToStaffQueues,
} from "./repository";
import { OperationalOrderStatus, statusLabel } from "./workflow";
import { ORDER_STATUS } from "../orderWorkflow";
import { OwnerMenuManager } from "./OwnerMenuManager";
import { ProductCustomizer } from "./ProductCustomizer";
import { buildReceiptPrintHtml } from "../receiptPrint";
import {
  StaffAppShell,
  type StaffSection,
} from "../components/StaffAppShell";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
} from "../components/JoyUI";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function StaffPortal() {
  const [user, setUser] = useState<SessionUser | null>(currentSessionUser);
  const [checking, setChecking] = useState(() =>
    Boolean(currentSessionUser()),
  );
  useEffect(() => {
    if (currentSessionUser()) {
      void restoreSession().then((sessionUser) => {
        setUser(sessionUser);
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
    const unsubscribe = subscribeToSession((sessionUser) => {
      setUser(sessionUser);
      setChecking(false);
    });
    return unsubscribe;
  }, []);
  if (checking)
    return (
      <main className="joy-portal center-state">
        <LoadingState label="Checking staff access…" />
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
  const [history, setHistory] = useState<QueueOrder[]>([]);
  const [insights, setInsights] = useState<StaffInsights | null>(null);
  const [tab, setTab] = useState<StaffSection>("cashier");
  const [message, setMessage] = useState("Loading operational queues…");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [endingDay, setEndingDay] = useState(false);
  const [endDayConfirmationOpen, setEndDayConfirmationOpen] = useState(false);
  const initializedUserId = useRef<string | null>(null);

  async function refreshQueues(role: StaffProfile["role"]) {
    try {
      const [queues, nextHistory] = await Promise.all([
        loadStaffQueues(role),
        ["owner", "manager", "cashier"].includes(role)
          ? loadStaffHistory()
          : Promise.resolve([]),
      ]);
      setCashier(queues.cashier);
      setKitchen(queues.kitchen);
      setHistory(nextHistory);
    } catch (error) {
      setMessage(getMessage(error));
    }
  }

  async function initializeWorkspace() {
    try {
      const nextProfile = await loadStaffProfile();
      if (nextProfile.role === "customer")
        throw new Error("This account does not have staff access.");
      const [queues, directory, nextHistory, nextInsights] = await Promise.all([
        loadStaffQueues(nextProfile.role),
        ["owner", "manager", "cashier"].includes(nextProfile.role)
          ? loadCustomerDirectory()
          : Promise.resolve([]),
        ["owner", "manager", "cashier"].includes(nextProfile.role)
          ? loadStaffHistory()
          : Promise.resolve([]),
        ["owner", "manager"].includes(nextProfile.role)
          ? loadStaffInsights()
          : Promise.resolve(null),
      ]);
      setProfile(nextProfile as StaffProfile);
      setCashier(queues.cashier);
      setKitchen(queues.kitchen);
      setCustomers(directory);
      setHistory(nextHistory);
      setInsights(nextInsights);
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
    if (initializedUserId.current === user.id) return;
    initializedUserId.current = user.id;
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

  async function collect(order: QueueOrder) {
    const remaining = order.remaining_amount ?? order.total ?? 0;
    const entered = window.prompt(
      `Payment received for ${order.order_number} (remaining ${money.format(remaining)}):`,
      remaining.toFixed(2),
    );
    if (entered === null) return;
    const amount = Number(entered.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.01) {
      setMessage(`Enter a payment between ${money.format(0.01)} and ${money.format(remaining)}.`);
      return;
    }
    setBusyOrder(order.order_id);
    try {
      await confirmOrderPayment({
        amount,
        orderId: order.order_id,
        paymentMethod: (order.payment_method || "cash_at_cashier") as
          | "cash_at_cashier"
          | "card_at_branch"
          | "instapay"
          | "manual_transfer",
        reference: "",
      });
      setMessage(`${money.format(amount)} recorded for ${order.order_number}.`);
      if (profile) await refreshQueues(profile.role);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusyOrder(null);
    }
  }

  function printReceipt(order: QueueOrder) {
    const receiptWindow = window.open("", "_blank", "width=900,height=800");
    if (!receiptWindow) {
      setMessage("Allow pop-ups for Joy Corner to print the receipt.");
      return;
    }
    receiptWindow.opener = null;
    receiptWindow.document.write(buildReceiptPrintHtml({
      customerName: order.pickup_name,
      items: order.item_summary.map((item) => ({
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
    setEndingDay(true);
    try {
      const report = await runEndDay();
      setInsights(await loadStaffInsights());
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
  const canOverview = profile && ["owner", "manager"].includes(profile.role);
  if (!profile) {
    return (
      <main className="joy-portal center-state" aria-busy="true">
        <LoadingState label={message || "Loading staff workspace…"} />
      </main>
    );
  }
  return (
    <StaffAppShell
      active={tab}
      badges={{ cashier: cashier.length, customers: customers.length, kitchen: kitchen.length }}
      message={message}
      onNavigate={setTab}
      onSignOut={() => void signOutCustomer()}
      profile={profile}
    >
      {tab === "overview" && canOverview ? (
        <StaffOverview
          cashier={cashier}
          customers={customers.length}
          insights={insights}
          kitchen={kitchen}
          onNavigate={setTab}
          onEndDay={() => setEndDayConfirmationOpen(true)}
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
              {order.status === ORDER_STATUS.AWAITING_CONFIRMATION ? (
                <>
                  <button
                    disabled={busyOrder === order.order_id}
                    onClick={() => void move(order, ORDER_STATUS.CONFIRMED)}
                    type="button"
                  >
                    Confirm
                  </button>
                  <button
                    className="button-danger"
                    disabled={busyOrder === order.order_id}
                    onClick={() => {
                      const reason =
                        window.prompt("Reason for rejection?") || "";
                      if (reason) void move(order, ORDER_STATUS.REJECTED, reason);
                    }}
                    type="button"
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {order.status !== ORDER_STATUS.AWAITING_CONFIRMATION && order.payment_status !== "paid" ? (
                <button disabled={busyOrder === order.order_id} onClick={() => void collect(order)} type="button">
                  Record payment ({money.format(order.remaining_amount ?? order.total ?? 0)} due)
                </button>
              ) : null}
              <button className="button-secondary" onClick={() => printReceipt(order)} type="button">
                Print receipt
              </button>
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
              [ORDER_STATUS.CONFIRMED]: ORDER_STATUS.IN_PREPARATION,
              [ORDER_STATUS.IN_PREPARATION]: ORDER_STATUS.READY,
              [ORDER_STATUS.READY]: ORDER_STATUS.PICKED_UP,
            };
            const target = next[order.status];
            return target ? (
              <button disabled={busyOrder === order.order_id} onClick={() => void move(order, target)} type="button">
                {target === ORDER_STATUS.IN_PREPARATION
                  ? "Start preparation"
                  : `Mark ${statusLabel(target)}`}
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
      {tab === "orders" ? <OrderHistoryPanel orders={history} /> : null}
      {tab === "rewards" && insights ? (
        <BusinessPanel kind="rewards" insights={insights} />
      ) : null}
      {tab === "vouchers" && insights ? (
        <BusinessPanel kind="vouchers" insights={insights} />
      ) : null}
      {tab === "analytics" && insights ? (
        <BusinessPanel kind="analytics" insights={insights} />
      ) : null}
      {tab === "end_day" && insights ? (
        <EndDayPanel
          endingDay={endingDay}
          insights={insights}
          onEndDay={() => setEndDayConfirmationOpen(true)}
        />
      ) : null}
      {tab === "system" && insights ? (
        <BusinessPanel kind="system" insights={insights} />
      ) : null}
      <ConfirmDialog
        busy={endingDay}
        confirmLabel="Close business day"
        description="This closes today's reporting period and queues the verified summary for Google Sheets. Active operational orders will block the action."
        onCancel={() => setEndDayConfirmationOpen(false)}
        onConfirm={() => {
          setEndDayConfirmationOpen(false);
          void endDay();
        }}
        open={endDayConfirmationOpen}
        phrase="CLOSE BUSINESS DAY"
        title="Close today’s business day?"
      />
    </StaffAppShell>
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
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [category, setCategory] = useState("Hot Beverages");
  const [orderPlace, setOrderPlace] = useState<
    "dine_in" | "takeaway" | "car" | "outside" | "delivery"
  >("takeaway");
  const orderIdempotencyKey = useRef(crypto.randomUUID());
  useEffect(() => {
    void loadMenu()
      .then(setMenu)
      .catch((error) => setMessage(getMessage(error)));
  }, []);
  const categories = ["All", ...Array.from(new Set(menu.map((item) => item.category)))];
  const visibleMenu = menu.filter((item) => {
    const query = menuQuery.trim().toLowerCase();
    return (
      (category === "All" || item.category === category) &&
      (!query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query))
    );
  });
  const cartTotal = cart.reduce(
    (sum, line) => sum + line.quantity * line.size.price,
    0,
  );
  const cartQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
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
        idempotencyKey: orderIdempotencyKey.current,
        paymentMethod: String(
          form.get("paymentMethod") || "cash_at_cashier",
        ) as
          | "cash_at_cashier"
          | "card_at_branch"
          | "instapay"
          | "manual_transfer",
        orderPlace,
        placeDetails: Object.fromEntries(
          [
            "tableNumber",
            "pickupName",
            "pickupTime",
            "carColor",
            "carModel",
            "plateNumber",
            "address",
            "phone",
            "deliveryNote",
            "deliveryFee",
          ].map((key) => [key, String(form.get(key) || "")]),
        ),
        pickupName: String(form.get("pickupName") || ""),
      });
      setCart([]);
      setFoundCustomer(null);
      setCustomerPhone("");
      setSelectedCustomerId(null);
      setShowCreateInline(false);
      orderIdempotencyKey.current = crypto.randomUUID();
      await onCreated(result.orderNumber);
    } catch (error) {
      setMessage(getMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="portal-section staff-pos-section">
      <header className="staff-page-heading">
        <div>
          <p className="eyebrow">Complete point of sale</p>
          <h2>{category === "All" ? "New Order" : category}</h2>
          <p>Discover the Joy Corner menu and create a customer order.</p>
        </div>
        <label>
          <span className="sr-only">Search menu products</span>
          <input
            onChange={(event) => setMenuQuery(event.target.value)}
            placeholder="Search menu items…"
            type="search"
            value={menuQuery}
          />
        </label>
      </header>
      <nav aria-label="Menu categories" className="pos-category-tabs">
        {categories.map((name) => (
          <button
            aria-pressed={category === name}
            className={category === name ? "active" : ""}
            key={name}
            onClick={() => setCategory(name)}
            type="button"
          >
            {name === "All" ? "All Items" : name}
          </button>
        ))}
      </nav>
      <div className="staff-order-layout">
        <div className="compact-menu">
          {visibleMenu.map((item) => (
            <button
              className={!item.available ? "unavailable" : ""}
              disabled={!item.available || !item.sizes.length}
              key={item.id}
              onClick={() => setSelectedProduct(item)}
              type="button"
            >
              <span className="staff-product-image">
                <img
                  alt=""
                  decoding="async"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                  }}
                  src={item.image_url || "/assets/coffee-bean-field.jpg"}
                />
              </span>
              <span className="staff-product-copy">
                <strong>{item.name}</strong>
                <small>
                  {item.sizes[0]
                    ? money.format(item.sizes[0].price)
                    : "Unavailable"}
                </small>
                {item.loyalty_eligible ? <b>Reward eligible</b> : null}
              </span>
              <span aria-hidden="true" className="staff-product-add">+</span>
              {!item.available ? (
                <em>
                  {item.availability_status === "sold_out"
                    ? "Sold out"
                    : "Temporarily unavailable"}
                </em>
              ) : null}
            </button>
          ))}
        </div>
        <form className="profile-grid staff-order-form" onSubmit={submit}>
          <header className="staff-order-rail-header">
            <div>
              <span className="eyebrow">Your order</span>
              <strong>
                {cartQuantity} {cartQuantity === 1 ? "item" : "items"}
              </strong>
            </div>
            {cart.length ? (
              <button
                className="button-secondary"
                onClick={() => setCart([])}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </header>
          <label className="staff-order-detail">
            Pickup name
            <input name="pickupName" required />
          </label>
          <fieldset className="customer-lookup-fieldset">
            <legend><strong>Customer</strong></legend>
            <label>
              Phone number
              <div className="customer-lookup-controls">
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
              <div className="customer-lookup-result">
                <strong>{String(foundCustomer.fullName || "")}</strong>
                <span>{String(foundCustomer.loyaltyPoints || 0)} points</span>
                <span>{String(foundCustomer.activeVouchers || 0)} active vouchers</span>
                <span>{money.format(Number(foundCustomer.unpaidBalance || 0))} unpaid</span>
                <small>{String(foundCustomer.orderCount || 0)} previous orders</small>
              </div>
            ) : null}
            {showCreateInline ? (
              <div className="customer-create-inline">
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
          <label className="staff-order-payment">
            Payment method
            <select name="paymentMethod">
              <option value="cash_at_cashier">Cash</option>
              <option value="card_at_branch">Card</option>
              <option value="instapay">InstaPay</option>
              <option value="manual_transfer">Transfer</option>
            </select>
          </label>
          <fieldset className="order-place-selector">
            <legend>Order type</legend>
            {(["dine_in", "takeaway", "car", "outside", "delivery"] as const).map(
              (place) => (
                <label key={place}>
                  <input
                    checked={orderPlace === place}
                    name="orderPlace"
                    onChange={() => setOrderPlace(place)}
                    type="radio"
                    value={place}
                  />
                  {place.replace(/_/g, " ")}
                </label>
              ),
            )}
          </fieldset>
          {orderPlace === "dine_in" ? (
            <label>Table number<input name="tableNumber" required /></label>
          ) : null}
          {orderPlace === "takeaway" ? (
            <label>Pickup time (optional)<input name="pickupTime" type="time" /></label>
          ) : null}
          {orderPlace === "car" ? (
            <>
              <label>Car color<input name="carColor" required /></label>
              <label>Car model<input name="carModel" required /></label>
              <label>Plate number (optional)<input name="plateNumber" /></label>
            </>
          ) : null}
          {orderPlace === "delivery" ? (
            <>
              <label>Delivery address<textarea name="address" required /></label>
              <label>Delivery phone<input inputMode="tel" name="phone" required /></label>
              <label>Delivery note<textarea name="deliveryNote" /></label>
              <label>Delivery fee (EGP)<input min="0" name="deliveryFee" step="0.01" type="number" /></label>
            </>
          ) : null}
          <label className="staff-order-detail">
            Notes
            <textarea name="customerNotes" placeholder="Add a customer note…" />
          </label>
          <div aria-label="Current order" className="staff-cart">
            {cart.map((line) => (
              <article key={line.lineId}>
                <img
                  alt=""
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                  }}
                  src={line.item.image_url || "/assets/coffee-bean-field.jpg"}
                />
                <div>
                  <strong>{line.item.name}</strong>
                  <small>{line.size.size_name}</small>
                </div>
                <div className="staff-cart-quantity">
                  <button
                    aria-label={`Decrease ${line.item.name}`}
                    onClick={() =>
                      setCart((current) =>
                        current.flatMap((candidate) =>
                          candidate.lineId !== line.lineId
                            ? [candidate]
                            : candidate.quantity > 1
                              ? [{
                                  ...candidate,
                                  quantity: candidate.quantity - 1,
                                }]
                              : [],
                        ),
                      )
                    }
                    type="button"
                  >
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    aria-label={`Increase ${line.item.name}`}
                    onClick={() =>
                      setCart((current) =>
                        current.map((candidate) =>
                          candidate.lineId === line.lineId
                            ? {
                                ...candidate,
                                quantity: candidate.quantity + 1,
                              }
                            : candidate,
                        ),
                      )
                    }
                    type="button"
                  >
                    +
                  </button>
                </div>
                <b>{money.format(line.quantity * line.size.price)}</b>
                <button
                  aria-label={`Remove ${line.item.name}`}
                  className="staff-cart-remove"
                  onClick={() =>
                    setCart((current) =>
                      current.filter(
                        (candidate) => candidate.lineId !== line.lineId,
                      ),
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              </article>
            ))}
            {!cart.length ? (
              <p className="staff-cart-empty">
                Choose a menu item to start the order.
              </p>
            ) : null}
          </div>
          <dl className="staff-order-summary">
            <div>
              <dt>Subtotal</dt>
              <dd>{money.format(cartTotal)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{money.format(cartTotal)}</dd>
            </div>
          </dl>
          <button disabled={busy || !cart.length} type="submit">
            {busy ? "Creating…" : "Confirm Order"}
          </button>
        </form>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {selectedProduct ? (
        <ProductCustomizer
          item={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSave={(line) => {
            setCart((current) => [...current, line]);
            setSelectedProduct(null);
          }}
        />
      ) : null}
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
  type QueueView =
    | "all"
    | "current"
    | "new"
    | "paid"
    | "partial"
    | "ready"
    | "unpaid";
  const [view, setView] = useState<QueueView>("all");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const visibleOrders = orders.filter((order) => {
    if (view === "all") return true;
    if (view === "new")
      return variant === "cashier"
        ? order.status === ORDER_STATUS.AWAITING_CONFIRMATION
        : order.status === ORDER_STATUS.CONFIRMED;
    if (view === "ready") return order.status === ORDER_STATUS.READY;
    if (view === "unpaid") return order.payment_status === "unpaid";
    if (view === "partial")
      return order.payment_status === "partially_paid";
    if (view === "paid") return order.payment_status === "paid";
    return variant === "cashier"
      ? order.status === ORDER_STATUS.CONFIRMED
      : order.status === ORDER_STATUS.IN_PREPARATION;
  });
  const viewOptions: Array<{ id: QueueView; label: string }> =
    variant === "cashier"
      ? [
          { id: "all", label: "Active" },
          { id: "new", label: "Awaiting confirmation" },
          { id: "current", label: "Confirmed" },
          { id: "ready", label: "Ready" },
          { id: "unpaid", label: "Unpaid" },
          { id: "partial", label: "Partially paid" },
          { id: "paid", label: "Paid" },
        ]
      : [
          { id: "all", label: "Active" },
          { id: "new", label: "New" },
          { id: "current", label: "In preparation" },
          { id: "ready", label: "Ready" },
        ];
  return (
    <section className="portal-section">
      <header className="staff-queue-header">
        <div>
          <p className="eyebrow">Live operations</p>
          <h2>{title}</h2>
        </div>
        <div className="queue-view-tabs" role="group" aria-label="Queue view">
          {viewOptions.map((option) => (
            <button
              aria-pressed={view === option.id}
              key={option.id}
              onClick={() => setView(option.id)}
              type="button"
            >
              {option.label} {option.id === "all" ? `(${orders.length})` : ""}
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
        <EmptyState
          description="New orders will appear here automatically when they reach this workflow stage."
          icon={variant === "kitchen" ? "kitchen" : "cashier"}
          title="No orders in this view"
        />
      )}
    </section>
  );
}

function StaffOverview({
  cashier,
  customers,
  endingDay,
  insights,
  kitchen,
  onEndDay,
  onNavigate,
}: {
  cashier: QueueOrder[];
  customers: number;
  endingDay: boolean;
  insights: StaffInsights | null;
  kitchen: QueueOrder[];
  onEndDay: () => void;
  onNavigate: (
    tab: "overview" | "new_order" | "cashier" | "kitchen" | "customers",
  ) => void;
}) {
  const pending = cashier.filter(
    (order) => order.status === ORDER_STATUS.AWAITING_CONFIRMATION,
  ).length;
  const unpaid = cashier.filter(
    (order) => order.payment_status !== "paid",
  ).length;
  const ready = kitchen.filter((order) => order.status === "ready").length;
  return (
    <section className="staff-overview">
      <PageHeader
        description="Live operational metrics from the protected cashier and kitchen projections."
        eyebrow="Owner operations"
        title="Today at Joy Corner"
      />
      <div className="staff-metric-grid">
        {insights ? (
          <>
            <Metric
              label="Sales today"
              value={money.format(insights.analytics.order_value)}
            />
            <Metric
              label="Orders today"
              value={insights.analytics.order_count}
            />
            <Metric
              label="Average order"
              value={money.format(insights.analytics.average_order)}
            />
          </>
        ) : null}
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
        <p>End Day is available when every order for today is picked up, rejected, or cancelled.</p>
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
  const [query, setQuery] = useState("");
  const visibleCustomers = customers.filter((customer) => {
    const value = query.trim().toLowerCase();
    return (
      !value ||
      String(customer.fullName || "").toLowerCase().includes(value) ||
      String(customer.phone || "").toLowerCase().includes(value)
    );
  });
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
      <PageHeader
        action={<label>
          <span className="sr-only">Search customers</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or phone"
            type="search"
            value={query}
          />
        </label>}
        description="Search and create customer records using the protected staff directory."
        eyebrow="Real customer accounts"
        title="Customer directory"
      />
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
          <span>Orders / spend</span>
          <span>Unpaid</span>
          <span>Rewards</span>
        </div>
        {visibleCustomers.map((customer) => (
          <div className="staff-table-row" key={String(customer.id)}>
            <strong>{String(customer.fullName || "")}</strong>
            <span>
              {String(customer.phone || customer.email || "Restricted")}
            </span>
            <span>
              {String(customer.orderCount || 0)} /{" "}
              {money.format(Number(customer.lifetimeSpend || 0))}
            </span>
            <span>{money.format(Number(customer.unpaidBalance || 0))}</span>
            <span>
              {String(customer.loyaltyPoints || 0)} pts ·{" "}
              {String(customer.activeVouchers || 0)} vouchers
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrderHistoryPanel({ orders }: { orders: QueueOrder[] }) {
  return (
    <section className="portal-section">
      <PageHeader
        action={<strong>{orders.length} recent records</strong>}
        description="Historical item names, prices, totals, and payment states remain unchanged."
        eyebrow="Preserved operational history"
        title="Completed and cancelled orders"
      />
      {orders.length ? (
        <div className="staff-table order-history-table">
          <div className="staff-table-row heading">
            <span>Order</span>
            <span>Customer</span>
            <span>Status</span>
            <span>Total</span>
            <span>Payment</span>
          </div>
          {orders.map((order) => (
            <div className="staff-table-row" key={order.order_id}>
              <strong>{order.order_number}</strong>
              <span>{order.pickup_name}</span>
              <span className={`status-pill status-${order.status}`}>
                {statusLabel(order.status)}
              </span>
              <span>{money.format(order.total || 0)}</span>
              <span className={`payment-badge payment-${order.payment_status}`}>
                {(order.payment_status || "unpaid").replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Completed and cancelled orders will remain available here for operational review."
          icon="orders"
          title="No order history yet"
        />
      )}
    </section>
  );
}

function BusinessPanel({
  insights,
  kind,
}: {
  insights: StaffInsights;
  kind: "analytics" | "rewards" | "system" | "vouchers";
}) {
  if (kind === "rewards") {
    return (
      <section className="staff-business-page">
        <PageHeader
          description="Balances and eligible activity are calculated from Neon."
          eyebrow="Immutable loyalty reporting"
          title="Rewards"
        />
        <div className="staff-metric-grid">
          <Metric label="Points outstanding" value={insights.rewards.points_outstanding} />
          <Metric label="Eligible orders" value={insights.rewards.eligible_orders} />
          <Metric label="Free rewards available" value={insights.rewards.free_rewards} />
          <Metric label="Active customers" value={insights.customers.total_customers} />
        </div>
        <section className="portal-section">
          <h3>Ledger protection</h3>
          <p>
            Completed paid orders write a unique ledger entry. Duplicate awards
            are rejected by the database.
          </p>
        </section>
      </section>
    );
  }
  if (kind === "vouchers") {
    return (
      <section className="staff-business-page voucher-operations">
        <PageHeader
          description="Current voucher inventory and redemption state."
          eyebrow="Atomic redemption reporting"
          title="Vouchers"
        />
        <div className="staff-metric-grid">
          <Metric label="Active" value={insights.vouchers.active} />
          <Metric label="Redeemed" value={insights.vouchers.redeemed} />
          <Metric label="Cancelled" value={insights.vouchers.cancelled} />
          <Metric label="All vouchers" value={insights.vouchers.total} />
        </div>
        <section className="voucher-farm-panel portal-section">
          <img
            alt=""
            decoding="async"
            loading="lazy"
            src="/assets/joy-reference-hero.png"
          />
          <div>
            <p className="eyebrow">Coffee farm voucher identity</p>
            <h3>Every reward carries the Joy Corner story</h3>
            <p>
              Voucher benefits, ownership, expiry, and single-use redemption
              are verified by the protected API.
            </p>
          </div>
        </section>
      </section>
    );
  }
  if (kind === "system") {
    const integrations = [
      ["Neon operational database", insights.integrations.neon],
      ["Live order updates", Boolean(insights.integrations.realtime)],
      ["Google Sheets reporting", insights.integrations.googleSheets],
      ["Cloudinary product images", insights.integrations.cloudinary],
    ] as const;
    return (
      <section className="staff-business-page">
        <PageHeader
          description="Runtime integration readiness without exposing credentials."
          eyebrow="Protected owner configuration"
          title="System"
        />
        <div className="system-grid">
          {integrations.map(([label, ready]) => (
            <article className="portal-section" key={label}>
              <span className={ready ? "status-dot ready" : "status-dot"} />
              <div><strong>{label}</strong><small>{ready ? "Configured" : "Needs configuration"}</small></div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="staff-business-page">
      <PageHeader
        description="Today in Cairo, calculated from operational order records."
        eyebrow="Live business performance"
        title="Analytics"
      />
      <div className="staff-metric-grid">
        <Metric label="Revenue" value={money.format(insights.analytics.order_value)} />
        <Metric label="Orders" value={insights.analytics.order_count} />
        <Metric label="Average order" value={money.format(insights.analytics.average_order)} />
        <Metric label="Unpaid value" value={money.format(insights.analytics.unpaid_value)} />
        <Metric label="Active kitchen" value={insights.analytics.active_kitchen} />
        <Metric label="New customers" value={insights.customers.new_customers} />
      </div>
    </section>
  );
}

function EndDayPanel({
  endingDay,
  insights,
  onEndDay,
}: {
  endingDay: boolean;
  insights: StaffInsights;
  onEndDay: () => void;
}) {
  return (
    <section className="staff-business-page">
      <PageHeader
        action={<button className="danger-action" disabled={endingDay} onClick={onEndDay} type="button">
          {endingDay ? "Closing…" : "Close business day"}
        </button>}
        description={
          <>
            Closing is blocked while operational orders remain active and is
            protected by a database lock.
          </>
        }
        eyebrow="Protected close procedure"
        title="End of Day"
      />
      <div className="staff-metric-grid">
        <Metric label="Orders today" value={insights.analytics.order_count} />
        <Metric label="Sales today" value={money.format(insights.analytics.order_value)} />
        <Metric label="Unpaid" value={money.format(insights.analytics.unpaid_value)} />
        <Metric label="Open kitchen" value={insights.analytics.active_kitchen} />
      </div>
      <section className="portal-section">
        <h3>Recent closures</h3>
        {insights.endDays.length ? (
          <div className="staff-table">
            {insights.endDays.map((report) => (
              <div className="staff-table-row" key={String(report.id)}>
                <strong>{String(report.business_date || "")}</strong>
                <span>{String(report.order_count || 0)} orders</span>
                <span>{money.format(Number(report.gross_sales || 0))}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            description="A closure record will appear after the first successful End of Day."
            icon="endDay"
            title="No closed business days yet"
          />
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <MetricCard label={label} value={value} />;
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
