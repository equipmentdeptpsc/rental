# Equipment Rental System
## Software Architecture

Version: MVP 1.0

---

# 1. Purpose

The Equipment Rental System is a single-page React application used to manage company-owned equipment throughout its operational lifecycle.

The system centralizes:

- Equipment Inventory
- Equipment Assignment
- Equipment Rental
- Maintenance Scheduling
- Operators
- Projects
- Customers
- Audit Trail
- Equipment History

The current MVP stores all information locally through repository implementations. The architecture has been designed so the storage layer can later be replaced with Firebase, Supabase, SQL Server, or another backend without changing business logic.

---

# 2. Architecture Style

The application follows a Feature-Based Architecture.

Each business domain owns its own:

- types
- repository
- context
- components
- utilities
- pages (when applicable)

Business logic is separated from UI whenever possible.

The application does not access browser storage directly from pages.

Pages communicate with Context Providers.

Context Providers communicate with Repository implementations.

Repositories are responsible for data persistence.

```
React Page
      │
      ▼
Context Provider
      │
      ▼
Repository
      │
      ▼
Local Storage
```

This separation allows repositories to be replaced by cloud storage in the future without changing page components.

---

# 3. Current Technology Stack

Frontend

- React
- TypeScript
- Vite

Routing

- React Router

Styling

- TailwindCSS

State Management

- React Context API

Persistence

- Local Storage Repository Pattern

Build Tool

- Vite

Language

- TypeScript (Strict Mode)

---

# 4. Project Folder Structure

The project follows this high-level structure.

```
src/

app/
components/
features/
pages/
docs/
```

## app

Contains application startup and routing.

Examples

- router
- route configuration

---

## components

Reusable UI controls.

Examples

- Button
- Input
- Select
- Modal
- Toast

These components should never contain business logic.

---

## features

Each feature owns its own business logic.

Current features include:

- auth
- equipment
- assignment
- rental
- maintenance
- operators
- project
- customer

Each feature may contain:

```
components/
context/
repository/
types.ts
utils/
audit/
history/
```

---

## pages

Contains route pages.

Pages should primarily:

- display information
- call Context methods
- navigate between routes

Pages should not contain repository logic.

---

## docs

Project documentation.

Current documents:

- architecture.md
- domain-rules.md
- development-roadmap.md
- ai-context.md

These documents must remain synchronized with the implementation.

---

# 5. Repository Pattern

Every master entity owns a repository.

Example:

Equipment

```
repository/

IEquipmentRepository.ts

LocalEquipmentRepository.ts

index.ts
```

Repository responsibilities:

- create
- update
- delete
- getAll
- getById

Pages should never communicate with Local Storage directly.

---

# 6. Context Pattern

Every repository is exposed through a Context Provider.

Example

EquipmentProvider

Responsibilities include:

- expose records
- expose CRUD operations
- refresh UI state
- coordinate repository updates

Contexts are the only layer pages should communicate with.

---

# 7. Dependency Direction

Dependencies always flow downward.

```
Page

↓

Context

↓

Repository

↓

Storage
```

Lower layers must never depend on higher layers.

Repositories never import React.

Pages never import Local Storage.

---

# 8. Design Goals

The architecture prioritizes:

- Maintainability
- Testability
- Clear separation of responsibility
- Future backend migration
- Predictable data flow
- Type safety
- Feature isolation