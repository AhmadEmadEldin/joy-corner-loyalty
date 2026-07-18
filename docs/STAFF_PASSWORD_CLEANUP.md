# Staff Password Cleanup

The legacy production Staff tab contains plaintext passwords. This is a severe
credential exposure. Password values were deliberately excluded from the
rebuilt workbook, logs, tests, documentation, and code.

Required owner actions:

1. Remove public writer access from the legacy workbook immediately.
2. Force-reset every affected Firebase Auth credential through a secure channel.
3. Revoke active sessions where appropriate and enable stronger sign-in controls.
4. Confirm every staff member has a Firebase Auth UID and matching Firestore `users/{uid}` role document.
5. Delete the password column from operational copies only after the verified backup is secured and access is restricted.
6. Search exports, Apps Script, email, chat, and local files for copied credentials; remove them according to the organization retention policy.
7. Record completion without recording any password.

Sheets must never be used as a password store. The app must authenticate only
through Firebase Auth and authorize through Firestore-backed roles/permissions.
