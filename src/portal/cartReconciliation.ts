import type { CartLine, MenuItem } from "./repository";

export function reconcileCartWithMenu(
  cart: CartLine[],
  menu: MenuItem[],
): CartLine[] {
  const menuById = new Map(menu.map((item) => [item.id, item]));
  return cart.map((line) => {
    const currentItem = menuById.get(line.item.id);
    if (!currentItem || currentItem.availability_status === "archived") {
      return {
        ...line,
        invalidReason: "This item is no longer available.",
      };
    }
    if (currentItem.availability_status !== "available") {
      return {
        ...line,
        item: currentItem,
        invalidReason: "This item is no longer available.",
      };
    }
    const currentSize = currentItem.sizes.find(
      (size) =>
        size.id === line.size.id || size.size_name === line.size.size_name,
    );
    if (!currentSize) {
      return {
        ...line,
        item: currentItem,
        invalidReason: "The selected size is no longer available.",
      };
    }
    if (currentSize.price !== line.size.price) {
      return {
        ...line,
        invalidReason: undefined,
        item: currentItem,
        previousUnitPrice: line.size.price,
        requiresPriceAcknowledgement: true,
        size: currentSize,
      };
    }
    return {
      ...line,
      invalidReason: undefined,
      item: currentItem,
      size: currentSize,
    };
  });
}

export function cartCanCheckout(cart: CartLine[]): boolean {
  return (
    cart.length > 0 &&
    cart.every(
      (line) => !line.invalidReason && !line.requiresPriceAcknowledgement,
    )
  );
}
