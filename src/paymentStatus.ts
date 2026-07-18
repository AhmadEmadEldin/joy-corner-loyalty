export const canonicalPaymentStatuses = [
  "Unpaid",
  "Partial",
  "Paid",
  "Refunded",
  "Voided",
] as const;

export type CanonicalPaymentStatus = (typeof canonicalPaymentStatuses)[number];

export function normalizeCanonicalPaymentStatus(
  value: unknown,
): CanonicalPaymentStatus {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  if (key === "paid") return "Paid";
  if (key === "partial" || key === "partiallypaid") return "Partial";
  if (key === "refunded" || key === "reversed") return "Refunded";
  if (key === "void" || key === "voided" || key === "cancelled")
    return "Voided";
  return "Unpaid";
}

export function calculatePaymentState(options: {
  amountReceived?: unknown;
  paidAmount?: unknown;
  previousPaidAmount?: unknown;
  refunded?: boolean;
  total?: unknown;
  voided?: boolean;
}) {
  const total = money(options.total);
  const paidAmount = money(options.paidAmount);
  const previousPaidAmount = money(options.previousPaidAmount);
  const amountReceived = money(options.amountReceived);
  const amountApplied = Math.min(paidAmount, total);
  const outstandingAmount = Math.max(total - amountApplied, 0);
  const transactionDue = Math.max(
    total - Math.min(previousPaidAmount, total),
    0,
  );
  const changeAmount = Math.max(amountReceived - transactionDue, 0);
  const status: CanonicalPaymentStatus = options.voided
    ? "Voided"
    : options.refunded
      ? "Refunded"
      : amountApplied <= 0
        ? "Unpaid"
        : amountApplied < total
          ? "Partial"
          : "Paid";

  return {
    amountApplied,
    changeAmount,
    outstandingAmount,
    paidAmount: amountApplied,
    remainingAmount: outstandingAmount,
    status,
  };
}

function money(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error("Money value must be a non-negative number.");
  return Math.round(parsed * 100) / 100;
}
