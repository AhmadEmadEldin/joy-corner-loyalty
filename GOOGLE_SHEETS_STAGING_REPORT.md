# Google Sheets Staging Report

Run date: 2026-07-29

Result: **PASS**

- Native workbook: `Joy Corner WebApp - Staging Operations & Reporting`
- Workbook classification: staging
- Tabs: 20, including Menu, Customers, Orders, Payments, Rewards,
  Reward Redemptions, Unpaid Tracker, and Day History
- Menu rows: 166
- Menu categories: 13
- Service account permission: writer on the staging workbook
- Initial delivery: 2 records completed; immediate repeat completed 0
- Workflow delivery: 8 records completed; immediate repeat completed 0
- Retry proof: one unsupported-topic row recorded an attempt and error, then
  completed after it was changed to a supported reporting topic
- Workflow order: exactly one row in Orders
- End Day: exactly one Day History row for the Cairo business date
- End Day sync repeat: 0 additional records

The Sheet Menu tab retains 28 source spelling/name differences from the
normalized JSON and the original Sahlab duplicate, but prices match. It remains
a controlled staging/reporting source; Neon is the transactional source of
truth. No operational production workbook was written.
