import { canRedeemVoucher, normalizeVoucherStatus } from "./voucher";

describe("voucher status", () => {
  it("allows a reserved voucher exactly until redemption", () => {
    expect(canRedeemVoucher("Not Redeemed")).toBe(true);
    expect(canRedeemVoucher("Redeemed")).toBe(false);
    expect(canRedeemVoucher("Cancelled")).toBe(false);
    expect(normalizeVoucherStatus("Expired")).toBe("Expired");
  });
});
