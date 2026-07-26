import { staffQueueTables } from "./repository";

describe("staffQueueTables", () => {
  it.each(["owner", "manager"] as const)(
    "subscribes %s to both operational projections, data topics, and menu",
    (role) => {
      expect(staffQueueTables(role)).toEqual([
        "cashier_order_queue",
        "kitchen_order_queue",
        "orders",
        "notifications",
        "menu",
      ]);
    },
  );

  it("subscribes cashier to cashier queue and menu", () => {
    expect(staffQueueTables("cashier")).toEqual(["cashier_order_queue", "menu"]);
  });

  it("subscribes barista to kitchen queue and menu", () => {
    expect(staffQueueTables("barista")).toEqual(["kitchen_order_queue", "menu"]);
  });

  it("subscribes waiter to menu only", () => {
    expect(staffQueueTables("waiter")).toEqual(["menu"]);
  });
});
