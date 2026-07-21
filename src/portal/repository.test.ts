import { staffQueueTables } from "./repository";

describe("staffQueueTables", () => {
  it.each(["owner", "manager"] as const)(
    "subscribes %s to both operational projections",
    (role) => {
      expect(staffQueueTables(role)).toEqual([
        "cashier_order_queue",
        "kitchen_order_queue",
      ]);
    },
  );

  it("keeps cashier traffic out of the kitchen projection", () => {
    expect(staffQueueTables("cashier")).toEqual(["cashier_order_queue"]);
  });

  it("keeps barista traffic out of the cashier projection", () => {
    expect(staffQueueTables("barista")).toEqual(["kitchen_order_queue"]);
  });

  it("does not subscribe waiters to queues they cannot read", () => {
    expect(staffQueueTables("waiter")).toEqual([]);
  });
});
