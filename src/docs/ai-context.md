# AI Context

## Equipment Rental System

Version: MVP 1.0

---

# Purpose

This document provides architectural context for AI assistants working on this project.

Always read this document before generating code.

Never assume architecture that is not documented here.

If implementation conflicts with this document, ask for clarification before generating replacements.

---

# Project Type

React

TypeScript

Vite

Feature-Based Architecture

Repository Pattern

Context Pattern

TailwindCSS

Strict TypeScript

---

# Project Goal

Build a production-quality Equipment Rental Management System.

Current storage uses Local Storage.

The architecture is intentionally designed for future migration to:

- Firebase

- Supabase

- SQL Server

without changing page logic.

---

# High-Level Architecture

Pages

↓

Context Providers

↓

Repositories

↓

Local Storage

Pages never communicate directly with Local Storage.

Repositories never import React.

---

# Folder Convention

src/

app/

components/

features/

pages/

docs/

Business logic belongs inside feature folders.

Pages should remain thin.

---

# Repository Pattern

Each business feature owns its own repository.

Example

equipment/

repository/

IEquipmentRepository.ts

LocalEquipmentRepository.ts

index.ts

Repositories are responsible for:

- create

- update

- delete

- getAll

- getById

Repositories are the persistence layer.

---

# Context Pattern

Repositories are wrapped by Context Providers.

Pages communicate only with Context Providers.

Context Providers coordinate repository operations and UI refresh.

---

# Master Entities

Equipment

Assignment

Rental

Maintenance

Project

Operator

Customer

Audit

Equipment History

---

# Equipment

EquipmentRecord contains

- id

- assetNo

- equipmentName

- category

- maintenanceType

- currentReading

- projectId

- operatorId

- status

- deleted

- deletedAt

Status values

Available

Assigned

Maintenance

Equipment never stores project name or operator name.

Relationships always use IDs.

---

# Assignment

Assignments connect

Equipment

↓

Operator

↓

Project

AssignmentRecord stores

equipmentId

operatorId

projectId

assignedDate

expectedReturn

returnedDate

remarks

status

Status

Active

Completed

Cancelled

---

# Rental

Rental references Equipment.

Rental stores customer information.

Rental status

Active

Returned

---

# Maintenance

Maintenance belongs to Equipment.

Equipment under Maintenance cannot be assigned.

---

# Projects

Assignments reference Projects through projectId.

Soft Delete is supported.

Deleted projects should not appear in selectors.

---

# Operators

Assignments reference Operators through operatorId.

Only Active operators may receive assignments.

---

# Customers

Customers are referenced by Rental records.

Historical rentals must remain even if customers are removed.

---

# Audit

Every Create

Update

Delete

should generate an Audit Log.

Audit entries are immutable.

---

# Equipment History

Equipment lifecycle events are stored permanently.

Examples

Created

Edited

Assigned

Returned

Maintenance Started

Maintenance Completed

Rental Started

Rental Returned

History records should never be removed.

---

# Soft Delete

Master records use

deleted

deletedAt

instead of physical deletion.

---

# Build Requirement

Every generated file must compile under

TypeScript Strict Mode.

No implicit any.

No ignored errors.

Every replacement should end with

npm run build

passing successfully.

---

# Working Style

When generating replacements:

1. Respect the existing architecture.

2. Prefer complete file replacements.

3. Avoid assuming filenames.

4. Avoid introducing new architectural patterns unless requested.

5. Keep repository, context, and page responsibilities separated.

6. If architecture is unclear, ask before generating code.

---

# Documentation Policy

Whenever a major architectural decision is made, update:

[architecture.md](http://architecture.md)

[domain-rules.md](http://domain-rules.md)

[development-roadmap.md](http://development-roadmap.md)

[ai-context.md](http://ai-context.md)

These four documents are considered the project's single source of truth.