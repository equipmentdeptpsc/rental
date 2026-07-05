# Equipment Rental System

## Domain Rules

Version: MVP 1.0

---

# Purpose

This document defines the business rules of the Equipment Rental System.

These rules describe **what the system is allowed to do** regardless of how the software is implemented.

If implementation and this document conflict, this document takes precedence.

---

# 1. Equipment Rules

Equipment is the primary business asset.

Every equipment record shall have:

- unique ID

- Asset Number

- Equipment Name

- Category

- Maintenance Type

- Current Reading

- Project Assignment

- Operator Assignment

- Status

Status values:

- Available

- Assigned

- Maintenance

Equipment shall never exist without an Asset Number.

Asset Numbers should be unique.

---

# 2. Assignment Rules

Assignments connect:

Equipment

↓

Operator

↓

Project

Rules:

A single equipment unit may only have ONE active assignment.

A single operator may only have ONE active assignment.

Assignments cannot be created when equipment status is:

- Maintenance

Assignments cannot be created if equipment is already assigned.

Assignments automatically change Equipment status to:

Assigned

Returning equipment automatically changes Equipment status to:

Available

Completing an assignment stores:

- returnedDate

Assignment status values:

- Active

- Completed

- Cancelled

---

# 3. Rental Rules

Equipment may be rented to customers.

Rental records store:

- Customer

- Equipment

- Project

- Date Out

- Expected Return

- Actual Return

- Remarks

Rental status values:

- Active

- Returned

Returning rental equipment records Actual Return automatically.

---

# 4. Maintenance Rules

Maintenance prevents equipment usage.

Equipment in Maintenance cannot:

- be assigned

Maintenance types are determined by Equipment configuration.

Maintenance schedules use:

- Odometer

or

- Engine Hours

---

# 5. Operator Rules

Operators represent equipment operators.

Operators may have only one Active Assignment.

Operator status values include:

- Active

- On Leave

- Suspended

Only Active operators may receive assignments.

---

# 6. Project Rules

Projects own assignments.

Assignments always belong to exactly one project.

Projects support soft delete.

Deleted projects shall not appear in selection lists.

---

# 7. Customer Rules

Customers own rental transactions.

Deleting customers shall not delete historical rentals.

---

# 8. Soft Delete Rules

Master records use soft delete.

Deleted records:

- remain in storage

- disappear from normal lists

- preserve historical relationships

Soft delete fields:

deleted

deletedAt

---

# 9. Audit Rules

Every Create

Update

Delete

should generate an Audit Log entry.

Audit records should never be edited.

Audit records should never be deleted.

---

# 10. Equipment History Rules

Equipment maintains a permanent activity history.

Examples include:

Equipment Created

Equipment Edited

Assigned

Returned

Maintenance Started

Maintenance Completed

Rental Started

Rental Returned

History records should be chronological.

History records should never be deleted.

---

# 11. Repository Rules

Repositories own persistence.

Pages never communicate with Local Storage.

Contexts communicate with repositories.

Repositories communicate with Local Storage.

---

# 12. Future Backend Rules

Repositories are intentionally isolated.

Future migration targets include:

Firebase

Supabase

SQL Server

REST API

GraphQL

Changing storage technology should not require rewriting pages.