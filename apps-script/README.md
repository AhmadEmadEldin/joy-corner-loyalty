# Joy Corner Apps Script Notes

The Joy Corner app now runs as a standalone React/Vercel app.

Current live backend:

- Vercel function entry: `api/index.js`
- Google Sheets/Firebase backend: `server/googleSheetsBackend.ts`
- Frontend: `src/app.tsx`

Apps Script deployment is no longer required for the live Vercel app.

## What To Keep Here

This folder may still contain local, ignored service-account JSON files on your
computer. They are for local development only and must not be committed to Git.

## If You Still Have An Old Apps Script Deployment

You can leave it alone, but the Vercel app does not use it. If you want to avoid
confusion, open Apps Script and disable/delete the old web app deployment.

Do not paste service-account JSON into Apps Script for this Vercel version.
