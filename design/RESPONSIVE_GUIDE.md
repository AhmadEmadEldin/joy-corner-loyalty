# Joy Corner Responsive Guide

Updated: 2026-07-29

## Breakpoints

- Mobile: `0–639px`
- Tablet: `640–1023px`
- Desktop: `1024–1439px`
- Wide: `1440px+`

## Mobile

- One primary content column.
- Two-column category and featured-product cards where space permits.
- Product lists collapse to one column on narrow devices.
- Customer navigation is a fixed five-action bottom bar.
- Additional customer sections use a full-height focus-managed drawer.
- Staff navigation uses a full-height focus-managed drawer.
- Cart uses a full-screen modal drawer with sticky checkout.
- Dialogs use the viewport width minus safe padding.
- All primary targets are at least 44px.
- Safe-area insets are respected by fixed navigation.

## Tablet

- Staff sidebar becomes a drawer.
- The utility bar shows role and current section context.
- POS retains a product grid with a slide-over or persistent order context as
  available space permits.
- Owner catalog list and editor stack.
- Queue, metric, and customer cards use two-column layouts where possible.

## Desktop

- Staff sidebar is fixed at 264px, narrowing to 232px on compact desktop.
- Utility bar remains sticky.
- Content is fluid with `min-width: 0` protection.
- POS uses a flexible product area and persistent right order panel.
- Dense tables scroll inside their own container instead of widening the page.

## Wide

- Main content is capped at 1560px.
- Product and metric grids add columns without stretching individual cards.
- Page padding increases to 32px.

## Overflow policy

- Root documents clip accidental horizontal overflow.
- Every grid child has `min-width: 0`.
- Tables and category rails own their horizontal scrolling.
- Long identifiers and customer content wrap inside cards.
- The automated UI verifier checks `scrollWidth` against viewport width for
  every captured route and role.
