export type ReceiptLineInput = {
  qty?: number;
  unitPrice?: number;
};

export type ReceiptDiscountItem = {
  qty?: number;
  unitPrice?: number;
};

export type PaymentStatus = "Paid" | "Partial" | "Unpaid";

const MONEY_SCALE = 100;

export function calculateReceiptLine(input: ReceiptLineInput) {
  const qty = Math.max(1, wholeNumber(input.qty, 1));
  const unitPrice = moneyNumber(input.unitPrice);
  const total = fromMinorUnits(toMinorUnits(qty * unitPrice));

  return {
    discount: 0,
    qty,
    total,
    unitPrice,
  };
}

export function normalizeReceiptDiscountPercentage(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const parsed = Number(text.replace(/%/g, "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    throw new Error("Discount percentage must be a valid number.");
  }
  if (parsed < 0) {
    throw new Error("Discount percentage cannot be negative.");
  }
  if (parsed > 100) {
    throw new Error("Discount percentage cannot be greater than 100.");
  }

  return Math.round(parsed * 100) / 100;
}

export function calculateReceiptSubtotal(items: ReceiptDiscountItem[]) {
  const subtotalMinor = items.reduce((sum, item) => {
    const qty = Math.max(1, wholeNumber(item.qty, 1));
    return sum + qty * toMinorUnits(moneyNumber(item.unitPrice));
  }, 0);

  return fromMinorUnits(subtotalMinor);
}

export function calculateReceiptDiscountAmount(
  subtotal: number,
  discountPercentage: number,
) {
  const subtotalMinor = toMinorUnits(subtotal);
  const discountMinor = Math.round(subtotalMinor * discountPercentage / 100);
  return fromMinorUnits(discountMinor);
}

export function calculateReceiptTotal(
  subtotal: number,
  discountPercentage: number,
) {
  const subtotalMinor = toMinorUnits(subtotal);
  const discountMinor = toMinorUnits(
    calculateReceiptDiscountAmount(subtotal, discountPercentage),
  );
  return fromMinorUnits(Math.max(0, subtotalMinor - discountMinor));
}

export function calculateReceiptTotals(
  items: ReceiptDiscountItem[],
  discountInput: unknown,
) {
  const receiptDiscountPercentage =
    normalizeReceiptDiscountPercentage(discountInput);
  const receiptSubtotal = calculateReceiptSubtotal(items);
  const receiptDiscountAmount = calculateReceiptDiscountAmount(
    receiptSubtotal,
    receiptDiscountPercentage,
  );
  const receiptTotal = calculateReceiptTotal(
    receiptSubtotal,
    receiptDiscountPercentage,
  );

  return {
    receiptDiscountAmount,
    receiptDiscountPercentage,
    receiptSubtotal,
    receiptTotal,
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

export function normalizePaymentStatus(value: string) {
  const status = value.trim().toLowerCase();
  if (status === "partial" || status === "partially paid") return "Partial";
  if (status === "unpaid") return "Unpaid";
  return "Paid";
}

export function toMinorUnits(value: unknown) {
  return Math.round(moneyNumber(value) * MONEY_SCALE);
}

export function fromMinorUnits(value: number) {
  return value / MONEY_SCALE;
}

function moneyNumber(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function wholeNumber(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? fallback).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}
