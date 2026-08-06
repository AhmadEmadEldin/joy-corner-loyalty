# JOY CORNER UI/UX DESIGN SPECIFICATION

**Project:** Joy Corner Loyalty & Coffee Operations App  
**Document:** `UI_DESIGN_SPEC.md`  
**Version:** 1.0  
**Primary visual reference:** `./design/full-app-ui-mockup.png`  
**Design token reference:** `./design/style-guide-tokens.png`  
**Brand reference:** Joy Corner Coffee Instagram visual identity  
**Audience:** OpenCode, Codex, frontend developers, UI/UX designers, QA engineers

---

# 1. Purpose

This document defines the complete visual system, layout rules, responsive behavior, component standards, interaction patterns, accessibility requirements, and acceptance criteria for the Joy Corner application.

The implementation must closely follow the supplied visual references while remaining:

- Fast
- Responsive
- Accessible
- Operationally clear
- Easy for café staff
- Easy for customers
- Consistent across all roles
- Aligned with the Joy Corner brand

The application contains four primary user roles:

1. Owner
2. Cashier
3. Barista
4. Customer

The UI must feel like one unified product, not four unrelated applications.

---

# 2. Brand Direction

## 2.1 Brand Personality

Joy Corner should feel:

- Premium
- Warm
- Modern
- Stylish
- Youthful
- Trustworthy
- Welcoming
- Coffee-focused
- Operationally efficient

The interface should reflect the same personality visible in Joy Corner’s social media identity:

- Deep black and espresso backgrounds
- Cream and ivory typography
- Caramel and gold accents
- Branded coffee cups
- Editorial product photography
- High contrast
- Minimal layouts
- Warm ambient lighting
- Lifestyle-driven coffee imagery

---

## 2.2 Core Design Style

The approved visual direction is:

**Modern dark coffee aesthetic with subtle glassmorphism and premium iPhone-inspired polish.**

The application must combine:

- Deep espresso backgrounds
- Soft translucent glass panels
- Warm caramel highlights
- Elegant serif headings
- Clean sans-serif interface text
- Smooth rounded corners
- Premium but restrained shadows
- Rich coffee photography
- Clear operational hierarchy

Do not imitate Apple components directly. Use the same level of refinement, spacing, clarity, and tactile quality.

---

## 2.3 Avoid

Do not use:

- Generic Bootstrap appearance
- Flat brown rectangles everywhere
- Excessive transparency
- Heavy blur behind dense text
- Weak contrast
- Oversized logos
- Decorative fonts for operational values
- Random border radii
- Random shadows
- Long glowing animations
- Overlapping navigation
- Horizontal overflow
- Tiny touch targets
- Large empty spaces
- Repeated logo placeholders for products
- Different visual styles for each role
- Bright white full-page backgrounds
- Neon colors unrelated to the brand
- Status colors without text labels

---

# 3. Design Tokens

All colors, spacing, radii, shadows, typography, and motion values must be defined centrally.

Do not repeatedly hardcode these values inside components.

```css
:root {
  /* Backgrounds */
  --jc-bg-primary: #1A120C;
  --jc-bg-secondary: #2B1B14;
  --jc-bg-elevated: #342219;
  --jc-bg-deep: #0F0A07;

  /* Brand Colors */
  --jc-espresso: #2B1B14;
  --jc-coffee: #4A2C20;
  --jc-caramel: #B9783D;
  --jc-gold: #D6A756;
  --jc-gold-light: #E8C77E;

  /* Light Colors */
  --jc-cream: #F7F0E4;
  --jc-ivory: #FFFDF8;
  --jc-sand: #E9DDCC;

  /* Neutral Colors */
  --jc-muted: #A89A8E;
  --jc-muted-dark: #786A61;
  --jc-border-neutral: rgba(255, 253, 248, 0.08);

  /* Status Colors */
  --jc-success: #387A52;
  --jc-success-soft: rgba(56, 122, 82, 0.18);

  --jc-warning: #C67B2D;
  --jc-warning-soft: rgba(198, 123, 45, 0.18);

  --jc-danger: #B8463D;
  --jc-danger-soft: rgba(184, 70, 61, 0.18);

  --jc-info: #3882F6;
  --jc-info-soft: rgba(56, 130, 246, 0.18);

  /* Glass */
  --jc-glass-light: rgba(255, 253, 248, 0.06);
  --jc-glass-medium: rgba(43, 27, 20, 0.68);
  --jc-glass-strong: rgba(26, 18, 12, 0.88);
  --jc-glass-solid: rgba(26, 18, 12, 0.96);

  /* Borders */
  --jc-border-soft: rgba(214, 167, 86, 0.18);
  --jc-border-active: rgba(214, 167, 86, 0.55);
  --jc-border-strong: rgba(214, 167, 86, 0.78);

  /* Overlay */
  --jc-overlay: rgba(8, 5, 3, 0.55);
  --jc-overlay-strong: rgba(8, 5, 3, 0.78);

  /* Typography */
  --jc-font-display: "Playfair Display", Georgia, serif;
  --jc-font-ui: "Poppins", Arial, sans-serif;

  /* Text Scale */
  --jc-text-xs: 0.75rem;
  --jc-text-sm: 0.875rem;
  --jc-text-base: 1rem;
  --jc-text-lg: 1.125rem;
  --jc-text-xl: 1.375rem;
  --jc-text-2xl: 1.75rem;
  --jc-text-3xl: 2.25rem;
  --jc-text-4xl: 3rem;

  /* Spacing */
  --jc-space-1: 4px;
  --jc-space-2: 8px;
  --jc-space-3: 12px;
  --jc-space-4: 16px;
  --jc-space-5: 20px;
  --jc-space-6: 24px;
  --jc-space-8: 32px;
  --jc-space-10: 40px;
  --jc-space-12: 48px;
  --jc-space-16: 64px;

  /* Border Radius */
  --jc-radius-xs: 4px;
  --jc-radius-sm: 8px;
  --jc-radius-md: 12px;
  --jc-radius-lg: 16px;
  --jc-radius-xl: 24px;
  --jc-radius-2xl: 32px;
  --jc-radius-pill: 999px;

  /* Shadows */
  --jc-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.22);
  --jc-shadow-md: 0 12px 28px rgba(0, 0, 0, 0.30);
  --jc-shadow-lg: 0 20px 48px rgba(0, 0, 0, 0.38);
  --jc-shadow-glow: 0 0 22px rgba(214, 167, 86, 0.18);

  /* Motion */
  --jc-duration-fast: 140ms;
  --jc-duration-normal: 220ms;
  --jc-duration-slow: 300ms;
  --jc-ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

---

# 4. Gradients

```css
:root {
  --jc-gradient-primary:
    linear-gradient(135deg, #B9783D 0%, #D6A756 100%);

  --jc-gradient-primary-hover:
    linear-gradient(135deg, #C9894A 0%, #E0B968 100%);

  --jc-gradient-espresso:
    linear-gradient(145deg, #1A120C 0%, #342219 100%);

  --jc-gradient-glass:
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.07),
      rgba(255, 255, 255, 0.015)
    );

  --jc-gradient-hero:
    radial-gradient(
      circle at top right,
      rgba(214, 167, 86, 0.16),
      transparent 42%
    ),
    linear-gradient(145deg, #1A120C, #2B1B14);
}
```

Gradient usage must remain subtle.

Do not use strong gradients behind long text or dense operational cards.

---

# 5. Typography

## 5.1 Display Font

Use **Playfair Display** for:

- Page titles
- Hero headings
- Major dashboard headings
- Promotional sections
- Authentication page titles
- Empty-state promotional headlines

Do not use Playfair Display for:

- Buttons
- Form labels
- Prices
- Order cards
- Tables
- Receipts
- Navigation
- Status badges
- Long paragraphs

---

## 5.2 Interface Font

Use **Poppins** for:

- Navigation
- Buttons
- Forms
- Inputs
- Prices
- Order details
- Receipts
- Tables
- Badges
- Body text
- Mobile interface text
- Alerts
- Notifications

---

## 5.3 Type Scale

| Token | Size | Recommended Use |
|---|---:|---|
| `--jc-text-xs` | 12px | Captions, timestamps |
| `--jc-text-sm` | 14px | Secondary labels |
| `--jc-text-base` | 16px | Body text, inputs |
| `--jc-text-lg` | 18px | Card titles |
| `--jc-text-xl` | 22px | Section titles |
| `--jc-text-2xl` | 28px | Page headings |
| `--jc-text-3xl` | 36px | Hero headings |
| `--jc-text-4xl` | 48px | Large promotional headings |

---

## 5.4 Font Weights

- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

Prices, totals, and critical operational values should usually use `600` or `700`.

---

# 6. Spacing System

Use an 8px base spacing system.

Rules:

- Minimum card padding: 16px
- Standard card padding: 20–24px
- Desktop main panel padding: 24–32px
- Mobile page edge padding: 16px
- Gap between related controls: 8–12px
- Gap between card groups: 16–24px
- Gap between major page sections: 24–32px
- Avoid arbitrary margins such as 13px, 19px, or 27px unless required by a specific visual alignment

---

# 7. Border Radius

Recommended usage:

| Component | Radius |
|---|---:|
| Small badges | Pill |
| Inputs | 12px |
| Buttons | 12px |
| Product cards | 16px |
| Order cards | 16px |
| Sidebar active item | 12px |
| Modals | 20–24px |
| Main panels | 20–24px |
| Large auth card | 24–32px |

Do not use the largest radius on every component.

---

# 8. Shadows and Glassmorphism

## 8.1 Standard Glass Panel

```css
.jc-glass-panel {
  background: var(--jc-glass-medium);
  border: 1px solid var(--jc-border-soft);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: var(--jc-shadow-md);
}
```

## 8.2 Dense Content Panels

Dense operational content should use stronger opacity:

```css
.jc-dense-panel {
  background: var(--jc-glass-strong);
  border: 1px solid var(--jc-border-soft);
  box-shadow: var(--jc-shadow-md);
}
```

Use stronger opacity for:

- Receipts
- Long order cards
- Tables
- Forms
- Payment panels
- Customer history
- Settings panels

Glass effects must never reduce readability.

---

# 9. Global Application Shell

## 9.1 Desktop Shell

Desktop layout should include:

- Left sidebar
- Top utility bar
- Main content area
- Optional right contextual drawer
- Responsive content container

Suggested dimensions:

```text
Sidebar width: 240–272px
Top utility bar: 64–72px
Main content padding: 24–32px
Minimum desktop width target: 1024px
```

---

## 9.2 Sidebar Structure

### Operations

- Overview
- New Order
- Cashier
- Kitchen
- Orders

### Customers

- Customers
- Rewards
- Vouchers

### Catalog

- Menu & Images

### Business

- Analytics
- End of Day
- System

---

## 9.3 Sidebar Active State

The active navigation item must include:

- Gold or caramel outline
- Soft highlighted background
- Active icon color
- Stronger text contrast
- Optional small indicator dot

Navigation labels must not overlap or truncate unexpectedly.

---

## 9.4 Top Utility Bar

Include:

- Page title
- Branch selector
- Notifications
- Current user name
- Current user role
- Profile menu
- Sign out
- Optional command search

The real user name must appear instead of `unknown`.

---

# 10. Responsive Navigation

## 10.1 Desktop

Use a persistent sidebar.

Do not compress 10 or more navigation items into one horizontal row.

---

## 10.2 Tablet

Use:

- Collapsible sidebar
- Slide-out drawer
- Compact top bar
- Optional quick-action buttons

---

## 10.3 Mobile Staff View

Use:

- Header with role and branch
- Hamburger menu
- Compact page actions
- No horizontal navigation bar
- No clipped content

---

## 10.4 Mobile Customer Navigation

Use a floating or docked bottom navigation with:

- Home/Menu
- Orders
- Rewards
- Account
- More

Cart can be:

- A bottom navigation item with badge
- A floating action button
- A sticky mini-cart

Minimum touch target:

```text
44px × 44px
```

---

# 11. Owner Dashboard

The Owner dashboard should provide a clear operational summary.

Recommended sections:

- Today’s sales
- Order count
- New customers
- Active kitchen orders
- Unpaid total
- Vouchers issued
- Loyalty redemptions
- Sales trend
- Category performance
- Staff activity
- End-of-day status

Use compact analytics cards with:

- Clear label
- Strong value
- Comparison indicator
- Optional sparkline
- Short supporting text

Avoid huge marketing cards that hide operational data.

---

# 12. POS / New Order Screen

## 12.1 Desktop Layout

Preferred three-zone layout:

```text
Menu and product selection: 50–58%
Customer and order-place details: 18–22%
Cart and payment summary: 25–30%
```

At medium desktop sizes, combine customer details and cart into one right-side panel.

---

## 12.2 Product Section

Include:

- Search input
- Category chips
- Availability filter
- Missing-image protection
- Product grid
- Product image
- Product name
- Category
- Starting price
- Add button
- Optional popular/new badge

---

## 12.3 Product Card

Each product card should include:

- Real product image
- Product title
- Category
- Starting price
- Add button
- Optional loyalty eligibility label
- Optional popular/new badge

Image rules:

- Use 1:1 or 4:5 ratio
- Use `object-fit: cover`
- Add a subtle dark gradient behind text
- Preserve aspect ratio
- Lazy-load
- Show skeleton while loading
- Use a branded fallback image only when needed

Do not display the Joy Corner logo enlarged as the product image.

---

## 12.4 Cart Panel

Display:

- Product thumbnail
- Product name
- Size or variant
- Extras
- Quantity controls
- Item note
- Unit price
- Line total
- Remove action

Totals:

- Subtotal
- Discount
- Voucher discount
- Tax
- Service fee
- Delivery fee
- Total
- Amount paid
- Remaining amount
- Payment status

The primary confirmation button should remain visible near the bottom of the panel.

---

## 12.5 Customer Lookup

The phone lookup area must support:

- Phone normalization
- Loading state
- Found state
- Not found state
- Auto-filled customer name
- Current points
- Available vouchers
- Unpaid balance
- Recent orders
- Quick customer creation

The result should clearly display a green `Found` badge when a customer is located.

---

## 12.6 Order Place Selector

Use selectable icon cards for:

- Dine in
- Takeaway
- Car
- Outside
- Delivery

Selected state:

- Gold border
- Soft gold surface
- Visible check icon
- Higher text contrast

Conditional fields:

### Dine in

- Table number

### Takeaway

- Pickup name
- Optional pickup time

### Car

- Car color
- Car model
- Optional plate number

### Delivery

- Address
- Contact phone
- Delivery instructions
- Delivery fee

---

# 13. Cashier Dashboard

The cashier experience must prioritize speed, payment clarity, and confirmation accuracy.

## 13.1 Filters

Provide:

- Active
- New
- Awaiting confirmation
- Confirmed
- Ready
- Unpaid
- Partially paid
- Paid
- Completed
- Cancelled
- History

Order-status filters and payment-status filters should be visually distinct.

---

## 13.2 Cashier Order Card

Each card should include:

- Order number
- Customer name
- Submitted time
- Order place
- Item summary
- Total
- Paid amount
- Remaining amount
- Payment status
- Current order status
- Primary action
- Secondary menu
- Print receipt action where appropriate

Use compact cards.

Do not place large empty areas inside operational cards.

---

## 13.3 Cashier Status Colors

- Awaiting confirmation: gold or warning
- Confirmed: blue or neutral-gold
- Ready: green
- Unpaid: red
- Partially paid: amber
- Paid: green
- Completed: muted grey
- Cancelled: red

Status must always include text and should not rely on color alone.

---

# 14. Barista Kitchen Screen

The kitchen screen must prioritize:

- Speed
- Readability
- Large clear actions
- Elapsed time
- Product details
- Status progression

---

## 14.1 Kitchen Board Columns

Recommended columns:

- New
- In Preparation
- Ready

History should be separate.

---

## 14.2 Barista Order Card

Each card must include:

- Order number
- Elapsed time
- Customer or pickup name
- Order place
- Table/car/delivery details
- Products
- Quantities
- Sizes
- Extras
- Notes
- Priority
- Status

---

## 14.3 Barista Actions

For confirmed orders:

- `Start preparation`

For in-preparation orders:

- `Mark ready`

For ready orders:

- `Mark picked up`

Completed cards must leave the active board immediately after a successful update.

---

## 14.4 Barista Status Colors

- New/Confirmed: neutral-gold or blue
- In preparation: amber
- Ready: green
- Late: red
- Completed: muted grey

Use color, icon, and text.

---

# 15. Customer Mobile Experience

## 15.1 Mobile Home/Menu

Include:

- Joy Corner logo
- Greeting
- Search
- Category chips
- Product cards
- Cart badge
- Rewards shortcut
- Active order summary

---

## 15.2 Product Cards on Mobile

Use either:

- One-column large list
- Two-column compact grid

Each card should show:

- Product image
- Name
- Price
- Add button
- Optional short description
- Loyalty eligibility if relevant

---

## 15.3 Mobile Cart

Include:

- Selected products
- Variants
- Extras
- Quantity
- Notes
- Subtotal
- Discounts
- Total
- Checkout button

Use a sticky checkout area.

---

## 15.4 Order Tracking

Use a vertical timeline with:

1. Order received
2. Waiting for confirmation
3. Confirmed
4. Being prepared
5. Ready for pickup
6. Picked up

Each step must include:

- Icon
- Label
- Timestamp
- Completed state
- Current state
- Pending state

The current state should be visually dominant.

---

## 15.5 Rewards and Vouchers

The customer rewards screen should show:

- Current points
- Membership level
- Progress bar
- Available vouchers
- Voucher expiry
- Rewards history
- Total orders
- Total spending

Use compact premium cards with gold accents.

---

# 16. Authentication Screens

## 16.1 Sign-In Screen

Use:

- Full-screen coffee photography
- Dark gradient overlay
- Centered glass card
- Joy Corner logo
- Welcome heading
- Email or phone field
- Password field
- Show/hide password
- Forgot password
- Sign-in button
- Customer sign-up link

---

## 16.2 Sign-Up Screen

Include:

- Full name
- Phone number
- Email if supported
- Password
- Confirm password
- Terms checkbox
- Create account button
- Existing-account link

Staff self-registration must not be available publicly.

---

## 16.3 Authentication States

Support:

- Default
- Focused
- Filled
- Loading
- Success
- Error
- Disabled
- Session expired
- Incorrect credentials
- Duplicate phone/email

---

# 17. Buttons

## 17.1 Primary Button

Style:

- Caramel-to-gold gradient
- Espresso text
- Semibold
- Minimum height 44–48px
- Subtle shadow
- Gentle hover elevation

---

## 17.2 Secondary Button

Style:

- Transparent dark background
- Gold border
- Ivory text

---

## 17.3 Tertiary Button

Style:

- Transparent
- Muted or cream text
- Gold hover state

---

## 17.4 Danger Button

Use:

- Red surface or red border
- Confirmation before destructive action
- Clear label

---

## 17.5 Disabled Button

Must have:

- Reduced contrast
- No active shadow
- Readable text
- `cursor: not-allowed`
- No click behavior

---

# 18. Inputs and Forms

Inputs should have:

- Visible label
- Dark glass background
- Warm border
- Gold focus ring
- Clear placeholder
- Inline validation
- Minimum 46px height
- Optional leading icon
- Optional trailing action

```css
.jc-input {
  min-height: 46px;
  border-radius: var(--jc-radius-md);
  background: rgba(255, 253, 248, 0.05);
  border: 1px solid rgba(214, 167, 86, 0.16);
  color: var(--jc-ivory);
  font-family: var(--jc-font-ui);
}

.jc-input:focus {
  border-color: var(--jc-gold);
  box-shadow: 0 0 0 3px rgba(214, 167, 86, 0.12);
  outline: none;
}
```

Error fields should use:

- Red border
- Clear inline message
- Error icon
- Preserved input value

---

# 19. Badges

Required badges:

- New
- Awaiting confirmation
- Confirmed
- In preparation
- Ready
- Picked up
- Paid
- Partially paid
- Unpaid
- Cancelled
- Popular
- Loyalty
- Missing image
- Found
- VIP

Rules:

- Keep labels short
- Use readable contrast
- Use icons where useful
- Never use a badge as the only status indicator
- Avoid long all-uppercase text

---

# 20. Cards

## 20.1 Standard Card

Use for:

- Dashboard metrics
- Product details
- Rewards
- Customer summaries

## 20.2 Dense Operational Card

Use for:

- Cashier orders
- Barista orders
- Receipts
- Payments
- Customer history

Dense cards must have:

- Stronger background opacity
- Clear hierarchy
- Compact spacing
- High contrast

---

# 21. Tables

Tables should be used only where they improve readability.

Recommended for:

- Customer list
- Payment history
- Voucher records
- Analytics
- End-of-day reports
- Audit log

Tables must include:

- Sticky header where useful
- Zebra or subtle row separation
- Responsive mobile alternative
- Clear sorting
- Search and filter controls
- Empty state
- Loading state

Avoid wide tables on mobile. Convert to stacked cards when necessary.

---

# 22. Product Images

Product imagery should match Joy Corner’s brand style:

- High contrast
- Dark or controlled backgrounds
- Branded cups
- Warm light
- Caramel and cream tones
- Clean composition
- Editorial crop
- Consistent treatment

Rules:

- Do not use the logo as the main product image
- Use a neutral branded fallback
- Use `object-fit: cover`
- Lazy-load
- Generate thumbnails
- Preserve aspect ratio
- Add alt text
- Use WebP or AVIF where supported
- Show upload progress
- Show missing-image state

---

# 23. Image Management Screen

The Owner `Menu & Images` screen should include:

- Product list
- Search
- Category filter
- Missing-image filter
- Current image preview
- Upload
- Replace
- Remove
- Crop
- Compression
- Save
- Upload progress
- Error state
- Approval status

Recommended storage path:

```text
menu-items/{productId}/main-{timestamp}.webp
```

Do not store binary images inside Google Sheets.

---

# 24. Icons

Use one consistent icon library.

Recommended style:

- Thin to medium stroke
- Rounded line ends
- Minimal detail
- Gold or cream color
- Filled state only for active navigation where needed

Use icons for:

- Home
- Orders
- Kitchen
- Customers
- Rewards
- Vouchers
- Menu
- Analytics
- End of Day
- System
- Search
- Cart
- Notifications
- Settings
- Payment
- Print
- Close
- Confirm
- Ready
- Pickup

Avoid mixing multiple unrelated icon styles.

---

# 25. Motion and Interaction

Use restrained motion:

- Button hover: 120–180ms
- Card hover: 160–220ms
- Drawer transition: 200–280ms
- Status update: brief fade or slide
- Toast entry: 200–250ms
- Modal entry: 180–240ms

Do not use:

- Long bouncing animations
- Strong parallax
- Continuous floating elements
- Excessive glow pulses
- Motion that distracts staff

Respect:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

# 26. Responsive Breakpoints

Suggested breakpoints:

```text
Mobile: 0–639px
Tablet: 640–1023px
Desktop: 1024–1439px
Wide: 1440px+
```

---

## 26.1 Mobile Rules

- Single-column layout
- Bottom navigation
- Full-width cards
- Sticky primary actions
- No horizontal overflow
- 16px page padding
- Large touch targets
- Modal becomes full-screen sheet where appropriate

---

## 26.2 Tablet Rules

- Collapsible side navigation
- Two-column product grid
- Slide-over cart
- Two-column dashboards
- Compact order cards

---

## 26.3 Desktop Rules

- Fixed sidebar
- Multi-column operational boards
- Persistent cart/order panel
- Wider tables
- Sticky filters where useful

---

## 26.4 Wide Desktop Rules

- Use comfortable maximum widths
- Do not stretch text lines excessively
- Preserve card proportions
- Increase spacing carefully
- Avoid overly wide empty areas

---

# 27. Accessibility

Minimum requirements:

- WCAG AA color contrast
- Keyboard navigation
- Visible focus states
- Logical tab order
- Semantic labels
- ARIA labels for icon-only controls
- Status not communicated by color alone
- 44px minimum touch targets
- Text zoom support
- Reduced-motion support
- Alt text for images
- Dialog focus trapping
- Error messages connected to inputs
- Buttons must have accessible names
- Screen readers must receive status updates

---

# 28. Loading States

Every major screen must define a loading state.

Use:

- Skeleton product cards
- Skeleton order cards
- Inline button spinners
- Table row placeholders
- Subtle shimmer
- Delayed full-screen loader only when absolutely necessary

Do not block the entire page for small updates.

---

# 29. Empty States

Required empty states:

- No active orders
- No kitchen orders
- No unpaid receipts
- No vouchers
- No rewards history
- No customer history
- No product image
- No search results
- No analytics data
- No notifications

Each empty state should include:

- Simple icon or illustration
- Clear message
- Optional action button
- Helpful next step

---

# 30. Error States

Every database and API action must support:

- User-friendly error message
- Retry action
- Preserved form data
- Technical logging
- Permission error
- Network error
- Timeout
- Session expired
- Upload failure
- Real-time listener failure

Do not show raw technical stack traces to users.

---

# 31. Notifications and Toasts

Use toasts for:

- Order created
- Order confirmed
- Payment saved
- Order sent to kitchen
- Order marked ready
- Order completed
- Image uploaded
- Customer created
- Voucher applied
- Error saving data

Toast rules:

- Short message
- Clear status icon
- Auto-dismiss for normal success
- Manual dismiss for important warnings
- Do not stack excessive duplicate toasts

---

# 32. Modals and Drawers

Use modals for:

- Confirmation
- Payment details
- Product customization
- Delete confirmation
- Receipt preview

Use drawers for:

- Mobile cart
- Filters
- Customer details
- Order details
- Navigation

Modal requirements:

- Focus trap
- Escape key support
- Close button
- Backdrop
- Accessible title
- Mobile-safe sizing

---

# 33. Receipt UI

Receipt design should be clear and printable.

Include:

- Joy Corner logo
- Receipt number
- Order number
- Date and time
- Customer name
- Order place
- Items
- Quantity
- Variant
- Extras
- Unit price
- Line total
- Subtotal
- Discount
- Voucher
- Tax
- Service fee
- Delivery fee
- Total
- Paid amount
- Remaining amount
- Payment method
- Payment status
- Cashier
- Optional QR code

The digital view may use the dark theme, but print output should use a clean light receipt layout.

---

# 34. Analytics UI

Analytics screens should include:

- Date filter
- Branch filter
- Revenue
- Orders
- Average order value
- Paid vs unpaid
- Top products
- Top categories
- New customers
- Loyalty activity
- Voucher usage
- Sales trend

Charts should:

- Use gold, caramel, cream, and status colors
- Remain readable
- Include labels
- Have accessible summaries
- Avoid unnecessary 3D effects

---

# 35. End-of-Day UI

The End of Day screen should provide:

- Business day status
- Total orders
- Total sales
- Cash payments
- Card payments
- Unpaid balance
- Discounts
- Voucher usage
- Refunds
- Variance
- Staff closing confirmation
- Archive action

Destructive reset actions must:

- Require confirmation
- Explain consequences
- Show success or failure
- Prevent duplicate closure

---

# 36. System and Settings UI

Group settings into sections:

- Business information
- Branches
- Taxes
- Service fees
- Payment methods
- Loyalty rules
- Voucher rules
- Staff accounts
- Roles and permissions
- Image settings
- Notification settings
- Integration status

Use tabs or grouped cards.

Do not place all settings in one long unstructured page.

---

# 37. Reusable Components

Create or standardize:

- `AppShell`
- `Sidebar`
- `TopBar`
- `MobileBottomNav`
- `GlassPanel`
- `DensePanel`
- `MetricCard`
- `ProductCard`
- `OrderCard`
- `KitchenOrderCard`
- `StatusBadge`
- `PaymentBadge`
- `PrimaryButton`
- `SecondaryButton`
- `TertiaryButton`
- `DangerButton`
- `TextInput`
- `PhoneInput`
- `SearchInput`
- `Select`
- `Checkbox`
- `Toggle`
- `Modal`
- `Drawer`
- `Toast`
- `Skeleton`
- `EmptyState`
- `ErrorState`
- `OrderTimeline`
- `CustomerLookup`
- `OrderPlaceSelector`
- `CartSummary`
- `ReceiptView`
- `ImageUploader`
- `CategoryTabs`
- `FilterBar`
- `Pagination`
- `DataTable`

---

# 38. Component State Requirements

Every interactive component must define:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading
- Success
- Error

Do not leave browser-default states.

---

# 39. Implementation Rules

- Use centralized tokens
- Build reusable components
- Do not redesign each role independently
- Keep the same status colors across all screens
- Keep operational screens compact
- Keep customer screens visually richer
- Use real product images where available
- Do not hardcode repeated inline styles
- Avoid duplicated component logic
- Use semantic HTML
- Validate desktop, tablet, and mobile
- Compare implementation against the supplied mockups
- Preserve accessibility
- Preserve performance
- Do not claim completion without screenshots and tests

---

# 40. Required Screens

The final UI system must cover:

## Owner

- Sign in
- Overview
- New Order
- Cashier
- Kitchen
- Orders
- Customers
- Rewards
- Vouchers
- Menu & Images
- Analytics
- End of Day
- System

## Cashier

- Sign in
- New Order
- Cashier queue
- Customer lookup
- Payment
- Receipt
- History

## Barista

- Sign in
- Kitchen queue
- In preparation
- Ready
- History

## Customer

- Sign in
- Sign up
- Menu
- Product details
- Cart
- Checkout
- Orders
- Order tracking
- Receipts
- Unpaid receipts
- Rewards
- Vouchers
- Account

---

# 41. Acceptance Criteria

The UI implementation is accepted only when:

- The result closely matches the visual mockup
- The style guide is consistently applied
- Navigation does not overlap
- No page has horizontal overflow
- Product cards use real or proper fallback images
- POS works at common laptop widths
- Cashier cards are compact and readable
- Kitchen cards are fast to scan
- Mobile navigation is usable with one hand
- Order tracking is clear
- Forms have visible validation
- Buttons show all required states
- Status colors are consistent
- Text contrast passes accessibility checks
- All roles use the same design system
- Loading, empty, and error states exist
- Desktop, tablet, and mobile screenshots are produced
- Responsive behavior is tested
- Production build passes
- No visual regressions remain

---

# 42. Required Review Screenshots

Before declaring the UI complete, produce screenshots for:

## Desktop

- Owner Overview
- Owner New Order
- Cashier Dashboard
- Barista Kitchen
- Menu & Images
- Analytics

## Tablet

- POS
- Cashier queue
- Kitchen queue

## Mobile

- Sign in
- Sign up
- Customer menu
- Cart
- Order tracking
- Rewards
- Account

---

# 43. Final Visual Principle

The Joy Corner app should look like a premium coffee brand and work like a serious operations system.

The visual design must never interfere with:

- Order accuracy
- Payment clarity
- Staff speed
- Customer tracking
- Accessibility
- Mobile usability

The final product should feel warm and luxurious while remaining practical enough for daily café operations.
