import type { RepositoryError } from "@/core/persistence";
import type { RemoteErrorDescriptor, RemoteFailureKind } from "./types";

export interface RemoteErrorContext { repository: string; operation: string; aborted?: boolean; timedOut?: boolean }

export function mapRemoteError(error: RemoteErrorDescriptor | null | undefined, context: RemoteErrorContext): RepositoryError {
  const sqlState = error?.code;
  const message = error?.message ?? "";
  let failureKind: RemoteFailureKind = "UnexpectedFailure";
  let code = "REPOSITORY_QUERY_FAILED";
  if (context.aborted || sqlState === "57014" || /abort|cancel/i.test(message)) { failureKind = "Cancelled"; code = "REPOSITORY_REQUEST_CANCELLED"; }
  else if (context.timedOut || /timeout|timed out/i.test(message)) { failureKind = "Timeout"; code = "REPOSITORY_TIMEOUT"; }
  else if (sqlState === "PGRST301" || error?.status === 401) { failureKind = "Unauthorized"; code = "REPOSITORY_UNAUTHORIZED"; }
  else if (sqlState === "42501" || error?.status === 403) { failureKind = "Forbidden"; code = "REPOSITORY_ACCESS_DENIED"; }
  else if (["42P01", "42703", "PGRST106", "PGRST205"].includes(sqlState ?? "")) { failureKind = "SchemaMismatch"; code = "REPOSITORY_SCHEMA_MISMATCH"; }
  else if (sqlState === "23505") { failureKind = "Conflict"; code = "REPOSITORY_CONFLICT"; }
  else if (sqlState === "23503" || sqlState === "23514" || sqlState?.startsWith("22")) { failureKind = "ValidationError"; code = "REPOSITORY_VALIDATION_FAILED"; }
  else if (sqlState === "40001" || error?.status === 429 || error?.status === 503 || (!sqlState && /fetch|network|connection/i.test(message))) { failureKind = "TransientFailure"; code = "REPOSITORY_NETWORK_FAILED"; }
  const retryable = failureKind === "TransientFailure" || failureKind === "Timeout" || failureKind === "Cancelled";
  return { code, message: remoteErrorMessage(failureKind), context: { repository: context.repository, operation: context.operation, sqlState, status: error?.status, failureKind }, recoverability: retryable ? "RETRYABLE" : "USER_ACTION_REQUIRED", recommendedAction: remoteRecommendedAction(failureKind), cause: error ? { code: error.code, message: error.message, status: error.status } : undefined };
}

export function isRetryableRemoteError(error: RepositoryError): boolean { return error.context.failureKind === "TransientFailure" || error.context.failureKind === "Timeout"; }
function remoteErrorMessage(kind: RemoteFailureKind): string { return ({ Cancelled: "Remote request was cancelled.", Timeout: "Remote request timed out.", Unauthorized: "Remote authentication failed.", Forbidden: "Remote access was denied.", ValidationError: "Remote data failed validation.", SchemaMismatch: "Remote schema is incompatible.", Conflict: "Remote data conflicts with an existing record.", TransientFailure: "Remote service could not be reached.", UnexpectedFailure: "Remote query failed." })[kind]; }
function remoteRecommendedAction(kind: RemoteFailureKind): string { return ({ Cancelled: "Retry when the request is still needed.", Timeout: "Check connectivity and retry.", Unauthorized: "Verify the browser-safe credentials.", Forbidden: "Verify the applicable RLS policy.", ValidationError: "Correct the request or reconcile incompatible data.", SchemaMismatch: "Apply and validate the canonical migrations.", Conflict: "Reload the current record and reconcile the conflict.", TransientFailure: "Check connectivity and retry.", UnexpectedFailure: "Inspect diagnostics and retry if safe." })[kind]; }
