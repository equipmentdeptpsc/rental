# UX Modernization Plan

**Scope:** Visual design, information hierarchy, navigation clarity, mobile responsiveness, accessibility, and component consistency only. No business logic, workflow, repository, or routing changes.

## Goals

1. Establish a unified design system shared across modules.
2. Reduce cognitive load on high-traffic screens (Dashboard, Rentals, Rental Workspace).
3. Improve mobile operator DEUR usability.
4. Standardize entity detail layouts.

## Phase 1 — Foundation (completed in this increment)

- Design tokens in `src/index.css` (`--app-*` variables, utility classes).
- Shared UI primitives:
  - `PageHeader`, `KpiCard`, `StatusBadge`, `EmptyState`
  - `WorkflowStepper`, `WorkflowBanner`, `TabBadge`
  - `EntityDetailLayout` (+ `EntitySection`, aside/main helpers)

## Phase 2 — High-traffic screens (completed in this increment)

| Screen | Changes |
|--------|---------|
| Dashboard | Exception-first layout, action queue, shared KPI cards |
| Rentals | Tabbed views (`All Rentals`, `Engagements`, `DEUR Exceptions`), search, mobile cards |
| Rental Workspace | Workflow stepper, KPI strip, workflow banner, tab badges |
| Operator DEUR | Prominent timer, sticky primary actions, offline banner, touch targets |

## Phase 3 — Entity detail standard (partial / next)

Apply `EntityDetailLayout` to:

- Equipment Details
- Customer Details
- Project (add read-only Details page)
- Operator (add read-only Details page)

Pattern: Header → KPI strip → main content + related records + activity timeline.

## Phase 4 — Remaining modules (next)

- Assignments, Billing, Reports, Maintenance, Settings
- Global header metadata for all routes
- Notifications inbox (UI shell only; no backend)
- Responsive card fallbacks for all data tables

## Accessibility checklist

- Tab lists use `role="tablist"` / `role="tab"` / `aria-selected`
- Workflow stepper uses `aria-current="step"`
- Status messages use `role="status"` / `role="alert"`
- Minimum 48px touch targets on operator actions
- Focus rings on interactive controls (`focus-visible:ring-*`)

## Non-goals

- No changes to rental lifecycle, DEUR evidence rules, billing calculations
- No repository or API changes
- No test behavior changes (presentation-only assertions may be added)

## Incremental rollout strategy

1. Ship shared primitives (low risk).
2. Modernize Dashboard + Rentals + Workspace (highest ROI).
3. Roll `PageHeader` / `app-card` across list pages.
4. Adopt `EntityDetailLayout` module by module.
5. Figma alignment pass once design file is linked.
