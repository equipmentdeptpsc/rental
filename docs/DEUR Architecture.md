# DEUR Architecture

## Identity

A new DEUR contains `rentalId`, `rentalEquipmentLineId`, `equipmentId`, and the line's canonical operator. These relationships are immutable. Legacy records without a line ID resolve only when Rental plus equipment identifies exactly one line.

## Evidence

- Time timeline supports hour/day/week/month billing.
- Odometer/trip evidence supports kilometer and trip billing.
- Quantity evidence supports cubic-meter billing.
- Completion evidence supports one-lot billing.

Canonical events and evidence are validated before acknowledgement and billing. Derived totals do not replace source evidence.

## Snapshots and corrections

DEUR creation clones the released line snapshot. Billing uses that embedded value even if mutable terms later change. Snapshot-required records without a snapshot are rejected rather than defaulted.

The review flow is Draft/In Progress → Submitted → Acknowledged or Rejected. Corrections form an immutable revision chain. Only the current effective acknowledged revision can be billed; consuming one revision blocks reuse of the chain.

## Synchronization

Repository mutations enqueue outbound operations. Inbound reconciliation avoids echoes and preserves immutable identity, commercial evidence, and revision metadata. Client synchronization is not an authorization boundary; the future server must enforce the same invariants.
