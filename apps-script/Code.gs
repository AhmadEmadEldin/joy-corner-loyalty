const SPREADSHEET_ID = "1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8";

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
};

const ROLE_ACTIONS = {
  barista: ["appData", "getAppData", "markReceiptDone"],
  waiter: [
    "appData",
    "getAppData",
    "addOrder",
    "addReceipt",
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
    "collectUnpaidPayment",
    "updateReceiptPayment",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "updateVoucherCanvaLink",
  ],
  owner: ["*"],
};

// Rewards: number of paid eligible drinks required for a free drink
const REWARD_THRESHOLD = 5;

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "");

  if (action) {
    return jsonResponse(handleAction_(action, e.parameter || {}));
  }

  return jsonResponse({
    success: true,
    service: "Joy Corner Google Sheets API",
    message: "Use the React frontend. Add ?action=appData to read sheet data.",
    generatedAt: new Date().toISOString(),
  });
}

function doPost(e) {
  const body = parsePostBody_(e);
  const action = String(body.action || "");
  return jsonResponse(handleAction_(action, body));
}

function getAppData() {
  return buildAppData_();
}

function addCustomer(payload) {
  const sheet = getSheet_(SHEETS.customers);
  const nextId = nextId_("CUST", sheet, 1);
  const now = new Date();

  writeObjectRow_(SHEETS.customers, {
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

  SpreadsheetApp.flush();
  return success_({ customerId: nextId, data: buildAppData_() });
}

function addOrder(payload) {
  const customerId = getPayloadCustomerId_(payload);
  const item = findMenuItem_(payload.itemId, payload.itemName);
  const qty = Number(payload.qty || 1);
  const unitPrice = Number(
    payload.unitPrice ||
      parsePrice_(
        item.priceText ||
          item.priceTextEditLater ||
          item["priceTextEditLater)"],
      ) ||
      0,
  );
  const discount = Number(payload.discount || 0);
  const total = Math.max(0, qty * unitPrice - discount);
  const paymentStatus = clean_(payload.paymentStatus || "Paid");
  const orderStatus = paymentStatus === "Paid" ? "Closed" : "Open";
  const paidAmount =
    paymentStatus === "Partial" ? Number(payload.paidAmount || 0) : total;
  const notes = orderNotes_(payload.notes, paymentStatus, paidAmount);
  const pointsEarned =
    item.loyaltyEligible === "Yes" ? Math.floor(total / 10) : 0;
  const customer = findCustomer_(customerId);
  const customerName =
    customer.fullName || customer.customerName || clean_(payload.customerName);

  writeDataRow_(SHEETS.orders, [
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

  if (paymentStatus === "Paid" || paymentStatus === "Partial") {
    if (paidAmount > 0) {
      addPayment({
        customerId,
        customerName,
        method: payload.paymentMethod || "Cash",
        amount: paidAmount,
        collectedBy: payload.staff || "Cashier 1",
        notes: item.itemName || payload.itemName,
      });
    }
  }

  SpreadsheetApp.flush();
  return success_({ data: buildAppData_() });
}

function addReceipt(payload) {
  const receiptCustomer = getOrCreateReceiptCustomer_(payload);
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
  const receiptId = createReceiptId_(customerId);

  if (!items.length) throw new Error("Receipt has no items.");

  let receiptTotal = 0;
  let remainingPaidAmount =
    paymentStatus === "Partial" ? Number(payload.paidAmount || 0) : 0;
  const writtenItems = [];

  items.forEach((receiptItem) => {
    const item = findMenuItem_(receiptItem.itemId, receiptItem.itemName);
    const qty = Number(receiptItem.qty || 1);
    const unitPrice = Number(
      receiptItem.unitPrice ||
        parsePrice_(
          item.priceText ||
            item.priceTextEditLater ||
            item["priceTextEditLater)"],
        ) ||
        0,
    );
    const discount = Number(receiptItem.discount || 0);
    const total = Math.max(0, qty * unitPrice - discount);
    const orderStatus = paymentStatus === "Paid" ? "Closed" : "Open";
    const rowPaidAmount =
      paymentStatus === "Paid"
        ? total
        : Math.min(total, Math.max(0, remainingPaidAmount));
    const receiptNotes = [orderPlace ? `Place: ${orderPlace}` : "", notes, `Receipt: ${receiptId}`]
      .filter(Boolean)
      .join(" | ");
    const rowNotes = orderNotes_(receiptNotes, paymentStatus, rowPaidAmount);
    const pointsEarned =
      item.loyaltyEligible === "Yes" ? Math.floor(total / 10) : 0;

    writeDataRow_(SHEETS.orders, [
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
    writtenItems.push(item.itemName || receiptItem.itemName || "Item");
  });

  if (paymentStatus === "Paid" || paymentStatus === "Partial") {
    const paidAmount =
      paymentStatus === "Partial"
        ? Number(payload.paidAmount || 0)
        : receiptTotal;

    if (paidAmount > 0) {
      writeDataRow_(SHEETS.payments, [
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

  SpreadsheetApp.flush();
  return success_({
    receiptId,
    receiptTotal,
    itemCount: items.length,
    data: buildAppData_(),
  });
}

function addPayment(payload) {
  const customerId = getPayloadCustomerId_(payload);
  const customer = findCustomer_(customerId);

  writeDataRow_(SHEETS.payments, [
    new Date(),
    customerId,
    customer.fullName || clean_(payload.customerName),
    clean_(payload.method || "Cash"),
    Number(payload.amount || 0),
    clean_(payload.collectedBy || "Cashier 1"),
    clean_(payload.notes),
  ]);

  SpreadsheetApp.flush();
  return success_({ data: buildAppData_() });
}

function collectUnpaidPayment(payload) {
  const customerId = getPayloadCustomerId_(payload);
  const amount = Number(payload.amount || payload.paidAmount || 0);
  const method = clean_(payload.method || payload.paymentMethod || "Cash");
  const collectedBy = clean_(payload.collectedBy || payload.staff || "Cashier 1");

  if (!customerId) throw new Error("Customer ID is required.");
  if (amount <= 0) throw new Error("Payment amount must be greater than 0.");

  const customer = findCustomer_(customerId);
  const closedOrders = closeUnpaidOrders_(customerId, amount);

  writeDataRow_(SHEETS.payments, [
    new Date(),
    customerId,
    customer.fullName || clean_(payload.customerName),
    method,
    amount,
    collectedBy,
    `Collected unpaid balance. Closed: ${closedOrders.join(", ") || "partial only"}`,
  ]);

  SpreadsheetApp.flush();
  return success_({ closedOrders, data: buildAppData_() });
}

function updateReceiptPayment(payload) {
  const paymentStatus = clean_(payload.paymentStatus || "Paid");
  if (!["Paid", "Unpaid"].includes(paymentStatus)) {
    throw new Error("Payment status must be Paid or Unpaid.");
  }

  const result = updateReceiptRows_(payload, (context) => {
    context.sheet.getRange(context.row, context.statusIndex + 1).setValue(paymentStatus);

    if (context.orderStatusIndex >= 0 && !isPickedUpStatus_(context.currentOrderStatus)) {
      context.sheet
        .getRange(context.row, context.orderStatusIndex + 1)
        .setValue(paymentStatus === "Paid" ? "Closed" : "Open");
    }

    if (context.notesIndex >= 0) {
      const note = `Payment changed to ${paymentStatus} on ${new Date().toLocaleString()}`;
      context.sheet
        .getRange(context.row, context.notesIndex + 1)
        .setValue(context.notes ? `${context.notes} | ${note}` : note);
    }
  });

  if (paymentStatus === "Paid" && result.newlyPaidTotal > 0) {
    writeDataRow_(SHEETS.payments, [
      new Date(),
      result.customerId,
      result.customerName,
      clean_(payload.paymentMethod || payload.method || "Cash"),
      result.newlyPaidTotal,
      clean_(payload.staff || payload.collectedBy || "Cashier 1"),
      `Receipt paid: ${result.itemNames.join(", ")}`,
    ]);
  }

  SpreadsheetApp.flush();
  return success_({ updatedRows: result.updatedRows, data: buildAppData_() });
}

function markReceiptDone(payload) {
  const result = updateReceiptRows_(payload, (context) => {
    if (context.orderStatusIndex >= 0) {
      context.sheet.getRange(context.row, context.orderStatusIndex + 1).setValue("Picked Up");
    }

    if (context.notesIndex >= 0) {
      const note = `Picked up by barista on ${new Date().toLocaleString()}`;
      context.sheet
        .getRange(context.row, context.notesIndex + 1)
        .setValue(context.notes ? `${context.notes} | ${note}` : note);
    }
  });

  SpreadsheetApp.flush();
  return success_({ updatedRows: result.updatedRows, data: buildAppData_() });
}

function generateVoucher(payload) {
  const customerId = getPayloadCustomerId_(payload);
  const customer = findCustomer_(customerId);
  const favoriteDrink =
    clean_(payload.favoriteDrink) || getFavoriteDrink_(customer) || "Drink";
  const customerName =
    getCustomerName_(customer) || clean_(payload.customerName);
  const voucherCode = createVoucherCode_(customerId);

  writeObjectRow_(SHEETS.generatedVouchers, {
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

  SpreadsheetApp.flush();
  return success_({ voucherCode, data: buildAppData_() });
}

function redeemVoucher(payload) {
  const voucherCode = clean_(payload.voucherCode);
  if (!voucherCode) throw new Error("Voucher code is required.");

  const sheet = getSheet_(SHEETS.generatedVouchers);
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(normalizeKey_);
  const codeIndex = headerIndex_(header, ["voucherCode", "code", "id"]);
  const statusIndex = headerIndex_(header, ["redeemStatus", "status"]);
  if (codeIndex < 0 || statusIndex < 0) {
    throw new Error("Generated Vouchers sheet needs Voucher Code and Redeem Status columns.");
  }

  for (let row = 1; row < values.length; row += 1) {
    if (String(values[row][codeIndex]).trim() === voucherCode) {
      sheet.getRange(row + 1, statusIndex + 1).setValue("Redeemed");
      appendRedemption_(values[row], header, payload);
      return success_({ data: buildAppData_() });
    }
  }

  throw new Error(`Voucher not found: ${voucherCode}`);
}

function updateVoucherCanvaLink(payload) {
  const voucherCode = clean_(payload.voucherCode);
  const canvaLink = clean_(payload.canvaLink);
  if (!voucherCode || !canvaLink) {
    throw new Error("Voucher code and Canva link are required.");
  }

  const sheet = getSheet_(SHEETS.generatedVouchers);
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(normalizeKey_);
  const codeIndex = headerIndex_(header, ["voucherCode", "code", "id"]);
  const statusIndex = headerIndex_(header, ["canvaStatus"]);
  const linkIndex = headerIndex_(header, ["canvaLink", "link"]);
  if (codeIndex < 0 || statusIndex < 0 || linkIndex < 0) {
    throw new Error("Generated Vouchers sheet needs Voucher Code, Canva Status, and Canva Link columns.");
  }

  for (let row = 1; row < values.length; row += 1) {
    if (String(values[row][codeIndex]).trim() === voucherCode) {
      sheet.getRange(row + 1, statusIndex + 1).setValue("Created");
      sheet.getRange(row + 1, linkIndex + 1).setValue(canvaLink);
      return success_({ data: buildAppData_() });
    }
  }

  throw new Error(`Voucher not found: ${voucherCode}`);
}

function handleAction_(action, payload) {
  try {
    const actor = authorizeAction_(action, payload || {});

    switch (action) {
      case "appData":
      case "getAppData":
        return success_({ data: buildAppDataForRole_(actor.role) });
      case "addCustomer":
        return addCustomer(payload);
      case "addOrder":
        return addOrder(payload);
      case "addReceipt":
        return addReceipt(payload);
      case "addPayment":
        return addPayment(payload);
      case "collectUnpaidPayment":
        return collectUnpaidPayment(payload);
      case "updateReceiptPayment":
        return updateReceiptPayment(payload);
      case "markReceiptDone":
        return markReceiptDone(payload);
      case "generateVoucher":
        return generateVoucher(payload);
      case "redeemVoucher":
        return redeemVoucher(payload);
      case "updateVoucherCanvaLink":
        return updateVoucherCanvaLink(payload);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : String(error),
    };
  }
}

function buildAppData_() {
  const rawCustomers = sheetToObjects_(SHEETS.customers, 1);
  const orders = sheetToObjects_(SHEETS.orders, 1)
    .map(enrichOrder_)
    .reverse();
  const payments = sheetToObjects_(SHEETS.payments, 1);
  const vouchers = sheetToObjects_(SHEETS.generatedVouchers, 1)
    .map(enrichVoucher_)
    .reverse();
  const redemptions = sheetToObjects_(SHEETS.rewardRedemptions, 1);
  const menu = sheetToObjects_(SHEETS.menu, 1)
    .filter((row) => row.itemId && row.active !== "No")
    .map(enrichMenuItem_);
  const lists = listOptions_();
  lists.orderPlace = buildOrderPlaceOptions_(orders, lists);
  const unpaid = buildUnpaidTracker_(rawCustomers, orders, payments);
  const customers = enrichCustomers_(rawCustomers, orders, unpaid);
  const rewards = buildRewards_(customers, orders, vouchers);
  const winners = rewards.filter((reward) => number_(reward.freeDrinksReady) > 0);
  const dashboardOrders = buildDashboardOrders_(orders);
  const dashboardTopItems = buildDashboardTopItems_(orders);
  const dashboard = buildDashboard_(
    customers,
    orders,
    payments,
    rewards,
    winners,
    unpaid,
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
    generatedAt: new Date().toISOString(),
  };
}

function buildAppDataForRole_(role) {
  const data = buildAppData_();

  if (role !== "barista" && role !== "waiter") {
    return data;
  }

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

function authorizeAction_(action, payload) {
  const apiKey = clean_(
    PropertiesService.getScriptProperties().getProperty("FIREBASE_WEB_API_KEY"),
  );

  if (!apiKey) {
    return { role: "owner", email: "local-preview", uid: "local-preview" };
  }

  const user = verifyFirebaseUser_(clean_(payload.idToken), apiKey);
  const role = staffRoleForEmail_(user.email);
  const allowed = ROLE_ACTIONS[role] || [];

  if (!allowed.includes("*") && !allowed.includes(action)) {
    throw new Error(`Role ${role} cannot run action ${action}.`);
  }

  return Object.assign({}, user, { role });
}

function verifyFirebaseUser_(idToken, apiKey) {
  if (!idToken) throw new Error("Sign in is required.");

  const response = UrlFetchApp.fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      contentType: "application/json",
      method: "post",
      muteHttpExceptions: true,
      payload: JSON.stringify({ idToken }),
    },
  );
  const data = JSON.parse(response.getContentText() || "{}");

  if (response.getResponseCode() >= 300 || !data.users || !data.users.length) {
    throw new Error("Firebase sign-in could not be verified.");
  }

  return {
    email: clean_(data.users[0].email).toLowerCase(),
    uid: clean_(data.users[0].localId),
  };
}

function staffRoleForEmail_(email) {
  const ownerEmails = clean_(
    PropertiesService.getScriptProperties().getProperty("FIREBASE_OWNER_EMAILS"),
  )
    .split(",")
    .map((value) => clean_(value).toLowerCase())
    .filter(Boolean);

  if (ownerEmails.indexOf(email) >= 0) return "owner";

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(
    SHEETS.staffUsers,
  );

  if (!sheet || sheet.getLastRow() < 2) return "waiter";

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift().map(normalizeKey_);
  const emailIndex = headers.indexOf("email");
  const roleIndex = headers.indexOf("role");
  const activeIndex = headers.indexOf("active");

  if (emailIndex < 0 || roleIndex < 0) return "waiter";

  for (let index = 0; index < values.length; index += 1) {
    const rowEmail = clean_(values[index][emailIndex]).toLowerCase();
    if (rowEmail !== email) continue;

    const active = activeIndex < 0 ? "yes" : clean_(values[index][activeIndex]).toLowerCase();
    if (active === "no" || active === "false" || active === "disabled") {
      throw new Error("This staff account is disabled.");
    }

    return normalizeRole_(values[index][roleIndex]);
  }

  return "waiter";
}

function normalizeRole_(role) {
  const value = clean_(role).toLowerCase();
  return ROLE_ACTIONS[value] ? value : "waiter";
}

function buildDashboard_(customers, orders, payments, rewards, winners, unpaid) {
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

function buildRewards_(customers, orders, vouchers) {
  return customers
    .map((customer) => {
      const customerId = getRowCustomerId_(customer);
      const customerKey = customerMatchKey_(customer);
      if (!customerId && !customerKey) return null;

      const customerOrders = orders.filter(
        (order) => rowsMatchCustomer_(order, customer),
      );
      const paidDrinks = customerOrders.reduce((total, order) => {
        return total + paidEligibleDrinkQty_(order);
      }, 0);
      const earnedFreeDrinks = Math.floor(paidDrinks / REWARD_THRESHOLD);
      const customerVouchers = vouchers.filter(
        (voucher) => rowsMatchCustomer_(voucher, customer),
      );
      const generatedVoucherCount = customerVouchers.length;
      const redeemedVoucherCount = customerVouchers.filter(
        (voucher) =>
          clean_(voucher.redeemStatus).toLowerCase() === "redeemed",
      ).length;
      const pendingVoucherCount = generatedVoucherCount - redeemedVoucherCount;
      const freeDrinksReady = Math.max(0, earnedFreeDrinks - generatedVoucherCount);
      const progress = paidDrinks % REWARD_THRESHOLD;
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
            : `${REWARD_THRESHOLD - progress} paid drink(s) to next reward`,
      };
    })
    .filter(Boolean);
}

function paidEligibleDrinkQty_(order) {
  if (!isOrderPaidForRewards_(order)) return 0;
  if (!isRewardEligibleOrder_(order)) return 0;
  return orderQty_(order);
}

function isOrderPaidForRewards_(order) {
  const paymentStatus = clean_(order.paymentStatus).toLowerCase();
  if (paymentStatus === "paid") return true;
  return number_(order.total) > 0 && outstandingAmount_(order) <= 0;
}

function isRewardEligibleOrder_(order) {
  if (number_(order.pointsEarned) > 0) return true;

  const category = clean_(order.category).toLowerCase();
  const item = orderItemName_(order).toLowerCase();
  const text = `${category} ${item}`;

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
  ].some((word) => text.indexOf(word) >= 0);
}

function enrichCustomers_(customers, orders, unpaid) {
  const unpaidByCustomer = {};
  unpaid.forEach((row) => {
    unpaidByCustomer[row.customerId] = number_(row.unpaidBalance);
  });

  return customers.map((customer) => {
    const normalizedCustomer = normalizeCustomerRecord_(customer);
    const customerId = getRowCustomerId_(normalizedCustomer);
    const customerOrders = orders.filter(
      (order) => rowsMatchCustomer_(order, normalizedCustomer),
    );

    return Object.assign({}, normalizedCustomer, {
      totalOrders: String(customerOrders.length),
      totalSpent: String(sum_(customerOrders, "total")),
      unpaidBalance: String(unpaidByCustomer[customerId] || 0),
      lastVisit: customerOrders[0]?.orderDateTime || normalizedCustomer.lastVisit || "",
    });
  });
}

function enrichOrder_(order) {
  const item = order.item || order.itemName || order.menuItem || "";
  const qty = order.qty || order.quantity || "1";
  const total = number_(order.total);
  const paidAmount =
    clean_(order.paymentStatus).toLowerCase() === "paid"
      ? total
      : partialPaidAmount_(order);
  const outstanding = outstandingAmount_(order);
  const receiptId = receiptId_(order);
  const orderPlace = orderPlace_(order);
  const description = `${item || "Order"} x${qty} - ${total} EGP`;

  return Object.assign({}, order, {
    item,
    qty,
    receiptId,
    orderPlace,
    total: String(total),
    paidAmount: String(paidAmount),
    outstandingAmount: String(outstanding),
    orderDescription: description,
  });
}

function buildDashboardOrders_(orders) {
  const grouped = {};

  orders.forEach((order) => {
    const groupKey = order.receiptId || [
      order.orderDateTime,
      getRowCustomerId_(order),
      order.customerName,
      order.paymentStatus,
    ].join("|");

    if (!grouped[groupKey]) {
      grouped[groupKey] = Object.assign({}, order, {
        receiptKey: groupKey,
        orderPlace: order.orderPlace || orderPlace_(order) || "",
        itemCount: 0,
        total: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        orderDescriptions: [],
        pickedUpCount: 0,
      });
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

  return Object.values(grouped).map((row) =>
    Object.assign({}, row, {
      total: String(row.total),
      paidAmount: String(row.paidAmount),
      outstandingAmount: String(row.outstandingAmount),
      orderDescription: row.orderDescriptions.join(" + "),
      orderItems: row.orderDescriptions,
      itemCount: String(row.itemCount),
      orderStatus:
        row.pickedUpCount >= row.itemCount ? "Picked Up" : row.orderStatus,
    }),
  );
}

function buildDashboardTopItems_(orders) {
  const byItem = {};

  orders.forEach((order) => {
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
    .map((row, index) =>
      Object.assign({}, row, {
        rank: String(index + 1),
        qtySold: String(row.qtySold),
        totalSales: String(row.totalSales),
        stockAlert:
          row.qtySold >= 10
            ? "Restock today"
            : row.qtySold >= 5
              ? "Watch stock"
              : "OK",
      }),
    );
}

function orderItemName_(order) {
  return clean_(
    order.item ||
      order.itemName ||
      order.menuItem ||
      order.productName ||
      "Item",
  );
}

function orderQty_(order) {
  return Math.max(
    1,
    number_(order.qty || order.quantity || order.count || order.itemCount || 1),
  );
}

function normalizeCustomerRecord_(customer) {
  return Object.assign({}, customer, {
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
  });
}

function enrichVoucher_(voucher) {
  const customerId = getRowCustomerId_(voucher);
  const customerName =
    voucher.customerName || voucher.fullName || voucher.name || "";
  const favoriteDrink =
    voucher.favoriteDrink ||
    voucher.drink ||
    voucher.rewardDrink ||
    voucher.item ||
    "";

  return Object.assign({}, voucher, {
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
  });
}

function buildUnpaidTracker_(customers, orders) {
  const byCustomer = {};

  customers.forEach((customer) => {
    const customerId = getRowCustomerId_(customer);
    if (!customerId) return;

    byCustomer[customerId] = {
      customerId,
      customerName: customer.fullName || customer.customerName || "",
      phone: customer.phoneWhatsApp || customer.phone || "",
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
    const paymentStatus = clean_(order.paymentStatus).toLowerCase();
    const orderNotes = clean_(order.notes).toLowerCase();
    const place = order.orderPlace || orderPlace_(order);
    const orderDescription = `${order.orderDateTime || "No date"}${
      place ? ` - ${place}` : ""
    } - ${
      order.item || "Order"
    } x${order.qty || "1"} = ${total} EGP`;

    if (paymentStatus !== "paid" && outstanding > 0) {
      byCustomer[customerId].unpaidBalance += outstanding;
      byCustomer[customerId].openUnpaidOrders += 1;
      byCustomer[customerId].orderPlace =
        byCustomer[customerId].orderPlace || place;
      byCustomer[customerId].orderDescriptions.push(
        `${orderDescription} | Due ${outstanding} EGP (${order.paymentStatus || "Unpaid"})`,
      );
    } else if (orderNotes.indexOf("settled unpaid") >= 0 && total > 0) {
      byCustomer[customerId].settledDescriptions.push(
        `${orderDescription} (Paid)`,
      );
    }

    byCustomer[customerId].lastVisit = order.orderDateTime || byCustomer[customerId].lastVisit;
  });

  return Object.values(byCustomer)
    .filter(
      (row) =>
        number_(row.unpaidBalance) > 0 ||
        number_(row.openUnpaidOrders) > 0 ||
        row.settledDescriptions.length > 0,
    )
    .map((row) =>
      Object.assign({}, row, {
        paymentStatus: number_(row.unpaidBalance) > 0 ? "Unpaid" : "Paid",
        unpaidBalance: String(row.unpaidBalance),
        openUnpaidOrders: String(row.openUnpaidOrders),
        unpaidDescription: row.orderDescriptions
          .concat(row.settledDescriptions)
          .join(" | "),
      }),
    );
}

function sheetToObjects_(sheetName, headerRow) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < headerRow || lastColumn === 0) return [];

  const values = sheet
    .getRange(headerRow, 1, lastRow - headerRow + 1, lastColumn)
    .getDisplayValues();
  const headers = values.shift().map(normalizeKey_);

  return values
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) record[header] = clean_(row[index]);
      });
      return record;
    })
    .filter((record) => {
      const firstHeader = headers.find(Boolean);
      return firstHeader ? clean_(record[firstHeader]) !== "" : false;
    });
}

function listOptions_() {
  const rows = getSheet_(SHEETS.lists).getDataRange().getDisplayValues();
  const headers = rows.shift().map(normalizeKey_);
  const lists = {};

  headers.forEach((header, index) => {
    lists[header] = rows
      .map((row) => clean_(row[index]))
      .filter((value) => value !== "");
  });

  return lists;
}

function buildOrderPlaceOptions_(orders, lists) {
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

function serviceOrderPlace_(payload) {
  const serviceType = clean_(payload.serviceType);
  const place = clean_(
    payload.orderPlace || payload.tableNumber || payload.place || payload.location,
  );
  if (
    place &&
    ((serviceType && place.indexOf(`${serviceType} - `) === 0) ||
      place.indexOf("Car:") >= 0)
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

function uniqueStrings_(values) {
  const seen = {};

  return values
    .map(clean_)
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function rowsMatchCustomer_(row, customer) {
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

  return customerNameKey_(row) && customerNameKey_(row) === customerNameKey_(customer);
}

function customerMatchKey_(row) {
  return (
    getRowCustomerId_(row) ||
    digits_(row.phone || row.phoneWhatsApp || row.customerPhone) ||
    customerNameKey_(row)
  );
}

function customerNameKey_(row) {
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

function findCustomer_(customerId) {
  if (!customerId) return {};
  return (
    sheetToObjects_(SHEETS.customers, 1).map(normalizeCustomerRecord_).find(
      (customer) => getRowCustomerId_(customer) === customerId,
    ) || {}
  );
}

function getOrCreateReceiptCustomer_(payload) {
  const customerId = getPayloadCustomerId_(payload);
  if (customerId) {
    return { customerId, customer: findCustomer_(customerId), created: false };
  }

  const customerName = clean_(
    payload.customerName || payload.fullName || payload.name,
  ) || "Walk-in Guest";
  const phone = clean_(
    payload.customerPhone ||
      payload.phone ||
      payload.phoneWhatsApp ||
      payload.whatsApp ||
      payload.whatsapp,
  );
  const existing = findCustomerByPhoneOrName_(phone, customerName);

  if (existing.customerId) {
    return {
      customerId: existing.customerId,
      customer: existing,
      created: false,
    };
  }

  const newCustomerId = createCustomerFromOrder_(customerName, phone, payload);
  return {
    customerId: newCustomerId,
    customer: findCustomer_(newCustomerId),
    created: true,
  };
}

function findCustomerByPhoneOrName_(phone, customerName) {
  const normalizedPhone = digits_(phone);
  const normalizedName = clean_(customerName).toLowerCase();

  return (
    sheetToObjects_(SHEETS.customers, 1)
      .map(normalizeCustomerRecord_)
      .find((customer) => {
        const customerPhone = digits_(customer.phoneWhatsApp || customer.phone);
        const name = getCustomerName_(customer).toLowerCase();

        if (normalizedPhone && customerPhone === normalizedPhone) return true;
        return normalizedName && name === normalizedName;
      }) || {}
  );
}

function createCustomerFromOrder_(customerName, phone, payload) {
  const sheet = getSheet_(SHEETS.customers);
  const nextId = nextId_("CUST", sheet, 1);
  const now = new Date();

  writeObjectRow_(SHEETS.customers, {
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
    notes: "Created automatically from waiter receipt.",
    active: "Yes",
    totalOrders: 0,
    totalSpent: 0,
    unpaidBalance: 0,
    points: 0,
    freeDrinksReady: 0,
  });

  return nextId;
}

function findMenuItem_(itemId, itemName) {
  const menu = sheetToObjects_(SHEETS.menu, 1).map(enrichMenuItem_);
  return (
    menu.find((item) => getRowItemId_(item) === itemId) ||
    menu.find((item) => item.itemName === itemName) ||
    {}
  );
}

function enrichMenuItem_(item) {
  const priceText =
    item.priceText ||
    item.priceTextEditLater ||
    item["priceTextEditLater)"] ||
    item.price ||
    "";

  return Object.assign({}, item, {
    priceText,
    suggestedPrice: String(parsePrice_(priceText) || ""),
  });
}

function closeUnpaidOrders_(customerId, amount) {
  const sheet = getSheet_(SHEETS.orders);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeKey_);
  const customerIdIndex = headers.indexOf("customerId");
  const totalIndex = headers.indexOf("total");
  const statusIndex = headers.indexOf("paymentStatus");
  const orderStatusIndex = headers.indexOf("orderStatus");
  const itemIndex = headers.indexOf("item");
  const notesIndex = headers.indexOf("notes");
  let remaining = amount;
  const closedOrders = [];

  for (let row = 1; row < values.length; row += 1) {
    const rowCustomerId = clean_(values[row][customerIdIndex]);
    const paymentStatus = clean_(values[row][statusIndex]).toLowerCase();
    const total = number_(values[row][totalIndex]);
    const notes = notesIndex >= 0 ? values[row][notesIndex] : "";
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

    if (remaining < outstanding) {
      break;
    }

    sheet.getRange(row + 1, statusIndex + 1).setValue("Paid");
    if (orderStatusIndex >= 0 && !isPickedUpStatus_(values[row][orderStatusIndex])) {
      sheet.getRange(row + 1, orderStatusIndex + 1).setValue("Closed");
    }
    if (notesIndex >= 0) {
      const currentNotes = clean_(values[row][notesIndex]);
      const settledNote = `Settled unpaid on ${new Date().toLocaleString()}`;
      sheet
        .getRange(row + 1, notesIndex + 1)
        .setValue(currentNotes ? `${currentNotes} | ${settledNote}` : settledNote);
    }

    remaining -= outstanding;
    closedOrders.push(values[row][itemIndex] || `row ${row + 1}`);
  }

  return closedOrders;
}

function updateReceiptRows_(payload, updater) {
  const sheet = getSheet_(SHEETS.orders);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) throw new Error("No orders found.");

  const headers = values[0].map(normalizeKey_);
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
  const itemNames = [];
  let updatedRows = 0;
  let newlyPaidTotal = 0;
  let resultCustomerId = customerId;
  let resultCustomerName = customerName;

  if (statusIndex < 0) throw new Error("Orders sheet needs a Payment Status column.");

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    const rowNotes = notesIndex >= 0 ? clean_(row[notesIndex]) : "";
    const rowReceiptId = receiptId_({ notes: rowNotes });
    const rowCustomerId = customerIdIndex >= 0 ? clean_(row[customerIdIndex]) : "";
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
    const matchesReceiptKey = !receiptId && receiptKey && rowReceiptKey === receiptKey;
    const matchesFallback =
      !receiptId &&
      !receiptKey &&
      (!customerId || rowCustomerId === customerId) &&
      (!customerName || rowCustomerName === customerName) &&
      (!orderDateTime || rowDate === orderDateTime);

    if (!matchesReceiptId && !matchesReceiptKey && !matchesFallback) {
      continue;
    }

    const total = totalIndex >= 0 ? number_(row[totalIndex]) : 0;
    if (clean_(payload.paymentStatus) === "Paid" && rowStatus !== "Paid") {
      newlyPaidTotal += total;
    }

    updater({
      sheet,
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

function orderNotes_(notes, paymentStatus, paidAmount) {
  const cleanNotes = clean_(notes);

  if (paymentStatus !== "Partial" || paidAmount <= 0) {
    return cleanNotes;
  }

  const paidNote = `Paid now: ${paidAmount}`;
  return cleanNotes ? `${cleanNotes} | ${paidNote}` : paidNote;
}

function partialPaidAmount_(order) {
  const match = String(order.notes || "").match(/Paid now:\s*([\d,]+(?:\.\d+)?)/i);
  return match ? Number(String(match[1]).replace(/,/g, "")) : 0;
}

function outstandingAmount_(order) {
  const total = number_(order.total);
  const paymentStatus = clean_(order.paymentStatus).toLowerCase();

  if (paymentStatus === "paid") return 0;
  if (paymentStatus === "partial") {
    return Math.max(0, total - partialPaidAmount_(order));
  }

  return total;
}

function isPickedUpStatus_(status) {
  const value = clean_(status).toLowerCase().replace(/[-_\s]+/g, "");
  return value === "done" || value === "pickedup" || value === "pickup";
}

function getPayloadCustomerId_(payload) {
  return clean_(
    payload.customerId ||
      payload.customerID ||
      payload.id ||
      payload.ID,
  );
}

function getRowCustomerId_(row) {
  return clean_(row.customerId || row.customerID || row.id || row.ID);
}

function getRowItemId_(row) {
  return clean_(row.itemId || row.itemID || row.id || row.ID);
}

function headerIndex_(headers, names) {
  for (let index = 0; index < names.length; index += 1) {
    const found = headers.indexOf(names[index]);
    if (found >= 0) return found;
  }

  return -1;
}

function appendRedemption_(voucherRow, header, payload) {
  const get = (key, aliases) => {
    const index = headerIndex_(header, [key].concat(aliases || []));
    return index >= 0 ? voucherRow[index] || "" : "";
  };
  const redemptionId = nextId_("RED", getSheet_(SHEETS.rewardRedemptions), 1);

  writeDataRow_(SHEETS.rewardRedemptions, [
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

function nextId_(prefix, sheet, idColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return `${prefix}-0001`;

  const ids = sheet
    .getRange(2, idColumn, lastRow - 1, 1)
    .getDisplayValues()
    .flat()
    .filter(Boolean);
  const max = ids.reduce((highest, id) => {
    const match = String(id).match(/(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function createVoucherCode_(customerId) {
  const idPart = String(customerId || "CUST").replace(/[^A-Z0-9]/gi, "");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `JC-${idPart}-${randomPart}`;
}

function createReceiptId_(customerId) {
  const idPart = String(customerId || "CUST").replace(/[^A-Z0-9]/gi, "");
  return `RCPT-${idPart}-${Date.now()}`;
}

function receiptId_(order) {
  const match = String(order.notes || "").match(/Receipt:\s*([A-Z0-9-]+)/i);
  return match ? match[1] : "";
}

function orderPlace_(order) {
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

function getCustomerName_(customer) {
  return clean_(
    customer.fullName ||
      customer.customerName ||
      customer.name ||
      customer.clientName,
  );
}

function getFavoriteDrink_(customer) {
  return clean_(
    customer.favoriteDrink ||
      customer.favouriteDrink ||
      customer.favorite ||
      customer.favourite ||
      customer.preferredDrink ||
      customer.drink,
  );
}

function parsePrice_(priceText) {
  const match = String(priceText || "").match(/[\d,]+(?:\.\d+)?/);
  return match ? Number(String(match[0]).replace(/,/g, "")) : 0;
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return e.parameter || {};
  }
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet tab: ${name}`);
  return sheet;
}

function writeDataRow_(sheetName, rowValues) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_(sheetName);
    const targetRow = firstEmptyRowByColumn_(sheet, 1, 2);

    sheet
      .getRange(targetRow, 1, 1, rowValues.length)
      .setValues([rowValues]);

    return targetRow;
  } finally {
    lock.releaseLock();
  }
}

function writeObjectRow_(sheetName, record) {
  const sheet = getSheet_(sheetName);
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(normalizeKey_);
  const rowValues = headers.map((header) => valueForHeader_(record, header));

  return writeDataRow_(sheetName, rowValues);
}

function valueForHeader_(record, header) {
  if (Object.prototype.hasOwnProperty.call(record, header)) {
    return record[header];
  }

  const aliases = {
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

function firstEmptyRowByColumn_(sheet, column, startRow) {
  const maxRows = sheet.getMaxRows();
  const rowCount = Math.max(1, maxRows - startRow + 1);
  const values = sheet
    .getRange(startRow, column, rowCount, 1)
    .getDisplayValues();

  for (let index = 0; index < values.length; index += 1) {
    if (!clean_(values[index][0])) {
      return startRow + index;
    }
  }

  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function success_(payload) {
  return Object.assign({ success: true }, payload || {});
}

function clean_(value) {
  return String(value == null ? "" : value).trim();
}

function number_(value) {
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function digits_(value) {
  return String(value || "").replace(/\D/g, "");
}

function sum_(rows, key) {
  return rows.reduce((total, row) => total + number_(row[key]), 0);
}

function normalizeKey_(value) {
  const key = String(value || "")
    .trim()
    .replace(/[?]/g, "")
    .replace(/[()]/g, "")
    .replace(/[/]+/g, " ")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());

  return key.replace(/ID$/, "Id");
}
