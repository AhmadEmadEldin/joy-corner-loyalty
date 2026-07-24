import { fireEvent, render, screen } from "@testing-library/react";
import { CustomerMenu, lineTotal } from "./CustomerMenu";
import type { CartLine, MenuItem } from "./repository";

const latte: MenuItem = {
  available: true,
  category: "Hot Coffee",
  description: "Espresso with steamed milk",
  id: "latte",
  image_url: null,
  loyalty_eligible: true,
  modifiers: [{ id: "shot", name: "Extra shot", price: 15 }],
  name: "Caffè Latte",
  sizes: [
    { id: "small", price: 60, size_name: "Small" },
    { id: "large", price: 80, size_name: "Large" },
  ],
};

const unavailable: MenuItem = {
  ...latte,
  available: false,
  category: "Desserts",
  id: "cake",
  name: "Coffee Cake",
};

describe("CustomerMenu", () => {
  it("shows a clear empty state when the database menu has no items", () => {
    render(
      <CustomerMenu
        cart={[]}
        loading={false}
        menu={[]}
        onCartChange={jest.fn()}
        onCheckout={jest.fn()}
      />,
    );

    expect(screen.getByText("No menu items available.")).toBeTruthy();
    expect(screen.getByText("Please check back later.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("filters the database menu and prevents unavailable ordering", () => {
    render(
      <CustomerMenu
        cart={[]}
        loading={false}
        menu={[latte, unavailable]}
        onCartChange={jest.fn()}
        onCheckout={jest.fn()}
      />,
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search the menu" }),
      {
        target: { value: "cake" },
      },
    );
    expect(screen.queryByText("Caffè Latte")).toBeNull();
    expect(screen.getByText("Coffee Cake")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Customize Coffee Cake",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("adds a configured size and modifier with the calculated total", () => {
    const onCartChange = jest.fn();
    render(
      <CustomerMenu
        cart={[]}
        loading={false}
        menu={[latte]}
        onCartChange={onCartChange}
        onCheckout={jest.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Customize Caffè Latte" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Large/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Extra shot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    fireEvent.click(screen.getByRole("button", { name: /Add to order/ }));
    expect(onCartChange).toHaveBeenCalledTimes(1);
    const saved = onCartChange.mock.calls[0]?.[0] as CartLine[];
    expect(saved[0]?.size.id).toBe("large");
    expect(saved[0]?.quantity).toBe(2);
    expect(lineTotal(saved[0] as CartLine)).toBe(190);
  });

  it("traps focus in the product dialog and restores it when closed", () => {
    render(
      <CustomerMenu
        cart={[]}
        loading={false}
        menu={[latte]}
        onCartChange={jest.fn()}
        onCheckout={jest.fn()}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: /Customize Caff.+ Latte/,
    });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: "Close product details" })[1],
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
});
