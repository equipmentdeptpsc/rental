# Phase C7 isolated-UAT cross-device certification runbook

Status: prepared, not executed. Remote operational writes must remain disabled until separately authorized.

## Mandatory pre-flight

Record the exact Worker/build version, isolated project reference, `TENANT-UAT-*` tenant, controlled users, rental, DEUR, and equipment-line identifiers. Confirm the linked project is isolated UAT, production markers are absent, browser credentials are publishable/anonymous only, and `VITE_REMOTE_OPERATIONAL_WRITES_ENABLED=false`. Obtain explicit authorization before changing that flag or running mutations.

## Scenario

Use Device A for the linked operator and Device B for the rental workspace; Device C is optional. Capture redacted event and idempotency identifiers plus server timestamps.

1. Start Equipment A and observe only its workspace card.
2. Confirm its timer derives from the server timestamp.
3. Start Equipment B and confirm independent card/timer behavior.
4. Pause A; confirm B continues.
5. Refresh B and verify both states restore.
6. Disconnect A, enqueue a valid command, close the browser, reopen it, and confirm the queue survives.
7. Reconnect and verify exactly one authorized replay and one reconciled workspace change.
8. Attempt duplicate Start and a late Pause after Stop; record deterministic rejection/suppression.
9. Change operator identity and tenant independently; verify neither can replay the original queue.

## Evidence

Capture transport and queue state transitions, redacted command/event identifiers, RPC result classifications, browser console errors, final aggregate state, duplicate count, cleanup count, and residue audit. Never capture tokens, service keys, review credentials, full authentication artifacts, or complete sensitive payloads.

## Cleanup and residue

Delete only `TENANT-UAT-*` fixtures created by this run. Run cleanup twice; the second pass must remove zero records. Verify queue stores, IndexedDB, Local Storage, Session Storage, Cache Storage, cookies, database fixtures, and active subscriptions contain no test residue. Confirm baseline counts and remote-write configuration are restored.

## Gate

The scenario remains blocked until isolated-UAT remote operational writes are explicitly authorized and a controlled frontend build is approved. Preparation of this runbook is not authorization to deploy or mutate.
