import {
  CANONICAL_SHEET_TABS,
  NORMALIZED_SHEET_HEADERS,
  type CanonicalSheetName,
} from "./sheets/schema";

export type SheetSchema = {
  aliases: Record<string, string[]>;
  booleanColumns: string[];
  calculatedColumns: string[];
  controlledValues: Record<string, readonly string[]>;
  dateColumns: string[];
  editableColumns: string[];
  frontendWritableColumns: string[];
  formulaColumns: string[];
  idColumns: string[];
  jsonColumns: string[];
  legacyIgnoredColumns: string[];
  numericColumns: string[];
  protectedColumns: string[];
  requiredHeaders: string[];
  sheetName: CanonicalSheetName;
};

const orderStatuses = [
  "Requested",
  "Awaiting Confirmation",
  "Confirmed",
  "Approved",
  "Accepted",
  "Preparing",
  "Ready",
  "Picked Up",
  "Completed",
  "Rejected",
  "Cancelled",
] as const;
const orderPaymentStatuses = [
  "Unpaid",
  "Partial",
  "Paid",
  "Refunded",
  "Voided",
] as const;
const paymentStatuses = [
  "Pending",
  "Applied",
  "Refunded",
  "Voided",
  "Failed",
] as const;

const definitions: Record<CanonicalSheetName, Partial<SheetSchema>> = {
  Dashboard: {
    calculatedColumns: NORMALIZED_SHEET_HEADERS.Dashboard,
    protectedColumns: NORMALIZED_SHEET_HEADERS.Dashboard,
  },
  Settings: {
    idColumns: ["settingKey"],
    jsonColumns: ["settingValue"],
    frontendWritableColumns: ["settingValue", "active"],
    protectedColumns: [
      "settingKey",
      "updatedAt",
      "updatedByUid",
      "updatedByName",
    ],
  },
  Staff: {
    idColumns: ["uid", "email"],
    jsonColumns: ["permissionsJson", "revokedPermissionsJson"],
    booleanColumns: ["active"],
    dateColumns: ["createdAt", "updatedAt"],
    frontendWritableColumns: [
      "email",
      "displayName",
      "role",
      "active",
      "permissionsJson",
      "revokedPermissionsJson",
    ],
    protectedColumns: [
      "uid",
      "createdAt",
      "updatedAt",
      "updatedByUid",
      "updatedByName",
    ],
    legacyIgnoredColumns: ["Password", "password"],
    controlledValues: {
      role: ["owner", "manager", "cashier", "waiter", "barista"],
    },
  },
  Menu: {
    idColumns: ["itemId"],
    jsonColumns: ["sizesJson", "extrasJson"],
    booleanColumns: ["loyaltyEligible", "active", "soldOut"],
    numericColumns: ["displayOrder"],
    dateColumns: ["createdAt", "updatedAt"],
    frontendWritableColumns: [
      "categoryId",
      "categoryName",
      "itemName",
      "description",
      "flavorNotes",
      "imageUrl",
      "priceText",
      "sizesJson",
      "extrasJson",
      "standardSizeId",
      "preparationStation",
      "loyaltyEligible",
      "active",
      "soldOut",
      "displayOrder",
    ],
    protectedColumns: [
      "itemId",
      "createdAt",
      "updatedAt",
      "updatedByUid",
      "updatedByName",
    ],
  },
  Customers: {
    idColumns: ["customerId", "firebaseUid"],
    booleanColumns: ["active"],
    numericColumns: [
      "totalOrders",
      "totalItems",
      "totalSales",
      "totalPaid",
      "unpaidBalance",
      "eligiblePaidDrinks",
      "freeDrinksEarned",
      "freeDrinksReserved",
      "freeDrinksRedeemed",
      "freeDrinksReady",
    ],
    dateColumns: [
      "birthday",
      "joinDate",
      "firstVisit",
      "lastVisit",
      "createdAt",
      "updatedAt",
    ],
    calculatedColumns: [
      "firstVisit",
      "lastVisit",
      "totalOrders",
      "totalItems",
      "totalSales",
      "totalPaid",
      "unpaidBalance",
      "eligiblePaidDrinks",
      "freeDrinksEarned",
      "freeDrinksReserved",
      "freeDrinksRedeemed",
      "freeDrinksReady",
    ],
    frontendWritableColumns: [
      "fullName",
      "phone",
      "email",
      "birthday",
      "favoriteDrink",
      "notes",
    ],
    protectedColumns: [
      "customerId",
      "firebaseUid",
      "firstVisit",
      "lastVisit",
      "totalOrders",
      "totalItems",
      "totalSales",
      "totalPaid",
      "unpaidBalance",
      "eligiblePaidDrinks",
      "freeDrinksEarned",
      "freeDrinksReserved",
      "freeDrinksRedeemed",
      "freeDrinksReady",
      "createdAt",
      "updatedAt",
    ],
  },
  Orders: {
    idColumns: ["orderId", "receiptNumber", "clientRequestId"],
    booleanColumns: ["activeBoard", "archived", "offlineCreated"],
    numericColumns: [
      "itemCount",
      "subtotal",
      "itemDiscountTotal",
      "orderDiscount",
      "rewardDiscount",
      "discountTotal",
      "tax",
      "serviceCharge",
      "total",
      "amountReceived",
      "amountApplied",
      "paidAmount",
      "outstandingAmount",
      "changeAmount",
    ],
    dateColumns: [
      "businessDate",
      "createdAt",
      "updatedAt",
      "archivedAt",
      "offlineCreatedAt",
      "syncedAt",
    ],
    calculatedColumns: [
      "itemCount",
      "itemSummary",
      "categorySummary",
      "subtotal",
      "itemDiscountTotal",
      "discountTotal",
      "total",
      "amountApplied",
      "paidAmount",
      "outstandingAmount",
      "changeAmount",
      "paymentStatus",
    ],
    frontendWritableColumns: [
      "customerId",
      "serviceType",
      "orderPlace",
      "customerNotes",
    ],
    protectedColumns: [
      "orderId",
      "receiptNumber",
      "clientRequestId",
      "deviceId",
      "businessDate",
      "createdAt",
      "updatedAt",
      "customerUid",
      "customerNameSnapshot",
      "customerPhoneSnapshot",
      "createdByUid",
      "createdByName",
      "createdByRole",
      "itemCount",
      "itemSummary",
      "categorySummary",
      "subtotal",
      "itemDiscountTotal",
      "rewardDiscount",
      "discountTotal",
      "tax",
      "serviceCharge",
      "total",
      "amountReceived",
      "amountApplied",
      "paidAmount",
      "outstandingAmount",
      "changeAmount",
      "paymentMethod",
      "paymentStatus",
      "orderStatus",
      "activeBoard",
      "archived",
      "archivedAt",
      "archiveBatchId",
      "offlineCreated",
      "offlineCreatedAt",
      "syncStatus",
      "syncedAt",
      "legacyMigrationStatus",
    ],
    controlledValues: {
      orderStatus: orderStatuses,
      paymentStatus: orderPaymentStatuses,
    },
  },
  "Order Items": {
    idColumns: ["orderItemId", "orderId", "clientRequestId", "menuItemId"],
    jsonColumns: ["extrasJson"],
    numericColumns: [
      "quantity",
      "trustedUnitPrice",
      "extrasTotal",
      "discount",
      "lineTotal",
    ],
    dateColumns: [
      "acceptedAt",
      "preparingAt",
      "readyAt",
      "pickedUpAt",
      "completedAt",
      "createdAt",
      "updatedAt",
    ],
    calculatedColumns: [
      "trustedUnitPrice",
      "extrasTotal",
      "discount",
      "lineTotal",
    ],
    frontendWritableColumns: [
      "menuItemId",
      "sizeId",
      "quantity",
      "extrasJson",
      "itemNotes",
    ],
    protectedColumns: [
      "orderItemId",
      "orderId",
      "clientRequestId",
      "menuItemNameSnapshot",
      "categoryId",
      "categoryNameSnapshot",
      "sizeName",
      "trustedUnitPrice",
      "extrasTotal",
      "discount",
      "lineTotal",
      "preparationStation",
      "preparationStatus",
      "acceptedAt",
      "preparingAt",
      "readyAt",
      "pickedUpAt",
      "completedAt",
      "createdAt",
      "updatedAt",
    ],
  },
  Payments: {
    idColumns: ["paymentId", "orderId", "clientRequestId"],
    booleanColumns: ["offlineCreated"],
    numericColumns: ["amountReceived", "amountApplied", "changeAmount"],
    dateColumns: ["businessDate", "createdAt", "syncedAt"],
    calculatedColumns: ["amountApplied", "changeAmount"],
    frontendWritableColumns: [
      "orderId",
      "amountReceived",
      "paymentMethod",
      "notes",
    ],
    protectedColumns: [
      "paymentId",
      "receiptNumber",
      "clientRequestId",
      "businessDate",
      "customerId",
      "customerNameSnapshot",
      "amountApplied",
      "changeAmount",
      "status",
      "receivedByUid",
      "receivedByName",
      "receivedByRole",
      "offlineCreated",
      "syncStatus",
      "createdAt",
      "syncedAt",
    ],
    controlledValues: {
      paymentType: [
        "Initial",
        "Collection",
        "Outstanding Collection",
        "Sale",
        "Unpaid Collection",
        "Refund",
        "Reversal",
        "Adjustment",
      ],
      status: paymentStatuses,
    },
  },
  Loyalty: {
    idColumns: [
      "loyaltyRecordId",
      "customerId",
      "relatedOrderId",
      "relatedVoucherCode",
    ],
    numericColumns: ["sequenceNumber", "quantity", "points"],
    dateColumns: [
      "reservedAt",
      "redeemedAt",
      "cancelledAt",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ],
    frontendWritableColumns: [],
    protectedColumns: NORMALIZED_SHEET_HEADERS.Loyalty,
    controlledValues: {
      recordType: [
        "Earned",
        "Reserved",
        "Voucher",
        "Redeemed",
        "Cancelled",
        "Expired",
        "Manual Adjustment",
      ],
    },
  },
  "System Log": {
    idColumns: [
      "logId",
      "entityId",
      "requestId",
      "clientRequestId",
      "receiptFileId",
      "archiveBatchId",
    ],
    jsonColumns: ["previousValueJson", "newValueJson", "sessionMetadataJson"],
    booleanColumns: ["success"],
    numericColumns: ["retryCount"],
    dateColumns: ["businessDate", "createdAt", "resolvedAt"],
    frontendWritableColumns: [],
    protectedColumns: NORMALIZED_SHEET_HEADERS["System Log"],
    controlledValues: {
      eventType: [
        "Audit",
        "Sync Failure",
        "Offline Sync",
        "End Day Archive",
        "Daily Receipt File",
        "Receipt Archive",
        "Migration",
        "Migration Exception",
        "System Error",
        "Schema Validation",
      ],
      severity: ["Info", "Warning", "Error", "Critical"],
    },
  },
};

export const SHEET_SCHEMAS = Object.fromEntries(
  CANONICAL_SHEET_TABS.map((sheetName) => {
    const partial = definitions[sheetName];
    const requiredHeaders = NORMALIZED_SHEET_HEADERS[sheetName];
    const calculatedColumns = partial.calculatedColumns || [];
    const protectedColumns = partial.protectedColumns || [];
    const editableColumns = requiredHeaders.filter(
      (header) =>
        !protectedColumns.includes(header) &&
        !calculatedColumns.includes(header),
    );
    return [
      normalizeSheetHeader(sheetName),
      {
        aliases: identityAliases(requiredHeaders),
        booleanColumns: [],
        calculatedColumns: [],
        controlledValues: {},
        dateColumns: [],
        editableColumns,
        formulaColumns: [],
        frontendWritableColumns: [],
        idColumns: [],
        jsonColumns: [],
        legacyIgnoredColumns: [],
        numericColumns: [],
        protectedColumns: [],
        ...partial,
        requiredHeaders,
        sheetName,
      } satisfies SheetSchema,
    ];
  }),
) as Record<string, SheetSchema>;

export function normalizeSheetHeader(value: string) {
  return String(value || "")
    .trim()
    .replace(/[?]/g, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, letter: string) =>
      letter.toUpperCase(),
    )
    .replace(/^[A-Z]/, (letter) => letter.toLowerCase())
    .replace(/ID\b/g, "Id");
}

function identityAliases(headers: string[]) {
  return Object.fromEntries(
    headers.map((header) => [normalizeSheetHeader(header), [header]]),
  );
}
export function schemaForSheet(sheetName: string) {
  return Object.values(SHEET_SCHEMAS).find(
    (entry) => entry.sheetName.toLowerCase() === sheetName.trim().toLowerCase(),
  );
}
export function resolveCanonicalHeader(sheetName: string, header: string) {
  const target = normalizeSheetHeader(header);
  const entry = schemaForSheet(sheetName);
  if (!entry) return target;
  for (const [canonical, aliases] of Object.entries(entry.aliases).reverse())
    if (
      [canonical, ...aliases].some(
        (alias) => normalizeSheetHeader(alias) === target,
      )
    )
      return canonical;
  return target;
}
