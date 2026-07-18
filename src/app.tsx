import {
  CSSProperties,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { User } from "firebase/auth";
import {
  StaffProfile,
  StaffRole,
  auth,
  firebaseReady,
  signInCustomer,
  signInStaff,
  signUpCustomer,
  signOutStaff,
  watchFirebaseUser,
  watchActiveOrders,
  watchStaffAuth,
} from "./firebase";
import { normalizedMenu, resolveMenuPrice } from "./menuRepository";
import {
  calculateReceipt,
  calculateReceiptLine,
  calculateReceiptTotals,
  normalizePaymentStatus,
} from "./receiptCalculator";
import {
  getPaymentStatusClass,
  getPreparationStatusClass,
  isFinishedPreparationStatus,
  isPickedUpStatus,
  normalizePaymentStatusForDisplay,
  normalizePreparationStatus,
  PreparationStatus,
} from "./receiptVisualState";
import {
  actionFeaturePermissions,
  hasPermission,
  resolveEffectivePermissions,
  visibleTabsForPermissions,
} from "./permissions";
import { buildReceiptPrintHtml } from "./receiptPrint";
import { getOfflineMetadata, putOfflineMetadata } from "./offline/db";
import { enqueueOfflineOperation } from "./offline/queue";
import { SyncCenter } from "./offline/SyncCenter";
import type { OfflineOperationType } from "./offline/types";

const coffeeBeanFieldUrl = "/assets/coffee-bean-field.jpg";
const joyCultureStripUrl = "/assets/joy-reference-hero.png";
const joyCornerMarkUrl = "/assets/joy-corner-logo.svg";
const joyYourTimeUrl = "/assets/joy-your-time.svg";

const API_BASE_URL = "/api";

type Row = Record<string, unknown>;

type Dashboard = {
  totalCustomers?: number;
  totalOrders?: number;
  totalItems?: number;
  totalSales?: number;
  totalPaid?: number;
  totalUnpaid?: number;
  openReceipts?: number;
  pickedUpReceipts?: number;
  unpaidReceipts?: number;
  rewardsReady?: number;
  totalWinners?: number;
};

type AppData = {
  dashboard?: Dashboard;
  dashboardOrders?: Row[];
  dashboardTopItems?: Row[];
  customers?: Row[];
  orders?: Row[];
  payments?: Row[];
  unpaid?: Row[];
  rewards?: Row[];
  winners?: Row[];
  vouchers?: Row[];
  menu?: Row[];
  lists?: Record<string, string[]>;
  historyDays?: Row[];
  staffProfile?: StaffProfile;
};

type OwnerData = {
  auditLogs?: Row[];
  permissionCatalog?: string[];
  staff?: Row[];
  syncFailures?: Row[];
  systemHealth?: Row;
};

type ApiResponse = {
  success?: boolean;
  data?: AppData;
  receipt?: Row;
  staff?: StaffProfile;
  message?: string;
};

type ReceiptItem = {
  category: string;
  discount?: number;
  extrasTotal?: number;
  itemId: string;
  itemName: string;
  notes?: string;
  qty: number;
  size: string;
  total: number;
  unitPrice: number;
};

type ReceiptPayload = {
  receiptId: string;
  receiptKey: string;
  orderId?: string;
  receiptNumber?: string;
  customerId: string;
  customerName: string;
  orderDateTime: string;
  staff: string;
};

type TabId =
  | "dashboard"
  | "customers"
  | "orders"
  | "rewards"
  | "vouchers"
  | "unpaid"
  | "history"
  | "menu"
  | "owner";

const tabs: Array<[TabId, string]> = [
  ["dashboard", "Dashboard"],
  ["customers", "Customers"],
  ["orders", "Orders"],
  ["rewards", "Rewards"],
  ["vouchers", "Vouchers"],
  ["unpaid", "Unpaid"],
  ["history", "History"],
  ["menu", "Menu"],
  ["owner", "Owner"],
];

function TabIcon({ id }: { id: TabId }) {
  const paths: Record<TabId, ReactNode> = {
    customers: (
      <>
        <path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3.5" />
        <path d="M20.5 20v-2a3.5 3.5 0 0 0-2.8-3.4" />
        <path d="M16.5 3.4a3.5 3.5 0 0 1 0 6.8" />
      </>
    ),
    dashboard: (
      <>
        <path d="M4 13a8 8 0 1 1 16 0" />
        <path d="M5 17h14" />
        <path d="m12 13 4-4" />
        <path d="M8 21h8" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    menu: (
      <>
        <path d="M5 8h11a4 4 0 0 1 0 8H5z" />
        <path d="M16 10h1a2 2 0 0 1 0 4h-1" />
        <path d="M7 3v2" />
        <path d="M11 3v2" />
        <path d="M5 19h12" />
      </>
    ),
    orders: (
      <>
        <path d="M7 3h10l2 3v15H5V6z" />
        <path d="M7 8h10" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </>
    ),
    owner: (
      <>
        <path d="M12 3 20 7v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z" />
        <path d="M9 12l2 2 4-5" />
      </>
    ),
    rewards: (
      <>
        <path d="M12 3 14.7 8l5.6.8-4.1 4 1 5.6L12 15.8l-5.2 2.7 1-5.6-4.1-4L9.3 8z" />
        <path d="M9 21h6" />
      </>
    ),
    unpaid: (
      <>
        <rect height="13" rx="2" width="18" x="3" y="6" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
        <path d="M16 14v3" />
      </>
    ),
    vouchers: (
      <>
        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
        <path d="M9 9h.01" />
        <path d="M15 15h.01" />
        <path d="m9 15 6-6" />
      </>
    ),
  };

  return (
    <span className="tab-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {paths[id]}
      </svg>
    </span>
  );
}

export function buildReceiptSubmissionPayload(
  form: HTMLFormElement,
  items: ReceiptItem[],
  customers: Row[],
) {
  const customerId = stringValue(form.elements.namedItem("customerId"));
  const customer = customers.find((row) => customerIdOf(row) === customerId);
  const payload = formObject(form) as Record<string, unknown>;
  const discount = stringValue(
    form.elements.namedItem("receiptDiscountPercentage"),
  );
  const receiptTotals = calculateReceiptTotals(items, discount);
  const paidAmountText = stringValue(
    form.elements.namedItem("paidAmount"),
  ).trim();
  const requestedPaidAmount = paidAmountText
    ? numberValue(form.elements.namedItem("paidAmount"))
    : 0;
  const requestedPaymentStatus = stringValue(
    form.elements.namedItem("paymentStatus"),
  );
  const normalizedPaymentStatus = normalizePaymentStatus(
    requestedPaymentStatus,
  );
  const amountPaid =
    normalizedPaymentStatus === "Unpaid"
      ? 0
      : normalizedPaymentStatus === "Paid" && !paidAmountText
        ? receiptTotals.receiptTotal
        : requestedPaidAmount;
  const receiptCalculation = calculateReceipt({
    amountPaid,
    items,
    orderDiscount: receiptTotals.receiptDiscountAmount,
  });

  payload.customerName =
    customerName(customer) || stringValue(payload.customerName);
  payload.phone =
    phoneOf(customer) || stringValue(payload.customerPhone || payload.phone);
  payload.items = items;
  payload.receiptDiscountPercentage = discount;
  payload.paidAmount = receiptCalculation.amountPaid;
  payload.amountApplied = receiptCalculation.amountApplied;
  payload.amountReceived = receiptCalculation.amountReceived;
  payload.remainingAmount = receiptCalculation.remainingAmount;
  payload.changeAmount = receiptCalculation.changeAmount;
  payload.paymentStatus = receiptCalculation.paymentStatus;
  payload.receiptSubtotal = receiptTotals.receiptSubtotal;
  payload.receiptDiscountAmount = receiptTotals.receiptDiscountAmount;
  payload.receiptTotal = receiptCalculation.grandTotal;
  payload.idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  payload.clientRequestId = payload.idempotencyKey;
  payload.orderPlace = composeServicePlace(payload);
  delete payload.customerSearch;
  delete payload.serviceType;
  delete payload.carName;
  delete payload.carColor;
  return payload;
}

export function App() {
  if (window.location.pathname.startsWith("/order")) {
    return <CustomerOrderPage />;
  }

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<AppData | null>(null);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [status, setStatus] = useState("Loading sheet data...");
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [autoScroll, setAutoScroll] = useState(false);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [ownerData, setOwnerData] = useState<OwnerData>({});
  const receiptSubmittingRef = useRef(false);
  const syncRequestRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const [authStatus, setAuthStatus] = useState(
    firebaseReady
      ? "Sign in with your staff account."
      : "Firebase is not configured. Staff sign-in is disabled until the Firebase web settings are supplied.",
  );
  const [authLoading, setAuthLoading] = useState(firebaseReady);

  const currentRole = staffProfile?.role || "barista";
  const visibleTabs = useMemo(
    () =>
      visibleTabsForPermissions(
        currentRole,
        staffProfile?.effectivePermissions || [],
      ),
    [currentRole, staffProfile?.effectivePermissions],
  );
  const connectedData = useMemo(() => ensureConnectedData(data), [data]);
  const customers = connectedData.customers || [];
  const menu = connectedData.menu?.length ? connectedData.menu : normalizedMenu;
  const lists = connectedData.lists || {};
  const dashboardOrders = (connectedData.dashboardOrders || [])
    .map((order) => enrichOrderCustomerPhone(order, customers))
    .slice()
    .sort((left, right) => {
      return (
        Number(isPickedUpStatus(left.orderStatus)) -
          Number(isPickedUpStatus(right.orderStatus)) ||
        compareRecentOrders(left, right)
      );
    });
  const canRunCurrentAction = (action: string) =>
    canRunActionForProfile(staffProfile, currentRole, action);

  useEffect(() => {
    if (!firebaseReady) return undefined;

    return watchStaffAuth(
      (session) => {
        setStaffProfile(session?.profile || null);
        setAuthLoading(false);
        if (session?.profile) {
          setAuthStatus(
            `Signed in as ${session.profile.displayName || session.profile.email}.`,
          );
        }
      },
      (message) => {
        setAuthStatus(message);
        setAuthLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!staffProfile) return;
    void loadData();
  }, [staffProfile?.uid]);

  useEffect(() => {
    if (!staffProfile || !firebaseReady) return undefined;
    return watchActiveOrders(
      (orders) => {
        const live = orders as Row[];
        setData((current) =>
          ensureConnectedData({
            ...(current || {}),
            dashboardOrders: mergeRowsByKey(
              live,
              current?.dashboardOrders || [],
              receiptKeyOf,
            ),
            orders: mergeRowsByKey(live, current?.orders || [], receiptKeyOf),
          }),
        );
      },
      (message) => setStatus(`Live order warning: ${message}`),
    );
  }, [staffProfile?.uid]);

  useEffect(() => {
    const visibleTabIds = visibleTabs.map(([id]) => id as TabId);
    if (!visibleTabIds.some((id) => id === activeTab)) {
      setActiveTab((visibleTabs[0]?.[0] as TabId) || "dashboard");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!autoScroll || activeTab !== "dashboard") return undefined;

    const timer = window.setInterval(() => {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const nextScroll = window.scrollY + Math.round(window.innerHeight * 0.7);
      window.scrollTo({
        behavior: "smooth",
        top: nextScroll >= maxScroll - 20 ? 0 : nextScroll,
      });
    }, 7000);

    return () => window.clearInterval(timer);
  }, [activeTab, autoScroll]);

  useEffect(() => {
    if (activeTab === "owner" && currentRole === "owner") {
      void loadOwnerOverview();
    }
  }, [activeTab, currentRole]);

  useEffect(() => {
    if (!staffProfile) return undefined;

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const run = async (immediate = false) => {
      if (stopped) return;
      if (document.hidden && !immediate) {
        timeoutId = setTimeout(run, 7000);
        return;
      }
      await refreshLiveData({ silent: true });
      if (!stopped) timeoutId = setTimeout(run, 5000);
    };

    const onVisible = () => {
      if (!document.hidden) void refreshLiveData({ silent: true });
    };

    document.addEventListener("visibilitychange", onVisible);
    timeoutId = setTimeout(run, 1500);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [staffProfile?.uid, currentRole]);

  async function loadData(options: { silent?: boolean } = {}) {
    if (!options.silent) setStatus("Loading sheet data...");

    try {
      setLoading(true);
      const response = await callServer("appData");
      const nextData = response.data || response;
      const connected = ensureConnectedData(nextData);
      const liveStaffProfile = response.staff || connected.staffProfile;
      setData(connected);
      if (liveStaffProfile) {
        setStaffProfile((current) =>
          current
            ? {
                ...current,
                ...liveStaffProfile,
                uid: liveStaffProfile.uid || current.uid,
              }
            : liveStaffProfile || current,
        );
      }
      if (!options.silent) {
        setStatus(
          `Loaded ${new Date().toLocaleString()} | ${dataSummary(connected)}`,
        );
      }
    } catch (error) {
      console.error("Failed to load app data", error);
      setStatus(
        data
          ? `${errorMessage(error)} Keeping the last loaded sheet data.`
          : errorMessage(error),
      );
    } finally {
      setLoading(false);
    }
  }

  async function callAndReload(
    action: string,
    payload: Record<string, unknown>,
    message: string,
  ) {
    if (!canRunActionForProfile(staffProfile, currentRole, action)) {
      setStatus("This account does not have permission for that action.");
      return false;
    }

    try {
      setSavingAction(action);
      setStatus("Saving...");
      const response = await callServer(action, payload);
      const nextData = ensureConnectedData(response.data || response);
      mergeAppData(nextData);
      setStatus(`${message} ${dataSummary(nextData)}`);
      return true;
    } catch (error) {
      console.error(`Action ${action} failed`, error);
      setStatus(
        action === "addReceipt"
          ? `${errorMessage(error)} Order was not saved.`
          : errorMessage(error),
      );
      return false;
    } finally {
      setSavingAction(null);
    }
  }

  async function refreshLiveData(
    options: { force?: boolean; silent?: boolean } = {},
  ) {
    if (syncInFlightRef.current && !options.force) return;
    const requestId = ++syncRequestRef.current;

    try {
      syncInFlightRef.current = true;
      const response = await callServer("liveData");
      if (requestId !== syncRequestRef.current) return;
      mergeAppData(ensureConnectedData(response.data || response));
      if (!options.silent) setStatus("Live orders refreshed.");
    } catch (error) {
      if (!options.silent) setStatus(errorMessage(error));
    } finally {
      if (requestId === syncRequestRef.current) syncInFlightRef.current = false;
    }
  }

  function mergeAppData(nextData: AppData) {
    setData((current) => mergeConnectedData(current, nextData));
  }

  function setFilter(id: string, value: string) {
    setFilters((current) => ({ ...current, [id]: value }));
  }

  function filteredRows(rows: Row[] = [], id: string) {
    const query = (filters[id] || "").trim().toLowerCase();
    if (!query) return rows;
    if (query === "__unpaid") {
      return rows.filter(
        (row) =>
          numberValue(row.outstandingAmount) > 0 ||
          stringValue(row.paymentStatus).toLowerCase() === "unpaid",
      );
    }
    if (query === "__paid") {
      return rows.filter(
        (row) =>
          numberValue(row.outstandingAmount) <= 0 &&
          stringValue(row.paymentStatus).toLowerCase() === "paid",
      );
    }
    return rows.filter((row) => rowSearchText(row).includes(query));
  }

  function receiptItemFromForm(form: HTMLFormElement): ReceiptItem | null {
    const itemId = stringValue(form.elements.namedItem("itemId"));
    const selectedItem = menu.find(
      (item) => stringValue(item.itemId) === itemId,
    );
    const selectedSize =
      stringValue(form.elements.namedItem("size")) ||
      stringValue(selectedItem?.standardSize) ||
      "Standard";

    if (!selectedItem) {
      setStatus("Choose a menu item.");
      return null;
    }

    const qty = numberValue(form.elements.namedItem("qty"));
    if (!qty || qty < 1) {
      setStatus("Quantity must be at least 1.");
      return null;
    }

    const staff = stringValue(form.elements.namedItem("staff"));
    if (!staff) {
      setStatus("Choose a staff member.");
      return null;
    }

    const resolvedPrice = resolveMenuPrice(
      itemId,
      selectedSize,
      menuName(selectedItem),
    );
    const unitPrice =
      resolvedPrice?.price ||
      numberValue(form.elements.namedItem("unitPrice")) ||
      numberValue(selectedItem.suggestedPrice) ||
      firstPrice(menuPrice(selectedItem));
    if (!unitPrice || unitPrice < 0) {
      setStatus("Selected menu item does not have a valid price.");
      return null;
    }

    const line = calculateReceiptLine({
      qty,
      unitPrice,
    });
    return {
      category: resolvedPrice?.category || stringValue(selectedItem.category),
      discount: line.discount,
      extrasTotal: line.extrasTotal,
      itemId: resolvedPrice?.itemId || itemId,
      itemName: resolvedPrice?.itemName || menuName(selectedItem),
      notes: stringValue(form.elements.namedItem("itemNotes")),
      qty: line.qty,
      size: resolvedPrice?.size || selectedSize,
      total: line.total,
      unitPrice: line.unitPrice,
    };
  }

  function addReceiptItemFromForm(form: HTMLFormElement) {
    const nextItem = receiptItemFromForm(form);
    if (!nextItem) return null;

    setReceiptItems((items) => [nextItem, ...items]);
    setStatus(`${nextItem.itemName} added to receipt.`);
    return nextItem;
  }

  function mergeReceiptResponseIntoAppData(response: ApiResponse & AppData) {
    const receipt = response.receipt;
    const nextData = ensureConnectedData(response.data || response);
    const fallbackReceipt =
      nextData.dashboardOrders?.[0] || nextData.orders?.[0];
    const normalizedReceipt = receipt
      ? ({
          ...receipt,
          receiptId: stringValue(receipt.receiptId || receipt.receiptNumber),
          receiptNumber: stringValue(
            receipt.receiptNumber || receipt.receiptId,
          ),
          receiptKey: stringValue(
            receipt.receiptKey || receipt.receiptId || receipt.receiptNumber,
          ),
          orderId: stringValue(
            receipt.orderId || receipt.receiptId || receipt.receiptNumber,
          ),
          customerId: stringValue(receipt.customerId),
          customerName: stringValue(receipt.customerName),
          staff: stringValue(receipt.staff),
          orderPlace: stringValue(receipt.orderPlace),
          total: stringValue(receipt.total),
          paidAmount: stringValue(receipt.paidAmount),
          outstandingAmount: stringValue(
            receipt.outstandingAmount || receipt.remainingAmount,
          ),
          remainingAmount: stringValue(
            receipt.remainingAmount || receipt.outstandingAmount,
          ),
          changeAmount: stringValue(receipt.changeAmount),
          paymentStatus: stringValue(receipt.paymentStatus),
          orderStatus: stringValue(receipt.orderStatus || "Requested"),
          orderDescription:
            stringValue(receipt.orderDescription) ||
            (Array.isArray(receipt.orderItems)
              ? receipt.orderItems.map((item) => stringValue(item)).join(" + ")
              : ""),
          notes: stringValue(receipt.notes || receipt.customerNotes),
          orderItems: Array.isArray(receipt.orderItems)
            ? receipt.orderItems.map((item) => stringValue(item))
            : [],
        } as Row)
      : fallbackReceipt;

    if (!normalizedReceipt) {
      mergeAppData(nextData);
      return;
    }

    setData((current) => {
      const base = ensureConnectedData(current);
      const incomingOrders = nextData.orders?.length
        ? nextData.orders
        : [normalizedReceipt];
      const incomingDashboardOrders = nextData.dashboardOrders?.length
        ? nextData.dashboardOrders
        : [normalizedReceipt];
      const mergedOrders = mergeRowsByKey(
        [normalizedReceipt, ...(base.orders || [])],
        incomingOrders,
        receiptKeyOf,
      );
      const mergedDashboardOrders = mergeRowsByKey(
        [normalizedReceipt, ...(base.dashboardOrders || [])],
        incomingDashboardOrders,
        receiptKeyOf,
      );

      return ensureConnectedData({
        ...base,
        ...nextData,
        dashboard: nextData.dashboard || base.dashboard,
        dashboardOrders: mergedDashboardOrders,
        orders: mergedOrders,
        unpaid: nextData.unpaid || base.unpaid,
      });
    });
  }

  async function submitReceipt(form: HTMLFormElement) {
    if (receiptSubmittingRef.current) {
      setStatus("Receipt is already being submitted.");
      return false;
    }

    const items = receiptItems.length
      ? receiptItems
      : (() => {
          const pendingItem = receiptItemFromForm(form);
          return pendingItem ? [pendingItem] : [];
        })();

    if (!items.length) return false;

    let payload: Record<string, unknown>;
    try {
      payload = buildReceiptSubmissionPayload(form, items, customers);
    } catch (error) {
      setStatus(errorMessage(error));
      return false;
    }

    try {
      receiptSubmittingRef.current = true;
      setSavingAction("addReceipt");
      setStatus("Saving...");
      const response = await callServer("addReceipt", payload);
      mergeReceiptResponseIntoAppData(response);
      setStatus(
        `Receipt submitted. ${dataSummary(ensureConnectedData(response.data || response))}`,
      );
      setReceiptItems([]);
      form.reset();
      return true;
    } catch (error) {
      console.error("Receipt submission failed", error);
      setStatus(
        `${errorMessage(error)} Receipt was not saved. Your entered data has been kept.`,
      );
      return false;
    } finally {
      receiptSubmittingRef.current = false;
      setSavingAction(null);
    }
  }

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await callAndReload("addCustomer", formObject(form), "Customer added.");
    form.reset();
  }

  async function removeCustomer(row: Row) {
    const id = customerIdOf(row);
    if (!id) {
      setStatus("Customer ID is required before removing a customer.");
      return;
    }

    const confirmed = window.confirm(
      `Remove ${customerName(row)} from the Customers sheet? Existing order history stays saved.`,
    );
    if (!confirmed) return;

    await callAndReload(
      "removeCustomer",
      { customerId: id },
      "Customer removed from the sheet.",
    );
  }

  async function generateVoucher(row: Row) {
    await callAndReload(
      "generateVoucher",
      {
        customerId: customerIdOf(row),
        customerName: customerName(row),
        phone: phoneOf(row),
        favoriteDrink: favoriteDrink(row),
      },
      "Voucher generated.",
    );
  }

  async function redeemVoucher(voucherCode: string) {
    await callAndReload("redeemVoucher", { voucherCode }, "Voucher redeemed.");
  }

  async function collectUnpaid(row: Row) {
    const amount = window.prompt(
      `Collect payment for ${customerName(row) || stringValue(row.customerId)}`,
      stringValue(row.unpaidBalance || "0"),
    );

    if (amount === null) return;

    await callAndReload(
      "collectUnpaidPayment",
      {
        customerId: customerIdOf(row),
        customerName: customerName(row),
        amount,
        method: "Cash",
        collectedBy: "Cashier 1",
      },
      "Unpaid payment collected.",
    );
  }

  async function setReceiptPayment(
    encodedPayload: string,
    paymentStatus: string,
  ) {
    const payload = receiptPayloadFrom(encodedPayload);
    await callAndReload(
      "updateReceiptPayment",
      { ...payload, paymentStatus },
      `Receipt marked ${paymentStatus}.`,
    );
  }

  async function collectReceiptPayment(encodedPayload: string) {
    const amount = window.prompt("Amount collected now", "");
    if (amount === null) return;
    const numericAmount = numberValue(amount);
    if (numericAmount <= 0) {
      setStatus("Paid amount must be greater than 0.");
      return;
    }
    await callAndReload(
      "collectReceiptPayment",
      {
        ...receiptPayloadFrom(encodedPayload),
        amount: numericAmount,
        clientRequestId:
          globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        paymentMethod: "Cash",
      },
      "Receipt payment collected.",
    );
  }

  async function markReceiptDone(encodedPayload: string) {
    return await callAndReload(
      "pickupOrder",
      receiptPayloadFrom(encodedPayload),
      "Receipt marked picked up.",
    );
  }

  async function markReceiptStatus(
    encodedPayload: string,
    action: string,
    message: string,
  ) {
    return await callAndReload(
      action,
      receiptPayloadFrom(encodedPayload),
      message,
    );
  }

  async function resetDay() {
    await callAndReload("resetDay", {}, "Day archived and dashboard reset.");
  }

  async function runOwnerAction(action: string, message: string) {
    if (!canRunActionForProfile(staffProfile, currentRole, action)) {
      setStatus("This account does not have permission for that action.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Checking system...");
      const response = await callServer(action, {});
      const detail = response.message ? ` ${response.message}` : "";
      setStatus(`${message}${detail}`);
    } catch (error) {
      console.error(`Owner action ${action} failed`, error);
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadOwnerOverview() {
    try {
      setLoading(true);
      const response = await callServer("ownerOverview");
      setOwnerData((response.data || response) as OwnerData);
      setStatus("Owner controls refreshed.");
    } catch (error) {
      console.error("Owner overview failed", error);
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function runOwnerMutation(
    action: string,
    payload: Record<string, unknown>,
    message: string,
  ) {
    try {
      setLoading(true);
      const response = await callServer(action, payload);
      if (response.data) setData(ensureConnectedData(response.data));
      if ((response as unknown as { staff?: Row[] }).staff) {
        setOwnerData((current) => ({
          ...current,
          staff: (response as unknown as { staff?: Row[] }).staff,
        }));
      }
      setStatus(message);
      await loadOwnerOverview();
      await refreshLiveData({ force: true, silent: true });
    } catch (error) {
      console.error(`Owner mutation ${action} failed`, error);
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitAuthForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formObject(form);
    const email = stringValue(payload.email);
    const password = stringValue(payload.password);
    const displayName = stringValue(payload.displayName);

    try {
      setAuthLoading(true);
      setAuthStatus("Signing in...");

      if (!firebaseReady) {
        throw new Error(
          "Firebase web config is missing. Add the VITE_FIREBASE_* variables.",
        );
      }

      const profile = await signInStaff(email, password);
      setStaffProfile(profile);
      setAuthStatus(`Signed in as ${profile.displayName || profile.email}.`);
      form.reset();
    } catch (error) {
      setAuthStatus(errorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await signOutStaff();
    setData(null);
    setStaffProfile(null);
    setStatus("Signed out.");
    setAuthStatus(
      firebaseReady
        ? "Sign in with your staff account."
        : "Firebase web config is missing.",
    );
  }

  const appStyle = {
    "--coffee-field-image": `url(${coffeeBeanFieldUrl})`,
    "--joy-culture-strip": `url(${joyCultureStripUrl})`,
    "--joy-your-time": `url(${joyYourTimeUrl})`,
  } as CSSProperties;

  if (!staffProfile) {
    return (
      <AuthScreen
        authLoading={authLoading}
        authStatus={authStatus}
        onSubmit={submitAuthForm}
      />
    );
  }

  return (
    <div className="app-shell" style={appStyle}>
      <header>
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <img alt="" src={joyCornerMarkUrl} />
            </div>
            <div>
              <h1>Joy Corner Loyalty</h1>
              <p className="muted">
                Standalone staff web app connected to Google Sheets
              </p>
            </div>
          </div>
          <img className="joy-time-signature" alt="" src={joyYourTimeUrl} />
          <div className="account-chip">
            <span>{staffProfile.displayName || staffProfile.email}</span>
            <strong>{roleLabel(staffProfile.role)}</strong>
            <button onClick={() => void handleSignOut()} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="toolbar">
          <p className="status">{status}</p>
          <div className="toolbar-actions">
            <button
              className={autoScroll ? "primary" : "secondary"}
              onClick={() => setAutoScroll((value) => !value)}
              type="button"
            >
              Auto Scroll
            </button>
            <button
              className="secondary"
              disabled={loading}
              onClick={() => void loadData()}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="brand-ribbon" aria-hidden="true" />

        <nav className="section-nav" aria-label="App sections">
          {visibleTabs.map(([id, label]) => (
            <button
              className={`tab-button ${activeTab === id ? "active" : ""}`}
              key={id}
              onClick={() => setActiveTab(id as TabId)}
              type="button"
            >
              <TabIcon id={id as TabId} />
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "dashboard" && (
          <DashboardView
            dashboard={connectedData.dashboard || {}}
            orders={filteredRows(dashboardOrders, "dashboardOrders").slice(
              0,
              12,
            )}
            topItems={filteredRows(
              connectedData.dashboardTopItems || [],
              "topItems",
            )}
            role={currentRole}
            canAccept={canRunCurrentAction("acceptOrder")}
            canPrepare={canRunCurrentAction("markReceiptPreparing")}
            canReady={canRunCurrentAction("markReceiptReady")}
            canPickup={canRunCurrentAction("pickupOrder")}
            canSetPayment={canRunCurrentAction("updateReceiptPayment")}
            canCancel={canRunCurrentAction("cancelReceipt")}
            onFilter={setFilter}
            filters={filters}
            onSetPayment={setReceiptPayment}
            onCollectPayment={collectReceiptPayment}
            onDone={markReceiptDone}
            onStatus={markReceiptStatus}
          />
        )}

        {activeTab === "customers" && (
          <CustomersView
            customers={filteredRows(customers, "customers")}
            onAddCustomer={addCustomer}
            onFilter={setFilter}
            onRemoveCustomer={(row) => void removeCustomer(row)}
            filters={filters}
            role={currentRole}
          />
        )}

        {activeTab === "orders" && (
          <OrdersView
            customers={customers}
            dashboardOrders={filteredRows(dashboardOrders, "orders")}
            lists={lists}
            menu={menu}
            receiptItems={receiptItems}
            onAddItem={addReceiptItemFromForm}
            onClearReceipt={() => setReceiptItems([])}
            onFilter={setFilter}
            filters={filters}
            onRemoveItem={(index) =>
              setReceiptItems((items) =>
                items.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            onSetPayment={(payload, paymentStatus) =>
              void setReceiptPayment(payload, paymentStatus)
            }
            onCollectPayment={(payload) => void collectReceiptPayment(payload)}
            onDone={(payload) => void markReceiptDone(payload)}
            onStatus={(payload, action, message) =>
              void markReceiptStatus(payload, action, message)
            }
            role={currentRole}
            canAccept={canRunCurrentAction("markReceiptAccepted")}
            canPrepare={canRunCurrentAction("markReceiptPreparing")}
            canReady={canRunCurrentAction("markReceiptReady")}
            canPickup={canRunCurrentAction("markReceiptDone")}
            canSetPayment={canRunCurrentAction("updateReceiptPayment")}
            canCancel={canRunCurrentAction("cancelReceipt")}
            savingAction={savingAction}
            onSubmitReceipt={submitReceipt}
          />
        )}

        {activeTab === "rewards" && (
          <RewardsView
            rewards={filteredRows(connectedData.rewards || [], "rewards")}
            winners={filteredRows(connectedData.winners || [], "winners")}
            onFilter={setFilter}
            filters={filters}
            onGenerateVoucher={(row) => void generateVoucher(row)}
          />
        )}

        {activeTab === "vouchers" && (
          <VouchersView
            vouchers={filteredRows(connectedData.vouchers || [], "vouchers")}
            onFilter={setFilter}
            filters={filters}
            onRedeem={(code) => void redeemVoucher(code)}
          />
        )}

        {activeTab === "unpaid" && (
          <UnpaidView
            unpaid={filteredRows(connectedData.unpaid || [], "unpaid")}
            onCollect={(row) => void collectUnpaid(row)}
            onFilter={setFilter}
            filters={filters}
          />
        )}

        {activeTab === "history" && (
          <HistoryView
            days={filteredRows(connectedData.historyDays || [], "history")}
            filters={filters}
            onFilter={setFilter}
          />
        )}

        {activeTab === "menu" && (
          <MenuView
            menu={filteredRows(menu, "menu")}
            onFilter={setFilter}
            filters={filters}
          />
        )}

        {activeTab === "owner" && currentRole === "owner" && (
          <OwnerTools
            loading={loading}
            menu={menu}
            onCheckHealth={() =>
              void runOwnerAction(
                "debugSheets",
                "Google Sheets health checked.",
              )
            }
            onOrganizeSheets={() =>
              void runOwnerAction(
                "organizeSpreadsheet",
                "Google Sheets hierarchy synchronized.",
              )
            }
            onRefresh={() => void loadOwnerOverview()}
            onRetrySync={() =>
              void runOwnerMutation(
                "retrySyncFailures",
                {},
                "Sync retry request recorded.",
              )
            }
            onResetDay={() => void resetDay()}
            onSetStaffActive={(payload) =>
              void runOwnerMutation(
                "setStaffActive",
                payload,
                "Staff access updated.",
              )
            }
            onSetStaffPermissions={(payload) =>
              void runOwnerMutation(
                "setStaffPermissions",
                payload,
                "Staff permissions updated.",
              )
            }
            onSetStaffRole={(payload) =>
              void runOwnerMutation(
                "setStaffRole",
                payload,
                "Staff role updated.",
              )
            }
            onSyncMenu={() =>
              void runOwnerMutation(
                "syncMenuToSheets",
                {},
                "Menu synchronized to Google Sheets.",
              )
            }
            onUpdateMenuItem={(payload) =>
              void runOwnerMutation(
                "updateMenuItem",
                payload,
                "Menu item updated.",
              )
            }
            onUpsertStaff={(payload) =>
              void runOwnerMutation("upsertStaff", payload, "Staff saved.")
            }
            ownerData={ownerData}
            staffProfile={staffProfile}
            status={status}
          />
        )}

        <div className="scroll-dock">
          <button
            aria-label="Scroll to top"
            onClick={() => window.scrollTo({ behavior: "smooth", top: 0 })}
            type="button"
          >
            Top
          </button>
          <button
            aria-label="Scroll to bottom"
            onClick={() =>
              window.scrollTo({
                behavior: "smooth",
                top: document.documentElement.scrollHeight,
              })
            }
            type="button"
          >
            Bottom
          </button>
        </div>
      </main>
    </div>
  );
}

function AuthScreen({
  authLoading,
  authStatus,
  onSubmit,
}: {
  authLoading: boolean;
  authStatus: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="auth-shell"
      style={
        {
          "--coffee-field-image": `url(${coffeeBeanFieldUrl})`,
          "--joy-culture-strip": `url(${joyCultureStripUrl})`,
          "--joy-your-time": `url(${joyYourTimeUrl})`,
        } as CSSProperties
      }
    >
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <img alt="" src={joyCornerMarkUrl} />
          </div>
          <div>
            <h1>Joy Corner Loyalty</h1>
            <p className="muted">Staff sign-in for the Google Sheets app</p>
          </div>
        </div>
        <img className="auth-signature" alt="" src={joyYourTimeUrl} />
        <form className="auth-form" onSubmit={onSubmit}>
          <Field
            label="Staff Email"
            name="email"
            placeholder="staff@joycorner.com"
            required
            type="email"
          />
          <Field
            label="Password"
            name="password"
            placeholder="At least 6 characters"
            required
            type="password"
          />
          <button className="primary" disabled={authLoading} type="submit">
            Sign In
          </button>
        </form>
        <p className="status">{authStatus}</p>
        {firebaseReady ? (
          <div className="muted auth-note">
            <p>
              Firebase sign-in is configured. The backend allows only emails
              with an active Firestore staff profile.
            </p>
          </div>
        ) : (
          <div className="muted auth-note">
            <p>
              Firebase web config is missing. Add the required Firebase
              environment variables.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function CustomerOrderPage() {
  const [customerUser, setCustomerUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [status, setStatus] = useState(
    firebaseReady
      ? "Create an account or sign in to request an order."
      : "Firebase web config is missing.",
  );
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<Row[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Row[]>([]);
  const [selectedCustomerItemId, setSelectedCustomerItemId] = useState("");

  useEffect(() => {
    return watchFirebaseUser(
      (user) => setCustomerUser(user),
      (message) => setStatus(message),
    );
  }, []);

  useEffect(() => {
    if (!customerUser) return;
    void loadCustomerData();
  }, [customerUser?.uid]);

  async function loadCustomerData() {
    try {
      setLoading(true);
      const [menuResponse, ordersResponse] = await Promise.all([
        callServer("customerMenu"),
        callServer("customerOrders"),
      ]);
      setMenu(menuResponse.data?.menu || menuResponse.menu || []);
      setCustomerOrders(ordersResponse.orders || []);
      setStatus("Choose an item and send your request.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitCustomerAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formObject(form);
    const email = stringValue(payload.email);
    const password = stringValue(payload.password);
    const displayName = stringValue(payload.displayName);
    const phone = stringValue(payload.phone);

    try {
      setLoading(true);
      setStatus(
        authMode === "signup" ? "Creating account..." : "Signing in...",
      );
      if (authMode === "signup") {
        await signUpCustomer(email, password, displayName, phone);
        await callServer("registerCustomerProfile", {
          customerName: displayName,
          displayName,
          phone,
        });
      } else {
        await signInCustomer(email, password);
      }
      form.reset();
      setStatus("Signed in. Loading menu...");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitCustomerOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formObject(form);
    const item = menu.find(
      (row) => stringValue(row.itemId) === stringValue(payload.itemId),
    );

    if (item) {
      payload.itemName = menuName(item);
      payload.category = stringValue(item.category);
      payload.unitPrice =
        numberValue(item.suggestedPrice) || firstPrice(menuPrice(item));
    }
    payload.clientRequestId =
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    try {
      setLoading(true);
      setStatus("Sending order request...");
      const response = await callServer("submitCustomerOrder", payload);
      setStatus(response.message || "Order request sent to Joy Corner.");
      form.reset();
      setSelectedCustomerItemId("");
      await loadCustomerData();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function transitionCustomerOrder(
    action: "confirmCustomerOrder" | "cancelCustomerOrder",
    orderId: string,
  ) {
    const reason =
      action === "cancelCustomerOrder"
        ? window.prompt("Cancellation reason", "Customer changed their mind")
        : "";
    if (reason === null) return;
    try {
      setLoading(true);
      const response = await callServer(action, { orderId, reason });
      setCustomerOrders(response.orders || []);
      setStatus(response.message || "Order updated.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const appStyle = {
    "--coffee-field-image": `url(${coffeeBeanFieldUrl})`,
    "--joy-culture-strip": `url(${joyCultureStripUrl})`,
    "--joy-your-time": `url(${joyYourTimeUrl})`,
  } as CSSProperties;
  const selectedCustomerItem = menu.find(
    (item) => stringValue(item.itemId) === selectedCustomerItemId,
  );
  const selectedCustomerSizes = Array.isArray(selectedCustomerItem?.sizes)
    ? (selectedCustomerItem.sizes as Row[]).filter(
        (size) => size.active !== false && numberValue(size.price) > 0,
      )
    : [];

  return (
    <div className="app-shell customer-order-shell" style={appStyle}>
      <header>
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <img alt="" src={joyCornerMarkUrl} />
            </div>
            <div>
              <h1>Joy Corner</h1>
              <p className="muted">Customer order request</p>
            </div>
          </div>
          <img className="joy-time-signature" alt="" src={joyYourTimeUrl} />
          {customerUser && (
            <div className="account-chip">
              <span>{customerUser.email}</span>
              <button onClick={() => void signOutStaff()} type="button">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="customer-order-main">
        <section className="panel customer-order-panel">
          <PanelHead
            title={customerUser ? "Request an Order" : "Customer Access"}
            note={
              customerUser
                ? "Your request goes to the cafe staff dashboard"
                : "Sign up or sign in"
            }
          />
          <div className="panel-body">
            {!customerUser ? (
              <form
                className="auth-form customer-order-form"
                onSubmit={submitCustomerAuth}
              >
                <div className="segmented">
                  <button
                    className={authMode === "signup" ? "primary" : "secondary"}
                    onClick={() => setAuthMode("signup")}
                    type="button"
                  >
                    Sign Up
                  </button>
                  <button
                    className={authMode === "signin" ? "primary" : "secondary"}
                    onClick={() => setAuthMode("signin")}
                    type="button"
                  >
                    Sign In
                  </button>
                </div>
                {authMode === "signup" && (
                  <>
                    <Field
                      label="Name"
                      name="displayName"
                      placeholder="Your name"
                      required
                    />
                    <Field
                      label="Phone / WhatsApp"
                      name="phone"
                      placeholder="01xxxxxxxxx"
                      required
                    />
                  </>
                )}
                <Field
                  label="Email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
                <Field
                  label="Password"
                  name="password"
                  placeholder="At least 6 characters"
                  required
                  type="password"
                />
                <button
                  className="primary"
                  disabled={loading || !firebaseReady}
                  type="submit"
                >
                  Continue
                </button>
              </form>
            ) : (
              <form
                className="customer-order-form"
                onSubmit={submitCustomerOrder}
              >
                <Field
                  label="Your Name"
                  name="customerName"
                  placeholder="Name for the order"
                  required
                />
                <Field
                  label="Phone / WhatsApp"
                  name="phone"
                  placeholder="01xxxxxxxxx"
                  required
                />
                <label>
                  Item
                  <select
                    name="itemId"
                    onChange={(event) =>
                      setSelectedCustomerItemId(event.currentTarget.value)
                    }
                    required
                    value={selectedCustomerItemId}
                  >
                    <option value="">Choose from menu</option>
                    {menu.map((item) => (
                      <option
                        key={stringValue(item.itemId)}
                        value={stringValue(item.itemId)}
                      >
                        {menuName(item)} -{" "}
                        {money(
                          numberValue(item.suggestedPrice) ||
                            firstPrice(menuPrice(item)),
                        )}{" "}
                        EGP
                      </option>
                    ))}
                  </select>
                </label>
                {selectedCustomerSizes.length > 0 && (
                  <label>
                    Size / Price
                    <select name="size" required>
                      {selectedCustomerSizes.map((size) => (
                        <option
                          key={stringValue(size.sizeId || size.size)}
                          value={stringValue(size.size || size.sizeName)}
                        >
                          {stringValue(size.size || size.sizeName)} -{" "}
                          {money(numberValue(size.price))} EGP
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Quantity
                  <input
                    defaultValue="1"
                    min="1"
                    name="qty"
                    required
                    type="number"
                  />
                </label>
                <Field
                  label="Pickup / Table / Notes"
                  name="orderPlace"
                  placeholder="Pickup, table, car, or note"
                />
                <label>
                  Extra Notes
                  <textarea
                    name="notes"
                    placeholder="Sugar, ice, timing, or anything helpful"
                  />
                </label>
                <button
                  className="primary"
                  disabled={loading || !menu.length}
                  type="submit"
                >
                  Send Request
                </button>
              </form>
            )}
            {customerUser && (
              <section
                className="customer-order-history"
                aria-label="Your orders"
              >
                <h2>Your Orders</h2>
                {customerOrders.length ? (
                  customerOrders.map((order) => {
                    const orderId = stringValue(order.orderId);
                    const orderStatus = normalizePreparationStatus(
                      order.orderStatus,
                    );
                    return (
                      <article className="customer-order-card" key={orderId}>
                        <div>
                          <strong>
                            {stringValue(order.receiptNumber || orderId)}
                          </strong>
                          <p>{stringValue(order.itemSummary)}</p>
                        </div>
                        <div className="actions">
                          <PreparationStatusBadge status={orderStatus} />
                          <PaymentStatusBadge
                            status={stringValue(order.paymentStatus)}
                          />
                          {orderStatus === "Awaiting Confirmation" && (
                            <button
                              className="primary"
                              disabled={loading}
                              onClick={() =>
                                void transitionCustomerOrder(
                                  "confirmCustomerOrder",
                                  orderId,
                                )
                              }
                              type="button"
                            >
                              Confirm
                            </button>
                          )}
                          {[
                            "Requested",
                            "Awaiting Confirmation",
                            "Confirmed",
                          ].includes(orderStatus) && (
                            <button
                              className="danger"
                              disabled={loading}
                              onClick={() =>
                                void transitionCustomerOrder(
                                  "cancelCustomerOrder",
                                  orderId,
                                )
                              }
                              type="button"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="muted">No order requests yet.</p>
                )}
              </section>
            )}
            <p className="status">{status}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function OwnerTools({
  loading,
  menu,
  onCheckHealth,
  onOrganizeSheets,
  onRefresh,
  onRetrySync,
  onResetDay,
  onSetStaffActive,
  onSetStaffPermissions,
  onSetStaffRole,
  onSyncMenu,
  onUpdateMenuItem,
  onUpsertStaff,
  ownerData,
  staffProfile,
  status,
}: {
  loading: boolean;
  menu: Row[];
  onCheckHealth: () => void;
  onOrganizeSheets: () => void;
  onRefresh: () => void;
  onRetrySync: () => void;
  onResetDay: () => void;
  onSetStaffActive: (payload: Record<string, unknown>) => void;
  onSetStaffPermissions: (payload: Record<string, unknown>) => void;
  onSetStaffRole: (payload: Record<string, unknown>) => void;
  onSyncMenu: () => void;
  onUpdateMenuItem: (payload: Record<string, unknown>) => void;
  onUpsertStaff: (payload: Record<string, unknown>) => void;
  ownerData: OwnerData;
  staffProfile: StaffProfile;
  status: string;
}) {
  const [confirmation, setConfirmation] = useState("");
  const firstMenuItem = menu[0];
  const [selectedMenuItemId, setSelectedMenuItemId] = useState(
    stringValue(firstMenuItem?.itemId),
  );
  const canReset = confirmation === "RESET JOY CORNER DAY";
  const selectedMenuItem =
    menu.find((item) => stringValue(item.itemId) === selectedMenuItemId) ||
    firstMenuItem;

  useEffect(() => {
    if (!selectedMenuItemId && firstMenuItem) {
      setSelectedMenuItemId(stringValue(firstMenuItem.itemId));
    }
  }, [firstMenuItem, selectedMenuItemId]);

  return (
    <div className="owner-grid">
      <section className="panel owner-tools">
        <PanelHead title="Owner" note={staffProfile.email} />
        <div className="panel-body owner-simple-grid">
          <div className="owner-reset-card">
            <h3>End Day Reset</h3>
            <p className="muted">
              Archives today&apos;s sales and clears the live dashboard while
              keeping customers, rewards, and unpaid balances.
            </p>
            <label>
              Confirmation
              <input
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Type RESET JOY CORNER DAY"
                value={confirmation}
              />
            </label>
            <button
              className="danger"
              disabled={!canReset || loading}
              onClick={() => {
                const confirmed = window.confirm(
                  "Archive today's sales and reset the live dashboard? Customer history, rewards, and unpaid balances stay available.",
                );
                if (confirmed) onResetDay();
              }}
              type="button"
            >
              Reset Done
            </button>
          </div>
          <div className="owner-status">
            <span className="muted">Latest system message</span>
            <strong>{status}</strong>
          </div>
          <button
            className="secondary"
            disabled={loading}
            onClick={onRefresh}
            type="button"
          >
            Refresh
          </button>
          <button
            className="primary"
            disabled={loading}
            onClick={onOrganizeSheets}
            type="button"
          >
            Fix Excel Sheet
          </button>
          <button className="secondary" onClick={onCheckHealth} type="button">
            Check Sheet
          </button>
        </div>
      </section>

      <details className="panel owner-tools owner-advanced">
        <summary>Staff, menu, and sync tools</summary>
        <div className="panel-body owner-admin-stack">
          <div className="owner-action-grid">
            <button
              className="secondary"
              disabled={loading}
              onClick={onSyncMenu}
              type="button"
            >
              Seed Menu Sheet
            </button>
            <button
              className="secondary"
              disabled={loading}
              onClick={onRetrySync}
              type="button"
            >
              Retry Sync Failures
            </button>
          </div>

          <section>
            <h3>Staff Management</h3>
            <StaffUpsertForm loading={loading} onSave={onUpsertStaff} />
            <div className="table-like compact">
              {(ownerData.staff || []).map((staff) => {
                const uid = stringValue(staff.uid);
                return (
                  <div
                    className="data-row"
                    key={uid || stringValue(staff.email)}
                  >
                    <div>
                      <strong>
                        {stringValue(staff.displayName || staff.email)}
                      </strong>
                      <small>{stringValue(staff.email)}</small>
                    </div>
                    <select
                      aria-label="Staff role"
                      defaultValue={stringValue(staff.role || "waiter")}
                      onChange={(event) =>
                        onSetStaffRole({ role: event.target.value, uid })
                      }
                    >
                      {["owner", "manager", "cashier", "waiter", "barista"].map(
                        (role) => (
                          <option key={role} value={role}>
                            {roleLabel(role as StaffRole)}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      className={
                        activeValue(staff.active) ? "danger" : "secondary"
                      }
                      disabled={loading || uid === staffProfile.uid}
                      onClick={() =>
                        onSetStaffActive({
                          active: !activeValue(staff.active),
                          uid,
                        })
                      }
                      type="button"
                    >
                      {activeValue(staff.active) ? "Deactivate" : "Activate"}
                    </button>
                    <PermissionEditor
                      catalog={ownerData.permissionCatalog || []}
                      revokedPermissions={stringArrayValue(
                        staff.revoke || staff.revokedPermissions,
                      )}
                      permissions={stringArrayValue(
                        staff.grant || staff.permissions,
                      )}
                      role={stringValue(staff.role || "waiter") as StaffRole}
                      uid={uid}
                      onSave={onSetStaffPermissions}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3>Menu Management</h3>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                onUpdateMenuItem(formObject(event.currentTarget));
              }}
            >
              <label className="wide">
                Menu Item
                <select
                  name="itemId"
                  onChange={(event) =>
                    setSelectedMenuItemId(event.target.value)
                  }
                  value={selectedMenuItemId}
                >
                  {menu.map((item) => (
                    <option
                      key={stringValue(item.itemId)}
                      value={stringValue(item.itemId)}
                    >
                      {menuName(item)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Item Name"
                name="itemName"
                required
                value={menuName(selectedMenuItem || {})}
              />
              <Field
                label="Category"
                name="category"
                required
                value={stringValue(selectedMenuItem?.category)}
              />
              <Field
                label="Price Text"
                name="price"
                required
                value={menuPrice(selectedMenuItem || {})}
              />
              <label>
                Active
                <select
                  name="active"
                  defaultValue={
                    activeValue(selectedMenuItem?.active) ? "true" : "false"
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Archived / Sold Out</option>
                </select>
              </label>
              <button className="primary" disabled={loading} type="submit">
                Update Menu Item
              </button>
            </form>
          </section>

          <section className="owner-tools-body">
            <div>
              <h3>Recent Audit Events</h3>
              {(ownerData.auditLogs || []).slice(0, 6).map((event, index) => (
                <p
                  className="muted"
                  key={`${stringValue(event.auditId)}-${index}`}
                >
                  {stringValue(event.timestamp)} | {stringValue(event.action)} |{" "}
                  {stringValue(event.entityType)}
                </p>
              ))}
              {!(ownerData.auditLogs || []).length && (
                <p className="muted">No audit events loaded.</p>
              )}
            </div>
            <div>
              <h3>Sync Failures</h3>
              {(ownerData.syncFailures || [])
                .slice(0, 6)
                .map((failure, index) => (
                  <p
                    className="muted"
                    key={`${stringValue(failure.syncFailureId)}-${index}`}
                  >
                    {stringValue(failure.entityType)} |{" "}
                    {stringValue(failure.errorMessage)}
                  </p>
                ))}
              {!(ownerData.syncFailures || []).length && (
                <p className="muted">No sync failures loaded.</p>
              )}
            </div>
          </section>
          <SyncCenter />
        </div>
      </details>
    </div>
  );
}

function StaffUpsertForm({
  loading,
  onSave,
}: {
  loading: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [active, setActive] = useState("true");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [grant, setGrant] = useState("");
  const [password, setPassword] = useState("");
  const [revoke, setRevoke] = useState("");
  const [role, setRole] = useState<StaffRole>("waiter");
  const resolution = resolveEffectivePermissions({ grant, revoke, role });
  const warnings = staffPermissionWarnings({
    displayName,
    email,
    grant,
    password,
    resolution,
    revoke,
  });

  function resetOverrides() {
    setGrant("");
    setRevoke("");
  }

  function resetForm() {
    setActive("true");
    setDisplayName("");
    setEmail("");
    setGrant("");
    setPassword("");
    setRevoke("");
    setRole("waiter");
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          active: active === "true",
          displayName,
          email,
          grant,
          password,
          revoke,
          role,
        });
        resetForm();
      }}
    >
      <Field
        label="Email"
        name="email"
        onChange={setEmail}
        required
        type="email"
        value={email}
      />
      <Field
        label="Display Name"
        name="displayName"
        onChange={setDisplayName}
        required
        value={displayName}
      />
      <label>
        Role
        <select
          name="role"
          onChange={(event) => setRole(event.target.value as StaffRole)}
          value={role}
        >
          {["owner", "manager", "cashier", "waiter", "barista"].map(
            (staffRole) => (
              <option key={staffRole} value={staffRole}>
                {roleLabel(staffRole as StaffRole)}
              </option>
            ),
          )}
        </select>
      </label>
      <Field
        label="Temporary Password"
        name="password"
        onChange={setPassword}
        type="password"
        value={password}
      />
      <label>
        Active
        <select
          name="active"
          onChange={(event) => setActive(event.target.value)}
          value={active}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </label>
      <label className="wide">
        Grant Overrides
        <textarea
          name="grant"
          onChange={(event) => setGrant(event.target.value)}
          placeholder="receipts.print, staff.view"
          value={grant}
        />
      </label>
      <label className="wide">
        Revoke Overrides
        <textarea
          name="revoke"
          onChange={(event) => setRevoke(event.target.value)}
          placeholder="customers.delete, day.reset"
          value={revoke}
        />
      </label>
      <PermissionPreview
        effective={resolution.effectivePermissions}
        grant={resolution.grant}
        revoke={resolution.revoke}
        role={role}
        roleDefaults={resolution.roleDefaults}
        warnings={warnings}
      />
      <div className="actions wide">
        <button className="secondary" onClick={resetOverrides} type="button">
          Reset Overrides
        </button>
        <button
          className="primary"
          disabled={loading || warnings.blocking.length > 0}
          type="submit"
        >
          Save Staff
        </button>
      </div>
    </form>
  );
}

function PermissionPreview({
  effective,
  grant,
  revoke,
  role,
  roleDefaults,
  warnings,
}: {
  effective: string[];
  grant: string[];
  revoke: string[];
  role: StaffRole;
  roleDefaults: string[];
  warnings: { blocking: string[]; notices: string[] };
}) {
  return (
    <div className="wide permission-preview">
      <strong>Role: {roleLabel(role)}</strong>
      <PermissionList title="Role Default Permissions" values={roleDefaults} />
      <PermissionList title="Grant Overrides" values={grant} />
      <PermissionList title="Revoke Overrides" values={revoke} />
      <PermissionList title="Final Effective Permissions" values={effective} />
      {[...warnings.blocking, ...warnings.notices].map((warning) => (
        <p className="muted" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  );
}

function PermissionList({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  return (
    <div className="permission-preview-section">
      <span className="muted">{title}</span>
      <p>{values.length ? values.join(", ") : "None"}</p>
    </div>
  );
}

function staffPermissionWarnings({
  displayName,
  email,
  grant,
  password,
  resolution,
}: {
  displayName: string;
  email: string;
  grant: string;
  password: string;
  resolution: ReturnType<typeof resolveEffectivePermissions>;
  revoke: string;
}) {
  const blocking: string[] = [];
  const notices: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    blocking.push("Enter a valid email.");
  if (!displayName.trim()) blocking.push("Display name is required.");
  if (password && password.length < 6)
    blocking.push("Temporary password must be at least 6 characters.");
  if (!password)
    notices.push(
      "Temporary password is required when creating a brand new Auth user.",
    );
  if (resolution.unknown.length)
    notices.push(`Unknown permission: ${resolution.unknown.join(", ")}`);
  if (resolution.duplicates.length)
    notices.push(`Duplicate permission: ${resolution.duplicates.join(", ")}`);
  if (resolution.overlaps.length)
    notices.push(
      `Revoke wins over Grant for: ${resolution.overlaps.join(", ")}`,
    );
  if (grant && !resolution.grant.length)
    notices.push("Grant overrides contain no valid permission names.");
  return { blocking, notices };
}

function PermissionEditor({
  catalog,
  onSave,
  permissions,
  revokedPermissions,
  role,
  uid,
}: {
  catalog: string[];
  onSave: (payload: Record<string, unknown>) => void;
  permissions: string[];
  revokedPermissions: string[];
  role: StaffRole;
  uid: string;
}) {
  const [grantList, setGrantList] = useState(permissions.join(", "));
  const [revokeList, setRevokeList] = useState(revokedPermissions.join(", "));
  const resolution = resolveEffectivePermissions({
    grant: grantList,
    revoke: revokeList,
    role,
  });

  useEffect(() => {
    setGrantList(permissions.join(", "));
    setRevokeList(revokedPermissions.join(", "));
  }, [permissions.join("|"), revokedPermissions.join("|")]);

  return (
    <details className="permission-editor">
      <summary>Permissions</summary>
      <label>
        Grant
        <textarea
          onChange={(event) => setGrantList(event.target.value)}
          placeholder={catalog.slice(0, 4).join(", ")}
          value={grantList}
        />
      </label>
      <label>
        Revoke
        <textarea
          onChange={(event) => setRevokeList(event.target.value)}
          placeholder="customers.delete, day.reset"
          value={revokeList}
        />
      </label>
      <button
        className="secondary"
        onClick={() =>
          onSave({
            grant: grantList,
            revoke: revokeList,
            uid,
          })
        }
        type="button"
      >
        Save Permissions
      </button>
      <PermissionList
        title="Effective Permissions"
        values={resolution.effectivePermissions}
      />
    </details>
  );
}

function DashboardView({
  canAccept,
  canCancel,
  canPickup,
  canPrepare,
  canReady,
  canSetPayment,
  dashboard,
  orders,
  topItems,
  filters,
  role,
  onFilter,
  onCollectPayment,
  onSetPayment,
  onStatus,
  onDone,
}: {
  canAccept: boolean;
  canCancel: boolean;
  canPickup: boolean;
  canPrepare: boolean;
  canReady: boolean;
  canSetPayment: boolean;
  dashboard: Dashboard;
  orders: Row[];
  topItems: Row[];
  filters: Record<string, string>;
  role: StaffRole;
  onFilter: (id: string, value: string) => void;
  onCollectPayment: (payload: string) => void;
  onSetPayment: (payload: string, paymentStatus: string) => void;
  onStatus: (payload: string, action: string, message: string) => void;
  onDone: (payload: string) => void;
}) {
  const isBarista = role === "barista";
  const displayedOrders = isBarista
    ? orders.filter((order) => {
        const status = normalizePreparationStatus(order.orderStatus);
        return status !== "Picked Up" && status !== "Cancelled";
      })
    : orders;

  return (
    <>
      {!isBarista && (
        <div className="grid stats">
          <Stat label="Customers" value={dashboard.totalCustomers} />
          <Stat label="Receipts" value={dashboard.totalOrders} />
          <Stat label="Items" value={dashboard.totalItems} />
          <Stat label="Sales" value={money(dashboard.totalSales)} />
          <Stat label="Paid" value={money(dashboard.totalPaid)} />
          <Stat label="Unpaid" value={money(dashboard.totalUnpaid)} />
          <Stat label="Picked Up" value={dashboard.pickedUpReceipts} />
          <Stat label="Winners" value={dashboard.totalWinners} />
        </div>
      )}

      <div className={isBarista ? "dashboard-grid single" : "dashboard-grid"}>
        <section className="panel">
          <PanelHead
            title="Barista Pickup Board"
            note={`${displayedOrders.length} active receipt(s)`}
          />
          <FilterBar
            id="dashboardOrders"
            placeholder="Filter order board"
            value={filters.dashboardOrders}
            onChange={onFilter}
            quickFilters={
              isBarista
                ? [
                    ["", "All"],
                    ["__unpaid", "Unpaid"],
                    ["__paid", "Paid"],
                  ]
                : [
                    ["", "All"],
                    ["__unpaid", "Unpaid"],
                    ["__paid", "Paid"],
                  ]
            }
          />
          {displayedOrders.length ? (
            <div className="receipt-board">
              {displayedOrders.map((order, index) => (
                <OrderTicket
                  key={`${stringValue(order.receiptId)}-${index}`}
                  order={order}
                  onDone={onDone}
                  onCollectPayment={onCollectPayment}
                  onSetPayment={onSetPayment}
                  onStatus={onStatus}
                  canAccept={canAccept}
                  canCancel={isBarista ? false : canCancel}
                  canPickup={canPickup}
                  canPrepare={canPrepare}
                  canReady={canReady}
                  canSetPayment={isBarista ? false : canSetPayment}
                  showPaymentActions={!isBarista && canSetPayment}
                  showPickupAction
                  view="barista"
                />
              ))}
            </div>
          ) : (
            <div className="panel-empty">No recent orders yet.</div>
          )}
        </section>

        {!isBarista && (
          <section className="panel">
            <PanelHead title="Top Drinks" note="Highest ordered" />
            <FilterBar
              id="topItems"
              placeholder="Filter best sellers"
              value={filters.topItems}
              onChange={onFilter}
            />
            {topItems.length ? (
              <div className="stock-list">
                {topItems.map((item, index) => (
                  <StockCard
                    item={item}
                    key={`${stringValue(item.itemName)}-${index}`}
                  />
                ))}
              </div>
            ) : (
              <div className="panel-empty">No sales to rank yet.</div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function CustomersView({
  customers,
  filters,
  onAddCustomer,
  onFilter,
  onRemoveCustomer,
  role,
}: {
  customers: Row[];
  filters: Record<string, string>;
  onAddCustomer: (event: FormEvent<HTMLFormElement>) => void;
  onFilter: (id: string, value: string) => void;
  onRemoveCustomer: (row: Row) => void;
  role: StaffRole;
}) {
  const canRemoveCustomers = role === "owner" || role === "cashier";

  return (
    <>
      <section className="panel">
        <PanelHead title="Add Customer" />
        <div className="panel-body">
          <form className="form-grid" onSubmit={onAddCustomer}>
            <Field label="Full Name" name="fullName" required />
            <Field label="Phone/WhatsApp" name="phone" required type="tel" />
            <Field label="Favorite Drink" name="favoriteDrink" />
            <Field label="Birthday" name="birthday" type="date" />
            <label className="wide">
              Notes
              <textarea name="notes" />
            </label>
            <div>
              <button className="primary" type="submit">
                Add Customer
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <PanelHead title="Customers" />
        <FilterBar
          id="customers"
          placeholder="Filter customers"
          value={filters.customers}
          onChange={onFilter}
        />
        <DataTable
          action={
            canRemoveCustomers
              ? (row) => (
                  <button
                    className="danger"
                    onClick={() => onRemoveCustomer(row)}
                    type="button"
                  >
                    Remove
                  </button>
                )
              : undefined
          }
          columns={[
            ["customerId", "ID"],
            ["fullName", "Name"],
            ["phoneWhatsApp", "Phone"],
            ["favoriteDrink", "Favorite"],
            ["joinDate", "Joined"],
            ["lastVisit", "Last Visit"],
            ["totalOrders", "Orders"],
            ["totalSpent", "Spent"],
            ["unpaidBalance", "Unpaid"],
            ["freeDrinksReady", "Free Drinks"],
          ]}
          rows={customers}
        />
      </section>
    </>
  );
}

function OrdersView({
  canAccept,
  canCancel,
  canPickup,
  canPrepare,
  canReady,
  canSetPayment,
  customers,
  dashboardOrders,
  filters,
  lists,
  menu,
  receiptItems,
  onAddItem,
  onClearReceipt,
  onDone,
  onFilter,
  onCollectPayment,
  onRemoveItem,
  onSetPayment,
  onStatus,
  onSubmitReceipt,
  role,
  savingAction,
}: {
  canAccept: boolean;
  canCancel: boolean;
  canPickup: boolean;
  canPrepare: boolean;
  canReady: boolean;
  canSetPayment: boolean;
  customers: Row[];
  dashboardOrders: Row[];
  filters: Record<string, string>;
  lists: Record<string, string[]>;
  menu: Row[];
  receiptItems: ReceiptItem[];
  onAddItem: (form: HTMLFormElement) => void;
  onClearReceipt: () => void;
  onDone: (payload: string) => void;
  onFilter: (id: string, value: string) => void;
  onCollectPayment: (payload: string) => void;
  onRemoveItem: (index: number) => void;
  onSetPayment: (payload: string, paymentStatus: string) => void;
  onStatus: (payload: string, action: string, message: string) => void;
  onSubmitReceipt: (form: HTMLFormElement) => Promise<boolean>;
  role: StaffRole;
  savingAction: string | null;
}) {
  const [category, setCategory] = useState("All");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [customerPhoneInput, setCustomerPhoneInput] = useState("");
  const categories = useMemo(
    () => [
      "All",
      ...new Set(
        menu.map((item) => stringValue(item.category)).filter(Boolean),
      ),
    ],
    [menu],
  );
  const placeOptions = useMemo(
    () => buildPlaceOptions(lists, dashboardOrders),
    [dashboardOrders, lists],
  );
  const serviceOptions = lists.serviceType || [
    "Hall",
    "Outside",
    "Car",
    "Takeaway",
  ];
  const staffOptions = lists.staff || [];
  const carColorOptions = lists.carColor || [
    "Black",
    "White",
    "Silver",
    "Gray",
    "Red",
    "Blue",
  ];
  const visibleCustomers = useMemo(
    () => filterCustomersByNameOrPhone(customers, customerQuery),
    [customers, customerQuery],
  );
  const customerMatches = customerQuery.trim()
    ? visibleCustomers.slice(0, 5)
    : [];
  const visibleMenu = useMemo(
    () =>
      category === "All"
        ? menu
        : menu.filter((item) => stringValue(item.category) === category),
    [category, menu],
  );
  const selectedItem =
    menu.find((item) => stringValue(item.itemId) === selectedItemId) ||
    visibleMenu[0];
  const selectedSizes = selectedItem ? menuSizesFor(selectedItem) : [];
  const previewItems = receiptItems.length
    ? receiptItems
    : [{ qty: numberValue(qty) || 1, unitPrice: numberValue(unitPrice) }];
  const receiptTotals = safeReceiptTotals(previewItems, discount);
  const receiptCalculation = useMemo(
    () =>
      calculateReceipt({
        amountPaid: paymentStatus === "Unpaid" ? 0 : numberValue(paidAmount),
        items: previewItems,
        orderDiscount: receiptTotals.receiptDiscountAmount,
      }),
    [
      paidAmount,
      paymentStatus,
      previewItems,
      receiptTotals.receiptDiscountAmount,
    ],
  );
  const receiptSubtotal = receiptTotals.receiptSubtotal;
  const total = receiptCalculation.grandTotal;
  const remaining = receiptCalculation.remainingAmount;
  const change = receiptCalculation.changeAmount;
  const previewPaymentStatus = receiptCalculation.paymentStatus;

  useEffect(() => {
    if (!selectedItem && visibleMenu[0]) {
      setSelectedItemId(stringValue(visibleMenu[0].itemId));
      return;
    }
    if (selectedItem) {
      const sizes = menuSizesFor(selectedItem);
      const nextSize =
        sizes.find((size) => size.size === selectedSize)?.size ||
        stringValue(selectedItem.standardSize) ||
        sizes[0]?.size ||
        "Standard";
      const resolvedPrice = resolveMenuPrice(
        stringValue(selectedItem.itemId),
        nextSize,
        menuName(selectedItem),
      );
      const price =
        resolvedPrice?.price ||
        sizes.find((size) => size.size === nextSize)?.price ||
        numberValue(selectedItem.suggestedPrice) ||
        firstPrice(menuPrice(selectedItem));
      setUnitPrice(price ? String(price) : "");
      setSelectedSize(nextSize);
      setSelectedItemId(stringValue(selectedItem.itemId));
    }
  }, [category, selectedItemId, selectedSize, menu.length]);

  useEffect(() => {
    if (paymentStatus === "Paid") setPaidAmount(total ? String(total) : "");
    if (paymentStatus === "Unpaid") setPaidAmount("");
  }, [paymentStatus, total]);

  useEffect(() => {
    const queryDigits = digitsOnly(customerQuery);
    const normalizedQuery = customerQuery.trim().toLowerCase();
    if (!queryDigits && normalizedQuery.length < 2) return;

    const exactCustomer = customers.find((customer) => {
      const phoneDigits = digitsOnly(phoneOf(customer));
      const name = customerName(customer).toLowerCase();
      return (
        (queryDigits.length >= 7 &&
          phoneDigits &&
          phoneDigits.endsWith(queryDigits)) ||
        (normalizedQuery.length >= 2 && name === normalizedQuery)
      );
    });

    if (exactCustomer) {
      fillCustomer(exactCustomer);
      return;
    }

    const onlyVisibleCustomer = visibleCustomers[0];
    if (
      onlyVisibleCustomer &&
      visibleCustomers.length === 1 &&
      normalizedQuery.length >= 3
    ) {
      fillCustomer(onlyVisibleCustomer);
      return;
    }

    if (queryDigits.length >= 7) {
      setSelectedCustomerId("");
      setCustomerPhoneInput(customerQuery);
    }
  }, [customerQuery, customers, visibleCustomers]);

  function fillCustomer(customer: Row) {
    setSelectedCustomerId(customerIdOf(customer));
    setCustomerNameInput(customerName(customer));
    setCustomerPhoneInput(phoneOf(customer));
  }

  function chooseCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    const customer = customers.find((row) => customerIdOf(row) === customerId);
    if (customer) {
      fillCustomer(customer);
      return;
    }

    setCustomerNameInput("");
    setCustomerPhoneInput(customerQuery);
  }

  return (
    <>
      <section className="panel">
        <PanelHead
          title="Waiter New Receipt"
          note={`${receiptItems.length} item(s)`}
        />
        <div className="panel-body">
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              void onSubmitReceipt(form).then((saved) => {
                if (saved) {
                  setSelectedCustomerId("");
                  setCustomerQuery("");
                  setCustomerNameInput("");
                  setCustomerPhoneInput("");
                }
              });
            }}
          >
            <Field
              label="Find Customer"
              name="customerSearch"
              onChange={setCustomerQuery}
              placeholder="Search name or phone"
              value={customerQuery}
            />
            <label>
              Customer
              <select
                name="customerId"
                onChange={(event) => chooseCustomer(event.target.value)}
                value={selectedCustomerId}
              >
                <option value="">New customer / walk-in</option>
                {visibleCustomers.map((customer) => (
                  <option
                    key={customerIdOf(customer)}
                    value={customerIdOf(customer)}
                  >
                    {customerName(customer)}
                    {phoneOf(customer) ? ` - ${phoneOf(customer)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Customer Name"
              name="customerName"
              onChange={setCustomerNameInput}
              placeholder="New customer name"
              value={customerNameInput}
            />
            <Field
              label="Phone/WhatsApp"
              name="customerPhone"
              onChange={setCustomerPhoneInput}
              placeholder="010..."
              type="tel"
              value={customerPhoneInput}
            />
            {customerMatches.length > 0 && (
              <div
                className="customer-match-list wide"
                aria-label="Customer matches"
              >
                {customerMatches.map((customer) => (
                  <button
                    className={`customer-match ${selectedCustomerId === customerIdOf(customer) ? "active" : ""}`}
                    key={customerIdOf(customer)}
                    onClick={() => fillCustomer(customer)}
                    type="button"
                  >
                    <strong>{customerName(customer)}</strong>
                    <span>{phoneOf(customer) || "No phone"}</span>
                  </button>
                ))}
              </div>
            )}
            <label>
              Category
              <select
                name="menuCategory"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Menu Item
              <select
                name="itemId"
                onChange={(event) => {
                  setSelectedItemId(event.target.value);
                  setSelectedSize("");
                }}
                required
                value={selectedItemId}
              >
                {visibleMenu.map((item) => (
                  <option
                    key={stringValue(item.itemId)}
                    value={stringValue(item.itemId)}
                  >
                    {menuName(item)}
                    {menuPrice(item) ? ` - ${menuPrice(item)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size
              <select
                name="size"
                onChange={(event) => setSelectedSize(event.target.value)}
                required
                value={selectedSize}
              >
                {selectedSizes.map((size) => (
                  <option key={size.size} value={size.size}>
                    {size.size} - {money(size.price)} EGP
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Qty"
              name="qty"
              onChange={setQty}
              required
              type="number"
              value={qty}
            />
            <input name="unitPrice" type="hidden" value={unitPrice} />
            <p className="price-lock">
              Price locked from menu: <strong>{money(unitPrice)} EGP</strong>
            </p>
            <Field
              label="Discount (%)"
              name="receiptDiscountPercentage"
              onChange={setDiscount}
              placeholder="0"
              type="number"
              value={discount}
            />
            <Field
              label="Place Detail"
              list="orderPlaceOptions"
              name="orderPlace"
              placeholder="Table 4, Garden, Gate"
            />
            <datalist id="orderPlaceOptions">
              {placeOptions.map((place) => (
                <option key={place} value={place} />
              ))}
            </datalist>
            <label>
              Service Type
              <select name="serviceType">
                {serviceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Car Name"
              list="carNameOptions"
              name="carName"
              placeholder="Toyota, BMW, Hyundai"
            />
            <datalist id="carNameOptions">
              {[
                "Toyota",
                "Hyundai",
                "Kia",
                "Mercedes",
                "BMW",
                "Nissan",
                "Chevrolet",
              ].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Field
              label="Car Color"
              list="carColorOptions"
              name="carColor"
              placeholder="Black, White, Silver"
            />
            <datalist id="carColorOptions">
              {carColorOptions.map((color) => (
                <option key={color} value={color} />
              ))}
            </datalist>
            <label>
              Payment Status
              <select
                name="paymentStatus"
                onChange={(event) => setPaymentStatus(event.target.value)}
                value={paymentStatus}
              >
                {(lists.paymentStatus || ["Paid", "Unpaid", "Partial"]).map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>
            </label>
            <Field
              label="Paid Amount"
              name="paidAmount"
              onChange={setPaidAmount}
              type="number"
              value={paidAmount}
            />
            <label>
              Payment Method
              <select name="paymentMethod">
                {(lists.paymentMethod || ["Cash", "Visa", "Wallet"]).map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Staff
              <select name="staff">
                {!staffOptions.length && (
                  <option value="">No active staff found</option>
                )}
                {staffOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <p className="wide muted">
              {selectedItem
                ? `${stringValue(selectedItem.category) || "Menu"} | ${menuPrice(selectedItem) || "No price"}`
                : "No menu item selected."}
            </p>
            <p className="wide total-hint">
              Subtotal: {money(receiptSubtotal)} EGP | Discount:{" "}
              {money(receiptTotals.receiptDiscountPercentage)}% | Discount
              Amount: -{money(receiptTotals.receiptDiscountAmount)} EGP | Total:{" "}
              {money(total)} EGP | Paid now: {money(paidAmount)} EGP |
              Remaining: {money(remaining)} EGP | Change: {money(change)} EGP |
              Status: {previewPaymentStatus}
            </p>
            <label className="wide">
              Item Notes
              <textarea
                name="itemNotes"
                placeholder="No sugar, less ice, prep note for this item"
              />
            </label>
            <label className="wide">
              Order Notes
              <textarea name="notes" />
            </label>
            <div className="actions wide">
              <button
                className="secondary"
                onClick={(event) => onAddItem(event.currentTarget.form!)}
                type="button"
              >
                {savingAction === "addReceipt" ? "Adding..." : "Add Item"}
              </button>
              <button
                className="primary"
                disabled={savingAction === "addReceipt"}
                type="submit"
              >
                {savingAction === "addReceipt"
                  ? "Submitting..."
                  : "Submit Receipt"}
              </button>
              <button
                className="secondary"
                onClick={onClearReceipt}
                type="button"
              >
                Clear Receipt
              </button>
            </div>
            <div className="receipt-box wide">
              {receiptItems.length ? (
                <>
                  {receiptItems.map((item, index) => (
                    <div
                      className="receipt-row"
                      key={`${item.itemId}-${index}`}
                    >
                      <div>
                        <strong>{item.itemName}</strong>
                        <br />
                        <span className="muted">
                          {item.category}
                          {item.size ? ` | ${item.size}` : ""}
                        </span>
                      </div>
                      <div>x{item.qty}</div>
                      <div>{money(item.unitPrice)} EGP</div>
                      <button
                        className="danger"
                        onClick={() => onRemoveItem(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="receipt-total">
                    <span>Subtotal</span>
                    <span>{money(receiptTotals.receiptSubtotal)} EGP</span>
                  </div>
                  <div className="receipt-total">
                    <span>
                      Discount: {money(receiptTotals.receiptDiscountPercentage)}
                      %
                    </span>
                    <span>
                      -{money(receiptTotals.receiptDiscountAmount)} EGP
                    </span>
                  </div>
                  <div className="receipt-total">
                    <span>Total</span>
                    <span>{money(receiptTotals.receiptTotal)} EGP</span>
                  </div>
                </>
              ) : (
                <div className="muted">No items on this receipt yet.</div>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <PanelHead title="Waiter Payment History" />
        <FilterBar
          id="orders"
          placeholder="Filter receipts"
          value={filters.orders}
          onChange={onFilter}
          quickFilters={[
            ["", "All"],
            ["__unpaid", "Unpaid"],
            ["__paid", "Paid"],
          ]}
        />
        {dashboardOrders.length ? (
          <div className="receipt-board">
            {dashboardOrders.map((order, index) => (
              <OrderTicket
                key={`${stringValue(order.receiptId)}-${index}`}
                order={order}
                onDone={onDone}
                onCollectPayment={onCollectPayment}
                onSetPayment={onSetPayment}
                onStatus={onStatus}
                canAccept={canAccept}
                canCancel={canCancel}
                canPickup={canPickup}
                canPrepare={canPrepare}
                canReady={canReady}
                canSetPayment={canSetPayment}
                showPickupAction={false}
                view="orders"
                showPaymentActions={role !== "waiter" && canSetPayment}
              />
            ))}
          </div>
        ) : (
          <div className="panel-empty">No receipts yet.</div>
        )}
      </section>
    </>
  );
}

function RewardsView({
  rewards,
  winners,
  filters,
  onFilter,
  onGenerateVoucher,
}: {
  rewards: Row[];
  winners: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
  onGenerateVoucher: (row: Row) => void;
}) {
  const [view, setView] = useState<"rewards" | "winners">("rewards");
  const isRewards = view === "rewards";

  return (
    <section className="panel">
      <PanelHead
        title={isRewards ? "Rewards" : "Free Drink Winners"}
        note={
          isRewards
            ? `${rewards.length} customer(s)`
            : `${winners.length} winner(s)`
        }
      />
      <div className="view-switch" aria-label="Rewards view">
        <button
          className={isRewards ? "active" : ""}
          onClick={() => setView("rewards")}
          type="button"
        >
          Rewards
        </button>
        <button
          className={!isRewards ? "active" : ""}
          onClick={() => setView("winners")}
          type="button"
        >
          Free Drink Winners
        </button>
      </div>
      {isRewards ? (
        <>
          <FilterBar
            id="rewards"
            placeholder="Filter rewards"
            value={filters.rewards}
            onChange={onFilter}
          />
          <DataTable
            columns={[
              ["customerId", "ID"],
              ["customerName", "Customer"],
              ["phone", "Phone"],
              ["favoriteDrink", "Favorite"],
              ["paidDrinks", "Paid Drinks"],
              ["earnedFreeDrinks", "Earned"],
              ["generatedVouchers", "Generated"],
              ["pendingVouchers", "Pending"],
              ["redeemedVouchers", "Redeemed"],
              ["freeDrinksReady", "Free Drinks"],
              ["nextRewardProgress", "Progress"],
              ["winner", "Winner"],
              ["winnerMessage", "Message"],
            ]}
            rows={rewards}
          />
        </>
      ) : (
        <>
          <FilterBar
            id="winners"
            placeholder="Filter winners"
            value={filters.winners}
            onChange={onFilter}
          />
          <DataTable
            action={(row) =>
              numberValue(row.freeDrinksReady) > 0 ? (
                <button
                  className="secondary"
                  onClick={() => onGenerateVoucher(row)}
                  type="button"
                >
                  Generate Voucher
                </button>
              ) : (
                <Pill value="Not ready" />
              )
            }
            columns={[
              ["customerId", "ID"],
              ["customerName", "Customer"],
              ["phone", "Phone"],
              ["favoriteDrink", "Favorite"],
              ["paidDrinks", "Paid Drinks"],
              ["freeDrinksReady", "Free Drinks"],
              ["winnerMessage", "Message"],
            ]}
            rows={winners}
          />
        </>
      )}
    </section>
  );
}

function VouchersView({
  vouchers,
  filters,
  onFilter,
  onRedeem,
}: {
  vouchers: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
  onRedeem: (code: string) => void;
}) {
  return (
    <section className="panel">
      <PanelHead title="Generated Vouchers" />
      <FilterBar
        id="vouchers"
        placeholder="Filter vouchers"
        value={filters.vouchers}
        onChange={onFilter}
      />
      <DataTable
        action={(row) => {
          const code = stringValue(row.voucherCode || row.code);
          const redeemed =
            stringValue(row.redeemStatus).toLowerCase() === "redeemed";
          return (
            <div className="actions">
              <button
                className="secondary"
                onClick={() => printVoucher(row)}
                type="button"
              >
                Print
              </button>
              <button
                className="secondary"
                onClick={() => void sendVoucherWhatsApp(row)}
                type="button"
              >
                WhatsApp
              </button>
              {redeemed ? (
                <Pill value="Redeemed" />
              ) : (
                <button
                  className="danger"
                  onClick={() => onRedeem(code)}
                  type="button"
                >
                  Redeem
                </button>
              )}
            </div>
          );
        }}
        columns={[
          ["voucherCode", "Code"],
          ["customerName", "Customer"],
          ["favoriteDrink", "Drink"],
          ["voucherReward", "Reward"],
          ["redeemStatus", "Redeem"],
          ["qrPayload", "QR Payload"],
          ["generatedAt", "Generated"],
        ]}
        rows={vouchers}
      />
    </section>
  );
}

function UnpaidView({
  unpaid,
  filters,
  onCollect,
  onFilter,
}: {
  unpaid: Row[];
  filters: Record<string, string>;
  onCollect: (row: Row) => void;
  onFilter: (id: string, value: string) => void;
}) {
  const [showPaidReceipts, setShowPaidReceipts] = useState(false);
  const [hiddenPaidCustomers, setHiddenPaidCustomers] = useState<Set<string>>(
    () => new Set(),
  );
  const visibleUnpaid = unpaid.filter((row) => {
    const paid = stringValue(row.paymentStatus).toLowerCase() === "paid";
    const key = customerIdOf(row) || customerName(row);
    if (paid && hiddenPaidCustomers.has(key)) return false;
    return showPaidReceipts || !paid;
  });
  const paidCount = unpaid.filter(
    (row) => stringValue(row.paymentStatus).toLowerCase() === "paid",
  ).length;

  return (
    <section className="panel">
      <PanelHead
        title="Unpaid Tracker"
        note={`${visibleUnpaid.length} shown${paidCount ? `, ${paidCount} paid hidden/optional` : ""}`}
      />
      <div
        className="view-switch unpaid-switch"
        aria-label="Unpaid receipt visibility"
      >
        <button
          className={!showPaidReceipts ? "active" : ""}
          onClick={() => setShowPaidReceipts(false)}
          type="button"
        >
          Unpaid Only
        </button>
        <button
          className={showPaidReceipts ? "active" : ""}
          onClick={() => setShowPaidReceipts(true)}
          type="button"
        >
          Include Paid Receipts
        </button>
      </div>
      <FilterBar
        id="unpaid"
        placeholder="Filter unpaid and paid history"
        value={filters.unpaid}
        onChange={onFilter}
      />
      {visibleUnpaid.length ? (
        <div className="unpaid-card-list">
          {visibleUnpaid.map((row, index) => {
            const paid =
              stringValue(row.paymentStatus).toLowerCase() === "paid";
            const descriptionParts = unpaidDescriptionParts(row);
            const paidTotal = numberValue(row.totalPaid);
            const totalAmount = numberValue(row.totalAmount);
            const key = customerIdOf(row) || customerName(row);
            return (
              <article
                className="unpaid-card"
                key={`${rowSearchText(row)}-${index}`}
              >
                <div className="unpaid-card-head">
                  <div>
                    <span className="mobile-card-label">
                      {customerIdOf(row) || "Customer"}
                    </span>
                    <strong>{customerName(row)}</strong>
                    <span className="mobile-card-subtitle">
                      {phoneOf(row) || "No phone"}
                    </span>
                  </div>
                  <Pill value={paid ? "Paid" : "Unpaid"} />
                </div>
                <div className="unpaid-amount">
                  <div>
                    <span>{money(row.unpaidBalance)} EGP</span>
                    <small>Unpaid balance</small>
                  </div>
                  <div>
                    <span>{money(paidTotal)} EGP</span>
                    <small>Paid total</small>
                  </div>
                </div>
                <dl className="mobile-card-grid">
                  <div>
                    <dt>Total Orders Value</dt>
                    <dd>{money(totalAmount)} EGP</dd>
                  </div>
                  <div>
                    <dt>Open Orders</dt>
                    <dd>{stringValue(row.openUnpaidOrders || 0)}</dd>
                  </div>
                  <div>
                    <dt>Place</dt>
                    <dd>{stringValue(row.orderPlace) || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Last Visit</dt>
                    <dd>{stringValue(row.lastVisit) || "No date"}</dd>
                  </div>
                  <div className="unpaid-description-cell">
                    <dt>Description</dt>
                    <dd>
                      {descriptionParts.length ? (
                        <span className="unpaid-description-list">
                          {descriptionParts.map((part, partIndex) => (
                            <span key={`${part}-${partIndex}`}>{part}</span>
                          ))}
                        </span>
                      ) : (
                        "No description"
                      )}
                    </dd>
                  </div>
                </dl>
                {paid ? (
                  <div className="actions">
                    <Pill value="Paid" />
                    <button
                      className="secondary"
                      onClick={() =>
                        setHiddenPaidCustomers((current) =>
                          new Set(current).add(key),
                        )
                      }
                      type="button"
                    >
                      Remove from View
                    </button>
                  </div>
                ) : (
                  <button
                    className="primary"
                    onClick={() => onCollect(row)}
                    type="button"
                  >
                    Collect Payment
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel-body muted">No rows yet.</div>
      )}
    </section>
  );
}

function HistoryView({
  days,
  filters,
  onFilter,
}: {
  days: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
}) {
  return (
    <section className="panel">
      <PanelHead title="Day History" note={`${days.length} day(s)`} />
      <FilterBar
        id="history"
        placeholder="Filter by date, best seller, or receipt"
        value={filters.history}
        onChange={onFilter}
      />
      {days.length ? (
        <div className="history-grid">
          {days.map((day) => (
            <article className="history-card" key={stringValue(day.dateKey)}>
              <div className="history-card-head">
                <span className="history-date">{stringValue(day.dateKey)}</span>
                <strong>{money(day.totalSales)} EGP sales</strong>
              </div>
              <div className="history-money-grid">
                <div>
                  <span>Paid</span>
                  <strong>{money(day.totalPaid)} EGP</strong>
                </div>
                <div>
                  <span>Unpaid</span>
                  <strong>{money(day.totalUnpaid)} EGP</strong>
                </div>
                <div>
                  <span>Receipts</span>
                  <strong>{stringValue(day.receiptCount || 0)}</strong>
                </div>
                <div>
                  <span>Items</span>
                  <strong>{stringValue(day.orderCount || 0)}</strong>
                </div>
              </div>
              <div className="history-meta">
                <span>
                  Top: {stringValue(day.bestSellingItem) || "No drinks yet"}
                </span>
                <span>Qty: {stringValue(day.bestSellingQty || 0)}</span>
                <span>
                  Free drinks: {stringValue(day.redemptionCount || 0)}
                </span>
                <span>
                  Latest: {stringValue(day.latestReceiptSerial) || "None"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-empty">No day history yet.</div>
      )}
    </section>
  );
}

function MenuView({
  menu,
  filters,
  onFilter,
}: {
  menu: Row[];
  filters: Record<string, string>;
  onFilter: (id: string, value: string) => void;
}) {
  const [category, setCategory] = useState("All");
  const categories = [
    "All",
    ...new Set(menu.map((item) => stringValue(item.category)).filter(Boolean)),
  ];
  const visibleMenu =
    category === "All"
      ? menu
      : menu.filter((item) => stringValue(item.category) === category);

  return (
    <section className="panel">
      <PanelHead title="Menu" note={`${visibleMenu.length} item(s)`} />
      <FilterBar
        id="menu"
        placeholder="Filter menu"
        value={filters.menu}
        onChange={onFilter}
      />
      <div className="section-filter" aria-label="Menu sections">
        {categories.map((name) => (
          <button
            className={`section-chip ${category === name ? "active" : ""}`}
            key={name}
            onClick={() => setCategory(name)}
            style={{ "--section-color": categoryColor(name) } as CSSProperties}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <div className="menu-circle-grid">
        {visibleMenu.map((item, index) => (
          <article
            className="menu-circle"
            key={`${stringValue(item.itemId)}-${index}`}
            style={
              {
                "--section-color": categoryColor(stringValue(item.category)),
              } as CSSProperties
            }
          >
            <span>{stringValue(item.category) || "Menu"}</span>
            <strong>{menuName(item)}</strong>
            <small>{menuPrice(item) || "No price"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OrderTicket({
  canAccept = true,
  canCancel = true,
  canPickup = true,
  canPrepare = true,
  canReady = true,
  canSetPayment = true,
  order,
  onDone,
  onCollectPayment = () => undefined,
  onSetPayment,
  onStatus,
  showPaymentActions = true,
  showPickupAction = true,
  view = "orders",
}: {
  canAccept?: boolean;
  canCancel?: boolean;
  canPickup?: boolean;
  canPrepare?: boolean;
  canReady?: boolean;
  canSetPayment?: boolean;
  order: Row;
  onDone: (payload: string) => Promise<boolean | void> | boolean | void;
  onCollectPayment?: (payload: string) => Promise<void> | void;
  onSetPayment: (
    payload: string,
    paymentStatus: string,
  ) => Promise<boolean | void> | boolean | void;
  onStatus: (
    payload: string,
    action: string,
    message: string,
  ) => Promise<void> | void;
  showPaymentActions?: boolean;
  showPickupAction?: boolean;
  view?: "barista" | "orders";
}) {
  const due = numberValue(order.outstandingAmount);
  const changeAmount = numberValue(order.changeAmount);
  const sourcePreparationStatus = normalizePreparationStatus(order.orderStatus);
  const [optimisticPreparationStatus, setOptimisticPreparationStatus] =
    useState<PreparationStatus | null>(null);
  const preparationStatus =
    optimisticPreparationStatus || sourcePreparationStatus;
  const paymentStatus = normalizePaymentStatusForDisplay(order.paymentStatus);
  const preparationClass = getPreparationStatusClass(preparationStatus);
  const paymentClass = getPaymentStatusClass(paymentStatus);
  const pickedUp = isPickedUpStatus(preparationStatus);
  const cancelled = preparationStatus === "Cancelled";
  const finished = isFinishedPreparationStatus(preparationStatus);
  const receiptDiscountPercentage = numberValue(
    order.receiptDiscountPercentage,
  );
  const receiptNotes = stringValue(order.receiptNotes || order.customerNotes);
  const phone = phoneOf(order);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const pendingActionRef = useRef<string | null>(null);
  const payload = receiptActionPayload(order);
  const place = orderPlaceOf(order);
  const receiptNumber = stringValue(order.receiptNumber || order.receiptId);
  const title = [place, stringValue(order.customerName) || "Walk-in customer"]
    .filter(Boolean)
    .join(" - ");
  const items = Array.isArray(order.orderItems)
    ? order.orderItems
    : stringValue(order.orderDescription)
        .split("+")
        .map((item) => item.trim())
        .filter(Boolean);
  const prepAction = nextPreparationAction(preparationStatus);
  const canRunPrepAction = Boolean(
    prepAction &&
      {
        markReceiptAccepted: canAccept,
        markReceiptPreparing: canPrepare,
        markReceiptReady: canReady,
        markReceiptDone: canPickup,
        completeOrder: canPickup,
        requestOrderConfirmation: canPrepare,
        approveOrder: canPrepare,
      }[prepAction.action],
  );

  async function runTicketAction(
    actionKey: string,
    callback: () => Promise<boolean | void> | boolean | void,
  ) {
    if (pendingActionRef.current) return;
    pendingActionRef.current = actionKey;
    setPendingAction(actionKey);
    try {
      await callback();
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  async function runBaristaStatusAction(
    actionKey: string,
    nextStatus: PreparationStatus,
    callback: () => Promise<boolean | void> | boolean | void,
  ) {
    const previousStatus = preparationStatus;
    setOptimisticPreparationStatus(nextStatus);
    await runTicketAction(actionKey, async () => {
      const succeeded = await callback();
      if (succeeded === false) setOptimisticPreparationStatus(previousStatus);
      return succeeded;
    });
  }

  return (
    <article
      className={[
        "order-ticket",
        view === "barista" ? "barista-receipt" : "orders-receipt",
        preparationClass,
        paymentClass,
        finished && view === "barista" ? "is-finished" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-payment-status={paymentStatus}
      data-preparation-status={preparationStatus}
    >
      <div
        className={
          view === "barista"
            ? "barista-receipt-content"
            : "orders-receipt-content"
        }
      >
        <div className="ticket-head">
          <div className="ticket-title">
            <strong>{title}</strong>
            <span className="muted">
              {stringValue(order.receiptId || order.receiptNumber)
                ? `Receipt ${stringValue(order.receiptId || order.receiptNumber)} | `
                : ""}
              {stringValue(order.orderDateTime)}{" "}
              {order.staff ? `| ${stringValue(order.staff)}` : ""}
            </span>
            {phone && <span className="muted">Phone: {phone}</span>}
            {place && <span className="ticket-place">{place}</span>}
          </div>
          <div className="actions">
            <PreparationStatusBadge status={preparationStatus} />
            {view !== "barista" && (
              <PaymentStatusBadge status={paymentStatus} />
            )}
          </div>
        </div>

        <div className="ticket-items">
          {items.length ? (
            items.map((item, index) => {
              const text = stringValue(item);
              const match = text.match(/^(.*)\sx(\d+(\.\d+)?)$/i);
              return (
                <div className="ticket-item" key={`${text}-${index}`}>
                  <span>{match ? match[1] : text}</span>
                  <span>x{match ? match[2] : "1"}</span>
                </div>
              );
            })
          ) : (
            <div className="muted">No item description.</div>
          )}
        </div>

        <div className="ticket-total">
          <span>Total</span>
          <span>{money(order.total)} EGP</span>
        </div>
        {receiptNotes && (
          <div className="ticket-notes">
            <strong>Notes:</strong> {receiptNotes}
          </div>
        )}
        {showPaymentActions && (
          <div className="stock-meta">
            <span>Paid: {money(order.paidAmount)} EGP</span>
            <span>Remaining: {money(due)} EGP</span>
            {changeAmount > 0 && <span>Change: {money(changeAmount)} EGP</span>}
            {receiptDiscountPercentage > 0 && (
              <span>Discount: {money(receiptDiscountPercentage)}%</span>
            )}
            <span className={`pill ${paymentClass}`}>
              {paymentStatus === "Partial" && due > 0
                ? `Remaining ${money(due)} EGP`
                : paymentStatus}
            </span>
          </div>
        )}
      </div>
      <div
        className={`ticket-actions ${ticketActionClass(showPaymentActions, showPickupAction)}`}
      >
        {showPaymentActions && (
          <>
            <button
              className="secondary"
              disabled={cancelled || !canSetPayment || Boolean(pendingAction)}
              onClick={() =>
                void runTicketAction("collect-payment", () =>
                  onCollectPayment(payload),
                )
              }
              type="button"
            >
              {pendingAction === "collect-payment"
                ? "Saving..."
                : "Collect Payment"}
            </button>
            <button
              className="secondary"
              disabled={Boolean(pendingAction)}
              onClick={() => printReceipt(order)}
              type="button"
            >
              Print
            </button>
            <button
              className="secondary"
              disabled={cancelled || !canSetPayment || Boolean(pendingAction)}
              onClick={() =>
                void runTicketAction("payment-unpaid", () =>
                  onSetPayment(payload, "Unpaid"),
                )
              }
              type="button"
            >
              {pendingAction === "payment-unpaid" ? "Saving..." : "Unpaid"}
            </button>
          </>
        )}
        {showPickupAction && view === "barista" && (
          <>
            <button
              className="accept"
              disabled={
                cancelled ||
                preparationStatus !== "Approved" ||
                !canAccept ||
                Boolean(pendingAction)
              }
              onClick={() =>
                void runBaristaStatusAction("acceptOrder", "Accepted", () =>
                  onStatus(payload, "acceptOrder", "Receipt accepted."),
                )
              }
              type="button"
            >
              {pendingAction === "acceptOrder"
                ? "Accepting…"
                : preparationStatus === "Accepted"
                  ? "Accepted"
                  : "Accept"}
            </button>
            {preparationStatus === "Accepted" && (
              <button
                className="accept"
                disabled={!canPrepare || Boolean(pendingAction)}
                onClick={() =>
                  void runBaristaStatusAction(
                    "markReceiptPreparing",
                    "Preparing",
                    () =>
                      onStatus(
                        payload,
                        "markReceiptPreparing",
                        "Receipt marked preparing.",
                      ),
                  )
                }
                type="button"
              >
                Start Preparing
              </button>
            )}
            {preparationStatus === "Preparing" && (
              <button
                className="accept"
                disabled={!canReady || Boolean(pendingAction)}
                onClick={() =>
                  void runBaristaStatusAction("markReceiptReady", "Ready", () =>
                    onStatus(
                      payload,
                      "markReceiptReady",
                      "Receipt marked ready.",
                    ),
                  )
                }
                type="button"
              >
                Mark Ready
              </button>
            )}
            <button
              className="pickup"
              disabled={
                cancelled ||
                preparationStatus !== "Ready" ||
                !canPickup ||
                Boolean(pendingAction)
              }
              onClick={() =>
                void runBaristaStatusAction("pickupOrder", "Picked Up", () =>
                  onDone(payload),
                )
              }
              type="button"
            >
              {pendingAction === "pickupOrder" ? "Picking Up…" : "Pick Up"}
            </button>
            {preparationStatus === "Picked Up" && (
              <button
                className="secondary"
                disabled={!canPickup || Boolean(pendingAction)}
                onClick={() =>
                  void runBaristaStatusAction(
                    "completeOrder",
                    "Completed",
                    () =>
                      onStatus(payload, "completeOrder", "Order completed."),
                  )
                }
                type="button"
              >
                Complete
              </button>
            )}
          </>
        )}
        {showPickupAction && view !== "barista" && (
          <>
            <button
              className="accept"
              disabled={
                cancelled ||
                !prepAction ||
                !canRunPrepAction ||
                Boolean(pendingAction)
              }
              onClick={() =>
                prepAction &&
                canRunPrepAction &&
                void runTicketAction(prepAction.action, () =>
                  onStatus(payload, prepAction.action, prepAction.message),
                )
              }
              type="button"
            >
              {pendingAction === prepAction?.action
                ? "Saving..."
                : prepAction?.label || "Accepted"}
            </button>
            <button
              className="pickup"
              disabled={
                !canPickup ||
                cancelled ||
                pickedUp ||
                preparationStatus !== "Ready" ||
                Boolean(pendingAction)
              }
              onClick={() =>
                void runTicketAction("markReceiptDone", () => onDone(payload))
              }
              type="button"
            >
              {pendingAction === "markReceiptDone" ? "Saving..." : "Pickup"}
            </button>
          </>
        )}
        {canCancel && view !== "barista" && (
          <button
            className="danger"
            disabled={cancelled || pickedUp || Boolean(pendingAction)}
            onClick={() => {
              const reason = window.prompt(
                "Cancellation reason (required after acceptance)",
                "Operational cancellation",
              );
              if (reason === null || !reason.trim()) return;
              void runTicketAction("cancelReceipt", () =>
                onStatus(
                  encodeURIComponent(
                    JSON.stringify({ ...receiptPayloadFrom(payload), reason }),
                  ),
                  "cancelReceipt",
                  "Receipt cancelled.",
                ),
              );
            }}
            type="button"
          >
            {pendingAction === "cancelReceipt" ? "Saving..." : "Wrong / Cancel"}
          </button>
        )}
      </div>
    </article>
  );
}

function PreparationStatusBadge({ status }: { status: PreparationStatus }) {
  return (
    <span
      className={`pill status-badge preparation-status-badge ${getPreparationStatusClass(status)}`}
    >
      {status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const normalized = normalizePaymentStatusForDisplay(status);
  return (
    <span
      className={`pill status-badge payment-status-badge ${getPaymentStatusClass(normalized)}`}
    >
      {normalized}
    </span>
  );
}

function nextPreparationAction(status: PreparationStatus) {
  if (status === "Requested") {
    return {
      action: "requestOrderConfirmation",
      label: "Request Confirmation",
      message: "Customer confirmation requested.",
      nextStatus: "Awaiting Confirmation" as PreparationStatus,
    };
  }

  if (status === "Confirmed") {
    return {
      action: "approveOrder",
      label: "Approve",
      message: "Order approved for preparation.",
      nextStatus: "Approved" as PreparationStatus,
    };
  }
  if (status === "Approved") {
    return {
      action: "markReceiptAccepted",
      label: "Accept",
      message: "Receipt accepted.",
      nextStatus: "Accepted" as PreparationStatus,
    };
  }
  if (status === "Accepted") {
    return {
      action: "markReceiptPreparing",
      label: "Start",
      message: "Receipt marked preparing.",
      nextStatus: "Preparing" as PreparationStatus,
    };
  }
  if (status === "Preparing") {
    return {
      action: "markReceiptReady",
      label: "Ready",
      message: "Receipt marked ready.",
      nextStatus: "Ready" as PreparationStatus,
    };
  }
  if (status === "Ready") {
    return {
      action: "markReceiptDone",
      label: "Picked Up",
      message: "Receipt marked picked up.",
      nextStatus: "Picked Up" as PreparationStatus,
    };
  }
  if (status === "Picked Up") {
    return {
      action: "completeOrder",
      label: "Complete",
      message: "Order completed.",
      nextStatus: "Completed" as PreparationStatus,
    };
  }
  return null;
}

function StockCard({ item }: { item: Row }) {
  const qtySold = numberValue(item.qtySold);
  const alert =
    stringValue(item.stockAlert) ||
    (qtySold >= 10 ? "Restock today" : qtySold >= 5 ? "Watch stock" : "OK");
  const isAlert = alert !== "OK";
  const meter = Math.min(100, Math.max(8, qtySold * 10));

  return (
    <article className={`stock-card ${isAlert ? "alert" : ""}`}>
      <div className="stock-row">
        <div className="stock-row inner">
          <span className="stock-rank">{stringValue(item.rank)}</span>
          <strong className="stock-name">
            {stringValue(item.itemName) || "Item"}
          </strong>
        </div>
        <span className={`pill ${isAlert ? "unpaid" : "paid"}`}>{alert}</span>
      </div>
      <div className="stock-meter">
        <span style={{ width: `${meter}%` }} />
      </div>
      <div className="stock-meta">
        <span>{money(qtySold)} sold</span>
        <span>{money(item.totalSales)} EGP</span>
      </div>
    </article>
  );
}

function ticketActionClass(
  showPaymentActions: boolean,
  showPickupAction: boolean,
) {
  if (showPaymentActions && !showPickupAction) return "payment-only";
  if (!showPaymentActions && showPickupAction) return "pickup-only";
  return "";
}

function DataTable({
  columns,
  rows,
  action,
}: {
  columns: Array<[string, string]>;
  rows: Row[];
  action?: (row: Row) => React.ReactNode;
}) {
  if (!rows.length) return <div className="panel-body muted">No rows yet.</div>;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              {action && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${rowSearchText(row)}-${index}`}>
                {columns.map(([key]) => (
                  <td key={key}>
                    <FormattedValue value={row[key]} />
                  </td>
                ))}
                {action && <td>{action(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-data-list">
        {rows.map((row, index) => {
          const fallbackColumn: [string, string] = columns[0] || ["", "Record"];
          const titleColumn =
            columns.find(([key]) => stringValue(row[key])) || fallbackColumn;
          const subtitleColumn =
            columns.find(
              ([key]) => key !== titleColumn[0] && stringValue(row[key]),
            ) || columns[1];
          const detailColumns = columns.filter(
            ([key]) => key !== titleColumn[0] && key !== subtitleColumn?.[0],
          );

          return (
            <article
              className="mobile-data-card"
              key={`${rowSearchText(row)}-${index}`}
            >
              <div className="mobile-card-head">
                <div>
                  <span className="mobile-card-label">{titleColumn[1]}</span>
                  <strong>
                    <FormattedValue value={row[titleColumn[0]]} />
                  </strong>
                  {subtitleColumn && (
                    <span className="mobile-card-subtitle">
                      {subtitleColumn[1]}: {stringValue(row[subtitleColumn[0]])}
                    </span>
                  )}
                </div>
                {action && (
                  <div className="mobile-card-actions">{action(row)}</div>
                )}
              </div>
              <dl className="mobile-card-grid">
                {detailColumns.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <FormattedValue value={row[key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}

function FormattedValue({ value }: { value: unknown }) {
  const text = stringValue(value);
  const key = text.trim().toLowerCase().replace(/\s+/g, "-");
  const pillValues = [
    "yes",
    "no",
    "paid",
    "unpaid",
    "pending",
    "created",
    "redeemed",
    "not-redeemed",
    "done",
    "picked-up",
  ];

  if (pillValues.includes(key))
    return <span className={`pill ${key}`}>{text}</span>;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return <span className="date-pill">{text.slice(0, 10)}</span>;
  }
  return <>{text}</>;
}

function Pill({ value }: { value: string }) {
  const key = value.trim().toLowerCase().replace(/\s+/g, "-");
  return <span className={`pill ${key}`}>{value}</span>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function PanelHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {note && <span className="muted">{note}</span>}
    </div>
  );
}

function Field({
  label,
  list,
  name,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: {
  label: string;
  list?: string;
  name: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <input
        defaultValue={!onChange ? value : undefined}
        list={list}
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={onChange ? value : undefined}
      />
    </label>
  );
}

function FilterBar({
  id,
  onChange,
  placeholder,
  quickFilters = [],
  value = "",
}: {
  id: string;
  onChange: (id: string, value: string) => void;
  placeholder: string;
  quickFilters?: Array<[string, string]>;
  value?: string;
}) {
  return (
    <div className="filter-bar">
      <input
        onChange={(event) => onChange(id, event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value.startsWith("__") ? "" : value}
      />
      {quickFilters.length > 0 && (
        <div className="quick-filters" aria-label="Quick filters">
          {quickFilters.map(([filterValue, label]) => (
            <button
              className={`filter-chip ${value === filterValue ? "active" : ""}`}
              key={`${id}-${filterValue || "all"}`}
              onClick={() => onChange(id, filterValue)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <span className="muted">
        Search by name, item, status, staff, phone, or code
      </span>
    </div>
  );
}

async function callServer(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResponse & AppData> {
  if (!navigator.onLine) {
    if (action === "customerMenu") {
      const cached = await getOfflineMetadata("cachedMenu");
      if (cached) {
        return {
          success: true,
          menu: JSON.parse(cached),
        } as ApiResponse & AppData;
      }
    }
    const operationType = offlineOperationType(action);
    if (operationType && auth?.currentUser) {
      const queued = await enqueueOfflineOperation({
        actorRole:
          stringValue(payload.staffRole || payload.createdByRole) ||
          (action === "submitCustomerOrder" ? "customer" : "staff"),
        actorUid: auth.currentUser.uid,
        clientRequestId: stringValue(payload.clientRequestId) || undefined,
        operationType,
        payload: { ...payload, _offlineAction: action },
      });
      return {
        message: "Saved on this device — not yet saved to Google Sheets.",
        offlineQueued: true,
        success: true,
        clientRequestId: queued.clientRequestId,
      } as ApiResponse & AppData;
    }
    throw new Error(
      "This action requires an internet connection and cannot be queued safely.",
    );
  }
  const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
  const headers = {
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
  const response =
    action === "appData" || action === "getAppData"
      ? await fetch(
          `${API_BASE_URL}?${new URLSearchParams({
            action: "appData",
          }).toString()}`,
          { headers },
        )
      : await fetch(API_BASE_URL, {
          body: JSON.stringify({ action, ...payload }),
          headers: { "Content-Type": "text/plain;charset=utf-8", ...headers },
          method: "POST",
        });

  if (!response.ok) {
    let message = `API failed with status ${response.status}.`;
    try {
      const errorJson = (await response.clone().json()) as ApiResponse;
      message = errorJson.message || message;
    } catch {
      // Keep the status fallback when the server does not return JSON.
    }
    throw new Error(message);
  }

  const json = (await response.json()) as ApiResponse & AppData;

  if (json.success === false) {
    throw new Error(json.message || "Action failed.");
  }

  if (
    action === "customerMenu" &&
    (json.data?.menu || (json as AppData).menu)
  ) {
    await putOfflineMetadata(
      "cachedMenu",
      JSON.stringify(json.data?.menu || (json as AppData).menu),
    );
  }
  return json;
}

function offlineOperationType(action: string): OfflineOperationType | null {
  if (["addReceipt", "submitCustomerOrder"].includes(action))
    return "CREATE_ORDER";
  if (["addCustomer", "registerCustomerProfile"].includes(action))
    return "CREATE_CUSTOMER_DRAFT";
  if (["collectReceiptPayment", "addPayment"].includes(action))
    return "RECORD_PAYMENT_DRAFT";
  if (
    [
      "markReceiptAccepted",
      "markReceiptPreparing",
      "markReceiptReady",
      "markReceiptDone",
      "pickupOrder",
      "completeOrder",
    ].includes(action)
  )
    return "UPDATE_PREPARATION_STATUS";
  return null;
}

function ensureConnectedData(source: AppData | null): AppData {
  if (!source) return {};
  const nextData = { ...source };
  if (!nextData.dashboardOrders) {
    nextData.dashboardOrders = buildDashboardOrders(nextData.orders || []);
  }
  if (
    !nextData.dashboardTopItems ||
    (!nextData.dashboardTopItems.length && (nextData.orders || []).length)
  ) {
    nextData.dashboardTopItems = buildDashboardTopItems(nextData.orders || []);
  }
  if ((nextData.customers || []).length && (nextData.orders || []).length) {
    nextData.rewards = buildRewards(
      nextData.customers || [],
      nextData.orders || [],
      nextData.vouchers || [],
    );
    nextData.winners = nextData.rewards.filter(
      (reward) => numberValue(reward.freeDrinksReady) > 0,
    );
  }
  nextData.dashboard = buildDashboardCounts(nextData);
  return nextData;
}

function mergeConnectedData(
  current: AppData | null,
  incoming: AppData,
): AppData {
  const base = ensureConnectedData(current);
  const next = ensureConnectedData(incoming);

  return ensureConnectedData({
    ...base,
    ...next,
    dashboard: next.dashboard || base.dashboard,
    dashboardOrders: next.dashboardOrders
      ? mergeRowsByKey(
          base.dashboardOrders || [],
          next.dashboardOrders,
          receiptKeyOf,
        )
      : base.dashboardOrders,
    dashboardTopItems: next.dashboardTopItems || base.dashboardTopItems,
    historyDays: next.historyDays || base.historyDays,
    lists: {
      ...(base.lists || {}),
      ...(next.lists || {}),
    },
    orders: next.orders
      ? mergeRowsByKey(base.orders || [], next.orders, receiptKeyOf)
      : base.orders,
    payments: next.payments || base.payments,
    staffProfile: next.staffProfile || base.staffProfile,
    unpaid: next.unpaid || base.unpaid,
  });
}

function mergeRowsByKey(
  current: Row[],
  incoming: Row[],
  keyForRow: (row: Row) => string,
) {
  const byKey = new Map<string, Row>();
  current.forEach((row, index) => {
    byKey.set(keyForRow(row) || `current-${index}`, row);
  });
  incoming.forEach((row, index) => {
    byKey.set(keyForRow(row) || `incoming-${index}`, {
      ...(byKey.get(keyForRow(row)) || {}),
      ...row,
    });
  });
  return Array.from(byKey.values());
}

function receiptKeyOf(row: Row) {
  return stringValue(
    row.receiptId ||
      row.receiptNumber ||
      row.receiptKey ||
      row.orderId ||
      row.orderDateTime,
  );
}

function safeReceiptTotals(
  items: Array<{
    discount?: number | string;
    extrasTotal?: number | string;
    qty?: number;
    unitPrice?: number | string;
  }>,
  discount: string,
) {
  try {
    return calculateReceiptTotals(items, discount);
  } catch {
    return calculateReceiptTotals(items, 0);
  }
}

function dataSummary(data: AppData) {
  return `Menu: ${data.menu?.length || 0}, Customers: ${data.customers?.length || 0}, Orders: ${data.orders?.length || 0}`;
}

function buildDashboardCounts(data: AppData): Dashboard {
  const dashboardOrders = data.dashboardOrders || [];
  const orders = data.orders || [];
  const unpaid = data.unpaid || [];
  const base = data.dashboard || {};
  const pickedUpReceipts = dashboardOrders.filter((order) =>
    isPickedUpStatus(order.orderStatus),
  ).length;
  const unpaidReceipts = dashboardOrders.filter(
    (order) => numberValue(order.outstandingAmount) > 0,
  ).length;

  return {
    ...base,
    totalOrders: dashboardOrders.length || base.totalOrders || 0,
    totalItems: base.totalItems ?? orders.length ?? 0,
    totalPaid:
      base.totalPaid ??
      dashboardOrders.reduce(
        (total, order) => total + numberValue(order.paidAmount),
        0,
      ),
    totalUnpaid:
      base.totalUnpaid ??
      unpaid.reduce((total, row) => total + numberValue(row.unpaidBalance), 0),
    openReceipts: Math.max(0, dashboardOrders.length - pickedUpReceipts),
    pickedUpReceipts,
    unpaidReceipts,
  };
}

function buildDashboardOrders(orders: Row[]) {
  const grouped: Record<
    string,
    Row & {
      orderDescriptions: string[];
      pickedUpCount: number;
      receiptNotes: string[];
    }
  > = {};

  orders.forEach((order) => {
    const key =
      receiptKeyOf(order) ||
      [
        order.orderDateTime,
        order.customerId,
        order.customerName,
        order.paymentStatus,
      ].join("|");

    if (!grouped[key]) {
      grouped[key] = {
        ...order,
        receiptKey: key,
        orderPlace: orderPlaceOf(order),
        itemCount: 0,
        total: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        orderDescriptions: [],
        pickedUpCount: 0,
        receiptNotes: [],
      };
    }

    const group = grouped[key];
    group.itemCount = numberValue(group.itemCount) + 1;
    group.total = numberValue(group.total) + numberValue(order.total);
    group.paidAmount =
      numberValue(group.paidAmount) + receiptRowPaidAmount(order);
    group.receiptDiscountPercentage = Math.max(
      numberValue(group.receiptDiscountPercentage),
      numberValue(order.receiptDiscountPercentage || order.discount),
    );
    group.orderPlace = group.orderPlace || orderPlaceOf(order);
    if (isPickedUpStatus(order.orderStatus)) {
      group.pickedUpCount += 1;
    }
    group.orderDescriptions.push(
      `${stringValue(order.item || order.itemName) || "Item"} x${stringValue(order.qty) || "1"}`,
    );
    const notes = cleanReceiptNotes(order.notes);
    if (notes) group.receiptNotes.push(notes);
  });

  return Object.values(grouped).map((row) => {
    const paidAmount = Math.min(
      numberValue(row.total),
      numberValue(row.paidAmount),
    );
    const outstandingAmount = Math.max(0, numberValue(row.total) - paidAmount);
    return {
      ...row,
      itemCount: String(row.itemCount),
      orderDescription: row.orderDescriptions.join(" + "),
      orderItems: row.orderDescriptions,
      orderStatus:
        row.pickedUpCount >= numberValue(row.itemCount)
          ? "Picked Up"
          : row.orderStatus,
      paidAmount: String(paidAmount),
      outstandingAmount: String(outstandingAmount),
      paymentStatus: derivePaymentStatus(paidAmount, numberValue(row.total)),
      receiptDiscountPercentage: String(row.receiptDiscountPercentage || 0),
      receiptNotes: uniqueStrings(row.receiptNotes).join(" | "),
      customerNotes: uniqueStrings(row.receiptNotes).join(" | "),
      total: String(row.total),
    };
  });
}

function receiptRowPaidAmount(order: Row) {
  const explicitPaid = numberValue(order.paidAmount);
  if (explicitPaid > 0) return explicitPaid;
  const status = stringValue(order.paymentStatus).toLowerCase();
  if (status === "paid") return numberValue(order.total);
  if (status === "partial") return partialPaidAmount(order);
  return 0;
}

function partialPaidAmount(order: Row) {
  return Array.from(
    stringValue(order.notes).matchAll(/Paid now:\s*([\d,]+(?:\.\d+)?)/gi),
  ).reduce((total, match) => total + numberValue(match[1]), 0);
}

function derivePaymentStatus(paidAmount: number, receiptTotal: number) {
  if (paidAmount <= 0) return "Unpaid";
  if (paidAmount < receiptTotal) return "Partial";
  return "Paid";
}

function cleanReceiptNotes(notes: unknown) {
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
  return stringValue(notes)
    .split("|")
    .map(stringValue)
    .filter((part) => {
      const lower = part.toLowerCase();
      return (
        part && !internalPrefixes.some((prefix) => lower.startsWith(prefix))
      );
    })
    .join(" | ");
}

function buildDashboardTopItems(orders: Row[]) {
  const grouped: Record<
    string,
    {
      itemName: string;
      category: string;
      qtySold: number;
      totalSales: number;
      lastSold: string;
    }
  > = {};

  orders.forEach((order) => {
    if (!isDrinkOrder(order)) return;

    const itemName = orderItemName(order);
    const groupKey = itemName.toLowerCase();
    const qtySold = orderQty(order);

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        itemName,
        category: stringValue(order.category),
        qtySold: 0,
        totalSales: 0,
        lastSold: "",
      };
    }

    grouped[groupKey].qtySold += qtySold;
    grouped[groupKey].totalSales += numberValue(order.total);
    grouped[groupKey].lastSold =
      stringValue(order.orderDateTime) || grouped[groupKey].lastSold;
  });

  return Object.values(grouped)
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

function orderItemName(order: Row) {
  return (
    stringValue(
      order.item || order.itemName || order.menuItem || order.productName,
    ) || "Item"
  );
}

function orderQty(order: Row) {
  return Math.max(
    1,
    numberValue(
      order.qty || order.quantity || order.count || order.itemCount,
    ) || 1,
  );
}

function buildRewards(customers: Row[], orders: Row[], vouchers: Row[]) {
  return customers
    .map((customer) => {
      const customerOrders = orders.filter((order) =>
        rowsMatchCustomer(order, customer),
      );
      const paidDrinks = customerOrders.reduce(
        (total, order) => total + paidEligibleDrinkQty(order),
        0,
      );
      const earnedFreeDrinks = Math.floor(paidDrinks / 5);
      const customerVouchers = vouchers.filter((voucher) =>
        rowsMatchCustomer(voucher, customer),
      );
      const generatedVouchers = customerVouchers.length;
      const redeemedVouchers = customerVouchers.filter(
        (voucher) =>
          stringValue(voucher.redeemStatus).toLowerCase() === "redeemed",
      ).length;
      const pendingVouchers = generatedVouchers - redeemedVouchers;
      const freeDrinksReady = Math.max(0, earnedFreeDrinks - generatedVouchers);
      const progress = paidDrinks % 5;

      return {
        customerId: customerIdOf(customer),
        customerName: customerName(customer),
        phone: phoneOf(customer),
        favoriteDrink: favoriteDrink(customer),
        paidDrinks: String(paidDrinks),
        earnedFreeDrinks: String(earnedFreeDrinks),
        generatedVouchers: String(generatedVouchers),
        pendingVouchers: String(pendingVouchers),
        redeemedVouchers: String(redeemedVouchers),
        freeDrinksReady: String(freeDrinksReady),
        nextRewardProgress: `${progress}/5`,
        winner: freeDrinksReady > 0 ? "Yes" : "No",
        redeemStatus:
          pendingVouchers > 0
            ? `${pendingVouchers} voucher(s) pending`
            : redeemedVouchers > 0
              ? `${redeemedVouchers} redeemed`
              : "No voucher yet",
        winnerMessage:
          freeDrinksReady > 0
            ? `${freeDrinksReady} free drink voucher(s) ready`
            : `${5 - progress} paid drink(s) to next reward`,
      };
    })
    .filter((reward) => reward.customerId || reward.customerName);
}

function paidEligibleDrinkQty(order: Row) {
  if (!isOrderPaidForRewards(order)) return 0;
  if (!isRewardEligibleOrder(order)) return 0;
  return orderQty(order);
}

function isOrderPaidForRewards(order: Row) {
  const status = stringValue(order.paymentStatus).toLowerCase();
  if (status === "paid") return true;
  return (
    numberValue(order.total) > 0 && numberValue(order.outstandingAmount) <= 0
  );
}

function isRewardEligibleOrder(order: Row) {
  if (numberValue(order.pointsEarned) > 0) return true;
  return isDrinkOrder(order);
}

function isDrinkOrder(order: Row) {
  const text =
    `${stringValue(order.category)} ${orderItemName(order)}`.toLowerCase();
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

  return [
    "americano",
    "beverage",
    "cappuccino",
    "coffee",
    "drink",
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
  ].some((word) => text.includes(word));
}

function rowsMatchCustomer(row: Row, customer: Row) {
  const rowId = customerIdOf(row);
  const customerId = customerIdOf(customer);
  if (rowId && customerId && rowId === customerId) return true;

  const rowPhone = digitsOnly(phoneOf(row) || row.customerPhone);
  const customerPhone = digitsOnly(phoneOf(customer) || customer.customerPhone);
  if (rowPhone && customerPhone && rowPhone === customerPhone) return true;

  return (
    customerNameKey(row) && customerNameKey(row) === customerNameKey(customer)
  );
}

function customerNameKey(row: Row) {
  return stringValue(
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

function buildPlaceOptions(lists: Record<string, string[]>, orders: Row[]) {
  return uniqueStrings([
    ...(lists.orderPlace || []),
    ...(lists.tablePlaces || []),
    ...(lists.tables || []),
    ...orders.map(orderPlaceOf),
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

function composeServicePlace(payload: Row) {
  const serviceType = stringValue(payload.serviceType);
  const place = stringValue(payload.orderPlace);
  const carName = stringValue(payload.carName);
  const carColor = stringValue(payload.carColor);
  const car = [carColor, carName].filter(Boolean).join(" ");
  const parts = [
    serviceType && serviceType !== "Hall" ? serviceType : "",
    place,
    car ? `Car: ${car}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" - ") : place;
}

function compareRecentOrders(left: Row, right: Row) {
  return dateScore(right.orderDateTime) - dateScore(left.orderDateTime);
}

function dateScore(value: unknown) {
  const parsed = Date.parse(stringValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map((value) => stringValue(value))
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
}

function receiptActionPayload(order: Row) {
  const payload: ReceiptPayload = {
    receiptId: stringValue(order.receiptId),
    receiptKey: stringValue(order.receiptKey),
    orderId: stringValue(order.orderId),
    receiptNumber: stringValue(order.receiptNumber || order.receiptId),
    customerId: stringValue(order.customerId),
    customerName: stringValue(order.customerName),
    orderDateTime: stringValue(order.orderDateTime),
    staff: stringValue(order.staff) || "Cashier 1",
  };

  return encodeURIComponent(JSON.stringify(payload));
}

function receiptPayloadFrom(value: string) {
  return JSON.parse(decodeURIComponent(value)) as ReceiptPayload;
}

function orderPlaceOf(row: Row) {
  const direct = stringValue(
    row.orderPlace || row.tableNumber || row.table || row.place || row.location,
  );
  if (direct) return direct;

  const match = stringValue(row.notes).match(
    /(?:Place|Table|Location):\s*([^|]+)/i,
  );
  return match ? stringValue(match[1]) : "";
}

function printReceipt(order: Row) {
  const items = Array.isArray(order.orderItems)
    ? order.orderItems.map((item) => {
        const text = stringValue(item);
        const match = text.match(/^(.*)\sx(\d+(\.\d+)?)$/i);
        return {
          itemName: match ? match[1] : text,
          qty: match ? numberValue(match[2]) : 1,
          unitPrice: numberValue(order.unitPrice),
          total: numberValue(order.total),
          size: stringValue(order.size),
        };
      })
    : [
        {
          itemName: stringValue(order.item || order.orderDescription || "Item"),
          qty: numberValue(order.qty) || 1,
          unitPrice: numberValue(order.unitPrice),
          total: numberValue(order.total),
          size: stringValue(order.size),
        },
      ];
  const html = buildReceiptPrintHtml({
    customerName: stringValue(order.customerName),
    customerPhone: phoneOf(order),
    receiptId: stringValue(order.receiptId),
    receiptNumber: stringValue(order.receiptNumber || order.receiptId),
    items,
    discountPercentage: numberValue(order.receiptDiscountPercentage),
    subtotal: numberValue(order.subtotal || order.total),
    total: numberValue(order.total),
    paidAmount: numberValue(order.paidAmount),
    outstandingAmount: numberValue(order.outstandingAmount),
    changeAmount: numberValue(order.changeAmount),
    paymentStatus: stringValue(order.paymentStatus),
    orderDateTime: stringValue(order.orderDateTime),
    staff: stringValue(order.staff),
    orderPlace: orderPlaceOf(order),
    notes: stringValue(order.notes || order.customerNotes),
  });
  const win = window.open("", "_blank", "width=760,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function printVoucher(row: Row) {
  const customer = customerName(row) || "Joy Corner Guest";
  const drink = favoriteDrink(row) || "your favorite drink";
  const code = stringValue(row.voucherCode || row.code);
  const reward = stringValue(row.voucherReward) || `Enjoy 1 Free ${drink}`;
  const generatedAt =
    stringValue(row.generatedAt || row.date) || new Date().toLocaleDateString();
  const win = window.open("", "_blank", "width=460,height=760");
  if (!win) return;

  win.document.write(`
    <html><head><title>${escapeHtml(code)}</title>
    <style>
      @page{size:92mm 210mm;margin:0}
      *{box-sizing:border-box}
      html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Arial,sans-serif;margin:0;background:#eee5d6;color:#21130c}
      .sheet{align-items:center;display:flex;justify-content:center;min-height:100vh;padding:14px}
      .voucher{background:#f8b73f;border:1.5mm solid #1c100b;box-shadow:0 18px 38px rgba(0,0,0,.22);height:200mm;overflow:hidden;position:relative;width:86mm}
      .voucher:before{background:linear-gradient(180deg,#fecb57 0,#f48a2d 48%,#1f8aa0 49%,#58c1d0 100%);content:"";inset:0;position:absolute}
      .sky{height:91mm;left:0;overflow:hidden;position:absolute;right:0;top:0}
      .sun{background:#ffe6a3;border-radius:50%;height:24mm;position:absolute;right:8mm;top:31mm;width:24mm}
      .mountain{background:#1c8b93;clip-path:polygon(50% 0,100% 100%,0 100%);height:54mm;left:10mm;position:absolute;top:45mm;width:70mm}
      .mountain:after{background:#0e6670;clip-path:polygon(48% 0,78% 100%,15% 100%);content:"";height:38mm;left:14mm;position:absolute;top:12mm;width:34mm}
      .cloud{background:#fff2c8;border-radius:20mm;height:5mm;position:absolute;width:18mm}
      .cloud.one{left:5mm;top:31mm}.cloud.two{right:7mm;top:48mm}.cloud.three{left:36mm;top:70mm}
      .hill{background:#2e8b3f;border-radius:50% 50% 0 0;height:58mm;position:absolute;top:78mm;width:72mm}
      .hill.left{left:-19mm}.hill.right{right:-15mm;background:#66a841}.hill.center{background:#447b34;left:10mm;top:91mm;width:82mm}
      .road{background:#f2c35f;clip-path:polygon(57% 0,72% 0,56% 100%,33% 100%);height:74mm;left:0;position:absolute;top:92mm;width:100%}
      .beans{bottom:52mm;display:flex;gap:3mm;left:7mm;position:absolute}
      .bean{background:#d93722;border-radius:50%;height:4.2mm;width:4.2mm}
      .header{background:#21130c;border-bottom:1.2mm solid #0f0805;border-radius:0 0 50% 50% / 0 0 10% 10%;color:#fff5d6;height:60mm;left:0;padding-top:8mm;position:absolute;right:0;text-align:center;top:0}
      .mark{align-items:center;background:#fff1bf;border:2.3mm solid #21130c;border-radius:50%;display:grid;font-family:Georgia,serif;font-size:22mm;font-weight:900;height:34mm;margin:0 auto 3mm;place-items:center;width:34mm}
      .brand{font-size:8.5mm;font-weight:900;letter-spacing:.8mm;line-height:1;text-shadow:0 1px 0 #000}
      .sub{font-size:3.8mm;font-weight:800;letter-spacing:.4mm;margin-top:2mm}
      .band{background:#21130c;color:#ffd165;font-size:8.2mm;font-weight:900;left:0;letter-spacing:.5mm;padding:3mm 2mm;position:absolute;right:0;text-align:center;text-transform:uppercase;top:102mm}
      .reward{background:#fff1bf;border:1mm solid rgba(33,19,12,.16);border-radius:4mm;bottom:17mm;left:6mm;padding:4mm;position:absolute;right:6mm;text-align:center}
      .reward h1{font-size:8mm;line-height:1;margin:0 0 2mm;text-transform:uppercase}
      .reward h2{color:#a03f22;font-size:5.5mm;line-height:1.1;margin:0 0 3mm}
      .reward p{font-size:3.6mm;font-weight:700;line-height:1.28;margin:0 0 3mm}
      .code{background:#21130c;border-radius:2mm;color:#fff1bf;font-size:4.3mm;font-weight:900;letter-spacing:.4mm;margin-top:3mm;padding:2.8mm}
      .meta{display:flex;font-size:2.8mm;font-weight:800;justify-content:space-between;margin-top:3mm;text-transform:uppercase}
      .footer{bottom:5mm;color:#fff1bf;font-size:3mm;font-weight:900;left:0;letter-spacing:.4mm;position:absolute;right:0;text-align:center;text-transform:uppercase}
      .screen-actions{display:flex;gap:8px;justify-content:center;margin-top:12px}
      .screen-actions button{background:#21130c;border:0;border-radius:6px;color:#fff1bf;cursor:pointer;font-weight:800;padding:10px 14px}
      @media(max-width:560px){.sheet{align-items:flex-start;padding:8px}.voucher{height:186mm;width:80mm}.brand{font-size:7.4mm}.band{font-size:7mm}.reward h1{font-size:6.4mm}}
      @media print{body{background:#fff}.sheet{min-height:0;padding:0}.voucher{box-shadow:none}.screen-actions{display:none}}
    </style></head><body>
    <div class="sheet"><div><div class="voucher">
      <div class="sky"><div class="sun"></div><div class="cloud one"></div><div class="cloud two"></div><div class="cloud three"></div><div class="mountain"></div><div class="hill left"></div><div class="hill right"></div><div class="hill center"></div><div class="road"></div><div class="beans"><span class="bean"></span><span class="bean"></span><span class="bean"></span></div></div>
      <div class="header"><div class="mark">J</div><div class="brand">JOY CORNER</div><div class="sub">COFFEE / FREE DRINK</div></div>
      <div class="band">Free Drink Voucher</div>
      <div class="reward"><h1>${escapeHtml(customer)}</h1><h2>${escapeHtml(reward)}</h2><p>Present this voucher at Joy Corner to redeem your free drink.</p><div class="code">${escapeHtml(code)}</div><div class="meta"><span>${escapeHtml(drink)}</span><span>${escapeHtml(generatedAt)}</span></div></div>
      <div class="footer">Your daily little joy</div>
    </div><div class="screen-actions"><button onclick="window.print()">Print Voucher</button><button onclick="window.close()">Close</button></div></div></div>
    </body></html>
  `);
  win.document.close();
}

async function sendVoucherWhatsApp(row: Row) {
  const phone = whatsAppPhone(stringValue(row.phone || row.phoneWhatsApp));
  const text = voucherWhatsAppText(row);
  const sharedImage = await shareVoucherImage(row);

  if (sharedImage) return;

  openVoucherImage(row);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function voucherWhatsAppText(row: Row) {
  const customer = customerName(row) || "Joy Corner guest";
  const drink = favoriteDrink(row) || "your favorite drink";
  const code = stringValue(row.voucherCode || row.code);
  const reward = stringValue(row.voucherReward) || `Enjoy 1 Free ${drink}`;

  return [
    `Hello ${customer},`,
    "",
    "You have a Joy Corner free drink voucher.",
    reward,
    `Voucher code: ${code}`,
    "",
    "Show this code at Joy Corner to redeem it. A colorful voucher image was opened/shared from the staff app.",
  ].join("\n");
}

async function shareVoucherImage(row: Row) {
  try {
    const blob = await voucherPngBlob(row);
    const file = new File(
      [blob],
      `${stringValue(row.voucherCode || "joy-corner-voucher")}.png`,
      {
        type: "image/png",
      },
    );
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        files: [file],
        text: voucherWhatsAppText(row),
        title: "Joy Corner Voucher",
      });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function voucherPngBlob(row: Row) {
  const svg = voucherSvg(row);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Voucher image failed.")),
      "image/png",
    );
  });
}

function openVoucherImage(row: Row) {
  const url = URL.createObjectURL(
    new Blob([voucherSvg(row)], { type: "image/svg+xml" }),
  );
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function voucherSvg(row: Row) {
  const customer = escapeHtml(customerName(row) || "Joy Corner Guest");
  const drink = escapeHtml(favoriteDrink(row) || "your favorite drink");
  const code = escapeHtml(stringValue(row.voucherCode || row.code));
  const reward = escapeHtml(
    stringValue(row.voucherReward) || `Enjoy 1 Free ${drink}`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#fecb57"/><stop offset=".48" stop-color="#f48a2d"/><stop offset=".49" stop-color="#1f8aa0"/><stop offset="1" stop-color="#58c1d0"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="14" flood-opacity=".25"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="#eee5d6"/>
    <rect x="95" y="60" width="890" height="1800" rx="24" fill="url(#sky)" stroke="#21130c" stroke-width="22" filter="url(#shadow)"/>
    <circle cx="790" cy="560" r="145" fill="#ffe6a3" opacity=".9"/>
    <path d="M190 980 L540 520 L890 980 Z" fill="#1c8b93"/><path d="M410 980 L560 620 L760 980 Z" fill="#0e6670"/>
    <path d="M80 1160 C250 940 430 1040 520 1140 C650 1000 840 1000 1010 1160 L1010 1460 L80 1460 Z" fill="#2e8b3f"/>
    <path d="M90 1320 C280 1180 470 1220 590 1340 C740 1210 850 1230 990 1350 L990 1510 L90 1510 Z" fill="#66a841"/>
    <path d="M590 1160 L760 1160 L610 1580 L430 1580 Z" fill="#f2c35f"/>
    <path d="M95 60 H985 V620 C810 700 270 700 95 620 Z" fill="#21130c"/>
    <circle cx="540" cy="250" r="150" fill="#fff1bf" stroke="#21130c" stroke-width="28"/>
    <text x="540" y="325" text-anchor="middle" font-family="Georgia,serif" font-size="230" font-weight="900" fill="#21130c">J</text>
    <text x="540" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="86" font-weight="900" fill="#fff5d6" letter-spacing="8">JOY CORNER</text>
    <text x="540" y="566" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="800" fill="#fff5d6" letter-spacing="4">COFFEE / FREE DRINK</text>
    <rect x="95" y="1000" width="890" height="145" fill="#21130c"/>
    <text x="540" y="1098" text-anchor="middle" font-family="Arial,sans-serif" font-size="76" font-weight="900" fill="#ffd165">FREE DRINK VOUCHER</text>
    <rect x="160" y="1340" width="760" height="365" rx="34" fill="#fff1bf" stroke="#d9ad63" stroke-width="8"/>
    <text x="540" y="1430" text-anchor="middle" font-family="Arial,sans-serif" font-size="70" font-weight="900" fill="#21130c">${customer}</text>
    <text x="540" y="1518" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="900" fill="#a03f22">${reward}</text>
    <text x="540" y="1592" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#21130c">Show this voucher at Joy Corner</text>
    <rect x="250" y="1628" width="580" height="70" rx="16" fill="#21130c"/>
    <text x="540" y="1678" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="900" fill="#fff1bf">${code}</text>
    <text x="540" y="1765" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="900" fill="#fff1bf">${drink}</text>
  </svg>`;
}

function whatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function formObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<
    string,
    unknown
  >;
}

const rolePermissions: Record<StaffRole, Set<string>> = {
  owner: new Set([
    "appData",
    "getAppData",
    "liveData",
    "addCustomer",
    "removeCustomer",
    "addReceipt",
    "cancelReceipt",
    "collectUnpaidPayment",
    "collectReceiptPayment",
    "updateReceiptPayment",
    "markReceiptAccepted",
    "markReceiptPreparing",
    "markReceiptReady",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "resetDay",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "organizeSpreadsheet",
    "debugAuth",
    "debugSheets",
  ]),
  manager: new Set([
    "appData",
    "getAppData",
    "liveData",
    "addCustomer",
    "removeCustomer",
    "addReceipt",
    "cancelReceipt",
    "collectUnpaidPayment",
    "collectReceiptPayment",
    "updateReceiptPayment",
    "markReceiptAccepted",
    "markReceiptPreparing",
    "markReceiptReady",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "debugAuth",
    "debugSheets",
  ]),
  cashier: new Set([
    "appData",
    "getAppData",
    "liveData",
    "addCustomer",
    "removeCustomer",
    "addReceipt",
    "cancelReceipt",
    "collectUnpaidPayment",
    "collectReceiptPayment",
    "updateReceiptPayment",
    "markReceiptAccepted",
    "markReceiptPreparing",
    "markReceiptReady",
    "markReceiptDone",
    "generateVoucher",
    "redeemVoucher",
    "customerSearch",
    "customerHistory",
    "historyDays",
    "dayHistory",
    "debugAuth",
    "debugSheets",
  ]),
  waiter: new Set([
    "appData",
    "getAppData",
    "liveData",
    "addReceipt",
    "customerSearch",
    "customerHistory",
    "markReceiptAccepted",
    "markReceiptPreparing",
    "markReceiptReady",
    "markReceiptDone",
    "debugAuth",
  ]),
  barista: new Set([
    "appData",
    "getAppData",
    "liveData",
    "markReceiptAccepted",
    "markReceiptPreparing",
    "markReceiptReady",
    "markReceiptDone",
    "debugAuth",
  ]),
};

function canRunActionForProfile(
  profile: StaffProfile | null,
  fallbackRole: StaffRole,
  action: string,
) {
  const feature = actionFeaturePermissions[action];
  if (!feature) return canRunAction(fallbackRole, action);
  if (!profile) return canRunAction(fallbackRole, action);
  return hasPermission({
    effectivePermissions: profile.effectivePermissions,
    feature,
    grant: profile.grant || profile.permissions,
    revoke: profile.revoke || profile.revokedPermissions,
    role: profile.role || fallbackRole,
  });
}

function canRunAction(role: StaffRole, action: string) {
  return rolePermissions[role]?.has(action) === true;
}

function roleLabel(role: StaffRole) {
  const labels: Record<StaffRole, string> = {
    barista: "Barista",
    cashier: "Cashier",
    manager: "Manager",
    owner: "Owner",
    waiter: "Waiter",
  };

  return labels[role];
}

function rowSearchText(row: Row) {
  return Object.values(row)
    .map((value) => stringValue(value))
    .join(" ")
    .toLowerCase();
}

function unpaidDescriptionParts(row: Row) {
  const description = stringValue(row.unpaidDescription);
  if (!description) return [];

  return description
    .split(/\s*\|\s*|\n+|;+/)
    .flatMap((part) =>
      part.split(/(?=\d{4}-\d{2}-\d{2}\s+-\s+)/).map((item) => item.trim()),
    )
    .filter(Boolean)
    .slice(0, 6);
}

function filterCustomersByNameOrPhone(customers: Row[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const queryDigits = digitsOnly(query);

  if (!normalizedQuery && !queryDigits) return customers;

  return customers.filter((customer) => {
    const name = customerName(customer).toLowerCase();
    const phone = phoneOf(customer).toLowerCase();
    const phoneDigits = digitsOnly(phone);

    return (
      name.includes(normalizedQuery) ||
      phone.includes(normalizedQuery) ||
      Boolean(queryDigits && phoneDigits.includes(queryDigits))
    );
  });
}

function enrichOrderCustomerPhone(order: Row, customers: Row[]) {
  if (phoneOf(order)) return order;

  const orderCustomerId = customerIdOf(order);
  const orderCustomerName = stringValue(order.customerName).toLowerCase();
  const customer = customers.find((row) => {
    if (orderCustomerId && customerIdOf(row) === orderCustomerId) return true;
    return (
      orderCustomerName && customerName(row).toLowerCase() === orderCustomerName
    );
  });

  const phone = phoneOf(customer);
  return phone ? { ...order, phone, phoneWhatsApp: phone } : order;
}

function customerIdOf(row?: Row) {
  if (!row) return "";
  return stringValue(row.customerId || row.customerID || row.id || row.ID);
}

function customerName(row?: Row) {
  if (!row) return "";
  return (
    stringValue(row.fullName || row.customerName || row.name || row.customer) ||
    "Unnamed Customer"
  );
}

function phoneOf(row?: Row) {
  if (!row) return "";
  return localPhoneDisplay(
    stringValue(row.phoneWhatsApp || row.phone || row.mobile || row.whatsapp),
  );
}

function digitsOnly(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function localPhoneDisplay(value: string) {
  const phone = stringValue(value);
  const digits = digitsOnly(phone);
  if (/^1\d{9}$/.test(digits) && !phone.startsWith("+")) return `0${digits}`;
  return phone;
}

function favoriteDrink(row?: Row) {
  if (!row) return "";
  return stringValue(
    row.favoriteDrink || row.favouriteDrink || row.favorite || row.drink,
  );
}

function menuName(row: Row) {
  return stringValue(row.itemName || row.name || row.item) || "Menu item";
}

function menuPrice(row: Row) {
  return stringValue(
    row.priceText ||
      row.priceTextEditLater ||
      row["priceTextEditLater)"] ||
      row.price,
  );
}

function menuSizesFor(row: Row) {
  if (Array.isArray(row.sizes)) {
    return row.sizes
      .map((size) => {
        const record = size as Row;
        return {
          price: numberValue(record.price),
          size: stringValue(record.size) || "Standard",
        };
      })
      .filter((size) => size.price > 0);
  }

  return [
    {
      price: numberValue(row.suggestedPrice) || firstPrice(menuPrice(row)),
      size: stringValue(row.standardSize) || "Standard",
    },
  ].filter((size) => size.price > 0);
}

function categoryColor(category: string) {
  const colors = [
    "#d9ad63",
    "#5f8f6a",
    "#3f8fa3",
    "#b85c3e",
    "#7d6fb0",
    "#c08448",
    "#4f7f88",
    "#9a6a45",
  ];
  const key = stringValue(category || "All");
  const score = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return colors[score % colors.length];
}

function firstPrice(priceText: string) {
  const match = priceText.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function numberValue(value: unknown) {
  if (value instanceof Element && "value" in value) {
    return numberValue((value as HTMLInputElement).value);
  }
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  if (value instanceof Element && "value" in value) {
    return String((value as HTMLInputElement).value || "").trim();
  }
  return String(value ?? "").trim();
}

function activeValue(value: unknown) {
  if (value == null || value === "") return true;
  if (typeof value === "boolean") return value;
  return !["no", "false", "disabled", "inactive", "blocked", "0"].includes(
    stringValue(value).toLowerCase(),
  );
}

function stringArrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  return stringValue(value)
    .split(/[,\n|]+/)
    .map(stringValue)
    .filter(Boolean);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function errorMessage(error: unknown) {
  if (isFirebaseAuthConfigurationError(error)) {
    return "Firebase Email/Password sign-in is not enabled for this project yet.";
  }

  if (isFirebaseInvalidCredentialError(error)) {
    return "Firebase did not accept that email and password for this project. Check the Firebase Auth user, password, and project.";
  }

  return error instanceof Error ? error.message : String(error);
}

function isFirebaseAuthConfigurationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  return (
    code === "auth/configuration-not-found" ||
    message.includes("auth/configuration-not-found")
  );
}

function isFirebaseInvalidCredentialError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  return (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    message.includes("auth/invalid-credential") ||
    message.includes("auth/user-not-found") ||
    message.includes("auth/wrong-password")
  );
}
