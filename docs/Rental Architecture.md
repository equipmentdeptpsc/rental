# Rental Architecture

## Boundaries

The Rental feature follows `UI → Context/service → Repository → local storage`. Components render state and invoke actions; lifecycle, identity, snapshots, billing, and compatibility decisions belong to services. Repositories own serialization and normalization and do not import React.

## Entity relationships

```text
Assignment ─creates→ Rental
Rental 1 ─contains→ * RentalEquipmentLine
RentalEquipmentLine 1 ─has→ 0..1 mutable pre-release Contract
RentalEquipmentLine 1 ─captures→ 1 immutable CommercialSnapshot at release
RentalEquipmentLine 1 ─produces→ * DEUR
Rental 1 ─produces→ * BillingStatement
BillingStatement 1 ─contains→ * equipment-aware BillingStatementLine
```

`RentalEquipmentLine` is the authoritative Rental/equipment/operator relationship. Header equipment and operator fields are compatibility fields for historical single-equipment Rentals and must not select a line in multi-equipment workflows.

## Ownership

- Assignment provides the creation source; Rental owns the transaction.
- Rental owns equipment lines and coordinates lifecycle transitions.
- Equipment lines own pre-release commercial terms and released snapshots.
- DEUR owns operational evidence and embeds the applicable line snapshot.
- Billing Statement owns historical accounting rows and totals.
- Invoice presentation reads the Billing Statement; it is not another accounting aggregate.

## Persistence and trust

Local storage remains the persistence mechanism. Reads normalize legacy structures without rewriting historical accounting evidence. Local storage is user-controlled input: normalization and validation protect correctness, but authorization, concurrency, and audit enforcement require a server-backed migration.
