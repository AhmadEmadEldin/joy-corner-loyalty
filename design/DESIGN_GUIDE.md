# JOY CORNER DESIGN GUIDE

**File:** `DESIGN_GUIDE.md`  
**Project:** Joy Corner Loyalty & Coffee Operations App  
**Version:** 1.0  
**Purpose:** Complete visual and implementation guide for OpenCode/Codex  
**Primary source of truth:** All PNG mockups and Markdown specifications inside `./design`

---

# 1. Project Goal

Redesign the complete Joy Corner application so that every page, role, workflow, voucher, receipt, menu category, authentication screen, staff dashboard, and customer-facing screen uses one consistent premium black, espresso, caramel, gold, and coffee-farm visual identity.

The application must look and feel like the generated reference mockups in the `./design` folder.

This is not a request to build a separate demonstration app. Modify the existing application, routes, components, APIs, and business workflows. Use real application data. Do not copy fake names, totals, products, prices, order numbers, loyalty points, dates, or descriptions from the mockups.

---

# 2. Design Folder Structure

```text
design/
├── full-app-ui-mockup.png
├── style-guide-tokens.png
├── ui-menu-overview.png
├── ui-menu-hot-beverages.png
├── ui-menu-iced-drinks.png
├── ui-menu-shakes.png
├── ui-menu-smoothies.png
├── ui-menu-juices.png
├── ui-menu-frappes.png
├── ui-menu-cocktails.png
├── ui-menu-soft-drinks.png
├── ui-menu-sandwiches-utopia.png
├── ui-menu-matcha.png
├── ui-menu-desserts.png
├── ui-menu-extras.png
├── ui-menu-extra-boba.png
├── ui-voucher-coffee-farm.png
├── ui-receipt-coffee-farm.png
├── UI_DESIGN_SPEC.md
├── AUDIT_REPORT.md
└── DESIGN_GUIDE.md
```

If names differ slightly, match them by purpose and rename them to this structure.

---

# 3. Design Principles

The Joy Corner interface must feel premium, elegant, warm, modern, coffee-focused, operationally clear, fast, mobile-friendly, trustworthy, and consistent across all roles.

The visual language is:

- Black and deep espresso backgrounds
- Warm caramel and gold accents
- Ivory and cream typography
- Editorial coffee photography
- Subtle coffee-farm illustrations
- Dark glass panels
- Rounded cards
- Elegant serif headings
- Clean sans-serif operational text
- Clear status colors
- Controlled motion
- High contrast

Avoid bright white full-page layouts, generic Bootstrap styling, flat brown blocks, weak contrast, oversized logos, overlapping navigation, horizontal overflow, random shadows, random radii, excessive blur, overdecorated staff screens, decorative fonts for operational data, and stretched logo placeholders.

---

# 4. Brand Tokens

Create one centralized theme file such as `src/styles/joy-corner-tokens.css` or `src/theme/joyCornerTheme.ts`.

```css
:root {
  --jc-bg-primary: #0B0806;
  --jc-bg-secondary: #120C08;
  --jc-bg-tertiary: #1A120C;
  --jc-bg-elevated: #2B1B14;
  --jc-bg-soft: #342219;

  --jc-espresso: #2B1B14;
  --jc-coffee: #4A2C20;
  --jc-caramel: #B9783D;
  --jc-gold: #D6A756;
  --jc-gold-light: #E8C77E;

  --jc-cream: #F7F0E4;
  --jc-ivory: #FFFDF8;
  --jc-sand: #E9DDCC;
  --jc-muted: #A89A8E;
  --jc-muted-dark: #786A61;

  --jc-success: #387A52;
  --jc-success-soft: rgba(56, 122, 82, 0.18);
  --jc-warning: #C67B2D;
  --jc-warning-soft: rgba(198, 123, 45, 0.18);
  --jc-danger: #B8463D;
  --jc-danger-soft: rgba(184, 70, 61, 0.18);
  --jc-info: #3882F6;
  --jc-info-soft: rgba(56, 130, 246, 0.18);

  --jc-glass-light: rgba(255, 253, 248, 0.05);
  --jc-glass-medium: rgba(43, 27, 20, 0.68);
  --jc-glass-strong: rgba(18, 12, 8, 0.88);
  --jc-glass-solid: rgba(11, 8, 6, 0.96);

  --jc-border-soft: rgba(214, 167, 86, 0.18);
  --jc-border-medium: rgba(214, 167, 86, 0.35);
  --jc-border-active: rgba(214, 167, 86, 0.68);

  --jc-font-display: "Playfair Display", Georgia, serif;
  --jc-font-ui: "Poppins", Arial, sans-serif;

  --jc-radius-xs: 4px;
  --jc-radius-sm: 8px;
  --jc-radius-md: 12px;
  --jc-radius-lg: 16px;
  --jc-radius-xl: 24px;
  --jc-radius-2xl: 32px;
  --jc-radius-pill: 999px;

  --jc-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.22);
  --jc-shadow-md: 0 12px 28px rgba(0, 0, 0, 0.32);
  --jc-shadow-lg: 0 22px 52px rgba(0, 0, 0, 0.42);
  --jc-shadow-glow: 0 0 22px rgba(214, 167, 86, 0.18);

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

  --jc-duration-fast: 140ms;
  --jc-duration-normal: 220ms;
  --jc-duration-slow: 300ms;
  --jc-ease: cubic-bezier(0.2, 0, 0, 1);
}
```

---

# 5. Typography

Use Playfair Display for page headings, hero titles, voucher and receipt titles, authentication titles, promotional copy, and menu-category headings.

Use Poppins for navigation, buttons, inputs, prices, order values, receipt items, tables, status badges, dashboards, labels, and mobile navigation.

Do not use decorative serif typography for quantities, payment amounts, order numbers, phone numbers, table numbers, status filters, or validation.

---

# 6. Global Application Shell

Create reusable `AppShell`, `StaffSidebar`, `CustomerHeader`, `TopBar`, `MobileDrawer`, `MobileBottomNav`, `NotificationButton`, `UserMenu`, and `BranchSelector` components.

Desktop staff layout:

```text
Left sidebar: 240–272px
Top bar: 64–72px
Main content: flexible
Right contextual panel: optional
Page padding: 24–32px
```

Sidebar groups:

- Operations: Overview, New Order, Cashier, Kitchen, Orders
- Customers: Customers, Rewards, Vouchers
- Catalog: Menu & Images
- Business: Analytics, End of Day, System

The active item must have a gold outline, warm glass background, gold icon, ivory text, and subtle shadow.

---

# 7. Menu Overview Page

Use `ui-menu-overview.png` as reference.

Include welcome message, search, branch selector, notifications, sales summary, order count, average order value, loyalty summary, category cards, Manage Menu button, and current order panel when inside the POS flow.

Category cards must cover Hot Beverages, Iced Drinks, Shakes, Smoothies, Juices, Frappes, Cocktails, Soft Drinks, Sandwiches, Matcha, Desserts, Extras, and Extra Boba. Counts come from real data.

---

# 8. Category Menu Pages

Build one reusable `CategoryMenuPage`. Every category page shares the same structure: title, subtitle, search, branch selector, category navigation, filter button, product grid, customer lookup, order-place selection, cart, payment summary, and Confirm Order button.

References:

- `ui-menu-hot-beverages.png`
- `ui-menu-iced-drinks.png`
- `ui-menu-shakes.png`
- `ui-menu-smoothies.png`
- `ui-menu-juices.png`
- `ui-menu-frappes.png`
- `ui-menu-cocktails.png`
- `ui-menu-soft-drinks.png`
- `ui-menu-sandwiches-utopia.png`
- `ui-menu-matcha.png`
- `ui-menu-desserts.png`
- `ui-menu-extras.png`
- `ui-menu-extra-boba.png`

All category pages must preserve the black identity. Category-specific colors may appear in product photography or small accents only.

Use actual database records. Do not hardcode mockup products, descriptions, brands, or prices.

---

# 9. Product Cards

Create one reusable `ProductCard` with image, name, category, short description, price, availability state, optional Popular/New badge, Add button, and optional loyalty indicator.

Use `object-fit: cover`, lazy loading, skeletons, alt text, optimized WebP/AVIF, and a proper branded fallback. Never use the Joy Corner logo as a full-size product photo.

---

# 10. Product Availability

Supported states:

- `AVAILABLE`
- `TEMPORARILY_UNAVAILABLE`
- `SOLD_OUT`
- `ARCHIVED`

Temporarily unavailable and sold-out products stay visible by default with reduced image brightness, dark overlay, clear status label, lock/pause icon, and disabled Add button. Archived products are hidden from active menus but preserved in historical orders and analytics.

```css
.product-card--unavailable img {
  filter: grayscale(0.45) brightness(0.50);
}

.product-card__overlay {
  position: absolute;
  inset: 0;
  background: rgba(8, 5, 3, 0.72);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
}
```

---

# 11. Owner Menu Management

The Owner can add products, edit name/description/category, change prices and variant prices, edit extras, upload/replace/remove images, change order, mark loyalty eligibility, mark available/unavailable/sold out, archive, and restore.

Changes must update Owner, Cashier, Barista, and Customer accounts in real time where supported. Historical order prices must never change.

---

# 12. POS / New Order Page

Main area: search, category tabs, product grid, filters.

Right area: customer lookup, customer details, loyalty points, vouchers, unpaid balance, order place, place details, cart, payment, totals, and Confirm Order.

Order-place options: Dine in, Takeaway, Car, Outside, Delivery.

Conditional fields:

- Dine In: table number
- Takeaway: pickup name and optional pickup time
- Car: color, model, optional plate number
- Delivery: address, phone, note, fee

---

# 13. Cart Design

Each line shows thumbnail, product name, size, extras, quantity, unit price, line total, remove action, availability warning, and price-change warning.

Summary shows subtotal, discount, voucher, tax, service fee, delivery fee, total, amount paid, remaining, payment method, and payment status.

Payment statuses: Unpaid, Partially Paid, Paid, Refunded, Voided.

---

# 14. Owner Overview

Use the full-app mockup. Show sales today, orders today, average order value, new customers, active kitchen orders, unpaid balance, loyalty use, voucher use, staff activity, sales trend, top products, top categories, and end-of-day state.

---

# 15. Cashier Pages

Required views: dashboard, New Order, Awaiting Confirmation, Confirmed, Ready, Unpaid, Partially Paid, Paid, Completed, Cancelled, History, and Receipt preview.

Cashier cards include order number, customer, time, place, items, total, paid, remaining, payment status, order status, primary action, print receipt, and close transaction.

---

# 16. Barista Pages

Views: New, In Preparation, Ready, History.

Cards include order number, elapsed time, customer/pickup name, place details, products, quantities, sizes, extras, notes, priority, and status.

Sequence:

```text
Confirmed → Start preparation
In preparation → Mark ready
Ready → Mark picked up
```

Completed cards leave the active board immediately.

---

# 17. Customer Frontend

Required pages: Sign In, Sign Up, Forgot Password, Home, Menu, Product Details, Cart, Checkout, Orders, Order Tracking, Receipts, Unpaid Receipts, Rewards, Vouchers, Account, Notifications.

Mobile navigation: Home/Menu, Orders, Rewards, Account, More.

---

# 18. Customer Home

Include greeting, active-order card, search, category cards, featured products, rewards summary, vouchers, recent orders, and promotions.

---

# 19. Customer Order Tracking

Use a vertical timeline:

1. Order received
2. Waiting for confirmation
3. Confirmed
4. Being prepared
5. Ready
6. Picked up

Each step includes icon, label, time, and completed/current/pending styling. Updates must be real time.

---

# 20. Authentication

Use full-screen coffee photography, black overlay, centered dark glass card, Joy Corner logo, gold CTA, ivory text, and clear validation.

Staff self-registration must not be public.

---

# 21. Voucher Design

Reference: `ui-voucher-coffee-farm.png`.

Include Joy Corner logo, voucher title, reward benefit, customer name when personalized, code, copy action, expiry, applicable products/categories, Redeem button, terms, status, coffee-farm artwork, coffee cherries, bean basket, and warm sunset lighting.

Statuses: Active, Redeemed, Expired, Cancelled.

Use real values. Mobile version stacks vertically.

---

# 22. Receipt Design

Reference: `ui-receipt-coffee-farm.png`.

Digital receipt includes logo, receipt number, order number, date/time, customer, staff, items, quantity, variant, extras, unit price, line total, subtotal, discount, voucher, tax, service, delivery, total, paid, remaining, payment method, payment status, QR verification, thank-you message, and social links where configured.

The digital view may use the farm background. The print version must use a clean light layout suitable for thermal or A4 printing.

---

# 23. Rewards

Customer rewards page: points, tier, progress, available rewards, history, total orders, total spending, points earned/redeemed.

Owner rewards page: rules, settings, eligible products, redemptions, manual adjustment, audit history.

---

# 24. Voucher Management

Owner can create voucher, choose customer, reward/value, applicable category/product, expiry, usage count, status, code, delivery, and redemption history. Use farm artwork in previews; operational tables remain compact and dark.

---

# 25. Customers Page

Customer list includes search, phone, name, orders, spend, unpaid, points, vouchers, and status.

Customer profile includes details, active order, recent orders, receipts, unpaid receipts, loyalty, voucher history, notes, and audit history.

---

# 26. Analytics

Include date range, branch, revenue, orders, average order, paid/unpaid, top products, top categories, customer growth, loyalty, vouchers, sales trend, and staff performance. Use gold, caramel, cream, green, and red. Avoid 3D charts.

---

# 27. End of Day

Show business-day status, order count, total sales, cash, card, unpaid, discounts, vouchers, refunds, variance, staff confirmation, and archive state. Destructive actions require a warning design and confirmation modal.

---

# 28. System Settings

Group into Business, Branches, Tax, Service Fees, Payment Methods, Loyalty, Vouchers, Staff, Roles, Menu, Images, Notifications, and Integrations.

---

# 29. Reusable Components

Create or standardize:

- `AppShell`
- `Sidebar`
- `TopBar`
- `MobileBottomNav`
- `GlassPanel`
- `DensePanel`
- `MetricCard`
- `CategoryCard`
- `ProductCard`
- `UnavailableProductOverlay`
- `OrderCard`
- `KitchenOrderCard`
- `CustomerCard`
- `StatusBadge`
- `PaymentBadge`
- `PrimaryButton`
- `SecondaryButton`
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
- `VoucherCard`
- `VoucherPreview`
- `ImageUploader`
- `CategoryTabs`
- `FilterBar`
- `DataTable`

---

# 30. Responsive Rules

```text
Mobile: 0–639px
Tablet: 640–1023px
Desktop: 1024–1439px
Wide: 1440px+
```

Mobile: single column, bottom nav, sticky primary action, full-width cards, full-screen cart drawer, no horizontal overflow.

Tablet: collapsible sidebar, two-column grid, slide-over cart, two-column dashboards.

Desktop: fixed sidebar, multi-column grid, persistent right order panel, compact operational cards.

Wide: comfortable max widths and preserved density.

---

# 31. Accessibility

Require WCAG AA contrast, keyboard navigation, focus rings, semantic labels, ARIA labels for icon-only buttons, status text plus color, 44px touch targets, alt text, reduced motion, focus trapping, screen-reader status updates, and field-linked validation messages.

---

# 32. Loading, Empty, and Error States

Loading: skeleton cards, inline spinners, table placeholders, upload progress.

Empty: no orders, vouchers, rewards, images, search results, customers, or kitchen orders.

Error: friendly message, retry, preserved form data, technical logging, no stack traces.

---

# 33. Motion

Use restrained motion: buttons 140–180ms, cards 160–220ms, drawers 220–280ms, toasts 200–250ms, status changes with short fade/slide. Respect reduced-motion preferences.

---

# 34. OpenCode/Codex Rules

1. Inspect the repository before editing.
2. Identify framework and styling system.
3. Do not create a duplicate app.
4. Reuse working components.
5. Replace broken layouts with reusable components.
6. Preserve routes.
7. Preserve working business logic.
8. Use real database values.
9. Do not hardcode mockup data.
10. Use PNGs as visual direction.
11. Use central tokens.
12. Implement mobile, tablet, desktop.
13. Run lint, type checking, tests, and production build.
14. Fix all introduced errors.
15. Produce screenshots and compare with references.

---

# 35. Required Screenshots

Desktop: Owner Overview, Menu Overview, New Order, every menu category, Cashier, Barista, Customers, Rewards, Vouchers, Receipt, Analytics, End of Day, System.

Mobile: Sign In, Sign Up, Customer Home, Menu, Product Details, Cart, Order Tracking, Rewards, Voucher, Receipt, Account.

Tablet: New Order, Cashier, Barista, Menu.

---

# 36. Definition of Done

The design is complete only when every page uses the same Joy Corner identity, all mockups are represented, black remains dominant, coffee-farm art is used selectively, voucher and digital receipt match the farm concept, print receipt remains practical, navigation does not overlap, no horizontal overflow exists, images render correctly, unavailable products show blocked cards, owner price changes propagate, customer tracking is real time, staff dashboards remain compact, mobile navigation works, accessibility passes, production build passes, screenshots are reviewed, and no mock data remains in production components.

---

# 37. Final Product Principle

The complete Joy Corner application must combine the emotion of a premium coffee brand with the speed and clarity of a professional café operations system. Beauty must never reduce order accuracy, payment clarity, staff speed, accessibility, or mobile usability.
