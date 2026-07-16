# Equipment Rental Management System
## AI Development Context

**Last Updated:** July 15, 2026

---

# PROJECT OVERVIEW

The Equipment Rental Management System is being developed as a production-quality internal web application for the Equipment Department. Its objective is to digitize and automate equipment management, rental operations, billing, maintenance, and reporting while preserving a scalable architecture suitable for enterprise deployment.

The current persistence layer uses Local Storage through the Repository Pattern. The architecture is intentionally designed to allow seamless migration to SQL Server and ASP.NET Core Web API without major frontend refactoring.

---

# TECHNOLOGY STACK

## Frontend

- React 19
- TypeScript (Strict Mode)
- Vite
- React Router
- TailwindCSS
- Recharts

## Architecture

- Feature-Based Architecture
- Repository Pattern
- Context API
- Local Storage Persistence

## Future Technology

- ASP.NET Core Web API
- SQL Server
- Azure App Service
- Azure SQL Database
- Azure Storage
- JWT / Azure AD Authentication

---

# ARCHITECTURE

Application Flow

Pages
?
Feature Context
?
Repository
?
Local Storage

Rules

- Pages never access Local Storage directly.
- Pages communicate only through Context.
- Context communicates only with Repository.
- Repository never imports React.
- Maintain strict separation of concerns.
- Maintain backward compatibility whenever possible.

---

# CURRENT PROJECT STATUS

Current Build Status

? Project builds successfully.

Command

npm run build

Latest significant work completed

- Billing Engine TypeScript issues resolved.
- Project successfully compiles.
- Repository architecture stabilized.

---

# COMPLETED MODULES

## Dashboard

Completed

## Equipment

- Equipment List
- Add Equipment
- Edit Equipment
- Equipment Details
- Soft Delete

## Equipment History

Completed

## Audit Trail

Completed

## Billing

Core Billing Engine implemented.

## Context Providers

- Equipment
- Assignment
- Rental
- Customer
- Project
- Maintenance
- Operator

## Repository Layer

- Equipment Repository
- Assignment Repository
- Rental Repository

## Persistence

Local Storage implementation completed.

---

# MASTER MODULES

Current / Planned

- Dashboard
- Equipment
- Customers
- Projects
- Operators
- Assignments
- Rentals
- Billing
- Maintenance
- Audit Trail
- Reports
- Settings

---

# DEVELOPMENT STANDARDS

Always

- Preserve architecture.
- Preserve folder structure.
- Maintain feature ownership.
- Produce production-quality code.
- Keep components reusable.
- Keep TypeScript strict.
- Think ahead before implementing.
- Ensure successful build after every milestone.

Never

- Redesign the application architecture.
- Introduce breaking changes without necessity.
- Duplicate business logic.
- Bypass Context and Repository layers.

---

# CODING GUIDELINES

- Strong typing.
- No unnecessary any.
- Reusable interfaces.
- Clean naming conventions.
- Repository contains business persistence only.
- React logic belongs inside Context or Components.
- Keep code modular and maintainable.

---

# FUTURE ROADMAP

Future migration targets

Database

- SQL Server

Backend

- ASP.NET Core Web API

Authentication

- JWT
- Azure AD

Hosting

- Microsoft Azure

---

# AI DEVELOPMENT INSTRUCTIONS

Before writing code

1. Analyze the requested feature.
2. Review affected modules.
3. Identify every file requiring modification.
4. Explain the implementation approach.
5. Generate code.

When source files are needed

- Never assume file contents.
- Ask for the required files first.
- Use uploaded files as the source of truth.

General rules

- Preserve the existing architecture.
- Maintain consistency across all modules.
- Prefer complete file replacements when practical.
- Ensure the application continues to build successfully.
- Act as a Senior Software Architect focused on long-term maintainability.

---

# PROJECT OBJECTIVE

Build a maintainable, scalable, enterprise-ready Equipment Rental Management System capable of supporting future cloud deployment, multi-user access, role-based security, SQL Server integration, and advanced reporting without requiring architectural redesign.
