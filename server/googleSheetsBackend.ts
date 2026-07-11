import dotenv from "dotenv";
import express from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { google, sheets_v4 } from "googleapis";
import { featurePermissions } from "../src/domain";
import { normalizedMenu, resolveMenuPrice } from "../src/menuRepository";
import {
  canTransitionOrderStatus,
  normalizeOrderStatus,
} from "../src/orderStatus";
import {
  actionFeaturePermissions,
  hasPermission,
  roleFeaturePermissions,
  resolveEffectivePermissions,
} from "../src/permissions";
import {
  calculateReceiptLine,
  calculateReceiptTotals,
  fromMinorUnits,
  normalizePaidAmount,
  normalizePaymentStatus,
  normalizeReceiptDiscountPercentage,
  toMinorUnits,
} from "../src/receiptCalculator";
import { neonHealth, writeNeonAuditLog } from "./neon";
import { buildNormalizedMenuSeed } from "./sheets/menuMigration";
import {
  NORMALIZED_OPERATIONAL_SHEETS,
  NORMALIZED_SHEET_HEADERS,
  NORMALIZED_SHEETS,
  NormalizedSheetName,
} from "./sheets/schema";
import { schemaForSheet } from "./sheetSchema";

dotenv.config({ path: [".env.local", ".env"] });

const SPREADSHEET_ID = spreadsheetIdFromEnv(
  process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "",
);

const SHEETS = {
  dashboard: "Dashboard",
  businessSettings: "Business Settings",
  extras: "Extras",
  generatedVouchers: "Generated Vouchers",
  menu: "Menu",
  menuCategories: "Menu Categories",
  menuItems: "Menu Items",
  menuItemSizes: "Menu Item Sizes",
  menuItemFlavors: "Menu Item Flavors",
  customers: "Customers",
  orders: "Orders",
  orderItems: "Order Items",
  orderItemExtras: "Order Item Extras",
  payments: "Payments",
  unpaidTracker: "Unpaid Tracker",
  rewards: "Rewards",
  lists: "Lists",
  loyaltyWinners: "Loyalty Winners",
  rewardRedemptions: "Reward Redemptions",
  staff: "Staff",
  staffUsers: "Staff Users",
  dayHistory: "Day History",
  auditLog: "Audit Log",
  syncFailures: "Sync Failures",
  migrationExceptions: "Migration Exceptions",
} as const;

const SHEET_ALIASES: Record<string, string[]> = {
  [SHEETS.customers]: ["Customers", "Customer", "Clients", "Guests"],
  [SHEETS.menuCategories]: ["Menu Categories", "Categories"],
  [SHEETS.menuItems]: ["Menu Items", "Items Master"],
  [SHEETS.menuItemSizes]: ["Menu Item Sizes", "Item Sizes", "Sizes"],
  [SHEETS.menuItemFlavors]: ["Menu Item Flavors", "Flavors"],
  [SHEETS.extras]: ["Extras", "Menu Extras"],
  [SHEETS.staffUsers]: ["Staff Users", "Staff", "Users", "Team"],
  [SHEETS.staff]: ["Staff"],
  [SHEETS.generatedVouchers]: [
    "Generated Vouchers",
    "Vouchers",
    "Generated Voucher",
  ],
  [SHEETS.rewardRedemptions]: ["Reward Redemptions", "Redemptions"],
  [SHEETS.loyaltyWinners]: ["Loyalty Winners", "Winners"],
  [SHEETS.unpaidTracker]: ["Unpaid Tracker", "Unpaid"],
  [SHEETS.dayHistory]: ["Day History", "History"],
  [SHEETS.auditLog]: ["Audit Log", "Audit Logs", "Audits"],
  [SHEETS.orderItems]: ["Order Items", "Items"],
  [SHEETS.orderItemExtras]: ["Order Item Extras", "Item Extras"],
  [SHEETS.syncFailures]: ["Sync Failures", "Sync Failure"],
  [SHEETS.businessSettings]: ["Business Settings", "Settings"],
  [SHEETS.migrationExceptions]: ["Migration Exceptions", "Exceptions"],
};

const DAY_HISTORY_HEADERS = [
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
] as const;

const SHEET_HEADERS: Record<string, string[]> = {
  [SHEETS.dashboard]: ["metric", "value", "description", "updatedAt"],
  [SHEETS.menu]: [
    "itemId",
    "category",
    "itemName",
    "price",
    "loyaltyEligible",
    "active",
  ],
  [SHEETS.customers]: [
    "customerId",
    "fullName",
    "phoneWhatsApp",
    "joinDate",
    "birthday",
    "favoriteDrink",
    "notes",
    "active",
  ],
  [SHEETS.orders]: [
    "orderId",
    "receiptNumber",
    "businessDate",
    "orderDateTime",
    "customerId",
    "customerName",
    "staff",
    "category",
    "item",
    "qty",
    "unitPrice",
    "discount",
    "total",
    "pointsEarned",
    "pointsRedeemed",
    "paymentStatus",
    "orderStatus",
    "notes",
  ],
  [SHEETS.orderItems]: [
    "orderItemId",
    "orderId",
    "menuItemId",
    "menuItemName",
    "category",
    "size",
    "quantity",
    "unitPrice",
    "extrasTotal",
    "lineTotal",
    "notes",
    "preparationStatus",
  ],
  [SHEETS.payments]: [
    "paymentId",
    "orderId",
    "paymentDate",
    "customerId",
    "customerName",
    "method",
    "amount",
    "collectedBy",
    "relatedOrderNotes",
  ],
  [SHEETS.unpaidTracker]: [
    "customerId",
    "customerName",
    "phone",
    "unpaidBalance",
    "lastUnpaidDate",
    "notes",
  ],
  [SHEETS.rewards]: [
    "customerId",
    "customerName",
    "phone",
    "favoriteDrink",
    "paidDrinks",
    "freeDrinksReady",
    "winnerMessage",
  ],
  [SHEETS.lists]: ["listType", "value", "active"],
  [SHEETS.loyaltyWinners]: [
    "customerId",
    "customerName",
    "phone",
    "favoriteDrink",
    "freeDrinksReady",
    "winnerMessage",
  ],
  [SHEETS.generatedVouchers]: [
    "voucherCode",
    "customerId",
    "customerName",
    "fullName",
    "phone",
    "phoneWhatsApp",
    "favoriteDrink",
    "voucherTitle",
    "voucherSubtitle",
    "voucherText",
    "voucherReward",
    "redeemStatus",
    "generatedAt",
    "createdAt",
    "date",
    "canvaStatus",
    "canvaLink",
  ],
  [SHEETS.rewardRedemptions]: [
    "redemptionId",
    "date",
    "customerId",
    "customerName",
    "freeDrinkItem",
    "valueEgp",
    "staff",
    "notes",
  ],
  [SHEETS.staffUsers]: [
    "email",
    "role",
    "name",
    "active",
    "displayName",
    "uid",
    "grant",
    "revoke",
    "updatedAt",
  ],
  [SHEETS.dayHistory]: [...DAY_HISTORY_HEADERS],
  [SHEETS.auditLog]: [
    "auditId",
    "userId",
    "role",
    "action",
    "entityType",
    "entityId",
    "previousValue",
    "newValue",
    "reason",
    "requestId",
    "success",
    "timestamp",
    "sessionMetadata",
  ],
  [SHEETS.syncFailures]: [
    "syncFailureId",
    "syncJobId",
    "entityType",
    "entityId",
    "errorMessage",
    "retryCount",
    "createdAt",
    "resolvedAt",
  ],
};

const SHEET_TAB_COLORS: Record<
  string,
  { blue: number; green: number; red: number }
> = {
  [SHEETS.dashboard]: { red: 0.18, green: 0.12, blue: 0.08 },
  [SHEETS.menu]: { red: 0.86, green: 0.56, blue: 0.24 },
  [SHEETS.customers]: { red: 0.32, green: 0.46, blue: 0.24 },
  [SHEETS.orders]: { red: 0.78, green: 0.39, blue: 0.16 },
  [SHEETS.orderItems]: { red: 0.8, green: 0.45, blue: 0.2 },
  [SHEETS.payments]: { red: 0.2, green: 0.48, blue: 0.52 },
  [SHEETS.unpaidTracker]: { red: 0.72, green: 0.2, blue: 0.16 },
  [SHEETS.rewards]: { red: 0.74, green: 0.56, blue: 0.18 },
  [SHEETS.lists]: { red: 0.48, green: 0.42, blue: 0.56 },
  [SHEETS.loyaltyWinners]: { red: 0.58, green: 0.36, blue: 0.64 },
  [SHEETS.generatedVouchers]: { red: 0.44, green: 0.38, blue: 0.78 },
  [SHEETS.rewardRedemptions]: { red: 0.34, green: 0.52, blue: 0.5 },
  [SHEETS.staffUsers]: { red: 0.25, green: 0.25, blue: 0.25 },
  [SHEETS.dayHistory]: { red: 0.24, green: 0.38, blue: 0.55 },
  [SHEETS.auditLog]: { red: 0.42, green: 0.24, blue: 0.18 },
  [SHEETS.syncFailures]: { red: 0.68, green: 0.18, blue: 0.16 },
};

const ACTION_FEATURE_PERMISSIONS: Record<string, string> =
  actionFeaturePermissions;

const ROLE_FEATURE_PERMISSIONS: Record<string, Set<string>> = {
  ...roleFeaturePermissions,
  owner: new Set(featurePermissions),
};

const ROLE_PERMISSIONS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(ROLE_FEATURE_PERMISSIONS).map(([role, permissions]) => [
    role,
    new Set(
      Object.entries(ACTION_FEATURE_PERMISSIONS)
        .filter(
          ([, feature]) =>
            role === "owner" || permissions.has(feature as never),
        )
        .map(([action]) => action),
    ),
  ]),
);

const REWARD_THRESHOLD = 5;
const PORT = Number(
  process.env.API_PORT || process.env.JOY_BACKEND_PORT || 3001,
);
const VALID_ROLES = new Set(Object.keys(ROLE_PERMISSIONS));
type Row = Record<string, any>;
type Payload = Record<string, unknown>;
type Actor = {
  active?: boolean;
  displayName?: string;
  email: string;
  permissions?: string[];
  grant?: string[];
  revoke?: string[];
  effectivePermissions?: string[];
  profileFound?: boolean;
  revokedPermissions?: string[];
  role: string;
  type?: "staff";
  uid: string;
};
type CustomerActor = {
  active?: boolean;
  displayName?: string;
  email: string;
  name?: string;
  phone?: string;
  type?: "customer";
  uid: string;
};

class ApiError extends Error {
  details?: Payload;
  statusCode: number;

  constructor(message: string, statusCode = 400, details?: Payload) {
    super(message);
    this.name = "ApiError";
    this.details = details;
    this.statusCode = statusCode;
  }
}

let sheetsClientPromise: Promise<sheets_v4.Sheets> | null = null;
let driveClientPromise: Promise<ReturnType<typeof google.drive>> | null = null;
let sheetTitlesPromise: Promise<string[]> | null = null;

function initFirebaseAdmin() {
  if (getApps().length) return;

  const credential = firebaseCredential();
  const projectId =
    process.env.JOY_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  initializeApp({
    ...(credential ? { credential } : {}),
    ...(projectId ? { projectId } : {}),
  });
}

function firebaseCredential() {
  const json = process.env.JOY_FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId =
    process.env.JOY_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.JOY_FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.JOY_FIREBASE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n",
  );

  if (json) return cert(JSON.parse(json));

  if (projectId && clientEmail && privateKey) {
    return cert({
      clientEmail,
      privateKey,
      projectId,
    });
  }

  if (process.env.FIREBASE_FUNCTIONS === "1") {
    return undefined;
  }

  throw new ApiError(
    "Missing JOY_FIREBASE_PROJECT_ID, JOY_FIREBASE_CLIENT_EMAIL, or JOY_FIREBASE_PRIVATE_KEY.",
    500,
  );
}

function validateGoogleSheetsConfig() {
  if (!SPREADSHEET_ID) {
    throw new ApiError("Missing GOOGLE_SHEET_ID.", 500);
  }
}

function spreadsheetIdFromEnv(value: string) {
  const text = clean_(value);
  const match = text.match(/\/spreadsheets\/d\/([^/]+)/);
  return match?.[1] || text;
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      validateGoogleSheetsConfig();
      const auth = googleAuth_([
        "https://www.googleapis.com/auth/spreadsheets",
      ]);
      return google.sheets({ auth, version: "v4" });
    })();
  }

  return await sheetsClientPromise;
}

async function getDriveClient_() {
  if (!driveClientPromise) {
    driveClientPromise = (async () => {
      validateGoogleSheetsConfig();
      const auth = googleAuth_(["https://www.googleapis.com/auth/drive"]);
      return google.drive({ auth, version: "v3" });
    })();
  }

  return await driveClientPromise;
}

function googleAuth_(scopes: string[]) {
  const keyFile =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ||
    process.env.JOY_FIREBASE_SERVICE_ACCOUNT_KEY_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return new google.auth.GoogleAuth({
    ...(keyFile ? { keyFile } : {}),
    scopes,
  });
}

function quotedSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function normalizeSheetTitle_(value: unknown) {
  return clean_(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function getSheetTitles() {
  if (!sheetTitlesPromise) {
    sheetTitlesPromise = (async () => {
      const sheets = await getSheetsClient();
      const metadata = await sheets.spreadsheets.get({
        fields: "sheets.properties.title",
        spreadsheetId: SPREADSHEET_ID,
      });
      return (metadata.data.sheets || [])
        .map((sheet) => clean_(sheet.properties?.title))
        .filter(Boolean);
    })();
  }

  return await sheetTitlesPromise;
}

async function resolveSheetName(sheetName: string) {
  const titles = await getSheetTitles();
  const wanted = [sheetName, ...(SHEET_ALIASES[sheetName] || [])];
  const exact = wanted
    .map((name) => titles.find((title) => title === name))
    .find(Boolean);

  if (exact) return exact;

  const normalizedTitles = new Map(
    titles.map((title) => [normalizeSheetTitle_(title), title]),
  );
  const normalized = wanted
    .map((name) => normalizedTitles.get(normalizeSheetTitle_(name)))
    .find(Boolean);

  if (normalized) return normalized;

  throw new ApiError(`Google Sheet tab missing: ${sheetName}.`, 500, {
    fallbackUsed: false,
    foundTabs: titles,
    missingTab: sheetName,
    spreadsheetId: maskId_(SPREADSHEET_ID),
  });
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
  const resolvedSheetName = await resolveSheetName(sheetName);
  let response;

  try {
    response = await sheets.spreadsheets.values.get({
      range: `${quotedSheet(resolvedSheetName)}!A:ZZ`,
      spreadsheetId: SPREADSHEET_ID,
      valueRenderOption: "FORMATTED_VALUE",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Unable to parse range|not found|Unable to parse/i.test(message)) {
      const titles = await getSheetTitles();
      throw new ApiError(`Google Sheet tab missing: ${sheetName}.`, 500, {
        fallbackUsed: false,
        foundTabs: titles,
        missingTab: sheetName,
        spreadsheetId: maskId_(SPREADSHEET_ID),
      });
    }
    throw new ApiError(`Google Sheet read failed for ${sheetName}.`, 500);
  }

  return (response.data.values || []).map((row) =>
    row.map((value) => clean_(value)),
  );
}

async function setCell(
  sheetName: string,
  row: number,
  columnIndex: number,
  value: unknown,
) {
  const sheets = await getSheetsClient();
  const resolvedSheetName = await resolveSheetName(sheetName);
  await sheets.spreadsheets.values.update({
    range: `${quotedSheet(resolvedSheetName)}!${columnLetter(columnIndex)}${row}`,
    requestBody: { values: [[valueForSheet_(value)]] },
    spreadsheetId: SPREADSHEET_ID,
    valueInputOption: "USER_ENTERED",
  });
}

async function deleteSheetRow(sheetName: string, row: number) {
  const sheets = await getSheetsClient();
  const resolvedSheetName = await resolveSheetName(sheetName);
  const metadata = await sheets.spreadsheets.get({
    fields: "sheets.properties",
    spreadsheetId: SPREADSHEET_ID,
  });
  const sheet = metadata.data.sheets?.find(
    (item) => item.properties?.title === resolvedSheetName,
  );
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId == null)
    throw new Error(`${resolvedSheetName} sheet was not found.`);

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
  const resolvedSheetName = await resolveSheetName(sheetName);
  await sheets.spreadsheets.values.append({
    insertDataOption: "INSERT_ROWS",
    range: `${quotedSheet(resolvedSheetName)}!A:ZZ`,
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
    .filter((record) =>
      firstHeader ? clean_(record[firstHeader]) !== "" : false,
    );
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

async function upsertSheetObject_(
  sheetName: string,
  idHeader: string,
  idValue: string,
  record: Payload,
) {
  await ensureSheetHeaders_(sheetName, SHEET_HEADERS[sheetName] || [idHeader]);

  const values = await getSheetValues(sheetName);
  const headers = (values[0] || []).map(normalizeKey_);
  const idIndex = headers.indexOf(normalizeKey_(idHeader));
  if (idIndex < 0) {
    throw new ApiError(`${sheetName} sheet needs ${idHeader} column.`, 500);
  }

  const existingRowIndex = values.findIndex(
    (row, index) => index > 0 && clean_(row[idIndex]) === idValue,
  );

  if (existingRowIndex < 1) {
    await writeObjectRow(sheetName, record);
    return { created: true };
  }

  await Promise.all(
    headers.map(async (header, columnIndex) => {
      if (!header || !Object.prototype.hasOwnProperty.call(record, header))
        return;
      await setCell(
        sheetName,
        existingRowIndex + 1,
        columnIndex,
        valueForHeaderForSheet_(record, header),
      );
    }),
  );

  return { created: false };
}

export async function handleAction(action: string, payload: Payload) {
  if (action === "customerMenu") {
    await authorizeCustomerAction(payload);
    return success_({ data: { menu: await customerMenu() } });
  }

  if (action === "registerCustomerProfile") {
    const customer = await authorizeCustomerAction(payload);
    return await registerCustomerProfile(payload, customer);
  }

  if (action === "submitCustomerOrder") {
    const customer = await authorizeCustomerAction(payload);
    return await submitCustomerOrder(payload, customer);
  }

  if (action === "debugAuth") {
    const actor = await authorizeAction("appData", payload);
    return success_({
      uid: actor.uid,
      email: actor.email,
      name: actor.displayName || actor.email,
      profileFound: Boolean(actor.profileFound),
      role: actor.role,
      active: actor.active !== false,
    });
  }

  if (action === "debugSheets") {
    await authorizeAction("debugSheets", payload);
    return await debugSheets();
  }

  const actor = await authorizeAction(action, payload);

  switch (action) {
    case "appData":
    case "getAppData":
      return success_({
        staff: staffForClient_(actor),
        data: {
          ...(await buildAppDataForRole(actor.role)),
          staffProfile: actor,
        },
      });
    case "liveData":
      return success_({
        data: await buildLiveDataForRole(actor.role),
        staff: staffForClient_(actor),
      });
    case "addCustomer":
      return await addCustomer(payload);
    case "updateCustomer":
      return await updateCustomer(payload);
    case "removeCustomer":
      return await removeCustomer(payload);
    case "addOrder":
      return await addOrder(payload);
    case "addReceipt":
      return await addReceipt(payload, actor);
    case "addPayment":
      return await addPayment(payload);
    case "collectUnpaidPayment":
      return await collectUnpaidPayment(payload, actor);
    case "updateReceiptPayment":
      return await updateReceiptPayment(payload, actor);
    case "collectReceiptPayment":
      return await collectReceiptPayment(payload, actor);
    case "markReceiptAccepted":
      return await updateReceiptPreparationStatus(payload, "Accepted", actor);
    case "markReceiptPreparing":
      return await updateReceiptPreparationStatus(payload, "Preparing", actor);
    case "markReceiptReady":
      return await updateReceiptPreparationStatus(payload, "Ready", actor);
    case "cancelReceipt":
      return await updateReceiptPreparationStatus(payload, "Cancelled", actor);
    case "markReceiptDone":
      return await markReceiptDone(payload, actor);
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
      return success_({
        history: await customerHistory(clean_(payload.customerId)),
      });
    case "historyDays":
      return success_({ days: await historyDays() });
    case "dayHistory":
      return success_({ history: await dayHistory(clean_(payload.dateKey)) });
    case "organizeSpreadsheet":
      return await organizeSpreadsheet();
    case "inspectSheetsWorkbook":
      return await inspectSheetsWorkbook(actor);
    case "backupSheetsWorkbook":
      return await backupSheetsWorkbook(actor);
    case "migrateSheetsWorkbook":
      return await migrateSheetsWorkbook(actor);
    case "reconcileSheetsWorkbook":
      return await reconcileSheetsWorkbook(actor);
    case "syncMenuToSheets":
      return await syncMenuToSheets(actor);
    case "updateMenuItem":
      return await updateMenuItem(payload, actor);
    case "upsertMenuCategory":
      return await upsertNormalizedMenuRecord_(
        SHEETS.menuCategories,
        "Category ID",
        payload,
        actor,
      );
    case "upsertMenuItem":
      return await upsertNormalizedMenuRecord_(
        SHEETS.menuItems,
        "Item ID",
        payload,
        actor,
      );
    case "upsertMenuSize":
      return await upsertNormalizedMenuRecord_(
        SHEETS.menuItemSizes,
        "Size ID",
        payload,
        actor,
      );
    case "archiveMenuCategory":
      return await archiveNormalizedMenuRecord_(
        SHEETS.menuCategories,
        "Category ID",
        payload,
        actor,
      );
    case "archiveMenuItem":
      return await archiveNormalizedMenuRecord_(
        SHEETS.menuItems,
        "Item ID",
        payload,
        actor,
      );
    case "archiveMenuSize":
      return await archiveNormalizedMenuRecord_(
        SHEETS.menuItemSizes,
        "Size ID",
        payload,
        actor,
      );
    case "ownerOverview":
      return await ownerOverview(actor);
    case "upsertStaff":
      return await upsertStaff(payload, actor);
    case "setStaffActive":
      return await setStaffActive(payload, actor);
    case "setStaffRole":
      return await setStaffRole(payload, actor);
    case "setStaffPermissions":
      return await setStaffPermissions(payload, actor);
    case "retrySyncFailures":
      return await retrySyncFailures(actor);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function authorizeAction(
  action: string,
  payload: Payload,
): Promise<Actor> {
  const user = await authorizeFirebaseUser(payload);
  const email = user.email;
  const uid = user.uid;
  const actor = await staffActorForUser(uid, email);

  if (!isActionAllowed_(actor, action)) {
    throw new ApiError(
      `Role '${actor.role}' is not allowed to perform action '${action}'.`,
      403,
    );
  }

  return actor;
}

async function authorizeFirebaseUser(payload: Payload): Promise<CustomerActor> {
  const idToken = tokenFromPayload_(payload);

  if (!idToken) throw new ApiError("Missing Firebase ID token.", 401);

  initFirebaseAdmin();

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return {
      email: clean_(decoded.email).toLowerCase(),
      name: clean_(decoded.name),
      uid: clean_(decoded.uid),
    };
  } catch (error) {
    safeServerError_("Invalid Firebase token", error);
    throw new ApiError("Invalid Firebase token", 401);
  }
}

async function authorizeCustomerAction(
  payload: Payload,
): Promise<CustomerActor> {
  const user = await authorizeFirebaseUser(payload);
  const staffSnapshot = await getFirestore()
    .collection("users")
    .doc(user.uid)
    .get();

  if (staffSnapshot.exists) {
    throw new ApiError(
      "Staff accounts cannot access the customer portal.",
      403,
      {
        uid: user.uid,
      },
    );
  }

  const customerSnapshot = await getFirestore()
    .collection("customers")
    .doc(user.uid)
    .get();
  if (!customerSnapshot.exists) {
    throw new ApiError(
      "No customer profile found. Please sign up first.",
      403,
      {
        uid: user.uid,
      },
    );
  }

  const data = customerSnapshot.data() || {};
  const profileEmail = clean_(data.email || user.email).toLowerCase();
  const active = activeValue_(data.active);

  if (profileEmail && profileEmail !== user.email) {
    throw new ApiError(
      "Customer profile email does not match signed-in user.",
      403,
      {
        uid: user.uid,
      },
    );
  }

  if (!active) {
    throw new ApiError("Customer account inactive.", 403, {
      uid: user.uid,
    });
  }

  return {
    ...user,
    active,
    displayName: clean_(
      data.displayName || data.name || user.name || profileEmail,
    ),
    email: profileEmail || user.email,
    phone: clean_(data.phone),
    type: "customer",
  };
}

async function staffActorForUser(uid: string, email: string): Promise<Actor> {
  const firestoreProfile = await staffProfileFromFirestore(uid, email);
  if (firestoreProfile) return { email, uid, ...firestoreProfile };

  throw new ApiError("No staff profile found. Contact owner.", 403, {
    email,
    profileFound: false,
    uid,
  });
}

async function staffProfileFromFirestore(uid: string, email: string) {
  try {
    const snapshot = await getFirestore().collection("users").doc(uid).get();
    if (!snapshot.exists) return null;

    const data = snapshot.data() || {};
    const profileEmail = clean_(data.email || email).toLowerCase();
    const active = activeValue_(data.active);
    const role = clean_(data.role).toLowerCase();

    if (profileEmail && profileEmail !== email) {
      throw new ApiError(
        "Staff profile email does not match signed-in user.",
        403,
        {
          email,
          profileFound: true,
          uid,
        },
      );
    }

    if (!active) {
      throw new ApiError("Staff account inactive.", 403, {
        active: false,
        email: profileEmail || email,
        profileFound: true,
        uid,
      });
    }

    if (!VALID_ROLES.has(role)) {
      throw new ApiError("Invalid staff role. Contact owner.", 403, {
        email: profileEmail || email,
        profileFound: true,
        role,
        uid,
      });
    }

    const grant = normalizePermissionValues_(
      data.grant || data.permissions || data.featurePermissions,
    );
    const revoke = normalizePermissionValues_(
      data.revoke ||
        data.revokedPermissions ||
        data.deniedPermissions ||
        data.disabledPermissions,
    );
    const resolution = resolveEffectivePermissions({ grant, revoke, role });

    return {
      active,
      displayName: clean_(data.name || data.displayName || profileEmail),
      effectivePermissions: resolution.effectivePermissions,
      grant,
      permissions: grant,
      profileFound: true,
      revoke,
      revokedPermissions: revoke,
      role,
      type: "staff" as const,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    safeServerError_("Firestore staff profile read failed", error);
    return null;
  }
}

async function ownerOverview(actor: Actor) {
  return success_({
    data: {
      auditLogs: (await safeSheetObjects_(SHEETS.auditLog))
        .reverse()
        .slice(0, 100),
      permissionCatalog: featurePermissions,
      staff: await staffDirectory_(),
      syncFailures: (await safeSheetObjects_(SHEETS.syncFailures))
        .reverse()
        .slice(0, 100),
      systemHealth: {
        googleSheetsConfigured: Boolean(SPREADSHEET_ID),
        neonBackupConfigured: neonBackupConfigured_(),
        role: actor.role,
      },
    },
  });
}

async function upsertStaff(payload: Payload, actor: Actor) {
  const email = clean_(payload.email).toLowerCase();
  const displayName = clean_(payload.displayName || payload.name || email);
  const role = clean_(payload.role || "waiter").toLowerCase();
  const active = activeValue_(payload.active ?? true);
  const password = clean_(payload.password);
  const grant = normalizePermissionValues_(payload.grant || payload.permissions);
  const revoke = normalizePermissionValues_(
    payload.revoke || payload.revokedPermissions,
  );
  const permissionResolution = resolveEffectivePermissions({ grant, revoke, role });

  if (!email) throw new ApiError("Staff email is required.");
  if (!displayName) throw new ApiError("Display name is required.");
  if (!VALID_ROLES.has(role)) throw new ApiError("Invalid staff role.");
  if (permissionResolution.unknown.length) {
    throw new ApiError("Unknown permission override.", 400, {
      unknown: permissionResolution.unknown,
    });
  }

  initFirebaseAdmin();

  let uid = clean_(payload.uid);
  let authCreated = false;
  requireActorPermission_(actor, uid ? "staff.update" : "staff.create");
  if (uid && password) requireActorPermission_(actor, "staff.password.reset");
  if (!uid) {
    try {
      uid = (await getAuth().getUserByEmail(email)).uid;
    } catch {
      if (!password || password.length < 6) {
        throw new ApiError(
          "A password of at least 6 characters is required to create a new Firebase Auth staff account.",
          400,
        );
      }
      uid = (
        await getAuth().createUser({
          disabled: !active,
          displayName,
          email,
          password,
        })
      ).uid;
      authCreated = true;
    }
  } else {
    if (password && password.length < 6) {
      throw new ApiError("Temporary password must be at least 6 characters.");
    }
    await getAuth().updateUser(uid, {
      disabled: !active,
      displayName,
      email,
      ...(password ? { password } : {}),
    });
  }

  const docRef = getFirestore().collection("users").doc(uid);
  const previous = (await docRef.get()).data() || {};
  const now = new Date();
  const profile = {
    active,
    displayName,
    email,
    grant,
    revoke,
    role,
    type: "staff",
    uid,
    updatedAt: FieldValue.serverTimestamp(),
    ...(previous.createdAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
  };
  await docRef.set(profile, { merge: true });
  await upsertStaffDirectoryRow_(profile);
  await recordAuditLog_(actor, {
    action: authCreated ? "staff.create" : "staff.upsert",
    entityId: uid,
    entityType: "staff",
    newValue: {
      changedAt: now.toISOString(),
      changedByEmail: actor.email,
      changedByUid: actor.uid,
      changedStaffEmail: email,
      changedStaffUid: uid,
      effectivePermissions: permissionResolution.effectivePermissions,
      newGrant: grant,
      newRevoke: revoke,
      newRole: role,
      oldGrant: normalizePermissionValues_(previous.grant || previous.permissions),
      oldRevoke: normalizePermissionValues_(
        previous.revoke || previous.revokedPermissions,
      ),
      oldRole: clean_(previous.role),
      profile,
    },
    previousValue: previous,
    reason: clean_(payload.reason),
    requestId: clean_(payload.requestId),
    success: true,
  });

  return success_({ staff: await staffDirectory_() });
}

async function setStaffActive(payload: Payload, actor: Actor) {
  const uid = clean_(payload.uid);
  if (!uid) throw new ApiError("Staff UID is required.");
  requireActorPermission_(actor, "staff.deactivate");

  const active = activeValue_(payload.active);
  const docRef = getFirestore().collection("users").doc(uid);
  const previous = (await docRef.get()).data() || {};

  await getAuth().updateUser(uid, { disabled: !active });
  await docRef.set(
    {
      active,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await upsertStaffDirectoryRow_({
    ...previous,
    active,
    uid,
    updatedAt: new Date(),
  });
  await recordAuditLog_(actor, {
    action: active ? "staff.activate" : "staff.deactivate",
    entityId: uid,
    entityType: "staff",
    newValue: { active },
    previousValue: previous,
    reason: clean_(payload.reason),
    requestId: clean_(payload.requestId),
    success: true,
  });

  return success_({ staff: await staffDirectory_() });
}

async function setStaffRole(payload: Payload, actor: Actor) {
  const uid = clean_(payload.uid);
  const role = clean_(payload.role).toLowerCase();
  if (!uid) throw new ApiError("Staff UID is required.");
  if (!VALID_ROLES.has(role)) throw new ApiError("Invalid staff role.");
  requireActorPermission_(actor, "staff.update");

  const docRef = getFirestore().collection("users").doc(uid);
  const previous = (await docRef.get()).data() || {};
  const now = new Date();
  await docRef.set(
    { role, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await upsertStaffDirectoryRow_({ ...previous, role, uid, updatedAt: now });
  await recordAuditLog_(actor, {
    action: "staff.role.update",
    entityId: uid,
    entityType: "staff",
    newValue: {
      changedAt: now.toISOString(),
      changedByEmail: actor.email,
      changedByUid: actor.uid,
      changedStaffEmail: clean_(previous.email),
      changedStaffUid: uid,
      newGrant: normalizePermissionValues_(previous.grant || previous.permissions),
      newRevoke: normalizePermissionValues_(
        previous.revoke || previous.revokedPermissions,
      ),
      newRole: role,
      oldGrant: normalizePermissionValues_(previous.grant || previous.permissions),
      oldRevoke: normalizePermissionValues_(
        previous.revoke || previous.revokedPermissions,
      ),
      oldRole: clean_(previous.role),
    },
    previousValue: previous,
    reason: clean_(payload.reason),
    requestId: clean_(payload.requestId),
    success: true,
  });

  return success_({ staff: await staffDirectory_() });
}

async function setStaffPermissions(payload: Payload, actor: Actor) {
  const uid = clean_(payload.uid);
  if (!uid) throw new ApiError("Staff UID is required.");
  requireActorPermission_(actor, "permissions.manage");

  const grant = normalizePermissionValues_(payload.grant || payload.permissions);
  const revoke = normalizePermissionValues_(
    payload.revoke || payload.revokedPermissions,
  );
  const docRef = getFirestore().collection("users").doc(uid);
  const previous = (await docRef.get()).data() || {};
  const role = clean_(previous.role || "waiter").toLowerCase();
  const resolution = resolveEffectivePermissions({ grant, revoke, role });
  if (resolution.unknown.length) {
    throw new ApiError("Unknown permission override.", 400, {
      unknown: resolution.unknown,
    });
  }
  const now = new Date();

  await docRef.set(
    {
      grant,
      revoke,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await upsertStaffDirectoryRow_({ ...previous, grant, revoke, uid, updatedAt: now });
  await recordAuditLog_(actor, {
    action: "staff.permissions.update",
    entityId: uid,
    entityType: "staff",
    newValue: {
      changedAt: now.toISOString(),
      changedByEmail: actor.email,
      changedByUid: actor.uid,
      changedStaffEmail: clean_(previous.email),
      changedStaffUid: uid,
      effectivePermissions: resolution.effectivePermissions,
      newGrant: grant,
      newRevoke: revoke,
      newRole: role,
      oldGrant: normalizePermissionValues_(previous.grant || previous.permissions),
      oldRevoke: normalizePermissionValues_(
        previous.revoke || previous.revokedPermissions,
      ),
      oldRole: role,
    },
    previousValue: previous,
    reason: clean_(payload.reason),
    requestId: clean_(payload.requestId),
    success: true,
  });

  return success_({ staff: await staffDirectory_() });
}

async function staffDirectory_() {
  const snapshot = await getFirestore().collection("users").get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      const role = clean_(data.role || "waiter").toLowerCase();
      const grant = normalizePermissionValues_(
        data.grant || data.permissions || data.featurePermissions,
      );
      const revoke = normalizePermissionValues_(
        data.revoke ||
          data.revokedPermissions ||
          data.deniedPermissions ||
          data.disabledPermissions,
      );
      const resolution = resolveEffectivePermissions({ grant, revoke, role });
      return {
        active: activeValue_(data.active),
        displayName: clean_(data.displayName || data.name || data.email),
        email: clean_(data.email).toLowerCase(),
        effectivePermissions: resolution.effectivePermissions,
        grant,
        permissions: grant,
        revoke,
        revokedPermissions: revoke,
        role,
        uid: doc.id,
        updatedAt: clean_(data.updatedAt),
      };
    })
    .filter((staff) => clean_(staff.email));
}

async function safeSheetObjects_(sheetName: string) {
  try {
    return await sheetToObjects(sheetName);
  } catch {
    return [];
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

  await updateCustomer({
    active: "No",
    customerId,
    notes: clean_(payload.reason || "Archived by owner action."),
    status: "Archived",
  });

  return success_({
    archivedCustomerId: customerId,
    data: await buildAppData(),
  });
}

async function updateCustomer(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  if (!customerId) throw new Error("Customer ID is required.");

  const existing = await findCustomer(customerId);
  if (!existing.customerId) throw new Error("Customer was not found.");

  const allowed = {
    birthday: clean_(payload.birthday || existing.birthday),
    customerId,
    email: clean_(payload.email || existing.email),
    favoriteDrinkItemId: clean_(
      payload.favoriteDrinkItemId || existing.favoriteDrinkItemId,
    ),
    fullName: clean_(payload.fullName || existing.fullName),
    joinDate: clean_(existing.joinDate || payload.joinDate || new Date()),
    notes: clean_(payload.notes || existing.notes),
    phone: clean_(payload.phone || existing.phone || existing.phoneWhatsApp),
    phoneWhatsApp: clean_(
      payload.whatsApp ||
        payload.whatsapp ||
        payload.phoneWhatsApp ||
        existing.phoneWhatsApp ||
        existing.phone,
    ),
    status: clean_(payload.status || existing.status || "Active"),
    updatedAt: new Date(),
    version: number_(existing.version) + 1 || 1,
  };

  await upsertSheetObject_(
    SHEETS.customers,
    "Customer ID",
    customerId,
    allowed,
  );

  return success_({
    customerId,
    data: await buildAppData(),
  });
}

async function addOrder(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const item = await findMenuItem(
    clean_(payload.itemId),
    clean_(payload.itemName),
  );
  const resolvedPrice = resolveMenuSelection_(payload, item);
  const line = calculateReceiptLine({
    qty: number_(payload.qty || 1),
    unitPrice: resolvedPrice.price,
  });
  const receiptDiscountPercentage = normalizeReceiptDiscountPercentage(
    payload.receiptDiscountPercentage ?? payload.discount ?? 0,
  );
  const receiptTotals = calculateReceiptTotals(
    [{ qty: line.qty, unitPrice: line.unitPrice }],
    receiptDiscountPercentage,
  );
  const qty = line.qty;
  const unitPrice = line.unitPrice;
  const discount = receiptDiscountPercentage;
  const total = receiptTotals.receiptTotal;
  const paymentStatus = normalizePaymentStatus(
    clean_(payload.paymentStatus || "Paid"),
  );
  // Payment and pickup are separate steps. Paid orders must stay live on the
  // dashboard until staff marks them Picked Up or the owner runs End Day Reset.
  const orderStatus = "Submitted";
  const paidAmount = deriveReceiptPaidAmount_(
    paymentStatus,
    number_(payload.paidAmount),
    total,
  );
  const notes = orderNotes_(
    [
      `Discount: ${receiptDiscountPercentage}%`,
      `Subtotal: ${receiptTotals.receiptSubtotal}`,
      `Discount Amount: ${receiptTotals.receiptDiscountAmount}`,
      clean_(payload.notes),
    ]
      .filter(Boolean)
      .join(" | "),
    paymentStatus,
    paidAmount,
  );
  const pointsEarned =
    clean_(item.loyaltyEligible) === "Yes" ? Math.floor(total / 10) : 0;
  const customer = await findCustomer(customerId);
  const customerName =
    customer.fullName || customer.customerName || clean_(payload.customerName);
  const receiptNumber = await createReceiptSerial();
  const orderId = clean_(payload.orderId) || `order-${receiptNumber}`;
  const orderItemId = `${orderId}-item-0001`;
  const itemName = itemNameWithSize_(
    resolvedPrice.itemName || item.itemName || clean_(payload.itemName),
    resolvedPrice.size,
  );

  await writeObjectRow(SHEETS.orders, {
    orderId,
    receiptNumber,
    businessDate: dateKey_(new Date()),
    orderDateTime: new Date(),
    customerId,
    customerName,
    staff: clean_(payload.staff || "Cashier 1"),
    category:
      resolvedPrice.category || item.category || clean_(payload.category),
    item: itemName,
    qty,
    unitPrice,
    discount,
    total,
    pointsEarned,
    pointsRedeemed: Number(payload.pointsRedeemed || 0),
    paymentStatus,
    orderStatus,
    notes,
  });
  await writeObjectRow(SHEETS.orderItems, {
    orderItemId,
    orderId,
    menuItemId: resolvedPrice.itemId || clean_(payload.itemId),
    menuItemName:
      resolvedPrice.itemName || item.itemName || clean_(payload.itemName),
    category:
      resolvedPrice.category || item.category || clean_(payload.category),
    size: resolvedPrice.size,
    quantity: qty,
    unitPrice,
    extrasTotal: 0,
    lineTotal: total,
    notes,
    preparationStatus: orderStatus,
  });

  if (
    (paymentStatus === "Paid" || paymentStatus === "Partial") &&
    paidAmount > 0
  ) {
    await addPayment({
      customerId,
      customerName,
      method: payload.paymentMethod || "Cash",
      amount: paidAmount,
      collectedBy: payload.staff || "Cashier 1",
      orderId,
      notes: item.itemName || payload.itemName,
    });
  }

  return success_({ data: await buildAppData() });
}

async function addReceipt(payload: Payload, actor: Actor) {
  const idempotencyKey = clean_(payload.idempotencyKey);
  if (idempotencyKey) {
    const existingReceiptId = await receiptIdForIdempotencyKey_(idempotencyKey);
    if (existingReceiptId) {
      return success_({
        duplicate: true,
        receiptId: existingReceiptId,
        data: await buildLiveDataForRole(actor.role),
      });
    }
  }

  const receiptCustomer = await getOrCreateReceiptCustomer(payload);
  const customerId = receiptCustomer.customerId;
  const customer = receiptCustomer.customer;
  const customerName =
    customer.fullName || customer.customerName || clean_(payload.customerName);
  const staff = clean_(payload.staff || "Cashier 1");
  await verifyActiveStaffName_(staff);
  const submittedPaymentStatus = normalizePaymentStatus(
    clean_(payload.paymentStatus || "Paid"),
  );
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
  const orderId = clean_(payload.orderId) || `order-${receiptId}`;

  if (!items.length) throw new Error("Receipt has no items.");

  const receiptDiscountPercentage = normalizeReceiptDiscountPercentage(
    payload.receiptDiscountPercentage ?? payload.discount ?? 0,
  );
  const resolvedItems = items.map((rawReceiptItem) => rawReceiptItem as Payload);
  const preparedItems = await Promise.all(
    resolvedItems.map(async (receiptItem) => {
      const item = await findMenuItem(
        clean_(receiptItem.itemId),
        clean_(receiptItem.itemName),
      );
      const resolvedPrice = resolveMenuSelection_(receiptItem, item);
      const line = calculateReceiptLine({
        qty: number_(receiptItem.qty || 1),
        unitPrice: resolvedPrice.price,
      });
      return { item, line, receiptItem, resolvedPrice };
    }),
  );
  const receiptTotals = calculateReceiptTotals(
    preparedItems.map(({ line }) => ({
      qty: line.qty,
      unitPrice: line.unitPrice,
    })),
    receiptDiscountPercentage,
  );
  const receiptTotal = receiptTotals.receiptTotal;
  const requestedPaidAmount = number_(payload.paidAmount);
  const paidAmount = deriveReceiptPaidAmount_(
    submittedPaymentStatus,
    requestedPaidAmount,
    receiptTotal,
  );
  const paymentStatus = derivePaymentStatus_(paidAmount, receiptTotal);
  const lineDiscounts = allocateReceiptDiscounts_(
    preparedItems.map(({ line }) => line.total),
    receiptTotals.receiptDiscountAmount,
  );
  let remainingPaidAmount = paidAmount;
  const writtenItems: string[] = [];
  const receiptRows: Row[] = [];

  for (const [index, preparedItem] of preparedItems.entries()) {
    const { item, line, receiptItem, resolvedPrice } = preparedItem;
    const qty = line.qty;
    const unitPrice = line.unitPrice;
    const discount = lineDiscounts[index] || 0;
    const total = Math.max(0, line.total - discount);
    const orderStatus = "Submitted";
    const rowPaidAmount =
      paymentStatus === "Paid"
        ? total
        : Math.min(total, Math.max(0, remainingPaidAmount));
    const receiptNotes = [
      orderPlace ? `Place: ${orderPlace}` : "",
      staff ? `Staff Label: ${staff}` : "",
      resolvedPrice.size ? `Size: ${resolvedPrice.size}` : "",
      `Discount: ${receiptDiscountPercentage}%`,
      `Subtotal: ${receiptTotals.receiptSubtotal}`,
      `Discount Amount: ${receiptTotals.receiptDiscountAmount}`,
      idempotencyKey ? `Idempotency: ${idempotencyKey}` : "",
      notes,
      `Receipt: ${receiptId}`,
    ]
      .filter(Boolean)
      .join(" | ");
    const rowNotes = orderNotes_(receiptNotes, paymentStatus, rowPaidAmount);
    const orderItemId = `${orderId}-item-${String(index + 1).padStart(4, "0")}`;
    const itemName = itemNameWithSize_(
      resolvedPrice.itemName || item.itemName || clean_(receiptItem.itemName),
      resolvedPrice.size,
    );

    await writeObjectRow(SHEETS.orders, {
      orderId,
      receiptNumber: receiptId,
      businessDate: dateKey_(new Date()),
      orderDateTime: new Date(),
      customerId,
      customerName,
      staff,
      category:
        resolvedPrice.category || item.category || clean_(receiptItem.category),
      item: itemName,
      qty,
      unitPrice,
      discount: receiptDiscountPercentage,
      total,
      pointsEarned:
        clean_(item.loyaltyEligible) === "Yes" ? Math.floor(total / 10) : 0,
      pointsRedeemed: Number(receiptItem.pointsRedeemed || 0),
      paymentStatus,
      orderStatus,
      notes: rowNotes,
    });
    receiptRows.push({
      orderId,
      receiptId,
      receiptNumber: receiptId,
      businessDate: dateKey_(new Date()),
      orderDateTime: new Date().toISOString(),
      customerId,
      customerName,
      staff,
      category:
        resolvedPrice.category || item.category || clean_(receiptItem.category),
      item: itemName,
      qty,
      unitPrice,
      discount: receiptDiscountPercentage,
      total,
      paidAmount: rowPaidAmount,
      outstandingAmount: Math.max(0, total - rowPaidAmount),
      paymentStatus,
      orderStatus,
      notes: rowNotes,
      orderPlace,
    });
    await writeObjectRow(SHEETS.orderItems, {
      orderItemId,
      orderId,
      menuItemId: resolvedPrice.itemId || clean_(receiptItem.itemId),
      menuItemName:
        resolvedPrice.itemName || item.itemName || clean_(receiptItem.itemName),
      category:
        resolvedPrice.category || item.category || clean_(receiptItem.category),
      size: resolvedPrice.size,
      quantity: qty,
      unitPrice,
      extrasTotal: 0,
      lineTotal: total,
      notes: rowNotes,
      preparationStatus: orderStatus,
    });

    remainingPaidAmount -= rowPaidAmount;
    writtenItems.push(itemName || "Item");
  }

  if (paidAmount > 0) {
    await writeObjectRow(SHEETS.payments, {
      paymentId: stableUniqueId_("pay"),
      orderId,
      paymentDate: new Date(),
      customerId,
      customerName,
      method: paymentMethod,
      amount: paidAmount,
      collectedBy: staff,
      relatedOrderNotes: `Receipt: ${receiptId} - ${writtenItems.join(", ")}`,
    });
  }
  const receipt = buildDashboardOrders_(receiptRows)[0] || {
    receiptId,
    receiptNumber: receiptId,
    customerId,
    customerName,
    staff,
    orderPlace,
    total: String(receiptTotal),
    paidAmount: String(paidAmount),
    outstandingAmount: String(Math.max(0, receiptTotal - paidAmount)),
    paymentStatus,
    orderStatus: "Submitted",
    notes,
  };

  return success_({
    receiptId,
    receipt,
    receiptDiscountAmount: receiptTotals.receiptDiscountAmount,
    receiptDiscountPercentage,
    receiptSubtotal: receiptTotals.receiptSubtotal,
    receiptTotal,
    itemCount: items.length,
    data: await buildLiveDataForRole(actor.role),
  });
}

async function addPayment(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const customer = await findCustomer(customerId);

  await writeObjectRow(SHEETS.payments, {
    paymentId: clean_(payload.paymentId) || stableUniqueId_("pay"),
    orderId: clean_(payload.orderId),
    paymentDate: new Date(),
    customerId,
    customerName: customer.fullName || clean_(payload.customerName),
    method: clean_(payload.method || "Cash"),
    amount: Number(payload.amount || 0),
    collectedBy: clean_(payload.collectedBy || "Cashier 1"),
    relatedOrderNotes: clean_(payload.notes),
  });

  return success_({ data: await buildAppData() });
}

async function customerMenu() {
  return await menuForApp_();
}

async function syncMenuToSheets(actor: Actor) {
  for (const item of normalizedMenu) {
    await upsertSheetObject_(SHEETS.menu, "itemId", item.itemId, {
      active: item.active ? "Yes" : "No",
      category: item.category,
      itemId: item.itemId,
      itemName: item.itemName,
      loyaltyEligible: "Yes",
      price: item.priceText,
    });
  }
  const normalizedSeed = await seedNormalizedMenu_(actor);

  await recordAuditLog_(actor, {
    action: "menu.seed.sync",
    entityType: "menu",
    newValue: { itemCount: normalizedMenu.length, normalizedSeed },
    success: true,
  });

  return success_({
    data: await buildAppDataForRole(actor.role),
    message: `Synchronized ${normalizedMenu.length} menu item(s) and normalized menu tables to Google Sheets.`,
  });
}

async function updateMenuItem(payload: Payload, actor: Actor) {
  const itemId = clean_(payload.itemId);
  if (!itemId) throw new ApiError("Menu item ID is required.");

  const existing =
    (await menuForApp_()).find((item) => clean_(item.itemId) === itemId) || {};
  const record = {
    active: activeValue_(payload.active ?? existing.active) ? "Yes" : "No",
    category: clean_(payload.category || existing.category),
    itemId,
    itemName: clean_(payload.itemName || existing.itemName || existing.name),
    loyaltyEligible: clean_(
      payload.loyaltyEligible || existing.loyaltyEligible || "Yes",
    ),
    price: clean_(payload.price || payload.priceText || existing.priceText),
  };

  if (!record.itemName) throw new ApiError("Menu item name is required.");
  if (!record.category) throw new ApiError("Menu category is required.");
  if (!parsePrice_(record.price)) throw new ApiError("Menu price is required.");

  await upsertSheetObject_(SHEETS.menu, "itemId", itemId, record);
  await recordAuditLog_(actor, {
    action: "menu.item.update",
    entityId: itemId,
    entityType: "menuItem",
    newValue: record,
    previousValue: existing,
    reason: clean_(payload.reason),
    requestId: clean_(payload.requestId),
    success: true,
  });

  return success_({ data: await buildAppDataForRole(actor.role) });
}

async function upsertNormalizedMenuRecord_(
  sheetName: string,
  idHeader: string,
  payload: Payload,
  actor: Actor,
) {
  await ensureSheetHeaders_(sheetName, SHEET_HEADERS[sheetName] || [idHeader]);
  const idKey = normalizeKey_(idHeader);
  const idValue = clean_(payload[idKey] || payload.id || payload.itemId);
  if (!idValue) throw new ApiError(`${idHeader} is required.`);
  const record = {
    ...payload,
    [idKey]: idValue,
    active: clean_(payload.active || "Yes"),
    updatedAt: new Date(),
  };
  if (!payload.createdAt) record.createdAt = new Date();

  await upsertSheetObject_(sheetName, idHeader, idValue, record);
  await recordAuditLog_(actor, {
    action: `${sheetName}.upsert`,
    entityId: idValue,
    entityType: sheetName,
    newValue: record,
    success: true,
  });

  return success_({ id: idValue, data: await buildAppDataForRole(actor.role) });
}

async function archiveNormalizedMenuRecord_(
  sheetName: string,
  idHeader: string,
  payload: Payload,
  actor: Actor,
) {
  const idKey = normalizeKey_(idHeader);
  const idValue = clean_(payload[idKey] || payload.id || payload.itemId);
  if (!idValue) throw new ApiError(`${idHeader} is required.`);

  await upsertSheetObject_(sheetName, idHeader, idValue, {
    [idKey]: idValue,
    active: "No",
    updatedAt: new Date(),
  });
  await recordAuditLog_(actor, {
    action: `${sheetName}.archive`,
    entityId: idValue,
    entityType: sheetName,
    reason: clean_(payload.reason),
    success: true,
  });

  return success_({
    archivedId: idValue,
    data: await buildAppDataForRole(actor.role),
  });
}

async function registerCustomerProfile(payload: Payload, actor: CustomerActor) {
  const customerName = clean_(
    payload.customerName ||
      payload.displayName ||
      actor.displayName ||
      actor.name ||
      actor.email,
  );
  const phone = clean_(payload.phone || payload.customerPhone || actor.phone);

  if (!isRealCustomerInput_(customerName)) {
    throw new Error("Customer name is required.");
  }

  const existing = await findCustomerByPhoneOrName(phone, customerName);
  if (existing.customerId) {
    return success_({
      customerId: existing.customerId,
      message: "Customer profile already exists in the Customers sheet.",
    });
  }

  const customerId = await createCustomerFromOrder(customerName, phone, {
    ...payload,
    customerName,
    phone,
    notes: [
      "Created automatically from customer signup.",
      `Firebase UID: ${actor.uid}`,
      actor.email ? `Email: ${actor.email}` : "",
      clean_(payload.notes),
    ]
      .filter(Boolean)
      .join(" | "),
  });

  return success_({
    customerId,
    message: "Customer profile saved in the Customers sheet.",
  });
}

async function submitCustomerOrder(payload: Payload, actor: CustomerActor) {
  const item = await findMenuItem(
    clean_(payload.itemId),
    clean_(payload.itemName),
  );
  if (!item.itemId && !item.itemName)
    throw new Error("Choose a menu item first.");
  const resolvedPrice = resolveMenuSelection_(payload, item);

  const customerName = clean_(
    payload.customerName || actor.displayName || actor.name || actor.email,
  );
  const phone = clean_(payload.phone || payload.customerPhone || actor.phone);
  const qty = Math.max(1, number_(payload.qty || 1));
  const unitPrice = resolvedPrice.price;
  const total = Math.max(0, qty * unitPrice);
  const receiptId = await createReceiptSerial();
  const orderId = `order-${receiptId}`;
  const orderItemId = `${orderId}-item-0001`;
  const customer = await getOrCreateReceiptCustomer({
    customerName,
    phone,
  });
  const orderPlace = clean_(
    payload.orderPlace || payload.location || "Customer request",
  );
  const notes = [
    "Customer online order request",
    `Firebase UID: ${actor.uid}`,
    actor.email ? `Email: ${actor.email}` : "",
    orderPlace ? `Place: ${orderPlace}` : "",
    clean_(payload.notes),
    `Receipt: ${receiptId}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const itemName = itemNameWithSize_(
    resolvedPrice.itemName || item.itemName || clean_(payload.itemName),
    resolvedPrice.size,
  );

  await writeObjectRow(SHEETS.orders, {
    orderId,
    receiptNumber: receiptId,
    businessDate: dateKey_(new Date()),
    orderDateTime: new Date(),
    customerId: customer.customerId,
    customerName: getCustomerName_(customer.customer) || customerName,
    staff: "Customer Request",
    category:
      resolvedPrice.category || item.category || clean_(payload.category),
    item: itemName,
    qty,
    unitPrice,
    discount: 0,
    total,
    pointsEarned: 0,
    pointsRedeemed: 0,
    paymentStatus: "Unpaid",
    orderStatus: "Submitted",
    notes,
  });
  await writeObjectRow(SHEETS.orderItems, {
    orderItemId,
    orderId,
    menuItemId: resolvedPrice.itemId || clean_(payload.itemId),
    menuItemName:
      resolvedPrice.itemName || item.itemName || clean_(payload.itemName),
    category:
      resolvedPrice.category || item.category || clean_(payload.category),
    size: resolvedPrice.size,
    quantity: qty,
    unitPrice,
    extrasTotal: 0,
    lineTotal: total,
    notes,
    preparationStatus: "Submitted",
  });

  return success_({
    message: "Order request sent to Joy Corner.",
    receiptId,
    total,
  });
}

async function collectUnpaidPayment(payload: Payload, actor: Actor) {
  const customerId = getPayloadCustomerId_(payload);
  const amount = Number(payload.amount || payload.paidAmount || 0);
  const method = clean_(payload.method || payload.paymentMethod || "Cash");
  const collectedBy = clean_(
    payload.collectedBy || payload.staff || "Cashier 1",
  );

  if (!customerId) throw new Error("Customer ID is required.");
  if (amount <= 0) throw new Error("Payment amount must be greater than 0.");

  const customer = await findCustomer(customerId);
  const closedOrders = await closeUnpaidOrders(customerId, amount);

  await writeObjectRow(SHEETS.payments, {
    paymentId: stableUniqueId_("pay"),
    orderId: clean_(payload.orderId),
    paymentDate: new Date(),
    customerId,
    customerName: customer.fullName || clean_(payload.customerName),
    method,
    amount,
    collectedBy,
    relatedOrderNotes: `Collected unpaid balance. Closed: ${closedOrders.join(", ") || "partial only"}`,
  });

  return success_({ closedOrders, data: await buildLiveDataForRole(actor.role) });
}

async function updateReceiptPayment(payload: Payload, actor: Actor) {
  const paymentStatus = clean_(payload.paymentStatus || "Paid");
  if (!["Paid", "Unpaid"].includes(paymentStatus)) {
    throw new Error("Payment status must be Paid or Unpaid.");
  }

  const result = await updateReceiptRows(payload, async (context) => {
    await setCell(
      SHEETS.orders,
      context.row,
      context.statusIndex,
      paymentStatus,
    );

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
    await writeObjectRow(SHEETS.payments, {
      paymentId: stableUniqueId_("pay"),
      orderId: clean_(payload.orderId),
      paymentDate: new Date(),
      customerId: result.customerId,
      customerName: result.customerName,
      method: clean_(payload.paymentMethod || payload.method || "Cash"),
      amount: result.newlyPaidTotal,
      collectedBy: clean_(payload.staff || payload.collectedBy || "Cashier 1"),
      relatedOrderNotes: `Receipt paid: ${result.itemNames.join(", ")}`,
    });
  }

  return success_({
    updatedRows: result.updatedRows,
    data: await buildLiveDataForRole(actor.role),
  });
}

async function collectReceiptPayment(payload: Payload, actor: Actor) {
  const amount = number_(payload.amount);
  if (amount <= 0) throw new ApiError("Paid amount must be greater than 0.", 400);

  const values = await getSheetValues(SHEETS.orders);
  if (values.length < 2) throw new Error("No orders found.");

  const headers = (values[0] || []).map(normalizeKey_);
  const customerIdIndex = headers.indexOf("customerId");
  const customerNameIndex = headers.indexOf("customerName");
  const dateIndex = headers.indexOf("orderDateTime");
  const orderIdIndex = headers.indexOf("orderId");
  const receiptNumberIndex = headers.indexOf("receiptNumber");
  const totalIndex = headers.indexOf("total");
  const statusIndex = headers.indexOf("paymentStatus");
  const notesIndex = headers.indexOf("notes");
  const itemIndex = headers.indexOf("item");
  const receiptId = clean_(payload.receiptId);
  const receiptKey = clean_(payload.receiptKey);
  const orderId = clean_(payload.orderId);
  const matched: Array<{
    itemName: string;
    notes: string;
    paid: number;
    row: number;
    total: number;
  }> = [];
  let customerId = clean_(payload.customerId);
  let customerName = clean_(payload.customerName);

  if (statusIndex < 0)
    throw new Error("Orders sheet needs a Payment Status column.");

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] || [];
    const rowNotes = notesIndex >= 0 ? clean_(row[notesIndex]) : "";
    const rowReceiptId = receiptId_({
      notes: rowNotes,
      orderId: orderIdIndex >= 0 ? row[orderIdIndex] : "",
      receiptNumber: receiptNumberIndex >= 0 ? row[receiptNumberIndex] : "",
    });
    const rowOrderId = orderIdIndex >= 0 ? clean_(row[orderIdIndex]) : "";
    const rowDate = dateIndex >= 0 ? clean_(row[dateIndex]) : "";
    const rowCustomerId =
      customerIdIndex >= 0 ? clean_(row[customerIdIndex]) : "";
    const rowCustomerName =
      customerNameIndex >= 0 ? clean_(row[customerNameIndex]) : "";
    const rowStatus = statusIndex >= 0 ? clean_(row[statusIndex]) : "";
    const rowReceiptKey = [
      rowDate,
      rowCustomerId,
      rowCustomerName,
      rowStatus,
    ].join("|");

    const matchesReceiptId = receiptId && rowReceiptId === receiptId;
    const matchesOrderId = orderId && rowOrderId === orderId;
    const matchesReceiptKey =
      !receiptId && receiptKey && rowReceiptKey === receiptKey;

    if (!matchesReceiptId && !matchesOrderId && !matchesReceiptKey) continue;

    const total = totalIndex >= 0 ? number_(row[totalIndex]) : 0;
    const paid = receiptRowPaidAmount_({
      notes: rowNotes,
      paidAmount: 0,
      paymentStatus: rowStatus,
      total,
    });
    matched.push({
      itemName:
        itemIndex >= 0 ? clean_(row[itemIndex]) || `row ${index + 1}` : `row ${index + 1}`,
      notes: rowNotes,
      paid,
      row: index + 1,
      total,
    });
    customerId = customerId || rowCustomerId;
    customerName = customerName || rowCustomerName;
  }

  if (!matched.length) throw new ApiError("Receipt was not found.", 404);

  const total = matched.reduce((sum, row) => sum + row.total, 0);
  const paidBefore = Math.min(
    total,
    matched.reduce((sum, row) => sum + row.paid, 0),
  );
  const remainingBefore = Math.max(0, total - paidBefore);
  if (amount > remainingBefore) {
    throw new ApiError("Paid amount cannot exceed the receipt total.", 400, {
      remainingAmount: remainingBefore,
    });
  }

  let remainingToAllocate = amount;
  for (const [index, row] of matched.entries()) {
    const rowRemaining = Math.max(0, row.total - row.paid);
    const allocation =
      index === matched.length - 1
        ? remainingToAllocate
        : Math.min(rowRemaining, amount * (rowRemaining / remainingBefore));
    const paidNow = Math.round(allocation * 100) / 100;
    remainingToAllocate = Math.max(0, remainingToAllocate - paidNow);
    if (paidNow > 0 && notesIndex >= 0) {
      const note = `Paid now: ${paidNow}`;
      await setCell(
        SHEETS.orders,
        row.row,
        notesIndex,
        row.notes ? `${row.notes} | ${note}` : note,
      );
    }
  }

  const paidAmount = Math.min(total, paidBefore + amount);
  const remainingAmount = Math.max(0, total - paidAmount);
  const paymentStatus = derivePaymentStatus_(paidAmount, total);
  for (const row of matched) {
    await setCell(SHEETS.orders, row.row, statusIndex, paymentStatus);
  }

  await writeObjectRow(SHEETS.payments, {
    paymentId: stableUniqueId_("pay"),
    orderId,
    paymentDate: new Date(),
    customerId,
    customerName,
    method: clean_(payload.paymentMethod || payload.method || "Cash"),
    amount,
    collectedBy: clean_(payload.collectedBy || actor.displayName || actor.email),
    relatedOrderNotes: `Receipt payment collected: ${matched.map((row) => row.itemName).join(", ")}`,
  });

  return success_({
    receiptId,
    total,
    paidAmount,
    remainingAmount,
    paymentStatus,
    data: await buildLiveDataForRole(actor.role),
  });
}

async function updateReceiptPreparationStatus(
  payload: Payload,
  nextStatus: "Accepted" | "Preparing" | "Ready" | "Picked Up" | "Cancelled",
  actor: Actor,
) {
  const result = await updateReceiptRows(payload, async (context) => {
    const currentStatus = normalizeOrderStatus(context.currentOrderStatus);
    if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
      throw new ApiError(
        `Order status cannot move from ${currentStatus} to ${nextStatus}.`,
        409,
      );
    }

    if (context.orderStatusIndex >= 0) {
      await setCell(
        SHEETS.orders,
        context.row,
        context.orderStatusIndex,
        nextStatus,
      );
    }

    if (context.notesIndex >= 0) {
      const note = `Status changed to ${nextStatus} on ${new Date().toLocaleString()}`;
      await setCell(
        SHEETS.orders,
        context.row,
        context.notesIndex,
        context.notes ? `${context.notes} | ${note}` : note,
      );
    }
  });

  return success_({
    updatedRows: result.updatedRows,
    data: await buildLiveDataForRole(actor.role),
  });
}

async function markReceiptDone(payload: Payload, actor: Actor) {
  return await updateReceiptPreparationStatus(payload, "Picked Up", actor);
}

async function generateVoucher(payload: Payload) {
  const customerId = getPayloadCustomerId_(payload);
  const customer = await findCustomer(customerId);
  const favoriteDrink =
    clean_(payload.favoriteDrink) || getFavoriteDrink_(customer) || "Drink";
  const customerName =
    getCustomerName_(customer) || clean_(payload.customerName);
  const voucherCode = createVoucherCode_(customerId);

  await writeObjectRow(SHEETS.generatedVouchers, {
    voucherCode,
    customerId,
    customerName,
    fullName: customerName,
    phone: customer.phone || customer.phoneWhatsApp || clean_(payload.phone),
    phoneWhatsApp:
      customer.phoneWhatsApp || customer.phone || clean_(payload.phone),
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
    throw new Error(
      "Generated Vouchers sheet needs Voucher Code and Redeem Status columns.",
    );
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
    throw new Error(
      "Generated Vouchers sheet needs Voucher Code, Canva Status, and Canva Link columns.",
    );
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

  if (await dayArchiveExists_(todayKey)) {
    throw new ApiError(
      `Business day ${todayKey} has already been archived. Duplicate End Day reset is blocked.`,
      409,
      { businessDate: todayKey },
    );
  }

  await appendDayArchive_({
    ...summary,
    resetAt,
    resetBy: actor.email,
  });
  const archivedRows = await archiveTodayOrders_(
    todayKey,
    resetAt,
    actor.email,
  );
  await recordAuditLog_(actor, {
    action: "day.reset",
    entityId: todayKey,
    entityType: "businessDay",
    newValue: {
      archivedRows,
      summary,
    },
    reason: "Owner End Day reset",
    success: true,
  });

  return success_({
    archivedRows,
    daySummary: summary,
    data: await buildAppDataForRole(actor.role),
    message: `Archived ${summary.receiptCount} receipt(s) and reset today's dashboard.`,
  });
}

async function appendDayArchive_(summary: Row) {
  const headers = [...DAY_HISTORY_HEADERS];
  await ensureExactSheetHeaders_(SHEETS.dayHistory, headers);
  await appendRow(
    SHEETS.dayHistory,
    headers.map((header) => summary[header] || ""),
  );
}

async function dayArchiveExists_(dateKey: string) {
  try {
    const rows = await sheetToObjects(SHEETS.dayHistory);
    return rows.some((row) => dateKeyFromValue_(row.dateKey) === dateKey);
  } catch {
    return false;
  }
}

async function ensureSheetHeaders_(sheetName: string, headers: string[]) {
  const sheets = await getSheetsClient();

  try {
    const values = await getSheetValues(sheetName);
    const resolvedSheetName = await resolveSheetName(sheetName);
    await repairSheetHeaders_(resolvedSheetName, values[0] || [], headers);
    return;
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

async function repairSheetHeaders_(
  sheetName: string,
  currentHeaderRow: unknown[],
  requiredHeaders: string[],
) {
  const currentHeaders = currentHeaderRow.map(clean_).filter(Boolean);
  const currentHeaderKeys = new Set(currentHeaders.map(normalizeKey_));
  const missingHeaders = requiredHeaders.filter(
    (header) => !currentHeaderKeys.has(normalizeKey_(header)),
  );

  if (currentHeaders.length && !missingHeaders.length) return;

  const nextHeaders = currentHeaders.length
    ? [...currentHeaders, ...missingHeaders]
    : requiredHeaders;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    range: `${quotedSheet(sheetName)}!A1:${columnLetter(nextHeaders.length - 1)}1`,
    requestBody: { values: [nextHeaders] },
    spreadsheetId: SPREADSHEET_ID,
    valueInputOption: "USER_ENTERED",
  });
}

async function ensureExactSheetHeaders_(sheetName: string, headers: string[]) {
  await ensureSheetHeaders_(sheetName, headers);

  const sheets = await getSheetsClient();
  const resolvedSheetName = await resolveSheetName(sheetName);
  const values = await getSheetValues(sheetName);
  const currentHeaders = (values[0] || []).map(normalizeKey_);
  const expectedHeaderKey = headers.join("|");
  const currentHeaderKey = currentHeaders.slice(0, headers.length).join("|");

  if (currentHeaderKey === expectedHeaderKey) return;

  await sheets.spreadsheets.values.update({
    range: `${quotedSheet(resolvedSheetName)}!A1:${columnLetter(headers.length - 1)}1`,
    requestBody: { values: [headers] },
    spreadsheetId: SPREADSHEET_ID,
    valueInputOption: "USER_ENTERED",
  });
}

async function organizeSpreadsheet() {
  const repairedTabs: string[] = [];
  const formattedTabs: string[] = [];
  let historyRowsAdded = 0;

  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    const resolvedSheetName = await ensureSheetExists_(sheetName, headers);
    await formatSheetTab_(
      resolvedSheetName,
      headers.length,
      SHEET_TAB_COLORS[sheetName],
    );
    repairedTabs.push(resolvedSheetName);
    formattedTabs.push(resolvedSheetName);
  }

  historyRowsAdded = await backfillDayHistory_();

  return success_({
    formattedTabs,
    historyRowsAdded,
    message: `Organized ${formattedTabs.length} sheet tab(s). Added ${historyRowsAdded} history day row(s).`,
    repairedTabs,
  });
}

async function inspectSheetsWorkbook(actor: Actor) {
  const sheets = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    fields:
      "properties.title,sheets.properties,sheets.data.rowData.values(formattedValue,userEnteredValue,dataValidation)",
    includeGridData: true,
    spreadsheetId: SPREADSHEET_ID,
  });
  const tabs = (metadata.data.sheets || []).map((sheet) => {
    const rows = sheet.data?.[0]?.rowData || [];
    const headers = (rows[0]?.values || [])
      .map((cell) => clean_(cell.formattedValue || cell.userEnteredValue))
      .filter(Boolean);
    const formulaErrors: Row[] = [];
    const formulas: Row[] = [];
    const validations: Row[] = [];

    rows.slice(0, 100).forEach((row, rowIndex) => {
      (row.values || []).slice(0, 60).forEach((cell, columnIndex) => {
        const value = clean_(cell.formattedValue);
        const formula = clean_(cell.userEnteredValue?.formulaValue);
        if (/^#(NAME|REF|VALUE|DIV\/0)!?$/i.test(value)) {
          formulaErrors.push({
            column: columnIndex + 1,
            row: rowIndex + 1,
            value,
          });
        }
        if (formula) {
          formulas.push({
            column: columnIndex + 1,
            formula,
            row: rowIndex + 1,
          });
        }
        if (cell.dataValidation) {
          validations.push({ column: columnIndex + 1, row: rowIndex + 1 });
        }
      });
    });

    return {
      formulaErrors,
      formulas: formulas.slice(0, 10),
      headers,
      rows: Math.max(0, Number(sheet.properties?.gridProperties?.rowCount) - 1),
      sheetId: sheet.properties?.sheetId,
      title: clean_(sheet.properties?.title),
      validations: validations.slice(0, 10),
    };
  });

  await recordAuditLog_(actor, {
    action: "sheets.inspect",
    entityType: "workbook",
    newValue: { tabCount: tabs.length },
    success: true,
  });

  return success_({
    spreadsheetId: maskId_(SPREADSHEET_ID),
    title: metadata.data.properties?.title,
    tabs,
  });
}

async function backupSheetsWorkbook(actor: Actor) {
  const drive = await getDriveClient_();
  const timestamp = migrationTimestamp_();
  const copy = await drive.files.copy({
    fileId: SPREADSHEET_ID,
    fields: "id,name,webViewLink",
    requestBody: {
      name: `Joy Corner Sheets Backup ${timestamp}`,
    },
  });

  await upsertSheetObject_(
    SHEETS.businessSettings,
    "Setting Key",
    "last_workbook_backup_id",
    {
      description: "Latest automated migration backup workbook ID.",
      settingKey: "last_workbook_backup_id",
      settingValue: copy.data.id,
      updatedAt: new Date(),
      updatedBy: actor.email,
      valueType: "string",
    },
  );
  await recordAuditLog_(actor, {
    action: "sheets.backup",
    entityId: clean_(copy.data.id),
    entityType: "workbook",
    newValue: { backupName: copy.data.name },
    success: true,
  });

  return success_({
    backupId: copy.data.id,
    backupName: copy.data.name,
    backupUrl: copy.data.webViewLink,
  });
}

async function migrateSheetsWorkbook(actor: Actor) {
  const backup = await backupSheetsWorkbook(actor);
  const migrationVersion = `sheets-normalized-${migrationTimestamp_()}`;
  const createdOrRepairedTabs = await ensureNormalizedWorkbook_();
  const menuSeed = await seedNormalizedMenu_(actor);
  const reconciliation = await reconcileSheetsWorkbook(actor);

  await upsertSheetObject_(
    SHEETS.businessSettings,
    "Setting Key",
    "google_sheets_migration_version",
    {
      description: "Last completed normalized Google Sheets migration.",
      settingKey: "google_sheets_migration_version",
      settingValue: migrationVersion,
      updatedAt: new Date(),
      updatedBy: actor.email,
      valueType: "string",
    },
  );
  await writeObjectRow(SHEETS.auditLog, {
    action: "sheets.migrate",
    auditId: stableUniqueId_("audit"),
    createdAt: new Date(),
    entityId: migrationVersion,
    entityType: "workbook",
    newValueJson: JSON.stringify({
      backupId: (backup as Payload).backupId,
      createdOrRepairedTabs,
      menuSeed,
      reconciliation,
    }),
    requestId: stableUniqueId_("req"),
    result: "success",
    userId: actor.uid,
    userRole: actor.role,
  });

  return success_({
    backup,
    createdOrRepairedTabs,
    menuSeed,
    migrationVersion,
    reconciliation,
  });
}

async function ensureNormalizedWorkbook_() {
  const repairedTabs: string[] = [];
  for (const sheetName of NORMALIZED_OPERATIONAL_SHEETS) {
    const headers = NORMALIZED_SHEET_HEADERS[sheetName] || [];
    const resolved = await ensureSheetExists_(sheetName, headers);
    await formatSheetTab_(
      resolved,
      headers.length,
      SHEET_TAB_COLORS[resolved] || SHEET_TAB_COLORS[sheetName],
    );
    repairedTabs.push(resolved);
  }

  await seedBusinessSettings_();
  return repairedTabs;
}

async function seedBusinessSettings_() {
  const defaults: Array<[string, string, string, string]> = [
    ["business_timezone", "Africa/Cairo", "string", "Business timezone"],
    ["closing_time", "23:59", "time", "Default closing time"],
    ["currency", "EGP", "string", "Receipt currency"],
    ["loyalty_drinks_required", "7", "number", "Paid drinks per reward"],
    ["tax_percentage", "0", "number", "Default tax percentage"],
    ["receipt_prefix", "REC", "string", "Receipt number prefix"],
    ["automatic_end_day_enabled", "false", "boolean", "Automatic close flag"],
  ];
  for (const [settingKey, settingValue, valueType, description] of defaults) {
    await upsertSheetObject_(
      SHEETS.businessSettings,
      "Setting Key",
      settingKey,
      {
        description,
        settingKey,
        settingValue,
        updatedAt: new Date(),
        updatedBy: "system",
        valueType,
      },
    );
  }
}

async function seedNormalizedMenu_(actor: Actor) {
  const seed = buildNormalizedMenuSeed(normalizedMenu);
  await ensureNormalizedWorkbook_();

  for (const category of seed.categories) {
    await upsertSheetObject_(
      SHEETS.menuCategories,
      "Category ID",
      clean_(category.categoryId),
      category,
    );
  }
  for (const item of seed.items) {
    await upsertSheetObject_(
      SHEETS.menuItems,
      "Item ID",
      clean_(item.itemId),
      item,
    );
  }
  for (const size of seed.sizes) {
    await upsertSheetObject_(
      SHEETS.menuItemSizes,
      "Size ID",
      clean_(size.sizeId),
      size,
    );
  }
  for (const flavor of seed.flavors) {
    await upsertSheetObject_(
      SHEETS.menuItemFlavors,
      "Flavor ID",
      clean_(flavor.flavorId),
      flavor,
    );
  }
  for (const extra of seed.extras) {
    await upsertSheetObject_(
      SHEETS.extras,
      "Extra ID",
      clean_(extra.extraId),
      extra,
    );
  }

  await recordAuditLog_(actor, {
    action: "menu.normalized.seed",
    entityType: "menu",
    newValue: {
      categories: seed.categories.length,
      extras: seed.extras.length,
      flavors: seed.flavors.length,
      items: seed.items.length,
      sizes: seed.sizes.length,
    },
    success: true,
  });

  return {
    categories: seed.categories.length,
    extras: seed.extras.length,
    flavors: seed.flavors.length,
    items: seed.items.length,
    sizes: seed.sizes.length,
  };
}

async function reconcileSheetsWorkbook(actor: Actor) {
  await ensureSheetHeaders_(
    SHEETS.customers,
    SHEET_HEADERS[SHEETS.customers] || NORMALIZED_SHEET_HEADERS.Customers,
  );
  await ensureSheetHeaders_(
    SHEETS.unpaidTracker,
    SHEET_HEADERS[SHEETS.unpaidTracker] ||
      NORMALIZED_SHEET_HEADERS["Unpaid Tracker"],
  );
  const customers = await sheetToObjects(SHEETS.customers);
  const unpaid = await sheetToObjects(SHEETS.unpaidTracker);
  const balances = new Map<string, number>();

  for (const debt of unpaid) {
    const status = clean_(debt.status || "Open").toLowerCase();
    if (["closed", "paid", "cancelled", "canceled", "void"].includes(status))
      continue;
    const customerId = getRowCustomerId_(debt);
    if (!customerId) continue;
    balances.set(
      customerId,
      (balances.get(customerId) || 0) +
        number_(debt.remainingAmountEgp || debt.unpaidBalance || debt.amount),
    );
  }

  let correctedCustomers = 0;
  for (const customer of customers) {
    const customerId = getRowCustomerId_(customer);
    if (!customerId) continue;
    const calculated = balances.get(customerId) || 0;
    const current = number_(
      customer.unpaidBalanceEgp ||
        customer.unpaidBalance ||
        customer.currentBalance ||
        0,
    );
    if (Math.abs(calculated - current) < 0.01) continue;
    await upsertSheetObject_(SHEETS.customers, "Customer ID", customerId, {
      ...customer,
      customerId,
      unpaidBalanceEgp: calculated,
      updatedAt: new Date(),
      version: number_(customer.version) + 1 || 1,
    });
    correctedCustomers += 1;
    await writeObjectRow(SHEETS.auditLog, {
      action: "unpaid.reconcile",
      auditId: stableUniqueId_("audit"),
      createdAt: new Date(),
      entityId: customerId,
      entityType: "customer",
      newValueJson: JSON.stringify({ unpaidBalanceEgp: calculated }),
      previousValueJson: JSON.stringify({ unpaidBalanceEgp: current }),
      reason: "Reconciled customer aggregate from Unpaid Tracker records.",
      requestId: stableUniqueId_("req"),
      result: "success",
      userId: actor.uid,
      userRole: actor.role,
    });
  }

  return success_({
    correctedCustomers,
    openUnpaidRecords: unpaid.length,
    totalOpenUnpaidEgp: Array.from(balances.values()).reduce(
      (total, value) => total + value,
      0,
    ),
  });
}

function migrationTimestamp_() {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
}

async function ensureSheetExists_(sheetName: string, headers: string[]) {
  const sheets = await getSheetsClient();

  try {
    const resolvedSheetName = await resolveSheetName(sheetName);
    const values = await getSheetValues(sheetName);
    await repairSheetHeaders_(resolvedSheetName, values[0] || [], headers);

    return resolvedSheetName;
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
    sheetTitlesPromise = null;

    await sheets.spreadsheets.values.update({
      range: `${quotedSheet(sheetName)}!A1:${columnLetter(headers.length - 1)}1`,
      requestBody: { values: [headers] },
      spreadsheetId: SPREADSHEET_ID,
      valueInputOption: "USER_ENTERED",
    });

    return sheetName;
  }
}

async function formatSheetTab_(
  sheetName: string,
  columnCount: number,
  tabColor = { red: 0.25, green: 0.25, blue: 0.25 },
) {
  const sheets = await getSheetsClient();
  const sheetId = await sheetIdForTitle_(sheetName);
  if (sheetId == null) return;

  const endColumnIndex = Math.max(1, columnCount);
  const requests: sheets_v4.Schema$Request[] = [
    {
      updateSheetProperties: {
        fields:
          "gridProperties.frozenRowCount,gridProperties.hideGridlines,tabColor",
        properties: {
          gridProperties: {
            frozenRowCount: 1,
            hideGridlines: false,
          },
          sheetId,
          tabColor,
        },
      },
    },
    {
      repeatCell: {
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.18, green: 0.12, blue: 0.08 },
            horizontalAlignment: "CENTER",
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 0.96, blue: 0.86 },
            },
            wrapStrategy: "WRAP",
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)",
        range: {
          endColumnIndex,
          endRowIndex: 1,
          sheetId,
          startColumnIndex: 0,
          startRowIndex: 0,
        },
      },
    },
    {
      repeatCell: {
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
          },
        },
        fields:
          "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy)",
        range: {
          endColumnIndex,
          sheetId,
          startColumnIndex: 0,
          startRowIndex: 1,
        },
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          dimension: "COLUMNS",
          endIndex: endColumnIndex,
          sheetId,
          startIndex: 0,
        },
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    requestBody: { requests },
    spreadsheetId: SPREADSHEET_ID,
  });
}

async function sheetIdForTitle_(title: string) {
  const sheets = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    fields: "sheets.properties(sheetId,title)",
    spreadsheetId: SPREADSHEET_ID,
  });
  return metadata.data.sheets?.find(
    (sheet) => sheet.properties?.title === title,
  )?.properties?.sheetId;
}

async function backfillDayHistory_() {
  await ensureExactSheetHeaders_(SHEETS.dayHistory, [...DAY_HISTORY_HEADERS]);

  const existingRows = await sheetToObjects(SHEETS.dayHistory);
  const existingDateKeys = new Set(
    existingRows.map((row) => dateKeyFromValue_(row.dateKey)).filter(Boolean),
  );
  const orders = (await sheetToObjects(SHEETS.orders)).map(enrichOrder_);
  const payments = await sheetToObjects(SHEETS.payments);
  const redemptions = await sheetToObjects(SHEETS.rewardRedemptions);
  const dateKeys = uniqueStrings_([
    ...orders.map(orderDateKey_),
    ...payments.map(paymentDateKey_),
    ...redemptions.map(paymentDateKey_),
  ]).sort((left, right) => left.localeCompare(right));
  let added = 0;

  for (const dateKey of dateKeys) {
    if (!dateKey || existingDateKeys.has(dateKey)) continue;

    const summary = buildDaySummary_(
      dateKey,
      orders.filter((row) => orderDateKey_(row) === dateKey),
      payments.filter((row) => paymentDateKey_(row) === dateKey),
      redemptions.filter((row) => paymentDateKey_(row) === dateKey),
    ) as Row;

    await appendRow(
      SHEETS.dayHistory,
      DAY_HISTORY_HEADERS.map((header) => summary[header] || ""),
    );
    existingDateKeys.add(dateKey);
    added += 1;
  }

  return added;
}

async function recordAuditLog_(
  actor: Actor,
  event: {
    action: string;
    entityId?: string;
    entityType: string;
    newValue?: unknown;
    previousValue?: unknown;
    reason?: string;
    requestId?: string;
    success: boolean;
  },
) {
  const auditId = stableUniqueId_("audit");
  const timestamp = new Date().toISOString();
  const sessionMetadata = {
    email: actor.email,
    uid: actor.uid,
  };
  try {
    await writeObjectRow(SHEETS.auditLog, {
      action: event.action,
      auditId,
      entityId: event.entityId || "",
      entityType: event.entityType,
      newValue: event.newValue ? JSON.stringify(event.newValue) : "",
      previousValue: event.previousValue
        ? JSON.stringify(event.previousValue)
        : "",
      reason: event.reason || "",
      requestId: event.requestId || "",
      role: actor.role,
      sessionMetadata: JSON.stringify(sessionMetadata),
      success: event.success,
      timestamp,
      userId: actor.uid,
    });
  } catch (error) {
    await recordSyncFailure_(
      "auditLog",
      event.entityId || event.entityType,
      error,
    );
  }

  try {
    await writeNeonAuditLog({
      action: event.action,
      auditId,
      entityId: event.entityId,
      entityType: event.entityType,
      newValue: event.newValue,
      previousValue: event.previousValue,
      reason: event.reason,
      requestId: event.requestId,
      role: actor.role,
      sessionMetadata,
      success: event.success,
      timestamp,
      userId: actor.uid,
    });
  } catch (error) {
    await recordSyncFailure_(
      "neon.auditLog",
      event.entityId || event.entityType,
      error,
    );
  }
}

async function recordSyncFailure_(
  entityType: string,
  entityId: string,
  error: unknown,
  syncJobId = "",
) {
  try {
    await writeObjectRow(SHEETS.syncFailures, {
      createdAt: new Date().toISOString(),
      entityId,
      entityType,
      errorMessage: safeErrorMessage_(error),
      retryCount: 0,
      syncFailureId: stableUniqueId_("syncfail"),
      syncJobId,
    });
  } catch (nestedError) {
    safeServerError_("Sync failure recording failed", nestedError);
  }
}

async function retrySyncFailures(actor: Actor) {
  await recordAuditLog_(actor, {
    action: "sync.retry.requested",
    entityType: "syncFailures",
    newValue: { attemptedAt: new Date().toISOString() },
    success: true,
  });

  return success_({
    message:
      "Retry request recorded. Automatic per-failure replay is available after Neon and Sheets reconciliation are configured.",
    syncFailures: (await safeSheetObjects_(SHEETS.syncFailures))
      .reverse()
      .slice(0, 100),
  });
}

async function archiveTodayOrders_(
  dateKey: string,
  resetAt: string,
  resetBy: string,
) {
  const values = await getSheetValues(SHEETS.orders);
  if (values.length < 2) return 0;

  const headers = (values[0] || []).map(normalizeKey_);
  const orderStatusIndex = headers.indexOf("orderStatus");
  const notesIndex = headers.indexOf("notes");

  if (orderStatusIndex < 0) {
    throw new Error(
      "Orders sheet needs an Order Status column before reset can run.",
    );
  }

  let archivedRows = 0;

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] || [];
    const rowRecord: Row = {};
    headers.forEach((header, columnIndex) => {
      if (header) rowRecord[header] = clean_(row[columnIndex]);
    });

    if (orderDateKey_(rowRecord) !== dateKey || isArchivedOrder_(rowRecord))
      continue;

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
  const orders = (await sheetToObjects(SHEETS.orders))
    .map(enrichOrder_)
    .reverse();
  const payments = await sheetToObjects(SHEETS.payments);
  const vouchers = (await sheetToObjects(SHEETS.generatedVouchers))
    .map(enrichVoucher_)
    .reverse();
  const redemptions = await sheetToObjects(SHEETS.rewardRedemptions);
  const menu = await menuForApp_();
  const lists = await listOptions();
  lists.staff = await staffOptions_(lists.staff || []);
  lists.orderPlace = buildOrderPlaceOptions_(orders, lists);
  const unpaid = buildUnpaidTracker_(realCustomers, orders);
  const customers = enrichCustomers_(realCustomers, orders, unpaid);
  const rewards = buildRewards_(customers, orders, vouchers);
  const winners = rewards.filter(
    (reward) => number_(reward.freeDrinksReady) > 0,
  );
  const todayKey = dateKey_(new Date());
  const todaysOrders = orders.filter(
    (order) => orderDateKey_(order) === todayKey && !isArchivedOrder_(order),
  );
  const todaysPayments = payments.filter(
    (payment) => paymentDateKey_(payment) === todayKey,
  );
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
  const archivedHistoryDays = await archivedHistoryDays_();
  const history = buildHistory_(
    orders,
    payments,
    redemptions,
    archivedHistoryDays,
  );

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

async function menuForApp_() {
  let sheetMenu: Row[] = [];
  try {
    sheetMenu = (await sheetToObjects(SHEETS.menu)).map(enrichMenuItem_);
  } catch {
    sheetMenu = [];
  }

  const byId = new Map(
    normalizedMenu.map((item) => [item.itemId, { ...item } as Row]),
  );

  for (const sheetItem of sheetMenu) {
    const itemId = getRowItemId_(sheetItem);
    if (!itemId) continue;

    const existing = byId.get(itemId);
    const active = activeValue_(sheetItem.active);
    const priceText = clean_(sheetItem.priceText || sheetItem.price);
    if (existing) {
      byId.set(itemId, {
        ...existing,
        active,
        category: clean_(sheetItem.category) || existing.category,
        itemName:
          clean_(sheetItem.itemName || sheetItem.name) || existing.itemName,
        name: clean_(sheetItem.itemName || sheetItem.name) || existing.name,
        priceText: priceText || existing.priceText,
        suggestedPrice: String(
          parsePrice_(priceText) || existing.suggestedPrice || "",
        ),
      });
      continue;
    }

    const itemName = clean_(sheetItem.itemName || sheetItem.name);
    const category = clean_(sheetItem.category || "Menu");
    const price = parsePrice_(priceText);
    if (!itemName || !price) continue;

    byId.set(itemId, {
      active,
      availability: active ? "available" : "unavailable",
      availableExtras: [],
      category,
      categoryId: category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      currency: "EGP",
      displayOrder: byId.size + 10000,
      flavors: [],
      ingredients: [],
      itemId,
      itemName,
      name: itemName,
      preparationStation:
        /food|dessert|sandwich|bakery|croissant|waffle|cake/i.test(category)
          ? "kitchen"
          : "barista",
      priceText,
      sizes: [
        {
          active: true,
          menuItemId: itemId,
          price,
          size: "Standard",
          sizeId: "standard",
          sizeName: "Standard",
        },
      ],
      soldOut: !active,
      standardSize: "Standard",
      suggestedPrice: String(price),
    });
  }

  return Array.from(byId.values()).filter((item) => activeValue_(item.active));
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
    (data.customers || []).find(
      (row) => getRowCustomerId_(row) === customerId,
    ) || {};

  return {
    customer,
    orders: (data.orders || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
    payments: (data.payments || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
    unpaid: (data.unpaid || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
    vouchers: (data.vouchers || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
    rewards: (data.rewards || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
    redemptions: (data.redemptions || []).filter((row) =>
      rowsMatchCustomer_(row, customer),
    ),
  };
}

async function historyDays() {
  const data = await buildAppData();
  const archivedHistoryDays = await archivedHistoryDays_();
  return buildHistory_(
    data.orders || [],
    data.payments || [],
    data.redemptions || [],
    archivedHistoryDays,
  ).days;
}

async function debugSheets() {
  const sheets = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    fields: "sheets.properties.title",
    spreadsheetId: SPREADSHEET_ID,
  });
  const sheetTabsFound = (metadata.data.sheets || [])
    .map((sheet) => clean_(sheet.properties?.title))
    .filter(Boolean);
  const rowsCountByTab: Record<string, number> = {};

  for (const sheetName of [
    SHEETS.menu,
    SHEETS.customers,
    SHEETS.orders,
    SHEETS.payments,
    SHEETS.rewards,
    SHEETS.loyaltyWinners,
    SHEETS.staffUsers,
  ]) {
    let resolvedSheetName = "";
    try {
      resolvedSheetName = await resolveSheetName(sheetName);
    } catch {
      rowsCountByTab[sheetName] = -1;
      continue;
    }
    rowsCountByTab[resolvedSheetName] = Math.max(
      0,
      (await getSheetValues(sheetName)).length - 1,
    );
  }

  return success_({
    spreadsheetIdPresent: Boolean(SPREADSHEET_ID),
    googleAuthMode: "runtime-default",
    neon: await neonHealthSafe_(),
    neonBackupConfigured: neonBackupConfigured_(),
    spreadsheetId: maskId_(SPREADSHEET_ID),
    sheetTabsFound,
    rowsCountByTab,
  });
}

async function dayHistory(dateKey: string) {
  if (!dateKey) throw new Error("Date key is required.");
  const data = await buildAppData();
  const orders = (data.orders || []).filter(
    (row) => orderDateKey_(row) === dateKey,
  );
  const payments = (data.payments || []).filter(
    (row) => paymentDateKey_(row) === dateKey,
  );
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

async function buildLiveDataForRole(role: string) {
  const data = (await buildAppDataForRole(role)) as Row;
  const lists = data.lists ? { staff: data.lists.staff || [] } : undefined;

  return {
    dashboard: data.dashboard,
    dashboardOrders: data.dashboardOrders,
    dashboardTopItems: data.dashboardTopItems,
    generatedAt: data.generatedAt,
    historyDays: data.historyDays,
    lists,
    unpaid: data.unpaid,
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

async function archivedHistoryDays_() {
  try {
    return (await sheetToObjects(SHEETS.dayHistory)).map(normalizeHistoryDay_);
  } catch {
    return [];
  }
}

function buildHistory_(
  orders: Row[],
  payments: Row[],
  redemptions: Row[],
  archivedDays: Row[] = [],
) {
  const dateKeys = uniqueStrings_([
    ...orders.map(orderDateKey_),
    ...payments.map(paymentDateKey_),
    ...redemptions.map(paymentDateKey_),
  ]).sort((left, right) => right.localeCompare(left));
  const derivedDays = dateKeys.map((dateKey) =>
    buildDaySummary_(
      dateKey,
      orders.filter((row) => orderDateKey_(row) === dateKey),
      payments.filter((row) => paymentDateKey_(row) === dateKey),
      redemptions.filter((row) => paymentDateKey_(row) === dateKey),
    ),
  );
  const byDateKey: Record<string, Row> = {};

  [...archivedDays, ...derivedDays].forEach((day) => {
    const row = day as Row;
    const dateKey = clean_(row.dateKey || row.date || row.day);
    if (dateKey)
      byDateKey[dateKey] = { ...byDateKey[dateKey], ...row, dateKey };
  });

  return {
    days: Object.values(byDateKey).sort((left, right) =>
      clean_(right.dateKey).localeCompare(clean_(left.dateKey)),
    ),
  };
}

function normalizeHistoryDay_(day: Row) {
  return {
    ...day,
    dateKey: dateKeyFromValue_(day.dateKey || day.date || day.day),
    bestSellingItem: day.bestSellingItem || day.bestSeller || day.topItem || "",
    bestSellingQty: day.bestSellingQty || day.topQty || day.qty || "0",
    latestReceiptSerial: day.latestReceiptSerial || day.latestReceipt || "",
    orderCount: day.orderCount || day.items || day.itemCount || "0",
    paymentCount: day.paymentCount || "0",
    receiptCount: day.receiptCount || day.receipts || "0",
    redemptionCount: day.redemptionCount || day.freeDrinks || "0",
    totalPaid: day.totalPaid || day.paid || "0",
    totalSales: day.totalSales || day.sales || "0",
    totalUnpaid: day.totalUnpaid || day.unpaid || "0",
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
      const freeDrinksReady = Math.max(
        0,
        earnedFreeDrinks - generatedVoucherCount,
      );
      const progress = paidDrinks % REWARD_THRESHOLD;
      const remaining = progress
        ? REWARD_THRESHOLD - progress
        : REWARD_THRESHOLD;
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
  const text =
    `${clean_(order.category)} ${orderItemName_(order)}`.toLowerCase();
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
      lastVisit:
        customerOrders[0]?.orderDateTime || normalizedCustomer.lastVisit || "",
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
  const receiptDiscountPercentage = receiptDiscountPercentage_(order);
  const description = `${item || "Order"} x${qty} - ${total} EGP`;

  return {
    ...order,
    item,
    qty,
    receiptId,
    receiptDiscountPercentage: String(receiptDiscountPercentage),
    orderPlace,
    total: String(total),
    paidAmount: String(paidAmount),
    outstandingAmount: String(outstanding),
    orderDescription: description,
  };
}

function buildDashboardOrders_(orders: Row[]) {
  const grouped: Record<
    string,
    Row & {
      itemCount: number;
      total: number;
      paidAmount: number;
      outstandingAmount: number;
      orderDescriptions: string[];
      pickedUpCount: number;
      receiptDiscountPercentage: number;
      receiptNotes: string[];
    }
  > = {};

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
        receiptDiscountPercentage: 0,
        receiptNotes: [],
      };
    }

    grouped[groupKey].itemCount += 1;
    grouped[groupKey].total += number_(order.total);
    grouped[groupKey].paidAmount += receiptRowPaidAmount_(order);
    grouped[groupKey].receiptDiscountPercentage = Math.max(
      grouped[groupKey].receiptDiscountPercentage,
      receiptDiscountPercentage_(order),
    );
    grouped[groupKey].orderPlace =
      grouped[groupKey].orderPlace ||
      order.orderPlace ||
      orderPlace_(order) ||
      "";
    if (isPickedUpStatus_(order.orderStatus)) {
      grouped[groupKey].pickedUpCount += 1;
    }
    grouped[groupKey].orderDescriptions.push(
      `${order.item || "Item"} x${order.qty || "1"}`,
    );
    const notes = cleanReceiptNotes_(order.notes);
    if (notes) grouped[groupKey].receiptNotes.push(notes);
  });

  return Object.values(grouped).map((row) => {
    const paidAmount = Math.min(row.total, row.paidAmount);
    const outstandingAmount = Math.max(0, row.total - paidAmount);
    return {
      ...row,
      total: String(row.total),
      paidAmount: String(paidAmount),
      outstandingAmount: String(outstandingAmount),
      paymentStatus: derivePaymentStatus_(paidAmount, row.total),
      receiptDiscountPercentage: String(row.receiptDiscountPercentage),
      receiptNotes: uniqueStrings_(row.receiptNotes).join(" | "),
      customerNotes: uniqueStrings_(row.receiptNotes).join(" | "),
      orderDescription: row.orderDescriptions.join(" + "),
      orderItems: row.orderDescriptions,
      itemCount: String(row.itemCount),
      orderStatus:
        row.pickedUpCount >= row.itemCount ? "Picked Up" : row.orderStatus,
    };
  });
}

function buildDashboardTopItems_(orders: Row[]) {
  const byItem: Record<
    string,
    {
      category: string;
      itemName: string;
      lastSold: string;
      qtySold: number;
      totalSales: number;
    }
  > = {};

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
    byItem[groupKey].lastSold =
      order.orderDateTime || byItem[groupKey].lastSold;
  });

  return Object.values(byItem)
    .sort(
      (left, right) =>
        right.qtySold - left.qtySold || right.totalSales - left.totalSales,
    )
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
  const byCustomer: Record<
    string,
    Row & {
      openUnpaidOrders: number;
      orderDescriptions: string[];
      settledDescriptions: string[];
      totalAmount: number;
      totalPaid: number;
      unpaidBalance: number;
    }
  > = {};

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
      byCustomer[customerId].settledDescriptions.push(
        `${orderDescription} (Paid)`,
      );
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

function buildOrderPlaceOptions_(
  orders: Row[],
  lists: Record<string, string[]>,
) {
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
  const customerName =
    voucher.customerName || voucher.fullName || voucher.name || "";
  const favoriteDrink =
    voucher.favoriteDrink ||
    voucher.drink ||
    voucher.rewardDrink ||
    voucher.item ||
    "";

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

function resolveMenuSelection_(payload: Payload, fallbackItem: Row) {
  const itemId = clean_(payload.itemId || fallbackItem.itemId);
  const itemName = clean_(
    payload.itemName || fallbackItem.itemName || fallbackItem.name,
  );
  const requestedSize = clean_(
    payload.size || payload.menuSize || fallbackItem.standardSize,
  );
  const resolved = resolveMenuPrice(itemId, requestedSize, itemName);

  if (resolved) return resolved;

  const fallbackPrice = parsePrice_(
    fallbackItem.priceText ||
      fallbackItem.priceTextEditLater ||
      fallbackItem.price,
  );

  if (fallbackItem.itemId && fallbackPrice > 0) {
    return {
      category: clean_(fallbackItem.category),
      itemId: clean_(fallbackItem.itemId),
      itemName: clean_(fallbackItem.itemName || fallbackItem.name || itemName),
      price: fallbackPrice,
      size: clean_(fallbackItem.standardSize || requestedSize || "Standard"),
    };
  }

  throw new Error(
    requestedSize
      ? `Menu price not found for ${itemName || itemId} (${requestedSize}).`
      : `Menu price not found for ${itemName || itemId}.`,
  );
}

function itemNameWithSize_(itemName: string, size: string) {
  const cleanName = clean_(itemName);
  const cleanSize = clean_(size);
  if (
    !cleanSize ||
    cleanSize === "Standard" ||
    cleanName.includes(`(${cleanSize})`)
  ) {
    return cleanName;
  }

  return `${cleanName} (${cleanSize})`;
}

async function receiptIdForIdempotencyKey_(idempotencyKey: string) {
  const key = clean_(idempotencyKey);
  if (!key) return "";

  const orders = await sheetToObjects(SHEETS.orders);
  const match = orders.find((order) =>
    clean_(order.notes).includes(`Idempotency: ${key}`),
  );
  return match ? receiptId_(match) : "";
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
    return {
      customerId,
      customer: await findCustomer(customerId),
      created: false,
    };
  }

  const customerName = clean_(
    payload.customerName || payload.fullName || payload.name,
  );
  const phone = clean_(
    payload.customerPhone ||
      payload.phone ||
      payload.phoneWhatsApp ||
      payload.whatsApp ||
      payload.whatsapp,
  );

  const existing = await findCustomerByPhoneOrName(phone, customerName);

  if (existing.customerId) {
    return {
      customerId: existing.customerId,
      customer: existing,
      created: false,
    };
  }

  if (!isRealCustomerInput_(customerName)) {
    return {
      customerId: "",
      customer: {
        customerName: "Walk-in Guest",
        fullName: "",
        phoneWhatsApp: "",
      },
      created: false,
    };
  }

  const newCustomerId = await createCustomerFromOrder(
    customerName,
    phone,
    payload,
  );
  return {
    customerId: newCustomerId,
    customer: await findCustomer(newCustomerId),
    created: true,
  };
}

async function findCustomerByPhoneOrName(
  phone: string,
  customerName: string,
): Promise<Row> {
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

  return !["walk-in guest", "walk in guest", "walkin guest", "guest"].includes(
    name,
  );
}

function isRealCustomerRow_(customer: Row) {
  const phone = digits_(
    customer.phoneWhatsApp || customer.phone || customer.whatsapp,
  );
  return Boolean(phone || isRealCustomerInput_(getCustomerName_(customer)));
}

async function createCustomerFromOrder(
  customerName: string,
  phone: string,
  payload: Payload,
) {
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
    notes: clean_(payload.notes || "Created automatically from receipt."),
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
  const appMenu = await menuForApp_();
  const normalizedItem = appMenu.find((item) => {
    if (itemId && item.itemId === itemId) return true;
    return Boolean(
      itemName && item.itemName.toLowerCase() === itemName.toLowerCase(),
    );
  });

  if (normalizedItem) return normalizedItem;

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

    if (
      rowCustomerId !== customerId ||
      paymentStatus === "paid" ||
      outstanding <= 0
    ) {
      continue;
    }

    if (remaining < outstanding) break;

    await setCell(SHEETS.orders, row + 1, statusIndex, "Paid");
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
  const orderIdIndex = headers.indexOf("orderId");
  const receiptNumberIndex = headers.indexOf("receiptNumber");
  const totalIndex = headers.indexOf("total");
  const statusIndex = headers.indexOf("paymentStatus");
  const orderStatusIndex = headers.indexOf("orderStatus");
  const itemIndex = headers.indexOf("item");
  const notesIndex = headers.indexOf("notes");
  const receiptId = clean_(payload.receiptId);
  const receiptKey = clean_(payload.receiptKey);
  const orderId = clean_(payload.orderId);
  const customerId = clean_(payload.customerId);
  const customerName = clean_(payload.customerName);
  const orderDateTime = clean_(payload.orderDateTime);
  const itemNames: string[] = [];
  let updatedRows = 0;
  let newlyPaidTotal = 0;
  let resultCustomerId = customerId;
  let resultCustomerName = customerName;

  if (statusIndex < 0)
    throw new Error("Orders sheet needs a Payment Status column.");

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] || [];
    const rowNotes = notesIndex >= 0 ? clean_(row[notesIndex]) : "";
    const rowReceiptId = receiptId_({
      notes: rowNotes,
      orderId: orderIdIndex >= 0 ? row[orderIdIndex] : "",
      receiptNumber: receiptNumberIndex >= 0 ? row[receiptNumberIndex] : "",
    });
    const rowOrderId = orderIdIndex >= 0 ? clean_(row[orderIdIndex]) : "";
    const rowCustomerId =
      customerIdIndex >= 0 ? clean_(row[customerIdIndex]) : "";
    const rowCustomerName =
      customerNameIndex >= 0 ? clean_(row[customerNameIndex]) : "";
    const rowDate = dateIndex >= 0 ? clean_(row[dateIndex]) : "";
    const rowStatus = clean_(row[statusIndex]);
    const rowOrderStatus =
      orderStatusIndex >= 0 ? clean_(row[orderStatusIndex]) : "";
    const rowReceiptKey = [
      rowDate,
      rowCustomerId,
      rowCustomerName,
      rowStatus,
    ].join("|");

    const matchesReceiptId = receiptId && rowReceiptId === receiptId;
    const matchesOrderId = orderId && rowOrderId === orderId;
    const matchesReceiptKey =
      !receiptId && receiptKey && rowReceiptKey === receiptKey;
    const matchesFallback =
      !receiptId &&
      !receiptKey &&
      (!customerId || rowCustomerId === customerId) &&
      (!customerName || rowCustomerName === customerName) &&
      (!orderDateTime || rowDate === orderDateTime);

    if (!matchesReceiptId && !matchesOrderId && !matchesReceiptKey && !matchesFallback) continue;

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
    itemNames.push(
      itemIndex >= 0
        ? row[itemIndex] || `row ${index + 1}`
        : `row ${index + 1}`,
    );
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

async function appendRedemption(
  voucherRow: string[],
  header: string[],
  payload: Payload,
) {
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
    payload.orderPlace ||
      payload.tableNumber ||
      payload.place ||
      payload.location,
  );
  if (
    place &&
    ((serviceType && place.startsWith(`${serviceType} - `)) ||
      place.includes("Car:"))
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

  return Boolean(
    customerNameKey_(row) &&
      customerNameKey_(row) === customerNameKey_(customer),
  );
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
  const matches = String(order.notes || "").matchAll(
    /Paid now:\s*([\d,]+(?:\.\d+)?)/gi,
  );
  return Array.from(matches).reduce(
    (total, match) => total + Number(String(match[1] || "0").replace(/,/g, "")),
    0,
  );
}

function receiptRowPaidAmount_(order: Row) {
  const explicitPaid = number_(order.paidAmount);
  if (explicitPaid > 0) return explicitPaid;
  const status = clean_(order.paymentStatus).toLowerCase();
  if (status === "paid") return number_(order.total);
  if (status === "partial") return partialPaidAmount_(order);
  return 0;
}

function deriveReceiptPaidAmount_(
  submittedStatus: string,
  requestedPaidAmount: number,
  receiptTotal: number,
) {
  if (requestedPaidAmount < 0) {
    throw new ApiError("Paid amount cannot be negative.", 400);
  }
  if (requestedPaidAmount > receiptTotal) {
    throw new ApiError("Paid amount cannot exceed the receipt total.", 400);
  }
  if (requestedPaidAmount > 0) return requestedPaidAmount;
  return submittedStatus === "Paid" ? receiptTotal : 0;
}

function derivePaymentStatus_(paidAmount: number, receiptTotal: number) {
  if (paidAmount <= 0) return "Unpaid";
  if (paidAmount < receiptTotal) return "Partial";
  return "Paid";
}

function cleanReceiptNotes_(notes: unknown) {
  const internalPrefixes = [
    "place:",
    "staff label:",
    "size:",
    "discount:",
    "subtotal:",
    "discount amount:",
    "idempotency:",
    "receipt:",
    "paid now:",
    "payment changed",
    "status changed",
    "settled unpaid",
  ];
  return clean_(notes)
    .split("|")
    .map(clean_)
    .filter((part) => {
      const lower = part.toLowerCase();
      return part && !internalPrefixes.some((prefix) => lower.startsWith(prefix));
    })
    .join(" | ");
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
  const value = clean_(status)
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  return (
    value === "done" ||
    value === "pickedup" ||
    value === "pickup" ||
    value === "served"
  );
}

function getPayloadCustomerId_(payload: Payload) {
  return clean_(
    payload.customerId || payload.customerID || payload.id || payload.ID,
  );
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

function stableUniqueId_(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
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

  throw new Error(
    "Could not generate a unique receipt serial. Please try again.",
  );
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
  const direct = clean_(order.receiptId || order.receiptNumber || order.receipt);
  if (direct) return direct;
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
    row.dateKey ||
      row.paymentDate ||
      row.date ||
      row.generatedAt ||
      row.createdAt,
  );
}

function isArchivedOrder_(order: Row) {
  const status = clean_(order.orderStatus)
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  const notes = clean_(order.notes).toLowerCase();
  return status === "archived" || notes.includes("end day reset archived");
}

function dateKeyFromValue_(value: unknown) {
  const text = clean_(value);
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1] || "";
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    return dateKey_(new Date(Math.round((serial - 25569) * 86400000)));
  }
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return dateKey_(parsed);

  return "";
}

function dateKey_(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Cairo",
    year: "numeric",
  }).format(date);
}

function allocateReceiptDiscounts_(lineTotals: number[], discountAmount: number) {
  const subtotalMinor = lineTotals.reduce(
    (sum, lineTotal) => sum + toMinorUnits(lineTotal),
    0,
  );
  let remainingDiscountMinor = toMinorUnits(discountAmount);

  return lineTotals.map((lineTotal, index) => {
    if (index === lineTotals.length - 1) {
      return fromMinorUnits(Math.max(0, remainingDiscountMinor));
    }

    const lineMinor = toMinorUnits(lineTotal);
    const shareMinor = subtotalMinor
      ? Math.round((toMinorUnits(discountAmount) * lineMinor) / subtotalMinor)
      : 0;
    remainingDiscountMinor -= shareMinor;
    return fromMinorUnits(Math.max(0, shareMinor));
  });
}

function receiptDiscountPercentage_(order: Row) {
  const direct = clean_(
    order.receiptDiscountPercentage ||
      order.discountPercentage ||
      order.discountPercent ||
      order.discount,
  );
  if (direct) {
    try {
      return normalizeReceiptDiscountPercentage(direct);
    } catch {
      return 0;
    }
  }

  const match = clean_(order.notes).match(/Discount:\s*([\d.]+)%/i);
  return match ? normalizeReceiptDiscountPercentage(match[1]) : 0;
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

  const match = String(order.notes || "").match(
    /(?:Place|Table|Location):\s*([^|]+)/i,
  );
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

function staffDisplayName_(staff: Row | Record<string, unknown>) {
  return clean_(
    staff.displayName ||
      staff.staffName ||
      staff.fullName ||
      staff.name ||
      staff.email ||
      staff.staffEmail,
  );
}

async function staffOptions_(fallback: string[]) {
  const firestoreStaff = await activeFirestoreStaffOptions_();
  const legacyDefaults = [
    "Cashier 1",
    "Cashier 2",
    "Cashier 3",
    "Waiter 1",
    "Waiter 2",
    "Waiter 3",
    "Barista 1",
    "Barista 2",
    "Barista 3",
    "Manager 1",
    "Manager 2",
    "Manager 3",
    "Owner",
  ];

  try {
    const staffUsers = await sheetToObjects(SHEETS.staffUsers);
    const sheetStaff = staffUsers
      .filter((staff) => {
        const status = clean_(
          staff.active || staff.status || staff.enabled || "Yes",
        ).toLowerCase();
        return !["no", "false", "disabled", "inactive", "blocked"].includes(
          status,
        );
      })
      .map(staffDisplayName_)
      .filter(Boolean);

    return uniqueStrings_([
      ...firestoreStaff,
      ...sheetStaff,
      ...fallback,
      ...legacyDefaults,
    ]);
  } catch {
    return uniqueStrings_([...firestoreStaff, ...fallback, ...legacyDefaults]);
  }
}

async function activeFirestoreStaffOptions_() {
  try {
    initFirebaseAdmin();
    const snapshot = await getFirestore().collection("users").get();
    return snapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() || {};
        const role = clean_(data.role).toLowerCase();
        if (!VALID_ROLES.has(role)) return "";
        if (!activeValue_(data.active)) return "";
        const displayName = clean_(data.displayName || data.name || data.email);
        return displayName ? `${displayName} - ${roleLabel_(role)}` : "";
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftRole = roleSortIndex_(left);
        const rightRole = roleSortIndex_(right);
        return leftRole - rightRole || left.localeCompare(right);
      });
  } catch (error) {
    safeServerError_("Firestore staff options read failed", error);
    return [];
  }
}

function roleLabel_(role: string) {
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : "";
}

function roleSortIndex_(label: string) {
  const normalized = label.toLowerCase();
  const index = ["owner", "manager", "cashier", "waiter", "barista"].findIndex((role) =>
    normalized.includes(role),
  );
  return index >= 0 ? index : 99;
}

async function verifyActiveStaffName_(staffName: string) {
  const name = clean_(staffName);
  if (!name) throw new ApiError("Choose an active staff member.");

  const activeNames = await staffOptions_([]);
  if (!activeNames.length) return;

  const normalized = name.toLowerCase();
  if (
    !activeNames.some((activeName) => {
      const option = activeName.toLowerCase();
      const baseName = option.split(" - ")[0] || option;
      return option === normalized || baseName === normalized;
    })
  ) {
    throw new ApiError("Selected staff member is not active or was not found.", 400, {
      staffName: name,
    });
  }
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
  return [
    "customerPhone",
    "mobile",
    "phone",
    "phoneWhatsApp",
    "whatsapp",
  ].includes(header);
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

function isActionAllowed_(actor: Actor, action: string) {
  const alternativeActionPermissions: Record<string, string[]> = {
    setStaffActive: ["staff.deactivate", "staff.manage"],
    setStaffPermissions: ["permissions.manage", "staff.manage"],
    setStaffRole: ["staff.update", "staff.manage"],
    upsertStaff: ["staff.create", "staff.update", "staff.manage"],
  };
  const alternatives = alternativeActionPermissions[action];
  if (alternatives?.some((feature) => actorHasFeature_(actor, feature))) {
    return true;
  }

  const featurePermission = ACTION_FEATURE_PERMISSIONS[action];
  if (!featurePermission) return false;
  return actorHasFeature_(actor, featurePermission);
}

function actorHasFeature_(actor: Actor, featurePermission: string) {
  return hasPermission({
    effectivePermissions: actor.effectivePermissions,
    feature: featurePermission,
    grant: actor.grant || actor.permissions,
    revoke: actor.revoke || actor.revokedPermissions,
    role: actor.role,
  });
}

function requireActorPermission_(actor: Actor, feature: string) {
  if (!actorHasFeature_(actor, feature)) {
    throw new ApiError(`Permission '${feature}' is required.`, 403, {
      feature,
      role: actor.role,
      uid: actor.uid,
    });
  }
}

function tokenFromPayload_(payload: Payload) {
  const authorization = clean_(
    payload.authorization || payload.Authorization || payload.authHeader,
  );
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? clean_(match[1]) : "";
}

function activeValue_(value: unknown) {
  if (value == null || value === "") return true;
  if (typeof value === "boolean") return value;
  const normalized = clean_(value).toLowerCase();
  return !["no", "false", "disabled", "inactive", "blocked", "0"].includes(
    normalized,
  );
}

function stringArray_(value: unknown) {
  if (Array.isArray(value)) return value.map(clean_).filter(Boolean);
  return clean_(value)
    .split(/[,\n|]+/)
    .map(clean_)
    .filter(Boolean);
}

function normalizePermissionValues_(value: unknown) {
  const seen = new Set<string>();
  return stringArray_(value)
    .map((permission) => permission.toLowerCase())
    .filter((permission) => {
      if (!permission || seen.has(permission)) return false;
      seen.add(permission);
      return true;
    });
}

async function upsertStaffDirectoryRow_(profile: Row) {
  await ensureSheetHeaders_(
    SHEETS.staffUsers,
    SHEET_HEADERS[SHEETS.staffUsers] || [
      "email",
      "role",
      "name",
      "active",
      "displayName",
      "uid",
      "grant",
      "revoke",
      "updatedAt",
    ],
  );
  await upsertSheetObject_(SHEETS.staffUsers, "uid", clean_(profile.uid), {
    active: activeValue_(profile.active) ? "Yes" : "No",
    displayName: clean_(profile.displayName || profile.name || profile.email),
    email: clean_(profile.email).toLowerCase(),
    grant: normalizePermissionValues_(profile.grant || profile.permissions).join(", "),
    name: clean_(profile.name || profile.displayName || profile.email),
    revoke: normalizePermissionValues_(
      profile.revoke || profile.revokedPermissions,
    ).join(", "),
    role: clean_(profile.role || "waiter").toLowerCase(),
    uid: clean_(profile.uid),
    updatedAt: new Date().toISOString(),
  });
}

function maskId_(value: string) {
  return value ? `...${value.slice(-6)}` : "";
}

function neonBackupConfigured_() {
  return (
    process.env.NEON_BACKUP_ENABLED === "true" &&
    Boolean(process.env.NEON_DATABASE_URL)
  );
}

async function neonHealthSafe_() {
  try {
    return await neonHealth();
  } catch (error) {
    return {
      configured: neonBackupConfigured_(),
      message: safeErrorMessage_(error),
      ok: false,
    };
  }
}

function statusCodeForError_(error: unknown) {
  return error instanceof ApiError ? error.statusCode : 400;
}

function safeErrorMessage_(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeErrorDetails_(error: unknown) {
  return error instanceof ApiError && error.details ? error.details : {};
}

function safeServerError_(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    label,
    message.replace(
      /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g,
      "[redacted private key]",
    ),
  );
}

function staffForClient_(actor: Actor) {
  const resolution = resolveEffectivePermissions({
    grant: actor.grant || actor.permissions,
    revoke: actor.revoke || actor.revokedPermissions,
    role: actor.role,
  });
  return {
    active: actor.active !== false,
    displayName: actor.displayName || actor.email,
    effectivePermissions: actor.effectivePermissions || resolution.effectivePermissions,
    email: actor.email,
    grant: actor.grant || actor.permissions || [],
    name: actor.displayName || actor.email,
    permissions: actor.grant || actor.permissions || [],
    revoke: actor.revoke || actor.revokedPermissions || [],
    revokedPermissions: actor.revoke || actor.revokedPermissions || [],
    roleDefaults: resolution.roleDefaults,
    role: actor.role,
    uid: actor.uid,
  };
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

  return key
    .replace(/EGP/g, "Egp")
    .replace(/JSON/g, "Json")
    .replace(/ID(?=$|[A-Z])/g, "Id");
}

function success_(payload: Payload) {
  return { success: true, ...payload };
}

export const app = express();

app.use(
  express.json({ limit: "1mb", type: ["application/json", "text/plain"] }),
);
app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    if (error instanceof SyntaxError) {
      response.status(400).json({
        success: false,
        message: "Invalid JSON request body.",
      });
      return;
    }

    next(error);
  },
);
app.use((_request, response, next) => {
  response.header(
    "Access-Control-Allow-Origin",
    process.env.CORS_ORIGIN || "*",
  );
  response.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  next();
});

app.options("/api", (_request, response) => response.sendStatus(204));

app.get("/api/menu", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    menu: data.menu,
  }));
});

app.get("/api/dashboard/today", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    dashboard: data.dashboard,
    dashboardOrders: data.dashboardOrders,
    dashboardTopItems: data.dashboardTopItems,
  }));
});

app.get("/api/customers/search", async (request, response) => {
  await routeAction("customerSearch", requestPayload_(request), response);
});

app.get("/api/customers", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    customers: data.customers,
  }));
});

app.get("/api/customers/:customerId", async (request, response) => {
  await routeAction(
    "customerHistory",
    { ...requestPayload_(request), customerId: request.params.customerId },
    response,
  );
});

app.post("/api/customers", async (request, response) => {
  await routeAction("addCustomer", requestPayload_(request), response);
});

app.patch("/api/customers/:customerId", async (request, response) => {
  await routeAction(
    "updateCustomer",
    { ...requestPayload_(request), customerId: request.params.customerId },
    response,
  );
});

app.delete("/api/customers/:customerId", async (request, response) => {
  await routeAction(
    "removeCustomer",
    { ...requestPayload_(request), customerId: request.params.customerId },
    response,
  );
});

app.get("/api/customers/:customerId/history", async (request, response) => {
  await routeAction(
    "customerHistory",
    { ...requestPayload_(request), customerId: request.params.customerId },
    response,
  );
});

app.get("/api/history/days", async (request, response) => {
  await routeAction("historyDays", requestPayload_(request), response);
});

app.get("/api/history/:dateKey", async (request, response) => {
  await routeAction(
    "dayHistory",
    { ...requestPayload_(request), dateKey: request.params.dateKey },
    response,
  );
});

app.get("/api/orders", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    orders: data.orders,
  }));
});

app.get("/api/orders/:id", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    order:
      (data.orders || []).find((order) => {
        const row = order as Row;
        return (
          clean_(row.orderId) === request.params.id ||
          clean_(row.receiptNumber || row.receiptId) === request.params.id
        );
      }) || null,
  }));
});

app.post("/api/orders", async (request, response) => {
  await routeAction("addReceipt", requestPayload_(request), response);
});

app.patch("/api/orders/:id", async (request, response) => {
  await routeAction(
    "updateReceiptPayment",
    { ...requestPayload_(request), orderId: request.params.id },
    response,
  );
});

app.post("/api/orders/:id/status", async (request, response) => {
  await routeAction(
    clean_(request.body?.action || "markReceiptDone"),
    { ...requestPayload_(request), orderId: request.params.id },
    response,
  );
});

app.post("/api/orders/:id/cancel", async (request, response) => {
  await routeAction(
    "cancelReceipt",
    {
      ...requestPayload_(request),
      orderId: request.params.id,
    },
    response,
  );
});

app.post("/api/orders/:id/payments", async (request, response) => {
  await routeAction(
    "addPayment",
    { ...requestPayload_(request), orderId: request.params.id },
    response,
  );
});

app.get("/api/orders/:id/payments", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    payments: (data.payments || []).filter(
      (row) => clean_(row.orderId) === request.params.id,
    ),
  }));
});

app.get("/api/unpaid", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    unpaid: data.unpaid,
  }));
});

app.get("/api/customers/:id/unpaid", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    unpaid: (data.unpaid || []).filter(
      (row) => getRowCustomerId_(row) === request.params.id,
    ),
  }));
});

app.post("/api/unpaid/:id/payments", async (request, response) => {
  await routeAction(
    "collectUnpaidPayment",
    { ...requestPayload_(request), unpaidId: request.params.id },
    response,
  );
});

app.get("/api/customers/:id/rewards", async (request, response) => {
  await routeDataSlice(requestPayload_(request), response, (data) => ({
    rewards: (data.rewards || []).filter(
      (row) => getRowCustomerId_(row) === request.params.id,
    ),
  }));
});

app.post("/api/menu/categories", async (request, response) => {
  await routeAction("upsertMenuCategory", requestPayload_(request), response);
});

app.patch("/api/menu/categories/:id", async (request, response) => {
  await routeAction(
    "upsertMenuCategory",
    { ...requestPayload_(request), categoryId: request.params.id },
    response,
  );
});

app.delete("/api/menu/categories/:id", async (request, response) => {
  await routeAction(
    "archiveMenuCategory",
    { ...requestPayload_(request), categoryId: request.params.id },
    response,
  );
});

app.post("/api/menu/items", async (request, response) => {
  await routeAction("upsertMenuItem", requestPayload_(request), response);
});

app.patch("/api/menu/items/:id", async (request, response) => {
  await routeAction(
    "upsertMenuItem",
    { ...requestPayload_(request), itemId: request.params.id },
    response,
  );
});

app.delete("/api/menu/items/:id", async (request, response) => {
  await routeAction(
    "archiveMenuItem",
    { ...requestPayload_(request), itemId: request.params.id },
    response,
  );
});

app.post("/api/menu/items/:id/sizes", async (request, response) => {
  await routeAction(
    "upsertMenuSize",
    { ...requestPayload_(request), itemId: request.params.id },
    response,
  );
});

app.patch("/api/menu/sizes/:id", async (request, response) => {
  await routeAction(
    "upsertMenuSize",
    { ...requestPayload_(request), sizeId: request.params.id },
    response,
  );
});

app.delete("/api/menu/sizes/:id", async (request, response) => {
  await routeAction(
    "archiveMenuSize",
    { ...requestPayload_(request), sizeId: request.params.id },
    response,
  );
});

app.post("/api/admin/sheets/backup", async (request, response) => {
  await routeAction("backupSheetsWorkbook", requestPayload_(request), response);
});

app.post("/api/admin/sheets/migrate", async (request, response) => {
  await routeAction(
    "migrateSheetsWorkbook",
    requestPayload_(request),
    response,
  );
});

app.post("/api/admin/sheets/reconcile", async (request, response) => {
  await routeAction(
    "reconcileSheetsWorkbook",
    requestPayload_(request),
    response,
  );
});

app.get("/api/admin/sheets/health", async (request, response) => {
  await routeAction(
    "inspectSheetsWorkbook",
    requestPayload_(request),
    response,
  );
});

app.get("/api/admin/sheets/sync-failures", async (request, response) => {
  await routeAction("ownerOverview", requestPayload_(request), response);
});

app.post(
  "/api/admin/sheets/sync-failures/:id/retry",
  async (request, response) => {
    await routeAction(
      "retrySyncFailures",
      { ...requestPayload_(request), syncFailureId: request.params.id },
      response,
    );
  },
);

app.get("/api", async (request, response) => {
  const payload = requestPayload_(request);
  const action = clean_(payload.action || "appData");

  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    safeServerError_("API GET failed", error);
    response.status(statusCodeForError_(error)).json({
      ...safeErrorDetails_(error),
      success: false,
      message: safeErrorMessage_(error),
    });
  }
});

app.post("/api", async (request, response) => {
  const payload = requestPayload_(request);
  const action = clean_(payload.action || request.query.action || "appData");

  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    safeServerError_("API POST failed", error);
    response.status(statusCodeForError_(error)).json({
      ...safeErrorDetails_(error),
      success: false,
      message: safeErrorMessage_(error),
    });
  }
});

app.get("/", async (request, response) => {
  const payload = requestPayload_(request);
  const action = clean_(payload.action || "appData");

  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    safeServerError_("API GET failed", error);
    response.status(statusCodeForError_(error)).json({
      ...safeErrorDetails_(error),
      success: false,
      message: safeErrorMessage_(error),
    });
  }
});

app.post("/", async (request, response) => {
  const payload = requestPayload_(request);
  const action = clean_(payload.action || request.query.action || "appData");

  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    safeServerError_("API POST failed", error);
    response.status(statusCodeForError_(error)).json({
      ...safeErrorDetails_(error),
      success: false,
      message: safeErrorMessage_(error),
    });
  }
});

app.get("/health", async (_request, response) => {
  response.json({
    success: true,
    service: "Joy Corner Firebase + Google Sheets API",
    neon: await neonHealthSafe_(),
    neonBackupConfigured: neonBackupConfigured_(),
    spreadsheetId: maskId_(SPREADSHEET_ID),
  });
});

function requestPayload_(request: express.Request): Payload {
  const body =
    typeof request.body === "string"
      ? payloadFromText_(request.body)
      : request.body || {};
  return {
    ...(request.method === "GET" ? request.query : body),
    authorization: request.header("authorization"),
  };
}

function payloadFromText_(body: string): Payload {
  const text = clean_(body);
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function routeAction(
  action: string,
  payload: Payload,
  response: express.Response,
) {
  try {
    response.json(await handleAction(action, payload));
  } catch (error) {
    safeServerError_(`API action ${action} failed`, error);
    response.status(statusCodeForError_(error)).json({
      ...safeErrorDetails_(error),
      success: false,
      message: safeErrorMessage_(error),
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
    safeServerError_("API data slice failed", error);
    response.status(statusCodeForError_(error)).json({
      ...safeErrorDetails_(error),
      success: false,
      message: safeErrorMessage_(error),
    });
  }
}

if (process.env.FIREBASE_FUNCTIONS !== "1") {
  app.listen(PORT, () => {
    console.log(`Joy Corner backend listening on http://localhost:${PORT}`);
  });
}
