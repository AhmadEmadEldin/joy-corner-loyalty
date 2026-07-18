# Rollback Plan

Rollback sources:

- Production workbook: unchanged during this task.
- Owner-only timestamped backup: `Joy_Corner_Backup_20260718-220031`.
- Rebuilt working copy: `Joy_Corner_Rebuilt_Working_20260718-220031`.
- Git branch: `feature/rebuild-sheet-and-offline-foundation`.

Before cutover, rollback is simply “do not switch.” After cutover, restore the
previous `GOOGLE_SHEET_ID`, redeploy Functions/Hosting, and verify staff login,
menu reads, order/payment reads, and End Day status. Do not delete either
workbook while the rollback window is open.

Trigger rollback for any authorization bypass, missing/duplicate financial
record, non-zero reconciliation difference, replay-created duplicate, broken
menu price validation, End Day duplication, or unexplained data loss. Record
the incident and stop new writes before attempting repair.
