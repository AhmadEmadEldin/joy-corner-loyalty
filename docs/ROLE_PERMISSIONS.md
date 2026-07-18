# Role permissions

The UI hides unavailable actions and the API independently enforces the same feature permissions.

- Owner: all features, staff/permission administration, schema tools, and End Day.
- Manager: operational overview, customer/order/payment/menu/reward work, approval/rejection, and reasoned late cancellation.
- Cashier: customer/order/payment/reward work and order approval; no staff or schema administration.
- Waiter: menu/customer lookup and order creation; no payment collection or barista preparation controls.
- Barista: only approved active orders; accept, prepare, ready, pickup, and complete in sequence.
- Customer: own menu/order portal; create a request, confirm when asked, cancel while allowed, and view only owned orders.

Role defaults are extended by `grant` and reduced by `revoke` in Firestore. Owner rights cannot be inferred from a Sheet value or browser payload.
