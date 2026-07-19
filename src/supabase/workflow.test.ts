import { canTransitionOrder, statusProgress } from "./workflow";

describe("Supabase operational order workflow", () => {
  it("allows only the documented customer-to-kitchen sequence", () => {
    expect(canTransitionOrder("pending_confirmation", "confirmed")).toBe(true);
    expect(canTransitionOrder("confirmed", "accepted")).toBe(true);
    expect(canTransitionOrder("accepted", "preparing")).toBe(true);
    expect(canTransitionOrder("preparing", "ready")).toBe(true);
    expect(canTransitionOrder("ready", "picked_up")).toBe(true);
    expect(canTransitionOrder("picked_up", "closed")).toBe(true);
  });

  it("blocks skipped and terminal transitions", () => {
    expect(canTransitionOrder("pending_confirmation", "preparing")).toBe(false);
    expect(canTransitionOrder("rejected", "confirmed")).toBe(false);
    expect(canTransitionOrder("closed", "preparing")).toBe(false);
  });

  it("reports deterministic customer progress", () => {
    expect(statusProgress("pending_confirmation")).toBe(0);
    expect(statusProgress("preparing")).toBe(60);
    expect(statusProgress("closed")).toBe(100);
  });
});
