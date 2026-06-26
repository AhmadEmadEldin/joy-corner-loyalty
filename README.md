# Joy Corner Loyalty

React staff web app for Joy Corner Loyalty. The frontend runs from VS Code, Firebase handles staff sign-in, and the local/hosted Node backend writes to the online Google Sheet through the Google Sheets API.

## Architecture

- React frontend: `src/app.tsx`
- Firebase client auth: `src/firebase.ts`
- Node backend: `server/googleSheetsBackend.ts`
- Sheet schema and protected columns: `server/sheetSchema.ts`
- Online Google Sheet: `1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8`

Apps Script is no longer required for the live app path.

## Setup

1. Create or choose a Google Cloud service account.
2. Enable the Google Sheets API for that Google Cloud project.
3. Share the Joy Corner Google Sheet with the service account `client_email` as Editor.
4. Put the service account JSON path or JSON content in `.env`.
5. Put Firebase web config in `.env` so the React app can sign staff in.
6. Put Firebase Admin service account JSON path or JSON content in `.env` so the backend can verify Firebase ID tokens.

Required backend settings:

```text
APP_API_BASE_URL=/api
CANVA_BACKEND_PORT=3001
GOOGLE_SHEETS_SPREADSHEET_ID=1e1z1pfNArVzaZs5FE4k0e3JqIlwJIPG_aWH4Fziqnl8
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=path/to/google-service-account.json
FIREBASE_SERVICE_ACCOUNT_KEY_FILE=path/to/firebase-service-account.json
```

You can use `GOOGLE_SERVICE_ACCOUNT_JSON` and `FIREBASE_SERVICE_ACCOUNT_JSON` instead of file paths when deploying to a host.

## Local Commands

```powershell
npm install
npm run dev
```

`npm run dev` starts both:

- Backend API: `http://localhost:3001`
- React frontend: `http://localhost:8081`

Useful checks:

```powershell
npm run lint:types
npm test
npm run build
```

## API Flow

The React app sends the Firebase ID token with every action. The backend verifies it, checks the staff role, then reads or writes the Google Sheet.

Supported actions include `appData`, `addReceipt`, `updateReceiptPayment`, `markReceiptDone`, `collectUnpaidPayment`, `generateVoucher`, and `redeemVoucher`.

REST-style read endpoints are also available:

```text
GET /api/menu
GET /api/dashboard/today
GET /api/customers/search?q=hesham
GET /api/customers/:customerId/history
GET /api/history/days
GET /api/history/:dateKey
```

## Sheet Safety

The backend reads headers from the sheet and writes by normalized header name. Formula/calculated customer columns such as totals, balances, paid drinks, free drinks, and last visit auto are listed in `server/sheetSchema.ts` and are left blank on new customer rows so existing sheet formulas can continue to work.

Writes append rows or update exact cells only. The app does not clear tabs or overwrite whole sheets.

## Receipt Serials

New receipts use daily serials in the format `JC-YYYYMMDD-0001`. Because the current Orders tab has no dedicated Receipt Serial column, the serial is stored in `Orders.Notes` as `Receipt: JC-YYYYMMDD-0001`. The backend scans today’s existing receipt serials, increments the highest number, and rechecks before writing.

## Counting And History

The dashboard now counts today’s orders by date. Full order history is still loaded for customer profiles, rewards, and the Day History view.

Top Drinks counts only drink-like menu/order rows and excludes common food/dessert words, then sorts by highest quantity ordered.

Day History groups orders, payments, and redemptions by `YYYY-MM-DD`, with receipt count, item count, sales, unpaid amount, latest receipt, and best-selling drink.
