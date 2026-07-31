import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CustomerCheckout, CheckoutSubmission } from "./CustomerCheckout";
import { CustomerMenu } from "./CustomerMenu";
import { CustomerNavigation, CustomerSection } from "./CustomerNavigation";
import { CustomerOrders } from "./CustomerOrders";
import {
  currentSessionUser,
  restoreSession,
  subscribeToSession,
  type SessionUser,
} from "./client";
import {
  clearCartDraft,
  createOrderIdempotencyKey,
  loadCartDraft,
  saveCartDraft,
} from "./cartDraft";
import {
  CartLine,
  CustomerNotification,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderModifier,
  CustomerProfile,
  CustomerVoucher,
  changeOrderStatus,
  loadCustomerDashboard,
  loadCustomerProfile,
  loadMenu,
  markNotificationRead,
  MenuItem,
  placeCustomerOrder,
  signInCustomer,
  signOutCustomer,
  signUpCustomer,
  subscribeToCustomerChanges,
  updateCustomerProfile,
} from "./repository";
import {
  cartCanCheckout,
  reconcileCartWithMenu,
} from "./cartReconciliation";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
} from "../components/JoyUI";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function CustomerPortal() {
  const [user, setUser] = useState<SessionUser | null>(currentSessionUser);
  const [checkingSession, setCheckingSession] = useState(() =>
    Boolean(currentSessionUser()),
  );

  useEffect(() => {
    if (currentSessionUser()) {
      void restoreSession().then((sessionUser) => {
        setUser(sessionUser);
        setCheckingSession(false);
      });
    } else {
      setCheckingSession(false);
    }
    const unsubscribe = subscribeToSession((sessionUser) => {
      setUser(sessionUser);
      setCheckingSession(false);
    });
    return unsubscribe;
  }, []);

  if (checkingSession) {
    return (
      <main className="joy-portal center-state" aria-busy="true">
        <LoadingState label="Preparing your Joy Corner account…" />
      </main>
    );
  }
  return user ? <CustomerWorkspace user={user} /> : <CustomerAccess />;
}

function CustomerAccess() {
  const [mode, setMode] = useState<"login" | "recovery" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "recovery") {
        setMessage(
          "Online password recovery is not configured yet. Please contact Joy Corner and keep this email available for verification.",
        );
        return;
      }
      if (mode === "signup") {
        if (String(form.get("password")) !== String(form.get("confirmPassword"))) {
          setMessage("Passwords do not match.");
          return;
        }
        await signUpCustomer({
          email: String(form.get("email") || ""),
          fullName: String(form.get("fullName") || ""),
          password: String(form.get("password") || ""),
          phone: String(form.get("phone") || ""),
        });
        setMessage(
          "Account created. Check your email if confirmation is enabled.",
        );
      } else {
        await signInCustomer(
          String(form.get("email") || ""),
          String(form.get("password") || ""),
        );
      }
    } catch (error) {
      setMessage(errorMessage(error));
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
        <p className="eyebrow">Joy Corner Loyalty</p>
        <h1>
          {mode === "login"
            ? "Welcome back"
            : mode === "signup"
              ? "Create your customer account"
              : "Recover your account"}
        </h1>
        <p className="muted">
          {mode === "recovery"
            ? "Enter the email connected to your Joy Corner account."
            : "Order ahead, follow preparation live, and keep every reward in one place."}
        </p>
        <form className="customer-order-form" onSubmit={submit}>
          {mode === "signup" ? (
            <>
              <label>
                Full name
                <input autoComplete="name" name="fullName" required />
              </label>
              <label>
                Phone
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  name="phone"
                  pattern="\+?[0-9]{8,15}"
                  required
                />
              </label>
            </>
          ) : null}
          <label>
            Email
            <input autoComplete="email" name="email" required type="email" />
          </label>
          {mode !== "recovery" ? (
            <div className="auth-field">
              <label htmlFor="customer-password">Password</label>
              <span className="password-input">
                <input
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  name="password"
                  id="customer-password"
                  required
                  type={showPassword ? "text" : "password"}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="auth-field-action"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </div>
          ) : null}
          {mode === "signup" ? (
            <>
              <label>
                Confirm password
                <input
                  autoComplete="new-password"
                  minLength={8}
                  name="confirmPassword"
                  required
                  type={showPassword ? "text" : "password"}
                />
              </label>
              <label className="auth-terms">
                <input name="terms" required type="checkbox" />
                <span>I agree to the Joy Corner account terms.</span>
              </label>
            </>
          ) : null}
          <button disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Continue"}
          </button>
        </form>
        {message ? (
          <p className="status-note" role="status">
            {message}
          </p>
        ) : null}
        <div className="auth-secondary-actions">
          {mode === "login" ? (
            <button
              className="button-secondary"
              onClick={() => {
                setMessage("");
                setMode("recovery");
              }}
              type="button"
            >
              Forgot password?
            </button>
          ) : null}
          <button
            className="button-secondary"
            onClick={() => {
              setMessage("");
              setMode(mode === "signup" ? "login" : mode === "recovery" ? "login" : "signup");
            }}
            type="button"
          >
            {mode === "login"
              ? "New customer? Create account"
              : "Back to sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}

function CustomerWorkspace({ user }: { user: SessionUser }) {
  const initialDraft = useMemo(() => loadCartDraft(user.id), [user.id]);
  const [section, setSection] = useState<CustomerSection>("menu");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>(initialDraft?.cart || []);
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState(
    initialDraft?.idempotencyKey || createOrderIdempotencyKey(),
  );
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [orderItems, setOrderItems] = useState<CustomerOrderItem[]>([]);
  const [orderModifiers, setOrderModifiers] = useState<CustomerOrderModifier[]>(
    [],
  );
  const [notifications, setNotifications] = useState<CustomerNotification[]>(
    [],
  );
  const [rewards, setRewards] = useState({
    eligible_purchase_count: 0,
    free_rewards_available: 0,
    points_balance: 0,
  });
  const [vouchers, setVouchers] = useState<CustomerVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<
    "connected" | "reconnecting"
  >("reconnecting");

  const applyDashboard = useCallback(
    (dashboard: Awaited<ReturnType<typeof loadCustomerDashboard>>) => {
      setOrders(dashboard.orders);
      setOrderItems(dashboard.orderItems);
      setOrderModifiers(dashboard.orderModifiers);
      setRewards(
        dashboard.rewards || {
          eligible_purchase_count: 0,
          free_rewards_available: 0,
          points_balance: 0,
        },
      );
      setVouchers(dashboard.vouchers);
      setNotifications(dashboard.notifications);
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const [nextMenu, nextProfile, dashboard] = await Promise.all([
        loadMenu(),
        loadCustomerProfile(),
        loadCustomerDashboard(),
      ]);
      setMenu(nextMenu);
      setCart((current) => reconcileCartWithMenu(current, nextMenu));
      setProfile(nextProfile);
      applyDashboard(dashboard);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [applyDashboard]);

  useEffect(() => {
    void refresh();
    let refreshTimer: number | undefined;
    const unsubscribe = subscribeToCustomerChanges(
      user.id,
      () => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => void refresh(), 150);
      },
      (connected) => setRealtimeState(connected ? "connected" : "reconnecting"),
    );
    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [refresh, user.id]);

  useEffect(() => {
    saveCartDraft(user.id, cart, orderIdempotencyKey);
  }, [cart, orderIdempotencyKey, user.id]);

  const cartQuantity = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart],
  );
  const activeVouchers = vouchers.filter(
    (voucher) =>
      voucher.status === "active" &&
      (!voucher.expires_at ||
        new Date(voucher.expires_at).getTime() > Date.now()),
  );
  const unreadNotifications = notifications.filter(
    (notification) => !notification.read,
  );
  const unpaidOrders = orders.filter(
    (order) => order.payment_status !== "paid",
  );

  async function submitOrder(submission: CheckoutSubmission) {
    if (busy || !cartCanCheckout(cart)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await placeCustomerOrder({
        cart,
        idempotencyKey: orderIdempotencyKey,
        ...submission,
      });
      clearCartDraft(user.id);
      setCart([]);
      setOrderIdempotencyKey(createOrderIdempotencyKey());
      setCheckoutOpen(false);
      setSelectedOrderId(result.orderId);
      setSection("orders");
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(order: CustomerOrder) {
    const reason = window.prompt(
      "Please tell us why you want to cancel this request.",
    );
    if (!reason?.trim()) return;
    try {
      await changeOrderStatus(order.id, "cancelled", reason.trim());
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  if (!profile && loading) {
    return (
      <main className="joy-portal center-state" aria-busy="true">
        <LoadingState label="Loading your live menu and rewards…" />
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="joy-portal center-state">
        <ErrorState
          message={message || "Your customer profile could not be loaded."}
          onRetry={() => void refresh()}
        />
      </main>
    );
  }

  return (
    <main className="joy-portal customer-app-shell">
      <header className="customer-topbar">
        <CustomerNavigation
          active={section}
          badges={{
            cart: cartQuantity,
            notifications: unreadNotifications.length,
            unpaid: unpaidOrders.length,
            vouchers: activeVouchers.length,
          }}
          onNavigate={(next) => {
            setSelectedOrderId(null);
            setSection(next);
          }}
          onSignOut={() => void signOutCustomer()}
        />
        <button
          className="customer-brand"
          onClick={() => setSection("home")}
          type="button"
        >
          <img alt="" src="/assets/joy-corner-mark.png" />
          <span>
            <strong>Joy Corner</strong>
            <small>Coffee &amp; Story</small>
          </span>
        </button>
        <div className="customer-account-actions">
          <button
            aria-label="View notifications"
            onClick={() => setSection("notifications")}
            type="button"
          >
            Updates
            {unreadNotifications.length ? (
              <span>{unreadNotifications.length}</span>
            ) : null}
          </button>
          <button
            className="button-secondary"
            onClick={() => void signOutCustomer()}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>
      {message ? (
        <p className="portal-message" role="status">
          {message}
        </p>
      ) : null}
      {section === "home" ? (
        <CustomerHome
          menu={menu}
          onMenu={() => setSection("menu")}
          orders={orders}
          profile={profile}
          rewards={rewards}
          vouchers={activeVouchers}
        />
      ) : null}
      {section === "menu" || section === "cart" ? (
        <CustomerMenu
          cart={cart}
          loading={loading}
          menu={menu}
          onCartChange={setCart}
          onCheckout={() => {
            if (cartCanCheckout(cart)) setCheckoutOpen(true);
            else {
              setMessage(
                "Review changed prices or remove unavailable items before checkout.",
              );
            }
          }}
        />
      ) : null}
      {section === "orders" ||
      section === "receipts" ||
      section === "unpaid" ? (
        <CustomerOrders
          items={orderItems}
          mode={section}
          modifiers={orderModifiers}
          onCancel={cancelOrder}
          onReturnToMenu={() => {
            setSelectedOrderId(null);
            setSection("menu");
          }}
          onSelectOrder={setSelectedOrderId}
          orders={orders}
          realtimeState={realtimeState}
          selectedOrderId={selectedOrderId}
        />
      ) : null}
      {section === "rewards" ? <RewardsPanel rewards={rewards} /> : null}
      {section === "vouchers" ? (
        <VouchersPanel customerName={profile.full_name} vouchers={vouchers} />
      ) : null}
      {section === "notifications" ? (
        <NotificationsPanel
          notifications={notifications}
          onRead={async (id) => {
            await markNotificationRead(id);
            await refresh();
          }}
        />
      ) : null}
      {section === "profile" ? (
        <ProfileForm profile={profile} onSaved={refresh} />
      ) : null}
      {checkoutOpen ? (
        <CustomerCheckout
          busy={busy}
          cart={cart}
          error={message}
          freeRewards={rewards.free_rewards_available}
          onClose={() => !busy && setCheckoutOpen(false)}
          onSubmit={submitOrder}
          profile={profile}
          vouchers={vouchers}
        />
      ) : null}
    </main>
  );
}

function CustomerHome({
  menu,
  onMenu,
  orders,
  profile,
  rewards,
  vouchers,
}: {
  menu: MenuItem[];
  onMenu: () => void;
  orders: CustomerOrder[];
  profile: CustomerProfile;
  rewards: {
    eligible_purchase_count: number;
    free_rewards_available: number;
    points_balance: number;
  };
  vouchers: CustomerVoucher[];
}) {
  const currentOrder = orders.find(
    (order) => !["picked_up", "rejected", "cancelled"].includes(order.status),
  );
  const categories = Array.from(
    menu.reduce((result, item) => {
      result.set(item.category, (result.get(item.category) || 0) + 1);
      return result;
    }, new Map<string, number>()),
  );
  const featured = menu.filter((item) => item.available).slice(0, 4);
  return (
    <section className="customer-home">
      <div className="customer-hero">
        <div>
          <p className="eyebrow">
            Welcome back, {profile.full_name.split(" ")[0]}
          </p>
          <h1>
            Your time.
            <br />
            Your coffee.
          </h1>
          <p>
            Fresh coffee, quick ordering, and every Joy Corner reward in one
            warm place.
          </p>
          <button onClick={onMenu} type="button">
            Start an order
          </button>
        </div>
        <img
          alt="Joy Corner coffee moment"
          src="/assets/joy-reference-hero.png"
        />
      </div>
      <div className="home-summary-grid">
        <MetricCard
          hint={`${rewards.free_rewards_available} free rewards ready`}
          icon="rewards"
          label="Reward points"
          value={rewards.points_balance}
        />
        <MetricCard
          hint="Saved to your account"
          icon="voucher"
          label="Available vouchers"
          value={vouchers.length}
        />
        <MetricCard
          hint={
            currentOrder
              ? currentOrder.status.replace(/_/g, " ")
              : "No active order"
          }
          icon="orders"
          label="Current order"
          value={currentOrder?.order_number || "—"}
        />
      </div>
      {categories.length ? (
        <section className="customer-home-section">
          <PageHeader
            action={<button onClick={onMenu} type="button">View full menu</button>}
            description="Browse the live Joy Corner menu by category."
            eyebrow="Freshly prepared"
            title="Explore the menu"
          />
          <div className="customer-category-grid">
            {categories.map(([name, count]) => {
              const image = menu.find(
                (item) => item.category === name && item.image_url,
              )?.image_url;
              return (
                <button key={name} onClick={onMenu} type="button">
                  <img
                    alt=""
                    decoding="async"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                    }}
                    src={image || "/assets/coffee-bean-field.jpg"}
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>{count} {count === 1 ? "item" : "items"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {featured.length ? (
        <section className="customer-home-section">
          <PageHeader
            description="Available now and selected from the live menu."
            eyebrow="Joy Corner favorites"
            title="Featured products"
          />
          <div className="customer-featured-grid">
            {featured.map((item) => (
              <button key={item.id} onClick={onMenu} type="button">
                <img
                  alt={item.name}
                  decoding="async"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                  }}
                  src={item.image_url || "/assets/coffee-bean-field.jpg"}
                />
                <span>
                  <small>{item.category}</small>
                  <strong>{item.name}</strong>
                  <em>
                    {item.sizes[0]
                      ? `From ${money.format(item.sizes[0].price)}`
                      : "Unavailable"}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function RewardsPanel({
  rewards,
}: {
  rewards: {
    eligible_purchase_count: number;
    free_rewards_available: number;
    points_balance: number;
  };
}) {
  const progress = rewards.eligible_purchase_count % 7;
  return (
    <section className="portal-section customer-detail-page">
      <PageHeader
        description="Track eligible purchases and rewards calculated from your completed orders."
        eyebrow="Joy Corner Loyalty"
        title="Your rewards"
      />
      <div className="reward-grid">
        <MetricCard label="Points" value={rewards.points_balance} />
        <MetricCard label="Drinks toward the next reward" value={`${progress}/7`} />
        <MetricCard label="Free rewards" value={rewards.free_rewards_available} />
      </div>
      <div className="loyalty-progress">
        <span style={{ width: `${(progress / 7) * 100}%` }} />
      </div>
      <p className="muted">
        Every seven paid eligible drinks unlocks one free reward after the order
        is closed.
      </p>
    </section>
  );
}

function VouchersPanel({
  customerName,
  vouchers,
}: {
  customerName: string;
  vouchers: CustomerVoucher[];
}) {
  const [copied, setCopied] = useState("");
  return (
    <section className="portal-section customer-detail-page">
      <PageHeader
        description="Personal rewards secured to your Joy Corner account."
        eyebrow="From farm to cup"
        title="Your vouchers"
      />
      {vouchers.length ? (
        <div className="voucher-grid">
          {vouchers.map((voucher) => (
            <article
              className={`voucher-card voucher-${voucher.status}`}
              key={voucher.id}
            >
              <img
                alt=""
                decoding="async"
                loading="lazy"
                src="/assets/joy-reference-hero.png"
              />
              <div className="voucher-card-content">
                <header>
                  <div className="voucher-card-brand">
                    <img alt="" src="/assets/joy-corner-mark.png" />
                    <span>
                      <strong>Joy Corner</strong>
                      <small>Coffee &amp; Story</small>
                    </span>
                  </div>
                  <span>{voucher.status}</span>
                </header>
                <p className="eyebrow">A Joy Corner reward for</p>
                <h3>{customerName}</h3>
                <strong className="voucher-benefit">
                  {customerVoucherBenefit(voucher)}
                </strong>
                <div className="voucher-code-row">
                  <code>{voucher.voucher_code}</code>
                  <button
                    disabled={voucher.status !== "active"}
                    onClick={async () => {
                      await navigator.clipboard.writeText(voucher.voucher_code);
                      setCopied(voucher.id);
                    }}
                    type="button"
                  >
                    {copied === voucher.id ? "Copied" : "Copy code"}
                  </button>
                </div>
                <small>
                  {voucher.expires_at
                    ? `Expires ${new Date(voucher.expires_at).toLocaleDateString()}`
                    : "No expiry"}
                </small>
                <p className="voucher-terms">
                  Eligibility and final value are verified when the order is
                  submitted. Each voucher can be redeemed once.
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Eligible vouchers will appear here automatically when they are assigned to your account."
          icon="voucher"
          title="No vouchers yet"
        />
      )}
    </section>
  );
}

function customerVoucherBenefit(voucher: CustomerVoucher): string {
  if (voucher.fixed_value) return `${money.format(voucher.fixed_value)} off`;
  if (voucher.percentage_value) return `${voucher.percentage_value}% off`;
  return "Free eligible item";
}

function NotificationsPanel({
  notifications,
  onRead,
}: {
  notifications: CustomerNotification[];
  onRead: (id: string) => Promise<void>;
}) {
  return (
    <section className="portal-section customer-detail-page">
      <PageHeader
        description="Order, reward, voucher, and account activity will appear here."
        eyebrow="Live account updates"
        title="Notifications"
      />
      {notifications.length ? (
        <div className="notification-list">
          {notifications.map((notification) => (
            <article
              className={notification.read ? "" : "unread"}
              key={notification.id}
            >
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
                <small>
                  {new Date(notification.created_at).toLocaleString()}
                </small>
              </div>
              {!notification.read ? (
                <button
                  onClick={() => void onRead(notification.id)}
                  type="button"
                >
                  Mark read
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="There are no unread or historical account updates to show."
          icon="bell"
          title="You are all caught up"
        />
      )}
    </section>
  );
}

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: CustomerProfile;
  onSaved: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await updateCustomerProfile({
        dateOfBirth: String(form.get("dateOfBirth") || "") || null,
        favoriteDrink: String(form.get("favoriteDrink") || "") || null,
        fullName: String(form.get("fullName") || ""),
        phone: String(form.get("phone") || ""),
      });
      await onSaved();
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="portal-section customer-detail-page">
      <PageHeader
        description="Keep your contact and preference information current."
        eyebrow={`Customer ${profile.customer_number}`}
        title="Your profile"
      />
      <form className="profile-grid" onSubmit={submit}>
        <label>
          Full name
          <input
            autoComplete="name"
            defaultValue={profile.full_name}
            name="fullName"
            required
          />
        </label>
        <label>
          Email
          <input disabled value={profile.email || ""} />
        </label>
        <label>
          Phone
          <input
            autoComplete="tel"
            defaultValue={profile.phone || ""}
            name="phone"
            pattern="\+?[0-9]{8,15}"
            required
          />
        </label>
        <label>
          Date of birth
          <input
            defaultValue={profile.date_of_birth || ""}
            name="dateOfBirth"
            type="date"
          />
        </label>
        <label>
          Favorite drink
          <input
            defaultValue={profile.favorite_drink || ""}
            name="favoriteDrink"
          />
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
