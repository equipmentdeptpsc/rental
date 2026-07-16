# Equipment Rental Management System
# System Architecture

**Last Updated:** July 15, 2026

---

# Architecture Philosophy

The Equipment Rental Management System follows a modular, feature-based architecture designed for long-term maintainability, scalability, and future migration from Local Storage to SQL Server with an ASP.NET Core Web API.

The frontend is intentionally isolated from the persistence layer through the Repository Pattern so that changing the storage implementation requires minimal changes to business logic and user interface components.

---

# High-Level Architecture

```
                User
                  ¦
                  ?
          React Pages / Screens
                  ¦
                  ?
         Feature Context Providers
                  ¦
                  ?
         Repository Layer
                  ¦
                  ?
     Local Storage (Current)
                  ¦
                  ?
 SQL Server + ASP.NET Core API (Future)
```

---

# Application Layers

## 1. Pages

Responsibilities

- Display UI
- Handle user interactions
- Navigation
- Forms
- Tables
- Dashboards

Pages never communicate directly with Local Storage.

Pages only communicate with Context Providers.

---

## 2. Context Layer

Responsibilities

- Manage application state
- Execute business workflows
- Call repository methods
- Provide reusable hooks

Examples

- EquipmentContext
- AssignmentContext
- RentalContext
- CustomerContext
- ProjectContext
- MaintenanceContext
- OperatorContext

---

## 3. Repository Layer

Responsibilities

- CRUD operations
- Data persistence
- Local Storage access
- Future API communication

Repositories never import React.

Repositories never render UI.

Repositories contain no presentation logic.

---

## 4. Storage Layer

Current

Local Storage

Future

- SQL Server
- ASP.NET Core Web API

The Repository Pattern isolates this layer from the UI.

---

# Feature Modules

Current modules include

- Dashboard
- Equipment
- Assignments
- Rentals
- Customers
- Projects
- Operators
- Maintenance
- Billing
- Audit Trail
- Reports
- Settings

Each feature owns its own

- Types
- Repository
- Context
- Components
- Utilities
- Services (when required)

---

# Folder Organization

```
src/

features/
    equipment/
    assignment/
    rental/
    maintenance/
    customer/
    operator/
    project/

pages/

components/

contexts/

repository/

hooks/

utils/

docs/
```

The architecture emphasizes feature ownership and separation of concerns.

---

# Data Flow

```
User Action

      ¦

      ?

React Page

      ¦

      ?

Context

      ¦

      ?

Repository

      ¦

      ?

Local Storage

      ¦

      ?

Updated State

      ¦

      ?

React UI Refresh
```

---

# Design Principles

Single Responsibility

Each module has one responsibility.

Feature Ownership

Each feature manages its own logic.

Separation of Concerns

UI, business logic, and persistence remain independent.

Reusability

Components should be reusable whenever practical.

Maintainability

Favor readability over clever implementations.

Scalability

Every implementation should support future enterprise expansion.

---

# TypeScript Standards

- Strict Mode enabled
- Strong typing
- Minimal use of any
- Shared interfaces where appropriate
- Reusable model definitions

---

# Repository Rules

Repositories

Allowed

- CRUD
- Storage
- Mapping
- Serialization

Not Allowed

- React imports
- JSX
- UI rendering
- Component state

---

# Context Rules

Contexts

Allowed

- Business logic
- Validation
- Repository calls
- State management

Not Allowed

- Local Storage access
- Presentation rendering

---

# Component Rules

Components should

- Be reusable
- Be composable
- Receive typed props
- Avoid duplicated logic

---

# Current Build Status

Status

? Successful

Verification

```
npm run build
```

The project must continue building successfully after every completed milestone.

---

# Future Migration Strategy

Current

React

?

Repository

?

Local Storage

Future

React

?

Repository

?

REST API

?

ASP.NET Core

?

SQL Server

Because of the Repository Pattern, migration should require minimal frontend changes.

---

# Long-Term Vision

The application is being designed as an enterprise-grade Equipment Rental Management System capable of supporting

- Multi-user access
- Authentication
- Authorization
- Cloud deployment
- Reporting
- Billing
- Maintenance scheduling
- Equipment lifecycle tracking
- Analytics dashboards
- SQL Server backend
- Microsoft Azure hosting

Architecture decisions should always prioritize long-term maintainability over short-term convenience.
