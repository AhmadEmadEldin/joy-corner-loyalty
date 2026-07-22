import dotenv from "dotenv";
import { closeNeonPool, query } from "../server/neon";
import { getCairoBusinessDate } from "../src/cairoDate";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
  const businessDate = process.env.BUSINESS_DATE || getCairoBusinessDate();
  const rows = await query<Record<string, unknown>>(
    `with s as (
       select count(*)::int order_count,count(*) filter(where status='closed')::int closed_count,
       count(*) filter(where status in ('cancelled','rejected'))::int cancelled_count,
       coalesce(sum(total) filter(where status='closed'),0)::numeric(12,2) sales,
       coalesce(sum(floor(total)) filter(where status='closed' and rewards_applied),0)::int points
       from orders where (created_at at time zone 'Africa/Cairo')::date=$1::date
     ), p as (
       select count(*)::int payment_count,coalesce(sum(amount),0)::numeric(12,2) paid from payments
       where (created_at at time zone 'Africa/Cairo')::date=$1::date
     ), b as (
       select oi.item_name_snapshot,sum(oi.quantity)::int qty from order_items oi join orders o on o.id=oi.order_id
       where (o.created_at at time zone 'Africa/Cairo')::date=$1::date and o.status='closed'
       group by oi.item_name_snapshot order by qty desc,oi.item_name_snapshot limit 1
     ), l as (
       select order_number from orders where (created_at at time zone 'Africa/Cairo')::date=$1::date order by created_at desc limit 1
     ), own as (select id from accounts where role='owner' and active=true order by created_at limit 1)
     update end_day_reports r set order_count=s.order_count,closed_order_count=s.closed_count,
       cancelled_order_count=s.cancelled_count,gross_sales=s.sales,payments_received=p.paid,
       loyalty_points_issued=s.points,payment_count=p.payment_count,
       best_selling_item=(select item_name_snapshot from b),best_selling_qty=coalesce((select qty from b),0),
       latest_receipt_serial=(select order_number from l),performed_by=own.id,performed_at=now()
     from s,p,own where r.business_date=$1::date returning r.*`,
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
