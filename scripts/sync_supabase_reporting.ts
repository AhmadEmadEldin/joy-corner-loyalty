import { hostname } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { google, sheets_v4 } from "googleapis";
import {
  DatabaseRow,
  REPORTING_SHEETS,
  reportingRecord,
} from "../server/reporting/sheetMappings";

dotenv.config({ path: [".env.local", ".env"] });

type OutboxEvent = {
  attempts: number;
  id: number;
  operation: "insert" | "update" | "delete";
  record_id: string;
  source_table: string;
};

const batchSize = Math.min(
  100,
  Math.max(1, Number(process.env.REPORTING_SYNC_BATCH_SIZE || 25)),
);
const workerId = `${hostname()}:${process.pid}`.slice(0, 100);

function createAdminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const spreadsheetId = spreadsheetIdFromEnv(
    process.env.GOOGLE_SHEET_ID ||
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
      "",
  );

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  if (!spreadsheetId) {
    throw new Error(
      "GOOGLE_SHEET_ID (or GOOGLE_SHEETS_SPREADSHEET_ID) is required.",
    );
  }

  const supabase = createAdminClient(supabaseUrl, serviceRoleKey);
  const sheets = google.sheets({ auth: googleAuth(), version: "v4" });
  const { data, error } = await supabase.rpc("claim_integration_outbox", {
    batch_size: batchSize,
    worker_id: workerId,
  });
  if (error) throw error;

  const events = (data || []) as OutboxEvent[];
  if (!events.length) {
    console.log("Reporting sync: no pending Supabase changes.");
    return;
  }

  const eventsByTable = groupBy(events, (event) => event.source_table);
  let completed = 0;
  let failed = 0;

  for (const [sourceTable, tableEvents] of eventsByTable) {
    try {
      const sheet = REPORTING_SHEETS[sourceTable];
      if (!sheet)
        throw new Error(`Unsupported reporting source: ${sourceTable}`);

      const latestEvents = latestByRecord(tableEvents);
      const activeEvents = latestEvents.filter(
        (event) => event.operation !== "delete",
      );
      const rows = activeEvents.length
        ? await fetchRows(
            supabase,
            sourceTable,
            activeEvents.map((event) => event.record_id),
          )
        : [];

      if (rows.length) {
        await upsertSheetRows(
          sheets,
          spreadsheetId,
          sheet.sheetName,
          sheet.idHeader,
          rows.map((row) => reportingRecord(sourceTable, row)),
        );
      }

      // Operational records are archived, not deleted. A delete event is
      // acknowledged without erasing historical reporting rows.
      for (const event of tableEvents) {
        await completeEvent(supabase, event.id);
        completed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const event of tableEvents) {
        await failEvent(supabase, event.id, message);
        failed += 1;
      }
    }
  }

  console.log(
    `Reporting sync finished: ${completed} completed, ${failed} queued for retry.`,
  );
  if (failed) process.exitCode = 1;
}

function googleAuth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes,
    });
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  ).trim();
  if (clientEmail && privateKey) {
    return new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes,
    });
  }

  const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (configuredPath) {
    return new google.auth.GoogleAuth({
      keyFile: path.resolve(configuredPath),
      scopes,
    });
  }

  throw new Error(
    "Google Sheets credentials are required in GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
  );
}

async function fetchRows(
  supabase: AdminClient,
  table: string,
  ids: string[],
): Promise<DatabaseRow[]> {
  if (table === "reward_transactions") {
    const { data: transactions, error: transactionError } = await supabase
      .from(table)
      .select("*")
      .in("id", [...new Set(ids)]);
    if (transactionError) throw transactionError;

    const customerIds = [
      ...new Set((transactions || []).map((row) => row.customer_id)),
    ].filter(Boolean) as string[];
    const [accountResult, profileResult] = await Promise.all([
      supabase
        .from("rewards_accounts")
        .select("*")
        .in("customer_id", customerIds),
      supabase
        .from("profiles")
        .select("id, full_name, phone, favorite_drink")
        .in("id", customerIds),
    ]);
    if (accountResult.error) throw accountResult.error;
    if (profileResult.error) throw profileResult.error;

    const accountByCustomer = new Map(
      (accountResult.data || []).map((row) => [row.customer_id, row]),
    );
    const profileByCustomer = new Map(
      (profileResult.data || []).map((row) => [row.id, row]),
    );
    return customerIds.map((customerId) => ({
      customer_id: customerId,
      ...accountByCustomer.get(customerId),
      ...profileByCustomer.get(customerId),
    }));
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return (data || []) as DatabaseRow[];
}

async function completeEvent(supabase: AdminClient, eventId: number) {
  const { error } = await supabase.rpc("complete_integration_outbox", {
    event_id: eventId,
    worker_id: workerId,
  });
  if (error) throw error;
}

async function failEvent(
  supabase: AdminClient,
  eventId: number,
  message: string,
) {
  const { error } = await supabase.rpc("fail_integration_outbox", {
    error_message: message,
    event_id: eventId,
    worker_id: workerId,
  });
  if (error) throw error;
}

async function upsertSheetRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  idHeader: string,
  records: Array<Record<string, unknown>>,
) {
  const headers = await readSheetHeaders(sheets, spreadsheetId, sheetName);
  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0) throw new Error(`${sheetName} is missing ${idHeader}.`);

  const idColumn = columnLetter(idIndex);
  const { data } = await sheets.spreadsheets.values.get({
    range: `${quotedSheet(sheetName)}!${idColumn}2:${idColumn}50001`,
    spreadsheetId,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const existingRows = new Map<string, number>();
  (data.values || []).forEach((row, index) => {
    const id = String(row[0] ?? "").trim();
    if (id) existingRows.set(id, index + 2);
  });

  const deduplicated = new Map(
    records.map((record) => [String(record[idHeader] || ""), record]),
  );
  const updates: sheets_v4.Schema$ValueRange[] = [];
  const appends: unknown[][] = [];
  const lastColumn = columnLetter(headers.length - 1);
  const managedHeaders = [...new Set(records.flatMap(Object.keys))];
  const missingHeaders = managedHeaders.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length) {
    throw new Error(
      `${sheetName} is missing managed columns: ${missingHeaders.join(", ")}.`,
    );
  }
  const managedColumnGroups = contiguousGroups(
    managedHeaders
      .map((header) => headers.indexOf(header))
      .sort((a, b) => a - b),
  );

  for (const [id, record] of deduplicated) {
    if (!id) throw new Error(`${sheetName} reporting row has no ${idHeader}.`);
    const rowNumber = existingRows.get(id);
    if (rowNumber) {
      for (const [start, end] of managedColumnGroups) {
        updates.push({
          range: `${quotedSheet(sheetName)}!${columnLetter(start)}${rowNumber}:${columnLetter(end)}${rowNumber}`,
          values: [
            headers
              .slice(start, end + 1)
              .map((header) => safeSheetValue(record[header])),
          ],
        });
      }
    } else {
      appends.push(
        headers.map((header) =>
          Object.prototype.hasOwnProperty.call(record, header)
            ? safeSheetValue(record[header])
            : "",
        ),
      );
    }
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      requestBody: { data: updates, valueInputOption: "RAW" },
      spreadsheetId,
    });
  }
  if (appends.length) {
    await sheets.spreadsheets.values.append({
      insertDataOption: "INSERT_ROWS",
      range: `${quotedSheet(sheetName)}!A:${lastColumn}`,
      requestBody: { values: appends },
      spreadsheetId,
      valueInputOption: "RAW",
    });
  }
}

async function readSheetHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[]> {
  const metadata = await sheets.spreadsheets.get({
    fields: "sheets.properties.title",
    spreadsheetId,
  });
  const exists = metadata.data.sheets?.some(
    (sheet) => sheet.properties?.title === sheetName,
  );
  if (!exists) {
    throw new Error(`Required reporting tab ${sheetName} does not exist.`);
  }

  const { data } = await sheets.spreadsheets.values.get({
    range: `${quotedSheet(sheetName)}!A1:ZZ1`,
    spreadsheetId,
  });
  const headers = (data.values?.[0] || []).map((value) => String(value));
  if (!headers.length) throw new Error(`${sheetName} has no header row.`);
  return headers;
}

function contiguousGroups(indices: number[]): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  for (const index of indices) {
    const previous = groups.at(-1);
    if (previous && index === previous[1] + 1) previous[1] = index;
    else groups.push([index, index]);
  }
  return groups;
}

function latestByRecord(events: OutboxEvent[]) {
  const latest = new Map<string, OutboxEvent>();
  for (const event of events) latest.set(event.record_id, event);
  return [...latest.values()];
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    groups.set(groupKey, [...(groups.get(groupKey) || []), value]);
  }
  return groups;
}

function spreadsheetIdFromEnv(value: string) {
  const text = value.trim();
  return text.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || text;
}

function quotedSheet(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function columnLetter(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function safeSheetValue(value: unknown) {
  if (value == null) return "";
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
