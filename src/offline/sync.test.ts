import { classifySyncFailure } from "./syncPolicy";

describe("offline synchronization failure classification", () => {
  it("blocks authentication changes", () => {
    expect(classifySyncFailure("Unauthorized", 1, 401)).toBe("Blocked");
    expect(classifySyncFailure("Forbidden", 1, 403)).toBe("Blocked");
  });

  it("routes business conflicts to review", () => {
    expect(classifySyncFailure("Menu price changed", 1, 409)).toBe(
      "Needs Review",
    );
    expect(classifySyncFailure("Selected size is sold out", 1, 409)).toBe(
      "Needs Review",
    );
  });

  it("retries transient errors up to a finite limit", () => {
    expect(classifySyncFailure("Network unavailable", 4, 503)).toBe("Pending");
    expect(classifySyncFailure("Network unavailable", 5, 503)).toBe("Failed");
  });
});
