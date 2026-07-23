import { clearCartDraft, loadCartDraft, saveCartDraft } from "./cartDraft";
import type { CartLine } from "./repository";

const line: CartLine = {
  item: {
    available: true,
    category: "Coffee",
    description: "",
    id: "item-1",
    image_url: null,
    loyalty_eligible: true,
    modifiers: [],
    name: "Latte",
    sizes: [{ id: "size-1", price: 60, size_name: "Regular" }],
  },
  lineId: "line-1",
  modifiers: [],
  notes: "",
  quantity: 1,
  size: { id: "size-1", price: 60, size_name: "Regular" },
};

describe("Cart draft", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps the cart and submission key together", () => {
    saveCartDraft("customer-1", [line], "request-key-123");
    expect(loadCartDraft("customer-1")).toEqual({
      cart: [line],
      idempotencyKey: "request-key-123",
      version: 1,
    });
  });

  it("clears a submitted draft", () => {
    saveCartDraft("customer-1", [line], "request-key-123");
    clearCartDraft("customer-1");
    expect(loadCartDraft("customer-1")).toBeNull();
  });
});
