import { fireEvent, render, screen } from "@testing-library/react";
import { MobileNavigation } from "./MobileNavigation";

const tabs = [
  ["dashboard", "Dashboard"],
  ["orders", "Orders"],
] as const;

describe("MobileNavigation", () => {
  it("opens an accessible drawer containing only the supplied role tabs", () => {
    render(
      <MobileNavigation
        activeTab="dashboard"
        displayName="Waiter One"
        onSelect={jest.fn()}
        onSignOut={jest.fn()}
        role="Waiter"
        tabs={[...tabs]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Staff navigation" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Orders" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Owner" })).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on selection and restores focus to the menu trigger", () => {
    const onSelect = jest.fn();
    render(
      <MobileNavigation
        activeTab="dashboard"
        displayName="Cashier One"
        onSelect={onSelect}
        onSignOut={jest.fn()}
        role="Cashier"
        tabs={[...tabs]}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));

    expect(onSelect).toHaveBeenCalledWith("orders");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape and supports overlay dismissal", () => {
    render(
      <MobileNavigation
        activeTab="dashboard"
        displayName="Barista One"
        onSelect={jest.fn()}
        onSignOut={jest.fn()}
        role="Barista"
        tabs={[...tabs]}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Close navigation menu" })[0]!,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
