import {
  getPaymentStatusClass,
  getPreparationStatusClass,
  isFinishedPreparationStatus,
  normalizePaymentStatusForDisplay,
  normalizePreparationStatus,
} from "./receiptVisualState";

describe("receiptVisualState", () => {
  it("maps canonical preparation states to distinct classes", () => {
    expect(getPreparationStatusClass("Submitted")).toBe("status-requested");
    expect(getPreparationStatusClass("Awaiting Confirmation")).toBe(
      "status-awaiting-confirmation",
    );
    expect(getPreparationStatusClass("Confirmed")).toBe("status-confirmed");
    expect(getPreparationStatusClass("Approved")).toBe("status-approved");
    expect(getPreparationStatusClass("Accepted")).toBe("status-accepted");
    expect(getPreparationStatusClass("Ready")).toBe("status-ready");
    expect(getPreparationStatusClass("Picked Up")).toBe("status-picked-up");
    expect(getPreparationStatusClass("Completed")).toBe("status-completed");
    expect(getPreparationStatusClass("Rejected")).toBe("status-rejected");
  });

  it("keeps preparation and payment concepts independent", () => {
    expect(normalizePreparationStatus("Served")).toBe("Picked Up");
    expect(normalizePaymentStatusForDisplay("Partially Paid")).toBe("Partial");
    expect(getPaymentStatusClass("Awaiting Payment")).toBe("payment-unpaid");
    expect(getPaymentStatusClass("Voided")).toBe("payment-voided");
    expect(isFinishedPreparationStatus("Ready")).toBe(false);
    expect(isFinishedPreparationStatus("Completed")).toBe(true);
    expect(isFinishedPreparationStatus("Paid")).toBe(false);
  });
});
