import {
  canRoleTransitionOrder,
  canTransitionOrder,
  derivePaymentStatusMinor,
  normalizeOperationalOrderStatus,
  ORDER_STATUS,
  PAYMENT_STATUS,
  toMinorUnits,
} from "./orderWorkflow";

describe("central order workflow", () => {
  it("enforces the operational sequence", () => {
    const sequence = [
      ORDER_STATUS.DRAFT,
      ORDER_STATUS.SUBMITTED,
      ORDER_STATUS.AWAITING_CONFIRMATION,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.IN_PREPARATION,
      ORDER_STATUS.READY,
      ORDER_STATUS.PICKED_UP,
    ] as const;
    for (let index = 0; index < sequence.length - 1; index += 1) {
      expect(
        canTransitionOrder(sequence[index]!, sequence[index + 1]!),
      ).toBe(true);
    }
    expect(
      canTransitionOrder(ORDER_STATUS.CONFIRMED, ORDER_STATUS.READY),
    ).toBe(false);
    expect(
      canTransitionOrder(
        ORDER_STATUS.IN_PREPARATION,
        ORDER_STATUS.READY,
      ),
    ).toBe(true);
  });

  it("enforces role ownership of cashier and barista transitions", () => {
    expect(
      canRoleTransitionOrder(
        "cashier",
        ORDER_STATUS.AWAITING_CONFIRMATION,
        ORDER_STATUS.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      canRoleTransitionOrder(
        "barista",
        ORDER_STATUS.AWAITING_CONFIRMATION,
        ORDER_STATUS.CONFIRMED,
      ),
    ).toBe(false);
    expect(
      canRoleTransitionOrder(
        "barista",
        ORDER_STATUS.CONFIRMED,
        ORDER_STATUS.IN_PREPARATION,
      ),
    ).toBe(true);
  });

  it("supports the canonical API workflow transitions", () => {
    const transitions = [
      [
        "cashier",
        ORDER_STATUS.AWAITING_CONFIRMATION,
        ORDER_STATUS.CONFIRMED,
      ],
      [
        "barista",
        ORDER_STATUS.CONFIRMED,
        ORDER_STATUS.IN_PREPARATION,
      ],
      [
        "barista",
        ORDER_STATUS.IN_PREPARATION,
        ORDER_STATUS.READY,
      ],
      ["barista", ORDER_STATUS.READY, ORDER_STATUS.PICKED_UP],
    ] as const;

    for (const [role, from, to] of transitions) {
      expect(canRoleTransitionOrder(role, from, to)).toBe(true);
    }
  });

  it("normalizes legacy persistence statuses", () => {
    expect(normalizeOperationalOrderStatus("pending_confirmation")).toBe(
      ORDER_STATUS.AWAITING_CONFIRMATION,
    );
    expect(normalizeOperationalOrderStatus("accepted")).toBe(
      ORDER_STATUS.IN_PREPARATION,
    );
    expect(normalizeOperationalOrderStatus("closed")).toBe(
      ORDER_STATUS.PICKED_UP,
    );
  });

  it("derives payment status from integer minor units", () => {
    expect(derivePaymentStatusMinor(10_000, 0)).toBe(PAYMENT_STATUS.UNPAID);
    expect(derivePaymentStatusMinor(10_000, 4_000)).toBe(
      PAYMENT_STATUS.PARTIALLY_PAID,
    );
    expect(derivePaymentStatusMinor(10_000, 10_000)).toBe(PAYMENT_STATUS.PAID);
    expect(toMinorUnits(68.1)).toBe(6810);
  });
});
