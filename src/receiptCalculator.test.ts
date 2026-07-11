import {
  calculateReceiptLine,
  calculateReceiptTotals,
  normalizePaidAmount,
  normalizePaymentStatus,
  normalizeReceiptDiscountPercentage,
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

  it("normalizes payment statuses and clamps paid amounts", () => {
    expect(normalizePaymentStatus("partially paid")).toBe("Partial");
    expect(normalizePaidAmount("Paid", 0, 125)).toBe(125);
    expect(normalizePaidAmount("Unpaid", 125, 125)).toBe(0);
    expect(normalizePaidAmount("Partial", 200, 125)).toBe(125);
  });
});
