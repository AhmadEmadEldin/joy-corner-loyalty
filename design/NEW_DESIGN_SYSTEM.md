# Joy Corner Design System

Version: 2.0  
Updated: 2026-07-29

## Brand character

Joy Corner combines premium coffee warmth with fast operational clarity. Every
role uses one dark visual language:

- deep black and espresso application surfaces;
- roasted coffee panels;
- caramel and muted-gold actions;
- cream and ivory text;
- restrained farm and coffee imagery;
- compact operational density for staff;
- richer imagery and calmer pacing for customers.

Generated screen mockups are not runtime assets. Current API data, permissions,
and workflow state always take precedence.

## Runtime files

- `src/styles/joy-corner-tokens.css` owns shared variables.
- `src/styles/joy-corner-components.css` owns branded component treatment.
- `src/styles/joy-corner-responsive.css` is the final runtime layer and owns
  responsive, state, dialog, and cross-role consistency rules.

These styles are imported in that order after the legacy structural stylesheet.

## Color roles

- `--jc-bg-primary`: application background
- `--jc-bg-secondary`: dialogs, carts, and dense panels
- `--jc-bg-elevated`: prominent elevated surfaces
- `--jc-bg-card`: card foundation
- `--jc-caramel`: primary action end color
- `--jc-gold`: active navigation, icons, and accents
- `--jc-gold-light`: focus and high-priority text
- `--jc-cream`: primary body text
- `--jc-ivory`: headings and high-contrast values
- `--jc-muted`: secondary labels
- semantic success, warning, danger, and info tokens: workflow states

Raw color values are not added to React components.

## Typography

- Playfair Display: authentication, page, voucher, receipt, and major section
  headings.
- Poppins: navigation, controls, prices, order numbers, status, forms, tables,
  and dense workflow content.

Operational numbers never use decorative text styling that reduces clarity.

## Shape and depth

- 8–12px radii: controls and compact states
- 16px radii: operational panels
- 24px radii: premium customer and dialog surfaces
- soft border: default separation
- medium border: selected controls
- active border: focus and current navigation
- small shadow: cards
- medium/large shadow: drawers, dialogs, and sticky contexts

## Motion

- controls: 140ms
- cards: 220ms
- drawers/dialogs: 220–300ms
- no decorative continuous motion
- all animation is disabled or reduced under `prefers-reduced-motion`

## Data presentation

- Counts, prices, customers, orders, rewards, vouchers, and integration state
  come from the API.
- Empty APIs produce explicit empty states.
- Missing product photography uses the approved coffee fallback, never a
  stretched logo.
- Archived products stay out of customer ordering and remain available to
  Owner management.
