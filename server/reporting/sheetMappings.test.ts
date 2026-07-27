import { reportingRecord, REPORTING_SHEETS } from "./sheetMappings";

describe("Neon reporting sheet mappings", () => {
  it("keeps stable order and receipt identifiers", () => {
    expect(
      reportingRecord("orders", {
        id: "order-1",
        order_number: "JC-1001",
        status: "awaiting_confirmation",
      }),
    ).toMatchObject({
      "Order Status": "awaiting_confirmation",
      orderId: "order-1",
      receiptNumber: "JC-1001",
    });
  });

  it("defines a unique key column for every synchronized tab", () => {
    for (const [sourceTable, sheet] of Object.entries(REPORTING_SHEETS)) {
      expect(
        Object.keys(reportingRecord(sourceTable, { id: "record-1" })),
      ).toContain(sheet.idHeader);
    }
  });
});
