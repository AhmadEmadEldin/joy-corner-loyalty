import {
  auditLegacyWorkbook,
  migrateLegacyWorkbook,
  type SourceWorkbook,
} from "./workbookMigration";
import { CANONICAL_SHEET_TABS } from "./sheets/schema";

function fixture(): SourceWorkbook {
  return {
    Staff: [
      ["Email", "Password", "Role", "Name", "Active"],
      [" Owner@Example.com ", "never-copy", "OWNER", " Owner ", "Yes"],
    ],
    Dashboard: [],
    Customers: [
      ["Customer ID", "Full Name", "Phone/WhatsApp", "Active?"],
      ["C-1", "=Unsafe Name", "0100", "Yes"],
    ],
    Orders: [
      [
        "Order Date/Time",
        "Customer ID",
        "Customer Name",
        "Item",
        "Qty",
        "Unit Price",
        "Total",
        "Payment Status",
        "Order Status",
        "orderId",
        "receiptNumber",
      ],
      [
        "2026-07-18",
        "C-1",
        "A",
        "Latte",
        1,
        50,
        50,
        "Paid",
        "Open",
        "O-1",
        "R-1",
      ],
      [
        "2026-07-18",
        "C-1",
        "A",
        "Tea",
        1,
        30,
        30,
        "Paid",
        "Open",
        "O-1",
        "R-1",
      ],
    ],
    Rewards: [
      ["Customer ID", "Customer Name", "Free Drinks Ready"],
      ["C-1", "A", 1],
    ],
    "Loyalty Winners": [],
    "Generated Vouchers": [],
    "Reward Redemptions": [],
    "Unpaid Tracker": [],
    Menu: [
      [
        "Item ID",
        "Category",
        "Item Name",
        "Price Text (edit later)",
        "Active",
        "Loyalty Eligible",
      ],
      ["M-1", "Coffee", "Latte", "50 / 60", "Yes", "Yes"],
    ],
    Payments: [
      [
        "paymentId",
        "orderId",
        "receiptNumber",
        "Customer ID",
        "Amount",
        "paymentMethod",
      ],
      ["P-1", "O-1", "R-1", "C-1", 80, "Cash"],
    ],
    Lists: [],
    "Day History": [],
    "Order Items": [],
    "Audit Log": [],
    "Sync Failures": [],
    "Customer Summary": [],
    "Daily Receipt Files": [],
    "Business Settings": [
      ["settingKey", "settingValue", "description"],
      ["loyaltyThreshold", "5", "threshold"],
    ],
    "Schema Status": [],
  };
}

describe("workbook migration", () => {
  it("creates the exact ten-tab destination and groups proven order rows", () => {
    const result = migrateLegacyWorkbook(fixture());
    expect(Object.keys(result.destination)).toEqual(CANONICAL_SHEET_TABS);
    expect(result.destination.Orders).toHaveLength(1);
    expect(result.destination["Order Items"]).toHaveLength(2);
    expect(result.destination.Orders[0]).toMatchObject({
      orderId: "O-1",
      orderStatus: "Requested",
      paidAmount: 80,
      total: 80,
    });
    expect(result.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_PROVEN_ORDER_ID_GROUPED",
        }),
      ]),
    );
    expect(result.reconciliation.orderItemsOrphaned).toBe(0);
  });

  it("never migrates passwords and neutralizes formulas", () => {
    const result = migrateLegacyWorkbook(fixture());
    expect(JSON.stringify(result.destination.Staff)).not.toContain(
      "never-copy",
    );
    expect(result.destination.Customers[0]?.fullName).toBe("'=Unsafe Name");
  });

  it("reports unresolved multi-size labels and remains deterministic", () => {
    const first = auditLegacyWorkbook(fixture());
    const second = auditLegacyWorkbook(fixture());
    expect(first.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MENU_SIZE_LABEL_UNPROVEN" }),
      ]),
    );
    expect(first.destination.Orders[0]?.orderId).toBe(
      second.destination.Orders[0]?.orderId,
    );
  });
});
