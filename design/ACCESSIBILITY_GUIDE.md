# Joy Corner Accessibility Guide

Updated: 2026-07-29

## Standard

Target WCAG 2.1 AA for contrast, keyboard access, focus visibility, semantic
structure, labels, and responsive zoom behavior.

## Implemented requirements

- Visible three-pixel gold focus ring.
- 44px minimum interactive targets.
- Semantic buttons, headings, labels, fieldsets, tables, lists, and landmarks.
- `aria-current` for active navigation.
- `aria-pressed` for category and queue filters.
- Text labels accompany status colors.
- Alt text for informative images and empty alt text for decorative images.
- Lazy loading and error fallbacks for product imagery.
- Live regions for loading, messages, upload progress, and workflow feedback.
- Connected labels for authentication and operational controls.
- Body scroll lock, Escape handling, initial focus, and Tab trapping in staff
  drawers, customer drawers, product dialogs, cart, checkout, and destructive
  confirmation.
- Reduced-motion support.
- Low-ink print receipt layout.

## Error and state behavior

- Loading states identify themselves with `aria-busy`.
- Safe error states never expose stack traces.
- Empty states explain what will appear and what the user can do next.
- Disabled actions remain visually and programmatically disabled.
- Form values are preserved after recoverable validation errors.

## Verification

Automated component tests cover navigation and menu interaction. The visual
capture harness checks rendered content and horizontal overflow at desktop,
tablet, and mobile sizes. Manual keyboard and screen-reader spot checks remain
part of staging UI review.
