import { act, fireEvent, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import { OrderTicket } from "./app";

jest.mock("./firebase", () => ({
  auth: null,
  firebaseReady: false,
  signInCustomer: jest.fn(),
  signInStaff: jest.fn(),
  signUpCustomer: jest.fn(),
  signOutStaff: jest.fn(),
  watchFirebaseUser: jest.fn(),
  watchStaffAuth: jest.fn(),
}));

const baseOrder = {
  customerName: "Mona",
  orderDateTime: "2026-07-08 10:00",
  orderDescription: "Latte x1",
  orderStatus: "Submitted",
  outstandingAmount: 75,
  paidAmount: 0,
  paymentStatus: "Unpaid",
  receiptId: "REC-1",
  staff: "Barista 1",
  total: 75,
};

function renderTicket(
  order: Record<string, unknown>,
  overrides: Partial<ComponentProps<typeof OrderTicket>> = {},
) {
  return render(
    <OrderTicket
      order={{ ...baseOrder, ...order }}
      onDone={jest.fn()}
      onSetPayment={jest.fn()}
      onStatus={jest.fn()}
      showPaymentActions={false}
      showPickupAction
      view="barista"
      {...overrides}
    />,
  );
}

describe("OrderTicket", () => {
  it("shows preparation and payment badges together", () => {
    renderTicket({ orderStatus: "Accepted", paymentStatus: "Paid" });

    expect(screen.getAllByText("Accepted").length).toBeGreaterThan(0);
    expect(screen.queryByText("Paid")).toBeNull();
    const ticket = screen.getByText("Mona").closest("article");
    expect(ticket?.classList.contains("status-accepted")).toBe(true);
    expect(ticket?.classList.contains("payment-paid")).toBe(true);
  });

  it("uses red picked up preparation state", () => {
    renderTicket({ orderStatus: "Picked Up", paymentStatus: "Paid" });

    const ticket = screen.getByText("Mona").closest("article");
    expect(ticket?.classList.contains("status-picked-up")).toBe(true);
    expect(screen.getByText("Picked Up")).toBeTruthy();
  });

  it("marks only the barista ready ticket as finished", () => {
    const { rerender } = renderTicket({
      orderStatus: "Ready",
      paymentStatus: "Unpaid",
    });
    expect(screen.getByText("Mona").closest("article")?.classList).toContain(
      "is-finished",
    );

    rerender(
      <OrderTicket
        order={{ ...baseOrder, orderStatus: "Ready", paymentStatus: "Unpaid" }}
        onDone={jest.fn()}
        onSetPayment={jest.fn()}
        onStatus={jest.fn()}
        showPickupAction={false}
        view="orders"
      />,
    );

    const ordersTicket = screen.getByText("Mona").closest("article");
    expect(ordersTicket?.classList.contains("orders-receipt")).toBe(true);
    expect(ordersTicket?.classList.contains("is-finished")).toBe(false);
  });

  it("prevents duplicate accept requests while pending", async () => {
    let resolveStatus: (() => void) | undefined;
    const onStatus = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    renderTicket({ orderStatus: "Requested" }, { onStatus });

    const accept = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(accept);
    fireEvent.click(accept);

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(
      expect.any(String),
      "acceptOrder",
      "Receipt accepted.",
    );

    await act(async () => {
      resolveStatus?.();
    });
  });

  it("keeps the barista board to Accept and Pick Up only", () => {
    const { rerender } = renderTicket({ orderStatus: "Requested" });

    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Pick Up" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ready" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Wrong / Cancel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Collect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Print" })).toBeNull();

    rerender(
      <OrderTicket
        order={{ ...baseOrder, orderStatus: "Accepted" }}
        onDone={jest.fn()}
        onSetPayment={jest.fn()}
        onStatus={jest.fn()}
        showPaymentActions={false}
        showPickupAction
        view="barista"
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Accepted" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Pick Up" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
