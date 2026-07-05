# Equipment Rental Management System

## AI Development Context

> Last Updated: July 2026

---

# Project Goal

Develop a production-ready Equipment Rental Management System using React + TypeScript + Vite.

Priority:

1. Finish MVP

2. Stabilize

3. Polish UI

4. Optimize

5. Deployment

The AI should ALWAYS prioritize finishing functionality before UI improvements.

---

# Technology Stack

Frontend

- React

- TypeScript

- Vite

- React Router

- TailwindCSS

- Recharts

State

- React Context

Persistence

- Local Storage Repository Pattern

Architecture

Feature → Context → Repository

---

# Project Architecture

The project uses Feature First architecture.

Example

src/

features/

equipment/

assignment/

customer/

dashboard/

maintenance/

operators/

project/

rental/

Each feature owns:

- types

- repository

- context

- hooks

- utils

- services

- components

The AI MUST NEVER redesign this architecture.

---

# Data Flow

Pages

↓

Context

↓

Repository

↓

Storage

Business logic belongs inside services/utils.

Pages should remain thin.

Repositories own persistence.

Contexts own state.

---

# Current Providers

main.tsx registers providers in this order:

AuthProvider

ToastProvider

AuditProvider

EquipmentProvider

EquipmentHistoryProvider

OperatorProvider

CustomerProvider

ProjectProvider

MaintenanceProvider

AssignmentProvider

RentalProvider

RouterProvider

Do NOT introduce unnecessary Providers.

---

# Routing

React Router

Pages live under

src/pages

Each page is only a route entry.

Heavy logic belongs inside feature services.

---

# Dashboard Architecture

Dashboard has NO Context.

Dashboard has NO Repository.

Dashboard consumes existing contexts.

Structure

features/dashboard

components/

services/

types.ts

index.ts

Business logic

dashboard.service.ts

Dashboard page only gathers data from contexts.

---

# Naming Convention

New files use dot notation.

Example

dashboard.service.ts

statistics-grid.tsx

equipment-status-chart.tsx

equipment-category-chart.tsx

statistic-card.tsx

Avoid camelCase filenames for new files.

---

# Current Modules

## Equipment

Completed

Includes

CRUD

Details

Status

History

Assignment integration

Rental integration

Maintenance integration

---

## Customers

Completed

CRUD

---

## Operators

Completed

CRUD

---

## Projects

Completed

CRUD

---

## Assignments

Completed

Assignment

Return Equipment

Equipment Status Update

History Logging

Rental Integration

---

## Rentals

Completed

Rental

Return

Status

Overdue calculation

---

## Maintenance

Core implementation completed

CRUD

Status

Equipment linkage

---

## Dashboard

Completed

Milestone 1

✔ KPI Cards

Total Equipment

Available

Assigned

Maintenance

Active Rentals

Active Assignments

Overdue Rentals

Upcoming Returns

Milestone 2

✔ Equipment Status Pie Chart

✔ Equipment Category Bar Chart

---

# Remaining MVP

Dashboard

Milestone 3

Recent Assignments

Recent Rentals

Upcoming Returns

Upcoming Maintenance

Recent Equipment History

Reports

Bookings

Billing

Daily Logs

QR Tracking

Settings

Authentication

Export

Print

Deployment

---

# Equipment History

Equipment history already exists.

Context

EquipmentHistoryContext

API

history

log()

getHistory()

History Type

CREATED

UPDATED

ASSIGNED

RETURNED

RENTED

RENTAL_RETURN

MAINTENANCE_START

MAINTENANCE_END

STATUS_CHANGE

Do NOT create another activity log system.

Reuse Equipment History.

---

# Important Development Rules

Never redesign architecture.

Never introduce unnecessary Contexts.

Never introduce unnecessary Providers.

Never bypass Repositories.

Never duplicate state.

Never move business logic into Pages.

Never replace repositories with hooks.

Never store duplicated computed data.

Always follow existing architecture.

---

# Development Workflow

For every milestone

1.

Return complete replacement files.

2.

User pastes files.

3.

Run

npm run build

4.

If build succeeds

git add .

git commit

git push

5.

Continue next milestone.

Never stop for UI polishing.

---

# Build Rule

The AI should stop ONLY if

npm run build

fails.

Otherwise continue implementing the MVP.

---

# Git

Repository already exists.

Current workflow

Feature branch

architecture-standardization

Remote

origin

GitHub

[https://github.com/equipmentdeptpsc/equipment-rental-system](https://github.com/equipmentdeptpsc/equipment-rental-system)

Commit after every successful milestone.

---

# AI Response Rules

Always review existing architecture before generating code.

Never assume interfaces.

Never invent Context APIs.

Never redesign folders.

Return COMPLETE replacement files.

Avoid snippets.

Avoid pseudo code.

Assume user wants production-ready code.

When the response exceeds model limits, split into multiple responses while ensuring each response contains only complete files.

---

# Current Status

Dashboard Milestone 1

Completed

Dashboard Milestone 2

Completed

Assignment return flow

Completed

Equipment History

Completed

Repository architecture

Stable

TypeScript build

Passing

Application Status

Ready to continue MVP development.

Current Priority

Dashboard Milestone 3.