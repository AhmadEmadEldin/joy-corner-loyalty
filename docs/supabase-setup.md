# Joy Corner Supabase setup and verification

The selected project reference is `ruurfhrjqfcydxbzpuqi`. Supabase is the
default application provider. Local migrations must still pass this checklist
before they are pushed to the linked project.

## 1. Authenticate and verify the selected project

Run these commands in an interactive Visual Studio terminal from the repository
root. Do not paste an access token into source files or chat.

```powershell
npx supabase login
npx supabase projects list
npm run supabase:link
npx supabase status --linked
```

Before pushing, confirm that the linked reference printed by the CLI is exactly
`ruurfhrjqfcydxbzpuqi`. The migrations are intentionally not applied by an
unauthenticated automation session.

## 2. Review, lint, and apply the database

Docker Desktop is optional for remote work but required for `supabase start`
and a full local reset.

```powershell
npm run supabase:lint
npx supabase migration list --linked
npm run supabase:push
```

Migrations create the operational schema, grants, RLS policies, transactional
RPCs, Realtime publications, storage buckets, safe cashier/barista projections,
audit logs, rewards, and voucher rules. Never use the service-role key in the
browser.

## 3. Configure Auth and the first owner

In Supabase Auth URL Configuration, set the production Site URL and add the
local and production `/order` redirect URLs. Choose the desired email-confirm
policy before customer testing.

Create the first owner in Authentication > Users, then run this one-time query
in the Supabase SQL editor with the correct email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"owner"}'::jsonb
where lower(email) = lower('OWNER_EMAIL_HERE');
```

The database trigger copies only protected `app_metadata.role` into the
profile. Customer-editable user metadata is never used for authorization.

Deploy the owner-only staff-management function:

```powershell
npx supabase functions deploy admin-users --project-ref ruurfhrjqfcydxbzpuqi
```

## 4. Environment variables

Copy `.env.example` values into `.env.local` for local testing:

```text
VITE_SUPABASE_URL=https://ruurfhrjqfcydxbzpuqi.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable or anon key>
VITE_DATA_PROVIDER=supabase
SUPABASE_SERVICE_ROLE_KEY=<server and migration scripts only>
```

The webpack bundle receives only the URL, publishable key, and provider flag.
Use `legacy` only for a deliberate rollback exercise.

Configure `SUPABASE_SERVICE_ROLE_KEY` and one documented Google credential
method only in the reporting-worker runtime. Run `npm run sync:reporting` from a
scheduled server process. It claims at most `REPORTING_SYNC_BATCH_SIZE` outbox
events and batch-upserts the affected spreadsheet rows.

## 5. Seed and migrate data

Load the version-controlled menu after migrations:

```powershell
npm run seed:supabase-menu
```

Export the Google workbook as XLSX (preferred), pass its public XLSX export URL,
or use CSV for a single tab. The importer recognizes the live workbook's
`Customers`, `Menu`, `Orders`, `Order Items`, `Payments`, `Rewards`, and
`Generated Vouchers` tabs. It is idempotent by legacy IDs and source
fingerprint.

```powershell
npm run migrate:supabase -- --source=C:\path\joy-corner-export.xlsx
npm run migrate:supabase -- --source=C:\path\joy-corner-export.xlsx --apply
# Public workbook, no temporary file required:
npm run migrate:supabase -- "--source=https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/export?format=xlsx"
```

The first command is always a dry run. The importer does not read or reconstruct
passwords. Any password column in the legacy Staff tab is explicitly skipped.
It creates customer Auth identities with random undisclosed credentials and
customers use password reset/OTP at cutover. Staff must be invited or created
through the owner-only Auth workflow. Rows without a usable identity or required
relationship are recorded in `migration_failures`.

## 6. Acceptance checklist

- Customer A cannot read or mutate Customer B profile, orders, payments,
  rewards, vouchers, notifications, or payment-proof objects.
- A customer order starts at `pending_confirmation`, `confirmation_status =
  pending`, and `kitchen_visible = false`.
- Cashier confirmation makes the order visible in the kitchen queue; rejection
  never does.
- A barista sees only first-name pickup data, items, safe notes, timestamps, and
  status—never phone, email, payment, rewards, voucher, or internal notes.
- Status skips are rejected. Valid flow is Confirmed -> Accepted -> Preparing ->
  Ready -> Picked Up -> Closed. Rejection/cancellation requires a reason.
- Duplicate RPC calls with the same idempotency key do not create a duplicate
  payment, reward, voucher, discount, or transition.
- Rewards post once and only when an order is both paid and closed. Seven
  eligible purchases produce one free reward under the seeded setting.
- A voucher cannot be reused, applied to another customer, or redeemed after
  expiry.
- Menu image and payment-proof MIME/size/path policies work as documented.
- Cashier and kitchen screens update without refresh and cleanly unsubscribe
  when signed out.
- XLSX reconciliation matches customer counts, order/payment totals, reward
  balances, and voucher states; all failure rows are resolved or accepted.
- `npm run check` passes, remote `supabase db lint` has no security errors, and
  Supabase Security/Performance advisors have been reviewed.

Keep the legacy Firebase code intact during the fallback window, but do not run
it beside the Supabase order path. Never copy Supabase order or receipt rows to
Firestore; the spreadsheet outbox is the supported reporting integration.
