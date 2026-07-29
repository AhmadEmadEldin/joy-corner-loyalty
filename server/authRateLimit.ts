type AttemptBucket = {
  count: number;
  resetAt: number;
};

export class AuthRateLimiter {
  private readonly attempts = new Map<string, AttemptBucket>();

  constructor(
    private readonly maximumAttempts = 12,
    private readonly windowMs = 15 * 60_000,
    private readonly maximumKeys = 10_000,
  ) {}

  consume(keys: string[], now = Date.now()): number | null {
    this.prune(now);
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    const blocked = uniqueKeys
      .map((key) => this.attempts.get(key))
      .find((bucket) => bucket && bucket.count >= this.maximumAttempts);
    if (blocked) return Math.max(1, blocked.resetAt - now);

    for (const key of uniqueKeys) {
      const current = this.attempts.get(key);
      if (current) {
        current.count += 1;
        continue;
      }
      this.makeRoom();
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
    }
    return null;
  }

  reset(keys: string[]): void {
    for (const key of new Set(keys.filter(Boolean))) {
      this.attempts.delete(key);
    }
  }

  get size(): number {
    return this.attempts.size;
  }

  private makeRoom(): void {
    while (this.attempts.size >= this.maximumKeys) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.attempts.delete(oldestKey);
    }
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.attempts) {
      if (bucket.resetAt <= now) this.attempts.delete(key);
    }
  }
}
