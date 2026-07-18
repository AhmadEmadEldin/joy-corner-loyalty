# Current System Audit

Audit date: 2026-07-18 (Africa/Cairo).

The production workbook was read only. It contained 20 legacy tabs, duplicated
derived data, stale formulas, legacy row-per-item orders, normalized orders,
and plaintext staff passwords. Its Drive permission also allows anyone with the
link to edit. These are release-blocking security risks; no password value is
recorded in this repository or in migration reports.

The app is a React/Firebase web app. Firebase Auth and Firestore staff profiles
are the authentication and authorization boundary. Google Sheets is the
operational data store. The backend verifies Firebase tokens, applies role and
feature permissions, recalculates prices and receipt totals, and writes bounded
canonical rows.

The rebuilt workbook removes formula-owned aggregates and collapses the legacy
operational surface into ten canonical tabs. Customers are master records;
Orders are one row per proven order; Order Items are line records; Payments are
immutable transactions; Loyalty and System Log are typed ledgers.

Open release risks:

- Production still uses the legacy workbook by design.
- Production Drive sharing must be changed from public writer access.
- All legacy Sheet passwords must be rotated in Firebase Auth and deleted.
- 67 legacy payments have no provable order link and require owner review.
- 51 menu rows contain an uncertain size label or unresolved price.
- Authenticated role-by-role acceptance testing is required before cutover.
