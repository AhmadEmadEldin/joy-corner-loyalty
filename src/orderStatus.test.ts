import { canTransitionOrderStatus, normalizeOrderStatus } from "./orderStatus";

describe("orderStatus", () => {
  it("normalizes legacy status names", () => {
    expect(normalizeOrderStatus("Open")).toBe("Submitted");
    expect(normalizeOrderStatus("Picked Up")).toBe("Picked Up");
    expect(normalizeOrderStatus("picked_up")).toBe("Picked Up");
    expect(normalizeOrderStatus("PickedUp")).toBe("Picked Up");
    expect(normalizeOrderStatus("Served")).toBe("Picked Up");
  });

  it("allows legal preparation transitions", () => {
    expect(canTransitionOrderStatus("Submitted", "Accepted")).toBe(true);
    expect(canTransitionOrderStatus("Accepted", "Preparing")).toBe(true);
    expect(canTransitionOrderStatus("Preparing", "Ready")).toBe(true);
    expect(canTransitionOrderStatus("Ready", "Picked Up")).toBe(true);
  });

  it("rejects invalid reverse preparation transitions", () => {
    expect(canTransitionOrderStatus("Picked Up", "Accepted")).toBe(false);
  });

  it("blocks invalid transitions out of archived orders", () => {
    expect(canTransitionOrderStatus("Archived", "Ready")).toBe(false);
  });
});
