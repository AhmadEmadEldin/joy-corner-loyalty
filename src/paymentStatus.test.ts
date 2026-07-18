import {
  calculatePaymentState,
  normalizeCanonicalPaymentStatus,
} from "./paymentStatus";

describe("paymentStatus", () => {
  it("calculates unpaid, partial, and paid independently from order status", () => {
    expect(calculatePaymentState({ paidAmount: 0, total: 100 }).status).toBe(
      "Unpaid",
    );
    expect(calculatePaymentState({ paidAmount: 40, total: 100 })).toMatchObject(
      { paidAmount: 40, remainingAmount: 60, status: "Partial" },
    );
    expect(calculatePaymentState({ paidAmount: 100, total: 100 }).status).toBe(
      "Paid",
    );
  });

  it("handles overpayment change and terminal financial states", () => {
    expect(
      calculatePaymentState({
        amountReceived: 120,
        paidAmount: 100,
        total: 100,
      }).changeAmount,
    ).toBe(20);
    expect(
      calculatePaymentState({
        amountReceived: 70,
        paidAmount: 100,
        previousPaidAmount: 40,
        total: 100,
      }).changeAmount,
    ).toBe(10);
    expect(
      calculatePaymentState({ paidAmount: 100, refunded: true, total: 100 })
        .status,
    ).toBe("Refunded");
    expect(
      calculatePaymentState({ paidAmount: 0, total: 100, voided: true }).status,
    ).toBe("Voided");
    expect(normalizeCanonicalPaymentStatus("Partially Paid")).toBe("Partial");
  });
});
