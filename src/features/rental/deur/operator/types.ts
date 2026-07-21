import type { DeurActivityTypeCanonical, DeurRecord } from "../types";

export type DeurOperatorAction = "START_OPERATION" | "START_IDLE" | "START_MEAL_BREAK" | "START_BREAKDOWN" | "RESUME_OPERATION" | "END_SHIFT";
export interface OperatorDigitalDeurAccessIssue { code: string; message: string }
export interface OperatorDigitalDeurAccessResult {
  allowed: boolean;
  rentalId?: string;
  rentalEquipmentLineId?: string;
  assignmentId?: string;
  operatorId?: string;
  activeDeurId?: string;
  allowedActions: DeurOperatorAction[];
  issues: OperatorDigitalDeurAccessIssue[];
}
export interface DigitalDeurRunningState {
  activeEventType?: DeurActivityTypeCanonical;
  activeEventStartedAt?: string;
  activeEventElapsedSeconds: number;
  completedOperationMinutes: number;
  projectedOperationMinutes: number;
  completedIdleMinutes: number;
  projectedIdleMinutes: number;
  completedMealBreakMinutes: number;
  projectedMealBreakMinutes: number;
  completedBreakdownMinutes: number;
  projectedBreakdownMinutes: number;
  isRunning: boolean;
}
export type ActiveOperatorDeurResult = { status: "NONE" } | { status: "RESOLVED"; record: DeurRecord } | { status: "AMBIGUOUS"; issue: { code: "DEUR_ACTIVE_RECORD_AMBIGUOUS"; message: string } };
