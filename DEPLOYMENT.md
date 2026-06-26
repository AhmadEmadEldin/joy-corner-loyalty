# Joy Corner Free Deployment

## Recommended free host

Use Vercel for this app. It gives you a free permanent domain like:

`https://joy-corner-loyalty.vercel.app`

The project is configured for Vercel with:

- Build command: `npm run build`
- Output directory: `dist`
- API routes: `api/*`

## Required Vercel environment variables

Add these in Vercel under Project Settings > Environment Variables:

- `APP_API_BASE_URL=/api`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_OWNER_EMAILS`

Do not upload `.env` to GitHub.

## GitHub save flow

1. Install Git or GitHub Desktop.
2. Open this folder as a repository:
   `C:\Users\CYBER-TECH\CanvaProjects\joy-corner-loyalty`
3. Commit the changes.
4. Push to GitHub.
5. In Vercel, import the GitHub repository.
6. Deploy.

Every future push to GitHub will redeploy the web app automatically.
