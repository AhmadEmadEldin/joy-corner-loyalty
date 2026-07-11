import { buildReceiptSubmissionPayload } from "./app";

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

describe("buildReceiptSubmissionPayload", () => {
  it("preserves notes and resolves customer details from the selected customer", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input name="customerId" value="cust-1" />
      <input name="customerName" value="Walk-in" />
      <input name="customerPhone" value="" />
      <input name="receiptDiscountPercentage" value="0" />
      <input name="paidAmount" value="10" />
      <textarea name="notes">Takeaway note</textarea>
      <input name="staff" value="Nora" />
      <input name="itemId" value="latte" />
      <input name="size" value="Standard" />
      <input name="qty" value="1" />
      <input name="unitPrice" value="75" />
    `;
    document.body.appendChild(form);

    const items = [
      {
        category: "Coffee",
        itemId: "latte",
        itemName: "Latte",
        qty: 1,
        size: "Standard",
        total: 75,
        unitPrice: 75,
      },
    ];

    const payload = buildReceiptSubmissionPayload(
      form,
      items,
      [{ customerId: "cust-1", fullName: "Mona", phoneWhatsApp: "01000000000" }],
    );

    expect(payload.customerName).toBe("Mona");
    expect(payload.phone).toBe("01000000000");
    expect(payload.notes).toBe("Takeaway note");
    expect(payload.items).toEqual(items);
    expect(payload.idempotencyKey).toMatch(/.+/);

    document.body.removeChild(form);
  });

  it("normalizes partial payments against the receipt total", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input name="customerId" value="" />
      <input name="customerName" value="Walk-in" />
      <input name="customerPhone" value="" />
      <input name="receiptDiscountPercentage" value="0" />
      <input name="paidAmount" value="10" />
      <select name="paymentStatus"><option value="Partial">Partial</option></select>
      <textarea name="notes">Takeaway note</textarea>
      <input name="staff" value="Nora" />
      <input name="itemId" value="latte" />
      <input name="size" value="Standard" />
      <input name="qty" value="1" />
      <input name="unitPrice" value="75" />
    `;
    document.body.appendChild(form);

    const payload = buildReceiptSubmissionPayload(
      form,
      [
        {
          category: "Coffee",
          itemId: "latte",
          itemName: "Latte",
          qty: 1,
          size: "Standard",
          total: 75,
          unitPrice: 75,
        },
      ],
      [],
    );

    expect(payload.paidAmount).toBe(10);
    expect(payload.remainingAmount).toBe(65);

    document.body.removeChild(form);
  });
});
