import {
  calculateReceiptLine,
  normalizePaidAmount,
  normalizePaymentStatus,
} from "./receiptCalculator";

describe("receiptCalculator", () => {
  it("calculates line totals with cent-safe rounding", () => {
    expect(
      calculateReceiptLine({
        discount: 0.2,
        qty: 3,
        unitPrice: 10.1,
      }),
    ).toMatchObject({
      discount: 0.2,
      qty: 3,
      total: 30.1,
      unitPrice: 10.1,
    });
  });

  it("never allows a discount to make a receipt line negative", () => {
    expect(
      calculateReceiptLine({
        discount: 999,
        qty: 2,
        unitPrice: 30,
      }).total,
    ).toBe(0);
  });

  it("normalizes payment statuses and clamps paid amounts", () => {
    expect(normalizePaymentStatus("partially paid")).toBe("Partial");
    expect(normalizePaidAmount("Paid", 0, 125)).toBe(125);
    expect(normalizePaidAmount("Unpaid", 125, 125)).toBe(0);
    expect(normalizePaidAmount("Partial", 200, 125)).toBe(125);
  });
});
