import { canTransitionOrder, statusLabel, statusProgress } from "./workflow";

describe("Operational order workflow", () => {
  it("allows only the documented customer-to-kitchen sequence", () => {
    expect(canTransitionOrder("awaiting_confirmation", "confirmed")).toBe(true);
    expect(canTransitionOrder("confirmed", "in_preparation")).toBe(true);
    expect(canTransitionOrder("in_preparation", "ready")).toBe(true);
    expect(canTransitionOrder("ready", "picked_up")).toBe(true);
  });

  it("blocks skipped and terminal transitions", () => {
    expect(canTransitionOrder("awaiting_confirmation", "in_preparation")).toBe(false);
    expect(canTransitionOrder("rejected", "confirmed")).toBe(false);
    expect(canTransitionOrder("picked_up", "in_preparation")).toBe(false);
  });

  it("reports deterministic customer progress", () => {
    expect(statusProgress("awaiting_confirmation")).toBe(25);
    expect(statusProgress("in_preparation")).toBe(65);
    expect(statusProgress("picked_up")).toBe(100);
  });

  it("uses explicit cashier and barista labels", () => {
    expect(statusLabel("awaiting_confirmation")).toBe(
      "Waiting for confirmation",
    );
    expect(statusLabel("in_preparation")).toBe("Being prepared");
    expect(statusLabel("picked_up")).toBe("Picked up");
  });
});
