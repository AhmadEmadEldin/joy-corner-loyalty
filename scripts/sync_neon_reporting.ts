import dotenv from "dotenv";
import { closeNeonPool, query } from "../server/neon";
import { googleSheetsClient } from "../server/reporting/googleAuth";
import { reportingRecord, REPORTING_SHEETS, type DatabaseRow } from "../server/reporting/sheetMappings";

dotenv.config({ path: [".env.local", ".env"] });

const spreadsheetId = process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");

type OutboxRow = { id: string; topic: string; entity_id: string; attempts: number };
type SheetIndex = { headers: string[]; idColumn: number; ids: string[] };

const sheets = googleSheetsClient();
const sheetIndexes = new Map<string, SheetIndex>();

function columnLetter(index: number): string {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  }
  return result;
}

async function sheetIndex(sourceTable: string): Promise<SheetIndex> {
  const cached = sheetIndexes.get(sourceTable);
  if (cached) return cached;
  const definition = REPORTING_SHEETS[sourceTable];
  if (!definition) throw new Error(`No reporting sheet is defined for ${sourceTable}.`);
  const headerResult = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${definition.sheetName}'!1:1`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const headers = (headerResult.data.values?.[0] || []).map(String);
  const idColumn = headers.indexOf(definition.idHeader);
  if (idColumn < 0) throw new Error(`${definition.sheetName} is missing ${definition.idHeader}.`);
  const idResult = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${definition.sheetName}'!${columnLetter(idColumn)}2:${columnLetter(idColumn)}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const index = { headers, idColumn, ids: (idResult.data.values || []).map((row) => String(row[0] || "")) };
  sheetIndexes.set(sourceTable, index);
  return index;
}

async function upsertRecord(sourceTable: string, row: DatabaseRow): Promise<void> {
  const definition = REPORTING_SHEETS[sourceTable];
  if (!definition) throw new Error(`No reporting sheet is defined for ${sourceTable}.`);
  const index = await sheetIndex(sourceTable);
  const record = reportingRecord(sourceTable, row);
  const recordId = String(record[definition.idHeader] || "");
  if (!recordId) throw new Error(`${sourceTable} record has no ${definition.idHeader}.`);
  const found = index.ids.indexOf(recordId);
  const targetRow = found >= 0 ? found + 2 : index.ids.length + 2;
  let values = Array(index.headers.length).fill("") as unknown[];
  if (found >= 0) {
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${definition.sheetName}'!A${targetRow}:${columnLetter(index.headers.length - 1)}${targetRow}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    values = [...(current.data.values?.[0] || [])];
    while (values.length < index.headers.length) values.push("");
  }
  for (const [header, value] of Object.entries(record)) {
    const column = index.headers.indexOf(header);
    if (column >= 0) values[column] = value;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${definition.sheetName}'!A${targetRow}:${columnLetter(index.headers.length - 1)}${targetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
  if (found < 0) index.ids.push(recordId);
}

async function syncAccount(id: string): Promise<void> {
  const rows = await query<DatabaseRow>("select * from accounts where id=$1 and role='customer'", [id]);
  if (rows[0]) await upsertRecord("accounts", rows[0]);
}

async function syncOrder(id: string): Promise<void> {
  const orders = await query<DatabaseRow>(
    `select o.*,c.customer_number,c.phone as customer_phone,s.full_name as staff_name,s.role as staff_role
     from orders o left join accounts c on c.id=o.customer_id left join accounts s on s.id=o.created_by
     where o.id=$1`, [id],
  );
  if (!orders[0]) return;
  await upsertRecord("orders", orders[0]);
  const items = await query<DatabaseRow>("select * from order_items where order_id=$1 order by created_at,id", [id]);
  for (const item of items) await upsertRecord("order_items", item);
}

async function syncPayment(id: string): Promise<void> {
  const rows = await query<DatabaseRow>(
    `select p.*,o.customer_id,c.customer_number,c.full_name as customer_name,
            r.full_name as received_by_name
     from payments p join orders o on o.id=p.order_id
     left join accounts c on c.id=o.customer_id left join accounts r on r.id=p.received_by
     where p.id=$1`, [id],
  );
  if (rows[0]) await upsertRecord("payments", rows[0]);
}

async function syncEvent(event: OutboxRow): Promise<void> {
  if (event.topic === "accounts") return syncAccount(event.entity_id);
  if (event.topic === "orders") return syncOrder(event.entity_id);
  if (event.topic === "payments") return syncPayment(event.entity_id);
  throw new Error(`Unsupported reporting topic: ${event.topic}`);
}

async function main(): Promise<void> {
  const events = await query<OutboxRow>(
    `select id::text,topic,entity_id,attempts from reporting_outbox
     where completed_at is null and available_at<=now() order by id limit $1`,
    [Number(process.env.REPORTING_BATCH_SIZE || 100)],
  );
  let completed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await syncEvent(event);
      await query("update reporting_outbox set completed_at=now(),last_error=null where id=$1", [event.id]);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
      await query(
        `update reporting_outbox set attempts=attempts+1,last_error=$2,
         available_at=now() + make_interval(mins => least(60, power(2,least(attempts,5))::int)) where id=$1`,
        [event.id, message],
      );
      failed += 1;
    }
  }
  console.log(JSON.stringify({ completed, failed, pendingBatch: events.length }));
  if (failed) process.exitCode = 1;
}

void main().finally(() => closeNeonPool());
