import { fireEvent, render, screen } from "@testing-library/react";
import { CustomerNavigation } from "./CustomerNavigation";

describe("CustomerNavigation", () => {
  it("opens, closes with Escape, and restores focus", () => {
    render(
      <CustomerNavigation
        active="menu"
        badges={{ cart: 2 }}
        onNavigate={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Customer navigation" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Customer navigation" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("navigates and closes after a mobile selection", () => {
    const onNavigate = jest.fn();
    render(
      <CustomerNavigation
        active="home"
        badges={{}}
        onNavigate={onNavigate}
        onSignOut={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Customer navigation" });
    fireEvent.click(drawer.querySelector('button:nth-of-type(2)') as HTMLButtonElement);
    expect(onNavigate).toHaveBeenCalledWith("menu");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
