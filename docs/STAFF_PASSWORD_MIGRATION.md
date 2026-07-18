# Staff password migration

The legacy `Password` Sheet column is not an authentication source. The backend strips it from reads, never writes it, and never exposes it to the frontend.

For each active employee, create or retain a Firebase Authentication email/password account and a matching Firestore `users/{uid}` document with `type: staff`, role, active, display name, grant, and revoke. Use Owner Staff Management or the Firebase Console. After every account is verified, remove legacy plaintext values from the Sheet manually using an owner-approved backup and rotation plan.

Never copy legacy passwords into code, commits, logs, documentation, chat, or Firestore.
