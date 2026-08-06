# Joy Corner Design Reference Audit

Audit date: 2026-07-29

## Decision

Per the 2026-07-30 product direction, the supplied PNG mockups are now the
authoritative visual and interaction reference. The runtime UI must reproduce
their logo treatment, typography, palette, density, navigation, product-card
composition, order rail, mobile navigation, voucher mood, and responsive
hierarchy as closely as a functional web application allows.

The mockups remain visual references rather than data sources. Names, prices,
totals, dates, customer records, order numbers, counts, category membership,
and workflow state must continue to come from the live application.

No design file was deleted.

## Classification

| File | Classification | Runtime decision |
|---|---|---|
| `style-guide-tokens.png` | approved reference | Approved for palette, typography, spacing, radii, controls, and restrained dark-brand direction |
| `assets/joy-coffee-farm-sketch.png` | approved reference | Approved as supporting farm artwork; the optimized runtime WebP may be used decoratively |
| `UI_DESIGN_SPEC.md` | approved reference with constraints | Approved for role coverage, responsive behavior, accessibility, and real-data rules; mockup-specific sample values are prohibited |
| `DESIGN_GUIDE.md` | conflicting / partially approved | Design principles and operational requirements are approved; instructions to reproduce generated PNGs literally are deprecated |
| `AUDIT_REPORT.md` | outdated reference | Superseded by this audit and retained for history only |
| `full-app-ui-mockup.png` | approved master composition | Authoritative for staff desktop shell, POS, compact dashboards, mobile customer views, navigation, logo treatment, and visual density |
| `ui-menu-overview.png` | approved visual reference | Authoritative for category-card hierarchy, customer/order rail, sidebar treatment, and farm-story decoration |
| `ui-menu-hot-beverages.png` | approved category reference | Authoritative for dense image-led product cards and the five-column wide-screen catalog |
| `ui-menu-iced-drinks.png` | approved category reference with filename mismatch | The rendered title is Juices; use its visual composition while routing by live category data |
| `ui-menu-smoothies.png` | approved category reference | Approved for the shared category-page component and category-specific content mood |
| `ui-menu-frappes.png` | approved category reference | Approved for the shared category-page component and category-specific content mood |
| `ui-menu-cocktails.png` | approved category reference | Approved for the shared category-page component and category-specific content mood |
| `ui-menu-soft-drinks.png` | approved category reference | Approved for the shared category-page component and category-specific content mood |
| `ui-menu-sandwiches-utopia.png` | approved category reference | Approved for food-card composition; product identity still comes from live records |
| `ui-menu-matcha.png` | approved category reference | Approved for the shared category-page component and category-specific content mood |
| `ui-menu-desserts.png` | approved category reference | Approved for the shared category-page component and category-specific content mood |
| `ui-menu-extras.png` | approved modifier reference | Approved visually; runtime placement follows whether live data models an item as a product or modifier |
| `ui-menu-extra-boba.png` | approved modifier reference | Approved visually; runtime placement follows the live category/modifier model |
| `ui-voucher-coffee-farm.png` | approved voucher reference | Authoritative for farm atmosphere, logo scale, voucher hierarchy, code panel, value medallion, details, and CTA |

## Missing and incomplete references

- `DESIGN_GUIDE.md` names `ui-menu-shakes.png`, `ui-menu-juices.png`, and
  `ui-receipt-coffee-farm.png`, but those files are absent.
- The PNG set does not define complete loading, empty, error, validation,
  keyboard, tablet, print, or reduced-motion behavior.
- The generated category screens repeat one concept and do not justify separate
  page implementations.
- No PNG is authoritative for permissions or backend workflow state.

## Approved visual source

The approved hierarchy is:

1. `style-guide-tokens.png`
2. `full-app-ui-mockup.png`
3. the supplied `ui-menu-*.png` category views
4. `ui-voucher-coffee-farm.png`
5. `NEW_DESIGN_SYSTEM.md` and `COMPONENT_LIBRARY.md`
6. `RESPONSIVE_GUIDE.md` and `ACCESSIBILITY_GUIDE.md`
7. constrained written requirements in `UI_DESIGN_SPEC.md` and
   `DESIGN_GUIDE.md`

The PNG files remain in `design/` as visual references. Runtime components
recreate their composition responsively; the composite mockup PNGs themselves
are not embedded as fake interactive screens.
