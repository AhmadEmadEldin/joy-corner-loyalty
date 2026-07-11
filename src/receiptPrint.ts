export type ReceiptPrintData = {
  customerName?: string;
  customerPhone?: string;
  receiptId?: string;
  receiptNumber?: string;
  items: Array<{
    itemName?: string;
    qty?: number;
    unitPrice?: number;
    total?: number;
    size?: string;
  }>;
  discountPercentage?: number;
  subtotal?: number;
  total?: number;
  paidAmount?: number;
  outstandingAmount?: number;
  paymentStatus?: string;
  orderDateTime?: string;
  staff?: string;
  orderPlace?: string;
  notes?: string;
};

function money(value: number | string | undefined) {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return parsed.toLocaleString("en-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value: string | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReceiptPrintHtml(data: ReceiptPrintData) {
  const title = data.receiptNumber || data.receiptId || "Receipt";
  const items = data.items.length
    ? data.items
    : [{ itemName: "No items", qty: 1, unitPrice: 0, total: 0, size: "" }];

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; margin: 0; color: #1f140e; background: #fff; }
      .page { max-width: 800px; margin: 0 auto; padding: 20px; }
      .header { border-bottom: 2px solid #1f140e; padding-bottom: 8px; margin-bottom: 16px; }
      .brand { font-size: 26px; font-weight: 900; letter-spacing: 1px; }
      .sub { color: #6b5b4f; margin-top: 6px; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 12px 0 20px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border-bottom: 1px solid #e5dfd8; padding: 8px 6px; text-align: left; }
      th { background: #f6efe8; font-size: 13px; text-transform: uppercase; }
      .totals { margin-top: 12px; display: grid; gap: 6px; font-size: 15px; }
      .totals div { display: flex; justify-content: space-between; }
      .strong { font-weight: 800; font-size: 16px; }
      .actions { margin-top: 20px; display: flex; gap: 10px; }
      .actions button { border: 0; border-radius: 6px; background: #1f140e; color: #fff; padding: 10px 14px; cursor: pointer; }
      @media print { .actions { display: none; } }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div class="brand">JOY CORNER</div>
        <div class="sub">Receipt / Order Slip</div>
      </div>
      <div class="meta">
        <div><strong>Receipt:</strong> ${escapeHtml(title)}</div>
        <div><strong>Date:</strong> ${escapeHtml(data.orderDateTime)}</div>
        <div><strong>Customer:</strong> ${escapeHtml(data.customerName || "Walk-in")}</div>
        <div><strong>Phone:</strong> ${escapeHtml(data.customerPhone || "")}</div>
        <div><strong>Staff:</strong> ${escapeHtml(data.staff || "")}</div>
        <div><strong>Place:</strong> ${escapeHtml(data.orderPlace || "")}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.itemName || "Item")}</td>
              <td>${escapeHtml(item.size || "")}</td>
              <td>${money(item.qty || 0)}</td>
              <td>${money(item.unitPrice || 0)} EGP</td>
              <td>${money(item.total || 0)} EGP</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <div class="totals">
        <div><span>Subtotal</span><strong>${money(data.subtotal || 0)} EGP</strong></div>
        <div><span>Discount</span><strong>${money(data.discountPercentage || 0)}%</strong></div>
        <div><span>Total</span><strong>${money(data.total || 0)} EGP</strong></div>
        <div><span>Paid</span><strong>${money(data.paidAmount || 0)} EGP</strong></div>
        <div><span>Remaining</span><strong>${money(data.outstandingAmount || 0)} EGP</strong></div>
        <div><span>Status</span><strong>${escapeHtml(data.paymentStatus || "")}</strong></div>
      </div>
      ${data.notes ? `<div class="totals"><div><span>Notes</span><strong>${escapeHtml(data.notes)}</strong></div></div>` : ""}
      <div class="actions">
        <button onclick="window.print()">Save as PDF</button>
        <button onclick="window.close()">Close</button>
      </div>
    </div>
  </body>
</html>`;
}
