# Build Size Review

This is a low-risk staging-readiness review. No broad bundle architecture
changes were made.

## Current largest modules

Webpack profile sizes before minification:

| Module | Approximate source size |
|---|---:|
| React DOM client production runtime | 536 KiB |
| `src/app.css` through `css-loader` | 85.8 KiB |
| Staff portal and grouped modules | 67.1 KiB |
| Customer portal and grouped modules | 55.5 KiB |
| Joy Corner component CSS | 23.8 KiB |
| React production runtime | 17.2 KiB |
| Owner menu manager | 13.7 KiB |

Customer and staff portals are already route-split with `React.lazy`. The main
301 KiB entry contains React/React DOM, shared startup code, and CSS injected by
`style-loader`.

## Coffee-farm artwork

- Original design PNG: 1536×1024, 1,492,386 bytes.
- Archived design source:
  `design/assets/joy-coffee-farm-sketch.png`.
- Runtime WebP: 1024×683, 296,914 bytes.
- Reduction: approximately 80 percent.
- Runtime CSS now references only the WebP.
- Receipt print styles remove the decorative background.
- Voucher artwork images use native lazy loading and asynchronous decoding.

Chrome in this local environment supports WebP encoding but not AVIF canvas
encoding; requesting AVIF returned PNG. No mislabeled AVIF was added. A later
asset pipeline may generate AVIF with a pinned Sharp, libavif, or Squoosh
version and add a tested `<picture>`/`image-set()` fallback.

## Low-risk recommendations

Before staging:

- Keep the current WebP change.
- Keep the original PNG outside the runtime graph under `design/assets`.
- Confirm the WebP renders in supported staging browsers.
- Do not introduce new bundler dependencies solely for AVIF before migration.

After staging validation:

- Extract CSS into a cacheable stylesheet instead of shipping it through
  `style-loader`.
- Split owner-only menu management, analytics, End of Day, and system panels
  from the staff portal.
- Split customer vouchers/rewards and historical receipt views if route usage
  metrics justify it.
- Add a pinned image-optimization build step that produces WebP and AVIF from
  the archived PNG.
- Review whether the older `app.css` rules can be safely consolidated with the
  Joy Corner component stylesheet.

React DOM is the largest dependency but replacing the UI runtime is not a
reasonable pre-staging optimization. The remaining JavaScript size warning is
accepted for staging and should be measured with real network performance
before further splitting.
