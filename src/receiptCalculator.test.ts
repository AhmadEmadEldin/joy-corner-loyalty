import {
  calculateReceipt,
  calculateReceiptLine,
  calculateReceiptTotals,
  normalizePaidAmount,
  normalizePaymentStatus,
  normalizeReceiptDiscountPercentage,
  toMoney,
} from "./receiptCalculator";

describe("receiptCalculator", () => {
  it("calculates item line totals without item-level discount", () => {
    expect(
      calculateReceiptLine({
        qty: 3,
        unitPrice: 10.1,
      }),
    ).toMatchObject({
      discount: 0,
      qty: 3,
      total: 30.3,
      unitPrice: 10.1,
    });
  });

  it("applies a 10 percent discount once to a multi-item receipt", () => {
    expect(
      calculateReceiptTotals(
        [
          { qty: 2, unitPrice: 40 },
          { qty: 1, unitPrice: 20 },
        ],
        10,
      ),
    ).toEqual({
      receiptDiscountAmount: 10,
      receiptDiscountPercentage: 10,
      receiptSubtotal: 100,
      receiptTotal: 90,
    });
  });

  it("supports decimal discount percentages", () => {
    expect(
      calculateReceiptTotals([{ qty: 1, unitPrice: 100 }], 7.5),
    ).toMatchObject({
      receiptDiscountAmount: 7.5,
      receiptTotal: 92.5,
    });
  });

  it("supports a 100 percent receipt discount", () => {
    expect(
      calculateReceiptTotals([{ qty: 1, unitPrice: 25.5 }], 100).receiptTotal,
    ).toBe(0);
  });

  it("treats empty discount as zero", () => {
    expect(normalizeReceiptDiscountPercentage("")).toBe(0);
  });

  it("rejects invalid discount percentages", () => {
    expect(() => normalizeReceiptDiscountPercentage(-1)).toThrow();
    expect(() => normalizeReceiptDiscountPercentage(101)).toThrow();
    expect(() => normalizeReceiptDiscountPercentage("abc")).toThrow();
  });

  it("normalizes payment statuses and preserves overpayment for change", () => {
    expect(normalizePaymentStatus("partially paid")).toBe("Partial");
    expect(normalizePaidAmount("Paid", 0, 125)).toBe(125);
    expect(normalizePaidAmount("Unpaid", 125, 125)).toBe(0);
    expect(normalizePaidAmount("Partial", 200, 125)).toBe(200);
  });

  it("calculates an authoritative receipt with extras and discounts", () => {
    expect(
      calculateReceipt({
        amountPaid: 100,
        items: [
          { qty: 2, unitPrice: 30, extrasTotal: 5, discount: 3 },
          { qty: 1, unitPrice: 25 },
        ],
        orderDiscount: 7,
        redeemedRewardValue: 5,
        serviceCharge: 4,
        tax: 1.5,
      }),
    ).toMatchObject({
      amountPaid: 100,
      changeAmount: 19.5,
      grandTotal: 80.5,
      itemDiscountTotal: 3,
      itemGrossTotal: 90,
      itemSubtotal: 87,
      orderDiscount: 7,
      paymentStatus: "Paid",
      remainingAmount: 0,
      rewardDiscount: 5,
      serviceCharge: 4,
      subtotalAfterDiscount: 80,
      tax: 1.5,
    });
  });

  it("derives unpaid, partial, exact, overpaid, and zero-total statuses", () => {
    const base = { items: [{ qty: 1, unitPrice: 75 }] };

    expect(calculateReceipt({ ...base, amountPaid: 0 })).toMatchObject({
      paymentStatus: "Unpaid",
      remainingAmount: 75,
    });
    expect(calculateReceipt({ ...base, amountPaid: 25 })).toMatchObject({
      paymentStatus: "Partial",
      remainingAmount: 50,
    });
    expect(calculateReceipt({ ...base, amountPaid: 75 })).toMatchObject({
      changeAmount: 0,
      paymentStatus: "Paid",
      remainingAmount: 0,
    });
    expect(calculateReceipt({ ...base, amountPaid: 100 })).toMatchObject({
      changeAmount: 25,
      paymentStatus: "Paid",
      remainingAmount: 0,
    });
    expect(
      calculateReceipt({
        amountPaid: 0,
        items: [{ qty: 1, unitPrice: 75 }],
        orderDiscount: 75,
      }),
    ).toMatchObject({
      grandTotal: 0,
      paymentStatus: "Paid",
    });
  });

  it("rounds money safely and rejects invalid numeric input", () => {
    expect(toMoney("10.235")).toBe(10.24);
    expect(calculateReceiptLine({ qty: 3, unitPrice: 10.005 }).total).toBe(
      30.03,
    );
    expect(() => toMoney("abc")).toThrow();
    expect(() => toMoney(-1)).toThrow();
  });
});
