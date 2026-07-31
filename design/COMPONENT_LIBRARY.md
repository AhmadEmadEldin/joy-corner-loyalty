# Joy Corner Component Library

Updated: 2026-07-29

## Shared React primitives

`src/components/JoyUI.tsx` provides:

- `JoyIcon`: one outline icon language for staff and customer navigation.
- `PageHeader`: eyebrow, title, description, and optional action area.
- `MetricCard`: real-data metric with optional icon and supporting hint.
- `LoadingState`: spinner and skeleton presentation with live-region semantics.
- `EmptyState`: contextual empty state with optional action.
- `ErrorState`: safe error presentation with optional retry.
- `ConfirmDialog`: focus-managed, explicit-text confirmation for destructive
  workflows.

## Application shells

- `StaffAppShell`: role-filtered grouped sidebar, sticky utility bar, responsive
  drawer, active state, badges, branch context, notifications, and user action.
- `CustomerNavigation`: desktop navigation, focus-managed full drawer, and
  mobile bottom navigation.
- Customer top bar and staff workspace retain existing session and permission
  behavior.

## Operational components

Existing workflow components standardized by the shared design layer:

- POS category rail and product cards
- customer lookup and inline creation
- order-place selector
- staff cart summary
- Cashier and Kitchen queue cards
- payment and status badges
- customer directory table
- Owner catalog filters, list, editor, image uploader, and import preview
- analytics and End-of-Day metric grids
- integration readiness cards

## Customer components

- authentication card with sign-in, sign-up, visibility, confirmation, terms,
  and recovery guidance states
- real-data category cards and featured products
- reusable product cards and availability overlays
- focus-managed product customizer
- full-screen mobile cart drawer
- focus-managed multi-step checkout
- order list, tracking timeline, digital receipt, and print receipt
- reward metrics and progress
- voucher cards
- notification list
- profile form

## Required component states

Interactive components support:

- default
- hover
- keyboard focus
- disabled
- busy/loading where relevant
- validation or safe error messaging where relevant

No component relies on color alone to communicate status.
