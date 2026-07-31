import { FormEvent, useEffect, useRef, useState } from "react";
import { lineTotal } from "./CustomerMenu";
import type {
  CartLine,
  CustomerProfile,
  CustomerVoucher,
} from "./repository";

export type CheckoutSubmission = {
  customerNotes: string;
  paymentMethod:
    | "cash_at_cashier"
    | "card_at_branch"
    | "instapay"
    | "manual_transfer";
  voucherCode: string;
};

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

const steps = [
  "Review order",
  "Pickup details",
  "Voucher & rewards",
  "Payment at cashier",
  "Confirm order",
] as const;

export function CustomerCheckout({
  busy,
  cart,
  error,
  freeRewards,
  onClose,
  onSubmit,
  profile,
  vouchers,
}: {
  busy: boolean;
  cart: CartLine[];
  error: string;
  freeRewards: number;
  onClose: () => void;
  onSubmit: (submission: CheckoutSubmission) => Promise<void>;
  profile: CustomerProfile;
  vouchers: CustomerVoucher[];
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [voucherCode, setVoucherCode] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutSubmission["paymentMethod"]>("cash_at_cashier");
  const [customerNotes, setCustomerNotes] = useState("");
  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const validVouchers = vouchers.filter(
    (voucher) =>
      voucher.status === "active" &&
      (!voucher.expires_at || new Date(voucher.expires_at).getTime() > Date.now()),
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shellRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Close checkout"]')
      ?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !shellRef.current) return;
      const focusable = Array.from(
        shellRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [busy, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !cart.length) return;
    await onSubmit({ customerNotes, paymentMethod, voucherCode });
  }

  return (
    <div className="checkout-layer">
      <div
        aria-labelledby="checkout-title"
        aria-modal="true"
        className="checkout-shell"
        ref={shellRef}
        role="dialog"
      >
        <header className="checkout-header">
          <div>
            <p className="eyebrow">Secure checkout</p>
            <h1 id="checkout-title">Complete your Joy Corner order</h1>
          </div>
          <button aria-label="Close checkout" disabled={busy} onClick={onClose} type="button">×</button>
        </header>
        <ol aria-label="Checkout progress" className="checkout-steps">
          {steps.map((label, index) => (
            <li aria-current={step === index ? "step" : undefined} className={step >= index ? "active" : ""} key={label}>
              <span>{index + 1}</span><small>{label}</small>
            </li>
          ))}
        </ol>
        <form onSubmit={submit}>
          <div className="checkout-content">
            {step === 0 ? (
              <section>
                <h2>Review your order</h2>
                <p className="muted">Return to the menu to edit sizes, options, notes, or quantities.</p>
                <div className="checkout-lines">
                  {cart.map((line) => (
                    <article key={line.lineId}>
                      <div>
                        <strong>{line.quantity} × {line.item.name}</strong>
                        <small>{line.size.size_name}{line.modifiers.length ? ` · ${line.modifiers.map((modifier) => modifier.name).join(", ")}` : ""}</small>
                        {line.notes ? <small>Note: {line.notes}</small> : null}
                      </div>
                      <strong>{money.format(lineTotal(line))}</strong>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {step === 1 ? (
              <section>
                <h2>Pickup details</h2>
                <p className="muted">We use your saved profile so you do not have to enter it again.</p>
                <dl className="pickup-summary">
                  <div><dt>Pickup name</dt><dd>{profile.full_name}</dd></div>
                  <div><dt>Phone</dt><dd>{profile.phone || "Not provided"}</dd></div>
                  <div><dt>Service</dt><dd>Pickup at Joy Corner</dd></div>
                </dl>
                <label>
                  Order note
                  <textarea maxLength={500} onChange={(event) => setCustomerNotes(event.target.value)} placeholder="Anything the team should know about this order?" rows={3} value={customerNotes} />
                </label>
              </section>
            ) : null}
            {step === 2 ? (
              <section>
                <h2>Voucher & rewards</h2>
                <div className="reward-checkout-banner"><strong>{freeRewards}</strong><span>free rewards available</span></div>
                {validVouchers.length ? (
                  <div className="checkout-vouchers">
                    {validVouchers.map((voucher) => (
                      <label className={voucherCode === voucher.voucher_code ? "selected" : ""} key={voucher.id}>
                        <input checked={voucherCode === voucher.voucher_code} name="voucher" onChange={() => setVoucherCode(voucher.voucher_code)} type="radio" />
                        <span><strong>{voucher.voucher_code}</strong><small>{voucherBenefit(voucher)}</small></span>
                        <small>{voucher.expires_at ? `Expires ${new Date(voucher.expires_at).toLocaleDateString()}` : "No expiry"}</small>
                      </label>
                    ))}
                    <button className="text-button" onClick={() => setVoucherCode("")} type="button">Do not use a voucher</button>
                  </div>
                ) : <p className="empty-inline">You do not have an eligible voucher right now.</p>}
                <p className="muted">Voucher ownership, expiry, and final discount are verified securely when the cashier confirms the order.</p>
              </section>
            ) : null}
            {step === 3 ? (
              <section>
                <h2>How will you pay at Joy Corner?</h2>
                <p className="muted">No payment is taken in the web app. The cashier records it after confirming your order.</p>
                <div className="payment-options">
                  {([
                    ["cash_at_cashier", "Cash at cashier", "Pay when the cashier confirms your order."],
                    ["card_at_branch", "Card at branch", "Use the card terminal at pickup."],
                    ["instapay", "InstaPay", "The cashier verifies the transfer before marking it paid."],
                    ["manual_transfer", "Manual transfer", "Show your transfer proof to the cashier."],
                  ] as const).map(([value, label, detail]) => (
                    <label className={paymentMethod === value ? "selected" : ""} key={value}>
                      <input checked={paymentMethod === value} name="paymentMethod" onChange={() => setPaymentMethod(value)} type="radio" />
                      <span><strong>{label}</strong><small>{detail}</small></span>
                    </label>
                  ))}
                </div>
                <p className="security-note">The cashier or owner confirms the order first. Only then is it sent to the barista.</p>
              </section>
            ) : null}
            {step === 4 ? (
              <section>
                <h2>Confirm order</h2>
                <dl className="confirmation-summary">
                  <div><dt>Items</dt><dd>{cart.reduce((sum, line) => sum + line.quantity, 0)}</dd></div>
                  <div><dt>Pickup name</dt><dd>{profile.full_name}</dd></div>
                  <div><dt>Payment</dt><dd>{paymentMethod.replace(/_/g, " ")}</dd></div>
                  <div><dt>Voucher</dt><dd>{voucherCode || "None"}</dd></div>
                  <div><dt>Subtotal</dt><dd>{money.format(subtotal)}</dd></div>
                  <div className="grand-total"><dt>Estimated total</dt><dd>{money.format(subtotal)}</dd></div>
                </dl>
                <p className="muted">The secure server revalidates availability, prices, and any voucher before creating your order. The cashier will confirm the final payable amount.</p>
              </section>
            ) : null}
            {error ? <p className="checkout-error" role="alert">{error}</p> : null}
          </div>
          <footer className="checkout-actions">
            <button className="button-secondary" disabled={busy} onClick={() => step === 0 ? onClose() : setStep((value) => value - 1)} type="button">{step === 0 ? "Back to menu" : "Back"}</button>
            {step < steps.length - 1 ? (
              <button disabled={!cart.length} onClick={() => setStep((value) => value + 1)} type="button">Continue</button>
            ) : (
              <button disabled={busy || !cart.length} type="submit">{busy ? "Sending securely…" : "Place order"}</button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}

function voucherBenefit(voucher: CustomerVoucher): string {
  if (voucher.voucher_type === "fixed" && voucher.fixed_value) return `${money.format(voucher.fixed_value)} off`;
  if (voucher.voucher_type === "percentage" && voucher.percentage_value) return `${voucher.percentage_value}% off`;
  return "Free eligible item";
}
