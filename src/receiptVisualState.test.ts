import {
  getPaymentStatusClass,
  getPreparationStatusClass,
  isFinishedPreparationStatus,
  normalizePaymentStatusForDisplay,
  normalizePreparationStatus,
} from "./receiptVisualState";

describe("receiptVisualState", () => {
  it("maps preparation statuses to explicit classes", () => {
    expect(getPreparationStatusClass("submitted")).toBe("status-submitted");
    expect(getPreparationStatusClass("awaiting_confirmation")).toBe(
      "status-awaiting-confirmation",
    );
    expect(getPreparationStatusClass("confirmed")).toBe("status-confirmed");
    expect(getPreparationStatusClass("in_preparation")).toBe(
      "status-in-preparation",
    );
    expect(getPreparationStatusClass("ready")).toBe("status-ready");
    expect(getPreparationStatusClass("picked_up")).toBe("status-picked-up");
    expect(getPreparationStatusClass("cancelled")).toBe("status-cancelled");
  });

  it("normalizes picked up values to one canonical preparation status", () => {
    expect(normalizePreparationStatus("pickedup")).toBe("picked_up");
    expect(normalizePreparationStatus("picked_up")).toBe("picked_up");
    expect(normalizePreparationStatus("PickedUp")).toBe("picked_up");
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
    expect(normalizePreparationStatus("ready")).toBe("ready");
    expect(normalizePaymentStatusForDisplay("Unpaid")).toBe("Unpaid");
    expect(isFinishedPreparationStatus("ready")).toBe(true);
    expect(isFinishedPreparationStatus("Paid")).toBe(false);
  });
});
