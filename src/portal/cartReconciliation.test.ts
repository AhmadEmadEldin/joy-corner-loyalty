import {
  cartCanCheckout,
  reconcileCartWithMenu,
} from "./cartReconciliation";
import type { CartLine, MenuItem } from "./repository";

const item: MenuItem = {
  availability_status: "available",
  available: true,
  category: "Hot Beverages",
  description: "",
  id: "coffee",
  image_url: null,
  loyalty_eligible: true,
  modifiers: [],
  name: "Coffee",
  sizes: [{ id: "regular", price: 50, size_name: "Regular" }],
};

const line: CartLine = {
  item,
  lineId: "line",
  modifiers: [],
  notes: "",
  quantity: 1,
  size: item.sizes[0]!,
};

describe("cart reconciliation", () => {
  it("requires acknowledgement after a live price change", () => {
    const result = reconcileCartWithMenu(
      [line],
      [
        {
          ...item,
          sizes: [{ ...item.sizes[0]!, price: 60 }],
        },
      ],
    );
    expect(result[0]?.previousUnitPrice).toBe(50);
    expect(result[0]?.size.price).toBe(60);
    expect(result[0]?.requiresPriceAcknowledgement).toBe(true);
    expect(cartCanCheckout(result)).toBe(false);
  });

  it("invalidates a line when a product becomes unavailable", () => {
    const result = reconcileCartWithMenu(
      [line],
      [
        {
          ...item,
          availability_status: "sold_out",
          available: false,
        },
      ],
    );
    expect(result[0]?.invalidReason).toBe(
      "This item is no longer available.",
    );
    expect(cartCanCheckout(result)).toBe(false);
  });
});
