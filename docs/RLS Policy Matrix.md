# RLS Policy Matrix

This is preparation only; Phase 11A does not enable application RLS.

Phase 11B exception: `erp.equipment_statuses` now has a temporary anonymous read-only policy for non-deleted universal reference rows. Anonymous writes and access to every other ERP table remain denied. This does not activate the broader matrix below.

| Area | Admin | Dispatcher | Operator | Accounting | Manager | Auditor | Trusted server only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Equipment/masters | Full except historical hard-delete | Read/update operations | Assigned equipment read | Read | Read/update approval scope | Read | Master destructive changes |
| Assignments | Full | Create/read/update | Own active assignments read | Read | Read | Read | Conflict-safe assignment transition |
| Rentals/equipment lines | Full | Create/read/pre-release update | Assigned line read | Read | Read/approve | Read | Release/return/close transactions |
| Contracts | Full pre-release | Pre-release configure | Read assigned terms only if required | Read | Read | Read | Post-release mutation prohibited |
| Commercial snapshots | Read/create through command | Read | No direct write | Read | Read | Read | Snapshot creation; all mutation prohibited |
| DEUR/evidence | Full workflow scope | Read/administrative correction request | Own assigned DEUR create/update before submission | Read acknowledged | Read/acknowledge as authorized | Read | Acknowledgement, correction chain, append-only evidence |
| Billing/statements/lines | Full | Read | Own DEUR status read | Create/read/approve by separation rules | Read/approve | Read | Statement creation, DEUR consumption, finalized-line mutation prohibited |
| Invoice projection | Read | Read | No financial scope | Read/update allowed status command | Read | Read | Invoice-state transitions |
| Collections | Full | Read | None | Create/allocate | Read/approve | Read | Allocation transaction and balance enforcement |
| Audit/history | Read | Relevant read | Own-scope read | Financial read | Read | Read | Insert only; update/delete prohibited |
| Staging/outbox | Administrative | None | None | None | Read migration status | Read | Import, synchronization, retry commands |

DELETE normally means an authorized soft-delete command. Rental release, snapshot creation, DEUR acknowledgement/correction, Billing Statement creation, DEUR consumption, invoice transitions, collection allocation, and audit creation require trusted transactional functions or a server boundary rather than unrestricted client table writes.
