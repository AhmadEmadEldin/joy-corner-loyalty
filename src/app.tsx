import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import {
  StaffProfile,
  StaffRole,
  auth,
  firebaseReady,
  signInCustomer,
  signInStaff,
  signUpCustomer,
  signOutStaff,
  watchFirebaseUser,
  watchStaffAuth,
} from "./firebase";

const coffeeBeanFieldUrl = "/assets/coffee-bean-field.jpg";
const joyCultureStripUrl = "/assets/joy-reference-hero.png";
const joyCornerMarkUrl = "/assets/joy-corner-logo.svg";
const joyYourTimeUrl = "/assets/joy-your-time.svg";

const API_BASE_URL = "/api";

type Row = Record<string, unknown>;

type Dashboard = {
  totalCustomers?: number;
  totalOrders?: number;
  totalItems?: number;
  totalSales?: number;
  totalPaid?: number;
  totalUnpaid?: number;
  openReceipts?: number;
  pickedUpReceipts?: number;
  unpaidReceipts?: number;
  rewardsReady?: number;
  totalWinners?: number;
};

type AppData = {
  dashboard?: Dashboard;
  dashboardOrders?: Row[];
  dashboardTopItems?: Row[];
  customers?: Row[];
  orders?: Row[];
  payments?: Row[];
  unpaid?: Row[];
  rewards?: Row[];
  winners?: Row[];
  vouchers?: Row[];
  menu?: Row[];
  lists?: Record<string, string[]>;
  historyDays?: Row[];
  staffProfile?: StaffProfile;
};

type ApiResponse = {
  success?: boolean;
  data?: AppData;
  staff?: StaffProfile;
  message?: string;
};

type ReceiptItem = {
  itemId: string;
  itemName: string;
  category: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
};

type ReceiptPayload = {
  receiptId: string;
  receiptKey: string;
  customerId: string;
  customerName: string;
  orderDateTime: string;
  staff: string;
};

type TabId =
  | "dashboard"
  | "customers"
  | "orders"
  | "rewards"
  | "vouchers"
  | "unpaid"
  | "history"
  | "menu";

const tabs: Array<[TabId, string]> = [
  ["dashboard", "Dashboard"],
  ["customers", "Customers"],
  ["orders", "Orders"],
  ["rewards", "Rewards"],
  ["vouchers", "Vouchers"],
  ["unpaid", "Unpaid"],
  ["history", "History"],
  ["menu", "Menu"],
];

const tabIcons: Record<TabId, string> = {
  customers: "♙",
  dashboard: "⌂",
  history: "↺",
  menu: "☕",
  orders: "▣",
  rewards: "◇",
  unpaid: "▭",
  vouchers: "⌑",
};

export function App() {
  if (window.location.pathname.startsWith("/order")) {
    return <CustomerOrderPage />;
  }

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<AppData | null>(null);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [status, setStatus] = useState("Loading sheet data...");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [autoScroll, setAutoScroll] = useState(false);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [authStatus, setAuthStatus] = useState(
    firebaseReady
      ? "Sign in with your staff account."
      : "Firebase is not configured yet. Use the local owner password to preview the app.",
  );
  const [authLoading, setAuthLoading] = useState(firebaseReady);

  const currentRole = staffProfile?.role || "barista";
  const visibleTabs = useMemo(() => tabsForRole(currentRole), [currentRole]);
  const connectedData = useMemo(() => ensureConnectedData(data), [data]);
  const customers = connectedData.customers || [];
  const menu = connectedData.menu || [];
  const lists = connectedData.lists || {};
  const dashboardOrders = (connectedData.dashboardOrders || [])
    .map((order) => enrichOrderCustomerPhone(order, customers))
    .slice()
    .sort((left, right) => {
      return (
        Number(isPickedUp(left.orderStatus)) - Number(isPickedUp(right.orderStatus)) ||
        compareRecentOrders(left, right)
      );
    });

  useEffect(() => {
    if (!firebaseReady) return undefined;

    return watchStaffAuth(
      (session) => {
        setStaffProfile(session?.profile || null);
        setAuthLoading(false);
        if (session?.profile) {
          setAuthStatus(`Signed in as ${session.profile.displayName || session.profile.email}.`);
        }
      },
      (message) => {
        setAuthStatus(message);
        setAuthLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!staffProfile) return;
    void loadData();
  }, [staffProfile?.uid]);

  useEffect(() => {
    if (!visibleTabs.some(([id]) => id === activeTab)) {
      setActiveTab(visibleTabs[0]?.[0] || "dashboard");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!autoScroll || activeTab !== "dashboard") return undefined;

    const timer = window.setInterval(() => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const nextScroll = window.scrollY + Math.round(window.innerHeight * 0.7);
      window.scrollTo({
        behavior: "smooth",
        top: nextScroll >= maxScroll - 20 ? 0 : nextScroll,
      });
    }, 7000);

    return () => window.clearInterval(timer);
  }, [activeTab, autoScroll]);

  async function loadData(options: { silent?: boolean } = {}) {
    if (!options.silent) setStatus("Loading sheet data...");

    try {
      setLoading(true);
      const response = await callServer("appData");
      const nextData = response.data || response;
      const connected = ensureConnectedData(nextData);
      const liveStaffProfile = response.staff || connected.staffProfile;
      setData(connected);
      if (liveStaffProfile) {
        setStaffProfile((current) =>
          current
            ? {
                ...current,
                ...liveStaffProfile,
                uid: liveStaffProfile.uid || current.uid,
              }
            : liveStaffProfile || current,
        );
      }
      if (!options.silent) {
        setStatus(`Loaded ${new Date().toLocaleString()} | ${dataSummary(connected)}`);
      }
    } catch (error) {
      console.error("Failed to load app data", error);
      setStatus(
        data
          ? `${errorMessage(error)} Keeping the last loaded sheet data.`
          : errorMessage(error),
      );
    } finally {
      setLoading(false);
    }
  }

  async function callAndReload(
    action: string,
    payload: Record<string, unknown>,
    message: string,
  ) {
    if (!canRunAction(currentRole, action)) {
      setStatus("This account does not have permission for that action.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Saving...");
      const response = await callServer(action, payload);
      const nextData = ensureConnectedData(response.data || response);
      setData(nextData);
      setStatus(`${message} ${dataSummary(nextData)}`);
    } catch (error) {
      console.error(`Action ${action} failed`, error);
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function setFilter(id: string, value: string) {
    setFilters((current) => ({ ...current, [id]: value }));
  }

  function filteredRows(rows: Row[] = [], id: string) {
    const query = (filters[id] || "").trim().toLowerCase();
    if (!query) return rows;
    if (query === "__unpaid") {
      return rows.filter((row) => numberValue(row.outstandingAmount) > 0 || stringValue(row.paymentStatus).toLowerCase() === "unpaid");
    }
    if (query === "__paid") {
      return rows.filter((row) => numberValue(row.outstandingAmount) <= 0 && stringValue(row.paymentStatus).toLowerCase() === "paid");
    }
    return rows.filter((row) => rowSearchText(row).includes(query));
  }

  function addReceiptItemFromForm(form: HTMLFormElement) {
    const itemId = stringValue(form.elements.namedItem("itemId"));
    const selectedItem = menu.find((item) => stringValue(item.itemId) === itemId);

    if (!selectedItem) {
      setStatus("Choose a menu item first.");
      return;
    }

    const qty = numberValue(form.elements.namedItem("qty")) || 1;
    const unitPrice =
      numberValue(form.elements.namedItem("unitPrice")) ||
      numberValue(selectedItem.suggestedPrice) ||
      firstPrice(menuPrice(selectedItem));
    const discount = numberValue(form.elements.namedItem("discount"));
    const total = Math.max(0, qty * unitPrice - discount);

    setReceiptItems((items) => [
      {
        itemId,
        itemName: menuName(selectedItem),
        category: stringValue(selectedItem.category),
        qty,
        unitPrice,
        discount,
        total,
      },
      ...items,
    ]);
    setStatus(`${menuName(selectedItem)} added to receipt.`);
  }

  async function submitReceipt(form: HTMLFormElement) {
    let items = receiptItems;
    if (!items.length) {
      addReceiptItemFromForm(form);
      items = receiptItems;
    }

    if (!items.length) return;

    const customerId = stringValue(form.elements.namedItem("customerId"));
    const customer = customers.find(
      (row) => customerIdOf(row) === customerId,
    );
    const payload = formObject(form);
    payload.customerName =
      customerName(customer) ||
      stringValue(payload.customerName);
    payload.phone = phoneOf(customer) || stringValue(payload.customerPhone || payload.phone);
    payload.items = items;
    payload.orderPlace = composeServicePlace(payload);
    delete payload.customerSearch;
    delete payload.serviceType;
    delete payload.carName;
    delete payload.carColor;

    await callAndReload("addReceipt", payload, "Receipt submitted.");
    setReceiptItems([]);
    form.reset();
  }

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await callAndReload("addCustomer", formObject(form), "Customer added.");
    form.reset();
  }

  async function removeCustomer(row: Row) {
    const id = customerIdOf(row);
    if (!id) {
      setStatus("Customer ID is required before removing a customer.");
      return;
    }

    const confirmed = window.confirm(
      `Remove ${customerName(row)} from the Customers sheet? Existing order history stays saved.`,
    );
    if (!confirmed) return;

    await callAndReload(
      "removeCustomer",
      { customerId: id },
      "Customer removed from the sheet.",
    );
  }

  async function generateVoucher(row: Row) {
    await callAndReload(
      "generateVoucher",
      {
        customerId: customerIdOf(row),
        customerName: customerName(row),
        phone: phoneOf(row),
        favoriteDrink: favoriteDrink(row),
      },
      "Voucher generated.",
    );
  }

  async function redeemVoucher(voucherCode: string) {
    await callAndReload("redeemVoucher", { voucherCode }, "Voucher redeemed.");
  }

  async function collectUnpaid(row: Row) {
    const amount = window.prompt(
      `Collect payment for ${customerName(row) || stringValue(row.customerId)}`,
      stringValue(row.unpaidBalance || "0"),
    );

    if (amount === null) return;

    await callAndReload(
      "collectUnpaidPayment",
      {
        customerId: customerIdOf(row),
        customerName: customerName(row),
        amount,
        method: "Cash",
        collectedBy: "Cashier 1",
      },
      "Unpaid payment collected.",
    );
  }

  async function setReceiptPayment(encodedPayload: string, paymentStatus: string) {
    const payload = receiptPayloadFrom(encodedPayload);
    await callAndReload(
      "updateReceiptPayment",
      { ...payload, paymentStatus },
      `Receipt marked ${paymentStatus}.`,
    );
  }

  async function markReceiptDone(encodedPayload: string) {
    await callAndReload(
      "markReceiptDone",
      receiptPayloadFrom(encodedPayload),
      "Receipt marked picked up.",
    );
  }

  async function resetDay() {
    await callAndReload("resetDay", {}, "Day archived and dashboard reset.");
  }

  async function submitAuthForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formObject(form);
    const email = stringValue(payload.email);
    const password = stringValue(payload.password);

    try {
      setAuthLoading(true);
      setAuthStatus("Signing in...");

      if (!firebaseReady) {
        throw new Error("Firebase web config is missing. Add the VITE_FIREBASE_* variables.");
      }

      const profile = await signInStaff(email, password);
      setStaffProfile(profile);
      setAuthStatus(`Signed in as ${profile.displayName || profile.email}.`);
      form.reset();
    } catch (error) {
      setAuthStatus(errorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await signOutStaff();
    setData(null);
    setStaffProfile(null);
    setStatus("Signed out.");
    setAuthStatus(
      firebaseReady
        ? "Sign in with your staff account."
        : "Firebase web config is missing.",
    );
  }

  const appStyle = {
    "--coffee-field-image": `url(${coffeeBeanFieldUrl})`,
    "--joy-culture-strip": `url(${joyCultureStripUrl})`,
    "--joy-your-time": `url(${joyYourTimeUrl})`,
  } as CSSProperties;

  if (!staffProfile) {
    return (
      <AuthScreen
        authLoading={authLoading}
        authStatus={authStatus}
        onSubmit={submitAuthForm}
      />
    );
  }

  return (
    <div className="app-shell" style={appStyle}>
      <header>
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <img alt="" src={joyCornerMarkUrl} />
            </div>
            <div>
              <h1>Joy Corner Loyalty</h1>
              <p className="muted">Standalone staff web app connected to Google Sheets</p>
            </div>
          </div>
          <img className="joy-time-signature" alt="" src={joyYourTimeUrl} />
          <div className="account-chip">
            <span>{staffProfile.displayName || staffProfile.email}</span>
            <strong>{roleLabel(staffProfile.role)}</strong>
            <button onClick={() => void handleSignOut()} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="toolbar">
          <p className="status">{status}</p>
          <div className="toolbar-actions">
            <button
              className={autoScroll ? "primary" : "secondary"}
              onClick={() => setAutoScroll((value) => !value)}
              type="button"
            >
              Auto Scroll
            </button>
            <button
              className="secondary"
              disabled={loading}
              onClick={() => void loadData()}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="brand-ribbon" aria-hidden="true" />

        <nav className="section-nav" aria-label="App sections">
          {visibleTabs.map(([id, label]) => (
            <button
              className={`tab-button ${activeTab === id ? "active" : ""}`}
              data-icon={tabIcons[id]}
              key={id}
              onClick={() => setActiveTab(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "dashboard" && (
          <DashboardView
            dashboard={connectedData.dashboard || {}}
            orders={filteredRows(dashboardOrders, "dashboardOrders").slice(0, 12)}
            topItems={filteredRows(connectedData.dashboardTopItems || [], "topItems")}
            role={currentRole}
            onFilter={setFilter}
            filters={filters}
            onSetPayment={(payload, paymentStatus) =>
              void setReceiptPayment(payload, paymentStatus)
            }
            onDone={(payload) => void markReceiptDone(payload)}
          />
        )}

        {activeTab === "customers" && (
          <CustomersView
            customers={filteredRows(customers, "customers")}
            onAddCustomer={addCustomer}
            onFilter={setFilter}
            onRemoveCustomer={(row) => void removeCustomer(row)}
            filters={filters}
            role={currentRole}
          />
        )}

        {activeTab === "orders" && (
          <OrdersView
            customers={customers}
            dashboardOrders={filteredRows(dashboardOrders, "orders")}
            lists={lists}
            menu={menu}
            receiptItems={receiptItems}
            onAddItem={addReceiptItemFromForm}
            onClearReceipt={() => setReceiptItems([])}
            onFilter={setFilter}
            filters={filters}
            onRemoveItem={(index) =>
              setReceiptItems((items) => items.filter((_, itemIndex) => itemIndex !== index))
            }
            onSetPayment={(payload, paymentStatus) =>
              void setReceiptPayment(payload, paymentStatus)
            }
            onDone={(payload) => void markReceiptDone(payload)}
            role={currentRole}
            onSubmitReceipt={submitReceipt}
          />
        )}

        {activeTab === "rewards" && (
          <RewardsView
            rewards={filteredRows(connectedData.rewards || [], "rewards")}
            winners={filteredRows(connectedData.winners || [], "winners")}
            onFilter={setFilter}
            filters={filters}
            onGenerateVoucher={(row) => void generateVoucher(row)}
          />
        )}

        {activeTab === "vouchers" && (
          <VouchersView
            vouchers={filteredRows(connectedData.vouchers || [], "vouchers")}
            onFilter={setFilter}
            filters={filters}
            onRedeem={(code) => void redeemVoucher(code)}
          />
        )}

        {activeTab === "unpaid" && (
          <UnpaidView
            unpaid={filteredRows(connectedData.unpaid || [], "unpaid")}
            onCollect={(row) => void collectUnpaid(row)}
            onFilter={setFilter}
            filters={filters}
          />
        )}

        {activeTab === "history" && (
          <HistoryView
            days={filteredRows(connectedData.historyDays || [], "history")}
            filters={filters}
            onFilter={setFilter}
          />
        )}

        {activeTab === "menu" && (
          <MenuView
            menu={filteredRows(menu, "menu")}
            onFilter={setFilter}
            filters={filters}
          />
        )}

        {currentRole === "owner" && <OwnerTools onResetDay={() => void resetDay()} />}

        <div className="scroll-dock">
          <button
            aria-label="Scroll to top"
            onClick={() => window.scrollTo({ behavior: "smooth", top: 0 })}
            type="button"
          >
            Top
          </button>
          <button
            aria-label="Scroll to bottom"
            onClick={() =>
              window.scrollTo({
                behavior: "smooth",
                top: document.documentElement.scrollHeight,
              })
            }
            type="button"
          >
            Bottom
          </button>
        </div>
      </main>
    </div>
  );
}

function AuthScreen({
  authLoading,
  authStatus,
  onSubmit,
}: {
  authLoading: boolean;
  authStatus: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="auth-shell"
      style={
        {
          "--coffee-field-image": `url(${coffeeBeanFieldUrl})`,
          "--joy-culture-strip": `url(${joyCultureStripUrl})`,
          "--joy-your-time": `url(${joyYourTimeUrl})`,
        } as CSSProperties
      }
    >
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <img alt="" src={joyCornerMarkUrl} />
          </div>
          <div>
            <h1>Joy Corner Loyalty</h1>
            <p className="muted">Staff sign-in for the Google Sheets app</p>
          </div>
        </div>
        <img className="auth-signature" alt="" src={joyYourTimeUrl} />
        <form className="auth-form" onSubmit={onSubmit}>
          <Field label="Owner Email" name="email" placeholder="owner@joycorner.com" required type="email" />
          <Field label="Password" name="password" placeholder="At least 6 characters" required type="password" />
          <button className="primary" disabled={authLoading} type="submit">
            Sign In
          </button>
        </form>
        <p className="status">{authStatus}</p>
        {firebaseReady ? (
          <div className="muted auth-note">
            <p>
              Firebase sign-in is configured. The backend allows only emails
              with an active Firestore staff profile.
            </p>
          </div>
        ) : (
          <div className="muted auth-note">
            <p>Firebase web config is missing. Add the required Netlify environment variables.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function CustomerOrderPage() {
  const [customerUser, setCustomerUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [status, setStatus] = useState(
    firebaseReady
      ? "Create an account or sign in to request an order."
      : "Firebase web config is missing.",
  );
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<Row[]>([]);

  useEffect(() => {
    return watchFirebaseUser(
      (user) => setCustomerUser(user),
      (message) => setStatus(message),
    );
  }, []);

  useEffect(() => {
    if (!customerUser) return;
    void loadCustomerMenu();
  }, [customerUser?.uid]);

  async function loadCustomerMenu() {
    try {
      setLoading(true);
      const response = await callServer("customerMenu");
      setMenu(response.data?.menu || response.menu || []);
      setStatus("Choose an item and send your request.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitCustomerAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formObject(form);
    const email = stringValue(payload.email);
    const password = stringValue(payload.password);

    try {
      setLoading(true);
      setStatus(authMode === "signup" ? "Creating account..." : "Signing in...");
      if (authMode === "signup") {
        await signUpCustomer(email, password);
      } else {
        await signInCustomer(email, password);
      }
      form.reset();
      setStatus("Signed in. Loading menu...");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitCustomerOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formObject(form);
    const item = menu.find((row) => stringValue(row.itemId) === stringValue(payload.itemId));

    if (item) {
      payload.itemName = menuName(item);
      payload.category = stringValue(item.category);
      payload.unitPrice = numberValue(item.suggestedPrice) || firstPrice(menuPrice(item));
    }

    try {
      setLoading(true);
      setStatus("Sending order request...");
      const response = await callServer("submitCustomerOrder", payload);
      setStatus(response.message || "Order request sent to Joy Corner.");
      form.reset();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const appStyle = {
    "--coffee-field-image": `url(${coffeeBeanFieldUrl})`,
    "--joy-culture-strip": `url(${joyCultureStripUrl})`,
    "--joy-your-time": `url(${joyYourTimeUrl})`,
  } as CSSProperties;

  return (
    <div className="app-shell customer-order-shell" style={appStyle}>
      <header>
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <img alt="" src={joyCornerMarkUrl} />
            </div>
            <div>
              <h1>Joy Corner</h1>
              <p className="muted">Customer order request</p>
            </div>
          </div>
          <img className="joy-time-signature" alt="" src={joyYourTimeUrl} />
          {customerUser && (
            <div className="account-chip">
              <span>{customerUser.email}</span>
              <button onClick={() => void signOutStaff()} type="button">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="customer-order-main">
        <section className="panel customer-order-panel">
          <PanelHead
            title={customerUser ? "Request an Order" : "Customer Access"}
            note={customerUser ? "Your request goes to the cafe staff dashboard" : "Sign up or sign in"}
          />
          <div className="panel-body">
            {!customerUser ? (
              <form className="auth-form customer-order-form" onSubmit={submitCustomerAuth}>
                <div className="segmented">
                  <button
                    className={authMode === "signup" ? "primary" : "secondary"}
                    onClick={() => setAuthMode("signup")}
                    type="button"
                  >
                    Sign Up
                  </button>
                  <button
                    className={authMode === "signin" ? "primary" : "secondary"}
                    onClick={() => setAuthMode("signin")}
                    type="button"
                  >
                    Sign In
                  </button>
                </div>
                <Field label="Email" name="email" placeholder="you@example.com" required type="email" />
                <Field label="Password" name="password" placeholder="At least 6 characters" required type="password" />
                <button className="primary" disabled={loading || !firebaseReady} type="submit">
                  Continue
                </button>
              </form>
            ) : (
              <form className="customer-order-form" onSubmit={submitCustomerOrder}>
                <Field label="Your Name" name="customerName" placeholder="Name for the order" required />
                <Field label="Phone / WhatsApp" name="phone" placeholder="01xxxxxxxxx" required />
                <label>
                  Item
                  <select name="itemId" required>
                    <option value="">Choose from menu</option>
                    {menu.map((item) => (
                      <option key={stringValue(item.itemId)} value={stringValue(item.itemId)}>
                        {menuName(item)} - {money(numberValue(item.suggestedPrice) || firstPrice(menuPrice(item)))} EGP
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input defaultValue="1" min="1" name="qty" required type="number" />
                </label>
                <Field label="Pickup / Table / Notes" name="orderPlace" placeholder="Pickup, table, car, or note" />
                <label>
                  Extra Notes
                  <textarea name="notes" placeholder="Sugar, ice, timing, or anything helpful" />
                </label>
                <button className="primary" disabled={loading || !menu.length} type="submit">
                  Send Request
                </button>
              </form>
            )}
            <p className="status">{status}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function OwnerTools({ onResetDay }: { onResetDay: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const canReset = confirmation === "RESET JOY CORNER DAY";

  return (
    <section className="panel owner-tools">
      <PanelHead title="Owner Controls" note="Danger zone" />
      <div className="panel-body owner-tools-body">
        <div>
          <h3>End Day / Reset</h3>
          <p className="muted">
            Only owner accounts can see this area. Before connecting a destructive
            backend reset, archive the day first so customer history and reward
            counts stay safe.
          </p>
        </div>
        <label>
          Confirmation
          <input
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Type RESET JOY CORNER DAY"
            value={confirmation}
          />
        </label>
        <button
          className="danger"
          disabled={!canReset}
          onClick={() => {
            const confirmed = window.confirm(
              "Archive today's sales and reset the live dashboard? Customer history and rewards stay in the sheet.",
            );
            if (confirmed) onResetDay();
          }}
          type="button"
        >
          End Day Reset
        </button>
      </div>
    </section>
  );
}

function DashboardView({
  dashboard,
  orders,
  topItems,
  filters,
  role,
  onFilter,
  onSetPayment,
  onDone,
}: {
  dashboard: Dashboard;
  orders: Row[];
  topItems: Row[];
  filters: Record<string, string>;
  role: StaffRole;
  onFilter: (id: string, value: string) => void;
  onSetPayment: (payload: string, paymentStatus: string) => void;
  onDone: (payload: string) => void;
}) {
  const isBarista = role === "barista";

  return (
    <>
      {!isBarista && (
        <div className="grid stats">
          <Stat label="Customers" value={dashboard.totalCustomers} />
          <Stat label="Receipts" value={dashboard.totalOrders} />
          <Stat label="Items" value={dashboard.totalItems} />
          <Stat label="Sales" value={money(dashboard.totalSales)} />
          <Stat label="Paid" value={money(dashboard.totalPaid)} />
          <Stat label="Unpaid" value={money(dashboard.totalUnpaid)} />
          <Stat label="Picked Up" value={dashboard.pickedUpReceipts} />
          <Stat label="Winners" value={dashboard.totalWinners} />
        </div>
      )}

      <div className={isBarista ? "dashboard-grid single" : "dashboard-grid"}>
        <section className="panel">
          <PanelHead title="Barista Pickup Board" note={`${orders.length} receipt(s)`} />
          <FilterBar
            id="dashboardOrders"
            placeholder="Filter order board"
            value={filters.dashboardOrders}
            onChange={onFilter}
            quickFilters={
              isBarista
                ? [
                    ["", "All"],
                    ["__unpaid", "Unpaid"],
                    ["__paid", "Paid"],
                  ]
                : [
                    ["", "All"],
                    ["__unpaid", "Unpaid"],
                    ["__paid", "Paid"],
                  ]
            }
          />
          {orders.length ? (
            <div className="receipt-board">
              {orders.map((order, index) => (
                <OrderTicket
                  key={`${stringValue(order.receiptId)}-${index}`}
                  order={order}
                  onDone={onDone}
                  onSetPayment={onSetPayment}
                  showPaymentActions={false}
                  showPickupAction
                  showPickupStrike
                />
              ))}
            </div>
          ) : (
            <div className="panel-empty">No recent orders yet.</div>
          )}
        </section>

        {!isBarista && (
          <section className="panel">
            <PanelHead title="Top Drinks" note="Highest ordered" />
            <FilterBar
              id="topItems"
              placeholder="Filter best sellers"
              value={filters.topItems}
              onChange={onFilter}
            />
            {topItems.length ? (
              <div className="stock-list">
                {topItems.map((item, index) => (
                  <StockCard item={item} key={`${stringValue(item.itemName)}-${index}`} />
                ))}
              </div>
            ) : (
              <div className="panel-empty">No sales to rank yet.</div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function CustomersView({
  customers,
  filters,
  onAddCustomer,
  onFilter,
  onRemoveCustomer,
  role,
}: {
  customers: Row[];
  filters: Record<string, string>;
  onAddCustomer: (event: FormEvent<HTMLFormElement>) => void;
  onFilter: (id: string, value: string) => void;
  onRemoveCustomer: (row: Row) => void;
  role: StaffRole;
}) {
  const canRemoveCustomers = role === "owner" || role === "cashier";

  return (
    <>
      <section className="panel">
        <PanelHead title="Add Customer" />
        <div className="panel-body">
          <form className="form-grid" onSubmit={onAddCustomer}>
            <Field label="Full Name" name="fullName" required />
            <Field label="Phone/WhatsApp" name="phone" required type="tel" />
            <Field label="Favorite Drink" name="favoriteDrink" />
            <Field label="Birthday" name="birthday" type="date" />
            <label className="wide">
              Notes
              <textarea name="notes" />
            </label>
            <div>
              <button className="primary" type="submit">
                Add Customer
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <PanelHead title="Customers" />
        <FilterBar
          id="customers"
          placeholder="Filter customers"
          value={filters.customers}
          onChange={onFilter}
        />
        <DataTable
          action={
            canRemoveCustomers
              ? (row) => (
                  <button
                    className="danger"
                    onClick={() => onRemoveCustomer(row)}
                    type="button"
                  >
                    Remove
                  </button>
                )
              : undefined
          }
          columns={[
            ["customerId", "ID"],
            ["fullName", "Name"],
            ["phoneWhatsApp", "Phone"],
            ["favoriteDrink", "Favorite"],
            ["joinDate", "Joined"],
            ["lastVisit", "Last Visit"],
            ["totalOrders", "Orders"],
            ["totalSpent", "Spent"],
            ["unpaidBalance", "Unpaid"],
            ["freeDrinksReady", "Free Drinks"],
          ]}
          rows={customers}
        />
      </section>
    </>
  );
}

function OrdersView({
  customers,
  dashboardOrders,
  filters,
  lists,
  menu,
  receiptItems,
  onAddItem,
  onClearReceipt,
  onDone,
  onFilter,
  onRemoveItem,
  onSetPayment,
  onSubmitReceipt,
  role,
}: {
  customers: Row[];
  dashboardOrders: Row[];
  filters: Record<string, string>;
  lists: Record<string, string[]>;
  menu: Row[];
  receiptItems: ReceiptItem[];
  onAddItem: (form: HTMLFormElement) => void;
  onClearReceipt: () => void;
  onDone: (payload: string) => void;
  onFilter: (id: string, value: string) => void;
  onRemoveItem: (index: number) => void;
  onSetPayment: (payload: string, paymentStatus: string) => void;
  onSubmitReceipt: (form: HTMLFormElement) => Promise<void>;
  role: StaffRole;
}) {
  const [category, setCategory] = useState("All");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [customerPhoneInput, setCustomerPhoneInput] = useState("");
  const categories = ["All", ...new Set(menu.map((item) => stringValue(item.category)).filter(Boolean))];
  const placeOptions = buildPlaceOptions(lists, dashboardOrders);
  const serviceOptions = lists.serviceType || ["Hall", "Outside", "Car", "Takeaway"];
  const carColorOptions = lists.carColor || ["Black", "White", "Silver", "Gray", "Red", "Blue"];
  const visibleCustomers = useMemo(
    () => filterCustomersByNameOrPhone(customers, customerQuery),
    [customers, customerQuery],
  );
  const customerMatches = customerQuery.trim()
    ? visibleCustomers.slice(0, 5)
    : [];
  const visibleMenu =
    category === "All"
      ? menu
      : menu.filter((item) => stringValue(item.category) === category);
  const selectedItem =
    menu.find((item) => stringValue(item.itemId) === selectedItemId) ||
    visibleMenu[0];
  const receiptTotal = receiptItems.reduce((total, item) => total + item.total, 0);
  const singleTotal = Math.max(0, numberValue(qty) * numberValue(unitPrice) - numberValue(discount));
  const total = receiptItems.length ? receiptTotal : singleTotal;
  const remaining = Math.max(0, total - numberValue(paidAmount));

  useEffect(() => {
    if (!selectedItem && visibleMenu[0]) {
      setSelectedItemId(stringValue(visibleMenu[0].itemId));
      return;
    }
    if (selectedItem) {
      const price = stringValue(selectedItem.suggestedPrice) || String(firstPrice(menuPrice(selectedItem)) || "");
      setUnitPrice(price);
      setSelectedItemId(stringValue(selectedItem.itemId));
    }
  }, [category, selectedItemId, menu.length]);

  useEffect(() => {
    if (paymentStatus === "Paid") setPaidAmount(total ? String(total) : "");
    if (paymentStatus === "Unpaid") setPaidAmount("");
  }, [paymentStatus, total]);

  useEffect(() => {
    const queryDigits = digitsOnly(customerQuery);
    const normalizedQuery = customerQuery.trim().toLowerCase();
    if (!queryDigits && normalizedQuery.length < 2) return;

    const exactCustomer = customers.find((customer) => {
      const phoneDigits = digitsOnly(phoneOf(customer));
      const name = customerName(customer).toLowerCase();
      return (
        (queryDigits.length >= 7 && phoneDigits && phoneDigits.endsWith(queryDigits)) ||
        (normalizedQuery.length >= 2 && name === normalizedQuery)
      );
    });

    if (exactCustomer) {
      fillCustomer(exactCustomer);
      return;
    }

    const onlyVisibleCustomer = visibleCustomers[0];
    if (onlyVisibleCustomer && visibleCustomers.length === 1 && normalizedQuery.length >= 3) {
      fillCustomer(onlyVisibleCustomer);
      return;
    }

    if (queryDigits.length >= 7) {
      setSelectedCustomerId("");
      setCustomerPhoneInput(customerQuery);
    }
  }, [customerQuery, customers, visibleCustomers]);

  function fillCustomer(customer: Row) {
    setSelectedCustomerId(customerIdOf(customer));
    setCustomerNameInput(customerName(customer));
    setCustomerPhoneInput(phoneOf(customer));
  }

  function chooseCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    const customer = customers.find((row) => customerIdOf(row) === customerId);
    if (customer) {
      fillCustomer(customer);
      return;
    }

    setCustomerNameInput("");
    setCustomerPhoneInput(customerQuery);
  }

  return (
    <>
      <section className="panel">
        <PanelHead title="Waiter New Receipt" note={`${receiptItems.length} item(s)`} />
        <div className="panel-body">
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              void onSubmitReceipt(form).then(() => {
                setSelectedCustomerId("");
                setCustomerQuery("");
                setCustomerNameInput("");
                setCustomerPhoneInput("");
              });
            }}
          >
            <Field
              label="Find Customer"
              name="customerSearch"
              onChange={setCustomerQuery}
              placeholder="Search name or phone"
              value={customerQuery}
            />
            <label>
              Customer
              <select
                name="customerId"
                onChange={(event) => chooseCustomer(event.target.value)}
                value={selectedCustomerId}
              >
                <option value="">New customer / walk-in</option>
                {visibleCustomers.map((customer) => (
                  <option key={customerIdOf(customer)} value={customerIdOf(customer)}>
                    {customerName(customer)}{phoneOf(customer) ? ` - ${phoneOf(customer)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Customer Name"
              name="customerName"
              onChange={setCustomerNameInput}
              placeholder="New customer name"
              value={customerNameInput}
            />
            <Field
              label="Phone/WhatsApp"
              name="customerPhone"
              onChange={setCustomerPhoneInput}
              placeholder="010..."
              type="tel"
              value={customerPhoneInput}
            />
            {customerMatches.length > 0 && (
              <div className="customer-match-list wide" aria-label="Customer matches">
                {customerMatches.map((customer) => (
                  <button
                    className={`customer-match ${selectedCustomerId === customerIdOf(customer) ? "active" : ""}`}
                    key={customerIdOf(customer)}
                    onClick={() => fillCustomer(customer)}
                    type="button"
                  >
                    <strong>{customerName(customer)}</strong>
                    <span>{phoneOf(customer) || "No phone"}</span>
                  </button>
                ))}
              </div>
            )}
            <label>
              Category
              <select
                name="menuCategory"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Menu Item
              <select
                name="itemId"
                onChange={(event) => setSelectedItemId(event.target.value)}
                required
                value={selectedItemId}
              >
                {visibleMenu.map((item) => (
                  <option key={stringValue(item.itemId)} value={stringValue(item.itemId)}>
                    {menuName(item)}{menuPrice(item) ? ` - ${menuPrice(item)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Qty" name="qty" onChange={setQty} required type="number" value={qty} />
            <Field label="Unit Price" name="unitPrice" onChange={setUnitPrice} type="number" value={unitPrice} />
            <Field label="Discount" name="discount" onChange={setDiscount} type="number" value={discount} />
            <Field
              label="Place Detail"
              list="orderPlaceOptions"
              name="orderPlace"
              placeholder="Table 4, Garden, Gate"
            />
            <datalist id="orderPlaceOptions">
              {placeOptions.map((place) => (
                <option key={place} value={place} />
              ))}
            </datalist>
            <label>
              Service Type
              <select name="serviceType">
                {serviceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Car Name" list="carNameOptions" name="carName" placeholder="Toyota, BMW, Hyundai" />
            <datalist id="carNameOptions">
              {["Toyota", "Hyundai", "Kia", "Mercedes", "BMW", "Nissan", "Chevrolet"].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Field label="Car Color" list="carColorOptions" name="carColor" placeholder="Black, White, Silver" />
            <datalist id="carColorOptions">
              {carColorOptions.map((color) => (
                <option key={color} value={color} />
              ))}
            </datalist>
            <label>
              Payment Status
              <select
                name="paymentStatus"
                onChange={(event) => setPaymentStatus(event.target.value)}
                value={paymentStatus}
              >
                {(lists.paymentStatus || ["Paid", "Unpaid", "Partial"]).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Paid Amount" name="paidAmount" onChange={setPaidAmount} type="number" value={paidAmount} />
            <label>
              Payment Method
              <select name="paymentMethod">
                {(lists.paymentMethod || ["Cash", "Visa", "Wallet"]).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Staff
              <select name="staff">
                {(lists.staff || ["Cashier 1"]).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <p className="wide muted">
              {selectedItem
                ? `${stringValue(selectedItem.category) || "Menu"} | ${menuPrice(selectedItem) || "No price"}`
                : "No menu item selected."}
            </p>
            <p className="wide total-hint">
              Receipt total: {money(total)} EGP | Paid now: {money(paidAmount)} EGP | Remaining: {money(remaining)} EGP
            </p>
            <label className="wide">
              Notes
              <textarea name="notes" />
            </label>
            <div className="actions wide">
              <button className="secondary" onClick={(event) => onAddItem(event.currentTarget.form!)} type="button">
                Add Item
              </button>
              <button className="primary" type="submit">
                Submit Receipt
              </button>
              <button className="secondary" onClick={onClearReceipt} type="button">
                Clear Receipt
              </button>
            </div>
            <div className="receipt-box wide">
              {receiptItems.length ? (
                <>
                  {receiptItems.map((item, index) => (
                    <div className="receipt-row" key={`${item.itemId}-${index}`}>
                      <div>
                        <strong>{item.itemName}</strong>
                        <br />
                        <span className="muted">{item.category}</span>
                      </div>
                      <div>x{item.qty}</div>
                      <div>{money(item.unitPrice)} EGP</div>
                      <button className="danger" onClick={() => onRemoveItem(index)} type="button">
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="receipt-total">
                    <span>Receipt total</span>
                    <span>{money(receiptTotal)} EGP</span>
                  </div>
                </>
              ) : (
                <div className="muted">No items on this receipt yet.</div>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <PanelHead title="Waiter Payment History" />
        <FilterBar
          id="orders"
          placeholder="Filter receipts"
          value={filters.orders}
          onChange={onFilter}
          quickFilters={[
            ["", "All"],
            ["__unpaid", "Unpaid"],
            ["__paid", "Paid"],
          ]}
        />
        {dashboardOrders.length ? (
          <div className="receipt-board">
            {dashboardOrders.map((order, index) => (
              <OrderTicket
                key={`${stringValue(order.receiptId)}-${index}`}
                order={order}
                onDone={onDone}
                onSetPayment={onSetPayment}
                showPickupAction={false}
                showPickupStrike={false}
                showPaymentActions={role !== "waiter"}
              />
            ))}
          </div>
        ) : (
          <div className="panel-empty">No receipts yet.</div>
        )}
      </section>
    </>
  );
}

function RewardsView({
  rewards,
  winners,
  filters,
  onFilter,
  onGenerateVoucher,
}: {
  rewards: Row[];
  winners: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
  onGenerateVoucher: (row: Row) => void;
}) {
  const [view, setView] = useState<"rewards" | "winners">("rewards");
  const isRewards = view === "rewards";

  return (
    <section className="panel">
      <PanelHead
        title={isRewards ? "Rewards" : "Free Drink Winners"}
        note={isRewards ? `${rewards.length} customer(s)` : `${winners.length} winner(s)`}
      />
      <div className="view-switch" aria-label="Rewards view">
        <button
          className={isRewards ? "active" : ""}
          onClick={() => setView("rewards")}
          type="button"
        >
          Rewards
        </button>
        <button
          className={!isRewards ? "active" : ""}
          onClick={() => setView("winners")}
          type="button"
        >
          Free Drink Winners
        </button>
      </div>
      {isRewards ? (
        <>
        <FilterBar
          id="rewards"
          placeholder="Filter rewards"
          value={filters.rewards}
          onChange={onFilter}
        />
        <DataTable
          columns={[
            ["customerId", "ID"],
            ["customerName", "Customer"],
            ["phone", "Phone"],
            ["favoriteDrink", "Favorite"],
            ["paidDrinks", "Paid Drinks"],
            ["earnedFreeDrinks", "Earned"],
            ["generatedVouchers", "Generated"],
            ["pendingVouchers", "Pending"],
            ["redeemedVouchers", "Redeemed"],
            ["freeDrinksReady", "Free Drinks"],
            ["nextRewardProgress", "Progress"],
            ["winner", "Winner"],
            ["winnerMessage", "Message"],
          ]}
          rows={rewards}
        />
        </>
      ) : (
        <>
        <FilterBar
          id="winners"
          placeholder="Filter winners"
          value={filters.winners}
          onChange={onFilter}
        />
        <DataTable
          action={(row) =>
            numberValue(row.freeDrinksReady) > 0 ? (
              <button className="secondary" onClick={() => onGenerateVoucher(row)} type="button">
                Generate Voucher
              </button>
            ) : (
              <Pill value="Not ready" />
            )
          }
          columns={[
            ["customerId", "ID"],
            ["customerName", "Customer"],
            ["phone", "Phone"],
            ["favoriteDrink", "Favorite"],
            ["paidDrinks", "Paid Drinks"],
            ["freeDrinksReady", "Free Drinks"],
            ["winnerMessage", "Message"],
          ]}
          rows={winners}
        />
        </>
      )}
    </section>
  );
}

function VouchersView({
  vouchers,
  filters,
  onFilter,
  onRedeem,
}: {
  vouchers: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
  onRedeem: (code: string) => void;
}) {
  return (
    <section className="panel">
      <PanelHead title="Generated Vouchers" />
      <FilterBar
        id="vouchers"
        placeholder="Filter vouchers"
        value={filters.vouchers}
        onChange={onFilter}
      />
      <DataTable
        action={(row) => {
          const code = stringValue(row.voucherCode || row.code);
          const redeemed = stringValue(row.redeemStatus).toLowerCase() === "redeemed";
          return (
            <div className="actions">
              <button className="secondary" onClick={() => printVoucher(row)} type="button">
                Print
              </button>
              <button className="secondary" onClick={() => void sendVoucherWhatsApp(row)} type="button">
                WhatsApp
              </button>
              {redeemed ? (
                <Pill value="Redeemed" />
              ) : (
                <button className="danger" onClick={() => onRedeem(code)} type="button">
                  Redeem
                </button>
              )}
            </div>
          );
        }}
        columns={[
          ["voucherCode", "Code"],
          ["customerName", "Customer"],
          ["favoriteDrink", "Drink"],
          ["voucherReward", "Reward"],
          ["redeemStatus", "Redeem"],
          ["canvaStatus", "Canva"],
          ["generatedAt", "Generated"],
        ]}
        rows={vouchers}
      />
    </section>
  );
}

function UnpaidView({
  unpaid,
  filters,
  onCollect,
  onFilter,
}: {
  unpaid: Row[];
  filters: Record<string, string>;
  onCollect: (row: Row) => void;
  onFilter: (id: string, value: string) => void;
}) {
  const [showPaidReceipts, setShowPaidReceipts] = useState(false);
  const [hiddenPaidCustomers, setHiddenPaidCustomers] = useState<Set<string>>(
    () => new Set(),
  );
  const visibleUnpaid = unpaid.filter((row) => {
    const paid = stringValue(row.paymentStatus).toLowerCase() === "paid";
    const key = customerIdOf(row) || customerName(row);
    if (paid && hiddenPaidCustomers.has(key)) return false;
    return showPaidReceipts || !paid;
  });
  const paidCount = unpaid.filter(
    (row) => stringValue(row.paymentStatus).toLowerCase() === "paid",
  ).length;

  return (
    <section className="panel">
      <PanelHead
        title="Unpaid Tracker"
        note={`${visibleUnpaid.length} shown${paidCount ? `, ${paidCount} paid hidden/optional` : ""}`}
      />
      <div className="view-switch unpaid-switch" aria-label="Unpaid receipt visibility">
        <button
          className={!showPaidReceipts ? "active" : ""}
          onClick={() => setShowPaidReceipts(false)}
          type="button"
        >
          Unpaid Only
        </button>
        <button
          className={showPaidReceipts ? "active" : ""}
          onClick={() => setShowPaidReceipts(true)}
          type="button"
        >
          Include Paid Receipts
        </button>
      </div>
      <FilterBar
        id="unpaid"
        placeholder="Filter unpaid and paid history"
        value={filters.unpaid}
        onChange={onFilter}
      />
      {visibleUnpaid.length ? (
        <div className="unpaid-card-list">
          {visibleUnpaid.map((row, index) => {
            const paid = stringValue(row.paymentStatus).toLowerCase() === "paid";
            const descriptionParts = unpaidDescriptionParts(row);
            const paidTotal = numberValue(row.totalPaid);
            const totalAmount = numberValue(row.totalAmount);
            const key = customerIdOf(row) || customerName(row);
            return (
              <article className="unpaid-card" key={`${rowSearchText(row)}-${index}`}>
                <div className="unpaid-card-head">
                  <div>
                    <span className="mobile-card-label">{customerIdOf(row) || "Customer"}</span>
                    <strong>{customerName(row)}</strong>
                    <span className="mobile-card-subtitle">{phoneOf(row) || "No phone"}</span>
                  </div>
                  <Pill value={paid ? "Paid" : "Unpaid"} />
                </div>
                <div className="unpaid-amount">
                  <div>
                    <span>{money(row.unpaidBalance)} EGP</span>
                    <small>Unpaid balance</small>
                  </div>
                  <div>
                    <span>{money(paidTotal)} EGP</span>
                    <small>Paid total</small>
                  </div>
                </div>
                <dl className="mobile-card-grid">
                  <div>
                    <dt>Total Orders Value</dt>
                    <dd>{money(totalAmount)} EGP</dd>
                  </div>
                  <div>
                    <dt>Open Orders</dt>
                    <dd>{stringValue(row.openUnpaidOrders || 0)}</dd>
                  </div>
                  <div>
                    <dt>Place</dt>
                    <dd>{stringValue(row.orderPlace) || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Last Visit</dt>
                    <dd>{stringValue(row.lastVisit) || "No date"}</dd>
                  </div>
                  <div className="unpaid-description-cell">
                    <dt>Description</dt>
                    <dd>
                      {descriptionParts.length ? (
                        <span className="unpaid-description-list">
                          {descriptionParts.map((part, partIndex) => (
                            <span key={`${part}-${partIndex}`}>{part}</span>
                          ))}
                        </span>
                      ) : (
                        "No description"
                      )}
                    </dd>
                  </div>
                </dl>
                {paid ? (
                  <div className="actions">
                    <Pill value="Paid" />
                    <button
                      className="secondary"
                      onClick={() =>
                        setHiddenPaidCustomers((current) => new Set(current).add(key))
                      }
                      type="button"
                    >
                      Remove from View
                    </button>
                  </div>
                ) : (
                  <button className="primary" onClick={() => onCollect(row)} type="button">
                    Collect Payment
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel-body muted">No rows yet.</div>
      )}
    </section>
  );
}

function HistoryView({
  days,
  filters,
  onFilter,
}: {
  days: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
}) {
  return (
    <section className="panel">
      <PanelHead title="Day History" note={`${days.length} day(s)`} />
      <FilterBar
        id="history"
        placeholder="Filter by date, best seller, or receipt"
        value={filters.history}
        onChange={onFilter}
      />
      {days.length ? (
        <div className="history-grid">
          {days.map((day) => (
            <article className="history-card" key={stringValue(day.dateKey)}>
              <div className="history-card-head">
                <span className="history-date">{stringValue(day.dateKey)}</span>
                <strong>{money(day.totalSales)} EGP sales</strong>
              </div>
              <div className="history-money-grid">
                <div>
                  <span>Paid</span>
                  <strong>{money(day.totalPaid)} EGP</strong>
                </div>
                <div>
                  <span>Unpaid</span>
                  <strong>{money(day.totalUnpaid)} EGP</strong>
                </div>
                <div>
                  <span>Receipts</span>
                  <strong>{stringValue(day.receiptCount || 0)}</strong>
                </div>
                <div>
                  <span>Items</span>
                  <strong>{stringValue(day.orderCount || 0)}</strong>
                </div>
              </div>
              <div className="history-meta">
                <span>Top: {stringValue(day.bestSellingItem) || "No drinks yet"}</span>
                <span>Qty: {stringValue(day.bestSellingQty || 0)}</span>
                <span>Free drinks: {stringValue(day.redemptionCount || 0)}</span>
                <span>Latest: {stringValue(day.latestReceiptSerial) || "None"}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-empty">No day history yet.</div>
      )}
    </section>
  );
}

function MenuView({
  menu,
  filters,
  onFilter,
}: {
  menu: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
}) {
  const [category, setCategory] = useState("All");
  const categories = ["All", ...new Set(menu.map((item) => stringValue(item.category)).filter(Boolean))];
  const visibleMenu =
    category === "All"
      ? menu
      : menu.filter((item) => stringValue(item.category) === category);

  return (
    <section className="panel">
      <PanelHead title="Menu" note={`${visibleMenu.length} item(s)`} />
      <FilterBar
        id="menu"
        placeholder="Filter menu"
        value={filters.menu}
        onChange={onFilter}
      />
      <div className="section-filter" aria-label="Menu sections">
        {categories.map((name) => (
          <button
            className={`section-chip ${category === name ? "active" : ""}`}
            key={name}
            onClick={() => setCategory(name)}
            style={{ "--section-color": categoryColor(name) } as CSSProperties}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <div className="menu-circle-grid">
        {visibleMenu.map((item, index) => (
          <article
            className="menu-circle"
            key={`${stringValue(item.itemId)}-${index}`}
            style={{ "--section-color": categoryColor(stringValue(item.category)) } as CSSProperties}
          >
            <span>{stringValue(item.category) || "Menu"}</span>
            <strong>{menuName(item)}</strong>
            <small>{menuPrice(item) || "No price"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function OrderTicket({
  order,
  onDone,
  onSetPayment,
  showPaymentActions = true,
  showPickupAction = true,
  showPickupStrike = true,
}: {
  order: Row;
  onDone: (payload: string) => void;
  onSetPayment: (payload: string, paymentStatus: string) => void;
  showPaymentActions?: boolean;
  showPickupAction?: boolean;
  showPickupStrike?: boolean;
}) {
  const due = numberValue(order.outstandingAmount);
  const pickedUp = isPickedUp(order.orderStatus);
  const payload = receiptActionPayload(order);
  const place = orderPlaceOf(order);
  const title = [place, stringValue(order.customerName) || "Walk-in customer"]
    .filter(Boolean)
    .join(" - ");
  const items =
    Array.isArray(order.orderItems)
      ? order.orderItems
      : stringValue(order.orderDescription)
          .split("+")
          .map((item) => item.trim())
          .filter(Boolean);

  return (
    <article className={`order-ticket ${pickedUp && showPickupStrike ? "picked-up" : ""}`}>
      <div className="ticket-head">
        <div className="ticket-title">
          <strong>{title}</strong>
          <span className="muted">
            {stringValue(order.orderDateTime)} {order.staff ? `| ${stringValue(order.staff)}` : ""}
          </span>
          {place && <span className="ticket-place">{place}</span>}
        </div>
        <div className="actions">
          {showPaymentActions && <Pill value={stringValue(order.paymentStatus) || "Paid"} />}
          {pickedUp && <Pill value="Picked Up" />}
        </div>
      </div>

      <div className="ticket-items">
        {items.length ? (
          items.map((item, index) => {
            const text = stringValue(item);
            const match = text.match(/^(.*)\sx(\d+(\.\d+)?)$/i);
            return (
              <div className="ticket-item" key={`${text}-${index}`}>
                <span>{match ? match[1] : text}</span>
                <span>x{match ? match[2] : "1"}</span>
              </div>
            );
          })
        ) : (
          <div className="muted">No item description.</div>
        )}
      </div>

      <div className="ticket-total">
        <span>Total</span>
        <span>{money(order.total)} EGP</span>
      </div>
      {showPaymentActions && (
        <div className="stock-meta">
          <span>Paid: {money(order.paidAmount)} EGP</span>
          <span className={`pill ${due > 0 ? "unpaid" : "paid"}`}>
            {due > 0 ? `Due ${money(due)} EGP` : "Ready"}
          </span>
        </div>
      )}
      <div className={`ticket-actions ${ticketActionClass(showPaymentActions, showPickupAction)}`}>
        {showPaymentActions && (
          <>
            <button className="secondary" onClick={() => onSetPayment(payload, "Paid")} type="button">
              Paid
            </button>
            <button className="secondary" onClick={() => onSetPayment(payload, "Unpaid")} type="button">
              Unpaid
            </button>
          </>
        )}
        {showPickupAction && (
          <button className="primary" disabled={pickedUp} onClick={() => onDone(payload)} type="button">
            Picked Up
          </button>
        )}
      </div>
    </article>
  );
}

function StockCard({ item }: { item: Row }) {
  const qtySold = numberValue(item.qtySold);
  const alert =
    stringValue(item.stockAlert) ||
    (qtySold >= 10 ? "Restock today" : qtySold >= 5 ? "Watch stock" : "OK");
  const isAlert = alert !== "OK";
  const meter = Math.min(100, Math.max(8, qtySold * 10));

  return (
    <article className={`stock-card ${isAlert ? "alert" : ""}`}>
      <div className="stock-row">
        <div className="stock-row inner">
          <span className="stock-rank">{stringValue(item.rank)}</span>
          <strong className="stock-name">{stringValue(item.itemName) || "Item"}</strong>
        </div>
        <span className={`pill ${isAlert ? "unpaid" : "paid"}`}>{alert}</span>
      </div>
      <div className="stock-meter">
        <span style={{ width: `${meter}%` }} />
      </div>
      <div className="stock-meta">
        <span>{money(qtySold)} sold</span>
        <span>{money(item.totalSales)} EGP</span>
      </div>
    </article>
  );
}

function ticketActionClass(showPaymentActions: boolean, showPickupAction: boolean) {
  if (showPaymentActions && !showPickupAction) return "payment-only";
  if (!showPaymentActions && showPickupAction) return "pickup-only";
  return "";
}

function DataTable({
  columns,
  rows,
  action,
}: {
  columns: Array<[string, string]>;
  rows: Row[];
  action?: (row: Row) => React.ReactNode;
}) {
  if (!rows.length) return <div className="panel-body muted">No rows yet.</div>;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              {action && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${rowSearchText(row)}-${index}`}>
                {columns.map(([key]) => (
                  <td key={key}>
                    <FormattedValue value={row[key]} />
                  </td>
                ))}
                {action && <td>{action(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-data-list">
        {rows.map((row, index) => {
          const fallbackColumn: [string, string] = columns[0] || ["", "Record"];
          const titleColumn =
            columns.find(([key]) => stringValue(row[key])) || fallbackColumn;
          const subtitleColumn =
            columns.find(
              ([key]) => key !== titleColumn[0] && stringValue(row[key]),
            ) || columns[1];
          const detailColumns = columns.filter(
            ([key]) => key !== titleColumn[0] && key !== subtitleColumn?.[0],
          );

          return (
            <article className="mobile-data-card" key={`${rowSearchText(row)}-${index}`}>
              <div className="mobile-card-head">
                <div>
                  <span className="mobile-card-label">{titleColumn[1]}</span>
                  <strong>
                    <FormattedValue value={row[titleColumn[0]]} />
                  </strong>
                  {subtitleColumn && (
                    <span className="mobile-card-subtitle">
                      {subtitleColumn[1]}: {stringValue(row[subtitleColumn[0]])}
                    </span>
                  )}
                </div>
                {action && <div className="mobile-card-actions">{action(row)}</div>}
              </div>
              <dl className="mobile-card-grid">
                {detailColumns.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <FormattedValue value={row[key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}

function FormattedValue({ value }: { value: unknown }) {
  const text = stringValue(value);
  const key = text.trim().toLowerCase().replace(/\s+/g, "-");
  const pillValues = [
    "yes",
    "no",
    "paid",
    "unpaid",
    "pending",
    "created",
    "redeemed",
    "not-redeemed",
    "done",
    "picked-up",
  ];

  if (pillValues.includes(key)) return <span className={`pill ${key}`}>{text}</span>;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return <span className="date-pill">{text.slice(0, 10)}</span>;
  }
  return <>{text}</>;
}

function Pill({ value }: { value: string }) {
  const key = value.trim().toLowerCase().replace(/\s+/g, "-");
  return <span className={`pill ${key}`}>{value}</span>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function PanelHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {note && <span className="muted">{note}</span>}
    </div>
  );
}

function Field({
  label,
  list,
  name,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: {
  label: string;
  list?: string;
  name: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <input
        list={list}
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function FilterBar({
  id,
  onChange,
  placeholder,
  quickFilters = [],
  value = "",
}: {
  id: string;
  onChange: (id: string, value: string) => void;
  placeholder: string;
  quickFilters?: Array<[string, string]>;
  value?: string;
}) {
  return (
    <div className="filter-bar">
      <input
        onChange={(event) => onChange(id, event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value.startsWith("__") ? "" : value}
      />
      {quickFilters.length > 0 && (
        <div className="quick-filters" aria-label="Quick filters">
          {quickFilters.map(([filterValue, label]) => (
            <button
              className={`filter-chip ${value === filterValue ? "active" : ""}`}
              key={`${id}-${filterValue || "all"}`}
              onClick={() => onChange(id, filterValue)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <span className="muted">Search by name, item, status, staff, phone, or code</span>
    </div>
  );
}

async function callServer(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResponse & AppData> {
  const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
  const headers = {
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
  const response =
    action === "appData" || action === "getAppData"
      ? await fetch(
          `${API_BASE_URL}?${new URLSearchParams({
            action: "appData",
          }).toString()}`,
          { headers },
        )
      : await fetch(API_BASE_URL, {
          body: JSON.stringify({ action, ...payload }),
          headers: { "Content-Type": "text/plain;charset=utf-8", ...headers },
          method: "POST",
        });

  if (!response.ok) {
    let message = `API failed with status ${response.status}.`;
    try {
      const errorJson = (await response.clone().json()) as ApiResponse;
      message = errorJson.message || message;
    } catch {
      // Keep the status fallback when the server does not return JSON.
    }
    throw new Error(message);
  }

  const json = (await response.json()) as ApiResponse & AppData;

  if (json.success === false) {
    throw new Error(json.message || "Action failed.");
  }

  return json;
}

function ensureConnectedData(source: AppData | null): AppData {
  if (!source) return {};
  const nextData = { ...source };
  if (!nextData.dashboardOrders) {
    nextData.dashboardOrders = buildDashboardOrders(nextData.orders || []);
  }
  if (
    !nextData.dashboardTopItems ||
    (!nextData.dashboardTopItems.length && (nextData.orders || []).length)
  ) {
    nextData.dashboardTopItems = buildDashboardTopItems(nextData.orders || []);
  }
  if ((nextData.customers || []).length && (nextData.orders || []).length) {
    nextData.rewards = buildRewards(
      nextData.customers || [],
      nextData.orders || [],
      nextData.vouchers || [],
    );
    nextData.winners = nextData.rewards.filter(
      (reward) => numberValue(reward.freeDrinksReady) > 0,
    );
  }
  nextData.dashboard = buildDashboardCounts(nextData);
  return nextData;
}

function dataSummary(data: AppData) {
  return `Menu: ${data.menu?.length || 0}, Customers: ${data.customers?.length || 0}, Orders: ${data.orders?.length || 0}`;
}

function buildDashboardCounts(data: AppData): Dashboard {
  const dashboardOrders = data.dashboardOrders || [];
  const orders = data.orders || [];
  const unpaid = data.unpaid || [];
  const base = data.dashboard || {};
  const pickedUpReceipts = dashboardOrders.filter((order) =>
    isPickedUp(order.orderStatus),
  ).length;
  const unpaidReceipts = dashboardOrders.filter(
    (order) => numberValue(order.outstandingAmount) > 0,
  ).length;

  return {
    ...base,
    totalOrders: dashboardOrders.length || base.totalOrders || 0,
    totalItems: base.totalItems ?? orders.length ?? 0,
    totalPaid:
      base.totalPaid ??
      dashboardOrders.reduce((total, order) => total + numberValue(order.paidAmount), 0),
    totalUnpaid:
      base.totalUnpaid ??
      unpaid.reduce((total, row) => total + numberValue(row.unpaidBalance), 0),
    openReceipts: Math.max(0, dashboardOrders.length - pickedUpReceipts),
    pickedUpReceipts,
    unpaidReceipts,
  };
}

function buildDashboardOrders(orders: Row[]) {
  const grouped: Record<
    string,
    Row & { orderDescriptions: string[]; pickedUpCount: number }
  > = {};

  orders.forEach((order) => {
    const key =
      stringValue(order.receiptId) ||
      [
        order.orderDateTime,
        order.customerId,
        order.customerName,
        order.paymentStatus,
      ].join("|");

    if (!grouped[key]) {
      grouped[key] = {
        ...order,
        receiptKey: key,
        orderPlace: orderPlaceOf(order),
        itemCount: 0,
        total: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        orderDescriptions: [],
        pickedUpCount: 0,
      };
    }

    const group = grouped[key];
    group.itemCount = numberValue(group.itemCount) + 1;
    group.total = numberValue(group.total) + numberValue(order.total);
    group.paidAmount = numberValue(group.paidAmount) + numberValue(order.paidAmount);
    group.outstandingAmount =
      numberValue(group.outstandingAmount) + numberValue(order.outstandingAmount);
    group.orderPlace = group.orderPlace || orderPlaceOf(order);
    if (isPickedUp(order.orderStatus)) {
      group.pickedUpCount += 1;
    }
    group.orderDescriptions.push(
      `${stringValue(order.item || order.itemName) || "Item"} x${stringValue(order.qty) || "1"}`,
    );
  });

  return Object.values(grouped).map((row) => ({
    ...row,
    itemCount: String(row.itemCount),
    orderDescription: row.orderDescriptions.join(" + "),
    orderItems: row.orderDescriptions,
    orderStatus:
      row.pickedUpCount >= numberValue(row.itemCount)
        ? "Picked Up"
        : row.orderStatus,
    paidAmount: String(row.paidAmount),
    outstandingAmount: String(row.outstandingAmount),
    total: String(row.total),
  }));
}

function buildDashboardTopItems(orders: Row[]) {
  const grouped: Record<
    string,
    { itemName: string; category: string; qtySold: number; totalSales: number; lastSold: string }
  > = {};

  orders.forEach((order) => {
    if (!isDrinkOrder(order)) return;

    const itemName = orderItemName(order);
    const groupKey = itemName.toLowerCase();
    const qtySold = orderQty(order);

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        itemName,
        category: stringValue(order.category),
        qtySold: 0,
        totalSales: 0,
        lastSold: "",
      };
    }

    grouped[groupKey].qtySold += qtySold;
    grouped[groupKey].totalSales += numberValue(order.total);
    grouped[groupKey].lastSold = stringValue(order.orderDateTime) || grouped[groupKey].lastSold;
  });

  return Object.values(grouped)
    .sort((left, right) => right.qtySold - left.qtySold || right.totalSales - left.totalSales)
    .slice(0, 8)
    .map((row, index) => ({
      ...row,
      rank: String(index + 1),
      qtySold: String(row.qtySold),
      totalSales: String(row.totalSales),
      stockAlert:
        row.qtySold >= 10
          ? "Restock today"
          : row.qtySold >= 5
            ? "Watch stock"
            : "OK",
    }));
}

function orderItemName(order: Row) {
  return (
    stringValue(order.item || order.itemName || order.menuItem || order.productName) ||
    "Item"
  );
}

function orderQty(order: Row) {
  return Math.max(
    1,
    numberValue(order.qty || order.quantity || order.count || order.itemCount) || 1,
  );
}

function buildRewards(customers: Row[], orders: Row[], vouchers: Row[]) {
  return customers
    .map((customer) => {
      const customerOrders = orders.filter((order) =>
        rowsMatchCustomer(order, customer),
      );
      const paidDrinks = customerOrders.reduce(
        (total, order) => total + paidEligibleDrinkQty(order),
        0,
      );
      const earnedFreeDrinks = Math.floor(paidDrinks / 5);
      const customerVouchers = vouchers.filter((voucher) =>
        rowsMatchCustomer(voucher, customer),
      );
      const generatedVouchers = customerVouchers.length;
      const redeemedVouchers = customerVouchers.filter(
        (voucher) => stringValue(voucher.redeemStatus).toLowerCase() === "redeemed",
      ).length;
      const pendingVouchers = generatedVouchers - redeemedVouchers;
      const freeDrinksReady = Math.max(0, earnedFreeDrinks - generatedVouchers);
      const progress = paidDrinks % 5;

      return {
        customerId: customerIdOf(customer),
        customerName: customerName(customer),
        phone: phoneOf(customer),
        favoriteDrink: favoriteDrink(customer),
        paidDrinks: String(paidDrinks),
        earnedFreeDrinks: String(earnedFreeDrinks),
        generatedVouchers: String(generatedVouchers),
        pendingVouchers: String(pendingVouchers),
        redeemedVouchers: String(redeemedVouchers),
        freeDrinksReady: String(freeDrinksReady),
        nextRewardProgress: `${progress}/5`,
        winner: freeDrinksReady > 0 ? "Yes" : "No",
        redeemStatus:
          pendingVouchers > 0
            ? `${pendingVouchers} voucher(s) pending`
            : redeemedVouchers > 0
              ? `${redeemedVouchers} redeemed`
              : "No voucher yet",
        winnerMessage:
          freeDrinksReady > 0
            ? `${freeDrinksReady} free drink voucher(s) ready`
            : `${5 - progress} paid drink(s) to next reward`,
      };
    })
    .filter((reward) => reward.customerId || reward.customerName);
}

function paidEligibleDrinkQty(order: Row) {
  if (!isOrderPaidForRewards(order)) return 0;
  if (!isRewardEligibleOrder(order)) return 0;
  return orderQty(order);
}

function isOrderPaidForRewards(order: Row) {
  const status = stringValue(order.paymentStatus).toLowerCase();
  if (status === "paid") return true;
  return numberValue(order.total) > 0 && numberValue(order.outstandingAmount) <= 0;
}

function isRewardEligibleOrder(order: Row) {
  if (numberValue(order.pointsEarned) > 0) return true;
  return isDrinkOrder(order);
}

function isDrinkOrder(order: Row) {
  const text = `${stringValue(order.category)} ${orderItemName(order)}`.toLowerCase();
  if (
    [
      "cake",
      "dessert",
      "food",
      "sandwich",
      "croissant",
      "cookie",
      "brownie",
      "muffin",
      "toast",
    ].some((word) => text.includes(word))
  ) {
    return false;
  }

  return [
    "americano",
    "beverage",
    "cappuccino",
    "coffee",
    "drink",
    "espresso",
    "frappe",
    "hot chocolate",
    "iced",
    "juice",
    "latte",
    "matcha",
    "milkshake",
    "mocha",
    "nescafe",
    "smoothie",
    "spanish",
    "tea",
  ].some((word) => text.includes(word));
}

function rowsMatchCustomer(row: Row, customer: Row) {
  const rowId = customerIdOf(row);
  const customerId = customerIdOf(customer);
  if (rowId && customerId && rowId === customerId) return true;

  const rowPhone = digitsOnly(phoneOf(row) || row.customerPhone);
  const customerPhone = digitsOnly(phoneOf(customer) || customer.customerPhone);
  if (rowPhone && customerPhone && rowPhone === customerPhone) return true;

  return customerNameKey(row) && customerNameKey(row) === customerNameKey(customer);
}

function customerNameKey(row: Row) {
  return stringValue(
    row.customerName ||
      row.fullName ||
      row.name ||
      row.clientName ||
      row.customer ||
      row.guestName,
  )
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildPlaceOptions(lists: Record<string, string[]>, orders: Row[]) {
  return uniqueStrings([
    ...(lists.orderPlace || []),
    ...(lists.tablePlaces || []),
    ...(lists.tables || []),
    ...orders.map(orderPlaceOf),
    "Takeaway",
    "Hall",
    "Outside",
    "Table 1",
    "Table 2",
    "Table 3",
    "Table 4",
    "Garden",
    "Garden sofa",
    "Counter",
  ]);
}

function composeServicePlace(payload: Row) {
  const serviceType = stringValue(payload.serviceType);
  const place = stringValue(payload.orderPlace);
  const carName = stringValue(payload.carName);
  const carColor = stringValue(payload.carColor);
  const car = [carColor, carName].filter(Boolean).join(" ");
  const parts = [
    serviceType && serviceType !== "Hall" ? serviceType : "",
    place,
    car ? `Car: ${car}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" - ") : place;
}

function compareRecentOrders(left: Row, right: Row) {
  return dateScore(right.orderDateTime) - dateScore(left.orderDateTime);
}

function dateScore(value: unknown) {
  const parsed = Date.parse(stringValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map((value) => stringValue(value))
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
}

function receiptActionPayload(order: Row) {
  const payload: ReceiptPayload = {
    receiptId: stringValue(order.receiptId),
    receiptKey: stringValue(order.receiptKey),
    customerId: stringValue(order.customerId),
    customerName: stringValue(order.customerName),
    orderDateTime: stringValue(order.orderDateTime),
    staff: stringValue(order.staff) || "Cashier 1",
  };

  return encodeURIComponent(JSON.stringify(payload));
}

function receiptPayloadFrom(value: string) {
  return JSON.parse(decodeURIComponent(value)) as ReceiptPayload;
}

function isPickedUp(value: unknown) {
  const normalized = stringValue(value).toLowerCase().replace(/[-_\s]+/g, "");
  return normalized === "done" || normalized === "pickedup" || normalized === "pickup";
}

function orderPlaceOf(row: Row) {
  const direct = stringValue(
    row.orderPlace || row.tableNumber || row.table || row.place || row.location,
  );
  if (direct) return direct;

  const match = stringValue(row.notes).match(/(?:Place|Table|Location):\s*([^|]+)/i);
  return match ? stringValue(match[1]) : "";
}

function printVoucher(row: Row) {
  const customer = customerName(row) || "Joy Corner Guest";
  const drink = favoriteDrink(row) || "your favorite drink";
  const code = stringValue(row.voucherCode || row.code);
  const reward = stringValue(row.voucherReward) || `Enjoy 1 Free ${drink}`;
  const generatedAt = stringValue(row.generatedAt || row.date) || new Date().toLocaleDateString();
  const win = window.open("", "_blank", "width=460,height=760");
  if (!win) return;

  win.document.write(`
    <html><head><title>${escapeHtml(code)}</title>
    <style>
      @page{size:92mm 210mm;margin:0}
      *{box-sizing:border-box}
      html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Arial,sans-serif;margin:0;background:#eee5d6;color:#21130c}
      .sheet{align-items:center;display:flex;justify-content:center;min-height:100vh;padding:14px}
      .voucher{background:#f8b73f;border:1.5mm solid #1c100b;box-shadow:0 18px 38px rgba(0,0,0,.22);height:200mm;overflow:hidden;position:relative;width:86mm}
      .voucher:before{background:linear-gradient(180deg,#fecb57 0,#f48a2d 48%,#1f8aa0 49%,#58c1d0 100%);content:"";inset:0;position:absolute}
      .sky{height:91mm;left:0;overflow:hidden;position:absolute;right:0;top:0}
      .sun{background:#ffe6a3;border-radius:50%;height:24mm;position:absolute;right:8mm;top:31mm;width:24mm}
      .mountain{background:#1c8b93;clip-path:polygon(50% 0,100% 100%,0 100%);height:54mm;left:10mm;position:absolute;top:45mm;width:70mm}
      .mountain:after{background:#0e6670;clip-path:polygon(48% 0,78% 100%,15% 100%);content:"";height:38mm;left:14mm;position:absolute;top:12mm;width:34mm}
      .cloud{background:#fff2c8;border-radius:20mm;height:5mm;position:absolute;width:18mm}
      .cloud.one{left:5mm;top:31mm}.cloud.two{right:7mm;top:48mm}.cloud.three{left:36mm;top:70mm}
      .hill{background:#2e8b3f;border-radius:50% 50% 0 0;height:58mm;position:absolute;top:78mm;width:72mm}
      .hill.left{left:-19mm}.hill.right{right:-15mm;background:#66a841}.hill.center{background:#447b34;left:10mm;top:91mm;width:82mm}
      .road{background:#f2c35f;clip-path:polygon(57% 0,72% 0,56% 100%,33% 100%);height:74mm;left:0;position:absolute;top:92mm;width:100%}
      .beans{bottom:52mm;display:flex;gap:3mm;left:7mm;position:absolute}
      .bean{background:#d93722;border-radius:50%;height:4.2mm;width:4.2mm}
      .header{background:#21130c;border-bottom:1.2mm solid #0f0805;border-radius:0 0 50% 50% / 0 0 10% 10%;color:#fff5d6;height:60mm;left:0;padding-top:8mm;position:absolute;right:0;text-align:center;top:0}
      .mark{align-items:center;background:#fff1bf;border:2.3mm solid #21130c;border-radius:50%;display:grid;font-family:Georgia,serif;font-size:22mm;font-weight:900;height:34mm;margin:0 auto 3mm;place-items:center;width:34mm}
      .brand{font-size:8.5mm;font-weight:900;letter-spacing:.8mm;line-height:1;text-shadow:0 1px 0 #000}
      .sub{font-size:3.8mm;font-weight:800;letter-spacing:.4mm;margin-top:2mm}
      .band{background:#21130c;color:#ffd165;font-size:8.2mm;font-weight:900;left:0;letter-spacing:.5mm;padding:3mm 2mm;position:absolute;right:0;text-align:center;text-transform:uppercase;top:102mm}
      .reward{background:#fff1bf;border:1mm solid rgba(33,19,12,.16);border-radius:4mm;bottom:17mm;left:6mm;padding:4mm;position:absolute;right:6mm;text-align:center}
      .reward h1{font-size:8mm;line-height:1;margin:0 0 2mm;text-transform:uppercase}
      .reward h2{color:#a03f22;font-size:5.5mm;line-height:1.1;margin:0 0 3mm}
      .reward p{font-size:3.6mm;font-weight:700;line-height:1.28;margin:0 0 3mm}
      .code{background:#21130c;border-radius:2mm;color:#fff1bf;font-size:4.3mm;font-weight:900;letter-spacing:.4mm;margin-top:3mm;padding:2.8mm}
      .meta{display:flex;font-size:2.8mm;font-weight:800;justify-content:space-between;margin-top:3mm;text-transform:uppercase}
      .footer{bottom:5mm;color:#fff1bf;font-size:3mm;font-weight:900;left:0;letter-spacing:.4mm;position:absolute;right:0;text-align:center;text-transform:uppercase}
      .screen-actions{display:flex;gap:8px;justify-content:center;margin-top:12px}
      .screen-actions button{background:#21130c;border:0;border-radius:6px;color:#fff1bf;cursor:pointer;font-weight:800;padding:10px 14px}
      @media(max-width:560px){.sheet{align-items:flex-start;padding:8px}.voucher{height:186mm;width:80mm}.brand{font-size:7.4mm}.band{font-size:7mm}.reward h1{font-size:6.4mm}}
      @media print{body{background:#fff}.sheet{min-height:0;padding:0}.voucher{box-shadow:none}.screen-actions{display:none}}
    </style></head><body>
    <div class="sheet"><div><div class="voucher">
      <div class="sky"><div class="sun"></div><div class="cloud one"></div><div class="cloud two"></div><div class="cloud three"></div><div class="mountain"></div><div class="hill left"></div><div class="hill right"></div><div class="hill center"></div><div class="road"></div><div class="beans"><span class="bean"></span><span class="bean"></span><span class="bean"></span></div></div>
      <div class="header"><div class="mark">J</div><div class="brand">JOY CORNER</div><div class="sub">COFFEE / FREE DRINK</div></div>
      <div class="band">Free Drink Voucher</div>
      <div class="reward"><h1>${escapeHtml(customer)}</h1><h2>${escapeHtml(reward)}</h2><p>Present this voucher at Joy Corner to redeem your free drink.</p><div class="code">${escapeHtml(code)}</div><div class="meta"><span>${escapeHtml(drink)}</span><span>${escapeHtml(generatedAt)}</span></div></div>
      <div class="footer">Your daily little joy</div>
    </div><div class="screen-actions"><button onclick="window.print()">Print Voucher</button><button onclick="window.close()">Close</button></div></div></div>
    </body></html>
  `);
  win.document.close();
}

async function sendVoucherWhatsApp(row: Row) {
  const phone = whatsAppPhone(stringValue(row.phone || row.phoneWhatsApp));
  const text = voucherWhatsAppText(row);
  const sharedImage = await shareVoucherImage(row);

  if (sharedImage) return;

  openVoucherImage(row);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function voucherWhatsAppText(row: Row) {
  const customer = customerName(row) || "Joy Corner guest";
  const drink = favoriteDrink(row) || "your favorite drink";
  const code = stringValue(row.voucherCode || row.code);
  const reward = stringValue(row.voucherReward) || `Enjoy 1 Free ${drink}`;

  return [
    `Hello ${customer},`,
    "",
    "You have a Joy Corner free drink voucher.",
    reward,
    `Voucher code: ${code}`,
    "",
    "Show this code at Joy Corner to redeem it. A colorful voucher image was opened/shared from the staff app.",
  ].join("\n");
}

async function shareVoucherImage(row: Row) {
  try {
    const blob = await voucherPngBlob(row);
    const file = new File([blob], `${stringValue(row.voucherCode || "joy-corner-voucher")}.png`, {
      type: "image/png",
    });
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        files: [file],
        text: voucherWhatsAppText(row),
        title: "Joy Corner Voucher",
      });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function voucherPngBlob(row: Row) {
  const svg = voucherSvg(row);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Voucher image failed."))), "image/png");
  });
}

function openVoucherImage(row: Row) {
  const url = URL.createObjectURL(new Blob([voucherSvg(row)], { type: "image/svg+xml" }));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function voucherSvg(row: Row) {
  const customer = escapeHtml(customerName(row) || "Joy Corner Guest");
  const drink = escapeHtml(favoriteDrink(row) || "your favorite drink");
  const code = escapeHtml(stringValue(row.voucherCode || row.code));
  const reward = escapeHtml(stringValue(row.voucherReward) || `Enjoy 1 Free ${drink}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#fecb57"/><stop offset=".48" stop-color="#f48a2d"/><stop offset=".49" stop-color="#1f8aa0"/><stop offset="1" stop-color="#58c1d0"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="14" flood-opacity=".25"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="#eee5d6"/>
    <rect x="95" y="60" width="890" height="1800" rx="24" fill="url(#sky)" stroke="#21130c" stroke-width="22" filter="url(#shadow)"/>
    <circle cx="790" cy="560" r="145" fill="#ffe6a3" opacity=".9"/>
    <path d="M190 980 L540 520 L890 980 Z" fill="#1c8b93"/><path d="M410 980 L560 620 L760 980 Z" fill="#0e6670"/>
    <path d="M80 1160 C250 940 430 1040 520 1140 C650 1000 840 1000 1010 1160 L1010 1460 L80 1460 Z" fill="#2e8b3f"/>
    <path d="M90 1320 C280 1180 470 1220 590 1340 C740 1210 850 1230 990 1350 L990 1510 L90 1510 Z" fill="#66a841"/>
    <path d="M590 1160 L760 1160 L610 1580 L430 1580 Z" fill="#f2c35f"/>
    <path d="M95 60 H985 V620 C810 700 270 700 95 620 Z" fill="#21130c"/>
    <circle cx="540" cy="250" r="150" fill="#fff1bf" stroke="#21130c" stroke-width="28"/>
    <text x="540" y="325" text-anchor="middle" font-family="Georgia,serif" font-size="230" font-weight="900" fill="#21130c">J</text>
    <text x="540" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="86" font-weight="900" fill="#fff5d6" letter-spacing="8">JOY CORNER</text>
    <text x="540" y="566" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="800" fill="#fff5d6" letter-spacing="4">COFFEE / FREE DRINK</text>
    <rect x="95" y="1000" width="890" height="145" fill="#21130c"/>
    <text x="540" y="1098" text-anchor="middle" font-family="Arial,sans-serif" font-size="76" font-weight="900" fill="#ffd165">FREE DRINK VOUCHER</text>
    <rect x="160" y="1340" width="760" height="365" rx="34" fill="#fff1bf" stroke="#d9ad63" stroke-width="8"/>
    <text x="540" y="1430" text-anchor="middle" font-family="Arial,sans-serif" font-size="70" font-weight="900" fill="#21130c">${customer}</text>
    <text x="540" y="1518" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="900" fill="#a03f22">${reward}</text>
    <text x="540" y="1592" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#21130c">Show this voucher at Joy Corner</text>
    <rect x="250" y="1628" width="580" height="70" rx="16" fill="#21130c"/>
    <text x="540" y="1678" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="900" fill="#fff1bf">${code}</text>
    <text x="540" y="1765" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="900" fill="#fff1bf">${drink}</text>
  </svg>`;
}

function whatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function formObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, unknown>;
}

function tabsForRole(role: StaffRole) {
  if (role === "barista") return tabs.filter(([id]) => id === "dashboard");
  if (role === "waiter") return tabs.filter(([id]) => id === "orders");
  return tabs;
}

const rolePermissions: Record<StaffRole, Set<string>> = {
  owner: new Set([
    "appData",
    "getAppData",
    "addCustomer",
    "removeCustomer",
    "addReceipt",
    "collectUnpaidPayment",
    "updateReceiptPayment",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "resetDay",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "debugAuth",
    "debugSheets",
  ]),
  cashier: new Set([
    "appData",
    "getAppData",
    "addCustomer",
    "removeCustomer",
    "addReceipt",
    "collectUnpaidPayment",
    "updateReceiptPayment",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "debugAuth",
    "debugSheets",
  ]),
  waiter: new Set([
    "appData",
    "getAppData",
    "addReceipt",
    "customerSearch",
    "customerHistory",
    "markReceiptDone",
    "debugAuth",
  ]),
  barista: new Set([
    "appData",
    "getAppData",
    "markReceiptDone",
    "debugAuth",
  ]),
};

function canRunAction(role: StaffRole, action: string) {
  return rolePermissions[role]?.has(action) === true;
}

function roleLabel(role: StaffRole) {
  const labels: Record<StaffRole, string> = {
    barista: "Barista",
    cashier: "Cashier",
    owner: "Owner",
    waiter: "Waiter",
  };

  return labels[role];
}

function rowSearchText(row: Row) {
  return Object.values(row)
    .map((value) => stringValue(value))
    .join(" ")
    .toLowerCase();
}

function unpaidDescriptionParts(row: Row) {
  const description = stringValue(row.unpaidDescription);
  if (!description) return [];

  return description
    .split(/\s*\|\s*|\n+|;+/)
    .flatMap((part) =>
      part
        .split(/(?=\d{4}-\d{2}-\d{2}\s+-\s+)/)
        .map((item) => item.trim()),
    )
    .filter(Boolean)
    .slice(0, 6);
}

function filterCustomersByNameOrPhone(customers: Row[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const queryDigits = digitsOnly(query);

  if (!normalizedQuery && !queryDigits) return customers;

  return customers.filter((customer) => {
    const name = customerName(customer).toLowerCase();
    const phone = phoneOf(customer).toLowerCase();
    const phoneDigits = digitsOnly(phone);

    return (
      name.includes(normalizedQuery) ||
      phone.includes(normalizedQuery) ||
      Boolean(queryDigits && phoneDigits.includes(queryDigits))
    );
  });
}

function enrichOrderCustomerPhone(order: Row, customers: Row[]) {
  if (phoneOf(order)) return order;

  const orderCustomerId = customerIdOf(order);
  const orderCustomerName = stringValue(order.customerName).toLowerCase();
  const customer = customers.find((row) => {
    if (orderCustomerId && customerIdOf(row) === orderCustomerId) return true;
    return orderCustomerName && customerName(row).toLowerCase() === orderCustomerName;
  });

  const phone = phoneOf(customer);
  return phone ? { ...order, phone, phoneWhatsApp: phone } : order;
}

function customerIdOf(row?: Row) {
  if (!row) return "";
  return stringValue(row.customerId || row.customerID || row.id || row.ID);
}

function customerName(row?: Row) {
  if (!row) return "";
  return (
    stringValue(row.fullName || row.customerName || row.name || row.customer) ||
    "Unnamed Customer"
  );
}

function phoneOf(row?: Row) {
  if (!row) return "";
  return localPhoneDisplay(
    stringValue(row.phoneWhatsApp || row.phone || row.mobile || row.whatsapp),
  );
}

function digitsOnly(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function localPhoneDisplay(value: string) {
  const phone = stringValue(value);
  const digits = digitsOnly(phone);
  if (/^1\d{9}$/.test(digits) && !phone.startsWith("+")) return `0${digits}`;
  return phone;
}

function favoriteDrink(row?: Row) {
  if (!row) return "";
  return stringValue(row.favoriteDrink || row.favouriteDrink || row.favorite || row.drink);
}

function menuName(row: Row) {
  return stringValue(row.itemName || row.name || row.item) || "Menu item";
}

function menuPrice(row: Row) {
  return stringValue(
    row.priceText || row.priceTextEditLater || row["priceTextEditLater)"] || row.price,
  );
}

function categoryColor(category: string) {
  const colors = [
    "#d9ad63",
    "#5f8f6a",
    "#3f8fa3",
    "#b85c3e",
    "#7d6fb0",
    "#c08448",
    "#4f7f88",
    "#9a6a45",
  ];
  const key = stringValue(category || "All");
  const score = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return colors[score % colors.length];
}

function firstPrice(priceText: string) {
  const match = priceText.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function numberValue(value: unknown) {
  if (value instanceof Element && "value" in value) {
    return numberValue((value as HTMLInputElement).value);
  }
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  if (value instanceof Element && "value" in value) {
    return String((value as HTMLInputElement).value || "").trim();
  }
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function errorMessage(error: unknown) {
  if (isFirebaseAuthConfigurationError(error)) {
    return "Firebase Email/Password sign-in is not enabled for this project yet.";
  }

  if (isFirebaseInvalidCredentialError(error)) {
    return "Firebase did not accept that email and password for this project. Check the Firebase Auth user, password, and project.";
  }

  return error instanceof Error ? error.message : String(error);
}

function isFirebaseAuthConfigurationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

  return (
    code === "auth/configuration-not-found" ||
    message.includes("auth/configuration-not-found")
  );
}

function isFirebaseInvalidCredentialError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

  return (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    message.includes("auth/invalid-credential") ||
    message.includes("auth/user-not-found") ||
    message.includes("auth/wrong-password")
  );
}
