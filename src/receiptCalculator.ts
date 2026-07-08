export type ReceiptLineInput = {
  discount?: number;
  qty?: number;
  unitPrice?: number;
};

export type PaymentStatus = "Paid" | "Partial" | "Unpaid";

const MONEY_SCALE = 100;

export function calculateReceiptLine(input: ReceiptLineInput) {
  const qty = Math.max(1, wholeNumber(input.qty, 1));
  const unitPrice = moneyNumber(input.unitPrice);
  const discount = Math.min(moneyNumber(input.discount), qty * unitPrice);
  const total = fromCents(toCents(qty * unitPrice) - toCents(discount));

  return {
    discount,
    qty,
    total,
    unitPrice,
  };
}

export function normalizePaidAmount(
  paymentStatus: string,
  requestedPaidAmount: number,
  receiptTotal: number,
) {
  const status = normalizePaymentStatus(paymentStatus);
  const total = moneyNumber(receiptTotal);

  if (status === "Paid") return total;
  if (status === "Unpaid") return 0;

  return Math.min(total, moneyNumber(requestedPaidAmount));
}

export function normalizePaymentStatus(value: string): PaymentStatus {
  const status = value.trim().toLowerCase();
  if (status === "partial" || status === "partially paid") return "Partial";
  if (status === "unpaid") return "Unpaid";
  return "Paid";
}

function moneyNumber(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? fromCents(toCents(parsed)) : 0;
}

function wholeNumber(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? fallback).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function toCents(value: number) {
  return Math.round(value * MONEY_SCALE);
}

function fromCents(value: number) {
  return value / MONEY_SCALE;
}
