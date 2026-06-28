process.env.FIREBASE_FUNCTIONS = "1";

require("tsx/cjs");

const { onRequest } = require("firebase-functions/v2/https");
const { app } = require("./server/googleSheetsBackend.ts");

exports.api = onRequest(
  {
    region: "us-central1",
    secrets: [
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      "GOOGLE_SHEETS_SPREADSHEET_ID",
    ],
    timeoutSeconds: 120,
  },
  app,
);
