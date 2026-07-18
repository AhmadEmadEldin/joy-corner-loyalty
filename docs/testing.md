# Testing

Local verification:

```powershell
npm run lint:types
npm run lint
npm test
npm run build
npm run e2e
```

Current automated coverage:

- menu normalization and price resolution
- receipt calculation and payment normalization
- permission mapping
- order status transitions
- browser smoke tests for staff login shell, customer route, favicon reference, and mobile horizontal overflow

Authenticated owner/waiter/cashier/barista E2E requires valid Firebase test users and production-safe Google Sheets test data.
