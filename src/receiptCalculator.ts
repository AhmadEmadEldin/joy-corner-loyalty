export type ReceiptLineInput = {
  discount?: number | string;
  extrasTotal?: number | string;
  qty?: number;
  unitPrice?: number | string;
};

export type ReceiptDiscountItem = ReceiptLineInput;

export type ReceiptCalculationInput = {
  amountPaid?: number | string;
  items: ReceiptDiscountItem[];
  orderDiscount?: number | string;
  redeemedRewardValue?: number | string;
  serviceCharge?: number | string;
  tax?: number | string;
};

export type PaymentStatus = "Paid" | "Partial" | "Unpaid";

const MONEY_SCALE = 100;

export function calculateReceiptLine(input: ReceiptLineInput) {
  const qty = Math.max(1, wholeNumber(input.qty, 1));
  const unitPrice = toMoney(input.unitPrice);
  const extrasTotal = toMoney(input.extrasTotal);
  const grossTotal = fromMinorUnits(
    qty * toMinorUnits(unitPrice) + toMinorUnits(extrasTotal),
  );
  const discount = Math.min(grossTotal, toMoney(input.discount));
  const total = fromMinorUnits(
    Math.max(0, toMinorUnits(grossTotal) - toMinorUnits(discount)),
  );

  return {
    discount,
    extrasTotal,
    grossTotal,
    lineTotal: total,
    qty,
    total,
    unitPrice,
  };
}

export function calculateReceipt(input: ReceiptCalculationInput) {
  const itemGrossMinor = input.items.reduce((sum, item) => {
    const line = calculateReceiptLine({ ...item, discount: 0 });
    return sum + toMinorUnits(line.grossTotal);
  }, 0);
  const itemDiscountMinor = input.items.reduce((sum, item) => {
    const lineGross = calculateReceiptLine({ ...item, discount: 0 }).grossTotal;
    return sum + Math.min(toMinorUnits(lineGross), toMinorUnits(item.discount));
  }, 0);
  const itemSubtotalMinor = Math.max(0, itemGrossMinor - itemDiscountMinor);
  const orderDiscountMinor = Math.min(
    itemSubtotalMinor,
    toMinorUnits(input.orderDiscount),
  );
  const subtotalAfterDiscountMinor = Math.max(
    0,
    itemSubtotalMinor - orderDiscountMinor,
  );
  const taxMinor = toMinorUnits(input.tax);
  const serviceChargeMinor = toMinorUnits(input.serviceCharge);
  const rewardDiscountMinor = Math.min(
    subtotalAfterDiscountMinor + taxMinor + serviceChargeMinor,
    toMinorUnits(input.redeemedRewardValue),
  );
  const grandTotalMinor = Math.max(
    0,
    subtotalAfterDiscountMinor +
      taxMinor +
      serviceChargeMinor -
      rewardDiscountMinor,
  );
  const amountReceivedMinor = toMinorUnits(input.amountPaid);
  const amountAppliedMinor = Math.min(amountReceivedMinor, grandTotalMinor);
  const remainingAmountMinor = Math.max(0, grandTotalMinor - amountAppliedMinor);
  const changeAmountMinor = Math.max(0, amountReceivedMinor - grandTotalMinor);

  return {
    amountApplied: fromMinorUnits(amountAppliedMinor),
    amountPaid: fromMinorUnits(amountAppliedMinor),
    amountReceived: fromMinorUnits(amountReceivedMinor),
    changeAmount: fromMinorUnits(changeAmountMinor),
    grandTotal: fromMinorUnits(grandTotalMinor),
    itemDiscountTotal: fromMinorUnits(itemDiscountMinor),
    itemGrossTotal: fromMinorUnits(itemGrossMinor),
    itemSubtotal: fromMinorUnits(itemSubtotalMinor),
    orderDiscount: fromMinorUnits(orderDiscountMinor),
    paymentStatus: paymentStatusFromMinorUnits(
      amountAppliedMinor,
      grandTotalMinor,
    ),
    remainingAmount: fromMinorUnits(remainingAmountMinor),
    rewardDiscount: fromMinorUnits(rewardDiscountMinor),
    serviceCharge: fromMinorUnits(serviceChargeMinor),
    subtotalAfterDiscount: fromMinorUnits(subtotalAfterDiscountMinor),
    tax: fromMinorUnits(taxMinor),
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
    const grossMinor =
      qty * toMinorUnits(item.unitPrice) + toMinorUnits(item.extrasTotal);
    const discountMinor = Math.min(grossMinor, toMinorUnits(item.discount));
    return sum + Math.max(0, grossMinor - discountMinor);
  }, 0);

  return fromMinorUnits(subtotalMinor);
}

export function calculateReceiptDiscountAmount(
  subtotal: number,
  discountPercentage: number,
) {
  const subtotalMinor = toMinorUnits(subtotal);
  const discountMinor = Math.round((subtotalMinor * discountPercentage) / 100);
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
  const total = toMoney(receiptTotal);

  if (status === "Paid") return total;
  if (status === "Unpaid") return 0;

  return toMoney(requestedPaidAmount);
}

export function normalizePaymentStatus(value: string) {
  const status = value.trim().toLowerCase();
  if (status === "partial" || status === "partially paid") return "Partial";
  if (status === "unpaid") return "Unpaid";
  return "Paid";
}

export function toMinorUnits(value: unknown) {
  return Math.round(toMoney(value) * MONEY_SCALE);
}

export function fromMinorUnits(value: number) {
  return value / MONEY_SCALE;
}

function moneyNumber(value: unknown) {
  return toMoney(value);
}

export function toMoney(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const parsed = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    throw new Error("Money value must be a valid number.");
  }
  if (parsed < 0) {
    throw new Error("Money value cannot be negative.");
  }

  return Math.round(parsed * MONEY_SCALE) / MONEY_SCALE;
}

function paymentStatusFromMinorUnits(
  amountPaidMinor: number,
  grandTotalMinor: number,
): PaymentStatus {
  if (grandTotalMinor === 0) return "Paid";
  if (amountPaidMinor <= 0) return "Unpaid";
  if (amountPaidMinor < grandTotalMinor) return "Partial";
  return "Paid";
}

function wholeNumber(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? fallback).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}
