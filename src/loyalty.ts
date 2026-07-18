export function calculateLoyaltyBalance(options: {
  eligiblePaidDrinks: number;
  threshold: number;
  voucherStatuses?: unknown[];
}) {
  const threshold = Math.max(1, Math.floor(options.threshold));
  const eligiblePaidDrinks = Math.max(
    0,
    Math.floor(options.eligiblePaidDrinks),
  );
  const statuses = (options.voucherStatuses || []).map((status) =>
    String(status || "Not Redeemed")
      .trim()
      .toLowerCase(),
  );
  const redeemedFreeDrinks = statuses.filter(
    (status) => status === "redeemed",
  ).length;
  const activeGeneratedVouchers = statuses.filter(
    (status) =>
      !["redeemed", "cancelled", "canceled", "expired"].includes(status),
  ).length;
  const earnedFreeDrinks = Math.floor(eligiblePaidDrinks / threshold);
  const freeDrinksReady = Math.max(
    earnedFreeDrinks - redeemedFreeDrinks - activeGeneratedVouchers,
    0,
  );
  return {
    activeGeneratedVouchers,
    earnedFreeDrinks,
    freeDrinksReady,
    nextRewardProgress: eligiblePaidDrinks % threshold,
    redeemedFreeDrinks,
    threshold,
  };
}
