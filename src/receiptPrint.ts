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
  changeAmount?: number;
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
    .replace(/"/g, "&quot;")
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
      body { font-family: "Inter", Arial, sans-serif; margin: 0; color: #241814; background: #fff; }
      .page {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background: #fffaf2;
      }
      .page::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(184,121,62,0.04) 0%, rgba(107,70,52,0.06) 50%, rgba(184,121,62,0.03) 100%);
        background-image: url("/brand/joy-corner-receipt-farm.webp");
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
        opacity: 0.06;
        pointer-events: none;
        z-index: -2;
      }
      .page::after {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(255, 250, 242, 0.72);
        pointer-events: none;
        z-index: -1;
      }
      .header { border-bottom: 2px solid #2A1812; padding-bottom: 8px; margin-bottom: 16px; position: relative; z-index: 1; }
      .brand { font-family: "Fraunces", Georgia, serif; font-size: 28px; font-weight: 900; letter-spacing: 2px; color: #2A1812; }
      .sub { color: #74645D; margin-top: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 12px 0 20px; font-size: 14px; position: relative; z-index: 1; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; position: relative; z-index: 1; }
      th, td { border-bottom: 1px solid #DFD2C4; padding: 8px 6px; text-align: left; }
      th { background: #EEE1D0; font-size: 13px; text-transform: uppercase; color: #6B4634; }
      .totals { margin-top: 12px; display: grid; gap: 6px; font-size: 15px; position: relative; z-index: 1; }
      .totals div { display: flex; justify-content: space-between; }
      .strong { font-weight: 800; font-size: 16px; }
      .actions { margin-top: 20px; display: flex; gap: 10px; position: relative; z-index: 1; }
      .actions button { border: 0; border-radius: 6px; background: #2A1812; color: #fff; padding: 10px 14px; cursor: pointer; font-size: 14px; }
      .actions button:hover { background: #3B241B; }
      .footer-note { margin-top: 24px; text-align: center; font-size: 12px; color: #74645D; position: relative; z-index: 1; }
      @media print { .actions { display: none; } .page::before { opacity: 0; } .page::after { opacity: 0; } }
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
        <div class="strong"><span>Total</span><strong>${money(data.total || 0)} EGP</strong></div>
        <div><span>Paid</span><strong>${money(data.paidAmount || 0)} EGP</strong></div>
        <div><span>Remaining</span><strong>${money(data.outstandingAmount || 0)} EGP</strong></div>
        ${
          data.changeAmount
            ? `<div><span>Change</span><strong>${money(data.changeAmount)} EGP</strong></div>`
            : ""
        }
        <div><span>Status</span><strong>${escapeHtml(data.paymentStatus || "")}</strong></div>
      </div>
      ${data.notes ? `<div class="totals"><div><span>Notes</span><strong>${escapeHtml(data.notes)}</strong></div></div>` : ""}
      <p class="footer-note">Thank you for choosing Joy Corner. Your time, your coffee.</p>
      <div class="actions">
        <button onclick="window.print()">Save as PDF</button>
        <button onclick="window.close()">Close</button>
      </div>
    </div>
  </body>
</html>`;
}
