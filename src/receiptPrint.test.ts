import { buildReceiptPrintHtml } from "./receiptPrint";

describe("buildReceiptPrintHtml", () => {
  it("includes receipt details and printable actions", () => {
    const html = buildReceiptPrintHtml({
      customerName: "Mona",
      customerPhone: "01012345678",
      receiptId: "REC-1001",
      receiptNumber: "REC-1001",
      items: [
        { itemName: "Latte", qty: 1, unitPrice: 70, total: 70, size: "Medium" },
      ],
      discountPercentage: 0,
      subtotal: 70,
      total: 70,
      paidAmount: 70,
      outstandingAmount: 0,
      paymentStatus: "Paid",
      orderDateTime: "2026-07-08 10:00",
      staff: "Barista 1",
      orderPlace: "Table 4",
      notes: "Takeaway",
    });

    expect(html).toContain("<strong>Receipt:</strong> REC-1001");
    expect(html).toContain("Mona");
    expect(html).toContain("Latte");
    expect(html).toContain("Save as PDF");
    expect(html).toContain("size: 80mm auto");
    expect(html).toContain("joy-corner-receipt-farm.svg");
    expect(html).toContain("joy-corner-logo-master.png");
    expect(html).toContain("Remaining");
  });
});
