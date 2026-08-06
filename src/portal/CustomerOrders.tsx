import type {
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderModifier,
} from "./repository";
import { BrandLogo } from "./BrandLogo";
import { statusLabel } from "./workflow";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

const stages = [
  ["pending_confirmation", "Sent to cashier"],
  ["confirmed", "Cashier confirmed"],
  ["accepted", "Barista accepted"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["picked_up", "Picked up"],
  ["closed", "Completed"],
] as const;

export function CustomerOrders({
  items,
  mode,
  modifiers,
  onCancel,
  onReturnToMenu,
  orders,
  realtimeState,
  selectedOrderId,
  onSelectOrder,
}: {
  items: CustomerOrderItem[];
  mode: "orders" | "receipts" | "unpaid";
  modifiers: CustomerOrderModifier[];
  onCancel: (order: CustomerOrder) => Promise<void>;
  onReturnToMenu: () => void;
  orders: CustomerOrder[];
  realtimeState: "connected" | "reconnecting";
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string | null) => void;
}) {
  const visible = orders.filter((order) => {
    if (mode === "unpaid") return order.payment_status !== "paid";
    if (mode === "receipts")
      return ["picked_up", "closed"].includes(order.status);
    return true;
  });
  const selected = orders.find((order) => order.id === selectedOrderId) || null;

  if (selected) {
    return (
      <OrderReceipt
        items={items.filter((item) => item.order_id === selected.id)}
        modifiers={modifiers}
        onBack={() => onSelectOrder(null)}
        onCancel={onCancel}
        onReturnToMenu={onReturnToMenu}
        order={selected}
        realtimeState={realtimeState}
      />
    );
  }

  return (
    <section className="customer-orders-page">
      <header className="section-title-row">
        <div>
          <p className="eyebrow">Your Joy Corner history</p>
          <h2>
            {mode === "orders"
              ? "My orders"
              : mode === "receipts"
                ? "Receipts"
                : "Unpaid receipts"}
          </h2>
        </div>
        <span className={`realtime-indicator ${realtimeState}`}>
          <i />{" "}
          {realtimeState === "connected" ? "Live updates" : "Reconnecting…"}
        </span>
      </header>
      {visible.length ? (
        <div className="customer-order-list">
          {visible.map((order) => (
            <article className="customer-order-summary" key={order.id}>
              <div>
                <small>{new Date(order.created_at).toLocaleString()}</small>
                <h3>{order.order_number}</h3>
                <span className={`status-pill status-${order.status}`}>
                  {statusLabel(order.status)}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Total</dt>
                  <dd>{money.format(order.total)}</dd>
                </div>
                <div>
                  <dt>Payment</dt>
                  <dd>
                    {money.format(order.paid_amount)} paid ·{" "}
                    {money.format(order.remaining_amount)} remaining
                  </dd>
                </div>
                <div>
                  <dt>Pickup</dt>
                  <dd>{order.pickup_name}</dd>
                </div>
              </dl>
              <button onClick={() => onSelectOrder(order.id)} type="button">
                {mode === "orders" ? "Track & view" : "View receipt"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="orders-empty-state">
          <img alt="" src="/assets/joy-corner-emblem-v2.png" />
          <h3>
            {mode === "unpaid" ? "You are all paid up" : "Nothing here yet"}
          </h3>
          <p>
            {mode === "receipts"
              ? "Completed orders will become receipts here."
              : "Your Joy Corner orders will appear here."}
          </p>
          <button onClick={onReturnToMenu} type="button">
            Browse the menu
          </button>
        </div>
      )}
    </section>
  );
}

function OrderReceipt({
  items,
  modifiers,
  onBack,
  onCancel,
  onReturnToMenu,
  order,
  realtimeState,
}: {
  items: CustomerOrderItem[];
  modifiers: CustomerOrderModifier[];
  onBack: () => void;
  onCancel: (order: CustomerOrder) => Promise<void>;
  onReturnToMenu: () => void;
  order: CustomerOrder;
  realtimeState: "connected" | "reconnecting";
}) {
  const terminalFailure =
    order.status === "rejected" || order.status === "cancelled";
  const stageIndex = currentStageIndex(order.status);
  return (
    <section className="order-success-page">
      <div className="receipt-toolbar no-print">
        <button className="button-secondary" onClick={onBack} type="button">
          ← All orders
        </button>
        <span className={`realtime-indicator ${realtimeState}`}>
          <i />{" "}
          {realtimeState === "connected" ? "Tracking live" : "Reconnecting…"}
        </span>
        <button onClick={() => window.print()} type="button">
          Print receipt
        </button>
      </div>
      <div className="order-confirmation-hero">
        <BrandLogo stacked />
        <p>
          {terminalFailure
            ? "Order update"
            : order.status === "pending_confirmation"
              ? "Your order has been sent to the cashier for confirmation."
              : "Follow your Joy Corner order live"}
        </p>
        <strong>{order.order_number}</strong>
        <span className={`status-pill status-${order.status}`}>
          {statusLabel(order.status)}
        </span>
      </div>
      {terminalFailure ? (
        <div className="order-failure-state" role="status">
          <h2>
            {order.status === "rejected"
              ? "This order was not confirmed"
              : "This order was cancelled"}
          </h2>
          <p>
            {order.rejection_reason ||
              order.cancellation_reason ||
              "Please speak with the Joy Corner team if you need help."}
          </p>
          {order.payment_status === "paid" ? (
            <p>Ask the cashier for payment or refund guidance.</p>
          ) : null}
        </div>
      ) : (
        <ol aria-label="Order progress" className="order-stage-track">
          {stages.map(([status, label], index) => (
            <li
              aria-current={index === stageIndex ? "step" : undefined}
              className={index <= stageIndex ? "complete" : ""}
              key={status}
            >
              <span>{index < stageIndex ? "✓" : index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>
      )}
      <article className="digital-receipt">
        <header>
          <div>
            <small>Order number</small>
            <strong>{order.order_number}</strong>
          </div>
          <div>
            <small>Date & time</small>
            <strong>{new Date(order.created_at).toLocaleString()}</strong>
          </div>
          <div>
            <small>Pickup name</small>
            <strong>{order.pickup_name}</strong>
          </div>
          <div>
            <small>Payment</small>
            <strong>
              {order.payment_method?.replace(/_/g, " ") || "Not selected"} ·{" "}
              {order.payment_status.replace(/_/g, " ")}
            </strong>
          </div>
        </header>
        <div className="receipt-items">
          {items.map((item) => {
            const itemModifiers = modifiers.filter(
              (modifier) => modifier.order_item_id === item.id,
            );
            return (
              <div className="receipt-item" key={item.id}>
                <span>
                  <strong>
                    {item.quantity} × {item.item_name_snapshot}
                  </strong>
                  <small>
                    {item.size_name}
                    {itemModifiers.length
                      ? ` · ${itemModifiers.map((modifier) => modifier.modifier_name_snapshot).join(", ")}`
                      : ""}
                  </small>
                  {item.customer_notes ? (
                    <small>Note: {item.customer_notes}</small>
                  ) : null}
                </span>
                <strong>{money.format(item.total_price)}</strong>
              </div>
            );
          })}
        </div>
        <dl className="receipt-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money.format(order.subtotal)}</dd>
          </div>
          {order.discount_total ? (
            <div>
              <dt>Discount</dt>
              <dd>− {money.format(order.discount_total)}</dd>
            </div>
          ) : null}
          {order.voucher_discount ? (
            <div>
              <dt>Voucher</dt>
              <dd>− {money.format(order.voucher_discount)}</dd>
            </div>
          ) : null}
          {order.tax_total ? (
            <div>
              <dt>Tax</dt>
              <dd>{money.format(order.tax_total)}</dd>
            </div>
          ) : null}
          <div className="grand-total">
            <dt>Total</dt>
            <dd>{money.format(order.total)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{money.format(order.paid_amount)}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{money.format(order.remaining_amount)}</dd>
          </div>
        </dl>
        {order.customer_notes ? (
          <p className="receipt-customer-note">
            <strong>Your order note:</strong> {order.customer_notes}
          </p>
        ) : null}
        <footer>
          Thank you for choosing Joy Corner. Your time, your coffee.
        </footer>
      </article>
      <div className="receipt-actions no-print">
        {order.status === "pending_confirmation" ? (
          <button
            className="button-secondary"
            onClick={() => void onCancel(order)}
            type="button"
          >
            Cancel request
          </button>
        ) : null}
        <button onClick={onReturnToMenu} type="button">
          Return to menu
        </button>
      </div>
    </section>
  );
}

function currentStageIndex(status: CustomerOrder["status"]): number {
  const index = stages.findIndex(([value]) => value === status);
  return Math.max(0, index);
}
