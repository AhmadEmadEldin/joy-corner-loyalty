# Offline Sync

Offline-capable actions are limited to order creation, customer drafts,
preparation-status changes, and payment drafts. IndexedDB stores each operation
with `localOperationId`, unique `clientRequestId`, stable device ID, Firebase
actor UID/role, payload, timestamps, retry count, error, and state.

States are Pending, Syncing, Synced, Needs Review, Blocked, and Failed. Sync runs
on reconnect, visibility return, service-worker background-sync notification,
or an explicit button. The current Firebase UID must match the queued actor.
HTTP 401/403 blocks the operation; price/size/sold-out/customer conflicts go to
Needs Review; transient failures retry up to five attempts and then stop.

The backend remains authoritative: it verifies authentication and permissions,
revalidates menu availability and trusted prices, recalculates totals, and uses
`clientRequestId` for idempotency. The browser never writes Google Sheets
directly. Owners can inspect and explicitly retry device operations in Device
Sync Center. Synced records remain until the owner clears them.

Do not queue destructive owner actions, staff/permission changes, voucher
redemptions, End Day, or workbook administration.
