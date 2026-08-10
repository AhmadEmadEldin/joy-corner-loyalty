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
      @page { size: 80mm auto; margin: 0; }
      html, body { width: 80mm; min-height: 100%; }
      body { font-family: "Arial Narrow", Arial, sans-serif; margin: 0; color: #111; background: #eee; }
      .page {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        width: 72mm;
        min-height: 110mm;
        margin: 0 auto;
        padding: 4mm 3mm 6mm;
        background: #fff;
        box-shadow: 0 10px 35px rgba(0,0,0,.16);
      }
      .page::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: url("/brand/joy-corner-receipt-farm.svg");
        background-position: center bottom;
        background-size: 100% auto;
        background-repeat: no-repeat;
        filter: grayscale(1) contrast(1.35);
        opacity: 0.075;
        pointer-events: none;
        z-index: -2;
      }
      .page::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(#fff 0 74%, rgba(255,255,255,.88));
        pointer-events: none;
        z-index: -1;
      }
      .header { border-bottom: 2px solid #111; padding-bottom: 3mm; margin-bottom: 3mm; position: relative; z-index: 1; text-align:center; }
      .logo { width: 48mm; max-height: 29mm; object-fit: contain; object-position:center; filter: grayscale(1) contrast(1.5); }
      .meta { display: grid; gap: 1.2mm; margin: 3mm 0; font-size: 10px; position: relative; z-index: 1; }
      .meta > div, td, th, .totals span, .totals strong { min-width: 0; overflow-wrap: anywhere; word-break: normal; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2mm; position: relative; z-index: 1; }
      th, td { border-bottom: 1px dashed #777; padding: 1.8mm .7mm; text-align: left; vertical-align: top; font-size:10px; }
      th:first-child, td:first-child { width: 56%; }
      th:nth-child(2), td:nth-child(2) { width: 12%; text-align:center; }
      th:nth-child(3), td:nth-child(3) { width: 32%; text-align:right; }
      th { border-block: 1.5px solid #111; font-size: 9px; text-transform: uppercase; letter-spacing:.08em; }
      .item-size { display:block; color:#444; font-size:8.5px; margin-top:.5mm; }
      .totals { border-top: 2px solid #111; margin-top: 3mm; padding-top:2mm; display: grid; gap: 1.2mm; font-size: 10px; position: relative; z-index: 1; }
      .totals div { display: grid; gap: 3mm; grid-template-columns: minmax(0, 1fr) minmax(27mm, auto); }
      .totals strong { text-align: right; }
      .strong { border-block:1.5px solid #111; font-weight: 900; font-size: 13px; margin-block:1mm; padding-block:1.5mm; }
      .remaining { font-size:12px; }
      .note { border:1px dashed #555; margin-top:3mm; padding:2mm; font-size:9px; position:relative; z-index:1; }
      .actions { margin: 5mm auto 0; display: flex; gap: 2mm; position: relative; z-index: 1; }
      .actions button { border: 0; border-radius: 4px; background: #111; color: #fff; padding: 2.5mm 3mm; cursor: pointer; font-size: 10px; }
      .footer-note { border-top:1px dashed #555; margin-top: 5mm; padding-top:3mm; text-align: center; font-family:Georgia,serif; font-size: 9px; color: #222; position: relative; z-index: 1; }
      @media print {
        html, body { background:#fff; }
        .actions { display: none; }
        .page { overflow: hidden; box-shadow:none; }
        .page, .page::before, .page::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <img class="logo" src="/assets/joy-corner-logo-master.png" alt="Joy Corner Coffee logo" />
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
          <tr><th>Item</th><th>Qty</th><th>Amount</th></tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.itemName || "Item")}<span class="item-size">${escapeHtml(item.size || "")} · ${money(item.unitPrice || 0)} EGP each</span></td>
              <td>${money(item.qty || 0)}</td>
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
        <div class="remaining"><span>Remaining</span><strong>${money(data.outstandingAmount || 0)} EGP</strong></div>
        ${
          data.changeAmount
            ? `<div><span>Change</span><strong>${money(data.changeAmount)} EGP</strong></div>`
            : ""
        }
        <div><span>Status</span><strong>${escapeHtml(data.paymentStatus || "")}</strong></div>
      </div>
      ${data.notes ? `<div class="note"><strong>Order note:</strong> ${escapeHtml(data.notes)}</div>` : ""}
      <p class="footer-note">Serving coffee lovers every day.<br />Your time, your coffee, your story.</p>
      <div class="actions">
        <button onclick="window.print()">Save as PDF</button>
        <button onclick="window.close()">Close</button>
      </div>
    </div>
  </body>
</html>`;
}

export type DailyReportData = {
  businessDay: {
    business_date: string;
    opened_at: string;
    closed_at?: string;
    gross_sales: number;
    net_sales: number;
    paid_amount: number;
    unpaid_amount: number;
    partially_paid_amount: number;
    refunded_amount: number;
    receipt_count: number;
    order_count: number;
    notes?: string;
    closed_by_user_id?: string;
  };
  orders: Array<{
    order_number: string;
    pickup_name: string;
    status: string;
    payment_status: string;
    payment_method: string;
    subtotal: number;
    discount_total: number;
    voucher_discount: number;
    total: number;
    paid_amount: number;
    remaining_amount: number;
    created_at: string;
    customer_name?: string;
    customer_phone?: string;
    cashier_name?: string;
    creator_name?: string;
  }>;
  payments: Array<{
    payment_method: string;
    total: number;
    count: number;
    refund_total: number;
    void_total: number;
  }>;
  productSummary: Array<{
    product: string;
    quantity: number;
    gross_revenue: number;
    discounts: number;
  }>;
  serviceSummary: Array<{
    service_type: string;
    order_count: number;
    total: number;
  }>;
  staffSummary: Array<{
    staff_name: string;
    order_count: number;
  }>;
  unpaidCarryForward: Array<{
    order_number: string;
    pickup_name: string;
    remaining_amount: number;
  }>;
};

function reportMoney(v: number | string | undefined) {
  const n = typeof v === "number" ? v : Number(v || 0);
  return n.toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reportEsc(v: string | undefined) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildDailyReportHtml(data: DailyReportData) {
  const bd = data.businessDay;
  const openedTime = new Date(bd.opened_at).toLocaleString("en-EG", { timeZone: "Africa/Cairo" });
  const closedTime = bd.closed_at ? new Date(bd.closed_at).toLocaleString("en-EG", { timeZone: "Africa/Cairo" }) : "—";
  const paymentMethods = data.payments.map(p => `
    <tr>
      <td>${reportEsc(p.payment_method?.replace(/_/g, " "))}</td>
      <td>${p.count}</td>
      <td>${reportMoney(p.total)} EGP</td>
      <td>${reportMoney(p.refund_total)} EGP</td>
      <td>${reportMoney(p.void_total)} EGP</td>
    </tr>`).join("");

  const productRows = data.productSummary.map(p => `
    <tr>
      <td>${reportEsc(p.product)}</td>
      <td style="text-align:center">${p.quantity}</td>
      <td style="text-align:right">${reportMoney(p.gross_revenue)} EGP</td>
      <td style="text-align:right">${reportMoney(p.discounts)} EGP</td>
    </tr>`).join("");

  const staffRows = data.staffSummary.map(s => `
    <tr>
      <td>${reportEsc(s.staff_name)}</td>
      <td style="text-align:center">${s.order_count}</td>
    </tr>`).join("");

  const orderRows = data.orders.map(o => `
    <tr>
      <td>${reportEsc(o.order_number)}</td>
      <td>${reportEsc(o.customer_name || o.pickup_name)}</td>
      <td>${reportEsc(o.status)}</td>
      <td>${reportEsc(o.payment_status?.replace(/_/g, " "))}</td>
      <td style="text-align:right">${reportMoney(o.total)} EGP</td>
      <td style="text-align:right">${reportMoney(o.paid_amount)} EGP</td>
      <td style="text-align:right">${reportMoney(o.remaining_amount)} EGP</td>
    </tr>`).join("");

  const carryRows = data.unpaidCarryForward.length
    ? data.unpaidCarryForward.map(o => `
      <tr>
        <td>${reportEsc(o.order_number)}</td>
        <td>${reportEsc(o.pickup_name)}</td>
        <td style="text-align:right">${reportMoney(o.remaining_amount)} EGP</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center;color:#74645D;">No unpaid carry-forward</td></tr>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Daily Report - ${reportEsc(bd.business_date)}</title>
    <style>
      @page { size: A4 portrait; margin: 16mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: "Inter", Arial, sans-serif; margin: 0; color: #241814; background: #fff; font-size: 11px; }
      .report { max-width: 800px; margin: 0 auto; padding: 24px; }
      .report-header { text-align: center; border-bottom: 3px double #2A1812; padding-bottom: 14px; margin-bottom: 18px; }
      .report-header h1 { font-family: "Fraunces", Georgia, serif; font-size: 26px; letter-spacing: 3px; color: #2A1812; margin: 0; }
      .report-header .subtitle { font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #74645D; margin-top: 4px; }
      .report-header .date { font-size: 16px; font-weight: 700; margin-top: 8px; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
      .kpi { background: #F8F1E8; border: 1px solid #E3D2B8; border-radius: 8px; padding: 10px; text-align: center; }
      .kpi .value { font-size: 18px; font-weight: 800; color: #2A1812; }
      .kpi .label { font-size: 10px; text-transform: uppercase; color: #74645D; letter-spacing: 0.5px; margin-top: 2px; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #6B4634; border-bottom: 1px solid #DFD2C4; padding-bottom: 4px; margin: 18px 0 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th, td { padding: 5px 6px; border-bottom: 1px solid #EEE1D0; font-size: 10.5px; }
      th { background: #EEE1D0; text-transform: uppercase; font-size: 9.5px; color: #6B4634; letter-spacing: 0.5px; text-align: left; }
      td { vertical-align: top; }
      .notes { background: #FFF8EE; border: 1px dashed #D9AD63; border-radius: 6px; padding: 8px 12px; margin-top: 10px; font-size: 11px; }
      .footer { text-align: center; margin-top: 24px; padding-top: 10px; border-top: 1px solid #DFD2C4; font-size: 10px; color: #74645D; }
      .actions { text-align: center; margin-top: 16px; }
      .actions button { background: #2A1812; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; font-size: 13px; cursor: pointer; margin: 0 6px; }
      .actions button:hover { background: #3B241B; }
      @media print { .actions { display: none; } }
    </style>
  </head>
  <body>
    <div class="report">
      <div class="report-header">
        <h1>JOY CORNER</h1>
        <div class="subtitle">Daily Business Report</div>
        <div class="date">${reportEsc(bd.business_date)}</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="value">${reportMoney(bd.gross_sales)}</div><div class="label">Gross Sales (EGP)</div></div>
        <div class="kpi"><div class="value">${reportMoney(bd.paid_amount)}</div><div class="label">Paid (EGP)</div></div>
        <div class="kpi"><div class="value">${reportMoney(bd.unpaid_amount)}</div><div class="label">Unpaid (EGP)</div></div>
        <div class="kpi"><div class="value">${bd.order_count || 0}</div><div class="label">Total Receipts</div></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="value">${reportMoney(bd.refunded_amount)}</div><div class="label">Refunded (EGP)</div></div>
        <div class="kpi"><div class="value">${reportMoney(bd.net_sales)}</div><div class="label">Net Sales (EGP)</div></div>
        <div class="kpi"><div class="value">${openedTime}</div><div class="label">Opened At</div></div>
        <div class="kpi"><div class="value">${closedTime}</div><div class="label">Closed At</div></div>
      </div>

      <h2>Payment Methods</h2>
      <table>
        <thead><tr><th>Method</th><th>Count</th><th>Total</th><th>Refunds</th><th>Voided</th></tr></thead>
        <tbody>${paymentMethods || `<tr><td colspan="5" style="text-align:center;color:#74645D;">No payments</td></tr>`}</tbody>
      </table>

      <h2>Products Sold</h2>
      <table>
        <thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Revenue</th><th style="text-align:right">Discounts</th></tr></thead>
        <tbody>${productRows || `<tr><td colspan="4" style="text-align:center;color:#74645D;">No products</td></tr>`}</tbody>
      </table>

      <h2>Staff Activity</h2>
      <table>
        <thead><tr><th>Staff</th><th style="text-align:center">Orders</th></tr></thead>
        <tbody>${staffRows || `<tr><td colspan="2" style="text-align:center;color:#74645D;">No staff data</td></tr>`}</tbody>
      </table>

      <h2>All Receipts</h2>
      <table>
        <thead><tr><th>#</th><th>Customer</th><th>Status</th><th>Payment</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Remaining</th></tr></thead>
        <tbody>${orderRows || `<tr><td colspan="7" style="text-align:center;color:#74645D;">No orders</td></tr>`}</tbody>
      </table>

      <h2>Unpaid Carry-Forward</h2>
      <table>
        <thead><tr><th>#</th><th>Customer</th><th style="text-align:right">Remaining</th></tr></thead>
        <tbody>${carryRows}</tbody>
      </table>

      ${bd.notes ? `<div class="notes"><strong>Notes:</strong> ${reportEsc(bd.notes)}</div>` : ""}

      <div class="footer">
        Generated ${new Date().toLocaleString("en-EG", { timeZone: "Africa/Cairo" })} &middot; Joy Corner Cafe Management
      </div>
      <div class="actions">
        <button onclick="window.print()">Save as PDF / Print</button>
        <button onclick="window.close()">Close</button>
      </div>
    </div>
  </body>
</html>`;
}
