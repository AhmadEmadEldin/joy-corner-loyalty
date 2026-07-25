import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CustomerCheckout, CheckoutSubmission } from "./CustomerCheckout";
import { CustomerMenu } from "./CustomerMenu";
import { CustomerNavigation, CustomerSection } from "./CustomerNavigation";
import { CustomerOrders } from "./CustomerOrders";
import {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function CustomerPortal() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    void restoreSession().then((sessionUser) => {
      setUser(sessionUser);
      setCheckingSession(false);
    });
    const unsubscribe = subscribeToSession((sessionUser) => {
      setUser(sessionUser);
      setCheckingSession(false);
    });
    return unsubscribe;
  }, []);

  if (checkingSession) {
    return (
      <main className="joy-portal center-state" aria-busy="true">
        <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
        <p>Preparing your Joy Corner account…</p>
      </main>
    );
  }
  return user ? <CustomerWorkspace user={user} /> : <CustomerAccess />;
}

function CustomerAccess() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "signup") {
        await signUpCustomer({
          email: String(form.get("email") || ""),
          fullName: String(form.get("fullName") || ""),
          marketingConsent: form.get("marketingConsent") === "on",
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
          {mode === "login" ? "Welcome back" : "Create your customer account"}
        </h1>
        <p className="muted">
          Order ahead, follow preparation live, and keep every reward in one
          place.
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
          <label>
            Password
            <input
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          {mode === "signup" ? (
            <label className="consent-checkbox">
              <input name="marketingConsent" type="checkbox" />
              <span>I agree to receive Joy Corner offers and marketing emails.</span>
            </label>
          ) : null}
          <button disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        {message ? (
          <p className="status-note" role="status">
            {message}
          </p>
        ) : null}
        <button
          className="button-secondary"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          type="button"
        >
          {mode === "login"
            ? "New customer? Create account"
            : "Already registered? Sign in"}
        </button>
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

  const refreshDashboard = useCallback(async () => {
    try {
      applyDashboard(await loadCustomerDashboard());
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [applyDashboard]);

  const refresh = useCallback(async () => {
    try {
      const [nextMenu, nextProfile, dashboard] = await Promise.all([
        loadMenu(),
        loadCustomerProfile(),
        loadCustomerDashboard(),
      ]);
      setMenu(nextMenu);
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
        refreshTimer = window.setTimeout(() => void refreshDashboard(), 150);
      },
      (connected) => setRealtimeState(connected ? "connected" : "reconnecting"),
    );
    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [refresh, refreshDashboard, user.id]);

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
    if (busy || !cart.length) return;
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
        Loading your live menu and rewards…
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="joy-portal center-state">
        <p role="alert">
          {message || "Your customer profile could not be loaded."}
        </p>
        <button onClick={() => void refresh()} type="button">
          Try again
        </button>
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
          <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
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
          onCheckout={() => cart.length && setCheckoutOpen(true)}
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
      {section === "vouchers" ? <VouchersPanel vouchers={vouchers} /> : null}
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
  onMenu,
  orders,
  profile,
  rewards,
  vouchers,
}: {
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
    (order) => !["closed", "rejected", "cancelled"].includes(order.status),
  );
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
        <article>
          <small>Reward points</small>
          <strong>{rewards.points_balance}</strong>
          <span>{rewards.free_rewards_available} free rewards ready</span>
        </article>
        <article>
          <small>Available vouchers</small>
          <strong>{vouchers.length}</strong>
          <span>Saved to your account</span>
        </article>
        <article>
          <small>Current order</small>
          <strong>{currentOrder?.order_number || "—"}</strong>
          <span>
            {currentOrder
              ? currentOrder.status.replace(/_/g, " ")
              : "No active order"}
          </span>
        </article>
      </div>
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
      <p className="eyebrow">Joy Corner Loyalty</p>
      <h2>Your rewards</h2>
      <div className="reward-grid">
        <article className="reward-stat">
          <strong>{rewards.points_balance}</strong>
          <span>Points</span>
        </article>
        <article className="reward-stat">
          <strong>{progress}/7</strong>
          <span>Drinks toward the next reward</span>
        </article>
        <article className="reward-stat">
          <strong>{rewards.free_rewards_available}</strong>
          <span>Free rewards</span>
        </article>
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

function VouchersPanel({ vouchers }: { vouchers: CustomerVoucher[] }) {
  return (
    <section className="portal-section customer-detail-page">
      <p className="eyebrow">Saved offers</p>
      <h2>Your vouchers</h2>
      {vouchers.length ? (
        <div className="voucher-grid">
          {vouchers.map((voucher) => (
            <article className="voucher-card" key={voucher.id}>
              <span>{voucher.status}</span>
              <strong>{voucher.voucher_code}</strong>
              <p>{voucher.voucher_type.replace(/_/g, " ")}</p>
              <small>
                {voucher.expires_at
                  ? `Expires ${new Date(voucher.expires_at).toLocaleDateString()}`
                  : "No expiry"}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No vouchers yet.</p>
      )}
    </section>
  );
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
      <p className="eyebrow">Live account updates</p>
      <h2>Notifications</h2>
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
        <p className="muted">You are all caught up.</p>
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
        marketingConsent: form.get("marketingConsent") === "on",
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
      <p className="eyebrow">Customer {profile.customer_number}</p>
      <h2>Your profile</h2>
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
        <label className="consent-checkbox">
          <input
            defaultChecked={Boolean((profile as Record<string, unknown>).marketingConsent)}
            name="marketingConsent"
            type="checkbox"
          />
          <span>I agree to receive Joy Corner offers and marketing emails.</span>
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
