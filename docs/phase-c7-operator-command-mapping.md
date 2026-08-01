# Phase C7.1 operator command mapping

The durable replay worker is another caller of the existing authorized `DeurCommandRepository`. It does not write tables or reproduce domain rules.

| Queue command | Production repository boundary | Operator surface |
| --- | --- | --- |
| `DEUR_START_SHIFT` | `startShift()` | Start Digital DEUR, including opening meter, location, remarks, fuel/evidence carried by the prepared draft |
| `DEUR_START_OR_CHANGE_ACTIVITY` | `startOrChangeActivity()` | Start, resume, idle, standby, meal break, and breakdown transitions |
| `DEUR_STOP_CURRENT_ACTIVITY` | `stopCurrentActivity()` | Stop the current operational activity |
| `DEUR_COMPLETE_SHIFT` | `completeShift()` | End shift, including closing meter and location |
| `DEUR_SUBMIT` | `submitDeur()` | Submit the completed DEUR |

Immediate execution and replay reuse the original command ID and idempotency key. Only retryable transport or persistence failures are enqueued. Authorization, ownership, optimistic concurrency, transition validation, and idempotency remain inside the production repository/RPC boundary.

Before each replay, the identity validator refreshes the current authentication state and checks the original tenant, user, operator, and assignment. A sign-out, user switch, tenant change, operator reassignment, inactive assignment, or failed refresh blocks replay.
