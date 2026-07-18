import { calculateLoyaltyBalance } from "./loyalty";

describe("loyalty reservation model", () => {
  it("uses the configured threshold", () => {
    expect(
      calculateLoyaltyBalance({ eligiblePaidDrinks: 10, threshold: 5 })
        .earnedFreeDrinks,
    ).toBe(2);
    expect(
      calculateLoyaltyBalance({ eligiblePaidDrinks: 10, threshold: 7 })
        .earnedFreeDrinks,
    ).toBe(1);
  });

  it("reserves on generation and consumes on redemption without double subtraction", () => {
    expect(
      calculateLoyaltyBalance({
        eligiblePaidDrinks: 10,
        threshold: 5,
        voucherStatuses: ["Not Redeemed"],
      }),
    ).toMatchObject({
      activeGeneratedVouchers: 1,
      freeDrinksReady: 1,
      redeemedFreeDrinks: 0,
    });
    expect(
      calculateLoyaltyBalance({
        eligiblePaidDrinks: 10,
        threshold: 5,
        voucherStatuses: ["Redeemed"],
      }),
    ).toMatchObject({
      activeGeneratedVouchers: 0,
      freeDrinksReady: 1,
      redeemedFreeDrinks: 1,
    });
    expect(
      calculateLoyaltyBalance({
        eligiblePaidDrinks: 5,
        threshold: 5,
        voucherStatuses: ["Not Redeemed"],
      }).freeDrinksReady,
    ).toBe(0);
  });

  it("returns cancelled or expired reservations to the available balance", () => {
    expect(
      calculateLoyaltyBalance({
        eligiblePaidDrinks: 5,
        threshold: 5,
        voucherStatuses: ["Cancelled"],
      }).freeDrinksReady,
    ).toBe(1);
    expect(
      calculateLoyaltyBalance({
        eligiblePaidDrinks: 5,
        threshold: 5,
        voucherStatuses: ["Expired"],
      }).freeDrinksReady,
    ).toBe(1);
  });
});
