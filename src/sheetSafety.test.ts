import {
  isFormulaInjectionCandidate,
  neutralizeSheetFormula,
} from "./sheetSafety";

describe("sheetSafety", () => {
  it.each(["=IMPORTXML('x')", "+1+1", "-2+3", "@SUM(A:A)"])(
    "neutralizes formula-like input %s",
    (value) => {
      expect(isFormulaInjectionCandidate(value)).toBe(true);
      expect(neutralizeSheetFormula(value)).toBe(`'${value}`);
    },
  );

  it("preserves ordinary customer notes and applies maximum lengths", () => {
    expect(neutralizeSheetFormula("Less sugar")).toBe("Less sugar");
    expect(neutralizeSheetFormula("a".repeat(20), 5)).toBe("aaaaa");
  });
});
