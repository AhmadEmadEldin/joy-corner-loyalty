# Remaining UI Risks

Run date: 2026-07-30

## Before production

1. **Product photography:** staging currently reports 166 products with 166
   missing images. The layout and image treatment now match the uploaded
   category mockups, but each real item still needs its own approved Cloudinary
   image to reproduce the mockups' product-level photography.
2. **Customer recovery:** the backend has no password-reset workflow. The UI
   provides honest contact guidance and does not pretend to send a reset email.
3. **Owner business settings:** current APIs expose integration readiness, not
   editable hours, tax, branch, or notification preferences. The System page
   therefore remains read-only.
4. **Voucher authoring:** current contracts support voucher visibility and
   redemption, but not a complete owner create/edit lifecycle.
5. **Historical kitchen reporting:** the kitchen projection exposes active
   work; dedicated historical barista productivity reporting needs backend
   support.
6. **Analytics depth:** overview metrics use real order data, but time-series
   and product-ranking charts require aggregate reporting endpoints.
7. **Bundle performance:** webpack warns that `app.js` (337 KiB) and the
   coffee-farm artwork (290 KiB) exceed its recommended asset threshold.
8. **Content length/localization:** the responsive suite uses current English
   staging content. Arabic/RTL and unusually long translated labels have not
   been validated.

## Release boundary

These items do not block staging UI review. Items 1-7 should be triaged before
production approval; no fake controls or synthetic metrics were introduced to
hide unavailable backend capabilities.
