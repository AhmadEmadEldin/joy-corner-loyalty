import { ORDER_STATUS } from "../src/orderWorkflow";
import {
  countCompletedOrders,
  END_DAY_COMPLETED_ORDER_STATUS,
  RECONCILE_END_DAY_SQL,
} from "./endDayReconciliation";

describe("End of Day reconciliation", () => {
  it("counts only picked-up orders as completed", () => {
    expect(
      countCompletedOrders([
        ORDER_STATUS.PICKED_UP,
        ORDER_STATUS.READY,
        ORDER_STATUS.PICKED_UP,
        ORDER_STATUS.CANCELLED,
      ]),
    ).toBe(2);
    expect(END_DAY_COMPLETED_ORDER_STATUS).toBe(ORDER_STATUS.PICKED_UP);
  });

  it("uses the canonical completed status in the reconciliation query", () => {
    expect(RECONCILE_END_DAY_SQL).toContain("status='picked_up'");
    expect(RECONCILE_END_DAY_SQL).not.toContain("status='closed'");
  });
});
