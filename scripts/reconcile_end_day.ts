import dotenv from "dotenv";
import { closeNeonPool, query } from "../server/neon";
import { getCairoBusinessDate } from "../server/cairoDate";
import { RECONCILE_END_DAY_SQL } from "../server/endDayReconciliation";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
  const businessDate = process.env.BUSINESS_DATE || getCairoBusinessDate();
  const rows = await query<Record<string, unknown>>(
    RECONCILE_END_DAY_SQL,
    [businessDate],
  );
  if (rows[0]) {
    await query(
      `update reporting_outbox set attempts=0,available_at=now(),last_error=null
       where topic='end_day_reports' and entity_id=$1`,
      [rows[0].id],
    );
  }
  console.log(JSON.stringify(rows[0] || null));
}

void main().finally(() => closeNeonPool());
