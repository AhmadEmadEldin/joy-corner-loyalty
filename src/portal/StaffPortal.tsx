import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  restoreSession,
  subscribeToSession,
  type SessionUser,
} from "./client";
import {
  archiveReceipt,
  assignOrdersToBusinessDay,
  buildWhatsAppVoucherLink,
  BusinessDay,
  CartLine,
  changeOrderStatus,
  closeBusinessDay,
  createCustomerVoucher,
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
  OwnerOrder,
  OwnerOverviewStats,
  OwnerVoucher,
  QueueOrder,
  recordOwnerPayment,
  reviewVoucherRequest,
  runEndDay,
  searchCustomerByPhone,
  signInStaff,
  signOutCustomer,
  StaffProfile,
  startBusinessDay,
  subscribeToStaffQueues,
  VoucherRequest,
  voidReceipt,
} from "./repository";
import { OperationalOrderStatus, statusLabel } from "./workflow";
import { OwnerMenuManager } from "./OwnerMenuManager";
import { createClientId } from "./cartDraft";
import { buildDailyReportHtml, buildReceiptPrintHtml, type DailyReportData } from "../receiptPrint";

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
    "overview" | "new_order" | "cashier" | "kitchen" | "customers" | "menu" | "voucher_requests" | "orders_receipts" | "end_day" | "analytics" | "system_status"
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
          {profile?.role === "owner" ? (
            <span className="build-badge" title={`Built: ${typeof __BUILD_TIME__ !== "undefined" ? new Date(__BUILD_TIME__).toLocaleString() : "unknown"}`}>
              {typeof __BUILD_GIT_SHA__ !== "undefined" ? __BUILD_GIT_SHA__ : ""}
            </span>
          ) : null}
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
        {profile?.role === "owner" ? (
          <button
            className={tab === "voucher_requests" ? "active" : ""}
            onClick={() => setTab("voucher_requests")}
            type="button"
          >
            Voucher Requests
          </button>
        ) : null}
        {canOverview ? (
          <button
            className={tab === "orders_receipts" ? "active" : ""}
            onClick={() => setTab("orders_receipts")}
            type="button"
          >
            Orders &amp; Receipts
          </button>
        ) : null}
        {canOverview ? (
          <button
            className={tab === "analytics" ? "active" : ""}
            onClick={() => setTab("analytics")}
            type="button"
          >
            Analytics
          </button>
        ) : null}
        {profile?.role === "owner" ? (
          <button
            className={tab === "end_day" ? "active" : ""}
            onClick={() => setTab("end_day")}
            type="button"
          >
            End of Day
          </button>
        ) : null}
        {profile?.role === "owner" ? (
          <button
            className={tab === "system_status" ? "active" : ""}
            onClick={() => setTab("system_status")}
            type="button"
          >
            System
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
      {tab === "menu" && profile?.role === "owner" ? (
        <OwnerMenuManager />
      ) : null}
      {tab === "voucher_requests" && profile?.role === "owner" ? (
        <OwnerVoucherRequests onError={setMessage} />
      ) : null}
      {tab === "orders_receipts" && canOverview ? (
        <OwnerOrdersReceipts onError={setMessage} userRole={profile?.role || "cashier"} />
      ) : null}
      {tab === "analytics" && canOverview ? (
        <OwnerAnalytics onError={setMessage} />
      ) : null}
      {tab === "end_day" && profile?.role === "owner" ? (
        <OwnerEndDay onError={setMessage} onRefreshQueues={() => profile ? refreshQueues(profile.role) : Promise.resolve()} />
      ) : null}
      {tab === "system_status" && profile?.role === "owner" ? (
        <OwnerSystemStatus />
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

// ═══════════════════════════════════════════════════
// OWNER SYSTEM STATUS
// ═══════════════════════════════════════════════════

type HealthCheck = { label: string; status: "healthy" | "unavailable" | "misconfigured" | "checking"; detail: string };

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

    const apiOrigin = typeof __API_CONFIG__ !== "undefined" ? __API_CONFIG__.baseUrl : "not set";
    results.push({
      label: "API Origin",
      status: apiOrigin && apiOrigin !== "not set" ? "healthy" : "misconfigured",
      detail: apiOrigin || "VITE_API_URL not configured",
    });

    const backendUrl = apiOrigin.replace(/\/api\/?$/, "") || apiOrigin;

    try {
      const resp = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(8000) });
      const data = await resp.json();
      results.push({
        label: "Backend Health",
        status: data.ok ? "healthy" : "unavailable",
        detail: resp.ok ? `Service: ${data.service || "ok"}` : `HTTP ${resp.status}`,
      });
    } catch {
      results.push({ label: "Backend Health", status: "unavailable", detail: "Could not reach backend" });
    }

    try {
      const resp = await fetch(`${backendUrl}/ready`, { signal: AbortSignal.timeout(8000) });
      const data = await resp.json();
      results.push({
        label: "Database",
        status: data.checks?.database?.ok ? "healthy" : "unavailable",
        detail: data.checks?.database?.ok ? `Latency: ${data.checks.database.latencyMs}ms` : "Database check failed",
      });
    } catch {
      results.push({ label: "Database", status: "unavailable", detail: "Could not reach backend" });
    }

    try {
      const resp = await fetch(`${backendUrl}/api/auth/me`, { credentials: "include", signal: AbortSignal.timeout(5000) });
      results.push({
        label: "Session",
        status: resp.status === 401 ? "healthy" : resp.ok ? "healthy" : "unavailable",
        detail: resp.status === 401 ? "Not signed in (expected)" : resp.ok ? "Authenticated" : `HTTP ${resp.status}`,
      });
    } catch {
      results.push({ label: "Session", status: "unavailable", detail: "Could not check" });
    }

    results.push({
      label: "Menu Sync",
      status: "healthy",
      detail: "Backend serves /api/menu",
    });

    setChecks(results);
    setRunning(false);
  }, []);

  useEffect(() => { void runChecks(); }, [runChecks]);

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
        <button className="button-secondary" disabled={running} onClick={() => void runChecks()} type="button">
          {running ? "Checking…" : "Refresh"}
        </button>
      </header>
      <div className="staff-table" style={{ marginTop: "1rem" }}>
        <div className="staff-table-row heading" style={{ gridTemplateColumns: "1fr auto 2fr" }}>
          <span>Component</span><span>Status</span><span>Detail</span>
        </div>
        {checks.map((c) => (
          <div className="staff-table-row" key={c.label} style={{ gridTemplateColumns: "1fr auto 2fr" }}>
            <span><strong>{c.label}</strong></span>
            <span style={{ color: statusColor(c.status), fontWeight: 600 }}>{c.status}</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--joy-text-secondary, #766650)" }}>{c.detail}</span>
          </div>
        ))}
      </div>
    </section>
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
  const [category, setCategory] = useState("All");
  const [menuQuery, setMenuQuery] = useState("");
  useEffect(() => {
    void loadMenu()
      .then(setMenu)
      .catch((error) => setMessage(getMessage(error)));
  }, []);
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menu.map((item) => item.category).filter(Boolean)))],
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
          <nav aria-label="Menu categories" className="category-rail staff-category-rail">
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
            {filteredMenu.map((item) => (
              <button
                disabled={!item.sizes.length}
                key={item.id}
                onClick={() => add(item)}
                type="button"
              >
                <strong>{item.name}</strong>
                {item.description ? <small className="menu-item-desc">{item.description}</small> : null}
                <small className="menu-item-price">
                  {item.sizes[0]
                    ? money.format(item.sizes[0].price)
                    : "Unavailable"}
                </small>
              </button>
            ))}
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
  const [consentFilter, setConsentFilter] = useState<"all" | "subscribed" | "not_subscribed">("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<OwnerVoucher[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherType, setVoucherType] = useState<"fixed" | "percentage">("fixed");
  const [voucherValue, setVoucherValue] = useState("");
  const [voucherDesc, setVoucherDesc] = useState("");
  const [voucherExpiry, setVoucherExpiry] = useState("");
  const [voucherBusy, setVoucherBusy] = useState(false);
  const PAGE_SIZE = 20;
  const canManageVouchers = userRole === "owner";

  const subscribedCount = customers.filter((c) => Boolean(c.marketingConsent)).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return customers.filter((c) => {
      if (consentFilter === "subscribed" && !c.marketingConsent) return false;
      if (consentFilter === "not_subscribed" && c.marketingConsent) return false;
      if (!q) return true;
      return (
        String(c.fullName || "").toLocaleLowerCase().includes(q) ||
        String(c.email || "").toLocaleLowerCase().includes(q) ||
        String(c.phone || "").toLocaleLowerCase().includes(q) ||
        String(c.customerNumber || "").toLocaleLowerCase().includes(q)
      );
    });
  }, [customers, search, consentFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
      <div className="customer-directory-filters">
        <label className="menu-search staff-search" style={{ flex: 1 }}>
          <span className="sr-only">Search customers</span>
          <input
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, email, or phone…"
            type="search"
            value={search}
          />
        </label>
        <div className="category-rail staff-category-rail" style={{ margin: 0 }}>
          {(["all", "subscribed", "not_subscribed"] as const).map((option) => (
            <button
              aria-pressed={consentFilter === option}
              className={consentFilter === option ? "active" : ""}
              key={option}
              onClick={() => { setConsentFilter(option); setPage(1); }}
              type="button"
            >
              {option === "all" ? "All" : option === "subscribed" ? "Subscribed" : "Not subscribed"}
            </button>
          ))}
        </div>
      </div>
      <div className="staff-table">
        <div className="staff-table-row heading">
          <span>Customer</span>
          <span>Orders</span>
          <span>Total Spend</span>
          <span>Last Order</span>
          <span>Consent</span>
          {canManageVouchers ? <span>Actions</span> : null}
        </div>
        {paged.map((customer) => {
          const cid = String(customer.id);
          const isExpanded = expandedId === cid;
          return (
            <div key={cid}>
              <div className={`staff-table-row ${isExpanded ? "expanded" : ""}`}>
                <div>
                  <strong>{String(customer.fullName || "")}</strong>
                  <span className="muted" style={{ fontSize: "0.75rem", display: "block" }}>
                    {String(customer.email || "—")}
                    {customer.phone ? ` · ${String(customer.phone)}` : ""}
                  </span>
                </div>
                <span>
                  <span className="stat-pill">{Number(customer.orderCount || 0)}</span>
                </span>
                <span>{formatCurrency(customer.totalSpend)}</span>
                <span>{timeAgo(customer.lastOrderAt)}</span>
                <span>
                  {customer.marketingConsent ? (
                    <span className="consent-badge subscribed">Subscribed</span>
                  ) : (
                    <span className="consent-badge not-subscribed">Not subscribed</span>
                  )}
                </span>
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
                    <select value={voucherType} onChange={(e) => setVoucherType(e.target.value as "fixed" | "percentage")}>
                      <option value="fixed">Fixed Amount (EGP)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                    <input
                      inputMode="decimal"
                      onChange={(e) => setVoucherValue(e.target.value)}
                      placeholder={voucherType === "fixed" ? "Amount (EGP)" : "Percent (%)"}
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
                    <p className="muted" style={{ padding: "0.75rem" }}>Loading vouchers…</p>
                  ) : vouchers.length ? (
                    <div className="voucher-list">
                      {vouchers.map((v) => {
                        const label = v.description || (v.voucherType === "fixed"
                          ? `${Number(v.fixedValue).toFixed(0)} EGP`
                          : `${Number(v.percentageValue).toFixed(0)}% off`);
                        const isRedeemable = v.status === "active" && (!v.expiresAt || new Date(v.expiresAt) > new Date());
                        const phone = String(customer.phone || "");
                        const waLink = buildWhatsAppVoucherLink(phone, v.voucherCode, v.description, String(customer.fullName || "there"));
                        return (
                          <div className="voucher-card" key={v.id}>
                            <div className="voucher-card-info">
                              <strong>{v.voucherCode}</strong>
                              <span>{label}</span>
                              <span className="muted" style={{ fontSize: "0.75rem" }}>
                                {v.status === "active" ? "Active" : v.status === "redeemed" ? "Redeemed" : v.status}
                                {v.expiresAt ? ` · Expires ${new Date(v.expiresAt).toLocaleDateString()}` : ""}
                              </span>
                            </div>
                            {isRedeemable && phone ? (
                              <a className="compact-menu-btn wa-link" href={waLink} rel="noopener noreferrer" target="_blank">
                                Send via WhatsApp
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted" style={{ padding: "0.75rem" }}>No vouchers yet. Issue one above.</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {!paged.length ? (
          <p className="muted" style={{ padding: "1rem" }}>
            {customers.length ? "No customers match your filters." : "No customers yet."}
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
          <span className="muted">Page {safePage} of {totalPages}</span>
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

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  async function handleReject(requestId: string) {
    setReviewBusy(true);
    try {
      await reviewVoucherRequest({ action: "REJECT", rejectionReason: "Not eligible at this time.", requestId });
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
      const numVal = Number(approveForm.fixedValue || approveForm.percentageValue);
      await reviewVoucherRequest({
        action: "APPROVE",
        description: approveForm.description.trim() || undefined,
        expiresInDays: Number(approveForm.expiresInDays) || undefined,
        fixedValue: approveForm.voucherType === "fixed" ? numVal : undefined,
        percentageValue: approveForm.voucherType === "percentage" ? numVal : undefined,
        requestId,
        voucherType: approveForm.voucherType,
      });
      setShowApproveModal(null);
      setApproveForm({ description: "", expiresInDays: "30", fixedValue: "", percentageValue: "", voucherType: "fixed" });
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
          <p className="muted">{pending.length} pending · {requests.length} total</p>
        </div>
      </div>
      <div className="customer-directory-filters" style={{ marginBottom: "1rem" }}>
        <div className="category-rail staff-category-rail" style={{ margin: 0 }}>
          {["", "PENDING", "APPROVED", "REJECTED", "FULFILLED", "CANCELLED"].map((s) => (
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
          <p className="muted" style={{ fontSize: "0.8125rem" }}>Customer requests will appear here for owner review.</p>
        </div>
      ) : (
        <div className="voucher-request-queue">
          {pending.map((req) => (
            <div className="voucher-request-queue-item" key={req.id}>
              <div className="queue-item-header">
                <div>
                  <strong>{req.customerName}</strong>
                  <span className="muted" style={{ marginLeft: "8px", fontSize: "0.8125rem" }}>{req.customerEmail || "—"}</span>
                </div>
                <span className="request-status pending">Pending</span>
              </div>
              <div className="queue-item-body">
                <div className="queue-item-customer">
                  <span style={{ fontSize: "0.8125rem" }}>Loyalty Points: <strong>{req.loyaltyPoints}</strong></span>
                  <span style={{ fontSize: "0.8125rem" }}>Orders: <strong>{req.orderCount}</strong></span>
                  <span style={{ fontSize: "0.8125rem" }}>Free Rewards: <strong>{req.freeRewards}</strong></span>
                  <span style={{ fontSize: "0.8125rem" }}>Requested: <strong>{req.requestedRewardType || "Any reward"}</strong></span>
                </div>
                <div className="queue-item-meta">
                  {req.requestReason ? (
                    <span className="request-reason" style={{ fontSize: "0.8125rem", color: "var(--joy-text-secondary)" }}>
                      "{req.requestReason}"
                    </span>
                  ) : null}
                  <span style={{ fontSize: "0.75rem", color: "var(--joy-text-tertiary)" }}>
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
            <div className="voucher-request-queue-item" key={req.id} style={{ opacity: 0.7 }}>
              <div className="queue-item-header">
                <div>
                  <strong>{req.customerName}</strong>
                  <span className="muted" style={{ marginLeft: "8px", fontSize: "0.8125rem" }}>{req.customerEmail || "—"}</span>
                </div>
                <span className={`request-status ${req.status.toLowerCase()}`}>{req.status}</span>
              </div>
              <div className="queue-item-body">
                <div className="queue-item-customer">
                  <span style={{ fontSize: "0.8125rem" }}>Requested: <strong>{req.requestedRewardType || "Any reward"}</strong></span>
                  {req.rejectionReason ? (
                    <span style={{ fontSize: "0.8125rem", color: "var(--joy-danger)" }}>Reason: {req.rejectionReason}</span>
                  ) : null}
                  {req.createdVoucherId ? (
                    <span style={{ fontSize: "0.8125rem", color: "var(--joy-success)" }}>Voucher created</span>
                  ) : null}
                </div>
                <div className="queue-item-meta">
                  <span style={{ fontSize: "0.75rem", color: "var(--joy-text-tertiary)" }}>
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
                  onChange={(e) => setApproveForm((f) => ({ ...f, voucherType: e.target.value }))}
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
                    onChange={(e) => setApproveForm((f) => ({ ...f, fixedValue: e.target.value }))}
                    value={approveForm.fixedValue}
                  />
                </label>
              ) : (
                <label>
                  Percentage (%)
                  <input
                    inputMode="decimal"
                    onChange={(e) => setApproveForm((f) => ({ ...f, percentageValue: e.target.value }))}
                    value={approveForm.percentageValue}
                  />
                </label>
              )}
              <label>
                Description (optional)
                <input
                  onChange={(e) => setApproveForm((f) => ({ ...f, description: e.target.value }))}
                  value={approveForm.description}
                />
              </label>
              <label>
                Expires in days
                <input
                  inputMode="numeric"
                  onChange={(e) => setApproveForm((f) => ({ ...f, expiresInDays: e.target.value }))}
                  value={approveForm.expiresInDays}
                />
              </label>
            </div>
            <div className="payment-modal-actions">
              <button className="button-secondary" onClick={() => setShowApproveModal(null)} type="button">Cancel</button>
              <button
                className="button-primary"
                disabled={reviewBusy || (!Number(approveForm.fixedValue) && !Number(approveForm.percentageValue))}
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

type OrdersTab = "all" | "active" | "completed" | "paid" | "unpaid" | "partially_paid";

function OwnerOrdersReceipts({ onError, userRole }: { onError: (msg: string) => void; userRole: string }) {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<OrdersTab>("all");
  const [selectedOrder, setSelectedOrder] = useState<OwnerOrder | null>(null);
  const [payModal, setPayModal] = useState<OwnerOrder | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash_at_cashier");
  const [payBusy, setPayBusy] = useState(false);
  const [voidModal, setVoidModal] = useState<OwnerOrder | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);

  const loadOrders = useCallback(async (p: number, paymentFilter?: string, searchVal?: string) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 50, page: p };
      if (paymentFilter && paymentFilter !== "all") {
        if (paymentFilter === "active") params.status = "pending_confirmation,confirmed,accepted,preparing,ready,picked_up";
        else if (paymentFilter === "completed") params.status = "closed";
        else if (paymentFilter === "paid") params.paymentStatus = "paid";
        else if (paymentFilter === "unpaid") params.paymentStatus = "unpaid";
        else if (paymentFilter === "partially_paid") params.paymentStatus = "partially_paid";
      }
      if (searchVal) params.search = searchVal;
      const result = await loadOwnerOrders(params);
      setOrders(result.orders);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void loadOrders(1, tab, search); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function switchTab(newTab: OrdersTab) {
    setTab(newTab);
    setPage(1);
    await loadOrders(1, newTab, search);
  }

  async function doSearch(val: string) {
    setSearch(val);
    setPage(1);
    await loadOrders(1, tab, val);
  }

  async function recordPayment() {
    if (!payModal || !payAmount) return;
    const amount = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) { onError("Invalid amount."); return; }
    setPayBusy(true);
    try {
      await recordOwnerPayment({ amount, paymentMethod: payMethod, receiptId: payModal.id });
      setPayModal(null);
      setPayAmount("");
      await loadOrders(page, tab, search);
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
      await loadOrders(page, tab, search);
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
      await loadOrders(page, tab, search);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setArchiveBusy(null);
    }
  }

  function printReceipt(order: OwnerOrder) {
    const items = Array.isArray(order.item_summary) ? order.item_summary : [];
    const html = buildReceiptPrintHtml({
      customerName: order.customer_name || order.pickup_name,
      items: items.map((item) => ({ itemName: item.itemName, qty: item.quantity, size: item.size, total: Number(item.totalPrice || 0), unitPrice: Number(item.unitPrice || 0) })),
      notes: order.customer_notes,
      orderDateTime: order.created_at ? new Date(order.created_at).toLocaleString() : "",
      orderPlace: "Joy Corner",
      outstandingAmount: order.remaining_amount,
      paidAmount: order.paid_amount,
      paymentStatus: order.payment_status?.replace(/_/g, " ") || "unpaid",
      receiptNumber: order.order_number,
      staff: order.creator_name || "Joy Corner",
      subtotal: order.subtotal,
      total: order.total,
    });
    const w = window.open("", "_blank", "width=900,height=800");
    if (w) { w.document.write(html); w.document.close(); }
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
      <div className="customer-directory-filters" style={{ marginBottom: "1rem" }}>
        <label className="menu-search staff-search" style={{ flex: 1 }}>
          <span className="sr-only">Search orders</span>
          <input onChange={(e) => void doSearch(e.target.value)} placeholder="Search by receipt #, customer name, phone…" type="search" value={search} />
        </label>
      </div>
      <div className="category-rail staff-category-rail" style={{ margin: "0 0 1rem" }}>
        {(["all", "active", "completed", "paid", "unpaid", "partially_paid"] as const).map((t) => (
          <button aria-pressed={tab === t} className={tab === t ? "active" : ""} key={t} onClick={() => void switchTab(t)} type="button">
            {t === "all" ? "All" : t === "active" ? "Active" : t === "completed" ? "Completed" : t === "paid" ? "Paid" : t === "unpaid" ? "Unpaid" : "Partially Paid"}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="muted">Loading orders…</p>
      ) : !orders.length ? (
        <div className="auth-staff-note"><p>No orders found.</p></div>
      ) : (
        <div className="queue-grid">
          {orders.map((order) => (
            <article className="queue-ticket" key={order.id} onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)} style={{ cursor: "pointer" }}>
              <header>
                <div>
                  <strong>{order.order_number}</strong>
                  <small>{order.customer_name || order.pickup_name}</small>
                </div>
                <div className="queue-statuses">
                  <span className={`status-pill status-${order.status}`}>{statusLabel(order.status as OperationalOrderStatus)}</span>
                  <span className={`payment-badge payment-${order.payment_status}`}>{order.payment_status?.replace(/_/g, " ")}</span>
                </div>
              </header>
              {selectedOrder?.id === order.id ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <dl className="queue-payment-summary">
                    <div><dt>Total</dt><dd>{money.format(order.total)}</dd></div>
                    <div><dt>Paid</dt><dd>{money.format(order.paid_amount)}</dd></div>
                    <div><dt>Remaining</dt><dd>{money.format(order.remaining_amount)}</dd></div>
                  </dl>
                  <ul style={{ fontSize: "0.8125rem", margin: "8px 0" }}>
                    {order.item_summary.map((item, i) => (
                      <li key={i}>{item.quantity} × {item.itemName} · {item.size} — {money.format(item.unitPrice)}/ea</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: "0.8125rem", color: "var(--joy-text-secondary)", marginBottom: 8 }}>
                    {order.created_at && <span>{new Date(order.created_at).toLocaleString()} · </span>}
                    {order.customer_phone && <span>{order.customer_name} — {order.customer_phone} · </span>}
                    {order.creator_name && <span>By: {order.creator_name}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="button-secondary" onClick={() => printReceipt(order)} type="button">Print</button>
                    {order.payment_status !== "paid" && order.status !== "cancelled" && order.status !== "rejected" ? (
                      <button onClick={() => { setPayModal(order); setPayAmount(order.remaining_amount > 0 ? order.remaining_amount.toFixed(2) : ""); }} type="button">
                        Record Payment ({money.format(order.remaining_amount)})
                      </button>
                    ) : null}
                    {userRole === "owner" && order.status !== "cancelled" && order.status !== "rejected" ? (
                      <button className="button-danger" onClick={() => setVoidModal(order)} type="button" style={{ fontSize: "0.8125rem" }}>Void</button>
                    ) : null}
                    {userRole === "owner" && !order.archived ? (
                      <button className="button-secondary" disabled={archiveBusy === order.id} onClick={() => void doArchive(order.id)} type="button" style={{ fontSize: "0.8125rem" }}>
                        {archiveBusy === order.id ? "Archiving…" : "Archive"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {totalPages > 1 ? (
        <div className="customer-directory-pagination">
          <button disabled={page <= 1} onClick={() => { setPage((p) => p - 1); void loadOrders(page - 1, tab, search); }} type="button">Previous</button>
          <span className="muted">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { setPage((p) => p + 1); void loadOrders(page + 1, tab, search); }} type="button">Next</button>
        </div>
      ) : null}
      {payModal ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true">
          <div className="payment-modal">
            <header>
              <p className="eyebrow">Collect Payment</p>
              <h2>{payModal.order_number}</h2>
              <p className="muted">Total: {money.format(payModal.total)} · Paid: {money.format(payModal.paid_amount)} · Remaining: {money.format(payModal.remaining_amount)}</p>
            </header>
            <label>Amount (EGP)
              <input autoFocus inputMode="decimal" min="0.01" onChange={(e) => setPayAmount(e.target.value)} step="0.01" type="number" value={payAmount} />
            </label>
            <label>Method
              <select onChange={(e) => setPayMethod(e.target.value)} value={payMethod}>
                <option value="cash_at_cashier">Cash</option>
                <option value="card_at_branch">Card</option>
                <option value="instapay">InstaPay</option>
                <option value="manual_transfer">Transfer</option>
              </select>
            </label>
            <div className="payment-modal-actions">
              <button className="button-secondary" disabled={payBusy} onClick={() => setPayModal(null)} type="button">Cancel</button>
              <button disabled={payBusy || !payAmount} onClick={() => void recordPayment()} type="button">{payBusy ? "Recording…" : "Record Payment"}</button>
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
            <label>Reason (required)
              <input autoFocus onChange={(e) => setVoidReason(e.target.value)} value={voidReason} />
            </label>
            <div className="payment-modal-actions">
              <button className="button-secondary" disabled={voidBusy} onClick={() => setVoidModal(null)} type="button">Cancel</button>
              <button className="button-danger" disabled={voidBusy || !voidReason.trim()} onClick={() => void doVoid()} type="button">{voidBusy ? "Voiding…" : "Void Receipt"}</button>
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
  const [topProducts, setTopProducts] = useState<Array<{ discount: number; gross_revenue: number; order_count: number; product: string; units_sold: number }>>([]);
  const [categories, setCategories] = useState<Array<{ name: string; qty: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("today");

  const load = useCallback(async (filter: string) => {
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
  }, [onError]);

  useEffect(() => { void load(dateFilter); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="category-rail staff-category-rail" style={{ margin: "0 0 1rem" }}>
        {(["today", "yesterday", "this_week", "this_month"] as const).map((f) => (
          <button aria-pressed={dateFilter === f} className={dateFilter === f ? "active" : ""} key={f} onClick={() => void switchFilter(f)} type="button">
            {f === "today" ? "Today" : f === "yesterday" ? "Yesterday" : f === "this_week" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="muted">Loading analytics…</p>
      ) : stats ? (
        <>
          <div className="staff-metric-grid">
            <div className="kpi-card"><small>Gross Sales</small><strong>{money.format(Number(stats.gross_sales || 0))}</strong></div>
            <div className="kpi-card"><small>Net Sales</small><strong>{money.format(Number(stats.net_sales || 0))}</strong></div>
            <div className="kpi-card"><small>Paid</small><strong>{money.format(Number(stats.paid_amount || 0))}</strong></div>
            <div className="kpi-card"><small>Unpaid</small><strong>{money.format(Number(stats.unpaid_amount || 0))}</strong></div>
            <div className="kpi-card"><small>Receipts</small><strong>{stats.total_receipts || 0}</strong></div>
            <div className="kpi-card"><small>Completed</small><strong>{stats.completed_orders || 0}</strong></div>
            <div className="kpi-card"><small>Active</small><strong>{stats.active_orders || 0}</strong></div>
            <div className="kpi-card"><small>Avg Order</small><strong>{money.format(Number(stats.avg_order_value || 0))}</strong></div>
            <div className="kpi-card"><small>Items Sold</small><strong>{stats.total_items_sold || 0}</strong></div>
            <div className="kpi-card"><small>Customers</small><strong>{stats.unique_customers || 0}</strong></div>
          </div>
          <h3 style={{ marginTop: "1.5rem" }}>Top Products by Quantity</h3>
          {topProducts.length ? (
            <div className="staff-table">
              <div className="staff-table-row heading">
                <span>#</span><span>Product</span><span>Units</span><span>Orders</span><span>Revenue</span>
              </div>
              {topProducts.map((p, i) => (
                <div className="staff-table-row" key={i}>
                  <span>{i + 1}</span>
                  <span><strong>{p.product}</strong></span>
                  <span>{p.units_sold}</span>
                  <span>{p.order_count}</span>
                  <span>{money.format(Number(p.gross_revenue || 0))}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">No sales data for this period.</p>}
          {categories.length ? (
            <>
              <h3 style={{ marginTop: "1.5rem" }}>Popular Categories</h3>
              <div className="staff-table">
                <div className="staff-table-row heading"><span>Category</span><span>Units Sold</span></div>
                {categories.map((c, i) => (
                  <div className="staff-table-row" key={i}>
                    <span><strong>{c.name}</strong></span>
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

function OwnerEndDay({ onError, onRefreshQueues }: { onError: (msg: string) => void; onRefreshQueues: () => Promise<void> }) {
  const [currentDay, setCurrentDay] = useState<BusinessDay | null>(null);
  const [history, setHistory] = useState<BusinessDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [showReport, setShowReport] = useState<Record<string, unknown> | null>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bd, days] = await Promise.all([loadCurrentBusinessDay(), loadBusinessDays()]);
      setCurrentDay(bd);
      setHistory(days);
    } catch (error) {
      onError(getMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (w) { w.document.write(html); w.document.close(); }
  }

  async function printHistoryReport(bdId: string) {
    try {
      const report = await loadBusinessDayReport(bdId);
      const html = buildDailyReportHtml(report as unknown as DailyReportData);
      const w = window.open("", "_blank", "width=900,height=800");
      if (w) { w.document.write(html); w.document.close(); }
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
            <div className="kpi-card"><small>Status</small><strong style={{ color: "var(--joy-success)" }}>OPEN</strong></div>
            <div className="kpi-card"><small>Date</small><strong>{currentDay.business_date}</strong></div>
            <div className="kpi-card"><small>Opened</small><strong>{new Date(currentDay.opened_at).toLocaleTimeString()}</strong></div>
            <div className="kpi-card"><small>Receipts</small><strong>{currentDay.receipt_count}</strong></div>
          </div>
          <div style={{ margin: "1rem 0" }}>
            <button className="button-secondary" disabled={assigning} onClick={() => void handleAssignOrders()} type="button" style={{ marginRight: 8 }}>
              {assigning ? "Assigning…" : "Assign Today's Orders"}
            </button>
          </div>
          <label>
            Closing Note (optional)
            <textarea onChange={(e) => setCloseNotes(e.target.value)} rows={2} value={closeNotes} />
          </label>
          <button disabled={closing} onClick={() => void handleCloseDay()} type="button" style={{ marginTop: 8 }}>
            {closing ? "Closing Business Day…" : "End Business Day"}
          </button>
        </div>
      ) : (
        <div className="staff-overview">
          <p style={{ marginBottom: 16 }}>No business day is currently open.</p>
          <button onClick={() => void handleStartDay()} type="button">Start New Business Day</button>
        </div>
      )}
      {showReport ? (
        <div className="payment-modal-overlay" role="dialog" aria-modal="true">
          <div className="payment-modal" style={{ maxWidth: 600, maxHeight: "80vh", overflow: "auto" }}>
            <header>
              <p className="eyebrow">Daily Report</p>
              <h2>Business Day Closed</h2>
              <p>{String(showReport.business_date || "")}</p>
            </header>
            <div style={{ padding: 16, fontSize: "0.875rem" }}>
              <p><strong>Order Count:</strong> {String(showReport.order_count || 0)}</p>
              <p><strong>Gross Sales:</strong> {money.format(Number(showReport.gross_sales || 0))}</p>
              <p><strong>Paid Amount:</strong> {money.format(Number(showReport.paid_amount || 0))}</p>
              <p><strong>Unpaid:</strong> {money.format(Number(showReport.unpaid_amount || 0))}</p>
              <p><strong>Refunded:</strong> {money.format(Number(showReport.refunded_amount || 0))}</p>
              {showReport.notes ? <p><strong>Notes:</strong> {String(showReport.notes)}</p> : null}
            </div>
            <div className="payment-modal-actions">
              <button className="button-secondary" onClick={() => { printDailyReport(); }} type="button">Print Daily Report</button>
              <button onClick={() => setShowReport(null)} type="button">Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {history.length ? (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>Business Day History</h3>
          <div className="staff-table business-day-history-table">
            <div className="staff-table-row heading">
              <span>Date</span><span>Status</span><span>Receipts</span><span>Gross Sales</span><span>Paid</span><span>Unpaid</span><span></span>
            </div>
            {history.map((bd, idx) => (
              <div key={bd.id}>
                {idx > 0 && bd.status === "CLOSED" && history[idx - 1]?.status === "CLOSED" ? (
                  <div className="business-day-divider" />
                ) : null}
                <div className={`staff-table-row${bd.status === "OPEN" ? " business-day-open" : ""}`}>
                  <span><strong>{bd.business_date}</strong></span>
                  <span><span className={`status-pill status-${bd.status === "OPEN" ? "confirmed" : "closed"}`}>{bd.status}</span></span>
                  <span>{bd.receipt_count}</span>
                  <span>{money.format(Number(bd.gross_sales || 0))}</span>
                  <span>{money.format(Number(bd.paid_amount || 0))}</span>
                  <span>{money.format(Number(bd.unpaid_amount || 0))}</span>
                  <span>
                    {bd.status === "CLOSED" ? (
                      <button className="button-secondary" onClick={() => void printHistoryReport(bd.id)} type="button" style={{ fontSize: "0.75rem", padding: "4px 10px" }}>
                        Print Report
                      </button>
                    ) : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
