import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ExcelJS from "exceljs";

dotenv.config({ path: [".env.local", ".env"] });

type SourceRow = { rowNumber: number; values: Record<string, unknown> };
type SourceBook = Map<string, SourceRow[]>;
type Failure = {
  legacyId: string;
  message: string;
  rowNumber: number;
  sheet: string;
};

async function main() {
  const sourceArg = process.argv.find((value) => value.startsWith("--source="));
  const apply = process.argv.includes("--apply");
  const sourcePath = sourceArg?.slice("--source=".length);

  if (!sourcePath) {
    throw new Error(
      "Usage: npm run migrate:supabase -- --source=C:\\path\\export.xlsx [--apply]",
    );
  }

  const sourceIsUrl = /^https?:\/\//i.test(sourcePath);
  const absoluteSource = sourceIsUrl ? sourcePath : path.resolve(sourcePath);
  const sourceBuffer: Buffer = sourceIsUrl
    ? await downloadBuffer(sourcePath)
    : await readFile(absoluteSource);
  const book = await readSourceBook(absoluteSource, sourceBuffer);
  // Google regenerates XLSX container metadata on every export. Hash the
  // normalized workbook content so repeated imports remain truly idempotent.
  const fingerprint = workbookFingerprint(book);
  const failures: Failure[] = [];
  const summary: Record<string, number> = {};

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${absoluteSource}`);
  console.log(`Fingerprint: ${fingerprint}`);
  for (const [sheet, rows] of book)
    console.log(`  ${sheet}: ${rows.length} data rows`);

  async function downloadBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Could not download workbook (${response.status} ${response.statusText}).`,
      );
    }
    const bytes = (await response.arrayBuffer()) as ArrayBuffer;
    return Buffer.from(bytes);
  }

  if (!apply) {
    console.log(
      "No remote data was changed. Re-run with --apply after reviewing the tab counts.",
    );
    process.exit(0);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required for --apply.",
    );
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: run, error: runError } = await client
    .from("migration_runs")
    .upsert(
      {
        source_fingerprint: fingerprint,
        source_name: sourceIsUrl
          ? `google-sheet-${fingerprint.slice(0, 12)}.xlsx`
          : path.basename(absoluteSource),
        started_at: new Date().toISOString(),
        status: "running",
        summary: {},
      },
      { onConflict: "source_name,source_fingerprint" },
    )
    .select("id")
    .single();
  if (runError || !run)
    throw runError || new Error("Migration run could not be created.");

  const customerIds = new Map<string, string>();
  const categoryIds = new Map<string, string>();
  const menuItemIds = new Map<string, string>();
  const orderIds = new Map<string, string>();

  await migrateSheet("Customers", migrateCustomer);
  await ensureReferencedCustomers();
  await migrateSheet("Menu", migrateMenu);
  await migrateSheet("Orders", migrateOrder);
  await migrateSheet("Order Items", migrateOrderItem);
  await migrateSheet("Payments", migratePayment);
  await migrateSheet("Rewards", migrateReward);
  await migrateSheet("Vouchers", migrateVoucher, ["Generated Vouchers"]);
  await inspectIgnoredStaffPasswords();

  if (failures.length) {
    const { error } = await client.from("migration_failures").insert(
      failures.map((failure) => ({
        error_code: "SOURCE_ROW_INVALID",
        error_message: failure.message,
        legacy_id: failure.legacyId || null,
        migration_run_id: run.id,
        source_row_number: failure.rowNumber,
        source_table: failure.sheet,
      })),
    );
    if (error)
      console.error(`Could not persist migration failures: ${error.message}`);
  }

  const finalStatus = failures.length ? "completed_with_errors" : "completed";
  const { error: completionError } = await client
    .from("migration_runs")
    .update({
      completed_at: new Date().toISOString(),
      status: finalStatus,
      summary,
    })
    .eq("id", run.id);
  if (completionError) throw completionError;

  console.log(`Migration ${finalStatus}. Imported/updated:`, summary);
  if (failures.length) {
    console.error(`${failures.length} rows need review:`);
    for (const failure of failures.slice(0, 30)) {
      console.error(
        `  ${failure.sheet} row ${failure.rowNumber}: ${failure.message}`,
      );
    }
    process.exitCode = 2;
  }

  async function migrateSheet(
    name: string,
    handler: (row: SourceRow) => Promise<void>,
    aliases: string[] = [],
  ) {
    const rows = findSheet(book, name, ...aliases);
    for (const row of rows) {
      if (!isImportableSourceRow(name, row)) {
        summary[`${name}RowsIgnored`] =
          (summary[`${name}RowsIgnored`] || 0) + 1;
        continue;
      }
      try {
        await handler(row);
        summary[name] = (summary[name] || 0) + 1;
      } catch (error) {
        failures.push({
          legacyId: text(
            row.values,
            "id",
            `${name.slice(0, -1)}Id`,
            "legacyId",
          ),
          message: errorMessage(error),
          rowNumber: row.rowNumber,
          sheet: name,
        });
      }
    }
  }

  async function migrateCustomer(row: SourceRow) {
    const legacyId = legacyIdFor(
      row,
      "customer",
      "id",
      "customerId",
      "legacyId",
    );
    const existing = await client
      .from("profiles")
      .select("id")
      .eq("legacy_id", legacyId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    let authUserId = existing.data?.id as string | undefined;
    if (!authUserId) {
      const suppliedEmail = text(row.values, "email").toLowerCase();
      const phone =
        normalizePhone(text(row.values, "phone", "phoneWhatsApp", "mobile")) ||
        undefined;
      // Some historical counter customers have no login contact. A confirmed,
      // non-routable migration address preserves their relational history while
      // making it clear that staff must add a real contact before account use.
      const email =
        suppliedEmail ||
        (!phone
          ? `legacy.${createHash("sha256").update(legacyId).digest("hex").slice(0, 20)}@migrated.joycorner.app`
          : undefined);
      const password = randomBytes(32).toString("base64url");
      const created = await client.auth.admin.createUser({
        email,
        email_confirm: Boolean(email),
        password,
        phone,
        phone_confirm: Boolean(phone),
        user_metadata: {
          full_name:
            text(row.values, "fullName", "name") || "Joy Corner Customer",
          phone: phone || "",
        },
      });
      if (created.error) throw created.error;
      authUserId = created.data.user.id;
    }
    const { error } = await client
      .from("profiles")
      .update({
        date_of_birth: dateValue(row.values, "dateOfBirth", "birthday"),
        favorite_drink: text(row.values, "favoriteDrink") || null,
        full_name:
          text(row.values, "fullName", "name") || "Joy Corner Customer",
        legacy_id: legacyId,
        phone:
          normalizePhone(
            text(row.values, "phone", "phoneWhatsApp", "mobile"),
          ) || null,
      })
      .eq("id", authUserId);
    if (error) throw error;
    const customerPoints = numberValue(row.values, "points", "pointsBalance");
    const customerPaidDrinks = numberValue(
      row.values,
      "paidDrinks",
      "eligiblePurchaseCount",
    );
    const customerFreeDrinks = numberValue(
      row.values,
      "freeDrinksReady",
      "freeDrinks",
    );
    const rewardsResult = await client.from("rewards_accounts").upsert(
      {
        customer_id: authUserId,
        eligible_purchase_count: Math.max(0, customerPaidDrinks),
        free_rewards_available: Math.max(0, customerFreeDrinks),
        points_balance: Math.max(0, customerPoints),
      },
      { onConflict: "customer_id" },
    );
    if (rewardsResult.error) throw rewardsResult.error;
    customerIds.set(legacyId, authUserId);
  }

  async function migrateMenu(row: SourceRow) {
    const legacyId = legacyIdFor(
      row,
      "menu",
      "id",
      "itemId",
      "menuItemId",
      "legacyId",
    );
    const categoryName = text(row.values, "category", "categoryName") || "Menu";
    let categoryId = categoryIds.get(categoryName.toLowerCase());
    if (!categoryId) {
      const category = await client
        .from("menu_categories")
        .upsert({ active: true, name: categoryName }, { onConflict: "name" })
        .select("id")
        .single();
      if (category.error) throw category.error;
      categoryId = category.data.id as string;
      categoryIds.set(categoryName.toLowerCase(), categoryId);
    }
    const originalName = required(row, "itemName", "name");
    const description = text(row.values, "description", "flavorNotes");
    const nameCollision = await client
      .from("menu_items")
      .select("legacy_id")
      .eq("category_id", categoryId)
      .ilike("name", originalName)
      .neq("legacy_id", legacyId)
      .maybeSingle();
    if (nameCollision.error) throw nameCollision.error;
    const itemName = nameCollision.data
      ? `${originalName} — ${description || legacyId}`
      : originalName;
    const sizes = extractSizes(row.values);
    const item = await client
      .from("menu_items")
      .upsert(
        {
          active: !booleanValue(row.values, "archived", "inactive"),
          available:
            sizes.length > 0 &&
            !booleanValue(row.values, "unavailable", "outOfStock"),
          base_price: numberValue(row.values, "price", "basePrice") || 0,
          category_id: categoryId,
          description,
          legacy_id: legacyId,
          loyalty_eligible: !booleanValue(row.values, "excludeFromLoyalty"),
          name: itemName,
        },
        { onConflict: "legacy_id" },
      )
      .select("id")
      .single();
    if (item.error) throw item.error;
    const itemId = item.data.id as string;
    menuItemIds.set(legacyId, itemId);
    for (const size of sizes) {
      const { error } = await client.from("menu_item_sizes").upsert(
        {
          active: true,
          legacy_id: `${legacyId}:${size.name}`,
          menu_item_id: itemId,
          price: size.price,
          size_name: size.name,
        },
        { onConflict: "legacy_id" },
      );
      if (error) throw error;
    }
  }

  async function ensureReferencedCustomers() {
    const sourceCustomers = findSheet(book, "Customers").filter((row) =>
      isImportableSourceRow("Customers", row),
    );
    const referencedRows = [
      ...findSheet(book, "Orders"),
      ...findSheet(book, "Payments"),
      ...findSheet(book, "Rewards"),
      ...findSheet(book, "Vouchers", "Generated Vouchers"),
    ].filter((row) => text(row.values, "customerId"));

    for (const reference of referencedRows) {
      const legacyId = text(reference.values, "customerId");
      if (customerIds.has(legacyId)) continue;

      const referenceName = text(reference.values, "customerName", "fullName");
      const referencePhone = normalizePhone(
        text(reference.values, "customerPhone", "phone", "phoneWhatsApp"),
      );
      const matchedSource = sourceCustomers.find((candidate) => {
        const candidateName = text(candidate.values, "fullName", "name");
        const candidatePhone = normalizePhone(
          text(candidate.values, "phone", "phoneWhatsApp", "mobile"),
        );
        return Boolean(
          (referencePhone && candidatePhone === referencePhone) ||
            (referenceName &&
              normalizeIdentity(referenceName) ===
                normalizeIdentity(candidateName)),
        );
      });
      if (matchedSource) {
        const canonicalId = text(matchedSource.values, "customerId");
        const canonicalUserId = customerIds.get(canonicalId);
        if (canonicalUserId) {
          customerIds.set(legacyId, canonicalUserId);
          summary.CustomerAliases = (summary.CustomerAliases || 0) + 1;
          continue;
        }
      }

      const existing = await client
        .from("profiles")
        .select("id")
        .eq("legacy_id", legacyId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      let userId = existing.data?.id as string | undefined;
      if (!userId) {
        const placeholderEmail = `legacy.${createHash("sha256").update(legacyId).digest("hex").slice(0, 20)}@migrated.joycorner.app`;
        const fullName = referenceName || `Archived customer ${legacyId}`;
        const created = await client.auth.admin.createUser({
          email: placeholderEmail,
          email_confirm: true,
          password: randomBytes(32).toString("base64url"),
          user_metadata: { full_name: fullName },
        });
        if (created.error) throw created.error;
        userId = created.data.user.id;
        const profile = await client
          .from("profiles")
          .update({ active: false, full_name: fullName, legacy_id: legacyId })
          .eq("id", userId);
        if (profile.error) throw profile.error;
      }
      customerIds.set(legacyId, userId);
      summary.OrphanCustomersPreserved =
        (summary.OrphanCustomersPreserved || 0) + 1;
    }
  }

  async function migrateOrder(row: SourceRow) {
    const legacyId = legacyIdFor(
      row,
      "order",
      "id",
      "orderId",
      "receiptId",
      "legacyId",
    );
    const customerLegacyId = text(row.values, "customerId");
    const customerId = customerLegacyId
      ? await resolveId(client, "profiles", customerLegacyId, customerIds)
      : null;
    const subtotal = numberValue(
      row.values,
      "subtotal",
      "receiptSubtotal",
      "total",
    );
    const discount = numberValue(
      row.values,
      "discountTotal",
      "receiptDiscountAmount",
    );
    const voucherDiscount = numberValue(row.values, "voucherDiscount");
    const tax = numberValue(row.values, "taxTotal", "tax");
    const status = normalizeStatus(text(row.values, "status", "orderStatus"));
    const confirmation =
      status === "pending_confirmation"
        ? "pending"
        : status === "rejected"
          ? "rejected"
          : status === "cancelled"
            ? "cancelled"
            : "confirmed";
    const result = await client
      .from("orders")
      .upsert(
        {
          confirmation_status: confirmation,
          created_at: dateTimeValue(
            row.values,
            "createdAt",
            "orderDateTime",
            "date",
          ),
          customer_id: customerId,
          customer_notes: text(row.values, "customerNotes", "notes"),
          discount_total: discount,
          idempotency_key: `migration:${fingerprint}:${legacyId}`,
          kitchen_visible: [
            "confirmed",
            "accepted",
            "preparing",
            "ready",
            "picked_up",
          ].includes(status),
          legacy_id: legacyId,
          order_number:
            text(row.values, "orderNumber", "receiptNumber") ||
            `LEGACY-${legacyId}`,
          payment_method: normalizePaymentMethod(
            text(row.values, "paymentMethod"),
          ),
          payment_status: normalizePaymentStatus(
            text(row.values, "paymentStatus"),
          ),
          pickup_name:
            text(row.values, "pickupName", "customerName") || "Legacy customer",
          source: "migration",
          status,
          subtotal,
          tax_total: tax,
          total: Math.max(0, subtotal - discount - voucherDiscount + tax),
          voucher_discount: voucherDiscount,
        },
        { onConflict: "legacy_id" },
      )
      .select("id")
      .single();
    if (result.error) throw result.error;
    orderIds.set(legacyId, result.data.id as string);
    const receiptNumber = text(row.values, "receiptNumber", "orderNumber");
    if (receiptNumber) orderIds.set(receiptNumber, result.data.id as string);
  }

  async function migrateOrderItem(row: SourceRow) {
    const legacyId = legacyIdFor(
      row,
      "order-item",
      "id",
      "orderItemId",
      "legacyId",
    );
    const orderLegacyId = required(
      row,
      "orderId",
      "receiptId",
      "receiptNumber",
    );
    const orderId = await resolveOrCreateLegacyOrder(orderLegacyId, row);
    const menuLegacyId = text(row.values, "menuItemId", "itemId");
    const menuItemId = menuLegacyId
      ? await resolveOptionalId(client, "menu_items", menuLegacyId, menuItemIds)
      : null;
    const quantity = Math.max(1, numberValue(row.values, "quantity", "qty"));
    const unitPrice = numberValue(row.values, "unitPrice", "price");
    const extrasTotal = numberValue(
      row.values,
      "extrasTotal",
      "modifiersTotal",
    );
    const { error } = await client.from("order_items").upsert(
      {
        category_name_snapshot:
          text(row.values, "category", "categoryName") || "Legacy",
        customer_notes: text(row.values, "itemNotes", "notes"),
        item_name_snapshot:
          text(row.values, "menuItemNameSnapshot", "menuItemName", "item") ||
          "Legacy item",
        legacy_id: legacyId,
        loyalty_eligible: !booleanValue(row.values, "excludeFromLoyalty"),
        menu_item_id: menuItemId,
        modifiers_total: extrasTotal,
        order_id: orderId,
        preparation_notes: text(row.values, "preparationNotes"),
        quantity,
        size_name: text(row.values, "size") || "Regular",
        total_price: quantity * (unitPrice + extrasTotal),
        unit_price: unitPrice,
      },
      { onConflict: "legacy_id" },
    );
    if (error) throw error;
    if (orderLegacyId.startsWith("order-")) {
      const totals = await client
        .from("order_items")
        .select("total_price")
        .eq("order_id", orderId);
      if (totals.error) throw totals.error;
      const subtotal = (totals.data || []).reduce(
        (sum, item) => sum + Number(item.total_price || 0),
        0,
      );
      const updated = await client
        .from("orders")
        .update({ subtotal, total: subtotal })
        .eq("id", orderId)
        .like("idempotency_key", `migration:${fingerprint}:orphan-order:%`);
      if (updated.error) throw updated.error;
    }
  }

  async function resolveOrCreateLegacyOrder(
    legacyId: string,
    row: SourceRow,
  ): Promise<string> {
    try {
      return await resolveId(client, "orders", legacyId, orderIds, [
        "order_number",
      ]);
    } catch (error) {
      if (!errorMessage(error).includes("was not imported")) throw error;
    }
    const orderNumber = legacyId.startsWith("order-")
      ? legacyId.slice("order-".length)
      : `LEGACY-${createHash("sha256").update(legacyId).digest("hex").slice(0, 12).toUpperCase()}`;
    const orphan = await client
      .from("orders")
      .upsert(
        {
          confirmation_status: "confirmed",
          created_at: dateTimeValue(row.values, "createdAt", "date"),
          customer_notes: "Order reconstructed from orphaned legacy item rows.",
          idempotency_key: `migration:${fingerprint}:orphan-order:${legacyId}`,
          kitchen_visible: false,
          legacy_id: legacyId,
          order_number: orderNumber,
          payment_status: "unpaid",
          pickup_name: "Archived legacy order",
          source: "migration",
          status: "closed",
          subtotal: 0,
          total: 0,
        },
        { onConflict: "legacy_id" },
      )
      .select("id")
      .single();
    if (orphan.error) throw orphan.error;
    const id = String(orphan.data.id);
    orderIds.set(legacyId, id);
    summary.OrphanOrdersReconstructed =
      (summary.OrphanOrdersReconstructed || 0) + 1;
    return id;
  }

  async function migratePayment(row: SourceRow) {
    const legacyId = legacyIdFor(row, "payment", "id", "paymentId", "legacyId");
    const amount = numberValue(
      row.values,
      "amount",
      "paidAmount",
      "amountPaid",
    );
    if (amount <= 0)
      throw new Error("Payment amount must be greater than zero.");
    const orderLegacyId = text(
      row.values,
      "orderId",
      "receiptId",
      "receiptNumber",
    );
    let orderId: string;
    if (orderLegacyId) {
      orderId = await resolveId(client, "orders", orderLegacyId, orderIds, [
        "order_number",
      ]);
    } else {
      // The original Payments tab allowed standalone counter collections. The
      // normalized schema requires every payment to belong to an order, so keep
      // the transaction as a closed migration-only settlement order.
      const settlementLegacyId = `settlement:${legacyId}`;
      const customerLegacyId = text(row.values, "customerId");
      const customerId = customerLegacyId
        ? await resolveOptionalId(
            client,
            "profiles",
            customerLegacyId,
            customerIds,
          )
        : null;
      const settlement = await client
        .from("orders")
        .upsert(
          {
            confirmation_status: "confirmed",
            created_at: dateTimeValue(
              row.values,
              "createdAt",
              "paymentDate",
              "date",
            ),
            customer_id: customerId,
            customer_notes:
              text(row.values, "relatedOrderNotes", "notes") ||
              "Imported standalone payment",
            idempotency_key: `migration:${fingerprint}:order:${settlementLegacyId}`,
            kitchen_visible: false,
            legacy_id: settlementLegacyId,
            order_number: `LEGACY-PAY-${createHash("sha256").update(legacyId).digest("hex").slice(0, 12).toUpperCase()}`,
            payment_method: normalizePaymentMethod(
              text(row.values, "paymentMethod", "method"),
            ),
            payment_status: "paid",
            pickup_name: text(row.values, "customerName") || "Legacy payment",
            source: "migration",
            status: "closed",
            subtotal: amount,
            total: amount,
          },
          { onConflict: "legacy_id" },
        )
        .select("id")
        .single();
      if (settlement.error) throw settlement.error;
      orderId = String(settlement.data.id);
      orderIds.set(settlementLegacyId, orderId);
    }
    const { error } = await client.from("payments").upsert(
      {
        amount,
        created_at: dateTimeValue(
          row.values,
          "createdAt",
          "paymentDate",
          "date",
        ),
        idempotency_key: `migration:${fingerprint}:payment:${legacyId}`,
        legacy_id: legacyId,
        order_id: orderId,
        payment_method:
          normalizePaymentMethod(text(row.values, "paymentMethod", "method")) ||
          "cash_at_cashier",
        payment_number:
          text(row.values, "paymentNumber") || `LEGACY-PAY-${legacyId}`,
        reference: text(row.values, "reference", "transactionId") || null,
        status: booleanValue(row.values, "failed", "void")
          ? "failed"
          : "confirmed",
      },
      { onConflict: "legacy_id" },
    );
    if (error) throw error;
  }

  async function migrateReward(row: SourceRow) {
    const customerLegacyId = required(row, "customerId", "id");
    const customerId = await resolveId(
      client,
      "profiles",
      customerLegacyId,
      customerIds,
    );
    const rewardValues: Record<string, unknown> = {
      customer_id: customerId,
      eligible_purchase_count: Math.max(
        0,
        numberValue(
          row.values,
          "eligiblePurchaseCount",
          "paidDrinks",
          "purchases",
          "stamps",
        ),
      ),
      free_rewards_available: Math.max(
        0,
        numberValue(
          row.values,
          "freeRewards",
          "freeDrinksReady",
          "rewardsAvailable",
        ),
      ),
    };
    const pointsText = text(row.values, "points", "pointsBalance");
    if (pointsText) {
      rewardValues.points_balance = Math.max(
        0,
        numberValue(row.values, "points", "pointsBalance"),
      );
    }
    const { error } = await client
      .from("rewards_accounts")
      .upsert(rewardValues, { onConflict: "customer_id" });
    if (error) throw error;
  }

  async function migrateVoucher(row: SourceRow) {
    const legacyId = legacyIdFor(
      row,
      "voucher",
      "id",
      "voucherId",
      "voucherCode",
      "legacyId",
    );
    const customerLegacyId = required(row, "customerId");
    const customerId = await resolveId(
      client,
      "profiles",
      customerLegacyId,
      customerIds,
    );
    const fixed = numberValue(row.values, "fixedValue", "value", "amount");
    const percentage = numberValue(row.values, "percentageValue", "percentage");
    let voucherType: "percentage" | "fixed" | "loyalty_free_drink" =
      percentage > 0 ? "percentage" : "fixed";
    let freeItemId: string | null = null;
    if (!fixed && !percentage) {
      voucherType = "loyalty_free_drink";
      const favoriteDrink = text(row.values, "favoriteDrink", "freeDrinkItem");
      if (!favoriteDrink)
        throw new Error("Free-drink voucher has no item name.");
      if (normalizeKey(favoriteDrink) !== "drink") {
        const found = await client
          .from("menu_items")
          .select("id,active,available,loyalty_eligible,base_price,created_at")
          .ilike("name", favoriteDrink)
          .order("active", { ascending: false })
          .order("available", { ascending: false })
          .order("loyalty_eligible", { ascending: false })
          .order("base_price", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (found.error) throw found.error;
        if (!found.data)
          throw new Error(
            `Free-drink menu item '${favoriteDrink}' was not found.`,
          );
        freeItemId = String(found.data.id);
      }
    }
    const { error } = await client.from("vouchers").upsert(
      {
        customer_id: customerId,
        expires_at: dateTimeValue(
          row.values,
          "expiresAt",
          "expiryDate",
          "validUntil",
          true,
        ),
        fixed_value: fixed || null,
        free_item_id: freeItemId,
        legacy_id: legacyId,
        percentage_value: percentage || null,
        status: normalizeVoucherStatus(text(row.values, "status")),
        voucher_code: required(row, "voucherCode", "code").toUpperCase(),
        voucher_type: voucherType,
      },
      { onConflict: "legacy_id" },
    );
    if (error) throw error;
  }

  async function inspectIgnoredStaffPasswords() {
    const staffRows = findSheet(book, "Staff", "Staff Users");
    if (!staffRows.length) return;
    const rowsWithPassword = staffRows.filter((row) =>
      Boolean(text(row.values, "password")),
    ).length;
    summary.StaffAccountsSkipped = staffRows.length;
    if (rowsWithPassword) {
      console.warn(
        `Skipped ${rowsWithPassword} legacy staff password values. Create or invite staff through Supabase Auth; passwords are never migrated.`,
      );
    }
  }

  async function readSourceBook(
    filename: string,
    contents: Buffer,
  ): Promise<SourceBook> {
    const workbook = new ExcelJS.Workbook();
    if (path.extname(filename).toLowerCase() === ".csv") {
      await workbook.csv.readFile(filename);
    } else {
      // ExcelJS still publishes a pre-generic Node Buffer declaration. The bytes
      // are a real Node Buffer; this cast only bridges that type-definition gap.
      await workbook.xlsx.load(contents as never);
    }
    const result: SourceBook = new Map();
    workbook.eachSheet((sheet) => {
      const headerRow = sheet.getRow(1);
      const headers = headerRow.values as unknown[];
      const rows: SourceRow[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values: Record<string, unknown> = {};
        for (let column = 1; column < headers.length; column += 1) {
          const header = normalizeKey(cellValue(headers[column]));
          if (header) values[header] = cellValue(row.getCell(column).value);
        }
        if (
          Object.values(values).some((value) => value !== "" && value != null)
        )
          rows.push({ rowNumber, values });
      });
      result.set(sheet.name, rows);
    });
    return result;
  }

  function findSheet(
    bookValue: SourceBook,
    requested: string,
    ...aliases: string[]
  ): SourceRow[] {
    const accepted = new Set([requested, ...aliases].map(normalizeKey));
    for (const [name, rows] of bookValue)
      if (accepted.has(normalizeKey(name))) return rows;
    return [];
  }

  function cellValue(value: unknown): unknown {
    if (value instanceof Date) return value;
    if (value && typeof value === "object" && "text" in value)
      return cellValue((value as { text: unknown }).text);
    if (value && typeof value === "object" && "formula" in value)
      return "result" in value
        ? cellValue((value as { result: unknown }).result)
        : "";
    if (value && typeof value === "object") return "";
    return value ?? "";
  }

  function workbookFingerprint(bookValue: SourceBook) {
    const canonical = [...bookValue.entries()].map(([sheet, rows]) => [
      sheet,
      rows.map((row) => [row.rowNumber, row.values]),
    ]);
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  }

  function isImportableSourceRow(sheet: string, row: SourceRow) {
    switch (sheet) {
      case "Customers":
        return Boolean(text(row.values, "customerId"));
      case "Menu":
        return Boolean(
          text(row.values, "itemId", "menuItemId") &&
            text(row.values, "itemName", "name"),
        );
      case "Orders":
        return Boolean(
          text(row.values, "orderId", "receiptNumber") ||
            (text(row.values, "orderDateTime", "createdAt", "date") &&
              text(row.values, "item", "itemSummary")),
        );
      case "Order Items":
        return Boolean(
          text(row.values, "orderItemId", "id") &&
            text(row.values, "orderId", "receiptNumber"),
        );
      case "Payments":
        return Boolean(
          text(row.values, "amount", "paidAmount", "amountPaid") &&
            text(row.values, "paymentDate", "createdAt", "date"),
        );
      case "Rewards":
        return Boolean(text(row.values, "customerId", "id"));
      case "Vouchers":
        return Boolean(
          text(row.values, "voucherCode", "code") &&
            text(row.values, "customerId"),
        );
      default:
        return true;
    }
  }

  function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object") {
      const candidate = error as {
        code?: unknown;
        details?: unknown;
        message?: unknown;
      };
      return (
        [candidate.message, candidate.details, candidate.code]
          .filter(Boolean)
          .map(String)
          .join(" | ") || JSON.stringify(error)
      );
    }
    return String(error);
  }

  function normalizeKey(value: unknown) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }
  function text(values: Record<string, unknown>, ...aliases: string[]) {
    for (const alias of aliases) {
      const value = values[normalizeKey(alias)];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
  }
  function required(row: SourceRow, ...aliases: string[]) {
    const value = text(row.values, ...aliases);
    if (!value) throw new Error(`Missing ${aliases[0]}.`);
    return value;
  }
  function legacyIdFor(row: SourceRow, prefix: string, ...aliases: string[]) {
    return (
      text(row.values, ...aliases) ||
      `${prefix}:${fingerprint.slice(0, 12)}:${row.rowNumber}`
    );
  }
  function numberValue(values: Record<string, unknown>, ...aliases: string[]) {
    const raw = text(values, ...aliases).replace(/[^0-9.-]/g, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }
  function booleanValue(values: Record<string, unknown>, ...aliases: string[]) {
    return ["true", "yes", "1", "y"].includes(
      text(values, ...aliases).toLowerCase(),
    );
  }
  function normalizePhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 11 && digits.startsWith("01"))
      return `+20${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith("1")) return `+20${digits}`;
    if (digits.length === 12 && digits.startsWith("20")) return `+${digits}`;
    if (/^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
    return "";
  }
  function normalizeIdentity(value: string) {
    return value
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]/gu, "");
  }
  function dateValue(values: Record<string, unknown>, ...aliases: string[]) {
    const value = dateTimeValue(values, ...aliases, true);
    return value?.slice(0, 10) || null;
  }
  function dateTimeValue(
    values: Record<string, unknown>,
    ...args: Array<string | boolean>
  ): string | null {
    const allowNull = args.at(-1) === true;
    const aliases = args.filter(
      (value): value is string => typeof value === "string",
    );
    const raw = aliases
      .map((alias) => values[normalizeKey(alias)])
      .find((value) => value != null && value !== "");
    if (!raw) return allowNull ? null : new Date().toISOString();
    const parsed =
      raw instanceof Date
        ? raw
        : typeof raw === "number" && raw > 1
          ? new Date(Math.round((raw - 25569) * 86400 * 1000))
          : new Date(String(raw));
    if (Number.isNaN(parsed.getTime()))
      return allowNull ? null : new Date().toISOString();
    return parsed.toISOString();
  }
  function extractSizes(values: Record<string, unknown>) {
    const result: Array<{ name: string; price: number }> = [];
    for (const [name, aliases] of [
      ["Small", ["smallPrice", "small"]],
      ["Medium", ["mediumPrice", "medium"]],
      ["Large", ["largePrice", "large"]],
    ] as const) {
      const price = numberValue(values, ...aliases);
      if (price > 0) result.push({ name, price });
    }
    if (!result.length) {
      const listedPrices = text(
        values,
        "priceText",
        "priceTextEditLater",
        "prices",
      )
        .match(/\d+(?:[.,]\d+)?/g)
        ?.map((value) => Number(value.replace(",", ".")))
        .filter((value) => Number.isFinite(value) && value > 0);
      const labels =
        listedPrices?.length === 1
          ? ["Regular"]
          : listedPrices?.length === 2
            ? ["Small", "Medium"]
            : listedPrices?.length === 3
              ? ["Small", "Medium", "Large"]
              : (listedPrices || []).map((_, index) => `Size ${index + 1}`);
      for (const [index, price] of (listedPrices || []).entries()) {
        result.push({ name: labels[index] || `Size ${index + 1}`, price });
      }
    }
    if (!result.length) {
      const price = numberValue(values, "price", "basePrice");
      if (price > 0)
        result.push({ name: text(values, "size") || "Regular", price });
    }
    return result;
  }
  function normalizeStatus(value: string) {
    const key = normalizeKey(value);
    const map: Record<string, string> = {
      requested: "pending_confirmation",
      pending: "pending_confirmation",
      pendingconfirmation: "pending_confirmation",
      confirmed: "confirmed",
      accepted: "accepted",
      preparing: "preparing",
      ready: "ready",
      pickedup: "picked_up",
      open: "confirmed",
      submitted: "confirmed",
      done: "closed",
      closed: "closed",
      rejected: "rejected",
      cancelled: "cancelled",
      canceled: "cancelled",
    };
    return map[key] || "closed";
  }
  function normalizePaymentStatus(value: string) {
    const key = normalizeKey(value);
    return key === "paid"
      ? "paid"
      : key.includes("partial")
        ? "partially_paid"
        : key === "refunded"
          ? "refunded"
          : "unpaid";
  }
  function normalizePaymentMethod(value: string) {
    const key = normalizeKey(value);
    if (!key) return null;
    if (key.includes("bank") || key.includes("transfer"))
      return "manual_transfer";
    if (key.includes("wallet") || key.includes("instapay")) return "instapay";
    if (key.includes("card") || key.includes("visa")) return "card_at_branch";
    return "cash_at_cashier";
  }
  function normalizeVoucherStatus(value: string) {
    const key = normalizeKey(value);
    return ["reserved", "redeemed", "expired", "cancelled"].includes(key)
      ? key
      : "active";
  }
  async function resolveId(
    supabase: SupabaseClient,
    table: string,
    legacyId: string,
    cache: Map<string, string>,
    alternateColumns: string[] = [],
  ): Promise<string> {
    const cached = cache.get(legacyId);
    if (cached) return cached;
    let result = await supabase
      .from(table)
      .select("id")
      .eq("legacy_id", legacyId)
      .maybeSingle();
    if (!result.data && !result.error) {
      for (const column of alternateColumns) {
        result = await supabase
          .from(table)
          .select("id")
          .eq(column, legacyId)
          .maybeSingle();
        if (result.data || result.error) break;
      }
    }
    if (result.error) throw result.error;
    if (!result.data)
      throw new Error(`${table} legacy ID ${legacyId} was not imported.`);
    const id = String(result.data.id);
    cache.set(legacyId, id);
    return id;
  }

  async function resolveOptionalId(
    supabase: SupabaseClient,
    table: string,
    legacyId: string,
    cache: Map<string, string>,
  ): Promise<string | null> {
    try {
      return await resolveId(supabase, table, legacyId, cache);
    } catch {
      return null;
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
