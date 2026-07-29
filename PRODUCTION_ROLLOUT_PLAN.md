# Production Rollout Plan

Production review starts only after isolated staging passes.

1. Correct the menu JSON and complete a read-only staging preview.
2. Verify isolated Neon, Google Sheets, and Cloudinary resources.
3. Create and verify a pre-migration Neon restore branch.
4. Run migration 005 preflight, transactional dry run, and controlled staging
   application.
5. Run the authenticated owner/cashier/barista/customer workflow and reporting
   retry test.
6. Review sanitized desktop, tablet, and mobile staging screenshots.
7. Freeze the reviewed code revision and build artifact.
8. Schedule a quiet production window and create a production restore point.
9. Apply the verified migration with the same checksum through the migration
   runner.
10. Deploy one API replica, then the frontend and reporting worker.
11. Smoke test health, authentication, menu, one controlled order, receipt,
    image delivery, and reporting.
12. Monitor errors, latency, SSE reconnects, outbox attempts, unpaid totals,
    and End-of-Day reconciliation.

No automatic production migration, deployment, or destructive retry is
approved.
