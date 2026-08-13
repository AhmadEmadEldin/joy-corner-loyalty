import { isOutstandingReceipt } from "./receiptClassification";

describe("receipt classification", () => {
  it("keeps cancelled and rejected receipts out of unpaid records", () => {
    expect(
      isOutstandingReceipt({ payment_status: "unpaid", status: "cancelled" }),
    ).toBe(false);
    expect(
      isOutstandingReceipt({ payment_status: "unpaid", status: "rejected" }),
    ).toBe(false);
  });

  it("includes genuine unpaid and partially paid receipts", () => {
    expect(
      isOutstandingReceipt({ remaining_amount: 90, status: "closed" }),
    ).toBe(true);
    expect(
      isOutstandingReceipt({
        payment_status: "partially_paid",
        status: "picked_up",
      }),
    ).toBe(true);
  });

  it("does not count fully paid receipts", () => {
    expect(
      isOutstandingReceipt({ remaining_amount: 0, status: "closed" }),
    ).toBe(false);
  });
});
