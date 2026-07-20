process.env.FIREBASE_FUNCTIONS = "1";
// Keep the Functions deployment fingerprint aligned with the TypeScript backend.
// Barista flow revision: Requested -> Accepted -> Picked Up.

require("tsx/cjs");

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { app, archivePreviousBusinessDay } = require("./server/googleSheetsBackend.ts");

exports.api = onRequest(
  {
    cors: true,
    memory: "1GiB",
    region: process.env.FIREBASE_FUNCTION_REGION || "us-central1",
    secrets: [
      "GOOGLE_SHEET_ID",
    ],
  },
  app,
);

exports.archivePreviousBusinessDay = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: "Africa/Cairo",
    region: process.env.FIREBASE_FUNCTION_REGION || "us-central1",
    secrets: ["GOOGLE_SHEET_ID"],
  },
  async () => {
    await archivePreviousBusinessDay();
  },
);
