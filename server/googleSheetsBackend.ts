import dotenv from "dotenv";
import express from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { google, sheets_v4 } from "googleapis";
import { readFileSync } from "node:fs";
import { schemaForSheet } from "./sheetSchema";

dotenv.config();

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
  "1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8";

const SHEETS = {
  dashboard: "Dashboard",
  generatedVouchers: "Generated Vouchers",
  menu: "Menu",
  customers: "Customers",
  orders: "Orders",
  payments: "Payments",
  unpaidTracker: "Unpaid Tracker",
  rewards: "Rewards",
  lists: "Lists",
  loyaltyWinners: "Loyalty Winners",
  rewardRedemptions: "Reward Redemptions",
  staffUsers: "Staff Users",
  dayHistory: "Day History",
} as const;

const ROLE_ACTIONS: Record<string, string[]> = {
  barista: ["appData", "getAppData", "historyDays", "dayHistory", "markReceiptDone"],
  waiter: [
    "appData",
    "getAppData",
    "addOrder",
    "addReceipt",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "updateReceiptPayment",
    "markReceiptDone",
  ],
  cashier: [
    "appData",
    "getAppData",
    "addCustomer",
    "addOrder",
    "addReceipt",
    "addPayment",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "collectUnpaidPayment",
    "updateReceiptPayment",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "removeCustomer",
    "updateVoucherCanvaLink",
  ],
  owner: ["*"],
};

const REWARD_THRESHOLD = 5;
const PORT = Number(process.env.CANVA_BACKEND_PORT || process.env.API_PORT || 3001);

type Row = Record<string, any>;
type Payload = Record<string, unknown>;
type Actor = { email: string; role: string; uid: string };

let sheetsClientPromise: Promise<sheets_v4.Sheets> | null = null;

function initFirebaseAdmin() {
  if (getApps().length) return;

  const credential = firebaseCredential();
  initializeApp({
    ...(credential ? { credential } : {}),
    ...(process.env.FIREBASE_PROJECT_ID
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : {}),
  });
}

function firebaseCredential() {
  const json =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const file =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FILE ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (json) {
    return cert(JSON.parse(json));
  }

  if (file) {
    return cert(JSON.parse(readFileSync(file, "utf8")));
  }

  return undefined;
}

function googleServiceAccount() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (json) return JSON.parse(json);
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: privateKey };
  }

  throw new Error(
    "Google Sheets credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_KEY_FILE, or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY.",
  );
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const auth = new google.auth.GoogleAuth({
        credentials: googleServiceAccount(),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      return google.sheets({ auth, version: "v4" });
    })();
  }

  return await sheetsClientPromise;
}

function quotedSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function columnLetter(index: number) {
  let value = index + 1;
  let letters = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return letters;
}

async function getSheetValues(sheetName: string) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    range: `${quotedSheet(sheetName)}!A:ZZ`,
    spreadsheetId: SPREADSHEET_ID,
    valueRenderOption: "FORMATTED_VALUE",
  });

  return (response.data.values || []).map((row) =>
    row.map((value) => clean_(value)),
  );
}

async function setCell(sheetName: string, row: number, columnIndex: number, value: unknown) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    range: `${quotedSheet(sheetName)}!${columnLetter(columnIndex)}${row}`,
    requestBody: { values: [[valueForSheet_(value)]] },
    spreadsheetId: SPREADSHEET_ID,
    valueInputOption: "USER_ENTERED",
  });
}

async function deleteSheetRow(sheetName: string, row: number) {
  const sheets = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    fields: "sheets.properties",
    spreadsheetId: SPREADSHEET_ID,
  });
  const sheet = metadata.data.sheets?.find(
    (item) => item.properties?.title === sheetName,
  );
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId == null) throw new Error(`${sheetName} sheet was not found.`);

  await sheets.spreadsheets.batchUpdate({
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              dimension: "ROWS",
              sheetId,
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    },
    spreadsheetId: SPREADSHEET_ID,
  });
}

async function appendRow(sheetName: string, rowValues: unknown[]) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    insertDataOption: "INSERT_ROWS",
    range: `${quotedSheet(sheetName)}!A:ZZ`,
    requestBody: { values: [rowValues.map(valueForSheet_)] },
    spreadsheetId: SPREADSHEET_ID,
    valueInputOption: "USER_ENTERED",
  });
}

function valueForSheet_(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? "" : value;
}

async function sheetToObjects(sheetName: string): Promise<Row[]> {
  const values = await getSheetValues(sheetName);
  if (!values.length) return [];

  const headers = (values.shift() || []).map(normalizeKey_);
  const firstHeader = headers.find(Boolean) || "";

  return values
    .map((row) => {
      const record: Row = {};
      headers.forEach((header, index) => {
        if (header) record[header] = clean_(row[index]);
      });
      return record;
    })
    .filter((record) => (firstHeader ? clean_(record[firstHeader]) !== "" : false));
}

async function writeDataRow(sheetName: string, rowValues: unknown[]) {
  await appendRow(sheetName, rowValues);
}

async function writeObjectRow(sheetName: string, record: Payload) {
  const values = await getSheetValues(sheetName);
  const headers = (values[0] || []).map(normalizeKey_);
  const schema = schemaForSheet(sheetName);
  const formulaColumns = new Set(schema?.formulaColumns || []);
  const editableColumns = new Set(schema?.editableColumns || []);
  await writeDataRow(
    sheetName,
    headers.map((header) => {
      if (formulaColumns.has(header)) return "";
      if (editableColumns.size && !editableColumns.has(header)) return "";
      return valueForHeaderForSheet_(record, header);
    }),
  );
}

async function handleAction(action: string, payload: Payload) {
  const actor = await authorizeAction(action, payload);

  switch (action) {
    case "appData":
    case "getAppData":
      return success_({ data: await buildAppDataForRole(actor.role) });
    case "addCustomer":
      return await addCustomer(payload);
    case "removeCustomer":
      return await removeCustomer(payload);
    case "addOrder":
      return await addOrder(payload);
    case "addReceipt":
      return await addReceipt(payload);
    case "addPayment":
      return await addPayment(payload);
    case "collectUnpaidPayment":
      return await collectUnpaidPayment(payload);
    case "updateReceiptPayment":
      return await updateReceiptPayment(payload);
    case "markReceiptDone":
      return await markReceiptDone(payload);
    case "generateVoucher":
      return await generateVoucher(payload);
    case "redeemVoucher":
      return await redeemVoucher(payload);
    case "updateVoucherCanvaLink":
      return await updateVoucherCanvaLink(payload);
    case "resetDay":
      return await resetDay(actor);
    case "customerSearch":
      return success_({ customers: await searchCustomers(clean_(payload.q)) });
    case "customerHistory":
      return success_({ history: await customerHistory(clean_(payload.customerId)) });
    case "historyDays":
      return success_({ days: await historyDays() });
    case "dayHistory":
      return success_({ history: await dayHistory(clean_(payload.dateKey)) });
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function authorizeAction(action: string, payload: Payload): Promise<Actor> {
  const idToken = clean_(payload.idToken);
  const localDevAuth = clean_(process.env.LOCAL_DEV_AUTH).toLowerCase() === "true";

  if (!idToken && localDevAuth) {
    const role = normalizeRole_(payload.devRole);
    const allowed = ROLE_ACTIONS[role] || [];

    if (!allowed.includes("*") && !allowed.includes(action)) {
      throw new Error(`Role ${role} cannot run action ${action}.`);
    }

    return {
      email: clean_(payload.devEmail || "local@joycorner.local"),
      role,
      uid: clean_(payload.devUid || "local-dev"),
    };
  }

  if (!idToken) throw new Error("Firebase sign-in is required.");

  initFirebaseAdmin();
  const decoded = await getAuth().verifyIdToken(idToken);
  const email = clean_(decoded.email).toLowerCase();
  const uid = clean_(decoded.uid);
  const role = await staffRoleForUser(uid, email);
  const allowed = ROLE_ACTIONS[role] || [];

  if (!allowed.includes("*") && !allowed.includes(action)) {
    throw new Error(`Role ${role} cannot run action ${action}.`);
  }

  return { email, role, uid };
}

async function staffRoleForUser(uid: string, email: string) {
  const ownerEmails = clean_(process.env.FIREBASE_OWNER_EMAILS)
    .split(",")
    .map((value) => clean_(value).toLowerCase())
    .filter(Boolean);

  if (ownerEmails.includes(email)) return "owner";

  try {
    const snapshot = await getFirestore().collection("staffUsers").doc(uid).get();
    const role = snapshot.exists ? snapshot.data()?.role : "";
    return normalizeRole_(role);
  } catch {
    return "waiter";
  }
}

async function addCustomer(payload: Payload) {
  const customers = await sheetToObjects(SHEETS.customers);
  const nextId = nextIdFromRows_("CUST", customers);
  const now = new Date();

  await writeObjectRow(SHEETS.customers, {
    customerId: nextId,
    fullName: clean_(payload.fullName),
    customerName: clean_(payload.fullName),
    phoneWhatsApp: clean_(payload.phone || payload.phoneWhatsApp),
    phone: clean_(payload.phone || payload.phoneWhatsApp),
    joinDate: now,
    createdAt: now,
    date: now,
    birthday: clean_(payload.birthday),
    favoriteDrink: clean_(payload.favoriteDrink),
    favouriteDrink: clean_(payload.favoriteDrink),
    notes: clean_(payload.notes),
    active: clean_(payload.active || "Yes"),
    totalOrders: 0,
    totalSpent: 0,
    unpaidBalance: 0,
    points: 0,
    freeDrinksReady: 0,
  });

  return success_({ customerId: nextId, data: await buildAppData() });
}

async function removeCustomer(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  if (!customerId) throw new Error("Customer ID is required.");

  const values = await getSheetValues(SHEETS.customers);
  if (values.length < 2) throw new Error("No customer rows found.");

  const headers = (values[0] || []).map(normalizeKey_);
  const customerIdIndex = headerIndex_(headers, ["customerId", "customerID", "id"]);
  if (customerIdIndex < 0) throw new Error("Customers sheet needs a Customer ID column.");

  const rowIndex = values.findIndex(
    (row, index) => index > 0 && clean_(row[customerIdIndex]) === customerId,
  );
  if (rowIndex < 1) throw new Error("Customer was not found.");

  await deleteSheetRow(SHEETS.customers, rowIndex + 1);

  return success_({ removedCustomerId: customerId, data: await buildAppData() });
}

async function addOrder(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const item = await findMenuItem(clean_(payload.itemId), clean_(payload.itemName));
  const qty = Number(payload.qty || 1);
  const unitPrice = Number(
    payload.unitPrice ||
      parsePrice_(item.priceText || item.priceTextEditLater || item.price) ||
      0,
  );
  const discount = Number(payload.discount || 0);
  const total = Math.max(0, qty * unitPrice - discount);
  const paymentStatus = clean_(payload.paymentStatus || "Paid");
  const orderStatus = paymentStatus === "Paid" ? "Closed" : "Open";
  const paidAmount =
    paymentStatus === "Partial" ? Number(payload.paidAmount || 0) : total;
  const notes = orderNotes_(clean_(payload.notes), paymentStatus, paidAmount);
  const pointsEarned =
    clean_(item.loyaltyEligible) === "Yes" ? Math.floor(total / 10) : 0;
  const customer = await findCustomer(customerId);
  const customerName =
    customer.fullName || customer.customerName || clean_(payload.customerName);

  await writeDataRow(SHEETS.orders, [
    new Date(),
    customerId,
    customerName,
    clean_(payload.staff || "Cashier 1"),
    item.category || clean_(payload.category),
    item.itemName || clean_(payload.itemName),
    qty,
    unitPrice,
    discount,
    total,
    pointsEarned,
    Number(payload.pointsRedeemed || 0),
    paymentStatus,
    orderStatus,
    notes,
  ]);

  if ((paymentStatus === "Paid" || paymentStatus === "Partial") && paidAmount > 0) {
    await addPayment({
      customerId,
      customerName,
      method: payload.paymentMethod || "Cash",
      amount: paidAmount,
      collectedBy: payload.staff || "Cashier 1",
      notes: item.itemName || payload.itemName,
    });
  }

  return success_({ data: await buildAppData() });
}

async function addReceipt(payload: Payload) {
  const receiptCustomer = await getOrCreateReceiptCustomer(payload);
  const customerId = receiptCustomer.customerId;
  const customer = receiptCustomer.customer;
  const customerName =
    customer.fullName || customer.customerName || clean_(payload.customerName);
  const staff = clean_(payload.staff || "Cashier 1");
  const paymentStatus = clean_(payload.paymentStatus || "Paid");
  const paymentMethod = clean_(payload.paymentMethod || "Cash");
  const notes = clean_(payload.notes);
  const orderPlace = clean_(
    serviceOrderPlace_(payload) ||
      payload.orderPlace ||
      payload.tableNumber ||
      payload.place ||
      payload.location,
  );
  const items = Array.isArray(payload.items) ? payload.items : [];
  const receiptId = await createReceiptSerial();

  if (!items.length) throw new Error("Receipt has no items.");

  let receiptTotal = 0;
  let remainingPaidAmount =
    paymentStatus === "Partial" ? Number(payload.paidAmount || 0) : 0;
  const writtenItems: string[] = [];

  for (const rawReceiptItem of items) {
    const receiptItem = rawReceiptItem as Payload;
    const item = await findMenuItem(clean_(receiptItem.itemId), clean_(receiptItem.itemName));
    const qty = Number(receiptItem.qty || 1);
    const unitPrice = Number(
      receiptItem.unitPrice ||
        parsePrice_(item.priceText || item.priceTextEditLater || item.price) ||
        0,
    );
    const discount = Number(receiptItem.discount || 0);
    const total = Math.max(0, qty * unitPrice - discount);
    const orderStatus = paymentStatus === "Paid" ? "Closed" : "Open";
    const rowPaidAmount =
      paymentStatus === "Paid"
        ? total
        : Math.min(total, Math.max(0, remainingPaidAmount));
    const receiptNotes = [
      orderPlace ? `Place: ${orderPlace}` : "",
      notes,
      `Receipt: ${receiptId}`,
    ]
      .filter(Boolean)
      .join(" | ");
    const rowNotes = orderNotes_(receiptNotes, paymentStatus, rowPaidAmount);
    const pointsEarned =
      clean_(item.loyaltyEligible) === "Yes" ? Math.floor(total / 10) : 0;

    await writeDataRow(SHEETS.orders, [
      new Date(),
      customerId,
      customerName,
      staff,
      item.category || clean_(receiptItem.category),
      item.itemName || clean_(receiptItem.itemName),
      qty,
      unitPrice,
      discount,
      total,
      pointsEarned,
      Number(receiptItem.pointsRedeemed || 0),
      paymentStatus,
      orderStatus,
      rowNotes,
    ]);

    remainingPaidAmount -= rowPaidAmount;
    receiptTotal += total;
    writtenItems.push(item.itemName || clean_(receiptItem.itemName) || "Item");
  }

  if (paymentStatus === "Paid" || paymentStatus === "Partial") {
    const paidAmount =
      paymentStatus === "Partial" ? Number(payload.paidAmount || 0) : receiptTotal;

    if (paidAmount > 0) {
      await writeDataRow(SHEETS.payments, [
        new Date(),
        customerId,
        customerName,
        paymentMethod,
        paidAmount,
        staff,
        `Receipt: ${writtenItems.join(", ")}`,
      ]);
    }
  }

  return success_({
    receiptId,
    receiptTotal,
    itemCount: items.length,
    data: await buildAppData(),
  });
}

async function addPayment(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const customer = await findCustomer(customerId);

  await writeDataRow(SHEETS.payments, [
    new Date(),
    customerId,
    customer.fullName || clean_(payload.customerName),
    clean_(payload.method || "Cash"),
    Number(payload.amount || 0),
    clean_(payload.collectedBy || "Cashier 1"),
    clean_(payload.notes),
  ]);

  return success_({ data: await buildAppData() });
}

async function collectUnpaidPayment(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const amount = Number(payload.amount || payload.paidAmount || 0);
  const method = clean_(payload.method || payload.paymentMethod || "Cash");
  const collectedBy = clean_(payload.collectedBy || payload.staff || "Cashier 1");

  if (!customerId) throw new Error("Customer ID is required.");
  if (amount <= 0) throw new Error("Payment amount must be greater than 0.");

  const customer = await findCustomer(customerId);
  const closedOrders = await closeUnpaidOrders(customerId, amount);

  await writeDataRow(SHEETS.payments, [
    new Date(),
    customerId,
    customer.fullName || clean_(payload.customerName),
    method,
    amount,
    collectedBy,
    `Collected unpaid balance. Closed: ${closedOrders.join(", ") || "partial only"}`,
  ]);

  return success_({ closedOrders, data: await buildAppData() });
}

async function updateReceiptPayment(payload: Payload) {
  const paymentStatus = clean_(payload.paymentStatus || "Paid");
  if (!["Paid", "Unpaid"].includes(paymentStatus)) {
    throw new Error("Payment status must be Paid or Unpaid.");
  }

  const result = await updateReceiptRows(payload, async (context) => {
    await setCell(SHEETS.orders, context.row, context.statusIndex, paymentStatus);

    if (
      context.orderStatusIndex >= 0 &&
      !isPickedUpStatus_(context.currentOrderStatus)
    ) {
      await setCell(
        SHEETS.orders,
        context.row,
        context.orderStatusIndex,
        paymentStatus === "Paid" ? "Closed" : "Open",
      );
    }

    if (context.notesIndex >= 0) {
      const note = `Payment changed to ${paymentStatus} on ${new Date().toLocaleString()}`;
      await setCell(
        SHEETS.orders,
        context.row,
        context.notesIndex,
        context.notes ? `${context.notes} | ${note}` : note,
      );
    }
  });

  if (paymentStatus === "Paid" && result.newlyPaidTotal > 0) {
    await writeDataRow(SHEETS.payments, [
      new Date(),
      result.customerId,
      result.customerName,
      clean_(payload.paymentMethod || payload.method || "Cash"),
      result.newlyPaidTotal,
      clean_(payload.staff || payload.collectedBy || "Cashier 1"),
      `Receipt paid: ${result.itemNames.join(", ")}`,
    ]);
  }

  return success_({ updatedRows: result.updatedRows, data: await buildAppData() });
}

async function markReceiptDone(payload: Payload) {
  const result = await updateReceiptRows(payload, async (context) => {
    if (context.orderStatusIndex >= 0) {
      await setCell(SHEETS.orders, context.row, context.orderStatusIndex, "Picked Up");
    }

    if (context.notesIndex >= 0) {
      const note = `Picked up by barista on ${new Date().toLocaleString()}`;
      await setCell(
        SHEETS.orders,
        context.row,
        context.notesIndex,
        context.notes ? `${context.notes} | ${note}` : note,
      );
    }
  });

  return success_({ updatedRows: result.updatedRows, data: await buildAppData() });
}

async function generateVoucher(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const customer = await findCustomer(customerId);
  const favoriteDrink =
    clean_(payload.favoriteDrink) || getFavoriteDrink_(customer) || "Drink";
  const customerName = getCustomerName_(customer) || clean_(payload.customerName);
  const voucherCode = createVoucherCode_(customerId);

  await writeObjectRow(SHEETS.generatedVouchers, {
    voucherCode,
    customerId,
    customerName,
    fullName: customerName,
    phone: customer.phone || customer.phoneWhatsApp || clean_(payload.phone),
    phoneWhatsApp: customer.phoneWhatsApp || customer.phone || clean_(payload.phone),
    favoriteDrink,
    voucherTitle: "FREE DRINK VOUCHER",
    voucherSubtitle: "Joy Corner Loyalty Reward",
    voucherText: `Congratulations ${customerName}!`,
    voucherReward: `Enjoy 1 Free ${favoriteDrink}`,
    redeemStatus: "Not Redeemed",
    generatedAt: new Date(),
    createdAt: new Date(),
    date: new Date(),
    canvaStatus: "Pending",
    canvaLink: "",
  });

  return success_({ voucherCode, data: await buildAppData() });
}

async function redeemVoucher(payload: Payload) {
  const voucherCode = clean_(payload.voucherCode);
  if (!voucherCode) throw new Error("Voucher code is required.");

  const values = await getSheetValues(SHEETS.generatedVouchers);
  const header = (values[0] || []).map(normalizeKey_);
  const codeIndex = headerIndex_(header, ["voucherCode", "code", "id"]);
  const statusIndex = headerIndex_(header, ["redeemStatus", "status"]);
  if (codeIndex < 0 || statusIndex < 0) {
    throw new Error("Generated Vouchers sheet needs Voucher Code and Redeem Status columns.");
  }

  for (let row = 1; row < values.length; row += 1) {
    if (clean_(values[row]?.[codeIndex]) === voucherCode) {
      await setCell(SHEETS.generatedVouchers, row + 1, statusIndex, "Redeemed");
      await appendRedemption(values[row] || [], header, payload);
      return success_({ data: await buildAppData() });
    }
  }

  throw new Error(`Voucher not found: ${voucherCode}`);
}

async function updateVoucherCanvaLink(payload: Payload) {
  const voucherCode = clean_(payload.voucherCode);
  const canvaLink = clean_(payload.canvaLink);
  if (!voucherCode || !canvaLink) {
    throw new Error("Voucher code and Canva link are required.");
  }

  const values = await getSheetValues(SHEETS.generatedVouchers);
  const header = (values[0] || []).map(normalizeKey_);
  const codeIndex = headerIndex_(header, ["voucherCode", "code", "id"]);
  const statusIndex = headerIndex_(header, ["canvaStatus"]);
  const linkIndex = headerIndex_(header, ["canvaLink", "link"]);
  if (codeIndex < 0 || statusIndex < 0 || linkIndex < 0) {
    throw new Error("Generated Vouchers sheet needs Voucher Code, Canva Status, and Canva Link columns.");
  }

  for (let row = 1; row < values.length; row += 1) {
    if (clean_(values[row]?.[codeIndex]) === voucherCode) {
      await setCell(SHEETS.generatedVouchers, row + 1, statusIndex, "Created");
      await setCell(SHEETS.generatedVouchers, row + 1, linkIndex, canvaLink);
      return success_({ data: await buildAppData() });
    }
  }

  throw new Error(`Voucher not found: ${voucherCode}`);
}

async function resetDay(actor: Actor) {
  const todayKey = dateKey_(new Date());
  const data = await buildAppData();
  const todaysOrders = (data.orders || []).filter(
    (order) => orderDateKey_(order) === todayKey && !isArchivedOrder_(order),
  );
  const todaysPayments = (data.payments || []).filter(
    (payment) => paymentDateKey_(payment) === todayKey,
  );
  const todaysRedemptions = (data.redemptions || []).filter(
    (redemption) => paymentDateKey_(redemption) === todayKey,
  );
  const summary = buildDaySummary_(
    todayKey,
    todaysOrders,
    todaysPayments,
    todaysRedemptions,
  );
  const resetAt = new Date().toISOString();

  await appendDayArchive_({
    ...summary,
    resetAt,
    resetBy: actor.email,
  });
  const archivedRows = await archiveTodayOrders_(todayKey, resetAt, actor.email);

  return success_({
    archivedRows,
    daySummary: summary,
    data: await buildAppDataForRole(actor.role),
    message: `Archived ${summary.receiptCount} receipt(s) and reset today's dashboard.`,
  });
}

async function appendDayArchive_(summary: Row) {
  const headers = [
    "dateKey",
    "receiptCount",
    "orderCount",
    "paymentCount",
    "redemptionCount",
    "totalSales",
    "totalPaid",
    "totalUnpaid",
    "bestSellingItem",
    "bestSellingQty",
    "latestReceiptSerial",
    "resetAt",
    "resetBy",
  ];
  await ensureSheetHeaders_(SHEETS.dayHistory, headers);
  await appendRow(
    SHEETS.dayHistory,
    headers.map((header) => summary[header] || ""),
  );
}

async function ensureSheetHeaders_(sheetName: string, headers: string[]) {
  const sheets = await getSheetsClient();

  try {
    const values = await getSheetValues(sheetName);
    if (values.length && values[0]?.some(Boolean)) return;
  } catch {
    await sheets.spreadsheets.batchUpdate({
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
      spreadsheetId: SPREADSHEET_ID,
    });
  }

  await sheets.spreadsheets.values.update({
    range: `${quotedSheet(sheetName)}!A1:${columnLetter(headers.length - 1)}1`,
    requestBody: { values: [headers] },
    spreadsheetId: SPREADSHEET_ID,
    valueInputOption: "USER_ENTERED",
  });
}

async function archiveTodayOrders_(dateKey: string, resetAt: string, resetBy: string) {
  const values = await getSheetValues(SHEETS.orders);
  if (values.length < 2) return 0;

  const headers = (values[0] || []).map(normalizeKey_);
  const orderStatusIndex = headers.indexOf("orderStatus");
  const notesIndex = headers.indexOf("notes");

  if (orderStatusIndex < 0) {
    throw new Error("Orders sheet needs an Order Status column before reset can run.");
  }

  let archivedRows = 0;

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] || [];
    const rowRecord: Row = {};
    headers.forEach((header, columnIndex) => {
      if (header) rowRecord[header] = clean_(row[columnIndex]);
    });

    if (orderDateKey_(rowRecord) !== dateKey || isArchivedOrder_(rowRecord)) continue;

    await setCell(SHEETS.orders, index + 1, orderStatusIndex, "Archived");
    if (notesIndex >= 0) {
      const currentNotes = clean_(row[notesIndex]);
      const archiveNote = `End day reset archived at ${resetAt} by ${resetBy}`;
      await setCell(
        SHEETS.orders,
        index + 1,
        notesIndex,
        [currentNotes, archiveNote].filter(Boolean).join(" | "),
      );
    }
    archivedRows += 1;
  }

  return archivedRows;
}

async function buildAppData() {
  const rawCustomers = await sheetToObjects(SHEETS.customers);
  const realCustomers = rawCustomers.filter(isRealCustomerRow_);
  const orders = (await sheetToObjects(SHEETS.orders)).map(enrichOrder_).reverse();
  const payments = await sheetToObjects(SHEETS.payments);
  const vouchers = (await sheetToObjects(SHEETS.generatedVouchers))
    .map(enrichVoucher_)
    .reverse();
  const redemptions = await sheetToObjects(SHEETS.rewardRedemptions);
  const menu = (await sheetToObjects(SHEETS.menu))
    .filter((row) => row.itemId && row.active !== "No")
    .map(enrichMenuItem_);
  const lists = await listOptions();
  lists.orderPlace = buildOrderPlaceOptions_(orders, lists);
  const unpaid = buildUnpaidTracker_(realCustomers, orders);
  const customers = enrichCustomers_(realCustomers, orders, unpaid);
  const rewards = buildRewards_(customers, orders, vouchers);
  const winners = rewards.filter((reward) => number_(reward.freeDrinksReady) > 0);
  const todayKey = dateKey_(new Date());
  const todaysOrders = orders.filter(
    (order) => orderDateKey_(order) === todayKey && !isArchivedOrder_(order),
  );
  const todaysPayments = payments.filter((payment) => paymentDateKey_(payment) === todayKey);
  const dashboardOrders = buildDashboardOrders_(todaysOrders);
  const dashboardTopItems = buildDashboardTopItems_(todaysOrders);
  const dashboard = buildDashboard_(
    customers,
    todaysOrders,
    todaysPayments,
    rewards,
    winners,
    unpaid,
  );
  const history = buildHistory_(orders, payments, redemptions);

  return {
    dashboard,
    dashboardOrders,
    dashboardTopItems,
    customers,
    orders,
    payments,
    unpaid,
    rewards,
    winners,
    vouchers,
    redemptions,
    menu,
    lists,
    historyDays: history.days,
    generatedAt: new Date().toISOString(),
  };
}

async function searchCustomers(query: string) {
  if (!query) return [];
  const data = await buildAppData();
  const normalized = query.toLowerCase();
  const digits = digits_(query);

  const customers = (data.customers || []) as Row[];
  const orders = (data.orders || []) as Row[];

  return customers
    .filter((customer) => {
      const haystack = [
        getRowCustomerId_(customer),
        getCustomerName_(customer),
        customer.phone,
        customer.phoneWhatsApp,
        customer.favoriteDrink,
      ]
        .join(" ")
        .toLowerCase();
      const phoneDigits = digits_(customer.phone || customer.phoneWhatsApp);
      return (
        haystack.includes(normalized) ||
        (digits && phoneDigits.includes(digits)) ||
        customerHasReceipt_(customer, orders, normalized)
      );
    })
    .slice(0, 20);
}

async function customerHistory(customerId: string) {
  if (!customerId) throw new Error("Customer ID is required.");
  const data = await buildAppData();
  const customer =
    (data.customers || []).find((row) => getRowCustomerId_(row) === customerId) || {};

  return {
    customer,
    orders: (data.orders || []).filter((row) => rowsMatchCustomer_(row, customer)),
    payments: (data.payments || []).filter((row) => rowsMatchCustomer_(row, customer)),
    unpaid: (data.unpaid || []).filter((row) => rowsMatchCustomer_(row, customer)),
    vouchers: (data.vouchers || []).filter((row) => rowsMatchCustomer_(row, customer)),
    rewards: (data.rewards || []).filter((row) => rowsMatchCustomer_(row, customer)),
    redemptions: (data.redemptions || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
  };
}

async function historyDays() {
  const data = await buildAppData();
  return buildHistory_(data.orders || [], data.payments || [], data.redemptions || []).days;
}

async function dayHistory(dateKey: string) {
  if (!dateKey) throw new Error("Date key is required.");
  const data = await buildAppData();
  const orders = (data.orders || []).filter((row) => orderDateKey_(row) === dateKey);
  const payments = (data.payments || []).filter((row) => paymentDateKey_(row) === dateKey);
  const redemptions = (data.redemptions || []).filter(
    (row) => paymentDateKey_(row) === dateKey,
  );

  return {
    dateKey,
    orders,
    receipts: buildDashboardOrders_(orders),
    payments,
    redemptions,
    summary: buildDaySummary_(dateKey, orders, payments, redemptions),
  };
}

async function buildAppDataForRole(role: string) {
  const data = await buildAppData();

  if (role !== "barista" && role !== "waiter") return data;

  if (role === "barista") {
    return {
      dashboard: {
        totalOrders: data.dashboard.totalOrders,
        openReceipts: data.dashboard.openReceipts,
        pickedUpReceipts: data.dashboard.pickedUpReceipts,
      },
      dashboardOrders: data.dashboardOrders,
      generatedAt: data.generatedAt,
    };
  }

  return {
    customers: data.customers,
    dashboardOrders: data.dashboardOrders,
    lists: data.lists,
    menu: data.menu,
    orders: data.orders,
    generatedAt: data.generatedAt,
  };
}

function buildDashboard_(
  customers: Row[],
  orders: Row[],
  payments: Row[],
  rewards: Row[],
  winners: Row[],
  unpaid: Row[],
) {
  const dashboardOrders = buildDashboardOrders_(orders);
  const totalSales = sum_(orders, "total");
  const totalPaid = sum_(orders, "paidAmount");
  const totalUnpaid = sum_(unpaid || [], "unpaidBalance");
  const pickedUpReceipts = dashboardOrders.filter((order) =>
    isPickedUpStatus_(order.orderStatus),
  ).length;
  const unpaidReceipts = dashboardOrders.filter(
    (order) => number_(order.outstandingAmount) > 0,
  ).length;
  const openReceipts = Math.max(0, dashboardOrders.length - pickedUpReceipts);
  const rewardsReady = rewards.filter(
    (reward) => number_(reward.freeDrinksReady || reward.freeDrinks) > 0,
  ).length;

  return {
    totalCustomers: customers.length,
    totalOrders: dashboardOrders.length,
    totalItems: orders.length,
    totalSales,
    totalPaid,
    totalUnpaid,
    openReceipts,
    pickedUpReceipts,
    unpaidReceipts,
    rewardsReady,
    totalWinners: winners.length,
  };
}

function buildHistory_(orders: Row[], payments: Row[], redemptions: Row[]) {
  const dateKeys = uniqueStrings_([
    ...orders.map(orderDateKey_),
    ...payments.map(paymentDateKey_),
    ...redemptions.map(paymentDateKey_),
  ]).sort((left, right) => right.localeCompare(left));

  return {
    days: dateKeys.map((dateKey) =>
      buildDaySummary_(
        dateKey,
        orders.filter((row) => orderDateKey_(row) === dateKey),
        payments.filter((row) => paymentDateKey_(row) === dateKey),
        redemptions.filter((row) => paymentDateKey_(row) === dateKey),
      ),
    ),
  };
}

function buildDaySummary_(
  dateKey: string,
  orders: Row[],
  payments: Row[],
  redemptions: Row[],
) {
  const receipts = buildDashboardOrders_(orders) as Row[];
  const topDrink = buildDashboardTopItems_(orders)[0];

  return {
    dateKey,
    receiptCount: receipts.length,
    orderCount: orders.length,
    paymentCount: payments.length,
    redemptionCount: redemptions.length,
    totalSales: sum_(orders, "total"),
    totalPaid: sum_(orders, "paidAmount"),
    totalUnpaid: orders.reduce(
      (total, order) => total + number_(order.outstandingAmount),
      0,
    ),
    bestSellingItem: topDrink?.itemName || "",
    bestSellingQty: topDrink?.qtySold || "0",
    latestReceiptSerial: receipts[0]?.receiptId || "",
  };
}

function buildRewards_(customers: Row[], orders: Row[], vouchers: Row[]) {
  return customers
    .map((customer) => {
      const customerId = getRowCustomerId_(customer);
      const customerKey = customerMatchKey_(customer);
      if (!customerId && !customerKey) return null;

      const customerOrders = orders.filter((order) =>
        rowsMatchCustomer_(order, customer),
      );
      const paidDrinks = customerOrders.reduce((total, order) => {
        return total + paidEligibleDrinkQty_(order);
      }, 0);
      const earnedFreeDrinks = Math.floor(paidDrinks / REWARD_THRESHOLD);
      const customerVouchers = vouchers.filter((voucher) =>
        rowsMatchCustomer_(voucher, customer),
      );
      const generatedVoucherCount = customerVouchers.length;
      const redeemedVoucherCount = customerVouchers.filter(
        (voucher) => clean_(voucher.redeemStatus).toLowerCase() === "redeemed",
      ).length;
      const pendingVoucherCount = generatedVoucherCount - redeemedVoucherCount;
      const freeDrinksReady = Math.max(0, earnedFreeDrinks - generatedVoucherCount);
      const progress = paidDrinks % REWARD_THRESHOLD;
      const remaining = progress ? REWARD_THRESHOLD - progress : REWARD_THRESHOLD;
      const favoriteDrink = getFavoriteDrink_(customer);

      return {
        customerId,
        customerName: getCustomerName_(customer),
        phone: customer.phoneWhatsApp || customer.phone || "",
        favoriteDrink,
        paidDrinks: String(paidDrinks),
        earnedFreeDrinks: String(earnedFreeDrinks),
        generatedVouchers: String(generatedVoucherCount),
        pendingVouchers: String(pendingVoucherCount),
        redeemedVouchers: String(redeemedVoucherCount),
        freeDrinksReady: String(freeDrinksReady),
        nextRewardProgress: `${progress}/${REWARD_THRESHOLD}`,
        winner: freeDrinksReady > 0 ? "Yes" : "No",
        redeemStatus:
          pendingVoucherCount > 0
            ? `${pendingVoucherCount} voucher(s) pending`
            : redeemedVoucherCount > 0
              ? `${redeemedVoucherCount} redeemed`
              : "No voucher yet",
        winnerMessage:
          freeDrinksReady > 0
            ? `${freeDrinksReady} free drink voucher(s) ready`
            : `${remaining} paid drink(s) to next reward`,
      };
    })
    .filter(Boolean) as Row[];
}

function paidEligibleDrinkQty_(order: Row) {
  if (!isOrderPaidForRewards_(order)) return 0;
  if (!isRewardEligibleOrder_(order)) return 0;
  return orderQty_(order);
}

function isOrderPaidForRewards_(order: Row) {
  const paymentStatus = clean_(order.paymentStatus).toLowerCase();
  if (paymentStatus === "paid") return true;
  return number_(order.total) > 0 && outstandingAmount_(order) <= 0;
}

function isRewardEligibleOrder_(order: Row) {
  if (number_(order.pointsEarned) > 0) return true;

  return isDrinkOrder_(order);
}

function isDrinkOrder_(order: Row) {
  const text = `${clean_(order.category)} ${orderItemName_(order)}`.toLowerCase();
  if (
    [
      "cake",
      "dessert",
      "food",
      "sandwich",
      "croissant",
      "cookie",
      "brownie",
      "muffin",
      "toast",
    ].some((word) => text.includes(word))
  ) {
    return false;
  }

  const category = clean_(order.category).toLowerCase();
  const item = orderItemName_(order).toLowerCase();
  const drinkText = `${category} ${item}`;

  return [
    "americano",
    "beverage",
    "cappuccino",
    "drink",
    "coffee",
    "espresso",
    "frappe",
    "hot chocolate",
    "iced",
    "juice",
    "latte",
    "matcha",
    "milkshake",
    "mocha",
    "nescafe",
    "smoothie",
    "spanish",
    "tea",
  ].some((word) => drinkText.includes(word));
}

function enrichCustomers_(customers: Row[], orders: Row[], unpaid: Row[]) {
  const unpaidByCustomer: Record<string, number> = {};
  unpaid.forEach((row) => {
    unpaidByCustomer[row.customerId || ""] = number_(row.unpaidBalance);
  });

  return customers.map((customer) => {
    const normalizedCustomer = normalizeCustomerRecord_(customer);
    const customerId = getRowCustomerId_(normalizedCustomer);
    const customerOrders = orders.filter((order) =>
      rowsMatchCustomer_(order, normalizedCustomer),
    );

    return {
      ...normalizedCustomer,
      totalOrders: String(customerOrders.length),
      totalSpent: String(sum_(customerOrders, "total")),
      unpaidBalance: String(unpaidByCustomer[customerId] || 0),
      lastVisit: customerOrders[0]?.orderDateTime || normalizedCustomer.lastVisit || "",
    };
  });
}

function enrichOrder_(order: Row) {
  const item = orderItemName_(order);
  const qty = clean_(order.qty || order.quantity || "1");
  const total = number_(order.total);
  const paidAmount =
    clean_(order.paymentStatus).toLowerCase() === "paid"
      ? total
      : partialPaidAmount_(order);
  const outstanding = outstandingAmount_(order);
  const receiptId = receiptId_(order);
  const orderPlace = orderPlace_(order);
  const description = `${item || "Order"} x${qty} - ${total} EGP`;

  return {
    ...order,
    item,
    qty,
    receiptId,
    orderPlace,
    total: String(total),
    paidAmount: String(paidAmount),
    outstandingAmount: String(outstanding),
    orderDescription: description,
  };
}

function buildDashboardOrders_(orders: Row[]) {
  const grouped: Record<string, Row & {
    itemCount: number;
    total: number;
    paidAmount: number;
    outstandingAmount: number;
    orderDescriptions: string[];
    pickedUpCount: number;
  }> = {};

  orders.forEach((order) => {
    const groupKey =
      order.receiptId ||
      [
        order.orderDateTime,
        getRowCustomerId_(order),
        order.customerName,
        order.paymentStatus,
      ].join("|");

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        ...order,
        receiptKey: groupKey,
        orderPlace: order.orderPlace || orderPlace_(order) || "",
        itemCount: 0,
        total: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        orderDescriptions: [],
        pickedUpCount: 0,
      };
    }

    grouped[groupKey].itemCount += 1;
    grouped[groupKey].total += number_(order.total);
    grouped[groupKey].paidAmount += number_(order.paidAmount);
    grouped[groupKey].outstandingAmount += number_(order.outstandingAmount);
    grouped[groupKey].orderPlace =
      grouped[groupKey].orderPlace || order.orderPlace || orderPlace_(order) || "";
    if (isPickedUpStatus_(order.orderStatus)) {
      grouped[groupKey].pickedUpCount += 1;
    }
    grouped[groupKey].orderDescriptions.push(
      `${order.item || "Item"} x${order.qty || "1"}`,
    );
  });

  return Object.values(grouped).map((row) => ({
    ...row,
    total: String(row.total),
    paidAmount: String(row.paidAmount),
    outstandingAmount: String(row.outstandingAmount),
    orderDescription: row.orderDescriptions.join(" + "),
    orderItems: row.orderDescriptions,
    itemCount: String(row.itemCount),
    orderStatus:
      row.pickedUpCount >= row.itemCount ? "Picked Up" : row.orderStatus,
  }));
}

function buildDashboardTopItems_(orders: Row[]) {
  const byItem: Record<string, {
    category: string;
    itemName: string;
    lastSold: string;
    qtySold: number;
    totalSales: number;
  }> = {};

  orders.forEach((order) => {
    if (!isDrinkOrder_(order)) return;

    const itemName = orderItemName_(order);
    const groupKey = itemName.toLowerCase();
    if (!itemName) return;

    if (!byItem[groupKey]) {
      byItem[groupKey] = {
        itemName,
        category: order.category || "",
        qtySold: 0,
        totalSales: 0,
        lastSold: "",
      };
    }

    byItem[groupKey].qtySold += orderQty_(order);
    byItem[groupKey].totalSales += number_(order.total);
    byItem[groupKey].lastSold = order.orderDateTime || byItem[groupKey].lastSold;
  });

  return Object.values(byItem)
    .sort((left, right) => right.qtySold - left.qtySold || right.totalSales - left.totalSales)
    .slice(0, 8)
    .map((row, index) => ({
      ...row,
      rank: String(index + 1),
      qtySold: String(row.qtySold),
      totalSales: String(row.totalSales),
      stockAlert:
        row.qtySold >= 10
          ? "Restock today"
          : row.qtySold >= 5
            ? "Watch stock"
            : "OK",
    }));
}

function buildUnpaidTracker_(customers: Row[], orders: Row[]) {
  const byCustomer: Record<string, Row & {
    openUnpaidOrders: number;
    orderDescriptions: string[];
    settledDescriptions: string[];
    totalAmount: number;
    totalPaid: number;
    unpaidBalance: number;
  }> = {};

  customers.forEach((customer) => {
    const customerId = getRowCustomerId_(customer);
    if (!customerId) return;

    byCustomer[customerId] = {
      customerId,
      customerName: customer.fullName || customer.customerName || "",
      phone: customer.phoneWhatsApp || customer.phone || "",
      totalAmount: 0,
      totalPaid: 0,
      unpaidBalance: 0,
      lastVisit: "",
      openUnpaidOrders: 0,
      orderDescriptions: [],
      settledDescriptions: [],
      orderPlace: "",
      action: "",
      promiseDate: "",
      notes: "",
    };
  });

  orders.forEach((order) => {
    const customerId = getRowCustomerId_(order);
    if (!customerId) return;

    if (!byCustomer[customerId]) {
      byCustomer[customerId] = {
        customerId,
        customerName: order.customerName || "",
        phone: "",
        totalAmount: 0,
        totalPaid: 0,
        unpaidBalance: 0,
        lastVisit: "",
        openUnpaidOrders: 0,
        orderDescriptions: [],
        settledDescriptions: [],
        orderPlace: "",
        action: "",
        promiseDate: "",
        notes: "",
      };
    }

    const total = number_(order.total);
    const outstanding = outstandingAmount_(order);
    const paidAmount = Math.max(0, total - outstanding);
    const paymentStatus = clean_(order.paymentStatus).toLowerCase();
    const orderNotes = clean_(order.notes).toLowerCase();
    const place = order.orderPlace || orderPlace_(order);
    const orderDescription = `${order.orderDateTime || "No date"}${
      place ? ` - ${place}` : ""
    } - ${order.item || "Order"} x${order.qty || "1"} = ${total} EGP`;

    byCustomer[customerId].totalAmount += total;
    byCustomer[customerId].totalPaid += paidAmount;

    if (paymentStatus !== "paid" && outstanding > 0) {
      byCustomer[customerId].unpaidBalance += outstanding;
      byCustomer[customerId].openUnpaidOrders += 1;
      byCustomer[customerId].orderPlace =
        byCustomer[customerId].orderPlace || place;
      byCustomer[customerId].orderDescriptions.push(
        `${orderDescription} | Due ${outstanding} EGP (${order.paymentStatus || "Unpaid"})`,
      );
    } else if (orderNotes.includes("settled unpaid") && total > 0) {
      byCustomer[customerId].settledDescriptions.push(`${orderDescription} (Paid)`);
    }

    byCustomer[customerId].lastVisit =
      order.orderDateTime || byCustomer[customerId].lastVisit;
  });

  return Object.values(byCustomer)
    .filter(
      (row) =>
        number_(row.unpaidBalance) > 0 ||
        number_(row.openUnpaidOrders) > 0 ||
        row.settledDescriptions.length > 0,
    )
    .map((row) => ({
      ...row,
      paymentStatus: number_(row.unpaidBalance) > 0 ? "Unpaid" : "Paid",
      totalAmount: String(row.totalAmount),
      totalPaid: String(row.totalPaid),
      unpaidBalance: String(row.unpaidBalance),
      openUnpaidOrders: String(row.openUnpaidOrders),
      unpaidDescription: row.orderDescriptions
        .concat(row.settledDescriptions)
        .join(" | "),
    }));
}

async function listOptions() {
  const rows = await getSheetValues(SHEETS.lists);
  const headers = (rows.shift() || []).map(normalizeKey_);
  const lists: Record<string, string[]> = {};

  headers.forEach((header, index) => {
    lists[header] = rows
      .map((row) => clean_(row[index]))
      .filter((value) => value !== "");
  });

  return lists;
}

function buildOrderPlaceOptions_(orders: Row[], lists: Record<string, string[]>) {
  return uniqueStrings_([
    ...(lists.orderPlace || []),
    ...(lists.tablePlaces || []),
    ...(lists.tables || []),
    ...orders.map(orderPlace_),
    "Takeaway",
    "Hall",
    "Outside",
    "Table 1",
    "Table 2",
    "Table 3",
    "Table 4",
    "Garden",
    "Garden sofa",
    "Counter",
  ]);
}

function normalizeCustomerRecord_(customer: Row): Row {
  return {
    ...customer,
    customerId: getRowCustomerId_(customer),
    fullName: getCustomerName_(customer),
    customerName: getCustomerName_(customer),
    phoneWhatsApp:
      customer.phoneWhatsApp ||
      customer.whatsApp ||
      customer.whatsapp ||
      customer.phone ||
      "",
    favoriteDrink: getFavoriteDrink_(customer),
  };
}

function enrichVoucher_(voucher: Row) {
  const customerId = getRowCustomerId_(voucher);
  const customerName = voucher.customerName || voucher.fullName || voucher.name || "";
  const favoriteDrink =
    voucher.favoriteDrink || voucher.drink || voucher.rewardDrink || voucher.item || "";

  return {
    ...voucher,
    voucherCode: voucher.voucherCode || voucher.code || voucher.id || "",
    customerId,
    customerName,
    favoriteDrink,
    voucherReward:
      voucher.voucherReward ||
      voucher.reward ||
      (favoriteDrink ? `Enjoy 1 Free ${favoriteDrink}` : ""),
    redeemStatus: voucher.redeemStatus || voucher.status || "Not Redeemed",
    canvaStatus: voucher.canvaStatus || "Pending",
    generatedAt:
      voucher.generatedAt ||
      voucher.createdAt ||
      voucher.date ||
      voucher.generatedDate ||
      "",
  };
}

function enrichMenuItem_(item: Row): Row {
  const priceText =
    item.priceText || item.priceTextEditLater || item.price || "";

  return {
    ...item,
    priceText,
    suggestedPrice: String(parsePrice_(priceText) || ""),
  };
}

async function findCustomer(customerId: string): Promise<Row> {
  if (!customerId) return {};
  const customers = await sheetToObjects(SHEETS.customers);
  return (
    customers
      .map(normalizeCustomerRecord_)
      .find((customer) => getRowCustomerId_(customer) === customerId) || {}
  );
}

async function getOrCreateReceiptCustomer(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  if (customerId) {
    return { customerId, customer: await findCustomer(customerId), created: false };
  }

  const customerName =
    clean_(payload.customerName || payload.fullName || payload.name);
  const phone = clean_(
    payload.customerPhone ||
      payload.phone ||
      payload.phoneWhatsApp ||
      payload.whatsApp ||
      payload.whatsapp,
  );

  const existing = await findCustomerByPhoneOrName(phone, customerName);

  if (existing.customerId) {
    return { customerId: existing.customerId, customer: existing, created: false };
  }

  if (!isRealCustomerInput_(customerName)) {
    return {
      customerId: "",
      customer: { customerName: "Walk-in Guest", fullName: "", phoneWhatsApp: "" },
      created: false,
    };
  }

  const newCustomerId = await createCustomerFromOrder(customerName, phone, payload);
  return {
    customerId: newCustomerId,
    customer: await findCustomer(newCustomerId),
    created: true,
  };
}

async function findCustomerByPhoneOrName(phone: string, customerName: string): Promise<Row> {
  const normalizedPhone = digits_(phone);
  const normalizedName = clean_(customerName).toLowerCase();
  const customers = await sheetToObjects(SHEETS.customers);

  return (
    customers.map(normalizeCustomerRecord_).find((customer) => {
      const customerPhone = digits_(customer.phoneWhatsApp || customer.phone);
      const name = getCustomerName_(customer).toLowerCase();

      if (normalizedPhone && customerPhone === normalizedPhone) return true;
      return Boolean(normalizedName && name === normalizedName);
    }) || {}
  );
}

function isRealCustomerInput_(customerName: string) {
  const name = clean_(customerName).toLowerCase();
  if (!name) return false;

  return !["walk-in guest", "walk in guest", "walkin guest", "guest"].includes(name);
}

function isRealCustomerRow_(customer: Row) {
  const phone = digits_(customer.phoneWhatsApp || customer.phone || customer.whatsapp);
  return Boolean(phone || isRealCustomerInput_(getCustomerName_(customer)));
}

async function createCustomerFromOrder(customerName: string, phone: string, payload: Payload) {
  const customers = await sheetToObjects(SHEETS.customers);
  const nextId = nextIdFromRows_("CUST", customers);
  const now = new Date();

  await writeObjectRow(SHEETS.customers, {
    customerId: nextId,
    fullName: customerName,
    customerName,
    phoneWhatsApp: phone,
    phone,
    joinDate: now,
    createdAt: now,
    date: now,
    birthday: "",
    favoriteDrink: clean_(payload.favoriteDrink),
    favouriteDrink: clean_(payload.favoriteDrink),
    notes: "Created automatically from receipt.",
    active: "Yes",
    totalOrders: 0,
    totalSpent: 0,
    unpaidBalance: 0,
    points: 0,
    freeDrinksReady: 0,
  });

  return nextId;
}

async function findMenuItem(itemId: string, itemName: string): Promise<Row> {
  const menu = (await sheetToObjects(SHEETS.menu)).map(enrichMenuItem_);
  return (
    menu.find((item) => getRowItemId_(item) === itemId) ||
    menu.find((item) => item.itemName === itemName) ||
    {}
  );
}

async function closeUnpaidOrders(customerId: string, amount: number) {
  const values = await getSheetValues(SHEETS.orders);
  if (values.length < 2) return [];

  const headers = (values[0] || []).map(normalizeKey_);
  const customerIdIndex = headers.indexOf("customerId");
  const totalIndex = headers.indexOf("total");
  const statusIndex = headers.indexOf("paymentStatus");
  const orderStatusIndex = headers.indexOf("orderStatus");
  const itemIndex = headers.indexOf("item");
  const notesIndex = headers.indexOf("notes");
  let remaining = amount;
  const closedOrders: string[] = [];

  for (let row = 1; row < values.length; row += 1) {
    const valuesRow = values[row] || [];
    const rowCustomerId = clean_(valuesRow[customerIdIndex]);
    const paymentStatus = clean_(valuesRow[statusIndex]).toLowerCase();
    const total = number_(valuesRow[totalIndex]);
    const notes = notesIndex >= 0 ? valuesRow[notesIndex] : "";
    const outstanding =
      paymentStatus === "partial"
        ? Math.max(0, total - partialPaidAmount_({ notes }))
        : total;

    if (rowCustomerId !== customerId || paymentStatus === "paid" || outstanding <= 0) {
      continue;
    }

    if (remaining < outstanding) break;

    await setCell(SHEETS.orders, row + 1, statusIndex, "Paid");
    if (orderStatusIndex >= 0 && !isPickedUpStatus_(valuesRow[orderStatusIndex])) {
      await setCell(SHEETS.orders, row + 1, orderStatusIndex, "Closed");
    }
    if (notesIndex >= 0) {
      const currentNotes = clean_(valuesRow[notesIndex]);
      const settledNote = `Settled unpaid on ${new Date().toLocaleString()}`;
      await setCell(
        SHEETS.orders,
        row + 1,
        notesIndex,
        currentNotes ? `${currentNotes} | ${settledNote}` : settledNote,
      );
    }

    remaining -= outstanding;
    closedOrders.push(valuesRow[itemIndex] || `row ${row + 1}`);
  }

  return closedOrders;
}

async function updateReceiptRows(
  payload: Payload,
  updater: (context: {
    currentOrderStatus: string;
    currentPaymentStatus: string;
    notes: string;
    notesIndex: number;
    orderStatusIndex: number;
    row: number;
    statusIndex: number;
  }) => Promise<void>,
) {
  const values = await getSheetValues(SHEETS.orders);
  if (values.length < 2) throw new Error("No orders found.");

  const headers = (values[0] || []).map(normalizeKey_);
  const customerIdIndex = headers.indexOf("customerId");
  const customerNameIndex = headers.indexOf("customerName");
  const dateIndex = headers.indexOf("orderDateTime");
  const totalIndex = headers.indexOf("total");
  const statusIndex = headers.indexOf("paymentStatus");
  const orderStatusIndex = headers.indexOf("orderStatus");
  const itemIndex = headers.indexOf("item");
  const notesIndex = headers.indexOf("notes");
  const receiptId = clean_(payload.receiptId);
  const receiptKey = clean_(payload.receiptKey);
  const customerId = clean_(payload.customerId);
  const customerName = clean_(payload.customerName);
  const orderDateTime = clean_(payload.orderDateTime);
  const itemNames: string[] = [];
  let updatedRows = 0;
  let newlyPaidTotal = 0;
  let resultCustomerId = customerId;
  let resultCustomerName = customerName;

  if (statusIndex < 0) throw new Error("Orders sheet needs a Payment Status column.");

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] || [];
    const rowNotes = notesIndex >= 0 ? clean_(row[notesIndex]) : "";
    const rowReceiptId = receiptId_({ notes: rowNotes });
    const rowCustomerId = customerIdIndex >= 0 ? clean_(row[customerIdIndex]) : "";
    const rowCustomerName =
      customerNameIndex >= 0 ? clean_(row[customerNameIndex]) : "";
    const rowDate = dateIndex >= 0 ? clean_(row[dateIndex]) : "";
    const rowStatus = clean_(row[statusIndex]);
    const rowOrderStatus =
      orderStatusIndex >= 0 ? clean_(row[orderStatusIndex]) : "";
    const rowReceiptKey = [rowDate, rowCustomerId, rowCustomerName, rowStatus].join("|");

    const matchesReceiptId = receiptId && rowReceiptId === receiptId;
    const matchesReceiptKey = !receiptId && receiptKey && rowReceiptKey === receiptKey;
    const matchesFallback =
      !receiptId &&
      !receiptKey &&
      (!customerId || rowCustomerId === customerId) &&
      (!customerName || rowCustomerName === customerName) &&
      (!orderDateTime || rowDate === orderDateTime);

    if (!matchesReceiptId && !matchesReceiptKey && !matchesFallback) continue;

    const total = totalIndex >= 0 ? number_(row[totalIndex]) : 0;
    if (clean_(payload.paymentStatus) === "Paid" && rowStatus !== "Paid") {
      newlyPaidTotal += total;
    }

    await updater({
      row: index + 1,
      statusIndex,
      orderStatusIndex,
      notesIndex,
      notes: rowNotes,
      currentPaymentStatus: rowStatus,
      currentOrderStatus: rowOrderStatus,
    });

    updatedRows += 1;
    resultCustomerId = resultCustomerId || rowCustomerId;
    resultCustomerName = resultCustomerName || rowCustomerName;
    itemNames.push(itemIndex >= 0 ? row[itemIndex] || `row ${index + 1}` : `row ${index + 1}`);
  }

  if (!updatedRows) throw new Error("Receipt/order rows were not found.");

  return {
    updatedRows,
    newlyPaidTotal,
    customerId: resultCustomerId,
    customerName: resultCustomerName,
    itemNames,
  };
}

async function appendRedemption(voucherRow: string[], header: string[], payload: Payload) {
  const get = (key: string, aliases: string[] = []) => {
    const index = headerIndex_(header, [key].concat(aliases));
    return index >= 0 ? voucherRow[index] || "" : "";
  };
  const redemptions = await sheetToObjects(SHEETS.rewardRedemptions);
  const redemptionId = nextIdFromRows_("RED", redemptions);

  await writeDataRow(SHEETS.rewardRedemptions, [
    redemptionId,
    new Date(),
    get("customerId", ["customerID", "id"]),
    get("customerName", ["fullName", "name"]),
    get("favoriteDrink", ["drink", "rewardDrink"]) || "Free Drink",
    0,
    clean_(payload.staff || "Cashier 1"),
    `Redeemed voucher ${get("voucherCode", ["code"])}`,
  ]);
}

function serviceOrderPlace_(payload: Payload) {
  const serviceType = clean_(payload.serviceType);
  const place = clean_(
    payload.orderPlace || payload.tableNumber || payload.place || payload.location,
  );
  if (
    place &&
    ((serviceType && place.startsWith(`${serviceType} - `)) || place.includes("Car:"))
  ) {
    return place;
  }
  const car = [clean_(payload.carColor), clean_(payload.carName)]
    .filter(Boolean)
    .join(" ");
  const parts = [
    serviceType && serviceType !== "Hall" ? serviceType : "",
    place,
    car ? `Car: ${car}` : "",
  ].filter(Boolean);

  return parts.join(" - ");
}

function rowsMatchCustomer_(row: Row, customer: Row) {
  const rowCustomerId = getRowCustomerId_(row);
  const customerId = getRowCustomerId_(customer);
  if (rowCustomerId && customerId && rowCustomerId === customerId) return true;

  const rowPhone = digits_(
    row.phone ||
      row.phoneWhatsApp ||
      row.customerPhone ||
      row.whatsApp ||
      row.whatsapp,
  );
  const customerPhone = digits_(
    customer.phone ||
      customer.phoneWhatsApp ||
      customer.customerPhone ||
      customer.whatsApp ||
      customer.whatsapp,
  );
  if (rowPhone && customerPhone && rowPhone === customerPhone) return true;

  return Boolean(customerNameKey_(row) && customerNameKey_(row) === customerNameKey_(customer));
}

function customerMatchKey_(row: Row) {
  return (
    getRowCustomerId_(row) ||
    digits_(row.phone || row.phoneWhatsApp || row.customerPhone) ||
    customerNameKey_(row)
  );
}

function customerNameKey_(row: Row) {
  return clean_(
    row.customerName ||
      row.fullName ||
      row.name ||
      row.clientName ||
      row.customer ||
      row.guestName,
  )
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function orderItemName_(order: Row) {
  return clean_(
    order.item ||
      order.itemName ||
      order.menuItem ||
      order.productName ||
      "Item",
  );
}

function orderQty_(order: Row) {
  return Math.max(
    1,
    number_(order.qty || order.quantity || order.count || order.itemCount || 1),
  );
}

function orderNotes_(notes: string, paymentStatus: string, paidAmount: number) {
  const cleanNotes = clean_(notes);
  if (paymentStatus !== "Partial" || paidAmount <= 0) return cleanNotes;

  const paidNote = `Paid now: ${paidAmount}`;
  return cleanNotes ? `${cleanNotes} | ${paidNote}` : paidNote;
}

function partialPaidAmount_(order: Row) {
  const match = String(order.notes || "").match(/Paid now:\s*([\d,]+(?:\.\d+)?)/i);
  return match ? Number(String(match[1]).replace(/,/g, "")) : 0;
}

function outstandingAmount_(order: Row) {
  const total = number_(order.total);
  const paymentStatus = clean_(order.paymentStatus).toLowerCase();

  if (paymentStatus === "paid") return 0;
  if (paymentStatus === "partial") {
    return Math.max(0, total - partialPaidAmount_(order));
  }

  return total;
}

function isPickedUpStatus_(status: unknown) {
  const value = clean_(status).toLowerCase().replace(/[-_\s]+/g, "");
  return value === "done" || value === "pickedup" || value === "pickup";
}

function getPayloadCustomerId_(payload: Payload) {
  return clean_(payload.customerId || payload.customerID || payload.id || payload.ID);
}

function getRowCustomerId_(row: Row) {
  return clean_(row.customerId || row.customerID || row.id || row.ID);
}

function getRowItemId_(row: Row) {
  return clean_(row.itemId || row.itemID || row.id || row.ID);
}

function headerIndex_(headers: string[], names: string[]) {
  for (let index = 0; index < names.length; index += 1) {
    const found = headers.indexOf(names[index] || "");
    if (found >= 0) return found;
  }

  return -1;
}

function nextIdFromRows_(prefix: string, rows: Row[]) {
  if (!rows.length) return `${prefix}-0001`;

  const max = rows.reduce((highest, row) => {
    const id = Object.values(row)[0] || "";
    const match = String(id).match(/(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function createVoucherCode_(customerId: string) {
  const idPart = String(customerId || "CUST").replace(/[^A-Z0-9]/gi, "");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `JC-${idPart}-${randomPart}`;
}

async function createReceiptSerial() {
  const today = dateKey_(new Date()).replace(/-/g, "");
  const prefix = `JC-${today}`;
  let serial = await nextDailySerial(prefix);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!(await receiptSerialExists(serial))) return serial;
    const match = serial.match(/(\d+)$/);
    const nextNumber = match ? Number(match[1]) + 1 : 1;
    serial = `${prefix}-${String(nextNumber).padStart(4, "0")}`;
  }

  throw new Error("Could not generate a unique receipt serial. Please try again.");
}

async function nextDailySerial(prefix: string) {
  const orders = await sheetToObjects(SHEETS.orders);
  const max = orders.reduce((highest, order) => {
    const serial = receiptId_(order);
    if (!serial.startsWith(`${prefix}-`)) return highest;
    const match = serial.match(/(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

async function receiptSerialExists(serial: string) {
  const orders = await sheetToObjects(SHEETS.orders);
  return orders.some((order) => receiptId_(order) === serial);
}

function receiptId_(order: Row) {
  const match = String(order.notes || "").match(/Receipt:\s*([A-Z0-9-]+)/i);
  return match ? match[1] || "" : "";
}

function customerHasReceipt_(customer: Row, orders: Row[], query: string) {
  if (!query) return false;
  return orders
    .filter((order) => rowsMatchCustomer_(order, customer))
    .some((order) => receiptId_(order).toLowerCase().includes(query));
}

function orderDateKey_(order: Row) {
  return dateKeyFromValue_(order.dateKey || order.orderDateTime || order.date);
}

function paymentDateKey_(row: Row) {
  return dateKeyFromValue_(
    row.dateKey || row.paymentDate || row.date || row.generatedAt || row.createdAt,
  );
}

function isArchivedOrder_(order: Row) {
  const status = clean_(order.orderStatus).toLowerCase().replace(/[-_\s]+/g, "");
  const notes = clean_(order.notes).toLowerCase();
  return status === "archived" || notes.includes("end day reset archived");
}

function dateKeyFromValue_(value: unknown) {
  const text = clean_(value);
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1] || "";

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return dateKey_(parsed);

  return "";
}

function dateKey_(date: Date) {
  return date.toISOString().slice(0, 10);
}

function orderPlace_(order: Row) {
  const direct = clean_(
    order.orderPlace ||
      order.tableNumber ||
      order.table ||
      order.place ||
      order.location,
  );
  if (direct) return direct;

  const match = String(order.notes || "").match(/(?:Place|Table|Location):\s*([^|]+)/i);
  return match ? clean_(match[1]) : "";
}

function getCustomerName_(customer: Row | Record<string, unknown>) {
  return clean_(
    customer.fullName ||
      customer.customerName ||
      customer.name ||
      customer.clientName,
  );
}

function getFavoriteDrink_(customer: Row | Record<string, unknown>) {
  return clean_(
    customer.favoriteDrink ||
      customer.favouriteDrink ||
      customer.favorite ||
      customer.favourite ||
      customer.preferredDrink ||
      customer.drink,
  );
}

function parsePrice_(priceText: unknown) {
  const match = String(priceText || "").match(/[\d,]+(?:\.\d+)?/);
  return match ? Number(String(match[0]).replace(/,/g, "")) : 0;
}

function valueForHeader_(record: Payload, header: string) {
  if (Object.prototype.hasOwnProperty.call(record, header)) {
    return record[header];
  }

  const aliases: Record<string, string> = {
    customerID: "customerId",
    id: "customerId",
    name: "fullName",
    customerName: "fullName",
    phone: "phoneWhatsApp",
    whatsapp: "phoneWhatsApp",
    whatsApp: "phoneWhatsApp",
    favouriteDrink: "favoriteDrink",
    favorite: "favoriteDrink",
    favourite: "favoriteDrink",
    preferredDrink: "favoriteDrink",
    date: "joinDate",
    createdDate: "createdAt",
    generatedDate: "generatedAt",
    code: "voucherCode",
    status: "redeemStatus",
    reward: "voucherReward",
    drink: "favoriteDrink",
  };

  const alias = aliases[header];
  return alias && Object.prototype.hasOwnProperty.call(record, alias)
    ? record[alias]
    : "";
}

function valueForHeaderForSheet_(record: Payload, header: string) {
  const value = valueForHeader_(record, header);
  if (!isPhoneHeader_(header)) return value;

  const phone = clean_(value);
  return phone ? `'${phone}` : "";
}

function isPhoneHeader_(header: string) {
  return ["customerPhone", "mobile", "phone", "phoneWhatsApp", "whatsapp"].includes(header);
}

function uniqueStrings_(values: unknown[]) {
  const seen = new Set<string>();

  return values.map(clean_).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRole_(role: unknown) {
  const value = clean_(role).toLowerCase();
  return ROLE_ACTIONS[value] ? value : "waiter";
}

function clean_(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function number_(value: unknown) {
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function digits_(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function sum_(rows: Row[], key: string) {
  return rows.reduce((total, row) => total + number_(row[key]), 0);
}

function normalizeKey_(value: unknown) {
  const key = String(value || "")
    .trim()
    .replace(/[?]/g, "")
    .replace(/[()]/g, "")
    .replace(/[/]+/g, " ")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());

  return key.replace(/ID$/, "Id");
}

function success_(payload: Payload) {
  return { success: true, ...payload };
}

export const app = express();

app.use(express.json({ limit: "1mb", type: ["application/json", "text/plain"] }));
app.use((_request, response, next) => {
  response.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

app.options("/api", (_request, response) => response.sendStatus(204));

app.get("/api/menu", async (request, response) => {
  await routeDataSlice(request.query, response, (data) => ({ menu: data.menu }));
});

app.get("/api/dashboard/today", async (request, response) => {
  await routeDataSlice(request.query, response, (data) => ({
    dashboard: data.dashboard,
    dashboardOrders: data.dashboardOrders,
    dashboardTopItems: data.dashboardTopItems,
  }));
});

app.get("/api/customers/search", async (request, response) => {
  await routeAction("customerSearch", request.query, response);
});

app.get("/api/customers/:customerId/history", async (request, response) => {
  await routeAction(
    "customerHistory",
    { ...request.query, customerId: request.params.customerId },
    response,
  );
});

app.get("/api/history/days", async (request, response) => {
  await routeAction("historyDays", request.query, response);
});

app.get("/api/history/:dateKey", async (request, response) => {
  await routeAction(
    "dayHistory",
    { ...request.query, dateKey: request.params.dateKey },
    response,
  );
});

app.get("/api", async (request, response) => {
  const payload = { ...request.query };
  const action = clean_(payload.action || "appData");

  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api", async (request, response) => {
  const payload = request.body || {};
  const action = clean_(payload.action);

  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/health", (_request, response) => {
  response.json({
    success: true,
    service: "Joy Corner Firebase + Google Sheets API",
    spreadsheetId: SPREADSHEET_ID,
  });
});

async function routeAction(
  action: string,
  payload: Payload,
  response: express.Response,
) {
  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function routeDataSlice(
  payload: Payload,
  response: express.Response,
  selector: (data: Awaited<ReturnType<typeof buildAppData>>) => Payload,
) {
  try {
    await authorizeAction("appData", payload);
    response.json(success_(selector(await buildAppData())));
  } catch (error) {
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Joy Corner backend listening on http://localhost:${PORT}`);
  });
}
