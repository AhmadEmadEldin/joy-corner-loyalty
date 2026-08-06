# Joy Corner Brand Kit

This kit translates the approved design PNGs into reusable production rules.
The source hierarchy is defined by `DESIGN_REFERENCE_AUDIT.md`; composite UI
mockups are references only and must never be embedded as application screens.

## Brand essence

Premium coffee experience with warmth, quality, and unforgettable moments.
The visual character is warm, premium, welcoming, modern, and authentic.

## Core lockups

- Primary horizontal lockup: `/assets/joy-corner-logo.svg`
- Compact monogram: `/assets/joy-corner-mark.png`
- Campaign line: `/assets/joy-your-time.svg`
- Decorative farm artwork: `/assets/brand/joy-coffee-farm-sketch.png`
- Print farm artwork: `/brand/joy-corner-receipt-farm.svg`

Keep clear space around every lockup equal to at least one quarter of the
monogram width. Do not recolor, stretch, rotate, outline, or add text inside the
logo artwork. The monogram may be used alone only where the full lockup cannot
remain legible.

## Color system

| Token | Hex | Use |
|---|---|---|
| Espresso | `#2B1814` | Primary dark branded surface |
| Coffee | `#4A2C20` | Secondary surface and warm depth |
| Caramel | `#B9783D` | CTA gradient and active emphasis |
| Gold | `#D6A756` | Focus, icons, active borders, highlights |
| Cream | `#F7F0E4` | Primary text on dark surfaces |
| Ivory | `#FFFDF8` | Highest-emphasis text |
| Mocha gray | `#786A61` | Secondary text on light surfaces |

Gold is an accent, not body text. Operational states use the approved success
`#387A52`, warning `#C67B2D`, danger `#B8463D`, and info `#3882F6` colors.

## Typography

- Display: Playfair Display, bold or semibold, for page and section headings.
- UI/body: Poppins, regular through semibold, for controls, data, and labels.
- Numerals and operational data remain in Poppins for fast scanning.
- Avoid all-caps except short eyebrow labels and the established wordmark.

## Shape, depth, and spacing

- Use the 8 px spacing base shown in `style-guide-tokens.png`.
- Controls: 8 px radius; compact cards: 12–16 px; hero/glass panels: 24 px.
- Use one-pixel warm-gold borders at low opacity on dark surfaces.
- Shadows stay soft and dark; gold glow is reserved for focus and primary CTA.
- Glass effects must preserve readable contrast and never obscure order data.

## Photography and illustration

Product photography is warm, close, and image-led, with dark coffee surfaces
and restrained caramel highlights. Use live product images where available and
the branded generated placeholder for missing products. The approved farm
sketch is decorative atmosphere only; never place critical copy over its busy
areas without a dark overlay.

## Component language

- Primary buttons use a caramel-to-gold gradient with espresso text.
- Secondary buttons use a transparent dark surface with a gold border.
- Active navigation uses a warm translucent panel and a slim gold indicator.
- Product cards use image-first composition, compact metadata, and a circular
  gold add action.
- Order cards prioritize customer, phone, total, paid, and remaining amounts;
  status color is supplementary and never the only signal.
- Mobile checkout keeps the primary action above the safe-area inset.

## Reference files

1. `style-guide-tokens.png`
2. `full-app-ui-mockup.png`
3. `ui-menu-*.png`
4. `ui-voucher-coffee-farm.png`

These references stay in `design/`. Runtime code recreates their system using
real data and responsive components.
