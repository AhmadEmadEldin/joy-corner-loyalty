import {
  canTransitionOrderStatus,
  normalizeOrderStatus,
  validateOrderTransition,
} from "./orderStatus";

describe("orderStatus", () => {
  it("normalizes historical values without changing Sheet cells", () => {
    expect(normalizeOrderStatus("Open")).toBe("Requested");
    expect(normalizeOrderStatus("Submitted")).toBe("Requested");
    expect(normalizeOrderStatus("Done")).toBe("Completed");
    expect(normalizeOrderStatus("Closed")).toBe("Completed");
    expect(normalizeOrderStatus("picked_up")).toBe("Picked Up");
  });

  it("allows only the canonical sequence", () => {
    const sequence = [
      "Requested",
      "Awaiting Confirmation",
      "Confirmed",
      "Approved",
      "Accepted",
      "Preparing",
      "Ready",
      "Picked Up",
      "Completed",
    ];
    sequence.slice(0, -1).forEach((status, index) => {
      expect(canTransitionOrderStatus(status, sequence[index + 1])).toBe(true);
    });
    expect(canTransitionOrderStatus("Requested", "Preparing")).toBe(false);
    expect(canTransitionOrderStatus("Preparing", "Completed")).toBe(false);
    expect(canTransitionOrderStatus("Completed", "Preparing")).toBe(false);
    expect(canTransitionOrderStatus("Cancelled", "Requested")).toBe(false);
  });

  it("enforces role and cancellation-reason rules", () => {
    expect(
      validateOrderTransition({
        actor: { role: "cashier" },
        from: "Confirmed",
        to: "Approved",
      }).allowed,
    ).toBe(true);
    expect(
      validateOrderTransition({
        actor: { role: "barista" },
        from: "Confirmed",
        to: "Approved",
      }).allowed,
    ).toBe(false);
    expect(
      validateOrderTransition({
        actor: { role: "barista" },
        from: "Approved",
        to: "Accepted",
      }).allowed,
    ).toBe(true);
    expect(
      validateOrderTransition({
        actor: { role: "manager" },
        from: "Preparing",
        to: "Cancelled",
      }).allowed,
    ).toBe(false);
    expect(
      validateOrderTransition({
        actor: { role: "manager" },
        from: "Preparing",
        to: "Cancelled",
        reason: "Machine fault",
      }).allowed,
    ).toBe(true);
  });

  it("allows customers to confirm or cancel only their own orders", () => {
    expect(
      validateOrderTransition({
        actor: { customerOwnsOrder: true, role: "customer" },
        from: "Awaiting Confirmation",
        to: "Confirmed",
      }).allowed,
    ).toBe(true);
    expect(
      validateOrderTransition({
        actor: { customerOwnsOrder: false, role: "customer" },
        from: "Awaiting Confirmation",
        to: "Confirmed",
      }).allowed,
    ).toBe(false);
  });
});
