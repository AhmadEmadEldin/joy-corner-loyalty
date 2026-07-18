import dotenv from "dotenv";
import { google, sheets_v4 } from "googleapis";
import { readFileSync } from "node:fs";
import {
  auditLegacyWorkbook,
  canonicalRows,
  migrateLegacyWorkbook,
  type CellValue,
  type SourceWorkbook,
} from "../server/workbookMigration";
import {
  CANONICAL_SHEET_TABS,
  LEGACY_SOURCE_TABS,
  NORMALIZED_SHEET_HEADERS,
  type CanonicalSheetName,
} from "../server/sheets/schema";

dotenv.config({
  path: [process.env.JOY_ENV_FILE || ".env.local", ".env"],
  quiet: true,
});

const args = new Set(process.argv.slice(2));
const value = (name: string) => {
  const prefix = `${name}=`;
  return (
    process.argv
      .slice(2)
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length) || ""
  );
};
const sourceId =
  value("--source") ||
  process.env.GOOGLE_SOURCE_SHEET_ID ||
  process.env.GOOGLE_SHEET_ID ||
  "";
const targetId = value("--target") || process.env.GOOGLE_REBUILT_SHEET_ID || "";

async function main() {
  const mode = [
    "--audit",
    "--create-copy",
    "--dry-run",
    "--migrate",
    "--verify",
    "--switch-config",
    "--cleanup-old-tabs",
  ].find((candidate) => args.has(candidate));
  if (!mode)
    throw new Error(
      "Choose exactly one command: --audit, --create-copy, --dry-run, --migrate, --verify, --switch-config, or --cleanup-old-tabs.",
    );
  if (!sourceId && !["--switch-config"].includes(mode))
    throw new Error(
      "Missing --source=<spreadsheetId> or GOOGLE_SOURCE_SHEET_ID.",
    );
  const { drive, sheets } = clients();

  if (mode === "--create-copy") {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "Z");
    const backup = await drive.files.copy({
      fileId: sourceId,
      requestBody: { name: `Joy_Corner_Backup_${stamp}` },
      fields: "id,name,webViewLink",
    });
    const working = await drive.files.copy({
      fileId: sourceId,
      requestBody: { name: `Joy_Corner_Rebuilt_Working_${stamp}` },
      fields: "id,name,webViewLink",
    });
    print({ backup: backup.data, working: working.data });
    return;
  }
  if (mode === "--switch-config") {
    if (!targetId) throw new Error("Missing --target=<verifiedSpreadsheetId>.");
    print({
      actionRequired: `Set the backend-only GOOGLE_SHEET_ID secret to ${targetId} after owner approval.`,
      changed: false,
      productionUnchanged: true,
    });
    return;
  }

  const source = await readWorkbook(sheets, sourceId, [...LEGACY_SOURCE_TABS]);
  const audit = auditLegacyWorkbook(source);
  if (mode === "--audit") {
    print(summary(audit));
    return;
  }
  if (mode === "--dry-run") {
    print({ dryRun: true, targetUnchanged: true, ...summary(audit) });
    return;
  }
  if (!targetId) throw new Error("Missing --target=<rebuiltSpreadsheetId>.");

  if (mode === "--migrate") {
    await rebuildTarget(sheets, targetId, audit);
    print({ migrated: true, targetId, ...summary(audit) });
    return;
  }
  if (mode === "--cleanup-old-tabs") {
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: targetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const obsolete = (metadata.data.sheets || []).filter(
      (sheet) =>
        !CANONICAL_SHEET_TABS.includes(sheet.properties?.title as never),
    );
    if (obsolete.length)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetId,
        requestBody: {
          requests: obsolete.map((sheet) => ({
            deleteSheet: { sheetId: sheet.properties!.sheetId! },
          })),
        },
      });
    print({
      deletedFromWorkingCopyOnly: obsolete.map(
        (sheet) => sheet.properties?.title,
      ),
      targetId,
    });
    return;
  }
  if (mode === "--verify") {
    const result = await verifyTarget(sheets, targetId, audit.reconciliation);
    print(result);
    if (!result.passed) process.exitCode = 2;
    return;
  }
}

function clients() {
  const credentials = googleCredential();
  const auth = new google.auth.GoogleAuth({
    ...(credentials ? { credentials } : {}),
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
  return {
    drive: google.drive({ auth, version: "v3" }),
    sheets: google.sheets({ auth, version: "v4" }),
  };
}

function googleCredential() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
    return JSON.parse(
      readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8"),
    );
  if (process.env.JOY_FIREBASE_SERVICE_ACCOUNT_JSON)
    return JSON.parse(process.env.JOY_FIREBASE_SERVICE_ACCOUNT_JSON);
  if (process.env.JOY_FIREBASE_SERVICE_ACCOUNT_KEY_FILE)
    return JSON.parse(
      readFileSync(process.env.JOY_FIREBASE_SERVICE_ACCOUNT_KEY_FILE, "utf8"),
    );
  const client_email =
    process.env.GOOGLE_CLIENT_EMAIL || process.env.JOY_FIREBASE_CLIENT_EMAIL;
  const private_key = (
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.JOY_FIREBASE_PRIVATE_KEY ||
    ""
  ).replace(/\\n/g, "\n");
  return client_email && private_key
    ? { client_email, private_key }
    : undefined;
}

async function readWorkbook(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabs: string[],
): Promise<SourceWorkbook> {
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map((tab) => `'${tab.replace(/'/g, "''")}'!A:BE`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return Object.fromEntries(
    tabs.map((tab, index) => [
      tab,
      (response.data.valueRanges?.[index]?.values || []) as CellValue[][],
    ]),
  );
}

async function rebuildTarget(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  result: ReturnType<typeof migrateLegacyWorkbook>,
) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,index)",
  });
  const existing = metadata.data.sheets || [];
  if (!existing.length) throw new Error("Target workbook has no sheets.");
  const keeper = existing[0]!.properties!;
  const requests: sheets_v4.Schema$Request[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: keeper.sheetId,
          title: "Dashboard",
          gridProperties: {
            columnCount: NORMALIZED_SHEET_HEADERS.Dashboard.length,
            rowCount: Math.max(100, result.destination.Dashboard.length + 10),
            frozenRowCount: 1,
          },
        },
        fields: "title,gridProperties(columnCount,rowCount,frozenRowCount)",
      },
    },
    ...existing
      .slice(1)
      .map((sheet) => ({
        deleteSheet: { sheetId: sheet.properties!.sheetId! },
      })),
    ...CANONICAL_SHEET_TABS.slice(1).map((title, index) => ({
      addSheet: {
        properties: {
          title,
          index: index + 1,
          gridProperties: {
            columnCount: NORMALIZED_SHEET_HEADERS[title].length,
            rowCount: Math.max(100, result.destination[title].length + 10),
            frozenRowCount: 1,
          },
        },
      },
    })),
  ];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: CANONICAL_SHEET_TABS.map((tab) => ({
        range: `'${tab}'!A1`,
        majorDimension: "ROWS",
        values: canonicalRows(result, tab),
      })),
    },
  });
  await formatTarget(sheets, spreadsheetId);
}

async function formatTarget(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties)",
  });
  const requests: sheets_v4.Schema$Request[] = [];
  for (const sheet of metadata.data.sheets || []) {
    const id = sheet.properties!.sheetId!;
    const title = sheet.properties!.title!;
    const columns =
      NORMALIZED_SHEET_HEADERS[title as keyof typeof NORMALIZED_SHEET_HEADERS]
        ?.length || 1;
    requests.push(
      {
        repeatCell: {
          range: {
            sheetId: id,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columns,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.18, green: 0.12, blue: 0.08 },
              horizontalAlignment: "CENTER",
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 0.96, blue: 0.86 },
              },
            },
          },
          fields:
            "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)",
        },
      },
      {
        setBasicFilter: {
          filter: {
            range: {
              sheetId: id,
              startRowIndex: 0,
              startColumnIndex: 0,
              endColumnIndex: columns,
              endRowIndex: sheet.properties?.gridProperties?.rowCount || 100,
            },
          },
        },
      },
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: id,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: columns,
          },
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
    );
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

async function verifyTarget(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sourceReconciliation: ReturnType<
    typeof migrateLegacyWorkbook
  >["reconciliation"],
) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields:
      "properties(title,locale,timeZone),sheets.properties(sheetId,title)",
  });
  const tabs = (metadata.data.sheets || []).map(
    (sheet) => sheet.properties?.title || "",
  );
  const values = await readWorkbook(sheets, spreadsheetId, [
    ...CANONICAL_SHEET_TABS,
  ]);
  const destination = migrateLegacyWorkbook(
    Object.fromEntries([...LEGACY_SOURCE_TABS].map((tab) => [tab, []])),
  ).destination;
  for (const tab of CANONICAL_SHEET_TABS)
    destination[tab] = table(values[tab] || []);
  const idsUnique = [
    "Orders:orderId",
    "Payments:paymentId",
    "Loyalty:loyaltyRecordId",
  ].map((entry) => {
    const [tab, key] = entry.split(":");
    const ids = destination[tab as CanonicalSheetName]
      .map((row) => String(row[key!] || ""))
      .filter(Boolean);
    return { duplicateCount: ids.length - new Set(ids).size, key, tab };
  });
  const orderIds = new Set(
    destination.Orders.map((row) => String(row.orderId || "")),
  );
  const orphanItems = destination["Order Items"].filter(
    (row) => !orderIds.has(String(row.orderId || "")),
  ).length;
  const headersMatch = CANONICAL_SHEET_TABS.every(
    (tab) =>
      JSON.stringify(
        (values[tab]?.[0] || []).slice(0, NORMALIZED_SHEET_HEADERS[tab].length),
      ) === JSON.stringify(NORMALIZED_SHEET_HEADERS[tab]),
  );
  const destinationSales = sum(destination.Orders, "total");
  const destinationPaid = sum(
    destination.Payments.filter(
      (row) => !["Refunded", "Voided", "Failed"].includes(String(row.status)),
    ),
    "amountApplied",
  );
  const passed =
    tabs.length === 10 &&
    tabs.every((tab) => CANONICAL_SHEET_TABS.includes(tab as never)) &&
    headersMatch &&
    idsUnique.every((check) => check.duplicateCount === 0) &&
    orphanItems === 0 &&
    close(destinationSales, sourceReconciliation.destinationSales) &&
    close(destinationPaid, sourceReconciliation.destinationPaid);
  return {
    destinationPaid,
    destinationSales,
    expectedPaid: sourceReconciliation.destinationPaid,
    expectedSales: sourceReconciliation.destinationSales,
    headersMatch,
    idsUnique,
    locale: metadata.data.properties?.locale,
    orphanItems,
    passed,
    spreadsheetId,
    tabs,
    timeZone: metadata.data.properties?.timeZone,
  };
}

function summary(result: ReturnType<typeof auditLegacyWorkbook>) {
  return {
    destinationCounts: result.destinationCounts,
    duplicateIds: result.duplicateIds,
    exceptionCount: result.exceptions.length,
    exceptions: result.exceptions,
    reconciliation: result.reconciliation,
    sourceCounts: result.sourceCounts,
  };
}
function table(values: CellValue[][]) {
  const headers = (values[0] || []).map(String);
  return values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      ),
    );
}
function sum(rows: Record<string, CellValue>[], key: string) {
  return (
    Math.round(
      rows.reduce((total, row) => total + (Number(row[key]) || 0), 0) * 100,
    ) / 100
  );
}
function close(left: number, right: number) {
  return Math.abs(left - right) < 0.01;
}
function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${message.replace(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g, "[redacted]")}\n`,
  );
  process.exitCode = 1;
});
