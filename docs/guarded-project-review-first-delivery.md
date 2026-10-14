# Guarded Project Review first delivery

This procedure is intentionally pinned to Supabase project `jtkctarqbwmqdcewthkn`, DEUR `DEUR-2026-000030`, Project Review batch `aac56cd2-6b52-4376-a1f9-e6e833b4a02d`, and notification IDs `339135fc-477b-4ad8-bd3c-2ad17853f9d4` and `45e60b4f-e7fc-4d27-87a9-1672e2fa1cc9`. It cannot discover or substitute other queue work.

## Required inputs

- An active System Administrator bearer session in the batch tenant with `settings.update`.
- JSON body with exactly `confirmation: "PROJECT-LEGACY-FIRST-DELIVERY"` and `recipientOverrideFingerprint`, the lowercase SHA-256 hex fingerprint of the separately approved normalized UAT override address.
- Deployed secrets/configuration: the pinned Supabase project URL and keys, grouped-review envelope key v1, public review origin, Resend API key, sender address, and the approved `EMAIL_UAT_RECIPIENT_OVERRIDE`.
- Separate explicit approval to invoke the execute endpoint. Preparing envelopes and calling the provider are live side effects.

## Read-only preflight

POST the exact input to `/api/admin/uat/preflight-project-review-first-delivery`. The procedure validates the Worker configuration and provider authentication, then calls the read-only `erp.preflight_guarded_project_review_first_delivery` RPC. It verifies the actor/tenant/role, Project-scoped finalized batch, DEUR membership, exact two-notification membership, frozen two-recipient snapshot, pending/unattempted/unclaimed state, absence of delivery attempts, and either zero or exactly two active encrypted envelopes. It returns no recipient address, review path, credential, bearer token, or provider secret.

The provider-authentication probe is an external read-only provider call. Do not run even preflight until that call is authorized.

## Expected execute side effects

POST the same exact input to `/api/admin/uat/execute-project-review-first-delivery` only after explicit approval. After all preflight checks pass, it:

1. Creates one shared random review credential in memory and AES-GCM envelopes for only the two pinned notifications.
2. Calls only `prepare_project_review_batch_handoff` for the pinned batch. The canonical RPC rotates the batch credential hash and stores the two encrypted envelopes; it preserves membership and recipient snapshots.
3. Re-runs the read-only preflight requiring exactly two active envelopes and zero attempts.
4. Claims the first pinned notification with the canonical row-lock/lease operation, dispatches through the configured Resend adapter and UAT recipient override, and records a sanitized completion/attempt result.
5. Proceeds to the second pinned notification only after an unambiguous provider acceptance for the first, then performs the same claim, dispatch, and persistence sequence.

No global queue discovery, batch claim, scheduler, Customer Review decision mutation, or DEUR history mutation is called.

## Idempotency and recovery

The provider receives the immutable notification idempotency key. A canonical claim increments the attempt before the provider call, and accepted evidence is immutable. Any repeated full execution fails preflight once either notification is no longer Pending with zero attempts, so it cannot duplicate an accepted message.

Known provider failures are persisted as terminal `FailedCredentialLost` for credential-bearing review mail and stop the procedure before the other notification is claimed. Unknown or ambiguous provider outcomes are persisted as `UnknownOutcome`; execution stops immediately and must not be retried. Reconcile the provider by the notification idempotency key and sanitized provider evidence before designing a separately reviewed recovery action.

If preparation succeeded but no claim occurred, a later explicitly approved execution may replay preparation: the canonical RPC reuses the existing encrypted envelopes, and revalidation still requires both notifications to be unattempted.

## Post-dispatch verification

Use a separately authorized read-only query/RPC to verify exactly two delivery-attempt rows, each notification at `ProviderAccepted`, one provider message ID per notification, no active leases, retired credential envelopes, unchanged batch item/recipient snapshots, and unchanged unrelated batches. Never print recipient destinations, review URLs, tokens, or secrets.

## Abort conditions

Abort on any authentication/authorization failure, project-host mismatch, invalid sender/configuration, recipient-override fingerprint mismatch, invalid provider authentication, batch/DEUR/Project mismatch, notification membership mismatch, changed recipient snapshot, any prior attempt/provider evidence, claim conflict, preparation/revalidation failure, provider rejection, or ambiguous provider outcome. Never fall back to the global notification worker and never retry automatically.
