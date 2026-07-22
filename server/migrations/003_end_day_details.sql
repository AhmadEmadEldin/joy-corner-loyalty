alter table end_day_reports add column if not exists payment_count integer not null default 0;
alter table end_day_reports add column if not exists redemption_count integer not null default 0;
alter table end_day_reports add column if not exists best_selling_item text;
alter table end_day_reports add column if not exists best_selling_qty integer not null default 0;
alter table end_day_reports add column if not exists latest_receipt_serial text;
