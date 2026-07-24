import { google } from "googleapis";

export function googleSheetsClient() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawCredentials) {
    return google.sheets({
      auth: new google.auth.GoogleAuth({
        credentials: JSON.parse(rawCredentials) as Record<string, unknown>,
        scopes,
      }),
      version: "v4",
    });
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return google.sheets({
      auth: new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
        scopes,
      }),
      version: "v4",
    });
  }
  return google.sheets({
    auth: new google.auth.GoogleAuth({ scopes }),
    version: "v4",
  });
}
