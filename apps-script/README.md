# Joy Corner Apps Script Backend

This folder contains the Google Apps Script backend for the Joy Corner React staff app. It connects the frontend to Google Sheets.

## Files

- `Code.gs` - backend actions and JSON API connected to the Google Sheet.

## Deploy

1. Open your Apps Script project.
2. Replace the current `Code.gs` content with `apps-script/Code.gs`.
3. Deploy as **Web app**.
4. Set **Execute as** to your account.
5. Set **Who has access** to the staff access level you want.
6. Copy the deployed `/exec` URL into `GOOGLE_APPS_SCRIPT_WEB_APP_URL` in the root `.env` file.

The API URL works like this:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=appData
```

The `appData` action returns dashboard, customers, orders, menu, rewards,
winners, vouchers, unpaid tracker, payments, and redemptions.

## Frontend Choice

Use the React app from VS Code as the main staff interface. Apps Script remains only the backend that reads and writes Google Sheets. This avoids maintaining two different screens and fixes the mismatch between the VS Code viewer and the deployed Script page.
