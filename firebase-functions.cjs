process.env.FIREBASE_FUNCTIONS = "1";

require("tsx/cjs");

const { onRequest } = require("firebase-functions/v2/https");
const { app } = require("./server/googleSheetsBackend.ts");

exports.api = onRequest(
  {
    cors: true,
    region: process.env.FIREBASE_FUNCTION_REGION || "us-central1",
    secrets: [
      "GOOGLE_SHEET_ID",
      "GOOGLE_CLIENT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
    ],
  },
  app,
);
