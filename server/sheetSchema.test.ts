import {
  CANONICAL_SHEET_TABS,
  NORMALIZED_SHEET_HEADERS,
} from "./sheets/schema";
import {
  SHEET_SCHEMAS,
  normalizeSheetHeader,
  schemaForSheet,
} from "./sheetSchema";

describe("canonical owner workbook schemas", () => {
  it("defines exactly ten visible production tabs", () => {
    expect(CANONICAL_SHEET_TABS).toEqual([
      "Dashboard",
      "Settings",
      "Staff",
      "Menu",
      "Customers",
      "Orders",
      "Order Items",
      "Payments",
      "Loyalty",
      "System Log",
    ]);
    expect(Object.keys(NORMALIZED_SHEET_HEADERS)).toHaveLength(10);
  });

  it("describes every required metadata category", () => {
    for (const tab of CANONICAL_SHEET_TABS) {
      const schema = schemaForSheet(tab);
      expect(schema).toBeDefined();
      expect(schema?.requiredHeaders).toEqual(NORMALIZED_SHEET_HEADERS[tab]);
      expect(schema?.protectedColumns).toBeDefined();
      expect(schema?.numericColumns).toBeDefined();
      expect(schema?.booleanColumns).toBeDefined();
      expect(schema?.jsonColumns).toBeDefined();
      expect(schema?.controlledValues).toBeDefined();
    }
  });

  it("normalizes identifiers and excludes plaintext passwords", () => {
    expect(normalizeSheetHeader("Customer ID")).toBe("customerId");
    expect(SHEET_SCHEMAS.staff?.requiredHeaders).not.toContain("Password");
    expect(SHEET_SCHEMAS.staff?.legacyIgnoredColumns).toContain("Password");
  });
});
