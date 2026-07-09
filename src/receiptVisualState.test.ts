import {
  getPaymentStatusClass,
  getPreparationStatusClass,
  isFinishedPreparationStatus,
  normalizePaymentStatusForDisplay,
  normalizePreparationStatus,
} from "./receiptVisualState";

describe("receiptVisualState", () => {
  it("maps preparation statuses to explicit classes", () => {
    expect(getPreparationStatusClass("Submitted")).toBe("status-submitted");
    expect(getPreparationStatusClass("Accepted")).toBe("status-accepted");
    expect(getPreparationStatusClass("Preparing")).toBe("status-preparing");
    expect(getPreparationStatusClass("Ready")).toBe("status-ready");
    expect(getPreparationStatusClass("Picked Up")).toBe("status-picked-up");
    expect(getPreparationStatusClass("Cancelled")).toBe("status-cancelled");
  });

  it("normalizes picked up values to one canonical preparation status", () => {
    expect(normalizePreparationStatus("pickedup")).toBe("Picked Up");
    expect(normalizePreparationStatus("picked_up")).toBe("Picked Up");
    expect(normalizePreparationStatus("PickedUp")).toBe("Picked Up");
    expect(normalizePreparationStatus("Served")).toBe("Picked Up");
  });

  it("maps payment statuses to separate explicit classes", () => {
    expect(getPaymentStatusClass("Paid")).toBe("payment-paid");
    expect(getPaymentStatusClass("Unpaid")).toBe("payment-unpaid");
    expect(getPaymentStatusClass("Partially Paid")).toBe("payment-partial");
    expect(getPaymentStatusClass("Partial")).toBe("payment-partial");
    expect(getPaymentStatusClass("Awaiting Payment")).toBe("payment-awaiting");
    expect(getPaymentStatusClass("Refunded")).toBe("payment-refunded");
  });

  it("keeps preparation and payment status concepts independent", () => {
    expect(normalizePreparationStatus("Ready")).toBe("Ready");
    expect(normalizePaymentStatusForDisplay("Unpaid")).toBe("Unpaid");
    expect(isFinishedPreparationStatus("Ready")).toBe(true);
    expect(isFinishedPreparationStatus("Paid")).toBe(false);
  });
});
