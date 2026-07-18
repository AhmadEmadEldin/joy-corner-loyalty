# Live Google Sheet contract

Production workbook: `Joy_Corner_Integrated_WITH_Loyalty_Winners` (`1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8`), locale `ar_EG`, timezone `Africa/Cairo`.

The contract was verified read-only against the live workbook. The application recognizes exactly these twenty tabs, in their existing names:

1. Staff
2. Dashboard
3. Customers
4. Orders
5. Rewards
6. Loyalty Winners
7. Generated Vouchers
8. Reward Redemptions
9. Unpaid Tracker
10. Menu
11. Payments
12. Lists
13. Day History
14. Order Items
15. Audit Log
16. Sync Failures
17. Customer Summary
18. Daily Receipt Files
19. Business Settings
20. Schema Status

`server/sheets/schema.ts` is the exact header inventory. `server/sheetSchema.ts` maps display headers to canonical application fields and declares editable, calculated, protected, ID, and date columns. Schema checks append their result to `Schema Status`; they do not reorder or delete historical columns.

## Ownership rules

- `Orders` is one master row per order. The original business columns stay compatible, while canonical IDs, totals, snapshots, state, archive, actor, and timestamps are server-owned.
- `Order Items` contains one row per line item and references `orderId`. The server snapshots item name, category, size, trusted unit price, quantity, discount, total, notes, and preparation state.
- `Payments` is append-only payment history. Payment IDs and idempotency keys prevent duplicate collection; totals on `Orders` are derived from valid payments.
- `Menu` is the only menu source of truth. Editable fields are item/category/name, price text, active, and loyalty eligibility. Price selection is revalidated server-side.
- `Business Settings` controls runtime values including `loyaltyThreshold` and `businessTimeZone`.
- `Audit Log`, `Sync Failures`, `Day History`, `Daily Receipt Files`, `Customer Summary`, and `Schema Status` are server-maintained operational records.
- `Staff.Password` is a deprecated legacy column. The backend neither returns nor writes it. Authentication credentials belong only in Firebase Authentication.

Historical voucher design-link columns may remain in the workbook for data preservation, but are ignored. Voucher codes and QR payloads are generated internally; no design-service account or OAuth flow is used.

All untrusted text is neutralized before a Sheet write to prevent formula injection. Phone values are written as text so leading zeroes survive.

## Exact live header rows

The following values preserve the observed first-row order. Parentheses and punctuation are part of the header.

- Staff: `Email`, `Password`, `Role`, `Name`, `Active`, `displayName`, `uid`, `grant`, `revoke`, `updatedAt`.
- Dashboard: `Joy Corner Staff Database`.
- Customers: `Customer ID`, `Full Name`, `Phone/WhatsApp`, `Join Date`, `Birthday`, `Favorite Drink`, `Notes`, `Active?`, `Total Orders`, `Total Spent`, `Paid Amount`, `Unpaid Balance`, `Points`, `Free Drinks`, `Last Visit`, `Current Balance`, `Paid Drinks`, `Free Drinks Ready`, `Last Visit Auto`, `phone`, `email`, `createdAt`, `updatedAt`.
- Orders: `Order Date/Time`, `Customer ID`, `Customer Name`, `Staff`, `Category`, `Item`, `Qty`, `Unit Price`, `Discount`, `Total`, `Points Earned`, `Points Redeemed`, `Payment Status`, `Order Status`, `Notes`, `orderId`, `receiptNumber`, `businessDate`, `customerPhone`, `serviceType`, `orderPlace`, `itemCount`, `itemSummary`, `itemsJson`, `categorySummary`, `subtotal`, `itemDiscountTotal`, `orderDiscount`, `paidAmount`, `remainingAmount`, `outstandingAmount`, `changeAmount`, `paymentMethod`, `clientRequestId`, `createdAt`, `customerNameSnapshot`, `customerPhoneSnapshot`, `staffUid`, `staffName`, `staffRole`, `serviceTypeMigrationDuplicate`, `orderPlaceMigrationDuplicate`, `discountTotal`, `rewardDiscount`, `tax`, `serviceCharge`, `amountReceived`, `customerNotes`, `activeBoard`, `archived`, `archivedAt`, `archiveBatchId`, `dailyPdfId`, `createdByUid`, `createdByEmail`, `updatedAt`, `amountApplied`.
- Rewards: `Customer ID`, `Customer Name`, `Phone`, `Paid Drinks`, `Free Drinks Ready`, `Next Reward Progress`, `Last Visit`, `Favorite Drink`, `Loyalty Card Winner?`, `Redeem Status`, `Winner Message`.
- Loyalty Winners: `Joy Corner Loyalty Card Winners`.
- Generated Vouchers: `Voucher Code`, `Customer ID`, `Customer Name`, `Phone`, `Favorite Drink`, `Voucher Title`, `Voucher Subtitle`, `Voucher Text`, `Voucher Reward`, `Redeem Status`, `Generated At`, `fullName`, `phoneWhatsApp`, `createdAt`, `date`.
- Reward Redemptions: `Redemption ID`, `Date`, `Customer ID`, `Customer Name`, `Free Drink Item`, `Value EGP`, `Staff`, `Notes`.
- Unpaid Tracker: `Customer ID`, `Customer Name`, `Phone`, `Unpaid Balance`, `Last Visit`, `Open Unpaid Orders`, `Action`, `Promise Date`, `Notes`, `lastUnpaidDate`.
- Menu: `Item ID`, `Category`, `Item Name`, `Flavor / Notes`, `Price Text (edit later)`, `Active`, `Loyalty Eligible`, `price`.
- Payments: `Payment Date`, `Customer ID`, `Customer Name`, `Method`, `Amount`, `Collected By`, `Related Order/Notes`, `paymentId`, `orderId`, `receiptNumber`, `businessDate`, `customerNameSnapshot`, `amountReceived`, `amountApplied`, `changeAmount`, `paymentMethod`, `paymentType`, `receivedByUid`, `receivedByName`, `createdAt`, `notes`.
- Lists: `Payment Status`, `Order Status`, `Staff`, `Payment Method`, `listType`, `value`, `active`.
- Day History: `dateKey`, `receiptCount`, `orderCount`, `paymentCount`, `redemptionCount`, `totalSales`, `totalPaid`, `totalUnpaid`, `bestSellingItem`, `bestSellingQty`, `latestReceiptSerial`, `resetAt`, `resetBy`.
- Order Items: `orderItemId`, `orderId`, `menuItemId`, `menuItemName`, `category`, `size`, `quantity`, `unitPrice`, `extrasTotal`, `lineTotal`, `notes`, `preparationStatus`, `discount`, `menuItemNameSnapshot`, `itemNotes`, `createdAt`, `updatedAt`.
- Audit Log: `auditId`, `userId`, `role`, `action`, `entityType`, `entityId`, `previousValue`, `newValue`, `reason`, `requestId`, `success`, `timestamp`, `sessionMetadata`.
- Sync Failures: `syncFailureId`, `syncJobId`, `entityType`, `entityId`, `errorMessage`, `retryCount`, `createdAt`, `resolvedAt`.
- Customer Summary: `customerId`, `fullName`, `phone`, `active`, `totalReceipts`, `totalItems`, `totalSales`, `totalPaid`, `unpaidBalance`, `paidDrinkCount`, `pointsEarned`, `pointsRedeemed`, `availablePoints`, `freeDrinksEarned`, `freeDrinksRedeemed`, `freeDrinksReady`, `firstVisit`, `lastVisit`, `averageReceipt`, `favoritePurchasedItem`, `customerStatus`.
- Daily Receipt Files: `dailyFileId`, `businessDate`, `archiveBatchId`, `fileName`, `storageProvider`, `storagePath`, `downloadUrl`, `receiptCount`, `orderItemCount`, `totalSales`, `totalPaid`, `totalRemaining`, `cashTotal`, `visaTotal`, `walletTotal`, `generatedAt`, `generatedByUid`, `generatedByName`, `generationType`, `archiveStatus`, `version`, `notes`.
- Business Settings: `settingKey`, `settingValue`, `description`.
- Schema Status: `sheetName`, `exists`, `requiredHeaders`, `missingHeaders`, `duplicateHeaders`, `rowCount`, `lastCheckedAt`, `status`.

## Normalization and field metadata

Display headers normalize to lower camel case (`Customer ID` → `customerId`, `Order Date/Time` → `orderDateTime`, `Phone/WhatsApp` → `phoneWhatsApp`). Explicit aliases in `server/sheetSchema.ts` win over mechanical normalization. IDs/codes are strings; money, quantities, counts, points, and balances are finite numbers; `active`, `archived`, `success`, and `exists` are booleans or compatible Sheet flags; fields ending in `At`, plus business/payment/order dates, are Cairo-aware date values; JSON snapshot/session fields are serialized text.

Required headers are the arrays in `server/sheets/schema.ts`. Optional historical columns are read through aliases and never required for a new write. Frontend-writable fields are explicitly allowlisted in `server/sheetSchema.ts`; everything in `calculatedColumns` or `protectedColumns` is backend-calculated. Primary identifiers are `uid`/email (Staff), `customerId`, `orderId`/`receiptNumber`/`clientRequestId`, `orderItemId`, `paymentId`, `voucherCode`, `redemptionId`, `auditId`, `syncFailureId`, `dailyFileId`/`businessDate`, `settingKey`, and `sheetName` as appropriate.
