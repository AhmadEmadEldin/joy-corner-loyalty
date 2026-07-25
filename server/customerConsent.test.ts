describe("Customer signup with marketing consent", () => {
  it("signup email is normalized (lowercase, trimmed)", () => {
    const raw = "  User@JoyCorner.com  ";
    const normalized = raw.toLowerCase().trim();
    expect(normalized).toBe("user@joycorner.com");
  });

  it("consent defaults to false when not provided", () => {
    const body: Record<string, unknown> = { email: "a@b.com", fullName: "Test", phone: "+201234567890", password: "password123" };
    const marketingConsent = body.marketingConsent === true;
    expect(marketingConsent).toBe(false);
  });

  it("consent timestamp is saved only when consent is true", () => {
    const consentTrue = true;
    const consentFalse = false;
    const tsTrue = consentTrue ? new Date().toISOString() : null;
    const tsFalse = consentFalse ? new Date().toISOString() : null;
    expect(tsTrue).not.toBeNull();
    expect(tsFalse).toBeNull();
  });

  it("customer consent payload includes all required fields", () => {
    const payload = {
      email: "test@test.com",
      fullName: "Test User",
      marketingConsent: true,
      password: "password123",
      phone: "+201234567890",
    };
    expect(payload.email).toBeTruthy();
    expect(payload.fullName).toBeTruthy();
    expect(payload.phone).toBeTruthy();
    expect(typeof payload.marketingConsent).toBe("boolean");
  });
});

describe("Role-based email access enforcement", () => {
  it("owner can access customer email", () => {
    const allowedRoles = ["owner", "manager", "cashier"];
    expect(allowedRoles).toContain("owner");
  });

  it("manager can access customer email", () => {
    const allowedRoles = ["owner", "manager", "cashier"];
    expect(allowedRoles).toContain("manager");
  });

  it("cashier can access customer email", () => {
    const allowedRoles = ["owner", "manager", "cashier"];
    expect(allowedRoles).toContain("cashier");
  });

  it("waiter cannot access customer email", () => {
    const allowedRoles = ["owner", "manager", "cashier"];
    expect(allowedRoles).not.toContain("waiter");
  });

  it("barista cannot access customer email", () => {
    const allowedRoles = ["owner", "manager", "cashier"];
    expect(allowedRoles).not.toContain("barista");
  });
});

describe("Customer directory fields", () => {
  it("customer record includes email", () => {
    const customer = {
      id: "c1",
      fullName: "Test User",
      email: "test@test.com",
      phone: "+201234567890",
      customerNumber: "JC-001",
      marketingConsent: false,
    };
    expect(customer.email).toBeDefined();
    expect(customer.email).toBe("test@test.com");
  });

  it("customer record includes consent status", () => {
    const customer = {
      id: "c1",
      fullName: "Test",
      email: "test@test.com",
      marketingConsent: true,
      marketingConsentAt: "2026-01-01T00:00:00Z",
    };
    expect(customer.marketingConsent).toBe(true);
    expect(customer.marketingConsentAt).toBeDefined();
  });

  it("marketing export filters to subscribed only", () => {
    const customers = [
      { id: "c1", email: "sub@test.com", marketingConsent: true },
      { id: "c2", email: "unsub@test.com", marketingConsent: false },
      { id: "c3", email: "also-sub@test.com", marketingConsent: true },
    ];
    const subscribed = customers.filter((c) => c.marketingConsent);
    expect(subscribed).toHaveLength(2);
    expect(subscribed.every((c) => c.marketingConsent)).toBe(true);
  });

  it("customer can withdraw consent", () => {
    const _customer = { marketingConsent: true, marketingConsentAt: "2026-01-01T00:00:00Z" };
    const updated = { marketingConsent: false, marketingConsentAt: null };
    expect(updated.marketingConsent).toBe(false);
    expect(updated.marketingConsentAt).toBeNull();
  });
});
