import { LIVE_SHEET_TABS } from "./sheets/schema";
import {
  SHEET_SCHEMAS,
  normalizeSheetHeader,
  resolveCanonicalHeader,
} from "./sheetSchema";

describe("live Sheet schema", () => {
  it("uses the exact twenty production tab names", () => {
    expect(LIVE_SHEET_TABS).toHaveLength(20);
    expect(LIVE_SHEET_TABS).toContain("Orders");
    expect(LIVE_SHEET_TABS).toContain("Order Items");
    expect(LIVE_SHEET_TABS).toContain("Business Settings");
    expect(LIVE_SHEET_TABS).not.toContain("Menu Items" as never);
  });

  it("maps exact legacy and canonical headers", () => {
    expect(normalizeSheetHeader("Order Date/Time")).toBe("orderDateTime");
    expect(resolveCanonicalHeader("Orders", "Customer ID")).toBe("customerId");
    expect(resolveCanonicalHeader("Payments", "Method")).toBe("paymentMethod");
  });

  it("never permits the historical Staff password field", () => {
    expect(SHEET_SCHEMAS.staff!.frontendWritableColumns).not.toContain(
      "password",
    );
    expect(SHEET_SCHEMAS.staff!.protectedColumns).toContain("password");
  });

  it("ignores unknown historical metadata without changing required headers", () => {
    const historicalDesignLink = ["Can", "va Link"].join("");
    expect(
      resolveCanonicalHeader("Generated Vouchers", historicalDesignLink),
    ).toBe("canvaLink");
    expect(SHEET_SCHEMAS.generatedVouchers!.requiredHeaders).not.toContain(
      historicalDesignLink,
    );
  });
});
