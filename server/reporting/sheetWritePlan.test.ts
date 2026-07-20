import { buildSheetWritePlan } from "./sheetWritePlan";

describe("reporting sheet write planning", () => {
  const headers = ["ID", "Status", "Formula", "Notes", "Manual"];

  it("updates only managed columns and preserves formula/manual columns", () => {
    const plan = buildSheetWritePlan(
      headers,
      "ID",
      [{ ID: "order-1", Notes: "Hot", Status: "ready" }],
      new Map([["order-1", 7]]),
    );

    expect(plan.appends).toEqual([]);
    expect(plan.updates).toEqual([
      {
        endColumn: 1,
        rowNumber: 7,
        startColumn: 0,
        values: ["order-1", "ready"],
      },
      {
        endColumn: 3,
        rowNumber: 7,
        startColumn: 3,
        values: ["Hot"],
      },
    ]);
  });

  it("leaves unmanaged cells blank only when appending a new row", () => {
    const plan = buildSheetWritePlan(
      headers,
      "ID",
      [{ ID: "order-2", Status: "confirmed" }],
      new Map(),
    );

    expect(plan.updates).toEqual([]);
    expect(plan.appends).toEqual([["order-2", "confirmed", "", "", ""]]);
  });

  it("fails closed when the live workbook schema has drifted", () => {
    expect(() =>
      buildSheetWritePlan(
        headers,
        "ID",
        [{ ID: "1", Unknown: true }],
        new Map(),
      ),
    ).toThrow("Missing managed columns: Unknown.");
  });
});
