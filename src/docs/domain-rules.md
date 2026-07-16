# Equipment Rental Management System
# Domain Rules

**Last Updated:** July 15, 2026

---

# Purpose

This document defines the business rules governing the Equipment Rental Management System. These rules are independent of the application's implementation and must remain valid regardless of future technology changes.

---

# Core Business Principles

The system is the single source of truth for all equipment rental operations.

Every equipment transaction must be traceable.

Historical records must never be physically deleted.

Every significant action must be auditable.

Business rules take precedence over UI implementation.

---

# Equipment Rules

Each equipment unit shall have a unique Equipment ID.

Each equipment shall have only one current status.

Equipment may belong to one category.

Equipment may have one or more attachments.

Equipment history shall be retained permanently.

Equipment cannot be permanently deleted.

Soft Delete shall be used whenever equipment is retired.

Equipment availability shall be calculated from active assignments, rentals and maintenance records.

---

# Equipment Status

Only one status may exist at any time.

Allowed statuses include:

- Available
- Assigned
- Rented
- Under Maintenance
- Reserved
- Out of Service
- Retired

Status changes shall automatically update equipment history.

---

# Customer Rules

Each customer shall have a unique Customer ID.

Customers may have multiple rentals.

Customers may have multiple projects.

Inactive customers shall remain searchable for historical records.

Customer deletion shall not remove historical rental records.

---

# Project Rules

Projects shall have unique Project IDs.

A project may contain multiple equipment assignments.

A project may have multiple operators.

Projects may be Active, Completed, Suspended or Cancelled.

Completed projects become read-only except through authorized administrative actions.

---

# Operator Rules

Each operator shall have a unique Operator ID.

Operators may be assigned to multiple rentals over time.

An operator cannot be assigned to overlapping active assignments.

Operator history shall be preserved.

---

# Assignment Rules

Assignments link equipment, operator and project.

An assignment requires:

- Equipment
- Project
- Start Date

Optional fields may include:

- Operator
- End Date
- Remarks

Equipment cannot have multiple conflicting active assignments.

Assignment completion updates equipment availability.

---

# Rental Rules

Each rental shall have a unique Rental Number.

Rental lifecycle:

Draft

?

Confirmed

?

Released

?

Active

?

Returned

?

Closed

Cancelled rentals shall remain in history.

Closed rentals become read-only.

---

# Billing Rules

Billing is generated from rental activity.

Billing calculations shall be deterministic.

Billing shall preserve historical rates used during billing.

Changes to future rate schedules shall never modify historical invoices.

Billing records shall remain immutable after finalization unless adjusted through an approved correction process.

---

# Maintenance Rules

Maintenance records are permanent.

Maintenance may be:

- Preventive
- Corrective
- Breakdown
- Inspection

Equipment under maintenance shall not be available for assignment or rental.

Maintenance completion automatically restores equipment availability when no other restrictions exist.

---

# Equipment History

Every significant equipment event shall create a history entry.

Examples include:

- Created
- Updated
- Assigned
- Returned
- Rented
- Maintenance Started
- Maintenance Completed
- Status Changed
- Soft Deleted
- Restored

History records shall never be removed.

---

# Audit Trail

The system shall log important user actions.

Audit entries should include:

- Date and Time
- User
- Action
- Module
- Entity ID
- Summary of Changes

Audit records are append-only.

---

# Data Integrity Rules

Duplicate primary identifiers are prohibited.

Required fields must be validated before saving.

Business validation occurs before persistence.

Referential integrity shall be maintained between related entities.

Historical records shall never be orphaned.

---

# Reporting Rules

Reports shall be generated from system data.

Reports shall never modify operational records.

Reports shall reflect historical values as recorded.

---

# Security Rules

Current MVP

- Single-user environment

Future

- Authentication
- Role-based authorization
- User permissions
- Session management

Business rules shall remain unchanged after security implementation.

---

# Future Integration Rules

Migration from Local Storage to SQL Server shall not change business behavior.

Repository interfaces should remain stable.

REST APIs shall enforce the same business rules as the frontend.

---

# AI Development Rules

When implementing new features:

1. Preserve all business rules.
2. Never remove historical records.
3. Never bypass validation.
4. Never redesign the architecture.
5. Preserve auditability.
6. Preserve data integrity.
7. Keep business logic independent from UI implementation.
8. Ensure the project continues to build successfully.

---

# Long-Term Vision

The Equipment Rental Management System shall evolve into an enterprise-grade platform supporting:

- Multi-user operation
- SQL Server
- ASP.NET Core Web API
- Cloud deployment
- Role-based security
- QR code integration
- Barcode support
- Advanced reporting
- Analytics dashboards
- Mobile extensions

Future enhancements must preserve the business rules defined in this document.
