# Offline Synchronization Strategy

## Model

The local adapter may act as an offline cache while an outbox records intended mutations. Each mutation requires a stable operation ID, aggregate ID/type, expected version, local timestamp, payload, and retry metadata.

```text
Domain command → local repository commit → durable outbox
→ background transport → server transaction
→ acknowledgement/version → inbound reconciliation
```

## Conflict rules

- Master data may use version/etag comparison and explicit user reconciliation.
- Rental lifecycle and snapshots require server validation; immutable snapshots never use last-write-wins.
- DEUR event/revision operations are idempotent and preserve correction chains.
- Billing consumption requires a server transaction and unique constraint; it must never be merged client-side.
- Historical statement values are immutable and are not recalculated during conflict resolution.

## Reliability

Retries use bounded exponential backoff and retain the same operation ID. Acknowledgements update server timestamps and versions. Poison operations move to a visible manual-reconciliation state. Cursor-based inbound synchronization must be resumable and must not create outbound echoes.

## Security

The server authenticates every operation, authorizes its aggregate/action, validates payloads, and supplies audit identity and timestamps. Local cache encryption may protect data at rest on shared devices, but it does not replace server authorization or prevent a device owner from tampering with local state.
