import { canTransitionOrderStatus, normalizeOrderStatus } from "./orderStatus";

describe("orderStatus", () => {
  it("normalizes legacy status names", () => {
    expect(normalizeOrderStatus("Open")).toBe("Submitted");
    expect(normalizeOrderStatus("Picked Up")).toBe("Served");
  });

  it("allows legal preparation transitions", () => {
    expect(canTransitionOrderStatus("Submitted", "Accepted")).toBe(true);
    expect(canTransitionOrderStatus("Accepted", "Preparing")).toBe(true);
    expect(canTransitionOrderStatus("Preparing", "Ready")).toBe(true);
    expect(canTransitionOrderStatus("Ready", "Served")).toBe(true);
  });

  it("blocks invalid transitions out of archived orders", () => {
    expect(canTransitionOrderStatus("Archived", "Ready")).toBe(false);
  });
});
