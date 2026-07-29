/** @jest-environment node */

import { AuthRateLimiter } from "./authRateLimit";

describe("AuthRateLimiter", () => {
  it("blocks distributed addresses that target the same account", () => {
    const limiter = new AuthRateLimiter(2, 60_000);
    expect(limiter.consume(["ip:first", "account:user@example.com"], 1)).toBeNull();
    expect(limiter.consume(["ip:second", "account:user@example.com"], 2)).toBeNull();
    expect(
      limiter.consume(["ip:third", "account:user@example.com"], 3),
    ).toBeGreaterThan(0);
  });

  it("prunes expired entries without waiting for the same key", () => {
    const limiter = new AuthRateLimiter(2, 10, 10);
    limiter.consume(["ip:first"], 1);
    expect(limiter.size).toBe(1);
    limiter.consume(["ip:second"], 20);
    expect(limiter.size).toBe(1);
  });

  it("keeps attacker-selected key cardinality bounded", () => {
    const limiter = new AuthRateLimiter(12, 60_000, 2);
    limiter.consume(["ip:first"], 1);
    limiter.consume(["ip:second"], 2);
    limiter.consume(["ip:third"], 3);
    expect(limiter.size).toBe(2);
  });
});
