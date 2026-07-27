import { ORDER_STATUS } from "../src/orderWorkflow";
import {
  importedCompletionTimestamp,
  importedConfirmationStatus,
  normalizeImportedOrderStatus,
} from "./importOrderNormalization";

describe("Google Sheets order import normalization", () => {
  it.each([
    ["accepted", ORDER_STATUS.IN_PREPARATION],
    ["preparing", ORDER_STATUS.IN_PREPARATION],
    ["closed", ORDER_STATUS.PICKED_UP],
  ])("imports legacy %s as %s", (legacy, canonical) => {
    expect(normalizeImportedOrderStatus(legacy)).toBe(canonical);
  });

  it.each([
    [ORDER_STATUS.AWAITING_CONFIRMATION, "pending"],
    [ORDER_STATUS.CONFIRMED, "confirmed"],
    [ORDER_STATUS.IN_PREPARATION, "confirmed"],
    [ORDER_STATUS.READY, "confirmed"],
    [ORDER_STATUS.PICKED_UP, "confirmed"],
  ] as const)("derives confirmation status for %s", (status, confirmation) => {
    expect(importedConfirmationStatus(status)).toBe(confirmation);
  });

  it("sets the completion timestamp only for picked-up orders", () => {
    const createdAt = "2026-07-27T10:15:00.000Z";
    expect(
      importedCompletionTimestamp(ORDER_STATUS.PICKED_UP, createdAt),
    ).toBe(createdAt);
    expect(
      importedCompletionTimestamp(ORDER_STATUS.READY, createdAt),
    ).toBeNull();
  });
});
