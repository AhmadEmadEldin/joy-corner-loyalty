import dotenv from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { readFileSync } from "node:fs";

dotenv.config();

type StaffSeed = {
  active: boolean;
  displayName: string;
  email: string;
  password: string;
  role: "owner" | "manager" | "cashier" | "waiter" | "barista";
};

const validRoles = new Set(["owner", "manager", "cashier", "waiter", "barista"]);

function firebaseCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FILE) {
    return cert(JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FILE, "utf8")));
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials.");
  }

  return cert({ clientEmail, privateKey, projectId });
}

function googleCredential() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    return JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8"));
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Missing Google Sheets service account credentials.");
  }

  return { client_email: clientEmail, private_key: privateKey };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function activeValue(value: unknown) {
  const normalized = clean(value).toLowerCase();
  return !["no", "false", "disabled", "inactive", "blocked", "0"].includes(normalized);
}

async function readStaffSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID.");

  const auth = new google.auth.GoogleAuth({
    credentials: googleCredential(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ auth, version: "v4" });
  const response = await sheets.spreadsheets.values.get({
    range: "'Staff'!A:Z",
    spreadsheetId,
  });
  const values = response.data.values || [];
  const headers = (values.shift() || []).map(normalizeKey);

  return values
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = clean(row[index]);
      });

      const role = clean(record.role).toLowerCase();
      if (!validRoles.has(role)) return null;

      return {
        active: activeValue(record.active),
        displayName: record.name || record.displayname || record.email,
        email: clean(record.email).toLowerCase(),
        password: clean(record.password),
        role,
      } as StaffSeed;
    })
    .filter((staff): staff is StaffSeed => Boolean(staff?.email && staff.password));
}

async function upsertStaff(staff: StaffSeed) {
  const auth = getAuth();
  let user;

  try {
    user = await auth.getUserByEmail(staff.email);
    user = await auth.updateUser(user.uid, {
      disabled: !staff.active,
      displayName: staff.displayName,
      password: staff.password,
    });
  } catch {
    user = await auth.createUser({
      disabled: !staff.active,
      displayName: staff.displayName,
      email: staff.email,
      emailVerified: true,
      password: staff.password,
    });
  }

  const staffDoc = getFirestore().collection("users").doc(user.uid);
  const staffSnapshot = await staffDoc.get();
  await staffDoc.set(
    {
      active: staff.active,
      ...(staffSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      displayName: staff.displayName,
      email: staff.email,
      role: staff.role,
      type: "staff",
      uid: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    active: staff.active,
    displayName: staff.displayName,
    email: staff.email,
    role: staff.role,
    uid: user.uid,
  };
}

async function main() {
  if (!getApps().length) {
    initializeApp({
      credential: firebaseCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    });
  }

  const staffRows = await readStaffSheet();
  if (!staffRows.length) throw new Error("No valid staff rows found in the Staff sheet.");

  for (const staff of staffRows) {
    const result = await upsertStaff(staff);
    console.log(`${result.role.padEnd(7)} ${result.email.padEnd(32)} ${result.uid}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
