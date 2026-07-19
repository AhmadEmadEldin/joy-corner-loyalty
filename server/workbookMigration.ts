import { createHash } from "node:crypto";
import { normalizeOrderStatus } from "../src/orderStatus";
import { parseLiveMenuPrices } from "../src/menuRepository";
import { neutralizeSheetFormula } from "../src/sheetSafety";
import {
  CANONICAL_SHEET_TABS,
  NORMALIZED_SHEET_HEADERS,
  type CanonicalSheetName,
} from "./sheets/schema";

export type CellValue = string | number | boolean | null;
export type SourceWorkbook = Record<string, CellValue[][]>;
export type CanonicalWorkbook = {
  [K in CanonicalSheetName]: Record<string, CellValue>[];
};
export type MigrationException = {
  code: string;
  message: string;
  row: number;
  severity: "warning" | "error";
  sourceRecordJson?: string;
  sourceTab: string;
};
export type MigrationResult = {
  destination: CanonicalWorkbook;
  exceptions: MigrationException[];
  sourceCounts: Record<string, number>;
  destinationCounts: Record<string, number>;
  reconciliation: Reconciliation;
};
export type Reconciliation = {
  customerCount: number;
  destinationPaid: number;
  destinationSales: number;
  destinationUnpaid: number;
  loyaltyRecords: number;
  orderItemsOrphaned: number;
  paymentDifference: number;
  salesDifference: number;
  sourcePaid: number;
  sourceSales: number;
};

type Row = Record<string, CellValue>;

export function migrateLegacyWorkbook(source: SourceWorkbook): MigrationResult {
  const exceptions: MigrationException[] = [];
  const rows = Object.fromEntries(
    Object.entries(source).map(([tab, values]) => [tab, tableRows(values)]),
  ) as Record<string, Row[]>;
  const destination = Object.fromEntries(
    CANONICAL_SHEET_TABS.map((tab) => [tab, []]),
  ) as unknown as CanonicalWorkbook;
  const now = new Date().toISOString();

  destination.Settings = migrateSettings(rows["Business Settings"] || [], now);
  destination.Staff = migrateStaff(rows.Staff || [], now);
  destination.Menu = migrateMenu(rows.Menu || [], exceptions, now);
  destination.Customers = migrateCustomers(rows.Customers || [], now);

  const orderMigration = migrateOrders(
    rows.Orders || [],
    rows["Order Items"] || [],
    exceptions,
    now,
  );
  destination.Orders = orderMigration.orders;
  destination["Order Items"] = orderMigration.items;
  destination.Payments = migratePayments(
    rows.Payments || [],
    orderMigration.orderByReceipt,
    exceptions,
    now,
  );
  destination.Loyalty = migrateLoyalty(rows, exceptions, now);
  destination["System Log"] = migrateLogs(rows, exceptions, now);
  recalculateCustomers(
    destination.Customers,
    destination.Orders,
    destination["Order Items"],
    destination.Payments,
    destination.Loyalty,
  );
  destination.Dashboard = buildDashboard(destination, now);

  const sourceCounts = Object.fromEntries(
    Object.entries(rows).map(([tab, list]) => [tab, list.length]),
  );
  const destinationCounts = Object.fromEntries(
    Object.entries(destination).map(([tab, list]) => [tab, list.length]),
  );
  const reconciliation = reconcile(source, destination);
  return {
    destination,
    destinationCounts,
    exceptions,
    reconciliation,
    sourceCounts,
  };
}

export function auditLegacyWorkbook(source: SourceWorkbook) {
  const migration = migrateLegacyWorkbook(source);
  const duplicateIds: Record<string, string[]> = {};
  for (const [tab, values] of Object.entries(source)) {
    const records = tableRows(values);
    const idKey = [
      "orderId",
      "paymentId",
      "voucherCode",
      "redemptionId",
      "customerId",
    ].find((key) => records.some((row) => clean(row[key])));
    if (!idKey) continue;
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    records.forEach((row) => {
      const id = clean(row[idKey]);
      if (!id) return;
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    });
    if (duplicates.size) duplicateIds[tab] = [...duplicates];
  }
  return { duplicateIds, ...migration };
}

export function canonicalRows(result: MigrationResult, tab: string) {
  const headers =
    NORMALIZED_SHEET_HEADERS[tab as keyof typeof NORMALIZED_SHEET_HEADERS];
  if (!headers) throw new Error(`Unknown canonical tab: ${tab}`);
  return [
    headers,
    ...result.destination[tab as CanonicalSheetName].map((row) =>
      headers.map((header) => row[header] ?? ""),
    ),
  ];
}

function migrateSettings(rows: Row[], now: string) {
  const map = new Map(
    rows.map((row) => [clean(row.settingKey), clean(row.settingValue)]),
  );
  const settings: Array<[string, string, string, string, string]> = [
    [
      "schemaVersion",
      "2026-07-owner-db-v1",
      "string",
      "System",
      "Canonical ten-tab owner workbook schema",
    ],
    [
      "businessTimeZone",
      map.get("businessTimeZone") || "Africa/Cairo",
      "string",
      "Business",
      "Canonical business timezone",
    ],
    [
      "currency",
      map.get("currency") || "EGP",
      "string",
      "Business",
      "Currency",
    ],
    [
      "loyaltyThreshold",
      map.get("loyaltyThreshold") || "5",
      "number",
      "Loyalty",
      "Eligible paid drinks per reward",
    ],
    ["taxRate", "0", "number", "Payments", "Default tax rate"],
    [
      "serviceChargeRate",
      "0",
      "number",
      "Payments",
      "Default service charge rate",
    ],
    [
      "offlineSyncEnabled",
      "true",
      "boolean",
      "Offline",
      "Allow device operation queue",
    ],
    [
      "offlineRetryLimit",
      "5",
      "number",
      "Offline",
      "Maximum automatic retries",
    ],
    [
      "offlineMaximumQueueSize",
      "250",
      "number",
      "Offline",
      "Maximum queued operations per device",
    ],
    [
      "activeBusinessDate",
      "",
      "date",
      "Business",
      "Owner-controlled business date override",
    ],
    [
      "orderStatusesJson",
      JSON.stringify([
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
      ]),
      "json",
      "Orders",
      "Allowed order states",
    ],
    [
      "paymentStatusesJson",
      JSON.stringify(["Unpaid", "Partial", "Paid", "Refunded", "Voided"]),
      "json",
      "Payments",
      "Derived order payment states",
    ],
    [
      "preparationStatusesJson",
      JSON.stringify([
        "Not Sent",
        "Queued",
        "Accepted",
        "Preparing",
        "Ready",
        "Picked Up",
        "Cancelled",
      ]),
      "json",
      "Orders",
      "Allowed item preparation states",
    ],
    [
      "serviceTypesJson",
      JSON.stringify(["Dine In", "Outside", "Takeaway", "Car Service"]),
      "json",
      "Orders",
      "Allowed service types",
    ],
    [
      "paymentMethodsJson",
      JSON.stringify(["Cash", "Visa", "Card", "Wallet"]),
      "json",
      "Payments",
      "Allowed payment methods",
    ],
    [
      "staffRolesJson",
      JSON.stringify(["owner", "manager", "cashier", "waiter", "barista"]),
      "json",
      "Staff",
      "Allowed staff roles",
    ],
    [
      "defaultPreparationStation",
      "barista",
      "string",
      "Menu",
      "Default preparation station",
    ],
    ["receiptPrefix", "JC", "string", "Orders", "Receipt prefix"],
  ];
  return settings.map(
    ([settingKey, settingValue, valueType, category, description]) => ({
      active: true,
      category,
      description,
      settingKey,
      settingValue,
      updatedAt: now,
      updatedByName: "Workbook migration",
      updatedByUid: "system-migration",
      valueType,
    }),
  );
}

function migrateStaff(rows: Row[], now: string) {
  return rows
    .filter((row) => clean(row.Email || row.email))
    .map((row, index) => ({
      active: bool(row.Active ?? row.active),
      createdAt: clean(row.createdAt) || now,
      displayName: safe(row.displayName || row.Name || row.name),
      email: clean(row.Email || row.email).toLowerCase(),
      permissionsJson: jsonArray(row.grant || row.permissionsJson),
      revokedPermissionsJson: jsonArray(
        row.revoke || row.revokedPermissionsJson,
      ),
      role: clean(row.Role || row.role).toLowerCase(),
      uid:
        clean(row.uid) ||
        deterministicId("legacy-staff", `${index}:${row.Email}`),
      updatedAt: clean(row.updatedAt) || now,
      updatedByName: "Workbook migration",
      updatedByUid: "system-migration",
    }));
}

function migrateMenu(
  rows: Row[],
  exceptions: MigrationException[],
  now: string,
) {
  return rows
    .filter((row) => clean(row["Item ID"] || row.itemId || row["Item Name"]))
    .map((row, index) => {
      const itemName = safe(row["Item Name"] || row.itemName);
      const itemId =
        clean(row["Item ID"] || row.itemId) ||
        deterministicId("menu", itemName);
      const priceText = clean(
        row["Price Text (edit later)"] || row.price || row.priceText,
      );
      const sizes = parseLiveMenuPrices(priceText);
      if (sizes.length > 1)
        exceptions.push({
          code: "MENU_SIZE_LABEL_UNPROVEN",
          message: `${itemName}: ${priceText}`,
          row: index + 2,
          severity: "warning",
          sourceTab: "Menu",
        });
      if (!sizes.length)
        exceptions.push({
          code: "MENU_PRICE_UNRESOLVED",
          message: `${itemName}: ${priceText}`,
          row: index + 2,
          severity: "error",
          sourceTab: "Menu",
        });
      const categoryName = safe(row.Category || row.category) || "Menu";
      return {
        active: bool(row.Active ?? row.active),
        categoryId: deterministicId("category", categoryName),
        categoryName,
        createdAt: clean(row.createdAt) || now,
        description: safe(row.description),
        displayOrder: index + 1,
        extrasJson: "[]",
        flavorNotes: safe(row["Flavor / Notes"] || row.flavorNotes),
        imageUrl: clean(row.imageUrl),
        itemId,
        itemName,
        loyaltyEligible: bool(row["Loyalty Eligible"] ?? row.loyaltyEligible),
        preparationStation: clean(row.preparationStation) || "barista",
        priceText,
        sizesJson: JSON.stringify(
          sizes.map((size) => ({
            active: true,
            price: size.price,
            sizeId: size.sizeId,
            sizeName: size.sizeName,
          })),
        ),
        soldOut: bool(row.soldOut, false),
        standardSizeId: sizes[0]?.sizeId || "",
        updatedAt: clean(row.updatedAt) || now,
        updatedByName: "Workbook migration",
        updatedByUid: "system-migration",
      };
    });
}

function migrateCustomers(rows: Row[], now: string) {
  return rows
    .filter((row) =>
      clean(row["Customer ID"] || row.customerId || row["Full Name"]),
    )
    .map((row, index) => ({
      active: bool(row["Active?"] ?? row.active),
      birthday: clean(row.Birthday || row.birthday),
      createdAt: clean(row.createdAt) || clean(row["Join Date"]) || now,
      customerId:
        clean(row["Customer ID"] || row.customerId) ||
        deterministicId("customer", `${index}:${row["Full Name"]}`),
      email: clean(row.email).toLowerCase(),
      favoriteDrink: safe(row["Favorite Drink"] || row.favoriteDrink),
      firebaseUid: clean(row.firebaseUid),
      firstVisit: clean(row["Join Date"] || row.firstVisit),
      freeDrinksEarned: 0,
      freeDrinksReady: 0,
      freeDrinksRedeemed: 0,
      freeDrinksReserved: 0,
      fullName: safe(row["Full Name"] || row.fullName),
      joinDate: clean(row["Join Date"] || row.joinDate),
      lastVisit: clean(
        row["Last Visit Auto"] || row["Last Visit"] || row.lastVisit,
      ),
      notes: safe(row.Notes || row.notes),
      phone: safe(row["Phone/WhatsApp"] || row.phone),
      eligiblePaidDrinks: 0,
      totalItems: 0,
      totalOrders: 0,
      totalPaid: 0,
      totalSales: 0,
      unpaidBalance: 0,
      updatedAt: clean(row.updatedAt) || now,
    }));
}

function migrateOrders(
  orderRows: Row[],
  sourceItems: Row[],
  exceptions: MigrationException[],
  now: string,
) {
  const groups = new Map<string, Array<{ row: Row; sourceIndex: number }>>();
  orderRows.forEach((row, sourceIndex) => {
    if (!Object.values(row).some((value) => clean(value))) return;
    const proven = clean(row.orderId || row.receiptNumber);
    const key = proven || `legacy-row-${sourceIndex + 2}`;
    const list = groups.get(key) || [];
    list.push({ row, sourceIndex });
    groups.set(key, list);
  });
  const orders: Row[] = [];
  const items: Row[] = [];
  const orderByReceipt = new Map<string, string>();
  for (const [groupKey, entries] of groups) {
    const first = entries[0]!.row;
    const orderId =
      clean(first.orderId) || deterministicId("legacy-order", groupKey);
    const receiptNumber =
      clean(first.receiptNumber) ||
      `LEGACY-${String(entries[0]!.sourceIndex + 2).padStart(5, "0")}`;
    if (!clean(first.orderId || first.receiptNumber))
      exceptions.push({
        code: "ORDER_GROUPING_UNPROVEN",
        message: `Preserved source row as independent order ${orderId}`,
        row: entries[0]!.sourceIndex + 2,
        severity: "warning",
        sourceTab: "Orders",
      });
    const subtotal = entries.reduce(
      (sum, entry) =>
        sum + number(entry.row.subtotal || entry.row.Total || entry.row.total),
      0,
    );
    const total = entries.reduce(
      (sum, entry) =>
        sum +
        (number(entry.row.total || entry.row.Total) ||
          number(entry.row.subtotal)),
      0,
    );
    const paidAmount = entries.reduce((sum, entry) => {
      const rowTotal =
        number(entry.row.total || entry.row.Total) ||
        number(entry.row.subtotal);
      return (
        sum +
        (number(entry.row.paidAmount) ||
          (clean(entry.row["Payment Status"]).toLowerCase() === "paid"
            ? rowTotal
            : 0))
      );
    }, 0);
    const outstandingAmount = Math.max(total - paidAmount, 0);
    entries.slice(1).forEach((entry) =>
      exceptions.push({
        code: "DUPLICATE_PROVEN_ORDER_ID_GROUPED",
        message: `Grouped source row into proven orderId ${orderId}`,
        row: entry.sourceIndex + 2,
        severity: "warning",
        sourceRecordJson: JSON.stringify(entry.row),
        sourceTab: "Orders",
      }),
    );
    const master = {
      activeBoard: !bool(first.archived, false),
      amountApplied:
        entries.reduce(
          (sum, entry) => sum + number(entry.row.amountApplied),
          0,
        ) || paidAmount,
      amountReceived:
        entries.reduce(
          (sum, entry) => sum + number(entry.row.amountReceived),
          0,
        ) || paidAmount,
      archiveBatchId: clean(first.archiveBatchId),
      archived: bool(first.archived, false),
      archivedAt: clean(first.archivedAt),
      businessDate:
        clean(first.businessDate) ||
        dateOnly(first["Order Date/Time"] || first.createdAt),
      categorySummary: unique(
        entries.map((entry) => clean(entry.row.Category || entry.row.category)),
      ).join(", "),
      changeAmount: entries.reduce(
        (sum, entry) => sum + number(entry.row.changeAmount),
        0,
      ),
      clientRequestId:
        clean(first.clientRequestId) ||
        deterministicId("legacy-request", groupKey),
      createdAt: clean(first.createdAt || first["Order Date/Time"]) || now,
      createdByName: safe(first.staffName || first.Staff || "Legacy migration"),
      createdByRole: clean(first.staffRole) || "waiter",
      createdByUid: clean(first.staffUid) || "legacy-migration",
      customerId: clean(first["Customer ID"] || first.customerId),
      customerNameSnapshot: safe(
        first.customerNameSnapshot || first["Customer Name"],
      ),
      customerNotes: safe(first.customerNotes || first.Notes),
      customerPhoneSnapshot: safe(
        first.customerPhoneSnapshot || first.customerPhone,
      ),
      customerUid: clean(first.customerUid),
      deviceId: clean(first.deviceId) || "legacy-import",
      discountTotal: number(first.discountTotal || first.Discount),
      itemCount: entries.reduce(
        (sum, entry) =>
          sum + Math.max(1, number(entry.row.Qty || entry.row.qty)),
        0,
      ),
      itemDiscountTotal: number(first.itemDiscountTotal),
      itemSummary: entries
        .map(
          (entry) =>
            `${clean(entry.row.Item || entry.row.item)} x${number(entry.row.Qty || entry.row.qty) || 1}`,
        )
        .join(", "),
      legacyMigrationStatus: clean(first.orderId || first.receiptNumber)
        ? "Grouped by canonical identifier"
        : "Preserved as independent legacy row",
      offlineCreated: false,
      offlineCreatedAt: "",
      orderDiscount: number(first.orderDiscount),
      orderId,
      orderPlace: safe(first.orderPlace),
      orderStatus: normalizeOrderStatus(
        first["Order Status"] || first.orderStatus,
      ),
      outstandingAmount,
      paidAmount,
      paymentMethod: clean(first.paymentMethod),
      paymentStatus:
        paidAmount >= total && total > 0
          ? "Paid"
          : paidAmount > 0
            ? "Partial"
            : "Unpaid",
      receiptNumber,
      rewardDiscount: number(first.rewardDiscount),
      serviceCharge: number(first.serviceCharge),
      serviceType: clean(first.serviceType),
      subtotal,
      syncedAt: now,
      syncStatus: "Migrated",
      tax: number(first.tax),
      total,
      updatedAt: clean(first.updatedAt) || now,
    };
    orders.push(master);
    orderByReceipt.set(receiptNumber, orderId);
    entries.forEach((entry, index) =>
      items.push(
        legacyItem(
          entry.row,
          orderId,
          master.clientRequestId as string,
          index,
          now,
        ),
      ),
    );
  }
  const existingIds = new Set(items.map((item) => clean(item.orderItemId)));
  sourceItems.forEach((row, index) => {
    const orderId = clean(row.orderId);
    if (!orderId || !orders.some((order) => clean(order.orderId) === orderId)) {
      exceptions.push({
        code: "ORPHAN_ORDER_ITEM",
        message: `orderId=${orderId || "missing"}`,
        row: index + 2,
        severity: "error",
        sourceRecordJson: JSON.stringify(row),
        sourceTab: "Order Items",
      });
      return;
    }
    const item = canonicalExistingItem(row, index, now);
    if (!existingIds.has(clean(item.orderItemId))) items.push(item);
  });
  return { items, orderByReceipt, orders };
}

function legacyItem(
  row: Row,
  orderId: string,
  clientRequestId: string,
  index: number,
  now: string,
): Row {
  const qty = Math.max(1, number(row.Qty || row.qty || row.quantity));
  const price = number(row["Unit Price"] || row.unitPrice);
  const discount = number(row.Discount || row.discount);
  return {
    acceptedAt: "",
    categoryId: deterministicId(
      "category",
      clean(row.Category || row.category),
    ),
    categoryNameSnapshot: safe(row.Category || row.category),
    clientRequestId,
    completedAt: "",
    createdAt: clean(row.createdAt || row["Order Date/Time"]) || now,
    discount,
    extrasJson: "[]",
    extrasTotal: 0,
    itemNotes: safe(row.Notes || row.itemNotes),
    lineTotal:
      number(row.Total || row.total) || Math.max(qty * price - discount, 0),
    menuItemId:
      clean(row.menuItemId) ||
      deterministicId("menu", clean(row.Item || row.item)),
    menuItemNameSnapshot: safe(row.Item || row.item),
    orderId,
    orderItemId:
      clean(row.orderItemId) ||
      deterministicId("legacy-item", `${orderId}:${index}:${row.Item}`),
    pickedUpAt: "",
    preparationStation: clean(row.preparationStation) || "barista",
    preparationStatus: clean(row.preparationStatus) || "Not Sent",
    preparingAt: "",
    quantity: qty,
    readyAt: "",
    sizeId: clean(row.sizeId || row.size) || "standard",
    sizeName: safe(row.sizeName || row.size) || "Standard",
    trustedUnitPrice: price,
    updatedAt: clean(row.updatedAt) || now,
  };
}
function canonicalExistingItem(row: Row, index: number, now: string): Row {
  const mapped = legacyItem(
    row,
    clean(row.orderId),
    clean(row.clientRequestId),
    index,
    now,
  );
  return {
    ...mapped,
    orderItemId: clean(row.orderItemId) || clean(mapped.orderItemId),
    menuItemNameSnapshot: safe(row.menuItemNameSnapshot || row.menuItemName),
    categoryNameSnapshot: safe(row.categoryNameSnapshot || row.category),
    trustedUnitPrice: number(row.trustedUnitPrice || row.unitPrice),
    lineTotal: number(row.lineTotal),
  };
}

function migratePayments(
  rows: Row[],
  orderByReceipt: Map<string, string>,
  exceptions: MigrationException[],
  now: string,
) {
  return rows
    .filter((row) => Object.values(row).some((value) => clean(value)))
    .map((row, index) => {
      const receiptNumber = clean(row.receiptNumber);
      const orderId =
        clean(row.orderId) || orderByReceipt.get(receiptNumber) || "";
      if (!orderId)
        exceptions.push({
          code: "ORPHAN_PAYMENT",
          message: `receipt=${receiptNumber || "missing"}`,
          row: index + 2,
          severity: "error",
          sourceRecordJson: JSON.stringify(row),
          sourceTab: "Payments",
        });
      const received = number(row.amountReceived || row.Amount || row.amount);
      const applied = number(row.amountApplied) || received;
      return {
        amountApplied: applied,
        amountReceived: received,
        businessDate:
          clean(row.businessDate) ||
          dateOnly(row["Payment Date"] || row.createdAt),
        changeAmount:
          number(row.changeAmount) || Math.max(received - applied, 0),
        clientRequestId:
          clean(row.clientRequestId) ||
          deterministicId(
            "legacy-payment-request",
            `${index}:${row.paymentId}`,
          ),
        createdAt: clean(row.createdAt || row["Payment Date"]) || now,
        customerId: clean(row["Customer ID"] || row.customerId),
        customerNameSnapshot: safe(
          row.customerNameSnapshot || row["Customer Name"],
        ),
        notes: safe(row.notes || row["Related Order/Notes"]),
        offlineCreated: false,
        orderId,
        paymentId:
          clean(row.paymentId) ||
          deterministicId(
            "legacy-payment",
            `${index}:${receiptNumber}:${received}`,
          ),
        paymentMethod: clean(row.paymentMethod || row.Method) || "Cash",
        paymentType: clean(row.paymentType) || "Sale",
        receivedByName: safe(
          row.receivedByName || row["Collected By"] || "Legacy migration",
        ),
        receivedByRole: clean(row.receivedByRole) || "cashier",
        receivedByUid: clean(row.receivedByUid) || "legacy-migration",
        receiptNumber,
        status: clean(row.status) || "Applied",
        syncedAt: now,
        syncStatus: "Migrated",
      };
    });
}

function migrateLoyalty(
  rows: Record<string, Row[]>,
  exceptions: MigrationException[],
  now: string,
) {
  const result: Row[] = [];
  (rows["Generated Vouchers"] || []).forEach((row, index) => {
    const code = clean(row["Voucher Code"] || row.voucherCode);
    if (!code) return;
    const statusRaw = clean(
      row["Redeem Status"] || row.redeemStatus,
    ).toLowerCase();
    const status =
      statusRaw.includes("redeem") && !statusRaw.includes("not")
        ? "Redeemed"
        : statusRaw.includes("cancel")
          ? "Cancelled"
          : "Reserved";
    result.push({
      cancelledAt: status === "Cancelled" ? clean(row.createdAt) || now : "",
      createdAt: clean(row.createdAt || row["Generated At"] || row.date) || now,
      createdByName: "Legacy migration",
      createdByUid: "system-migration",
      customerId: clean(row["Customer ID"] || row.customerId),
      customerNameSnapshot: safe(
        row["Customer Name"] || row.customerName || row.fullName,
      ),
      expiresAt: "",
      loyaltyRecordId: deterministicId("voucher", code),
      notes: safe(row["Voucher Text"] || row.voucherText),
      points: 0,
      quantity: 1,
      recordType: "Voucher",
      redeemedAt: status === "Redeemed" ? clean(row.createdAt) || now : "",
      relatedOrderId: "",
      relatedVoucherCode: code,
      reservedAt: clean(row["Generated At"] || row.createdAt) || now,
      rewardItemId: "",
      rewardItemName: safe(row["Favorite Drink"] || row.favoriteDrink),
      rewardType: "Free Drink",
      sequenceNumber: index + 1,
      status,
      updatedAt: now,
    });
  });
  (rows["Reward Redemptions"] || []).forEach((row, index) => {
    const redemptionId =
      clean(row["Redemption ID"] || row.redemptionId) ||
      deterministicId("redemption", `${index}:${row.Date}`);
    result.push({
      cancelledAt: "",
      createdAt: clean(row.Date || row.date) || now,
      createdByName: safe(row.Staff || row.staff),
      createdByUid: "legacy-migration",
      customerId: clean(row["Customer ID"] || row.customerId),
      customerNameSnapshot: safe(row["Customer Name"] || row.customerName),
      expiresAt: "",
      loyaltyRecordId: redemptionId,
      notes: safe(row.Notes || row.notes),
      points: 0,
      quantity: 1,
      recordType: "Redeemed",
      redeemedAt: clean(row.Date || row.date) || now,
      relatedOrderId: "",
      relatedVoucherCode: clean(row.voucherCode),
      reservedAt: "",
      rewardItemId: "",
      rewardItemName: safe(row["Free Drink Item"] || row.freeDrinkItem),
      rewardType: "Free Drink",
      sequenceNumber: result.length + 1,
      status: "Redeemed",
      updatedAt: now,
    });
  });
  (rows.Rewards || []).forEach((row, index) => {
    const ready = number(row["Free Drinks Ready"] || row.freeDrinksReady);
    if (ready <= 0) return;
    result.push({
      cancelledAt: "",
      createdAt: now,
      createdByName: "Legacy migration",
      createdByUid: "system-migration",
      customerId: clean(row["Customer ID"] || row.customerId),
      customerNameSnapshot: safe(row["Customer Name"] || row.customerName),
      expiresAt: "",
      loyaltyRecordId: deterministicId(
        "loyalty-adjustment",
        `${index}:${row["Customer ID"]}`,
      ),
      notes: "Opening balance preserved from legacy Rewards aggregate",
      points: 0,
      quantity: ready,
      recordType: "Manual Adjustment",
      redeemedAt: "",
      relatedOrderId: "",
      relatedVoucherCode: "",
      reservedAt: "",
      rewardItemId: "",
      rewardItemName: safe(row["Favorite Drink"]),
      rewardType: "Free Drink",
      sequenceNumber: result.length + 1,
      status: "Available",
      updatedAt: now,
    });
    exceptions.push({
      code: "LOYALTY_OPENING_BALANCE",
      message: `Preserved ${ready} ready reward(s) as a manual opening adjustment`,
      row: index + 2,
      severity: "warning",
      sourceTab: "Rewards",
    });
  });
  return result;
}

function migrateLogs(
  rows: Record<string, Row[]>,
  exceptions: MigrationException[],
  now: string,
) {
  const result: Row[] = [];
  const add = (
    sourceTab: string,
    eventType: string,
    severity: string,
    row: Row,
    index: number,
  ) =>
    result.push({
      action:
        clean(row.action) ||
        `legacy.${sourceTab.toLowerCase().replace(/\s+/g, ".")}`,
      actorName: safe(
        row.actorName || row.userId || row.resetBy || row.generatedByName,
      ),
      actorRole: clean(row.actorRole || row.role),
      actorUid: clean(row.actorUid || row.userId || row.generatedByUid),
      archiveBatchId: clean(row.archiveBatchId),
      businessDate: clean(row.businessDate || row.dateKey),
      clientRequestId: clean(row.clientRequestId),
      createdAt:
        clean(
          row.createdAt || row.timestamp || row.resetAt || row.generatedAt,
        ) || now,
      entityId: clean(row.entityId || row.dateKey || row.dailyFileId),
      entityType: clean(row.entityType) || sourceTab,
      errorCode: clean(row.errorCode),
      errorMessage: safe(row.errorMessage),
      eventType,
      logId:
        clean(row.auditId || row.syncFailureId || row.dailyFileId) ||
        deterministicId("legacy-log", `${sourceTab}:${index}`),
      newValueJson: jsonValue(row.newValue || row.newValueJson || row),
      previousValueJson: jsonValue(row.previousValue || row.previousValueJson),
      reason: safe(row.reason || row.notes),
      receiptFileId: clean(row.dailyFileId),
      requestId: clean(row.requestId || row.syncJobId),
      resolvedAt: clean(row.resolvedAt),
      retryCount: number(row.retryCount),
      sessionMetadataJson: jsonValue(
        row.sessionMetadata || row.sessionMetadataJson,
      ),
      severity,
      success: bool(row.success, eventType !== "Sync Failure"),
    });
  (rows["Audit Log"] || []).forEach((row, index) =>
    add("Audit Log", "Audit", "Info", row, index),
  );
  (rows["Sync Failures"] || []).forEach((row, index) =>
    add("Sync Failures", "Sync Failure", "Error", row, index),
  );
  (rows["Day History"] || []).forEach((row, index) =>
    add("Day History", "End Day", "Info", row, index),
  );
  (rows["Daily Receipt Files"] || []).forEach((row, index) =>
    add("Daily Receipt Files", "Receipt Archive", "Info", row, index),
  );
  exceptions.forEach((exception, index) =>
    add(
      "Migration Exceptions",
      "Migration",
      exception.severity === "error" ? "Error" : "Warning",
      {
        action: exception.code,
        entityId: `${exception.sourceTab}:${exception.row}`,
        errorMessage: exception.message,
        previousValueJson: exception.sourceRecordJson || "",
        reason: exception.message,
        success: false,
      },
      index,
    ),
  );
  return result;
}

function recalculateCustomers(
  customers: Row[],
  orders: Row[],
  items: Row[],
  payments: Row[],
  loyalty: Row[],
) {
  for (const customer of customers) {
    const id = clean(customer.customerId);
    const customerOrders = orders.filter(
      (order) => clean(order.customerId) === id,
    );
    const ids = new Set(customerOrders.map((order) => clean(order.orderId)));
    const customerItems = items.filter((item) => ids.has(clean(item.orderId)));
    const customerPayments = payments.filter(
      (payment) =>
        clean(payment.customerId) === id || ids.has(clean(payment.orderId)),
    );
    const records = loyalty.filter((record) => clean(record.customerId) === id);
    const dates = customerOrders
      .map((order) => clean(order.createdAt))
      .filter(Boolean)
      .sort();
    customer.firstVisit = dates[0] || clean(customer.firstVisit);
    customer.lastVisit = dates.at(-1) || clean(customer.lastVisit);
    customer.totalOrders = customerOrders.length;
    customer.totalItems = customerItems.reduce(
      (sum, item) => sum + number(item.quantity),
      0,
    );
    customer.totalSales = customerOrders.reduce(
      (sum, order) => sum + number(order.total),
      0,
    );
    customer.totalPaid = customerPayments
      .filter(
        (payment) =>
          !["Refunded", "Voided", "Failed"].includes(clean(payment.status)),
      )
      .reduce((sum, payment) => sum + number(payment.amountApplied), 0);
    customer.unpaidBalance = Math.max(
      number(customer.totalSales) - number(customer.totalPaid),
      0,
    );
    customer.eligiblePaidDrinks = customerItems.reduce(
      (sum, item) => sum + number(item.quantity),
      0,
    );
    customer.freeDrinksEarned = records
      .filter((record) => clean(record.recordType) === "Earned")
      .reduce((sum, record) => sum + number(record.quantity), 0);
    customer.freeDrinksReserved = records
      .filter(
        (record) =>
          ["Reserved", "Voucher"].includes(clean(record.recordType)) &&
          clean(record.status) === "Reserved",
      )
      .reduce((sum, record) => sum + number(record.quantity), 0);
    customer.freeDrinksRedeemed = records
      .filter(
        (record) =>
          clean(record.recordType) === "Redeemed" ||
          clean(record.status) === "Redeemed",
      )
      .reduce((sum, record) => sum + number(record.quantity), 0);
    const adjustments = records
      .filter((record) => clean(record.recordType) === "Manual Adjustment")
      .reduce((sum, record) => sum + number(record.quantity), 0);
    customer.freeDrinksReady = Math.max(
      number(customer.freeDrinksEarned) +
        adjustments -
        number(customer.freeDrinksReserved) -
        number(customer.freeDrinksRedeemed),
      0,
    );
    customer.updatedAt = new Date().toISOString();
  }
}

function buildDashboard(destination: CanonicalWorkbook, now: string) {
  const orders = destination.Orders;
  const payments = destination.Payments;
  const customers = destination.Customers;
  const loyalty = destination.Loyalty;
  const today = now.slice(0, 10);
  const metrics: Array<[string, CellValue, string, string]> = [
    ["currentBusinessDate", today, "Business", "Africa/Cairo business date"],
    [
      "activeOrders",
      orders.filter((row) => bool(row.activeBoard)).length,
      "Orders",
      "Orders on active board",
    ],
    [
      "totalSales",
      orders.reduce((sum, row) => sum + number(row.total), 0),
      "Finance",
      "Canonical order total",
    ],
    [
      "totalPaid",
      payments
        .filter((row) => clean(row.status) === "Applied")
        .reduce((sum, row) => sum + number(row.amountApplied), 0),
      "Finance",
      "Applied payments",
    ],
    [
      "totalOutstanding",
      customers.reduce((sum, row) => sum + number(row.unpaidBalance), 0),
      "Finance",
      "Customer unpaid balance",
    ],
    ["customerCount", customers.length, "Customers", "Canonical customers"],
    [
      "rewardsReady",
      customers.reduce((sum, row) => sum + number(row.freeDrinksReady), 0),
      "Loyalty",
      "Available free drinks",
    ],
    [
      "vouchersReserved",
      loyalty.filter(
        (row) =>
          clean(row.recordType) === "Voucher" &&
          clean(row.status) === "Reserved",
      ).length,
      "Loyalty",
      "Reserved vouchers",
    ],
    [
      "pendingOfflineOperations",
      0,
      "System",
      "Device queues report when synced",
    ],
    [
      "failedSynchronizationOperations",
      destination["System Log"].filter(
        (row) => clean(row.eventType) === "Sync Failure" && !row.resolvedAt,
      ).length,
      "System",
      "Unresolved sync failures",
    ],
    ["schemaVersion", "2026-07-owner-db-v1", "System", "Canonical schema"],
  ];
  for (const status of [
    "Requested",
    "Awaiting Confirmation",
    "Approved",
    "Preparing",
    "Ready",
    "Picked Up",
    "Completed",
    "Cancelled",
  ])
    metrics.push([
      status.replace(/\s+/g, "").replace(/^./, (value) => value.toLowerCase()),
      orders.filter((row) => clean(row.orderStatus) === status).length,
      "Orders",
      `${status} orders`,
    ]);
  return metrics.map(([metric, value, category, description]) => ({
    category,
    description,
    lastRefreshed: now,
    metric,
    value,
  }));
}

function reconcile(
  source: SourceWorkbook,
  destination: CanonicalWorkbook,
): Reconciliation {
  const sourceOrderRows = tableRows(source.Orders || []);
  const sourcePaymentRows = tableRows(source.Payments || []);
  const sourceSales = sourceOrderRows.reduce(
    (sum, row) => sum + number(row.Total || row.total),
    0,
  );
  const sourcePaid = sourcePaymentRows.reduce(
    (sum, row) => sum + number(row.Amount || row.amount || row.amountApplied),
    0,
  );
  const destinationSales = destination.Orders.reduce(
    (sum, row) => sum + number(row.total),
    0,
  );
  const destinationPaid = destination.Payments.filter(
    (row) => !["Refunded", "Voided", "Failed"].includes(clean(row.status)),
  ).reduce((sum, row) => sum + number(row.amountApplied), 0);
  const orderIds = new Set(destination.Orders.map((row) => clean(row.orderId)));
  return {
    customerCount: destination.Customers.length,
    destinationPaid,
    destinationSales,
    destinationUnpaid: destination.Customers.reduce(
      (sum, row) => sum + number(row.unpaidBalance),
      0,
    ),
    loyaltyRecords: destination.Loyalty.length,
    orderItemsOrphaned: destination["Order Items"].filter(
      (row) => !orderIds.has(clean(row.orderId)),
    ).length,
    paymentDifference: round(destinationPaid - sourcePaid),
    salesDifference: round(destinationSales - sourceSales),
    sourcePaid,
    sourceSales,
  };
}

function tableRows(values: CellValue[][]): Row[] {
  const headers = (values[0] || []).map((header) => clean(header));
  return values
    .slice(1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, row[index] ?? ""])
          .filter(([header]) => header),
      ),
    );
}
function clean(value: unknown) {
  return String(value ?? "").trim();
}
function safe(value: unknown) {
  return neutralizeSheetFormula(clean(value), 1000);
}
function number(value: unknown) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? round(parsed) : 0;
}
function round(value: number) {
  return Math.round(value * 100) / 100;
}
function bool(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return !["no", "false", "0", "inactive", "disabled", "blocked"].includes(
    clean(value).toLowerCase(),
  );
}
function dateOnly(value: unknown) {
  const text = clean(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : parsed.toISOString().slice(0, 10);
}
function deterministicId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}
function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
function jsonArray(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value);
  const text = clean(value);
  if (!text) return "[]";
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(Array.isArray(parsed) ? parsed : []);
  } catch {
    return JSON.stringify(
      text
        .split(/[,|\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }
}
function jsonValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}
