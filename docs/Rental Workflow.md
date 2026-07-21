# Rental Workflow

## Canonical flow

```text
Equipment → Assignment → Rental → Equipment Lines → Commercial Terms
→ Reserve → Release → Activate → DEUR → Billing Statement → Invoice-ready status
```

1. Create a Rental from a valid Assignment.
2. Add one or more equipment lines with canonical equipment and operator identities.
3. Configure commercial terms independently while Draft or Reserved.
4. Release validates every line and captures each snapshot exactly once.
5. Released or Active lines create DEURs that reference one line and embed its snapshot.
6. Billing evaluates acknowledged canonical DEURs independently.
7. The selected period retains all-or-nothing statement creation: any invalid DEUR returns line-aware issues and blocks persistence.
8. One Rental statement aggregates equipment-aware rows.
9. Statement `invoiceStatus` represents invoice readiness and the existing collection lifecycle.

## Invariants

- No random or first-line fallback.
- Released snapshots are never overwritten.
- Mutable terms are never used for new DEUR billing.
- A DEUR correction chain is consumed at most once.
- Billing totals are sums of persisted line values.
- Rendering never recalculates accounting evidence.

Legacy header identities may resolve only when unambiguous. Ambiguity produces structured issues and leaves stored history unchanged.
