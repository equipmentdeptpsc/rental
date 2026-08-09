import type { DeurRecord } from "../types";
import type { DeurOperatorAction } from "../operator/types";
import type { DeurSubmissionIssue } from "../services/validateDeurSubmission";

export type DeurCommandFailureCode =
  | "UNAUTHENTICATED" | "UNAUTHORIZED" | "FORBIDDEN" | "OWNERSHIP_MISMATCH"
  | "USER_INACTIVE" | "OPERATOR_INACTIVE" | "ASSIGNMENT_INACTIVE" | "RENTAL_INACTIVE"
  | "RENTAL_LINE_INACTIVE" | "EQUIPMENT_MISMATCH" | "OPERATOR_MISMATCH"
  | "ASSIGNMENT_MISMATCH" | "DUPLICATE_ACTIVE_DEUR" | "INVALID_TRANSITION"
  | "DEUR_EXPECTATION_REQUIRED" | "SNAPSHOT_STALE"
  | "IDEMPOTENCY_MISMATCH" | "CONFLICT" | "NOT_FOUND" | "VALIDATION_REJECTED"
  | "TRANSPORT_FAILURE" | "PERSISTENCE_FAILURE";

export interface DeurCommandIdentity {
  commandId: string; idempotencyKey: string; rentalId: string; rentalLineId: string;
  equipmentId: string; operatorId: string; assignmentId: string;
  clientCreatedAt?: string; deviceId?: string;
}
export interface VersionedDeurCommandIdentity extends DeurCommandIdentity { deurId: string; expectedVersion: number }
export interface StartDeurShiftInput extends DeurCommandIdentity { draft: DeurRecord }
export interface ActivityTransitionInput extends VersionedDeurCommandIdentity { action: DeurOperatorAction }
export interface CompleteDeurShiftInput extends VersionedDeurCommandIdentity {
  closingMeter?: number; closingLocation?: string; meterRequirement?: "none" | "hourMeter" | "odometer" | "both";
}
export interface SubmitDeurInput extends VersionedDeurCommandIdentity {}

export type DeurLifecycleCommandResult =
  | { success: true; disposition: "ACCEPTED" | "REPLAYED"; record: DeurRecord; version: number; serverOccurredAt: string; refreshRequired: false }
  | { success: false; code: DeurCommandFailureCode; message: string; retryable: boolean; refreshRequired: boolean; aggregateId?: string; expectedVersion?: number; currentVersion?: number; submissionIssues?: readonly DeurSubmissionIssue[] };

export interface DeurCommandRepository {
  startShift(input: StartDeurShiftInput): Promise<DeurLifecycleCommandResult>;
  startOrChangeActivity(input: ActivityTransitionInput): Promise<DeurLifecycleCommandResult>;
  stopCurrentActivity(input: ActivityTransitionInput): Promise<DeurLifecycleCommandResult>;
  completeShift(input: CompleteDeurShiftInput): Promise<DeurLifecycleCommandResult>;
  submitDeur(input: SubmitDeurInput): Promise<DeurLifecycleCommandResult>;
}

export interface DeurCommandActor {
  userId: string; operatorId?: string; permissions: readonly string[]; status: "active" | "inactive";
}
