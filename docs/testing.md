# Testing

Local verification:

```powershell
npm run lint:types
npm run lint
npm test
npm run build
npm run e2e
npm run e2e:supabase
```

Current automated coverage:

- menu normalization and price resolution
- receipt calculation and payment normalization
- permission mapping
- order status transitions
- browser smoke tests for staff login shell, customer route, favicon reference, and mobile horizontal overflow
- Supabase-provider lazy-route smoke tests for customer and staff portals on desktop and mobile
- Supabase customer drawer open/close, Escape handling, focus restoration, and navigation close behavior
- live-menu search, unavailable-product blocking, size/modifier selection, and calculated cart totals
- PostgreSQL workflow and RLS checks under `supabase/tests/database` (run with `npm run supabase:test` when local Supabase/Docker is available)

The responsive browser pass covers 320, 375, 390, 430, 768, 1024, 1280,
1440, and 1920 pixel widths and checks horizontal overflow plus browser console
errors. Authenticated Supabase customer/cashier/barista/owner acceptance requires
the linked project migrations, a configured publishable key, and dedicated test
accounts. Firebase role E2E still requires valid Firebase test users and
production-safe Google Sheets test data.
