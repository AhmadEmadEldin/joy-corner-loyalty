import {
  formatCairoDateTime,
  getCairoBusinessDate,
  getPreviousCairoBusinessDate,
} from "./cairoDate";

describe("Cairo business dates", () => {
  it("uses Africa/Cairo at the midnight boundary", () => {
    expect(getCairoBusinessDate(new Date("2026-07-13T20:59:59.000Z"))).toBe(
      "2026-07-13",
    );
    expect(getCairoBusinessDate(new Date("2026-07-13T21:00:00.000Z"))).toBe(
      "2026-07-14",
    );
  });

  it("derives the previous Cairo business day for the midnight scheduler", () => {
    expect(
      getPreviousCairoBusinessDate(new Date("2026-07-13T21:05:00.000Z")),
    ).toBe("2026-07-13");
  });

  it("formats display dates in Cairo", () => {
    expect(formatCairoDateTime("2026-07-13T21:00:00.000Z")).toContain("14");
  });
});
